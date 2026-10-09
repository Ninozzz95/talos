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
/* `cartellaCondivisa`: due server sulla STESSA cartella dati, come il 4174 e l'app installata dal 07/10 (`%APPDATA%\TALOS\sessions`). */
async function avviaServerFiglio(t, prefisso, { cartellaCondivisa = null } = {}) {
  const cartella = cartellaCondivisa ?? await mkdtemp(join(tmpdir(), prefisso));
  const workspace = join(cartella, 'workspace');
  await mkdir(workspace, { recursive: true });
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
    TALOS_DESKTOP_DATA_DIR: join(cartella, 'desktop'), // 01/10/2026: mai le cartelle dati di default (sono quelle del 4174 vivo: memorie, note, Forge, archivio output, modelli)
  } });
  const stato = { uscito: null, log: '' };
  const uscita = new Promise((ok) => figlio.once('exit', (code, signal) => { stato.uscito = { code, signal }; ok(stato.uscito); }));
  figlio.stdout.on('data', (d) => { stato.log += d; });
  figlio.stderr.on('data', (d) => { stato.log += d; });
  t.after(async () => {
    if (stato.uscito === null) { figlio.kill(); await uscita; }
    if (!cartellaCondivisa) await rimuoviCartellaDiProvaAttesa(cartella); // BC-09: coi ritentativi che Windows vuole, DOPO l'uscita del server figlio (la condivisa la toglie chi l'ha creata)
  });
  let pronto = false;
  for (let i = 0; i < 200 && !pronto; i += 1) {
    if (stato.uscito) throw new Error(`il server è uscito prima di essere pronto (${stato.uscito.code}):\n${stato.log.slice(-2000)}`);
    try { pronto = (await fetch(`${origine}/api/v1/health`, { headers, signal: AbortSignal.timeout(500) })).ok; } catch { await attendi(100); }
  }
  assert.ok(pronto, `il server figlio non è diventato pronto:\n${stato.log.slice(-2000)}`);
  /* `ferma`: per chi deve fermare i server PRIMA di togliere una cartella condivisa (su Windows un file aperto non si cancella). */
  const ferma = async () => { if (stato.uscito === null) { figlio.kill(); await uscita; } };
  return { cartella, porta, origine, headers, sessionId, uscita, stato, ferma };
}

test('SERVER-SHUTDOWN-WITH-OPEN-SSE — lo stop gentile col gettone fa USCIRE il processo anche con un flusso di eventi aperto', { timeout: 60_000 }, async (t) => {
  const { cartella, porta, origine, headers, sessionId, uscita, stato } = await avviaServerFiglio(t, 'tspg-');

  // il flusso resta APERTO: si legge il primo pezzo e non si chiude
  const flusso = await fetch(`${origine}/api/v1/sessions/${sessionId}/events`, { headers });
  assert.equal(flusso.status, 200, 'il flusso degli eventi della sessione si apre');
  assert.match(flusso.headers.get('content-type') || '', /text\/event-stream/);
  const lettore = flusso.body.getReader();
  const primo = await lettore.read();
  assert.equal(primo.done, false, 'il flusso consegna il ripasso e resta aperto');
  t.after(() => lettore.cancel().catch(() => {}));

  const gettone = (await readFile(join(cartella, `.spegnimento-gettone-${porta}`), 'utf8')).trim(); // 09/10: un file per porta
  const risposta = await fetch(`${origine}/api/v1/admin/shutdown`, { method: 'POST', headers: { ...headers, 'x-talos-shutdown-token': gettone } });
  assert.equal(risposta.status, 202, 'lo stop gentile è accettato');

  const esito = await Promise.race([uscita, attendi(6_000).then(() => 'appeso')]);
  assert.notEqual(esito, 'appeso', `con un flusso SSE aperto il processo non è uscito entro 6 s (server.close aspetta una risposta che non finisce):\n${stato.log.slice(-1500)}`);
  assert.equal(esito.code, 0, `uscita pulita attesa, avuto ${JSON.stringify(esito)}:\n${stato.log.slice(-1500)}`);
});

/*
 * ⛔⛔ 09/10/2026 (bugfixer) — DUE SERVER SULLA STESSA CARTELLA, come il 4174 e l'app installata dal 07/10. Col nome unico il
 *   secondo sovrascriveva il gettone del primo: riprodotto su questa porta di prova prima della cura (file cambiato, stop
 *   gentile verso il primo = 401), e visto dal vivo sul 4174 il 09/10 alle 00:22, finito con `-Force`.
 *   Ora ognuno ha il SUO file (`.spegnimento-gettone-<porta>`): il gettone del primo ferma il primo e il secondo resta vivo;
 *   AL CONTRARIO, il gettone dell'altro viene rifiutato.
 */
test('SERVER-SHUTDOWN-GETTONE-PER-PORTA — due server sulla stessa cartella non si rubano il gettone', { timeout: 120_000 }, async (t) => {
  const condivisa = await mkdtemp(join(tmpdir(), 'tgpp-'));
  try {
    const a = await avviaServerFiglio(t, 'tgpp-', { cartellaCondivisa: condivisa });
    const b = await avviaServerFiglio(t, 'tgpp-', { cartellaCondivisa: condivisa });
    try {
      const gettoneDi = async (x) => (await readFile(join(condivisa, `.spegnimento-gettone-${x.porta}`), 'utf8')).trim();
      const [ga, gb] = [await gettoneDi(a), await gettoneDi(b)];
      assert.notEqual(ga, gb, 'due server, due gettoni');
      const spegni = (x, gettone) => fetch(`${x.origine}/api/v1/admin/shutdown`, { method: 'POST', headers: { ...x.headers, 'x-talos-shutdown-token': gettone } });
      assert.equal((await spegni(a, gb)).status, 401, 'AL CONTRARIO: il gettone dell\'altro server è rifiutato');
      assert.equal((await spegni(a, ga)).status, 202, 'il gettone del PRIMO, letto dopo l\'avvio del secondo, ferma il primo');
      const esito = await Promise.race([a.uscita, attendi(6_000).then(() => 'appeso')]);
      assert.notEqual(esito, 'appeso', `il primo non è uscito:\n${a.stato.log.slice(-1500)}`);
      assert.equal(esito.code, 0);
      assert.ok((await fetch(`${b.origine}/api/v1/health`, { headers: b.headers })).ok, 'il secondo resta vivo');
      /* Seguito del 09/10 (review di «talos desktop»): chi si spegne gentile toglie il SUO file, come Jupyter il suo
         `jpserver-<pid>.json` — e solo il suo. */
      const esiste = (x) => readFile(join(condivisa, `.spegnimento-gettone-${x.porta}`), 'utf8').then((s) => s, () => null);
      assert.equal(await esiste(a), null, 'spento gentile, il primo ha tolto il suo file');
      assert.equal(await esiste(b), gb, 'il file del secondo resta, col suo gettone');
      /* AL CONTRARIO: se il file della porta porta un gettone che NON è il suo (un altro server, dopo), non lo tocca. */
      await writeFile(join(condivisa, `.spegnimento-gettone-${b.porta}`), 'di-un-altro-server', 'utf8');
      assert.equal((await spegni(b, gb)).status, 202, 'e il suo gettone è ancora il suo');
      await Promise.race([b.uscita, attendi(6_000)]);
      assert.equal(await esiste(b), 'di-un-altro-server', 'un file che non porta il suo gettone resta dov\'è');
    } finally {
      await b.ferma();
      await a.ferma();
    }
  } finally {
    await rimuoviCartellaDiProvaAttesa(condivisa); // dopo l'uscita di ENTRAMBI: su Windows un file aperto non si cancella
  }
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
