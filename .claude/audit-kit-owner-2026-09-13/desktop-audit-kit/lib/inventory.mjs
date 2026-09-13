import fs from 'node:fs/promises';
import {createReadStream} from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
const exec = promisify(execFile);
const roots = ['harness-ui', 'context-engine', '.github/workflows/release.yml'];
const essential = ['harness-ui/package.json', 'harness-ui/desktop/package.json', 'harness-ui/server.mjs'];
const git = async (root, args) => (await exec('git', ['-C', root, ...args], {maxBuffer: 32*1024*1024, timeout: 30000})).stdout;
const within = (root, file) => { const r = path.relative(root, file); return r !== '..' && !r.startsWith('..'+path.sep) && !path.isAbsolute(r); };
async function hashFile(file) {
  const h = createHash('sha256');
  for await (const chunk of createReadStream(file)) h.update(chunk);
  return h.digest('hex');
}
export async function inventory(repository) {
  const root = await fs.realpath(repository);
  const top = await fs.realpath((await git(root, ['rev-parse', '--show-toplevel'])).trim());
  if (top !== root) throw new Error('Pass the Git repository root, not a subdirectory');
  const commit = (await git(root, ['rev-parse', 'HEAD'])).trim();
  const names = (await git(root, ['ls-files', '-z', '--', ...roots])).split('\0').filter(Boolean).sort();
  const files = [];
  for (const name of names) {
    const target = path.resolve(root, name);
    if (!within(root, target)) throw new Error('Tracked path escapes repository');
    let st;
    try { st = await fs.lstat(target); } catch(e) {
      if (e.code === 'ENOENT') {files.push({path: name, status: 'missing'}); continue;}
      throw e;
    }
    if (st.isSymbolicLink()) {files.push({path: name, status: 'symlink_not_followed'}); continue;}
    if (!st.isFile()) {files.push({path: name, status: 'directory_or_submodule_not_expanded'}); continue;}
    const real = await fs.realpath(target);
    if (!within(root, real)) throw new Error('Path resolves outside repository');
    files.push({path: name, status: 'hashed', bytes: st.size, sha256: await hashFile(real)});
  }
  const packages = [];
  for (const rel of ['harness-ui/package.json', 'harness-ui/desktop/package.json', 'harness-ui/frontend/package.json', 'context-engine/package.json']) {
    if (!files.some(f => f.path === rel && f.status === 'hashed')) continue;
    const data = JSON.parse(await fs.readFile(path.join(root, rel), 'utf8'));
    packages.push({path: rel, name: data.name ?? null, type: data.type ?? null,
      script_names: Object.keys(data.scripts ?? {}).sort(), dependency_names: Object.keys(data.dependencies ?? {}).sort()});
  }
  const status = await git(root, ['status', '--porcelain=v1', '--untracked-files=all', '--', ...roots]);
  const missing = essential.filter(rel => !files.some(f => f.path === rel && f.status === 'hashed'));
  return {
    schema_version: 1, commit, observed_at_utc: new Date().toISOString(), node: process.version,
    source_scope: roots, scope_note: 'Directory-scoped inventory, NOT a reachability proof or complete desktop component audit.',
    mobile_source_inspected: false, required_files_missing: missing, worktree_dirty: status.length > 0,
    // Do not retain local absolute paths, environment variables, file contents, or command lines.
    worktree_status_sha256: createHash('sha256').update(status).digest('hex'),
    snapshot_sha256: createHash('sha256').update(JSON.stringify(files)).digest('hex'),
    files, packages, skipped_count: files.filter(f => f.status !== 'hashed').length,
    app_build_verified: false, desktop_execution_verified: false,
  };
}
export function assertPinnedClean(value, expectedCommit) {
  if (typeof expectedCommit !== 'string' || !/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/i.test(expectedCommit)) throw new Error('Expected full commit hash');
  if (value.commit.toLowerCase() !== expectedCommit.toLowerCase()) throw new Error('Commit mismatch');
  if (value.worktree_dirty) throw new Error('Dirty desktop-scoped worktree');
  if (value.required_files_missing.length) throw new Error('Missing required desktop source files');
  if (value.skipped_count) throw new Error('Incomplete inventory: resolve skipped paths/submodules first');
  return true;
}
