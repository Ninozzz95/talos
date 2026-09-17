/*
 * ⛔⛔⛔ BC-79.2 (17/09/2026) — UN MOTORE LOCALE CHE RIFIUTA GLI ATTREZZI: SI RIPROVA UNA VOLTA
 * SENZA, E LO SI DICE.
 *
 * ## Che cosa è stato MISURATO prima di scrivere una riga di cura (sonda sulla base `f29c8e91`)
 *
 * La premessa del brief («oggi viene ritentato quattro volte») è risultata FALSA, ed è importante
 * dirlo perché è la ragione per cui questa riga esiste. Misurato con questo stesso apparato —
 * registro vero, kernel vero, adattatore vero, motore finto su 127.0.0.1 — contando le richieste
 * HTTP che il motore riceve davvero:
 *
 *   | stato del motore | richieste ricevute (base) |
 *   |------------------|---------------------------|
 *   | 400              | **1**                     |
 *   | 401              | **1**                     |
 *   | 404              | **1**                     |
 *   | 429              | **4**                     |
 *   | 503              | **4**                     |
 *
 * ⇒ `siRitenta` (`src/kernel/talosHarness.mjs:342`) limitava GIÀ il ritento a 408/429/5xx, per
 *   TUTTI i fornitori: nessun 4xx-risposta è mai stato ritentato quattro volte. Quello che diceva
 *   il falso era il MESSAGGIO: `HTTP ${ultimoStato} dopo ${tentativiMassimi} tentativi` stampava
 *   la COSTANTE `4` invece dei tentativi fatti, quindi diceva «dopo 4 tentativi» anche dopo UNO.
 *   Due persone hanno letto quella frase e hanno diagnosticato quattro ritenti che non esistevano:
 *   è «una misura che non può smentirti» — il numero è sempre lo stesso qualunque cosa succeda.
 *
 * ⇒ La cura del punto 1 del brief non è cambiare la regola del ritento (è già quella giusta, e
 *   coincide con lo stato dell'arte): è far dire al messaggio il numero VERO.
 *
 * ## La cura vera, e dove vive
 *
 * Tutta in `src/runtime-owner-adapter.mjs`, nella `fetch` instradata: davanti a un **400** su una
 * richiesta che portava `tools` verso una fonte di **motore locale** (`local:`, `ollama:`,
 * `lmstudio:` — derivate dal registro dei fornitori, non da un elenco scritto a mano) si fa UNA
 * sola riprova identica senza `tools` né `tool_choice`. Il kernel non conosce questa riga.
 *
 * ## Ricerca del 17/09/2026 (estesa da me lo stesso giorno, oltre a quella del brief)
 *  · Ollama risponde 400 «… does not support tools» quando il modello non ha il template
 *    (tinyhumansai/openhuman#2787, browser-use/browser-use#814, NVIDIA/NemoClaw#2667): la cura
 *    adottata altrove è togliere `tools` per quel modello.
 *  · ⛔ VINCOLO che dal codice non si vedeva, e che decide la forma di questa cura: *«simply
 *    retrying without changes will loop»* (betterclaw.io, «Fix: OpenClaw "Model Does Not Support
 *    Tools" (Ollama)», letto 17/09/2026). ⇒ La riprova NON basta: senza una MEMORIA che smetta di
 *    mandare `tools` per il resto del giro di sessione, ogni giro rifarebbe il suo 400. È il
 *    motivo per cui BC79-01 conta le richieste del SECONDO giro, non solo del primo.
 *  · Politica di ritento dello stato dell'arte (dev.to/ai-router «Safe Retries for
 *    OpenAI-Compatible APIs», therouter.ai «LLM API Timeouts, Retries, and Idempotency Across
 *    Providers», letti 17/09/2026): ritentabili 408, 409, 429 e 5xx; **400/404/422 non
 *    ritentabili**. Il nostro `siRitenta` fa 408/429/5xx — conforme, e non si ALLARGA in questa
 *    riga (409 e 425 restano fuori come sono sempre stati: la riga chiede di non ritentare troppo,
 *    non di ritentare di più).
 *  · ⛔ E il caso NON si riconosce dal TESTO dell'errore: un 400 con `tools` nel corpo ha altre
 *    cause (una regex PCRE che llama.cpp non compila in GBNF, un template che lancia sull'ordine
 *    dei messaggi, il formato dell'esito di un attrezzo). Si riconosce dal COMPORTAMENTO — la
 *    stessa richiesta senza `tools` riesce. Lo difende BC79-03.
 *
 * ## Come sono fatte queste prove
 * ⛔ Stesso apparato di `tests/bc76-sessione-locale-agente.test.mjs`: registro vero, kernel vero
 *   (`avviaSessione` + `createOwnerRuntimeAdapter`), trasporto vero. L'unica finta è il MOTORE, un
 *   server HTTP vero su 127.0.0.1. La spia su `globalThis.fetch` lascia passare SOLO 127.0.0.1.
 *   Ogni prova spegne le sessioni che accende.
 */
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { createSessionRegistry } from '../src/session-registry.mjs';
import { createOwnerRuntimeAdapter } from '../src/runtime-owner-adapter.mjs';
import { avviaSessione } from '../src/agent-service.mjs';
import { rimuoviCartellaDiProva } from './aiuto/rimuovi-cartella-di-prova.mjs';

/* ------------------------------------------------------------------ la spia sulla rete */

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
const fotogrammaToolCall = (nome, argomenti) => ({
  choices: [{ delta: { tool_calls: [{ index: 0, id: `call_${nome}`, type: 'function', function: { name: nome, arguments: JSON.stringify(argomenti) } }] } }],
});
const fotogrammaTesto = (testo) => ({ choices: [{ delta: { content: testo } }] });

/** I due corpi d'errore VERI dei due motori, presi dalla ricerca: testi diversi, stesso caso. */
const GREZZO_OLLAMA = JSON.stringify({ error: 'registry.ollama.ai/library/qwen3:8b does not support tools' });
const GREZZO_LLAMA = JSON.stringify({ error: { message: 'tools param requires --jinja flag', code: 400, type: 'invalid_request_error' } });
/** ⛔ Un 400 che NON nomina gli attrezzi: è il caso che smaschera un filtro sul testo. */
const GREZZO_ALTRO_MOTIVO = JSON.stringify({ error: { message: 'Failed to parse grammar: unsupported PCRE construct in schema', code: 400, type: 'server_error' } });

/**
 * Accende un motore finto su 127.0.0.1. `rispondi(richiesta, indice)` decide la risposta:
 * `{ stato, testo }` per un errore, `{ frames }` per un flusso SSE riuscito.
 * ⛔ Non decide niente sull'esito del giro: risponde e basta. Le richieste restano leggibili, così
 *   una prova può contare QUANTE ne sono arrivate e QUALI portavano `tools`.
 */
async function accendiMotoreFinto(t, rispondi) {
  const richieste = [];
  const server = createServer((req, res) => {
    let grezzo = '';
    req.on('data', (c) => { grezzo += c; });
    req.on('end', () => {
      let corpo = null;
      try { corpo = JSON.parse(grezzo); } catch { /* il trasporto gestisce il JSON malformato */ }
      const richiesta = {
        url: req.url,
        corpo,
        haTools: Array.isArray(corpo?.tools) && corpo.tools.length > 0,
        haToolChoice: corpo?.tool_choice !== undefined,
      };
      richieste.push(richiesta);
      const esito = rispondi(richiesta, richieste.length - 1);
      if (esito.frames) {
        res.writeHead(200, { 'Content-Type': 'text/event-stream' });
        res.end(sse(esito.frames));
        return;
      }
      res.writeHead(esito.stato, { 'Content-Type': 'application/json' });
      res.end(esito.testo);
    });
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  t.after(() => new Promise((r) => server.close(r)));
  return { porta: server.address().port, richieste };
}

const runtimeLocaleFinto = () => ({
  detect: async () => ({ state: 'observed' }),
  load: async () => {},
  chiamate: 0,
  async *generateStream() { this.chiamate += 1; yield { type: 'done' }; },
});

function registroComeIlServer({ porta, cartella, endpointPerFonte = {}, chiavePerFonte = {}, ...extra }) {
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
    modello: 'vendor/modello',
    chiave: 'k',
    chiaveFn: () => 'k',
    localRuntimes: { 'llama.cpp': runtimeLocaleFinto(), ollama: runtimeLocaleFinto() },
    cartelleProgetto: [{ id: '0', percorso: cartella, nome: 'prova' }],
    preparaEsecuzioneFn: (taskId) => ({ taskId, cartella, task: { consegna: 'fai il tuo lavoro' }, comandoProva: null }),
    fetchModelloFn: () => fetch,
    ...extra,
  });
}

const eFinale = (e) => e.type === 'RunFinished' || e.type === 'RunError';
const attendiFine = async (registro, sessionId, { ms = 20_000 } = {}) => {
  const scadenza = Date.now() + ms;
  while (Date.now() < scadenza) {
    const eventi = registro.esporta(sessionId)?.eventi ?? [];
    if (eventi.some(eFinale)) return eventi;
    await new Promise((r) => setTimeout(r, 20));
  }
  throw new Error(`la sessione ${sessionId} non ha chiuso entro ${ms} ms: ${JSON.stringify((registro.esporta(sessionId)?.eventi ?? []).map((e) => e.type))}`);
};

function cartellaDiProva(t, nome) {
  const cartella = mkdtempSync(join(tmpdir(), `bc792-${nome}-`));
  t.after(() => rimuoviCartellaDiProva(cartella));
  return cartella;
}

function spegniTutteAllaFine(t, registro) {
  t.after(() => { for (const sessione of registro.elenca()) registro.ferma(sessione.sessionId); });
}

/** Il testo che la chat ha davvero mostrato, concatenato: è lì che vive l'avviso di `onAvviso`. */
const testoDetto = (eventi) => eventi.filter((e) => e.type === 'TextMessageContent').map((e) => e.delta).join('');

/** ⛔ Quante volte una frase compare: «una volta sola» è un CONTEGGIO, non un booleano. */
const quanteVolte = (testo, pezzo) => testo.split(pezzo).length - 1;

/** Le parole che NON devono mai arrivare a schermo. */
const NOMI_TECNICI = ['--jinja', 'tools', 'tool_choice', 'HTTP', 'invalid_request_error', '400'];

const localeLlama = { provider: 'local', runtimeId: 'llama.cpp', modelId: 'un-gguf.gguf' };

/* ------------------------------------------------------------------ le prove */

test('⛔⛔⛔ BC79-01 — 400 CON attrezzi e 200 SENZA: due richieste al primo giro, l\'avviso UNA volta, e al giro dopo gli attrezzi non si mandano più', async (t) => {
  const cartella = cartellaDiProva(t, 'riprova-riuscita');
  writeFileSync(join(cartella, 'segnaposto.txt'), 'contenuto');
  /*
   * ⛔ Il motore finto risponde con una chiamata ad attrezzo anche nella risposta SENZA `tools`, e
   *   non è ciò che farebbe un motore vero: è deliberato. Serve un SECONDO giro per osservare che
   *   la memoria del giro di sessione morde davvero, e il kernel fa un secondo giro solo se il
   *   modello chiede un attrezzo. Senza questo, la prova misurerebbe solo il primo giro — cioè
   *   proprio la metà che la ricerca indica come insufficiente («retrying without changes will
   *   loop»).
   */
  let senzaAttrezzi = 0;
  const motore = await accendiMotoreFinto(t, (richiesta) => {
    if (richiesta.haTools) return { stato: 400, testo: GREZZO_LLAMA };
    senzaAttrezzi += 1;
    return { frames: senzaAttrezzi === 1 ? [fotogrammaToolCall('elenca', { percorso: '.' })] : [fotogrammaTesto('ho elencato la cartella')] };
  });
  const registro = registroComeIlServer({ porta: motore.porta, cartella });
  spegniTutteAllaFine(t, registro);

  const { sessionId } = registro.avvia('task-vero', localeLlama);
  const eventi = await attendiFine(registro, sessionId);

  assert.equal(eventi.at(-1).type, 'RunFinished',
    `⛔ dopo la riprova il giro deve arrivare in fondo — eventi: ${JSON.stringify(eventi.map((e) => e.type))} · ultimo: ${JSON.stringify(eventi.at(-1))}`);
  assert.equal(motore.richieste.filter((r) => r.haTools).length, 1,
    `⛔ gli attrezzi si mandano UNA volta sola: dopo il rifiuto non si ritenta a ogni giro — richieste: ${JSON.stringify(motore.richieste.map((r) => r.haTools))}`);
  assert.equal(motore.richieste.length, 3,
    `⛔ atteso: 400 con attrezzi · riprova senza · secondo giro senza — richieste: ${motore.richieste.length}`);
  assert.equal(motore.richieste[1].haTools, false, '⛔ la riprova è IDENTICA tranne gli attrezzi');
  assert.equal(motore.richieste[1].haToolChoice, false, '⛔ via anche `tool_choice`: da solo farebbe fallire la stessa richiesta');
  assert.deepEqual(
    { ...motore.richieste[0].corpo, tools: undefined, tool_choice: undefined },
    { ...motore.richieste[1].corpo, tools: undefined, tool_choice: undefined },
    '⛔ «identica» vuol dire identica: messaggi, modello e ogni altro campo restano quelli',
  );
  assert.equal(motore.richieste[2].haTools, false,
    '⛔ al SECONDO giro gli attrezzi non ci sono più: è la memoria che impedisce il 400 a ogni giro');

  const detto = testoDetto(eventi);
  assert.equal(quanteVolte(detto, 'Questo modello non usa gli attrezzi'), 1,
    `⛔ l'avviso si dice UNA volta sola, non a ogni giro — detto: ${JSON.stringify(detto)}`);
  assert.ok(detto.includes('qui resta una chat'),
    `⛔ l'avviso deve dire che cosa cambia per chi legge — detto: ${JSON.stringify(detto)}`);
  assert.ok(detto.includes('ho elencato la cartella'),
    '⛔ e la risposta del modello deve comunque arrivare a schermo');
  for (const nome of ['--jinja', 'tool_choice', 'invalid_request_error']) {
    assert.ok(!detto.includes(nome), `⛔ nessun nome tecnico a schermo: trovato «${nome}» in ${JSON.stringify(detto)}`);
  }
});

test('⛔⛔⛔ BC79-02 — 400 SEMPRE: due richieste e non quattro, un codice suo, e nessun gergo a schermo', async (t) => {
  const cartella = cartellaDiProva(t, 'riprova-fallita');
  const motore = await accendiMotoreFinto(t, () => ({ stato: 400, testo: GREZZO_LLAMA }));
  const registro = registroComeIlServer({ porta: motore.porta, cartella });
  spegniTutteAllaFine(t, registro);

  const { sessionId } = registro.avvia('task-vero', localeLlama);
  const eventi = await attendiFine(registro, sessionId);
  const ultimo = eventi.at(-1);

  assert.equal(motore.richieste.length, 2,
    `⛔ una richiesta con gli attrezzi e UNA riprova senza: mai quattro — richieste: ${motore.richieste.length}`);
  assert.equal(motore.richieste[0].haTools, true);
  assert.equal(motore.richieste[1].haTools, false);
  assert.equal(ultimo.type, 'RunError');
  assert.equal(ultimo.code, 'LOCAL_ENGINE_REJECTED_REQUEST',
    `⛔ un motore che rifiuta la richiesta non è un guasto interno senza nome — ultimo: ${JSON.stringify(ultimo)}`);
  for (const nome of NOMI_TECNICI) {
    assert.ok(!ultimo.message.includes(nome),
      `⛔ nessun nome tecnico nella frase: trovato «${nome}» in ${JSON.stringify(ultimo.message)}`);
  }
  assert.ok(/motore locale/i.test(ultimo.message),
    `⛔ la frase deve dire CHI ha rifiutato — ${JSON.stringify(ultimo.message)}`);
});

test('⛔⛔⛔⛔ BC79-03 — il caso si riconosce dal COMPORTAMENTO, non dal testo: un 400 che non nomina gli attrezzi ha lo stesso esito', async (t) => {
  const cartella = cartellaDiProva(t, 'altro-motivo');
  const motore = await accendiMotoreFinto(t, (richiesta) => (richiesta.haTools
    ? { stato: 400, testo: GREZZO_ALTRO_MOTIVO }
    : { frames: [fotogrammaTesto('ho risposto senza attrezzi')] }));
  const registro = registroComeIlServer({ porta: motore.porta, cartella });
  spegniTutteAllaFine(t, registro);

  const { sessionId } = registro.avvia('task-vero', localeLlama);
  const eventi = await attendiFine(registro, sessionId);

  assert.equal(eventi.at(-1).type, 'RunFinished',
    `⛔ un filtro sul TESTO dell'errore non riconoscerebbe questo caso e il giro morirebbe — ultimo: ${JSON.stringify(eventi.at(-1))}`);
  assert.equal(motore.richieste.length, 2);
  assert.equal(motore.richieste[1].haTools, false);
  assert.ok(testoDetto(eventi).includes('ho risposto senza attrezzi'));
});

test('⛔⛔⛔⛔ BC79-04 — una sessione CLOUD che prende 400 NON si riprova senza attrezzi', async (t) => {
  const cartella = cartellaDiProva(t, 'cloud');
  const motore = await accendiMotoreFinto(t, (richiesta) => (richiesta.haTools
    ? { stato: 400, testo: GREZZO_LLAMA }
    : { frames: [fotogrammaTesto('non deve mai succedere')] }));
  const registro = registroComeIlServer({
    porta: 0, cartella,
    endpointPerFonte: { deepseek: `http://127.0.0.1:${motore.porta}` },
    chiavePerFonte: { deepseek: 'chiave-finta' },
    prontoFn: () => ({ pronto: true }),
  });
  spegniTutteAllaFine(t, registro);

  const { sessionId, erroreAvvio } = registro.avvia('task-vero', { modelloScelto: 'deepseek:un-modello' });
  assert.equal(erroreAvvio, undefined, `avvio rifiutato: ${erroreAvvio}`);
  const eventi = await attendiFine(registro, sessionId);

  assert.equal(motore.richieste.filter((r) => !r.haTools).length, 0,
    `⛔ un fornitore CLOUD che rifiuta gli attrezzi è un errore da dire, non da aggirare togliendoli — richieste senza attrezzi: ${JSON.stringify(motore.richieste.map((r) => r.haTools))}`);
  assert.equal(motore.richieste.length, 1, '⛔ un 400 dal cloud resta un tentativo solo');
  assert.equal(eventi.at(-1).type, 'RunError');
  assert.notEqual(eventi.at(-1).code, 'LOCAL_ENGINE_REJECTED_REQUEST',
    '⛔ e non deve indossare il codice del motore locale');
});

test('⛔⛔ BC79-05 — i codici del ritento, contati sul motore: 401 e 400 un tentativo, 429 e 503 quattro', async (t) => {
  const cartella = cartellaDiProva(t, 'ritento');
  const registro = registroComeIlServer({ porta: 0, cartella });
  spegniTutteAllaFine(t, registro);

  /* Un motore per stato: il conteggio delle richieste È la misura, non una lettura del codice. */
  const conta = async (stato) => {
    const motore = await accendiMotoreFinto(t, () => ({ stato, testo: JSON.stringify({ error: { message: 'no' } }) }));
    const suo = registroComeIlServer({ porta: motore.porta, cartella });
    spegniTutteAllaFine(t, suo);
    const { sessionId } = suo.avvia('task-vero', localeLlama);
    const eventi = await attendiFine(suo, sessionId, { ms: 30_000 });
    return { richieste: motore.richieste.length, senzaAttrezzi: motore.richieste.filter((r) => !r.haTools).length, ultimo: eventi.at(-1) };
  };

  const a401 = await conta(401);
  assert.equal(a401.richieste, 1, `⛔ una credenziale rifiutata non migliora ritentando — richieste: ${a401.richieste}`);
  assert.equal(a401.senzaAttrezzi, 0, '⛔ e un 401 non è il caso degli attrezzi: nessuna riprova senza');
  assert.ok(/dopo 1 tentativo\b/.test(a401.ultimo.message),
    `⛔ il messaggio deve dire i tentativi VERI, non la costante 4 — ${JSON.stringify(a401.ultimo.message)}`);

  const a429 = await conta(429);
  assert.equal(a429.richieste, 4, `⛔ un limite di traffico si ritenta come sempre — richieste: ${a429.richieste}`);
  assert.ok(/dopo 4 tentativi\b/.test(a429.ultimo.message), JSON.stringify(a429.ultimo.message));

  const a503 = await conta(503);
  assert.equal(a503.richieste, 4, `⛔ un guasto del motore si ritenta come sempre — richieste: ${a503.richieste}`);

  registro.elenca();
});

test('⛔⛔ BC79-06 — la stessa cura vale per OLLAMA, che non passa dal ponte del supervisore', async (t) => {
  const cartella = cartellaDiProva(t, 'ollama');
  const motore = await accendiMotoreFinto(t, (richiesta) => (richiesta.haTools
    ? { stato: 400, testo: GREZZO_OLLAMA }
    : { frames: [fotogrammaTesto('ciao da ollama')] }));
  /* ⛔ `porta: 0` per il ponte del supervisore: se la richiesta passasse di lì fallirebbe, invece
     di arrivare all'indirizzo di Ollama. La prova sa distinguere le due strade. */
  const registro = registroComeIlServer({
    porta: 0, cartella,
    endpointPerFonte: { ollama: `http://127.0.0.1:${motore.porta}` },
  });
  spegniTutteAllaFine(t, registro);

  const { sessionId } = registro.avvia('task-vero', { provider: 'local', runtimeId: 'ollama', modelId: 'qwen3:8b' });
  const eventi = await attendiFine(registro, sessionId);

  assert.equal(eventi.at(-1).type, 'RunFinished', `ultimo: ${JSON.stringify(eventi.at(-1))}`);
  assert.equal(motore.richieste.length, 2,
    `⛔ anche per Ollama: 400 con attrezzi, UNA riprova senza — richieste: ${motore.richieste.length}`);
  assert.equal(motore.richieste[1].haTools, false);
  assert.equal(motore.richieste[1].corpo.model, 'qwen3:8b', '⛔ al motore arriva il nome nudo, riprova compresa');
  assert.ok(testoDetto(eventi).includes('Questo modello non usa gli attrezzi'));
});

test('⛔⛔ BC79-07 — le fonti di motore locale si DERIVANO dal registro dei fornitori, non si scrivono a mano', async () => {
  const { FONTI_DI_MOTORE_LOCALE } = await import('../src/runtime-owner-adapter.mjs');
  const { idPerWire, ID_MOTORI_LOCALI_OPENAI, REGISTRO_FORNITORI } = await import('../src/provider-registry.mjs');

  assert.ok(FONTI_DI_MOTORE_LOCALE instanceof Set, '⛔ un insieme, non un array da cercare con includes');
  assert.deepEqual([...FONTI_DI_MOTORE_LOCALE].sort(), [...idPerWire('locale'), ...ID_MOTORI_LOCALI_OPENAI].sort(),
    '⛔ l\'insieme si deriva dal registro: un fornitore locale aggiunto domani deve entrarci da solo');
  assert.deepEqual([...FONTI_DI_MOTORE_LOCALE].sort(), ['lmstudio', 'local', 'ollama'],
    '⛔ misurato oggi: sono questi tre. Se il registro cambia, cambia la riga sopra, non questa cura');
  /* ⛔ Il verso contrario: nessun fornitore che gira ALTROVE deve essere dentro. */
  for (const id of Object.keys(REGISTRO_FORNITORI)) {
    if (FONTI_DI_MOTORE_LOCALE.has(id)) continue;
    assert.notEqual(REGISTRO_FORNITORI[id].esecuzione, 'runtime locale', `${id} gira in casa e non è nell'insieme`);
  }
  for (const id of FONTI_DI_MOTORE_LOCALE) {
    assert.ok(['runtime locale', 'motore locale'].includes(REGISTRO_FORNITORI[id].esecuzione),
      `⛔ ${id} è nell'insieme ma il registro dice che non gira in casa: ${REGISTRO_FORNITORI[id].esecuzione}`);
  }
});

test('⛔⛔⛔⛔ BC79-09 — col PORTACHIAVI collegato (la configurazione del 4174 vero) la cura regge, e l\'errore non si riclassifica', async (t) => {
  /*
   * ⛔ Le prove qui sopra girano sulla strada SEMPLICE: senza `providerStore` e senza catena di
   *   riserva, `creaFetchMultiProvider` restituisce direttamente la fetch instradata. Il server
   *   vero, invece, il portachiavi ce l'ha — e quella è un'ALTRA strada: `invia` avvolge ogni
   *   richiesta in `rete`, che legge i non-ok, li classifica, mette la chiave in panchina e
   *   sostituisce il corpo con un messaggio pubblico. Due cose potevano rompersi solo lì, e una
   *   prova che non passa da quella strada non le vedrebbe:
   *     1. `creaFetchInstradata` viene RICOSTRUITA a ogni richiesta ⇒ una memoria tenuta in quella
   *        chiusura durerebbe un giro solo, e il 400 tornerebbe a ogni turno;
   *     2. il `catch` di `invia` rimpiazza l'eccezione con `contesto.errore` ⇒ la frase umana
   *        diventerebbe «Il fornitore non ha accettato la richiesta», cioè il generico che questa
   *        riga esiste per togliere.
   */
  const cartella = cartellaDiProva(t, 'portachiavi');
  let senzaAttrezzi = 0;
  const motore = await accendiMotoreFinto(t, (richiesta) => {
    if (richiesta.haTools) return { stato: 400, testo: GREZZO_OLLAMA };
    senzaAttrezzi += 1;
    return { frames: senzaAttrezzi === 1 ? [fotogrammaToolCall('elenca', { percorso: '.' })] : [fotogrammaTesto('ho elencato')] };
  });
  const panchine = [];
  const portachiaviFinto = {
    scegliChiave: () => null,
    hasKey: () => false,
    elencaPool: () => [],
    mettiInPanchina: (fonte, impronta, dettagli) => { panchine.push({ fonte, impronta, ...dettagli }); },
    getRuntime: () => ({ timeoutSeconds: 0 }),
  };
  const destinazioneModelloDeps = {
    leggiChiave: () => null,
    leggiRuntime: (fonte) => ({ endpoint: fonte === 'ollama' ? `http://127.0.0.1:${motore.porta}` : null }),
    localePronto: () => true,
    chiamaLocale: async () => { throw new Error('questa sessione non passa dal ponte del supervisore'); },
    avviaLocale: async () => {},
  };
  const ownerRuntime = createOwnerRuntimeAdapter({ destinazioneModelloDeps, providerStore: portachiaviFinto });
  const registro = createSessionRegistry({
    avviaSessioneFn: (input) => avviaSessione({ ...input, talosLavoraFn: (ri) => ownerRuntime.talosLavora(ri) }),
    modello: 'vendor/modello', chiave: 'k', chiaveFn: () => 'k',
    localRuntimes: { ollama: runtimeLocaleFinto() },
    cartelleProgetto: [{ id: '0', percorso: cartella, nome: 'prova' }],
    preparaEsecuzioneFn: (taskId) => ({ taskId, cartella, task: { consegna: 'fai il tuo lavoro' }, comandoProva: null }),
    fetchModelloFn: () => fetch,
  });
  spegniTutteAllaFine(t, registro);

  const { sessionId } = registro.avvia('task-vero', { provider: 'local', runtimeId: 'ollama', modelId: 'qwen3:8b' });
  const eventi = await attendiFine(registro, sessionId);

  assert.equal(eventi.at(-1).type, 'RunFinished', `ultimo: ${JSON.stringify(eventi.at(-1))}`);
  assert.equal(motore.richieste.filter((r) => r.haTools).length, 1,
    `⛔ anche col portachiavi la memoria deve durare TUTTO il giro di sessione — con attrezzi: ${JSON.stringify(motore.richieste.map((r) => r.haTools))}`);
  assert.equal(motore.richieste.length, 3, `richieste: ${motore.richieste.length}`);
  assert.equal(quanteVolte(testoDetto(eventi), 'Questo modello non usa gli attrezzi'), 1);
});

test('⛔⛔⛔ BC79-10 — col portachiavi, un motore che rifiuta SEMPRE porta il codice suo, non il generico del fornitore', async (t) => {
  const cartella = cartellaDiProva(t, 'portachiavi-fallito');
  const motore = await accendiMotoreFinto(t, () => ({ stato: 400, testo: GREZZO_OLLAMA }));
  const portachiaviFinto = {
    scegliChiave: () => null, hasKey: () => false, elencaPool: () => [],
    mettiInPanchina: () => {}, getRuntime: () => ({ timeoutSeconds: 0 }),
  };
  const destinazioneModelloDeps = {
    leggiChiave: () => null,
    leggiRuntime: (fonte) => ({ endpoint: fonte === 'ollama' ? `http://127.0.0.1:${motore.porta}` : null }),
    localePronto: () => true,
    chiamaLocale: async () => { throw new Error('non di qui'); },
    avviaLocale: async () => {},
  };
  const ownerRuntime = createOwnerRuntimeAdapter({ destinazioneModelloDeps, providerStore: portachiaviFinto });
  const registro = createSessionRegistry({
    avviaSessioneFn: (input) => avviaSessione({ ...input, talosLavoraFn: (ri) => ownerRuntime.talosLavora(ri) }),
    modello: 'vendor/modello', chiave: 'k', chiaveFn: () => 'k',
    localRuntimes: { ollama: runtimeLocaleFinto() },
    cartelleProgetto: [{ id: '0', percorso: cartella, nome: 'prova' }],
    preparaEsecuzioneFn: (taskId) => ({ taskId, cartella, task: { consegna: 'fai il tuo lavoro' }, comandoProva: null }),
    fetchModelloFn: () => fetch,
  });
  spegniTutteAllaFine(t, registro);

  const { sessionId } = registro.avvia('task-vero', { provider: 'local', runtimeId: 'ollama', modelId: 'qwen3:8b' });
  const ultimo = (await attendiFine(registro, sessionId)).at(-1);

  assert.equal(ultimo.type, 'RunError');
  assert.equal(ultimo.code, 'LOCAL_ENGINE_REJECTED_REQUEST',
    `⛔ il catch di \`invia\` non deve riclassificarlo in un guasto del fornitore — ultimo: ${JSON.stringify(ultimo)}`);
  assert.equal(motore.richieste.length, 2, `⛔ una con attrezzi, UNA senza — richieste: ${motore.richieste.length}`);
  for (const nome of NOMI_TECNICI) {
    assert.ok(!ultimo.message.includes(nome), `⛔ trovato «${nome}» in ${JSON.stringify(ultimo.message)}`);
  }
});

test('⛔⛔ BC79-08 — niente è uscito da 127.0.0.1 in nessuna prova di questo file', () => {
  assert.deepEqual(fuori, [], `⛔ uscite verso la rete vera: ${JSON.stringify(fuori)}`);
});
