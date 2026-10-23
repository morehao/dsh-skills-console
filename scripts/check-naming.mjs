#!/usr/bin/env node
/** 命名与导出接线校验：只在「装了插件/发了包」之后才会暴露的错位，前移到 PR。
 *
 *   package.json 的 name          == cordis.patch.yml 的 insert[0].name（dsh import() 的模块标识符）
 *   lib/index.js 的 export name   == cordis.patch.yml 的 insert[0].id（cordis 配置树内的键）
 *   publishConfig.access          == public（否则 scoped 包发布会被拒）
 *   exports 覆盖 "."、"./client"、"./locale/*.json"、"./icon"（client half 与设置页资源）
 *   files 白名单含 client.js（漏了它 client half 就不在包里）
 */
import { readFile } from "node:fs/promises";

const read = async (p) => readFile(new URL(`../${p}`, import.meta.url), "utf8");
const fail = (msg) => {
	console.error(`✗ ${msg}`);
	process.exitCode = 1;
};

const pkg = JSON.parse(await read("package.json"));
const patch = await read("cordis.patch.yml");
const { name: pluginName } = await import("../lib/index.js");

// 极简读取：本仓 patch 只有一条 insert，取第一个 id / name 即可，不引入 YAML 依赖。
const insertId = patch.match(/^\s*-\s+id:\s*(\S+)\s*$/m)?.[1];
const insertName = patch.match(/^\s*name:\s*['"]?([^'"\s]+)['"]?\s*$/m)?.[1];

if (!insertId) fail("cordis.patch.yml 未找到 insert[0].id");
if (!insertName) fail("cordis.patch.yml 未找到 insert[0].name");

if (insertName && insertName !== pkg.name) {
	fail(`包名不一致：package.json name=${pkg.name}，cordis.patch.yml insert[0].name=${insertName}`);
}
if (insertId && insertId !== pluginName) {
	fail(`插件名不一致：lib/index.js export const name=${pluginName}，cordis.patch.yml insert[0].id=${insertId}`);
}
if (pkg.publishConfig?.access !== "public") {
	fail('package.json 缺少 publishConfig.access = "public"');
}

// exports：dsh 加载 client half 与设置页资源都走这里，缺一项就是「桌面上能装、页面里白屏」。
const exportsMap = pkg.exports ?? {};
const requiredExports = [".", "./client", "./locale/*.json", "./icon", "./package.json"];
const missingExports = requiredExports.filter((key) => !(key in exportsMap));
if (missingExports.length) fail(`package.json exports 缺少：${missingExports.join("、")}`);
if (exportsMap["./client"] && exportsMap["./client"] !== "./client.js") {
	fail(`exports["./client"] 应指向 ./client.js，实际为 ${exportsMap["./client"]}`);
}

// files：npm 只发白名单里的文件；client.js 漏了 → 包里没有 web client half。
const files = pkg.files ?? [];
if (!files.includes("client.js")) fail("package.json files 白名单缺少 client.js");
if (!files.some((p) => p.startsWith("lib"))) fail("package.json files 白名单缺少 lib");
if (!(pkg.dsh?.client && pkg.dsh?.bundle?.patch)) {
	fail("package.json 缺少 dsh.client 或 dsh.bundle.patch（dsh 靠它装配 Host/Client half）");
}

console.log(
	process.exitCode
		? "命名校验失败"
		: `命名校验通过：包名 ${pkg.name} / 模块标识符 ${insertName} / 插件名 ${pluginName}`,
);
