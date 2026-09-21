/** NAV-02 source transport: fixed reviewed paths, pre/post hashes, no payload evaluation. */
import { readFile, lstat } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { brotliDecompressSync } from 'node:zlib';
import { execFileSync } from 'node:child_process';
import { resolve, relative, sep, dirname } from 'node:path';
const root = resolve(process.cwd());
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const allowed = new Set([
  'harness-ui/frontend/index.template.html',
  'harness-ui/frontend/src/components/scorciatoie.js',
  'harness-ui/frontend/src/features/navigation/workspace-chrome.ts',
  'harness-ui/frontend/src/i18n/en.js',
  'harness-ui/frontend/src/legacy/app.js',
  'harness-ui/frontend/src/styles/main.css',
  'harness-ui/frontend/tests/qualification/workspace-real.mjs',
  'harness-ui/frontend/src/design-system/command-palette.css',
  'harness-ui/frontend/src/features/navigation/command-palette.ts',
  'harness-ui/frontend/src/i18n/workspace-en.js',
  'harness-ui/frontend/src/services/commands/registry.ts',
  'harness-ui/frontend/tests/refactor/command-registry.test.mjs',
]);
const bytes = brotliDecompressSync(Buffer.from((await Promise.all([1, 2, 3, 4].map(n => readFile(new URL(`./changes-${n}.b64`, import.meta.url), 'utf8')))).map(s => s.trim()).join(''), 'base64'), { maxOutputLength: 256 * 1024 });
if (hash(bytes) !== 'd830827596079dcbc26d8d9f19caa05132b9258f1e347c335538bb12072d6065') throw Error('Source transport checksum differs.');
const data = JSON.parse(bytes);
if (data.schema !== 'talos.reviewed-patch.v1' || data.scope !== 'NAV-02' || data.files.length !== allowed.size) throw Error('Unexpected source transport schema.');
const seen = new Set();
for (const file of data.files) {
  if (!allowed.has(file.path) || seen.has(file.path)) throw Error('Unreviewed or repeated path: ' + file.path);
  seen.add(file.path);
  const path = resolve(root, file.path);
  if (relative(root, path).startsWith('..' + sep)) throw Error('Path escapes the repository.');
  for (let current = path; current !== root; current = dirname(current)) {
    try { if ((await lstat(current)).isSymbolicLink()) throw Error('Symlink in reviewed path: ' + file.path); }
    catch (error) { if (error.code !== 'ENOENT') throw error; }
  }
  let actual = null;
  try { actual = hash(await readFile(path)); } catch (error) { if (error.code !== 'ENOENT') throw error; }
  if (actual !== file.before) throw Error('Source moved since review, refusing overwrite: ' + file.path);
}
const git = args => execFileSync('git', args, { cwd: root, encoding: 'utf8', maxBuffer: 1024 * 1024 });
if (git(['status', '--porcelain']).trim()) throw Error('Source transport requires a clean checkout.');
execFileSync('git', ['apply', '--check', '--whitespace=error', '-'], { cwd: root, input: data.patch, encoding: 'utf8' });
execFileSync('git', ['apply', '--whitespace=error', '-'], { cwd: root, input: data.patch, encoding: 'utf8' });
for (const file of data.files) if (hash(await readFile(resolve(root, file.path))) !== file.after) throw Error('Post-application checksum differs: ' + file.path);
const changed = git(['diff', '--name-only']).trim().split('\n').filter(Boolean);
const created = git(['ls-files', '--others', '--exclude-standard']).trim().split('\n').filter(Boolean);
if ([...changed, ...created].some(path => !allowed.has(path))) throw Error('Unexpected file changed.');
console.log(JSON.stringify({ schema: data.schema, scope: data.scope, files: data.files.length, verified: true }));
