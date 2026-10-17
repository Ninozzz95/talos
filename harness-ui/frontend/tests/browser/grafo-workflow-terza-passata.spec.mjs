/*
 * TERZA PASSATA DEL REVISORE (14/10/2026) — il diagramma del WORKFLOW dopo «le parole delle deleghe» (`1e9594b8d`) e lo stato
 * vuoto (`7f43d35e8`): è cambiato in qualcosa che non doveva? Punto 6 del brief (`senzaFine` vale anche lì; in inglese).
 * «[REGGE]» = attaccato, ha retto. Senza etichetta = ROSSA: un difetto, con la cura proposta nel rapporto
 * (`handoff …/bugfixer/RAPPORTO-TERZA-PASSATA-2026-10-14.md`). Solo letture: ogni scrittura si ferma e si conta.
 */
import { expect, test } from '@playwright/test';
import { apriRailDellaScena, cambiaStati, costruisciScena, instradaScena } from './aiuto-workflow-v2.mjs';

const inLingua = (page, lingua) => page.addInitScript((l) => { try {
  localStorage.setItem('talos.harness.desktop.settings.v1', JSON.stringify({ version: 1, appearance: { colorMode: 'dark', uiLanguage: l } }));
} catch { /* */ } }, lingua);
/** Apre il diagramma del Workflow dal rail, in qualunque lingua (il banco comune cerca il pulsante col suo nome italiano). */
async function apriDiagramma(page, scena) {
  const rail = await apriRailDellaScena(page, scena);
  await rail.locator('[data-c="WorkflowRail"]').getByRole('button', { name: /^(Apri diagramma|Open diagram)$/u }).click();
  const grafo = page.locator('#schermoChat > [data-c="GrafoAgenti"]');
  await grafo.waitFor();
  return grafo;
}
/** Porta gli orari della scena a pochi minuti fa: di serie sono del 25/09, e un passo «al lavoro» lo sarebbe da centinaia di ore
 *  (un asse del tempo largo milioni di pixel, che non è il caso che qui si guarda). */
function recente(scena, minutiFa = 20) {
  const delta = Date.now() - minutiFa * 60_000 - Math.min(...scena.storia.map((v) => Date.parse(v.at)));
  const sposta = (iso) => (iso ? new Date(Date.parse(iso) + delta).toISOString() : iso);
  for (const r of scena.tutte) { r.startedAt = sposta(r.startedAt); r.finishedAt = sposta(r.finishedAt); r.updatedAt = sposta(r.updatedAt); }
  for (const v of scena.storia) v.at = sposta(v.at);
  return scena;
}
const tuttoCioCheSiLegge = (grafo) => grafo.evaluate((g) => {
  const out = [String(g.innerText || '')];
  for (const n of g.querySelectorAll('[aria-label], [title]')) out.push(n.getAttribute('aria-label') ?? '', n.getAttribute('title') ?? '');
  return out.join('\n');
});
const barraDi = (grafo, nodeId) => grafo.evaluate((g, id) => {
  const b = g.querySelector(`button.gv-tempo-barra[data-nodo-id="${id}"]`);
  return b ? { stato: b.dataset.stato, larga: Math.round(b.getBoundingClientRect().width), titolo: b.getAttribute('title') ?? '', testo: b.textContent } : null;
}, nodeId);

test('TERZA-WF-01 — vista Tempo del WORKFLOW, dal vivo: un passo che ha APPENA finito (il fotogramma è arrivato con la sua ora di fine, la storia degli stati si rilegge dopo) non perde la sua barra e la sua durata finché la storia non arriva', async ({ page }) => {
  const errori = []; page.on('pageerror', (e) => errori.push(e.message));
  const scena = recente(costruisciScena(5, { sessionId: 'wf-terza-tempo' }));
  const riga = scena.righe.get('lettura')[1]; // «Elenco delle date», al lavoro da un quarto d'ora
  expect(riga.state, 'la premessa: il passo sta lavorando').toBe('running');
  const fine = new Date(Date.now() - 5_000).toISOString();
  // il fotogramma porta la FINE del passo (`finishedAt`, `durationMs`), come il server
  const frame = { runId: scena.runId, status: 'running', fromSeq: 101, lastSeq: 101, resync: false, resyncReason: null,
    nodes: [{ ...riga, state: 'succeeded', finishedAt: fine, durationMs: Date.parse(fine) - Date.parse(riga.startedAt) }] };
  const { scritture, rilasciaFrame } = await instradaScena(page, scena, { frame, frameAMano: true });
  /* La storia degli stati arriva al diagramma con la rilettura che SEGUE il fotogramma (una panoramica, poi la storia; al più
     una al secondo, e se la rotta non risponde si ritenta dopo 1, 2, 5, 15, 60 s). Misurato il 14/10/2026 con la sonda: se la
     risposta è immediata e l'ultima rilettura è lontana, l'attimo dura un fotogramma (15 ms); qui la storia risponde dopo 1,5 s. */
  let ritardo = 0;
  await page.route(`**/api/v1/sessions/${scena.sessionId}/workflows/${scena.runId}/history*`, async (route) => { if (ritardo) await new Promise((f) => setTimeout(f, ritardo)); await route.fallback(); });
  const grafo = await apriDiagramma(page, scena);
  await grafo.getByRole('radio', { name: 'Tempo' }).click();
  await expect.poll(async () => (await barraDi(grafo, riga.nodeId))?.stato ?? null, { timeout: 10_000 }).toBe('running');
  const alLavoro = await barraDi(grafo, riga.nodeId);
  expect(alLavoro.larga, `la premessa: mentre lavora la barra c’è: ${JSON.stringify(alLavoro)}`).toBeGreaterThan(200);
  // il server registra la fine nella storia e manda il fotogramma
  scena.storia.push({ seq: scena.storia.length + 1, at: fine, scope: 'node', nodeId: riga.nodeId, phaseId: riga.phaseId, state: 'succeeded' });
  ritardo = 1500;
  rilasciaFrame();
  await expect.poll(async () => (await barraDi(grafo, riga.nodeId))?.stato ?? null, { timeout: 10_000, intervals: [50], message: 'il fotogramma è arrivato alla vista Tempo' }).toBe('succeeded');
  const appenaFinito = await barraDi(grafo, riga.nodeId);
  // AL CONTRARIO (la rete): quando la storia arriva la barra è quella vera, dall'inizio alla fine, con la durata
  await expect.poll(async () => (await barraDi(grafo, riga.nodeId))?.titolo ?? '', { timeout: 8000 }).toMatch(/\d\d:\d\d → \d\d:\d\d · \d+ min/u);
  const conLaStoria = await barraDi(grafo, riga.nodeId);
  expect(conLaStoria.larga, JSON.stringify(conLaStoria)).toBeGreaterThan(200);
  // l'attimo in mezzo: la barra non si è ridotta a un tratto senza durata (la fine era nel fotogramma)
  expect(appenaFinito.larga, `appena finito: ${JSON.stringify(appenaFinito)} · poi, con la storia: ${JSON.stringify(conLaStoria)}`).toBeGreaterThan(200);
  expect(scritture).toEqual([]);
  expect(errori).toEqual([]);
});

for (const [lingua, parole] of [
  ['it', { run: 'In esecuzione', annullato: 'Annullato', cerca: 'Cerca agenti o fasi…', mai: /Interrott|Nessun agente avviato|lott[oi]\b/u, ancora: 'in corso' }],
  ['en', { run: 'Running', annullato: 'Cancelled', cerca: 'Search agents or phases…', mai: /Stopped|No agents started|batch/u, ancora: 'running' }],
]) {
  test(`TERZA-WF-02 [REGGE] (${lingua}) — il diagramma del Workflow tiene le SUE parole: un passo annullato è «${parole.annullato}» (non «Interrotto»/«Stopped»), la ricerca parla di fasi, niente dello stato vuoto delle deleghe; un passo annullato senza ora di fine dice solo quando è partito, uno al lavoro dice ancora «→ ${parole.ancora}»`, async ({ page }) => {
    const errori = []; page.on('pageerror', (e) => errori.push(e.message));
    await inLingua(page, lingua);
    const scena = recente(costruisciScena(5, { sessionId: `wf-terza-parole-${lingua}` }));
    const annullato = scena.righe.get('decisioni')[0]; const alLavoro = scena.righe.get('decisioni')[1];
    cambiaStati(scena, [[annullato.nodeId, 'cancelled']]); // fermato a metà: la storia non ha la sua fine
    const { scritture } = await instradaScena(page, scena);
    const grafo = await apriDiagramma(page, scena);
    await expect(grafo).toHaveAttribute('data-sorgente', 'workflow');
    await expect(grafo).toHaveAttribute('data-vuoto', 'false');
    await expect(grafo.locator(`.gv-passo[data-nodo-id="${annullato.nodeId}"] .gv-passo-pill`)).toHaveText(parole.annullato);
    await expect(grafo.locator(`.gv-passo[data-nodo-id="${alLavoro.nodeId}"] .gv-passo-pill`)).toHaveText(parole.run);
    await expect(grafo.locator('.talos-wfg__stato-run')).toHaveText(new RegExp(`^${parole.run}`, 'u'));
    // la ricerca: «fasi», non «lotti»
    await grafo.locator('.gv-comandi button[aria-expanded]').filter({ has: page.locator('use[href="#i-search"]') }).click();
    await expect(grafo.locator('input.talos-wfg__cerca')).toHaveAttribute('placeholder', parole.cerca);
    // il dettaglio: annullato senza fine ⇒ solo l'inizio; al lavoro ⇒ «→ in corso»
    const quando = grafo.locator('.gv-dettaglio .talos-wfg__dettaglio-testi .talos-wfg__passo-modello').first();
    await grafo.locator(`.gv-passo[data-nodo-id="${annullato.nodeId}"]`).click();
    await expect(grafo.locator('.gv-dettaglio .talos-wfg__dettaglio-testa .talos-wfg__pill')).toHaveText(parole.annullato);
    await expect(quando).toContainText(/\d\d:\d\d/u);
    await expect(quando).not.toContainText('→');
    await grafo.locator(`.gv-passo[data-nodo-id="${alLavoro.nodeId}"]`).click();
    await expect(grafo.locator('.gv-dettaglio .talos-wfg__dettaglio-testa .talos-wfg__pill')).toHaveText(parole.run);
    await expect(quando).toContainText(`→ ${parole.ancora}`);
    // le tre viste: da nessuna parte le parole delle deleghe
    for (const vista of ['dipendenze', 'tempo', 'lettura']) {
      await grafo.locator(`[data-vista="${vista}"]`).click();
      await page.waitForTimeout(250);
      const letto = await tuttoCioCheSiLegge(grafo);
      expect(letto, `vista ${vista}`).not.toMatch(parole.mai);
      expect(letto, `vista ${vista}`).toContain(parole.annullato);
    }
    // vista Tempo: il passo annullato senza fine ha un tratto dov'è partito, quello al lavoro una barra fino ad adesso
    await grafo.locator('[data-vista="tempo"]').click();
    await expect.poll(async () => (await barraDi(grafo, alLavoro.nodeId))?.stato ?? null, { timeout: 10_000 }).toBe('running');
    const fermo = await barraDi(grafo, annullato.nodeId); const vivo = await barraDi(grafo, alLavoro.nodeId);
    expect(fermo.titolo, JSON.stringify(fermo)).toContain(parole.annullato);
    expect(fermo.titolo, JSON.stringify(fermo)).not.toContain('→');
    expect(fermo.larga, JSON.stringify(fermo)).toBeLessThan(40);
    expect(vivo.titolo, JSON.stringify(vivo)).toContain(`→ ${parole.ancora}`);
    expect(vivo.larga, JSON.stringify(vivo)).toBeGreaterThan(200);
    expect(scritture).toEqual([]);
    expect(errori).toEqual([]);
  });
}
