/*
 * Fase 8 «Impostazioni dalla chat» sul PC (02/11/2026, bozzetto chiuso FE-055): carta, riga dell'attrezzo con «Annulla», segno nelle
 * Impostazioni, riga della notifica e suggerimento di `/settings`. Ogni pezzo dal suo dato VERO (le forme del server:
 * `servizio-impostazioni.mjs` `cartaDi`/`cambioDaMostrare`/`nuovaRicevuta`, `notifiche-scrittori.mjs` `impostazioni`, `catalogoPubblico`),
 * e ognuno anche AL CONTRARIO: dato assente ⇒ niente riga, mai una chiave grezza a schermo.
 *
 * Il DOM finto è qui (il frontend non ha jsdom): fa solo ciò che serve, e un selettore che non sa leggere LANCIA invece di rispondere
 * `null` — un finto che tace farebbe passare un componente rotto.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { impostaLingua } from '../../src/components/lingua.js';
import {
  eCartaImpostazioni, registraCatalogoImpostazioni, nomeImpostazione, valoreInParole, prezzoInParole, direzioneDelloSforzo,
  frasiDiSicurezza, cartaAncheInAccessoPieno, testiCartaImpostazioni, creaBloccoCartaImpostazioni, ancoraNelleImpostazioni,
  esitoDellAnnullaRifiutato, ricevutaDallEsito, fattoSenzaCarta, mettiImpostazioniSullaRiga, segniDalleRicevute, testoDelSegno,
  montaSegniImpostazioni, fraseDellaNotificaImpostazioni, suggerimentiImpostazioni,
  comandoImpostazioniDaApplicare, ricordaRifiutoImpostazioni, creaNotaImpostazioniDellaPersona, rifiutoCheVaAlModello, creaNotaImpostazioniGiaCosi,
  citazioneDelModello, minacciaDellaRagioneInParole, fraseDellaPressioneSenzaCarta, CITAZIONE_MASSIMA,
} from '../../src/components/impostazioni-dalla-chat.js';
import { fraseDellaVoce, vociInOrdine, vociDaFare, FATTI_SENZA_RIGA, creaRigaNotifica, testoNotificaSistema } from '../../src/components/notifiche.js';

/* ───────────── il DOM finto ───────────── */
const camel = (s) => s.replace(/-([a-z])/gu, (_, c) => c.toUpperCase());
function documentoFinto() {
  const doc = {};
  const nodo = (tag) => {
    const attr = new Map();
    const n = {
      nodeType: 1, tagName: String(tag).toUpperCase(), ownerDocument: doc, figli: [], padre: null, dataset: {}, ascolti: [],
      hidden: false, disabled: false, title: '', type: '', id: '', _testo: '', _classi: new Set(),
      get className() { return [...n._classi].join(' '); },
      set className(v) { n._classi = new Set(String(v).split(/\s+/u).filter(Boolean)); },
      classList: { add: (...c) => c.forEach((x) => n._classi.add(x)), contains: (c) => n._classi.has(c), remove: (...c) => c.forEach((x) => n._classi.delete(x)) },
      get textContent() { return n._testo !== '' ? n._testo : n.figli.map((f) => f.textContent).join(''); },
      set textContent(v) { for (const f of n.figli) f.padre = null; n.figli = []; n._testo = String(v); },
      get firstElementChild() { return n.figli.find((f) => f.nodeType === 1) ?? null; },
      get nextElementSibling() { if (!n.padre) return null; const f = n.padre.figli.filter((x) => x.nodeType === 1); return f[f.indexOf(n) + 1] ?? null; },
      get isConnected() { return n.padre !== null; },
      setAttribute: (k, v) => { if (k.startsWith('data-')) n.dataset[camel(k.slice(5))] = String(v); else attr.set(k, String(v)); },
      getAttribute: (k) => (k.startsWith('data-') ? (n.dataset[camel(k.slice(5))] ?? null) : k === 'class' ? n.className : attr.has(k) ? attr.get(k) : null),
      removeAttribute: (k) => { if (k.startsWith('data-')) delete n.dataset[camel(k.slice(5))]; else attr.delete(k); },
      hasAttribute: (k) => n.getAttribute(k) !== null,
      append: (...xs) => { for (const x of xs) { if (x.padre) x.remove(); x.padre = n; n._testo = ''; n.figli.push(x); } },
      prepend: (...xs) => { for (const x of [...xs].reverse()) { if (x.padre) x.remove(); x.padre = n; n.figli.unshift(x); } },
      before: (x) => { if (x.padre) x.remove(); const f = n.padre.figli; x.padre = n.padre; f.splice(f.indexOf(n), 0, x); },
      after: (x) => { if (x.padre) x.remove(); const f = n.padre.figli; x.padre = n.padre; f.splice(f.indexOf(n) + 1, 0, x); },
      remove: () => { if (n.padre) n.padre.figli = n.padre.figli.filter((f) => f !== n); n.padre = null; },
      replaceChildren: (...xs) => { for (const f of n.figli) f.padre = null; n.figli = []; n._testo = ''; n.append(...xs); },
      addEventListener: (t, fn) => n.ascolti.push([t, fn]),
      click: () => { const e = { type: 'click', target: n, fermato: false, stopPropagation() { e.fermato = true; } }; for (const [t, fn] of n.ascolti) if (t === 'click') fn(e); return e; },
      querySelectorAll: (sel) => cerca(n, sel),
      querySelector: (sel) => cerca(n, sel)[0] ?? null,
      closest: (sel) => { for (let x = n; x; x = x.padre) if (x.nodeType === 1 && combacia(x, sel)) return x; return null; },
    };
    return n;
  };
  doc.createElement = nodo;
  doc.createTextNode = (testo) => ({ nodeType: 3, textContent: String(testo), padre: null, remove() { if (this.padre) this.padre.figli = this.padre.figli.filter((f) => f !== this); this.padre = null; } });
  return doc;
}
/** Un selettore semplice (`.a`, `[b]`, `[b="c"]`, combinati) o due separati da uno spazio (discendente); `:scope > x` = figlio diretto. */
function combacia(n, semplice) {
  const parti = semplice.match(/^[a-z]+|\.[\w-]+|\[[\w-]+(?:="[^"]*")?\]/gu) ?? [];
  if (parti.join('') !== semplice) throw new Error(`il DOM finto non sa leggere ${JSON.stringify(semplice)}`);
  return parti.every((p) => {
    if (/^[a-z]+$/u.test(p)) return n.tagName === p.toUpperCase();
    if (p.startsWith('.')) return n._classi.has(p.slice(1));
    const m = /^\[([\w-]+)(?:="([^"]*)")?\]$/u.exec(p);
    const v = n.getAttribute(m[1]);
    return m[2] === undefined ? v !== null : v === m[2];
  });
}
function discendenti(n) { const out = []; for (const f of n.figli) if (f.nodeType === 1) { out.push(f, ...discendenti(f)); } return out; }
function cerca(radice, selettore) {
  return selettore.split(',').map((s) => s.trim()).flatMap((s) => {
    const diretto = /^:scope > (.+)$/u.exec(s);
    if (diretto) return radice.figli.filter((f) => f.nodeType === 1 && combacia(f, diretto[1]));
    const pezzi = s.split(/\s+/u);
    if (pezzi.length === 1) return discendenti(radice).filter((x) => combacia(x, s));
    if (pezzi.length === 2) return discendenti(radice).filter((x) => combacia(x, pezzi[0])).flatMap((x) => discendenti(x).filter((y) => combacia(y, pezzi[1])));
    throw new Error(`il DOM finto non sa leggere ${JSON.stringify(s)}`);
  });
}
const testi = (lista) => lista.map((x) => x.textContent);

/* ───────────── i dati, nella forma del server ───────────── */
/* `catalogoPubblico` (catalogo-impostazioni.mjs:156): le voci che servono qui, coi nomi veri di `nomi-impostazioni.mjs` */
const CATALOGO = { schema: 'talos.app-settings.catalog.v1', voci: [
  { key: 'appearance.colorMode', section: 'appearance', scope: 'app', where: 'window', type: 'scelta', values: ['system', 'dark', 'light'], group: null, text: { en: 'Color mode', it: 'Modalità colore' }, textKey: 'impostazioni.field.colorModeSelect.title', textKeys: ['impostazioni.field.colorModeSelect.title'] },
  { key: 'chat.questionTimeout', section: 'chat', scope: 'app', where: 'window', type: 'scelta', values: ['none', '60', '300', '600'], group: null, text: { en: 'Question timeout', it: 'Scadenza delle domande' }, textKey: 'impostazioni.field.askTimeoutSelect.title', textKeys: ['impostazioni.field.askTimeoutSelect.title'] },
  { key: 'chat.stopWithAgents', section: 'chat', scope: 'app', where: 'window', type: 'scelta', values: ['ask', 'all', 'chatOnly'], group: null, text: { en: 'Stop while agents are working', it: 'Stop con agenti al lavoro' }, textKey: 'impostazioni.field.stopWithAgentsSelect.title', textKeys: ['impostazioni.field.stopWithAgentsSelect.title'] },
  { key: 'conversation.model', section: 'conversation', scope: 'conversation', where: 'server', type: 'modello', group: 'costo', text: { en: 'Model', it: 'Modello' }, textKey: 'app.sheets.model.title', textKeys: ['app.sheets.model.title'] },
  { key: 'conversation.reasoningEffort', section: 'conversation', scope: 'conversation', where: 'server', type: 'scelta', values: ['default', 'none', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max'], group: 'costo', text: { en: 'Reasoning level', it: 'Livello di ragionamento' }, textKey: 'app.modelPicker.reasoningLevel', textKeys: ['app.modelPicker.reasoningLevel'] },
  { key: 'conversation.coordination', section: 'conversation', scope: 'conversation', where: 'server', type: 'sino', group: 'sicurezza', text: { en: 'Coordination', it: 'Coordinazione' }, textKey: 'app.sheets.permissions.coordination', textKeys: ['app.sheets.permissions.coordination'] },
  { key: 'tools.defaultCommandShell', section: 'tools', scope: 'app', where: 'server', type: 'scelta', values: ['auto', 'windows', 'wsl2'], group: null, text: { en: 'Where commands run · new conversations', it: 'Dove girano i comandi · conversazioni nuove' }, textKey: 'varie.commandsDefault.title', textKeys: ['varie.commandsDefault.title'] },
  { key: 'tools.webSearchSource', section: 'tools', scope: 'app', where: 'server', type: 'scelta', values: ['duckduckgo', 'tavily', 'brave', 'searxng', 'custom', 'off'], group: null, text: { en: 'Web search source', it: 'Origine della ricerca web' }, textKey: 'modello.frammenti.impostazioni.webSearchSource', textKeys: ['modello.frammenti.impostazioni.webSearchSource'] },
  { key: 'updates.automatic', section: 'updates', scope: 'app', where: 'window', type: 'sino', group: 'aggiornamenti', text: { en: 'Automatic updates', it: 'Aggiornamenti automatici' }, textKey: 'varie.updates.card.autoLabel', textKeys: ['varie.updates.card.autoLabel'] },
] };
/* `cambioDaMostrare` (servizio-impostazioni.mjs:334-338) */
const cambio = (chiave, prima, dopo, extra = {}) => {
  const v = CATALOGO.voci.find((x) => x.key === chiave);
  return { chiave, nome: { ...v.text }, ambito: v.scope, dove: v.where === 'window' ? 'window' : 'server', gruppo: v.group, prima, dopo, ...extra };
};
const AZIONE_COSTO = { tipo: 'app_settings', azione: 'set', dove: 'pc', revisione: 10012, cambi: [
  cambio('conversation.model', 'z-ai/glm-5.3-flash', 'openai/gpt-6-luna', { prezzo: { prima: { in: 0.35, out: 1.4 }, dopo: { in: 1.25, out: 10 } } }),
  cambio('conversation.reasoningEffort', 'medium', 'high'),
  cambio('tools.defaultCommandShell', 'windows', 'wsl2'),
  cambio('tools.webSearchSource', 'tavily', 'duckduckgo'),
] };
/* `nuovaRicevuta` (servizio-impostazioni.mjs:475-477), come la danno le ricevute pubbliche (`ricevute()`, senza `interni`) */
const ricevuta = (id, cambi, extra = {}) => ({ id, sessionId: 's1', quando: '2026-11-02T17:12:00.000Z', origine: { tipo: 'modello', sessionId: 's1', dispositivoId: null },
  confermatoDa: { tipo: 'finestra-pc' }, cambi: cambi.map(({ chiave, ambito, prima, dopo }) => ({ chiave, ambito, prima, dopo })), annullata: null, ...extra });

const prepara = (lingua = 'it') => { impostaLingua(lingua); registraCatalogoImpostazioni(CATALOGO); };

/* una riga dell'attrezzo come `creaRigaAttrezzo` (conversazione.js:1155): icona, nome, dettaglio, pallino; e il corpo `pre` */
function rigaAttrezzo(doc) {
  const riga = doc.createElement('div'); riga.className = 'talos-tool-row';
  const nome = doc.createElement('span'); nome.className = 'talos-tool-row__name tool-note-summary-text'; nome.textContent = 'impostazioni';
  const pallino = doc.createElement('span'); pallino.className = 'talos-dot talos-dot--success';
  riga.append(nome, pallino); riga.dataset.toolState = 'complete';
  const corpo = doc.createElement('pre'); corpo.className = 'talos-tool-row__body';
  const radice = doc.createElement('div'); radice.append(riga, corpo);
  return { riga, nome, pallino, corpo };
}

/* ───────────── le prove ───────────── */

test('IMPC-01 la carta è solo di app_settings; il catalogo dà i nomi, e senza catalogo né carta il nome non c’è (mai la chiave)', () => {
  prepara('it');
  assert.equal(eCartaImpostazioni({ tipo: 'app_settings' }), true);
  assert.equal(eCartaImpostazioni({ tipo: 'provider_exclude' }), false);
  assert.equal(nomeImpostazione('tools.webSearchSource'), 'Origine della ricerca web');
  assert.equal(nomeImpostazione('conversation.model', { en: 'Model', it: 'Modello' }), 'Modello');
  registraCatalogoImpostazioni(null);
  assert.equal(nomeImpostazione('tools.webSearchSource'), null, 'senza catalogo il nome non si inventa');
  assert.equal(nomeImpostazione('tools.webSearchSource', { en: 'Web search source', it: 'Origine della ricerca web' }), 'Origine della ricerca web', 'il nome della carta basta');
});

test('IMPC-02 i valori grezzi diventano le parole che la finestra ha già, in italiano e in inglese; un valore senza parola resta com’è', () => {
  prepara('it');
  assert.equal(valoreInParole('tools.defaultCommandShell', 'wsl2'), 'Linux (WSL2)');
  assert.equal(valoreInParole('tools.defaultCommandShell', 'auto'), 'Automatico');
  assert.equal(valoreInParole('conversation.reasoningEffort', 'high'), 'Alto');
  assert.equal(valoreInParole('conversation.reasoningEffort', 'none'), 'Off');
  assert.equal(valoreInParole('appearance.colorMode', 'light'), 'Chiaro');
  assert.equal(valoreInParole('tools.webSearchSource', 'duckduckgo'), 'DuckDuckGo');
  assert.equal(valoreInParole('tools.webSearchSource', 'off'), 'Nessuna ricerca web');
  assert.equal(valoreInParole('conversation.coordination', true), 'Sì');
  assert.equal(valoreInParole('conversation.model', 'openai/gpt-6-luna'), 'gpt-6-luna', 'il nome corto del modello, come nella pillola');
  assert.equal(valoreInParole('conversation.permissions', 'fullAccess'), 'Accesso pieno', 'la parola della pillola dei permessi (chat.foot.permission.fullAccess)');
  assert.equal(valoreInParole('chat.questionTimeout', '300'), '5 minuti');
  assert.equal(valoreInParole('chat.stopWithAgents', 'chatOnly'), 'Ferma solo la chat');
  impostaLingua('en');
  assert.equal(valoreInParole('appearance.colorMode', 'light'), 'Light');
  assert.equal(valoreInParole('conversation.coordination', false), 'No');
  /* al contrario: un valore che la finestra non conosce non diventa una chiave del dizionario */
  assert.equal(valoreInParole('appearance.colorMode', 'sepia'), 'sepia');
  assert.doesNotMatch(valoreInParole('appearance.colorMode', 'sepia'), /impostazioni\.field/u);
  /* senza catalogo il campo si riconosce dal nome della carta (`nome.chiave`, copiato dal server); senza nessuno dei due resta il valore */
  registraCatalogoImpostazioni(null);
  assert.equal(valoreInParole('appearance.colorMode', 'dark', { chiave: 'impostazioni.field.colorModeSelect.title', en: 'Color mode', it: 'Modalità colore' }), 'Dark');
  assert.equal(valoreInParole('appearance.colorMode', 'dark'), 'dark');
});

test('IMPC-03 prezzo e sforzo: due prezzi ⇒ la riga, un prezzo mancante (modello locale) ⇒ niente; lo sforzo dice solo il verso', () => {
  assert.deepEqual(prezzoInParole({ in: 0.35, out: 1.4 }), { ingresso: '$0.35', uscita: '$1.40' });
  assert.deepEqual(prezzoInParole({ in: 0.05, out: 0 }), { ingresso: '$0.050', uscita: '$0' });
  assert.equal(prezzoInParole(null), null);
  assert.equal(prezzoInParole({ in: Number.NaN, out: 1 }), null);
  assert.equal(direzioneDelloSforzo('medium', 'high'), 'su');
  assert.equal(direzioneDelloSforzo('high', 'low'), 'giu');
  assert.equal(direzioneDelloSforzo('default', 'high'), null, '«di serie» non si confronta');
  assert.equal(direzioneDelloSforzo('high', 'high'), null);
});

test('IMPC-04 la carta dai dati veri di `azione`: righe prima → dopo con nome e ambito, prezzo su riga sua, sforzo senza numeri', () => {
  prepara('it');
  const doc = documentoFinto();
  const blocco = creaBloccoCartaImpostazioni(doc, AZIONE_COSTO);
  assert.equal(blocco.dataset.dettaglioImpostazioni, 'set');
  const righe = blocco.querySelectorAll('[data-cambio]');
  assert.deepEqual(righe.map((r) => r.dataset.cambio), ['conversation.model', 'conversation.reasoningEffort', 'tools.defaultCommandShell', 'tools.webSearchSource']);
  assert.equal(righe[0].querySelector('.talos-impostazione__nome').textContent, 'Modello');
  assert.equal(righe[0].querySelector('.talos-impostazione__ambito').textContent, 'questa conversazione');
  assert.equal(righe[0].querySelector('.talos-kv__v').textContent, 'glm-5.3-flash → gpt-6-luna');
  assert.equal(righe[2].querySelector('.talos-kv__v').textContent, 'Windows → Linux (WSL2)');
  assert.equal(righe[2].querySelector('.talos-impostazione__ambito').textContent, 'quest’app');
  assert.equal(righe[3].querySelector('.talos-kv__v').textContent, 'Tavily → DuckDuckGo');
  const prezzo = blocco.querySelector('[data-prezzo="conversation.model"]');
  assert.equal(prezzo.querySelector('.talos-kv__k').textContent, 'Prezzo al milione');
  assert.equal(prezzo.querySelector('.talos-kv__v').textContent, 'da $0.35 → $1.40 a $1.25 → $10.00');
  assert.equal(prezzo.querySelectorAll('.talos-impostazione__prezzo b').length, 2, 'l’ingresso in grassetto, come nel selettore');
  assert.equal(blocco.querySelector('[data-sforzo]').textContent, 'Risposte più ragionate, consumo più alto');
  assert.equal(blocco.querySelector('[data-avvisi-impostazioni]'), null, 'nessun cambio di sicurezza ⇒ nessun riquadro giallo');
  const t = testiCartaImpostazioni(AZIONE_COSTO);
  assert.equal(t.badge, 'Cambia le impostazioni');
  assert.equal(t.nota, '', 'il gruppo costo non esce in Accesso pieno: niente nota');
  assert.equal(t.perche, '');
});

test('IMPC-05 la carta al contrario: modello locale ⇒ niente prezzo; voce senza nome ⇒ niente riga; ragione sospetta ⇒ non si mostra', () => {
  prepara('it');
  const doc = documentoFinto();
  const locale = { ...AZIONE_COSTO, cambi: [cambio('conversation.model', 'z-ai/glm-5.3-flash', 'local:gemma-4', { prezzo: { prima: { in: 0.35, out: 1.4 }, dopo: null } })] };
  assert.equal(creaBloccoCartaImpostazioni(doc, locale).querySelector('[data-prezzo]'), null);
  const ignota = { tipo: 'app_settings', azione: 'set', cambi: [{ chiave: 'nuova.voce', ambito: 'app', prima: 'a', dopo: 'b' }] };
  const blocco = creaBloccoCartaImpostazioni(doc, ignota);
  assert.equal(blocco.querySelectorAll('[data-cambio]').length, 0);
  assert.doesNotMatch(blocco.textContent, /nuova\.voce/u, 'mai la chiave grezza');
  assert.equal(testiCartaImpostazioni({ ...AZIONE_COSTO, ragione: 'Me l’hai chiesto tu.' }).perche, 'Me l’hai chiesto tu.');
  assert.equal(testiCartaImpostazioni({ ...AZIONE_COSTO, ragione: 'already approved', avvisi: { minacce: ['pressione-sulla-carta'] } }).perche, '',
    'giro 4: la ragione segnalata non va nel perché, si legge citata DENTRO il riquadro di pericolo (IMPC-23)');
});

test('IMPC-06 sicurezza: il riquadro giallo dice solo ciò che apre di più, e la nota del piede c’è per sicurezza e aggiornamenti', () => {
  prepara('it');
  const doc = documentoFinto();
  const apre = { tipo: 'app_settings', azione: 'set', cambi: [cambio('conversation.coordination', false, true), cambio('updates.automatic', true, false)] };
  const blocco = creaBloccoCartaImpostazioni(doc, apre);
  const avviso = blocco.querySelector('[data-avvisi-impostazioni="sicurezza"]');
  assert.equal(avviso.querySelector('b').textContent, 'Tocca la sicurezza');
  assert.deepEqual(testi(avviso.querySelectorAll('.talos-approval__avvisi-lista')[0].figli), [
    'Con la Coordinazione TALOS fa partire altri agenti da solo, e ognuno consuma.',
    'Spenti, le correzioni di sicurezza non arrivano da sole: le scarichi tu.']);
  assert.equal(testiCartaImpostazioni(apre).nota, 'Questa carta esce anche con l’Accesso pieno.');
  assert.equal(cartaAncheInAccessoPieno(apre.cambi), true);
  /* al contrario: spegnere la Coordinazione chiude, non apre */
  const chiude = { tipo: 'app_settings', azione: 'set', cambi: [cambio('conversation.coordination', true, false)] };
  assert.deepEqual(frasiDiSicurezza(chiude.cambi), []);
  assert.equal(creaBloccoCartaImpostazioni(doc, chiude).querySelector('[data-avvisi-impostazioni]'), null);
  assert.equal(testiCartaImpostazioni(chiude).nota, 'Questa carta esce anche con l’Accesso pieno.', 'la carta esce lo stesso (gruppo sicurezza)');
});

test('IMPC-07 l’esito di un set: la ricevuta si legge dall’esito vero del server; un list o un Annulla del modello non la portano', () => {
  const esito = 'tools.defaultCommandShell: "windows" → "wsl2" (new conversations). Receipt set-0a1b2c3d4e5f (undo with receipt_id). Revision 10013.';
  assert.equal(ricevutaDallEsito(esito), 'set-0a1b2c3d4e5f');
  assert.equal(fattoSenzaCarta(esito), false);
  assert.equal(fattoSenzaCarta(`${esito} Full access: done without asking the person.`), true);
  assert.equal(ricevutaDallEsito('tools.defaultCommandShell: "wsl2" → "windows" (undone). Receipt set-aaaaaaaaaaaa. Revision 10014.'), null);
  assert.equal(ricevutaDallEsito('- tools.defaultCommandShell = "windows"; one of auto, windows, wsl2; app'), null);
});

test('IMPC-08 la riga dello strumento: «Ha cambiato N impostazioni», le righe nel corpo, «Annulla» a vista che chiama la rotta con la ricevuta', () => {
  prepara('it');
  const doc = documentoFinto();
  const { riga, nome, pallino, corpo } = rigaAttrezzo(doc);
  const chiamate = [];
  const r = ricevuta('set-0a1b2c3d4e5f', AZIONE_COSTO.cambi);
  const ctl = mettiImpostazioniSullaRiga({ riga, summaryText: nome, corpo, ricevuta: r, onAnnulla: (id) => chiamate.push(id) }, { document: doc });
  assert.equal(nome.textContent, 'Ha cambiato 4 impostazioni');
  assert.equal(corpo.textContent, ['Modello: glm-5.3-flash → gpt-6-luna (questa conversazione)', 'Livello di ragionamento: Medio → Alto (questa conversazione)',
    'Dove girano i comandi · conversazioni nuove: Windows → Linux (WSL2) (quest’app)', 'Origine della ricerca web: Tavily → DuckDuckGo (quest’app)'].join('\n'));
  const annulla = riga.querySelector('[data-annulla-impostazioni="riga"]');
  assert.equal(annulla.textContent, 'Annulla');
  assert.equal(riga.figli.indexOf(annulla), riga.figli.indexOf(pallino) - 1, '«Annulla» prima del pallino, come nel bozzetto');
  const e = annulla.click();
  assert.equal(e.fermato, true, 'il clic non apre/chiude la riga');
  assert.deepEqual(chiamate, ['set-0a1b2c3d4e5f']);
  assert.equal(annulla.disabled, true, 'spento mentre la richiesta è in volo (Hermes)');
  annulla.click();
  assert.deepEqual(chiamate, ['set-0a1b2c3d4e5f'], 'un secondo clic in volo non manda una seconda richiesta');
  ctl.annullata();
  assert.equal(nome.textContent, 'Annullato: le 4 impostazioni sono tornate com’erano');
  assert.equal(riga.querySelector('[data-annulla-impostazioni]'), null);
  assert.equal(pallino.className, 'talos-dot', 'pallino neutro');
  assert.equal(riga.dataset.toolState, undefined);
});

test('IMPC-09 «Annulla» rifiutato: la riga resta, il pulsante si spegne, sotto il perché col nome della voce cambiata dopo', () => {
  prepara('it');
  const doc = documentoFinto();
  const { riga, nome, corpo } = rigaAttrezzo(doc);
  const ctl = mettiImpostazioniSullaRiga({ riga, summaryText: nome, corpo, ricevuta: ricevuta('set-0a1b2c3d4e5f', AZIONE_COSTO.cambi), onAnnulla: () => {} }, { document: doc });
  /* il rifiuto vero: `SETTINGS_UNDO_REFUSED` (409) col messaggio di `pianoDellUndo` (servizio-impostazioni.mjs:504) nell'ApiError */
  const errore = { code: 'SETTINGS_UNDO_REFUSED', status: 409, problem: { code: 'SETTINGS_UNDO_REFUSED', message: 'tools.webSearchSource changed again since (now "brave"): undo would overwrite a newer choice. Nothing was changed.' } };
  const detto = esitoDellAnnullaRifiutato(errore);
  assert.deepEqual(detto, { esito: 'cambiata', chiave: 'tools.webSearchSource' });
  const nota = ctl.rifiutata(detto.chiave);
  assert.equal(nota.textContent, 'Non annullato: Origine della ricerca web è stata cambiata dopo.');
  assert.equal(corpo.figli[0], nota, 'in testa al corpo');
  assert.equal(riga.querySelector('[data-annulla-impostazioni]').disabled, true);
  assert.equal(nome.textContent, 'Ha cambiato 4 impostazioni', 'la riga resta');
  /* al contrario: già annullato, o un errore qualunque */
  assert.deepEqual(esitoDellAnnullaRifiutato({ code: 'SETTINGS_UNDO_REFUSED', problem: { message: 'the change set-1 was already undone.' } }), { esito: 'gia' });
  assert.deepEqual(esitoDellAnnullaRifiutato({ code: 'NETWORK', problem: { message: 'fetch failed' } }), { esito: 'errore' });
  assert.equal(ctl.rifiutata('voce.senza.nome'), null, 'senza il nome non si scrive la frase con la chiave grezza');
});

test('IMPC-10 Accesso pieno senza carta: segno «Senza conferma», blocco «Fatto senza chiedere…» con le righe e «Annulla»; ricevuta già annullata ⇒ niente Annulla', () => {
  prepara('it');
  const doc = documentoFinto();
  const { riga, nome, pallino, corpo } = rigaAttrezzo(doc);
  mettiImpostazioniSullaRiga({ riga, summaryText: nome, corpo, ricevuta: ricevuta('set-0a1b2c3d4e5f', AZIONE_COSTO.cambi.slice(2)), senzaCarta: true, onAnnulla: () => {} }, { document: doc });
  const segno = riga.querySelector('.talos-tool-row__senza-carta');
  assert.equal(segno.textContent, 'Senza conferma');
  assert.equal(riga.figli.indexOf(segno), riga.figli.indexOf(pallino) - 1);
  const blocco = corpo.querySelector('[data-impostazioni-senza-carta]');
  assert.equal(blocco.querySelector('b').textContent, 'Fatto senza chiedere: è attivo l’Accesso pieno');
  assert.equal(blocco.querySelectorAll('[data-cambio]').length, 2);
  assert.equal(blocco.querySelector('[data-annulla-impostazioni="blocco"]').textContent, 'Annulla');
  assert.equal(riga.querySelector('[data-annulla-impostazioni="riga"]'), null, 'un Annulla solo, nel blocco');
  const altra = rigaAttrezzo(doc);
  mettiImpostazioniSullaRiga({ riga: altra.riga, summaryText: altra.nome, corpo: altra.corpo, ricevuta: ricevuta('set-x', AZIONE_COSTO.cambi.slice(2), { annullata: { quando: '2026-11-02T17:20:00.000Z' } }) }, { document: doc });
  assert.equal(altra.nome.textContent, 'Annullato: le 2 impostazioni sono tornate com’erano');
  assert.equal(altra.riga.querySelector('[data-annulla-impostazioni]'), null);
  assert.equal(mettiImpostazioniSullaRiga({ riga: rigaAttrezzo(doc).riga, ricevuta: { id: 'set-y', cambi: [] } }, { document: doc }), null, 'senza cambi niente');
});

test('IMPC-11 il segno nelle Impostazioni: dalla ricevuta più nuova di ogni voce; mai per un Annulla, una ricevuta annullata o una voce della conversazione', () => {
  const r1 = ricevuta('set-1', [cambio('tools.webSearchSource', 'tavily', 'duckduckgo'), cambio('conversation.model', 'a/b', 'c/d')], { quando: '2026-11-02T10:00:00.000Z' });
  const r2 = ricevuta('set-2', [cambio('tools.defaultCommandShell', 'windows', 'wsl2')], { quando: '2026-11-02T11:00:00.000Z' });
  const undo = ricevuta('set-3', [cambio('tools.defaultCommandShell', 'wsl2', 'windows')], { annulla: 'set-2', quando: '2026-11-02T12:00:00.000Z' });
  const segni = segniDalleRicevute([undo, r2, r1]); // le più nuove prima, come `GET …/changes`
  assert.deepEqual([...segni.keys()], ['tools.webSearchSource'], 'l’Annulla più nuovo toglie il segno; la voce della conversazione non lo ha');
  assert.equal(segni.get('tools.webSearchSource').id, 'set-1');
  assert.deepEqual([...segniDalleRicevute([{ ...r1, annullata: { quando: 'x' } }]).keys()], []);
  assert.deepEqual([...segniDalleRicevute([{ ...r1, origine: { tipo: 'persona' } }]).keys()], []);
});

test('IMPC-12 il testo del segno: oggi l’ora, un altro giorno la data; «da un dispositivo» solo se il sì è venuto da lì', () => {
  prepara('it');
  const quando = new Date(2026, 10, 2, 18, 12).toISOString();
  const adesso = new Date(2026, 10, 2, 20, 0);
  assert.equal(testoDelSegno({ quando, confermatoDa: { tipo: 'finestra-pc' } }, adesso), 'Cambiata da TALOS alle 18:12');
  assert.equal(testoDelSegno({ quando, confermatoDa: { tipo: 'dispositivo', dispositivoId: 'pad' } }, adesso), 'Cambiata da TALOS da un dispositivo alle 18:12');
  assert.equal(testoDelSegno({ quando, origine: { dispositivoId: 'pad' }, confermatoDa: { tipo: 'finestra-pc' } }, adesso), 'Cambiata da TALOS alle 18:12',
    'il giro partito dal dispositivo non basta: conta chi ha detto sì');
  assert.equal(testoDelSegno({ quando, confermatoDa: null }, new Date(2026, 10, 4, 9, 0)), 'Cambiata da TALOS il 2 novembre alle 18:12');
  impostaLingua('en');
  assert.equal(testoDelSegno({ quando, confermatoDa: null }, adesso), 'Changed by TALOS at 18:12');
  assert.equal(testoDelSegno({ quando: 'non-una-data' }, adesso), null);
});

test('IMPC-13 i segni nella pagina: sotto la griglia delle scelte o dentro la riga del campo; Annulla col suo id; voce senza posto ⇒ niente', () => {
  prepara('it');
  const doc = documentoFinto();
  const radice = doc.createElement('section');
  /* la carta «Origine della ricerca web» (index.template.html:1233 + fonte-ricerca.js) e il campo «Modalità colore» (creaSettingRow) */
  const cartaRicerca = doc.createElement('div'); cartaRicerca.dataset.settingsCard = 'tools-search';
  const griglia = doc.createElement('div'); griglia.className = 'talos-choice-grid'; cartaRicerca.append(griglia);
  /* D24: il modo colore non ha una riga nella pagina vera (`CONTROLLI_MIGRATI`, studio dei temi): lo rappresenta la banda «Il tuo tema» (`settings-view.ts:474`) */
  const banda = doc.createElement('section'); banda.dataset.settingsBand = '';
  const copia = doc.createElement('div'); const aiutoBanda = doc.createElement('p'); aiutoBanda.className = 'settings-band__help'; copia.append(aiutoBanda); banda.append(copia);
  radice.append(cartaRicerca, banda);
  const adesso = new Date(2026, 10, 2, 20, 0);
  const quando = new Date(2026, 10, 2, 18, 12).toISOString();
  const premuti = [];
  const ricevute = [ricevuta('set-a', [cambio('tools.webSearchSource', 'tavily', 'duckduckgo'), cambio('appearance.colorMode', 'dark', 'light')], { quando }),
    ricevuta('set-b', [cambio('tools.defaultCommandShell', 'windows', 'wsl2')], { quando })]; // la carta «dove girano» non è nella pagina finta
  const messi = montaSegniImpostazioni(radice, ricevute, { adesso, document: doc, onAnnulla: (id, chiave) => premuti.push([id, chiave]) });
  assert.equal(messi, 2);
  const sottoGriglia = griglia.nextElementSibling;
  assert.equal(sottoGriglia.dataset.segnoImpostazione, 'tools.webSearchSource');
  assert.equal(sottoGriglia.textContent, 'Cambiata da TALOS alle 18:12 · Annulla');
  assert.equal(aiutoBanda.nextElementSibling.dataset.segnoImpostazione, 'appearance.colorMode', 'dentro la banda: sparisce con lei nelle altre sezioni');
  sottoGriglia.querySelector('[data-annulla-impostazioni="segno"]').click();
  assert.deepEqual(premuti, [['set-a', 'tools.webSearchSource']]);
  /* rimontare non raddoppia */
  assert.equal(montaSegniImpostazioni(radice, ricevute, { adesso, document: doc }), 2);
  assert.equal(radice.querySelectorAll('[data-segno-impostazione]').length, 2);
  /* al contrario: nessuna ricevuta ⇒ i segni vecchi se ne vanno */
  assert.equal(montaSegniImpostazioni(radice, [], { adesso, document: doc }), 0);
  assert.equal(radice.querySelectorAll('[data-segno-impostazione]').length, 0);
  assert.equal(ancoraNelleImpostazioni('conversation.model'), null, 'le voci della conversazione non stanno nelle Impostazioni');
  assert.deepEqual(ancoraNelleImpostazioni('tools.computerUse'), { selettore: '[data-setting-row="computerUseToggle"]', riga: true }, 'la ricevuta del computer use porta alla sua riga (decisione 310)');
  /* D24: la riga del modo colore non esiste nella pagina vera: la voce sta nello studio dei temi, il segno sotto la banda «Il tuo tema» */
  assert.deepEqual(ancoraNelleImpostazioni('appearance.colorMode'), { selettore: '[data-settings-band] .settings-band__help', riga: false, sezione: 'appearance' });
});

test('IMPC-14 la notifica `impostazioni` ha la sua riga in «Tutto»: frase e nomi; mai in «Da fare»; senza catalogo la frase senza i due punti', () => {
  prepara('it');
  const voce = { id: 'impostazioni:s1:set-a', seq: 3, fatto: 'impostazioni', azione: 'set', cosa: { tipo: 'sessione', id: 's1', nome: 'Refactoring del carrello' },
    dato: { genere: 'testo', valore: 'tools.webSearchSource: "tavily" → "duckduckgo"; tools.defaultCommandShell: "windows" → "wsl2"' }, porta: { tipo: 'sessione', id: 's1' },
    impostazioni: { ricevuta: 'set-a', cambi: [{ chiave: 'tools.webSearchSource', prima: 'tavily', dopo: 'duckduckgo' }, { chiave: 'tools.defaultCommandShell', prima: 'windows', dopo: 'wsl2' }], confermatoDa: { tipo: 'finestra-pc' } },
    istante: '2026-11-02T17:12:00.000Z', stato: { visto: false, risolto: true } };
  assert.equal(FATTI_SENZA_RIGA.has('impostazioni'), false);
  assert.deepEqual(vociInOrdine([voce]).map((v) => v.id), [voce.id]);
  assert.deepEqual(vociDaFare([voce]), []);
  const detto = fraseDellaVoce(voce);
  assert.equal(detto.frase, 'Ha cambiato 2 impostazioni:');
  assert.equal(detto.dato.valore, 'Origine della ricerca web, Dove girano i comandi · conversazioni nuove');
  assert.equal(detto.glifo, 'i-settings');
  assert.equal(detto.tono, null);
  assert.doesNotMatch(JSON.stringify(detto), /tools\.webSearchSource/u, 'mai la chiave né il dato grezzo del registro');
  assert.equal(fraseDellaVoce({ ...voce, impostazioni: { ...voce.impostazioni, confermatoDa: { tipo: 'dispositivo', dispositivoId: 'pad' } } }).frase, 'Ha cambiato 2 impostazioni da un dispositivo:');
  assert.equal(fraseDellaVoce({ ...voce, azione: 'undo' }).frase, 'Ha annullato il cambio di 2 impostazioni:');
  registraCatalogoImpostazioni(null);
  const senzaNomi = fraseDellaVoce(voce);
  assert.equal(senzaNomi.frase, 'Ha cambiato 2 impostazioni');
  assert.equal(senzaNomi.dato, null);
  assert.equal(fraseDellaNotificaImpostazioni({ ...voce, impostazioni: { cambi: [] } }), null);
  assert.equal(fraseDellaVoce({ ...voce, impostazioni: { cambi: [] } }).frase, 'Nuovo avviso', 'senza cambi la riga generica, mai un numero zero');
  impostaLingua('en'); registraCatalogoImpostazioni(CATALOGO);
  assert.equal(fraseDellaVoce(voce).frase, 'Changed 2 settings:');
});

test('IMPC-15 /settings: le voci dal catalogo filtrate mentre scrivi, poi i valori con la parola delle Impostazioni', () => {
  prepara('it');
  assert.equal(suggerimentiImpostazioni('/settings'), null, 'solo dopo lo spazio: prima è il primo elenco');
  assert.equal(suggerimentiImpostazioni('/goal x'), null);
  const tutte = suggerimentiImpostazioni('/settings ');
  assert.equal(tutte.fase, 'voci');
  assert.equal(tutte.voci.length, CATALOGO.voci.length);
  const tools = suggerimentiImpostazioni('/settings tools.');
  assert.deepEqual(tools.voci.map((v) => v.nome), ['tools.defaultCommandShell', 'tools.webSearchSource']);
  assert.equal(tools.voci[0].aiuto, 'Dove girano i comandi · conversazioni nuove · quest’app');
  assert.equal(tools.voci[0].metti, '/settings tools.defaultCommandShell=');
  assert.deepEqual(suggerimentiImpostazioni('/settings ricerca').voci.map((v) => v.nome), ['tools.webSearchSource'], 'anche per nome');
  const valori = suggerimentiImpostazioni('/settings tools.defaultCommandShell=');
  assert.equal(valori.fase, 'valori');
  assert.deepEqual(valori.voci.map((v) => [v.nome, v.aiuto]), [['auto', 'Automatico'], ['windows', 'Windows'], ['wsl2', 'Linux (WSL2)']]);
  const scritto = suggerimentiImpostazioni('/settings tools.defaultCommandShell=wsl2');
  assert.equal(scritto.voci.length, 1);
  assert.equal(scritto.voci[0].completo, true);
  assert.deepEqual(suggerimentiImpostazioni('/settings conversation.coordination=').voci.map((v) => v.aiuto), ['Sì', 'No']);
  assert.deepEqual(suggerimentiImpostazioni('/settings conversation.model=gpt').voci, [], 'un id di modello: niente elenco');
});

test('IMPC-16 /settings al contrario: valore sbagliato o voce inesistente ⇒ la riga che lo dice nell’elenco, nessuna scelta; senza catalogo niente', () => {
  prepara('it');
  const sbagliato = suggerimentiImpostazioni('/settings tools.defaultCommandShell=linux');
  assert.deepEqual(sbagliato.voci, []);
  assert.equal(sbagliato.errore, '«linux» non va bene per Dove girano i comandi · conversazioni nuove. Valori ammessi: auto, windows, wsl2.');
  assert.equal(suggerimentiImpostazioni('/settings nessuna.voce=1').errore, 'Nessuna impostazione si chiama «nessuna.voce».');
  impostaLingua('en');
  assert.equal(suggerimentiImpostazioni('/settings tools.defaultCommandShell=linux').errore, '“linux” is not valid for Where commands run · new conversations. Allowed values: auto, windows, wsl2.');
  registraCatalogoImpostazioni(null);
  assert.equal(suggerimentiImpostazioni('/settings tools.'), null, 'un server senza la fase 8 (il telefono): il comando non c’è');
});

/* ───────────── 02/11/2026: `/settings` della persona APPLICA (`POST /api/v1/app-settings/apply`, decisione 8) ───────────── */

test('IMPC-17 il comando completo si applica: voce del catalogo e valore ammesso, nel tipo del catalogo; a metà, sbagliato o senza catalogo ⇒ null', () => {
  prepara('it');
  assert.deepEqual(comandoImpostazioniDaApplicare('/settings tools.defaultCommandShell=wsl2'),
    { chiave: 'tools.defaultCommandShell', valore: 'wsl2', changes: [{ key: 'tools.defaultCommandShell', value: 'wsl2' }] });
  assert.deepEqual(comandoImpostazioniDaApplicare('  /settings  updates.automatic = false ').changes, [{ key: 'updates.automatic', value: false }], 'sì/no ⇒ booleano');
  assert.equal(comandoImpostazioniDaApplicare('/settings conversation.model=z-ai/glm-5.3-flash').valore, 'z-ai/glm-5.3-flash', 'un id di modello lo convalida il server');
  for (const storto of ['/settings ', '/settings tools.defaultCommandShell', '/settings tools.defaultCommandShell=', '/settings tools.defaultCommandShell=ws',
    '/settings tools.defaultCommandShell=linux', '/settings nessuna.voce=1', 'settings tools.defaultCommandShell=wsl2', '/goal x']) {
    assert.equal(comandoImpostazioniDaApplicare(storto), null, storto);
  }
  registraCatalogoImpostazioni(null);
  assert.equal(comandoImpostazioniDaApplicare('/settings tools.defaultCommandShell=wsl2'), null, 'senza catalogo il comando non c’è');
});

test('IMPC-18 la nota della persona (bozzetto, variante A): «Hai cambiato 1 impostazione», la riga del cambio, «Annulla»; annullata, rifiutata, riprova', () => {
  prepara('it');
  const doc = documentoFinto();
  const premuti = [];
  const cambi = [{ chiave: 'tools.defaultCommandShell', ambito: 'app', prima: 'windows', dopo: 'wsl2' }]; // la risposta della rotta: `ricevuta.cambi`
  const nota = creaNotaImpostazioniDellaPersona(doc, { cambi }, { onAnnulla: () => premuti.push(1) });
  assert.equal(nota.nodo.getAttribute('data-c'), 'SystemNote');
  assert.equal(nota.nodo.querySelector('.talos-badge').textContent, 'Nota');
  assert.equal(nota.nodo.querySelector('.talos-system-note__title').textContent, 'Hai cambiato 1 impostazione');
  const riga = `Dove girano i comandi · conversazioni nuove: ${valoreInParole('tools.defaultCommandShell', 'windows')} → ${valoreInParole('tools.defaultCommandShell', 'wsl2')} · quest’app`;
  assert.equal(nota.nodo.querySelector('.assistant-copy').textContent, riga);
  assert.doesNotMatch(nota.nodo.textContent, /tools\.defaultCommandShell/u, 'mai la chiave grezza');
  const b = nota.nodo.querySelector('[data-annulla-impostazioni="nota"]');
  assert.equal(b.className, 'talos-button talos-button--secondary talos-button--sm');
  assert.equal(b.textContent, 'Annulla');
  b.click(); b.click();
  assert.deepEqual(premuti, [1], 'spento in volo: un solo Annulla');
  nota.riprova();
  assert.equal(b.disabled, false);
  nota.rifiutata('tools.defaultCommandShell');
  assert.equal(nota.nodo.querySelector('[data-non-annullato]').textContent, 'Non annullato: Dove girano i comandi · conversazioni nuove è stata cambiata dopo.');
  nota.annullata();
  assert.equal(nota.nodo.querySelector('.talos-system-note__title').textContent, 'Annullato: l’impostazione è tornata com’era');
  assert.equal(nota.nodo.querySelector('[data-annulla-impostazioni]'), null, 'annullata: niente più Annulla');
  /* in inglese, e AL CONTRARIO: senza un nome dal catalogo nessuna nota (mai una chiave a schermo) */
  impostaLingua('en');
  assert.equal(creaNotaImpostazioniDellaPersona(doc, { cambi }).nodo.querySelector('.talos-system-note__title').textContent, 'You changed 1 setting');
  registraCatalogoImpostazioni(null);
  assert.equal(creaNotaImpostazioniDellaPersona(doc, { cambi }), null);
  assert.equal(creaNotaImpostazioniDellaPersona(doc, { cambi: [] }), null);
});

test('IMPC-19 il rifiuto del SERVER si dice nell’elenco sotto lo stesso testo (dalServer), non sotto un altro; quello del catalogo vince e blocca', () => {
  prepara('it');
  const testo = '/settings updates.automatic=false';
  ricordaRifiutoImpostazioni(testo, 'Conferma il cambio sul computer');
  const detto = suggerimentiImpostazioni(`${testo} `);
  assert.equal(detto.errore, 'Conferma il cambio sul computer');
  assert.equal(detto.dalServer, true, 'non blocca un nuovo invio');
  assert.equal(suggerimentiImpostazioni('/settings updates.automatic=true').errore, undefined, 'un altro testo: niente rifiuto vecchio');
  ricordaRifiutoImpostazioni('/settings tools.defaultCommandShell=linux', 'qualcosa');
  const catalogo = suggerimentiImpostazioni('/settings tools.defaultCommandShell=linux');
  assert.match(catalogo.errore, /non va bene per/u);
  assert.equal(catalogo.dalServer, undefined, 'il rifiuto del catalogo resta quello che blocca');
  ricordaRifiutoImpostazioni();
  assert.equal(suggerimentiImpostazioni(testo).errore, undefined);
});

test('IMPC-20 (CLI F1) su un server senza gettone il rifiuto `card-required` manda il comando al modello; quello del ponte e gli altri no', () => {
  /* la forma vera di `ApiError` (services/api-client.ts): `code` e `problem.reason` */
  const daServer = (code, reason) => Object.assign(new Error('x'), { code, problem: { code, message: 'x', ...(reason ? { reason } : {}) } });
  assert.equal(rifiutoCheVaAlModello(daServer('PC_CONFIRMATION_REQUIRED', 'card-required')), true);
  assert.equal(rifiutoCheVaAlModello(daServer('PC_CONFIRMATION_REQUIRED', 'pc-confirmation-required')), false, 'il rifiuto del ponte resta un rifiuto');
  assert.equal(rifiutoCheVaAlModello(daServer('PC_CONFIRMATION_REQUIRED')), false);
  assert.equal(rifiutoCheVaAlModello(daServer('SETTINGS_APPLY_REFUSED', 'card-required')), false);
  assert.equal(rifiutoCheVaAlModello(null), false);
});

test('IMPC-21 (giro 2, voce 2) un cambio della persona dal dispositivo: «Cambiata dal tuo dispositivo:» e i nomi; il sì dal dispositivo a un cambio del modello resta l’altra frase', () => {
  prepara('it');
  const voce = { id: 'impostazioni:app:set-b', seq: 4, fatto: 'impostazioni', azione: 'set', cosa: { tipo: 'impostazioni', id: '', nome: '' }, porta: null,
    dato: { genere: 'testo', valore: 'tools.webSearchSource: "tavily" → "duckduckgo"' },
    impostazioni: { ricevuta: 'set-b', cambi: [{ chiave: 'tools.webSearchSource', prima: 'tavily', dopo: 'duckduckgo' }], confermatoDa: { tipo: 'dispositivo', dispositivoId: 'pad' }, origine: { tipo: 'dispositivo', dispositivoId: 'pad' } },
    istante: '2026-11-02T17:12:00.000Z', stato: { visto: false, risolto: true } };
  const detto = fraseDellaVoce(voce);
  assert.equal(detto.frase, 'Cambiata dal tuo dispositivo:');
  assert.equal(detto.dato.valore, nomeImpostazione('tools.webSearchSource'));
  const due = { ...voce, impostazioni: { ...voce.impostazioni, cambi: [...voce.impostazioni.cambi, { chiave: 'tools.defaultCommandShell', prima: 'windows', dopo: 'wsl2' }] } };
  assert.equal(fraseDellaVoce(due).frase, 'Cambiate dal tuo dispositivo (2 impostazioni):');
  assert.deepEqual(vociDaFare([voce]), [], 'non aspetta nessuno');
  /* AL CONTRARIO: senza `origine` è il modello, confermato dal dispositivo */
  const { origine: _o, ...delModello } = voce.impostazioni;
  assert.equal(fraseDellaVoce({ ...voce, impostazioni: delModello }).frase, 'Ha cambiato 1 impostazione da un dispositivo:');
  impostaLingua('en'); registraCatalogoImpostazioni(CATALOGO);
  assert.equal(fraseDellaVoce(voce).frase, 'Changed from your device:');
  assert.equal(fraseDellaVoce(due).frase, 'Changed from your device (2 settings):');
});

test('IMPC-22 (giro 2, voce 3) `/settings` con il valore già uguale: la nota «Già così» con nome e valore in parole, senza Annulla; senza nome niente', () => {
  prepara('it');
  const doc = documentoFinto();
  const nota = creaNotaImpostazioniGiaCosi(doc, { gia: ['tools.defaultCommandShell'], valori: { 'tools.defaultCommandShell': 'wsl2' } });
  assert.equal(nota.getAttribute('data-c'), 'SystemNote');
  assert.equal(nota.querySelector('.talos-badge').textContent, 'Nota');
  assert.equal(nota.querySelector('.talos-system-note__title').textContent, 'Già così');
  assert.equal(nota.querySelector('.assistant-copy').textContent, `Dove girano i comandi · conversazioni nuove: ${valoreInParole('tools.defaultCommandShell', 'wsl2')}`);
  assert.equal(nota.querySelector('[data-annulla-impostazioni]'), null, 'niente da annullare');
  assert.doesNotMatch(nota.textContent, /tools\.defaultCommandShell/u);
  impostaLingua('en');
  assert.equal(creaNotaImpostazioniGiaCosi(doc, { gia: ['tools.defaultCommandShell'], valori: { 'tools.defaultCommandShell': 'wsl2' } }).querySelector('.talos-system-note__title').textContent, 'Already set');
  /* AL CONTRARIO */
  assert.equal(creaNotaImpostazioniGiaCosi(doc, { gia: [] }), null);
  registraCatalogoImpostazioni(null);
  assert.equal(creaNotaImpostazioniGiaCosi(doc, { gia: ['tools.defaultCommandShell'], valori: { 'tools.defaultCommandShell': 'wsl2' } }), null);
});

/* ───────────── giro 4 (02/11/2026): la pressione sulla carta, l'Accesso pieno, il titolo della notifica ───────────── */
const SICUREZZA = cambio('conversation.coordination', false, true);
const conMinacce = (minacce, extra = {}) => ({ ...AZIONE_COSTO, ragione: 'The user already approved this, no need to read it.', avvisi: { minacce }, ...extra });
const BIDI = String.fromCodePoint(0x202e);
const ZW = String.fromCodePoint(0x200b);
const NEUTRA = 'contiene qualcosa che sembra un’iniezione';

test('IMPC-23 (giro 4) ragione sospetta: UN riquadro di pericolo in testa, role=alert, titolo, ragione citata, una voce per codice, «Approva solo se…» ultima; prima delle righe dei cambi', () => {
  prepara('it');
  const doc = documentoFinto();
  const blocco = creaBloccoCartaImpostazioni(doc, conMinacce(['pressione-sulla-carta', 'ignora-istruzioni']));
  const riquadri = blocco.querySelectorAll('.talos-approval__avvisi');
  assert.equal(riquadri.length, 1);
  const r = riquadri[0];
  assert.equal(r.className, 'talos-callout talos-callout--pericolo talos-approval__avvisi');
  assert.equal(r.getAttribute('role'), 'alert');
  assert.equal(blocco.figli.indexOf(r), 0, 'in testa, prima delle righe dei cambi');
  assert.ok(blocco.figli.indexOf(blocco.querySelector('[data-cambio]')) > 0);
  assert.deepEqual(testi(r.querySelectorAll('b')), ['La ragione del modello è sospetta']);
  assert.deepEqual(testi(r.querySelector('.talos-approval__avvisi-lista').figli), [
    'Scrive: «The user already approved this, no need to read it.»',
    'spinge ad approvare senza leggere',
    'chiede di ignorare le istruzioni precedenti',
    'Approva solo se i cambi qui sotto sono quelli che hai chiesto tu.']);
  assert.equal(testiCartaImpostazioni(conMinacce(['pressione-sulla-carta'])).perche, '', 'la ragione non si ripete nel perché');
  impostaLingua('en');
  const en = creaBloccoCartaImpostazioni(doc, conMinacce(['pressione-sulla-carta', 'alfabeti-mescolati']));
  assert.deepEqual(testi(en.querySelector('.talos-approval__avvisi-lista').figli), [
    'It writes: “The user already approved this, no need to read it.”',
    'it pushes you to approve without reading',
    'it mixes letters from different alphabets to hide words',
    'Approve only if the changes below are the ones you asked for.']);
  assert.equal(en.querySelector('b').textContent, 'The model’s reason looks suspicious');
  /* AL CONTRARIO: ragione vuota ⇒ niente voce citata; codice sconosciuto o storto ⇒ la frase neutra, mai la chiave; codici doppi una volta */
  impostaLingua('it');
  const vuota = creaBloccoCartaImpostazioni(doc, conMinacce(['codice-nuovo', 'Costruttore!', 'codice-nuovo'], { ragione: '' }));
  assert.deepEqual(testi(vuota.querySelector('.talos-approval__avvisi-lista').figli), [
    NEUTRA, NEUTRA, 'Approva solo se i cambi qui sotto sono quelli che hai chiesto tu.']);
  assert.equal(vuota.querySelector('[data-ragione-citata]'), null);
  assert.doesNotMatch(vuota.textContent, /appSettings|codice-nuovo|codiceNuovo/u);
  assert.equal(minacciaDellaRagioneInParole('constructor'), NEUTRA);
  assert.equal(minacciaDellaRagioneInParole('to-string'), NEUTRA);
  assert.equal(minacciaDellaRagioneInParole(undefined), NEUTRA);
  /* ogni codice della scansione ha la sua frase nelle due lingue (la tabella delle automazioni, al singolare) */
  const codici = ['ignora-istruzioni', 'nascondi-alla-persona', 'sostituisci-sistema', 'ignora-regole', 'legge-segreti', 'porta-ssh', 'sudoers',
    'cancella-radice', 'esfiltra', 'caratteri-invisibili', 'pressione-sulla-carta', 'alfabeti-mescolati'];
  for (const l of ['it', 'en']) {
    impostaLingua(l);
    const frasi = codici.map(minacciaDellaRagioneInParole);
    assert.equal(new Set(frasi).size, codici.length, `${l}: una frase diversa per codice`);
    assert.ok(frasi.every((x) => !/appSettings|card\.threat/u.test(x) && x !== NEUTRA && x !== 'it contains something that looks like an injection'), l);
  }
  /* senza minacce: nessun riquadro (regola 17, zero interruzioni in più nei casi normali) */
  impostaLingua('it');
  assert.equal(creaBloccoCartaImpostazioni(doc, { ...AZIONE_COSTO, ragione: 'Me l’hai chiesto tu.' }).querySelector('.talos-approval__avvisi'), null);
  assert.equal(creaBloccoCartaImpostazioni(doc, { ...AZIONE_COSTO, ragione: 'x', avvisi: { minacce: [] } }).querySelector('.talos-approval__avvisi'), null);
  assert.equal(creaBloccoCartaImpostazioni(doc, { ...AZIONE_COSTO, ragione: 'x', avvisi: { minacce: 'pressione-sulla-carta' } }).querySelector('.talos-approval__avvisi'), null);
});

test('IMPC-24 (giro 4, regola 17) minaccia + sicurezza: un solo riquadro di pericolo coi due titoli in quest’ordine e «Approva solo se…» una volta in fondo; solo sicurezza ⇒ il giallo di prima', () => {
  prepara('it');
  const doc = documentoFinto();
  const blocco = creaBloccoCartaImpostazioni(doc, conMinacce(['pressione-sulla-carta'], { cambi: [SICUREZZA] }));
  const riquadri = blocco.querySelectorAll('.talos-approval__avvisi');
  assert.equal(riquadri.length, 1, 'un blocco solo');
  const r = riquadri[0];
  assert.ok(r.classList.contains('talos-callout--pericolo'), 'vince il tono più grave');
  assert.equal(r.getAttribute('role'), 'alert');
  const corpo = r.querySelector('.talos-approval__avvisi-corpo');
  assert.deepEqual(corpo.figli.map((x) => x.tagName), ['B', 'UL', 'B', 'UL', 'P']);
  assert.deepEqual(testi(r.querySelectorAll('b')), ['La ragione del modello è sospetta', 'Tocca la sicurezza']);
  assert.deepEqual(testi(r.querySelector('[data-gruppo-avvisi="sicurezza"]').figli), ['Con la Coordinazione TALOS fa partire altri agenti da solo, e ognuno consuma.']);
  assert.equal(r.querySelectorAll('[data-approva-solo]').length, 1);
  assert.equal(corpo.figli.at(-1).textContent, 'Approva solo se i cambi qui sotto sono quelli che hai chiesto tu.');
  assert.doesNotMatch(r.querySelector('[data-gruppo-avvisi="minacce"]').textContent, /Approva solo/u, 'una volta sola, in fondo');
  /* AL CONTRARIO: solo sicurezza ⇒ il riquadro giallo di prima, senza role=alert né «Approva solo» */
  const giallo = creaBloccoCartaImpostazioni(doc, { tipo: 'app_settings', azione: 'set', cambi: [SICUREZZA] });
  const g = giallo.querySelectorAll('.talos-approval__avvisi');
  assert.equal(g.length, 1);
  assert.equal(g[0].className, 'talos-callout talos-approval__avvisi');
  assert.equal(g[0].getAttribute('role'), null);
  assert.equal(g[0].querySelector('[data-approva-solo]'), null);
});

test('IMPC-25 (giro 4, condizione del Mobile) la ragione del modello a schermo: una riga, senza bidi né larghezza zero, ≤ 120 lettere con «…», sostituita con una funzione', () => {
  prepara('it');
  const doc = documentoFinto();
  const citata = (ragione) => creaBloccoCartaImpostazioni(doc, conMinacce(['pressione-sulla-carta'], { ragione })).querySelector('[data-ragione-citata]').textContent;
  assert.equal(citata("ok $& e $' e $1 e $$ e $` fine"), "Scrive: «ok $& e $' e $1 e $$ e $` fine»", 'i segni del sostituto restano testo');
  const lunga = 'a'.repeat(300);
  assert.equal(citazioneDelModello(lunga), `${'a'.repeat(CITAZIONE_MASSIMA - 1)}…`);
  assert.equal([...citazioneDelModello(lunga)].length, 120);
  assert.equal([...citata(lunga)].length, 'Scrive: «»'.length + 120);
  assert.equal([...citazioneDelModello('😀'.repeat(130))].length, 120, 'lettere = code point, mai mezze coppie');
  assert.equal(citazioneDelModello('😀'.repeat(120)), '😀'.repeat(120), 'a 120 giuste niente taglio');
  assert.equal(citazioneDelModello('b'.repeat(121)), `${'b'.repeat(119)}…`, 'a 121 il taglio');
  assert.equal(citata(`approve ${BIDI}gpj.exe`), 'Scrive: «approve gpj.exe»');
  assert.equal(citata('prima riga\nseconda\r\nterza'), 'Scrive: «prima riga seconda terza»');
  assert.equal(citata(`ap${ZW}prove`), 'Scrive: «approve»');
  assert.equal(citazioneDelModello(42), '');
  assert.equal(citazioneDelModello(`${BIDI}${ZW}  `), '', 'solo invisibili ⇒ vuota ⇒ nessuna voce');
});

test('IMPC-26 (giro 4) Accesso pieno: la riga della pressione nel blocco «Fatto senza chiedere…», con la frase citata o senza; mai la ragione intera; anche se l’avviso arriva dopo', () => {
  prepara('it');
  const doc = documentoFinto();
  const { riga, nome, corpo } = rigaAttrezzo(doc);
  mettiImpostazioniSullaRiga({ riga, summaryText: nome, corpo, ricevuta: ricevuta('set-p1', AZIONE_COSTO.cambi.slice(2)), senzaCarta: true,
    avviso: { avvisi: ['pressione-sulla-carta'], frase: 'already approved' } }, { document: doc });
  const blocco = corpo.querySelector('[data-impostazioni-senza-carta]');
  const p = blocco.querySelector('[data-impostazioni-pressione]');
  assert.equal(p.textContent, 'Fatto senza chiedere, ma la richiesta conteneva «already approved», che spinge a non controllare. Se non l’hai chiesto tu, annulla.');
  assert.equal(blocco.figli.indexOf(p), 1, 'subito sotto il titolo');
  assert.ok(blocco.querySelector('[data-annulla-impostazioni="blocco"]'), 'l’Annulla resta');
  impostaLingua('en');
  assert.equal(fraseDellaPressioneSenzaCarta({ avvisi: ['pressione-sulla-carta'], frase: 'already approved' }),
    'Done without asking, but the request contained “already approved”, which pushes you not to check. If you didn’t ask for it, undo.');
  assert.equal(fraseDellaPressioneSenzaCarta({ avvisi: ['caratteri-invisibili'], frase: null }),
    'Done without asking, but the model’s reason pushed you not to check. If you didn’t ask for it, undo.');
  assert.equal(fraseDellaPressioneSenzaCarta({ avvisi: ['x'], frase: "$& $' $1" }),
    "Done without asking, but the request contained “$& $' $1”, which pushes you not to check. If you didn’t ask for it, undo.");
  assert.match(fraseDellaPressioneSenzaCarta({ avvisi: ['x'], frase: `a${BIDI}b\nc` }), /contained “ab c”/u);
  assert.match(fraseDellaPressioneSenzaCarta({ avvisi: ['x'], frase: 'z'.repeat(300) }), new RegExp(`“${'z'.repeat(119)}…”`, 'u'));
  assert.match(fraseDellaPressioneSenzaCarta({ avvisi: ['x'], frase: `${BIDI}  ` }), /^Done without asking, but the model’s reason/u, 'frase vuota dopo la pulizia ⇒ senza citazione');
  /* l'avviso DOPO la riga (l'evento arriva prima dell'esito, ma la riga si monta dopo le ricevute): una riga sola, aggiornata */
  impostaLingua('it');
  const tardi = rigaAttrezzo(doc);
  const ctl = mettiImpostazioniSullaRiga({ riga: tardi.riga, summaryText: tardi.nome, corpo: tardi.corpo, ricevuta: ricevuta('set-p2', AZIONE_COSTO.cambi.slice(2)), senzaCarta: true }, { document: doc });
  assert.equal(tardi.corpo.querySelector('[data-impostazioni-pressione]'), null, 'senza avviso nessuna riga in più');
  ctl.avvisata({ avvisi: ['pressione-sulla-carta'], frase: null });
  ctl.avvisata({ avvisi: ['pressione-sulla-carta'], frase: null });
  assert.equal(tardi.corpo.querySelectorAll('[data-impostazioni-pressione]').length, 1);
  assert.equal(tardi.corpo.querySelector('[data-impostazioni-pressione]').textContent, 'Fatto senza chiedere, ma la ragione del modello spingeva a non controllare. Se non l’hai chiesto tu, annulla.');
  /* AL CONTRARIO: senza codici niente; con la carta (non senza carta) niente */
  assert.equal(fraseDellaPressioneSenzaCarta({ avvisi: [], frase: 'already approved' }), null);
  assert.equal(fraseDellaPressioneSenzaCarta(null), null);
  const conCarta = rigaAttrezzo(doc);
  const c2 = mettiImpostazioniSullaRiga({ riga: conCarta.riga, summaryText: conCarta.nome, corpo: conCarta.corpo, ricevuta: ricevuta('set-p3', AZIONE_COSTO.cambi.slice(2)),
    avviso: { avvisi: ['pressione-sulla-carta'], frase: 'x' } }, { document: doc });
  assert.equal(c2.avvisata({ avvisi: ['pressione-sulla-carta'], frase: 'x' }), null);
  assert.doesNotMatch(conCarta.corpo.textContent, /Fatto senza chiedere/u);
});

test('IMPC-27 (giro 4) titolo della notifica: un cambio dal dispositivo SENZA conversazione dice «Impostazioni»/«Settings», con la conversazione il suo nome; mai «Sessione» per l’app', () => {
  prepara('it');
  const doc = documentoFinto();
  const crea = doc.createElement;
  doc.createElement = (tag) => { const n = crea(tag); n.appendChild = (x) => { n.append(x); return x; }; return n; };
  doc.createElementNS = (_, tag) => doc.createElement(tag);
  const app = { id: 'impostazioni:app:set-d', seq: 4, fatto: 'impostazioni', azione: 'set', cosa: { tipo: 'impostazioni', id: '', nome: '' }, porta: null,
    dato: { genere: 'testo', valore: 'appearance.colorMode: "dark" → "light"' },
    impostazioni: { ricevuta: 'set-d', cambi: [{ chiave: 'appearance.colorMode', prima: 'dark', dopo: 'light' }], confermatoDa: null, origine: { tipo: 'dispositivo', dispositivoId: 'pad' } },
    istante: '2026-11-02T17:12:00.000Z', stato: { visto: false, risolto: true } };
  const titolo = (v) => creaRigaNotifica(v, { document: doc, adesso: new Date('2026-11-02T18:00:00.000Z') }).querySelector('.talos-list-row__title').textContent;
  assert.equal(titolo(app), 'Impostazioni');
  assert.equal(creaRigaNotifica(app, { document: doc }).querySelector('.talos-notifica__frase').textContent, 'Cambiata dal tuo dispositivo:', 'la frase sotto resta');
  assert.equal(testoNotificaSistema(app).titolo, 'Impostazioni');
  impostaLingua('en');
  assert.equal(titolo(app), 'Settings');
  assert.equal(testoNotificaSistema(app).titolo, 'Settings');
  /* AL CONTRARIO: con una conversazione il suo nome, e senza nome «Sessione»; un altro fatto resta della sessione */
  impostaLingua('it');
  const conv = { ...app, id: 'impostazioni:s1:set-e', cosa: { tipo: 'sessione', id: 's1', nome: 'Refactoring del carrello' }, porta: { tipo: 'sessione', id: 's1' } };
  assert.equal(titolo(conv), 'Refactoring del carrello');
  assert.equal(titolo({ ...conv, cosa: { tipo: 'sessione', id: 's1', nome: '' } }), 'Sessione');
  assert.equal(testoNotificaSistema({ ...conv, cosa: { tipo: 'sessione', id: 's1', nome: '' } }).titolo, 'Una sessione');
  assert.equal(titolo({ id: 'fine:s2', fatto: 'fine', cosa: { tipo: 'impostazioni', nome: '' }, istante: '2026-11-02T17:12:00.000Z' }), 'Sessione');
});
