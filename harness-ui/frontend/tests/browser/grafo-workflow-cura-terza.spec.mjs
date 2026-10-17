/*
 * CURA T9 DELLA TERZA PASSATA (14/10/2026), nel DETTAGLIO del passo. La prova del revisore (`TERZA-WF-01`) guarda la barra della
 * vista Tempo; la stessa regola vale nel dettaglio del diagramma: un passo che ha APPENA finito — il fotogramma è arrivato con la
 * sua ora di fine, la storia degli stati si rilegge dopo — dice subito inizio e fine, non il solo inizio.
 * Solo letture: ogni scrittura si ferma e si conta.
 */
import { expect, test } from '@playwright/test';
import { apriRailDellaScena, costruisciScena, instradaScena } from './aiuto-workflow-v2.mjs';

async function apriDiagramma(page, scena) {
  const rail = await apriRailDellaScena(page, scena);
  await rail.locator('[data-c="WorkflowRail"]').getByRole('button', { name: 'Apri diagramma' }).click();
  const grafo = page.locator('#schermoChat > [data-c="GrafoAgenti"]');
  await grafo.waitFor();
  return grafo;
}
/** Porta gli orari della scena a pochi minuti fa (di serie sono del 25/09: un passo «al lavoro» lo sarebbe da centinaia di ore). */
function recente(scena, minutiFa = 20) {
  const delta = Date.now() - minutiFa * 60_000 - Math.min(...scena.storia.map((v) => Date.parse(v.at)));
  const sposta = (iso) => (iso ? new Date(Date.parse(iso) + delta).toISOString() : iso);
  for (const r of scena.tutte) { r.startedAt = sposta(r.startedAt); r.finishedAt = sposta(r.finishedAt); r.updatedAt = sposta(r.updatedAt); }
  for (const v of scena.storia) v.at = sposta(v.at);
  return scena;
}
const quandoNelDettaglio = async (grafo) => (await grafo.locator('.gv-dettaglio .talos-wfg__dettaglio-testi .talos-wfg__passo-modello').first().innerText()).trim();
const DUE_ORE = /\d\d:\d\d–\d\d:\d\d/u;

test('CURA-T9-DETTAGLIO — un passo del Workflow che ha APPENA finito: il dettaglio dice inizio e fine dal fotogramma, senza aspettare che la storia degli stati si rilegga — AL CONTRARIO, mentre lavora dice «in corso»', async ({ page }) => {
  const errori = []; page.on('pageerror', (e) => errori.push(e.message));
  const scena = recente(costruisciScena(5, { sessionId: 'wf-cura-terza-dettaglio' }));
  const riga = scena.righe.get('lettura')[1];
  expect(riga.state, 'la premessa: il passo sta lavorando').toBe('running');
  const fine = new Date(Date.now() - 5_000).toISOString();
  const frame = { runId: scena.runId, status: 'running', fromSeq: 101, lastSeq: 101, resync: false, resyncReason: null,
    nodes: [{ ...riga, state: 'succeeded', finishedAt: fine, durationMs: Date.parse(fine) - Date.parse(riga.startedAt) }] };
  const { scritture, rilasciaFrame } = await instradaScena(page, scena, { frame, frameAMano: true });
  let ritardo = 0;
  await page.route(`**/api/v1/sessions/${scena.sessionId}/workflows/${scena.runId}/history*`, async (route) => { if (ritardo) await new Promise((f) => setTimeout(f, ritardo)); await route.fallback(); });
  const grafo = await apriDiagramma(page, scena);
  const carta = grafo.locator(`[data-nodo-id="${riga.nodeId}"]`).first();
  await carta.click();
  await expect(carta).toHaveAttribute('aria-pressed', 'true');
  // AL CONTRARIO, la premessa: finché lavora il dettaglio non inventa una fine
  await expect.poll(() => quandoNelDettaglio(grafo), { timeout: 8000 }).toContain('in corso');
  expect(await quandoNelDettaglio(grafo)).not.toMatch(DUE_ORE);
  // il server registra la fine e manda il fotogramma; la storia risponde 2,5 secondi dopo
  scena.storia.push({ seq: scena.storia.length + 1, at: fine, scope: 'node', nodeId: riga.nodeId, phaseId: riga.phaseId, state: 'succeeded' });
  ritardo = 2500;
  rilasciaFrame();
  await expect(carta).toHaveAttribute('data-stato', 'succeeded', { timeout: 10_000 });
  await page.waitForTimeout(400); // il fotogramma è stato disegnato; la storia non è ancora tornata
  const appenaFinito = await quandoNelDettaglio(grafo);
  expect(appenaFinito, `appena finito il dettaglio dice inizio–fine: «${appenaFinito}»`).toMatch(DUE_ORE);
  expect(appenaFinito).not.toContain('in corso');
  // e quando la storia arriva resta così
  await page.waitForTimeout(3000);
  expect(await quandoNelDettaglio(grafo)).toMatch(DUE_ORE);
  expect(scritture).toEqual([]);
  expect(errori).toEqual([]);
});
