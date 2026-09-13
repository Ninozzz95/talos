/*
 * ⭐⭐⭐ BC-07 — I TEMPI DI UN GIRO FINISCONO SUL DISCO, UNA RIGA PER GIRO.
 *
 * Owner 11/09/2026: «dobbiamo indagare perché ci sta così tanto a rispondere usando i modelli api».
 * La prima indagine si è potuta fare solo sui TOKEN, perché il tempo non era registrato da nessuna
 * parte: `metricheDaEventi` lo calcola, ma dagli istanti in `voce.istantiEvento`, che vivono solo
 * in memoria. ⇒ Nessuna sessione passata era misurabile, e di latenza si parlava per aneddoti.
 *
 * ⛔ L'obiezione che teneva i tempi fuori dal disco era seria e resta valida: un campo per evento
 *   finirebbe in ogni riga di ogni sessione (22.095 righe, in quella che ha aperto il debito).
 *   Qui si scrive UNA riga per giro, accanto a `messaggi-finali`. Nella stessa sessione: una riga
 *   per giro invece di un campo su 22.095.
 *
 * ⭐ Ricerca 11/09/2026 (ClickHouse «LLM inference latency: TTFT, tokens per second, and what to
 *   measure»; Braintrust «LLM call observability»; groundcover «AI Agent Observability»): il TTFT
 *   da solo non è interpretabile — «una regressione del TTFT spesso si scopre essere un prompt che
 *   è cresciuto». ⇒ nella stessa riga devono esserci i TOKEN IN INGRESSO di quel giro, o il tempo
 *   resta un numero senza denominatore. È esattamente il nostro caso: ~17k token di elenco file.
 */

import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { createSessionRegistry, durateRagionamentoDaEventi, durateRagionamentoDaRecord } from '../src/session-registry.mjs';
import { rimuoviCartellaDiProva } from './aiuto/rimuovi-cartella-di-prova.mjs';

/** Legge i record `tipo:'tempi-giro'` scritti per una sessione. */
function tempiScritti(cartellaStore, sessionId) {
  const testo = readFileSync(join(cartellaStore, `${sessionId}.jsonl`), 'utf8');
  return testo.split('\n').filter(Boolean)
    .map((r) => { try { return JSON.parse(r); } catch { return null; } })
    .filter((r) => r?.tipo === 'tempi-giro');
}

/**
 * Una sessione finta con un orologio che AVANZA: senza, ogni istante sarebbe lo stesso e il tempo
 * al primo token verrebbe 0 — cioè la prova direbbe verde misurando il nulla.
 */
function bancoDiProva() {
  const cartellaStore = mkdtempSync(join(tmpdir(), 'talos-tempi-'));
  let adesso = 1_700_000_000_000;
  const clock = () => new Date(adesso);
  const avanza = (ms) => { adesso += ms; };
  let onEvento = null;
  let concludi = null;
  const registro = createSessionRegistry({
    cartellaStore,
    clock,
    avviaSessioneFn: (input) => {
      onEvento = input.onEvento;
      onEvento({ type: 'RunStarted', threadId: 't', runId: 'r', input: input.task, contesto: {} });
      return new Promise((resolve) => { concludi = resolve; });
    },
    preparaEsecuzioneLiberaFn: (cartelleProgetto, { cartellaId, consegna }) => {
      const voce = cartelleProgetto.find((c) => c.id === cartellaId);
      return { cartella: voce.percorso, comandoProva: 'npm test', task: { consegna, consegnaCorta: consegna } };
    },
    cartelleProgetto: [{ id: '0', percorso: '/tmp/progetto', nome: 'progetto' }],
    modello: 'z-ai/glm-5.3-flash', chiave: 'k',
  });
  return {
    cartellaStore, registro, avanza,
    get emetti() { return onEvento; },
    finisci(messaggiFinali = [{ role: 'user', content: 'ciao' }]) {
      onEvento({ type: 'RunFinished' });
      concludi({ ok: true, esito: { messaggiFinali } });
    },
    pulisci() { rimuoviCartellaDiProva(cartellaStore); },
  };
}

test('⭐⭐⭐ alla fine di un giro il tempo al primo token finisce sul DISCO, col suo denominatore in token', async (t) => {
  const banco = bancoDiProva();
  t.after(() => banco.pulisci());

  const { sessionId } = banco.registro.avviaLibero({ cartellaId: '0', consegna: 'misura questo giro' });
  await new Promise((r) => setImmediate(r));

  /* 2,4 secondi prima che il modello apra bocca: è il numero che deve ritrovarsi sul disco. */
  banco.avanza(2_400);
  banco.emetti({ type: 'TextMessageStart', messageId: 'm1', role: 'assistant' });
  banco.emetti({ type: 'TextMessageContent', messageId: 'm1', delta: 'ecco' });
  banco.emetti({ type: 'StateDelta', delta: [{ op: 'replace', path: '/usage', value: { prompt_tokens: 29_148, completion_tokens: 151, cached_tokens: 0, giri: 1 } }] });
  banco.avanza(600);
  banco.emetti({ type: 'TextMessageEnd', messageId: 'm1' });
  banco.finisci();
  await new Promise((r) => setImmediate(r));

  const righe = tempiScritti(banco.cartellaStore, sessionId);
  assert.equal(righe.length, 1, 'una riga per giro: né zero né una per evento');
  const riga = righe[0];
  assert.equal(riga.primoTokenMs, 2_400, '⛔ il tempo al primo token deve essere quello VERO, non uno zero di comodo');
  assert.equal(riga.tokenDentro, 29_148, '⛔ senza i token in ingresso il tempo non è interpretabile: è il vincolo della ricerca');
  assert.equal(riga.tokenDaCache, 0);
  assert.equal(riga.modello, 'z-ai/glm-5.3-flash', 'il modello sta nella riga: due modelli non si confrontano fra loro senza saperlo');
});

/* ───────────── ⭐⭐ 13/09 sera — QUANTO HA RAGIONATO, sul disco («fare meglio di Hermes», punto 3) ─────────────
 * Hermes desktop perde la durata del ragionamento a ogni ricarica e lo dichiara nel suo codice
 * (`activity-timer.ts`). Qui finisce nel record `tempi-giro`, una riga per giro, senza toccare gli eventi. */

/** Aspetta che l'evento di fine giro sia arrivato sul disco: le righe degli eventi si scrivono senza attesa. */
async function aspettaFineGiroSulDisco(cartellaStore, sessionId) {
  for (let i = 0; i < 200; i += 1) {
    try {
      if (readFileSync(join(cartellaStore, `${sessionId}.jsonl`), 'utf8').includes('"type":"RunFinished"')) return;
    } catch { /* il file può non esistere ancora */ }
    await new Promise((r) => setTimeout(r, 10));
  }
  throw new Error('la fine del giro non è mai arrivata sul disco: il ripristino misurerebbe un file a metà');
}

test('⭐⭐ la durata di OGNI ragionamento finisce nel record del giro, col suo valore vero', async (t) => {
  const banco = bancoDiProva();
  t.after(() => banco.pulisci());
  const { sessionId } = banco.registro.avviaLibero({ cartellaId: '0', consegna: 'ragiona e poi rispondi' });
  await new Promise((r) => setImmediate(r));

  banco.avanza(300);
  banco.emetti({ type: 'ReasoningMessageStart', messageId: 'r1', role: 'reasoning' });
  banco.emetti({ type: 'ReasoningMessageContent', messageId: 'r1', delta: 'Devo leggere i test.' });
  banco.avanza(4_200);
  banco.emetti({ type: 'ReasoningMessageEnd', messageId: 'r1' });
  banco.avanza(100);
  banco.emetti({ type: 'TextMessageStart', messageId: 'm1', role: 'assistant' });
  banco.emetti({ type: 'TextMessageEnd', messageId: 'm1' });
  banco.finisci();
  await new Promise((r) => setImmediate(r));

  const [riga] = tempiScritti(banco.cartellaStore, sessionId);
  assert.deepEqual(riga.ragionamentiMs, { r1: 4_200 }, '⛔ la durata VERA del ragionamento, non uno zero e non il tempo del giro intero');
});

test('⛔⛔ AL CONTRARIO — un ragionamento senza la sua fine non ha durata, e un giro senza ragionamenti non scrive il campo', async (t) => {
  const banco = bancoDiProva();
  t.after(() => banco.pulisci());
  const { sessionId } = banco.registro.avviaLibero({ cartellaId: '0', consegna: 'fermato a metà' });
  await new Promise((r) => setImmediate(r));
  banco.avanza(500);
  banco.emetti({ type: 'ReasoningMessageStart', messageId: 'r-fermo', role: 'reasoning' });
  banco.avanza(2_000);
  banco.emetti({ type: 'TextMessageStart', messageId: 'm1', role: 'assistant' });
  banco.emetti({ type: 'TextMessageEnd', messageId: 'm1' });
  banco.finisci();
  await new Promise((r) => setImmediate(r));
  const [riga] = tempiScritti(banco.cartellaStore, sessionId);
  assert.ok(riga, 'il giro ha comunque la sua riga dei tempi');
  assert.equal(Object.hasOwn(riga, 'ragionamentiMs'), false, '«non misurato» non diventa un oggetto vuoto né uno zero');
});

test('⭐⭐ UNA SESSIONE RIAPERTA DAL DISCO sa ancora quanto ha ragionato — senza un solo istante in memoria', async (t) => {
  const banco = bancoDiProva();
  t.after(() => banco.pulisci());
  const { sessionId } = banco.registro.avviaLibero({ cartellaId: '0', consegna: 'riaprimi dopo' });
  await new Promise((r) => setImmediate(r));
  banco.avanza(200);
  banco.emetti({ type: 'ReasoningMessageStart', messageId: 'r1', role: 'reasoning' });
  banco.avanza(12_000);
  banco.emetti({ type: 'ReasoningMessageEnd', messageId: 'r1' });
  banco.emetti({ type: 'TextMessageStart', messageId: 'm1', role: 'assistant' });
  banco.emetti({ type: 'TextMessageEnd', messageId: 'm1' });
  banco.finisci();
  await aspettaFineGiroSulDisco(banco.cartellaStore, sessionId);

  /* Un registro NUOVO sullo stesso disco: è il riavvio del server, e gli istanti in memoria non ci sono più. */
  const riaperto = createSessionRegistry({
    cartellaStore: banco.cartellaStore,
    avviaSessioneFn: async () => ({ ok: true }),
    guardaWorkspaceFn: () => () => {},
    modello: 'z-ai/glm-5.3-flash',
    chiave: 'k',
  });
  const { ripristinate } = await riaperto.ripristina();
  assert.equal(ripristinate, 1, 'se la sessione non si riapre, il resto misura il caso sbagliato');
  const metriche = riaperto.elencaMetriche(sessionId);
  assert.equal(metriche.primoToken.ms, null, 'premessa: dopo il riavvio gli istanti non ci sono, il tempo al primo token non si sa più');
  assert.deepEqual(metriche.ragionamentiMs, { r1: 12_000 }, '⛔ e la durata del ragionamento invece sì: è quella che Hermes perde');
});

test('durateRagionamentoDaEventi — coppie complete, solo l’ultimo giro se chiesto, niente durate inventate', () => {
  const eventi = [
    { type: 'RunStarted', _sequenza: 1 },
    { type: 'ReasoningMessageStart', messageId: 'a', _sequenza: 2 },
    { type: 'ReasoningMessageEnd', messageId: 'a', _sequenza: 3 },
    { type: 'RunStarted', _sequenza: 4 },
    { type: 'ReasoningMessageStart', messageId: 'b', _sequenza: 5 },
    { type: 'ReasoningMessageEnd', messageId: 'b', _sequenza: 6 },
    { type: 'ReasoningMessageStart', messageId: 'senza-fine', _sequenza: 7 },
  ];
  const istanti = new Map([[1, 0], [2, 100], [3, 1_100], [4, 2_000], [5, 2_050], [6, 5_050], [7, 6_000]]);
  assert.deepEqual(durateRagionamentoDaEventi(eventi, { istanti }), { a: 1_000, b: 3_000 });
  assert.deepEqual(durateRagionamentoDaEventi(eventi, { istanti, soloUltimoGiro: true }), { b: 3_000 }, 'il record è per giro: niente durate del giro prima');
  assert.deepEqual(durateRagionamentoDaEventi(eventi, { istanti: null }), {}, 'senza istanti non si misura niente');
  assert.deepEqual(durateRagionamentoDaEventi(eventi, { istanti: new Map([[2, 900], [3, 100]]) }), {}, 'una durata negativa non esiste');
});

test('durateRagionamentoDaRecord — legge solo i tempi del giro, e scarta i valori che non sono durate', () => {
  const record = [
    { tipo: 'intestazione' },
    { tipo: 'tempi-giro', ragionamentiMs: { a: 1_000 } },
    { tipo: 'messaggi-finali', ragionamentiMs: { finto: 5 } },
    { tipo: 'tempi-giro', ragionamentiMs: { b: 3_000, rotto: 'dieci', negativo: -4, infinito: Number.POSITIVE_INFINITY } },
    { tipo: 'tempi-giro' },
  ];
  assert.deepEqual(durateRagionamentoDaRecord(record), { a: 1_000, b: 3_000 });
  assert.deepEqual(durateRagionamentoDaRecord(null), {});
});

/*
 * ⛔⛔⛔ AL CONTRARIO, e qui è il cuore: la via più pigra sarebbe scrivere SEMPRE la riga, mettendo
 *   uno zero quando il tempo non si conosce. Sarebbe peggio del silenzio — «non misurato» e
 *   «misurato e vale zero» finirebbero nello stesso posto, e una media futura li sommerebbe come
 *   se fossero la stessa cosa. È lo stesso errore già pagato su `usage` (IGNOTO non è GRATIS).
 */
test('⛔⛔⛔ AL CONTRARIO — un giro in cui il modello non ha mai parlato non scrive una riga di zeri', async (t) => {
  const banco = bancoDiProva();
  t.after(() => banco.pulisci());

  const { sessionId } = banco.registro.avviaLibero({ cartellaId: '0', consegna: 'questo giro muore subito' });
  await new Promise((r) => setImmediate(r));
  banco.avanza(1_000);
  banco.emetti({ type: 'RunError', message: 'rete interrotta', code: 'internal-error' });
  banco.finisci();
  await new Promise((r) => setImmediate(r));

  assert.deepEqual(
    tempiScritti(banco.cartellaStore, sessionId),
    [],
    '⛔ nessun primo token, nessuna riga: uno zero qui inquinerebbe ogni statistica futura',
  );
});

test('⛔ e la riga non sostituisce «messaggi-finali»: le due convivono, ognuna dice la sua cosa', async (t) => {
  const banco = bancoDiProva();
  t.after(() => banco.pulisci());

  const { sessionId } = banco.registro.avviaLibero({ cartellaId: '0', consegna: 'due record, non uno' });
  await new Promise((r) => setImmediate(r));
  banco.avanza(900);
  banco.emetti({ type: 'TextMessageStart', messageId: 'm1', role: 'assistant' });
  banco.emetti({ type: 'TextMessageEnd', messageId: 'm1' });
  banco.finisci();
  await new Promise((r) => setImmediate(r));

  const testo = readFileSync(join(banco.cartellaStore, `${sessionId}.jsonl`), 'utf8');
  assert.ok(testo.includes('"tipo":"messaggi-finali"'), 'la riga di sempre resta');
  assert.ok(testo.includes('"tipo":"tempi-giro"'), 'e la misura si affianca');
  assert.equal(tempiScritti(banco.cartellaStore, sessionId)[0].primoTokenMs, 900);
});
