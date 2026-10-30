/*
 * 29/10/2026 — UN SERVER CHE NON PARTE DEVE USCIRE. Misurato sul 4174: cinque avvii falliti con «Port 4174 is already in use» erano
 * ancora vivi ore dopo (pid avviati alle 08:31, 08:33, 09:28, 10:04, 11:03), perché `server.mjs` metteva solo `process.exitCode = 1`
 * e i timer e le sorveglianze già aperti tenevano vivo il processo. Ora esce, dopo aver scritto il motivo: l'uscita parte dal
 * richiamo di una scrittura su stderr (le scritture precedenti sono già passate), con un timer di riserva che non tiene vivo niente
 * (doc Node «A note on process I/O»: su Unix le pipe sono asincrone, `process.exit()` può troncare).
 */
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { createServer } from 'node:net';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

import { cartellaDiProva } from './aiuto/cartelle-di-prova.mjs';

const RADICE = fileURLToPath(new URL('..', import.meta.url));

test('AVVIO-FALLITO-ESCE-01 — sulla porta già presa il server dice perché ed ESCE con codice 1, non resta vivo', async (t) => {
  const occupante = createServer((s) => s.destroy());
  await new Promise((fatto) => occupante.listen(0, '127.0.0.1', fatto));
  t.after(() => new Promise((fatto) => occupante.close(fatto)));
  const porta = occupante.address().port;

  const radice = cartellaDiProva('talos-avvio-fallito-');
  const temp = join(radice, 'temp');
  mkdirSync(temp, { recursive: true });
  mkdirSync(join(radice, 'workspace'), { recursive: true });
  const env = {
    ...process.env,
    TALOS_HARNESS_UI_HOST: '127.0.0.1', TALOS_HARNESS_UI_PORT: String(porta), TALOS_HARNESS_UI_TOKEN: '',
    TALOS_HARNESS_UI_PROJECT_DIRS: join(radice, 'workspace'), TALOS_HARNESS_UI_SESSIONS_DIR: join(radice, 'sessions'),
    TALOS_DESKTOP_DATA_DIR: join(radice, 'desktop'), TALOS_HARNESS_UI_KEYRING: 'memoria', TALOS_HARNESS_UI_KEYRING_SCOPE: '', TALOS_SCRATCH_DIR: join(radice, 'scratch'),
    TEMP: temp, TMP: temp, TMPDIR: temp,
  };
  const figlio = spawn(process.execPath, ['server.mjs'], { cwd: RADICE, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'], env });
  t.after(() => { if (figlio.exitCode === null) figlio.kill(); });
  let errore = '';
  figlio.stderr.on('data', (c) => { errore += c; });
  figlio.stdout.resume();
  const codice = await new Promise((fatto) => {
    const tetto = setTimeout(() => fatto('ANCORA VIVO dopo 30 s'), 30_000);
    figlio.on('exit', (c) => { clearTimeout(tetto); fatto(c); });
  });
  assert.equal(codice, 1, `il server deve uscire: ${errore.slice(-800)}`);
  assert.match(errore, /Harness UI non avviabile/u);
  assert.match(errore, new RegExp(`Port ${porta} is already in use`, 'u'), 'il motivo arriva intero prima dell\'uscita');
});
