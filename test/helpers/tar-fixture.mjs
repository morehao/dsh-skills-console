import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';

/**
 * 测试用最小 tar 构造器：不依赖系统 tar，能精确造出恶意条目
 * （`../`、绝对路径、反斜杠、symlink、hardlink、FIFO、多顶层目录）。
 * 只支持 ustar 短路径；fixture 路径都远小于 100 字节。
 */

const BLOCK = 512;

const TYPE_FLAG = {
  file: '0',
  hardlink: '1',
  symlink: '2',
  dir: '5',
  fifo: '6',
};

function octal(value, length) {
  return `${value.toString(8).padStart(length - 1, '0')}\0`;
}

function header({ name, mode, size, type, linkname }) {
  if (Buffer.byteLength(name, 'utf8') > 100) throw new Error(`fixture 路径过长: ${name}`);
  if (Buffer.byteLength(linkname, 'utf8') > 100) throw new Error(`fixture linkname 过长: ${linkname}`);
  const buf = Buffer.alloc(BLOCK, 0);
  buf.write(name, 0, 100, 'utf8');
  buf.write(octal(mode, 8), 100, 8, 'ascii');
  buf.write(octal(0, 8), 108, 8, 'ascii'); // uid
  buf.write(octal(0, 8), 116, 8, 'ascii'); // gid
  buf.write(octal(size, 12), 124, 12, 'ascii');
  buf.write(octal(0, 12), 136, 12, 'ascii'); // mtime
  buf.write('        ', 148, 8, 'ascii'); // checksum 占位
  buf.write(TYPE_FLAG[type], 156, 1, 'ascii');
  buf.write(linkname, 157, 100, 'utf8');
  buf.write('ustar\0', 257, 6, 'ascii');
  buf.write('00', 263, 2, 'ascii');
  let sum = 0;
  for (const byte of buf) sum += byte;
  buf.write(`${sum.toString(8).padStart(6, '0')}\0 `, 148, 8, 'ascii');
  return buf;
}

/** entries: [{ name, type='file', content='', mode, linkname='' }] */
export function buildTar(entries, { gzip = true } = {}) {
  const chunks = [];
  for (const entry of entries) {
    const type = entry.type || 'file';
    const content = type === 'file' ? Buffer.from(entry.content ?? '') : Buffer.alloc(0);
    const mode = entry.mode ?? (type === 'dir' ? 0o755 : 0o644);
    const name = type === 'dir' && !entry.name.endsWith('/') ? `${entry.name}/` : entry.name;
    chunks.push(header({ name, mode, size: content.length, type, linkname: entry.linkname || '' }));
    if (content.length > 0) {
      chunks.push(content);
      chunks.push(Buffer.alloc((BLOCK - (content.length % BLOCK)) % BLOCK));
    }
  }
  chunks.push(Buffer.alloc(BLOCK * 2));
  const raw = Buffer.concat(chunks);
  return gzip ? zlib.gzipSync(raw) : raw;
}

export function writeTarFixture(dir, entries, { gzip = true, name = 'fixture.tar.gz' } = {}) {
  const file = path.join(dir, name);
  fs.writeFileSync(file, buildTar(entries, { gzip }));
  return file;
}
