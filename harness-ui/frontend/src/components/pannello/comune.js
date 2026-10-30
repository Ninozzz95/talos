/*
 * PANNELLO DI DESTRA v2 — la grammatica comune delle cinque schede (Contesto · File · Git · Agenti · Processi).
 *
 * Owner 29/10/2026: «rifinisci, molto più interattivo, implementabile nel modo più facile possibile, plug and play».
 * Questo modulo è il pezzo che tutte e cinque le schede usano, così parlano la stessa lingua:
 *   · la TESTA appiccicata: «quando · titolo · conto con "da guardare"», le icone a destra, la ricerca a richiesta, l'ambito;
 *   · le SEZIONI col loro conto, «Richiede attenzione» sempre per prima;
 *   · la RIGA: segno di stato · nome · una riga di perché · misura a lato · «⋯» (e tasto destro), che si apre sul posto;
 *   · la PIEGA tratteggiata per ciò che resta chiuso (richieste passate, indice dei giri, tutto il progetto);
 *   · l'AMBITO a segmenti che diventa un menu quando la colonna è stretta (Hermes `review/scope-row.tsx:15-18`);
 *   · la TASTIERA: frecce, Invio, Spazio, Esc, Home/Fine, Maiusc+F10 (ruoli e tabindex «a rotazione», ARIA APG «Grid/Listbox»);
 *   · la RIGA DI CONFERMA e la RIGA DELL'ESITO dopo un'azione (mai un avviso che sparisce senza lasciare traccia nella riga);
 *   · l'OROLOGIO dei secondi, che gira SOLO a scheda visibile (Hermes `useViewedInterval`, `document.hidden`).
 *
 * ⛔ Niente fetch, niente variabili globali: lo stato dell'interfaccia (righe aperte, ambito, ricerca, fuoco, esiti) vive SUL
 *   CONTENITORE (`contenitore.__pannello`), come fa già `schedaDi` in `inspector.js:578` per i Processi. Ridisegnare è sicuro:
 *   scorrimento, fuoco e testo della ricerca sopravvivono.
 * ⛔ I menu non li disegna questo modulo: li apre l'app con il SUO menu (`azioni.apriMenu(voci, posizionamento)` =
 *   `apriMenuAzioniLibreria`, `legacy/app.js:21359`; voci `{chiave, etichetta, icona, aziona, pericolo, separaPrima}`).
 */
import { t, linguaCorrenteDiT } from '../lingua.js';
import { durataBreveRigaViva } from '../durata-breve.js';
import { dividiLoSpazio, intervallo, paginaCheContiene, leggiPieghe, salvaPieghe, livelloContiSchede, LIVELLI_CONTI } from './pagine.js';

const SVG_NS = 'http://www.w3.org/2000/svg';

/* ───────────────────────────── DOM minimo ───────────────────────────── */

/** Un elemento con classe e testo (mai innerHTML: ogni testo che arriva dai dati passa da `textContent`). */
export function el(d, tag, classe, testo) {
  const n = d.createElement(tag);
  if (classe) n.className = classe;
  if (testo != null && testo !== '') n.textContent = String(testo);
  return n;
}

/** Un'icona dello sprite dell'app (`index.template.html`, `<symbol id="i-…">`): lo stesso vocabolario di tutto il prodotto. */
export function icona(d, id, classe = 'i') {
  const svg = d.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('class', classe);
  svg.setAttribute('aria-hidden', 'true');
  const use = d.createElementNS(SVG_NS, 'use');
  use.setAttribute('href', `#${id}`);
  svg.append(use);
  return svg;
}

/** Un pulsante dell'app (`talos-button`). `disattivo` = il MOTIVO: un'azione che non si può fare dice perché, non sparisce. */
export function bottone(d, { etichetta, fai, variante = 'primary', icona: ic = null, disattivo = null, piccolo = true, chiave = null }) {
  const b = el(d, 'button', `talos-button talos-button--${variante}${piccolo ? ' talos-button--sm' : ''} pn-bottone`);
  b.type = 'button';
  if (ic) b.append(icona(d, ic));
  b.append(el(d, 'span', '', etichetta));
  if (chiave) b.dataset.controllo = chiave;
  if (disattivo) {
    b.disabled = true;
    b.title = disattivo;
  } else if (typeof fai === 'function') {
    b.addEventListener('click', (e) => { e.stopPropagation(); fai(e); });
  }
  return b;
}

/** Un pulsante a icona (28×28), sempre con l'etichetta per chi non vede l'icona. */
export function bottoneIcona(d, { id, etichetta, fai, premuto = null, chiave = null, haMenu = false }) {
  const b = el(d, 'button', 'pn-ib');
  b.type = 'button';
  b.setAttribute('aria-label', etichetta);
  b.title = etichetta;
  if (premuto !== null) b.setAttribute('aria-pressed', String(premuto));
  if (haMenu) b.setAttribute('aria-haspopup', 'menu');
  if (chiave) b.dataset.controllo = chiave;
  b.append(icona(d, id));
  b.addEventListener('click', (e) => { e.stopPropagation(); fai?.(e, b); });
  return b;
}

/* ───────────────────────────── numeri e tempi ───────────────────────────── */

/** «41,2k», «200k»: lo stesso formato di `kilo` (`inspector.js:46`), nella lingua dei numeri dell'app. */
export function kilo(n, locale) {
  const v = Number(n);
  if (!Number.isFinite(v) || v < 0) return '—';
  if (v < 1000) return String(Math.round(v));
  return `${new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(v / 1000)}k`;
}

/**
 * Un conto nella lingua dell'interfaccia, raggruppato SEMPRE: «4.999» in italiano, «4,999» in inglese. Decisione owner 23/09/2026
 * (R4-COUNT-LOCALE-5000, la scheda Agenti di prima lo faceva): in italiano `Intl.NumberFormat` di serie NON raggruppa le quattro
 * cifre (CLDR, minimo due cifre di raggruppamento), quindi `useGrouping: 'always'` (ECMA-402 NumberFormat v3), come
 * `grafo/comuni.js:158` e `controlli-run.js:16`.
 */
const FORMATI_CONTO = new Map();
export function cifra(n) {
  if (!Number.isFinite(n)) return String(n ?? '');
  const locale = linguaCorrenteDiT() === 'en' ? 'en-US' : 'it-IT'; // la lingua dei testi (`lingua.js`), come `controlli-run.js:16`
  if (!FORMATI_CONTO.has(locale)) FORMATI_CONTO.set(locale, new Intl.NumberFormat(locale, { useGrouping: 'always', maximumFractionDigits: 0 }));
  return FORMATI_CONTO.get(locale).format(n);
}

/** La durata viva nella stessa forma della riga viva della chat (`durata-breve.js`, owner 27/10). */
export function durata(ms) {
  return Number.isFinite(ms) && ms >= 0 ? durataBreveRigaViva(Math.floor(ms)) : '';
}

/** L'ora breve «14:41». */
export function oraBreve(ms, locale) {
  return Number.isFinite(ms) ? new Date(ms).toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' }) : '';
}

/** «12 min fa», «2 h fa», «ora». */
export function tempoFa(ms, adesso) {
  if (!Number.isFinite(ms)) return '';
  const s = Math.max(0, Math.round((adesso - ms) / 1000));
  if (s < 45) return t('pannello.tempo.ora');
  if (s < 3600) return t('pannello.tempo.minutiFa', { n: Math.round(s / 60) });
  if (s < 86_400) return t('pannello.tempo.oreFa', { n: Math.round(s / 3600) });
  return t('pannello.tempo.giorniFa', { n: Math.round(s / 86_400) });
}

/** Il percorso diviso in nome e cartella: il nome si legge, la cartella si attenua (e si tronca per prima). */
export function nomeECartella(percorso) {
  const p = String(percorso ?? '');
  const i = p.replace(/\/$/u, '').lastIndexOf('/');
  return i < 0 ? { nome: p, cartella: '' } : { nome: p.slice(i + 1), cartella: p.slice(0, i + 1) };
}

/* ───────────────────────────── lo stato dell'interfaccia sul contenitore ───────────────────────────── */

/**
 * Lo stato dell'interfaccia di UNA scheda, creato la prima volta. Non sono dati del server: sono le scelte della persona
 * (che cosa ha aperto, che cosa cerca, dove sta il fuoco), e devono sopravvivere a ogni ridisegno.
 */
export function statoUi(contenitore) {
  if (!contenitore.__pannello) {
    contenitore.__pannello = {
      aperte: new Set(), // righe aperte (dettaglio sul posto)
      piegheAperte: new Set(), // pieghe tratteggiate aperte
      ambito: null, // la scelta del controllo a segmenti
      filtro: 'tutti',
      cerca: { aperta: false, testo: '' },
      fuoco: null, // la chiave della riga che ha il tabindex 0
      esiti: new Map(), // chiave → { stato: 'in-corso'|'ok'|'errore', testo }
      conferme: new Map(), // chiave → { domanda, conseguenza, etichetta, fai }
      bozze: new Map(), // chiave → testo (un messaggio di commit che si sta scrivendo)
      righe: new Map(), // chiave → { nodo, apri, menu, primaria } — rifatta a ogni disegno
      dati: null,
      azioni: {},
      ridisegna: () => {},
      programmato: 0,
      contenitore,
      /* ⭐ 29/10 sera — pagine e pieghe (owner: «tutto paginabile e comprimibile, e ogni scheda sta nello schermo») */
      scheda: contenitore.dataset.scheda || contenitore.id || 'pannello',
      chiuse: new Set(), // sezioni chiuse dalla persona (nascono aperte)
      pagine: new Map(), // chiave della sezione → pagina mostrata (da 0)
      dimensioni: new Map(), // chiave → righe per pagina, CALCOLATE dallo spazio (`adattaAlloSpazio`)
      liste: new Map(), // chiave → { chiavi, dimensione, pagina } dell'ultimo disegno (tastiera fra le pagine)
      firme: new Map(), // chiave → ricerca/filtro/ambito con cui la pagina è stata scelta (cambiano ⇒ si torna alla prima)
      seguiFuoco: false, // la tastiera ha chiesto una riga di un'altra pagina: la pagina segue il fuoco
      margineExtra: 0,
      compatte: new Set(), // sezioni ripiegate DA SOLE perché lo spazio non basta (non si ricordano: tornano aperte quando c'è posto)
      preferita: null, // l'ultima sezione che la persona ha aperto: non si ripiega da sola
    };
    const ricordate = leggiPieghe(storageDi(contenitore), contenitore.__pannello.scheda);
    contenitore.__pannello.chiuse = ricordate.chiuse;
    for (const k of ricordate.aperte) contenitore.__pannello.piegheAperte.add(k);
    montaUnaVolta(contenitore);
  }
  return contenitore.__pannello;
}

/**
 * Ridisegna la scheda SENZA perdere ciò che la persona stava facendo: scorrimento, fuoco (riga, pulsante o campo di ricerca
 * con il cursore), righe aperte. ⛔ Sotto un menu aperto non si ridisegna (l'àncora sparirebbe): si riprova fra poco — è la
 * stessa regola della scheda Git (`programmaSchedaGithub`, C34 R2).
 */
export function disegnaScheda(contenitore, costruisci, { interno = false } = {}) {
  const d = contenitore.ownerDocument;
  const ui = statoUi(contenitore);
  /* ⛔ Un ridisegno NATO DENTRO la scheda (un fotogramma dopo una ricerca, l'attesa sotto un menu, lo spazio cambiato) non tocca un
     contenitore che nel frattempo è passato a un altro: con un Workflow `#railAgenti` è del rail v2 (`montaSelettoreRail`, D30), e un
     ridisegno in ritardo lo cancellava. Ridisegna di nuovo solo chi chiama da fuori (l'app), quando la scheda torna sua. */
  if (interno && ui.radice && ui.radice.parentNode !== contenitore) return;
  /* qualunque menu aperto (il fuoco è nel menu, non nella scheda): si aspetta che si chiuda */
  /* …e nemmeno mentre la persona rinomina un file in riga (F2): il campo sparirebbe sotto le dita */
  if (d.querySelector('.ft-actions-menu') || contenitore.querySelector('.ft-rename')) {
    clearTimeout(ui.rinvio);
    ui.rinvio = setTimeout(() => ui.ridisegna(), 400);
    return;
  }
  const attivo = d.activeElement && contenitore.contains(d.activeElement) ? d.activeElement : null;
  const fuoco = attivo ? {
    riga: attivo.closest('[data-chiave]')?.dataset.chiave ?? null,
    controllo: attivo.dataset.controllo ?? null,
    selezione: typeof attivo.selectionStart === 'number' ? [attivo.selectionStart, attivo.selectionEnd] : null,
    eRiga: attivo.classList.contains('pn-riga') || attivo.classList.contains('ft-row'),
  } : null;
  const scorrimento = contenitore.scrollTop;
  /* ⭐ 29/10 sera: si disegna, si misura, e se le pagine non riempiono (o sbordano) si ridisegna con le misure vere. Al più
     dieci giri (`for (let giro = 0; giro < 10`): le altezze delle righe si conoscono solo dopo averle disegnate. */
  for (let giro = 0; giro < 10; giro += 1) {
    ui.righe = new Map();
    ui.liste = new Map();
    const radice = el(d, 'div', 'talos-pannello');
    radice.append(...costruisci(d, ui).filter(Boolean));
    contenitore.replaceChildren(radice);
    ui.radice = radice;
    ui.giriUltimoDisegno = giro + 1; // quanti giri è costato (prova PNAG-GIRI: mai più di dieci, anche quando non converge)
    if (!adattaAlloSpazio(contenitore, ui)) break;
  }
  osservaSpazio(contenitore, ui);
  rotazione(contenitore, ui);
  contenitore.scrollTop = scorrimento;
  if (ui.seguiFuoco && ui.fuoco) {
    ui.seguiFuoco = false;
    const x = contenitore.querySelector(`[data-chiave="${CSS.escape(ui.fuoco)}"]`);
    if (x) { for (const r of contenitore.querySelectorAll('[data-pagina]')) if (r.tabIndex === 0) r.tabIndex = -1; x.tabIndex = 0; x.focus({ preventScroll: true }); aggiornaOrologio(contenitore); return; }
  }
  ui.seguiFuoco = false;
  if (fuoco) {
    let bersaglio = null;
    const riga = fuoco.riga ? contenitore.querySelector(`[data-chiave="${CSS.escape(fuoco.riga)}"]`) : null;
    if (fuoco.controllo) bersaglio = (riga ?? contenitore).querySelector(`[data-controllo="${CSS.escape(fuoco.controllo)}"]`);
    if (!bersaglio && fuoco.eRiga) bersaglio = riga;
    if (bersaglio) {
      bersaglio.focus({ preventScroll: true });
      if (fuoco.selezione && typeof bersaglio.setSelectionRange === 'function') bersaglio.setSelectionRange(...fuoco.selezione);
    }
  }
  aggiornaOrologio(contenitore);
}

/** Un ridisegno per fotogramma al massimo (come `aggiornaInspectorDaStato`, `legacy/app.js:12902`). */
export function programmaRidisegno(ui) {
  if (ui.programmato) return;
  const raf = globalThis.requestAnimationFrame ?? ((f) => setTimeout(f, 16));
  ui.programmato = raf(() => { ui.programmato = 0; ui.ridisegna(); });
}

/* ───────────────────────────── esiti e conferme nella riga ───────────────────────────── */

/**
 * Esegue un'azione dell'app e ne scrive l'esito NELLA RIGA: «in corso», poi «fatto» o l'errore con le parole del server.
 * Le azioni dell'app tornano `{ ok, messaggio }` (`fermaProcesso`, `legacy/app.js:6846`) oppure lanciano: valgono tutte e due.
 */
export async function eseguiNellaRiga(ui, chiave, fai, { inCorso, fatto, tieni = 3500 }) {
  /* ⛔ la mappa degli esiti è quella della sessione in cui l'azione è PARTITA: una risposta che torna dopo un cambio di sessione
     non scrive nella sessione nuova (`perSessione` ne crea una nuova) */
  const esiti = ui.esiti;
  esiti.set(chiave, { stato: 'in-corso', testo: inCorso });
  ui.conferme.delete(chiave);
  programmaRidisegno(ui);
  let esito;
  try {
    const r = await fai();
    esito = r && r.ok === false ? { stato: 'errore', testo: r.messaggio || t('pannello.esito.nonRiuscito') } : { stato: 'ok', testo: typeof fatto === 'function' ? fatto(r) : fatto };
  } catch (errore) {
    esito = { stato: 'errore', testo: errore?.message || t('pannello.esito.nonRiuscito') };
  }
  esiti.set(chiave, esito);
  if (esiti === ui.esiti) programmaRidisegno(ui);
  if (esito.stato === 'ok') setTimeout(() => { if (esiti.get(chiave) === esito) { esiti.delete(chiave); if (esiti === ui.esiti) programmaRidisegno(ui); } }, tieni);
  return esito;
}

/**
 * ⛔ Lo stato dell'interfaccia vive sul contenitore della scheda, che è lo STESSO per tutte le sessioni: al cambio di sessione si
 * ricomincia (righe aperte, conferme, esiti, ricerca, filtri, pagine, fuoco). Restano solo le pieghe, che sono una scelta della
 * persona sulla scheda e non sulla conversazione (owner 29/10: «si ricordano»). `sessione` = l'id della conversazione a schermo.
 */
export function perSessione(ui, sessione) {
  if (sessione === undefined || ui.sessione === sessione) return;
  const prima = ui.sessione !== undefined;
  ui.sessione = sessione;
  if (!prima) return;
  ui.aperte = new Set();
  ui.esiti = new Map();
  ui.conferme = new Map();
  ui.bozze = new Map();
  ui.cerca = { aperta: false, testo: '' };
  ui.filtro = 'tutti';
  ui.filtroStato = null;
  ui.ambito = null;
  ui.fuoco = null;
  ui.pagine = new Map();
  ui.firme = new Map();
  ui.compatte?.clear();
  ui.margineExtra = 0;
  ui.preferita = null;
}

/** Chiede conferma NELLA RIGA (per ciò che non si rifà): domanda, conseguenza, «Conferma» rosso e «Annulla». */
export function chiediConferma(ui, chiave, conferma) {
  ui.conferme.set(chiave, conferma);
  ui.aperte.add(chiave);
  ui.fuoco = chiave;
  programmaRidisegno(ui);
}

/* ───────────────────────────── i pezzi della grammatica ───────────────────────────── */

/**
 * La testa appiccicata di ogni scheda.
 * @param {object} p
 * @param {string} p.quando la riga piccola sopra il titolo («Questa richiesta · 14:41»)
 * @param {string|Node} p.titolo
 * @param {Array<string|{testo:string, tono?:string}>} p.conto i pezzi del conto, uniti da « · »; `tono:'avviso'` = «da guardare»
 * @param {Node[]} [p.azioni] i pulsanti a destra del titolo (al più due, regola 10/09: il resto nel «⋯»)
 * @param {Array} [p.menu] le voci del «⋯» della testa
 * @param {{segnaposto:string, filtri?:Node}} [p.cerca] la ricerca a richiesta
 * @param {{voci:{id:string, etichetta:string}[], etichetta:string}} [p.ambito] il controllo a segmenti
 * @param {Node} [p.sotto] un blocco sotto il conto (il compositore del commit)
 */
export function testa(d, ui, { quando, titolo, conto = [], azioni = [], menu = null, cerca = null, ambito = null, sotto = null }) {
  const h = el(d, 'header', 'pn-testa');
  const riga1 = el(d, 'div', 'pn-testa__riga');
  const blocco = el(d, 'div', 'pn-testa__titolo');
  if (quando) blocco.append(typeof quando === 'string' ? el(d, 'span', 'pn-quando', quando) : quando);
  const grande = el(d, 'div', 'pn-grande');
  grande.append(typeof titolo === 'string' ? d.createTextNode(titolo) : titolo);
  blocco.append(grande);
  riga1.append(blocco, ...azioni);
  if (cerca) {
    riga1.append(bottoneIcona(d, {
      id: 'i-search', etichetta: cerca.etichetta ?? t('pannello.testa.cerca'), premuto: ui.cerca.aperta, chiave: 'apri-cerca',
      fai: () => { ui.cerca.aperta = !ui.cerca.aperta; if (!ui.cerca.aperta) { ui.cerca.testo = ''; ui.filtro = 'tutti'; } ui.fuocoCerca = ui.cerca.aperta; ui.ridisegna(); },
    }));
  }
  if (menu?.length && ui.azioni.apriMenu) {
    riga1.append(bottoneIcona(d, { id: 'i-more', etichetta: t('pannello.testa.altreAzioni'), haMenu: true, chiave: 'menu-testa', fai: (e, b) => ui.azioni.apriMenu(menu, { ancoraEl: b }) }));
  }
  h.append(riga1);
  if (conto.length) {
    const c = el(d, 'div', 'pn-conto');
    conto.filter(Boolean).forEach((pezzo, i) => {
      if (i) c.append(d.createTextNode(' · '));
      if (typeof pezzo === 'string') c.append(d.createTextNode(pezzo));
      else if (pezzo instanceof d.defaultView.Node) c.append(pezzo);
      else c.append(el(d, pezzo.tono === 'avviso' ? 'b' : 'span', pezzo.tono ? `pn-tono-${pezzo.tono}` : '', pezzo.testo));
    });
    h.append(c);
  }
  if (sotto) h.append(sotto);
  if (ambito) h.append(segmenti(d, ui, ambito));
  if (cerca && ui.cerca.aperta) {
    const box = el(d, 'div', 'pn-cerca');
    const campo = el(d, 'input', 'pn-cerca__campo');
    campo.type = 'search';
    campo.placeholder = cerca.segnaposto;
    campo.setAttribute('aria-label', cerca.segnaposto);
    campo.value = ui.cerca.testo;
    campo.dataset.controllo = 'campo-cerca';
    campo.addEventListener('input', () => { ui.cerca.testo = campo.value; programmaRidisegno(ui); });
    campo.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') { e.stopPropagation(); ui.cerca = { aperta: false, testo: '' }; ui.filtro = 'tutti'; ui.ridisegna(); ui.contenitore.querySelector('[data-controllo="apri-cerca"]')?.focus(); }
      if (e.key === 'ArrowDown') { e.preventDefault(); ui.fuoco = null; ui.contenitore.querySelector('.pn-riga')?.focus(); }
    });
    box.append(campo);
    if (cerca.filtri) box.append(cerca.filtri);
    if (cerca.conto) box.append(el(d, 'span', 'pn-mono pn-cerca__conto', cerca.conto));
    h.append(box);
    /* il fuoco va al campo VIVO dopo il disegno: la scheda può ridisegnarsi più volte per adattarsi allo spazio */
    if (ui.fuocoCerca) queueMicrotask(() => { if (!ui.fuocoCerca) return; ui.fuocoCerca = false; ui.contenitore.querySelector('[data-controllo="campo-cerca"]')?.focus(); });
  }
  return h;
}

/**
 * Il controllo a segmenti dell'ambito. Disegna sia i segmenti sia il menu: il CSS sceglie quale mostrare con una container
 * query (`.talos-pannello` è `container-type: inline-size`), così niente si tronca e niente misura in JavaScript.
 */
export function segmenti(d, ui, { voci, etichetta, scelto = ui.ambito ?? voci[0]?.id, onScegli = null }) {
  const scegli = (id) => { ui.ambito = id; ui.fuoco = null; onScegli?.(id); ui.ridisegna(); };
  const box = el(d, 'div', 'pn-ambito');
  const gruppo = el(d, 'div', 'pn-ambito__segmenti');
  gruppo.setAttribute('role', 'group');
  gruppo.setAttribute('aria-label', etichetta);
  for (const v of voci) {
    const b = el(d, 'button', '', v.etichetta);
    b.type = 'button';
    b.dataset.controllo = `ambito-${v.id}`;
    b.setAttribute('aria-pressed', String(v.id === scelto));
    if (v.conto != null) b.append(el(d, 'span', 'pn-mono', ` ${v.conto}`));
    b.addEventListener('click', (e) => { e.stopPropagation(); scegli(v.id); });
    gruppo.append(b);
  }
  const corrente = voci.find((v) => v.id === scelto) ?? voci[0];
  const menu = el(d, 'button', 'pn-ambito__menu');
  menu.type = 'button';
  menu.dataset.controllo = 'ambito-menu';
  menu.setAttribute('aria-haspopup', 'menu');
  menu.setAttribute('aria-label', `${etichetta}: ${corrente?.etichetta ?? ''}`);
  menu.append(el(d, 'span', '', corrente?.etichetta ?? ''), icona(d, 'i-chev'));
  menu.addEventListener('click', (e) => {
    e.stopPropagation();
    ui.azioni.apriMenu?.(voci.map((v) => ({ chiave: v.id, etichetta: v.etichetta, icona: v.id === scelto ? 'i-check' : 'i-minus', aziona: () => scegli(v.id) })), { ancoraEl: menu });
  });
  box.append(gruppo, menu);
  return box;
}

/** Una sezione col suo titolo e il suo conto. `attenzione` = il blocco ambra in cima; `spina` = il filo che lega i segni. */
export function sezione(d, { chiave, titolo, conto = null, attenzione = false, spina = false, azione = null, ui = null }, contenuto) {
  if (!contenuto?.length) return null;
  const s = el(d, 'section', `pn-sezione${attenzione ? ' pn-sezione--attenzione' : ''}`);
  if (spina) s.dataset.spina = '';
  s.dataset.sezione = chiave;
  const h = el(d, 'h3', 'pn-sezione__titolo');
  /* ⭐ 29/10 sera: il titolo è la PIEGA della sezione, col pulsante delle card del Contesto (`talos-inspector-card__comprimi`) */
  const compatta = ui ? ui.compatte.has(chiave) && !ui.chiuse.has(chiave) : false;
  const chiusa = ui ? ui.chiuse.has(chiave) || compatta : false;
  if (ui) {
    const b = el(d, 'button', 'talos-inspector-card__comprimi pn-sezione__comprimi');
    b.type = 'button';
    b.dataset.controllo = `piega-sezione-${chiave}`;
    b.setAttribute('aria-expanded', String(!chiusa));
    b.append(icona(d, 'i-chevron-right'), el(d, 'span', 'pn-tronca', titolo));
    if (conto != null) b.append(el(d, 'span', 'pn-mono', typeof conto === 'number' ? cifra(conto) : String(conto)));
    if (compatta) { b.title = t('pannello.comune.ripiegataPerSpazio'); s.dataset.compatta = ''; }
    b.addEventListener('click', (e) => {
      e.stopPropagation();
      if (compatta) { ui.compatte.delete(chiave); ui.preferita = chiave; } // la apri tu: si ripiegano le altre, non lei
      else if (ui.chiuse.has(chiave)) { ui.chiuse.delete(chiave); ui.preferita = chiave; } else ui.chiuse.add(chiave);
      ricordaPieghe(ui);
      ui.ridisegna();
    });
    h.append(b);
  } else {
    h.append(el(d, 'span', '', titolo));
    if (conto != null) h.append(el(d, 'span', 'pn-mono', typeof conto === 'number' ? cifra(conto) : String(conto)));
  }
  if (azione) h.append(azione);
  s.append(h);
  if (chiusa) { s.dataset.chiusa = ''; return s; }
  const elenco = el(d, 'div', 'pn-elenco');
  elenco.setAttribute('role', 'list');
  if (ui) {
    const { nodi, barra } = elencoPaginato(d, ui, { chiave, titolo, voci: contenuto });
    elenco.append(...nodi);
    s.append(elenco);
    if (barra) s.append(barra);
  } else {
    elenco.append(...contenuto);
    s.append(elenco);
  }
  return s;
}

/* ───────────────────────────── pagine (⭐ 29/10 sera) ───────────────────────────── */

const RIGHE_PRIMA_DELLA_MISURA = 8;

/**
 * Un elenco a pagine: tiene SOLO le voci della pagina mostrata e la barra «Precedente · 1–8 di 30 · Successiva» se servono più
 * pagine. `voci`: nodi (con `data-chiave`) o funzioni che li costruiscono. La dimensione della pagina la decide lo spazio
 * (`adattaAlloSpazio`); la ricerca e i filtri lavorano PRIMA, su tutte le voci: una voce trovata a pagina 3 c'è.
 */
export function elencoPaginato(d, ui, { chiave, titolo, voci }) {
  const nodi = voci.map((v) => (typeof v === 'function' ? v() : v)).filter(Boolean);
  const w = finestraPaginata(ui, chiave, nodi.map((n) => n.dataset?.chiave ?? null));
  const mostrati = nodi.slice(w.inizio, w.fine);
  for (const n of mostrati) n.dataset.pagina = chiave;
  return { nodi: mostrati, barra: w.ultima > 0 ? barraPagine(d, ui, chiave, titolo, w) : null };
}

/**
 * La finestra di un elenco di `chiavi`: quale pagina, da dove a dove. Registra l'elenco per la misura e per la tastiera. Si usa
 * anche dove i nodi restano TUTTI al loro posto e si nascondono quelli fuori pagina (l'albero dei file, i gruppi di Git).
 * ⛔ Cambiano la ricerca, il filtro o l'ambito ⇒ si torna alla prima pagina (una voce trovata non resta a pagina 3 di un elenco
 *   che non c'è più); la tastiera che chiede una riga di un'altra pagina ⇒ la pagina segue il fuoco.
 */
export function finestraPaginata(ui, chiave, chiavi) {
  const dimensione = ui.dimensioni.get(chiave) ?? RIGHE_PRIMA_DELLA_MISURA;
  const firma = `${ui.cerca?.testo ?? ''}|${ui.filtro ?? ''}|${ui.ambito ?? ''}`;
  if (ui.firme.get(chiave) !== firma) { ui.firme.set(chiave, firma); ui.pagine.set(chiave, 0); }
  let pagina = ui.pagine.get(chiave) ?? 0;
  /* la pagina segue il fuoco quando la tastiera lo chiede, e sempre per la riga APERTA: aprirne il dettaglio stringe le pagine, e
     la riga aperta non deve finire sulla pagina dopo, sotto le dita (prova SIDEBAR-DESTRA-MOCKUP, 29/10) */
  if (ui.fuoco && (ui.seguiFuoco || ui.aperte?.has(ui.fuoco))) { const p = paginaCheContiene(chiavi, ui.fuoco, dimensione); if (p !== null) pagina = p; }
  const w = intervallo(pagina, dimensione, chiavi.length);
  ui.pagine.set(chiave, w.pagina);
  ui.liste.set(chiave, { chiavi, dimensione, pagina: w.pagina, totale: chiavi.length, ultima: w.ultima });
  return w;
}

/**
 * La barra delle pagine: è il markup della scheda Agenti di OGGI (`inspector.js:1530-1533`): `nav.talos-agenti-pagine`,
 * «Precedente» e «Successiva» ghost piccoli, «1–8 di 30» in `talos-mono`. Le parole sono le stesse
 * (`agenti.delegations.previous/next/pageRange`, `processi.agents.previousPage/nextPage`).
 */
export function barraPagine(d, ui, chiave, titolo, w) {
  const nav = el(d, 'nav', 'talos-agenti-pagine pn-pagine');
  nav.dataset.pager = chiave;
  nav.setAttribute('aria-label', t('pannello.comune.pagineDi', { titolo }));
  const vai = (delta, controllo) => { ui.fuoco = null; ui.seguiFuoco = false; ui.pagine.set(chiave, w.pagina + delta); ui.ridisegna(); ui.contenitore.querySelector(`[data-controllo="${controllo}"]`)?.focus({ preventScroll: true }); };
  const precedente = el(d, 'button', 'talos-button talos-button--ghost talos-button--sm', t('agenti.delegations.previous'));
  precedente.type = 'button';
  precedente.dataset.controllo = `pagina-prima-${chiave}`;
  precedente.setAttribute('aria-label', t('processi.agents.previousPage'));
  precedente.disabled = w.pagina === 0;
  precedente.addEventListener('click', (e) => { e.stopPropagation(); vai(-1, precedente.dataset.controllo); });
  const dove = el(d, 'span', 'talos-mono', t('agenti.delegations.pageRange', { da: cifra(w.da), a: cifra(w.a), totale: cifra(w.totale) }));
  dove.setAttribute('role', 'status');
  const successiva = el(d, 'button', 'talos-button talos-button--ghost talos-button--sm', t('agenti.delegations.next'));
  successiva.type = 'button';
  successiva.dataset.controllo = `pagina-dopo-${chiave}`;
  successiva.setAttribute('aria-label', t('processi.agents.nextPage'));
  successiva.disabled = w.pagina >= w.ultima;
  successiva.addEventListener('click', (e) => { e.stopPropagation(); vai(1, successiva.dataset.controllo); });
  nav.append(precedente, dove, successiva);
  return nav;
}

/**
 * La tastiera fra le pagine: Giù sull'ultima riga della pagina porta alla prima della pagina dopo (Su, il contrario). `true` se
 * ha cambiato pagina (il ridisegno mette il fuoco sulla riga nuova).
 */
export function vaiOltreLaPagina(ui, chiaveRiga, delta) {
  for (const l of ui.liste.values()) {
    const i = l.chiavi.indexOf(chiaveRiga);
    if (i < 0) continue;
    const j = i + delta;
    if (j < 0 || j >= l.chiavi.length || !l.chiavi[j]) return false;
    const inizio = l.pagina * l.dimensione;
    if (j >= inizio && j < inizio + l.dimensione) return false; // è sulla stessa pagina: la muove la tastiera normale
    ui.fuoco = l.chiavi[j];
    ui.seguiFuoco = true;
    ui.ridisegna();
    return true;
  }
  return false;
}

/** Il primo antenato che scorre: è la COLONNA (nel prodotto `.talos-inspector__body`), quella che non deve scorrere. */
export function scorritoreDi(n) {
  const w = n?.ownerDocument?.defaultView;
  for (let x = n; x && w; x = x.parentElement) {
    const o = w.getComputedStyle(x).overflowY;
    if (o === 'auto' || o === 'scroll') return x;
  }
  return null;
}

/** L'altezza NATURALE del contenuto della colonna (non `scrollHeight`: con poco contenuto vale l'altezza della colonna). */
function altezzaContenuto(scorritore) {
  const w = scorritore.ownerDocument.defaultView;
  const cs = w.getComputedStyle(scorritore);
  let alto = parseFloat(cs.paddingTop) + parseFloat(cs.paddingBottom);
  for (const c of scorritore.children) {
    if (c.hidden || w.getComputedStyle(c).display === 'none' || w.getComputedStyle(c).position === 'fixed') continue;
    const cc = w.getComputedStyle(c);
    alto += c.getBoundingClientRect().height + parseFloat(cc.marginTop) + parseFloat(cc.marginBottom);
  }
  /* se la colonna scorre già, il contenuto vero è quello che scorre (un figlio può sbordare dalla sua scatola: la scheda Git) */
  if (scorritore.scrollHeight > scorritore.clientHeight + 1) alto = Math.max(alto, scorritore.scrollHeight);
  return alto;
}

/**
 * Misura e, se serve, cambia le dimensioni delle pagine. Torna `true` se bisogna ridisegnare. Si usa anche dalla scheda Git
 * (`git.js`), che non ridisegna da sé: lì `righeDi` dà le voci di ogni elenco.
 */
export function adattaAlloSpazio(contenitore, ui) {
  const scorritore = ui.scorritore?.isConnected ? ui.scorritore : (ui.scorritore = scorritoreDi(contenitore));
  if (!scorritore || !ui.liste.size) return false;
  const H = scorritore.clientHeight;
  if (!H) return false; // scheda nascosta: si misura quando si apre
  if (!contenitore.getClientRects().length) return false; // il contenitore è nascosto (il lettore dei file al posto dell'albero): niente misure false
  const contenuto = altezzaContenuto(scorritore);
  let pagineTot = 0;
  let barre = 0;
  for (const b of contenitore.querySelectorAll('[data-pager]')) { barre += 1; pagineTot += b.getBoundingClientRect().height + 2; }
  const altezzaPager = barre ? pagineTot / barre : 36;
  const sezioni = [];
  let righeTot = 0;
  for (const [chiave, l] of ui.liste) {
    const mostrate = [...contenitore.querySelectorAll(`[data-pagina="${CSS.escape(chiave)}"]`)].filter((n) => !n.classList.contains('pn-fuori-pagina'));
    let passo = ui.passi?.get(chiave) ?? 40;
    if (mostrate.length) {
      const primo = mostrate[0].getBoundingClientRect();
      const ultimo = mostrate.at(-1).getBoundingClientRect();
      const blocco = ultimo.bottom - primo.top;
      righeTot += blocco;
      passo = Math.max(16, blocco / mostrate.length);
      (ui.passi ??= new Map()).set(chiave, passo);
    }
    sezioni.push({ chiave, totale: l.totale, altezzaRiga: passo });
  }
  const fisso = contenuto - righeTot - pagineTot;
  const spazio = H - fisso - ui.margineExtra - 2;
  /* ⭐ quando nemmeno UNA riga per sezione ci sta (la finestra più piccola, 900×600), le sezioni si ripiegano DA SOLE dal fondo:
     resta la loro testa col conto, e si aprono col clic (quella aperta per ultima dalla persona non si ripiega mai, «Richiede
     attenzione» nemmeno). È la fisarmonica: la scheda sta nello schermo senza scorrere. Quando torna il posto, si riaprono. */
  if (ui.compatte) {
    const minimo = (x) => x.altezzaRiga + (x.totale > 1 ? altezzaPager : 0);
    const somma = sezioni.reduce((a, x) => a + minimo(x), 0);
    if (somma > spazio) {
      let manca = somma - spazio;
      let tolte = 0;
      /* prima le altre; se non basta, anche quella aperta per ultima (mai «Richiede attenzione») */
      /* ⛔ una sezione con la riga che la persona sta usando (aperta, col fuoco, con una conferma o un esito) non si ripiega da
         sola: la conferma di «Ferma» sparirebbe sotto le dita (trovato dalla prova PNAG-02, 29/10) */
      const inUso = (x) => (ui.liste.get(x.chiave)?.chiavi ?? []).some((k) => k && (k === ui.fuoco || ui.aperte?.has(k) || ui.conferme?.has(k) || ui.esiti?.has(k)));
      for (const anchePreferita of [false, true]) {
        for (const x of [...sezioni].reverse()) {
          if (manca <= 0) break;
          if ((!anchePreferita && x.chiave === ui.preferita) || x.chiave.includes('attenzione') || ui.compatte.has(x.chiave) || inUso(x)) continue;
          ui.compatte.add(x.chiave);
          manca -= minimo(x);
          tolte += 1;
        }
      }
      if (tolte) return true;
    } else if (ui.compatte.size) {
      const libero = spazio - somma;
      const ultima = [...ui.compatte].at(-1);
      const stima = (ui.passi?.get(ultima) ?? 44) + altezzaPager + 8;
      if (stima <= libero) { ui.compatte.delete(ultima); return true; }
    }
  }
  const nuove = dividiLoSpazio({ spazio, sezioni, altezzaPager });
  let cambiate = false;
  for (const [k, n] of nuove) if (ui.dimensioni.get(k) !== n) { ui.dimensioni.set(k, n); cambiate = true; }
  if (cambiate) return true;
  /* le misure tornano ma sborda lo stesso (una riga aperta, un'altezza diversa): si stringe ancora di quanto sborda */
  const sborda = contenuto - H;
  if (sborda > 1 && [...nuove.values()].some((n) => n > 1) && ui.margineExtra < H) { ui.margineExtra += sborda; return true; }
  return false;
}

/** Al cambio d'altezza della colonna si rifà il conto (ResizeObserver), una volta per fotogramma. */
function osservaSpazio(contenitore, ui) {
  const scorritore = ui.scorritore;
  const RO = contenitore.ownerDocument.defaultView?.ResizeObserver;
  if (!scorritore || !RO || ui.osservato === scorritore) return;
  ui.osservatore?.disconnect();
  ui.osservato = scorritore;
  let ultima = scorritore.clientHeight;
  ui.osservatore = new RO(() => {
    const h = scorritore.clientHeight;
    if (Math.abs(h - ultima) < 1) return;
    ultima = h;
    ui.margineExtra = 0;
    ui.compatte?.clear();
    programmaRidisegno(ui);
  });
  ui.osservatore.observe(scorritore);
}

function storageDi(contenitore) {
  try { return contenitore.ownerDocument?.defaultView?.localStorage ?? null; } catch { return null; }
}
/** Le pieghe si ricordano per scheda (`montaCardContesto` fa lo stesso per le card del Contesto, `legacy/app.js:2638`). */
export function ricordaPieghe(ui) {
  salvaPieghe(storageDi(ui.contenitore), ui.scheda, { chiuse: ui.chiuse, aperte: ui.piegheAperte });
}

/**
 * Una riga. Clic o Invio = si apre sul posto (se ha un dettaglio) o fa la sua azione principale; «⋯» e tasto destro = menu.
 * @param {object} p
 * @param {string} p.chiave stabile fra un disegno e l'altro (id della sessione, toolCallId, percorso)
 * @param {'ok'|'corso'|'neutro'|'avviso'|'errore'} p.tono
 * @param {string} p.icona id dello sprite
 * @param {string} p.nome
 * @param {string} [p.nomeSotto] la cartella attenuata accanto al nome di un file
 * @param {string|Node} [p.sotto] la riga di attività (una sola, troncata)
 * @param {string|Node} [p.perche] la riga del perché (solo nelle righe «da guardare»: si legge intera)
 * @param {Node|string} [p.lato] la misura a destra (durata, +/−, CPU)
 * @param {number} [p.dal] istante d'avvio: la misura a lato diventa un orologio vivo
 * @param {Node} [p.latoSotto] la seconda riga a destra (il mini-grafico della CPU)
 * @param {Node[]} [p.azioni] l'azione in vista (una sola: «Rispondi», «Ferma», «Riprova»)
 * @param {()=>Node} [p.dettaglio] il dettaglio sul posto, costruito solo se la riga è aperta
 * @param {()=>Array} [p.menu] le voci del «⋯»
 * @param {(posizionamento:object)=>void} [p.apriMenu] chi apre il menu, se non è `azioni.apriMenu` (Agenti: `menuDellaDelega`)
 * @param {()=>void} [p.primaria] l'azione di Invio quando la riga non ha dettaglio
 * @param {boolean} [p.figlio] rientrata sotto il padre
 * @param {boolean} [p.vivo] sta lavorando adesso: il segno ha l'anello che gira (calmo col movimento ridotto)
 * @param {boolean} [p.attenuata] fuori dall'ambito scelto ma tenuta per contesto
 */
export function riga(d, ui, p) {
  const aperta = ui.aperte.has(p.chiave) && (typeof p.dettaglio === 'function' || ui.conferme.has(p.chiave));
  const r = el(d, 'div', `pn-riga${p.figlio ? ' pn-riga--figlio' : ''}${p.attenuata ? ' pn-riga--attenuata' : ''}`);
  r.dataset.chiave = p.chiave;
  r.dataset.tono = p.tono;
  r.setAttribute('role', 'listitem');
  r.tabIndex = -1;
  if (typeof p.dettaglio === 'function') r.setAttribute('aria-expanded', String(aperta));
  const segno = el(d, 'span', 'pn-segno');
  segno.dataset.tono = p.tono;
  if (p.vivo) segno.dataset.vivo = ''; // l'anello che gira: SOLO per ciò che sta lavorando adesso
  if (p.parolaStato) { segno.title = p.parolaStato; segno.setAttribute('role', 'img'); segno.setAttribute('aria-label', p.parolaStato); }
  if (p.lettera) segno.append(el(d, 'span', 'pn-segno__lettera', p.lettera)); else segno.append(icona(d, p.icona));
  const mezzo = el(d, 'div', 'pn-mezzo');
  const nome = el(d, 'div', `pn-nome${p.mono ? ' pn-nome--file' : ''}`);
  nome.append(el(d, 'span', 'pn-tronca', p.nome));
  if (p.nomeSotto) nome.append(el(d, 'span', 'pn-nome__cartella pn-tronca', p.nomeSotto));
  mezzo.append(nome);
  if (p.perche) { const x = el(d, 'div', 'pn-perche'); x.append(typeof p.perche === 'string' ? d.createTextNode(p.perche) : p.perche); mezzo.append(x); }
  if (p.sotto) { const x = el(d, 'div', 'pn-sotto'); x.append(typeof p.sotto === 'string' ? el(d, 'span', 'pn-tronca', p.sotto) : p.sotto); mezzo.append(x); }
  const lato = el(d, 'div', 'pn-lato');
  const latoSu = el(d, 'div', 'pn-lato__su');
  if (p.lato != null) latoSu.append(typeof p.lato === 'string' ? el(d, 'span', 'pn-mono', p.lato) : p.lato);
  if (Number.isFinite(p.dal)) { const o = el(d, 'span', 'pn-mono pn-vivo'); o.dataset.dal = String(p.dal); o.textContent = durata(adessoDi(ui) - p.dal); latoSu.append(o); }
  const haMenu = typeof p.menu === 'function' || typeof p.apriMenu === 'function';
  const apriMenu = (pos) => (p.apriMenu ? p.apriMenu(pos) : ui.azioni.apriMenu?.(p.menu(), pos));
  if (haMenu && (p.apriMenu || ui.azioni.apriMenu)) {
    latoSu.append(bottoneIcona(d, { id: 'i-more', etichetta: t('pannello.riga.azioniSu', { nome: p.nome }), haMenu: true, chiave: 'menu-riga', fai: (e, b) => apriMenu({ ancoraEl: b }) }));
  } else latoSu.append(el(d, 'span', 'pn-ib-spazio')); // lo stesso posto del «⋯», così le misure a lato restano in colonna
  lato.append(latoSu);
  if (p.latoSotto) lato.append(p.latoSotto);
  r.append(segno, mezzo, lato);
  const esito = ui.esiti.get(p.chiave);
  if (p.azioni?.length && !esito) { const a = el(d, 'div', 'pn-azione'); a.append(...p.azioni); r.append(a); }
  if (esito) r.append(rigaEsito(d, esito));
  const conferma = ui.conferme.get(p.chiave);
  if (conferma) r.append(rigaConferma(d, ui, p.chiave, conferma));
  if (aperta && typeof p.dettaglio === 'function') {
    const det = el(d, 'div', 'pn-dettaglio');
    det.append(p.dettaglio());
    det.addEventListener('click', (e) => e.stopPropagation());
    r.append(det);
  }
  const apriChiudi = () => {
    p.alClic?.(); // chi deve sapere della scelta (il diagramma delle deleghe aperto segue la riga), prima del dettaglio sul posto
    if (typeof p.dettaglio !== 'function') { p.primaria?.(); return; }
    if (ui.aperte.has(p.chiave)) { ui.aperte.delete(p.chiave); ui.conferme.delete(p.chiave); } else ui.aperte.add(p.chiave);
    ui.fuoco = p.chiave;
    ui.ridisegna();
  };
  r.addEventListener('click', (e) => { if (e.target.closest('button, a, input, textarea, select, .pn-dettaglio')) return; apriChiudi(); });
  r.addEventListener('contextmenu', (e) => { if (!haMenu) return; e.preventDefault(); apriMenu({ x: e.clientX, y: e.clientY }); });
  ui.righe.set(p.chiave, { nodo: r, apriChiudi, apriMenu: haMenu ? apriMenu : null, haDettaglio: typeof p.dettaglio === 'function' });
  return r;
}

function rigaEsito(d, esito) {
  const e = el(d, 'div', `pn-esito pn-esito--${esito.stato}`);
  e.setAttribute('role', esito.stato === 'errore' ? 'alert' : 'status');
  e.append(icona(d, esito.stato === 'ok' ? 'i-check' : esito.stato === 'errore' ? 'i-alert' : 'i-clock'), el(d, 'span', '', esito.testo));
  return e;
}

function rigaConferma(d, ui, chiave, c) {
  const box = el(d, 'div', 'pn-conferma');
  box.setAttribute('role', 'group');
  box.setAttribute('aria-label', c.domanda);
  box.append(el(d, 'b', '', c.domanda));
  if (c.conseguenza) box.append(el(d, 'span', '', c.conseguenza));
  const tasti = el(d, 'div', 'pn-conferma__tasti');
  tasti.append(
    bottone(d, { etichetta: c.etichetta, variante: c.pericolo === false ? 'primary' : 'danger', chiave: 'conferma-si', fai: () => { ui.conferme.delete(chiave); c.fai(); } }),
    bottone(d, { etichetta: t('pannello.conferma.annulla'), variante: 'ghost', chiave: 'conferma-no', fai: () => { ui.conferme.delete(chiave); ui.fuoco = chiave; ui.ridisegna(); } }),
  );
  box.append(tasti);
  box.addEventListener('click', (e) => e.stopPropagation());
  return box;
}

/**
 * La conferma e l'esito di un'azione che vale per TUTTA la scheda (Ferma tutti, Riassumi adesso, Commit): stanno sotto la
 * testa, con le stesse regole della riga. `chiave` comincia con «__» per non confondersi con una riga.
 */
export function bloccoDiTesta(d, ui, chiave) {
  const pezzi = [];
  const esito = ui.esiti.get(chiave);
  if (esito) { const b = rigaEsito(d, esito); b.classList.add('pn-esito--testa'); pezzi.push(b); }
  const c = ui.conferme.get(chiave);
  if (c) { const b = rigaConferma(d, ui, chiave, c); b.classList.add('pn-conferma--testa'); pezzi.push(b); }
  if (!pezzi.length) return null;
  const box = el(d, 'div', 'pn-blocco-testa');
  box.append(...pezzi);
  return box;
}

/** La piega tratteggiata: ciò che resta chiuso finché non lo apri (richieste passate, indice dei giri, tutto il progetto). */
export function piega(d, ui, { chiave, titolo, sotto, contenuto }) {
  const compatta = ui.piegheAperte.has(chiave) && ui.compatte.has(`piega-${chiave}`);
  const aperta = ui.piegheAperte.has(chiave) && !compatta;
  const box = el(d, 'div', 'pn-piega');
  const b = el(d, 'button', 'pn-piega__testa');
  b.type = 'button';
  b.dataset.controllo = `piega-${chiave}`;
  b.setAttribute('aria-expanded', String(aperta));
  const testi = el(d, 'span', 'pn-piega__testi');
  testi.append(el(d, 'b', 'pn-tronca', titolo), el(d, 'small', 'pn-tronca', sotto));
  b.append(icona(d, 'i-chevron-right'), testi);
  if (compatta) { b.title = t('pannello.comune.ripiegataPerSpazio'); box.dataset.compatta = ''; }
  b.addEventListener('click', (e) => {
    e.stopPropagation();
    if (compatta) { ui.compatte.delete(`piega-${chiave}`); ui.preferita = `piega-${chiave}`; } else if (aperta) ui.piegheAperte.delete(chiave); else { ui.piegheAperte.add(chiave); ui.preferita = `piega-${chiave}`; }
    ricordaPieghe(ui);
    ui.ridisegna();
  });
  box.append(b);
  if (aperta) {
    const c = el(d, 'div', 'pn-piega__corpo');
    const voci = [contenuto()].flat().filter(Boolean);
    /* un elenco di righe va a pagine come le sezioni; un contenuto unico (un vuoto, un grafico) resta com'è */
    if (voci.length > 1 && voci.every((v) => v.dataset?.chiave)) {
      const { nodi, barra } = elencoPaginato(d, ui, { chiave: `piega-${chiave}`, titolo, voci });
      c.append(...nodi);
      if (barra) c.append(barra);
    } else c.append(...voci);
    box.append(c);
  }
  return box;
}

/** Lo stato vuoto: dice che cosa manca E offre la via d'uscita (Hermes `right-sidebar/index.tsx:173-181`). Mai un vicolo cieco. */
export function vuoto(d, { testo, azione = null }) {
  const v = el(d, 'div', 'pn-vuoto');
  v.append(el(d, 'p', '', testo));
  if (azione) v.append(bottone(d, { etichetta: azione.etichetta, variante: 'secondary', fai: azione.fai, chiave: 'azione-vuoto' }));
  return v;
}

/** Lo scheletro: compare solo dopo un attimo (CSS `animation-delay`), così un cambio veloce non lampeggia (Hermes `:289-291`). */
export function scheletro(d) {
  const s = el(d, 'div', 'pn-scheletro');
  s.setAttribute('aria-busy', 'true');
  s.setAttribute('aria-label', t('pannello.carico'));
  for (let i = 0; i < 5; i += 1) s.append(el(d, 'span'));
  return s;
}

/** Una coppia termine/valore per i fatti del dettaglio. */
export function fatti(d, coppie) {
  const dl = el(d, 'dl', 'pn-fatti');
  for (const [k, v] of coppie) {
    if (v == null || v === '') continue;
    const dd = el(d, 'dd');
    dd.append(typeof v === 'string' ? d.createTextNode(v) : v);
    dl.append(el(d, 'dt', '', k), dd);
  }
  return dl;
}

/** Un piccolo pezzo di codice in riga (un comando, un percorso). */
export function codice(d, testo) { return el(d, 'code', 'pn-code', testo); }

/** Le differenze «+42 −3». */
export function differenze(d, aggiunte, rimozioni) {
  const s = el(d, 'span', 'pn-diff');
  if (!Number.isFinite(aggiunte) && !Number.isFinite(rimozioni)) return s;
  s.append(el(d, 'span', 'pn-diff__piu', `+${aggiunte ?? 0}`));
  if (rimozioni) s.append(d.createTextNode(' '), el(d, 'span', 'pn-diff__meno', `−${rimozioni}`));
  return s;
}

/** Il mini-grafico della CPU degli ultimi campioni (un campione ogni 5 s: `RITMO_RISORSE_PROCESSI_MS`, `legacy/app.js:6898`). */
export function scintilla(d, valori = [], etichetta = '') {
  const w = 54, h = 16;
  const svg = d.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('class', 'pn-scintilla');
  svg.setAttribute('viewBox', `0 0 ${w} ${h}`);
  svg.setAttribute('role', 'img');
  svg.setAttribute('aria-label', etichetta);
  const v = valori.filter(Number.isFinite).slice(-12);
  if (v.length > 1) {
    const max = Math.max(10, ...v);
    const linea = d.createElementNS(SVG_NS, 'polyline');
    linea.setAttribute('points', v.map((x, i) => `${((i * (w - 2)) / (v.length - 1) + 1).toFixed(1)},${(h - 1.5 - (x / max) * (h - 3)).toFixed(1)}`).join(' '));
    svg.append(linea);
  }
  return svg;
}

/* ───────────────────────────── il conto sulla scheda ───────────────────────────── */

/**
 * Il numero vivo sull'intestazione della scheda (owner 20/09: «in tempo reale»), più il pallino ambra se qualcosa aspetta e
 * l'anello della finestra sul Contesto. Sostituisce `impostaConteggioScheda` (`topbar.js:50`) per le cinque schede: crea,
 * aggiorna e — a zero — toglie, come lei. Va chiamato a OGNI disegno della colonna, anche a scheda chiusa.
 * @param {HTMLElement} tab il pulsante della scheda (`#railTabs [data-rail="…"]`)
 * @param {{numero?:number|null, attenzione?:number, anello?:number|null, descrizione?:string}} conto
 */
export function contatore(tab, conto = {}) {
  if (!tab) return;
  const d = tab.ownerDocument;
  let box = tab.querySelector(':scope > .pn-contatore');
  /* il badge di prima (`impostaConteggioScheda`, topbar.js:50: `.talos-tabs__count` figlio diretto) non resta accanto al nuovo */
  for (const vecchio of tab.querySelectorAll(':scope > .talos-tabs__count')) {
    if (vecchio.previousSibling?.nodeType === 3) vecchio.previousSibling.textContent = vecchio.previousSibling.textContent.replace(/\s+$/u, '');
    vecchio.remove();
  }
  /* il titolo che la scheda aveva prima del conto torna quando il conto se ne va (mai un suggerimento vecchio di un conto sparito) */
  if (tab.dataset.pnTitolo === undefined) tab.dataset.pnTitolo = tab.getAttribute('title') ?? '';
  const titoloDiPrima = () => { if (tab.dataset.pnTitolo) tab.title = tab.dataset.pnTitolo; else tab.removeAttribute('title'); };
  const vuoto = !(conto.numero > 0) && !(conto.attenzione > 0) && !Number.isFinite(conto.anello);
  /* come il badge di prima, il conto è separato dal nome da UNO spazio, che se ne va con lui («Agenti 2», poi «Agenti») */
  const togliSpazio = () => { if (box?.previousSibling?.nodeType === 3) box.previousSibling.textContent = box.previousSibling.textContent.replace(/\s+$/u, ''); };
  if (vuoto) { togliSpazio(); box?.remove(); tab.removeAttribute('aria-description'); titoloDiPrima(); adattaFilaSchede(tab.parentElement); return; }
  if (!box) { box = el(d, 'span', 'pn-contatore'); tab.append(d.createTextNode(''), box); }
  const pezzi = [];
  if (Number.isFinite(conto.anello)) pezzi.push(anello(d, conto.anello));
  /* la classe di oggi (`talos-tabs__count`) resta sul numero: chi lo leggeva (le prove BADGE-*) lo trova dove l'ha sempre trovato */
  if (conto.numero > 0) pezzi.push(el(d, 'span', 'pn-contatore__n talos-tabs__count', String(conto.numero)));
  if (conto.attenzione > 0) pezzi.push(el(d, 'span', 'pn-contatore__punto'));
  box.replaceChildren(...pezzi);
  /* lo spazio c'è solo davanti a un NUMERO (il pallino e l'anello si separano col margine): «Agenti 2», mai «Agenti » */
  if (box.previousSibling?.nodeType === 3) box.previousSibling.textContent = conto.numero > 0 ? ' ' : '';
  box.setAttribute('aria-hidden', 'true');
  if (conto.descrizione) { tab.setAttribute('aria-description', conto.descrizione); tab.title = conto.descrizione; }
  else { tab.removeAttribute('aria-description'); titoloDiPrima(); }
  box.dataset.attenzione = String(conto.attenzione > 0);
  adattaFilaSchede(tab.parentElement);
}

/**
 * ⭐ 29/10 sera (revisione D) — la fila delle schede deve restare leggibile a 300 e a 340 px, in italiano e in inglese. Oggi la fila
 * (`.talos-inspector__tabs .talos-tabs__list`, `index.css:1940`) scorre senza barra e tiene in vista quella scelta
 * (`tieniInVistaScheda`, `components/schede.js:126`): con i numeri aggiunti a 300 px «Processi» usciva. Cura che non tocca niente di
 * oggi: cedono i NUMERI (aggiunta), prima le cifre e poi anche anello e pallino; il conto resta nel titolo e in `aria-description`.
 * Si rifà a ogni conto e quando la fila cambia larghezza (ResizeObserver).
 */
export function adattaFilaSchede(fila) {
  if (!fila || !fila.isConnected) return;
  const misura = () => {
    const sborda = (livello) => { fila.dataset.pnConti = LIVELLI_CONTI[livello]; return fila.scrollWidth > fila.clientWidth + 1; };
    const livello = livelloContiSchede(sborda);
    fila.dataset.pnConti = LIVELLI_CONTI[livello];
    if (!fila.dataset.pnConti) delete fila.dataset.pnConti;
  };
  misura();
  const RO = fila.ownerDocument.defaultView?.ResizeObserver;
  if (RO && !fila.__pnFila) {
    let ultima = fila.clientWidth;
    fila.__pnFila = new RO(() => { if (Math.abs(fila.clientWidth - ultima) < 1) return; ultima = fila.clientWidth; misura(); });
    fila.__pnFila.observe(fila);
  }
}

/** L'anello della finestra del contesto (14 px), con il tono che cambia oltre l'85% (Zed `thread_view.rs:4719`). */
export function anello(d, percentuale, dimensione = 14) {
  const p = Math.max(0, Math.min(100, percentuale));
  const r = dimensione / 2 - 1.5;
  const c = 2 * Math.PI * r;
  const svg = d.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('class', 'pn-anello');
  svg.setAttribute('viewBox', `0 0 ${dimensione} ${dimensione}`);
  svg.setAttribute('width', String(dimensione));
  svg.setAttribute('height', String(dimensione));
  svg.dataset.tono = p >= 85 ? 'avviso' : 'corso';
  for (const [classe, tratto] of [['pn-anello__fondo', null], ['pn-anello__pieno', `${((c * p) / 100).toFixed(2)} ${c.toFixed(2)}`]]) {
    const k = d.createElementNS(SVG_NS, 'circle');
    k.setAttribute('class', classe);
    k.setAttribute('cx', String(dimensione / 2));
    k.setAttribute('cy', String(dimensione / 2));
    k.setAttribute('r', r.toFixed(2));
    if (tratto) k.setAttribute('stroke-dasharray', tratto);
    svg.append(k);
  }
  return svg;
}

/* ───────────────────────────── orologio e tastiera ───────────────────────────── */

function adessoDi(ui) {
  const a = ui.dati?.adesso;
  return typeof a === 'function' ? a() : Number.isFinite(a) ? a : Date.now();
}

/** Scrive i secondi delle righe vive. Gira SOLO se la scheda è a schermo e la finestra è visibile; con `dati.adesso` fisso, mai. */
function aggiornaOrologio(contenitore) {
  const ui = contenitore.__pannello;
  const vivi = contenitore.querySelectorAll('[data-dal]');
  const fisso = Number.isFinite(ui?.dati?.adesso);
  if (!vivi.length || fisso) { clearInterval(ui?.orologio); if (ui) ui.orologio = 0; return; }
  if (ui.orologio) return;
  ui.orologio = setInterval(() => {
    if (!contenitore.isConnected) { clearInterval(ui.orologio); ui.orologio = 0; return; }
    const d = contenitore.ownerDocument;
    if (d.visibilityState === 'hidden' || contenitore.closest('[hidden]') || contenitore.offsetParent === null) return;
    const adesso = adessoDi(ui);
    for (const n of contenitore.querySelectorAll('[data-dal]')) n.textContent = durata(adesso - Number(n.dataset.dal));
  }, 1000);
}

/** Il tabindex «a rotazione»: una sola riga raggiungibile col Tab, le frecce si muovono fra le altre (ARIA APG). */
function rotazione(contenitore, ui) {
  const righe = [...contenitore.querySelectorAll('.pn-riga')];
  if (!righe.length) return;
  const scelta = righe.find((r) => r.dataset.chiave === ui.fuoco) ?? righe[0];
  for (const r of righe) r.tabIndex = r === scelta ? 0 : -1;
}

function montaUnaVolta(contenitore) {
  contenitore.addEventListener('keydown', (e) => {
    const r = e.target.closest?.('.pn-riga');
    if (!r || e.target !== r) return;
    const ui = contenitore.__pannello;
    if (!ui?.righe) return;
    const info = ui.righe.get(r.dataset.chiave);
    const righe = [...contenitore.querySelectorAll('.pn-riga')].filter((x) => x.offsetParent !== null || !x.ownerDocument.defaultView);
    const i = righe.indexOf(r);
    const vai = (j) => { const x = righe[Math.max(0, Math.min(righe.length - 1, j))]; if (!x) return; r.tabIndex = -1; x.tabIndex = 0; ui.fuoco = x.dataset.chiave; x.focus(); x.scrollIntoView?.({ block: 'nearest' }); };
    switch (e.key) {
      case 'ArrowDown': e.preventDefault(); if (vaiOltreLaPagina(ui, r.dataset.chiave, 1)) break; vai(i + 1); break;
      case 'ArrowUp': e.preventDefault(); if (vaiOltreLaPagina(ui, r.dataset.chiave, -1)) break; if (i === 0) contenitore.querySelector('.pn-cerca__campo')?.focus(); else vai(i - 1); break;
      case 'Home': e.preventDefault(); vai(0); break;
      case 'End': e.preventDefault(); vai(righe.length - 1); break;
      case 'Enter': case ' ': e.preventDefault(); info?.apriChiudi(); break;
      case 'ArrowRight': if (info?.haDettaglio && !ui.aperte.has(r.dataset.chiave)) { e.preventDefault(); info.apriChiudi(); } break;
      case 'ArrowLeft': if (ui.aperte.has(r.dataset.chiave)) { e.preventDefault(); info?.apriChiudi(); } break;
      case 'Escape': if (ui.aperte.has(r.dataset.chiave) || ui.conferme.has(r.dataset.chiave)) { e.preventDefault(); ui.aperte.delete(r.dataset.chiave); ui.conferme.delete(r.dataset.chiave); ui.ridisegna(); } break;
      case 'ContextMenu': e.preventDefault(); info?.apriMenu?.({ ancoraEl: r.querySelector('[data-controllo="menu-riga"]') ?? r }); break;
      case 'F10': if (e.shiftKey) { e.preventDefault(); info?.apriMenu?.({ ancoraEl: r.querySelector('[data-controllo="menu-riga"]') ?? r }); } break;
      default:
    }
  });
  contenitore.addEventListener('focusin', (e) => {
    const r = e.target.closest?.('.pn-riga');
    if (r && contenitore.__pannello) contenitore.__pannello.fuoco = r.dataset.chiave;
  });
}

/** Il testo che la ricerca confronta: minuscolo e senza accenti, così «perche» trova «perché». */
export function normalizza(s) {
  return String(s ?? '').normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();
}
