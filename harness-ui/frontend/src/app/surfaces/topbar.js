import { createTabs } from '../../design-system/index.js';
import { ACTIONS } from '../../state/actions.js';
import { selectSessionHeader } from '../../state/selectors.js';

/*
 * La Topbar: ottava superficie dell'estrazione, e l'ultimo pezzo dello schermo
 * principale (sidebar · topbar · conversazione · inspector · barra di stato).
 *
 * Porta quello che il mockup approvato le dà: il titolo della sessione, il
 * percorso del workspace, le viste della sessione (Chat · Terminale · Review,
 * col loro conteggio) e le azioni.
 *
 * ⛔⛔ Il percorso, dalla ricerca del 05/09/2026: si tronca AL CENTRO, perché
 * di un percorso contano la testa (quale disco, quale casa) e la coda (la
 * cartella vera); tagliarne uno dei due lo rende inutile. E ogni troncatura
 * deve venire con l'accesso al testo intero — ma NON solo col `title`, che
 * sulle superfici tattili non esiste, che le traduzioni del browser saltano e
 * su cui le tecnologie assistive non si possono fare affidamento. ⇒ Il
 * percorso intero è **testo vero** in uno `<span class="sr-only">`; il `title`
 * resta in più, per il mouse.
 * Fonti: primer.style/product/components/truncate/accessibility/ ·
 * designsystem.maersk.com/content/truncation/ ·
 * bennadel.com/blog/3624-reconsidering-text-overflow-ellipsis-as-a-design-smell-and-accessibility-concern.htm
 *
 * ⛔ Un workspace che è la RADICE di un disco resta corto e quindi ben
 * visibile: è voluto. Il 02/09 una sessione girava con il Desktop intero come
 * workspace e il 04/09 un'altra con `C:\` — accorciare quel percorso «per
 * bellezza» nasconderebbe l'unica cosa che va vista.
 *
 * ⛔ Il titolo è un `<h1>` e cambia quando cambia sessione. Non si annuncia:
 * non è una regione live (stessa regola della barra di stato) — chi naviga per
 * intestazioni lo raggiunge, e chi cambia sessione lo ha appena fatto apposta.
 */
const TESTA_MINIMA = 12;
const CODA_MINIMA = 18;

/**
 * Tronca un percorso al centro tenendo testa e coda.
 * ⛔ Se non c'è spazio per entrambe non si tronca a caso: si torna il percorso
 * intero. Un percorso illeggibile è peggio di un percorso lungo.
 */
export function troncaAlCentro(percorso, massimo = 48) {
  const testo = String(percorso ?? '');
  if (testo.length <= massimo) return testo;
  if (massimo < TESTA_MINIMA + CODA_MINIMA + 1) return testo;
  const coda = Math.max(CODA_MINIMA, Math.ceil((massimo - 1) / 2));
  const testa = massimo - 1 - coda;
  return `${testo.slice(0, testa)}…${testo.slice(testo.length - coda)}`;
}

export function createTopbarSurface({ documentObj, store, labels, testId, azioni }) {
  if (!documentObj || !store) throw new TypeError('dipendenze topbar mancanti');
  if (!labels || !Array.isArray(labels.views) || labels.views.length === 0) {
    throw new TypeError('la topbar richiede le sue etichette (views)');
  }

  const radice = documentObj.createElement('header');
  radice.className = 'talos-topbar';
  radice.setAttribute('aria-label', labels.regionLabel || 'Intestazione della sessione');
  if (testId) radice.dataset.testid = testId;

  const bloccoTitolo = documentObj.createElement('div');
  bloccoTitolo.className = 'talos-topbar__title';
  const titolo = documentObj.createElement('h1');
  bloccoTitolo.append(titolo);

  const percorso = documentObj.createElement('span');
  percorso.className = 'talos-topbar__path';
  const percorsoVisibile = documentObj.createElement('span');
  percorsoVisibile.setAttribute('aria-hidden', 'true');
  const percorsoIntero = documentObj.createElement('span');
  percorsoIntero.className = 'sr-only';
  percorso.append(percorsoVisibile, percorsoIntero);

  const zonaAzioni = documentObj.createElement('div');
  zonaAzioni.className = 'talos-topbar__actions';
  for (const azione of azioni || []) zonaAzioni.append(azione.element ?? azione);

  const viste = createTabs({
    document: documentObj,
    label: labels.viewsLabel || 'Viste della sessione',
    items: labels.views.map((vista) => ({ id: vista.id, label: vista.label })),
    value: labels.views[0].id,
    activation: 'manual',
    onChange: (id) => store.dispatch({ type: ACTIONS.ROUTE_CHANGED, payload: { route: id } }),
    testId: testId ? `${testId}-views` : undefined,
  });

  radice.append(bloccoTitolo, percorso, viste.element, zonaAzioni);

  let props = { workspace: null, counts: {} };

  function disegnaPercorso() {
    const grezzo = props.workspace;
    if (!grezzo) {
      // ⛔ Nessun workspace non è una cartella vuota: si dice.
      percorsoVisibile.textContent = labels.noWorkspace || '';
      percorsoIntero.textContent = labels.noWorkspace || '';
      percorso.removeAttribute('title');
      delete percorso.dataset.radice;
      return;
    }
    percorsoVisibile.textContent = troncaAlCentro(grezzo, labels.pathMax || 48);
    // Il testo intero è VERO, non solo un attributo: la traduzione lo raggiunge
    // e chi ascolta lo sente per intero.
    percorsoIntero.textContent = grezzo;
    percorso.setAttribute('title', grezzo);
    // Una radice di disco resta segnata: è un fatto che va guardato, non nascosto.
    if (/^[A-Za-z]:[\\/]?$/.test(grezzo.trim())) percorso.dataset.radice = 'si';
    else delete percorso.dataset.radice;
  }

  function disegna({ title, status }) {
    // ⛔ Titolo assente: si scrive la frase della sessione nuova, mai un id.
    titolo.textContent = title || labels.untitled || '';
    if (title) titolo.setAttribute('title', title);
    else titolo.removeAttribute('title');
    radice.dataset.stato = String(status || '');
    disegnaPercorso();
    const rotta = store.getState().layout.route;
    viste.update({
      value: labels.views.some((v) => v.id === rotta) ? rotta : labels.views[0].id,
      items: labels.views.map((vista) => ({
        id: vista.id,
        label: vista.label,
        count: props.counts?.[vista.id],
        countUnit: vista.countUnit,
      })),
    });
  }

  const unsubscribeHeader = store.subscribe(selectSessionHeader, disegna, { equal: Object.is });
  const unsubscribeRotta = store.subscribe(
    (state) => state.layout.route,
    () => disegna(selectSessionHeader(store.getState())),
    { equal: Object.is },
  );

  let distrutta = false;
  return Object.freeze({
    element: radice,
    update(nextProps = {}) {
      props = { ...props, ...nextProps };
      disegna(selectSessionHeader(store.getState()));
    },
    destroy() {
      if (distrutta) return false;
      distrutta = true;
      unsubscribeHeader();
      unsubscribeRotta();
      viste.destroy();
      radice.remove();
      return true;
    },
  });
}
