import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { parseOptions, safeRelative, cleanEnvironment, NODE_VERSION } from './start.mjs';

test('launch defaults require no model, provider, or configuration wizard', () => {
  assert.deepEqual(parseOptions([]), { prepareOnly: false, verify: false, cpu: false, dataDir: null });
});
test('preparation and integrity checks are explicit noninteractive modes', () => {
  assert.equal(parseOptions(['--prepare-only', '--cpu']).prepareOnly, true);
  assert.equal(parseOptions(['--verify']).verify, true);
});
test('unknown commands and relative data directories fail closed', () => {
  assert.throws(() => parseOptions(['--execute-anything']));
  assert.throws(() => parseOptions(['--data-dir']));
  assert.throws(() => parseOptions(['--data-dir', 'relative']));
  assert.equal(parseOptions(['--data-dir', resolve('fixture')]).dataDir, resolve('fixture'));
});
for (const value of ['../escape', '/root', 'C:/Windows/file', 'a/../b', 'a\\b', 'a//b', './a', 'a\0b', '']) {
  test('reject archive traversal: ' + JSON.stringify(value), () => assert.throws(() => safeRelative(value)));
}
test('ordinary nested and international asset paths remain supported', () => {
  assert.equal(safeRelative('harness-ui/public/asset/nota-è.txt'), 'harness-ui/public/asset/nota-è.txt');
});
test('preview launcher never inherits production scope, token, port, or injected Node startup flags', () => {
  const env = cleanEnvironment({ PATH: '/tools', NODE_OPTIONS: '--require hostile', NODE_PATH: '/hostile', ELECTRON_RUN_AS_NODE: '1', TALOS_DESKTOP_PROFILE: 'production', TALOS_DESKTOP_DATA_DIR: '/stable', TALOS_HARNESS_UI_TOKEN: 'private', OPENAI_API_KEY: 'private', OPENROUTER_API_KEY: 'private', KEEP: 'yes' });
  assert.equal(env.TALOS_DESKTOP_PROFILE, 'preview');
  for (const key of ['NODE_OPTIONS', 'NODE_PATH', 'ELECTRON_RUN_AS_NODE', 'TALOS_DESKTOP_DATA_DIR', 'TALOS_HARNESS_UI_TOKEN', 'OPENAI_API_KEY', 'OPENROUTER_API_KEY']) assert.equal(env[key], undefined, key);
  assert.equal(env.KEEP, 'yes');
});
test('explicit test profile location is propagated for actual isolated Windows qualification', () => {
  const dir = resolve('test-only-profile');
  assert.equal(cleanEnvironment({}, { dataDir: dir }).TALOS_DESKTOP_DATA_DIR, dir);
});
test('runtime is immutable and comes from the approved official distribution', async () => {
  const lock = JSON.parse(await readFile(new URL('./runtime-lock.json', import.meta.url), 'utf8'));
  assert.equal(lock.version, NODE_VERSION);
  assert.equal(lock.url, `https://nodejs.org/dist/v${NODE_VERSION}/node-v${NODE_VERSION}-win-x64.zip`);
  assert.match(lock.archiveSha256, /^[a-f0-9]{64}$/);
  assert.match(lock.executableSha256, /^[a-f0-9]{64}$/);
});
test('entry neither weakens Windows policies nor installs global packages', async () => {
  const cmd = await readFile(new URL('../../AVVIA-TALOS.cmd', import.meta.url), 'utf8');
  const js = await readFile(new URL('./start.mjs', import.meta.url), 'utf8');
  assert.doesNotMatch(cmd, /ExecutionPolicy\s+Bypass|Set-ExecutionPolicy|Invoke-Expression|Unblock-File/i);
  assert.doesNotMatch(js, /npm.{0,30}(?:install\s+-g|--global)/i);
  assert.match(cmd, /Security\.Cryptography\.SHA256/);
  assert.match(cmd, /ComputeHash/);
  assert.doesNotMatch(cmd, /Get-FileHash|Expand-Archive/);
  assert.match(js, /tsconfig\.refactor\.json/);
});
