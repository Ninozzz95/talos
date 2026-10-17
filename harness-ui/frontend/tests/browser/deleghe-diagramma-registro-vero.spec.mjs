/*
 * IL DIAGRAMMA DELLE DELEGHE CONTRO IL REGISTRO VERO (14/10/2026): nessuna rotta finta.
 * Era RIPRESA-REPLAY-HTTP-UI della vista classica («registro reale, apertura tardiva e riavvio senza fixture di rete»): un
 * registro e un server HTTP veri, una delega vera, il diagramma aperto DOPO che i fatti sono successi, e il server riavviato.
 * Il diagramma nuovo rigioca la storia salvata (`GET /sessions/:id/agent-timeline`): qui la legge dal server che l'ha scritta.
 * Le sue prove con le rotte finte stanno in `deleghe-sul-diagramma.spec.mjs` (DELEGHE-DIAGRAMMA-26…29).
 */
import { test, expect } from '@playwright/test';
import { createServer } from 'node:http';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { createSessionRegistry } from '../../../src/session-registry.mjs';
import { registraRiga } from '../../../src/session-store.mjs';
import { createHttpApp } from '../../../src/http-app.mjs';
import { createStaticHandler } from '../../../src/static-files.mjs';

/* senza TALOS_RIPRESA_BUNDLE si serve la build che `playwright.config.mjs` ha già verificato (come faceva ripresa-replay) */
const BUNDLE = process.env.TALOS_RIPRESA_BUNDLE || fileURLToPath(new URL('../../dist/', import.meta.url));
const pausa = (ms) => new Promise((r) => setTimeout(r, ms));

test('DELEGHE-REGISTRO-VERO-01 — registro e server veri: il diagramma aperto dopo i fatti rigioca la storia salvata, un evento in diretta non sposta l’istante che si guarda, e dopo il riavvio del server la storia è la stessa', async ({ page }, info) => {
  test.setTimeout(90_000);
  const errori = []; page.on('pageerror', (e) => errori.push(e.message));
  const store = mkdtempSync(join(tmpdir(), 'talos-deleghe-registro-')); const runs = []; const writes = [];
  const options = { registraRigaFn: (...args) => { const pending = registraRiga(...args); writes.push(pending); return pending; }, cartellaStore: store, modello: 'test', chiave: 'test',
    guardaWorkspaceFn: () => () => {}, cartellaEsisteFn: () => true,
    preparaEsecuzioneFn: () => ({ cartella: store, task: { id: 'task', consegna: 'Controlla il progetto' } }),
    avviaSessioneFn: (input) => new Promise((resolve) => { runs.push({ input, resolve }); input.onEvento({ type: 'RunStarted', input: { consegna: 'Controlla il progetto' } }); }) };
  let registry = createSessionRegistry(options); let server;
  const listen = async (port = 0) => {
    server = createServer(createHttpApp({ sessionRegistry: registry, staticHandler: createStaticHandler(BUNDLE) }));
    await new Promise((resolve) => server.listen(port, '127.0.0.1', resolve)); return server.address().port;
  };
  const close = async () => { const promise = new Promise((resolve) => server.close(resolve)); server.closeAllConnections(); await promise; };
  const apriIlDiagramma = async (root) => {
    await page.locator(`[data-real-session-id="${root}"]`).first().click();
    const grafo = page.locator('#schermoChat > [data-c="GrafoAgenti"]');
    if (!(await grafo.isVisible().catch(() => false))) {
      if (!(await page.locator('#railTabs [data-rail="agenti"]').isVisible())) await page.locator('.talos-screen:not([hidden]) [data-azione="dettagli"]').first().click();
      await page.locator('#railTabs [data-rail="agenti"]').click();
      await page.locator('#railAgenti').getByRole('button', { name: /diagram/iu }).first().click();
    }
    await grafo.waitFor();
    return grafo;
  };
  try {
    // i fatti, PRIMA che qualcuno guardi: la conversazione parte, più tardi delega, e la figlia comincia a lavorare
    const { sessionId: root } = registry.avvia('task');
    await pausa(1200);
    const child = await runs[0].input.onDelega('Verifica i file');
    runs[1].input.onEvento({ type: 'ToolCallStart', toolCallId: 'read', toolCallName: 'leggi' });
    await pausa(1200);
    const before = await registry.timelineAgenti(root, { limit: 500 }); expect(before.coverage).toBe('complete');
    const port = await listen(); const base = `http://127.0.0.1:${port}`;
    await page.setViewportSize({ width: 1920, height: 1080 });
    await page.goto(base);
    const grafo = await apriIlDiagramma(root);
    await expect(grafo).toHaveAttribute('data-sorgente', 'deleghe');
    const figlia = grafo.locator(`[data-sessione="${child.childId}"]`);
    await expect(figlia).toHaveAttribute('data-stato', 'running');
    // la storia è quella del registro vero, letta dopo (apertura tardiva)
    const rip = grafo.locator('.gv-rip');
    await expect(rip).toHaveAttribute('data-storia', 'registro', { timeout: 10_000 });
    await expect(rip).toHaveAttribute('data-pronta', 'true');
    const cursore = grafo.getByRole('slider', { name: /riproduzione|replay/iu });
    await cursore.focus();
    await page.keyboard.press('Home');
    await expect(rip).toHaveAttribute('data-attiva', 'true');
    // all'inizio la figlia non era ancora nata
    await expect.poll(async () => (await figlia.getAttribute('data-stato').catch(() => null)) ?? 'nessuno').toMatch(/^(pending|nessuno)$/u);
    // INQUADRATURA: al primo istante la scheda in cima è intera nella tela
    const quadro = await grafo.evaluate((e) => { const a = e.querySelector('.gv-sessione').getBoundingClientRect(); const b = e.querySelector('.gv-tela').getBoundingClientRect(); return { sopra: a.top - b.top, sotto: b.bottom - a.bottom, sinistra: a.left - b.left, destra: b.right - a.right }; });
    for (const lato of Object.keys(quadro)) expect(quadro[lato], `scheda in cima, ${lato}: ${JSON.stringify(quadro)}`).toBeGreaterThanOrEqual(0);
    // un evento in diretta mentre si guarda il passato: l'istante resta dov'è
    const istante = await cursore.getAttribute('aria-valuenow');
    runs[1].input.onEvento({ type: 'ToolCallResult', toolCallId: 'read', content: 'ok' });
    await page.waitForTimeout(1500);
    expect(await cursore.getAttribute('aria-valuenow')).toBe(istante);
    await expect(rip).toHaveAttribute('data-attiva', 'true');
    // tutto finisce; tornando al vivo la figlia è conclusa
    for (const run of runs) { run.input.onEvento({ type: 'RunFinished' }); run.resolve({ ok: true, esito: { detto: 'Fine', comeFinita: 'concluso', messaggiFinali: [] } }); }
    await grafo.getByRole('button', { name: /Torna al vivo|Back to live/u }).click();
    await expect(rip).toHaveAttribute('data-attiva', 'false');
    await expect(figlia).toHaveAttribute('data-stato', 'succeeded', { timeout: 10_000 });
    for (let conto = -1; conto !== writes.length;) { conto = writes.length; await Promise.all(writes); }
    const complete = await registry.timelineAgenti(root, { limit: 500 });
    // il server si riavvia: la storia salvata è la stessa, e il diagramma la rigioca ancora
    await page.goto('about:blank'); await close();
    registry = createSessionRegistry(options); await registry.ripristina(); await listen(port);
    const restored = await registry.timelineAgenti(root, { limit: 500 }); expect(restored.items).toEqual(complete.items);
    await page.goto(base);
    const dopo = await apriIlDiagramma(root);
    const ripDopo = dopo.locator('.gv-rip');
    await expect(ripDopo).toHaveAttribute('data-storia', 'registro', { timeout: 10_000 });
    await expect(dopo.locator(`[data-sessione="${child.childId}"]`)).toHaveAttribute('data-stato', 'succeeded');
    await dopo.getByRole('slider', { name: /riproduzione|replay/iu }).focus();
    await page.keyboard.press('Home');
    await expect(ripDopo).toHaveAttribute('data-attiva', 'true');
    await expect.poll(async () => (await dopo.locator(`[data-sessione="${child.childId}"]`).getAttribute('data-stato').catch(() => null)) ?? 'nessuno').toMatch(/^(pending|nessuno)$/u);
    for (const chiudi of await page.locator('#regioneToast button').all()) if (await chiudi.isVisible()) await chiudi.click();
    await page.screenshot({ path: info.outputPath('deleghe-registro-vero.png'), fullPage: true });
    expect(errori).toEqual([]);
  } finally {
    await page.goto('about:blank');
    for (const run of runs) run.resolve({ ok: true, esito: { messaggiFinali: [] } });
    if (server?.listening) await close();
    await new Promise((resolve) => setImmediate(resolve));
    for (let count = -1; count !== writes.length;) { count = writes.length; await Promise.all(writes); }
    rmSync(store, { recursive: true, force: true });
  }
});
