/*
 * CU-IMP — la riga «Uso del computer» / «Computer use» in Impostazioni → Strumenti agente e permessi (giro 2 delle cure, 06/11/2026; revisione
 * avversaria di sicurezza, difetto 5: lo spegnimento non aveva schermata). Stessa riga-interruttore di «Blocchi vivi nelle risposte», in una carta
 * dopo «Tieni sveglio il PC». Lo stato a schermo lo scrive SOLO la risposta del server; un salvataggio fallito rimette l'interruttore com'era.
 * Decisione 310 dell'owner (06/11/2026): l'etichetta porta il segno «Anteprima» / «Preview» (lo stesso `talos-badge--sm` di «Beta» nel Cielo).
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { documento } from './aiuto-dom-blocchi.mjs';
import { impostaLingua } from '../../src/components/lingua.js';
import { TESTI } from '../../src/i18n/testi/index.js';
import { montaComputerUseImpostazione } from '../../src/components/computer-use-impostazione.js';

const attesa = () => new Promise((r) => setImmediate(r));

function finestra() {
  const doc = documento();
  const pannello = doc.createElement('div');
  pannello.setAttribute('id', 'setting-panel-tools');
  const sorella = doc.createElement('div');
  sorella.dataset.settingsCard = 'tools-pc-sveglio';
  sorella.after = (n) => { const c = pannello.childNodes; if (n.parentNode) n.remove(); c.splice(c.indexOf(sorella) + 1, 0, n); n.parentNode = pannello; };
  const azioni = doc.createElement('div');
  azioni.className = 'talos-settings__actions';
  pannello.append(sorella, azioni);
  doc.body.append(pannello);
  doc.getElementById = (id) => (id === 'setting-panel-tools' ? pannello : null);
  const clic = [];
  doc.addEventListener = (tipo, f) => { if (tipo === 'click') clic.push(f); };
  doc.removeEventListener = () => {};
  /* decisione 331 (07/11/2026), terzo giro: si tengono gli ascoltatori di `talos:lingua`, così una prova può cambiare lingua come la pagina */
  const lingua = [];
  doc.documentElement = { addEventListener(tipo, f) { if (tipo === 'talos:lingua') lingua.push(f); }, removeEventListener() {} };
  return { doc, pannello, sorella, clic, lingua };
}
function server(stato = { acceso: true }) {
  const chiamate = [];
  const s = { rifiuta: false, rotto: false };
  s.fetchFn = async (url, opzioni = {}) => {
    chiamate.push({ url, metodo: opzioni.method ?? 'GET', corpo: opzioni.body ? JSON.parse(opzioni.body) : null });
    if (s.rotto || (opzioni.method === 'POST' && s.rifiuta)) return { ok: false, status: 503, json: async () => ({ ok: false, error: { code: 'COMPUTER_USE_SETTINGS_UNAVAILABLE' } }) };
    if (opzioni.method === 'POST') stato = JSON.parse(opzioni.body);
    return { ok: true, status: 200, json: async () => ({ ok: true, data: { ...stato } }) };
  };
  s.chiamate = chiamate;
  return s;
}

test('CU-IMP-01 la riga sta nel pannello degli strumenti dopo «Tieni sveglio il PC», con la grammatica della riga-interruttore, e legge il server', async () => {
  impostaLingua('it');
  const { doc, pannello, sorella } = finestra();
  const srv = server({ acceso: false });
  montaComputerUseImpostazione({ documento: doc, fetchFn: srv.fetchFn });
  await attesa();
  const scheda = pannello.querySelector('[data-settings-card="tools-computer-use"]');
  assert.ok(scheda, 'la carta è nel pannello');
  assert.equal(pannello.childNodes.indexOf(scheda), pannello.childNodes.indexOf(sorella) + 1, 'subito dopo la sorella');
  const riga = scheda.querySelector('[data-setting-row="computerUseToggle"]');
  assert.ok(riga.classList.contains('talos-setting'));
  const etichetta = riga.querySelector('label.talos-setting__label');
  const interruttore = riga.querySelector('input.talos-switch');
  /* decisioni 331/335 (07/11/2026): la testata delle sorelle come prima cosa; il titolo e il segno stanno lì, la riga dice l'azione */
  const testata = scheda.childNodes[0];
  assert.ok(testata.classList.contains('settings-group__head'), 'la testata è la prima cosa della carta');
  const titolo = testata.querySelector('h3.settings-group__title');
  assert.equal(titolo.textContent, 'Uso del computer', 'il titolo è solo il nome, come nelle sorelle');
  assert.equal(titolo.getAttribute('id'), 'settings-group-tools-computer-use');
  const segno = testata.querySelector('span.talos-badge.talos-badge--sm');
  assert.ok(segno, 'il segno «Anteprima» con la grammatica di «Beta», in testata');
  assert.equal(segno.dataset.c, 'PreviewBadge');
  assert.equal(segno.textContent, 'Anteprima');
  assert.ok(testata.querySelector('.settings-group__count'), 'il conteggio delle sorelle, nascosto');
  assert.equal(scheda.getAttribute('role'), 'group');
  assert.equal(scheda.getAttribute('aria-labelledby'), 'settings-group-tools-computer-use settings-group-tools-computer-use-segno', 'il gruppo si legge col nome e col segno');
  assert.equal(etichetta.textContent, 'Lascia che TALOS usi questo computer', 'la riga dice l\'azione, come «Motore del contesto»');
  assert.equal(etichetta.getAttribute('for'), 'setting-computerUseToggle');
  assert.equal(interruttore.getAttribute('role'), 'switch');
  assert.equal(interruttore.checked, false, 'lo stato viene dal server');
  assert.equal(interruttore.disabled, false);
  assert.match(riga.querySelector('.talos-setting__help').textContent, /approvi ogni compito/u);
  assert.match(riga.querySelector('.talos-setting__help').textContent, /anteprima: spenta di serie, la accendi solo tu/u);
  assert.deepEqual(srv.chiamate.map((c) => [c.url, c.metodo]), [['/api/v1/computer-use/settings', 'GET']]);
  for (const chiave of ['settings.title', 'settings.label', 'settings.help', 'settings.notSaved', 'settings.unavailable', 'settings.preview']) {
    assert.equal(typeof TESTI.en[`computer.${chiave}`], 'string', `en ${chiave}`);
    assert.equal(typeof TESTI.it[`computer.${chiave}`], 'string', `it ${chiave}`);
  }
});

test('CU-IMP-02 accendere e spegnere passa dal server; un salvataggio rifiutato rimette l\'interruttore com\'era e lo dice', async () => {
  impostaLingua('en');
  const { doc, pannello } = finestra();
  const srv = server({ acceso: true });
  montaComputerUseImpostazione({ documento: doc, fetchFn: srv.fetchFn });
  await attesa();
  const interruttore = pannello.querySelector('input.talos-switch');
  assert.equal(interruttore.checked, true);
  assert.equal(pannello.querySelector('label.talos-setting__label').textContent, 'Let TALOS use this computer');
  assert.equal(pannello.querySelector('h3.settings-group__title').textContent, 'Computer use');
  assert.equal(pannello.querySelector('span.talos-badge').textContent, 'Preview');
  assert.match(pannello.querySelector('.talos-setting__help').textContent, /preview: off by default, only you can turn it on/u);
  interruttore.checked = false;
  interruttore.dispatchEvent(new Event('change'));
  await attesa();
  assert.deepEqual(srv.chiamate.at(-1), { url: '/api/v1/computer-use/settings', metodo: 'POST', corpo: { acceso: false } });
  assert.equal(interruttore.checked, false);
  srv.rifiuta = true;
  interruttore.checked = true;
  interruttore.dispatchEvent(new Event('change'));
  await attesa();
  assert.equal(interruttore.checked, false, 'torna com\'era: lo stato lo scrive solo il server');
  assert.match(pannello.querySelector('.talos-setting__help').textContent, /Not saved/u);
});

test('CU-IMP-03 la rotta che non risponde spegne la riga e lo dice; riaprire la scheda rilegge', async () => {
  impostaLingua('it');
  const { doc, pannello, clic } = finestra();
  const srv = server({ acceso: true });
  srv.rotto = true;
  montaComputerUseImpostazione({ documento: doc, fetchFn: srv.fetchFn });
  await attesa();
  const interruttore = pannello.querySelector('input.talos-switch');
  assert.equal(interruttore.disabled, true);
  assert.match(pannello.querySelector('.talos-setting__help').textContent, /non è disponibile/u);
  srv.rotto = false;
  for (const f of clic) f({ target: { closest: (s) => (s === '[data-settings-tab="tools"]' ? {} : null) } });
  await attesa();
  assert.equal(interruttore.disabled, false);
  assert.equal(interruttore.checked, true);
  assert.equal(srv.chiamate.filter((c) => c.metodo === 'GET').length, 2);
});

/* Decisione 331 (07/11/2026), secondo giro: tre mutanti del revisore del codice sopravvivevano (M03 id del segno tolto, M05 conteggio
   visibile, M24 nome tecnico nella mappa dei nomi). Queste prove li prendono senza il browser. */
test('CU-IMP-04 ogni id che dà il nome al gruppo esiste nella carta; il conteggio delle sorelle resta nascosto; la spiegazione sta sotto la testata', async () => {
  impostaLingua('it');
  const { doc, pannello, lingua } = finestra();
  montaComputerUseImpostazione({ documento: doc, fetchFn: server({ acceso: false }).fetchFn });
  await attesa();
  const scheda = pannello.querySelector('[data-settings-card="tools-computer-use"]');
  controllaCarta(scheda, 'it');
  /* decisione 331 (07/11/2026), terzo giro: il mutante A14 del revisore di correttezza (spiegazione scritta una volta sola) viveva, perché
     nessuna prova cambiava lingua. Dopo `talos:lingua` in inglese la carta è la stessa, ridisegnata, con la spiegazione inglese. */
  assert.ok(lingua.length > 0, 'la carta ascolta il cambio di lingua');
  impostaLingua('en');
  try { for (const f of lingua) f(); } finally { impostaLingua('it'); }
  assert.equal(pannello.querySelectorAll('[data-settings-card="tools-computer-use"]').length, 1, 'una carta sola dopo il cambio di lingua');
  /* revisione prove c331 giro 3, reperto 8 (c331g3-revisione-prove.md:22, 07/11/2026): la carta si riprende dal DOM, non dal vecchio riferimento */
  const schedaDopo = pannello.querySelector('[data-settings-card="tools-computer-use"]');
  assert.ok(schedaDopo, 'la carta è ancora nel pannello dopo il cambio di lingua');
  controllaCarta(schedaDopo, 'en');
});

/* revisione prove c331 giro 3, reperto 7 (c331g3-revisione-prove.md:21, 07/11/2026): l'aiuto nuovo di e3be2e98b si inchioda PER INTERO, nelle due
   lingue, non con una regex. Inglese prima. */
const AIUTO_CU = {
  en: 'It sees your screen and acts only after you approve each task. It’s a preview: off by default, only you can turn it on. Turned off, the model doesn’t have the tool.',
  it: 'Vede lo schermo e agisce solo dopo che approvi ogni compito. È un’anteprima: spenta di serie, la accendi solo tu. Spenta, il modello non ha lo strumento.',
};

function controllaCarta(scheda, l) {
  const ids = scheda.getAttribute('aria-labelledby').split(/\s+/u);
  assert.equal(ids.length, 2, 'il nome e il segno');
  for (const id of ids) assert.ok(scheda.querySelector(`#${id}`), `l'id ${id} di aria-labelledby non esiste nella carta`);
  assert.equal(scheda.querySelector(`#${ids[1]}`).dataset.c, 'PreviewBadge', 'il secondo nome è il segno «Anteprima»');
  const testata = scheda.childNodes[0];
  assert.equal(testata.querySelector('.settings-group__count').hidden, true, 'il conteggio è nascosto, come nelle sorelle');
  /* titolo e segno insieme nella copia in riga, così il segno sta accanto al titolo e non al bordo destro */
  const copia = testata.querySelector('.settings-group__copy');
  assert.deepEqual(copia.children.map((n) => n.tagName), ['H3', 'SPAN']);
  assert.deepEqual(copia.children.map((n) => n.textContent), [TESTI[l]['computer.settings.title'], TESTI[l]['computer.settings.preview']]);
  const spiegazione = scheda.childNodes[1];
  assert.equal(spiegazione.tagName, 'P', 'la spiegazione sotto la testata, come nelle sorelle');
  assert.equal(spiegazione.getAttribute('id'), null, 'niente id nuovi (FORME-04)');
  assert.equal(spiegazione.textContent, TESTI[l]['computer.settings.description']);
  assert.match(TESTI.en['computer.settings.description'], /Stop/u);
  assert.equal(scheda.querySelector('[data-setting-row="computerUseToggle"] .talos-setting__help').textContent, AIUTO_CU[l], `l'aiuto intero (${l})`); // revisione prove g3, reperto 7
}

test('CU-IMP-05 il posto è fisso, prima di «Origine della ricerca web», qualunque sorella arrivi prima o dopo', async () => {
  impostaLingua('it');
  const doc = documento();
  const pannello = doc.createElement('div');
  pannello.setAttribute('id', 'setting-panel-tools');
  const carta = (chiave) => { const c = doc.createElement('div'); c.dataset.settingsCard = chiave; return c; };
  const politica = carta('tools-policy');
  const ricerca = carta('tools-search');
  const azioni = doc.createElement('div');
  azioni.className = 'talos-settings__actions';
  pannello.append(politica, ricerca, azioni);
  doc.body.append(pannello);
  doc.getElementById = (id) => (id === 'setting-panel-tools' ? pannello : null);
  doc.addEventListener = () => {}; doc.removeEventListener = () => {};
  doc.documentElement = { addEventListener() {}, removeEventListener() {} };
  /* la carta legge per prima: le sorelle non ci sono ancora */
  montaComputerUseImpostazione({ documento: doc, fetchFn: server({ acceso: false }).fetchFn });
  await attesa();
  /* poi arrivano le sorelle, ognuna «dopo Policy della sessione» come fanno `dove-girano-di-serie.js` e `pc-sveglio-impostazioni.js` */
  const dopo = (ancora, nodo) => { const c = pannello.childNodes; c.splice(c.indexOf(ancora) + 1, 0, nodo); nodo.parentNode = pannello; };
  const pc = carta('tools-pc-sveglio'); dopo(politica, pc);
  const dove = carta('tools-dove-girano'); dopo(politica, dove);
  assert.deepEqual(pannello.children.map((n) => n.dataset.settingsCard ?? n.className),
    ['tools-policy', 'tools-dove-girano', 'tools-pc-sveglio', 'tools-computer-use', 'tools-search', 'talos-settings__actions']);
});

test('CU-IMP-06 il nome dello strumento a schermo non è mai il nome tecnico: nessun trattino basso nella mappa dei nomi', async () => {
  const { nomeUmanoAttrezzo } = await import('../../src/components/nomi-attrezzi.js');
  for (const lingua of ['en', 'it']) {
    const nomi = Object.entries(TESTI[lingua]).filter(([k]) => /(^|\.)tools\.name\./u.test(k));
    assert.ok(nomi.length > 10, `${lingua}: la mappa dei nomi è vuota, la prova non morderebbe`);
    for (const [k, v] of nomi) assert.ok(!v.includes('_'), `${lingua} ${k} = «${v}»`);
    impostaLingua(lingua);
    const nome = nomeUmanoAttrezzo('computer_use');
    assert.ok(nome && !nome.includes('_'), `${lingua}: computer_use → «${nome}»`);
  }
  assert.equal(TESTI.it['varie.tools.name.computerUse'], 'uso del computer');
  assert.equal(TESTI.en['varie.tools.name.computerUse'], 'using the computer');
  /* revisione correttezza c331 giro 3 (c331g3-revisione-correttezza.md:24-25, 07/11/2026): il mutante U15 (tolto l'inglese di
     `varie.tools.description.computerUse`) viveva. La descrizione dello strumento a schermo, intera, nelle due lingue; inglese prima. */
  const { descrizioneAttrezzo } = await import('../../src/components/nomi-attrezzi.js');
  const DESCRIZIONE_CU = {
    en: 'Uses this computer’s screen for you: opens programs, clicks, types, scrolls and reads what is shown. You confirm the task on a card, except with Full access, and you can press Stop at any time.',
    it: 'Usa lo schermo di questo computer per te: apre programmi, clicca, scrive, scorre e legge ciò che si vede. Confermi il compito su una carta, tranne con Accesso pieno, e puoi premere Ferma in ogni momento.',
  };
  try {
    for (const lingua of ['en', 'it']) {
      impostaLingua(lingua);
      assert.equal(descrizioneAttrezzo('computer_use'), DESCRIZIONE_CU[lingua], `${lingua}: la descrizione dello strumento`);
    }
  } finally { impostaLingua('it'); }
});
