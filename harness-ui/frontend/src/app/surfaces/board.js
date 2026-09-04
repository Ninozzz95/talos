import { createDataTable, createMeasure, createStatusDot, PALLINO_PER_STATO_SESSIONE } from '../../design-system/index.js';
import { selectSidebar } from '../../state/selectors.js';
import { tonoDelloStato } from './sidebar.js';

/*
 * La Board: terza superficie dell'estrazione (fase 4).
 *
 * Le tre colonne che nessun concorrente mostra DENTRO il prodotto — tasso di
 * cache, tempo al primo token, motivo di chiusura — arrivano da
 * `GET /api/v1/sessions/:id/metrics`, derivate dagli eventi già persistiti.
 *
 * ⛔ La regola che governa questa superficie, trovata nei dati veri
 * (73 sessioni, 60.437 eventi) e confermata dalla ricerca del 04/09/2026:
 * **«zero misurato» e «non misurato» non si scrivono nello stesso modo.**
 * `0` significa «abbiamo misurato, ed è zero». La mancanza di misura si
 * scrive con un segno suo (`—`) e porta con sé il MOTIVO, che il backend
 * fornisce già a parole. Trasformare un `null` in `0` per far tornare una
 * colonna è inventare una risposta: sui dati veri il tempo al primo token è
 * assente 73 volte su 73, perché gli eventi persistiti non portano un orario.
 * Fonti: sqlism.com/null-vs-blank-vs-zero-sql-reporting ·
 * dataabinitio.com/?p=410 («0 rappresenta sempre uno zero vero e nient'altro»)
 */
const SEGNO_NON_MISURATO = '—';

/** Una cella che dice «non misurato» e PERCHÉ, invece di fingere uno zero. */
function cellaNonMisurata(documentObj, motivo, parola) {
  const span = documentObj.createElement('span');
  span.className = 'talos-board__unmeasured';
  const segno = documentObj.createElement('span');
  segno.setAttribute('aria-hidden', 'true');
  segno.textContent = SEGNO_NON_MISURATO;
  const detto = documentObj.createElement('span');
  detto.className = 'sr-only';
  detto.textContent = parola || 'non misurato';
  span.append(segno, detto);
  if (motivo) span.setAttribute('title', String(motivo));
  return span;
}

export function createBoardSurface({ documentObj, store, labels, testId }) {
  if (!documentObj || !store) throw new TypeError('dipendenze board mancanti');
  if (!labels || !labels.caption || !labels.columns || !labels.unmeasured) {
    throw new TypeError('la board richiede le sue etichette (caption, columns, unmeasured)');
  }

  let props = { metricsById: {}, sort: null };
  let componenti = [];

  function pulisci() {
    for (const componente of componenti) componente.destroy();
    componenti = [];
  }

  function cellaCache(metriche) {
    const cache = metriche?.cache;
    if (!cache || cache.percentuale === null || cache.percentuale === undefined) {
      return cellaNonMisurata(documentObj, cache?.motivoAssente || metriche?.motivo, labels.unmeasured);
    }
    // ⛔ Una percentuale MISURATA, anche se è zero: è un numero vero.
    const misura = createMeasure({
      document: documentObj,
      value: String(cache.percentuale),
      unit: '%',
      provenance: 'measured',
    });
    componenti.push(misura);
    return misura.element;
  }

  function cellaPrimoToken(metriche) {
    const primo = metriche?.primoToken;
    if (!primo || primo.ms === null || primo.ms === undefined) {
      return cellaNonMisurata(documentObj, primo?.motivoAssente || metriche?.motivo, labels.unmeasured);
    }
    const misura = createMeasure({
      document: documentObj,
      value: (primo.ms / 1000).toFixed(1).replace('.', ','),
      unit: 's',
      provenance: 'measured',
    });
    componenti.push(misura);
    return misura.element;
  }

  function cellaChiusura(metriche) {
    const chiusura = metriche?.chiusura;
    if (!chiusura || !chiusura.motivo) {
      return cellaNonMisurata(documentObj, chiusura?.motivoAssente || metriche?.motivo, labels.stillRunning || labels.unmeasured);
    }
    const span = documentObj.createElement('span');
    span.textContent = labels.closeReasons?.[chiusura.motivo] || chiusura.motivo;
    // ⛔ Il codice grezzo del fornitore resta consultabile: un motivo
    // normalizzato senza il suo codice non si può verificare.
    if (chiusura.codice) span.setAttribute('title', String(chiusura.codice));
    return span;
  }

  function cellaStato(sessione) {
    const tono = tonoDelloStato(sessione.status);
    const contenitore = documentObj.createElement('span');
    contenitore.className = 'talos-board__status';
    const punto = createStatusDot({
      document: documentObj,
      // ⛔ Lo stato della sessione e il tono del pallino sono due vocabolari
      // diversi: `done` non è `success`. La traduzione sta in un posto solo.
      tone: (tono && PALLINO_PER_STATO_SESSIONE.get(tono)) || 'neutral',
      size: 'sm',
    });
    componenti.push(punto);
    const testo = documentObj.createElement('span');
    // Stato sconosciuto: testo grezzo, mai una traduzione inventata.
    testo.textContent = tono ? (labels.status?.[tono] || sessione.status) : String(sessione.status || SEGNO_NON_MISURATO);
    contenitore.append(punto.element, testo);
    return contenitore;
  }

  const tabella = createDataTable({
    document: documentObj,
    caption: labels.caption,
    columns: labels.columns,
    rows: [],
    ascendingWord: labels.ascending,
    descendingWord: labels.descending,
    announce: (messaggio) => { if (typeof labels.announce === 'function') labels.announce(messaggio); },
    onSort: (ordine) => {
      props = { ...props, sort: ordine };
      disegna(store.getState() ? selectSidebar(store.getState()) : { items: [] });
    },
    testId,
  });

  function ordina(items) {
    const ordine = props.sort;
    if (!ordine) return items;
    const verso = ordine.direction === 'ascending' ? 1 : -1;
    const valore = (sessione) => {
      const metriche = props.metricsById[sessione.id];
      if (ordine.column === 'giri') return Number(metriche?.giri ?? sessione.turns ?? -1);
      if (ordine.column === 'cache') return Number(metriche?.cache?.percentuale ?? -1);
      if (ordine.column === 'primoToken') return Number(metriche?.primoToken?.ms ?? -1);
      return String(sessione.title || sessione.id);
    };
    // ⛔ Chi non ha una misura finisce in FONDO in entrambi i versi: mettere i
    // «non misurato» in cima perché valgono -1 li farebbe sembrare i più bassi.
    return [...items].sort((a, b) => {
      const va = valore(a);
      const vb = valore(b);
      const mancaA = typeof va === 'number' && va < 0;
      const mancaB = typeof vb === 'number' && vb < 0;
      if (mancaA !== mancaB) return mancaA ? 1 : -1;
      if (typeof va === 'number') return (va - vb) * verso;
      return String(va).localeCompare(String(vb)) * verso;
    });
  }

  function disegna({ items }) {
    pulisci();
    const righe = ordina(Array.isArray(items) ? items : []).map((sessione) => {
      const metriche = props.metricsById[sessione.id] || null;
      return {
        cells: {
          sessione: sessione.title || sessione.name || sessione.id,
          stato: cellaStato(sessione),
          modello: sessione.model || cellaNonMisurata(documentObj, null, labels.unmeasured),
          giri: metriche?.giri ?? sessione.turns ?? cellaNonMisurata(documentObj, metriche?.motivo, labels.unmeasured),
          cache: cellaCache(metriche),
          primoToken: cellaPrimoToken(metriche),
          chiusura: cellaChiusura(metriche),
        },
      };
    });
    tabella.update({ rows: righe, sort: props.sort });
  }

  const unsubscribe = store.subscribe(selectSidebar, disegna, { equal: Object.is });

  let distrutta = false;
  return Object.freeze({
    element: tabella.element,
    update(nextProps = {}) {
      props = { ...props, ...nextProps };
      disegna(selectSidebar(store.getState()));
    },
    destroy() {
      if (distrutta) return false;
      distrutta = true;
      unsubscribe();
      pulisci();
      tabella.destroy();
      return true;
    },
  });
}
