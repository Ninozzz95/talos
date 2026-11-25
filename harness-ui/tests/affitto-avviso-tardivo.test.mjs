import test from 'node:test';
import assert from 'node:assert/strict';
import { appendFileSync, mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { attendiScritture, attivaAffittiArchivio, disattivaAffittiArchivio } from '../src/session-store.mjs';
import { createSessionRegistry } from '../src/session-registry.mjs';

/*
 * 14/11/2026 — le prove N29 del revisore affitto 3 di 3 (`zz-rev-aff3-n29.test.mjs` nella sua copia), portate nel ramo dal quarto giro
 *   («note e prove», owner 12:20, giudice v1862-v1864): A e C, le due che uccidono il mutante N29 (l'avviso che parte da una voce
 *   vecchia). N29 reso DETERMINISTICO senza toccare il prodotto: la prova (non il prodotto) trattiene il `setImmediate` dell'avviso
 *   (`session-registry.mjs:5601`, l'unico `setImmediate` del file, globale) e lo rilascia quando la ricarica ha GIÀ sostituito la voce.
 *   Poi un secondo giro sulla voce nuova (A) o nessuno (C), un riavvio, e si misura che cosa vede la persona: nessuna riga mancante o
 *   doppia, nessun numero spostato; per quel giro manca solo la riga «Un altro TALOS ha scritto in questa chat» (al massimo una).
 *   La strada «a ricarica in corso» (B del revisore) resta nella sua copia: non uccide N29. Solo cartelle del TEMP (finto, nella coda);
 *   mai tolte da qui.
 */
const pausa = (ms) => new Promise((r) => setTimeout(r, ms));
const chiave = (e) => `${e.type}|${e.messageId ?? ''}|${e.runId ?? ''}|${e.delta ?? ''}|${e.name ?? ''}|${e.value?.id ?? ''}|${e.value?.scrittaAltrove ?? ''}`;
const giornale = (store, id) => join(store, `${id}.jsonl`);
const scritti = (store, id) => readFileSync(giornale(store, id), 'utf8').split('\n').filter(Boolean).map((t) => { try { return JSON.parse(t); } catch { return null; } }).filter(Boolean);
const massimoScritto = (store, id) => Math.max(0, ...scritti(store, id).map((r) => r._sequenza).filter(Number.isSafeInteger));
const notaAltrove = (store, id, detto) => appendFileSync(giornale(store, id), `${JSON.stringify({ type: 'CUSTOM', name: 'talos.nota-altrove', value: { id: detto }, _sequenza: massimoScritto(store, id) + 1 })}\n`);

function trattieniAvviso() {
  const originale = globalThis.setImmediate;
  const trattenuti = [];
  globalThis.setImmediate = function (fn, ...args) {
    if (typeof fn === 'function' && String(fn).includes('avvisaScritturaAltrove')) { trattenuti.push(() => fn(...args)); return { trattenuto: true }; }
    return originale.call(this, fn, ...args);
  };
  return { trattenuti, ripristina: () => { globalThis.setImmediate = originale; } };
}

async function scenario(t, { secondoGiro = true } = {}) {
  const errori = [];
  const suErrore = (e) => { errori.push(`${e?.code ?? ''} ${e?.message ?? e}`.slice(0, 160)); };
  process.on('unhandledRejection', suErrore);
  t.after(() => process.off('unhandledRejection', suErrore));
  const store = mkdtempSync(join(tmpdir(), 'ra3-n29-'));
  const lavoro = mkdtempSync(join(tmpdir(), 'ra3-n29l-'));
  attivaAffittiArchivio(store, { etichetta: 'n29', battitoMs: 0, rilascioDopoMs: 0 });
  t.after(() => disattivaAffittiArchivio(store));
  const stato = { sessionId: null, giri: 0 };
  const fineGiri = [];
  const fine = (k) => (fineGiri[k] ??= (() => { let ok; const p = new Promise((r) => { ok = r; }); p.ok = ok; return p; })());
  const presa = trattieniAvviso();
  t.after(() => presa.ripristina());
  const creaRegistro = () => createSessionRegistry({
    cartellaStore: store, affittoFraProcessi: { etichetta: 'n29' }, guardaWorkspaceFn: () => () => {},
    preparaEsecuzioneLiberaFn: (_c, { cartellaLibera, consegna }) => ({ cartella: cartellaLibera, comandoProva: 'npm test', task: { consegna, consegnaCorta: consegna } }),
    modello: 'm', chiave: 'k',
    avviaSessioneFn: async (input) => {
      while (!stato.sessionId) await pausa(5);
      stato.giri += 1;
      const k = stato.giri;
      input.onEvento({ type: 'RunStarted', threadId: 't1', runId: `r${k}` });
      input.onEvento({ type: 'TextMessageStart', messageId: `m${k}`, role: 'assistant' });
      await attendiScritture({ cartellaStore: store, sessionId: stato.sessionId });
      for (let i = 0; i < 3; i += 1) {
        if (k === 1 && i === 1) notaAltrove(store, stato.sessionId, `altrove-1.${i}`);
        input.onEvento({ type: 'TextMessageContent', messageId: `m${k}`, delta: `g${k}p${i} ` });
        await attendiScritture({ cartellaStore: store, sessionId: stato.sessionId });
      }
      input.onEvento({ type: 'TextMessageEnd', messageId: `m${k}` });
      input.onEvento({ type: 'RunFinished', threadId: 't1', runId: `r${k}`, outcome: { type: 'success' }, result: { detto: 'Fatto.' } });
      fine(k).ok();
      return { ok: true, esito: { detto: 'Fatto.', comeFinita: 'concluso', messaggiFinali: [...(input.messaggiIniziali ?? [{ role: 'user', content: 'scrivi' }]), { role: 'assistant', content: `giro ${k}` }] } };
    },
  });
  const registro = creaRegistro();
  t.after(() => registro.chiudi({ attesaMassimaMs: 1000 }));
  const { sessionId } = registro.avviaLibero({ cartellaLibera: lavoro, consegna: 'scrivi', permessi: 'Full access' });
  const pagina = new Set(); const nascosteDallaPagina = []; const vistiDalVivo = new Map(); let doppiDalVivo = 0;
  registro.iscriviti(sessionId, (e) => {
    if (!Number.isSafeInteger(e._sequenza)) return;
    if (pagina.has(e._sequenza)) nascosteDallaPagina.push(chiave(e)); else pagina.add(e._sequenza);
    const c = chiave(e);
    if (vistiDalVivo.has(c)) doppiDalVivo += 1; else vistiDalVivo.set(c, e._sequenza);
  }, 0);
  stato.sessionId = sessionId;
  await fine(1);
  await registro.attendiAssestamento(sessionId);
  await attendiScritture({ cartellaStore: store, sessionId });
  const trattenutiDopoIlGiro1 = presa.trattenuti.length;
  /* l altro scrive ancora (la chat e cambiata altrove) ⇒ la ricarica toglie la voce */
  notaAltrove(store, sessionId, 'altrove-dopo-1');
  /* a ricarica finita (voce nuova al suo posto) si rilascia l'avviso trattenuto: parte con la voce VECCHIA in mano */
  const al = await registro.allineaSessione(sessionId);
  const colta = al?.ricaricata === true;
  for (const f of presa.trattenuti.splice(0)) f();
  presa.ripristina();
  await pausa(20);
  await attendiScritture({ cartellaStore: store, sessionId });
  if (secondoGiro) {
    assert.equal(registro.resume(sessionId, 'ancora').erroreAvvio, undefined, 'turn 2 starts');
    await fine(2);
  }
  await registro.attendiAssestamento(sessionId);
  await attendiScritture({ cartellaStore: store, sessionId });
  await registro.chiudi({ attesaMassimaMs: 1000 });
  const nuovo = creaRegistro();
  t.after(() => nuovo.chiudi({ attesaMassimaMs: 1000 }));
  await nuovo.ripristina();
  const dopo = new Map((nuovo.esporta(sessionId)?.eventi ?? []).filter((e) => Number.isSafeInteger(e._sequenza)).map((e) => [chiave(e), e._sequenza]));
  let numeroCambiato = 0;
  for (const [c, n] of vistiDalVivo) if (dopo.has(c) && dopo.get(c) !== n) numeroCambiato += 1;
  const numeriScritti = scritti(store, sessionId).map((r) => r._sequenza).filter(Number.isSafeInteger);
  const avvisiSulDisco = scritti(store, sessionId).filter((r) => r.name === 'talos.journal-riparato' && r.value?.scrittaAltrove === true).length;
  const avvisiDalVivo = [...vistiDalVivo.keys()].filter((c) => c.startsWith('CUSTOM') && c.includes('talos.journal-riparato') && c.endsWith('|true')).length;
  /* la pagina dopo il riavvio: Set dei numeri gia visti (app.js:5909-5910) sul rigioco intero */
  const nascosteAlRigioco = []; const rivisteAlRigioco = [];
  for (const [c, n] of dopo) { if (vistiDalVivo.has(c)) { if (vistiDalVivo.get(c) !== n && !pagina.has(n)) rivisteAlRigioco.push(c); continue; } if (pagina.has(n)) nascosteAlRigioco.push(c); }
  await pausa(30);
  const conti = { errori, colta, trattenutiDopoIlGiro1, avvisiSulDisco, avvisiDalVivo, doppiDalVivo, nascosteDallaPagina: nascosteDallaPagina.length, numeroCambiato,
    doppiScritti: numeriScritti.filter((n, i) => numeriScritti.indexOf(n) !== i).length, nascosteAlRigioco, rivisteAlRigioco };
  t.diagnostic(`CONTI ${JSON.stringify(conti)}`);
  return conti;
}

test('REVAFF3-N29-A: the notice\'s setImmediate runs after a reload REPLACED the entry: no number shown changes line, nothing hidden or shown again, never a second notice for the turn', async (t) => {
  const c = await scenario(t);
  assert.equal(c.colta, true, 'the window was hit');
  assert.equal(c.trattenutiDopoIlGiro1, 1, 'one notice held');
  assert.equal(c.doppiDalVivo, 0);
  assert.equal(c.nascosteDallaPagina, 0, 'the page hides nothing live');
  assert.equal(c.numeroCambiato, 0, 'every number shown keeps its line after the restart');
  assert.deepEqual(c.nascosteAlRigioco, [], 'nothing hidden by the page after the restart');
  assert.deepEqual(c.rivisteAlRigioco, [], 'nothing shown again after the restart');
  assert.ok(c.avvisiSulDisco <= 1, `at most one notice for turn 1 (${c.avvisiSulDisco})`);
});

test('REVAFF3-N29-C: the same late notice after a reload replaced the entry, with no second turn: no write error, and our writes never reuse a number already on the disk (only the other TALOS line repeats one)', async (t) => {
  const c = await scenario(t, { secondoGiro: false });
  assert.equal(c.colta, true, 'the window was hit');
  assert.deepEqual(c.errori, [], 'no write refused');
  assert.equal(c.doppiScritti, 1, `only the other TALOS note repeats a written number (${c.doppiScritti})`);
  assert.equal(c.numeroCambiato, 0);
});
