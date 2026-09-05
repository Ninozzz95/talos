import template from '../index.template.html';
import { creaSessionItem } from '../src/components/session-item.js';
import { ADESSO, CORRENTE, FISSATE, SESSIONI } from './fixtures/sessioni.js';

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
