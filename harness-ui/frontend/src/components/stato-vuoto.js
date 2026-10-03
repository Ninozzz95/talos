/*
 * EmptyState — lo stato vuoto di una sessione appena aperta, come nel mockup
 * (`#schermoVuota`, blocchi `EmptyState`, `SuggestionList`, `ListRow`).
 *
 * Ottavo componente della Fase 2. Nel mockup è una schermata a sé; nella app
 * il blocco entra nella colonna della conversazione della Chat (con il SUO
 * composer, quello vero: due composer sarebbero due verità), esattamente dove
 * l'originale metteva il suo «hero» («Sessione pronta su <cartella>. Scrivi
 * qui sotto cosa deve fare TALOS per iniziare.»).
 *
 * ⛔ «Gli esempi nascono da cosa c'è nella cartella» (mockup): i suggerimenti
 * si scrivono SOLO da fatti letti nella cartella (uno script `test` in
 * package.json, un README, una cartella .claude con i ledger…); senza fatti,
 * niente righe inventate — resta il titolo, la riga guida e «Riapri l'ultima
 * sessione» quando esiste.
 *
 * Ricerca 05/09/2026: lo stato vuoto come invito ad agire con esempi concreti
 * (non lorem) e un'azione di ripresa è il pattern delle chat degli agenti 2026
 * (fuselabcreative «UI Design for AI Agents»; shadcn/ui chat components 06/2026:
 * suggestion rows che riempiono il composer, non inviano).
 */

import { t as traduci, tn, linguaCorrenteDiT } from './lingua.js';
/* Numeri nella lingua dell'interfaccia (italiano → it-IT, inglese → en-US), letti a ogni uso. */
const localeUI = () => (linguaCorrenteDiT() === 'en' ? 'en-US' : 'it-IT');
const SVG_NS = 'http://www.w3.org/2000/svg';

function el(documentObj, tag, className, testo) {
  const nodo = documentObj.createElement(tag);
  if (className) nodo.className = className;
  if (testo !== undefined && testo !== null) nodo.textContent = String(testo);
  return nodo;
}

function simbolo(documentObj, classe, nome) {
  const svg = documentObj.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('class', classe);
  const use = documentObj.createElementNS(SVG_NS, 'use');
  use.setAttribute('href', `#${nome}`);
  svg.append(use);
  return svg;
}

/**
 * Suggerimenti dai fatti della cartella: `voci` = nomi di file/cartelle alla
 * radice (dal browser del workspace o dall'albero), `packageJson` = il JSON
 * letto, se c'è. Massimo tre, come nel mockup. Puro: si prova al contrario.
 */
export function suggerimentiDallaCartella({ voci = [], packageJson = null, totaleTest = null } = {}) {
  const nomi = new Set((voci || []).map((v) => (typeof v === 'string' ? v : v?.nome || v?.name || '').toLowerCase()));
  const righe = [];
  const test = packageJson?.scripts?.test;
  if (typeof test === 'string' && test.trim()) {
    const conteggio = Number.isFinite(totaleTest) && totaleTest > 0 ? ` · ${tn('varie.emptyState.testCount.one', 'varie.emptyState.testCount.many', totaleTest, { n: totaleTest.toLocaleString(localeUI()) })}` : '';
    righe.push({ icona: 'i-check-sq', titolo: traduci('varie.emptyState.suggestion.passTests.title'), sub: `${traduci('varie.emptyState.suggestion.passTests.sub', { script: test.trim() })}${conteggio}`, testo: traduci('varie.emptyState.suggestion.passTests.prompt', { script: test.trim() }) });
  }
  else if (nomi.has('tests') || nomi.has('test')) {
    righe.push({ icona: 'i-check-sq', titolo: traduci('varie.emptyState.suggestion.runTests.title'), sub: traduci('varie.emptyState.suggestion.runTests.sub', { folder: nomi.has('tests') ? 'tests' : 'test' }), testo: traduci('varie.emptyState.suggestion.runTests.prompt') });
  }
  const readme = [...nomi].find((n) => n === 'readme.md' || n === 'readme');
  if (readme) righe.push({ icona: 'i-doc', titolo: traduci('varie.emptyState.suggestion.readme.title', { file: readme === 'readme' ? 'README' : 'README.md' }), sub: traduci('varie.emptyState.suggestion.readme.sub'), testo: traduci('varie.emptyState.suggestion.readme.prompt') });
  if (nomi.has('.claude')) righe.push({ icona: 'i-search', titolo: traduci('varie.emptyState.suggestion.ledger.title'), sub: traduci('varie.emptyState.suggestion.ledger.sub'), testo: traduci('varie.emptyState.suggestion.ledger.prompt') });
  else if (nomi.has('src')) righe.push({ icona: 'i-search', titolo: traduci('varie.emptyState.suggestion.srcMap.title'), sub: traduci('varie.emptyState.suggestion.srcMap.sub'), testo: traduci('varie.emptyState.suggestion.srcMap.prompt') });
  return righe.slice(0, 3);
}

/**
 * Crea la colonna dello stato vuoto (il contenuto di `.talos-conversation__column.talos-empty`).
 * @param {{progetto:string, lead?:string, suggerimenti?:Array, ultimaSessione?:{nome:string}|null, hint?:string}} dati
 * @param {{document?:Document, onSuggerimento?:(s)=>void, onRiapri?:()=>void}} opzioni
 */
export function creaStatoVuoto(dati = {}, opzioni = {}) {
  const documentObj = opzioni.document || globalThis.document;
  const colonna = el(documentObj, 'div', 'talos-conversation__column talos-empty');
  const marchio = el(documentObj, 'span', 'talos-brand__mark talos-empty__mark');
  marchio.setAttribute('aria-hidden', 'true');
  marchio.append(simbolo(documentObj, 'glyph', 'glifo'));
  const titolo = el(documentObj, 'h2', 'talos-empty__title');
  titolo.append(documentObj.createTextNode(`${traduci('varie.emptyState.titleBefore')} `), el(documentObj, 'span', 'talos-empty__project', dati.progetto || traduci("varie.emptyState.thisFolder")), documentObj.createTextNode('?'));
  const lead = el(documentObj, 'p', 'talos-empty__lead', dati.lead || traduci("varie.emptyState.lead"));
  /* ⛔ 08/09/2026 — il mockup ha la scritta TALOS in Orbitron sotto il glifo (owner 07/9, O-46:
     «la chat vuota senza logo e senza TALOS in Orbitron»), e questo componente non la produceva:
     la parità componenti↔mockup era rossa alle tre viewport. Il mockup è la fonte, e chi disegna
     dai dati deve arrivare allo stesso DOM. */
  const nome = el(documentObj, 'span', 'talos-empty__marchio talos-orbitron-brand', 'TALOS');
  nome.setAttribute('aria-hidden', 'true');
  colonna.append(marchio, nome, titolo, lead);
  const suggerimenti = Array.isArray(dati.suggerimenti) ? dati.suggerimenti : [];
  if (suggerimenti.length > 0) {
    const lista = el(documentObj, 'div', 'talos-card talos-list');
    lista.setAttribute('data-c', 'SuggestionList');
    for (const s of suggerimenti) {
      const riga = el(documentObj, 'button', 'talos-list-row');
      riga.type = 'button';
      riga.setAttribute('data-c', 'ListRow');
      const icona = el(documentObj, 'span', 'talos-list-row__icon');
      icona.append(simbolo(documentObj, 'i', s.icona || 'i-bolt'));
      const testo = el(documentObj, 'span', 'talos-list-row__text');
      testo.append(el(documentObj, 'span', 'talos-list-row__title', s.titolo), el(documentObj, 'span', 'talos-list-row__sub', s.sub || ''));
      riga.append(icona, testo, el(documentObj, 'span', 'talos-kbd', '↵'));
      if (typeof opzioni.onSuggerimento === 'function') riga.addEventListener('click', () => opzioni.onSuggerimento(s));
      lista.append(riga);
    }
    colonna.append(lista);
  }
  const piede = el(documentObj, 'div', 'talos-cluster talos-empty__foot');
  if (dati.ultimaSessione) {
    const riapri = el(documentObj, 'button', 'talos-button talos-button--secondary talos-button--sm');
    riapri.type = 'button';
    riapri.append(simbolo(documentObj, 'i i--sm', 'i-clock'), documentObj.createTextNode(traduci("varie.emptyState.reopenLast")));
    riapri.title = dati.ultimaSessione.nome || '';
    if (typeof opzioni.onRiapri === 'function') riapri.addEventListener('click', opzioni.onRiapri);
    piede.append(riapri);
  }
  piede.append(el(documentObj, 'span', 'talos-muted talos-empty__hint', dati.hint || (suggerimenti.length > 0 ? traduci("varie.emptyState.hintWithExamples") : traduci("varie.emptyState.hintWithoutExamples"))));
  colonna.append(piede);
  return colonna;
}
