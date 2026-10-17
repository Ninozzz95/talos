/*
 * 13/10/2026 (bugfixer, lotto 3, SECONDA PASSATA) — `e511b2dde`: la storia segue l'agente, le riletture della cronologia si
 * diradano. Queste due prove le ha scritte il revisore di prima in coda a `deleghe-diagramma-seconda-passata.spec.mjs`; stanno
 * in un file loro perché quella spec è stata presa com'era nel ramo del diagramma (`d6b103776`) e deve restare identica sui
 * due rami. `[REGGE]` = ho provato a romperlo e ha retto. Solo letture: ogni scrittura si ferma e si conta (banco comune).
 */
import { expect, test } from '@playwright/test';
import { apri, at, eventoAgente, figlia, finita, RADICE } from './aiuto-deleghe-diagramma.mjs';

const registrato = (seq, secondi, node, event = 'updated') => ({ tipo: 'grafo-agenti', schema: 'talos.agent-timeline.v1', rootId: RADICE, seq, at: at(secondi), coverage: 'complete', event, node });

/* ——— e511b2dde: L3-13, l'attesa che cresce ——— */
test('SECONDA-L3-13-01 [REGGE] — la storia non si legge: poche riletture (l’attesa cresce), e quando il registro torna DA SOLO la riproduzione si riprende senza «Riprova»', async ({ page }) => {
  const errori = []; page.on('pageerror', (e) => errori.push(e.message));
  const record = [registrato(1, 30, { sessionId: RADICE, padreId: null, conclusa: false, avviataAlle: at(0), taskCorto: 'Sistema i listini' }, 'created'), registrato(2, 60, figlia('a', 60), 'created')];
  const cronologia = { record, rotta: true };
  const { grafo } = await apri(page, [figlia('a', 60)], { cronologia });
  const rip = grafo.locator('.gv-rip');
  await expect(rip).toHaveAttribute('data-storia', 'errore', { timeout: 15_000 });
  const allInizio = cronologia.chiamate;
  await page.waitForTimeout(12_000);
  const inDodiciSecondi = cronologia.chiamate - allInizio;
  // prima della cura: 8-9 riletture in 12 s. Con le attese 1, 2, 5, 15 s ne entrano al più quattro.
  expect(inDodiciSecondi, `riletture della storia in 12 s col registro rotto: ${inDodiciSecondi}`).toBeLessThanOrEqual(5);
  // il registro torna da solo: nessuno preme «Riprova». Entro l'attesa più lunga in corso (15 s) più un battito si riprende.
  cronologia.rotta = false;
  await expect(rip).toHaveAttribute('data-storia', 'registro', { timeout: 25_000 });
  await expect(rip).toHaveAttribute('data-pronta', 'true');
  expect(errori).toEqual([]);
});

test('SECONDA-STORIA-VIVA-01 [REGGE] — la riproduzione è aperta a un istante e NASCE un agente (la storia si sostituisce): l’istante resta dov’era e si resta in riproduzione', async ({ page }) => {
  const errori = []; page.on('pageerror', (e) => errori.push(e.message));
  const figli = [finita('a', 10, 70, { taskCorto: 'Agente A' }), finita('b', 80, 200, { taskCorto: 'Agente B' }), figlia('c', 210, { taskCorto: 'Agente C' })];
  const { grafo } = await apri(page, () => figli);
  const rip = grafo.locator('.gv-rip');
  await expect(rip).toHaveAttribute('data-pronta', 'true');
  const cursore = grafo.getByRole('slider', { name: 'Istante della riproduzione' });
  await cursore.focus();
  await page.keyboard.press('Home');
  for (let i = 0; i < 6; i += 1) await page.keyboard.press('ArrowRight');
  await expect(rip).toHaveAttribute('data-attiva', 'true');
  const istante = await cursore.getAttribute('aria-valuenow');
  const statiPrima = await grafo.locator('[data-sessione]').evaluateAll((n) => n.map((x) => `${x.dataset.sessione}:${x.dataset.stato}`).sort());
  // nasce un agente: la struttura cambia, la storia si rilegge da capo e si sostituisce
  figli.push(figlia('z', 400, { taskCorto: 'Agente Z' }));
  await eventoAgente(page, figli.at(-1), 'created');
  await expect(grafo.locator('[data-sessione="z"]')).toHaveCount(1, { timeout: 10_000 });
  await page.waitForTimeout(1500);
  await expect(rip).toHaveAttribute('data-attiva', 'true');
  expect(await cursore.getAttribute('aria-valuenow'), 'l’istante guardato non si sposta').toBe(istante);
  // chi c'era prima è nello stato che aveva a quell'istante (la storia sostituita dice le stesse cose per gli stessi agenti)
  const statiDopo = await grafo.locator('[data-sessione]:not([data-sessione="z"])').evaluateAll((n) => n.map((x) => `${x.dataset.sessione}:${x.dataset.stato}`).sort());
  expect(statiDopo).toEqual(statiPrima);
  expect(errori).toEqual([]);
});
