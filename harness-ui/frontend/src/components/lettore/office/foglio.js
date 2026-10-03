/**
 * F5 File reader (26/09/2026) — EXCEL (.xlsx/.xlsm/.xls/.ods) in sola lettura, con SheetJS 0.20.3 (Apache-2.0, dal CDN
 * ufficiale come nel backend; decisione owner del 26/09). Si carica a parte (`/lettore-foglio.js`).
 *
 * ⛔ Niente HTML dal file: SheetJS legge i valori (il testo già formattato, `raw: false`, cioè quello che Excel mostra),
 *   e la tabella la costruiamo NOI, cella per cella, con `textContent` e le classi della Libreria (`.td-file-tabella`):
 *   nessuna cornice serve, e il foglio prende il tema di TALOS. Le formule non si ricalcolano (si mostra il valore
 *   salvato), le macro (`bookVBA: false`) non si leggono nemmeno.
 * ⛔ Tetti dichiarati: al più 1.000 righe e 100 colonne per foglio (`sheetRows` ferma la lettura; `!fullref` dice quante
 *   erano davvero), e lo si scrive sotto la tabella.
 */
import { t as traduci, elenco, linguaCorrenteDiT } from '../../lingua.js';
import * as XLSX from 'xlsx';

/* I numeri seguono la lingua dell'interfaccia (italiano → it-IT, inglese → en-US), letta a ogni uso. */
const localeUI = () => (linguaCorrenteDiT() === 'en' ? 'en-US' : 'it-IT');

export const MASSIMO_RIGHE = 1000;
export const MASSIMO_COLONNE = 100;

/*
 * ⛔ COME LO MOSTRA EXCEL IN ITALIANO (26/09, foto sul 4174: «1/13/26» e «49.9»). SheetJS formatta all'inglese:
 *   - la DATA BREVE (codice 14, «m/d/yy») è quella che Excel adatta alla lingua del sistema; `dateNF` la sostituisce
 *     (docs.sheetjs.com, «Parse options» e «Number Formats», lette il 26/09/2026) ⇒ «gg/mm/aaaa»;
 *   - nei codici di formato «.» e «,» sono SEGNAPOSTO (decimali e migliaia) che Excel disegna coi simboli del sistema:
 *     SheetJS non ha una lingua, quindi sulle sole celle NUMERICHE che non sono date si scambiano i due simboli
 *     (49.9 → 49,9; 1,234.50 → 1.234,50). Il testo e le date restano come sono.
 */
export const DATA_BREVE = 'dd/mm/yyyy';
export function numeroAllItaliana(testo) {
  return String(testo).replace(/[.,]/gu, (c) => (c === '.' ? ',' : '.'));
}
function localizzaNumeri(foglio, libreria) {
  for (const [indirizzo, cella] of Object.entries(foglio)) {
    if (indirizzo.startsWith('!') || cella?.t !== 'n' || typeof cella.w !== 'string') continue;
    if (libreria.SSF.is_date(cella.z ?? 'General')) continue;
    cella.w = numeroAllItaliana(cella.w);
  }
}

/** Il modello della cartella: un elemento per foglio, coi soli testi da mostrare e le misure vere. */
export function modelloCartella(byte, libreria = XLSX) {
  const cartella = libreria.read(byte, { type: 'array', sheetRows: MASSIMO_RIGHE, cellFormula: false, cellHTML: false, cellStyles: false, bookVBA: false, cellDates: false, dateNF: DATA_BREVE });
  const stati = cartella.Workbook?.Sheets ?? [];
  return cartella.SheetNames.map((nome, i) => {
    const foglio = cartella.Sheets[nome];
    const riferimento = foglio?.['!fullref'] ?? foglio?.['!ref'];
    if (!riferimento) return { nome, nascosto: Boolean(stati[i]?.Hidden), righe: [], righeTotali: 0, colonneTotali: 0, primaRiga: 1, primaColonna: 0 };
    localizzaNumeri(foglio, libreria);
    const intero = libreria.utils.decode_range(riferimento);
    const righe = libreria.utils.sheet_to_json(foglio, { header: 1, raw: false, defval: '', blankrows: true })
      .map((riga) => riga.slice(0, MASSIMO_COLONNE).map((cella) => String(cella ?? '')));
    return {
      nome,
      nascosto: Boolean(stati[i]?.Hidden),
      righe,
      righeTotali: intero.e.r - intero.s.r + 1,
      colonneTotali: intero.e.c - intero.s.c + 1,
      primaRiga: intero.s.r + 1,
      primaColonna: intero.s.c,
    };
  });
}

/** «A», «B», … «AA»: il nome di una colonna, come lo scrive Excel. */
export function nomeColonna(indice, libreria = XLSX) {
  return libreria.utils.encode_col(indice);
}

/** Le frasi sotto una tabella tagliata. */
export function notaTaglio(foglio) {
  const pezzi = [];
  if (foglio.righeTotali > foglio.righe.length && foglio.righe.length >= MASSIMO_RIGHE) pezzi.push(traduci('varie.reader.sheet.firstRows', { shown: MASSIMO_RIGHE.toLocaleString(localeUI()), total: foglio.righeTotali.toLocaleString(localeUI()) }));
  if (foglio.colonneTotali > MASSIMO_COLONNE) pezzi.push(traduci('varie.reader.sheet.firstColumns', { shown: MASSIMO_COLONNE.toLocaleString(localeUI()), total: foglio.colonneTotali.toLocaleString(localeUI()) }));
  return pezzi.length ? traduci('varie.reader.sheet.cutNote', { parts: elenco(pezzi) }) : '';
}

function crea(doc, tag, classe, testo) {
  const nodo = doc.createElement(tag);
  if (classe) nodo.className = classe;
  if (testo !== undefined && testo !== null) nodo.textContent = String(testo);
  return nodo;
}

function tabella(doc, foglio) {
  const larghezza = Math.min(Math.max(foglio.colonneTotali, ...foglio.righe.map((r) => r.length), 0), MASSIMO_COLONNE);
  const scorre = crea(doc, 'div', 'td-file-tabella-scorre talos-lettore__tabella talos-lettore__griglia');
  scorre.tabIndex = 0;
  scorre.setAttribute('role', 'region');
  scorre.setAttribute('aria-label', traduci("varie.reader.sheet.regionLabel", { name: foglio.nome }));
  const t = crea(doc, 'table', 'td-file-tabella');
  const testa = crea(doc, 'thead');
  const tr = crea(doc, 'tr');
  tr.append(crea(doc, 'th', 'talos-lettore__angolo'));
  for (let c = 0; c < larghezza; c += 1) {
    const th = crea(doc, 'th', '', nomeColonna(foglio.primaColonna + c));
    th.scope = 'col';
    tr.append(th);
  }
  testa.append(tr);
  const corpo = crea(doc, 'tbody');
  foglio.righe.forEach((riga, r) => {
    const rigaNodo = crea(doc, 'tr');
    const numero = crea(doc, 'th', 'talos-lettore__numero-riga', foglio.primaRiga + r);
    numero.scope = 'row';
    rigaNodo.append(numero);
    for (let c = 0; c < larghezza; c += 1) rigaNodo.append(crea(doc, 'td', '', riga[c] ?? ''));
    corpo.append(rigaNodo);
  });
  t.append(testa, corpo);
  scorre.append(t);
  return scorre;
}

/** La resa: una linguetta per foglio (se sono più d'uno) e la tabella del foglio scelto. */
export async function rendi({ doc, byte }) {
  const fogli = modelloCartella(byte);
  const radice = crea(doc, 'div', 'talos-lettore__foglio');
  if (!fogli.length) {
    radice.append(crea(doc, 'p', 'talos-muted talos-lettore__attesa', traduci('varie.reader.sheet.noSheets')));
    return radice;
  }
  const pannello = crea(doc, 'div', 'talos-lettore__foglio-pannello');
  pannello.setAttribute('role', 'tabpanel');
  let scelto = Math.max(0, fogli.findIndex((f) => !f.nascosto));
  const linguette = crea(doc, 'div', 'td-segment talos-lettore__fogli');
  linguette.setAttribute('role', 'tablist');
  linguette.setAttribute('aria-label', traduci("varie.reader.sheet.tabsLabel"));
  const bottoni = fogli.map((foglio, i) => {
    const b = crea(doc, 'button', '', foglio.nascosto ? traduci('varie.reader.sheet.hiddenName', { name: foglio.nome }) : foglio.nome);
    b.type = 'button';
    b.setAttribute('role', 'tab');
    b.dataset.indice = String(i);
    linguette.append(b);
    return b;
  });
  const mostra = (i, fuoco = false) => {
    scelto = i;
    bottoni.forEach((b, j) => { b.setAttribute('aria-selected', String(j === i)); b.tabIndex = j === i ? 0 : -1; if (j === i && fuoco) b.focus(); });
    const foglio = fogli[i];
    const pezzi = foglio.righe.length ? [tabella(doc, foglio)] : [crea(doc, 'p', 'talos-muted talos-lettore__attesa', traduci('varie.reader.sheet.empty'))];
    const nota = notaTaglio(foglio);
    if (nota) pezzi.push(crea(doc, 'p', 'talos-lettore__nota', nota));
    pannello.replaceChildren(...pezzi);
  };
  linguette.addEventListener('click', (e) => { const b = e.target.closest?.('[data-indice]'); if (b) mostra(Number(b.dataset.indice)); });
  linguette.addEventListener('keydown', (e) => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) return;
    e.preventDefault();
    const n = fogli.length;
    mostra(e.key === 'Home' ? 0 : e.key === 'End' ? n - 1 : (scelto + (e.key === 'ArrowRight' ? 1 : -1) + n) % n, true);
  });
  if (fogli.length > 1) radice.append(linguette);
  radice.append(pannello);
  mostra(scelto);
  return radice;
}
