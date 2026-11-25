/*
 * P2-C, riga 40 (decisione 401, limite noto 12 della 0.2.5): su una finestra stretta «Apri a lato» apre il pannello di destra sopra la chat,
 * e dopo «Chiudi» il pannello restava aperto: si chiudeva solo a mano. Ora «Chiudi» richiude il pannello che la vista a lato ha aperto,
 * e lascia com'era un pannello che era già aperto prima (il caso normale, finestra larga compresa).
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { documento, clic, orologio } from './aiuto-dom-blocchi.mjs';
import { creaAggancioBlocchi } from '../../src/components/blocchi/aggancio.js';
import { creaVisteDelBlocco } from '../../src/components/blocchi/viste.js';

const TABELLA = readFileSync(new URL('../../../tests/fixtures/blocchi/01-tabella.txt', import.meta.url), 'utf8').trim();

/** `giaAperta`: il pannello era aperto prima del clic (finestra larga, o aperto a mano); altrimenti la vista lo apre lei */
function scena({ giaAperta }) {
  const document = documento();
  const colonna = document.createElement('aside');
  document.body.append(colonna);
  const pannello = { aperto: giaAperta, chiusure: 0 };
  const viste = creaVisteDelBlocco({
    document, colonna: () => colonna,
    apriColonna: () => { const daAprire = !pannello.aperto; pannello.aperto = true; return daAprire; },
    chiudiColonna: () => { pannello.aperto = false; pannello.chiusure += 1; },
  });
  const a = creaAggancioBlocchi({ document, sessione: () => 's1', consegna: () => {}, timer: orologio().timer, azioni: { lato: viste.lato, schermo: viste.schermo } });
  const inLinea = () => { const nodo = a.blocco(TABELLA, true); document.body.append(nodo); return nodo; };
  return { colonna, pannello, inLinea };
}
const bottone = (nodo, testo) => {
  const qui = nodo.querySelectorAll('button').find((b) => b.textContent.trim().startsWith(testo));
  if (qui) return qui;
  const piu = nodo.querySelector('button[aria-haspopup="menu"]');
  if (!piu) return undefined;
  if (piu.getAttribute('aria-expanded') !== 'true') clic(piu);
  return nodo.ownerDocument.body.querySelector('#menuDelBlocco')?.querySelectorAll('[role="menuitem"]').find((b) => b.textContent.trim().startsWith(testo));
};
const chiudiLaVista = (colonna) => clic(bottone(colonna.querySelector('.gu-lato'), 'Chiudi'));

test('P2C-40-A finestra stretta: «Chiudi» della vista a lato richiude il pannello che la vista aveva aperto', () => {
  const { colonna, pannello, inLinea } = scena({ giaAperta: false });
  clic(bottone(inLinea(), 'Apri a lato'));
  assert.equal(pannello.aperto, true, 'la vista apre il pannello');
  chiudiLaVista(colonna);
  assert.equal(colonna.querySelector('.gu-lato'), null);
  assert.equal(pannello.aperto, false, '«Chiudi» chiude anche il pannello');
  assert.equal(pannello.chiusure, 1);
});

test('P2C-40-B una seconda vista a lato aperta sopra la prima: «Chiudi» richiude lo stesso il pannello aperto dalla prima', () => {
  const { colonna, pannello, inLinea } = scena({ giaAperta: false });
  clic(bottone(inLinea(), 'Apri a lato'));
  clic(bottone(inLinea(), 'Apri a lato'));
  assert.equal(colonna.querySelectorAll('.gu-lato').length, 1);
  chiudiLaVista(colonna);
  assert.equal(pannello.aperto, false);
});

test('P2C-40-C al contrario: un pannello già aperto prima (finestra larga, o aperto a mano) resta aperto dopo «Chiudi»', () => {
  const { colonna, pannello, inLinea } = scena({ giaAperta: true });
  clic(bottone(inLinea(), 'Apri a lato'));
  chiudiLaVista(colonna);
  assert.equal(colonna.querySelector('.gu-lato'), null, 'la vista a lato si chiude');
  assert.equal(pannello.aperto, true, 'il pannello di prima resta com\'era');
  assert.equal(pannello.chiusure, 0);
});
