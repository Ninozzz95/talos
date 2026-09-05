import template from '../index.template.html';
import { LUOGHI, LUOGHI_ALTRI, creaNavItem } from '../src/components/nav-item.js';
import { creaSessionItem } from '../src/components/session-item.js';
import { aggiornaTopbar } from '../src/components/topbar.js';
import { creaWorkspaceFooter } from '../src/components/workspace-footer.js';
import { CONTEGGI } from './fixtures/luoghi.js';
import { ADESSO, CORRENTE, FISSATE, SESSIONI } from './fixtures/sessioni.js';
import { TESTATA } from './fixtures/testata.js';
import { WORKSPACE } from './fixtures/workspace.js';

/*
 * IL LABORATORIO DEI COMPONENTI — la parità «a partire dai dati».
 *
 * Il cancello di Fase 0 confronta il mockup con il markup STATICO della app.
 * Qui si confronta il mockup con ciò che i componenti PRODUCONO dai dati:
 * la pagina è il template della app (stesso corpo, stesso CSS), e per il
 * componente chiesto in `?componente=` il laboratorio sostituisce il
 * contenuto d'esempio del mockup con quello reso dal componente a partire da
 * fixture scritte nella forma vera dell'API. Se le due immagini coincidono,
 * il componente riproduce il disegno approvato; se no, il diff dice dove.
 *
 * ⛔ Niente `app.js` qui: si prova il componente, non il monolite.
 */
const documento = new DOMParser().parseFromString(template, 'text/html');
// Stessa forma della app: i figli del template stanno DIRETTAMENTE nel body
// (che è un flex a colonna con overflow nascosto) — un contenitore in mezzo
// farebbe crescere la griglia a misura di contenuto invece che di viewport.
document.getElementById('app')?.remove();
for (const nodo of [...documento.body.children]) {
  if (nodo.tagName === 'SCRIPT') continue;
  document.body.append(document.importNode(nodo, true));
}
document.documentElement.setAttribute('data-vista', 'sessione');
document.documentElement.setAttribute('data-schermo', 'chat');

const componente = new URLSearchParams(location.search).get('componente') || '';

const LABORATORI = {
  Topbar() {
    /* Prima si svuota ciò che il mockup scrive a mano, poi il componente lo riscrive dai dati. */
    const topbar = document.querySelector('#schermoChat .talos-topbar');
    topbar.querySelector('h1').textContent = '';
    topbar.querySelector('.talos-topbar__path').textContent = '';
    for (const badge of topbar.querySelectorAll('.talos-tabs__count')) badge.remove();
    aggiornaTopbar(topbar, TESTATA);
  },
  WorkspaceFooter() {
    const finto = document.querySelector('.talos-sidebar .talos-sidebar__foot');
    finto.replaceWith(creaWorkspaceFooter(WORKSPACE));
  },
  NavItem() {
    /* Le voci dei Luoghi rifatte dal componente: le prime cinque prima di «Altro», le altre dentro #luoghiAltri. */
    const altro = document.getElementById('altroLuoghi');
    const altri = document.getElementById('luoghiAltri');
    for (const finta of document.querySelectorAll('.talos-sidebar .talos-nav-item:not(#altroLuoghi)')) finta.remove();
    for (const luogo of LUOGHI) altro.before(creaNavItem(luogo, { conteggio: CONTEGGI[luogo.vaia] }));
    for (const luogo of LUOGHI_ALTRI) altri.append(creaNavItem(luogo, { conteggio: CONTEGGI[luogo.vaia || luogo.conteggio] }));
  },
  SessionItem() {
    const fissate = document.querySelector('.talos-sidebar__block:has(.talos-eyebrow[data-t="fissate"])');
    const sessioni = document.querySelector('.talos-sidebar__sessions');
    for (const finta of document.querySelectorAll('.talos-sidebar .talos-session-item')) finta.remove();
    for (const s of FISSATE) fissate.append(creaSessionItem(s, { adesso: ADESSO }));
    for (const s of SESSIONI) sessioni.append(creaSessionItem(s, { adesso: ADESSO, corrente: s.sessionId === CORRENTE }));
    const conto = sessioni.querySelector('.talos-sidebar__block-head .talos-nav-item__count');
    if (conto) conto.textContent = '69'; // il conteggio del mockup è dell'intero store, non delle righe mostrate
  },
};

if (componente && !LABORATORI[componente]) throw new Error(`componente di laboratorio sconosciuto: ${componente}`);
if (componente) LABORATORI[componente]();
document.documentElement.dataset.visualReady = 'true';
