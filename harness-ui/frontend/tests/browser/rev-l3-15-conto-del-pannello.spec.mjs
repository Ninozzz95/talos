/*
 * Riverifica avversaria del lotto 3, parte B (20/10/2026) — L3-15 sul PANNELLO VERO.
 * `l3-15-terminati-pannello-e-diagramma.test.mjs` prova la funzione `contoDellaRichiesta`, non la testata che il pannello Agenti
 * disegna: rimettere nella testata la regola di prima (`statoDelega(a) === 'conclusa'`, cioè il difetto della foto) o togliere
 * «· N da guardare» lasciava verdi tutte le prove (mutanti misurati nel rapporto). Qui si legge la testata disegnata, accanto
 * alla testata del diagramma, sulla stessa scena. Asserzioni web-first sul locatore più stretto che porta il conto (Playwright,
 * «Assertions», ricercato il 20/10/2026). Solo letture: ogni scrittura si ferma e si conta.
 */
import { expect, test } from '@playwright/test';
import { apri, at, finita } from './aiuto-deleghe-diagramma.mjs';

const RICHIESTE = [{ at: at(0), testo: 'Sistema i listini' }, { at: at(300), testo: 'Ora aggiungi le prove' }];
/* richiesta passata: una riuscita e una FERMATA (il caso della foto, in piccolo); richiesta di adesso: una riuscita e una FALLITA */
const SCENA = () => [
  finita('a', 10, 70),
  finita('b', 12, 90, { interrotta: true, motivoChiusura: 'fermata', esitoDelega: null }),
  finita('c', 320, 380),
  finita('d', 321, 390, { esitoDelega: 'fallito' }),
];

test('REV-L3-15-01 — la testata del pannello Agenti conta i terminati come il diagramma: un fermato è terminato, un fallito è terminato e da guardare', async ({ page }) => {
  const errori = []; page.on('pageerror', (e) => errori.push(e.message));
  const { grafo, scritture } = await apri(page, SCENA(), { richieste: RICHIESTE });
  const conti = page.locator('#railAgenti .talos-agenti-richiesta .talos-agenti-richiesta__conto');
  await expect(conti).toHaveCount(2);
  // la richiesta di adesso: due su due finiti, uno da controllare — come il diagramma
  await expect(grafo.locator(':scope > header')).toContainText('2 di 2 terminati');
  await expect(conti.nth(0)).toHaveText('2 agenti · tutti finiti · 1 da guardare');
  // la richiesta passata: il fermato è terminato (prima della cura: «1 di 2 terminati»)
  await expect(conti.nth(1)).toHaveText('2 agenti · tutti finiti');
  expect(errori).toEqual([]);
  expect(scritture).toEqual([]);
});
