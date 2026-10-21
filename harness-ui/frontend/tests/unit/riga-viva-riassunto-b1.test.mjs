/*
 * B1 (owner 21/10/2026, mockup approvato alla terza versione) — LA RIGA VIVA DEL RIASSUNTO, e la riga del ripiego dopo.
 * Contratto: `Downloads/handoff-talos-2026-09-27/CONTRATTO-RIGA-VIVA-E-TETTO-RIASSUNTO-2026-10-21.md` §2, §3, §5.
 *
 * Ogni prova nei due versi: un campo presente cambia la resa come previsto, un campo ASSENTE (o storto) non stampa mai
 * «undefined», «NaN» o un numero inventato («0%», «~0 s»). Il DOM è finto e minimo: niente jsdom in questa cartella.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { impostaLingua } from '../../src/components/lingua.js';
import { descriviRigaViva, stimaBreveRigaViva, durataBreveRigaViva, aggiornaAvanzamentoLegacy, ridisegnaRigaVivaNellaLingua } from '../../src/components/context-progress.js';
import { interpretaEventoCompattazione, testoRigaCompattazione, percheRipiego, formattaTokenBreve, saltaRiassuntoLegacy } from '../../src/components/compattazione-legacy.js';
import { aggiornaSeparatoreLegacy, leggiVoceLegacy } from '../../src/components/context-separator.js';
import { creaContestoTrascrizione, trascriviEventoInterno } from '../../src/components/trascrizione-eventi-interni.js';

/* ------------------------------------------------------------------ un DOM finto, quanto basta */
const camel = (kebab) => kebab.replace(/-([a-z])/gu, (_, c) => c.toUpperCase());
function corrisponde(el, sel) {
  const attributo = /^\[data-([a-z-]+)(?:="([^"]*)")?\]$/u.exec(sel);
  if (attributo) { const v = el.dataset[camel(attributo[1])]; return attributo[2] === undefined ? v !== undefined : v === attributo[2]; }
  return el.tagName === sel.toLowerCase();
}
function creaElemento(tag, doc) {
  const attributi = new Map();
  const ascoltatori = {};
  const proprieta = new Map();
  const el = {
    tagName: tag, ownerDocument: doc, parentNode: null, children: [], dataset: {}, hidden: false, disabled: false, className: '', type: '',
    style: { setProperty(k, v) { proprieta.set(k, String(v)); }, getPropertyValue(k) { return proprieta.get(k) ?? ''; } },
    _testo: '',
    get textContent() { return this.children.length ? this.children.map((c) => c.textContent).join('') : this._testo; },
    set textContent(v) { this._testo = String(v); this.children = []; },
    get title() { return attributi.get('title') ?? ''; },
    set title(v) { attributi.set('title', String(v)); },
    setAttribute(k, v) { attributi.set(k, String(v)); },
    getAttribute(k) { return attributi.has(k) ? attributi.get(k) : null; },
    hasAttribute(k) { return attributi.has(k); },
    removeAttribute(k) { attributi.delete(k); },
    addEventListener(tipo, fn) { (ascoltatori[tipo] ??= []).push(fn); },
    click() { for (const fn of ascoltatori.click ?? []) fn({ preventDefault() {}, stopPropagation() {}, detail: 1 }); },
    append(...figli) { for (const f of figli) { f.parentNode = this; this.children.push(f); } },
    remove() { if (this.parentNode) this.parentNode.children = this.parentNode.children.filter((c) => c !== this); this.parentNode = null; },
    get isConnected() { return Boolean(this.parentNode); },
    querySelectorAll(sel) { const fuori = []; const giro = (n) => { for (const c of n.children) { if (corrisponde(c, sel)) fuori.push(c); giro(c); } }; giro(this); return fuori; },
    querySelector(sel) { return this.querySelectorAll(sel)[0] ?? null; },
  };
  return el;
}
function creaDocumento() {
  const doc = { createElement: (tag) => creaElemento(tag, doc), createElementNS: (_ns, tag) => creaElemento(tag, doc) };
  return doc;
}
const vuoti = /undefined|NaN|null|Infinity|\[object/u;

/* ------------------------------------------------------------------ che cosa dice la riga (pura) */

test('RIGA-VIVA-01 — con letti/inCache/totale e la stima, la riga dice «62% · ~1 min» e il filo ha due tratti; il tooltip i dettagli', () => {
  impostaLingua('en');
  const v = descriviRigaViva({ fase: 'lettura', letti: 15_375, inCache: 5_952, totale: 24_798, stimaRestanteSec: 62, trascorsoMs: 192_400, tentativo: 1, tentativi: 2 });
  assert.equal(v.etichetta, 'Summarizing context');
  assert.equal(v.dettaglio, '62% · ~1 min');
  assert.equal(v.determinato, true);
  assert.equal(v.valoreTesto, '62% · ~1 min');
  assert.equal(Math.round(v.tratti.cache), 24, 'inCache/totale, il tratto tenue');
  assert.equal(Math.round(v.tratti.letto), 38, '(letti − inCache)/totale, il tratto pieno');
  assert.equal(v.titolo, '24,798 tokens to read, 5,952 already cached · 3m 12s elapsed · attempt 1 of 2');
  impostaLingua('it');
  const it = descriviRigaViva({ fase: 'lettura', letti: 15_375, inCache: 5_952, totale: 24_798, stimaRestanteSec: 62, trascorsoMs: 192_400, tentativo: 1, tentativi: 2 });
  assert.equal(it.etichetta, 'Riassumo il contesto');
  assert.equal(it.dettaglio, '62% · ~1 min');
  assert.equal(it.titolo, '24.798 token da leggere, 5952 già in cache · 3 min 12 s trascorsi · tentativo 1 di 2', 'in italiano le cifre a quattro non si raggruppano (CLDR, come formattaToken)');
});

test('RIGA-VIVA-02 (verso contrario) — senza letti/totale niente percento; senza stima niente tempo; un campo storto non stampa mai undefined o NaN', () => {
  impostaLingua('en');
  const nudo = descriviRigaViva({ fase: 'lettura', motivo: 'soglia' });
  assert.deepEqual([nudo.dettaglio, nudo.titolo, nudo.determinato, nudo.tratti, nudo.valoreTesto], ['', '', false, null, '']);
  assert.equal(descriviRigaViva({ letti: 10, totale: 100 }).dettaglio, '10%', 'col percento ma senza stima: niente tempo');
  assert.equal(descriviRigaViva({ stimaRestanteSec: 40 }).dettaglio, '~40 s', 'col tempo ma senza letti/totale: niente percento');
  assert.equal(descriviRigaViva({ letti: 10 }).determinato, false, 'letti senza totale: indeterminato');
  assert.equal(descriviRigaViva({ letti: 10, totale: 0 }).determinato, false, 'un totale zero non divide');
  assert.equal(descriviRigaViva({ letti: 500, inCache: 900, totale: 1000 }).tratti.letto, 0, 'una cache più grande dei letti non fa un tratto negativo');
  assert.equal(descriviRigaViva({ letti: 5000, totale: 1000 }).dettaglio, '100%', 'letti oltre il totale si fermano al 100%');
  assert.equal(descriviRigaViva({ tentativo: 2 }).titolo, 'attempt 2', 'senza il massimo, il solo tentativo');
  assert.equal(descriviRigaViva({ tentativo: 3, tentativi: 2 }).titolo, 'attempt 3', 'un massimo incoerente non si dice');
  assert.match(descriviRigaViva({ motivo: 'overflow' }).titolo, /did not fit the model/u, 'il perché del motivo sta nel tooltip, non nella riga');
  const storti = [undefined, null, -1, 1.5, '12', Number.NaN, Infinity, {}, true];
  const campi = ['letti', 'inCache', 'totale', 'stimaRestanteSec', 'trascorsoMs', 'tentativo', 'tentativi', 'tokenScritti'];
  let giri = 0;
  for (const lingua of ['en', 'it']) {
    impostaLingua(lingua);
    for (const campo of campi) for (const storto of storti) for (const fase of ['lettura', 'riassunto', undefined]) {
      const v = descriviRigaViva({ fase, letti: 10, inCache: 2, totale: 100, stimaRestanteSec: 30, trascorsoMs: 4000, tentativo: 1, tentativi: 2, tokenScritti: 7, [campo]: storto });
      for (const testo of [v.etichetta, v.dettaglio, v.titolo, v.valoreTesto]) assert.doesNotMatch(testo, vuoti, `${lingua} ${campo}=${String(storto)}: «${testo}»`);
      if (v.tratti) for (const x of Object.values(v.tratti)) assert.ok(Number.isFinite(x) && x >= 0 && x <= 100, `${campo}=${String(storto)} tratto ${x}`);
      giri += 1;
    }
  }
  assert.equal(giri, 2 * campi.length * storti.length * 3);
  for (const vuoto of [null, undefined, 'x', 7]) assert.equal(descriviRigaViva(vuoto).dettaglio, '');
  impostaLingua('it');
});

test('RIGA-VIVA-03 — in fase riassunto la riga dice «writing · 412 tokens», col plurale giusto; senza il numero solo «writing»', () => {
  impostaLingua('en');
  assert.equal(descriviRigaViva({ fase: 'riassunto', tokenScritti: 412 }).dettaglio, 'writing · 412 tokens');
  assert.equal(descriviRigaViva({ fase: 'riassunto', tokenScritti: 1 }).dettaglio, 'writing · 1 token');
  assert.equal(descriviRigaViva({ fase: 'riassunto' }).dettaglio, 'writing');
  assert.equal(descriviRigaViva({ fase: 'riassunto', tokenScritti: 1200, stimaRestanteSec: 20 }).dettaglio, 'writing · 1,200 tokens · ~20 s');
  impostaLingua('it');
  assert.equal(descriviRigaViva({ fase: 'riassunto', tokenScritti: 412 }).dettaglio, 'scrivo · 412 token');
});

test('RIGA-VIVA-04 — il tempo in breve: passi di 5 s, mai «~0 s» né «~60 s»; la durata «3m 12s»', () => {
  impostaLingua('en');
  assert.deepEqual([0, 1, 3, 40, 58, 62, 150, 600].map(stimaBreveRigaViva), ['', '~5 s', '~5 s', '~40 s', '~1 min', '~1 min', '~3 min', '~10 min']);
  for (const storto of [-5, 1.5, '30', null, undefined, Number.NaN]) assert.equal(stimaBreveRigaViva(storto), '');
  assert.deepEqual([0, 12_900, 192_400].map(durataBreveRigaViva), ['0s', '12s', '3m 12s']);
  assert.equal(durataBreveRigaViva(-1), '');
  impostaLingua('it');
  assert.equal(durataBreveRigaViva(192_400), '3 min 12 s');
});

/* ------------------------------------------------------------------ la lettura degli eventi */

test('RIGA-VIVA-05 — talos.compattazione-progresso: si tengono i campi del contratto con la loro forma, il resto è null; tokenRiassunto è l\'alias di oggi', () => {
  const ev = (value) => interpretaEventoCompattazione({ type: 'CUSTOM', name: 'talos.compattazione-progresso', value });
  assert.deepEqual(ev({ fase: 'lettura', motivo: 'soglia', tentativo: 1, tentativi: 2, trascorsoMs: 1500, letti: 10, inCache: 2, totale: 100, stimaRestanteSec: 30, origine: 'adattatore' }), {
    tipo: 'progresso', fase: 'lettura', motivo: 'soglia', origine: 'adattatore', tentativo: 1, tentativi: 2, trascorsoMs: 1500, letti: 10, inCache: 2, totale: 100, stimaRestanteSec: 30, tokenScritti: null,
  });
  assert.equal(ev({ fase: 'riassunto', tokenRiassunto: 40, stimato: true }).tokenScritti, 40, 'il contatore del kernel di oggi');
  assert.equal(ev({ fase: 'riassunto', tokenRiassunto: 40, tokenScritti: 55 }).tokenScritti, 55, 'il nome del contratto vince');
  const storto = ev({ fase: 3, letti: -1, inCache: '2', totale: 1.5, stimaRestanteSec: Number.NaN, trascorsoMs: null, tentativo: 0, tentativi: 'x' });
  for (const campo of ['fase', 'letti', 'inCache', 'totale', 'stimaRestanteSec', 'trascorsoMs', 'tentativo', 'tentativi', 'tokenScritti']) assert.equal(storto[campo], null, campo);
  assert.equal(ev(null), null);
  assert.equal(ev('x'), null);
});

test('RIGA-VIVA-06 — fine col ripiego: ripiego e ragione si leggono; senza ripiego la forma resta quella di sempre; una ragione fuori elenco è null', () => {
  const fine = (extra) => interpretaEventoCompattazione({ type: 'CUSTOM', name: 'talos.compattazione', value: { fase: 'fine', compattato: true, tokenPrima: 31_200, tokenDopo: 9_900, at: 'A', ...extra } });
  for (const ragione of ['tempo', 'saltato', 'rifiutato', 'stima', 'esaurito']) {
    const c = fine({ ripiego: true, ragione });
    assert.equal(c.ripiego, true); assert.equal(c.ragione, ragione);
  }
  assert.equal(fine({ ripiego: true, ragione: 'boh' }).ragione, null);
  assert.equal(fine({ ripiego: true }).ragione, null);
  for (const forma of [fine({}), fine({ ripiego: false, ragione: 'tempo' }), fine({ ripiego: 'true' })]) {
    assert.equal('ripiego' in forma, false); assert.equal('ragione' in forma, false);
  }
  const fallita = interpretaEventoCompattazione({ type: 'CUSTOM', name: 'talos.compattazione', value: { fase: 'fine', compattato: false, ripiego: true, ragione: 'tempo', motivo: 'vuoto' } });
  assert.equal('ripiego' in fallita, false, 'il ripiego è di un successo (contratto §3)');
});

/* ------------------------------------------------------------------ la riga dopo */

test('RIGA-VIVA-07 — dopo: «Compacted without the model (time limit) · 31.2k → 9.9k», ogni ragione in una parola, il perché per esteso a parte', () => {
  impostaLingua('en');
  const riga = (ragione, prima = 31_200, dopo = 9_900) => testoRigaCompattazione({ stato: 'riassunta', tokenPrima: prima, tokenDopo: dopo, ripiego: true, ragione });
  assert.equal(riga('tempo'), 'Compacted without the model (time limit) · 31.2k → 9.9k');
  assert.deepEqual(['saltato', 'rifiutato', 'stima', 'esaurito'].map((r) => riga(r).replace(/ · .*$/u, '')), [
    'Compacted without the model (skipped)', 'Compacted without the model (summary rejected)', 'Compacted without the model (too slow to wait)', 'Compacted without the model (repeated failures)',
  ]);
  assert.equal(riga(null), 'Compacted without the model · 31.2k → 9.9k', 'ragione ignota: niente parentesi, niente codice grezzo');
  assert.equal(riga('boh'), 'Compacted without the model · 31.2k → 9.9k');
  assert.equal(riga('tempo', null, 9_900), 'Compacted without the model (time limit)', 'senza un numero, niente freccia');
  assert.equal(riga('tempo', 800, 450), 'Compacted without the model (time limit) · 800 → 450');
  assert.match(percheRipiego('tempo'), /longer than the time limit/u);
  assert.match(percheRipiego(null), /without the model/u);
  for (const r of ['tempo', 'saltato', 'rifiutato', 'stima', 'esaurito', null]) assert.doesNotMatch(`${riga(r)} ${percheRipiego(r)}`, vuoti);
  // AL CONTRARIO: un riassunto normale resta com'era
  assert.equal(testoRigaCompattazione({ stato: 'riassunta', tokenPrima: 31_200, tokenDopo: 9_900 }), 'Conversation compacted · 21,300 tokens saved');
  impostaLingua('it');
  assert.equal(riga('tempo'), 'Compattata senza il modello (limite di tempo) · 31,2k → 9,9k');
  assert.equal(formattaTokenBreve(10_000), '10k');
  assert.equal(formattaTokenBreve(undefined), null);
});

test('RIGA-VIVA-08 — il trascritto esportato dice le stesse parole della chat per un ripiego', () => {
  impostaLingua('en');
  const evento = { type: 'CUSTOM', name: 'talos.compattazione', value: { fase: 'fine', compattato: true, tokenPrima: 31_200, tokenDopo: 9_900, at: 'A', ripiego: true, ragione: 'saltato' } };
  assert.deepEqual(trascriviEventoInterno(evento, creaContestoTrascrizione()), { testo: 'Compacted without the model (skipped) · 31.2k → 9.9k' });
  impostaLingua('it');
});

test('RIGA-VIVA-09 — la riga del separatore ricorda il ripiego: il perché nel title, lo rilegge l\'annullo, sparisce ad annullato', () => {
  impostaLingua('en');
  const doc = creaDocumento(), colonna = doc.createElement('div');
  const voce = { at: 'A', stato: 'riassunta', tokenPrima: 31_200, tokenDopo: 9_900, ripiego: true, ragione: 'tempo' };
  const row = aggiornaSeparatoreLegacy(colonna, voce, { sessionId: 's', document: doc, onMenu: () => {}, testo: testoRigaCompattazione(voce) });
  const span = row.querySelector('[data-compattazione-testo]');
  assert.equal(span.textContent, 'Compacted without the model (time limit) · 31.2k → 9.9k');
  assert.equal(span.title, percheRipiego('tempo'));
  const letta = leggiVoceLegacy(row);
  assert.equal(letta.ripiego, true); assert.equal(letta.ragione, 'tempo');
  // l'annullo ridisegna la riga con la voce letta dal DOM: le parole restano quelle del ripiego
  aggiornaSeparatoreLegacy(colonna, { ...letta, inVolo: true }, { sessionId: 's', document: doc, onMenu: () => {}, testo: testoRigaCompattazione({ stato: 'riassunta', ...letta }) });
  assert.equal(span.textContent, 'Compacted without the model (time limit) · 31.2k → 9.9k');
  assert.equal(span.title, percheRipiego('tempo'));
  aggiornaSeparatoreLegacy(colonna, { at: 'A', stato: 'annullata' }, { sessionId: 's', document: doc, onMenu: () => {}, testo: testoRigaCompattazione({ stato: 'annullata' }) });
  assert.equal(span.title, '', 'annullato: niente perché del ripiego');
  // AL CONTRARIO: un riassunto normale non ha il title
  const normale = aggiornaSeparatoreLegacy(colonna, { at: 'B', stato: 'riassunta' }, { sessionId: 's', document: doc, onMenu: () => {}, testo: 'x' });
  assert.equal(normale.querySelector('[data-compattazione-testo]').title, '');
  assert.equal(leggiVoceLegacy(normale).ripiego, false);
  impostaLingua('it');
});

/* ------------------------------------------------------------------ la riga viva nel DOM */

test('RIGA-VIVA-10 — la riga viva: stato in role=status, i numeri fuori dalla regione viva, i due pulsanti col nome accessibile, il filo dalle variabili', () => {
  impostaLingua('en');
  const doc = creaDocumento(), colonna = doc.createElement('div');
  const chiamate = { salta: 0, ferma: 0 };
  const opzioni = { sessionId: 's', document: doc, onSalta: async () => { chiamate.salta += 1; return { saltato: false }; }, onFerma: () => { chiamate.ferma += 1; } };
  const row = aggiornaAvanzamentoLegacy(colonna, { fase: 'inizio', motivo: 'soglia' }, opzioni);
  assert.ok(row.dataset.compattazioneBarra !== undefined, 'lo stesso attributo che app.js legge per spegnerla');
  assert.equal(row.dataset.compattazioneMotivo, 'soglia');
  const status = row.querySelector('[data-context-chat-status]'), dettaglio = row.querySelector('[data-context-chat-eta]');
  assert.equal(status.getAttribute('role'), 'status');
  assert.equal(dettaglio.getAttribute('aria-live'), 'off');
  assert.equal(status.textContent, 'Summarizing context');
  assert.equal(dettaglio.textContent, '');
  const bar = row.querySelector('progress'), filo = row.querySelector('[data-riga-viva-filo]');
  assert.equal(bar.hasAttribute('value'), false, 'all\'inizio indeterminata');
  assert.equal(filo.hidden, true);
  const salta = row.querySelector('[data-riga-viva="salta"]'), ferma = row.querySelector('[data-riga-viva="ferma"]');
  assert.deepEqual([salta.textContent, salta.getAttribute('aria-label'), ferma.textContent, ferma.getAttribute('aria-label')],
    ['Skip', 'Skip the summary and continue with one made without the model', 'Stop', 'Stop the run']);
  assert.equal(salta.hidden || ferma.hidden, false);
  // un passo con i numeri
  aggiornaAvanzamentoLegacy(colonna, { fase: 'lettura', motivo: 'soglia', letti: 62, inCache: 24, totale: 100, stimaRestanteSec: 62, trascorsoMs: 5000, tentativo: 1, tentativi: 2 }, opzioni);
  assert.equal(colonna.querySelectorAll('[data-compattazione-barra]').length, 1, 'una riga sola');
  assert.equal(dettaglio.textContent, '62% · ~1 min');
  assert.equal(row.title, '100 tokens to read, 24 already cached · 5s elapsed · attempt 1 of 2');
  assert.deepEqual([bar.getAttribute('max'), bar.getAttribute('value'), bar.getAttribute('aria-valuetext')], ['100', '62', '62% · ~1 min']);
  assert.equal(filo.hidden, false);
  assert.ok(row.dataset.rigaVivaTratti !== undefined);
  assert.deepEqual([filo.style.getPropertyValue('--talos-riga-viva-cache'), filo.style.getPropertyValue('--talos-riga-viva-letto')], ['24%', '38%']);
  // il passo dopo, senza numeri: non restano quelli di prima
  aggiornaAvanzamentoLegacy(colonna, { fase: 'riassunto', motivo: 'soglia', tokenScritti: 412 }, opzioni);
  assert.equal(dettaglio.textContent, 'writing · 412 tokens');
  assert.equal(row.hasAttribute('title'), false);
  assert.deepEqual([bar.hasAttribute('value'), bar.hasAttribute('max'), bar.hasAttribute('aria-valuetext')], [false, false, false]);
  assert.equal(filo.hidden, true);
  assert.equal(row.dataset.rigaVivaTratti, undefined);
  for (const testo of [status.textContent, dettaglio.textContent, row.title]) assert.doesNotMatch(testo, vuoti);
  ferma.click();
  assert.equal(chiamate.ferma, 1);
  // stato nullo: la riga va via
  aggiornaAvanzamentoLegacy(colonna, null, opzioni);
  assert.equal(colonna.querySelectorAll('[data-compattazione-barra]').length, 0);
  impostaLingua('it');
});

test('RIGA-VIVA-11 — «Skip» manda UNA richiesta anche a clic ravvicinati; torna cliccabile se non c\'era niente da saltare, resta spento se ha saltato', async () => {
  const doc = creaDocumento(), colonna = doc.createElement('div');
  let chiamate = 0, risposta = { saltato: false };
  const opzioni = { sessionId: 's', document: doc, onSalta: async () => { chiamate += 1; return risposta; }, onFerma: () => {} };
  const row = aggiornaAvanzamentoLegacy(colonna, { fase: 'lettura' }, opzioni);
  const salta = row.querySelector('[data-riga-viva="salta"]');
  salta.click(); salta.click(); salta.click();
  assert.equal(salta.disabled, true);
  await new Promise((fatto) => setTimeout(fatto, 0));
  assert.equal(chiamate, 1, 'una POST sola');
  assert.equal(salta.disabled, false, 'saltato:false ⇒ si può riprovare');
  risposta = { saltato: true };
  salta.click();
  await new Promise((fatto) => setTimeout(fatto, 0));
  assert.equal(chiamate, 2);
  assert.equal(salta.disabled, true, 'saltato:true ⇒ la fine col ripiego arriva, niente seconda richiesta');
  // un errore lo rende di nuovo cliccabile
  const altra = aggiornaAvanzamentoLegacy(doc.createElement('div'), { fase: 'lettura' }, { ...opzioni, onSalta: async () => { throw new Error('rete'); } });
  const s2 = altra.querySelector('[data-riga-viva="salta"]');
  s2.click();
  await new Promise((fatto) => setTimeout(fatto, 0));
  assert.equal(s2.disabled, false);
});

test('RIGA-VIVA-12 (verso contrario) — senza le due funzioni (la compattazione chiesta a mano, fuori da un giro) la riga non offre pulsanti', () => {
  const doc = creaDocumento(), colonna = doc.createElement('div');
  const row = aggiornaAvanzamentoLegacy(colonna, { fase: 'inizio', motivo: 'manuale' }, { sessionId: 's', document: doc });
  assert.equal(row.querySelector('[data-riga-viva="salta"]').hidden, true);
  assert.equal(row.querySelector('[data-riga-viva="ferma"]').hidden, true);
  assert.equal(row.querySelector('[data-riga-viva-azioni]').hidden, true);
  assert.equal(aggiornaAvanzamentoLegacy(colonna, { fase: 'inizio' }, { document: doc }), null, 'senza sessione non si disegna');
});

test('RIGA-VIVA-13 — al cambio di lingua la riga viva si ridice subito, con l\'ultimo passo ricevuto', () => {
  impostaLingua('en');
  const doc = creaDocumento(), colonna = doc.createElement('div');
  const row = aggiornaAvanzamentoLegacy(colonna, { fase: 'riassunto', tokenScritti: 412, trascorsoMs: 61_000 }, { sessionId: 's', document: doc, onSalta: async () => ({}), onFerma: () => {} });
  assert.equal(row.querySelector('[data-context-chat-status]').textContent, 'Summarizing context');
  impostaLingua('it');
  assert.equal(ridisegnaRigaVivaNellaLingua(colonna), true);
  assert.deepEqual([
    row.querySelector('[data-context-chat-status]').textContent, row.querySelector('[data-context-chat-eta]').textContent, row.title,
    row.querySelector('[data-riga-viva="salta"]').textContent, row.querySelector('[data-riga-viva="ferma"]').getAttribute('aria-label'),
  ], ['Riassumo il contesto', 'scrivo · 412 token', '1 min 1 s trascorsi', 'Salta', 'Ferma il giro']);
  assert.equal(ridisegnaRigaVivaNellaLingua(doc.createElement('div')), false, 'senza riga, niente da fare');
});

/* ------------------------------------------------------------------ «Skip», la chiamata */

test('RIGA-VIVA-14 — Skip è POST /api/v1/sessions/:id/compaction/skip; saltato vero/falso dalla risposta; un rifiuto è un errore', async () => {
  const viste = [];
  const fetchFn = (risposta) => async (url, init) => { viste.push([url, init.method, init.credentials]); return { ok: true, json: async () => risposta }; };
  assert.deepEqual(await saltaRiassuntoLegacy({ fetchFn: fetchFn({ ok: true, saltato: true }), base: '/api/v1/', sessionId: 's 1' }), { saltato: true });
  assert.deepEqual(viste[0], ['/api/v1/sessions/s%201/compaction/skip', 'POST', 'same-origin']);
  assert.deepEqual(await saltaRiassuntoLegacy({ fetchFn: fetchFn({ ok: true, saltato: false }), sessionId: 's' }), { saltato: false });
  assert.deepEqual(await saltaRiassuntoLegacy({ fetchFn: fetchFn({ ok: true, data: { saltato: true } }), sessionId: 's' }), { saltato: true }, 'anche dentro la busta `data`');
  assert.deepEqual(await saltaRiassuntoLegacy({ fetchFn: fetchFn({ ok: true }), sessionId: 's' }), { saltato: false }, 'un campo assente non è un sì');
  await assert.rejects(saltaRiassuntoLegacy({ fetchFn: fetchFn({ ok: false, error: { code: 'X', message: 'no' } }), sessionId: 's' }), { code: 'X', message: 'no' });
  await assert.rejects(saltaRiassuntoLegacy({ fetchFn: fetchFn({ ok: true }), sessionId: '' }), { code: 'SESSIONE' });
});
