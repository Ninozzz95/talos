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
import { descriviRigaViva, stimaBreveRigaViva, durataBreveRigaViva, aggiornaAvanzamentoLegacy, ridisegnaRigaVivaNellaLingua, impostaOrologioRigaViva } from '../../src/components/context-progress.js';
import { interpretaEventoCompattazione, testoRigaCompattazione, percheRipiego, formattaTokenBreve, saltaRiassuntoLegacy } from '../../src/components/compattazione-legacy.js';
import { aggiornaSeparatoreLegacy, aggiornaSeparatoreContesto, leggiVoceLegacy, rapidoNonArriva, legaRapidoAlLavoro } from '../../src/components/context-separator.js';
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
  assert.equal(v.etichetta, 'Compacting the context');
  assert.equal(v.dettaglio, '62% · ~1 min');
  assert.equal(v.determinato, true);
  assert.equal(v.valoreTesto, '62% · ~1 min');
  assert.equal(Math.round(v.tratti.cache), 24, 'inCache/totale, il tratto tenue');
  assert.equal(Math.round(v.tratti.letto), 38, '(letti − inCache)/totale, il tratto pieno');
  assert.equal(v.titolo, '24,798 tokens to read, 5,952 already cached · 3m 12s elapsed · attempt 1 of 2');
  impostaLingua('it');
  const it = descriviRigaViva({ fase: 'lettura', letti: 15_375, inCache: 5_952, totale: 24_798, stimaRestanteSec: 62, trascorsoMs: 192_400, tentativo: 1, tentativi: 2 });
  assert.equal(it.etichetta, 'Compattazione del contesto');
  assert.equal(it.dettaglio, '62% · ~1 min');
  assert.equal(it.titolo, '24.798 token da leggere, 5952 già in cache · 3m 12s trascorsi · tentativo 1 di 2', 'in italiano le cifre a quattro non si raggruppano (CLDR, come formattaToken)');
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
  /* owner 29/10/2026 (via Mobile): «12s · 1m 4s» uguale su telefono e PC, anche in italiano */
  assert.deepEqual([0, 12_900, 64_000, 192_400].map(durataBreveRigaViva), ['0s', '12s', '1m 4s', '3m 12s']);
  /* revisione del blocco 12 (RV-REV-04): un giro di due ore non si legge «120m»; le ore come Codex (`fmt_elapsed_compact`) */
  assert.equal(durataBreveRigaViva(7_206_000), '2h 0m 6s');
  assert.equal(durataBreveRigaViva(3_600_000), '1h 0m 0s');
  impostaLingua('en');
  assert.equal(durataBreveRigaViva(7_206_000), '2h 0m 6s');
  assert.equal(durataBreveRigaViva(3_599_000), '59m 59s');
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
    'Compacted without the model (skipped)', 'Compacted without the model (compaction rejected)', 'Compacted without the model (too slow to wait)', 'Compacted without the model (repeated failures)',
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
  assert.equal(status.textContent, 'Compacting the context');
  assert.equal(dettaglio.textContent, '');
  const bar = row.querySelector('progress'), filo = row.querySelector('[data-riga-viva-filo]');
  assert.equal(bar.hasAttribute('value'), false, 'all\'inizio indeterminata');
  assert.equal(filo.hidden, true);
  const salta = row.querySelector('[data-riga-viva="salta"]'), ferma = row.querySelector('[data-riga-viva="ferma"]');
  assert.deepEqual([salta.textContent, salta.getAttribute('aria-label'), ferma.textContent, ferma.getAttribute('aria-label')],
    ['Skip', 'Skip the compaction and continue with one made without the model', 'Stop', 'Stop the run']);
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
  assert.equal(row.querySelector('[data-context-chat-status]').textContent, 'Compacting the context');
  impostaLingua('it');
  assert.equal(ridisegnaRigaVivaNellaLingua(colonna), true);
  assert.deepEqual([
    row.querySelector('[data-context-chat-status]').textContent, row.querySelector('[data-context-chat-eta]').textContent, row.title,
    row.querySelector('[data-riga-viva="salta"]').textContent, row.querySelector('[data-riga-viva="ferma"]').getAttribute('aria-label'),
  ], ['Compattazione del contesto', 'scrivo · 412 token', '1m 1s trascorsi', 'Salta', 'Ferma il giro']);
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

/*
 * «Mai aspettare» (owner 27/10/2026 notte, contratto C1/C5, bozzetto approvato il 28/10): il giro non aspetta il riassunto del modello.
 * La richiesta parte col riassunto RAPIDO senza il modello (`ripiego:true`, ragione 'in-arrivo'); quando quello del modello arriva, prende
 * il suo posto alla richiesta dopo, e la riga è la STESSA: l'evento porta `migliora: { at }` del rapido, e la riga si aggiorna invece di
 * raddoppiare. Parole del bozzetto: «Quick compaction without the model · …», «Compaction improved by the model · …».
 */
test('RIGA-VIVA-15 — l\'evento: la ragione «in-arrivo» si legge; `migliora` è l\'`at` del rapido, solo se è un testo; assente o storto non c\'è', () => {
  const fine = (extra) => interpretaEventoCompattazione({ type: 'CUSTOM', name: 'talos.compattazione', value: { fase: 'fine', compattato: true, tokenPrima: 245_100, tokenDopo: 36_900, at: 'B', ...extra } });
  assert.equal(fine({ ripiego: true, ragione: 'in-arrivo' }).ragione, 'in-arrivo');
  assert.equal(fine({ migliora: { at: 'A' } }).migliora, 'A');
  for (const storto of [undefined, null, 'A', {}, { at: '' }, { at: 5 }]) assert.equal('migliora' in fine({ migliora: storto }), false, JSON.stringify(storto));
  const fallita = interpretaEventoCompattazione({ type: 'CUSTOM', name: 'talos.compattazione', value: { fase: 'fine', compattato: false, motivo: 'vuoto', migliora: { at: 'A' } } });
  assert.equal('migliora' in fallita, false, 'un riassunto non riuscito non migliora niente');
});

test('RIGA-VIVA-16 — le parole: «Quick compaction without the model» col suo perché, poi «Compaction improved by the model»; in italiano come il bozzetto', () => {
  impostaLingua('en');
  const rapido = (prima = 245_100, dopo = 36_900) => testoRigaCompattazione({ stato: 'riassunta', tokenPrima: prima, tokenDopo: dopo, ripiego: true, ragione: 'in-arrivo' });
  assert.equal(rapido(), 'Quick compaction without the model · 245.1k → 36.9k');
  assert.equal(rapido(null), 'Quick compaction without the model', 'senza un numero, niente freccia');
  assert.equal(percheRipiego('in-arrivo'), 'The model\'s compaction is on its way: it will take this one\'s place at your next message. Nothing to do.');
  const migliorato = (prima = 245_100, dopo = 31_200) => testoRigaCompattazione({ stato: 'riassunta', tokenPrima: prima, tokenDopo: dopo, migliorata: true });
  assert.equal(migliorato(), 'Compaction improved by the model · 245.1k → 31.2k');
  assert.equal(migliorato(null, null), 'Compaction improved by the model');
  for (const r of [rapido(), rapido(null), migliorato(), percheRipiego('in-arrivo')]) assert.doesNotMatch(r, vuoti);
  // AL CONTRARIO: le altre ragioni e il riassunto di sempre non cambiano
  assert.equal(testoRigaCompattazione({ stato: 'riassunta', tokenPrima: 31_200, tokenDopo: 9_900, ripiego: true, ragione: 'tempo' }), 'Compacted without the model (time limit) · 31.2k → 9.9k');
  assert.equal(testoRigaCompattazione({ stato: 'riassunta', tokenPrima: 31_200, tokenDopo: 9_900 }), 'Conversation compacted · 21,300 tokens saved');
  impostaLingua('it');
  assert.equal(rapido(), 'Compattazione rapida senza il modello · 245,1k → 36,9k');
  assert.equal(percheRipiego('in-arrivo'), 'La compattazione del modello sta arrivando: prenderà il posto di questa al prossimo messaggio. Non devi fare niente.');
  assert.equal(migliorato(), 'Compattazione migliorata dal modello · 245,1k → 31,2k');
  // il trascritto esportato racconta la storia: prima il rapido, poi il migliorato
  const evento = (value) => ({ type: 'CUSTOM', name: 'talos.compattazione', value: { fase: 'fine', compattato: true, ...value } });
  assert.deepEqual(trascriviEventoInterno(evento({ tokenPrima: 245_100, tokenDopo: 36_900, at: 'A', ripiego: true, ragione: 'in-arrivo' }), creaContestoTrascrizione()), { testo: 'Compattazione rapida senza il modello · 245,1k → 36,9k' });
  assert.deepEqual(trascriviEventoInterno(evento({ tokenPrima: 245_100, tokenDopo: 31_200, at: 'B', migliora: { at: 'A' } }), creaContestoTrascrizione()), { testo: 'Compattazione migliorata dal modello · 245,1k → 31,2k' });
});

test('RIGA-VIVA-17 — la riga del rapido diventa quella migliorata: stessa riga, chiave nuova, niente perché del ripiego; rigiocata e annullo la ridicono uguale', () => {
  impostaLingua('en');
  const doc = creaDocumento(), colonna = doc.createElement('div');
  const opzioni = (testo) => ({ sessionId: 's', document: doc, onMenu: () => {}, testo });
  const voceRapida = { at: 'A', stato: 'riassunta', tokenPrima: 245_100, tokenDopo: 36_900, ripiego: true, ragione: 'in-arrivo' };
  const row = aggiornaSeparatoreLegacy(colonna, voceRapida, opzioni(testoRigaCompattazione(voceRapida)));
  const span = row.querySelector('[data-compattazione-testo]');
  assert.equal(span.textContent, 'Quick compaction without the model · 245.1k → 36.9k');
  assert.equal(span.title, percheRipiego('in-arrivo'));
  const voceMigliorata = { at: 'B', migliora: 'A', stato: 'riassunta', tokenPrima: 245_100, tokenDopo: 31_200, ripiego: false };
  const stessa = aggiornaSeparatoreLegacy(colonna, voceMigliorata, opzioni(testoRigaCompattazione({ ...voceMigliorata, migliorata: true })));
  assert.equal(stessa, row, 'la STESSA riga, non una seconda');
  assert.equal(colonna.querySelectorAll('[data-compattazione-riga]').length, 1);
  assert.equal(row.dataset.compattazioneAt, 'B', 'l\'annullo ora riguarda il riassunto del modello');
  assert.equal(span.textContent, 'Compaction improved by the model · 245.1k → 31.2k');
  assert.equal(span.title, '', 'migliorato: niente perché del ripiego');
  const letta = leggiVoceLegacy(row);
  assert.equal(letta.migliorata, true); assert.equal(letta.ripiego, false);
  // l'annullo ridisegna con la voce letta dal DOM: le parole restano quelle del migliorato
  aggiornaSeparatoreLegacy(colonna, { ...letta, inVolo: true }, opzioni(testoRigaCompattazione({ stato: 'riassunta', ...letta })));
  assert.equal(span.textContent, 'Compaction improved by the model · 245.1k → 31.2k');
  // la rigiocata manda di nuovo i due eventi: resta UNA riga, migliorata
  aggiornaSeparatoreLegacy(colonna, voceRapida, opzioni(testoRigaCompattazione(voceRapida)));
  aggiornaSeparatoreLegacy(colonna, voceMigliorata, opzioni(testoRigaCompattazione({ ...voceMigliorata, migliorata: true })));
  assert.equal(colonna.querySelectorAll('[data-compattazione-riga]').length, 1, 'rigiocata: niente doppione del rapido');
  assert.equal(colonna.querySelector('[data-compattazione-riga]').querySelector('[data-compattazione-testo]').textContent, 'Compaction improved by the model · 245.1k → 31.2k');
  // AL CONTRARIO: un `migliora` che non trova la sua riga ne disegna una nuova (non tocca le altre)
  const altra = aggiornaSeparatoreLegacy(colonna, { at: 'D', migliora: 'Z', stato: 'riassunta', tokenPrima: 1_000, tokenDopo: 500, ripiego: false }, opzioni('y'));
  assert.notEqual(altra, row);
  assert.equal(colonna.querySelectorAll('[data-compattazione-riga]').length, 2);
  assert.equal(row.dataset.compattazioneAt, 'B');
  impostaLingua('it');
});

/*
 * «Non arriva» (contratto con la CLI, 28/10/2026): il riassunto del modello nato per sostituire il rapido non arriverà (fallito, inutile,
 * non serve, non vale più, Stop). Il kernel lo dice una volta: `talos.compattazione-preparata` con `fase:'non-arriva'` e `perIlRapido:{at}`.
 * La riga del rapido smette di promettere: torna «Compacted without the model · …», col perché generico, parole che esistono già.
 */
test('RIGA-VIVA-18 — «non-arriva»: l\'evento si legge solo nella sua forma; la riga del rapido smette di promettere; quella migliorata o di un\'altra ragione non si tocca', () => {
  impostaLingua('en');
  const evento = (value) => interpretaEventoCompattazione({ type: 'CUSTOM', name: 'talos.compattazione-preparata', value });
  assert.deepEqual(evento({ fase: 'non-arriva', perIlRapido: { at: 'A' }, motivo: 'fallita' }), { tipo: 'non-arriva', at: 'A', motivo: 'fallita' });
  assert.deepEqual(evento({ fase: 'non-arriva', perIlRapido: { at: 'A' }, motivo: 'HTTP 500 dal fornitore' }), { tipo: 'non-arriva', at: 'A', motivo: null }, 'un motivo fuori elenco non passa');
  for (const storto of [{ fase: 'pronta', at: 'A' }, { fase: 'non-arriva' }, { fase: 'non-arriva', perIlRapido: { at: '' } }, { fase: 'non-arriva', perIlRapido: 'A' }, null]) {
    assert.equal(evento(storto), null, JSON.stringify(storto));
  }
  const doc = creaDocumento(), colonna = doc.createElement('div');
  const opzioni = (testo) => ({ sessionId: 's', document: doc, onMenu: () => {}, testo });
  const voceRapida = { at: 'A', stato: 'riassunta', tokenPrima: 245_100, tokenDopo: 36_900, ripiego: true, ragione: 'in-arrivo' };
  const row = aggiornaSeparatoreLegacy(colonna, voceRapida, opzioni(testoRigaCompattazione(voceRapida)));
  const span = row.querySelector('[data-compattazione-testo]');
  const toccata = rapidoNonArriva(colonna, 'A', { sessionId: 's', document: doc, onMenu: () => {} });
  assert.equal(toccata, row, 'la stessa riga');
  assert.equal(span.textContent, 'Compacted without the model · 245.1k → 36.9k');
  assert.equal(span.title, percheRipiego(null), 'il perché generico, non più «sta arrivando»');
  assert.equal(leggiVoceLegacy(row).ragione, null);
  assert.equal(rapidoNonArriva(colonna, 'A', { sessionId: 's', document: doc, onMenu: () => {} }), null, 'una seconda volta non c\'è più niente da cambiare');
  // AL CONTRARIO: una riga già migliorata, una ragione diversa, un at che non c'è — niente si tocca
  const migliorata = aggiornaSeparatoreLegacy(colonna, { at: 'B', migliora: 'X', stato: 'riassunta', tokenPrima: 1_000, tokenDopo: 500, ripiego: false }, opzioni('m'));
  assert.equal(rapidoNonArriva(colonna, 'B', { sessionId: 's', document: doc, onMenu: () => {} }), null);
  assert.equal(migliorata.querySelector('[data-compattazione-testo]').textContent, 'm');
  const tempo = aggiornaSeparatoreLegacy(colonna, { at: 'C', stato: 'riassunta', ripiego: true, ragione: 'tempo' }, opzioni('t'));
  assert.equal(rapidoNonArriva(colonna, 'C', { sessionId: 's', document: doc, onMenu: () => {} }), null);
  assert.equal(tempo.querySelector('[data-compattazione-testo]').textContent, 't');
  assert.equal(rapidoNonArriva(colonna, 'Z', { sessionId: 's', document: doc, onMenu: () => {} }), null);
  impostaLingua('it');
});

test('RIGA-VIVA-19 — il trascritto esportato tiene fuori gli eventi «preparata» del sottofondo (in chat non hanno una riga): niente JSON grezzo', () => {
  for (const value of [{ fase: 'non-arriva', perIlRapido: { at: 'A' }, motivo: 'fallita' }, { fase: 'pronta', at: 'A', tokenPrima: 1, tokenDopo: 1 }, { fase: 'inizio', motivo: 'precalcolo' }, { compattato: false, motivo: 'inefficace' }]) {
    assert.deepEqual(trascriviEventoInterno({ type: 'CUSTOM', name: 'talos.compattazione-preparata', value }, creaContestoTrascrizione()), { omesso: true }, JSON.stringify(value));
  }
});

/*
 * Contratto C5 («one line per compaction… the same separator updates») sulla strada del MOTORE del contesto, quella di serie delle
 * conversazioni nuove, con la correlazione per LAVORO concordata con la CLI il 28/10/2026: il rapido nato da un «non pronto» ricorda il
 * lavoro che scrive il riassunto (`lavoroDelMotore`), e solo la versione di QUEL lavoro lo migliora. La pausa di quel lavoro, o un
 * lavoro diverso chiuso dopo la riga, lo fanno smettere di promettere. L'ordine è quello del giornale, lo stesso dal vivo e alla rigiocata.
 */
const ORA = (minuto) => `2026-10-28T09:${String(minuto).padStart(2, '0')}:00.000Z`;
const versione = (versionId, { kind = 'context.version.committed', jobId = `j-${versionId}`, createdAt = ORA(30), sessionId = 's' } = {}) => ({ schema: 'talos.context.event.v1', id: `e-${versionId}-${kind}`, sessionId, jobId, versionId, kind, createdAt, payload: { coveredThrough: 40 } });
const pausa = (jobId, createdAt = ORA(30)) => ({ schema: 'talos.context.event.v1', id: `c-${jobId}`, sessionId: 's', jobId, kind: 'context.compaction.cooling', state: 'failed', createdAt, payload: {} });
const voceDelRapido = ({ at = ORA(10), lavoro = 'j-v1', ragione = 'in-arrivo' } = {}) => ({ at, stato: 'riassunta', tokenPrima: 245_100, tokenDopo: 36_900, ripiego: true, ragione, ...(lavoro ? { lavoroDelMotore: lavoro } : {}) });
const rapido = (colonna, doc, opzioni = {}) => { const voce = voceDelRapido(opzioni); return aggiornaSeparatoreLegacy(colonna, voce, { sessionId: 's', document: doc, onMenu: () => {}, testo: testoRigaCompattazione(voce) }); };
const testoDi = (row) => row.querySelector('[data-compattazione-testo]').textContent;
const NON_ARRIVA = 'Compacted without the model · 245.1k → 36.9k';
const inArrivo = () => testoRigaCompattazione(voceDelRapido()); // nella lingua del momento

test('RIGA-VIVA-20 — strada del motore: la versione del lavoro che il rapido aspetta diventa quella riga, «migliorato dal modello» col «Vedi» del motore; l\'evento porta il lavoro; rigiocata e riconnessione non la raddoppiano né la riportano indietro', () => {
  impostaLingua('en');
  // l'evento del rapido porta il lavoro solo se è un testo corto e il riassunto è riuscito
  const fine = (value) => interpretaEventoCompattazione({ type: 'CUSTOM', name: 'talos.compattazione', value: { fase: 'fine', at: 'A', tokenPrima: 10, tokenDopo: 5, ripiego: true, ragione: 'in-arrivo', ...value } });
  assert.equal(fine({ compattato: true, lavoroDelMotore: 'job-1' }).lavoroDelMotore, 'job-1');
  for (const storto of [{ compattato: true, lavoroDelMotore: 'x'.repeat(257) }, { compattato: true, lavoroDelMotore: '' }, { compattato: true, lavoroDelMotore: 7 }, { compattato: false, lavoroDelMotore: 'job-1' }, { compattato: true }]) {
    assert.equal('lavoroDelMotore' in fine(storto), false, JSON.stringify(storto).slice(0, 80));
  }
  const doc = creaDocumento(), colonna = doc.createElement('div');
  const aperte = [];
  const row = rapido(colonna, doc);
  assert.equal(row.dataset.compattazioneLavoro, 'j-v1', 'la riga ricorda il lavoro');
  const delMotore = (eventi) => aggiornaSeparatoreContesto(colonna, eventi, { sessionId: 's', document: doc, onOpen: (e) => aperte.push(e.versionId) });
  const [nodo] = delMotore([versione('v1')]);
  assert.equal(nodo, row, 'la STESSA riga del rapido, non un secondo separatore');
  assert.equal(colonna.querySelectorAll('[data-context-separator]').length, 1);
  assert.equal(colonna.querySelectorAll('[data-compattazione-riga]').length, 1);
  const span = row.querySelector('[data-compattazione-testo]');
  assert.equal(span.textContent, 'Compaction improved by the model', 'il motore non dà i numeri: senza numeri, niente freccia');
  assert.equal(span.title, '', 'niente più «sta arrivando»');
  assert.equal(row.querySelector('[data-compattazione-menu]'), null, 'l\'annullo della compattazione semplice qui non vale: niente menu suo');
  const vedi = row.querySelector('[data-context-apri]');
  assert.ok(vedi, 'il «Vedi» del motore');
  vedi.click();
  assert.deepEqual(aperte, ['v1']);
  // riconnessione: lo stesso rapido e la stessa versione di nuovo — una riga, migliorata
  rapido(colonna, doc);
  delMotore([versione('v1')]);
  assert.equal(colonna.querySelectorAll('[data-compattazione-riga]').length, 1);
  assert.equal(colonna.querySelectorAll('[data-context-separator]').length, 1);
  assert.equal(span.textContent, 'Compaction improved by the model');
  // AL CONTRARIO: la versione di un altro lavoro, senza un rapido che la aspetti, è il separatore di sempre
  const [altro] = delMotore([versione('v2')]);
  assert.notEqual(altro, row);
  assert.equal(colonna.querySelectorAll('[data-context-separator]').length, 2);
  assert.equal(span.textContent, 'Compaction improved by the model', 'la riga già migliorata non si tocca');
  impostaLingua('it');
});

test('RIGA-VIVA-21 (verso contrario) — non si unisce né si chiude: un ripristino, un rapido senza lavoro (la compattazione semplice da sola), un lavoro diverso più VECCHIO della riga o senza ora, un rapido che non arriva più, un\'altra ragione, un\'altra conversazione', () => {
  impostaLingua('en');
  const doc = creaDocumento();
  const prova = (preparaRiga, evento) => {
    const colonna = doc.createElement('div');
    const row = preparaRiga(colonna);
    const nodi = aggiornaSeparatoreContesto(colonna, [evento], { sessionId: 's', document: doc, onOpen: () => {} });
    return { unita: nodi.includes(row), testo: testoDi(row), attende: row.dataset.compattazioneRipiego === 'in-arrivo' };
  };
  const inAttesa = { unita: false, testo: inArrivo(), attende: true };
  const conLavoro = (colonna) => rapido(colonna, doc);
  assert.deepEqual(prova(conLavoro, versione('v1', { kind: 'context.version.restored' })), inAttesa, 'un ripristino non è il riassunto atteso');
  assert.deepEqual(prova((colonna) => rapido(colonna, doc, { lavoro: null }), versione('v1')), inAttesa, 'senza lavoro la riga aspetta il suo `migliora`, non il motore');
  assert.deepEqual(prova(conLavoro, versione('v9', { createdAt: ORA(5) })), inAttesa, 'un lavoro diverso chiuso PRIMA della riga (consegnato in ritardo) non la chiude');
  assert.deepEqual(prova(conLavoro, versione('v9', { createdAt: ORA(10) })), inAttesa, 'alla stessa ora nemmeno');
  assert.deepEqual(prova(conLavoro, versione('v9', { createdAt: 'non è un\'ora' })), inAttesa, 'senza un\'ora leggibile nemmeno');
  assert.deepEqual(prova(conLavoro, pausa('j-v9', ORA(5))), inAttesa, 'la pausa più vecchia di un altro lavoro nemmeno');
  const nonArrivato = (colonna) => { const r = rapido(colonna, doc); rapidoNonArriva(colonna, ORA(10), { sessionId: 's', document: doc, onMenu: () => {} }); return r; };
  assert.deepEqual(prova(nonArrivato, versione('v1')), { unita: false, testo: NON_ARRIVA, attende: false }, 'il rapido che non aspetta più niente resta com\'è');
  const tempo = (colonna) => aggiornaSeparatoreLegacy(colonna, voceDelRapido({ ragione: 'tempo' }), { sessionId: 's', document: doc, onMenu: () => {}, testo: 'tempo' });
  assert.deepEqual(prova(tempo, versione('v1')), { unita: false, testo: 'tempo', attende: false });
  assert.deepEqual(prova(conLavoro, versione('v1', { sessionId: 'altra' })), inAttesa);
  impostaLingua('it');
});

test('RIGA-VIVA-22 — chi smette di promettere: due righe sullo stesso lavoro (si migliora l\'ultima), la pausa di quel lavoro, un lavoro diverso chiuso dopo la riga, la riga staccata con un turno vecchio; il menu resta; la riconnessione ridice lo stesso', () => {
  impostaLingua('en');
  const doc = creaDocumento();
  const opzioni = (extra = {}) => ({ sessionId: 's', document: doc, onOpen: () => {}, legacy: { onMenu: () => {} }, ...extra });
  // (1) due rapidi sullo stesso lavoro: la versione migliora l'ULTIMO, il primo smette di promettere e tiene il suo menu (le opzioni della riga)
  let colonna = doc.createElement('div');
  const primo = rapido(colonna, doc, { at: ORA(10) }), secondo = rapido(colonna, doc, { at: ORA(20) });
  assert.ok(primo.querySelector('[data-compattazione-menu]'), 'il rapido ha il suo menu (annulla)');
  let nodi = aggiornaSeparatoreContesto(colonna, [versione('v1')], opzioni());
  assert.deepEqual(nodi, [secondo]);
  assert.equal(testoDi(secondo), 'Compaction improved by the model');
  assert.equal(testoDi(primo), NON_ARRIVA);
  assert.equal(primo.dataset.compattazioneRipiego, '', 'non aspetta più');
  assert.ok(primo.querySelector('[data-compattazione-menu]'), 'chiusa con le opzioni della riga: l\'annullo resta');
  assert.equal(colonna.querySelectorAll('[data-compattazione-riga]').length, 2);
  // riconnessione: i due rapidi e la versione di nuovo — stesse due righe, stesse parole
  rapido(colonna, doc, { at: ORA(10) }); rapido(colonna, doc, { at: ORA(20) });
  assert.equal(testoDi(primo), inArrivo(), '(la rigiocata del rapido lo riarma…)');
  aggiornaSeparatoreContesto(colonna, [versione('v1')], opzioni());
  assert.equal(testoDi(primo), NON_ARRIVA, '…e la versione lo richiude');
  assert.equal(testoDi(secondo), 'Compaction improved by the model');
  assert.equal(colonna.querySelectorAll('[data-compattazione-riga]').length, 2);
  assert.equal(colonna.querySelectorAll('[data-context-separator]').length, 1);
  // (2) la pausa di quel lavoro: non arriverà; la riga della pausa c'è come sempre. Anche con un'ora PRIMA della riga: il lavoro può
  //     fallire mentre il rapido si sta ancora scrivendo, e conta il lavoro, non l'ora
  colonna = doc.createElement('div');
  const inPausa = rapido(colonna, doc);
  nodi = aggiornaSeparatoreContesto(colonna, [pausa('j-v1', ORA(9))], opzioni());
  assert.equal(testoDi(inPausa), NON_ARRIVA);
  assert.equal(nodi.length, 1); assert.notEqual(nodi[0], inPausa, 'la riga «riassunto non riuscito» resta la sua');
  // (3) un lavoro diverso chiuso DOPO la riga: quello atteso non arriverà più (il motore non tiene due lavori in volo)
  colonna = doc.createElement('div');
  const superata = rapido(colonna, doc);
  nodi = aggiornaSeparatoreContesto(colonna, [versione('v2', { createdAt: ORA(12) })], opzioni());
  assert.equal(testoDi(superata), NON_ARRIVA);
  assert.equal(nodi.length, 1); assert.notEqual(nodi[0], superata, 'la versione dell\'altro lavoro ha il suo separatore');
  // ⛔ AL CONTRARIO (CLI 28/10, condizione 1 dell'aggancio): la PAUSA di un altro lavoro, anche dopo la riga, no — la riga può essere
  //    passata a un lavoro nuovo, e il fallimento di quello vecchio non la riguarda
  colonna = doc.createElement('div');
  const dopoPausa = rapido(colonna, doc);
  aggiornaSeparatoreContesto(colonna, [pausa('j-v2', ORA(12))], opzioni());
  assert.equal(testoDi(dopoPausa), inArrivo());
  assert.equal(dopoPausa.dataset.compattazioneRipiego, 'in-arrivo', 'aspetta ancora il suo lavoro');
  // (4) le righe STACCATE con un turno vecchio: si decidono dove sono, senza un doppione in fondo alla colonna
  colonna = doc.createElement('div');
  const turno = doc.createElement('div');
  const vecchia = rapido(turno, doc, { at: ORA(10) }), staccata = rapido(turno, doc, { at: ORA(20) });
  vecchia.remove(); staccata.remove();
  nodi = aggiornaSeparatoreContesto(colonna, [versione('v1')], opzioni({ staccati: () => [vecchia, staccata] }));
  assert.deepEqual(nodi, [staccata]);
  assert.equal(testoDi(staccata), 'Compaction improved by the model');
  assert.equal(testoDi(vecchia), NON_ARRIVA);
  assert.equal(colonna.querySelectorAll('[data-compattazione-riga]').length, 0, 'nessuna riga riappesa né raddoppiata');
  assert.equal(colonna.querySelectorAll('[data-context-separator]').length, 0);
  impostaLingua('it');
});

/*
 * P4 (owner 28/10/2026, «Rapido subito, il modello dopo»; forma approvata dalla CLI): il rapido del posto unico nasce SENZA lavoro (nel
 * giro il motore non ne avvia nessuno); a fine giro il registro lega la riga al lavoro del motore con un evento durevole
 * (`talos.compattazione-preparata`, `fase:'lavoro-del-motore'`, `perIlRapido:{at}`, `jobId`), prima di aspettarlo. Le condizioni della
 * CLI: vince l'ultimo legame (il primo tentativo ha ceduto, il secondo ha un altro id); una riga già chiusa resta chiusa; senza la riga
 * in pagina, niente.
 */
test('RIGA-VIVA-23 — il legame del rapido al lavoro del motore: vince l\'ultimo, una riga chiusa resta chiusa, senza riga niente; legata, la versione di quel lavoro la migliora', () => {
  impostaLingua('en');
  const legame = (value) => interpretaEventoCompattazione({ type: 'CUSTOM', name: 'talos.compattazione-preparata', value: { fase: 'lavoro-del-motore', perIlRapido: { at: ORA(10) }, ...value } });
  assert.deepEqual(legame({ jobId: 'job-1' }), { tipo: 'lavoro-del-motore', at: ORA(10), jobId: 'job-1' });
  assert.equal(legame({ jobId: 'x'.repeat(257) }), null, 'un id storto non lega');
  assert.equal(legame({ jobId: '' }), null);
  assert.equal(legame({ jobId: 'job-1', perIlRapido: {} }), null, 'senza il rapido, niente');
  const doc = creaDocumento();
  const opzioni = (extra = {}) => ({ sessionId: 's', document: doc, onOpen: () => {}, legacy: { onMenu: () => {} }, ...extra });
  // nato senza lavoro: la versione di un lavoro qualunque non lo tocca (e non lo chiude: niente da confrontare)
  let colonna = doc.createElement('div');
  const riga = rapido(colonna, doc, { lavoro: null });
  assert.equal(riga.dataset.compattazioneLavoro, undefined);
  // vince l'ultimo legame
  assert.equal(legaRapidoAlLavoro(colonna, ORA(10), 'j-v1', { sessionId: 's' }), riga);
  assert.equal(legaRapidoAlLavoro(colonna, ORA(10), 'j-v2', { sessionId: 's' }), riga);
  assert.equal(riga.dataset.compattazioneLavoro, 'j-v2');
  // la versione del lavoro legato la migliora (quella del primo, ceduto, non arriva mai: non c'è)
  const nodi = aggiornaSeparatoreContesto(colonna, [versione('v2', { createdAt: ORA(9) })], opzioni());
  assert.deepEqual(nodi, [riga]);
  assert.equal(testoDi(riga), 'Compaction improved by the model');
  assert.equal(legaRapidoAlLavoro(colonna, ORA(10), 'j-v9', { sessionId: 's' }), null, 'una riga migliorata non si rilega');
  assert.equal(riga.dataset.compattazioneLavoro, 'j-v2');
  // ⛔ AL CONTRARIO: una riga già chiusa («non arriva») resta chiusa — un legame tardivo non la riapre
  colonna = doc.createElement('div');
  const chiusa = rapido(colonna, doc, { lavoro: null });
  rapidoNonArriva(colonna, ORA(10), { sessionId: 's', document: doc, onMenu: () => {} });
  assert.equal(testoDi(chiusa), NON_ARRIVA);
  assert.equal(legaRapidoAlLavoro(colonna, ORA(10), 'j-v3', { sessionId: 's' }), null);
  assert.equal(chiusa.dataset.compattazioneLavoro, undefined);
  aggiornaSeparatoreContesto(colonna, [versione('v3', { createdAt: ORA(9) })], opzioni());
  assert.equal(testoDi(chiusa), NON_ARRIVA, 'e la versione di quel lavoro non la promuove');
  assert.equal(legaRapidoAlLavoro(doc.createElement('div'), ORA(10), 'j-v4', { sessionId: 's' }), null, 'senza riga in pagina: niente');
  assert.equal(legaRapidoAlLavoro(colonna, ORA(10), 'j-v4', { sessionId: 'altra' }), null, 'la riga di un\'altra conversazione: niente');
  // la riga staccata con un turno vecchio si lega dov'è
  colonna = doc.createElement('div');
  const staccata = rapido(doc.createElement('div'), doc, { lavoro: null });
  assert.equal(legaRapidoAlLavoro(colonna, ORA(10), 'j-v5', { sessionId: 's', staccato: (chiave) => (chiave === staccata.dataset.compattazioneRiga ? staccata : null) }), staccata);
  assert.equal(staccata.dataset.compattazioneLavoro, 'j-v5');
  impostaLingua('it');
});

/* ------------------------------------------------------------------ owner 27/10/2026: il contatore dei secondi nella riga */
test('RIGA-VIVA-TEMPO-01 — «scrivo · 23s» visibile nella riga, e scorre ogni secondo dall’inizio detto dal server', (t) => {
  t.mock.timers.enable({ apis: ['setInterval'] });
  let adesso = 1_000_000;
  impostaOrologioRigaViva(() => adesso);
  try {
    impostaLingua('en');
    const doc = creaDocumento(), colonna = doc.createElement('div');
    const row = aggiornaAvanzamentoLegacy(colonna, { fase: 'riassunto', trascorsoMs: 23_000 }, { sessionId: 's', document: doc, onSalta: async () => ({}), onFerma: () => {} });
    const tempo = () => row.querySelector('[data-riga-viva-tempo]').textContent;
    assert.equal(row.querySelector('[data-context-chat-eta]').textContent, 'writing');
    assert.equal(tempo(), '· 23s');
    adesso += 1_000; t.mock.timers.tick(1_000);
    assert.equal(tempo(), '· 24s', 'scorre da solo, senza un passo nuovo');
    adesso += 60_000; t.mock.timers.tick(1_000);
    assert.equal(tempo(), '· 1m 24s');
    // un passo nuovo del server rimette l'inizio al suo posto (niente deriva fra i due orologi)
    aggiornaAvanzamentoLegacy(colonna, { fase: 'riassunto', trascorsoMs: 90_000 }, { sessionId: 's', document: doc, onSalta: async () => ({}), onFerma: () => {} });
    assert.equal(tempo(), '· 1m 30s');
    impostaLingua('it');
    t.mock.timers.tick(1_000);
    assert.equal(tempo(), '· 1m 30s', 'uguale in tutte le lingue (owner 29/10/2026)');
  } finally { impostaOrologioRigaViva(null); impostaLingua('en'); }
});

test('RIGA-VIVA-TEMPO-02 (verso contrario) — senza trascorso dal server conta dal primo passo; senza dettaglio niente «·»; riga tolta ⇒ orologio fermo', (t) => {
  t.mock.timers.enable({ apis: ['setInterval'] });
  let adesso = 5_000;
  impostaOrologioRigaViva(() => adesso);
  try {
    impostaLingua('en');
    const doc = creaDocumento(), colonna = doc.createElement('div');
    const row = aggiornaAvanzamentoLegacy(colonna, { fase: 'inizio' }, { sessionId: 's', document: doc });
    const tempo = () => row.querySelector('[data-riga-viva-tempo]').textContent;
    assert.equal(row.querySelector('[data-context-chat-eta]').textContent, '');
    assert.equal(tempo(), '0s', 'senza dettaglio, il solo tempo');
    adesso += 7_000; t.mock.timers.tick(1_000);
    assert.equal(tempo(), '7s');
    row.remove();
    adesso += 7_000; t.mock.timers.tick(1_000);
    t.mock.timers.tick(1_000);
    assert.equal(tempo(), '7s', 'una riga tolta dalla pagina non si aggiorna più');
    assert.equal(row._rigaVivaOrologio, null);
  } finally { impostaOrologioRigaViva(null); }
});
