/*
 * Owner 29/10/2026 sera: «se fermo la chat i sub agenti non si fermano, bisogna mettere un avviso se stoppare solo la chat o anche i sub
 * agenti». Scelta sua: con sotto-agenti al lavoro lo Stop apre un piccolo menu sopra di sé — «Ferma tutto (la chat e N agenti)» in
 * evidenza, «Ferma solo la chat», e «Ricorda la scelta» — senza agenti lo Stop resta immediato come oggi. Contratto
 * `CONTRATTO-FERMA-TUTTE-2026-10-29.md`: la scelta viaggia come `figlie: 'tutte' | 'nessuna'` fino a `sessionRegistry.ferma`.
 * Riferimenti: Hermes ferma sempre anche le figlie (`agent/interrupt_control.py:257-265`); Claude Code issue 33434 chiede il menu.
 *
 * Il menu è quello comune dell'app (`apriMenuContestuale`, schede.js), con le voci che portano una riga d'aiuto: nessun pezzo nuovo
 * tranne la casella «Ricorda la scelta» in fondo, fatta coi controlli del sistema di design.
 */
import { apriMenuContestuale } from './schede.js';
import { t } from './lingua.js';

/** Le tre preferenze ammesse; ogni altro valore vale «chiedi». */
export const SCELTE_STOP = Object.freeze(['chiedi', 'tutte', 'solo-chat']);

export function sceltaStop(preferenza) {
  return SCELTE_STOP.includes(preferenza) ? preferenza : 'chiedi';
}

/**
 * Che cosa fa lo Stop adesso. `agentiVivi` = le figlie al lavoro (la stessa sorgente del pannello Agenti).
 * ⇒ `{ chiedi: true }` apre il menu; altrimenti `{ chiedi: false, figlie }` si manda subito (`null` = il corpo di oggi, senza campo).
 */
export function decidiStop({ agentiVivi = 0, preferenza } = {}) {
  if (!(Number.isInteger(agentiVivi) && agentiVivi > 0)) return { chiedi: false, figlie: null };
  const scelta = sceltaStop(preferenza);
  if (scelta === 'tutte') return { chiedi: false, figlie: 'tutte' };
  if (scelta === 'solo-chat') return { chiedi: false, figlie: 'nessuna' };
  return { chiedi: true, figlie: null };
}

/** Le due voci, con la riga d'aiuto: la prima ferma tutto ed è quella che prende il fuoco. */
export function vociMenuStop(agentiVivi) {
  const n = Math.max(0, Number(agentiVivi) || 0);
  return [
    { figlie: 'tutte', testo: t('app.stopMenu.all'), aiuto: t(n === 1 ? 'app.stopMenu.allHelpOne' : 'app.stopMenu.allHelpMany', { n }) },
    { figlie: 'nessuna', testo: t('app.stopMenu.chatOnly'), aiuto: t('app.stopMenu.chatOnlyHelp') },
  ];
}

/**
 * Apre il menu sopra lo Stop. `onScelta({ figlie, ricorda })` riceve la scelta; chiudere senza scegliere non ferma niente.
 * @param {HTMLElement} menu il nodo del menu comune (`.talos-context-menu`)
 * @param {{ ancora: HTMLElement, agentiVivi: number, onScelta: Function, chiudi?: Function, finestra?: Window }} opzioni
 */
export function apriMenuStop(menu, { ancora, agentiVivi, onScelta, chiudi = () => {}, finestra = globalThis }) {
  const documento = menu.ownerDocument || globalThis.document;
  let ricorda = false;
  const scegli = (figlie) => onScelta?.({ figlie, ricorda });
  const r = ancora?.getBoundingClientRect?.() ?? { right: 0, top: 0 };
  apriMenuContestuale(menu, {
    titolo: t(agentiVivi === 1 ? 'app.stopMenu.titleOne' : 'app.stopMenu.titleMany', { n: agentiVivi }),
    voci: vociMenuStop(agentiVivi).map((v) => [v.testo, () => scegli(v.figlie), true, v.aiuto]),
    x: r.right - 260, y: r.top - 8, chiudi, finestra,
  });
  /* owner: «Ferma tutto» in evidenza — la prima voce è la principale (ha anche il fuoco, `apriMenuContestuale`) */
  menu.querySelector('[role=menuitem]')?.classList.add('talos-context-menu__voce--primaria');
  /* la casella in fondo: un'etichetta del sistema di design, mai un pulsante in più */
  const etichetta = documento.createElement('label');
  etichetta.className = 'talos-context-menu__ricorda';
  const casella = documento.createElement('input');
  casella.type = 'checkbox';
  casella.addEventListener('change', () => { ricorda = casella.checked; });
  etichetta.append(casella, documento.createTextNode(` ${t('app.stopMenu.remember')}`));
  menu.append(etichetta);
  /* il menu si apre SOPRA lo Stop (è in fondo alla finestra): si risistema dopo aver misurato la sua altezza vera */
  const altezza = menu.offsetHeight || 160;
  menu.style.top = `${Math.max(8, r.top - altezza - 8)}px`;
  menu.classList.add('talos-context-menu--sopra-stop');
  return menu;
}
