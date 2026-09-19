import { readFileSync, writeFileSync, mkdirSync, cpSync, copyFileSync, existsSync, renameSync, readdirSync } from 'node:fs';
import { resolve, join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash, randomUUID } from 'node:crypto';
const repo = fileURLToPath(new URL('../../', import.meta.url));
const run = resolve(repo, 'harness-ui/frontend/artifacts/ripresa', process.argv[2]);
const snapshot = JSON.parse(readFileSync(join(run, 'snapshot.json')));
const source = JSON.parse(readFileSync(join(run, 'source-files.json')));
const hash = data => createHash('sha256').update(data).digest('hex');
const checked = source.filter(x => /^harness-ui\/frontend\/(src\/|scripts\/(build|copy-vendored-assets)\.mjs|package(-lock)?\.json)/.test(x.file) && x.sha256);
for (const x of checked) if (hash(readFileSync(join(repo, x.file))) !== x.sha256) throw new Error(`Sorgente cambiato dopo la prova: ${x.file}`);
const publicDir = join(repo, 'harness-ui/public');
const bundle = snapshot.bundle;
const manifest = JSON.parse(readFileSync(join(bundle, 'build-manifest.json')));
for (const x of manifest.files) if (hash(readFileSync(join(bundle, x.path))) !== x.sha256) throw new Error(`Bundle non coerente: ${x.path}`);
const files = readdirSync(bundle, { recursive: true, withFileTypes: true }).filter(x => x.isFile()).map(x => join(x.parentPath, x.name).slice(bundle.length + 1));
const changes = files.filter(x => !existsSync(join(publicDir, x)) || hash(readFileSync(join(publicDir, x))) !== hash(readFileSync(join(bundle, x))));
const out = join(repo, '.claude/ripresa-2026-09-19', `delivery-${new Date().toISOString().replaceAll(/[:.]/g, '-')}-${randomUUID().slice(0,8)}`);
mkdirSync(out);
const report = { run, checkedSources: checked.length, changes, restart: false, backup: join(out, 'public-before'), before: {}, after: {} };
report.before.health = (await fetch('http://127.0.0.1:4174/api/v1/health')).status;
if (report.before.health !== 200) throw new Error('Server non pronto');
writeFileSync(join(out, 'ledger.json'), JSON.stringify(report, null, 2), { flag: 'wx' });
cpSync(publicDir, report.backup, { recursive: true });
for (const file of changes) {
  const dest = join(publicDir, file), temp = `${dest}.ripresa-${randomUUID()}`;
  mkdirSync(dirname(dest), { recursive: true });
  copyFileSync(join(bundle, file), temp); renameSync(temp, dest);
}
report.after.files = [];
for (const file of files) {
  const expected = hash(readFileSync(join(bundle, file)));
  if (hash(readFileSync(join(publicDir, file))) !== expected) throw new Error(`Copia diversa: ${file}`);
  if (!/^(app\.js|styles\.css|avvio\.js|fonts[\\/].*\.woff2|talos[\\/].*\.svg)$/.test(file)) continue;
  const response = await fetch(`http://127.0.0.1:4174/${file.replaceAll('\\','/')}`, { cache: 'no-store' });
  const actual = hash(Buffer.from(await response.arrayBuffer()));
  report.after.files.push({ file, status: response.status, sha256: actual, matches: actual === expected });
  if (response.status !== 200 || actual !== expected) throw new Error(`Asset HTTP diverso: ${file}`);
}
report.after.health = (await fetch('http://127.0.0.1:4174/api/v1/health')).status;
report.finished = new Date().toISOString();
writeFileSync(join(out, 'delivery.json'), JSON.stringify(report, null, 2), { flag: 'wx' });
console.log(JSON.stringify({ output: out, changes, health: report.after.health, httpVerified: report.after.files.length, checkedSources: checked.length }, null, 2));
