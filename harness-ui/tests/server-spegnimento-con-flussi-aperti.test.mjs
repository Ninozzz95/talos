/*
 * ⭐ 24/09/2026 — IL SERVER VERO IN UN PROCESSO FIGLIO: lo stop gentile con un flusso SSE aperto, e il Doctor che dice come
 * il negozio pubblica l'intestazione.
 *
 * 1) Segnalato dalla lane mobile (stesso difetto curato sul telefono, commit 6d289ad2e del ramo mobile), riaccertato qui nel
 *    codice: lo shutdown di `server.mjs` finiva con `server.close(() => process.exit(0))`. Documentazione di Node
 *    (nodejs.org/api/http.html, letta il 24/09/2026): `server.close()` «closes all connections connected to this server which
 *    are not sending a request or waiting for a response» — un flusso `/api/v1/sessions/:id/events` è una risposta che non
 *    finisce mai, quindi la callback non arriva: il processo smette di ascoltare e resta vivo. `closeAllConnections()`
 *    (v18.2.0) chiude anche quelle, ed è raccomandata DOPO `close()`. Sul desktop Windows il difetto è raggiungibile senza
 *    segnali: lo stop gentile del 4174 (F3) passa dalla rotta `POST /api/v1/admin/shutdown` col gettone, che chiama la stessa
 *    funzione, e con la chat dell'owner aperta nel browser c'è sempre un flusso aperto.
 * 2) La voce `negozioSessioni` del Doctor (commit 34e78a9d4) esisteva ma `server.mjs` non gliela passava: il Doctor vero non la
 *    mostrava mai. Si prova sul server vero, non sulla funzione.
 *
 * Ermetiche: server figlio su una porta libera, cartella dati temporanea, custodia delle chiavi in memoria, nessun modello
 * (la sessione è una conclusa, scritta a mano nel journal prima dell'avvio).
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { mkdtemp, mkdir, writeFile, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomBytes } from 'node:crypto';
import { rimuoviCartellaDiProvaAttesa } from './aiuto/rimuovi-cartella-di-prova.mjs';

const root = resolve(fileURLToPath(new URL('../', import.meta.url)));
const attendi = (ms) => new Promise((ok) => setTimeout(ok, ms));
async function portaLibera() {
  const s = createServer();
  await new Promise((ok) => s.listen(0, '127.0.0.1', ok));
  const { port } = s.address();
  await new Promise((ok) => s.close(ok));
  return port;
}

/** Avvia `server.mjs` in un figlio con una sessione conclusa già nel journal; torna quando risponde. */
async function avviaServerFiglio(t, prefisso) {
  const cartella = await mkdtemp(join(tmpdir(), prefisso));
  const workspace = join(cartella, 'workspace');
  await mkdir(workspace);
  const porta = await portaLibera();
  const token = randomBytes(24).toString('hex');
  const sessionId = 'sessione-conclusa';
  await writeFile(join(cartella, `${sessionId}.jsonl`), [
    { tipo: 'intestazione', sessionId, taskId: 'fixture', cartella: workspace, task: { consegna: 'ciao' }, modello: 'fixture/no-inference', avviataAlle: '2026-09-24T09:00:00.000Z' },
    { type: 'RunStarted', _sequenza: 1 },
    { tipo: 'messaggi-finali', versioneGiro: 1, messaggiFinali: [{ role: 'user', content: 'ciao' }, { role: 'assistant', content: 'ciao a te' }] },
    { type: 'RunFinished', _sequenza: 2 },
  ].map((r) => JSON.stringify(r)).join('\n') + '\n');
  const origine = `http://127.0.0.1:${porta}`;
  const headers = { Cookie: `talos_token=${token}` };
  const figlio = spawn(process.execPath, ['server.mjs'], { cwd: root, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'], env: {
    ...process.env, TALOS_HARNESS_UI_PORT: String(porta), TALOS_HARNESS_UI_TOKEN: token,
    TALOS_HARNESS_UI_KEYRING: 'memoria', TALOS_SCRATCH_DIR: join(cartella, 'scratch'),
    TALOS_HARNESS_UI_SESSIONS_DIR: cartella, TALOS_HARNESS_UI_PROJECT_DIRS: workspace,
    TALOS_HARNESS_UI_WORKFLOW_DIR: join(cartella, 'workflows'),
  } });
  const stato = { uscito: null, log: '' };
  const uscita = new Promise((ok) => figlio.once('exit', (code, signal) => { stato.uscito = { code, signal }; ok(stato.uscito); }));
  figlio.stdout.on('data', (d) => { stato.log += d; });
  figlio.stderr.on('data', (d) => { stato.log += d; });
  t.after(async () => {
    if (stato.uscito === null) { figlio.kill(); await uscita; }
    await rimuoviCartellaDiProvaAttesa(cartella); // BC-09: coi ritentativi che Windows vuole, DOPO l'uscita del server figlio
  });
  let pronto = false;
  for (let i = 0; i < 200 && !pronto; i += 1) {
    if (stato.uscito) throw new Error(`il server è uscito prima di essere pronto (${stato.uscito.code}):\n${stato.log.slice(-2000)}`);
    try { pronto = (await fetch(`${origine}/api/v1/health`, { headers, signal: AbortSignal.timeout(500) })).ok; } catch { await attendi(100); }
  }
  assert.ok(pronto, `il server figlio non è diventato pronto:\n${stato.log.slice(-2000)}`);
  return { cartella, origine, headers, sessionId, uscita, stato };
}

test('SERVER-SHUTDOWN-WITH-OPEN-SSE — lo stop gentile col gettone fa USCIRE il processo anche con un flusso di eventi aperto', { timeout: 60_000 }, async (t) => {
  const { cartella, origine, headers, sessionId, uscita, stato } = await avviaServerFiglio(t, 'tspg-');

  // il flusso resta APERTO: si legge il primo pezzo e non si chiude
  const flusso = await fetch(`${origine}/api/v1/sessions/${sessionId}/events`, { headers });
  assert.equal(flusso.status, 200, 'il flusso degli eventi della sessione si apre');
  assert.match(flusso.headers.get('content-type') || '', /text\/event-stream/);
  const lettore = flusso.body.getReader();
  const primo = await lettore.read();
  assert.equal(primo.done, false, 'il flusso consegna il ripasso e resta aperto');
  t.after(() => lettore.cancel().catch(() => {}));

  const gettone = (await readFile(join(cartella, '.spegnimento-gettone'), 'utf8')).trim();
  const risposta = await fetch(`${origine}/api/v1/admin/shutdown`, { method: 'POST', headers: { ...headers, 'x-talos-shutdown-token': gettone } });
  assert.equal(risposta.status, 202, 'lo stop gentile è accettato');

  const esito = await Promise.race([uscita, attendi(6_000).then(() => 'appeso')]);
  assert.notEqual(esito, 'appeso', `con un flusso SSE aperto il processo non è uscito entro 6 s (server.close aspetta una risposta che non finisce):\n${stato.log.slice(-1500)}`);
  assert.equal(esito.code, 0, `uscita pulita attesa, avuto ${JSON.stringify(esito)}:\n${stato.log.slice(-1500)}`);
});

test('SERVER-DOCTOR-SESSION-STORE — il Doctor del server vero dice come il negozio pubblica l’intestazione, e in quale cartella', { timeout: 90_000 }, async (t) => {
  const { cartella, origine, headers } = await avviaServerFiglio(t, 'tdoc-');
  const risposta = await fetch(`${origine}/api/v1/doctor`, { headers, signal: AbortSignal.timeout(60_000) });
  assert.equal(risposta.status, 200);
  const corpo = await risposta.json();
  const voce = corpo?.data?.negozioSessioni;
  assert.ok(voce && typeof voce === 'object', `il Doctor porta la voce negozioSessioni: ${JSON.stringify(Object.keys(corpo?.data ?? {}))}`);
  assert.equal(voce.cartella, cartella, 'la cartella è quella delle sessioni di QUESTO server');
  assert.ok([null, 'link', 'senza-link'].includes(voce.modalitaIntestazione), `modalità ammessa: ${voce.modalitaIntestazione}`);
  assert.equal(typeof voce.dettaglio, 'string');
});
