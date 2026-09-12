import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, readFileSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const script = fileURLToPath(new URL('../scripts/ci-smoke.ps1', import.meta.url));
const windows = process.platform === 'win32';
const esegui = args => spawnSync('pwsh.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', ...args], { encoding: 'utf8', windowsHide: true, timeout: 20000 });

test('R04-POWERSHELL — script interpretabile da PowerShell 7', { skip: !windows }, () => {
  const programma = `$erroriPS = $null; $tokenPS = $null; [void][Management.Automation.Language.Parser]::ParseFile('${script.replaceAll("'", "''")}', [ref]$tokenPS, [ref]$erroriPS); if ($erroriPS.Count) { $erroriPS | ForEach-Object { Write-Output $_.Message }; exit 1 }`;
  const r = esegui(['-Command', programma]);
  assert.equal(r.status, 0, r.error?.message || r.stdout + r.stderr);
});

test('R04-PREFLIGHT — rifiuta un percorso relativo e preserva una cartella esistente', { skip: !windows }, t => {
  const dir = mkdtempSync(join(tmpdir(), 'talos-r04-preflight-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  // Non è un eseguibile: il preflight deve rifiutare prima di avviare alcunché.
  const exe = join(dir, 'installer.exe');
  const report = join(dir, 'report.json');
  writeFileSync(exe, 'NON ESEGUIRE');
  let r = esegui(['-File', script, '-Installer', exe, '-InstallDir', 'relativo', '-ReportPath', report]);
  assert.notEqual(r.status, 0);
  assert.match(r.stdout + r.stderr, /percorso assoluto/);
  r = esegui(['-File', script, '-Installer', exe, '-InstallDir', dir, '-ReportPath', report]);
  assert.notEqual(r.status, 0);
  assert.match(r.stdout + r.stderr, /R04-PREFLIGHT/);
  assert.equal(readFileSync(exe, 'utf8'), 'NON ESEGUIRE');
  assert.equal(existsSync(report), false, 'Il preflight non deve iniziare la prova.');
});

test('R04-PROCESSI-SENZA-WMI — trova un processo proprio senza privilegi CIM', { skip: !windows }, () => {
  // Carica soltanto la funzione dallo AST: nessun installer viene eseguito.
  const programma = `$e = $null; $t = $null; $ast = [Management.Automation.Language.Parser]::ParseFile('${script.replaceAll("'", "''")}', [ref]$t, [ref]$e); $fn = $ast.Find({ param($n) $n -is [Management.Automation.Language.FunctionDefinitionAst] -and $n.Name -eq 'Processi-Installati' }, $true); . ([scriptblock]::Create($fn.Extent.Text)); $propri = @(Processi-Installati (Split-Path (Get-Process -Id $PID).Path)); if (-not ($propri.ProcessId -contains $PID)) { throw 'Processo proprio non trovato' }`;
  const r = esegui(['-Command', programma]);
  assert.equal(r.status, 0, r.error?.message || r.stdout + r.stderr);
});
