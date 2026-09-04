import {
  createNavGroup,
  createNavItem,
  createSessionItem,
} from '../../design-system/index.js';
import { ACTIONS } from '../../state/actions.js';
import { selectSidebar } from '../../state/selectors.js';

/*
 * La sidebar: primo pezzo dell'estrazione modulare (fase 4).
 *
 * ⛔ Non e' una copia del monolite: e' la struttura decisa nel redesign —
 * tre blocchi (azioni, luoghi, cronologia, decisione A1), massimo 5-7 luoghi
 * di primo livello (A2), e la larghezza che vive in un token (A9).
 *
 * ⛔ Lo stato dello stato: la sidebar NON tiene stato suo. Legge da
 * `selectSidebar` e scrive solo dispatchando azioni gia' esistenti
 * (SESSION_SELECTED, LAYOUT_UPDATED). Cosi' l'estrazione non inventa un
 * secondo posto dove vive la verita'.
 *
 * ⛔ Lo stato di una sessione che non conosciamo NON si traduce a caso: tono
 * neutro e il testo grezzo del server. Inventare «conclusa» su uno stato
 * sconosciuto sarebbe una bugia dell'interfaccia.
 */
const TONO_PER_STATO = new Map([
  ['running', 'live'], ['in-corso', 'live'], ['streaming', 'live'],
  ['waiting', 'waiting'], ['awaiting-approval', 'waiting'], ['aspetta', 'waiting'],
  ['done', 'done'], ['completed', 'done'], ['conclusa', 'done'],
  ['error', 'error'], ['failed', 'error'], ['conclusa-con-errore', 'error'],
  ['interrupted', 'interrupted'], ['stopped', 'interrupted'], ['interrotta', 'interrupted'],
]);

/** Il tono di uno stato, e `null` quando non lo conosciamo. */
export function tonoDelloStato(stato) {
  const chiave = String(stato || '').trim().toLowerCase().replace(/\s+/g, '-');
  return TONO_PER_STATO.get(chiave) || null;
}

export function createSidebarSurface({ documentObj, store, labels, testId }) {
  if (!documentObj || !store) throw new TypeError('dipendenze sidebar mancanti');
  if (!labels || !labels.places || !labels.sessions) throw new TypeError('la sidebar richiede le sue etichette: senza, i nomi finirebbero scritti nel codice');

  const nav = documentObj.createElement('nav');
  nav.className = 'talos-sidebar';
  nav.setAttribute('aria-label', labels.navigation || labels.places);
  if (testId) nav.dataset.testid = testId;

  const vociLuoghi = (labels.placeItems || []).map((luogo) => createNavItem({
    document: documentObj,
    label: luogo.label,
    count: luogo.count,
    countUnit: luogo.countUnit,
    current: false,
    testId: `sidebar-place-${luogo.id}`,
    onPress: () => store.dispatch({ type: ACTIONS.LAYOUT_UPDATED, payload: { values: { route: luogo.id } } }),
  }));
  const gruppoLuoghi = createNavGroup({
    document: documentObj,
    label: labels.places,
    items: vociLuoghi.map((voce) => voce.element),
  });

  const listaSessioni = documentObj.createElement('ul');
  listaSessioni.className = 'talos-nav-list talos-sidebar__sessions';
  const intestazioneSessioni = documentObj.createElement('div');
  intestazioneSessioni.className = 'talos-sidebar__block-head';
  const titoloSessioni = documentObj.createElement('span');
  titoloSessioni.className = 'talos-eyebrow';
  titoloSessioni.id = 'talos-sidebar-sessions-title';
  titoloSessioni.textContent = labels.sessions;
  intestazioneSessioni.append(titoloSessioni);
  listaSessioni.setAttribute('aria-labelledby', titoloSessioni.id);
  const blocco = documentObj.createElement('div');
  blocco.className = 'talos-sidebar__block';
  blocco.append(intestazioneSessioni, listaSessioni);
  nav.append(gruppoLuoghi.element, blocco);

  const vuoto = documentObj.createElement('p');
  vuoto.className = 'talos-sidebar__empty';
  vuoto.textContent = labels.empty || '';

  let sessioniMontate = new Map();

  function disegna({ items, activeId, route }) {
    for (const [id, componente] of sessioniMontate) {
      if (!items.some((sessione) => sessione.id === id)) {
        componente.destroy();
        sessioniMontate.delete(id);
      }
    }
    const ordinate = [];
    for (const sessione of items) {
      const stato = tonoDelloStato(sessione.status);
      const props = {
        title: sessione.title || sessione.name || sessione.id,
        // ⛔ Stato sconosciuto: tono neutro e testo grezzo, mai una traduzione inventata.
        status: stato || 'interrupted',
        statusLabel: stato ? (labels.status?.[stato] || sessione.status) : String(sessione.status || labels.unknownStatus || '—'),
        model: sessione.model || null,
        when: sessione.updatedAtLabel || null,
        turns: Number.isFinite(sessione.turns) ? sessione.turns : null,
        turnsUnit: labels.turnsUnit || 'giri',
        current: sessione.id === activeId,
      };
      let componente = sessioniMontate.get(sessione.id);
      if (componente) componente.update(props);
      else {
        componente = createSessionItem({
          document: documentObj,
          ...props,
          testId: `sidebar-session-${sessione.id}`,
          onPress: () => store.dispatch({ type: ACTIONS.SESSION_SELECTED, payload: { id: sessione.id } }),
        });
        sessioniMontate.set(sessione.id, componente);
      }
      ordinate.push(componente.element);
    }
    listaSessioni.replaceChildren(...ordinate);
    if (!items.length) blocco.append(vuoto);
    else vuoto.remove();
    for (const [i, voce] of vociLuoghi.entries()) {
      voce.update({ current: (labels.placeItems || [])[i]?.id === route });
    }
  }

  const unsubscribe = store.subscribe(selectSidebar, disegna, { equal: Object.is });

  let distrutta = false;
  return Object.freeze({
    element: nav,
    update() {},
    destroy() {
      if (distrutta) return false;
      distrutta = true;
      unsubscribe();
      for (const componente of sessioniMontate.values()) componente.destroy();
      sessioniMontate = new Map();
      for (const voce of vociLuoghi) voce.destroy();
      gruppoLuoghi.destroy();
      nav.remove();
      return true;
    },
  });
}
