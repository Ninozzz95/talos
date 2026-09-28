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

test('R04-CARTELLA — l\'installer assistito va in Programs\TALOS, e lo smoke lo confronta con ciò che dichiara il registro', () => {
  /* 28/09/2026: la release desktop-v0.1.16 si è fermata qui con «EXE installato assente». Con `oneClick:false` electron-builder
     26.16.1 installa in `Programs\<productFilename>` (`NsisTarget.js:179`, `targetUtil.js:40-41`), non più nel nome del pacchetto.
     Lo smoke vero non gira su una macchina che ha già TALOS installato (PREFLIGHT): qui si fissa il contratto nel sorgente. */
  const sorgente = readFileSync(script, 'utf8');
  assert.match(sorgente, /if \(-not \$overrideDestinazione\) \{ \$InstallDir = Join-Path \$env:LOCALAPPDATA 'Programs\/TALOS' \}/u,
    'la cartella attesa di un\'installazione nuova è Programs\TALOS');
  assert.match(sorgente, /\$misure\.installazioneDichiarata = \[IO\.Path\]::GetDirectoryName\(\$disinstallatoreDichiarato\)/u,
    'la cartella si legge dalla voce di disinstallazione');
  assert.match(sorgente, /Cartella d'installazione diversa dall'attesa: il registro dice/u, 'e se non coincide il rosso dice dove è andata');
});

test('R04-VOCE-REGISTRO — la voce di disinstallazione si riconosce dal nome che electron-builder scrive davvero', { skip: !windows }, () => {
  /* 28/09/2026: la release desktop-v0.1.17 si è fermata su «attesa 1, trovate 0». DisplayName è `${productName} ${version}`
     (NsisTarget.js:486): il filtro `-eq 'TALOS'` del 12/09 non aveva mai trovato niente, e il PREFLIGHT e «voce rimasta»
     passavano a vuoto. Misurato sulla macchina dell'owner: «TALOS 0.1.15», vecchio filtro 0, predicato nuovo sì.
     Si carica il predicato VERO dal sorgente (come R04-PROCESSI-SENZA-WMI), non una sua copia. */
  const casi = { 'TALOS 0.1.15': true, 'TALOS 0.1.17': true, TALOS: true, 'TALOS 1.2.3-beta.1': true, 'TALOS Mobile': false, 'Talos 0.1.15': false, 'TALOS 0.1': false, 'Altra app': false };
  const programma = `$e = $null; $t = $null; $ast = [Management.Automation.Language.Parser]::ParseFile('${script.replaceAll("'", "''")}', [ref]$t, [ref]$e); $fn = $ast.Find({ param($n) $n -is [Management.Automation.Language.FunctionDefinitionAst] -and $n.Name -eq 'E-VoceTalos' }, $true); . ([scriptblock]::Create($fn.Extent.Text)); $esiti = @(foreach ($nome in @(${Object.keys(casi).map((n) => `'${n}'`).join(', ')})) { ,@($nome, [bool](E-VoceTalos ([pscustomobject]@{ DisplayName = $nome }))) }) + ,@('(senza nome)', [bool](E-VoceTalos ([pscustomobject]@{ Altro = 1 }))); ConvertTo-Json -Compress -InputObject $esiti`; // coppie, non una tabella: le chiavi di PowerShell non distinguono le maiuscole
  const r = esegui(['-Command', programma]);
  assert.equal(r.status, 0, r.error?.message || r.stdout + r.stderr);
  assert.deepEqual(Object.fromEntries(JSON.parse(r.stdout.trim())), { ...casi, '(senza nome)': false });
});
