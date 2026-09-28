/*
 * F3-52 (25/09/2026) — i controlli del run nella testata del diagramma, sulle rotte v2 (fixture dei mockup R4 in
 * `aiuto-workflow-v2.mjs`, con i comandi che rispondono come il server F3-51c e cambiano la scena come i loro fatti).
 * Decisioni owner: 21 (pulsante secondo lo stato + «…» con Annulla in fondo, anche col tasto destro), 22 (Annulla con
 * conferma che dice le conseguenze), 23 (Riprova con conferma col conto). Ogni scrittura che NON è un comando del run si
 * ferma e si conta. Ledger: `.claude/LEDGER-F3-WORKFLOW-UI-2026-09-25.md`, sezione F3-52.
 */
import { expect, test } from '@playwright/test';
import { apriDiagrammaDellaScena, cambiaStati, costruisciScena, instradaScena } from './aiuto-workflow-v2.mjs';

test.use({ viewport: { width: 1440, height: 900 } });

test('WF-RUN-CONTROLS-UI: Pause at once, Retry after its count, Cancel after its consequences; nothing else writes', async ({ page }) => {
  const scena = cambiaStati(costruisciScena(14, { sessionId: 'wf-run-ctl' }), [['implementazione-0003', 'failed']]);
  const { scritture, comandi } = await instradaScena(page, scena, { comandi: true });
  const grafo = await apriDiagrammaDellaScena(page, scena);
  const run = grafo.locator('.talos-wfg__run');
  const principale = run.locator('.talos-wfg__run-principale');
  const altro = run.getByRole('button', { name: 'Altri comandi del run' });
  const menu = run.getByRole('menu', { name: 'Comandi del run' });
  const conferma = page.locator('dialog.talos-wfg-conferma');
  await expect(principale).toHaveText('Pausa');
  // «…»: Riprova, e Annulla in fondo dopo un separatore (decisione 21)
  await altro.click();
  await expect(menu.getByRole('menuitem')).toHaveText(['Riprova 1 passo', 'Annulla il run']);
  await expect(menu.locator('[role="separator"]')).toHaveCount(1);
  // Riprova: il conto viene dal server PRIMA, poi la conferma (decisione 23); il fuoco parte da «Non ora»
  await menu.getByRole('menuitem', { name: 'Riprova 1 passo' }).click();
  await expect(conferma).toBeVisible();
  await expect(conferma.getByRole('heading')).toHaveText('Riprovo 1 passo?');
  await expect(conferma).toContainText('Il passo non riuscito riparte coi tentativi da capo. Il tetto del run sale di:');
  await expect(conferma.locator('.talos-wfg-conferma__riga')).toHaveText([/Tempo massimo\s*\+ 20 min/u, /Richieste al modello\s*\+ 8/u, /Token letti\s*\+ 12\.000/u, /Attrezzi usati\s*\+ 30/u]);
  await expect(conferma.getByRole('button', { name: 'Non ora' })).toBeFocused();
  await conferma.getByRole('button', { name: 'Riprova', exact: true }).click();
  await expect(conferma).toHaveCount(0);
  await expect(grafo.locator('.talos-wfg__esito-run')).toHaveText(/Riprova partito/u);
  expect(comandi.map((c) => c.azione)).toEqual(['retry']);
  expect(comandi[0].corpo).toEqual({ commandId: expect.stringMatching(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u) });
  // Pausa: un clic, niente conferma; poi la testata dice «Pausa in corso» e non la offre di nuovo
  await principale.click();
  await expect(grafo.locator('.talos-wfg__stato-run')).toHaveText(/^Pausa in corso · \d+ di \d+ terminati$/u); // refactor dei grafi: la riga di stato del prototipo dice anche i terminati
  await expect(principale).toBeHidden();
  expect(comandi.map((c) => c.azione)).toEqual(['retry', 'pause']);
  expect(new Set(comandi.map((c) => c.corpo.commandId)).size).toBe(2); // un commandId per gesto
  // Annulla: la conferma dice le conseguenze (decisione 22); «Non ora» ed Esc non mandano niente
  await altro.click();
  await expect(menu.getByRole('menuitem')).toHaveText(['Annulla il run']);
  await menu.getByRole('menuitem', { name: 'Annulla il run' }).click();
  await expect(conferma.getByRole('heading')).toHaveText('Annullo il run?');
  await expect(conferma).toContainText('Il passo in corso si ferma subito.');
  await expect(conferma).toContainText('I risultati già registrati restano.');
  await conferma.getByRole('button', { name: 'Non ora' }).click();
  await expect(conferma).toHaveCount(0);
  await expect(altro).toBeFocused();
  await altro.click();
  await menu.getByRole('menuitem', { name: 'Annulla il run' }).click();
  await expect(conferma).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(conferma).toHaveCount(0);
  expect(comandi.map((c) => c.azione)).toEqual(['retry', 'pause']);
  // … e poi davvero
  await altro.click();
  await menu.getByRole('menuitem', { name: 'Annulla il run' }).click();
  await conferma.getByRole('button', { name: 'Annulla il run' }).click();
  await expect(grafo.locator('.talos-wfg__stato-run')).toHaveText(/^Annullamento in corso · \d+ di \d+ terminati$/u); // refactor dei grafi: la riga di stato del prototipo dice anche i terminati
  await expect(run).toBeHidden();
  expect(comandi.map((c) => c.azione)).toEqual(['retry', 'pause', 'cancel']);
  // il caso VERO del 4174 (run 81d33e4f, 25/09): a run chiuso il registro tiene ancora `cancelRequested`, e la testata deve
  // dire «Annullato», non restare su «Annullamento in corso»
  scena.panoramica.status = 'cancelled';
  await grafo.getByRole('button', { name: 'Torna alla chat' }).click();
  await page.locator('#railAgenti [data-c="WorkflowRail"]').getByRole('button', { name: 'Apri diagramma', exact: true }).click();
  await expect(grafo.locator('.talos-wfg__stato-run')).toHaveText(/^Annullato · \d+ di \d+ terminati$/u); // refactor dei grafi: la riga di stato del prototipo dice anche i terminati
  await expect(grafo.locator('[data-coordinatore] .talos-wfg__pill')).toContainText('Annullato');
  await expect(grafo.locator('.talos-wfg__run')).toBeHidden();
  expect(scritture).toEqual([]);
});

test('WF-RUN-CONTROLS-RESUME: a paused run offers Resume; the right click on the principal session opens the same menu', async ({ page }) => {
  const scena = costruisciScena(14, { sessionId: 'wf-run-ripresa' });
  scena.panoramica.status = 'paused';
  const { scritture, comandi } = await instradaScena(page, scena, { comandi: true });
  const grafo = await apriDiagrammaDellaScena(page, scena);
  const principale = grafo.locator('.talos-wfg__run-principale');
  await expect(principale).toHaveText('Riprendi');
  await expect(grafo.locator('.talos-wfg__stato-run')).toHaveText(/^In pausa · \d+ di \d+ terminati$/u); // refactor dei grafi: la riga di stato del prototipo dice anche i terminati
  await grafo.locator('[data-coordinatore]').click({ button: 'right' });
  const menu = grafo.getByRole('menu', { name: 'Comandi del run' });
  await expect(menu.getByRole('menuitem')).toHaveText(['Annulla il run']);
  await page.keyboard.press('Escape');
  await expect(menu).toBeHidden();
  await principale.click();
  await expect(principale).toHaveText('Pausa');
  await expect(grafo.locator('.talos-wfg__esito-run')).toBeHidden(); // l'esito riuscito cede alla testata quando lo stato cambia
  expect(comandi.map((c) => c.azione)).toEqual(['resume']);
  expect(scritture).toEqual([]);
});

test('WF-RUN-CONTROLS-ENDED: a finished run has no commands', async ({ page }) => {
  const scena = costruisciScena(14, { sessionId: 'wf-run-finito' });
  scena.panoramica.status = 'succeeded';
  const { scritture, comandi } = await instradaScena(page, scena, { comandi: true });
  const grafo = await apriDiagrammaDellaScena(page, scena);
  await expect(grafo.locator('.talos-wfg__stato-run')).toHaveText(/^Riuscito · \d+ di \d+ terminati$/u); // refactor dei grafi: la riga di stato del prototipo dice anche i terminati
  await expect(grafo.locator('.talos-wfg__run')).toBeHidden();
  expect([comandi, scritture]).toEqual([[], []]);
});
