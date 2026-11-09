import test from 'node:test';
import assert from 'node:assert/strict';

import * as COMPONENTE from '../../src/components/ricerca-due-porte.js';
import { apriModale, chiudiModale } from '../../src/components/modale-td.js';
import TESTI from '../../src/i18n/testi/chat.js';

const { apriNuovaRicerca, PROFONDITA, PROFONDITA_DI_SERIE, DOMANDA_MASSIMA } = COMPONENTE;

/*
 * 01/11/2026 — Ricerca approfondita: la modale «New research» della sezione (bozzetto approvato dall'owner il 22/10/2026, foto E-G).
 * ⛔ Owner 01/11 sera: «niente pillola ricerca approfondita nel composer, solo sezione o richiesta al modello» — la pillola, il menu,
 *   `/research` e la loro scala non ci sono più, e la prova RDP-UI-01 lo fissa. La modale vive nel browser:
 *   `tests/browser/ricerca-due-porte.spec.mjs` (da eseguire); qui le sue regole su un DOM minimo.
 */

test('RDP-UI-01 (owner 01/11 sera): il componente esporta solo la modale della sezione — niente pillola, niente `/research`', () => {
  assert.deepEqual(Object.keys(COMPONENTE).sort(), ['DOMANDA_MASSIMA', 'PROFONDITA', 'PROFONDITA_DI_SERIE', 'apriNuovaRicerca']);
  assert.equal(DOMANDA_MASSIMA, 500, 'lo stesso limite di research_start.question nel kernel');
  assert.deepEqual([...PROFONDITA], ['quick', 'deep', 'exhaustive']);
  assert.equal(PROFONDITA_DI_SERIE, 'deep');
  for (const k of Object.keys(TESTI.en)) assert.doesNotMatch(k, /^research\.(plus|pill|placeholder|menu|command|send)\./u, `testo del compositore rimasto: ${k}`);
});

test('RDP-UI-06: i testi della sezione esistono in inglese e in italiano, con le stesse chiavi e gli stessi segnaposto', () => {
  const nuove = Object.keys(TESTI.en).filter((k) => k.startsWith('research.'));
  assert.ok(nuove.length >= 15, `${nuove.length} chiavi`);
  for (const k of nuove) {
    assert.ok(typeof TESTI.it[k] === 'string' && TESTI.it[k].length > 0, `manca l'italiano di ${k}`);
    const segnaposto = (s) => [...s.matchAll(/\{(\w+)\}/gu)].map((m) => m[1]).sort().join(',');
    assert.equal(segnaposto(TESTI.it[k]), segnaposto(TESTI.en[k]), k);
    assert.doesNotMatch(`${TESTI.en[k]} ${TESTI.it[k]}`, /research_start|tool_search|\bquick\b|\bexhaustive\b|_/u, `nessun nome tecnico a schermo: ${k}`);
  }
  for (const p of PROFONDITA) for (const suff of ['', 'Help']) assert.ok(TESTI.en[`research.depth.${p}${suff}`], `research.depth.${p}${suff}`);
});

/* Revisione avversaria del 01/11/2026 (prova portata dal revisore, `rev-rdp/rev-modale.test.mjs`): un DOM minimo, quanto basta a
   `apriNuovaRicerca` — nodi, attributi, ascoltatori, click (che come quello vero non scatta su un bottone disabilitato). */
function nodoFinto(tag) {
  const ascolta = {};
  return {
    tagName: tag, children: [], dataset: {}, attributi: {}, style: {}, hidden: false, disabled: false, value: '', textContent: '', className: '',
    append(...figli) { this.children.push(...figli); },
    setAttribute(k, v) { this.attributi[k] = String(v); }, getAttribute(k) { return this.attributi[k] ?? null; },
    addEventListener(t, f) { (ascolta[t] ??= []).push(f); },
    dispatch(t, e = {}) { for (const f of ascolta[t] ?? []) f({ preventDefault() {}, stopPropagation() {}, ...e }); },
    click() { if (!this.disabled) this.dispatch('click'); },
    focus() {}, querySelector() { return nodoFinto('span'); },
  };
}
const docFinto = { createElement: nodoFinto, createElementNS: (_ns, t) => nodoFinto(t), createTextNode: (t) => ({ textContent: t }) };
function apriFinta() {
  const avvii = [];
  const aperture = [];
  apriNuovaRicerca(docFinto, {
    apriModale: (titolo, pezzi, opzioni) => { aperture.push({ titolo, pezzi, opzioni }); return { dialogo: nodoFinto('dialog') }; },
    /* come `modale-td.js` senza movimento ridotto: la modale resta nel DOM finché l'uscita non finisce, e il fuoco resta nel campo */
    chiudiModale: () => {},
    tr: (k) => k, onAvvia: (x) => avvii.push(x),
  });
  const { pezzi } = aperture[0];
  const domanda = pezzi[0].children[1];
  const avvia = pezzi.at(-1).children.at(-1);
  return { avvii, aperture, domanda, avvia };
}

test('REV-RDP-M1: un Ctrl+Invio ripetuto mentre la modale esce (animazione di ~150 ms) NON avvia due ricerche', () => {
  const { avvii, domanda } = apriFinta();
  domanda.value = 'Compare two engines';
  domanda.dispatch('input');
  domanda.dispatch('keydown', { key: 'Enter', ctrlKey: true });
  domanda.dispatch('keydown', { key: 'Enter', ctrlKey: true, repeat: true }); // ripetizione automatica del tasto tenuto
  assert.equal(avvii.length, 1, `ricerche avviate: ${avvii.length}`);
});

test("REV-RDP-M2: anche due clic programmatici e un input dopo l'avvio non ne fanno partire una seconda; il bottone resta spento", () => {
  const { avvii, domanda, avvia } = apriFinta();
  domanda.value = 'Compare two engines';
  domanda.dispatch('input');
  avvia.dispatch('click');
  assert.equal(avvia.disabled, true, "il bottone si spegne SUBITO al clic, non al ridisegno dopo");
  domanda.dispatch('input'); // un ridisegno dopo l'avvio non lo riaccende
  assert.equal(avvia.disabled, true, "il bottone resta spento dopo l'avvio");
  avvia.dispatch('click'); // anche un clic che salta il controllo del bottone
  assert.equal(avvii.length, 1, `ricerche avviate: ${avvii.length}`);
});

test("REV-RDP-OCCHIELLO: la modale porta l'occhiello «Deep research» sopra il titolo «New research», come il bozzetto (foto F)", () => {
  const { aperture } = apriFinta();
  assert.equal(aperture[0].titolo, 'chat.research.modal.title');
  assert.equal(aperture[0].opzioni?.occhiello, 'chat.research.modal.eyebrow');
  assert.equal(TESTI.en['research.modal.eyebrow'], 'Deep research');
  assert.equal(TESTI.it['research.modal.eyebrow'], 'Ricerca approfondita');
});

/* Il documento finto di `modale-td.test.mjs`, ridotto: quanto basta per leggere la testata della modale delle sezioni. */
function nodoModale(tag, doc) {
  const n = {
    tagName: String(tag).toUpperCase(), figli: [], genitore: null, attributi: new Map(), dataset: {}, className: '', textContent: '', open: false,
    ascoltatori: new Map(), ownerDocument: doc, style: {},
    append(...nuovi) { for (const x of nuovi) { if (!x) continue; x.genitore = n; n.figli.push(x); } },
    remove() { if (n.genitore) n.genitore.figli = n.genitore.figli.filter((f) => f !== n); n.genitore = null; },
    setAttribute(k, v) { n.attributi.set(k, String(v)); }, getAttribute(k) { return n.attributi.get(k) ?? null; },
    addEventListener(t, f) { n.ascoltatori.set(t, [...(n.ascoltatori.get(t) || []), f]); },
    focus() { doc.activeElement = n; }, showModal() { n.open = true; }, close() { n.open = false; for (const f of n.ascoltatori.get('close') || []) f({}); },
    discendenti() { return n.figli.flatMap((f) => [f, ...f.discendenti()]); },
    querySelector(sel) { const t = sel.split(',')[0].trim().split(/[:[.]/)[0].toUpperCase(); return n.discendenti().find((f) => f.tagName === t) || null; },
    querySelectorAll() { return []; },
  };
  return n;
}
function documentoModale() {
  const doc = { activeElement: null };
  doc.createElement = (t) => nodoModale(t, doc);
  doc.createElementNS = (_ns, t) => nodoModale(t, doc);
  doc.body = nodoModale('body', doc);
  return doc;
}
test("REV-RDP-OCCHIELLO-2: la modale delle sezioni mette l'occhiello SOPRA il titolo; AL CONTRARIO senza occhiello la testata è quella di sempre", () => {
  const doc = documentoModale();
  const testaDi = (aperta) => aperta.dialogo.figli.find((f) => f.className === 'td-modal-head');
  const con = apriModale('New research', [], { document: doc, occhiello: 'Deep research' });
  const gruppo = testaDi(con).figli[0];
  assert.deepEqual(gruppo.figli.map((f) => [f.tagName, f.className, f.textContent]), [['SPAN', 'talos-eyebrow', 'Deep research'], ['H2', '', 'New research']]);
  chiudiModale({ immediata: true });
  const senza = apriModale('Temi', [], { document: doc });
  assert.deepEqual(testaDi(senza).figli.map((f) => f.tagName), ['H2', 'BUTTON'], 'senza occhiello: titolo e chiudi, come prima');
  chiudiModale({ immediata: true });
});

/* Revisione del blocco 25, R4: «Advanced» ha `aria-expanded` + `aria-controls` e si apre da sé; la regia generica delle disclosure di `app.js` ribalta ogni
   `[aria-expanded][aria-controls]` sullo stesso clic, tranne `[data-disclosure-propria]`. Senza il segno il pannello si apriva e si richiudeva subito (RDP-B06 rossa nel
   browser, nei due temi). Qui il segno e il comportamento del componente da solo; la regia vera si prova in `tests/browser/ricerca-due-porte.spec.mjs` RDP-B06. */
test('REV25-R4: «Advanced» porta `data-disclosure-propria` (la regia di app.js lo lascia stare) e apre e chiude il pannello da sé', () => {
  const { aperture } = apriFinta();
  const tutti = [];
  const visita = (n) => { if (!n || typeof n !== 'object') return; tutti.push(n); for (const f of n.children ?? []) visita(f); };
  for (const p of aperture[0].pezzi) visita(p);
  const avanzate = tutti.find((n) => n.dataset && 'nuovaRicercaAvanzate' in n.dataset);
  assert.ok(avanzate, 'il bottone «Advanced» c\'è');
  assert.ok('disclosurePropria' in avanzate.dataset, '⛔ senza `data-disclosure-propria` la regia di app.js lo richiude sullo stesso clic');
  const pannello = tutti.find((n) => n.id === avanzate.getAttribute('aria-controls'));
  assert.equal(pannello.hidden, true);
  avanzate.dispatch('click');
  assert.equal([avanzate.getAttribute('aria-expanded'), pannello.hidden].join(), 'true,false');
  avanzate.dispatch('click');
  assert.equal([avanzate.getAttribute('aria-expanded'), pannello.hidden].join(), 'false,true');
});
