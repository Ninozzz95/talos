/*
 * ⛔⛔⛔ P0 · CORSIA D — NESSUN TETTO ALLA DURATA DEL RAGIONAMENTO.
 *
 * Owner, punto 7 della Fase P0: «nessun limite arbitrario alla durata del ragionamento».
 * È la stessa lezione già scritta per i GIRI (`giri-senza-tetto.test.mjs`, 11/09/2026: «avevamo
 * detto che non c'erano limiti e doveva essere così»), applicata al TEMPO invece che al conteggio.
 *
 * ## I tetti che c'erano, misurati il 16/09/2026 prima di toccare una riga
 *
 *  1. `src/kernel/talosHarness.mjs` — `AbortSignal.timeout(180_000)` sulla fetch di OGNI giro,
 *     streaming compreso: una DEADLINE TOTALE, non un'inattività.
 *  2. `src/runtime-owner-adapter.mjs` `rete()` — `AbortSignal.timeout(timeoutSeconds * 1000)`,
 *     default 60 s: anch'essa deadline TOTALE. Verso OpenRouter non mordeva (il trasporto
 *     resiliente scarta `init.signal` e tiene solo l'inattività); verso TUTTI gli altri —
 *     deepseek, z.ai, openai, cloud, e il motore LOCALE — mordeva eccome.
 *  3. `undici` sotto `fetch`: `headersTimeout` e `bodyTimeout` a 300 s DI SERIE, mai alzati.
 *
 * ⇒ Un modello locale o non-OpenRouter che ragiona più di 60 s veniva tagliato MENTRE STAVA
 *   EMETTENDO TOKEN. Non è una protezione: è la stessa forma del tetto sui giri — il primo a
 *   incontrarla è il compito lungo ma SANO.
 *
 * ## Cosa resta, e perché
 *
 * Non «niente limiti»: UN limite, e di natura diversa. Un tetto di DURATA punisce chi lavora; un
 * tetto di INATTIVITÀ punisce solo chi è morto. È la stessa scelta dello stato dell'arte —
 * Codex ha `stream_idle_timeout_ms` (DEFAULT_STREAM_IDLE_TIMEOUT_MS = 300_000,
 * codex-rs/model-provider-info), un'inattività, non un muro; e l'issue openai/codex#39771
 * («High-reasoning Responses idle timeout is a false dead-stream: model resumed after 8.5 min of
 * no text frames», letta il 16/09/2026) dice che perfino 5 minuti sono TROPPO POCHI quando il
 * ragionamento è alto. Da lì il nostro default di 30 minuti.
 *
 * ⛔ Ogni prova qui sotto gira anche AL CONTRARIO: c'è il caso che deve passare E quello che deve
 *   essere fermato, perché un failsafe che non ferma mai nessuno non è un failsafe.
 */

import assert from 'node:assert/strict';
import test from 'node:test';
import { createServer } from 'node:http';
import { once } from 'node:events';

import { chiamaConRitenta } from '../src/kernel/talosHarness.mjs';
import { creaFetchMultiProvider, creaFetchOpenRouterResiliente } from '../src/runtime-owner-adapter.mjs';
import { createProviderCredentialStore } from '../src/provider-credential-store.mjs';
import {
  INATTIVITA_GENERAZIONE_MS_PREDEFINITA,
  SilenzioDelFornitoreError,
  dispatcherDiGenerazione,
  leggiInattivitaGenerazioneMs,
  sorvegliaCorpoDiGenerazione,
  sorvegliaInattivita,
} from '../src/generation-idle.mjs';
import { createSseSession } from '../src/http-lifecycle.mjs';

/* ── il banco: un fornitore finto che decide QUANDO parlare e quando tacere ────────────────── */

/**
 * @param {object} t contesto del test, per la chiusura
 * @param {(req, res) => void} gestisci come rispondere
 */
async function fornitoreFinto(t, gestisci) {
  const richieste = [];
  const server = createServer(async (req, res) => {
    const pezzi = [];
    for await (const c of req) pezzi.push(c);
    richieste.push({ url: req.url, corpo: pezzi.length ? JSON.parse(Buffer.concat(pezzi)) : null });
    gestisci(req, res);
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const porta = server.address().port;
  /* ⛔ Le porte dell'owner non si toccano mai, nemmeno per sbaglio: 4174/4177/9333. */
  assert.equal([4174, 4177, 9333].includes(porta), false, 'porta riservata');
  t.after(() => new Promise(r => { server.closeAllConnections(); server.close(r); }));
  return { porta, richieste, base: `http://127.0.0.1:${porta}` };
}

/** Uno stream SSE che emette `quanti` delta a distanza di `passoMs`, poi chiude. */
function streamATempo(res, { quanti, passoMs, primoRitardoMs = 0, commentiInvece = false }) {
  res.writeHead(200, { 'Content-Type': 'text/event-stream; charset=utf-8', 'Cache-Control': 'no-store' });
  let emessi = 0;
  const passo = () => {
    if (res.writableEnded || res.destroyed) return;
    if (emessi >= quanti) {
      res.write('data: [DONE]\n\n');
      res.end();
      return;
    }
    emessi += 1;
    if (commentiInvece) res.write(': OPENROUTER PROCESSING\n\n');
    else res.write(`data: ${JSON.stringify({ choices: [{ delta: { content: `t${emessi} ` } }] })}\n\n`);
    setTimeout(passo, passoMs).unref();
  };
  setTimeout(passo, primoRitardoMs).unref();
}

/** Il negozio delle credenziali, in memoria, con il tempo del fornitore che serve al caso. */
function negozio(base, { timeoutSeconds = 60 } = {}) {
  const valori = new Map();
  const store = createProviderCredentialStore({
    env: { DEEPSEEK_API_KEY: 'finta-deepseek' },
    keyring: { get: (s, p) => valori.get(s + p) ?? null, set: (s, p, v) => valori.set(s + p, v), remove: (s, p) => valori.delete(s + p) },
  });
  store.setRuntime('deepseek', { endpoint: `${base}/deepseek`, timeoutSeconds });
  return store;
}

function fetchDelBanco(store) {
  return creaFetchMultiProvider(fetch, {
    providerStore: store,
    dipendenze: { leggiChiave: p => store.getKey(p), leggiRuntime: p => store.getRuntime(p) },
  });
}

const chiamata = (fetchDiRete, extra = {}) => chiamaConRitenta({
  modello: 'deepseek:deepseek-chat',
  chiave: 'finta',
  messaggi: [{ role: 'user', content: 'ragiona a lungo' }],
  attrezzi: [],
  tentativiMassimi: 1,
  dormi: async () => {},
  caso: () => 0,
  fetchDiRete,
  ...extra,
});

/* ══════════════════════════════════════════════════════════════════════════════════════════
 * 1 · IL TAGLIO — la prova che era rossa PRIMA della cura
 * ══════════════════════════════════════════════════════════════════════════════════════════ */

test('P0-D-01 · un fornitore non-OpenRouter che emette token oltre il tempo del fornitore ARRIVA IN FONDO', { timeout: 30_000 }, async t => {
  /*
   * ⛔ ROSSA PRIMA DELLA CURA. `timeoutSeconds: 5` è il minimo accettato dal negozio
   *   (MIN_TIMEOUT_SECONDS), e riproduce in 8 secondi ciò che il default di 60 s faceva a 90:
   *   la deadline TOTALE scatta mentre i token stanno ancora arrivando.
   *   Misurato il 16/09/2026 anche alla scala vera (60 s di tetto, token ogni 2 s per 90 s):
   *   vedi il rapporto della corsia.
   * ⭐ Il tempo del fornitore NON sparisce: cambia natura — è il tempo massimo alla PRIMA
   *   risposta. Qui la prima risposta arriva subito, quindi non ha niente da dire.
   */
  const b = await fornitoreFinto(t, (_req, res) => streamATempo(res, { quanti: 16, passoMs: 500 }));
  const store = negozio(b.base, { timeoutSeconds: 5 });
  const pezzi = [];
  const t0 = Date.now();
  const r = await chiamata(fetchDelBanco(store), { onDelta: d => pezzi.push(d) });
  const durata = Date.now() - t0;
  assert.equal(r.scelta.content, 't1 t2 t3 t4 t5 t6 t7 t8 t9 t10 t11 t12 t13 t14 t15 t16 ');
  assert.ok(durata > 5_000, `la generazione deve superare il tetto di 5 s per provare qualcosa (durata ${durata} ms)`);
  assert.equal(pezzi.length > 0, true);
});

test('P0-D-02 · il tempo del fornitore vale ancora sulla PRIMA risposta: fornitore muto, errore a 5 s', { timeout: 30_000 }, async t => {
  /*
   * ⛔ LA PROVA AL CONTRARIO del caso sopra: se togliessimo il tetto e basta, un fornitore che non
   *   risponde MAI terrebbe la sessione appesa per sempre. `timeoutSeconds` continua a mordere —
   *   ma solo PRIMA che arrivi la prima risposta, dove non può tagliare nessun ragionamento.
   */
  const b = await fornitoreFinto(t, (_req, res) => { /* nessun writeHead: silenzio totale */ void res; });
  const store = negozio(b.base, { timeoutSeconds: 5 });
  const t0 = Date.now();
  await assert.rejects(chiamata(fetchDelBanco(store)));
  const durata = Date.now() - t0;
  assert.ok(durata >= 4_500 && durata < 12_000, `deve fermarsi vicino ai 5 s, non al vecchio muro: ${durata} ms`);
});

/* ══════════════════════════════════════════════════════════════════════════════════════════
 * 2 · IL FAILSAFE DI INATTIVITÀ — uno solo, altissimo, dichiarato
 * ══════════════════════════════════════════════════════════════════════════════════════════ */

test('P0-D-03 · il failsafe è UNO, di 30 minuti, e si legge dall’ambiente', { timeout: 30_000 }, () => {
  assert.equal(INATTIVITA_GENERAZIONE_MS_PREDEFINITA, 1_800_000);
  assert.equal(leggiInattivitaGenerazioneMs({}), 1_800_000);
  assert.equal(leggiInattivitaGenerazioneMs({ TALOS_GENERATION_IDLE_MS: '600000' }), 600_000);
  /* ⛔ Valori impossibili non spengono la guardia in silenzio: si torna al default. */
  assert.equal(leggiInattivitaGenerazioneMs({ TALOS_GENERATION_IDLE_MS: 'ciao' }), 1_800_000);
  assert.equal(leggiInattivitaGenerazioneMs({ TALOS_GENERATION_IDLE_MS: '-1' }), 1_800_000);
  /* ⭐ Zero è l'unico modo DICHIARATO per spegnerlo: chi lo scrive sa cosa sta facendo. */
  assert.equal(leggiInattivitaGenerazioneMs({ TALOS_GENERATION_IDLE_MS: '0' }), 0);
});

test('P0-D-04 · dieci “minuti” di silenzio sotto il failsafe NON abortiscono nulla', { timeout: 30_000 }, async t => {
  /*
   * Il silenzio vero di dieci minuti non si aspetta: si misura sulla stessa unità che il codice
   * usa davvero (millisecondi), con il failsafe alzato in proporzione. Il rapporto fra i due —
   * silenzio molto sotto il limite — è ciò che la prova deve mordere, non la scala.
   */
  const b = await fornitoreFinto(t, (_req, res) => streamATempo(res, { quanti: 3, passoMs: 700 }));
  const store = negozio(b.base);
  const r = await chiamata(fetchDelBanco(store), { onDelta: () => {} });
  assert.equal(r.scelta.content, 't1 t2 t3 ');
});

test('P0-D-05 · failsafe scaduto: errore di SILENZIO, non “timeout di generazione”', { timeout: 30_000 }, async t => {
  const b = await fornitoreFinto(t, (_req, res) => streamATempo(res, { quanti: 40, passoMs: 4_000, primoRitardoMs: 0 }));
  const store = negozio(b.base);
  const fetchBanco = creaFetchMultiProvider(fetch, {
    providerStore: store,
    dipendenze: { leggiChiave: p => store.getKey(p), leggiRuntime: p => store.getRuntime(p) },
    inattivitaGenerazioneMs: 1_200, // il silenzio fra due token (4 s) lo supera
  });
  const errore = await chiamata(fetchBanco, { onDelta: () => {} }).then(() => null, e => e);
  assert.notEqual(errore, null, 'il failsafe deve fermare un fornitore che tace oltre il limite');
  const testo = `${errore?.code ?? ''} ${errore?.message ?? ''}`;
  assert.match(testo, /PROVIDER_SILENCE|Connessione con il fornitore interrotta|silenzio/i, testo);
  /* ⛔ E NON deve dire «timeout di generazione»: la causa è un canale morto, non un modello lento. */
  assert.equal(/timeout di generazione|tempo massimo di generazione/i.test(testo), false, testo);
  /*
   * ⛔⛔ 16/09/2026, giro di riparazione — QUESTA RIGA È CIÒ CHE MANCAVA ALLA PROVA.
   *
   * Fin qui la prova guardava la classe e la frase PUBBLICHE, e quelle sono identiche che a
   * fermare il silenzio sia il nostro guardiano o il `bodyTimeout` del trasporto: due cause
   * diverse, un esito identico ⇒ non poteva smentirmi. `causaDiTrasporto` porta fin quassù il NOME
   * dello strato che ha agito, e qui deve essere il NOSTRO — se torna `UND_ERR_BODY_TIMEOUT`
   * vuol dire che il failsafe è staccato e ci sta salvando undici.
   */
  assert.equal(errore?.causaDiTrasporto, 'PROVIDER_SILENCE', `a fermarlo deve essere il failsafe, non il trasporto: ${errore?.causaDiTrasporto}`);
});

test('P0-D-05-bis · è il NOSTRO guardiano a fermare il silenzio, e si vede dal codice', { timeout: 30_000 }, async () => {
  /*
   * ⛔⛔ QUESTA PROVA È NATA DA UN ERRORE MIO, il 16/09/2026, e vale più della cura.
   *   Rompendo il guardiano del flusso (una riga: `sorveglia` reso passante) `P0-D-05` è rimasta
   *   VERDE. Non perché la cura non servisse: perché a fermare il silenzio era stato il SECONDO
   *   strato, il `bodyTimeout` del dispatcher, che arriva 1,2× più tardi e produce un errore con
   *   la stessa classe pubblica (`rete`) e lo stesso messaggio. Due cause diverse, un esito
   *   identico ⇒ quella prova non poteva smentirmi, quindi non stava misurando il guardiano.
   * ⇒ Qui si guarda `sorvegliaCorpoDiGenerazione` DA SOLA, dove il codice dell'errore è ancora
   *   visibile e nessun dispatcher può coprirla. La difesa a due strati resta (ed è voluta): è la
   *   PROVA che doveva saperli distinguere.
   *
   * ⛔⛔ E NON BASTAVA: il controllore ha fatto notare che questa prova guarda l'UNITÀ, non
   *   l'AGGANCIO — rompendo la riga che attacca il guardiano ai fornitori questa restava verde.
   *   Aveva ragione, e misurando si è visto peggio: l'aggancio era **già inerte**. Le prove che
   *   coprono quel buco sono `P0-D-15`/`P0-D-16`/`P0-D-17`, in fondo al file. Questa resta perché
   *   è l'unica che isola il guardiano dal resto del mondo.
   * ⛔ Il `timeout` esplicito su OGNI prova di questo file nasce dallo stesso verdetto: in
   *   `node:test` il valore predefinito è **Infinity** (documentazione Node v24, letta il
   *   16/09/2026) ⇒ rompendo il guardiano il comando documentato APPENDEVA invece di fallire, e il
   *   rosso si vedeva solo aggiungendo `--test-timeout`. Un rosso che si vede solo con un flag non
   *   dichiarato non è un rosso.
   */
  let controlloStream;
  const corpo = new ReadableStream({ start(c) { controlloStream = c; c.enqueue(new TextEncoder().encode(': vivo\n\n')); } });
  const sorvegliata = sorvegliaCorpoDiGenerazione(new Response(corpo, { status: 200 }), { limiteMs: 300 });
  const lettore = sorvegliata.body.getReader();
  assert.equal(new TextDecoder().decode((await lettore.read()).value), ': vivo\n\n');
  const errore = await lettore.read().then(() => null, e => e);
  assert.notEqual(errore, null, 'il silenzio deve fermare la lettura');
  assert.equal(errore.code, 'PROVIDER_SILENCE', 'deve essere il NOSTRO guardiano, non un tetto di trasporto');
  assert.equal(errore.classe, 'rete');
  void controlloStream;

  /* AL CONTRARIO: finché arrivano byte — anche solo commenti — non si ferma niente. */
  let vivo;
  const corpoVivo = new ReadableStream({ start(c) { vivo = c; } });
  const sorvegliataViva = sorvegliaCorpoDiGenerazione(new Response(corpoVivo, { status: 200 }), { limiteMs: 300 });
  const lettoreVivo = sorvegliataViva.body.getReader();
  for (let i = 0; i < 5; i += 1) {
    setTimeout(() => vivo.enqueue(new TextEncoder().encode(': PROCESSING\n\n')), 150).unref();
    const { value } = await lettoreVivo.read();
    assert.equal(new TextDecoder().decode(value), ': PROCESSING\n\n');
  }
  vivo.close();
  assert.equal((await lettoreVivo.read()).done, true, '750 ms di soli commenti, con un limite di 300: nessuna interruzione');
});

test('P0-D-06 · l’errore di silenzio è della classe “connessione”, non “timeout del fornitore”', { timeout: 30_000 }, () => {
  const e = new SilenzioDelFornitoreError(1_800_000);
  assert.equal(e.code, 'PROVIDER_SILENCE');
  assert.equal(e.classe, 'rete');
  assert.equal(e.transitorio, true);
  assert.match(e.message, /connessione/i);
});

/* ══════════════════════════════════════════════════════════════════════════════════════════
 * 3 · I COMMENTI SSE SONO VITA
 * ══════════════════════════════════════════════════════════════════════════════════════════ */

test('P0-D-07 · i commenti SSE contano come vita: un fornitore che manda solo “: …” non è silenzio', { timeout: 30_000 }, async t => {
  /*
   * Fonte 16/09/2026 — OpenRouter, «Streaming»: durante l'elaborazione il canale porta commenti
   * SSE (`: OPENROUTER PROCESSING`) come keep-alive. Un failsafe che contasse solo i `data:` li
   * scarterebbe muti e ucciderebbe una connessione VIVA. Stessa forma del `sse_ping_interval` di
   * llama-server, che pinga mentre fa il prefill di un prompt lungo.
   */
  const b = await fornitoreFinto(t, (_req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/event-stream; charset=utf-8' });
    let n = 0;
    const passo = () => {
      if (res.writableEnded) return;
      n += 1;
      if (n <= 6) { res.write(': PROCESSING\n\n'); setTimeout(passo, 400).unref(); return; }
      res.write(`data: ${JSON.stringify({ choices: [{ delta: { content: 'finalmente' } }] })}\n\n`);
      res.write('data: [DONE]\n\n');
      res.end();
    };
    setTimeout(passo, 100).unref();
  });
  const store = negozio(b.base);
  const fetchBanco = creaFetchMultiProvider(fetch, {
    providerStore: store,
    dipendenze: { leggiChiave: p => store.getKey(p), leggiRuntime: p => store.getRuntime(p) },
    inattivitaGenerazioneMs: 1_200, // più corto dei 2,4 s di soli commenti: se i commenti non contassero, qui si morirebbe
  });
  const r = await chiamata(fetchBanco, { onDelta: () => {} });
  assert.equal(r.scelta.content, 'finalmente');
});

/* ══════════════════════════════════════════════════════════════════════════════════════════
 * 4 · LO STOP — la cosa da non rompere mai
 * ══════════════════════════════════════════════════════════════════════════════════════════ */

test('P0-D-08 · Stop su fornitore muto: chiude in meno di un secondo (via non-OpenRouter)', { timeout: 30_000 }, async t => {
  const b = await fornitoreFinto(t, (_req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/event-stream; charset=utf-8' });
    /* Nessun byte, mai. Solo lo stop può liberarci. */
  });
  const store = negozio(b.base);
  const controllore = new AbortController();
  setTimeout(() => controllore.abort(), 300).unref();
  const t0 = Date.now();
  await assert.rejects(chiamata(fetchDelBanco(store), { onDelta: () => {}, segnaleStop: controllore.signal }));
  const durata = Date.now() - t0;
  assert.ok(durata < 1_000, `lo stop deve chiudere subito, non dopo il failsafe: ${durata} ms`);
});

test('P0-D-09 · Stop su fornitore muto: chiude in meno di un secondo (via OpenRouter resiliente)', { timeout: 30_000 }, async t => {
  const b = await fornitoreFinto(t, (_req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/event-stream; charset=utf-8' });
  });
  const controllore = new AbortController();
  const resiliente = creaFetchOpenRouterResiliente(
    (url, init) => fetch(`${b.base}/openrouter`, init),
    { timeoutMsFn: () => 60_000, inattivitaMsFn: () => 1_800_000, userSignal: controllore.signal },
  );
  setTimeout(() => controllore.abort(), 300).unref();
  const t0 = Date.now();
  await assert.rejects(resiliente('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST', body: JSON.stringify({ model: 'z-ai/glm-5.3-flash', stream: true }),
  }));
  const durata = Date.now() - t0;
  assert.ok(durata < 1_000, `lo stop deve chiudere subito anche qui: ${durata} ms`);
});

/* ══════════════════════════════════════════════════════════════════════════════════════════
 * 5 · IL DISPATCHER undici — i 300 s taciti non esistono più
 * ══════════════════════════════════════════════════════════════════════════════════════════ */

test('P0-D-10 · il dispatcher di generazione esiste e porta i tetti chiesti', { timeout: 30_000 }, () => {
  const d = dispatcherDiGenerazione({ limiteMs: 1_800_000 });
  assert.notEqual(d, null, 'senza dispatcher resterebbero i 300 s di serie di undici, taciti');
  assert.equal(typeof d.dispatch, 'function');
});

test('P0-D-11 · con il dispatcher di generazione una risposta lenta negli HEADER non viene più abortita', { timeout: 30_000 }, async t => {
  /*
   * ⛔ Non si aspettano cinque minuti per provare i cinque minuti: si prova il MECCANISMO, con un
   *   tetto piccolo iniettato. Prima si dimostra che il tetto MORDE (altrimenti la prova non
   *   proverebbe niente: è la regola «una misura che non può smentirti non sta misurando»), poi
   *   che alzandolo NON morde più.
   */
  const RITARDO = 2_500;
  const b = await fornitoreFinto(t, (_req, res) => {
    setTimeout(() => { res.writeHead(200, { 'Content-Type': 'application/json' }); res.end('{}'); }, RITARDO).unref();
  });
  const stretto = dispatcherDiGenerazione({ limiteMs: 1_000 });
  const largo = dispatcherDiGenerazione({ limiteMs: 60_000 });
  t.after(async () => { await stretto?.close?.(); await largo?.close?.(); });

  const morde = await fetch(b.base, { dispatcher: stretto }).then(() => null, e => e.cause?.code ?? e.code);
  assert.equal(morde, 'UND_ERR_HEADERS_TIMEOUT', 'il tetto stretto DEVE mordere, altrimenti la prova è vuota');

  const risposta = await fetch(b.base, { dispatcher: largo });
  await risposta.text();
  assert.equal(risposta.status, 200);
});

/* ══════════════════════════════════════════════════════════════════════════════════════════
 * 6 · IL SOCKET DELLA ROTTA SSE — il battito deve bastare
 * ══════════════════════════════════════════════════════════════════════════════════════════ */

test('P0-D-12 · una sessione SSE col battito regge oltre il vecchio muro senza che Node chiuda il socket', { timeout: 30_000 }, async t => {
  /*
   * ⛔ Misurato il 16/09/2026 su Node v24.18.0 (script su file, non `node -e`):
   *     server.timeout = 0 · headersTimeout = 60000 · keepAliveTimeout = 5000 · requestTimeout = 300000
   *   `requestTimeout` a 300 s conta dal PRIMO byte della richiesta fino al completamento della
   *   RICHIESTA — non della risposta — quindi non tocca una risposta SSE lunga; ma `server.timeout`
   *   a 0 vuol dire «nessun guardiano sul socket», e nessuno di questi valori era DICHIARATO nel
   *   nostro `server.mjs`: erano quelli che capitavano.
   * ⭐ Qui si prova la cosa che conta per il prodotto: un battito ogni 15 s (INTERVALLO_BATTITO_SSE_MS)
   *   tiene il canale vivo ben oltre i tetti che un ragionamento lungo incontrerebbe. Il battito è
   *   accelerato per non fare durare la suite due minuti: ciò che si prova è che N battiti
   *   attraversano il confine, non l'orologio.
   */
  const battiti = [];
  const server = createServer((req, res) => {
    const sessione = createSseSession({ response: res, heartbeatMs: 120 });
    sessione.start();
    let n = 0;
    const timer = setInterval(() => { n += 1; if (n > 12) { sessione.close(); res.end(); clearInterval(timer); } }, 100);
    timer.unref();
    res.on('close', () => clearInterval(timer));
  });
  /* I tetti che la cura dichiara in server.mjs, applicati qui allo stesso modo. */
  server.timeout = 0;
  server.keepAliveTimeout = 72_000;
  server.headersTimeout = 75_000;
  server.requestTimeout = 300_000;
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => new Promise(r => { server.closeAllConnections(); server.close(r); }));

  const risposta = await fetch(`http://127.0.0.1:${server.address().port}/events`);
  const lettore = risposta.body.getReader();
  const decoder = new TextDecoder();
  let testo = '';
  while (true) {
    const { done, value } = await lettore.read();
    if (done) break;
    testo += decoder.decode(value, { stream: true });
    for (const riga of testo.split('\n\n')) if (riga.trim() === ':battito') battiti.push(riga);
  }
  assert.ok(testo.startsWith(':ok'), 'la sessione apre col suo saluto');
  assert.ok(testo.includes(':battito'), 'il battito attraversa il confine e tiene vivo il socket');
  assert.ok(testo.split(':battito').length - 1 >= 5, `almeno cinque battiti: ${testo.split(':battito').length - 1}`);
  assert.equal(battiti.length >= 5, true);
});

/* ══════════════════════════════════════════════════════════════════════════════════════════
 * 7 · IL CANCELLO — nessun tetto di durata torna dentro di nascosto
 * ══════════════════════════════════════════════════════════════════════════════════════════ */

test('P0-D-13 · la mina `createRequestLifecycle` non esiste più, e non deve tornare', { timeout: 30_000 }, async () => {
  /*
   * ⛔ Era una deadline di 30 s su ogni richiesta, senza un solo chiamante: pronta perché il primo
   *   che cercasse «lifecycle» per la rotta `/events` la cablasse, uccidendo ogni sessione SSE
   *   dopo mezzo minuto. Il cancello sta qui e non nella memoria di qualcuno: [[il-promemoria-dove-guarda-per-ultimo]].
   */
  const modulo = await import('../src/http-lifecycle.mjs');
  assert.equal('createRequestLifecycle' in modulo, false, 'la deadline senza chiamanti non si rimette: vedi il commento in http-lifecycle.mjs');
  assert.equal(modulo.TEMPI_SERVER_HTTP.timeout, 0, 'un socket con scadenza taglierebbe la chat mentre il modello pensa');
  assert.ok(modulo.TEMPI_SERVER_HTTP.headersTimeout > modulo.TEMPI_SERVER_HTTP.keepAliveTimeout);
});

test('P0-D-14 · nel kernel non resta nessuna deadline di durata sulla chiamata al modello', { timeout: 30_000 }, async () => {
  /*
   * ⛔ Una prova sul SORGENTE, non sul comportamento, perché il difetto è una riga che può tornare:
   *   è la stessa forma di `giri-senza-tetto.test.mjs`, che difende il tetto dei giri tolto l'11/09.
   * ⭐ AL CONTRARIO: si controlla anche che `segnaleStop` sia ancora lì — togliere il timeout
   *   portandosi via lo Stop sarebbe una cura peggiore del male.
   */
  const { readFile } = await import('node:fs/promises');
  const sorgente = await readFile(new URL('../src/kernel/talosHarness.mjs', import.meta.url), 'utf8');
  /*
   * ⛔ Si guarda il CODICE, non il testo: la prima versione di questo cancello è diventata rossa
   *   sul commento qui sopra, che il timeout lo NOMINA per spiegare perché non c'è più. Un filtro
   *   che riconosce la menzione invece della cosa accusa chi ha scritto la cura.
   */
  const codice = sorgente.split('\n').filter(r => !/^\s*(?:\/\/|\/?\*)/.test(r));
  const colpevoli = codice.filter(r => /AbortSignal\.timeout\(\s*180_000\s*\)/.test(r));
  assert.deepEqual(colpevoli, [], 'i 180 s sulla fetch del modello sono tornati nel codice');
  assert.match(sorgente, /signal: segnaleStop,/, 'lo Stop della persona deve restare collegato alla fetch');
  /* AL CONTRARIO: il filtro deve saper VEDERE la riga, o non starebbe misurando niente. */
  assert.equal([...codice, '            signal: AbortSignal.timeout(180_000),'].filter(r => /AbortSignal\.timeout\(\s*180_000\s*\)/.test(r)).length, 1);
});

/* ══════════════════════════════════════════════════════════════════════════════════════════
 * 8 · L'AGGANCIO — dove il failsafe si attacca al percorso vero
 *
 * ⛔⛔⛔ GIRO DI RIPARAZIONE, 16/09/2026. Il controllore della corsia ha rotto UNA riga
 *   (`runtime-owner-adapter.mjs`, l'aggancio: `destinazione.fonte === 'openrouter'` → `true`, cioè
 *   il guardiano non viene agganciato a NESSUN fornitore) e le quindici prove qui sopra sono
 *   rimaste tutte VERDI. Verdetto: «un test che resta verde con la cura rotta non morde».
 *
 * ⭐ Misurando per scrivere questo rosso ho trovato una cosa PEGGIORE di quella contestata, e
 *   nessuno dei due l'aveva vista: l'aggancio non era «non provato», era **INERTE**. La riga
 *   diceva `sorveglia(conCacheDichiarata(await fetch(...)))` e `conCacheDichiarata` è `async` ⇒
 *   `sorveglia` riceveva una **Promise**, non una `Response`; `sorvegliaCorpoDiGenerazione` non
 *   trova `.body` su una Promise e restituisce l'oggetto **intatto**, senza protestare. Quindi su
 *   deepseek / z.ai / openai e su tutto il percorso cloud il guardiano non era mai stato attaccato
 *   a niente — in streaming e non — e a fermare il silenzio era sempre e solo il `bodyTimeout` del
 *   dispatcher, 1,2× più tardi. Misurato il 16/09/2026: silenzio fermato a **1506 ms** con failsafe
 *   a 1200 (cioè 1,2 × 1200 = il trasporto), e **MAI** togliendo il dispatcher (sonda appesa a 40 s).
 *
 * ⇒ Ecco perché rompere `sorveglia` non muoveva nessun verde: era già rotto. Le prove qui sotto
 *   guardano l'AGGANCIO, non l'unità, e sanno DIRE QUALE STRATO ha fermato — per nome
 *   (`PROVIDER_SILENCE` contro `UND_ERR_BODY_TIMEOUT`) e per tempo (1,0× contro 1,2×).
 *
 * ⛔ E ogni prova qui sotto porta il suo `timeout`: in `node:test` il valore predefinito è
 *   **Infinity** (documentazione Node v24, letta il 16/09/2026) ⇒ una cura rotta farebbe
 *   APPENDERE la suite invece di farla fallire, e il comando documentato non direbbe niente.
 * ══════════════════════════════════════════════════════════════════════════════════════════ */

/** Una rete che BUTTA VIA l'opzione `dispatcher`: così il trasporto non può fermare niente e
 *  l'unico che può restare in piedi è il nostro guardiano. È il modo per non farsi ingannare da
 *  una difesa a due strati in cui il secondo copre il primo. */
const reteSenzaDispatcher = (url, init = {}) => {
  const { dispatcher, ...resto } = init;
  void dispatcher;
  return fetch(url, resto);
};

/** Il fornitore che dice una parola e poi tace per sempre, in streaming o in JSON. */
async function fornitoreCheAmmutolisce(t, { json = false } = {}) {
  return fornitoreFinto(t, (_req, res) => {
    if (json) {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.write('{"choices":[{"message":{"content":"a meta'); // corpo MAI completato
      return;
    }
    res.writeHead(200, { 'Content-Type': 'text/event-stream; charset=utf-8' });
    res.write(`data: ${JSON.stringify({ choices: [{ delta: { content: 'uno ' } }] })}\n\n`);
  });
}

/** La fetch instradata vera (passa dall'aggancio), con la rete e il failsafe scelti dal caso. */
function fetchInstradataDelBanco(base, { rete = fetch, inattivitaGenerazioneMs, timeoutSeconds = 60 } = {}) {
  const store = negozio(base, { timeoutSeconds });
  return creaFetchMultiProvider(rete, {
    providerStore: store,
    dipendenze: { leggiChiave: p => store.getKey(p), leggiRuntime: p => store.getRuntime(p) },
    inattivitaGenerazioneMs,
  });
}

const CORPO_IN_FLUSSO = JSON.stringify({ model: 'deepseek:deepseek-chat', stream: true, messages: [{ role: 'user', content: 'x' }] });
const CORPO_SENZA_FLUSSO = JSON.stringify({ model: 'deepseek:deepseek-chat', messages: [{ role: 'user', content: 'x' }] });

/** Legge il corpo fino all'errore e riporta CHI l'ha prodotto e DOPO QUANTO. */
async function leggiFinoAlGuasto(risposta, t0) {
  const lettore = risposta.body.getReader();
  try {
    for (;;) { const { done } = await lettore.read(); if (done) return { finita: true, ms: Date.now() - t0 }; }
  } catch (errore) {
    return { ms: Date.now() - t0, code: errore?.code ?? errore?.cause?.code ?? errore?.name, message: errore?.message };
  }
}

test('P0-D-15 · l’aggancio è VIVO sul percorso vero, e a fermare il silenzio è il NOSTRO guardiano (non il trasporto)', { timeout: 30_000 }, async t => {
  /*
   * ⛔ Due discriminanti indipendenti, perché una sola non distinguerebbe gli strati:
   *    · il NOME — `PROVIDER_SILENCE` è nostro, `UND_ERR_BODY_TIMEOUT` è di undici;
   *    · il TEMPO — il nostro scatta a 1,0× il failsafe, il trasporto a 1,2× (`MARGINE`).
   *   Se l'aggancio torna inerte, qui si vede `UND_ERR_BODY_TIMEOUT` a ~1,2×: rosso, subito.
   */
  const b = await fornitoreCheAmmutolisce(t);
  const f = fetchInstradataDelBanco(b.base, { inattivitaGenerazioneMs: 1_200 });
  const t0 = Date.now();
  const risposta = await f(`${b.base}/deepseek/chat/completions`, { method: 'POST', body: CORPO_IN_FLUSSO });
  const esito = await leggiFinoAlGuasto(risposta, t0);
  assert.equal(esito.finita, undefined, `il silenzio doveva fermare la lettura: ${JSON.stringify(esito)}`);
  assert.equal(esito.code, 'PROVIDER_SILENCE', `deve fermarlo il guardiano, non il trasporto: ${JSON.stringify(esito)}`);
  assert.ok(esito.ms < 1_200 * 1.2, `a 1,2× o oltre è il bodyTimeout del dispatcher, non il failsafe: ${esito.ms} ms`);
});

test('P0-D-16 · senza dispatcher il guardiano regge DA SOLO — e spento non ferma nulla (al contrario)', { timeout: 30_000 }, async t => {
  const b = await fornitoreCheAmmutolisce(t);
  const f = fetchInstradataDelBanco(b.base, { rete: reteSenzaDispatcher, inattivitaGenerazioneMs: 1_200 });
  const t0 = Date.now();
  const esito = await leggiFinoAlGuasto(await f(`${b.base}/deepseek/chat/completions`, { method: 'POST', body: CORPO_IN_FLUSSO }), t0);
  assert.equal(esito.code, 'PROVIDER_SILENCE', `tolto il trasporto resta solo il guardiano: ${JSON.stringify(esito)}`);

  /* ⛔ AL CONTRARIO: col failsafe SPENTO (`TALOS_GENERATION_IDLE_MS=0`) e senza trasporto, lo
     stesso fornitore muto non viene fermato da nessuno. Se anche questo si fermasse, la prova
     sopra non starebbe misurando il guardiano ma qualcos'altro. */
  const b2 = await fornitoreCheAmmutolisce(t);
  const f2 = fetchInstradataDelBanco(b2.base, { rete: reteSenzaDispatcher, inattivitaGenerazioneMs: 0 });
  const r2 = await f2(`${b2.base}/deepseek/chat/completions`, { method: 'POST', body: CORPO_IN_FLUSSO });
  const sentinella = new Promise(r => { setTimeout(() => r('ANCORA VIVA'), 2_000).unref(); });
  assert.equal(await Promise.race([leggiFinoAlGuasto(r2, Date.now()).then(e => e.code ?? 'FINITA'), sentinella]), 'ANCORA VIVA');
  await r2.body.cancel().catch(() => {});
});

test('P0-D-17 · anche la risposta NON in streaming è sorvegliata: un JSON che si pianta a metà non appende la sessione', { timeout: 30_000 }, async t => {
  /*
   * ⛔ Il ramo che nessuno aveva provato. `conCacheDichiarata` legge il corpo per dichiarare la
   *   cache (`risposta.clone().text()`): se il fornitore manda gli header e poi si pianta a metà
   *   JSON, quella lettura non finisce MAI. Con il guardiano dopo — o inghiottito da un `catch` —
   *   qui non si esce più: è compattazione, banco e ogni chiamata `stream:false`.
   * ⭐ Il dispatcher è tolto apposta: deve reggere il guardiano, non la rete di sicurezza.
   */
  const b = await fornitoreCheAmmutolisce(t, { json: true });
  const f = fetchInstradataDelBanco(b.base, { rete: reteSenzaDispatcher, inattivitaGenerazioneMs: 1_200 });
  const t0 = Date.now();
  const esito = await f(`${b.base}/deepseek/chat/completions`, { method: 'POST', body: CORPO_SENZA_FLUSSO })
    .then(risposta => { risposta.body?.cancel().catch(() => {}); return { restituita: true, ms: Date.now() - t0 }; },
          errore => ({ ms: Date.now() - t0, code: errore?.code ?? errore?.name, message: errore?.message }));
  /*
   * ⛔ La CHIAMATA deve fallire, non restituire una risposta rotta da scoprire più tardi.
   *   `conCacheDichiarata` legge il corpo per misurarlo, e il suo `catch` è lì per il caso «il JSON
   *   non è quello che credevamo»: se ingoia anche «il corpo non finisce mai», il chiamante riceve
   *   una `Response` che sembra buona e scopre il guasto quando la legge — o MAI, se guarda solo
   *   `ok` e gli header.
   * ⭐ Questa riga esiste perché la PROVA AL CONTRARIO non mordeva: tolta la riga del rilancio, il
   *   16/09/2026 le tre prove dell'aggancio restavano tutte verdi (l'errore arrivava lo stesso,
   *   dall'altro ramo del `tee`). Una cura che nessuna prova può smentire o si copre o si toglie.
   */
  assert.equal(esito.restituita, undefined, `un corpo che non finisce mai è un errore della CHIAMATA: ${JSON.stringify(esito)}`);
  assert.equal(esito.code, 'PROVIDER_SILENCE', `il corpo che si pianta a metà deve arrivare come SILENZIO: ${JSON.stringify(esito)}`);
  assert.ok(esito.ms < 5_000, `deve fermarsi al failsafe (1,2 s), non a un tetto di trasporto: ${esito.ms} ms`);
});

test('P0-D-18 · passare una Promise al guardiano è un errore di CONTRATTO e viene detto, non ingoiato', { timeout: 30_000 }, async () => {
  /*
   * ⛔ Il cancello sul difetto che è vissuto invisibile per un giro intero: `sorveglia` riceveva
   *   una Promise (`conCacheDichiarata` è `async`) e la restituiva intatta, senza protestare.
   *   Chi rimettesse un `await` fuori posto deve ritrovarselo addosso SUBITO, non scoprirlo in
   *   produzione con un silenzio che nessuno ferma.
   */
  assert.throws(
    () => sorvegliaCorpoDiGenerazione(Promise.resolve(new Response('x')), { limiteMs: 1_000 }),
    /Response già risolta|Promise/i,
  );
  /* AL CONTRARIO: una Response VERA passa e viene davvero sorvegliata (o la guardia sarebbe di troppo). */
  const sorvegliata = sorvegliaCorpoDiGenerazione(new Response('x', { status: 200 }), { limiteMs: 1_000 });
  assert.equal(await sorvegliata.text(), 'x');
  /* E una risposta SENZA corpo resta un caso legittimo: passa intatta, senza lanciare. */
  const vuota = new Response(null, { status: 204 });
  assert.equal(sorvegliaCorpoDiGenerazione(vuota, { limiteMs: 1_000 }), vuota);
});

test('P0-D-19 · uno Stop GIÀ arrivato non lascia rejection orfane (il guardiano non sporca chi viene dopo)', { timeout: 30_000 }, async () => {
  /*
   * ⛔ Trovato il 16/09/2026 SOLO perché il guardiano ha cominciato a essere davvero agganciato:
   *   `sorvegliaInattivita` usciva con un `return` anticipato quando lo Stop era già arrivato, e
   *   la promessa che aveva ricevuto (una `lettore.read()` viva) restava **senza un solo gestore**.
   *   Quando poi il corpo veniva demolito, rifiutava nel vuoto. Sintomo: `PH-FALLBACK-20` verde
   *   come prova e il FILE rosso, con «asynchronous activity after the test ended … AbortError».
   * ⭐ Il difetto non si vede guardando l'esito della funzione — l'esito era ed è giusto. Si vede
   *   solo guardando **chi resta a terra**: per questo la prova ascolta `unhandledRejection`.
   */
  const orfane = [];
  const ascolta = (motivo) => orfane.push(motivo);
  process.on('unhandledRejection', ascolta);
  try {
    const stop = new AbortController();
    stop.abort();
    /* Una lettura ancora viva, che rifiuterà DOPO: è il caso vero (il corpo demolito dall'abort). */
    let demolisci;
    const letturaViva = new Promise((_, rifiuta) => { demolisci = rifiuta; });
    const esito = await sorvegliaInattivita(letturaViva, {
      limiteMs: 60_000, controller: new AbortController(), userSignal: stop.signal,
    }).then(() => 'RISOLTA', e => e?.name);
    assert.equal(esito, 'AbortError', 'lo Stop deve vincere subito: è la prima via d’uscita');
    demolisci(new DOMException('This operation was aborted', 'AbortError'));
    await new Promise(r => setTimeout(r, 120).unref());
    assert.deepEqual(orfane.map(o => o?.name ?? String(o)), [], 'nessuna rejection deve restare senza gestore');
  } finally {
    process.off('unhandledRejection', ascolta);
  }
});

test('P0-D-20 · il guardiano SORVEGLIA e basta: stessi byte, stesso stato, stessi header — niente flusso rimontato', { timeout: 30_000 }, async () => {
  /*
   * ⛔⛔ L'INVARIANTE CHE VALE, scritta qui perché due prove di ALTRE corsie la difendevano con
   *   l'identità dell'oggetto (`assert.equal(risposta, originale)` in `usage-cache.test.mjs`
   *   CACHE-08 e `provider-pg.test.mjs` PG-12). Quell'identità era vera solo finché il failsafe
   *   era INERTE: un corpo sorvegliato è per forza una `Response` nuova. La cosa che quelle prove
   *   proteggono davvero — «un flusso ricostruito male è peggio di un campo mancante» — è che i
   *   BYTE non si tocchino, e quella si può provare senza l'identità.
   * ⛔ Non ho corretto io quelle due: non sono file della mia corsia. Sono nel rapporto, in
   *   `fuori_regione`, con la riga esatta da cambiare.
   */
  const CORPO = 'data: {"choices":[{"delta":{"content":"ciao"}}]}\n\n: PROCESSING\n\ndata: [DONE]\n\n';
  const originale = new Response(CORPO, { status: 207, statusText: 'Strano', headers: { 'content-type': 'text/event-stream', 'x-nostro': 'intatto' } });
  const sorvegliata = sorvegliaCorpoDiGenerazione(originale, { limiteMs: 60_000 });

  assert.notEqual(sorvegliata, originale, 'sorvegliare vuol dire avvolgere: se fosse lo stesso oggetto non ci sarebbe nessuna guardia');
  assert.equal(await sorvegliata.text(), CORPO, 'i byte devono uscire IDENTICI, commenti SSE compresi');
  assert.equal(sorvegliata.status, 207);
  assert.equal(sorvegliata.statusText, 'Strano');
  assert.equal(sorvegliata.headers.get('content-type'), 'text/event-stream');
  assert.equal(sorvegliata.headers.get('x-nostro'), 'intatto', 'nessun header inventato né perso');

  /* AL CONTRARIO: col failsafe spento non si avvolge proprio niente, e l'oggetto è LO STESSO. */
  const spenta = new Response(CORPO, { status: 200 });
  assert.equal(sorvegliaCorpoDiGenerazione(spenta, { limiteMs: 0 }), spenta, 'niente failsafe, niente involucro');
});
