/*
 * Il menu «⋯» del blocco (scena 8, FE-080, ledger UI generativa 05/11/2026, gruppo G-A; variante A scelta dall'owner).
 *
 * Il bozzetto (`frontend/in-corso/BOZZETTO-UI-GENERATIVA-DEFINITIVO-2026-11-05.html:779-791`): un tasto fantasma «⋯» in testata
 * (`aria-haspopup="menu"`, «Azioni del blocco»), il menu con le voci e le loro icone, un separatore prima delle
 * esportazioni, la conferma in riga `gu-fatto` sotto il blocco. Lo stesso menu col tasto destro sul blocco.
 * Grammatica dell'interfaccia: più di due azioni vanno nel «⋯» e nel tasto destro, mai tasti in fila (Hermes
 * `apps/desktop/DESIGN.md:361-366`, le azioni fuori dal contenuto).
 *
 * Tastiera dal WAI-ARIA APG «Menu Button Pattern» e «Menu and Menubar Pattern» (w3.org/WAI/ARIA/apg, letti il 05/11/2026):
 * Invio/Spazio (il clic del tasto) e Freccia giù aprono sulla prima voce, Freccia su sull'ultima; dentro, le frecce girano,
 * Home/Fine vanno agli estremi, Esc chiude e rimette il fuoco su «⋯», Tab chiude e lascia andare il fuoco.
 * ⛔ Scegliere una voce rimette il fuoco su «⋯» PRIMA dell'azione: «Tutto schermo» ricorda `document.activeElement` per
 * restituirlo all'uscita (`viste.js`, `apriSchermo`), e una voce nascosta non può riceverlo.
 * ⛔ Cure del 05/11/2026 (revisione avversaria di G-A, ROSSA): il menu si monta nel CORPO della pagina, fisso, col menu contestuale
 *   condiviso (`schede.js`): dentro il blocco lo tagliava `content-visibility:auto` dei turni chiusi. Le voci vivono solo a menu
 *   aperto; il loro stato (testo, spenta) sta in `voci`, che `in-libreria.js` scrive per dire «In Libreria · vN».
 */
import { ripiegoTestuale } from '../../../../src/blocchi/catalogo.mjs';
import { t } from '../lingua.js';
import { el, linguaDeiNumeri, tasto as creaTasto } from './comune.js';
import { esportaBlocco, formatoDiEsportazione } from './esporta.js';
import { creaMenuContestuale, apriMenuContestuale } from '../schede.js';
import { aggiungiVersione, scriviSorgente, tornaAllaVersione, versioneCorrente } from '../../../../src/blocchi/versioni.mjs';
import { altraVista } from './cambio-vista.js';

const VOCE_ESPORTA = Object.freeze({ csv: 'blocchi.actions.exportCsv', svg: 'blocchi.actions.exportImage', txt: 'blocchi.actions.exportText' });

/**
 * Le azioni del blocco, nell'ordine del bozzetto. Una voce esiste solo se chi monta il blocco la sa fare (UIG-8.1);
 * «Copia» ed «Esporta» ci sono sempre. Ogni `fai` restituisce (o promette) il testo della conferma in riga, o niente.
 * @param {object} blocco
 * @param {{ lato?: Function, schermo?: Function, libreria?: Function, copia?: (testo: string) => unknown,
 *   scarica?: (file: {nome: string, testo: string, mime: string}) => unknown, contesto?: object, ora?: Date }} aggancio
 * @returns {{ id: string, testo: string, fai: () => unknown, separa?: boolean }[]}
 */
export function azioniDelBlocco(blocco, aggancio = {}) {
  const { lato, schermo, libreria, contesto } = aggancio;
  const lingua = () => (linguaDeiNumeri() === 'it' ? 'it' : 'en');
  const voci = [];
  const se = (id, testo, fare) => {
    if (typeof fare === 'function') voci.push({ id, testo, fai: () => { fare(blocco, contesto); } });
  };
  se('lato', t('blocchi.actions.side'), lato);
  se('schermo', t('blocchi.actions.fullScreen'), schermo);
  se('libreria', t('blocchi.actions.library'), libreria);
  /* G-B2 (FE-081, scenes 1+4): the version entries live in this same menu, never a second one. All of them are local: 0 network calls */
  const versioni = aggancio.versioni;
  const storico = typeof versioni?.storico === 'function' ? versioni.storico() : null;
  const cambia = typeof versioni?.cambia === 'function' ? versioni.cambia : null;
  const voceCorrente = storico ? versioneCorrente(storico) : null;
  if (cambia && storico) {
    const altra = altraVista(blocco);
    if (altra) voci.push({ id: 'vista', testo: t('blocchi.versions.switchView'), fai: () => { cambia(aggiungiVersione(storico, altra, { origine: 'vista', lingua: lingua() })); } });
    const prima = storico.voci.find((v) => v.versione === 1);
    if (storico.voci.length >= 2 && prima && voceCorrente && voceCorrente.sorgente !== prima.sorgente) {
      voci.push({ id: 'torna', testo: t('blocchi.versions.backToFirst'), fai: () => { cambia(tornaAllaVersione(storico, 1, { lingua: lingua() })); } });
    }
  }
  if (storico && storico.voci.length >= 2 && typeof aggancio.mostraVersioni === 'function') {
    voci.push({ id: 'versioni', testo: t('blocchi.versions.list'), fai: () => { aggancio.mostraVersioni(storico); } });
  }
  if (typeof aggancio.mostraTesto === 'function') {
    voci.push({ id: 'testo', testo: t('blocchi.versions.showText'), fai: () => { aggancio.mostraTesto(voceCorrente?.sorgente ?? scriviSorgente(blocco)); } });
  }
  const scrivi = aggancio.copia || ((testo) => globalThis.navigator?.clipboard?.writeText?.(testo));
  voci.push({ id: 'copia', testo: t('chat.common.copy'), fai: async () => { await scrivi(ripiegoTestuale(blocco, { lingua: lingua() })); return t('chat.common.copied'); } });
  const scarica = aggancio.scarica || (() => { throw new Error('scarica mancante'); });
  voci.push({
    id: 'esporta', testo: t(VOCE_ESPORTA[formatoDiEsportazione(blocco?.tipo)]), formato: formatoDiEsportazione(blocco?.tipo), separa: true,
    fai: async () => {
      const file = esportaBlocco(blocco, { lingua: lingua(), ...(aggancio.ora ? { ora: aggancio.ora } : {}) });
      await scarica(file);
      return t('blocchi.actions.exported', { name: file.nome });
    },
  });
  /* G-B2: «Share» only where the system can really share this file (W3C Web Share, `canShare({ files })`); otherwise it is absent, never faked */
  const nav = 'navigatore' in aggancio ? aggancio.navigatore : globalThis.navigator;
  const opzioniFile = () => ({ lingua: lingua(), ...(aggancio.ora ? { ora: aggancio.ora } : {}) });
  const fileDa = (file) => (typeof File === 'function' ? new File([file.testo], file.nome, { type: file.mime }) : null);
  let condivisibile = false;
  try {
    const f = typeof nav?.canShare === 'function' && typeof nav?.share === 'function' ? fileDa(esportaBlocco(blocco, opzioniFile())) : null;
    condivisibile = Boolean(f) && nav.canShare({ files: [f] }) === true;
  } catch { condivisibile = false; }
  if (condivisibile) {
    voci.push({
      id: 'condividi', testo: t('blocchi.versions.share'),
      fai: async () => {
        const file = esportaBlocco(blocco, opzioniFile());
        await nav.share({ files: [fileDa(file)], title: blocco?.titolo || file.nome });
      },
    });
  }
  return voci;
}

/* le icone del bozzetto (`VOCI_MENU`, BOZZETTO-UI-GENERATIVA-DEFINITIVO-2026-11-05.html:779), dallo sprite di index.template.html */
const ICONA = Object.freeze({
  lato: 'i-panel-right', schermo: 'i-maximize', libreria: 'i-library', copia: 'i-copy',
  csv: 'i-lib-file-spreadsheet', svg: 'i-image', txt: 'i-lib-file-text',
  vista: 'i-lib-file-spreadsheet', torna: 'i-undo', versioni: 'i-history', testo: 'i-code', condividi: 'i-share',
});
const ID_MENU = 'menuDelBlocco';
/* un menu solo alla volta, per tutti i blocchi della pagina: quello aperto adesso */
let aperto = null;

/**
 * Lo stato di una voce, che vive anche a menu chiuso: il menu si ridisegna a ogni apertura, e `in-libreria.js` scrive «In
 * Libreria · vN» o spegne la voce mentre salva. Se il menu è aperto, la scrittura arriva subito anche al tasto vero.
 */
function statoDellaVoce(testo) {
  let scritto = testo, spento = false, vivo = null;
  return {
    dataset: {},
    get textContent() { return scritto; },
    set textContent(v) {
      scritto = String(v);
      if (!vivo?.isConnected) return;
      const svg = vivo.querySelector('svg');
      vivo.textContent = scritto;
      if (svg) vivo.prepend(svg);
    },
    get disabled() { return spento; },
    set disabled(v) { spento = Boolean(v); if (vivo?.isConnected) vivo.disabled = spento; },
    _lega(b) { vivo = b; },
  };
}

/**
 * Il tasto «⋯» del blocco. Il menu NON vive nel blocco: un turno chiuso ha `content-visibility:auto` e lo taglierebbe, e la vista
 * a tutto schermo gli starebbe sopra. È lo stesso menu fisso nel corpo della pagina delle altre superfici (`schede.js`,
 * `creaMenuContestuale`/`apriMenuContestuale`, come `apriMenuCodice` in `conversazione.js`), uno solo, condiviso dai blocchi.
 * @param {Document} doc
 * @param {ReturnType<typeof azioniDelBlocco>} azioni
 * @param {{ valore?: string, conferma?: (testo: string) => void, finestra?: object }} [opzioni] `valore` va in `data-<id>` di ogni voce
 * @returns {{ nodo: HTMLElement, tasto: HTMLButtonElement, readonly menu: HTMLElement|null, voci: Record<string, ReturnType<typeof statoDellaVoce>>,
 *   apri: (dove?: 'prima'|'ultima', punto?: {x: number, y: number}) => void, chiudi: (rifocalizza?: boolean) => void }}
 */
export function creaMenuDelBlocco(doc, azioni, { valore = '', conferma, finestra } = {}) {
  const nodo = el(doc, 'span', 'gu__menu');
  const tasto = creaTasto(doc, '⋯');
  tasto.classList.add('gu__piu');
  tasto.setAttribute('aria-label', t('blocchi.menu.label'));
  tasto.setAttribute('aria-haspopup', 'menu');
  tasto.setAttribute('aria-expanded', 'false');
  nodo.append(tasto);
  const voci = {};
  for (const a of azioni) voci[a.id] = statoDellaVoce(a.testo);
  const fin = finestra || doc.defaultView || globalThis;
  const prendiMenu = () => doc.body?.querySelector(`#${ID_MENU}`) ?? null;

  const io = {
    nodo, tasto, voci, apri, chiudi,
    get menu() { return prendiMenu(); },
  };

  async function esegui(a) {
    if (voci[a.id].disabled) return;
    /* R-10 (G-B, 05/11/2026): una voce rimasta da un blocco che non è più nella pagina (turno rifatto, sessione cambiata) non agisce */
    if (!tasto.isConnected) { chiudi(false); return; }
    /* il fuoco su «⋯» PRIMA dell'azione: «Tutto schermo» ricorda `activeElement` per restituirlo all'uscita */
    tasto.focus({ preventScroll: true });
    let detto;
    try { detto = await a.fai(); } catch { return; }
    if (typeof detto === 'string' && detto) conferma?.(detto);
  }

  function apri(dove = 'prima', punto) {
    if (!azioni.length || !doc.body) return;
    if (aperto && aperto !== io) aperto.chiudi(false);
    /* R-8 (G-B): a tutto schermo la vista copre la pagina, e un menu nel corpo resterebbe sotto: il menu va dentro `.gu-schermo`.
       Sempre UNO solo: quello che c'è già si sposta, non se ne crea un secondo con lo stesso id. */
    const ospite = tasto.closest?.('.gu-schermo') ?? doc.body;
    const esistente = prendiMenu();
    if (esistente && esistente.parentNode !== ospite) ospite.append(esistente);
    const menu = creaMenuContestuale(ospite, { id: ID_MENU, etichetta: 'blocchi.menu.label' });
    menu.setAttribute('aria-label', t('blocchi.menu.label'));
    preparaUnaVolta(menu, fin);
    aperto = io;
    tasto.setAttribute('aria-expanded', 'true');
    const formato = (a) => ICONA[a.id === 'esporta' ? a.formato : a.id];
    const r = tasto.getBoundingClientRect?.() ?? { right: 0, bottom: 0 };
    const x = Number.isFinite(punto?.x) ? punto.x : r.right - (menu.offsetWidth || 240);
    const y = Number.isFinite(punto?.y) ? punto.y : r.bottom + 6;
    /* senza misure della finestra (prove, finestre non ancora disposte) il menu va dove lo si chiede */
    const misure = { innerWidth: Number.isFinite(fin.innerWidth) ? fin.innerWidth : Infinity, innerHeight: Number.isFinite(fin.innerHeight) ? fin.innerHeight : Infinity };
    apriMenuContestuale(menu, {
      voci: azioni.map((a) => [voci[a.id].textContent, () => { esegui(a); }, !voci[a.id].disabled, '', { icona: formato(a) }]),
      x, y, finestra: misure, chiudi: () => chiudi(false),
    });
    const tasti = menu.querySelectorAll('[role="menuitem"]');
    azioni.forEach((a, i) => {
      const b = tasti[i];
      if (!b) return;
      b.dataset[a.id] = valore;
      voci[a.id]._lega(b);
      if (a.separa && i > 0) {
        const sep = doc.createElement('div');
        sep.className = 'talos-context-menu__sep';
        sep.setAttribute('role', 'separator');
        b.before(sep);
      }
    });
    /* R-11 (G-B): si misura DOPO aver riempito (voci e separatori); se sotto il tasto non c'è posto si apre verso l'alto; mai fuori
       dalla finestra. Col tasto destro il punto resta l'angolo: verso l'alto vuol dire che il menu finisce sul puntatore. */
    const w = menu.offsetWidth || 240;
    const h = menu.offsetHeight || 160;
    const px = Number.isFinite(punto?.x) ? punto.x : r.right - w;
    let py = Number.isFinite(punto?.y) ? punto.y : r.bottom + 6;
    if (py + h + 8 > misure.innerHeight) py = (Number.isFinite(punto?.y) ? punto.y : (r.top ?? 0) - 6) - h;
    menu.style.left = `${Math.max(8, Math.min(px, misure.innerWidth - w - 8))}px`;
    menu.style.top = `${Math.max(8, Math.min(py, misure.innerHeight - h - 8))}px`;
    if (dove === 'ultima') [...tasti].reverse().find((b) => !b.disabled)?.focus({ preventScroll: true });
  }

  function chiudi(rifocalizza = false) {
    if (aperto !== io) return;
    aperto = null;
    tasto.setAttribute('aria-expanded', 'false');
    const menu = prendiMenu();
    if (menu) { menu.hidden = true; menu.replaceChildren(); }
    if (rifocalizza && tasto.isConnected) tasto.focus({ preventScroll: true });
  }

  tasto.addEventListener('click', () => { if (aperto === io) chiudi(true); else apri('prima'); });
  tasto.addEventListener('keydown', (ev) => {
    if (ev.key === 'ArrowDown' || ev.key === 'ArrowUp') {
      ev.preventDefault();
      apri(ev.key === 'ArrowUp' ? 'ultima' : 'prima');
    }
  });
  return io;
}

/* gli ascoltatori del menu condiviso, una volta sola: valgono per il blocco che l'ha aperto adesso (`aperto`) */
const preparati = new WeakSet();
function preparaUnaVolta(menu, fin) {
  const doc = menu.ownerDocument;
  /* ascoltatori del documento e della finestra UNA volta per documento: il menu può rinascere (a tutto schermo, R-8), loro no */
  if (!preparati.has(doc)) {
    preparati.add(doc);
    const attuale = () => doc.body?.querySelector?.(`#${ID_MENU}`) ?? null;
    doc.addEventListener?.('pointerdown', (ev) => {
      if (!aperto) return;
      /* il blocco non è più nella pagina (turno rifatto, conversazione cambiata): il suo menu non resta a galla */
      if (!aperto.tasto.isConnected) { aperto.chiudi(false); return; }
      const dove = ev.target;
      if (attuale()?.contains(dove) || aperto.tasto.contains(dove)) return;
      aperto.chiudi(false);
    }, true);
    /* R-10 (G-B): uno scorrimento qualunque (in cattura: anche la chat, che scorre da sé) stacca il tasto dal menu ⇒ si chiude;
       lo scorrimento DENTRO il menu no */
    doc.addEventListener?.('scroll', (ev) => {
      if (aperto && !attuale()?.contains(ev.target)) aperto.chiudi(false);
    }, true);
  }
  if (fin && !preparati.has(fin)) {
    preparati.add(fin);
    fin.addEventListener?.('resize', () => { aperto?.chiudi(false); });
  }
  if (menu.dataset.bloccoPronto) return;
  menu.dataset.bloccoPronto = '1';
  menu.addEventListener('keydown', (ev) => {
    if (!aperto) return;
    const elenco = [...menu.querySelectorAll('[role="menuitem"]')].filter((b) => !b.disabled);
    if (!elenco.length) return;
    const i = elenco.indexOf(doc.activeElement);
    const vai = (j) => { ev.preventDefault(); elenco[(j + elenco.length) % elenco.length].focus({ preventScroll: true }); };
    if (ev.key === 'ArrowDown') vai(i + 1);
    else if (ev.key === 'ArrowUp') vai(i < 0 ? elenco.length - 1 : i - 1);
    else if (ev.key === 'Home') vai(0);
    else if (ev.key === 'End') vai(elenco.length - 1);
    /* Esc non risale: sotto può esserci la vista a tutto schermo, che con Esc si chiuderebbe insieme */
    else if (ev.key === 'Escape') { ev.preventDefault(); ev.stopPropagation(); aperto.chiudi(true); }
    /* R-9 (G-B): Tab chiude e rimette il fuoco su «⋯»; senza preventDefault il Tab prosegue da lì, come nel menu button WAI-ARIA */
    else if (ev.key === 'Tab') aperto.chiudi(true);
  });
}
