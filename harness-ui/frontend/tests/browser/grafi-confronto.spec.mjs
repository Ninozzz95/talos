import { expect, test } from '@playwright/test';
import { apriRailDellaScena, costruisciScena, instradaScena } from './aiuto-workflow-v2.mjs';

/*
 * 02/10/2026 (owner): il grafo delle deleghe deve parlare la stessa grammatica del grafo Workflow — stessa barra di icone, stessa
 *   riproduzione, stesso pannello di dettaglio, stessi movimenti; non identico. Qui le FOTO affiancate, nella stessa scena, in
 *   chiaro e in scuro a 1920×1080 (TALOS_FOTO_DIR, mai nel repo). Gira sul 4174: tutta l'API la risponde la scena.
 */
const SESSION_ID = 'grafi-confronto';
const json = (data) => ({ contentType: 'application/json', body: JSON.stringify({ ok: true, data, meta: { schema: 'talos.api.v1' } }) });
const FIGLIE = [
  { sessionId: 'delega-1', task: 'Controlla i test del lettore di file', taskCorto: 'Test del lettore', conclusa: false, interrotta: false, attivita: { file: [{ percorso: 'frontend/src/components/lettore/pdf.js' }], chiamate: 6, passi: [] } },
  { sessionId: 'delega-2', task: 'Riassumi il registro degli aggiornamenti', taskCorto: 'Riassunto registro', conclusa: true, interrotta: false, ultimoEsito: 'succeeded', attivita: { file: [{ percorso: 'docs/REGISTRO.md', scritto: true }], chiamate: 3, passi: [] } },
  { sessionId: 'delega-3', task: 'Cerca dove si legge la cartella della sessione', taskCorto: 'Cartella sessione', conclusa: false, interrotta: false, inAttesaApprovazione: true, attivita: { file: [], chiamate: 2, passi: [] } },
  { sessionId: 'delega-4', task: 'Prova la build di prova', taskCorto: 'Build di prova', conclusa: true, interrotta: false, ultimoEsito: 'failed', attivita: { file: [], chiamate: 9, passi: [] } },
].map((f, i) => ({ parentId: SESSION_ID, modello: 'z-ai/glm-5.3-flash', avviataAlle: `2026-10-02T08:0${i}:00.000Z`, ...f }));

async function apri(page, tema) {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.addInitScript(({ colorMode }) => {
    if (window.top !== window) return;
    try { localStorage.setItem('talos.harness.desktop.settings.v1', JSON.stringify({ version: 1, appearance: { colorMode, uiFontScale: 'default' }, chat: { model: 'z-ai/glm-5.3-flash' } })); } catch { /* */ }
  }, { colorMode: tema });
  const scena = costruisciScena(5, { sessionId: SESSION_ID });
  await instradaScena(page, scena);
  await page.route((url) => url.pathname === '/api/v1/sessions', (route) => route.fulfill(json({ items: [{ sessionId: SESSION_ID, taskId: 'workspace', nome: 'Grafi a confronto', modello: 'z-ai/glm-5.3-flash', conclusa: false }] })));
  await page.route(`**/api/v1/sessions/${SESSION_ID}/children`, (route) => route.fulfill(json({ figli: FIGLIE })));
  const rail = await apriRailDellaScena(page, scena);
  await rail.getByRole('tab', { name: 'Deleghe' }).click();
  await rail.locator('[data-sessione-figlia="delega-1"]').click();
  await page.getByRole('button', { name: 'Apri questo agente nel diagramma' }).click();
  const grafo = page.locator('#schermoChat > [data-c="GrafoAgenti"]');
  await expect(grafo.locator('[data-nodo-id="delega-1"]')).toBeVisible();
  return grafo;
}

const CARTELLA_FOTO = process.env.TALOS_FOTO_DIR;
for (const tema of ['light', 'dark']) {
  test(`GRAFI-FOTO deleghe e workflow (${tema})`, async ({ page }) => {
    test.skip(!CARTELLA_FOTO, 'solo su richiesta: TALOS_FOTO_DIR');
    const grafo = await apri(page, tema);
    await page.waitForTimeout(800);
    await page.screenshot({ path: `${CARTELLA_FOTO}/grafo-deleghe-${tema}.png` });
    await grafo.getByRole('button', { name: 'Workflow', exact: true }).click();
    await expect(page.locator('#schermoChat > [data-c="GrafoAgenti"]')).toHaveAttribute('data-sorgente', 'workflow');
    await page.waitForTimeout(800);
    await page.screenshot({ path: `${CARTELLA_FOTO}/grafo-workflow-${tema}.png` });
  });
}
