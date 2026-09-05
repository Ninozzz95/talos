import frammenti from '../legacy/frammenti.html';

/*
 * IL PONTE DEGLI ID — Fase 1 del piano «il mockup diventa la app».
 *
 * `legacy/app.js` (il monolite, 14 mila righe) non conosce la struttura della
 * pagina: trova i suoi elementi per **id** (160) e per **attributi `data-*`**
 * e poche classi, attraverso `ROOT()`/`$()`. Il markup della pagina è quello
 * del mockup approvato, byte per byte. Questo modulo, eseguito PRIMA di
 * `app.js`, fa due cose:
 *
 *  1. **monta nascosti** i frammenti del monolite che il mockup non disegna
 *     ancora (impostazioni con il Model Lab, i pannelli diff/board/browser/
 *     automazioni, la colonna dei dettagli con l'albero file, i dialoghi
 *     nativi, i toast): così ogni id esiste, `app.js` non si rompe, e ogni
 *     funzione continua a lavorare — invisibile finché la Fase 2 non
 *     ridisegna quel pezzo nel linguaggio del mockup;
 *  2. **assegna** agli elementi del mockup gli id, le classi e i `data-*` che
 *     `app.js` cerca. Gli id non cambiano il rendering, e le classi aggiunte
 *     non sono `talos-*` (il cancello di parità le ignora): il mockup resta
 *     il mockup.
 *
 * ⛔ Nessuna logica di prodotto vive qui. Il ponte non decide niente: dice
 * solo a un vecchio cervello dove sta il corpo nuovo. Quando la Fase 2 avrà
 * ridisegnato un pezzo, la riga corrispondente qui sotto SPARISCE — il
 * modulo deve svuotarsi, non crescere.
 *
 * ⛔ Il trabocchetto dei custom element a Light DOM (blog.master.dev/light-dom-only,
 * letto il 05/09/2026): il codice può girare prima che i figli siano
 * parsati. Qui non c'è quel rischio perché il modulo parte da `main.js`, cioè
 * da uno `<script type="module">` in fondo al body, DOPO il parse.
 */

/** Vista del monolite → schermata del mockup. */
export const VISTA_PER_SCHERMATA = Object.freeze({
  chat: 'schermoChat',
  vuota: 'schermoVuota',
  terminal: 'schermoTerminale',
  diff: 'schermoReview',
  capability: 'schermoCapability',
  dashboard: 'schermoBoard',
  memoria: 'schermoMemoria',
  attivita: 'schermoAttivita',
  settings: 'schermoImpostazioni',
  doctor: 'schermoDoctor',
  libreria: 'schermoLibreria',
  ricerca: 'schermoRicerca',
  officina: 'schermoOfficina',
  automations: 'schermoAutomazioni',
});

/** `data-vaia` del mockup → vista del monolite (`setView`). */
export const VISTA_PER_VAIA = Object.freeze({
  chat: 'chat', vuota: 'vuota', terminale: 'terminal', review: 'diff', capability: 'capability',
  board: 'dashboard', memoria: 'memoria', attivita: 'attivita', impostazioni: 'settings',
  doctor: 'doctor', libreria: 'libreria', ricerca: 'ricerca', officina: 'officina', automazioni: 'automations',
});

function uno(root, selettore) {
  const el = root.querySelector(selettore);
  if (!el) throw new Error(`ponte: manca nel mockup «${selettore}»`);
  return el;
}

function battezza(el, { id, classi = [], dati = {} }) {
  if (id) el.id = id;
  for (const c of classi) el.classList.add(c);
  for (const [k, v] of Object.entries(dati)) el.setAttribute(`data-${k}`, v);
  return el;
}

/**
 * Monta il ponte. Idempotente: una seconda chiamata non duplica niente.
 * @param {Document} documentObj
 */
export function montaPonteLegacy(documentObj = document) {
  const radice = documentObj.querySelector('.talos-shell');
  if (!radice) throw new Error('ponte: la pagina non ha il guscio del mockup (.talos-shell)');
  if (documentObj.getElementById('talos-legacy')) return;

  /*
   * 1) I frammenti del monolite, fuori dal guscio, in DUE strati.
   *
   * ⛔ Trovato misurando, non presunto: con tutto in un solo contenitore
   * `hidden`, la pagina rispondeva a ogni `elementsFromPoint` con il solo
   * `<html>` — nessun clic arrivava a niente. La causa era `introDialog.showModal()`
   * al primo avvio: un `<dialog>` modale dentro un antenato `display:none` non
   * si vede, ma il top layer rende comunque INERTE tutto il resto del
   * documento. I dialoghi nativi, i veli e i toast stanno quindi in uno strato
   * VISIBILE (privo di stile finché la Fase 2 non li ridisegna); i pannelli,
   * la colonna e la testata del monolite restano in quello nascosto.
   */
  const [frammentiNascosti, frammentiVisibili] = frammenti.split('<!-- STRATO VISIBILE -->');
  const legacy = documentObj.createElement('div');
  legacy.id = 'talos-legacy';
  legacy.hidden = true;
  legacy.innerHTML = frammentiNascosti;
  documentObj.body.append(legacy);
  const strato = documentObj.createElement('div');
  strato.id = 'talos-legacy-strato';
  strato.innerHTML = frammentiVisibili || '';
  documentObj.body.append(strato);

  /* 2) Il guscio, e gli attributi di radice che la regia del mockup scrive all'avvio. */
  battezza(radice, { id: 'app', classi: ['app-shell'] });
  documentObj.documentElement.setAttribute('data-vista', 'sessione');
  documentObj.documentElement.setAttribute('data-schermo', 'chat');

  /* 3) La sidebar. */
  const sidebar = uno(radice, '.talos-sidebar');
  battezza(sidebar, { id: 'sessionsPanel', classi: ['sessions-panel'] });
  battezza(uno(sidebar, '.talos-brand .talos-icon-button'), { id: 'notificationsBtn' });
  battezza(uno(sidebar, '.talos-brand [data-azione="barra"]'), { id: 'sessionsCollapseBtn' }); // 05/9 Fase 2: la barra si comprime a icone (e si ricorda)
  battezza(uno(sidebar, '.talos-sidebar__actions .talos-field__input'), { id: 'sessionSearch' });
  battezza(uno(sidebar, '#voceNuova'), { id: 'newSessionBtn' });
  const sessioni = uno(sidebar, '.talos-sidebar__sessions');
  battezza(sessioni, { id: 'sessionList', classi: ['session-list'] });
  /*
   * Le righe di sessione del mockup sono dati finti: app.js riempie
   * #sessionList con quelle vere (contenitoreSessioniReali → #realSessionsBlock).
   * Si tolgono qui, non nel mockup, che resta la vetrina con i suoi esempi.
   */
  for (const finta of sessioni.querySelectorAll('.talos-session-item')) finta.remove();
  /*
   * 05/9 Fase 2 — il blocco «Fissate» del mockup mostra una riga d'esempio; la app
   * non ha ancora il pin delle sessioni (vuole un campo `fissata` nell'API, cioè il
   * contratto sbloccato in Fase 3). Finché non c'è: via la riga finta e blocco
   * nascosto — uno stato vuoto onesto, non un dato inventato. `data-fissate` è
   * l'aggancio con cui app.js lo riaccenderà.
   */
  const fissate = uno(sidebar, '[data-c="NavGroup"]:has(.talos-eyebrow[data-t="fissate"])');
  for (const finta of fissate.querySelectorAll('.talos-session-item')) finta.remove();
  fissate.dataset.fissate = 'vuoto';
  fissate.hidden = true;
  battezza(uno(sidebar, '.talos-resizer--sidebar'), { classi: ['panel-resize-handle'], dati: { resize: 'sessions' } });

  /* 4) Le schermate diventano le «viste» del monolite: `.view-pane[data-view]`. */
  for (const [vista, id] of Object.entries(VISTA_PER_SCHERMATA)) {
    const schermata = uno(radice, `#${id}`);
    battezza(schermata, { classi: ['view-pane'], dati: { view: vista } });
    if (!schermata.hidden) schermata.classList.add('active');
  }
  /* Le viste della testata (Chat · Terminale · Review) sono i «mode-tab». */
  for (const tab of radice.querySelectorAll('[data-vistetab] [role="tab"][data-vaia]')) {
    battezza(tab, { classi: ['mode-tab'], dati: { mode: VISTA_PER_VAIA[tab.dataset.vaia] === 'diff' ? 'diff' : VISTA_PER_VAIA[tab.dataset.vaia] } });
  }

  /* 5) La chat. */
  const chat = uno(radice, '#schermoChat');
  battezza(chat, { classi: ['chat-view'] });
  battezza(uno(chat, '.talos-conversation'), { classi: ['conversation'] });
  battezza(uno(chat, '.talos-conversation__column'), { id: 'conversation' });
  /*
   * I messaggi d'esempio del mockup: via, per lo stesso motivo delle sessioni
   * finte. La conversazione vera la scrive app.js.
   */
  for (const turno of chat.querySelectorAll('.talos-conversation__column > .talos-turn')) turno.remove();
  const piede = uno(chat, '.talos-chat-foot');
  battezza(uno(piede, '.talos-status-strip'), { classi: ['run-strip'] });
  const coda = uno(piede, '.talos-queue');
  battezza(coda, { id: 'queuedMessage', classi: ['queued-message'] });
  battezza(uno(coda, '.talos-queue__text'), { id: 'queuedMessageText' });
  battezza(uno(coda, '.talos-button'), { id: 'cancelQueued' });
  coda.hidden = true;
  const compositore = uno(piede, '#composerForm');
  battezza(uno(compositore, '.talos-send'), { classi: ['send-btn'] });
  battezza(uno(compositore, '.talos-composer__mic'), { classi: ['composer-mic'] }); // 05/9 Fase 2: ChatFooter — il microfono dell'originale (dettatura)
  battezza(uno(piede, '.talos-statusbar'), { classi: ['runtime-status'] });
  // 05/9 Fase 2 (T-16): i tre toast dimostrativi del mockup restano nel documento
  // (il cancello statico li conta) ma nascosti e marcati: la pila viva li ignora.
  for (const demo of documentObj.querySelectorAll('#regioneToast .talos-toast')) { demo.hidden = true; demo.dataset.demo = '1'; }
  battezza(uno(chat, '.talos-topbar__title h1'), { id: 'sessionTitle' });
  /*
   * 05/9 Fase 2: Topbar. Il titolo con il chevron e il pulsante «Albero dei rami»
   * aprono il foglio VERO della sessione (openSheet('sessionTree') del monolite),
   * non il velo statico del mockup con i suoi dati d'esempio: via `data-apre-velo`,
   * al suo posto `data-open-sheet`, che il monolite cabla all'avvio. Le tre azioni
   * aggiunte al mockup (Comandi, Comprimi il contesto, Dettagli) prendono gli id
   * e i data-* con cui il monolite le trova.
   */
  const titolo = uno(chat, '.talos-topbar__title');
  battezza(titolo, { id: 'sessionTitleButton', dati: { 'open-sheet': 'sessionTree' } });
  titolo.setAttribute('role', 'button');
  titolo.tabIndex = 0;
  const albero = uno(chat, '.talos-topbar__actions [data-apre-velo="veloAlbero"]');
  albero.removeAttribute('data-apre-velo');
  battezza(albero, { dati: { 'open-sheet': 'sessionTree' } });
  battezza(uno(chat, '.talos-topbar__actions [data-azione="comandi"]'), { id: 'commandPaletteBtn' });
  battezza(uno(chat, '.talos-topbar__actions [data-azione="comprimi"]'), { id: 'compactSessionBtn' });
  battezza(uno(chat, '.talos-topbar__actions [data-azione="dettagli"]'), { classi: ['desktop-context-toggle'], dati: { 'open-panel': 'inspector' } }); // il monolite ascolta il toggle SOLO con questa classe (toggleDesktopInspector)
  battezza(uno(chat, '.talos-topbar__actions .talos-icon-button[title="Riprendi"]'), { id: 'resumeSessionBtn' });
  battezza(uno(chat, '.talos-topbar'), { classi: ['topbar'] });
  battezza(uno(chat, '.talos-topbar__actions'), { classi: ['topbar-right'] });

  /* 6) Il terminale. */
  const terminale = uno(radice, '#schermoTerminale');
  battezza(uno(terminale, '.talos-terminal__body'), { id: 'realTerminalMount', classi: ['terminal-window'] });
  battezza(uno(terminale, '.talos-terminal__foot'), { id: 'terminalStatusChip' });

  /* 7) La colonna dei dettagli. */
  const inspector = uno(radice, '.talos-inspector');
  battezza(inspector, { id: 'inspectorPanel', classi: ['inspector-panel'] });
  battezza(uno(inspector, '.talos-resizer--inspector'), { classi: ['panel-resize-handle'], dati: { resize: 'inspector' } });
  battezza(uno(inspector, '#railTabs'), { classi: ['inspector-tabs'] });
  const schede = { contesto: 'context', file: 'files', agenti: 'agents', processi: 'processes' };
  for (const [rail, nome] of Object.entries(schede)) {
    const tab = uno(inspector, `[data-rail="${rail}"]`);
    battezza(tab, { id: `inspector-tab-${nome}`, dati: { 'inspector-tab': nome } });
    if (tab.getAttribute('aria-selected') === 'true') tab.classList.add('active');
    const pannello = uno(inspector, `#${tab.getAttribute('aria-controls')}`);
    battezza(pannello, { classi: ['inspector-section'], dati: { 'inspector-section': nome } });
    if (!pannello.hidden) pannello.classList.add('active');
  }
  /*
   * L'albero file del monolite vive nel frammento nascosto sotto
   * `#legacyInspector`. Perché `#inspector-files .file-tree` sia trovato dove
   * app.js lo cerca, quel pannello nascosto porta l'id `inspector-files`
   * mentre la scheda del mockup si chiama `railFile`: due contenitori, uno
   * visibile (mockup) e uno nascosto (monolite), finché la Fase 2 non li
   * unisce nel disegno del mockup.
   */
  const legacyFiles = legacy.querySelector('#inspector-files');
  if (legacyFiles) battezza(uno(inspector, '#railFile'), { id: 'railFile' });

  /* 8) Le maniglie leggono/scrivono i token del mockup (vedi PANEL_RESIZE_VAR in app.js). */

  return legacy;
}
