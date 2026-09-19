import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync, rmSync } from 'node:fs';
import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

// Dipendenza di electron-builder già fissata a 4.3.2 nel lock desktop.
const { load } = createRequire(import.meta.url)('js-yaml');
const testo = readFileSync(new URL('../../../.github/workflows/release.yml', import.meta.url), 'utf8');
const workflow = load(testo);
const desktop = workflow.jobs.desktop;
const passi = desktop.steps;
const run = passi.map(p => p.run || '').join('\n');
const pacchetto = JSON.parse(readFileSync(new URL('../package.json', import.meta.url)));
const passo = id => { const p = passi.find(p => p.id === id); assert.ok(p, `Passo mancante: ${id}`); return p; };

test('R04-WINDOWS — Node 24, PowerShell, cache e cancelli prima dello staging', () => {
  assert.equal(desktop['runs-on'], 'windows-latest');
  assert.equal(desktop.defaults.run.shell, 'pwsh');
  assert.equal(desktop['timeout-minutes'], 45);
  assert.equal(desktop.if, "startsWith(github.ref_name, 'desktop-v')");
  assert.deepEqual(workflow.on.push.tags, ['v*', 'desktop-v*']);
  const setup = passi.find(p => p.uses?.startsWith('actions/setup-node@'));
  assert.equal(String(setup.with['node-version']), '24');
  assert.equal(setup.with.cache, 'npm');
  for (const lock of ['harness-ui/package-lock.json', 'harness-ui/frontend/package-lock.json', 'harness-ui/desktop/package-lock.json']) assert.ok(setup.with['cache-dependency-path'].split(/\s+/).includes(lock));
  assert.ok(passi.find(p => p.uses?.startsWith('actions/cache@')));
  for (const gate of ['verify:evolution-baseline', 'tests/*.test.mjs', 'test:kernel', 'kernel:controlla', 'test:unit', 'test:puri', 'test:guscio']) assert.ok(passo('cancelli').run.includes(gate), gate);
  for (const prefix of ['harness-ui', 'harness-ui/frontend', 'harness-ui/desktop']) assert.ok(run.includes(`npm ci --prefix ${prefix}`));
  assert.doesNotMatch(run, /ignore-scripts|continue-on-error/);
  assert.match(run, /node harness-ui\/frontend\/node_modules\/playwright\/cli\.js install chromium/);
  assert.ok(passi.indexOf(passo('cancelli')) < passi.indexOf(passo('dist')));
  assert.ok(passi.indexOf(passo('dist')) < passi.indexOf(passo('smoke')));
});

test('R04-ATTEST — permessi invariati e actions/attest v4 identico ad apk', () => {
  assert.deepEqual(workflow.permissions, { contents: 'write', 'id-token': 'write', attestations: 'write', 'artifact-metadata': 'write' });
  assert.equal(desktop.permissions, undefined);
  const attest = passi.find(p => p.uses?.startsWith('actions/attest@'));
  assert.ok(attest, 'Manca actions/attest');
  assert.equal(attest.uses, 'actions/attest@1e69f48acb82d1966a394da916b4c1698aa569d6');
  assert.ok(workflow.jobs.apk.steps.some(p => p.uses === attest.uses));
  assert.deepEqual(attest.with['subject-path'].trim().split(/\r?\n/), ['${{ steps.asset.outputs.exe }}', '${{ steps.asset.outputs.zip }}']);
  for (const p of passi.filter(p => p.uses)) assert.match(p.uses, /@[a-f0-9]{40}$/);
  assert.ok(passi.indexOf(passo('smoke')) < passi.indexOf(attest));
  assert.ok(passi.indexOf(attest) < passi.indexOf(passo('release')));
  assert.equal(attest.if, undefined);
});

test('R04-ASSET — installer R-02, ZIP completo, SHA e note esplicite', () => {
  assert.equal(pacchetto.build.nsis.artifactName, 'TALOS-Setup-${version}.${ext}');
  assert.equal(pacchetto.build.win.artifactName, 'TALOS-${version}-win.${ext}');
  assert.equal(pacchetto.build.nsis.perMachine, false);
  assert.equal(pacchetto.build.nsis.oneClick, true);
  assert.equal(pacchetto.build.publish, null);
  assert.match(passo('asset').run, /scripts\/release-assets\.mjs/);
  assert.match(passo('smoke').run, /scripts\/ci-smoke\.ps1/);
  const upload = passi.find(p => p.id === 'upload');
  assert.deepEqual(upload.with.path.trim().split(/\r?\n/), ['${{ steps.asset.outputs.exe }}', '${{ steps.asset.outputs.zip }}', '${{ steps.asset.outputs.sha }}']);
  assert.equal(upload.with['if-no-files-found'], 'error');
  assert.equal(upload.with['compression-level'], 0);
  assert.match(passo('release').run, /gh release create/);
  for (const arg of ['--verify-tag', '--notes-file', '$env:EXE', '$env:ZIP', '$env:SHA']) assert.ok(passo('release').run.includes(arg));
  assert.doesNotMatch(passo('release').run, /--generate-notes|\*\.zip/);
});

test('R04-PORTABILITA — nessun segreto, repository fisso o codice evento nella shell', () => {
  const text = JSON.stringify(desktop);
  assert.doesNotMatch(text, /secrets\.|AVM-harness-desktop|Antonino|4174|azure.*sign|attest-build-provenance/i);
  assert.equal(passo('release').env.GH_TOKEN, '${{ github.token }}');
  assert.equal(passo('release').env.GH_REPO, '${{ github.repository }}');
  for (const p of passi.filter(p => p.run)) assert.doesNotMatch(p.run, /\$\{\{\s*github\./);
  assert.equal(passo('release').if, undefined);
  assert.equal(passi.find(p => p.uses?.startsWith('actions/checkout@')).with['persist-credentials'], false);
});

test('R04-LOCK-CHIAVE-VUOTA — passo PowerShell reale, output e tag divergente', { skip: process.platform !== 'win32' }, t => {
  const dir = mkdtempSync(join(tmpdir(), 'talos-r04-workflow-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const env = { ...process.env, GITHUB_REF_NAME: `desktop-v${pacchetto.version}`, GITHUB_OUTPUT: join(dir, 'output'), GITHUB_ENV: join(dir, 'env'), GITHUB_STEP_SUMMARY: join(dir, 'summary') };
  const esegui = ambiente => spawnSync('pwsh.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', passo('ambiente').run], { cwd: fileURLToPath(new URL('../../../', import.meta.url)), env: ambiente, encoding: 'utf8', windowsHide: true, timeout: 20000 });
  const ok = esegui(env);
  assert.equal(ok.status, 0, ok.error?.message || ok.stdout + ok.stderr);
  assert.match(readFileSync(env.GITHUB_OUTPUT, 'utf8'), new RegExp(`exe=harness-ui/desktop/dist/TALOS-Setup-${pacchetto.version.replaceAll('.', '\\.')}\\.exe`));
  assert.match(readFileSync(env.GITHUB_ENV, 'utf8'), /electron-builder\/Cache/);
  const no = esegui({ ...env, GITHUB_REF_NAME: 'desktop-v999.0.0' });
  assert.notEqual(no.status, 0);
  assert.match(no.stdout + no.stderr, /Tag e versioni/);
});

test('R04-TAG-COMMIT — il ramo CI conserva il commit esatto del tag', { skip: process.platform !== 'win32' }, t => {
  const passoTag = passo('commit_tag');
  const dir = mkdtempSync(join(tmpdir(), 'talos-r04-tag-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const git = args => {
    const r = spawnSync('git', args, { cwd: dir, encoding: 'utf8', windowsHide: true, timeout: 20000 });
    assert.equal(r.status, 0, r.error?.message || r.stderr);
    return r.stdout.trim();
  };
  git(['init', '--quiet']);
  git(['fetch', '--quiet', '--depth=1', fileURLToPath(new URL('../../../', import.meta.url)), 'HEAD']);
  git(['checkout', '--quiet', '--detach', 'FETCH_HEAD']);
  git(['tag', 'desktop-v0.1.0']);
  const prima = git(['rev-parse', 'HEAD']);
  const r = spawnSync('pwsh.exe', ['-NoProfile', '-Command', passoTag.run], { cwd: dir, env: { ...process.env, GITHUB_REF_NAME: 'desktop-v0.1.0' }, encoding: 'utf8', windowsHide: true, timeout: 20000 });
  assert.equal(r.status, 0, r.error?.message || r.stdout + r.stderr);
  assert.equal(git(['rev-parse', 'HEAD']), prima);
  assert.equal(git(['branch', '--show-current']), 'ci-desktop-release');
  assert.equal(git(['rev-parse', 'desktop-v0.1.0^{commit}']), prima);
});
