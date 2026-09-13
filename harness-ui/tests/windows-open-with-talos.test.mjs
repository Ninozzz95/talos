import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { mkdtempSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

import { createHttpApp } from '../src/http-app.mjs';
import { createWorkspaceLaunchStore } from '../src/workspace-launch-store.mjs';

const WINDOWS = process.platform === 'win32';
/*
 * ⛔ 02/09 — `resolve('harness-ui/scripts/windows')` presumeva un cwd fisso
 * (la radice del repo, un livello sopra `harness-ui/`): girato da dentro
 * `harness-ui/` (es. `cd harness-ui && node --test tests/**`) risolveva a
 * `harness-ui/harness-ui/scripts/windows`, inesistente — 4 test falliti,
 * isolati a questo file, verificato riproducendo da entrambe le cartelle.
 * Ancorato a `import.meta.url` (stesso pattern già in uso in tutto il
 * resto di questo codebase, es. `session-registry.mjs#cartellaTrustHook`):
 * indipendente da dove il test runner viene lanciato.
 */
const scriptsDir = fileURLToPath(new URL('../scripts/windows', import.meta.url));
const powershell = join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');

function runPowerShell(file, args) {
  return new Promise((resolveRun) => {
    const child = spawn(powershell, ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', file, ...args], { windowsHide: true });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => { stdout += chunk; });
    child.stderr.on('data', (chunk) => { stderr += chunk; });
    child.on('close', (code) => resolveRun({ code, stdout: stdout.trim(), stderr: stderr.trim() }));
  });
}

function removeTestRegistryRoot(registryRoot) {
  return new Promise((resolveRun) => {
    const escaped = registryRoot.replaceAll("'", "''");
    const script = `$path='${escaped}'; if (Test-Path -LiteralPath $path) { Remove-Item -LiteralPath $path -Recurse -Force }`;
    const child = spawn(powershell, ['-NoProfile', '-Command', script], { windowsHide: true });
    child.on('close', () => resolveRun());
  });
}

test('OPEN-WITH-TALOS-WINDOWS-01 — il launcher PowerShell attraversa il vero endpoint locale', { skip: !WINDOWS }, async (t) => {
  const root = mkdtempSync(join(tmpdir(), 'talos-open-with-e2e-'));
  const workspace = join(root, 'Cartella con spazi Ω');
  mkdirSync(workspace);
  const credentialFile = join(root, 'launcher-token');
  const store = createWorkspaceLaunchStore({ credentialFile });
  const server = createServer(createHttpApp({ staticHandler: async () => null, workspaceLaunchStore: store }));
  await new Promise((resolveListen, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolveListen); });
  t.after(() => new Promise((resolveClose) => server.close(resolveClose)));
  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  const result = await runPowerShell(join(scriptsDir, 'open-with-talos.ps1'), ['-WorkspacePath', workspace, '-BaseUrl', baseUrl, '-TokenFile', credentialFile, '-NoBrowser']);
  assert.equal(result.code, 0, result.stderr);
  const output = JSON.parse(result.stdout);
  assert.match(output.url, /#open-workspace=[A-Za-z0-9_-]{32}$/);
  const id = output.url.split('=').at(-1);
  assert.equal(store.resolve(id).percorso, workspace);
});

test('OPEN-WITH-TALOS-WINDOWS-02 — un file non viene presentato a TALOS come workspace', { skip: !WINDOWS }, async () => {
  const root = mkdtempSync(join(tmpdir(), 'talos-open-with-file-'));
  const result = await runPowerShell(join(scriptsDir, 'open-with-talos.ps1'), ['-WorkspacePath', join(root, 'assente'), '-NoBrowser']);
  assert.notEqual(result.code, 0);
  assert.match(`${result.stdout} ${result.stderr}`, /cartella|esiste/i);
});

test('OPEN-WITH-TALOS-WINDOWS-03 — la registrazione HKCU isolata crea entrambi i contesti e li rimuove', { skip: !WINDOWS }, async (t) => {
  const suffix = `Talos.OpenWith.Tests.${process.pid}.${Date.now()}`;
  const registryRoot = `HKCU:\\Software\\Classes\\${suffix}`;
  t.after(() => removeTestRegistryRoot(registryRoot));
  const register = join(scriptsDir, 'register-open-with-talos.ps1');
  const installed = await runPowerShell(register, ['-RegistryRoot', registryRoot]);
  assert.equal(installed.code, 0, installed.stderr);

  const inspect = await new Promise((resolveRun) => {
    const script = `$root='${registryRoot.replaceAll("'", "''")}'; @(`
      + `(Get-ItemProperty -LiteralPath (Join-Path $root 'Directory\\shell\\Talos.OpenWorkspace')),`
      + `(Get-ItemProperty -LiteralPath (Join-Path $root 'Directory\\Background\\shell\\Talos.OpenWorkspace'))`
      + `) | Select-Object MUIVerb | ConvertTo-Json -Compress`;
    const child = spawn(powershell, ['-NoProfile', '-Command', script], { windowsHide: true });
    let stdout = ''; let stderr = '';
    child.stdout.on('data', (chunk) => { stdout += chunk; }); child.stderr.on('data', (chunk) => { stderr += chunk; });
    child.on('close', (code) => resolveRun({ code, stdout: stdout.trim(), stderr: stderr.trim() }));
  });
  assert.equal(inspect.code, 0, inspect.stderr);
  assert.deepEqual(JSON.parse(inspect.stdout).map((row) => row.MUIVerb), ['Apri cartella con TALOS', 'Apri questa cartella in TALOS']);

  const removed = await runPowerShell(register, ['-RegistryRoot', registryRoot, '-Unregister']);
  assert.equal(removed.code, 0, removed.stderr);
});

test('OPEN-WITH-TALOS-WINDOWS-04 — il comando registrato quota script e placeholder Explorer', { skip: !WINDOWS }, async (t) => {
  const suffix = `Talos.OpenWith.Command.Tests.${process.pid}.${Date.now()}`;
  const registryRoot = `HKCU:\\Software\\Classes\\${suffix}`;
  t.after(() => removeTestRegistryRoot(registryRoot));
  const register = join(scriptsDir, 'register-open-with-talos.ps1');
  await runPowerShell(register, ['-RegistryRoot', registryRoot, '-BaseUrl', 'http://127.0.0.1:4174']);
  const query = await new Promise((resolveRun) => {
    const script = `$root='${registryRoot.replaceAll("'", "''")}'; @(`
      + `(Get-Item -LiteralPath (Join-Path $root 'Directory\\shell\\Talos.OpenWorkspace\\command')).GetValue(''),`
      + `(Get-Item -LiteralPath (Join-Path $root 'Directory\\Background\\shell\\Talos.OpenWorkspace\\command')).GetValue('')`
      + `) | ConvertTo-Json -Compress`;
    const child = spawn(powershell, ['-NoProfile', '-Command', script], { windowsHide: true });
    let stdout = ''; let stderr = '';
    child.stdout.on('data', (chunk) => { stdout += chunk; }); child.stderr.on('data', (chunk) => { stderr += chunk; });
    child.on('close', (code) => resolveRun({ code, stdout: stdout.trim(), stderr: stderr.trim() }));
  });
  await runPowerShell(register, ['-RegistryRoot', registryRoot, '-Unregister']);
  assert.equal(query.code, 0, query.stderr);
  const [selected, background] = JSON.parse(query.stdout);
  assert.match(selected, /"%1"$/);
  assert.match(background, /"%V"$/);
  assert.match(selected, /open-with-talos\.ps1/i);
});

test('OPEN-WITH-TALOS-WINDOWS-05 — unregister ripetuto è idempotente', { skip: !WINDOWS }, async (t) => {
  const registryRoot = `HKCU:\\Software\\Classes\\Talos.OpenWith.Empty.${process.pid}.${Date.now()}`;
  t.after(() => removeTestRegistryRoot(registryRoot));
  const result = await runPowerShell(join(scriptsDir, 'register-open-with-talos.ps1'), ['-RegistryRoot', registryRoot, '-Unregister']);
  assert.equal(result.code, 0, result.stderr);
});
