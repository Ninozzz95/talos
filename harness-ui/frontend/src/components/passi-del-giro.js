/*
 * FE-008 (owner 31/10/2026; forma del 03/11): i Passi a schermo, sopra la riga viva, coi pezzi dell'elenco degli strumenti. Dal bozzetto
 * `bozzetto-superfici-vive`, righe 31045-31070: testata «Passi · 2 di 7», fino a cinque voci attorno a quella in corso, «altri N» per il resto.
 * ⛔ Il testo viene dal modello e può venire da una pagina letta: entra solo come testo.
 * ⛔ Nessun timer qui: i secondi corrono con l'orologio della riga viva (`data-attivita-da`).
 * ⛔ Una revisione vecchia si scarta, come in Hermes: una rigiocata o un secondo dispositivo non riportano indietro la lista.
 * ⛔ Owner 04/11/2026 16:11 («gli steps di una chat vanno in una chat nuova»): la lista è DI UNA SESSIONE, e la revisione conta dentro quella
 *   sessione. Hermes tiene lista e revisione per chiave di sessione (`apps/desktop/src/store/todos.ts:19-20`, `acceptRevision` :80-99) e il
 *   compositore legge solo la sua fetta (`status-stack/index.tsx:127-128`). Qui il nodo è uno solo: la lista di un'altra sessione si sostituisce
 *   sempre, mai confrontando le revisioni (la 3 di A scartava la 1 della chat nuova).
 */
import { NOME_PASSI } from '../../../src/passi-del-giro.mjs';
import { t as traduci } from './lingua.js';

const VOCI_A_SCHERMO = 5;
const COME_A_SCHERMO = { pending: 'no', in_progress: 'ora', completed: 'fatto', cancelled: 'annullato' };

/** Quali voci si vedono: quella in corso resta in vista, con la precedente sopra. */
export function finestraPassi(voci) {
  const ora = voci.findIndex((v) => v.stato === 'in_progress');
  const da = Math.max(0, Math.min(ora < 0 ? voci.length - VOCI_A_SCHERMO : ora - 1, voci.length - VOCI_A_SCHERMO));
  const visibili = voci.slice(da, da + VOCI_A_SCHERMO);
  return { visibili, resto: voci.length - da - visibili.length };
}

const aperteDi = (voci) => voci.filter((v) => v.stato === 'pending' || v.stato === 'in_progress');

/**
 * @param {{ document: Document, durata?: (ms: number) => string, quandoCorre?: () => void }} o
 *   `durata`: il formato della riga viva; `quandoCorre`: accende il suo orologio.
 * @returns {{ nodo: HTMLElement, aggiorna: (stato: object, diSessione?: string|null) => boolean, fineGiro: () => void, azzera: () => void,
 *   istantanea: () => object|null, ripristina: (presa: object|null) => void }}
 */
export function creaPassiDelGiro(o) {
  const doc = o.document;
  const crea = (tag, classe, testo) => { const n = doc.createElement(tag); if (classe) n.className = classe; if (testo !== undefined) n.textContent = testo; return n; };
  const simbolo = (nome, classe) => {
    const svg = doc.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('class', classe); svg.setAttribute('aria-hidden', 'true');
    const use = doc.createElementNS('http://www.w3.org/2000/svg', 'use');
    use.setAttribute('href', `#${nome}`);
    svg.append(use);
    return svg;
  };
  const nodo = crea('div', 'talos-card talos-activity talos-passi');
  nodo.hidden = true;
  let stato = null;
  let aperta = true;
  let chiusaDallaPersona = false;
  let sessione = null; // di chi è la lista

  function riga(voce) {
    const passo = COME_A_SCHERMO[voce.stato] ?? 'no';
    const fila = crea('div', 'talos-tool-row');
    fila.dataset.c = 'ToolRow'; fila.dataset.passo = passo;
    const icona = crea('span', 'talos-tool-row__icon');
    if (passo === 'fatto') icona.append(simbolo('i-check', 'i'));
    else if (passo === 'annullato') icona.append(simbolo('i-x', 'i'));
    else if (passo === 'ora') icona.append(crea('span', 'talos-dot talos-dot--live'));
    else icona.append(crea('span', 'passo-vuoto'));
    const nome = crea('span', `talos-tool-row__name${passo === 'ora' ? ' talos-waiting__label' : ''}`, voce.testo);
    const dettaglio = crea('span', 'talos-tool-row__detail');
    if (passo === 'ora' && Number.isFinite(voce.iniziatoAl)) dettaglio.dataset.attivitaDa = String(voce.iniziatoAl);
    else if (Number.isFinite(voce.iniziatoAl) && Number.isFinite(voce.finitoAl)) dettaglio.textContent = o.durata?.(Math.max(0, voce.finitoAl - voce.iniziatoAl)) ?? '';
    fila.append(icona, nome, dettaglio);
    return fila;
  }

  function disegna() {
    const voci = stato?.voci ?? [];
    nodo.hidden = voci.length === 0;
    const contate = voci.filter((v) => v.stato !== 'cancelled');
    const testa = crea('button', 'talos-activity__head');
    testa.type = 'button';
    testa.setAttribute('aria-expanded', String(aperta));
    testa.append(simbolo('i-chev', 'i talos-activity__chev'), crea('span', 'talos-grow', traduci('sezioni.passi.head', { fatti: contate.filter((v) => v.stato === 'completed').length, totale: contate.length })));
    testa.addEventListener('click', () => { aperta = !aperta; chiusaDallaPersona = !aperta; disegna(); });
    const corpo = crea('div', 'talos-activity__body');
    corpo.hidden = !aperta;
    const { visibili, resto } = finestraPassi(voci);
    corpo.append(...visibili.map(riga));
    if (resto > 0) corpo.append(crea('div', 'passi-altri', traduci('sezioni.passi.more', { n: resto })));
    nodo.replaceChildren(testa, corpo);
    if (aperta && voci.some((v) => v.stato === 'in_progress')) o.quandoCorre?.();
  }

  function azzera() { stato = null; sessione = null; aperta = true; chiusaDallaPersona = false; disegna(); }

  return {
    nodo,
    /** @param {string|null} [diSessione] la sessione dell'evento: la revisione si confronta solo dentro la stessa */
    aggiorna(nuovo, diSessione = null) {
      if (!nuovo || !Array.isArray(nuovo.voci) || !Number.isSafeInteger(nuovo.revisione)) return false;
      if (stato && diSessione === sessione && nuovo.revisione <= stato.revisione) return false;
      if (diSessione !== sessione) chiusaDallaPersona = false;
      sessione = diSessione;
      stato = nuovo;
      if (aperteDi(nuovo.voci).length && !chiusaDallaPersona) aperta = true;
      disegna();
      return true;
    },
    /** A lista finita si chiude da sola; la prossima lista la riapre. */
    fineGiro() {
      if (!stato?.voci.length || aperteDi(stato.voci).length) return;
      aperta = false; chiusaDallaPersona = false;
      disegna();
    },
    azzera,
    /** Per le chat tenute pronte: la lista parte con la chat e torna con lei, senza rigiocata. */
    istantanea: () => (stato ? { sessione, stato, aperta, chiusaDallaPersona } : null),
    ripristina(presa) {
      if (!presa?.stato) { azzera(); return; }
      ({ sessione, stato, aperta, chiusaDallaPersona } = presa);
      disegna();
    },
  };
}

/** Le chiamate di `steps_update` non stanno nell'elenco degli strumenti: la lista è già sopra la riga viva, e l'elenco non cambia. */
export function creaFiltroChiamatePassi() {
  const chiamate = new Set();
  return (evento) => {
    if (evento?.type === 'ToolCallStart' && evento.toolCallName === NOME_PASSI) { chiamate.add(evento.toolCallId); return true; }
    return typeof evento?.toolCallId === 'string' && chiamate.has(evento.toolCallId);
  };
}
