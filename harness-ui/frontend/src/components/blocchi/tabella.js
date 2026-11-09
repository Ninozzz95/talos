/*
 * Il disegnatore della `tabella` (interfaccia generativa, catalogo v1). Copiata dal bozzetto approvato
 * (`frontend/in-corso/bozzetto-ui-generativa/pc.js:22-29`, `stile-pc.css:21-30`): la tabella di oggi `md-table` dentro `md-table-wrap`
 * (`components/markdown.js`), la barra col campo `talos-field__input` «Filtra le righe» e il conteggio «N di M righe», le intestazioni
 * che ordinano con un pulsante dentro il `th`.
 * ⛔ Lo STATO (filtro e ordine) sta fuori dai dati (forma §3, misura 3 su 3): `statoTabella()` si passa a ogni vista dello stesso
 *   blocco (in linea, a lato, a tutto schermo) e un cambio in una le ridisegna tutte.
 * ⛔ `aria-sort` sta sul `th` e si RICAVA dallo stato a ogni cambio (W3C APG «Sortable Table», letto il 02/11/2026); i pulsanti non si
 *   ricreano, così il fuoco resta su quello premuto.
 */
import { t, tn } from '../lingua.js';
import { el, eNumerica, linguaDeiNumeri, lista, testoDelValore } from './comune.js';

/** Lo stato condiviso fra le viste di una tabella. */
export function statoTabella() {
  const ascoltatori = new Set();
  const stato = {
    filtro: '',
    ordine: null, // { colonna: indice, verso: 1 | -1 }
    ascolta(fn) { ascoltatori.add(fn); return () => ascoltatori.delete(fn); },
    cambia(modifica) { modifica(stato); for (const fn of [...ascoltatori]) fn(); },
    get ascoltatori() { return ascoltatori.size; },
  };
  return stato;
}

const minuscolo = (s) => String(s).toLocaleLowerCase(linguaDeiNumeri());

/** Le righe visibili: filtrate su ogni cella e ordinate; i vuoti in fondo in tutti e due i versi. */
export function righeVisibili(blocco, stato) {
  const colonne = lista(blocco.colonne);
  const righe = lista(blocco.righe);
  const filtro = minuscolo(stato?.filtro || '').trim();
  let fuori = filtro ? righe.filter((r) => lista(r).some((c, i) => c !== null && minuscolo(testoDelValore(c, colonne[i]?.tipo)).includes(filtro))) : righe.slice();
  const ordine = stato?.ordine;
  if (ordine && ordine.colonna >= 0 && ordine.colonna < colonne.length) {
    const i = ordine.colonna;
    const confronta = new Intl.Collator(linguaDeiNumeri(), { numeric: true, sensitivity: 'base' });
    fuori = fuori
      .map((r, posto) => ({ r, posto }))
      .sort((a, b) => {
        const x = a.r[i], y = b.r[i];
        if (x === null || x === undefined) return (y === null || y === undefined) ? a.posto - b.posto : 1;
        if (y === null || y === undefined) return -1;
        const d = typeof x === 'number' && typeof y === 'number' ? x - y : confronta.compare(String(x), String(y));
        return d === 0 ? a.posto - b.posto : d * ordine.verso;
      })
      .map((x) => x.r);
  }
  return fuori;
}

/**
 * @param {object} blocco l'albero del lettore (`tipo: 'tabella'`), anche parziale mentre arriva
 * @param {{ document: Document, stato?: ReturnType<typeof statoTabella>, interattivo?: boolean }} opzioni
 *   `interattivo: false` mentre il blocco arriva: filtro spento, intestazioni senza pulsante
 */
export function disegnaTabella(blocco, { document: doc, stato = statoTabella(), interattivo = true } = {}) {
  const colonne = lista(blocco.colonne);
  const radice = el(doc, 'div', 'gu-tabella');
  let campo = null, conta = null;
  if (blocco.filtrabile) {
    const barra = el(doc, 'div', 'gu-barra');
    campo = el(doc, 'input', 'talos-field__input');
    campo.type = 'search';
    campo.setAttribute('placeholder', t('blocchi.table.filter'));
    campo.setAttribute('aria-label', t('blocchi.table.filterLabel'));
    campo.setAttribute('autocomplete', 'off');
    campo.value = stato.filtro;
    campo.disabled = !interattivo;
    conta = el(doc, 'span', 'gu-conta');
    conta.setAttribute('aria-live', 'polite');
    barra.append(campo, conta);
    radice.append(barra);
    campo.addEventListener('input', () => { const v = campo.value; stato.cambia((s) => { s.filtro = v; }); });
  }
  const contenitore = el(doc, 'div', 'md-table-wrap');
  const tabella = el(doc, 'table', 'md-table');
  const testa = el(doc, 'thead');
  const rigaTesta = el(doc, 'tr');
  const intestazioni = colonne.map((c, i) => {
    const th = el(doc, 'th', eNumerica(c.tipo) ? 'num gu-num' : '');
    th.setAttribute('scope', 'col');
    if (blocco.ordinabile && interattivo) {
      const b = el(doc, 'button');
      b.type = 'button';
      b.dataset.ordina = String(i);
      const nome = el(doc, 'span', '', c.titolo);
      const freccia = el(doc, 'span', 'gu-freccia');
      freccia.setAttribute('aria-hidden', 'true');
      b.append(nome, freccia);
      b.addEventListener('click', () => stato.cambia((s) => {
        const stessa = s.ordine?.colonna === i;
        s.ordine = { colonna: i, verso: stessa ? -s.ordine.verso : (eNumerica(c.tipo) ? -1 : 1) };
      }));
      th.append(b);
      return { th, freccia };
    }
    th.textContent = c.titolo ?? '';
    return { th, freccia: null };
  });
  rigaTesta.append(...intestazioni.map((x) => x.th));
  testa.append(rigaTesta);
  const corpo = el(doc, 'tbody');
  tabella.append(testa, corpo);
  contenitore.append(tabella);
  radice.append(contenitore);

  function aggiorna() {
    const tutte = lista(blocco.righe);
    const visibili = righeVisibili(blocco, stato);
    const righe = visibili.map((r) => {
      const tr = el(doc, 'tr');
      colonne.forEach((c, i) => { tr.append(el(doc, 'td', eNumerica(c.tipo) ? 'num gu-num' : '', testoDelValore(lista(r)[i], c.tipo))); });
      return tr;
    });
    if (righe.length === 0 && colonne.length > 0) {
      const tr = el(doc, 'tr');
      const td = el(doc, 'td', 'talos-muted', tutte.length ? t('blocchi.table.noMatch') : (interattivo ? t('blocchi.table.empty') : ''));
      td.setAttribute('colspan', String(colonne.length));
      tr.append(td);
      righe.push(tr);
    }
    corpo.replaceChildren(...righe);
    if (conta) conta.textContent = tn('blocchi.table.countOne', 'blocchi.table.countMany', tutte.length, { n: visibili.length, total: tutte.length });
    if (campo && campo.value !== stato.filtro) campo.value = stato.filtro;
    intestazioni.forEach(({ th, freccia }, i) => {
      const su = stato.ordine?.colonna === i ? (stato.ordine.verso > 0 ? 'ascending' : 'descending') : null;
      if (!freccia) return;
      if (su) th.setAttribute('aria-sort', su); else th.removeAttribute('aria-sort');
      freccia.textContent = su === 'ascending' ? '▲' : su === 'descending' ? '▼' : '';
    });
  }
  aggiorna();
  if (interattivo) {
    let vista = false;
    const smetti = stato.ascolta(() => {
      // una vista tolta dalla pagina (il blocco chiuso a lato, il ridisegno a fine arrivo) smette di ascoltare
      if (radice.isConnected) vista = true; else if (vista) { smetti(); return; }
      aggiorna();
    });
    radice._smetti = smetti;
  }
  return radice;
}
