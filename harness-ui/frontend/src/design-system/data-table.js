import { defineComponent } from '../ui/component.js';

/*
 * DataTable — la Board: sessioni a righe, con le colonne che spiegano il costo.
 *
 * ⛔ Ricerca del 04/09/2026, cinque vincoli che il codice ora impone:
 *  1. il nome della tabella e' un `<caption>` VISIBILE, non un `aria-label`:
 *     serve a tutti, e sopravvive alla traduzione;
 *  2. `scope="col"` su ogni intestazione, altrimenti chi ascolta non sa a
 *     quale colonna appartiene il valore su cui si trova;
 *  3. una colonna ordinabile ha un `<button>` VERO dentro il `<th>` — cosi'
 *     si raggiunge con Tab e si attiva con Invio o Spazio;
 *  4. `aria-sort` sta sul `<th>`, non sul pulsante, e vale solo per la colonna
 *     attiva: metterlo su tutte annuncia «non ordinato» su ognuna;
 *  5. la freccia e' `aria-hidden`: lo stato lo dice gia' `aria-sort`, e senza
 *     questo viene annunciato due volte.
 * Fonti: developer.mozilla.org/en-US/docs/Web/Accessibility/ARIA/Reference/Attributes/aria-sort ·
 * botmonster.com/web-dev/accessible-data-table-sorting-filtering-keyboard-navigation/ ·
 * accessibility.build/guides/accessible-data-tables
 */
const VERSI = new Set(['ascending', 'descending']);

export const createDataTable = defineComponent('DataTable', (initialProps = {}) => {
  const documentObj = initialProps.document || globalThis.document;
  const guscio = documentObj.createElement('div');
  const tabella = documentObj.createElement('table');
  const didascalia = documentObj.createElement('caption');
  const testa = documentObj.createElement('thead');
  const corpo = documentObj.createElement('tbody');
  guscio.className = 'talos-table-wrap';
  tabella.className = 'talos-table';
  didascalia.className = 'talos-table__caption';
  tabella.append(didascalia, testa, corpo);
  guscio.append(tabella);

  let props = { columns: [], rows: [], ...initialProps };
  const ascoltatori = [];

  function pulisciAscoltatori() {
    for (const { nodo, fn } of ascoltatori.splice(0)) nodo.removeEventListener('click', fn);
  }

  function render() {
    if (!props.caption) throw new TypeError('DataTable richiede una didascalia: una tabella senza nome non si distingue');
    if (!Array.isArray(props.columns) || !props.columns.length) throw new TypeError('DataTable richiede almeno una colonna');
    const ordine = props.sort || null;
    if (ordine && !VERSI.has(ordine.direction)) throw new TypeError(`verso dell'ordinamento non valido: ${ordine.direction}`);
    if (ordine && !props.columns.some((c) => c.id === ordine.column)) {
      throw new TypeError(`ordinamento su una colonna che non esiste: ${ordine.column}`);
    }
    didascalia.textContent = String(props.caption);

    pulisciAscoltatori();
    const riga = documentObj.createElement('tr');
    for (const colonna of props.columns) {
      if (!colonna.id || !colonna.label) throw new TypeError('ogni colonna richiede id e label');
      const th = documentObj.createElement('th');
      th.setAttribute('scope', 'col');
      if (colonna.align === 'end') th.className = 'num';
      if (colonna.sortable) {
        // ⛔ `aria-sort` SOLO sulla colonna attiva: su tutte annuncerebbe
        // «non ordinato» a ogni intestazione.
        if (ordine && ordine.column === colonna.id) th.setAttribute('aria-sort', ordine.direction);
        const bottone = documentObj.createElement('button');
        bottone.type = 'button';
        bottone.className = 'talos-table__sort';
        // Etichetta e freccia sono due nodi: scrivere `textContent` e poi
        // appendere la freccia funziona solo perche' textContent cancella i
        // figli, ed e' la stessa fragilita' gia' vista in nav-item.js.
        const nome = documentObj.createElement('span');
        nome.textContent = String(colonna.label);
        bottone.append(nome);
        const freccia = documentObj.createElement('span');
        freccia.className = 'talos-table__arrow';
        freccia.setAttribute('aria-hidden', 'true');
        freccia.textContent = ordine && ordine.column === colonna.id
          ? (ordine.direction === 'ascending' ? '↑' : '↓')
          : '';
        bottone.append(freccia);
        const fn = () => {
          if (typeof props.onSort !== 'function') return;
          const verso = ordine && ordine.column === colonna.id && ordine.direction === 'ascending' ? 'descending' : 'ascending';
          props.onSort({ column: colonna.id, direction: verso });
          if (typeof props.announce === 'function') {
            props.announce(`${colonna.label}, ${verso === 'ascending' ? props.ascendingWord || 'crescente' : props.descendingWord || 'decrescente'}`);
          }
        };
        bottone.addEventListener('click', fn);
        ascoltatori.push({ nodo: bottone, fn });
        th.append(bottone);
      } else {
        th.textContent = String(colonna.label);
      }
      riga.append(th);
    }
    testa.replaceChildren(riga);

    const righe = Array.isArray(props.rows) ? props.rows : [];
    corpo.replaceChildren(...righe.map((datiRiga) => {
      const tr = documentObj.createElement('tr');
      for (const colonna of props.columns) {
        const cella = datiRiga.cells ? datiRiga.cells[colonna.id] : undefined;
        // La prima colonna e' l'intestazione della RIGA: cosi' chi ascolta sa
        // sempre di quale sessione sta leggendo i numeri.
        const elemento = colonna.rowHeader ? documentObj.createElement('th') : documentObj.createElement('td');
        if (colonna.rowHeader) elemento.setAttribute('scope', 'row');
        if (colonna.align === 'end') elemento.className = 'num';
        if (cella && typeof cella === 'object' && cella.nodeType === 1) elemento.append(cella);
        else elemento.textContent = cella === undefined || cella === null ? '' : String(cella);
        tr.append(elemento);
      }
      return tr;
    }));
    if (props.testId) guscio.dataset.testid = props.testId;
  }

  render();
  return {
    element: guscio,
    update(nextProps = {}) { props = { ...props, ...nextProps }; render(); },
    destroy() { pulisciAscoltatori(); guscio.remove(); },
  };
});
