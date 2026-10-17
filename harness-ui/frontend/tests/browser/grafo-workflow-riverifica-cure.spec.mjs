/*
 * RIVERIFICA DELLE CURE DELLA TERZA PASSATA (14/10/2026) — punto 3 del brief: la cura T9 prende per buona la fine dichiarata dalla
 * riga (`finishedAt`) anche quando è un filo nel FUTURO rispetto all'orologio di chi guarda. Che cosa succede a schermo?
 * «[REGGE]» = attaccato, ha retto. Senza etichetta = ROSSA (rapporto: `handoff …/bugfixer/RAPPORTO-RIVERIFICA-CURE-2026-10-14.md`).
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
function recente(scena, minutiFa = 20) {
  const delta = Date.now() - minutiFa * 60_000 - Math.min(...scena.storia.map((v) => Date.parse(v.at)));
  const sposta = (iso) => (iso ? new Date(Date.parse(iso) + delta).toISOString() : iso);
  for (const r of scena.tutte) { r.startedAt = sposta(r.startedAt); r.finishedAt = sposta(r.finishedAt); r.updatedAt = sposta(r.updatedAt); }
  for (const v of scena.storia) v.at = sposta(v.at);
  return scena;
}
const barraDi = (grafo, nodeId) => grafo.evaluate((g, id) => {
  const b = g.querySelector(`button.gv-tempo-barra[data-nodo-id="${id}"]`);
  return b ? { stato: b.dataset.stato, larga: Math.round(b.getBoundingClientRect().width), titolo: b.getAttribute('title') ?? '', testo: b.textContent } : null;
}, nodeId);
const quandoNelDettaglio = async (grafo) => (await grafo.locator('.gv-dettaglio .talos-wfg__dettaglio-testi .talos-wfg__passo-modello').first().innerText()).trim();

/* L'orologio del SERVER è avanti di due minuti rispetto a quello della finestra (un server su un'altra macchina, o l'orologio di
   questa corretto all'indietro fra la scrittura e la lettura: T8). La fine registrata è «fra 2 minuti» per chi guarda. */
test('RIV-T9-01 — un passo finito con l’ora di fine un po’ nel FUTURO (orologio del server avanti di 2 min): la barra della vista Tempo e il dettaglio dicono la stessa cosa prima e dopo che la storia si rilegge — mai «Concluso · … → in corso»', async ({ page }) => {
  const errori = []; page.on('pageerror', (e) => errori.push(e.message));
  const scena = recente(costruisciScena(5, { sessionId: 'wf-riv-t9-futuro' }));
  const riga = scena.righe.get('lettura')[1];
  expect(riga.state, 'la premessa: il passo sta lavorando').toBe('running');
  const fine = new Date(Date.now() + 120_000).toISOString();
  const frame = { runId: scena.runId, status: 'running', fromSeq: 101, lastSeq: 101, resync: false, resyncReason: null,
    nodes: [{ ...riga, state: 'succeeded', finishedAt: fine, durationMs: Date.parse(fine) - Date.parse(riga.startedAt) }] };
  const { scritture, rilasciaFrame } = await instradaScena(page, scena, { frame, frameAMano: true });
  let ritardo = 0;
  await page.route(`**/api/v1/sessions/${scena.sessionId}/workflows/${scena.runId}/history*`, async (route) => { if (ritardo) await new Promise((f) => setTimeout(f, ritardo)); await route.fallback(); });
  const grafo = await apriDiagramma(page, scena);
  await grafo.locator(`[data-nodo-id="${riga.nodeId}"]`).first().click();
  await grafo.getByRole('radio', { name: 'Tempo' }).click();
  await expect.poll(async () => (await barraDi(grafo, riga.nodeId))?.stato ?? null, { timeout: 10_000 }).toBe('running');
  scena.storia.push({ seq: scena.storia.length + 1, at: fine, scope: 'node', nodeId: riga.nodeId, phaseId: riga.phaseId, state: 'succeeded' });
  ritardo = 2000;
  rilasciaFrame();
  await expect.poll(async () => (await barraDi(grafo, riga.nodeId))?.stato ?? null, { timeout: 10_000, intervals: [50] }).toBe('succeeded');
  const appenaFinito = { barra: await barraDi(grafo, riga.nodeId), dettaglio: await quandoNelDettaglio(grafo) };
  await page.waitForTimeout(4000); // la storia è tornata (con la stessa fine «futura»)
  const conLaStoria = { barra: await barraDi(grafo, riga.nodeId), dettaglio: await quandoNelDettaglio(grafo) };
  const misura = JSON.stringify({ appenaFinito, conLaStoria });
  expect(appenaFinito.barra.titolo, misura).not.toContain('in corso');
  expect(conLaStoria.barra.titolo, `con la storia la barra di un passo CONCLUSO non dice «in corso»: ${misura}`).not.toContain('in corso');
  expect(scritture).toEqual([]);
  expect(errori).toEqual([]);
});
