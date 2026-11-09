/*
 * «Gettone sempre» (owner 02/11/2026): la suite del browser gira col gettone, come l'app vera. `playwright.config.mjs` fa un gettone per corsa e questo
 * script, nato dal `webServer` di Playwright, lo passa al server dallo stdin: è l'unica via che il server accetta, e `webServer.env` non ha uno stdin.
 *
 * ⛔ Il segnale di pronto è una riga sullo stdout e non `webServer.url`: Playwright prende un 401 per «risponde», e il server risponde 401 da subito, PRIMA di
 *   aver finito di ripristinare le sessioni. Qui si chiede la salute COL cookie, e la riga esce solo a 200: la stessa garanzia di prima.
 */
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

export const RIGA_DI_PRONTO = 'TALOS-SERVER-DI-PROVA-PRONTO';

const gettone = process.env.TALOS_PW_GETTONE;
const porta = process.env.TALOS_HARNESS_UI_PORT;
if (!gettone || !porta) { console.error('TALOS_PW_GETTONE and TALOS_HARNESS_UI_PORT are required'); process.exit(2); }

const ambiente = { ...process.env, TALOS_HARNESS_UI_SEGRETI_DA: 'stdin', TALOS_HARNESS_UI_KEYRING: 'memoria', TALOS_SCRATCH_DIR: process.env.TALOS_SCRATCH_DIR ?? '' }; // mai la custodia vera, mai la radice vera dei temporanei
delete ambiente.TALOS_PW_GETTONE; // i figli del server non lo devono ereditare
delete ambiente.TALOS_HARNESS_UI_TOKEN;

const figlio = spawn(process.execPath, ['server.mjs'], { cwd: fileURLToPath(new URL('../../', import.meta.url)), env: ambiente, stdio: ['pipe', 'inherit', 'inherit'], windowsHide: true });
figlio.stdin.end(`TALOS_HARNESS_UI_TOKEN=${gettone}\n`);
figlio.once('exit', (codice) => process.exit(codice ?? 1));

for (;;) {
  const stato = await fetch(`http://127.0.0.1:${porta}/api/v1/health`, { headers: { cookie: `talos_token=${gettone}` }, signal: AbortSignal.timeout(1000) }).then((r) => r.status).catch(() => 0);
  if (stato === 200) { console.log(RIGA_DI_PRONTO); break; }
  await new Promise((ok) => { setTimeout(ok, 100); });
}
