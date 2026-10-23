import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

export class CliUnavailableError extends Error {
  constructor(reason) {
    super(reason || 'skills CLI not found');
    this.code = 'error.skills.cli-missing';
    this.reason = reason;
  }
}

export class CliFailedError extends Error {
  constructor(message, detail) {
    super(message);
    this.code = detail?.timedOut ? 'error.skills.cli-timeout' : 'error.skills.cli-failed';
    this.detail = detail;
  }
}

function isExecutable(file) {
  try {
    fs.accessSync(file, fs.constants.X_OK);
    return fs.statSync(file).isFile();
  } catch {
    return false;
  }
}

function findInPath(command, envPath) {
  for (const dir of String(envPath || '').split(path.delimiter)) {
    if (!dir) continue;
    const candidate = path.join(dir, command);
    if (isExecutable(candidate)) return candidate;
  }
  return null;
}

/**
 * CLI 定位四层（设计 §8.2）：显式覆盖 → 插件/宿主自带依赖 → PATH → npx。
 * 每一层都记来源，诊断页要展示"这次到底跑的哪一个"。
 */
export function locateCli({ env = process.env, logger = () => {} } = {}) {
  const override = env.DSH_SKILLS_CONSOLE_CLI;
  if (override && override.trim()) {
    const parts = override.trim().split(/\s+/);
    // 覆盖值可能是测试桩：仍然让 `add --help` 自己回答能力位，别替它猜
    return { command: parts[0], prefixArgs: parts.slice(1), source: 'env-override', jsonCapable: true };
  }

  // 宿主 profile 里的 skills 依赖（最常见的实际位置）。
  // 注意：GUI 启动的宿主进程常常拿不到 DSH_PROFILE_DIR，所以再按 DSH_HOME/profiles/* 兜一层探测。
  const profileDir = env.DSH_PROFILE_DIR;
  if (profileDir) {
    const bin = path.join(profileDir, 'node_modules', 'skills', 'bin', 'cli.mjs');
    if (fs.existsSync(bin)) {
      return { command: process.execPath, prefixArgs: [bin], source: 'profile-dependency', jsonCapable: true };
    }
  }
  const dshHome = env.DSH_HOME || path.join(env.HOME || '', '.dsh');
  try {
    const profiles = fs.readdirSync(path.join(dshHome, 'profiles'), { withFileTypes: true });
    for (const entry of profiles) {
      if (!entry.isDirectory()) continue;
      const bin = path.join(dshHome, 'profiles', entry.name, 'node_modules', 'skills', 'bin', 'cli.mjs');
      if (fs.existsSync(bin)) {
        return { command: process.execPath, prefixArgs: [bin], source: `profile:${entry.name}`, jsonCapable: true };
      }
    }
  } catch {
    // 没有 profiles 目录就继续往下走
  }

  try {
    const pkg = require.resolve('skills/package.json');
    const bin = path.join(path.dirname(pkg), 'bin', 'cli.mjs');
    if (fs.existsSync(bin)) {
      return { command: process.execPath, prefixArgs: [bin], source: 'dependency', jsonCapable: true };
    }
  } catch {
    // 没有作为依赖装在本插件可见范围内，继续往下走
  }

  const onPath = findInPath('skills', env.PATH);
  if (onPath) return { command: onPath, prefixArgs: [], source: 'path', jsonCapable: true };

  const npx = findInPath('npx', env.PATH);
  if (npx) {
    const spec = env.DSH_SKILLS_CONSOLE_NPX_SPEC || 'skills';
    return { command: npx, prefixArgs: ['-y', spec], source: 'npx', jsonCapable: true };
  }

  logger('cli.missing');
  throw new CliUnavailableError('neither `skills` nor `npx` is on PATH');
}

/** 子进程封装：无 shell、argv 直传、硬超时、输出上限、非交互环境注入。 */
export function runCli(location, args, { timeoutMs = 120000, signal, env = process.env, maxBytes = 4 * 1024 * 1024 } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(location.command, [...location.prefixArgs, ...args], {
      shell: false,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: {
        ...env,
        CI: '1',
        NO_COLOR: '1',
        TERM: 'dumb',
        GIT_TERMINAL_PROMPT: '0',
        GIT_HTTP_LOW_SPEED_LIMIT: '1',
        GIT_HTTP_LOW_SPEED_TIME: '30',
      },
    });

    let stdout = '';
    let stderr = '';
    let timedOut = false;
    let truncated = false;
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill('SIGKILL');
    }, timeoutMs);
    const onAbort = () => child.kill('SIGKILL');
    if (signal) signal.addEventListener('abort', onAbort, { once: true });

    child.stdout.on('data', (chunk) => {
      if (stdout.length + chunk.length > maxBytes) {
        truncated = true;
        stdout += chunk.subarray(0, Math.max(0, maxBytes - stdout.length)).toString('utf8');
        return;
      }
      stdout += chunk.toString('utf8');
    });
    child.stderr.on('data', (chunk) => {
      if (stderr.length < 65536) stderr += chunk.toString('utf8');
    });

    child.on('error', (error) => {
      clearTimeout(timer);
      if (signal) signal.removeEventListener('abort', onAbort);
      reject(new CliFailedError(error.message, { error }));
    });

    child.on('close', (code) => {
      clearTimeout(timer);
      if (signal) signal.removeEventListener('abort', onAbort);
      resolve({ code, stdout, stderr, timedOut, truncated, args });
    });
  });
}

export function createCli({ env = process.env, logger = () => {} } = {}) {
  let cached = null;
  let capabilities = null;

  function location() {
    if (!cached) cached = locateCli({ env, logger });
    return cached;
  }

  function call(args, options = {}) {
    return runCli(location(), args, { env, ...options });
  }

  const api = {
    location,
    call,

    async version() {
      const result = await call(['--version']);
      if (result.code !== 0) return null;
      const match = result.stdout.trim().match(/\d+\.\d+\.\d+[\w.-]*/);
      return match ? match[0] : null;
    },

    /** 能力位：`--json` 与 `--full-depth` 任一不支持都要在 UI 上禁用写操作（漏装比不可用更危险）。 */
    async capabilities({ force = false } = {}) {
      if (capabilities && !force) return capabilities;
      const loc = location();
      if (!loc.jsonCapable) {
        capabilities = { version: null, json: false, fullDepth: false, source: loc.source, usable: false };
        return capabilities;
      }
      const version = await api.version();
      const help = await call(['add', '--help']);
      const text = `${help.stdout}\n${help.stderr}`;
      capabilities = {
        version,
        json: text.includes('--json'),
        fullDepth: text.includes('--full-depth'),
        source: loc.source,
        usable: Boolean(version) && text.includes('--json') && text.includes('--full-depth'),
      };
      logger('cli.capabilities', capabilities);
      return capabilities;
    },

    /** 列已装技能（全局）。字段只有 F20 那几项，ref/skillPath/hash 必须另读 lock。 */
    async listGlobal() {
      const result = await call(['list', '--json', '-g']);
      if (result.code !== 0) {
        throw new CliFailedError(`skills list failed`, { stderr: result.stderr, code: result.code });
      }
      try {
        const parsed = JSON.parse(result.stdout);
        return Array.isArray(parsed) ? parsed : [];
      } catch (error) {
        throw new CliFailedError(`skills list returned non-JSON output`, { error: error.message });
      }
    },

    /**
     * 安装：`-a universal` 必带（F17），`--json` 配 `-y`（F11），`--full-depth` 必带（F24）。
     * 永不带 `--all` / `-a '*'`。
     */
    async add({ source, skills = [], timeoutMs = env.DSH_SKILLS_CONSOLE_TIMEOUT_MS ? Number(env.DSH_SKILLS_CONSOLE_TIMEOUT_MS) : 120000 }) {
      const args = ['add', source, '--skill', ...skills, '-a', 'universal', '-g', '-y', '--json', '--full-depth'];
      const result = await call(args, { timeoutMs });
      return result;
    },

    /** 卸载：绝不带 `-a`（带上反而删不掉真身），没有 `--json`，结论以磁盘核对为准。 */
    async remove({ names = [], timeoutMs = 120000 }) {
      const args = ['remove', '-s', ...names, '-g', '-y'];
      return call(args, { timeoutMs });
    },
  };

  return api;
}
