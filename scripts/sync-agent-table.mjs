import fs from 'node:fs';
const src = fs.readFileSync(process.argv[2], 'utf8');
const start = src.indexOf('const agents = {');
const end = src.indexOf('\n};', start);
const body = src.slice(start, end);
const re = /(?:\n\t"([^"]+)"|\n\t([A-Za-z0-9_-]+)):\s*\{([\s\S]*?)\n\t\}/g;
const out = [];
let m;
while ((m = re.exec(body))) {
  const key = m[1] || m[2];
  const block = m[3];
  if (key === 'universal') continue;
  const skillsDir = (block.match(/skillsDir:\s*['"]([^'"]+)['"]/) || [])[1] || null;
  const name = (block.match(/displayName:\s*['"]([^'"]+)['"]/) || [])[1] || key;
  const gsd = (block.match(/globalSkillsDir:\s*join\(home,\s*['"]([^'"]+)['"]\)/) || [])[1] || null;
  if (skillsDir === '.agents/skills') continue;
  const dir = gsd || skillsDir;
  if (!dir) continue;
  out.push({ key, name, dir });
}
out.sort((a, b) => a.key.localeCompare(b.key));
fs.writeFileSync(process.argv[3], JSON.stringify({ source: 'skills CLI agents table', entries: out }, null, 2) + '\n');
console.log(out.length, out.slice(0, 12).map(e => e.key + '→' + e.dir).join(', '));
