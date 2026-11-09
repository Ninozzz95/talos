/*
 * Pannello calmo (owner 06/11/2026 14:50): con la compattazione automatica ACCESA la scheda Contesto oltre la soglia non dice più
 * «Richiede attenzione · Oltre il limite»: dice che si compatta da sola, e «Compatta ora» resta come comando secondario. Con la
 * compattazione automatica SPENTA la scheda resta quella di oggi, parola per parola. DOM finto dei blocchi (niente jsdom).
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { documento, clic } from './aiuto-dom-blocchi.mjs';
import { impostaLingua } from '../../src/components/lingua.js';
import { disegnaContesto, modelloContesto, contoContesto } from '../../src/components/pannello/contesto.js';
import { etichettaSeparatoreContesto } from '../../src/components/context-separator.js';
import { EVENTO_APRI_SCELTA_DAL_CONTESTO } from '../../src/components/motivi-compattazione.js';
import { creaStato } from '../fixtures/pannello-dati.mjs';

const S = creaStato(Date.parse('2026-11-06T14:00:00Z'));
const LIMITE = modelloContesto(S.contesto).limite.soglia;
const conAuto = (automatica, prompt) => ({ ...S.contesto, usage: { prompt_tokens: prompt }, schedaContesto: { ...S.contesto.schedaContesto, automatica } });
const AZIONI = { riassumi: async () => ({ liberati: 1000 }) };

function disegna(dati) {
  const doc = documento();
  doc.querySelector = (s) => doc.body.querySelector(s);
  doc.querySelectorAll = (s) => doc.body.querySelectorAll(s);
  doc.documentElement = doc.body;
  doc.defaultView = { Node: doc.body.constructor, getComputedStyle: () => ({}) };
  const prima = globalThis.document;
  globalThis.document = doc;
  try {
    const contenitore = doc.createElement('div');
    doc.body.append(contenitore);
    disegnaContesto(contenitore, dati, AZIONI);
    return contenitore;
  } finally {
    globalThis.document = prima;
  }
}

const titolo = (c) => c.querySelector('.pn-grande')?.textContent ?? '';
const testoSezione = (c, k) => c.querySelector(`[data-sezione="${k}"]`)?.textContent ?? null;

test('PANNELLO-CALMO-1 — automatica accesa e oltre la soglia: nessun «Richiede attenzione», riga calma, «Compatta ora» secondario', () => {
  impostaLingua('it');
  const c = disegna(conAuto(true, LIMITE + 30_000));
  assert.equal(Boolean(c.querySelector('[data-sezione="attenzione"]')), false, 'niente sezione di attenzione');
  assert.equal(Boolean(c.querySelector('.pn-sezione--attenzione')), false);
  const r = c.querySelector('[data-chiave="compatta-da-sola"]');
  assert.ok(Boolean(r), 'la riga calma c’è');
  assert.equal(r.dataset.tono, 'neutro');
  assert.match(r.textContent, /Si compatta da sola/);
  assert.match(r.textContent, /Non devi fare niente/);
  /* Revisore 06/11 (punto 3): col motore locale a una fessura il riassunto parte solo quando la richiesta non entra più (engine.mjs:812):
     «al prossimo invio» era falso fra la soglia e il limite d'ingresso. Una frase vera per tutti e due. */
  assert.match(r.textContent, /La parte più vecchia della conversazione si riassume da sola prima che la finestra non basti più/);
  assert.doesNotMatch(c.textContent, /prossimo invio/);
  assert.doesNotMatch(r.textContent, /oltre il limite/i);
  const b = r.querySelector('[data-controllo="riassumi"]');
  assert.ok(Boolean(b), '«Compatta ora» resta');
  assert.match(b.textContent, /Compatta ora/);
  assert.ok(b.classList.contains('talos-button--secondary'), 'come comando secondario');
  assert.ok(!b.classList.contains('talos-button--primary'));
  assert.equal(titolo(c), 'Oltre la soglia, si compatta da sola');
  assert.equal(contoContesto(conAuto(true, LIMITE + 30_000)).attenzione, 0, 'la scheda non si colora d’ambra');
});

test('PANNELLO-CALMO-2 — inglese prima: le stesse parole calme in inglese', () => {
  impostaLingua('en');
  const c = disegna(conAuto(true, LIMITE + 30_000));
  const r = c.querySelector('[data-chiave="compatta-da-sola"]');
  assert.match(r.textContent, /Compacts by itself/);
  assert.match(r.textContent, /Nothing to do/);
  assert.match(r.querySelector('[data-controllo="riassumi"]').textContent, /Compact now/);
  assert.equal(titolo(c), 'Over the threshold, compacts by itself');
  assert.match(r.textContent, /before the window runs out/);
  assert.doesNotMatch(c.textContent, /next send/);
  impostaLingua('it');
});

test('PANNELLO-CALMO-3 — automatica accesa e quasi piena (sotto la soglia): calma anche lei, senza la frase «puoi farla adesso»', () => {
  impostaLingua('it');
  const c = disegna(conAuto(true, Math.ceil(LIMITE * 0.9)));
  assert.equal(Boolean(c.querySelector('[data-sezione="attenzione"]')), false);
  const r = c.querySelector('[data-chiave="compatta-da-sola"]');
  assert.ok(Boolean(r));
  assert.match(r.textContent, /Si compatta da sola/);
  assert.match(r.textContent, /Quando la finestra si riempie/, 'sotto la soglia non promette il prossimo invio');
  assert.doesNotMatch(r.textContent, /Il prossimo invio/);
  assert.match(titolo(c), /% del limite usato/, 'sotto la soglia il titolo resta la percentuale');
  assert.equal(contoContesto(conAuto(true, Math.ceil(LIMITE * 0.9))).attenzione, 0);
});

test('PANNELLO-CALMO-4 — al contrario: automatica spenta o non detta, la scheda è quella di oggi', () => {
  impostaLingua('it');
  for (const automatica of [false, undefined]) {
    const c = disegna(conAuto(automatica, LIMITE + 30_000));
    assert.equal(Boolean(c.querySelector('[data-chiave="compatta-da-sola"]')), false, `nessuna riga calma (${automatica})`);
    assert.match(testoSezione(c, 'attenzione'), /Richiede attenzione/);
    const r = c.querySelector('[data-chiave="quasi-piena"]');
    assert.equal(r.dataset.tono, 'avviso');
    assert.match(r.textContent, /Oltre il limite/);
    assert.ok(r.querySelector('[data-controllo="riassumi"]').classList.contains('talos-button--primary'), 'primario come oggi');
    assert.equal(titolo(c), 'Oltre il limite di compattazione');
    assert.equal(contoContesto(conAuto(automatica, LIMITE + 30_000)).attenzione, 1);
  }
  assert.equal(Boolean(disegna(conAuto(true, Math.floor(LIMITE * 0.5))).querySelector('[data-chiave="compatta-da-sola"]')), false, 'lontano dalla soglia nessuna riga');
});

/*
 * Coordinatore 06/11/2026 (dalla foto della pausa): la chat diceva «Compattazione automatica non riuscita 2 volte di fila. Nuovo tentativo
 * automatico dopo le 14:05» e la scheda «Si compatta al prossimo invio … Non devi fare niente». Mentre il motore aspetta prima di
 * riprovare, la scheda dice la stessa cosa della chat, e «Compatta ora» torna il comando primario. La pausa è l'evento
 * `context.compaction.cooling` (`context-engine/src/engine.mjs:328`) che `datiSchedaContesto` passa come `pausa`.
 */
const conPausa = (prompt, pausa) => ({ ...S.contesto, usage: { prompt_tokens: prompt }, schedaContesto: { ...S.contesto.schedaContesto, automatica: true, pausa } });
const FRA_UN_ORA = new Date(Date.now() + 3_600_000).toISOString();
const oraDi = (iso, lingua) => new Date(iso).toLocaleTimeString(lingua, { hour: '2-digit', minute: '2-digit' });

test('PANNELLO-CALMO-5 — automatica in pausa dopo un riassunto non riuscito: la scheda dice ciò che dice la chat, «Compatta ora» primario', () => {
  impostaLingua('it');
  const dati = conPausa(LIMITE + 30_000, { retryAfter: FRA_UN_ORA, attempts: 2 });
  const c = disegna(dati);
  assert.equal(Boolean(c.querySelector('[data-chiave="compatta-da-sola"]')), false, 'niente «si compatta da sola» durante la pausa');
  const r = c.querySelector('[data-chiave="compatta-in-pausa"]');
  assert.ok(Boolean(r), 'la riga della pausa c’è');
  assert.equal(r.dataset.tono, 'avviso');
  assert.match(r.textContent, /Compattazione automatica non riuscita 2 volte di fila/);
  assert.ok(r.textContent.includes(`Compattazione automatica non riuscita 2 volte di fila. Nuovo tentativo automatico dopo le ${oraDi(FRA_UN_ORA, 'it-IT')}.`), 'la frase della chat, parola per parola: ' + r.textContent);
  assert.match(r.textContent, /In attesa di riprovare/, 'un nome corto, che non si taglia');
  const chat = etichettaSeparatoreContesto({ kind: 'context.compaction.cooling', sessionId: 's', jobId: 'j', payload: { attempts: 2, retryAfter: FRA_UN_ORA } });
  assert.ok(r.textContent.includes(chat), 'revisore 06/11 (punto 5): la frase intera della chat, rimedio compreso: ' + chat);
  assert.match(r.textContent, /La conversazione resta intera/);
  assert.equal(Boolean(r.querySelector('[data-controllo="scegli-modello"]')), false, 'un guasto generico: nessun altro modello da scegliere');
  assert.doesNotMatch(r.textContent, /Non devi fare niente|prossimo invio/);
  const b = r.querySelector('[data-controllo="riassumi"]');
  assert.ok(Boolean(b), '«Compatta ora» c’è');
  assert.ok(b.classList.contains('talos-button--primary'), 'primario durante la pausa');
  assert.equal(titolo(c), 'Compattazione automatica non riuscita');
  assert.equal(contoContesto(dati).attenzione, 1, 'la scheda torna ambra: c’è qualcosa da sapere');
  // una volta sola: niente «volte di fila»; inglese prima
  impostaLingua('en');
  const en = disegna(conPausa(LIMITE + 30_000, { retryAfter: FRA_UN_ORA, attempts: 1 })).querySelector('[data-chiave="compatta-in-pausa"]');
  assert.match(en.textContent, /Automatic compaction failed/);
  assert.doesNotMatch(en.textContent, /times in a row/);
  assert.ok(en.textContent.includes(`Next automatic try after ${oraDi(FRA_UN_ORA, 'en-GB')}`), en.textContent);
  assert.match(en.querySelector('[data-controllo="riassumi"]').textContent, /Compact now/);
  impostaLingua('it');
});

test('PANNELLO-CALMO-6 — al contrario: pausa scaduta, senza orario, o automatica spenta ⇒ nessuna riga della pausa', () => {
  impostaLingua('it');
  const passata = conPausa(LIMITE + 30_000, { retryAfter: '2020-01-01T00:00:00.000Z', attempts: 1 });
  assert.ok(Boolean(disegna(passata).querySelector('[data-chiave="compatta-da-sola"]')), 'scaduta: torna la riga calma');
  assert.equal(Boolean(disegna(passata).querySelector('[data-chiave="compatta-in-pausa"]')), false);
  assert.equal(contoContesto(passata).attenzione, 0);
  assert.equal(Boolean(disegna(conPausa(LIMITE + 30_000, { attempts: 1 })).querySelector('[data-chiave="compatta-in-pausa"]')), false, 'senza orario');
  const spenta = { ...conPausa(LIMITE + 30_000, { retryAfter: FRA_UN_ORA, attempts: 1 }) };
  spenta.schedaContesto = { ...spenta.schedaContesto, automatica: false };
  const c = disegna(spenta);
  assert.equal(Boolean(c.querySelector('[data-chiave="compatta-in-pausa"]')), false, 'spenta: la scheda di oggi');
  assert.ok(Boolean(c.querySelector('[data-chiave="quasi-piena"]')));
  // anche sotto la soglia la pausa si dice (il riassunto è fallito comunque)
  assert.ok(Boolean(disegna(conPausa(Math.ceil(LIMITE * 0.9), { retryAfter: FRA_UN_ORA, attempts: 1 })).querySelector('[data-chiave="compatta-in-pausa"]')));
});

/* Revisore 06/11 (punto 5): la causa e «Scegli un altro modello» come nella chat. Un riassunto vuoto è colpa del modello del riassunto:
   «Compatta ora» lo riuserebbe, quindi il primo comando è sceglierne un altro. */
test('PANNELLO-CALMO-7 — pausa per un riassunto vuoto: la causa della chat e «Scegli un altro modello» primario, «Compatta ora» secondario', () => {
  impostaLingua('it');
  const r = disegna(conPausa(LIMITE + 30_000, { retryAfter: FRA_UN_ORA, attempts: 2, code: 'CTX_EMPTY_SUMMARY' })).querySelector('[data-chiave="compatta-in-pausa"]');
  const chat = etichettaSeparatoreContesto({ kind: 'context.compaction.cooling', sessionId: 's', jobId: 'j', payload: { code: 'CTX_EMPTY_SUMMARY', attempts: 2, retryAfter: FRA_UN_ORA } });
  assert.ok(r.textContent.includes(chat), 'la stessa frase della chat: ' + r.textContent);
  assert.match(r.textContent, /Il modello ha risposto senza testo/);
  const scegli = r.querySelector('[data-controllo="scegli-modello"]');
  assert.equal(scegli.textContent, 'Scegli un altro modello');
  assert.ok(scegli.classList.contains('talos-button--primary'));
  assert.ok(r.querySelector('[data-controllo="riassumi"]').classList.contains('talos-button--secondary'));
  // il clic chiede la scelta del modello, come il tasto della chat (lo ascolta app.js)
  const inviati = [];
  scegli.ownerDocument.addEventListener(EVENTO_APRI_SCELTA_DAL_CONTESTO, (e) => inviati.push(e));
  clic(scegli);
  assert.equal(inviati.length, 1);
  assert.equal(inviati[0].type, EVENTO_APRI_SCELTA_DAL_CONTESTO);
  assert.deepEqual(inviati[0].detail, { scelta: 'modello' });
  impostaLingua('en');
  const en = disegna(conPausa(LIMITE + 30_000, { retryAfter: FRA_UN_ORA, attempts: 2, code: 'CTX_EMPTY_SUMMARY' })).querySelector('[data-chiave="compatta-in-pausa"]');
  assert.equal(en.querySelector('[data-controllo="scegli-modello"]').textContent, 'Choose another model');
  impostaLingua('it');
});

/* Revisore 06/11 (mutante #16 vivo): una pausa senza conto dei tentativi è UN tentativo, mai «2 volte di fila». */
test('PANNELLO-CALMO-8 — pausa senza il conto dei tentativi: una volta sola, niente «volte di fila»', () => {
  impostaLingua('it');
  for (const attempts of [undefined, 0, -1, Number.NaN]) {
    const r = disegna(conPausa(LIMITE + 30_000, { retryAfter: FRA_UN_ORA, attempts })).querySelector('[data-chiave="compatta-in-pausa"]');
    assert.ok(Boolean(r), `la riga c'è (${attempts})`);
    assert.doesNotMatch(r.textContent, /volte di fila/, String(attempts));
  }
});
