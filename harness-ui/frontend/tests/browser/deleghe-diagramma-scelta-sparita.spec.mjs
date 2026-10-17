/*
 * La SCELTA segue l'agente, e se l'agente scelto non è più fra quelli mostrati si toglie e lo si dice (13/10/2026 sera).
 * È l'altra metà della cura di SECONDA-POSIZIONE-03 (seconda passata del bugfixer): lì un ALTRO agente usciva dal filtro e la scelta
 * passava a chi ne prendeva il posto; qui esce dal filtro proprio l'agente scelto. Gli id dei nodi seguono la sessione
 * (`grafo/run-dalle-deleghe.js`, `idDelNodo`), quindi niente di ciò che il diagramma ricorda per id può passare a un altro.
 * Solo letture: ogni scrittura si ferma e si conta.
 */
import { expect, test } from '@playwright/test';
import { apri, eventoAgente, figlia, finita } from './aiuto-deleghe-diagramma.mjs';

const soloAlLavoro = async (page, grafo) => {
  const stato = grafo.locator('[data-filtro-stato]');
  await stato.locator('> button').click();
  await stato.locator('[data-stato-id="working"]').click();
  await expect(grafo.locator('[data-mostrati]')).toContainText('Al lavoro');
  await page.waitForTimeout(800); // la rilettura dopo la scelta del filtro è finita
};
const scelte = (grafo) => grafo.locator('[data-sessione][aria-pressed="true"]').evaluateAll((n) => n.map((x) => x.dataset.sessione));

test('DELEGHE-SCELTA-01 — filtro «Al lavoro», l’agente SCELTO finisce ed esce dal filtro: la scelta si toglie, il dettaglio si chiude, una riga dice chi era; una scelta nuova toglie la riga', async ({ page }) => {
  const errori = []; page.on('pageerror', (e) => errori.push(e.message));
  const figli = [figlia('a', 10, { taskCorto: 'Agente A' }), figlia('b', 11, { taskCorto: 'Agente B' }), figlia('c', 12, { taskCorto: 'Agente C' })];
  const { grafo, scritture } = await apri(page, () => figli);
  await soloAlLavoro(page, grafo);
  await grafo.locator('[data-sessione="a"]').click();
  const dettaglio = grafo.locator('.gv-dettaglio');
  await expect(dettaglio.locator('.talos-wfg__dettaglio-nome')).toHaveText('Agente A');
  expect(await scelte(grafo)).toEqual(['a']);
  // «a» finisce: con «Al lavoro» acceso esce dal diagramma
  figli.splice(0, 1, finita('a', 10, 70, { taskCorto: 'Agente A' }));
  await eventoAgente(page, figli[0], 'finished');
  await expect(grafo.locator('[data-sessione]')).toHaveCount(2, { timeout: 10_000 });
  await expect(dettaglio).toBeHidden();
  expect(await scelte(grafo), 'nessuna scheda resta segnata come scelta: non «b», che ha preso il posto di «a»').toEqual([]);
  const riga = grafo.locator('.talos-wfg__esito-run');
  await expect(riga).toHaveText('«Agente A» non è più fra gli agenti mostrati: la selezione è stata tolta.');
  await expect(riga).toHaveAttribute('role', 'status');
  // il pannello Agenti non resta con una scheda evidenziata
  await expect(page.locator('#railAgenti [data-evidenziata="true"]')).toHaveCount(0);
  // passano i battiti (il dettaglio si ridisegna una volta al secondo): niente si riapre da solo
  await page.waitForTimeout(2200);
  await expect(dettaglio).toBeHidden();
  expect(await scelte(grafo)).toEqual([]);
  // una scelta nuova toglie la riga
  await grafo.locator('[data-sessione="b"]').click();
  await expect(dettaglio.locator('.talos-wfg__dettaglio-nome')).toHaveText('Agente B');
  await expect(riga).toBeHidden();
  expect(await scelte(grafo)).toEqual(['b']);
  expect(scritture).toEqual([]);
  expect(errori).toEqual([]);
});

test('DELEGHE-SCELTA-02 — AL CONTRARIO: senza un filtro l’agente scelto che finisce RESTA scelto, col suo dettaglio, e nessuna riga', async ({ page }) => {
  const figli = [figlia('a', 10, { taskCorto: 'Agente A' }), figlia('b', 11, { taskCorto: 'Agente B' })];
  const { grafo } = await apri(page, () => figli);
  await grafo.locator('[data-sessione="a"]').click();
  const dettaglio = grafo.locator('.gv-dettaglio');
  await expect(dettaglio.locator('.talos-wfg__dettaglio-nome')).toHaveText('Agente A');
  figli.splice(0, 1, finita('a', 10, 70, { taskCorto: 'Agente A' }));
  await eventoAgente(page, figli[0], 'finished');
  await expect(grafo.locator('[data-sessione="a"]')).toHaveAttribute('data-stato', 'succeeded', { timeout: 10_000 });
  await page.waitForTimeout(1500);
  expect(await scelte(grafo)).toEqual(['a']);
  await expect(dettaglio.locator('.talos-wfg__dettaglio-nome')).toHaveText('Agente A');
  await expect(grafo.locator('.talos-wfg__esito-run')).toBeHidden();
});

test('DELEGHE-SCELTA-03 — «Ha avviato» acceso su un agente che poi esce dal filtro: anche il focus si toglie, e chi resta non è attenuato', async ({ page }) => {
  const errori = []; page.on('pageerror', (e) => errori.push(e.message));
  const figli = [figlia('a', 10, { taskCorto: 'Agente A' }), figlia('b', 11, { taskCorto: 'Agente B' }), figlia('n', 40, { padreId: 'a', parentId: 'a', taskCorto: 'Agente N' })];
  const { grafo } = await apri(page, () => figli);
  await soloAlLavoro(page, grafo);
  await grafo.locator('[data-sessione="a"]').click();
  await grafo.locator('.gv-dettaglio [data-focus-key="focus:valle"]').click();
  await expect(grafo.locator('.gv-fuoco')).toContainText('Avviati da Agente A');
  figli.splice(0, 1, finita('a', 10, 70, { taskCorto: 'Agente A' }));
  await eventoAgente(page, figli[0], 'finished');
  await expect(grafo.locator('[data-sessione="a"]')).toHaveCount(0, { timeout: 10_000 });
  await expect(grafo.locator('.gv-fuoco')).toBeHidden();
  await expect(grafo.locator('.gv-dettaglio')).toBeHidden();
  // chi resta («b», «n») non è attenuato da un focus che non c'è più
  await expect(grafo.locator('[data-sessione][data-spento="true"]')).toHaveCount(0);
  expect(errori).toEqual([]);
});

test('DELEGHE-SCELTA-04 — la riga in inglese', async ({ page }) => {
  const figli = [figlia('a', 10, { taskCorto: 'Agent A' }), figlia('b', 11, { taskCorto: 'Agent B' })];
  const { grafo } = await apri(page, () => figli, { lingua: 'en' });
  const stato = grafo.locator('[data-filtro-stato]');
  await stato.locator('> button').click();
  await stato.locator('[data-stato-id="working"]').click();
  await page.waitForTimeout(800);
  await grafo.locator('[data-sessione="a"]').click();
  await expect(grafo.locator('.gv-dettaglio .talos-wfg__dettaglio-nome')).toHaveText('Agent A');
  figli.splice(0, 1, finita('a', 10, 70, { taskCorto: 'Agent A' }));
  await eventoAgente(page, figli[0], 'finished');
  await expect(grafo.locator('.talos-wfg__esito-run')).toHaveText('“Agent A” is no longer among the agents shown: the selection was cleared.', { timeout: 10_000 });
});
