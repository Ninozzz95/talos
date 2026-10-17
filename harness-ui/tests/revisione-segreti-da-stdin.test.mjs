/*
 * ⛔ REVISIONE AVVERSARIA dei segreti dallo stdin (bugfixer, 14/10/2026 sera) — `feat/segreti-da-stdin`, commit `4ea49c3c1`.
 *
 * Prova ROSSA apposta. La modalità esiste per una ragione di SICUREZZA (sul telefono l'ambiente si legge in /proc/<pid>/environ e i
 * comandi dell'agente girano con lo stesso utente): chi la sceglie vuole il token. Ma il token in r4 è FACOLTATIVO («Senza variabile:
 * comportamento di sempre», `config.mjs`), e lo stdin non lo pretende: se lo stdin arriva vuoto (chi ospita ha dimenticato di scriverlo,
 * o ha avviato con `stdio: 'ignore'`) o il nome è sbagliato di una lettera (`TALOS_HARNESS_UI_TOKN`, che finisce al portachiavi come
 * «voce che r4 non consuma»), il server PARTE SENZA nessuna serratura: ogni `/api` risponde a chiunque raggiunga la porta, compresi i
 * comandi dell'agente. Nessun errore, nessun avviso.
 * Rapporto: `handoff-talos-2026-09-27/bugfixer/RAPPORTO-REVISIONE-GOAL-G3-2026-10-14.md`, sezione «Segreti dallo stdin».
 */
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdirSync, mkdtempSync } from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

import { rimuoviCartellaDiProva } from './aiuto/rimuovi-cartella-di-prova.mjs';

const RADICE = fileURLToPath(new URL('..', import.meta.url));
async function portaLibera() {
  const s = createServer();
  await new Promise((fatto) => s.listen(0, '127.0.0.1', fatto));
  const { port } = s.address();
  await new Promise((fatto) => s.close(fatto));
  return port;
}

test('SEGRETI-REV-01 (S2) — in «secrets from stdin» mode a MISSING or MISSPELLED token starts the server with NO lock: every /api answers anyone', async (t) => {
  const radice = mkdtempSync(join(tmpdir(), 'talos-segreti-rev-'));
  const temp = join(radice, 'temp');
  for (const c of [temp, join(radice, 'workspace')]) mkdirSync(c, { recursive: true });
  const servers = [];
  t.after(async () => {
    for (const s of servers) if (s.exitCode === null && s.signalCode === null) { s.kill(); await Promise.race([new Promise((r) => s.once('exit', r)), delay(15_000)]); }
    await rimuoviCartellaDiProva(radice);
  }, { timeout: 60_000 });

  const prova = async (stdinTesto) => {
    const porta = await portaLibera();
    const env = { ...process.env, TALOS_HARNESS_UI_HOST: '127.0.0.1', TALOS_HARNESS_UI_PORT: String(porta),
      TALOS_HARNESS_UI_PROJECT_DIRS: join(radice, 'workspace'), TALOS_HARNESS_UI_SESSIONS_DIR: join(radice, `sessions-${porta}`), TALOS_DESKTOP_DATA_DIR: join(radice, `desktop-${porta}`),
      // la custodia in memoria (KEYRING-PROVA-04): il difetto non dipende dal portachiavi, solo dal token mancante
      TALOS_HARNESS_UI_KEYRING: 'memoria', TALOS_HARNESS_UI_KEYRING_SCOPE: '', TALOS_HARNESS_UI_SEGRETI_DA: 'stdin',
      TALOS_SCRATCH_DIR: join(radice, 'scratch'), TEMP: temp, TMP: temp, TMPDIR: temp };
    delete env.TALOS_HARNESS_UI_TOKEN;
    const figlio = spawn(process.execPath, ['server.mjs'], { cwd: RADICE, windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'], env });
    servers.push(figlio);
    let uscita = '';
    figlio.stdout.on('data', (c) => { uscita += c; });
    figlio.stderr.on('data', (c) => { uscita += c; });
    figlio.stdin.end(stdinTesto);
    for (let i = 0; i < 300 && figlio.exitCode === null; i += 1) { if (/Harness UI disponibile/u.test(uscita)) break; await delay(100); }
    if (figlio.exitCode !== null) return { partito: false, stato: null, uscita };
    const r = await fetch(`http://127.0.0.1:${porta}/api/v1/sessions`); // nessun cookie, nessun token
    return { partito: true, stato: r.status, uscita };
  };

  const casi = [
    ['stdin vuoto (chi ospita ha dimenticato di scriverlo)', ''],
    ['nome del token sbagliato di una lettera', 'TALOS_HARNESS_UI_TOKN=tok-di-prova-lungo-almeno-trentadue-caratteri-0001\n'],
  ];
  const aperti = [];
  for (const [nome, testo] of casi) {
    const esito = await prova(testo);
    if (esito.partito && esito.stato === 200) aperti.push(nome);
  }
  assert.deepEqual(aperti, [], `the server started with no token and /api answered 200 without a cookie for: ${aperti.join(' · ')}`);
});
