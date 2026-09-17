/** Exact reviewed source transport; parses data, never executes payload text. */
import { createHash } from 'node:crypto';
import { brotliDecompressSync } from 'node:zlib';
import { readFile, writeFile, mkdir, lstat } from 'node:fs/promises';
import { resolve, dirname, relative, sep } from 'node:path';
const root = resolve(process.cwd());
const hash = value => createHash('sha256').update(value).digest('hex');
const allowed = new Set([
  'harness-ui/desktop/main.mjs', 'harness-ui/desktop/package.json', 'harness-ui/desktop/profile.mjs',
  'harness-ui/desktop/runtime.mjs', 'harness-ui/desktop/scripts/distribuisci.mjs',
  'harness-ui/desktop/scripts/ledger-preview-smoke.mjs', 'harness-ui/desktop/scripts/prepara-pacchetto.mjs',
  'harness-ui/desktop/tests/guscio.spec.mjs', 'harness-ui/desktop/tests/profile-isolation.test.mjs',
  'harness-ui/frontend/src/legacy/app.js', 'harness-ui/frontend/tests/qualification/workspace-real.mjs',
  'harness-ui/server.mjs', 'harness-ui/src/adattatore-keyring.mjs',
]);
const expected = '769b9c9c7260f64398c52669747509b57c4b30f095bb00c64ae410057f618288';
const compressed = Buffer.from(await readFile(resolve(root, 'docs/refactor/isolation-slice/changes.b64'), 'utf8'), 'base64');
if (hash(compressed) !== expected) throw Error('Transport hash mismatch');
const payload = JSON.parse(brotliDecompressSync(compressed, { maxOutputLength: 2000000 }));
if (payload.schema !== 'talos.ledger.changes.v1' || payload.baseline !== '9b6fe18f25566a8879e24786aef5ac7ed68a4e69' || payload.changes?.length !== allowed.size) throw Error('Unexpected source manifest');
const seen = new Set(), planned = [];
for (const change of payload.changes) {
  if (!allowed.has(change.path) || seen.has(change.path)) throw Error('Path not allowed or duplicated');
  seen.add(change.path);
  const file = resolve(root, change.path);
  for (let parent = file; parent !== root; parent = dirname(parent)) {
    if (relative(root, parent).startsWith('..' + sep)) throw Error('Outside checkout');
    try { if ((await lstat(parent)).isSymbolicLink()) throw Error('Symlink in source path'); } catch (error) { if (error.code !== 'ENOENT') throw error; }
  }
  let original = null;
  try { original = await readFile(file); } catch (error) { if (error.code !== 'ENOENT') throw error; }
  const before = original === null ? null : hash(original);
  if (before === change.after) { planned.push({ path: change.path, done: true }); continue; }
  if (before !== change.before || typeof change.after !== 'string' || !Array.isArray(change.edits)) throw Error(`Source drift: ${change.path}`);
  let result = original || Buffer.alloc(0), end = 0;
  for (const edit of change.edits) {
    if (!Number.isSafeInteger(edit.start) || !Number.isSafeInteger(edit.end) || edit.start < end || edit.end < edit.start || edit.end > result.length || typeof edit.text !== 'string') throw Error('Invalid edit interval');
    end = edit.end;
  }
  for (const edit of [...change.edits].reverse()) result = Buffer.concat([result.subarray(0, edit.start), Buffer.from(edit.text), result.subarray(edit.end)]);
  if (hash(result) !== change.after) throw Error(`Result hash mismatch: ${change.path}`);
  planned.push({ path: change.path, file, result });
}
// Validate the entire changeset before the first write.
for (const entry of planned.filter(p => !p.done)) { await mkdir(dirname(entry.file), { recursive: true }); await writeFile(entry.file, entry.result); }
await writeFile('/tmp/talos-isolation-paths.json', JSON.stringify([...seen]));
console.log(JSON.stringify({ baseline: payload.baseline, transportSha256: expected, files: planned.length, changed: planned.filter(p => !p.done).length }));
