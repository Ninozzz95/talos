import test from 'node:test';
import assert from 'node:assert/strict';
import { creaSeparatoreContesto, aggiornaSeparatoreContesto } from '../../src/components/context-separator.js';

function node() { return { dataset: {}, children: [], setAttribute() {}, addEventListener() {}, append(...items) { this.children.push(...items); }, querySelectorAll() { return this.children; }, remove() { this.removed = true; } }; }
const document = { createElement: node };
test('CTX-UI-SEPARATOR-DEDUP: replay and reload produce one separator per persisted version', () => {
  const container = node();
  const event = { id: 'e1', sessionId: 's', versionId: 'v1', kind: 'context.committed', createdAt: '2026-09-09T00:00:00Z' };
  aggiornaSeparatoreContesto(container, [event, { ...event, id: 'e2' }], { sessionId: 's', document });
  aggiornaSeparatoreContesto(container, [event], { sessionId: 's', document });
  assert.equal(container.children.length, 1);
  const reloaded = node(); aggiornaSeparatoreContesto(reloaded, [event, event], { sessionId: 's', document });
  assert.equal(reloaded.children.length, 1);
});
test('CTX-UI-SEPARATOR-SCOPE: foreign sessions and uncommitted jobs are not publication evidence', () => {
  const container = node();
  aggiornaSeparatoreContesto(container, [{ id: 'e', sessionId: 'foreign', versionId: 'v', kind: 'context.committed' }, { id: 'p', sessionId: 's', state: 'summarizing', kind: 'context.progress' }], { sessionId: 's', document });
  assert.equal(container.children.length, 0);
  assert.equal(creaSeparatoreContesto({ sessionId: 's' }, { document }), null);
});
/*
 * 25/09/2026 — la riga «Riassunto automatico non riuscito» (evento `context.compaction.cooling` del motore, ticket della
 * CLI sui riassunti rifiutati richiesti a ogni passo): una per lavoro fallito, anche rigiocata; l'orario è assoluto.
 */
test('CTX-UI-COOLING-ROW: a paused automatic compaction is one row per failed job, with an absolute time, never a publication', () => {
  const container = node();
  const cooling = { id: 'cooling-j1', sessionId: 's', jobId: 'j1', kind: 'context.compaction.cooling', state: 'failed', createdAt: '2026-09-25T10:00:00.000Z', payload: { code: 'CTX_INVALID_SUMMARY', attempts: 2, waitSeconds: 300, retryAfter: '2026-09-25T10:05:00.000Z' } };
  aggiornaSeparatoreContesto(container, [cooling, cooling], { sessionId: 's', document });
  aggiornaSeparatoreContesto(container, [cooling], { sessionId: 's', document });
  assert.equal(container.children.length, 1, 'replay doubled the row');
  const [row] = container.children;
  assert.match(row.className, /talos-context-separator--cooling/u);
  assert.equal(row.dataset.contextVersion, undefined, 'a failed job is not a context version');
  const testo = row.children[0].textContent;
  const ora = new Date('2026-09-25T10:05:00.000Z').toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' });
  /* Pannello calmo, parte 2 (owner 06/11 14:50): la riga dice anche cosa è successo e cosa fare, dal codice dell'evento */
  assert.equal(testo, `Compattazione automatica non riuscita 2 volte di fila. Nuovo tentativo automatico dopo le ${ora}. La risposta del modello non si può leggere. La conversazione resta intera. Riprova con Compatta ora.`);
  assert.doesNotMatch(testo, /CTX_|cooling|fra \d/u, 'technical names or a relative time on screen');
  // un secondo lavoro fallito è una riga sua; una pubblicazione resta il separatore di sempre
  aggiornaSeparatoreContesto(container, [{ ...cooling, id: 'cooling-j2', jobId: 'j2', payload: { ...cooling.payload, attempts: 1 } }, { id: 'v', sessionId: 's', versionId: 'v1', kind: 'context.version.committed' }], { sessionId: 's', document });
  assert.equal(container.children.length, 3);
  assert.match(container.children[1].children[0].textContent, /^Compattazione automatica non riuscita\. Nuovo tentativo/u);
  assert.equal(container.children[2].children[0].textContent, 'Contesto compattato');
  assert.equal(creaSeparatoreContesto({ ...cooling, jobId: undefined }, { document }), null, 'a pause without its job has no identity');
});
/*
 * Pannello calmo, parte 2 (owner 06/11/2026 14:50): se il riassunto automatico NON riesce la chat dice cosa fare, mai numeri di token.
 * L'evento è quello che il motore scrive davvero (`context-engine/src/engine.mjs:328`, `avvisaPausa`): `kind`, `state:'failed'`,
 * `payload: { code, attempts, waitSeconds, retryAfter }`. Il codice sceglie la frase (`fraseDelLavoro`, le stesse parole della finestra).
 */
test('CTX-UI-COOLING-WHAT-TO-DO: the failed automatic summary says what happened and what to do, with a choose-another button when it helps', async () => {
  const { impostaLingua } = await import('../../src/components/lingua.js');
  const evento = (code, attempts = 1) => ({ schema: 'talos.context.event.v1', id: `cooling-${code}`, sessionId: 's', jobId: `job-${code}`, kind: 'context.compaction.cooling', state: 'failed', createdAt: '2026-11-06T13:00:00.000Z', payload: { code, attempts, waitSeconds: 300, retryAfter: '2026-11-06T13:05:00.000Z' } });
  const conBottoni = () => { const n = node(); n.ascolti = {}; n.addEventListener = (tipo, f) => { n.ascolti[tipo] = f; }; return n; };
  const doc = { createElement: conBottoni };
  const ora = (lingua) => new Date('2026-11-06T13:05:00.000Z').toLocaleTimeString(lingua, { hour: '2-digit', minute: '2-digit' });
  try {
    impostaLingua('en');
    let scelte = 0;
    const riga = creaSeparatoreContesto(evento('CTX_EMPTY_SUMMARY'), { document: doc, onOpen() {}, onChoose: () => { scelte += 1; } });
    assert.equal(riga.children[0].textContent, `Automatic compaction failed. Next automatic try after ${ora('en-GB')}. The model answered with no text. The conversation stays whole. Try again with Compact now.`);
    const scegli = riga.children.find((b) => b.dataset?.contextChoose !== undefined);
    assert.ok(Boolean(scegli), 'a summary model problem offers another model');
    assert.equal(scegli.textContent, 'Choose another model', 'it says what it chooses (coordinator 06/11)');
    scegli.ascolti.click();
    assert.equal(scelte, 1);
    impostaLingua('it');
    const strumenti = creaSeparatoreContesto(evento('CTX_SUMMARY_TOOLS', 3), { document: doc, onChoose() {} });
    assert.equal(strumenti.children[0].textContent, `Compattazione automatica non riuscita 3 volte di fila. Nuovo tentativo automatico dopo le ${ora('it-IT')}. Il modello ha provato a usare gli strumenti invece di scrivere. La conversazione resta intera.`);
    assert.equal(strumenti.children.find((b) => b.dataset?.contextChoose !== undefined)?.textContent, 'Scegli un altro modello');
    // un guasto generico non ripete «non riuscita» due volte: dice solo che la conversazione è intera e cosa fare; niente tasto «Scegli»
    const generico = creaSeparatoreContesto(evento('CTX_COMPACTION_FAILED'), { document: doc, onChoose() {} });
    assert.equal(generico.children[0].textContent, `Compattazione automatica non riuscita. Nuovo tentativo automatico dopo le ${ora('it-IT')}. La conversazione resta intera. Riprova con Compatta ora.`);
    assert.equal(generico.children.some((b) => b.dataset?.contextChoose !== undefined), false);
    const senzaCodice = creaSeparatoreContesto({ ...evento('x'), payload: { attempts: 1 } }, { document: doc });
    assert.equal(senzaCodice.children[0].textContent, 'Compattazione automatica non riuscita. La conversazione resta intera. Riprova con Compatta ora.');
    for (const r of [riga, strumenti, generico, senzaCodice]) assert.doesNotMatch(r.children[0].textContent, /CTX_|token|cooling|\d{3}/u, 'no technical names, no raw numbers');
    // al contrario: senza `onChoose` (chi non sa aprire la scelta) nessun tasto morto
    assert.equal(creaSeparatoreContesto(evento('CTX_EMPTY_SUMMARY'), { document: doc }).children.some((b) => b.dataset?.contextChoose !== undefined), false);
  } finally {
    impostaLingua('it');
  }
});
/*
 * B1 parte 3, review della sessione desktop (10/10/2026): un separatore STACCATO con un turno vecchio (finestra della rigiocata)
 * si aggiorna dov'è attraverso `staccato(chiave)`, e non rinasce in fondo alla colonna. AL CONTRARIO: senza `staccato`, o per
 * una sessione diversa, nasce come prima.
 */
test('B1-SEP-STACCATO: the engine separator detached with an old turn is found through staccato, not duplicated', () => {
  const event = { id: 'e1', sessionId: 's', versionId: 'v1', kind: 'context.committed', createdAt: '2026-09-09T00:00:00Z' };
  const prima = node();
  const [staccatoNodo] = aggiornaSeparatoreContesto(prima, [event], { sessionId: 's', document });
  const colonna = node(); // la colonna dopo lo smontaggio: il separatore non c'è più
  const chiavi = [];
  const trovati = aggiornaSeparatoreContesto(colonna, [event], { sessionId: 's', document, staccato: (k) => { chiavi.push(k); return staccatoNodo; } });
  assert.equal(colonna.children.length, 0, 'not appended again');
  assert.deepEqual(trovati, [staccatoNodo]);
  assert.deepEqual(chiavi, [staccatoNodo.dataset.contextSeparator], 'asked by its own key');
  // al contrario: senza staccato nasce in colonna; uno staccato di un'altra sessione non si prende
  aggiornaSeparatoreContesto(colonna, [event], { sessionId: 's', document });
  assert.equal(colonna.children.length, 1);
  const altra = node();
  aggiornaSeparatoreContesto(altra, [event], { sessionId: 's', document, staccato: () => ({ ...staccatoNodo, dataset: { ...staccatoNodo.dataset, contextSession: 'x' } }) });
  assert.equal(altra.children.length, 1, 'a detached row of another session is not reused');
});

test('CTX-UI-ORIGINALI: «gli originali restano» solo se l\'ultima compattazione riuscita di quella chat si annulla', async () => {
  const { originaliRecuperabili } = await import('../../src/components/context-separator.js');
  const riga = (sessione, stato, annullabile) => ({ dataset: { compattazioneRiga: 'r', contextSession: sessione, compattazioneLegacy: stato, ...(annullabile === false ? { compattazioneAnnullabile: 'no' } : {}) } });
  const colonna = (...righe) => ({ querySelectorAll: () => righe });
  assert.equal(originaliRecuperabili(colonna(), 's'), true, 'nessuna compattazione: niente è stato tolto');
  assert.equal(originaliRecuperabili(colonna(riga('s', 'riassunta', true)), 's'), true);
  assert.equal(originaliRecuperabili(colonna(riga('s', 'riassunta', false)), 's'), false);
  assert.equal(originaliRecuperabili(colonna(riga('s', 'riassunta', false), riga('s', 'riassunta', true)), 's'), true, 'conta l\'ultima');
  assert.equal(originaliRecuperabili(colonna(riga('s', 'riassunta', true), riga('s', 'riassunta', false)), 's'), false);
  assert.equal(originaliRecuperabili(colonna(riga('s', 'riassunta', false), riga('s', 'non-riuscita', true)), 's'), false, 'una fallita non ripristina niente');
  assert.equal(originaliRecuperabili(colonna(riga('altra', 'riassunta', false)), 's'), true, 'le righe di un\'altra chat non contano');
  assert.equal(originaliRecuperabili(null, 's'), true);
});
