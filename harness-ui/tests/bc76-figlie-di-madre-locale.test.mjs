/*
 * ⛔⛔⛔⛔ BC-76, SECONDO GIRO (17/09/2026) — LE FIGLIE DI UNA MADRE LOCALE USCIVANO SUL CLOUD.
 *
 * ## Come è saltato fuori
 *
 * La cura di BC-76 fa una cosa sola ma grossa: una sessione `provider:'local'` adesso ESEGUE gli
 * attrezzi. Fra i 45 attrezzi ce ne sono due che aprono una SESSIONE NUOVA — `delega_sottotask` e
 * `research_start` — e nessuno dei due era stato scritto pensando a una madre locale, perché prima
 * una madre locale non poteva chiamarli.
 *
 * Misurato con la rete intercettata (nessun byte è uscito davvero), sul commit `a0d2fda5`:
 *
 *     RICHIESTE USCITE DAL COMPUTER: [{"host":"openrouter.ai","model":"mio.gguf","contieneSegreto":true}]
 *     FIGLIE: [{"provider":"cloud","modello":"mio.gguf","runtimeId":null}]
 *
 * ⇒ Il testo che la madre LOCALE aveva delegato partiva verso openrouter.ai, **senza nessun
 *   consenso al ripiego**, con il nome di un file GGUF come nome di modello.
 *
 * ## La causa, in due righe
 *
 * `subagent-orchestrator.mjs` passava alla figlia `modelloRichiesta: padre.modello`, e per una
 * madre locale `voce.modello` è il `modelId` NUDO del GGUF — che `separaFonteModello` legge come
 * OpenRouter. `session-registry.mjs` (`onRicercaAvvia`) faceva il contrario ma con lo stesso esito:
 * per una madre locale passava `modello: null`, cioè il modello DI SERIE del server, che è cloud.
 * Due strade, un solo difetto: **la figlia di una sessione locale non restava in casa**.
 *
 * ⛔ Sulla strada (A) della chat non succedeva: lì la madre ha già `local:<id>` dentro `modello`,
 *   perché ce l'ha messo il selettore. È di nuovo la stessa asimmetria che BC-76 ha chiuso.
 *
 * ## Come sono fatte queste prove
 *
 * ⛔ `globalThis.fetch` è sostituita da una spia che lascia passare SOLO 127.0.0.1 e risponde 401 a
 *   tutto il resto, registrando host, modello e se il corpo conteneva il segreto della madre.
 *   Nessuna prova di questo file può toccare la rete vera, e il conteggio `fuori.length` è
 *   l'asserzione che conta. ⛔ `leggiRuntime('openrouter')` DEVE dare un indirizzo: senza, il
 *   guasto di risoluzione maschererebbe la fuga e la prova sarebbe verde per il motivo sbagliato.
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

const SEGRETO = 'SEGRETO-DELLA-MADRE';

/* ---------------------------------------------------------------- la spia sulla rete */

const fuori = [];
const fetchVera = globalThis.fetch;
globalThis.fetch = async (url, init) => {
  const indirizzo = new URL(typeof url === 'string' ? url : url.url);
  if (indirizzo.hostname === '127.0.0.1') return fetchVera(url, init);
  let corpo = null;
  try { corpo = JSON.parse(init?.body ?? 'null'); } catch { /* un corpo illeggibile è comunque un'uscita */ }
  fuori.push({ host: indirizzo.hostname, model: corpo?.model ?? null, contieneSegreto: JSON.stringify(corpo ?? '').includes(SEGRETO) });
  return new Response(JSON.stringify({ error: { message: 'intercettato dalla prova' } }), { status: 401, headers: { 'Content-Type': 'application/json' } });
};

/* ---------------------------------------------------------------- il motore finto, vero HTTP */

const sse = (frames) => frames.map((f) => `data: ${JSON.stringify(f)}\n\n`).join('') + 'data: [DONE]\n\n';
const chiamata = (nome, argomenti) => ({ choices: [{ delta: { tool_calls: [{ index: 0, id: `call_${nome}`, type: 'function', function: { name: nome, arguments: JSON.stringify(argomenti) } }] } }] });
const testo = (s) => ({ choices: [{ delta: { content: s } }] });

async function accendiMotore(t, copione) {
  const richieste = [];
  let giro = 0;
  const server = createServer((req, res) => {
    let corpo = '';
    req.on('data', (c) => { corpo += c; });
    req.on('end', () => {
      try { richieste.push(JSON.parse(corpo)); } catch { richieste.push(null); }
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

/** Il registro cablato come `server.mjs`, con OpenRouter RAGGIUNGIBILE — vedi la nota di testa. */
function registroComeIlServer({ porta, cartella, endpointPerFonte = {}, chiavePerFonte = {} }) {
  const destinazioneModelloDeps = {
    leggiChiave: (fonte) => (fonte === 'openrouter' ? 'chiave-finta-openrouter' : (chiavePerFonte[fonte] ?? null)),
    leggiRuntime: (fonte) => ({ endpoint: fonte === 'openrouter' ? 'https://openrouter.ai/api/v1' : (endpointPerFonte[fonte] ?? null) }),
    localePronto: () => true,
    chiamaLocale: (percorso, opzioni) => fetchVera(`http://127.0.0.1:${porta}${percorso}`, opzioni),
    avviaLocale: async () => {},
  };
  const ownerRuntime = createOwnerRuntimeAdapter({ destinazioneModelloDeps });
  return createSessionRegistry({
    avviaSessioneFn: (input) => avviaSessione({ ...input, talosLavoraFn: (ri) => ownerRuntime.talosLavora(ri) }),
    modello: 'vendor/modello-di-serie',
    chiave: 'chiave-finta-openrouter',
    chiaveFn: () => 'chiave-finta-openrouter',
    prontoFn: () => ({ pronto: true }),
    localRuntimes: { 'llama.cpp': { detect: async () => ({}), load: async () => {} } },
    cartelleProgetto: [{ id: '0', percorso: cartella, nome: 'prova' }],
    preparaEsecuzioneFn: (taskId) => ({ taskId, cartella, task: { consegna: 'fai il tuo lavoro' }, comandoProva: null }),
    fetchModelloFn: () => globalThis.fetch,
  });
}

const attendiFine = async (registro, sessionId, ms = 20_000) => {
  const scadenza = Date.now() + ms;
  while (Date.now() < scadenza) {
    const eventi = registro.esporta(sessionId)?.eventi ?? [];
    if (eventi.some((e) => e.type === 'RunFinished' || e.type === 'RunError')) return eventi;
    await new Promise((r) => setTimeout(r, 20));
  }
  throw new Error(`la sessione ${sessionId} non ha chiuso il giro: ${JSON.stringify((registro.esporta(sessionId)?.eventi ?? []).map((e) => e.type))}`);
};

/**
 * Aspetta che la figlia nasca, la FERMA e aspetta che chiuda.
 *
 * ⛔ Fermarla non è pulizia: è la condizione perché la misura sia leggibile. Una figlia lasciata
 *   viva continua a ritentare mentre la prova SUCCESSIVA misura le uscite dalla rete, e la sua fuga
 *   compare nella finestra di un'altra — misurato: FIG-03 è fallita per la fuga di FIG-02, cioè un
 *   rosso vero attribuito alla prova sbagliata. E lasciarla viva appende il processo (un file morto
 *   al `timeout 150` con `duration_ms 149997`).
 * ⛔ Lo stop NON falsa la misura di ciò che interessa: il modello con cui la figlia è nata e
 *   l'indirizzo della sua PRIMA richiesta sono già decisi quando arriva.
 */
const attendiFigliaEFermala = async (registro, padreId, { finoA = null, ms = 20_000 } = {}) => {
  const scadenza = Date.now() + ms;
  while (Date.now() < scadenza) {
    const figlie = registro.elenca().filter((s) => s.padreId === padreId);
    if (figlie.length > 0) {
      const figlia = figlie[0];
      /* ⛔ `finoA` esiste perché fermare la figlia APPENA nata misura solo la sua nascita: la prima
         volta FIG-01 è rimasta rossa su «2 richieste al motore» proprio così, cioè uccisa prima di
         parlare. Chi vuole misurare anche DOVE parla aspetta quel fatto, con un tetto. */
      if (typeof finoA === 'function') {
        const tetto = Date.now() + 10_000;
        while (Date.now() < tetto && !finoA()) await new Promise((r) => setTimeout(r, 20));
      }
      registro.ferma(figlia.sessionId);
      try { await attendiFine(registro, figlia.sessionId, 10_000); } catch { /* già conclusa, o chiusa dallo stop */ }
      return figlia;
    }
    await new Promise((r) => setTimeout(r, 20));
  }
  throw new Error('nessuna figlia è mai nata');
};

function cartellaDiProva(t, nome) {
  const cartella = mkdtempSync(join(tmpdir(), `bc76-figlie-${nome}-`));
  t.after(() => rimuoviCartellaDiProva(cartella));
  return cartella;
}

/**
 * ⛔ Misurato, non precauzionale: senza questa riga la prova della RICERCA lasciava il processo
 *   appeso (il file è morto al `timeout 150`, `duration_ms 149997`) perché la figlia continua a
 *   vivere dopo l'asserzione — ritenta, aspetta, ritenta. Una prova che non spegne ciò che accende
 *   appende l'INTERA suite di backend, non solo sé stessa.
 */
function spegniTutteAllaFine(t, registro) {
  t.after(() => { for (const sessione of registro.elenca()) registro.ferma(sessione.sessionId); });
}

/* ---------------------------------------------------------------- le prove */

test('⛔⛔⛔⛔ FIG-01 — la figlia DELEGATA da una madre locale resta sul motore locale: niente esce dal computer', async (t) => {
  const partenza = fuori.length;
  const cartella = cartellaDiProva(t, 'delega');
  writeFileSync(join(cartella, 'a.txt'), 'contenuto');
  const motore = await accendiMotore(t, [
    [chiamata('delega_sottotask', { task: `${SEGRETO}: riassumi a.txt` })],
    [testo('fatto')],
  ]);
  const registro = registroComeIlServer({ porta: motore.porta, cartella });
  spegniTutteAllaFine(t, registro);

  const { sessionId } = registro.avvia('task-vero', { provider: 'local', runtimeId: 'llama.cpp', modelId: 'mio.gguf' });
  const figlia = await attendiFigliaEFermala(registro, sessionId, {
    finoA: () => motore.richieste.some((r) => JSON.stringify(r?.messages ?? '').includes(SEGRETO)),
  });
  try { await attendiFine(registro, sessionId, 10_000); } catch { /* la madre puo restare appesa sull attrezzo della figlia fermata: non e cio che si misura qui */ }

  assert.equal(figlia.modello, 'local:mio.gguf',
    `⛔ la figlia deve ereditare il nome in forma di RETE, non il nome nudo del GGUF — figlia: ${JSON.stringify(figlia.modello)}`);
  assert.deepEqual(fuori.slice(partenza), [],
    `⛔ NIENTE deve uscire da 127.0.0.1: chi ha scelto il locale l'ha scelto per questo — uscite: ${JSON.stringify(fuori.slice(partenza))}`);
  /* ⛔ E non basta che non esca: la figlia deve aver parlato DAVVERO col motore locale. Senza
     questa riga la prova resterebbe verde anche se la figlia non partisse affatto. */
  assert.ok(motore.richieste.length >= 3,
    `⛔ due giri della madre più almeno uno della figlia: richieste al motore locale = ${motore.richieste.length}`);
  assert.ok(motore.richieste.some((r) => JSON.stringify(r?.messages ?? '').includes(SEGRETO)),
    '⛔ il compito delegato deve arrivare al motore LOCALE');
});

test('⛔⛔⛔⛔ FIG-02 — la RICERCA approfondita avviata da una madre locale resta sul motore locale', async (t) => {
  const partenza = fuori.length;
  const cartella = cartellaDiProva(t, 'ricerca');
  const motore = await accendiMotore(t, [
    [chiamata('research_start', { question: `${SEGRETO}: quanto è grande la luna?`, depth: 'quick' })],
    [testo('avviata')],
  ]);
  const registro = registroComeIlServer({ porta: motore.porta, cartella });
  spegniTutteAllaFine(t, registro);

  const { sessionId } = registro.avvia('task-vero', { provider: 'local', runtimeId: 'llama.cpp', modelId: 'mio.gguf' });
  const figlia = await attendiFigliaEFermala(registro, sessionId);
  try { await attendiFine(registro, sessionId, 10_000); } catch { /* la madre puo restare appesa sull attrezzo della figlia fermata: non e cio che si misura qui */ }

  assert.equal(figlia.modello, 'local:mio.gguf',
    `⛔ la ricerca di una madre locale NON parte sul modello di serie del server — figlia: ${JSON.stringify(figlia.modello)}`);
  assert.deepEqual(fuori.slice(partenza), [],
    `⛔ una ricerca avviata da una sessione locale non esce dal computer — uscite: ${JSON.stringify(fuori.slice(partenza))}`);
});

test('⛔⛔ FIG-03 — una madre CLOUD passa alla figlia il SUO modello, esattamente come prima', async (t) => {
  const partenza = fuori.length;
  const cartella = cartellaDiProva(t, 'cloud');
  writeFileSync(join(cartella, 'a.txt'), 'contenuto');
  const motore = await accendiMotore(t, [
    [chiamata('delega_sottotask', { task: 'riassumi a.txt' })],
    [testo('fatto')],
  ]);
  /* ⛔ Il fornitore della madre è un cloud con indirizzo configurabile, puntato al motore finto:
     così la non-regressione si misura senza che un byte esca davvero. */
  const registro = registroComeIlServer({
    porta: motore.porta, cartella,
    endpointPerFonte: { deepseek: `http://127.0.0.1:${motore.porta}` },
    chiavePerFonte: { deepseek: 'chiave-finta' },
  });
  spegniTutteAllaFine(t, registro);

  const { sessionId } = registro.avvia('task-vero', { modelloScelto: 'deepseek:un-modello' });
  const figlia = await attendiFigliaEFermala(registro, sessionId);
  try { await attendiFine(registro, sessionId, 10_000); } catch { /* la madre puo restare appesa sull attrezzo della figlia fermata: non e cio che si misura qui */ }

  assert.equal(figlia.modello, 'deepseek:un-modello',
    '⛔ l\'eredità del modello per una madre cloud non deve cambiare di una virgola (regola del 06/09: chi paga deve sapere cosa paga)');
  assert.deepEqual(fuori.slice(partenza), [], `uscite impreviste: ${JSON.stringify(fuori.slice(partenza))}`);
});
