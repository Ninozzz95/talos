import test from 'node:test';
import assert from 'node:assert/strict';
import { impostaLingua } from '../../src/components/lingua.js';
import { montaCartaCompattazione } from '../../src/components/carta-compattazione.js';
import { percheDellaCatena, testoRigaCompattazione } from '../../src/components/compattazione-legacy.js';
import { aggiornaRigaModelloInutilizzabile, aggiornaSeparatoreLegacy, aggiornaSeparatoreContesto, creaSeparatoreContesto } from '../../src/components/context-separator.js';
import { trascriviEventoInterno } from '../../src/components/trascrizione-eventi-interni.js';

/* Revisione avversaria del Blocco 22 (01/11/2026), con la campagna di Performance accesa: niente browser, DOM finto. Le REV22 da I a M sono nate rosse sui difetti F1, F2, F6,
   F7, F8; le altre sono le prove delle cure, scritte prima della cura. Le stesse prove sul browser vero stanno in `tests/browser/rev22-revisore.spec.mjs`, da eseguire. */
impostaLingua('it');

/* ---------------------------------------------------- la carta: un elemento finto per ogni selettore */
function elemento(nome) {
  const figli = new Map(); const ascoltatori = {}; const attributi = new Map();
  return {
    nome, dataset: {}, style: {}, hidden: false, disabled: false, textContent: '', value: '', innerHTML: '', opzioni: [], clic: 0, storia: [], tolta: false, isConnected: false, nextElementSibling: null, onclick: null,
    setAttribute(k, v) { attributi.set(k, String(v)); }, getAttribute(k) { return attributi.has(k) ? attributi.get(k) : null; },
    addEventListener(tipo, fn) { (ascoltatori[tipo] ??= []).push(fn); }, removeEventListener() {},
    emetti(tipo, evento) { for (const fn of ascoltatori[tipo] ?? []) fn(evento); },
    querySelector(sel) { if (!figli.has(sel)) figli.set(sel, elemento(sel)); return figli.get(sel); },
    replaceChildren(...voci) { this.opzioni = voci; },
    remove() { this.isConnected = false; this.tolta = true; }, after(n) { this.nextElementSibling = n; n.isConnected = true; n.tolta = false; }, prepend(n) { n.isConnected = true; n.tolta = false; },
    closest() { return this; }, focus() { this.storia.push('fuoco'); },
    /* come il controllo vero (`calm-controls.js:232`): un clic apre, il clic dopo chiude */
    click() { this.clic += 1; this.storia.push('clic'); this.setAttribute('aria-expanded', String(this.getAttribute('aria-expanded') !== 'true')); },
  };
}
const BASE = { motore: 'engine', modelloDelRiassunto: 'z-ai/glm-5.3-flash', riservaDelRiassunto: null, catena: [{ ruolo: 'scelto', modello: 'z-ai/glm-5.3-flash', stato: 'pronto', origine: 'scelta' }, { ruolo: 'senza-modello', modello: null, stato: 'pronto' }] };
const INUTILIZZABILE = { ...BASE, catena: [{ ...BASE.catena[0], stato: 'inutilizzabile', motivo: 'senza-chiave' }, BASE.catena[1]] };
const risposta = (data, ok = true) => ({ ok, json: async () => (ok ? { ok: true, data } : { ok: false, error: { code: 'X' } }) });
function banco(rotte = {}) {
  const chiesti = []; const schede = []; const fotogrammi = []; const ascolti = {};
  const pannello = elemento('pannello');
  const documento = {
    createElement(tag) { const e = elemento(tag); if (tag === 'div') schede.push(e); return e; },
    getElementById: (id) => (id === 'setting-panel-memoria' ? pannello : null),
    addEventListener(tipo, fn) { ascolti[tipo] = fn; }, removeEventListener() {}, documentElement: elemento('radice'),
  };
  const fetchFn = async (url, opzioni = {}) => {
    chiesti.push(`${opzioni.method ?? 'GET'} ${url}`);
    if (rotte[`${opzioni.method ?? 'GET'} ${url}`]) return rotte[`${opzioni.method ?? 'GET'} ${url}`](opzioni);
    if (url === '/api/v1/context-settings') return risposta(BASE);
    if (url === '/api/v1/models') return risposta({ modelli: [{ id: 'z-ai/glm-5.3-flash', nome: 'GLM 5.3 Flash' }, { id: 'openai/gpt-5.4', nome: 'GPT-5.4' }] });
    return risposta(null);
  };
  const carta = montaCartaCompattazione({ documento, fetchFn, win: { requestAnimationFrame: (f) => { fotogrammi.push(f); } } });
  return { carta, chiesti, schede, pannello, ascolti, fotogramma() { for (const f of fotogrammi.splice(0)) f(); } };
}
const finito = () => new Promise((ok) => setTimeout(ok, 20));
const laScheda = (b) => b.pannello.querySelector('[data-settings-card="memoria-motore-contesto"]').nextElementSibling;
const SCELTA_DELL_ANTHROPIC = { 'GET /api/v1/providers': () => risposta({ items: [{ id: 'anthropic', keyConfigured: true }] }), 'GET /api/v1/providers/anthropic/models': () => risposta({ modelli: [{ id: 'anthropic:claude-sonnet-5', nome: 'Claude Sonnet 5' }] }) };

test('REV22-I — il menu chiede anche i fornitori diretti, come il selettore (`app.js:8916`)', async () => {
  const b = banco(SCELTA_DELL_ANTHROPIC);
  await finito();
  await b.carta.leggi(); await finito(); // la scheda aperta: `suClic`
  const voci = laScheda(b).querySelector('#setting-modelloDelRiassunto').opzioni.map((o) => o.value);
  assert.ok(voci.includes('openai/gpt-5.4'), 'premessa: il catalogo OpenRouter c\'è');
  assert.ok(voci.includes('anthropic:claude-sonnet-5'), `il menu offre solo: ${voci.join(', ')}; chieste: ${b.chiesti.join(' | ')}`);
});

test('REV22-I2 — chi ha solo chiavi dirette vede i suoi modelli: col fornitore accanto al nome, prima del catalogo; un fornitore rotto non porta giù gli altri', async () => {
  const b = banco({
    'GET /api/v1/models': () => risposta(null, false),
    'GET /api/v1/auth/chatgpt/stato': () => risposta({ collegato: true, pianoAbilitato: true }),
    'GET /api/v1/providers/chatgpt/models': () => risposta({ modelli: [{ id: 'chatgpt:gpt-6-luna', nome: 'GPT-6 Luna' }] }),
    'GET /api/v1/providers': () => risposta({ items: [{ id: 'anthropic', keyConfigured: true }, { id: 'gemini', keyConfigured: true }, { id: 'openai', keyConfigured: false }] }),
    'GET /api/v1/providers/anthropic/models': SCELTA_DELL_ANTHROPIC['GET /api/v1/providers/anthropic/models'],
    'GET /api/v1/providers/gemini/models': () => risposta(null, false),
    'GET /api/v1/context-settings': () => risposta({ ...BASE, modelloDelRiassunto: 'anthropic:claude-sonnet-5', catena: [{ ...BASE.catena[0], modello: 'anthropic:claude-sonnet-5' }, BASE.catena[1]] }),
  });
  await finito();
  await b.carta.leggi(); await finito(); // la scheda aperta: `suClic`
  const scheda = laScheda(b);
  assert.deepEqual(scheda.querySelector('#setting-modelloDelRiassunto').opzioni.map((o) => [o.value, o.textContent]).slice(1), [['chatgpt:gpt-6-luna', 'ChatGPT plan · GPT-6 Luna'], ['anthropic:claude-sonnet-5', 'Anthropic · Claude Sonnet 5']]);
  assert.ok(!b.chiesti.includes('GET /api/v1/providers/openai/models'), 'una chiave non collegata non si chiede');
  assert.equal(scheda.querySelector('[data-compattazione-catena]').textContent, 'Adesso: Claude Sonnet 5, poi una compattazione rapida senza modello.', 'la frase dice il nome, non la voce del menu');
});

test('REV22-I3 — all\'avvio nessun catalogo: si chiede solo lo stato; i cataloghi partono da Avanzate, se nessuno li ha ancora letti', async () => {
  const b = banco(SCELTA_DELL_ANTHROPIC);
  await finito();
  assert.deepEqual(b.chiesti, ['GET /api/v1/context-settings'], 'all\'avvio, a ogni finestra aperta, nessun fornitore viene disturbato');
  const avanzate = laScheda(b).querySelector('[data-compattazione-avanzate]');
  avanzate.emetti('click');
  await finito();
  assert.ok(b.chiesti.includes('GET /api/v1/models'), `chieste: ${b.chiesti.join(' | ')}`);
  assert.ok(laScheda(b).querySelector('#setting-modelloDelRiassunto').opzioni.some((o) => o.value === 'anthropic:claude-sonnet-5'));
  /* AL CONTRARIO: richiudendo e riaprendo non si richiede niente, i modelli ci sono già */
  const quante = b.chiesti.length;
  avanzate.emetti('click'); avanzate.emetti('click');
  await finito();
  assert.equal(b.chiesti.length, quante);
});

test('REV22-J — una lettura partita prima del salvataggio non riporta indietro la scelta', async () => {
  let liberaLaLettura; let letture = 0;
  const b = banco({
    'GET /api/v1/context-settings': () => { letture += 1; return letture === 1 ? risposta(BASE) : new Promise((ok) => { liberaLaLettura = () => ok(risposta(BASE)); }); },
    'POST /api/v1/context-settings': (o) => risposta({ ...BASE, ...JSON.parse(o.body) }),
  });
  await finito();
  const lenta = b.carta.leggi(); // la scheda riaperta: `suClic`
  await finito();
  const select = laScheda(b).querySelector('#setting-modelloDelRiassunto');
  select.emetti('change', { target: { value: 'openai/gpt-5.4' } });
  await finito();
  assert.equal(select.value, 'openai/gpt-5.4', 'premessa: la risposta del POST è a schermo');
  liberaLaLettura(); await lenta; await finito();
  assert.equal(select.value, 'openai/gpt-5.4');
});

test('REV22-J2 — nemmeno una lettura partita DURANTE il salvataggio; e fra due letture vince l\'ultima', async () => {
  let liberaLaLettura; let liberaIlPost; let letture = 0;
  const b = banco({
    'GET /api/v1/context-settings': () => { letture += 1; return letture === 1 ? risposta(BASE) : new Promise((ok) => { liberaLaLettura = () => ok(risposta(BASE)); }); },
    'POST /api/v1/context-settings': (o) => new Promise((ok) => { liberaIlPost = () => ok(risposta({ ...BASE, ...JSON.parse(o.body) })); }),
  });
  await finito();
  const select = laScheda(b).querySelector('#setting-modelloDelRiassunto');
  select.emetti('change', { target: { value: 'openai/gpt-5.4' } });
  await finito();
  const inMezzo = b.carta.leggi();
  await finito();
  liberaIlPost(); await finito();
  liberaLaLettura(); await inMezzo; await finito();
  assert.equal(select.value, 'openai/gpt-5.4');

  let liberaLaVecchia; let seconda = 0;
  const c = banco({ 'GET /api/v1/context-settings': () => { seconda += 1; if (seconda === 2) return new Promise((ok) => { liberaLaVecchia = () => ok(risposta(BASE)); }); return risposta({ ...BASE, modelloDelRiassunto: seconda === 1 ? BASE.modelloDelRiassunto : 'openai/gpt-5.4' }); } });
  await finito();
  const vecchia = c.carta.leggi(); await finito();
  await c.carta.leggi(); await finito();
  liberaLaVecchia(); await vecchia; await finito();
  assert.equal(laScheda(c).querySelector('#setting-modelloDelRiassunto').value, 'openai/gpt-5.4');
});

test('REV22-J3 — il salvataggio non butta i modelli in arrivo: il menu non resta vuoto', async () => {
  let liberaIModelli;
  const b = banco({
    'GET /api/v1/models': () => new Promise((ok) => { liberaIModelli = () => ok(risposta({ modelli: [{ id: 'openai/gpt-5.4', nome: 'GPT-5.4' }] })); }),
    'POST /api/v1/context-settings': (o) => risposta({ ...BASE, ...JSON.parse(o.body) }),
  });
  await finito();
  void b.carta.leggi(); await finito(); // la scheda aperta: i cataloghi partono da qui
  const select = laScheda(b).querySelector('#setting-modelloDelRiassunto');
  select.emetti('change', { target: { value: '' } });
  await finito();
  liberaIModelli(); await finito();
  assert.ok(select.opzioni.some((o) => o.value === 'openai/gpt-5.4'));
});

test('REV22-J4 — fra due letture dei modelli vince l\'ultima', async () => {
  let chiamate = 0; let liberaLaVecchia;
  const b = banco({ 'GET /api/v1/models': () => {
    chiamate += 1;
    if (chiamate === 2) return new Promise((ok) => { liberaLaVecchia = () => ok(risposta({ modelli: [{ id: 'vecchio/m', nome: 'Vecchio' }] })); });
    return risposta({ modelli: [{ id: 'nuovo/m', nome: 'Nuovo' }] });
  } });
  await finito();
  await b.carta.leggi(); await finito(); // la prima lettura dei modelli: la scheda aperta
  const vecchia = b.carta.leggi(); await finito();
  await b.carta.leggi(); await finito();
  liberaLaVecchia(); await vecchia; await finito();
  const voci = laScheda(b).querySelector('#setting-modelloDelRiassunto').opzioni.map((o) => o.value);
  assert.ok(voci.includes('nuovo/m'), 'premessa');
  assert.ok(!voci.includes('vecchio/m'));
});

test('REV22-K — una lettura fallita non toglie la carta senza una parola (la sorella dice «non disponibile»)', async () => {
  let letture = 0;
  const b = banco({ 'GET /api/v1/context-settings': () => { letture += 1; return letture === 2 ? risposta(null, false) : risposta(BASE); } });
  await finito();
  const scheda = laScheda(b);
  assert.equal(scheda.tolta, false, 'premessa: la carta c\'era');
  await b.carta.leggi(); await finito();
  assert.equal(scheda.tolta, false);
  const catena = scheda.querySelector('[data-compattazione-catena]');
  assert.equal(catena.textContent, 'Questa impostazione non è disponibile in questa istanza.');
  assert.equal(catena.hidden, false);
  assert.equal(scheda.querySelector('[data-compattazione-avanzate]').hidden, true, 'niente Avanzate su uno stato che non si sa');
  assert.equal(scheda.querySelector('[data-compattazione-corpo]').hidden, true);
  await b.carta.leggi(); await finito();
  assert.match(catena.textContent, /^Adesso: /u, 'la lettura dopo la rimette a posto');
  assert.equal(scheda.querySelector('[data-compattazione-avanzate]').hidden, false);
});

test('REV22-K2 — anche alla prima lettura la carta c\'è e lo dice; il salto dalla chat non apre un menu che non c\'è', async () => {
  const b = banco({ 'GET /api/v1/context-settings': () => risposta(null, false) });
  await finito();
  const scheda = laScheda(b);
  assert.equal(scheda.querySelector('[data-compattazione-catena]').textContent, 'Questa impostazione non è disponibile in questa istanza.');
  b.ascolti['talos:scegli-modello-compattazione']({ detail: { scelta: 'modello' } });
  await finito(); b.fotogramma();
  assert.equal(scheda.querySelector('#setting-modelloDelRiassunto').querySelector('.calm-select').clic, 0);
});

test('REV22-L — due clic su «Scegli un altro» non richiudono il menu (`calm-controls.js`: il secondo clic del controllo chiude)', async () => {
  const b = banco({ 'GET /api/v1/context-settings': () => risposta(INUTILIZZABILE) });
  await finito();
  const scheda = laScheda(b);
  const tasto = scheda.querySelector('[data-compattazione-scegli]');
  assert.equal(typeof tasto.onclick, 'function', 'premessa: il tasto c\'è');
  const controllo = scheda.querySelector('#setting-modelloDelRiassunto').querySelector('.calm-select');
  tasto.onclick(); tasto.onclick(); b.fotogramma(); // nello stesso fotogramma
  assert.equal(controllo.clic, 1);
  assert.equal(controllo.getAttribute('aria-expanded'), 'true', 'il menu resta aperto');
  tasto.onclick(); b.fotogramma(); // col menu già aperto
  assert.equal(controllo.clic, 1);
});

test('REV22-L2 — da tastiera: il fuoco va sul controllo prima di aprirlo, perché i tasti sono legati a lui (`calm-controls.js:233`)', async () => {
  const b = banco({ 'GET /api/v1/context-settings': () => risposta(INUTILIZZABILE) });
  await finito();
  const scheda = laScheda(b);
  scheda.querySelector('[data-compattazione-scegli]').onclick(); b.fotogramma();
  assert.deepEqual(scheda.querySelector('#setting-modelloDelRiassunto').querySelector('.calm-select').storia, ['fuoco', 'clic']);
});

test('REV22-L3 — il salto dalla chat regge una lettura superata da un\'altra: Avanzate si apre lo stesso, il menu pure', async () => {
  let letture = 0; const lente = [];
  const b = banco({ 'GET /api/v1/context-settings': () => { letture += 1; return letture === 1 ? risposta(INUTILIZZABILE) : new Promise((ok) => { lente.push(() => ok(risposta(INUTILIZZABILE))); }); } });
  await finito();
  const scheda = laScheda(b);
  assert.equal(scheda.querySelector('[data-compattazione-corpo]').hidden, true, 'premessa: Avanzate è chiuso');
  b.ascolti['talos:scegli-modello-compattazione']({ detail: { scelta: 'modello' } }); // la lettura del salto
  await finito();
  const seconda = b.carta.leggi(); // la scheda riaperta intanto
  await finito();
  lente[0](); await finito(); // torna prima quella superata: si scarta
  assert.equal(scheda.querySelector('[data-compattazione-corpo]').hidden, false);
  b.fotogramma();
  assert.equal(scheda.querySelector('#setting-modelloDelRiassunto').querySelector('.calm-select').clic, 1);
  lente[1](); await seconda;
});

/* ---------------------------------------------------- la riga: lo stesso DOM finto di `riga-viva-riassunto-b1.test.mjs` */
const camel = (kebab) => kebab.replace(/-([a-z])/gu, (_, c) => c.toUpperCase());
function corrisponde(el, sel) {
  const attributo = /^\[data-([a-z-]+)(?:="([^"]*)")?\]$/u.exec(sel);
  if (attributo) { const v = el.dataset[camel(attributo[1])]; return attributo[2] === undefined ? v !== undefined : v === attributo[2]; }
  return el.tagName === sel.toLowerCase();
}
function creaElemento(tag, doc) {
  const attributi = new Map(); const ascoltatori = {};
  return {
    tagName: tag, ownerDocument: doc, parentNode: null, children: [], dataset: {}, hidden: false, className: '', type: '', style: {}, _testo: '',
    get textContent() { return this.children.length ? this.children.map((c) => c.textContent).join('') : this._testo; },
    set textContent(v) { this._testo = String(v); this.children = []; },
    get title() { return attributi.get('title') ?? ''; }, set title(v) { attributi.set('title', String(v)); },
    setAttribute(k, v) { attributi.set(k, String(v)); }, getAttribute(k) { return attributi.has(k) ? attributi.get(k) : null; }, removeAttribute(k) { attributi.delete(k); },
    addEventListener(t, fn) { (ascoltatori[t] ??= []).push(fn); },
    append(...figli) { for (const f of figli) { f.remove(); f.parentNode = this; this.children.push(f); } },
    get previousElementSibling() { const fratelli = this.parentNode?.children ?? []; return fratelli[fratelli.indexOf(this) - 1] ?? null; },
    after(n) { n.remove(); const fratelli = this.parentNode.children; fratelli.splice(fratelli.indexOf(this) + 1, 0, n); n.parentNode = this.parentNode; },
    remove() { if (this.parentNode) this.parentNode.children = this.parentNode.children.filter((c) => c !== this); this.parentNode = null; },
    get isConnected() { return Boolean(this.parentNode); },
    querySelectorAll(sel) { const fuori = []; const giro = (n) => { for (const c of n.children) { if (sel.split(',').some((s) => corrisponde(c, s.trim()))) fuori.push(c); giro(c); } }; giro(this); return fuori; },
    querySelector(sel) { return this.querySelectorAll(sel)[0] ?? null; },
  };
}
const creaDocumento = () => { const doc = { createElement: (tag) => creaElemento(tag, doc), createElementNS: (_ns, tag) => creaElemento(tag, doc) }; return doc; };
const AT = '2026-11-01T10:00:00.000Z';
const FERMO = { modello: 'z-ai/glm-5.3-flash', stato: 'bloccato', motivo: 'rete' };
const versioneCon = (provenienza) => ({ schema: 'talos.context.event.v1', id: 'e1', sessionId: 's', jobId: 'j1', versionId: 'v1', kind: 'context.version.committed', createdAt: '2026-11-01T10:05:00.000Z', payload: { coveredThrough: 40, ...(provenienza ? { provenienza } : {}) } });
const DELLA_RISERVA = { riassuntoDi: 'qwen/qwen3.7-flash', dallaRiserva: true, nonDisponibile: FERMO };
function rigaRapida() {
  const document = creaDocumento();
  const colonna = document.createElement('div');
  aggiornaSeparatoreLegacy(colonna, { at: AT, stato: 'riassunta', ripiego: true, ragione: 'in-arrivo', lavoroDelMotore: 'j1', tokenPrima: 182_000, tokenDopo: 41_000 }, { sessionId: 's', document, testo: 'Compattazione rapida senza il modello · 182k → 41k' });
  return { document, colonna };
}

test('REV22-M — strada del motore: la riserva che prende il posto della rapida firma la riga, come sulla strada semplice e nel trascritto', () => {
  const { document, colonna } = rigaRapida();
  aggiornaSeparatoreContesto(colonna, [versioneCon(DELLA_RISERVA)], { sessionId: 's', document });
  const [riga] = colonna.children;
  assert.equal(colonna.children.length, 1, 'premessa: la riga è la stessa');
  assert.notEqual(riga.dataset.compattazioneMigliorata, undefined, 'premessa: è stata promossa');
  assert.match(riga.textContent, /qwen3\.7-flash/u);
});

test('REV22-M2 — stessa riga, stesso `title`, stessa etichetta e stesso trascritto sulle due strade; senza firma resta «migliorata» e il perché vecchio se ne va', () => {
  const { document, colonna } = rigaRapida();
  const span = colonna.querySelector('[data-compattazione-testo]');
  span.title = 'il perché del rapido';
  const versione = versioneCon(DELLA_RISERVA);
  aggiornaSeparatoreContesto(colonna, [versione], { sessionId: 's', document });
  const frase = 'Compattazione di qwen3.7-flash (riserva)';
  const perche = percheDellaCatena({ nonDisponibile: FERMO, dallaRiserva: true });
  assert.equal(span.textContent, frase);
  assert.equal(span.title, perche);
  assert.equal(colonna.children[0].getAttribute('aria-label'), frase);
  assert.equal(testoRigaCompattazione({ stato: 'riassunta', dallaRiserva: true, riassuntoDi: DELLA_RISERVA.riassuntoDi, nonDisponibile: FERMO }), frase, 'la strada semplice, senza i numeri che il motore non dà');
  const sorella = creaSeparatoreContesto(versione, { document });
  assert.equal(sorella.children[0].textContent, frase);
  assert.equal(sorella.children[0].title, perche);
  assert.deepEqual(trascriviEventoInterno({ type: 'CUSTOM', name: 'talos.context', value: versione }), { testo: frase });

  const altra = rigaRapida();
  const spanAltra = altra.colonna.querySelector('[data-compattazione-testo]');
  aggiornaSeparatoreContesto(altra.colonna, [versioneCon(null)], { sessionId: 's', document: altra.document });
  assert.equal(spanAltra.textContent, 'Compattazione migliorata dal modello', 'al contrario: il modello scelto non firma');
  assert.equal(spanAltra.title, '');
});

test('REV22-N — il `title` della riga semplice usa gli stessi nomi della riga', () => {
  const document = creaDocumento();
  const colonna = document.createElement('div');
  const riga = aggiornaSeparatoreLegacy(colonna, { at: AT, stato: 'riassunta', dallaRiserva: true, riassuntoDi: 'qwen/qwen3.7-flash', nonDisponibile: FERMO }, { sessionId: 's', document, testo: 'x', nomi: (id) => `«${id}»` });
  assert.match(riga.querySelector('[data-compattazione-testo]').title, /«z-ai\/glm-5\.3-flash»/u);
});

const AVVISO = (modello) => ({ at: AT, modello, motivo: 'senza-chiave', scelto: 'persona', ruolo: 'scelto' });
const VOCE = { at: AT, stato: 'riassunta', tokenPrima: 182_000, tokenDopo: 41_000, dallaRiserva: true, riassuntoDi: 'qwen/qwen3.7-flash' };
const ordine = (colonna) => colonna.children.map((n) => (n.dataset.compattazioneInutilizzabile !== undefined ? `avviso:${n.dataset.compattazioneInutilizzabile.split('|').pop()}` : n.dataset.contextSeparator !== undefined ? 'motore' : n.dataset.compattazioneRiga !== undefined ? 'riga' : n.tagName));

test('REV22-O — l\'avviso parte dentro il tentativo e la riga coi numeri dopo: l\'avviso resta sotto la riga, come il bozzetto, nell\'ordine in cui è arrivato', () => {
  const document = creaDocumento();
  const colonna = document.createElement('div');
  aggiornaRigaModelloInutilizzabile(colonna, AVVISO('a/uno'), { sessionId: 's', document });
  aggiornaRigaModelloInutilizzabile(colonna, AVVISO('b/due'), { sessionId: 's', document });
  aggiornaSeparatoreLegacy(colonna, VOCE, { sessionId: 's', document, testo: 'numeri' });
  assert.deepEqual(ordine(colonna), ['riga', 'avviso:a/uno', 'avviso:b/due']);
});

test('REV22-O2 — stesso ordine sulla strada del motore; e una riga già scritta non si tira dietro un avviso nato dopo', () => {
  const document = creaDocumento();
  const colonna = document.createElement('div');
  aggiornaRigaModelloInutilizzabile(colonna, AVVISO('a/uno'), { sessionId: 's', document });
  aggiornaSeparatoreContesto(colonna, [versioneCon(DELLA_RISERVA)], { sessionId: 's', document });
  assert.deepEqual(ordine(colonna), ['motore', 'avviso:a/uno']);

  const dopo = document.createElement('div');
  aggiornaSeparatoreLegacy(dopo, VOCE, { sessionId: 's', document, testo: 'numeri' });
  aggiornaRigaModelloInutilizzabile(dopo, AVVISO('a/uno'), { sessionId: 's', document });
  aggiornaSeparatoreLegacy(dopo, VOCE, { sessionId: 's', document, testo: 'numeri' }); // la rigiocata
  assert.deepEqual(ordine(dopo), ['riga', 'avviso:a/uno']);

  const altro = document.createElement('div');
  const paragrafo = document.createElement('p'); altro.append(paragrafo);
  aggiornaRigaModelloInutilizzabile(altro, AVVISO('a/uno'), { sessionId: 's', document });
  altro.append(document.createElement('p'));
  aggiornaSeparatoreLegacy(altro, VOCE, { sessionId: 's', document, testo: 'numeri' });
  assert.deepEqual(ordine(altro), ['p', 'avviso:a/uno', 'p', 'riga'], 'un avviso staccato dalla riga da un altro blocco non è suo');
});
