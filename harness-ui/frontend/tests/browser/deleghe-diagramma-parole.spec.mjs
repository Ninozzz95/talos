/*
 * LE PAROLE DELLO STATO NEL DIAGRAMMA DELLE DELEGHE (owner 14/10/2026, «Quelle delle deleghe»).
 * Un agente al lavoro diceva «In esecuzione» e uno fermato «Annullato» — le parole del Workflow — mentre il pannello Agenti
 * accanto, il dettaglio dell'agente e la barra laterale dicevano «In corso» e «Interrotto»: la stessa cosa con due nomi nello
 * stesso schermo. Nel diagramma delle deleghe valgono le parole delle deleghe; il diagramma del Workflow resta com'è.
 * Solo letture: ogni scrittura si ferma e si conta.
 */
import { expect, test } from '@playwright/test';
import { apri, figlia, finita } from './aiuto-deleghe-diagramma.mjs';
import { apriDiagrammaDellaScena, costruisciScena, instradaScena } from './aiuto-workflow-v2.mjs';

const scena = () => [
  figlia('a', 10, { taskCorto: 'Agente al lavoro' }),
  finita('b', 11, 70, { taskCorto: 'Agente finito' }),
  figlia('c', 12, { taskCorto: 'Agente fermato', interrotta: true }),
  finita('d', 13, 80, { taskCorto: 'Agente fallito', esitoDelega: 'fallito' }),
];
/* tutto ciò che si legge o si sente dentro il diagramma: testo, nomi letti, suggerimenti */
const tuttoCioCheSiLegge = (grafo) => grafo.evaluate((g) => {
  const out = [String(g.innerText || '')];
  for (const n of g.querySelectorAll('[aria-label], [title]')) out.push(n.getAttribute('aria-label') ?? '', n.getAttribute('title') ?? '');
  return out.join('\n');
});
const pill = (grafo, id) => grafo.locator(`[data-sessione="${id}"] .gv-passo-pill`);

test('DELEGHE-PAROLE-01 — sulle schede: «In corso», «Concluso», «Interrotto», «Non riuscito»; in tutto il diagramma delle deleghe nessun «In esecuzione» e nessun «Annullato»', async ({ page }) => {
  const errori = []; page.on('pageerror', (e) => errori.push(e.message));
  const { grafo, scritture } = await apri(page, scena());
  await expect(pill(grafo, 'a')).toHaveText('In corso');
  await expect(pill(grafo, 'b')).toHaveText('Concluso');
  await expect(pill(grafo, 'c')).toHaveText('Interrotto');
  await expect(pill(grafo, 'd')).toHaveText('Non riuscito');
  await expect(grafo.locator('[data-sessione="c"]')).toHaveAccessibleName(/Agente fermato, Interrotto/u);
  // la conversazione in cima e la testata: le parole della barra laterale
  await expect(grafo.locator('.gv-sessione .talos-wfg__pill')).toHaveText('In corso');
  await expect(grafo.locator('.talos-wfg__stato-run')).toHaveText(/^In corso/u);
  // il dettaglio dell'agente fermato
  await grafo.locator('[data-sessione="c"]').click();
  await expect(grafo.locator('.gv-dettaglio .talos-wfg__dettaglio-testa .talos-wfg__pill')).toHaveText('Interrotto');
  // la barra del lotto, per chi la ascolta: le famiglie con le stesse parole
  await expect(grafo.locator('.gv-segmenti').first()).toHaveAttribute('aria-label', /In corso 1/u);
  await expect(grafo.locator('.gv-segmenti').first()).toHaveAttribute('aria-label', /Interrotti 1/u);
  // le tre viste: da nessuna parte le parole del Workflow
  for (const vista of ['dipendenze', 'tempo', 'lettura']) {
    await grafo.locator(`[data-vista="${vista}"]`).click();
    await page.waitForTimeout(250);
    const letto = await tuttoCioCheSiLegge(grafo);
    expect(letto, `vista ${vista}`).not.toMatch(/In esecuzione/u);
    expect(letto, `vista ${vista}`).not.toMatch(/Annullat/u);
    expect(letto, `vista ${vista}`).not.toMatch(/Riuscit[oa]\b/u);
  }
  await grafo.locator('[data-vista="lettura"]').click();
  await expect(grafo.locator('.gv-lettura')).toContainText('Interrotto');
  await expect(grafo.locator('.gv-lettura')).toContainText('In corso');
  expect(scritture).toEqual([]);
  expect(errori).toEqual([]);
});

test('DELEGHE-PAROLE-02 — in inglese: «Running», «Done», «Stopped», «Failed»; nessun «Cancelled» nel diagramma delle deleghe', async ({ page }) => {
  const { grafo } = await apri(page, scena(), { lingua: 'en' });
  await expect(pill(grafo, 'a')).toHaveText('Running');
  await expect(pill(grafo, 'b')).toHaveText('Done');
  await expect(pill(grafo, 'c')).toHaveText('Stopped');
  await expect(pill(grafo, 'd')).toHaveText('Failed');
  await expect(grafo.locator('.gv-sessione .talos-wfg__pill')).toHaveText('Running');
  await expect(grafo.locator('.gv-segmenti').first()).toHaveAttribute('aria-label', /Stopped 1/u);
  const letto = await tuttoCioCheSiLegge(grafo);
  expect(letto).not.toMatch(/Cancelled/u);
  expect(letto).not.toMatch(/Succeeded/u);
});

test('DELEGHE-PAROLE-03 — la conversazione in cima, finita: «Conclusa» (non «Riuscito»); con un agente al lavoro il nome corto del modello entra INTERO accanto a «In corso»', async ({ page }) => {
  const { grafo } = await apri(page, [finita('b', 11, 70, { taskCorto: 'Agente finito' })], { principale: { conclusa: true, ultimoEsito: 'concluso' } });
  await expect(grafo.locator('.gv-sessione .talos-wfg__pill')).toHaveText('Conclusa');
  await expect(grafo.locator('.talos-wfg__stato-run')).toHaveText(/^Conclusa/u);
  // il modello accanto allo stato «al lavoro»: era «glm-5.3-…» accanto a «In esecuzione» (SECONDA-MODELLO-03)
  const { grafo: vivo } = await apri(page, [figlia('a', 10, { taskCorto: 'Agente A' })]);
  const m = await vivo.locator('[data-sessione="a"] .gv-passo-piede .gv-passo-modello').evaluate((n) => ({ testo: n.textContent, serve: n.scrollWidth, ha: n.clientWidth }));
  expect(m.testo).toBe('glm-5.3-flash');
  expect(m.serve, JSON.stringify(m)).toBeLessThanOrEqual(m.ha);
});

test('DELEGHE-PAROLE-04 — AL CONTRARIO: nel diagramma del WORKFLOW le parole restano le sue — un passo al lavoro è «In esecuzione»', async ({ page }) => {
  const scenaWf = costruisciScena(5, { sessionId: 'wf-parole-5' });
  await instradaScena(page, scenaWf);
  const grafo = await apriDiagrammaDellaScena(page, scenaWf);
  await expect(grafo.locator('.gv-passo[data-stato="running"] .gv-passo-pill').first()).toHaveText('In esecuzione');
  const letto = await tuttoCioCheSiLegge(grafo);
  expect(letto).toMatch(/In esecuzione/u);
  expect(letto).not.toMatch(/Interrott/u);
});

test('DELEGHE-PAROLE-05 — un agente FERMATO di cui non si sa l’ora di fine: il dettaglio dice quando è partito, mai «→ in corso» accanto a «Interrotto»; AL CONTRARIO chi lavora lo dice', async ({ page }) => {
  // foto del 14/10/2026: «z-ai/glm-5.3-flash · 16:00 → in corso» sotto la pastiglia «Interrotto»
  const { grafo } = await apri(page, scena());
  const riga = grafo.locator('.gv-dettaglio .talos-wfg__dettaglio-testi .talos-wfg__passo-modello').first();
  await grafo.locator('[data-sessione="c"]').click();
  await expect(grafo.locator('.gv-dettaglio .talos-wfg__dettaglio-testa .talos-wfg__pill')).toHaveText('Interrotto');
  await expect(riga).toContainText('16:00');
  await expect(riga).not.toContainText('in corso');
  await page.waitForTimeout(1300); // il dettaglio si ridisegna una volta al secondo: non torna
  await expect(riga).not.toContainText('in corso');
  // AL CONTRARIO: l'agente al lavoro
  await grafo.locator('[data-sessione="a"]').click();
  await expect(grafo.locator('.gv-dettaglio .talos-wfg__dettaglio-testa .talos-wfg__pill')).toHaveText('In corso');
  await expect(riga).toContainText('→ in corso');
});

test('DELEGHE-PAROLE-06 — il nome corto del modello entra INTERO anche accanto a «Non riuscito» e a «Interrotto»', async ({ page }) => {
  // misurato il 14/10/2026: accanto a «Non riuscito» «glm-5.3-flash» voleva 73 px e ne aveva 67
  const { grafo } = await apri(page, scena());
  for (const id of ['a', 'b', 'c', 'd']) {
    const m = await grafo.locator(`[data-sessione="${id}"] .gv-passo-piede .gv-passo-modello`).evaluate((n) => ({ testo: n.textContent, serve: n.scrollWidth, ha: n.clientWidth }));
    expect(m.testo, id).toBe('glm-5.3-flash');
    expect(m.serve, `scheda «${id}»: ${JSON.stringify(m)}`).toBeLessThanOrEqual(m.ha);
  }
  // e il testo non finisce sotto l'icona del ruolo, in fondo a destra
  const sovrapposti = await grafo.evaluate((g) => [...g.querySelectorAll('[data-sessione]')].filter((c) => {
    const m = c.querySelector('.gv-passo-piede .gv-passo-modello')?.getBoundingClientRect(); const r = c.querySelector('.gv-passo-ruolo')?.getBoundingClientRect();
    return m && r && m.right > r.left;
  }).map((c) => c.dataset.sessione));
  expect(sovrapposti).toEqual([]);
});

test('DELEGHE-PAROLE-07 — vista Tempo: la barra di un agente FERMATO senza un’ora di fine non arriva fino ad adesso; AL CONTRARIO quella di chi lavora sì, e dice «in corso»', async ({ page }) => {
  // foto del 14/10/2026: «Riscrivi le prove», fermato, con una barra grigia lunga «27 h 23 min» fino all'istante di adesso
  const { grafo } = await apri(page, scena());
  await grafo.locator('[data-vista="tempo"]').click();
  await expect(grafo.locator('.gv-tempo-barra[data-stato="running"]').first()).toBeVisible();
  /* ⛔ La vista Tempo si ridisegna una volta al secondo e SOSTITUISCE le barre: cercare la barra e misurarla in due passi
     separati misurava, sotto carico, un nodo già staccato (larghezza 0 col suo titolo intero — regressione del 14/10/2026).
     Si cerca e si misura nello stesso istante, dentro la pagina. */
  const misura = (stato) => grafo.evaluate((g, s) => {
    const b = g.querySelector(`.gv-tempo-barra[data-stato="${s}"]`);
    return b ? { larga: Math.round(b.getBoundingClientRect().width), titolo: b.getAttribute('title') ?? b.getAttribute('aria-label') ?? '', testo: b.textContent } : null;
  }, stato);
  const alLavoro = await misura('running'); const fermato = await misura('cancelled');
  expect(alLavoro, 'la barra di chi lavora').not.toBeNull(); expect(fermato, 'la barra del fermato').not.toBeNull();
  expect(alLavoro.titolo).toContain('in corso');
  expect(alLavoro.larga, JSON.stringify(alLavoro)).toBeGreaterThan(200);
  expect(fermato.titolo, JSON.stringify(fermato)).toContain('Interrotto');
  expect(fermato.titolo).not.toContain('in corso');
  expect(fermato.larga, `la barra dell’agente fermato: ${JSON.stringify(fermato)}`).toBeLessThan(40);
  expect(fermato.testo, 'nessuna durata inventata dentro la barra').toBe('');
});

/* Cura T6 della terza passata, vista nella FOTO: la ricerca delle deleghe guarda tutti gli agenti, e la sua riga lo dice giusto. */
test('DELEGHE-PAROLE-08 — la riga della ricerca nelle deleghe non dice «fra quelli caricati»: cerca fra TUTTI gli agenti, anche nei lotti chiusi', async ({ page }) => {
  const lotto = (k, nascita) => Array.from({ length: 10 }, (_, i) => finita(`l${k}-${i}`, nascita + i, nascita + 40 + i, { taskCorto: `Agente ${k}.${i + 1}` }));
  const figli = [...lotto(1, 10), ...lotto(2, 200), ...lotto(3, 400)];
  figli[4] = finita('l1-4', 14, 54, { taskCorto: 'Controlla le valute straniere' });
  const { grafo } = await apri(page, figli);
  await grafo.getByRole('button', { name: 'Cerca nel diagramma' }).click();
  await grafo.getByRole('searchbox', { name: 'Cerca fra agenti e lotti del diagramma' }).fill('valute');
  await expect(grafo.locator('.talos-wfg__esito-cerca')).toHaveText('1 agente e 0 lotti corrispondono · Invio per andare al prossimo');
});
