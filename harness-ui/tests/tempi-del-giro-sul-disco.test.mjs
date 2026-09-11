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
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { createSessionRegistry } from '../src/session-registry.mjs';

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
    pulisci() { rmSync(cartellaStore, { recursive: true, force: true }); },
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
