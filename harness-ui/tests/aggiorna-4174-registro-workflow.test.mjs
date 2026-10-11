// 25/09/2026, decisione owner «Ripristina quello in uso»: il lanciatore del 4174 accende il registro dei Workflow in
// `%LOCALAPPDATA%\TALOS-integrazione-r4\workflows` — la cartella in uso dal 23/09, che viveva solo nell'ambiente degli script
// di consegna e si è persa il 24/09. Una scelta esplicita dell'owner vince. Letta sul sorgente come la prova del kernel in
// `desktop-blackbox-hotfix.test.mjs`: il lanciatore non si esegue in una prova perché ferma e riavvia il server dell'owner.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

import { loadConfig } from '../src/config.mjs';

const lanciatore = readFileSync(new URL('../scripts/aggiorna-4174.ps1', import.meta.url), 'utf8');

test('AGGIORNA-4174-WORKFLOW-DIR: the 4174 launcher turns the Workflow Store on in its established folder, owner choice first', () => {
  const assegnazione = /\$env:TALOS_HARNESS_UI_WORKFLOW_DIR = (.+)$/mu.exec(lanciatore)?.[1] ?? '';
  assert.match(assegnazione, /Join-Path \(Join-Path \$env:LOCALAPPDATA 'TALOS-integrazione-r4'\) 'workflows'/u);
  assert.doesNotMatch(assegnazione, /\$harness|\$radice/u, 'never inside the worktree: the whole worktree is the default project');
  const esplicita = lanciatore.indexOf('if ($env:TALOS_HARNESS_UI_WORKFLOW_DIR)');
  const cartellaDati = lanciatore.indexOf('elseif ($env:TALOS_DESKTOP_DATA_DIR)');
  const senzaAppData = lanciatore.indexOf('elseif (-not $env:LOCALAPPDATA)');
  const scelta = lanciatore.indexOf('$env:TALOS_HARNESS_UI_WORKFLOW_DIR = ');
  assert.ok(esplicita > -1 && cartellaDati > esplicita && senzaAppData > cartellaDati && scelta > senzaAppData,
    'owner choice first, then the data folder, then refuse without LOCALAPPDATA, only then the default');
  assert.ok(scelta < lanciatore.indexOf('Start-Process'), 'the variable must be set before Start-Process: the child inherits it');
});

test('AGGIORNA-4174-WORKFLOW-DIR-CONFIG: the server reads that folder, and it is not inside any default project', () => {
  const localAppData = process.env.LOCALAPPDATA ?? 'C:\\Users\\prova\\AppData\\Local';
  const cartella = join(localAppData, 'TALOS-integrazione-r4', 'workflows');
  const config = loadConfig({ TALOS_HARNESS_UI_WORKFLOW_DIR: cartella, TALOS_HARNESS_UI_KEYRING: 'memoria' },
    new URL('../server.mjs', import.meta.url), { sondaMotore: () => ({ status: 1, stdout: '', stderr: '' }) });
  assert.equal(config.workflowDataRoot, cartella);
  for (const { percorso } of config.cartelleProgetto) {
    const radice = percorso.toLowerCase().replace(/[\\/]+$/u, '');
    const dentro = cartella.toLowerCase() === radice || cartella.toLowerCase().startsWith(`${radice}\\`) || cartella.toLowerCase().startsWith(`${radice}/`);
    assert.equal(dentro, false, `the Workflow folder would sit inside the project ${percorso}`);
  }
});

test('AGGIORNA-4174-WORKFLOW-DIR-VERSO-CONTRARIO: a folder inside the worktree WOULD be inside the default project', () => {
  // la trappola della prima domanda all'owner (25/09): «accanto alle sessioni» dentro il worktree
  const config = loadConfig({ TALOS_HARNESS_UI_KEYRING: 'memoria' }, new URL('../server.mjs', import.meta.url),
    { sondaMotore: () => ({ status: 1, stdout: '', stderr: '' }) });
  const [progetto] = config.cartelleProgetto;
  const dentroIlWorktree = join(progetto.percorso, '.dati-4174', 'workflows');
  assert.ok(dentroIlWorktree.toLowerCase().startsWith(progetto.percorso.toLowerCase()), 'the default project contains the whole worktree');
});

// 10/10/2026, decisione owner «Sola lettura dall'altro archivio»: il lanciatore indica al server l'archivio Workflow dell'app,
// SOLO quando le sessioni sono quelle dell'app e la cartella esiste; una scelta esplicita vince; e prima di Start-Process.
test('AGGIORNA-4174-WORKFLOW-ALTRO: the app Workflow store is passed read-only only when the sessions are the app ones', () => {
  const blocco = lanciatore.slice(lanciatore.indexOf('if (-not $env:TALOS_HARNESS_UI_WORKFLOW_ALTRO_DIR'));
  assert.ok(blocco.length > 0 && lanciatore.indexOf('if (-not $env:TALOS_HARNESS_UI_WORKFLOW_ALTRO_DIR') > -1, 'the block exists');
  assert.match(blocco, /\$workflowApp = Join-Path \(Join-Path \$env:APPDATA 'TALOS'\) 'workflows'/u);
  assert.match(blocco, /\$stesseSessioni = .*TALOS_HARNESS_UI_SESSIONS_DIR.*-ieq.*\$sessioniApp/u);
  assert.match(blocco, /if \(\$stesseSessioni -and \(Test-Path -LiteralPath \$workflowApp -PathType Container\)\)/u);
  assert.ok(lanciatore.indexOf('$env:TALOS_HARNESS_UI_WORKFLOW_ALTRO_DIR = $workflowApp') < lanciatore.indexOf('Start-Process'), 'set before the child starts');
  const altro = join(process.env.APPDATA ?? join('C:', 'Users', 'prova', 'AppData', 'Roaming'), 'TALOS', 'workflows');
  const config = loadConfig({ TALOS_HARNESS_UI_WORKFLOW_ALTRO_DIR: altro, TALOS_HARNESS_UI_KEYRING: 'memoria' },
    new URL('../server.mjs', import.meta.url), { sondaMotore: () => ({ status: 1, stdout: '', stderr: '' }) });
  assert.equal(config.workflowAltroArchivio, altro);
  assert.throws(() => loadConfig({ TALOS_HARNESS_UI_WORKFLOW_ALTRO_DIR: join('relativa', 'workflows'), TALOS_HARNESS_UI_KEYRING: 'memoria' },
    new URL('../server.mjs', import.meta.url), { sondaMotore: () => ({ status: 1, stdout: '', stderr: '' }) }), /must be an absolute folder/u);
});
