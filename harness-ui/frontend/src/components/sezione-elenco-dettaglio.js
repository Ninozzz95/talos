/*
 * sezione-elenco-dettaglio.js — l'IMPIANTO del lotto C: elenco a sinistra, dettaglio a destra.
 *
 * Fonte: `Talos_Desktop_Final_Mockup_Interattivo.html`, `initSection` (riga 6064), `renderSection`
 * (6065), `renderDetail` (6072), `selectItem` (6073), `card` (6052). Decisione dell'owner
 * dell'11/09/2026, alla lettera: «elenco a sinistra e dettaglio a destra, per tutte e sei le
 * pagine, coi dati veri».
 *
 * ⛔ COSA CAMBIA RISPETTO AL MOCKUP, e perché.
 *   1. Il mockup riscrive TUTTA la schermata con `innerHTML` a partire da un oggetto `meta`
 *      scritto a mano (titoli, sottotitoli, testi del vuoto). Qui no: la copia — h2, sottotitolo,
 *      riga di stato — viene SPOSTATA da `.talos-page__head` che il prodotto ha già, insieme ai
 *      suoi `data-*` (`data-note-stato`, `data-library-esito`, …). Così `legacy/app.js` continua a
 *      scrivere lì i suoi messaggi di errore e di caricamento senza sapere che la pagina è
 *      cambiata, e nessuna frase viene riscritta una seconda volta in un secondo posto.
 *   2. Niente `innerHTML`: il titolo di una nota e il nome di un file li scrive un modello o il
 *      disco. È la stessa regola già scritta in `note.js` e in `libreria.js`.
 *   3. ~~Niente animazioni in JS~~ — CORRETTO l'11/09/2026 (sera), e la correzione è il punto.
 *      Qui c'era scritto: «il mockup usa `motion(...)` e `flip(...)`, ma `body.reduce-motion *` e
 *      `@media (prefers-reduced-motion) *` spengono OGNI animazione con `!important`, quindi
 *      un'animazione scritta qui sarebbe morta a valle senza dirlo». Era vero quel giorno; quelle
 *      due regole universali sono state TOLTE quella stessa notte (aspetto.css:488,
 *      attesa-shimmer.css:66) perché spegnevano ogni animazione della app, e da allora «movimento
 *      spento» si esprime azzerando i TOKEN in `legacy/app.js` — una forma che si misura.
 *      ⇒ `flip(...)`, l'entrata, l'uscita e l'espansione del dettaglio sono qui sotto, e passano
 *      da `motion-mockup.js`, che quei token li legge. Vedi il blocco «IL MOVIMENTO DEL MOCKUP».
 *
 * ⛔ IL DIVISORIO è un cursore, non una linea decorativa. Ricerca dell'11/09/2026 — UX Patterns
 *   Guide «Window Splitter», Telerik Design System «Splitter accessibility», W3C APG:
 *     · `role="separator"` + `aria-orientation="vertical"` (l'orientamento descrive la LINEA, non
 *       la disposizione delle colonne: due colonne affiancate hanno un divisorio verticale);
 *     · `aria-valuenow/valuemin/valuemax` sulla misura del pannello;
 *     · le frecce spostano di un passo dichiarato, Home/End portano ai due estremi.
 *   Qui: passo 24 px, estremi 320 e 700 px, doppio clic riporta a 440 (il valore del mockup,
 *   `--td-detail-width:440px`, riga 3980).
 *
 * ⛔ LE PREFERENZE DI VISTA SONO DI QUESTO BROWSER, non del progetto: vista (schede/elenco),
 *   ordine e larghezza del dettaglio vivono in `localStorage`. La SELEZIONE no — è di sessione, e
 *   ricordare quale nota era aperta tre giorni fa non aiuta nessuno.
 */
import { plurale } from './plurale.js';

export const CHIAVE_PREFERENZE = 'talos-harness-sezioni-v1';
export const LARGHEZZA_MINIMA = 320;
export const LARGHEZZA_MASSIMA = 700;
export const LARGHEZZA_NORMALE = 440; // il `--td-detail-width` del mockup
export const PASSO_DIVISORIO = 24;

/* ---------------------------------------------------------------- logica pura (provata da sola) */

/** La larghezza del dettaglio non esce mai dai due estremi dichiarati all'`aria-valuemin/max`. */
export function larghezzaDettaglio(valore) {
  /* ⛔ `Number(null)` è ZERO, non «niente»: con `Number()` una preferenza assente diventava 320 px
     (il minimo) invece del valore normale. `parseFloat` dice NaN su null, undefined e oggetti — e
     in più accetta «440px», che è la forma in cui la misura vive nel CSS. */
  const n = typeof valore === 'number' ? valore : Number.parseFloat(valore);
  if (!Number.isFinite(n)) return LARGHEZZA_NORMALE;
  return Math.round(Math.max(LARGHEZZA_MINIMA, Math.min(LARGHEZZA_MASSIMA, n)));
}

/**
 * L'ordine. `nuovo` = ultima modifica prima; `titolo` = A-Z con le regole italiane.
 * ⛔ Le voci senza data non spariscono e non salgono in cima: finiscono in fondo, e si vede.
 */
export function ordinaVoci(voci, ordine, { titoloDi, quandoDi }) {
  const lista = Array.isArray(voci) ? [...voci] : [];
  if (ordine === 'titolo') {
    return lista.sort((a, b) => String(titoloDi(a) ?? '').localeCompare(String(titoloDi(b) ?? ''), 'it', { sensitivity: 'base' }));
  }
  const quando = (v) => {
    const grezzo = quandoDi(v);
    const d = grezzo instanceof Date ? grezzo : new Date(grezzo ?? '');
    const t = d.getTime();
    return Number.isFinite(t) ? t : -Infinity;
  };
  return lista.sort((a, b) => quando(b) - quando(a));
}

/** Il filtro attivo interseca la ricerca: due domande diverse, una risposta sola. */
export function filtraVoci(voci, { query = '', filtro = 'tutte', filtri = [], cercaIn }) {
  const q = String(query).trim().toLocaleLowerCase('it');
  const scelto = filtri.find((f) => f.id === filtro);
  return (Array.isArray(voci) ? voci : []).filter((v) => {
    if (scelto?.quando && !scelto.quando(v)) return false;
    if (!q) return true;
    return String(cercaIn(v) ?? '').toLocaleLowerCase('it').includes(q);
  });
}

/**
 * Il numero accanto a ogni filtro.
 * ⛔ Si conta sull'elenco INTERO, non su quello già filtrato: un filtro che dice «0» mentre
 *   contiene qualcosa è la stessa bugia del contatore che promette una pagina che non c'è.
 */
export function contaPerFiltro(voci, filtri) {
  const lista = Array.isArray(voci) ? voci : [];
  return filtri.map((f) => (f.quando ? lista.filter((v) => f.quando(v)).length : lista.length));
}

/** «3 di 12 ricordi» solo quando un filtro toglie qualcosa; altrimenti il numero e basta. */
export function sommarioSezione(visibili, totale, sostantivo, pluraleEsplicito) {
  if (visibili === totale) return plurale(totale, sostantivo, pluraleEsplicito);
  return `${visibili} di ${plurale(totale, sostantivo, pluraleEsplicito)}`;
}

export function leggiPreferenze(chiave, storage = globalThis.localStorage) {
  try {
    const tutte = JSON.parse(storage?.getItem(CHIAVE_PREFERENZE) || '{}');
    const mia = tutte && typeof tutte === 'object' ? tutte[chiave] : null;
    return {
      vista: mia?.vista === 'elenco' ? 'elenco' : 'schede',
      ordine: mia?.ordine === 'titolo' ? 'titolo' : 'nuovo',
      larghezza: larghezzaDettaglio(mia?.larghezza),
    };
  } catch { return { vista: 'schede', ordine: 'nuovo', larghezza: LARGHEZZA_NORMALE }; }
}

export function salvaPreferenze(chiave, valori, storage = globalThis.localStorage) {
  try {
    const tutte = JSON.parse(storage?.getItem(CHIAVE_PREFERENZE) || '{}');
    const sane = tutte && typeof tutte === 'object' && !Array.isArray(tutte) ? tutte : {};
    sane[chiave] = { vista: valori.vista, ordine: valori.ordine, larghezza: larghezzaDettaglio(valori.larghezza) };
    storage?.setItem(CHIAVE_PREFERENZE, JSON.stringify(sane));
    return true;
  } catch { return false; } // una preferenza visuale non blocca mai la pagina
}

/* ---------------------------------------------------------------------------- costruzione DOM */

/**
 * Ritrova una scheda per id SENZA costruire un selettore.
 * ⛔ Un id viene dal disco (il nome di un file, l'id di una nota): infilarlo dentro
 *   `querySelector('[data-item="…"]')` vuol dire che una virgoletta nel nome rompe il selettore —
 *   e `CSS.escape` non esiste nel documento finto dei test. Si confrontano le stringhe, e basta.
 */
function perId(radice, selettore, campo, valore) {
  const cercato = String(valore ?? '');
  return [...radice.querySelectorAll(selettore)].find((el) => el.dataset[campo] === cercato) || null;
}

function nodo(doc, tag, classe, testo) {
  const el = doc.createElement(tag);
  if (classe) el.className = classe;
  if (testo !== undefined && testo !== null) el.textContent = String(testo);
  return el;
}

export function icona(doc, nome, classe = 'i') {
  const svg = doc.createElementNS('http://www.w3.org/2000/svg', 'svg');
  const use = doc.createElementNS('http://www.w3.org/2000/svg', 'use');
  svg.setAttribute('class', classe);
  svg.setAttribute('aria-hidden', 'true');
  use.setAttribute('href', `#i-${nome}`);
  svg.append(use);
  return svg;
}

/** L'etichetta col tono del mockup (`tag()`, riga 6036): stessa parola, stesso colore dei badge. */
export function etichetta(doc, testo, tono = '') {
  const el = nodo(doc, 'span', 'td-tag', testo);
  if (tono) el.dataset.tone = tono;
  return el;
}

/** Il disegno dello stato vuoto (`emptyArt`, riga 6051): due fogli sovrapposti e l'icona della sezione. */
function disegnoVuoto(doc, nomeIcona) {
  const NS = 'http://www.w3.org/2000/svg';
  const svg = doc.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', '0 0 120 100');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('aria-hidden', 'true');
  const linea = doc.createElementNS(NS, 'path');
  linea.setAttribute('d', 'M20 83h80'); linea.setAttribute('stroke', 'currentColor'); linea.setAttribute('opacity', '.24');
  const dietro = doc.createElementNS(NS, 'rect');
  for (const [k, v] of Object.entries({ x: 23, y: 18, width: 66, height: 56, rx: 10, stroke: 'currentColor', opacity: '.25', transform: 'rotate(-7 56 46)' })) dietro.setAttribute(k, String(v));
  const davanti = doc.createElementNS(NS, 'rect');
  for (const [k, v] of Object.entries({ x: 31, y: 22, width: 66, height: 56, rx: 10, stroke: 'currentColor', fill: 'var(--talos-panel)' })) davanti.setAttribute(k, String(v));
  const dentro = doc.createElementNS(NS, 'svg');
  for (const [k, v] of Object.entries({ x: 50, y: 34, width: 28, height: 28, class: 'i' })) dentro.setAttribute(k, String(v));
  const use = doc.createElementNS(NS, 'use');
  use.setAttribute('href', `#i-${nomeIcona}`);
  dentro.append(use);
  const scintilla = doc.createElementNS(NS, 'path');
  for (const [k, v] of Object.entries({ d: 'M92 16v10m-5-5h10', class: 'accent', 'stroke-width': '1.5', 'stroke-linecap': 'round' })) scintilla.setAttribute(k, String(v));
  svg.append(linea, dietro, davanti, dentro, scintilla);
  return svg;
}

const STATI = new WeakMap();

/**
 * Monta (una volta) e aggiorna (sempre) la sezione elenco+dettaglio dentro uno `.talos-screen`.
 *
 * @param {HTMLElement} schermo lo `#schermoNote`, `#schermoMemoria`, …
 * @param {object} config vedi `sezioni-adattatori.js`: è l'unico chiamante previsto
 * @returns {number} quante voci sono visibili dopo filtro e ricerca
 */
export function montaSezione(schermo, config) {
  if (!schermo) return 0;
  const doc = schermo.ownerDocument || globalThis.document;
  let stato = STATI.get(schermo);
  if (!stato) {
    const pref = leggiPreferenze(config.chiave);
    stato = { ...pref, query: String(config.queryIniziale || ''), filtro: config.filtri?.[0]?.id || 'tutte', selezione: null, espanso: false, config, schermo };
    STATI.set(schermo, stato);
    costruisciScheletro(schermo, doc, stato);
  }
  stato.config = config;
  disegna(schermo, doc, stato);
  return stato.ultimeVisibili ?? 0;
}

/** Solo per i test e per il laboratorio: rilegge lo stato vivo di una sezione già montata. */
export function statoSezione(schermo) { return STATI.get(schermo) || null; }

function costruisciScheletro(schermo, doc, stato) {
  const config = stato.config;
  const pagina = schermo.querySelector('.talos-page');
  const testa = pagina?.querySelector('.talos-page__head');

  const sezione = nodo(doc, 'div', 'td-section td-scope');
  sezione.dataset.section = config.chiave;
  const spazio = nodo(doc, 'div', 'td-workspace');
  spazio.dataset.detail = 'false';
  spazio.dataset.expanded = 'false';
  spazio.style.setProperty('--td-larghezza-dettaglio', `${stato.larghezza}px`);

  /* ---- l'elenco ---- */
  const master = nodo(doc, 'div', 'td-master');
  const intro = nodo(doc, 'div', 'td-intro');
  const marchio = nodo(doc, 'span', 'td-intro-mark');
  marchio.append(icona(doc, config.icona));
  const testi = nodo(doc, 'div');
  /* ⛔ SPOSTATI, non riscritti: il titolo, la spiegazione e la riga di stato sono quelli del
     prodotto, con i loro `data-*`. Se non ci sono (laboratorio, o una schermata futura) si cade su
     ciò che dichiara l'adattatore, e si vede subito quale dei due sta parlando. */
  const h2 = testa?.querySelector('h2') || nodo(doc, 'h2', '', config.titolo || '');
  const spiegazione = testa?.querySelector('p:not([role="status"]):not([data-note-stato]):not([data-progetti-stato])')
    || nodo(doc, 'p', '', config.spiegazione || '');
  const statoRiga = testa?.querySelector('[role="status"], [data-note-stato], [data-progetti-stato], [data-task-esito], [data-library-esito], [data-research-esito], [data-memory-stato]')
    || nodo(doc, 'p', 'talos-page__note', '');
  if (!statoRiga.getAttribute('role')) statoRiga.setAttribute('role', 'status');
  testi.append(h2, spiegazione, statoRiga);
  intro.append(marchio, testi);

  const barra = nodo(doc, 'div', 'td-toolbar');
  const campo = nodo(doc, 'div', 'talos-field talos-field--sm td-search');
  campo.append(icona(doc, 'search', 'i talos-field__icon'));
  const cerca = nodo(doc, 'input', 'talos-field__input');
  cerca.type = 'search';
  cerca.autocomplete = 'off';
  cerca.placeholder = 'Cerca nel titolo e nel contenuto…';
  cerca.setAttribute('aria-label', `Cerca in ${config.nome}`);
  cerca.value = stato.query;
  campo.append(cerca);
  const cresci = nodo(doc, 'span', 'talos-grow');
  const ordine = nodo(doc, 'select', 'td-select');
  ordine.setAttribute('aria-label', `Ordina ${config.nome}`);
  for (const [valore, testoOpzione] of [['nuovo', 'Ultima modifica'], ['titolo', 'Titolo A–Z']]) {
    const op = nodo(doc, 'option', '', testoOpzione);
    op.value = valore;
    ordine.append(op);
  }
  ordine.value = stato.ordine;
  const segmento = nodo(doc, 'div', 'td-segment');
  segmento.setAttribute('role', 'group');
  segmento.setAttribute('aria-label', `Vista ${config.nome}`);
  for (const [vista, nomeIcona, nome] of [['elenco', 'list', 'Vista elenco'], ['schede', 'grid', 'Vista schede']]) {
    const b = nodo(doc, 'button');
    b.type = 'button';
    b.dataset.vista = vista;
    b.setAttribute('aria-label', nome);
    b.append(icona(doc, nomeIcona));
    segmento.append(b);
  }
  const aggiorna = nodo(doc, 'button', 'talos-button talos-button--secondary talos-button--sm', 'Aggiorna');
  aggiorna.type = 'button';
  aggiorna.dataset.aggiorna = '';
  barra.append(campo, cresci, ordine, segmento, aggiorna);

  const filtri = nodo(doc, 'div', 'td-filters');
  filtri.setAttribute('role', 'group');
  filtri.setAttribute('aria-label', `Filtri ${config.nome}`);
  const risultati = nodo(doc, 'div', 'td-results');
  master.append(intro, barra, filtri, risultati);

  /* ---- il divisorio ---- */
  const divisorio = nodo(doc, 'button', 'td-divider');
  divisorio.type = 'button';
  divisorio.hidden = true;
  divisorio.setAttribute('role', 'separator');
  divisorio.setAttribute('aria-orientation', 'vertical');
  divisorio.setAttribute('aria-label', 'Larghezza del dettaglio');
  divisorio.setAttribute('aria-valuemin', String(LARGHEZZA_MINIMA));
  divisorio.setAttribute('aria-valuemax', String(LARGHEZZA_MASSIMA));
  divisorio.setAttribute('aria-valuenow', String(stato.larghezza));

  /* ---- il dettaglio ---- */
  const dettaglio = nodo(doc, 'aside', 'td-detail');
  dettaglio.hidden = true;
  dettaglio.setAttribute('aria-label', `Dettaglio ${config.nome}`);

  spazio.append(master, divisorio, dettaglio);
  sezione.append(spazio);
  if (pagina) pagina.replaceWith(sezione); else schermo.append(sezione);

  stato.nodi = { sezione, spazio, master, intro, cerca, ordine, segmento, aggiorna, filtri, risultati, divisorio, dettaglio, statoRiga };
  collegaBarra(schermo, doc, stato);
  collegaDivisorio(doc, stato);
}

function collegaBarra(schermo, doc, stato) {
  const { cerca, ordine, segmento, aggiorna } = stato.nodi;
  cerca.addEventListener('input', () => { stato.query = cerca.value; disegna(schermo, doc, stato); });
  ordine.addEventListener('change', () => {
    stato.ordine = ordine.value === 'titolo' ? 'titolo' : 'nuovo';
    salvaPreferenze(stato.config.chiave, stato);
    disegna(schermo, doc, stato);
  });
  segmento.addEventListener('click', (e) => {
    const b = e.target.closest?.('[data-vista]');
    if (!b) return;
    stato.vista = b.dataset.vista;
    salvaPreferenze(stato.config.chiave, stato);
    disegna(schermo, doc, stato);
  });
  aggiorna.addEventListener('click', () => stato.config.onAggiorna?.());
  stato.nodi.filtri.addEventListener('click', (e) => {
    const b = e.target.closest?.('[data-filtro]');
    if (!b) return;
    stato.filtro = b.dataset.filtro;
    disegna(schermo, doc, stato);
  });
}

function applicaLarghezza(stato, valore) {
  stato.larghezza = larghezzaDettaglio(valore);
  stato.nodi.spazio.style.setProperty('--td-larghezza-dettaglio', `${stato.larghezza}px`);
  stato.nodi.divisorio.setAttribute('aria-valuenow', String(stato.larghezza));
  stato.nodi.divisorio.setAttribute('aria-valuetext', `${stato.larghezza} pixel`);
}

function collegaDivisorio(doc, stato) {
  const { divisorio } = stato.nodi;
  const radice = doc.documentElement;
  divisorio.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    e.preventDefault();
    divisorio.focus?.();
    const partenza = e.clientX;
    const iniziale = stato.larghezza;
    divisorio.setPointerCapture?.(e.pointerId);
    radice.classList.add('td-dragging');
    /* Il dettaglio sta a DESTRA: trascinare verso sinistra lo allarga, quindi il segno è meno. */
    const muovi = (m) => applicaLarghezza(stato, iniziale - (m.clientX - partenza));
    const fine = () => {
      radice.classList.remove('td-dragging');
      if (divisorio.hasPointerCapture?.(e.pointerId)) divisorio.releasePointerCapture(e.pointerId);
      divisorio.removeEventListener('pointermove', muovi);
      divisorio.removeEventListener('pointerup', fine);
      divisorio.removeEventListener('pointercancel', fine);
      salvaPreferenze(stato.config.chiave, stato);
    };
    divisorio.addEventListener('pointermove', muovi);
    divisorio.addEventListener('pointerup', fine);
    divisorio.addEventListener('pointercancel', fine);
  });
  divisorio.addEventListener('keydown', (e) => {
    const mappa = {
      ArrowLeft: stato.larghezza + PASSO_DIVISORIO,
      ArrowRight: stato.larghezza - PASSO_DIVISORIO,
      Home: LARGHEZZA_MASSIMA,
      End: LARGHEZZA_MINIMA,
    };
    if (!(e.key in mappa)) return;
    e.preventDefault();
    applicaLarghezza(stato, mappa[e.key]);
    salvaPreferenze(stato.config.chiave, stato);
  });
  divisorio.addEventListener('dblclick', () => { applicaLarghezza(stato, LARGHEZZA_NORMALE); salvaPreferenze(stato.config.chiave, stato); });
}

/* ------------------------------------------------------------------------------- il disegno */

/* ───────────────────────────── IL MOVIMENTO DEL MOCKUP (11/09/2026) ─────────────────────────────
 * ⛔ LA TESTATA DI QUESTO FILE DICEVA «Niente animazioni in JS», e la sua ragione NON VALE PIÙ.
 *   Diceva: «`body.reduce-motion *` e `@media (prefers-reduced-motion) *` spengono OGNI animazione
 *   con `!important`: un'animazione scritta qui sarebbe morta a valle senza dirlo». Quelle due
 *   regole universali sono state TOLTE la notte del 10-11/09 (aspetto.css:488, attesa-shimmer.css:66)
 *   proprio perché spegnevano ogni animazione della app — e da allora «movimento spento» si esprime
 *   azzerando i TOKEN (`legacy/app.js`, `applicaMovimento` ~12896), che è una forma che si vede e si
 *   misura. `motion-mockup.js` legge quei token: spegnere spegne anche queste.
 *   ⇒ La premessa era vera quando è stata scritta e oggi è falsa. Si riapre, e si scrive perché.
 *
 * Le quattro animazioni portate qui, tutte dal mockup (`talos-desktop-study`):
 *   · `flip(container,change)`  — le schede che si spostano quando l'elenco cambia forma;
 *   · `selectItem`             — il dettaglio che entra da destra (`surface-enter` × 1.25);
 *   · `case'expand-detail'`    — il dettaglio che si allarga (opacità .65 → 1);
 *   · `closeDetail`            — il dettaglio che esce verso destra (`surface-exit`).
 */
import { motion, movimentoSpento } from './motion-mockup.js';

const LEVA_SUPERFICI = 'motion-surfaces-off';

/** Dove sta ogni scheda ADESSO. Serve il PRIMA di un riordino: dopo è troppo tardi. */
function fotografaSchede(contenitore) {
  const mappa = new Map();
  if (!contenitore?.querySelectorAll) return mappa;
  for (const el of contenitore.querySelectorAll('[data-item]')) {
    try { mappa.set(el.dataset.item, el.getBoundingClientRect()); } catch { /* nodo staccato */ }
  }
  return mappa;
}

/**
 * Il `flip()` del mockup: chi si è spostato parte da dov'era, chi è appena arrivato entra dal basso.
 * ⛔ Il PRIMA vuoto vuol dire «primo disegno»: lì il mockup chiama `renderSection` SENZA `flip`, e
 *   una pagina che si apre con dodici schede che salgono una per una è esattamente il movimento
 *   gratuito che la regola di stile vieta. Nessuna animazione.
 */
function flipSchede(doc, contenitore, prima) {
  if (!prima.size || !contenitore?.querySelectorAll) return;
  if (movimentoSpento({ document: doc, leva: LEVA_SUPERFICI })) return;
  for (const el of contenitore.querySelectorAll('[data-item]')) {
    let dopo;
    try { dopo = el.getBoundingClientRect(); } catch { continue; }
    const a = prima.get(el.dataset.item);
    /* ⛔ MISURATO nel laboratorio: espandendo il dettaglio la colonna dell'elenco diventa
       `display:none` (mockup-td.css:184) e `getBoundingClientRect()` torna un rettangolo di zero.
       Senza questa guardia partivano quattro animazioni da 600 px su schede che NON SI VEDONO —
       movimento pagato e invisibile, e per giunta uno che il mockup non fa (il suo `expand-detail`
       chiama `renderSection` SENZA `flip`). Un rettangolo vuoto non è una posizione. */
    const invisibile = (r) => !r || (r.width === 0 && r.height === 0);
    if (invisibile(dopo) || (a && invisibile(a))) continue;
    if (a) {
      const dx = a.x - dopo.x;
      const dy = a.y - dopo.y;
      if (Math.abs(dx) + Math.abs(dy) > 1) {
        motion(el, [{ transform: `translate(${dx}px,${dy}px)` }, { transform: 'none' }], { fattore: 1.35, leva: LEVA_SUPERFICI, document: doc });
      }
    } else {
      motion(el, [{ opacity: 0, transform: 'translateY(5px)' }, { opacity: 1, transform: 'none' }], { leva: LEVA_SUPERFICI, document: doc });
    }
  }
}

/**
 * Il disegno con il movimento intorno. Tutti i chiamanti passano di qui, come nel mockup passano
 * tutti da `flip(...)`: il movimento non è una cosa che si ricorda di aggiungere caso per caso.
 */
function disegna(schermo, doc, stato) {
  const contenitore = stato.nodi?.risultati || null;
  const dettaglio = stato.nodi?.dettaglio || null;
  const prima = fotografaSchede(contenitore);
  const dettaglioEraAperto = Boolean(dettaglio) && !dettaglio.hidden;
  /* ⛔ Il PRIMA dell'espansione si legge dal DOM, NON da `stato.espanso`: il gestore del pulsante
     ribalta `stato.espanso` e POI chiama `disegna`, quindi qui dentro il «prima» e il «dopo» dello
     stato sono già lo stesso valore e il confronto non scatta mai. Trovato misurando: nel
     laboratorio l'animazione di espansione non compariva in `getAnimations()`, mentre il FLIP sì. */
  const eraEspanso = stato.nodi?.spazio?.dataset?.expanded === 'true';

  disegnaCrudo(schermo, doc, stato);

  flipSchede(doc, contenitore, prima);
  if (!dettaglio) return;
  const dettaglioEAperto = !dettaglio.hidden;
  const oraEspanso = stato.nodi?.spazio?.dataset?.expanded === 'true';
  if (dettaglioEAperto && !dettaglioEraAperto) {
    /* Mockup, `selectItem`: entra da destra, e dura un quarto più di una superficie normale —
       è la colonna più larga che si apre, non un pannellino. */
    motion(dettaglio, [{ opacity: 0, transform: 'translateX(14px)' }, { opacity: 1, transform: 'none' }], { fattore: 1.25, leva: LEVA_SUPERFICI, document: doc });
  } else if (dettaglioEAperto && oraEspanso !== eraEspanso) {
    /* Mockup, `case'expand-detail'`: NON rientra da destra — la colonna c'era già e ha solo
       cambiato larghezza. Un velo di opacità dice «guarda qui», e basta. */
    motion(dettaglio, [{ opacity: 0.65 }, { opacity: 1 }], { leva: LEVA_SUPERFICI, document: doc });
  }
}

/**
 * La chiusura del dettaglio: prima esce, POI sparisce.
 * Mockup, `closeDetail`: l'uscita parte dallo stato CALCOLATO (opacità e trasformazione correnti),
 * non da `1/none` — se una entrata è ancora in volo, ripartire da `1` farebbe un salto.
 */
function chiudiDettaglioConUscita(schermo, doc, stato, dopoAverChiuso, alTermine = () => {}) {
  const dettaglio = stato.nodi?.dettaglio || null;
  const finisci = () => { dopoAverChiuso(); disegna(schermo, doc, stato); alTermine(); };
  if (!dettaglio || dettaglio.hidden) { finisci(); return; }
  let daDove = { opacity: 1, transform: 'none' };
  try {
    const cs = (doc.defaultView || globalThis).getComputedStyle(dettaglio);
    daDove = { opacity: cs.opacity, transform: cs.transform === 'none' ? 'none' : cs.transform };
  } catch { /* si riparte da 1/none: peggio di così è un salto, non un errore */ }
  const a = motion(dettaglio, [daDove, { opacity: 0, transform: 'translateX(10px)' }], { token: 'surface-exit', leva: LEVA_SUPERFICI, document: doc });
  if (!a) { finisci(); return; }
  a.finished.then(finisci, finisci);
}

function disegnaCrudo(schermo, doc, stato) {
  const config = stato.config;
  const tutte = Array.isArray(config.voci) ? config.voci : [];
  const filtrate = filtraVoci(tutte, { query: stato.query, filtro: stato.filtro, filtri: config.filtri, cercaIn: config.cercaIn });
  const visibili = ordinaVoci(filtrate, stato.ordine, { titoloDi: config.titoloDi, quandoDi: config.quandoDi });
  stato.ultimeVisibili = visibili.length;
  const { risultati, filtri: barraFiltri, segmento, statoRiga, aggiorna } = stato.nodi;
  const errore = config.stato?.errore || null;
  const caricamento = Boolean(config.stato?.caricamento);

  /* ⛔ «Aggiorna» esiste solo dove qualcuno ricarica davvero: Note e Progetti non passano
     `onAggiorna`, e un bottone che non fa niente è la stessa promessa vuota dei contatori che
     puntavano a una pagina inesistente. */
  aggiorna.hidden = typeof config.onAggiorna !== 'function';
  aggiorna.disabled = caricamento;
  for (const b of segmento.querySelectorAll('[data-vista]')) b.setAttribute('aria-pressed', String(b.dataset.vista === stato.vista));

  // La riga di stato è quella del prodotto: qui ci passa sopra solo quando non c'è un errore da dire.
  if (statoRiga) {
    /* ⛔ `sommarioStato` esiste perché la stessa quantità non può avere due nomi nella stessa
       schermata: le Note in alto dicono «nessuna nota» (`sommarioNote`), e qui sotto un generico
       «0 note» sarebbe una seconda parola per la stessa cosa — visto nella foto dello stato vuoto. */
    statoRiga.textContent = errore || (caricamento ? config.caricando || 'Carico…'
      : typeof config.sommarioStato === 'function' ? config.sommarioStato(visibili.length, tutte.length)
        : sommarioSezione(visibili.length, tutte.length, config.sostantivo, config.pluraleEsplicito));
    statoRiga.setAttribute('role', errore ? 'alert' : 'status');
  }
  const percorso = schermo.querySelector('.talos-topbar__path');
  if (percorso && config.sommarioBarra) percorso.textContent = config.sommarioBarra(tutte.length, { errore, caricamento });

  // I filtri, coi conteggi veri sull'elenco intero.
  /* ⛔ Un filtro solo non è un filtro: la riga sparisce invece di mostrare un bottone che non
     sceglie niente. (Il mockup ne disegna sempre almeno uno, «Tutte», anche quando è inutile.) */
  barraFiltri.hidden = config.filtri.length <= 1;
  const conteggi = contaPerFiltro(tutte, config.filtri);
  const fuocoFiltro = doc.activeElement?.dataset?.filtro;
  barraFiltri.replaceChildren(...config.filtri.map((f, i) => {
    const b = nodo(doc, 'button', 'td-filter', f.etichetta);
    b.type = 'button';
    b.dataset.filtro = f.id;
    b.setAttribute('aria-pressed', String(stato.filtro === f.id));
    b.append(nodo(doc, 'small', '', String(conteggi[i])));
    return b;
  }));
  if (fuocoFiltro) perId(barraFiltri, '.td-filter', 'filtro', fuocoFiltro)?.focus({ preventScroll: true });

  // Le schede. Il fuoco torna sulla scheda che ce l'aveva: senza, ogni tasto premuto lo perde.
  const fuocoVoce = doc.activeElement?.closest?.('.td-card')?.dataset?.item;
  if (!visibili.length) {
    risultati.replaceChildren(disegnaVuoto(doc, stato, tutte.length));
  } else {
    const contenitore = nodo(doc, 'div', stato.vista === 'elenco' ? 'td-list' : 'td-grid');
    for (const voce of visibili) contenitore.append(disegnaScheda(doc, stato, voce));
    risultati.replaceChildren(contenitore);
  }
  if (fuocoVoce) perId(risultati, '.td-card', 'item', fuocoVoce)?.querySelector('.td-card-open')?.focus({ preventScroll: true });

  // Il dettaglio: se la voce scelta non c'è più (eliminata, o filtrata via dai dati veri) si chiude.
  const scelta = tutte.find((v) => String(config.idDi(v)) === String(stato.selezione));
  if (!scelta) stato.selezione = null;
  stato.nodi.spazio.dataset.detail = String(Boolean(scelta));
  stato.nodi.spazio.dataset.expanded = String(Boolean(scelta) && stato.espanso);
  stato.nodi.dettaglio.hidden = !scelta;
  stato.nodi.divisorio.hidden = !scelta || stato.espanso;
  if (scelta) disegnaDettaglio(schermo, doc, stato, scelta);
}

function disegnaVuoto(doc, stato, quanteInTutto) {
  const config = stato.config;
  const filtrando = Boolean(stato.query) || stato.filtro !== (config.filtri?.[0]?.id || 'tutte');
  const box = nodo(doc, 'div', 'td-empty');
  const arte = nodo(doc, 'div', 'td-empty-art');
  arte.append(disegnoVuoto(doc, config.icona));
  const titolo = nodo(doc, 'h3', '', filtrando ? 'Nessun risultato' : (config.vuoto?.titolo || 'Niente qui'));
  const testo = nodo(doc, 'p', '', filtrando
    ? 'Prova un’altra parola o togli il filtro. Quello che hai è ancora qui.'
    : (config.stato?.errore || config.vuoto?.testo || ''));
  box.append(arte, titolo, testo);
  if (filtrando) {
    const pulisci = nodo(doc, 'button', 'talos-button talos-button--secondary talos-button--sm', 'Togli i filtri');
    pulisci.type = 'button';
    pulisci.addEventListener('click', () => {
      stato.query = '';
      stato.filtro = config.filtri?.[0]?.id || 'tutte';
      stato.nodi.cerca.value = '';
      disegna(stato.schermo, doc, stato);
      stato.nodi.cerca.focus({ preventScroll: true });
    });
    box.append(pulisci);
  } else if (quanteInTutto === 0 && config.vuoto?.azione) {
    box.append(config.vuoto.azione(doc));
  }
  return box;
}

function disegnaScheda(doc, stato, voce) {
  const config = stato.config;
  const id = String(config.idDi(voce) ?? '');
  const scheda = nodo(doc, 'article', `td-card ${config.famiglia || ''}`.trim());
  scheda.dataset.item = id;
  scheda.dataset.selected = String(String(stato.selezione) === id);
  const pezzi = config.scheda(voce, { doc, icona: (n, c) => icona(doc, n, c), etichetta: (t, tono) => etichetta(doc, t, tono) }) || {};
  if (pezzi.dati) for (const [k, v] of Object.entries(pezzi.dati)) scheda.dataset[k] = String(v);

  const apri = nodo(doc, 'button', 'td-card-open');
  apri.type = 'button';
  const titolo = String(config.titoloDi(voce) ?? '');
  apri.setAttribute('aria-label', `Apri ${titolo}`);
  const alto = nodo(doc, 'div', 'td-card-top');
  alto.append(...[pezzi.alto].flat().filter(Boolean));
  const h3 = nodo(doc, 'h3', '', titolo);
  const basso = nodo(doc, 'div', 'td-card-bottom');
  basso.append(...[pezzi.basso].flat().filter(Boolean));
  apri.append(alto, h3, ...[pezzi.corpo].flat().filter(Boolean), basso);
  apri.addEventListener('click', () => {
    /* Ripremere la scheda già aperta CHIUDE il dettaglio: chiudere è un'uscita, e le uscite si
       vedono (mockup, `closeDetail`) — sparire di colpo è l'unico modo per non far capire che
       cosa è successo. */
    if (String(stato.selezione) === id) {
      chiudiDettaglioConUscita(stato.schermo, doc, stato, () => { stato.selezione = null; stato.espanso = false; });
      return;
    }
    stato.selezione = id;
    disegna(stato.schermo, doc, stato);
  });
  scheda.append(apri);
  if (pezzi.adorno) scheda.append(pezzi.adorno);
  return scheda;
}

function disegnaDettaglio(schermo, doc, stato, voce) {
  const config = stato.config;
  const { dettaglio } = stato.nodi;
  const testa = nodo(doc, 'div', 'td-detail-head');
  testa.append(nodo(doc, 'span', 'td-subtle', `${config.nome} / Dettaglio`));

  const espandi = nodo(doc, 'button', 'talos-button talos-button--secondary talos-icon-button');
  espandi.type = 'button';
  espandi.setAttribute('aria-label', stato.espanso ? 'Affianca all’elenco' : 'Espandi il dettaglio');
  espandi.setAttribute('aria-pressed', String(stato.espanso));
  espandi.append(icona(doc, stato.espanso ? 'layout' : 'grid'));
  espandi.addEventListener('click', () => { stato.espanso = !stato.espanso; disegna(schermo, doc, stato); });

  const chiudi = nodo(doc, 'button', 'talos-button talos-button--secondary talos-icon-button');
  chiudi.type = 'button';
  chiudi.setAttribute('aria-label', 'Chiudi il dettaglio');
  chiudi.append(icona(doc, 'x'));
  chiudi.addEventListener('click', () => {
    const id = String(config.idDi(voce) ?? '');
    chiudiDettaglioConUscita(
      schermo, doc, stato,
      () => { stato.selezione = null; stato.espanso = false; },
      // Il fuoco torna sulla scheda da cui il dettaglio era partito, non in cima alla pagina.
      // ⛔ DOPO il ridisegno, non prima: la scheda a cui tornare la ricrea `disegna`.
      () => perId(stato.nodi.risultati, '.td-card', 'item', id)?.querySelector('.td-card-open')?.focus({ preventScroll: true }),
    );
  });
  testa.append(espandi, chiudi);

  const corpo = nodo(doc, 'div', 'td-detail-body');
  corpo.append(...[config.dettaglio(voce, { doc, icona: (n, c) => icona(doc, n, c), etichetta: (t, tono) => etichetta(doc, t, tono) })].flat().filter(Boolean));

  const piede = nodo(doc, 'div', 'td-detail-footer');
  const azioni = config.azioniDettaglio ? [config.azioniDettaglio(voce, { doc })].flat().filter(Boolean) : [];
  piede.append(...azioni);
  if (config.notaPiede) piede.append(nodo(doc, 'span', 'td-save-status', config.notaPiede(voce)));

  dettaglio.replaceChildren(testa, corpo, ...(azioni.length || config.notaPiede ? [piede] : []));
}
