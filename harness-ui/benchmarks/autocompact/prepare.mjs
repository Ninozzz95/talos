import { mkdir, readFile, writeFile, stat } from 'node:fs/promises';
import { resolve, join, dirname, relative, isAbsolute } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import JSZip from 'jszip';
import { loadRecoveredHistory, makeMemoryHistory } from './cases.mjs';

const repo = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const root = join(repo, 'scratchpad/prove/autocompact-qualification-20260908');
await mkdir(root, { recursive: true });
const pins = [
  { name: 'hermes', repo: 'NousResearch/hermes-agent', sha: '2237be355906fbe6065ce1815711eee52b2d646e' },
  { name: 'lcm', repo: 'stephenschoettler/hermes-lcm', sha: '8d1b1e6d3d63f5fc7b209e8d7ec1dc9b814f2e54' },
];
const manifest = [];
if (process.argv.includes('--hermes-tree')) {
  const pin = pins[0];
  const commitUrl = `https://api.github.com/repos/${pin.repo}/git/commits/${pin.sha}`;
  const commitResponse = await fetch(commitUrl, { signal: AbortSignal.timeout(30_000) });
  if (!commitResponse.ok) throw new Error(`COMMIT_HTTP_${commitResponse.status}`);
  const commit = await commitResponse.json();
  if (commit.sha !== pin.sha) throw new Error('COMMIT_MISMATCH');
  const treePath = join(root, 'hermes-tree.json');
  let tree = await readFile(treePath, 'utf8').then(JSON.parse, () => null);
  if (!tree) {
    const response = await fetch(`${commit.tree.url}?recursive=1`, { signal: AbortSignal.timeout(30_000) });
    if (!response.ok) throw new Error(`TREE_HTTP_${response.status}`);
    tree = await response.json();
    await writeFile(treePath, JSON.stringify(tree, null, 2));
  }
  if (tree.truncated || tree.sha !== commit.tree.sha) throw new Error('TREE_INCOMPLETE');
  const target = join(root, 'upstreams/hermes');
  const installed = join(process.env.LOCALAPPDATA, 'hermes/hermes-agent');
  const evidence = { pin, commit, treeSha: tree.sha, startedAt: new Date().toISOString(), files: [] };
  let downloaded = 0;
  const blobHash = bytes => createHash('sha1').update(`blob ${bytes.length}\0`).update(bytes).digest('hex');
  const queue = tree.tree.filter(entry => entry.type !== 'tree');
  const missing = [];
  async function save(entry, bytes, origin) {
    if (blobHash(bytes) !== entry.sha) throw new Error(`BLOB_HASH_MISMATCH: ${entry.path}`);
    const dest = resolve(target, entry.path);
    await mkdir(dirname(dest), { recursive: true });
    await writeFile(dest, bytes, { flag: 'wx', mode: entry.mode === '100755' ? 0o755 : 0o644 });
    evidence.files.push({ path: entry.path, sha: entry.sha, size: bytes.length, origin });
  }
  for (const entry of queue) {
    if (entry.type !== 'blob' || !['100644', '100755'].includes(entry.mode)) throw new Error(`UNSUPPORTED_GIT_ENTRY: ${entry.path}`);
    const dest = resolve(target, entry.path);
    const rel = relative(target, dest);
    if (isAbsolute(rel) || rel.startsWith('..')) throw new Error('TREE_PATH_INVALID');
    let bytes = await readFile(dest).catch(error => { if (error.code !== 'ENOENT') throw error; return null; });
    if (bytes && blobHash(bytes) !== entry.sha) throw new Error(`SOURCE_MISMATCH: ${entry.path}`);
    if (bytes) { evidence.files.push({ path: entry.path, sha: entry.sha, size: bytes.length, origin: 'verified-cache' }); continue; }
      bytes = await readFile(join(installed, entry.path)).catch(() => null);
      let origin = 'verified-installed-bytes';
      if (bytes && blobHash(bytes) !== entry.sha) {
        const normalized = Buffer.from(bytes.toString('utf8').replaceAll('\r\n', '\n'));
        if (blobHash(normalized) === entry.sha) { bytes = normalized; origin = 'verified-installed-crlf-normalized'; }
      }
      if (!bytes || blobHash(bytes) !== entry.sha) {
        missing.push(entry);
        continue;
      }
      await save(entry, bytes, origin);
  }
  console.log(`Hermes: ${evidence.files.length} blob verificati dalla cache; ${missing.length} da GitHub API`);
  const gh = async args => {
    try {
      const { stdout } = await promisify(execFile)('gh', ['api', ...args], { encoding: 'utf8', maxBuffer: 100_000_000, timeout: 120_000, windowsHide: true });
      return JSON.parse(stdout);
    } catch (error) { throw new Error(`GH_API_FAILED: ${String(error.stderr ?? error.code).slice(0,500)}`); }
  };
  // GitHub's authenticated GraphQL batches avoid thousands of REST requests.
  // Authentication stays in the installed gh credential helper, never in logs.
  const batches = [];
  for (let offset = 0; offset < missing.length; offset += 25) batches.push(missing.slice(offset, offset + 25));
  for (let n = 0; n < batches.length; n++) {
    const batch = batches[n];
    const fields = batch.map((entry, i) => `b${i}: object(oid: "${entry.sha}") { ... on Blob { oid text isBinary } }`).join('\n');
    let result;
    try { result = await gh(['graphql', '-f', `query=query { repository(owner: "NousResearch", name: "hermes-agent") { ${fields} } }`]); }
    catch (error) {
      if (batch.length === 1 || /rate limit|429|403/i.test(error.message)) throw error;
      const half = Math.ceil(batch.length / 2);
      batches.splice(n, 1, batch.slice(0,half), batch.slice(half));
      n--; console.log(`GitHub ha rifiutato il gruppo: lo divido in ${half} blob.`); continue;
    }
    if (result.errors) throw new Error(`GRAPHQL_ERROR: ${JSON.stringify(result.errors)}`);
    for (const [i, entry] of batch.entries()) {
      const blob = result.data?.repository?.[`b${i}`];
      if (blob?.oid !== entry.sha) throw new Error(`GRAPHQL_BLOB_MISMATCH: ${entry.path}`);
      let bytes = typeof blob.text === 'string' ? Buffer.from(blob.text) : null;
      if (!bytes || blobHash(bytes) !== entry.sha) {
        const raw = await gh([`repos/${pin.repo}/git/blobs/${entry.sha}`]);
        if (raw.encoding !== 'base64' || raw.sha !== entry.sha) throw new Error('REST_BLOB_INVALID');
        bytes = Buffer.from(raw.content, 'base64');
      }
      await save(entry, bytes, 'authenticated-github-git-api');
      downloaded++;
    }
    console.log(`Hermes: ${evidence.files.length} blob verificati, ${downloaded} scaricati`);
  }
  evidence.completedAt = new Date().toISOString();
  await writeFile(join(root, 'hermes-materialization.json'), JSON.stringify(evidence, null, 2));
  manifest.push({ ...pin, status: 'ready', url: commitUrl, treeSha: tree.sha, path: target, license: (await readFile(join(target, 'LICENSE'), 'utf8')).split('\n')[0], fetchedAt: evidence.completedAt, acquisition: 'git-tree-and-verified-blobs', files: evidence.files.length, downloaded });
  console.log(`Hermes pronto: ${pin.sha}, ${evidence.files.length} hash verificati`);
}
for (const pin of pins) {
  if (process.argv.includes('--hermes-tree')) continue;
  if (process.argv.includes('--datasets-only')) continue;
  if (process.argv.includes('--lcm-only') && pin.name !== 'lcm') continue;
  const url = `https://codeload.github.com/${pin.repo}/zip/${pin.sha}`;
  try {
  const archive = join(root, `${pin.name}-${pin.sha}.zip`);
  let bytes;
  try { bytes = await readFile(archive); }
  catch (error) {
    if (error.code !== 'ENOENT') throw error;
    const response = await fetch(url, { signal: AbortSignal.timeout(180_000) });
    if (!response.ok) throw new Error(`${pin.name}: HTTP ${response.status}; retry-after=${response.headers.get('retry-after') ?? 'unspecified'}`);
    bytes = Buffer.from(await response.arrayBuffer());
    await writeFile(archive, bytes, { flag: 'wx' });
  }
  const zip = await JSZip.loadAsync(bytes);
  const prefix = Object.keys(zip.files).find(name => name.endsWith('/'));
  if (!prefix) throw new Error('ARCHIVE_PREFIX_MISSING');
  const target = join(root, 'upstreams', pin.name);
  await mkdir(target, { recursive: true });
  for (const entry of Object.values(zip.files)) {
    if (entry.dir) continue;
    const name = entry.name.slice(prefix.length);
    const dest = resolve(target, name);
    const rel = relative(target, dest);
    if (isAbsolute(rel) || rel.startsWith('..') || !entry.name.startsWith(prefix)) throw new Error('ARCHIVE_PATH_INVALID');
    if (await stat(dest).then(() => true, () => false)) {
      if (!(await readFile(dest)).equals(await entry.async('nodebuffer'))) throw new Error(`SOURCE_MISMATCH: ${name}`);
      continue;
    }
    await mkdir(dirname(dest), { recursive: true });
    await writeFile(dest, await entry.async('nodebuffer'), { flag: 'wx' });
  }
  manifest.push({ ...pin, status: 'ready', url, archiveSha256: createHash('sha256').update(bytes).digest('hex'), path: target, license: (await readFile(join(target, 'LICENSE'), 'utf8')).split('\n')[0], fetchedAt: new Date().toISOString() });
  console.log(`Upstream pronto: ${pin.name} ${pin.sha}`);
  } catch (error) {
    manifest.push({ ...pin, status: 'unavailable', url, error: error.message, fetchedAt: new Date().toISOString() });
    console.error(error.message);
    process.exitCode = 2;
  }
}
const history = await loadRecoveredHistory(join(repo, 'scratchpad/prove/recupero-locale-20260908/sessions/8407d564-f7a0-4e4c-b737-ca5851046a50.jsonl'));
if (manifest.length) {
  const previous = await readFile(join(root, 'sources.json'), 'utf8').then(JSON.parse, () => []);
  const byName = new Map(previous.map(item => [item.name, item]));
  for (const item of manifest) byName.set(item.name, item);
  await writeFile(join(root, 'sources.json'), JSON.stringify([...byName.values()], null, 2));
}
await writeFile(join(root, 'datasets.json'), JSON.stringify({ ownerCopy: history, memory: makeMemoryHistory() }, null, 2));
await mkdir(join(root, 'fixture'), { recursive: true });
await writeFile(join(root, 'fixture/README.md'), 'Codice di verifica della prova locale: sole-47.\n');
console.log(`Checkpoint ${history.version}: ${history.messages.length} messaggi. Artefatti: ${root}`);
