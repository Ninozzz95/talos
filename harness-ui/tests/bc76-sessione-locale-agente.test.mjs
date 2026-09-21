/*
 * ⛔⛔⛔ BC-76 (17/09/2026) — UNA SESSIONE COL MODELLO LOCALE DEVE ESSERE UN AGENTE.
 *
 * ## Il difetto, misurato prima di scrivere una riga di cura
 *
 * Le strade locali sono DUE, e solo una era rotta:
 *
 *   (A) la CHAT — il selettore dei modelli scrive `local:<id>` in `state.model`,
 *       `POST /api/v1/sessions/custom` lo porta come `modello`, `avviaLibero` lo passa al kernel.
 *       Misurata con questo stesso apparato il 17/09: `tools: 45` nel corpo, `ToolCallResult`
 *       presente, due richieste al motore. **Era già un agente.**
 *   (B) il LABORATORIO MODELLI — `POST /api/v1/sessions` con `{provider:'local', runtimeId,
 *       modelId}` (`frontend/src/legacy/app.js:3877`, `avviaProvaRuntimeModelLab`), che in
 *       `avviaESegui` finiva su `eseguiRuntimeLocale`. Misurata: eventi
 *       `RunStarted, ToolCallStart, ToolCallArgs, RunFinished` — **nessun `ToolCallResult`,
 *       nessuna richiesta al motore con `tools`, nessun attrezzo eseguito.**
 *
 * ⇒ La cura non è un secondo esecutore di attrezzi: è **instradare la (B) sulla (A)**. Il motore
 *   locale resta un TRASPORTO (`modelloDiSessionePerRete` → `local:`/`ollama:`/`lmstudio:` →
 *   `risolviDestinazioneModello` → il ponte del supervisore), e permessi, hook, approvazioni,
 *   ricevute e stop restano quelli del kernel, gli stessi di ogni altra sessione.
 *
 * ## Come sono fatte queste prove
 *
 * ⛔ Dalla STRADA VERA: registro vero, kernel vero (`avviaSessione` + `createOwnerRuntimeAdapter`),
 *   trasporto vero (`creaFetchMultiProvider` dentro l'adattatore). L'unica finta è il MOTORE: un
 *   server HTTP vero su 127.0.0.1 che parla la forma OpenAI. Nessuna finta decide l'esito — se
 *   l'attrezzo non gira davvero sul disco, queste prove diventano rosse.
 *
 * Ricerca del 17/09/2026 dietro la cura:
 *  · llama.cpp `docs/function-calling.md` (github.com/ggml-org/llama.cpp) — «llama-server when
 *    started w/ `--jinja` flag»; «Function calling is supported for all models»; «Generic tool
 *    call is supported when the template isn't recognized by native format handlers (you'll see
 *    `Chat format: Generic` in the logs)»; «Generic support may consume more tokens and be less
 *    efficient than a model's native format».
 *    ⇒ Il supervisore lancia GIÀ con `--jinja` (`src/llama-server-supervisor.mjs:525`): mandare
 *      `tools` al motore locale non richiede né un template scelto da noi né un modello
 *      «consigliato» — che la regola dell'owner dell'11/09 vieta.
 *  · llama.cpp `tools/server/README.md` — `/props` espone `chat_template` e
 *    `chat_template_tool_use`: è lì che si LEGGE se un GGUF ha un template per gli attrezzi,
 *    invece di indovinarlo dal nome del modello.
 */
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtempSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { createSessionRegistry, modelloDiSessionePerRete } from '../src/session-registry.mjs';
import { createOwnerRuntimeAdapter } from '../src/runtime-owner-adapter.mjs';
import { avviaSessione } from '../src/agent-service.mjs';
import { rimuoviCartellaDiProva } from './aiuto/rimuovi-cartella-di-prova.mjs';

/* ------------------------------------------------------------------ la spia sulla rete */

/*
 * ⛔ Nessuna prova di questo file può toccare la rete vera, e due prove (BC76-08 e BC76-09) hanno
 *   proprio «non è uscito niente» come asserzione. La spia lascia passare SOLO 127.0.0.1 e risponde
 *   401 a tutto il resto, registrando l'uscita.
 */
const fuori = [];
const fetchVera = globalThis.fetch;
globalThis.fetch = async (url, init) => {
  const indirizzo = new URL(typeof url === 'string' ? url : url.url);
  if (indirizzo.hostname === '127.0.0.1') return fetchVera(url, init);
  let corpo = null;
  try { corpo = JSON.parse(init?.body ?? 'null'); } catch { /* un corpo illeggibile è comunque un'uscita */ }
  fuori.push({ host: indirizzo.hostname, model: corpo?.model ?? null });
  return new Response(JSON.stringify({ error: { message: 'intercettato dalla prova' } }), { status: 401, headers: { 'Content-Type': 'application/json' } });
};

/* ------------------------------------------------------------------ il motore FINTO, ma vero HTTP */

const sse = (frames) => frames.map((f) => `data: ${JSON.stringify(f)}\n\n`).join('') + 'data: [DONE]\n\n';

/** Una chiamata ad attrezzo in forma OpenAI, in streaming come la manda llama-server con `--jinja`. */
const fotogrammaToolCall = (nome, argomenti) => ({
  choices: [{ delta: { tool_calls: [{ index: 0, id: `call_${nome}`, type: 'function', function: { name: nome, arguments: JSON.stringify(argomenti) } }] } }],
});
const fotogrammaTesto = (testo) => ({ choices: [{ delta: { content: testo } }] });

/**
 * La stessa identica chiamata ripetuta dentro UNA risposta: è il modo misurato di far chiudere il
 * giro con un esito del TASK (`comeFinita: 'ripetizione'`, `ok:false` con un `esito` valorizzato).
 *
 * ⛔ La strada ovvia — «lascia che il giro finisca i giri» — non esiste più:
 *   `src/kernel/talosHarness.mjs:156` dichiara `GIRI_MASSIMI = Number.POSITIVE_INFINITY`, e infatti
 *   il primo tentativo di questa prova è morto a 30 s con la sessione ancora viva dopo decine di
 *   `ToolCallResult`. La ripetizione, invece, la chiude `consumaFlussoSSE` in una risposta sola
 *   (`RIPETIZIONI_IDENTICHE_MASSIME = 3`).
 */
const fotogrammiRipetizione = (quante) => Array.from({ length: quante }, (_, i) => (
  { choices: [{ delta: { tool_calls: [{ index: i, id: `call_${i}`, type: 'function', function: { name: 'elenca', arguments: '{"percorso":"."}' } }] } }] }
));

/**
 * Accende un motore finto su 127.0.0.1. `copione` è la lista delle risposte, una per giro.
 * ⛔ Non decide niente sull'esito: risponde e basta. Le richieste ricevute restano leggibili,
 *   così una prova può misurare CHE COSA gli è stato mandato (`tools`, `stream`, i caratteri).
 */
async function accendiMotoreFinto(t, copione) {
  const richieste = [];
  let giro = 0;
  const server = createServer((req, res) => {
    let corpo = '';
    req.on('data', (c) => { corpo += c; });
    req.on('end', () => {
      let letto = null;
      try { letto = JSON.parse(corpo); } catch { /* il trasporto gestisce il JSON malformato */ }
      richieste.push({ url: req.url, corpo: letto, caratteri: corpo.length, autorizzazione: req.headers.authorization ?? null });
      const risposta = copione[Math.min(giro, copione.length - 1)];
      giro += 1;
      res.writeHead(200, { 'Content-Type': 'text/event-stream' });
      res.end(sse(risposta));
    });
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  t.after(() => new Promise((r) => server.close(r)));
  return { porta: server.address().port, richieste };
}

/**
 * Il registro cablato COME `server.mjs`: `avviaSessioneFn` è il kernel vero attraverso
 * l'adattatore, e `destinazioneModelloDeps.chiamaLocale` è il ponte del supervisore — qui una
 * `fetch` vera verso il motore finto, che è esattamente ciò che fa `supervisoreLocale.request`.
 */
function registroComeIlServer({ porta, cartella, localRuntimes, endpointPerFonte = {}, chiavePerFonte = {}, chiave = 'k', modello = 'vendor/modello', ...extra }) {
  const destinazioneModelloDeps = {
    leggiChiave: (fonte) => chiavePerFonte[fonte] ?? null,
    leggiRuntime: (fonte) => ({ endpoint: endpointPerFonte[fonte] ?? null }),
    localePronto: () => true,
    chiamaLocale: (percorso, opzioni) => fetch(`http://127.0.0.1:${porta}${percorso}`, opzioni),
    avviaLocale: async () => {},
  };
  const ownerRuntime = createOwnerRuntimeAdapter({ destinazioneModelloDeps });
  return createSessionRegistry({
    avviaSessioneFn: (input) => avviaSessione({ ...input, talosLavoraFn: (ri) => ownerRuntime.talosLavora(ri) }),
    modello,
    chiave,
    chiaveFn: () => chiave,
    localRuntimes,
    cartelleProgetto: [{ id: '0', percorso: cartella, nome: 'prova' }],
    preparaEsecuzioneFn: (taskId) => ({ taskId, cartella, task: { consegna: 'fai il tuo lavoro' }, comandoProva: null }),
    fetchModelloFn: () => fetch,
    ...extra,
  });
}

/** Un runtime locale finto: serve solo a esistere in `localRuntimes` (il guardiano lo pretende). */
const runtimeLocaleFinto = () => ({
  detect: async () => ({ state: 'observed' }),
  load: async () => {},
  /* ⛔ Se qualcuno tornasse a passare di qui, la prova lo saprebbe: il conteggio è osservabile. */
  chiamate: 0,
  async *generateStream() {
    this.chiamate += 1;
    yield { type: 'tool_call', id: 'call_1', name: 'elenca', arguments: '{"percorso":"."}' };
    yield { type: 'done' };
  },
});

const eFinale = (e) => e.type === 'RunFinished' || e.type === 'RunError';

/**
 * ⛔ `quanti` non è un dettaglio: un ripiego sul cloud è un SECONDO giro appeso alla stessa
 * sessione, e aspettare il primo evento finale significherebbe misurare il giro sbagliato.
 */
const attendiFine = async (registro, sessionId, { quanti = 1, ms = 15_000 } = {}) => {
  const scadenza = Date.now() + ms;
  while (Date.now() < scadenza) {
    const eventi = registro.esporta(sessionId)?.eventi ?? [];
    if (eventi.filter(eFinale).length >= quanti) return eventi;
    await new Promise((r) => setTimeout(r, 20));
  }
  throw new Error(`la sessione ${sessionId} non ha chiuso ${quanti} giri entro ${ms} ms: ${JSON.stringify((registro.esporta(sessionId)?.eventi ?? []).map((e) => e.type))}`);
};

const attendiEvento = async (registro, sessionId, tipo, ms = 15_000) => {
  const scadenza = Date.now() + ms;
  while (Date.now() < scadenza) {
    const eventi = registro.esporta(sessionId)?.eventi ?? [];
    const trovato = eventi.find((e) => e.type === tipo);
    if (trovato) return trovato;
    if (eventi.some((e) => e.type === 'RunFinished' || e.type === 'RunError')) {
      throw new Error(`il giro è finito senza mai emettere ${tipo}: ${JSON.stringify(eventi.map((e) => e.type))}`);
    }
    await new Promise((r) => setTimeout(r, 20));
  }
  throw new Error(`${tipo} non è mai arrivato entro ${ms} ms`);
};

function cartellaDiProva(t, nome) {
  const cartella = mkdtempSync(join(tmpdir(), `bc76-${nome}-`));
  t.after(() => rimuoviCartellaDiProva(cartella));
  return cartella;
}

/**
 * ⛔ Misurato, non precauzionale: BC76-09 è fallita una prima volta per una fuga che NON era sua —
 *   era la sessione di BC76-08, rimasta viva quando quella prova è scaduta. Il suo motore finto si
 *   era chiuso col test, la sessione ha visto cadere il motore locale, e col consenso al ripiego se
 *   n'è andata sul cloud dentro la finestra di misura della prova successiva.
 * ⇒ Una prova che accende una sessione la spegne. E lo spegnimento non falsa niente: uno stop su una
 *   sessione locale NON ripiega (è proprio ciò che BC76-09 pretende).
 */
function spegniTutteAllaFine(t, registro) {
  t.after(() => { for (const sessione of registro.elenca()) registro.ferma(sessione.sessionId); });
}

/* ------------------------------------------------------------------ le prove */

test('⛔⛔⛔ BC76-01 — una sessione LOCALE esegue gli attrezzi e manda `tools` al motore: non disegna una chiamata e si ferma', async (t) => {
  const cartella = cartellaDiProva(t, 'agente');
  writeFileSync(join(cartella, 'segnaposto.txt'), 'contenuto');
  const motore = await accendiMotoreFinto(t, [
    [fotogrammaToolCall('elenca', { percorso: '.' })],
    [fotogrammaTesto('ho elencato la cartella')],
  ]);
  const runtime = runtimeLocaleFinto();
  const registro = registroComeIlServer({ porta: motore.porta, cartella, localRuntimes: { 'llama.cpp': runtime } });

  const { sessionId } = registro.avvia('task-vero', { provider: 'local', runtimeId: 'llama.cpp', modelId: 'un-gguf-qualunque.gguf' });
  const eventi = await attendiFine(registro, sessionId);
  const tipi = eventi.map((e) => e.type);

  assert.ok(tipi.includes('ToolCallResult'),
    `⛔ l'attrezzo deve essere ESEGUITO, non solo annunciato — eventi: ${JSON.stringify(tipi)}`);
  assert.equal(tipi.filter((tp) => tp === 'ToolCallStart').length, 1);
  assert.ok(motore.richieste.length >= 2,
    `⛔ dopo l'esito dell'attrezzo il giro CONTINUA: il motore deve essere richiamato (richieste: ${motore.richieste.length})`);
  assert.equal(motore.richieste[0].url, '/v1/chat/completions');
  assert.ok(Array.isArray(motore.richieste[0].corpo?.tools) && motore.richieste[0].corpo.tools.length > 0,
    '⛔ senza `tools` nel corpo il motore non può chiamare niente: è il pezzo che mancava');
  assert.equal(motore.richieste[0].corpo.model, 'un-gguf-qualunque.gguf',
    '⛔ al motore arriva il nome NUDO: il prefisso `local:` è la nostra convenzione, non sua');
  assert.equal(runtime.chiamate, 0,
    '⛔ `generateStream` non è più la strada degli agenti: se viene chiamata, è tornato il secondo esecutore');

  /* ⛔ L'esito dell'attrezzo entra in CONVERSAZIONE come messaggio `tool`: è ciò che rende la
     chiamata vera per il modello al giro dopo, e non un'animazione a schermo. */
  const secondaRichiesta = motore.richieste[1].corpo.messages;
  assert.ok(secondaRichiesta.some((m) => m.role === 'tool'),
    `⛔ il secondo giro deve portare il messaggio \`tool\` con l'esito: ${JSON.stringify(secondaRichiesta.map((m) => m.role))}`);
});

test('⛔⛔⛔ BC76-02 — l\'attrezzo tocca il DISCO VERO: `leggi` riporta il contenuto del file, non un esito inventato', async (t) => {
  const cartella = cartellaDiProva(t, 'leggi');
  writeFileSync(join(cartella, 'bersaglio.txt'), 'PAROLA-CHE-DEVE-COMPARIRE');
  const motore = await accendiMotoreFinto(t, [
    [fotogrammaToolCall('leggi', { percorso: 'bersaglio.txt' })],
    [fotogrammaTesto('letto')],
  ]);
  const registro = registroComeIlServer({ porta: motore.porta, cartella, localRuntimes: { 'llama.cpp': runtimeLocaleFinto() } });

  const { sessionId } = registro.avvia('task-vero', { provider: 'local', runtimeId: 'llama.cpp', modelId: 'un-gguf.gguf' });
  await attendiFine(registro, sessionId);

  const messaggiTool = motore.richieste[1].corpo.messages.filter((m) => m.role === 'tool');
  assert.equal(messaggiTool.length, 1);
  assert.ok(String(messaggiTool[0].content).includes('PAROLA-CHE-DEVE-COMPARIRE'),
    `⛔ l'esito deve venire dal FILE, non da una finta: ${JSON.stringify(messaggiTool[0].content).slice(0, 200)}`);
});

test('⛔⛔⛔ BC76-03 — i PERMESSI valgono anche in locale: «On request» chiede, e un NO non scrive niente', async (t) => {
  const cartella = cartellaDiProva(t, 'permessi');
  const motore = await accendiMotoreFinto(t, [
    [fotogrammaToolCall('scrivi', { percorso: 'vietato.txt', contenuto: 'non deve esistere' })],
    [fotogrammaTesto('non ho potuto')],
  ]);
  const registro = registroComeIlServer({ porta: motore.porta, cartella, localRuntimes: { 'llama.cpp': runtimeLocaleFinto() } });

  const { sessionId } = registro.avvia('task-vero', {
    provider: 'local', runtimeId: 'llama.cpp', modelId: 'un-gguf.gguf', permessiScelto: 'On request',
  });
  const domanda = await attendiEvento(registro, sessionId, 'ApprovalRequested');
  assert.equal(typeof domanda.requestId, 'string');
  assert.deepEqual(registro.rispondiApprovazione(sessionId, domanda.requestId, false), { ok: true });
  await attendiFine(registro, sessionId);

  assert.equal(existsSync(join(cartella, 'vietato.txt')), false,
    '⛔ un rifiuto deve restare un rifiuto: nessun file sul disco');
});

test('⛔⛔⛔ BC76-04 — lo STOP a metà giro: una sessione LOCALE e una CLOUD danno la STESSA sequenza, evento per evento', async (t) => {
  /*
   * ⛔ Questa prova è un A/B, e la forma è deliberata: dire «la locale si ferma» non dimostra niente
   *   di BC-76 — `eseguiRuntimeLocale` si fermava anche prima, a modo SUO (chiudeva con
   *   `RunFinished outcome:'fermato'`). Ciò che la riga chiede è la PARITÀ: la sessione locale
   *   dev'essere una sessione come le altre. Il confronto è fatto nello stesso processo, nello
   *   stesso momento, sullo stesso motore finto — l'unica differenza è `provider`.
   * ⭐ Misurato il 17/09 dopo la cura: entrambe chiudono con `RunError code:'fermato'`
   *   («⛔ interrotto su richiesta: prima del giro 2»), che è il modo in cui il KERNEL dice
   *   «fermato» — e non più due modi diversi per la stessa cosa.
   */
  const cartella = cartellaDiProva(t, 'stop');
  const motore = await accendiMotoreFinto(t, [
    [fotogrammaToolCall('scrivi', { percorso: 'atteso.txt', contenuto: 'x' })],
  ]);
  const registro = registroComeIlServer({
    porta: motore.porta, cartella,
    localRuntimes: { 'llama.cpp': runtimeLocaleFinto() },
    /* ⛔ Il gemello CLOUD gira su un fornitore con un INDIRIZZO configurabile e lo si punta al
       motore finto: nessuna richiesta esce da 127.0.0.1, in nessuno dei due bracci. */
    endpointPerFonte: { deepseek: `http://127.0.0.1:${motore.porta}` },
    chiavePerFonte: { deepseek: 'chiave-finta' },
    prontoFn: () => ({ pronto: true }),
  });

  const fermaEGuarda = async (opzioni) => {
    const { sessionId, erroreAvvio } = registro.avvia('task-vero', opzioni);
    assert.equal(erroreAvvio, undefined, `avvio rifiutato: ${erroreAvvio}`);
    /* Si ferma mentre la sessione è ONESTAMENTE in pausa su una domanda di consenso: è il punto in
       cui il giro è vivo e osservabile senza inventare un ritardo. */
    await attendiEvento(registro, sessionId, 'ApprovalRequested');
    assert.equal(registro.ferma(sessionId), true);
    const eventi = await attendiFine(registro, sessionId);
    return { tipi: eventi.map((e) => e.type), ultimo: eventi.at(-1) };
  };

  const locale = await fermaEGuarda({ provider: 'local', runtimeId: 'llama.cpp', modelId: 'un-gguf.gguf', permessiScelto: 'On request' });
  const cloud = await fermaEGuarda({ modelloScelto: 'deepseek:un-modello', permessiScelto: 'On request' });

  assert.equal(locale.ultimo.type, 'RunError');
  assert.equal(locale.ultimo.code, 'fermato', `⛔ uno stop deve restare uno stop: ${JSON.stringify(locale.ultimo)}`);
  assert.deepEqual(locale.tipi, cloud.tipi,
    `⛔ la sessione locale deve comportarsi come ogni altra — locale: ${JSON.stringify(locale.tipi)} · cloud: ${JSON.stringify(cloud.tipi)}`);
  assert.equal(locale.ultimo.code, cloud.ultimo.code);
});

test('⛔⛔ BC76-05 — la FONTE di un runtime locale si deriva dal registro dei fornitori, non si scrive a mano', async () => {
  /* ⛔ Importata QUI dentro di proposito: prima della cura l'export non esiste, e un `import` in
     testa renderebbe rosso tutto il file per un motivo solo — le prove di comportamento qui sopra
     devono poter fallire per il LORO motivo, non per un modulo che non carica. */
  const { fonteLocaleDelRuntime } = await import('../src/session-registry.mjs');
  assert.equal(typeof fonteLocaleDelRuntime, 'function', '⛔ la regola deve essere una funzione con un nome, non una riga dentro una chiusura');
  assert.equal(fonteLocaleDelRuntime('llama.cpp'), 'local',
    '⛔ il supervisore llama-server è la fonte `local`: il suo indirizzo non esce dal supervisore');
  assert.equal(fonteLocaleDelRuntime('ollama'), 'ollama');
  assert.equal(fonteLocaleDelRuntime('lmstudio'), 'lmstudio');
  assert.equal(fonteLocaleDelRuntime(null), 'local',
    '⛔ una voce ripristinata da un disco vecchio non porta il runtimeId: resta il comportamento di sempre');

  /* ⛔ E la stessa regola vale per il nome che va in rete: una sessione Ollama non deve passare
     dal ponte del supervisore llama-server, che parla con un ALTRO processo. */
  assert.equal(modelloDiSessionePerRete({ provider: 'local', runtimeId: 'ollama', modelId: 'qwen3:8b' }), 'ollama:qwen3:8b');
  assert.equal(modelloDiSessionePerRete({ provider: 'local', runtimeId: 'llama.cpp', modelId: 'gemma.gguf' }), 'local:gemma.gguf');
});

test('⛔⛔ BC76-06 — una sessione locale su OLLAMA parla col SUO indirizzo, non col ponte del supervisore', async (t) => {
  const cartella = cartellaDiProva(t, 'ollama');
  const motore = await accendiMotoreFinto(t, [[fotogrammaTesto('ciao da ollama')]]);
  /* ⛔ `porta: 0` per il ponte del supervisore: se il nome finisse `local:…` la richiesta passerebbe
     di lì e fallirebbe, invece di arrivare all'indirizzo di Ollama. La prova sa distinguerli. */
  const registro = registroComeIlServer({
    porta: 0, cartella,
    localRuntimes: { ollama: runtimeLocaleFinto() },
    endpointPerFonte: { ollama: `http://127.0.0.1:${motore.porta}` },
  });

  const { sessionId } = registro.avvia('task-vero', { provider: 'local', runtimeId: 'ollama', modelId: 'qwen3:8b' });
  await attendiFine(registro, sessionId);
  assert.ok(motore.richieste.length >= 1, '⛔ la richiesta deve arrivare all\'indirizzo di Ollama');
  assert.equal(motore.richieste[0].corpo.model, 'qwen3:8b');
  assert.ok(Array.isArray(motore.richieste[0].corpo.tools) && motore.richieste[0].corpo.tools.length > 0);
});

test('⛔⛔⛔ BC76-07 — il RIPIEGO sul cloud sopravvive, col suo consenso, e NON manda il nome del GGUF a OpenRouter', async (t) => {
  const cartella = cartellaDiProva(t, 'ripiego');
  /* Il motore locale è SPENTO: `chiamaLocale` rifiuta, come farebbe un supervisore caduto. */
  const modelliCloudVisti = [];
  const destinazioneModelloDeps = {
    leggiChiave: () => 'chiave-cloud',
    leggiRuntime: () => ({ endpoint: 'https://openrouter.example/api/v1' }),
    localePronto: () => true,
    chiamaLocale: async () => { throw Object.assign(new Error('motore locale caduto'), { code: 'RUNTIME_UNREACHABLE' }); },
    avviaLocale: async () => {},
  };
  const ownerRuntime = createOwnerRuntimeAdapter({ destinazioneModelloDeps });
  const registro = createSessionRegistry({
    avviaSessioneFn: (input) => avviaSessione({
      ...input,
      talosLavoraFn: (ri) => ownerRuntime.talosLavora({
        ...ri,
        fetchDiRete: async (url, opzioni) => {
          const corpo = typeof opzioni?.body === 'string' ? JSON.parse(opzioni.body) : null;
          if (corpo?.model) modelliCloudVisti.push(corpo.model);
          return Response.json({ choices: [{ message: { role: 'assistant', content: 'risposta cloud' } }] });
        },
      }),
    }),
    modello: 'vendor/modello-di-serie', chiave: 'chiave-cloud', chiaveFn: () => 'chiave-cloud',
    localRuntimes: { 'llama.cpp': runtimeLocaleFinto() },
    cartelleProgetto: [{ id: '0', percorso: cartella, nome: 'prova' }],
    preparaEsecuzioneFn: (taskId) => ({ taskId, cartella, task: { consegna: 'fai il tuo lavoro' }, comandoProva: null }),
    fetchModelloFn: () => fetch,
  });

  const senza = registro.avvia('task-vero', { provider: 'local', runtimeId: 'llama.cpp', modelId: 'un-gguf.gguf' });
  const eventiSenza = await attendiFine(registro, senza.sessionId);
  assert.equal(eventiSenza.at(-1).type, 'RunError', '⛔ senza consenso non si esce di casa: l\'errore si dice');
  assert.equal(modelliCloudVisti.length, 0, '⛔ nessuna richiesta cloud senza consenso esplicito');

  const con = registro.avvia('task-vero', { provider: 'local', runtimeId: 'llama.cpp', modelId: 'un-gguf.gguf', fallbackConsent: true });
  const eventiCon = await attendiFine(registro, con.sessionId, { quanti: 2 });
  assert.ok(eventiCon.some((e) => e.type === 'RuntimeFallback'), '⛔ il ripiego deve essere ANNUNCIATO');
  assert.ok(modelliCloudVisti.length > 0, '⛔ col consenso il giro riparte sul cloud');
  assert.equal(modelliCloudVisti.at(-1), 'vendor/modello-di-serie',
    '⛔ al cloud va il modello di SERIE del server: il nome di un GGUF locale non esiste su OpenRouter');
});

/*
 * ⛔⛔⛔⛔ BC76-08 e BC76-09 — LE DUE CONDIZIONI DEL RIPIEGO, PROVATE DOVE FANNO MALE.
 *
 * Le ha chieste la revisione, e con ragione: aveva rotto la cura in due modi e la suite era rimasta
 * VERDE tutte e due le volte. Cioè due condizioni che il codice DICHIARA erano scritte e non
 * difese — il difetto più vecchio di questo progetto, «una misura che non può smentirti».
 *
 *   BC76-08 difende `risultato?.esito == null` contro `risultato?.ok === false`.
 *   BC76-09 difende `!voce.controller.signal.aborted` contro `true`.
 *
 * ⛔ In tutte e due il danno è lo stesso e non si disfa: la conversazione di chi ha scelto il
 *   locale parte verso un fornitore remoto. Per questo l'asserzione non è solo «niente
 *   `RuntimeFallback`» ma anche «niente è uscito da 127.0.0.1»: la seconda è il fatto, la prima è
 *   il suo annuncio.
 */

test('⛔⛔⛔⛔ BC76-08 — un ESITO DEL TASK non è un guasto del motore: nessun ripiego, nemmeno col consenso', async (t) => {
  const partenza = fuori.length;
  const cartella = cartellaDiProva(t, 'esito-del-task');
  /*
   * Il motore conduce il giro fino in fondo e lo chiude con un esito SUO: chiede sempre la stessa
   * identica cosa, e alla terza volta il kernel chiude con `comeFinita: 'ripetizione'` — `ok:false`
   * con un `esito` valorizzato. È il caso che distingue le due condizioni: `ok === false` è vero,
   * `esito == null` è falso.
   */
  const motore = await accendiMotoreFinto(t, [fotogrammiRipetizione(4)]);
  const registro = registroComeIlServer({
    porta: motore.porta, cartella,
    localRuntimes: { 'llama.cpp': runtimeLocaleFinto() },
    /* ⛔ OpenRouter RAGGIUNGIBILE: senza un indirizzo il ripiego fallirebbe alla risoluzione e la
       prova resterebbe verde per il motivo sbagliato — non perché non è partito, ma perché non
       sapeva dove andare. */
    endpointPerFonte: { openrouter: 'https://openrouter.ai/api/v1' },
    chiavePerFonte: { openrouter: 'chiave-finta' },
  });
  spegniTutteAllaFine(t, registro);

  const { sessionId } = registro.avvia('task-vero', {
    provider: 'local', runtimeId: 'llama.cpp', modelId: 'un-gguf.gguf', fallbackConsent: true,
  });
  await attendiFine(registro, sessionId, { ms: 30_000 });
  /* ⛔ Stesso respiro di BC76-09, e per lo stesso motivo: un ripiego parte DOPO il primo evento finale. */
  await new Promise((r) => setTimeout(r, 500));
  const eventi = registro.esporta(sessionId).eventi;

  assert.ok(!eventi.some((e) => e.type === 'RuntimeFallback'),
    `⛔ «giri esauriti», «ripetizione» e «fermato» sono esiti del TASK: il motore locale ha fatto il suo lavoro — eventi: ${JSON.stringify(eventi.map((e) => e.type))}`);
  assert.deepEqual(fuori.slice(partenza), [],
    `⛔ niente deve uscire da 127.0.0.1 per un esito del task — uscite: ${JSON.stringify(fuori.slice(partenza))}`);
  /* ⛔ E il giro deve essere finito DAVVERO per un esito del task: senza questa riga la prova
     resterebbe verde anche se il giro non fosse mai partito. */
  assert.equal(eventi.at(-1).type, 'RunError');
  assert.equal(eventi.at(-1).code, 'ripetizione',
    `⛔ è questo l'esito che distingue le due condizioni: \`ok:false\` con un \`esito\` valorizzato — ultimo evento: ${JSON.stringify(eventi.at(-1))}`);
  assert.ok(motore.richieste.length >= 1,
    `il motore locale deve aver condotto il giro: richieste = ${motore.richieste.length}`);
});

test('⛔⛔⛔⛔ BC76-09 — dopo uno STOP non si esce di casa, nemmeno col consenso al ripiego', async (t) => {
  /*
   * ⛔⛔ LA PRIMA STESURA DI QUESTA PROVA NON DIFENDEVA NIENTE, e il perché vale più della prova.
   *
   * Fermavo una sessione locale col motore che tace, e poi pretendevo «nessun ripiego». Verde —
   * ma verde ANCHE rompendo la guardia dello stop (`!voce.controller.signal.aborted` → `true`):
   * misurato, eventi `["RunStarted","RunError"]`, `fuori: []` in entrambi i casi.
   * ⇒ Il motivo, letto nel codice dopo la misura: uno stop **non è** un giro senza esito. Il kernel
   *   lo conduce al confine sicuro e `avviaSessione` torna dal ramo RIUSCITO
   *   (`esitoInEventoFinale`, `agent-service.mjs:168`) con `{ok:false, esito:{comeFinita:'fermato'}}`.
   *   `esito` valorizzato ⇒ il primo discriminante ferma già tutto, e la guardia dello stop non
   *   viene nemmeno interrogata. Una prova che non può distinguere le due versioni del codice non
   *   sta misurando la riga che dice di misurare.
   *
   * ⇒ La guardia dello stop morde dove il giro finisce SENZA esito pur essendo stato fermato: il
   *   ramo che lancia PRIMA del kernel. `avviaIlGiro` chiama `contextHooksFn` e poi
   *   `controller.signal.throwIfAborted()` — uno stop arrivato durante quell'attesa fa saltare la
   *   catena, e l'errore finisce nel `.catch` del ripiego. Lì, e solo lì, è `!aborted` a decidere se
   *   la conversazione di una sessione LOCALE parte verso il cloud.
   */
  const partenza = fuori.length;
  const cartella = cartellaDiProva(t, 'stop-senza-ripiego');
  /* Un motore che TACE: accetta la richiesta e non risponde mai. Qui non deve nemmeno essere
     raggiunto — lo stop arriva prima — ma se un giorno ci arrivasse, non inventerebbe una risposta. */
  const socket = [];
  const server = createServer((req) => { socket.push(req.socket); /* nessuna risposta, mai */ });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  t.after(() => { for (const s of socket) s.destroy(); return new Promise((r) => server.close(r)); });

  let hookChiamato = false;
  const registro = registroComeIlServer({
    porta: server.address().port, cartella,
    localRuntimes: { 'llama.cpp': runtimeLocaleFinto() },
    /* ⛔ OpenRouter RAGGIUNGIBILE, con la sua chiave: se il ripiego partisse, arriverebbe DAVVERO
       alla spia. Senza indirizzo la prova sarebbe verde perché il ripiego non sa dove andare — cioè
       per il motivo sbagliato. */
    endpointPerFonte: { openrouter: 'https://openrouter.ai/api/v1' },
    chiavePerFonte: { openrouter: 'chiave-finta' },
    contextHooksFn: async () => { hookChiamato = true; await new Promise((r) => setTimeout(r, 300)); return null; },
  });
  spegniTutteAllaFine(t, registro);

  const { sessionId } = registro.avvia('task-vero', {
    provider: 'local', runtimeId: 'llama.cpp', modelId: 'un-gguf.gguf', fallbackConsent: true,
  });
  /* Si ferma MENTRE il giro sta partendo: è il punto in cui l'uscita dipende solo da quella guardia. */
  const tetto = Date.now() + 5_000;
  while (Date.now() < tetto && !hookChiamato) await new Promise((r) => setTimeout(r, 5));
  assert.equal(hookChiamato, true, 'il giro deve essere partito prima dello stop');
  assert.equal(registro.ferma(sessionId), true);

  await attendiFine(registro, sessionId, { ms: 30_000 });
  /*
   * ⛔ IL RESPIRO NON È SUPERSTIZIONE: `attendiFine` torna al PRIMO evento finale, e un ripiego
   *   partirebbe subito dopo, nella catena che segue la promessa del giro. Guardare troppo presto
   *   è un altro modo di non misurare.
   */
  await new Promise((r) => setTimeout(r, 500));
  const eventi = registro.esporta(sessionId).eventi;

  assert.ok(!eventi.some((e) => e.type === 'RuntimeFallback'),
    `⛔ uno stop è una volontà della persona, non un guasto del motore: nessun secondo giro — eventi: ${JSON.stringify(eventi.map((e) => e.type))}`);
  assert.deepEqual(fuori.slice(partenza), [],
    `⛔ la conversazione NON deve partire verso il cloud DOPO uno stop — uscite: ${JSON.stringify(fuori.slice(partenza))}`);
});
