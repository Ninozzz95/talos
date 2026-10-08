/*
 * ⛔⛔ 08/10/2026 (bugfixer; owner: «sì, dentro la 0.1.24») — NOTE, ATTIVITÀ E MEMORIA SCRITTE DALLA PERSONA FINIVANO NELLA
 *   CARTELLA DEL CODICE. Dal 12/09 (R-02, `5c3cb15cd`) `server.mjs` dava le tre cartelle dentro TALOS_DESKTOP_DATA_DIR solo al
 *   registro (elenchi, attrezzi del modello); le porte di scrittura della persona (`magazziniDellaPersona`, http-app.mjs) restavano
 *   sul loro default accanto al codice. Senza la cartella dati le due coincidono (4174, sorgente); nell'app installata no.
 *   Misurato prima della cura, cartella dati impostata: POST di una nota → 201, la nota si legge per id, l'ELENCO dice 0, e il
 *   file sta in harness-ui/.notes-store — dove un aggiornamento che sostituisce il codice lo cancella.
 * ⇒ La prova avvia il `server.mjs` VERO con una cartella dati propria, scrive dalla porta della persona e controlla tre cose:
 *   l'elenco la vede, il file sta nella cartella dati, e nella cartella del codice non è arrivato niente.
 */
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync } from 'node:fs';
import { createServer } from 'node:http';
import { createServer as creaServerTcp } from 'node:net';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { cartellaDiProva } from './aiuto/cartelle-di-prova.mjs';

const RADICE = fileURLToPath(new URL('..', import.meta.url));
const ARCHIVI = [['notes', '.notes-store', { titolo: 'Nota della persona', contenuto: 'dove finisco?' }, 'note'],
  ['tasks', '.tasks-store', { titolo: 'Attività della persona' }, 'attivita'],
  ['memory', '.memory-store', { titolo: 'Ricordo della persona', contenuto: 'preferisco il tema scuro' }, 'memorie']];
const fileJson = (cartella) => (existsSync(cartella) ? readdirSync(cartella).filter((f) => f.endsWith('.json')) : []);

async function portaLibera() {
  const s = creaServerTcp();
  await new Promise((fatto) => s.listen(0, '127.0.0.1', fatto));
  const { port } = s.address();
  await new Promise((fatto) => s.close(fatto));
  return port;
}

/* Un motore compatibile OpenAI che risponde «ok» a ogni giro: serve solo a far nascere e finire una sessione vera. */
async function motoreFinto(t) {
  const server = createServer((req, res) => {
    req.resume();
    req.on('end', () => {
      res.writeHead(200, { 'Content-Type': 'text/event-stream' });
      res.end(`data: ${JSON.stringify({ choices: [{ index: 0, delta: { role: 'assistant', content: 'ok' } }] })}\n\n`
        + `data: ${JSON.stringify({ choices: [{ index: 0, delta: {}, finish_reason: 'stop' }], usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 } })}\n\n`
        + 'data: [DONE]\n\n');
    });
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  t.after(() => new Promise((r) => server.close(r)));
  return server.address().port;
}

test('ARCHIVI-PERSONALI-01 — con la cartella dati impostata, ciò che scrive la persona sta nella cartella dati e l\'elenco lo vede', async (t) => {
  const radice = cartellaDiProva('talos-archivi-personali-');
  const dati = join(radice, 'desktop');
  const temp = join(radice, 'temp');
  for (const d of [temp, join(radice, 'workspace'), dati]) mkdirSync(d, { recursive: true });
  const primaNelCodice = Object.fromEntries(ARCHIVI.map(([, cartella]) => [cartella, fileJson(join(RADICE, cartella))]));
  const porta = await portaLibera();
  const motore = await motoreFinto(t);
  const figlio = spawn(process.execPath, ['server.mjs'], {
    cwd: RADICE, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'],
    env: {
      ...process.env,
      TALOS_HARNESS_UI_HOST: '127.0.0.1', TALOS_HARNESS_UI_PORT: String(porta), TALOS_HARNESS_UI_TOKEN: '',
      TALOS_HARNESS_UI_PROJECT_DIRS: join(radice, 'workspace'), TALOS_HARNESS_UI_SESSIONS_DIR: join(radice, 'sessions'),
      TALOS_HARNESS_UI_WORKFLOW_DIR: join(radice, 'workflow'),
      TALOS_DESKTOP_DATA_DIR: dati, TALOS_HARNESS_UI_KEYRING: 'memoria', TALOS_HARNESS_UI_KEYRING_SCOPE: '', TALOS_SCRATCH_DIR: join(radice, 'scratch'),
      LMSTUDIO_BASE_URL: `http://127.0.0.1:${motore}`,
      TEMP: temp, TMP: temp, TMPDIR: temp,
    },
  });
  t.after(() => { figlio.kill(); });
  let coda = '';
  for (const flusso of [figlio.stdout, figlio.stderr]) flusso.on('data', (c) => { coda = (coda + c).slice(-3000); });
  const base = `http://127.0.0.1:${porta}`;
  const H = { 'Content-Type': 'application/json', Origin: base };
  let pronto = false;
  for (let i = 0; i < 150 && figlio.exitCode === null; i += 1) {
    try { if ((await fetch(`${base}/api/v1/health`, { signal: AbortSignal.timeout(300) })).ok) { pronto = true; break; } } catch {}
    await delay(100);
  }
  assert.ok(pronto, `il server non è partito: ${coda}`);
  const nata = await (await fetch(`${base}/api/v1/sessions/custom`, { method: 'POST', headers: H,
    body: JSON.stringify({ cartellaLibera: join(radice, 'workspace'), consegna: 'Rispondi solo: ok.', modello: 'lmstudio:finto', client: 'desktop', permessi: 'Full access' }) })).json();
  const id = nata?.data?.sessionId;
  assert.ok(id, `sessione non creata: ${JSON.stringify(nata).slice(0, 300)} ${coda}`);
  for (const [risorsa, cartella, corpo, campo] of ARCHIVI) {
    const scritta = await fetch(`${base}/api/v1/sessions/${id}/${risorsa}`, { method: 'POST', headers: H, body: JSON.stringify(corpo) });
    assert.equal(scritta.status, 201, `${risorsa}: la porta della persona scrive`);
    const elenco = await (await fetch(`${base}/api/v1/sessions/${id}/${risorsa}`)).json();
    assert.equal(elenco.data[campo]?.length, 1, `${risorsa}: l'elenco (registro e attrezzi del modello) vede ciò che la persona ha scritto`);
    assert.equal(fileJson(join(dati, cartella)).length, 1, `${risorsa}: il file sta nella cartella dati`);
    assert.deepEqual(fileJson(join(RADICE, cartella)), primaNelCodice[cartella], `${risorsa}: nella cartella del codice non arriva niente`);
  }
});
