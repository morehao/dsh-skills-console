#!/usr/bin/env node
/**
 * Web Client 构建：把 client/ 下的 ESM 源码打成仓库根的 client.js。
 *
 * 产物形态固定为 DSH 的 `window.__ModuleLoader__.load({ id, factory(require) {...} })`：
 * banner 打开 factory（`require` 就是宿主给的模块解析函数），footer 返回 `module.exports`。
 * 客户端只允许 require 宿主提供的 `react` / `react-dom`，其它模块在内置前就被拦下。
 *
 *   node scripts/build-client.mjs              构建并写 client.js
 *   node scripts/build-client.mjs --check      只在内存里重建并与 client.js 逐字节比对
 *   node scripts/build-client.mjs --watch      监听 client/ 变化持续重建
 *   node scripts/build-client.mjs --sourcemap  额外输出 client.js.map（本机调试用，不提交）
 */
import { build, context } from "esbuild";
import { readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const entry = path.join(root, "client", "index.js");
const outfile = path.join(root, "client.js");
const mapfile = `${outfile}.map`;
const pkg = JSON.parse(await readFile(path.join(root, "package.json"), "utf8"));

const argv = new Set(process.argv.slice(2));
const check = argv.has("--check");
const watch = argv.has("--watch");
const sourcemap = argv.has("--sourcemap");

// 运行时唯一允许的宿主模块；react-dom 在 host.js 里是可选的。
const ALLOWED_EXTERNAL = new Set(["react", "react-dom"]);

const banner = [
  "/* AUTO-GENERATED from client/ by scripts/build-client.mjs — do not edit. */",
  "/* eslint-disable */",
  "window.__ModuleLoader__.load({",
  `  id: ${JSON.stringify(pkg.name)},`,
  "  factory(require) {",
  "    var module = { exports: {} };",
  "    var exports = module.exports;",
].join("\n");

const footer = "    return module.exports;\n  },\n});\n";

function options({ write }) {
  return {
    absWorkingDir: root,
    entryPoints: [entry],
    outfile,
    bundle: true,
    write,
    format: "cjs",
    platform: "browser",
    target: "es2022",
    charset: "utf8",
    external: [...ALLOWED_EXTERNAL],
    metafile: true,
    legalComments: "none",
    sourcemap: sourcemap ? true : false,
    logLevel: "silent",
    banner: { js: banner },
    footer: { js: footer },
  };
}

/** 纯度校验：外部依赖只有 react / react-dom，源码只能来自 client/。 */
function verify(metafile) {
  const problems = [];
  const output = Object.keys(metafile.outputs).find((key) => key === "client.js");
  if (!output) problems.push("构建结果里找不到 client.js 输出");
  else {
    for (const item of metafile.outputs[output].imports) {
      if (item.kind !== "external") continue;
      if (!ALLOWED_EXTERNAL.has(item.path)) problems.push(`产物引用了非白名单外部模块：${item.path}`);
    }
  }
  for (const input of Object.keys(metafile.inputs)) {
    if (!input.startsWith("client/")) problems.push(`产物包含了 client/ 之外的源码：${input}`);
  }
  if (problems.length > 0) {
    for (const problem of problems) console.error(`✖ ${problem}`);
    throw new Error("构建纯度校验失败");
  }
}

async function compile() {
  const result = await build({ ...options({ write: false }) });
  verify(result.metafile);
  const output = result.outputFiles.find((file) => file.path === outfile);
  if (!output) throw new Error("构建结果里找不到 client.js");
  const map = result.outputFiles.find((file) => file.path === mapfile);
  return { code: output.text, map: map?.text };
}

async function writeOutput() {
  const { code, map } = await compile();
  await writeFile(outfile, code);
  if (sourcemap && map) await writeFile(mapfile, map);
  else await rm(mapfile, { force: true });
  const bytes = Buffer.byteLength(code);
  console.log(`✔ client.js 已重建（${bytes} 字节${sourcemap ? " + client.js.map" : ""}）`);
  if (sourcemap) console.log("… sourcemap 只用于本机调试：不要提交 client.js.map；提交前重跑不带 --sourcemap 的 npm run build:client");
}

async function checkOutput() {
  const { code } = await compile();
  let current = null;
  try {
    current = await readFile(outfile, "utf8");
  } catch {
    current = null;
  }
  if (current !== code) {
    const currentBytes = current === null ? 0 : Buffer.byteLength(current);
    console.error(
      `✖ client.js 与 client/ 源码不一致（现有 ${currentBytes} 字节，应为 ${Buffer.byteLength(code)} 字节）。\n`
      + "  根 client.js 是生成物：改 client/ 后跑 `npm run build:client`，并把两者一起提交。",
    );
    process.exitCode = 1;
    return;
  }
  console.log("✔ client.js 与 client/ 源码一致");
}

async function runWatch() {
  // esbuild 的 watcher 不暴露 onEnd，只能挂插件在每次构建结束时自己写产物。
  const watcher = {
    name: "dsh-client-watch-writer",
    setup(build) {
      build.onEnd(async (result) => {
        if ((result.errors || []).length > 0) {
          for (const error of result.errors) console.error(error.text || error);
          return;
        }
        try {
          verify(result.metafile);
          const output = result.outputFiles?.find((file) => file.path === outfile);
          if (!output) return;
          await writeFile(outfile, output.text);
          const map = result.outputFiles.find((file) => file.path === mapfile);
          if (sourcemap && map) await writeFile(mapfile, map.text);
          else await rm(mapfile, { force: true });
          console.log(`✔ ${new Date().toLocaleTimeString()} client.js 已重建（${Buffer.byteLength(output.text)} 字节）`);
        } catch (error) {
          console.error(`✖ ${error.message}`);
        }
      });
    },
  };
  const ctx = await context({ ...options({ write: false }), plugins: [watcher] });
  await ctx.watch();
  console.log("… 监听 client/ 变化中（Ctrl+C 退出）");
  process.on("SIGINT", async () => {
    await ctx.dispose();
    process.exit(0);
  });
}

if (watch) {
  await runWatch();
} else if (check) {
  await checkOutput();
} else {
  await writeOutput();
}
