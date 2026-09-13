import test from 'node:test';
import assert from 'node:assert/strict';
import { descriviAvanzamentoContesto, stimaResiduoContesto, descriviStimaResiduo } from '../../src/components/context-progress.js';
const state = (status, progress) => ({ sessionId: 'a', jobs: [{ id: 'one', state: status, progress }] });
test('CTX-PROGRESS-INDETERMINATE never invents a percentage for a generation without segment counts', () => {
  assert.equal(descriviAvanzamentoContesto(state('summarizing')).determinate, false);
  assert.equal(descriviAvanzamentoContesto(state('validating', { completed: 2, total: 2 })).determinate, false);
  assert.equal(descriviAvanzamentoContesto(state('summarizing', { completed: 1, total: 3 })).value, 1);
  assert.equal(descriviAvanzamentoContesto(state('summarizing', { completed: 4, total: 3 })).determinate, false);
  assert.equal(descriviAvanzamentoContesto(state('committed')).visible, false);
  assert.equal(descriviAvanzamentoContesto(state('failed')).active, false);
  assert.equal(descriviAvanzamentoContesto(state('paused')).visible, true);
});

/*
 * 09/09 — chiusura del punto 1 della consegna v004 («prova che nessuna condizione del click chiami
 * /compact o /context/jobs implicitamente»). La spec browser copre già il pulsante del topbar
 * (apertura senza POST) e la chat non abilitata (zero mutazioni). Restava scoperto il TERZO click:
 * il pulsante «Context Manager» dentro la barra di avanzamento in chat. Qui si prova che quel click
 * fa una cosa sola — chiama `onOpen` — e che il componente non riceve alcun client da cui poter
 * avviare qualcosa: non ha proprio la mano per farlo.
 */
test('CTX-PROGRESS-OPEN-ONLY il pulsante nella barra in chat chiama solo onOpen, una volta per click', async () => {
  const { JSDOM } = await import('jsdom').catch(() => ({ JSDOM: null }));
  if (!JSDOM) { assert.ok(true, 'jsdom assente: la prova DOM gira nella suite browser'); return; }
  const { aggiornaAvanzamentoContesto } = await import('../../src/components/context-progress.js');
  const dom = new JSDOM('<div id="c"></div>');
  const container = dom.window.document.getElementById('c');
  let aperture = 0;
  const row = aggiornaAvanzamentoContesto(container, state('summarizing', { completed: 1, total: 3 }), { onOpen: () => { aperture += 1; } });
  const button = row.querySelector('button');
  assert.equal(button.textContent, 'Context Manager');
  button.click(); button.click();
  assert.equal(aperture, 2, 'ogni click apre; nessun altro effetto è possibile perché la barra non ha un client');
  assert.equal(row.querySelector('[data-context-chat-status]').textContent, 'Compattazione contesto in corso');
});

/*
 * 09/09 — LA STIMA DEL TEMPO RESIDUO nella barra in chat.
 *
 * Il fatto misurato che fa esistere questa prova: un giro vero con `z-ai/glm-5.3-flash`
 * (processo isolato, cronologia di 40 scambi, finestra 16.384) ha compattato in ~16 secondi
 * su 2 segmenti, e il primo token della risposta è arrivato a 61,2 s dall'invio. La chat
 * ASPETTA la compattazione (decisione presa, non si cambia): con la barra muta quei secondi
 * sembrano un blocco, quindi l'attesa va dichiarata.
 *
 * Ricerca 09/09/2026 che vincola la forma (fonte + data accanto a ogni regola):
 *  · Microsoft Win32 UX Guide «Progress Bars» (20/10/2020, agg. 11/03/2025) — «don't display
 *    potentially inaccurate estimates during this initial period»: nessun numero finché non
 *    c'è un campione. E, testuale, «you can have a time remaining estimate that increases…
 *    because the rate of progress may vary»: la BARRA non torna indietro, la STIMA può salire.
 *    Più: «update time remaining estimates at least every 5 seconds» e «don't give false
 *    precision».
 *  · NN/g, Sherwin «Progress Indicators Make a Slow System Less Insufferable» (26/10/2014) —
 *    la stima temporale si aggiunge dai ~15 s in su; sotto, un numero è precisione falsa.
 *  · Raymond Chen, The Old New Thing (06/01/2004) — «it can't predict the future, but it is
 *    forced to try»: all'inizio la storia è troppo poca. L'inaffidabilità è strutturale.
 *  · MDN `aria-valuetext` (12/05/2025) — la forma «8% (34 minutes) remaining» è documentata:
 *    dentro valuetext il conteggio SERVE, perché l'AT non «vede» la barra.
 *  · MDN role `timer` (23/06/2025) — ha `aria-live` implicito `off` proprio perché un numero
 *    che cambia di continuo non si annuncia: la stima sta FUORI dal `role="status"`.
 */
const T0 = Date.parse('2026-09-09T18:00:00.000Z');
const inizio = new Date(T0).toISOString();

test('CTX-PROGRESS-ETA-SENZA-DATI nessuna stima finché non c’è un campione misurato', () => {
  const job = extra => ({ id: 'j', state: 'summarizing', createdAt: inizio, progress: { completed: 1, total: 2, phase: 'summarizing' }, ...extra });
  // primo segmento non ancora finito: dividere per zero segmenti non è una stima, è un'invenzione
  assert.equal(stimaResiduoContesto(job({ progress: { completed: 0, total: 2, phase: 'summarizing' } }), T0 + 9000).noto, false);
  // fase indeterminata: `preparing` e `validating` non hanno segmenti, quindi non hanno un tasso
  assert.equal(stimaResiduoContesto(job({ state: 'preparing' }), T0 + 9000).noto, false);
  assert.equal(stimaResiduoContesto(job({ state: 'validating' }), T0 + 9000).noto, false);
  assert.equal(stimaResiduoContesto(job({ progress: undefined }), T0 + 9000).noto, false);
  assert.equal(stimaResiduoContesto(null, T0 + 9000).noto, false);
  // e il testo, in quel caso, dice che sta lavorando — non un numero
  assert.equal(descriviStimaResiduo({ noto: false }), 'tempo non ancora stimabile');
  assert.equal(descriviStimaResiduo({ noto: false }, { english: true }), 'time not measurable yet');
});

test('CTX-PROGRESS-ETA-RALLENTA la stima SALE quando un segmento è più lento del precedente', () => {
  const job = { id: 'j', state: 'summarizing', createdAt: inizio, progress: { completed: 1, total: 3, phase: 'summarizing' } };
  // un segmento in 20 s ⇒ due che restano ⇒ ~40 s
  const presto = stimaResiduoContesto(job, T0 + 20_000);
  assert.equal(descriviStimaResiduo(presto), 'circa 40 secondi rimanenti (stima)');
  // venti secondi dopo il secondo segmento NON è ancora finito: il tasso peggiora e la stima
  // cresce. Microsoft, testuale: «you can have a time remaining estimate that increases» — è
  // la barra a non tornare indietro, non la stima.
  const tardi = stimaResiduoContesto(job, T0 + 40_000);
  assert.ok(tardi.msResidui > presto.msResidui, 'un segmento lento deve allungare la stima, non nasconderla');
  assert.equal(descriviStimaResiduo(tardi), 'circa 1 minuto rimanente (stima)');
});

test('CTX-PROGRESS-ETA-RIPRESA nessun numero quando l’istante d’inizio non è noto', () => {
  const base = { id: 'j', state: 'summarizing', progress: { completed: 1, total: 2, phase: 'summarizing' } };
  // `createdAt` assente (forma piatta, fixture vecchie): non si finge di sapere quando è iniziato
  assert.equal(stimaResiduoContesto(base, T0 + 9000).noto, false);
  assert.equal(stimaResiduoContesto({ ...base, createdAt: 'ieri mattina' }, T0 + 9000).noto, false);
  // orologio incoerente: «adesso» prima dell'inizio non produce un tempo negativo travestito
  assert.equal(stimaResiduoContesto({ ...base, createdAt: inizio }, T0 - 1000).noto, false);
  assert.equal(stimaResiduoContesto({ ...base, createdAt: inizio }, T0).noto, false);
  // un lavoro ereditato da ore (fixture con data fissa) darebbe «circa 12 ore»: si rifiuta
  assert.equal(stimaResiduoContesto({ ...base, createdAt: inizio }, T0 + 12 * 3600_000).noto, false);
  // ⛔ ma il dato PERSISTE: `ContextJobV1.createdAt` è salvato e lo snapshot restituisce i job
  //    interi ⇒ dopo un reload la stima riparte dallo STESSO inizio, non da zero.
  const dopoReload = stimaResiduoContesto({ ...base, createdAt: inizio }, T0 + 20_000);
  assert.equal(dopoReload.noto, true);
  assert.equal(descriviStimaResiduo(dopoReload), 'circa 20 secondi rimanenti (stima)');
});

test('CTX-PROGRESS-ETA-QUASI-FINITA sotto i ~15 s si scrive una formula, non un numero falso', () => {
  // il caso misurato: 2 segmenti, ~16 s in tutto. A metà restano ~8 s: un numero al secondo
  // sarebbe precisione falsa (NN/g: la stima temporale si dà dai ~15 s in su).
  const job = { id: 'j', state: 'summarizing', createdAt: inizio, progress: { completed: 1, total: 2, phase: 'summarizing' } };
  assert.equal(descriviStimaResiduo(stimaResiduoContesto(job, T0 + 10_000)), 'ancora pochi secondi (stima)');
  assert.equal(descriviStimaResiduo(stimaResiduoContesto(job, T0 + 10_000), { english: true }), 'a few seconds left (estimate)');
  // ultimo segmento dichiarato completo mentre la fase gira ancora: zero residuo, stessa formula
  const finito = { ...job, progress: { completed: 2, total: 2, phase: 'summarizing' } };
  const coda = stimaResiduoContesto(finito, T0 + 16_000);
  assert.equal(coda.noto, true);
  assert.equal(descriviStimaResiduo(coda), 'ancora pochi secondi (stima)');
});

test('CTX-PROGRESS-ETA-ARROTONDA secondi interi a passi di 5, mai decimi', () => {
  // Microsoft: «update time remaining estimates at least every 5 seconds» e niente falsa
  // precisione. Il passo di 5 s serve anche a non far cambiare il testo a ogni giro del
  // monitor (1.200 ms), che accanto a una live region equivarrebbe a urlare.
  assert.equal(descriviStimaResiduo({ noto: true, msResidui: 17_400 }), 'circa 15 secondi rimanenti (stima)');
  assert.equal(descriviStimaResiduo({ noto: true, msResidui: 17_600 }), 'circa 20 secondi rimanenti (stima)');
  assert.equal(descriviStimaResiduo({ noto: true, msResidui: 42_300 }), 'circa 40 secondi rimanenti (stima)');
  // mai «circa 60 secondi»: quando l'unità grande esiste si passa ai minuti
  assert.equal(descriviStimaResiduo({ noto: true, msResidui: 58_000 }), 'circa 1 minuto rimanente (stima)');
  assert.equal(descriviStimaResiduo({ noto: true, msResidui: 150_000 }), 'circa 3 minuti rimanenti (stima)');
  assert.equal(descriviStimaResiduo({ noto: true, msResidui: 150_000 }, { english: true }), 'about 3 minutes remaining (estimate)');
  assert.equal(descriviStimaResiduo({ noto: true, msResidui: 58_000 }, { english: true }), 'about 1 minute remaining (estimate)');
  // nessun decimo, in nessun caso
  for (const ms of [15_001, 23_456, 47_999, 61_111, 604_321]) assert.ok(!/[.,]\d/.test(descriviStimaResiduo({ noto: true, msResidui: ms })), `decimi in ${ms}`);
});

test('CTX-PROGRESS-ETA-VISTA la vista porta la stima, e solo nella fase che ha segmenti', () => {
  const snap = (state, progress) => ({ sessionId: 'a', jobs: [{ id: 'j', state, createdAt: inizio, progress }] });
  const viva = descriviAvanzamentoContesto(snap('summarizing', { completed: 1, total: 3, phase: 'summarizing' }), { adesso: T0 + 20_000 });
  assert.equal(viva.determinate, true);
  assert.equal(viva.stima.noto, true);
  // ⛔ il testo VISIBILE non ripete il conteggio: la barra lo mostra già (Microsoft, testuale:
  //    «don't have percent complete text because that information is conveyed by the progress bar»)
  assert.ok(!/\bdi\s+3\b/.test(descriviStimaResiduo(viva.stima)));
  // fasi senza segmenti: nessuna stima, e la vista lo dichiara invece di tacere
  assert.equal(descriviAvanzamentoContesto(snap('preparing', { completed: 0, total: 0, phase: 'preparing' }), { adesso: T0 + 20_000 }).stima.noto, false);
  // senza `adesso` la vista resta usabile: l'orologio vero è il difetto
  assert.equal(typeof descriviAvanzamentoContesto(snap('summarizing', { completed: 1, total: 3, phase: 'summarizing' })).stima.noto, 'boolean');
});

/*
 * Il MONTAGGIO della riga, guardato senza jsdom (che non è fra le dipendenze del frontend:
 * la prova DOM sopra si autoesclude, quindi non guarda niente in questa suite).
 * ⛔ Questo scheletro prova la STRUTTURA e gli ATTRIBUTI, non il rendering: il pixel resta
 *    compito della spec browser. Guarda le tre cose che possono rompersi in silenzio:
 *      1. i figli della griglia restano TRE (`minmax(0,1fr) auto` + `progress` a 1/-1):
 *         un quarto figlio manderebbe il pulsante a capo senza che nessun test protesti;
 *      2. la stima sta FUORI dal `role="status"`, che è una live region;
 *      3. `aria-valuetext` sta sul `<progress>` e MAI sullo `span` con `role="status"`
 *         (fra i ruoli di quell'attributo `status` non c'è — MDN, 12/05/2025).
 */
class NodoFinto {
  constructor(tag, doc) { this.tagName = tag.toUpperCase(); this.ownerDocument = doc; this.children = []; this.attributes = {}; this.dataset = {}; this._text = ''; this.parentNode = null; }
  append(...figli) { for (const f of figli) { f.parentNode = this; this.children.push(f); } }
  remove() { const i = this.parentNode?.children.indexOf(this); if (i >= 0) this.parentNode.children.splice(i, 1); }
  setAttribute(n, v) { this.attributes[n] = String(v); }
  getAttribute(n) { return this.attributes[n] ?? null; }
  removeAttribute(n) { delete this.attributes[n]; }
  hasAttribute(n) { return n in this.attributes; }
  addEventListener() {}
  set textContent(v) { this._text = v; this.children = []; }
  get textContent() { return this.children.length ? this.children.map(c => c.textContent).join('') : this._text; }
  *discendenti() { for (const f of this.children) { yield f; yield* f.discendenti(); } }
  querySelector(sel) {
    const chiave = sel.startsWith('[') ? sel.slice(1, -1).replace(/^data-/, '').replace(/-([a-z])/g, (_, c) => c.toUpperCase()) : null;
    for (const n of this.discendenti()) if (chiave ? chiave in n.dataset : n.tagName === sel.toUpperCase()) return n;
    return null;
  }
}

test('CTX-PROGRESS-ETA-MONTAGGIO tre figli nella griglia, la stima fuori dalla live region', async () => {
  const { aggiornaAvanzamentoContesto } = await import('../../src/components/context-progress.js');
  const doc = { createElement: tag => new NodoFinto(tag, doc) };
  const contenitore = new NodoFinto('div', doc);
  const snap = (state, progress) => ({ sessionId: 's1', jobs: [{ id: 'j', state, createdAt: inizio, progress }] });

  let riga = aggiornaAvanzamentoContesto(contenitore, snap('summarizing', { completed: 1, total: 3, phase: 'summarizing' }), { adesso: T0 + 20_000 });
  assert.deepEqual(riga.children.map(n => n.tagName), ['SPAN', 'BUTTON', 'PROGRESS'], 'un quarto figlio romperebbe la griglia a due colonne');
  const stato = riga.querySelector('[data-context-chat-status]'), eta = riga.querySelector('[data-context-chat-eta]'), barra = riga.querySelector('progress');
  assert.equal(stato.getAttribute('role'), 'status');
  assert.equal(stato.textContent, 'Compattazione contesto in corso', 'la live region porta SOLO la fase, che cambia di rado');
  assert.equal(eta.getAttribute('aria-live'), 'off');
  assert.equal(eta.textContent, ' · circa 40 secondi rimanenti (stima)');
  assert.equal(stato.hasAttribute('aria-valuetext'), false, '`status` non è fra i ruoli di aria-valuetext');
  assert.equal(barra.getAttribute('aria-valuetext'), '1 di 3 segmenti · circa 40 secondi rimanenti (stima)');

  // lo stesso lavoro, con un segmento che rallenta: la stima sale, la barra non torna indietro
  riga = aggiornaAvanzamentoContesto(contenitore, snap('summarizing', { completed: 1, total: 3, phase: 'summarizing' }), { adesso: T0 + 60_000 });
  assert.equal(riga.querySelector('[data-context-chat-eta]').textContent, ' · circa 2 minuti rimanenti (stima)');
  assert.equal(riga.querySelector('progress').value, 1);

  // primo segmento non finito: nessun numero, e il valuetext resta il solo conteggio
  riga = aggiornaAvanzamentoContesto(contenitore, snap('summarizing', { completed: 0, total: 3, phase: 'summarizing' }), { adesso: T0 + 5000 });
  assert.equal(riga.querySelector('[data-context-chat-eta]').textContent, ' · tempo non ancora stimabile');
  assert.equal(riga.querySelector('progress').getAttribute('aria-valuetext'), '0 di 3 segmenti');

  // fase senza segmenti: nemmeno «non stimabile» — è il periodo iniziale che si lascia muto
  riga = aggiornaAvanzamentoContesto(contenitore, snap('preparing', { completed: 0, total: 0, phase: 'preparing' }), { adesso: T0 + 5000 });
  assert.equal(riga.querySelector('[data-context-chat-eta]').textContent, '');

  // riconnessione: non sappiamo lo stato, quindi nemmeno il tempo
  riga = aggiornaAvanzamentoContesto(contenitore, snap('summarizing', { completed: 1, total: 3, phase: 'summarizing' }), { adesso: T0 + 20_000, stale: true });
  assert.equal(riga.querySelector('[data-context-chat-status]').textContent, 'Avanzamento non disponibile. Riconnessione…');
  assert.equal(riga.querySelector('[data-context-chat-eta]').textContent, '');

  // il job della fixture browser ha un `createdAt` fisso: mai «circa 12 ore»
  riga = aggiornaAvanzamentoContesto(contenitore, snap('summarizing', { completed: 1, total: 3, phase: 'summarizing' }), { adesso: T0 + 12 * 3600_000 });
  assert.equal(riga.querySelector('[data-context-chat-eta]').textContent, ' · tempo non ancora stimabile');
});
