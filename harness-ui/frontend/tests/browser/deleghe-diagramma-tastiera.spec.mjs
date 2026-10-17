/*
 * 13/10/2026 (bugfixer, lotto 2) — la TASTIERA e le PAROLE del diagramma delle deleghe. Ogni prova è nata rossa.
 *   K1, K2 e le etichette: trovati dalla sessione desktop portando le prove della vista classica (`AGGIUNTE-LOTTO-2`).
 *   03 e 04: trovati dalla review — i menu e la colonna dei file venivano RICOSTRUITI a ogni aggiornamento dal vivo, e il fuoco
 *   di chi usa la tastiera cadeva sul `<body>` (da lì un Esc arriva alla pagina).
 * Solo letture: ogni scrittura si ferma e si conta (`apri`, banco comune).
 */
import { expect, test } from '@playwright/test';
import { apri, eventoAgente, figlia, finita } from './aiuto-deleghe-diagramma.mjs';

const fuoco = (page) => page.evaluate(() => {
  const e = document.activeElement;
  return { tag: e?.tagName ?? null, sessione: e?.dataset?.sessione ?? null, nelDiagramma: Boolean(e?.closest?.('[data-c="GrafoAgenti"]')), ruolo: e?.getAttribute?.('role') ?? null,
    azione: e?.dataset?.azione ?? null, statoId: e?.dataset?.statoId ?? null, percorso: e?.dataset?.percorso ?? null };
});

test('DELEGHE-TASTIERA-01 (K1) — Invio su una scheda col fuoco apre QUELLA (come lo Spazio), non l’agente già scelto; il fuoco resta nel diagramma', async ({ page }) => {
  const errori = []; page.on('pageerror', (e) => errori.push(e.message));
  const { grafo } = await apri(page, [figlia('a', 10), figlia('b', 11), figlia('c', 12)]);
  const dettaglio = grafo.locator('.gv-dettaglio');
  await grafo.locator('[data-sessione="a"]').click();
  await expect(dettaglio).toContainText('Compito a');
  await grafo.locator('[data-sessione="b"]').focus();
  await page.keyboard.press('Enter');
  await expect(dettaglio).toContainText('Compito b');
  await expect(grafo.locator('[data-sessione="b"]')).toHaveAttribute('aria-pressed', 'true');
  await expect(grafo.locator('[data-sessione="a"]')).toHaveAttribute('aria-pressed', 'false');
  expect((await fuoco(page)).nelDiagramma, 'dopo l’apertura il fuoco non finisce sul body').toBe(true);
  // lo Spazio fa la stessa cosa
  await grafo.locator('[data-sessione="c"]').focus();
  await page.keyboard.press('Space');
  await expect(dettaglio).toContainText('Compito c');
  // AL CONTRARIO: con la TELA a fuoco (nessuna scheda), Invio apre l'agente scelto, com'era
  await grafo.locator('.gv-tela').focus();
  await page.keyboard.press('Enter');
  await expect(dettaglio).toContainText('Compito c');
  expect(errori).toEqual([]);
});

test('DELEGHE-TASTIERA-01b (K1) — quattordici agenti: Invio sulla dodicesima scheda apre la dodicesima, non la prima scelta', async ({ page }) => {
  const { grafo } = await apri(page, Array.from({ length: 14 }, (_, i) => figlia(`d${i}`, 10 + i)));
  const dettaglio = grafo.locator('.gv-dettaglio');
  await grafo.locator('[data-sessione="d0"]').click();
  await expect(dettaglio).toContainText('Compito d0');
  await grafo.locator('[data-sessione="d12"]').focus();
  await page.keyboard.press('Enter');
  await expect(dettaglio).toContainText('Compito d12');
  expect((await fuoco(page)).nelDiagramma).toBe(true);
});

test('DELEGHE-TASTIERA-02 (K2) — il menu vero della delega: le frecce, Home e Fine spostano il fuoco fra le voci, in tondo; il «⋯» dice che è aperto', async ({ page }) => {
  const { grafo } = await apri(page, [figlia('a', 10), figlia('b', 11)]);
  await grafo.locator('[data-sessione="a"]').click();
  const puntini = grafo.locator('.gv-dettaglio [data-focus-key="dettaglio:menu"]');
  await puntini.focus();
  await page.keyboard.press('Enter');
  const voci = page.locator('.ft-actions-menu [role="menuitem"]');
  await expect(voci.first()).toBeFocused();
  const quante = await voci.count();
  expect(quante).toBeGreaterThanOrEqual(3); // un agente al lavoro: apri, sessione intera, pausa, ferma
  await expect(puntini).toHaveAttribute('aria-expanded', 'true');
  await page.keyboard.press('ArrowDown');
  await expect(voci.nth(1)).toBeFocused();
  await page.keyboard.press('ArrowUp'); await page.keyboard.press('ArrowUp');
  await expect(voci.nth(quante - 1)).toBeFocused(); // in tondo
  await page.keyboard.press('Home');
  await expect(voci.first()).toBeFocused();
  await page.keyboard.press('End');
  await expect(voci.nth(quante - 1)).toBeFocused();
  await page.keyboard.press('ArrowDown');
  await expect(voci.first()).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(page.locator('.ft-actions-menu')).toHaveCount(0);
  await expect(puntini).toBeFocused();
  await expect(puntini).toHaveAttribute('aria-expanded', 'false');
  await expect(grafo).toBeVisible(); // Esc ha chiuso il menu, non il diagramma
});

test('DELEGHE-TASTIERA-03 — il menu dello stato APERTO da tastiera non perde il fuoco quando arriva un aggiornamento dal vivo', async ({ page }) => {
  const figli = [figlia('a', 10), figlia('b', 11), finita('c', 12, 40)];
  const { grafo } = await apri(page, () => figli);
  const stato = grafo.locator('[data-filtro-stato]');
  await expect(grafo.locator('[data-sessione]')).toHaveCount(3); // il diagramma ha letto i fatti: il menu ha le sue voci
  await stato.locator('> button').focus();
  await page.keyboard.press('Enter');
  await expect(stato.locator('[role="menu"]')).toBeVisible();
  expect((await fuoco(page)).statoId).toBe('all');
  await page.keyboard.press('ArrowDown');
  expect((await fuoco(page)).statoId).toBe('working');
  // dal vivo «b» finisce: i conti del menu cambiano (al lavoro 2 → 1, finiti 1 → 2)
  figli.splice(1, 1, finita('b', 11, 60));
  await eventoAgente(page, figli[1]);
  await expect(stato.locator('[data-stato-id="finished"] .talos-wfg__menu-conto')).toHaveText('2', { timeout: 4000 });
  await expect(stato.locator('[role="menu"]')).toBeVisible();
  expect(await fuoco(page), 'il fuoco resta sulla voce dov’era').toMatchObject({ statoId: 'working', nelDiagramma: true });
  await page.keyboard.press('ArrowDown'); // «In attesa» è a zero (spenta): la freccia va alla prossima voce accesa
  expect((await fuoco(page)).statoId).toBe('finished');
  await page.keyboard.press('Escape');
  await expect(stato.locator('[role="menu"]')).toBeHidden();
  await expect(grafo).toBeVisible();
});

test('DELEGHE-TASTIERA-04 — la colonna dei file: una riga col fuoco lo TIENE mentre l’agente lavora (il dettaglio si aggiorna ogni secondo), e Invio apre il file', async ({ page }) => {
  const file = [{ percorso: 'src/listini.mjs', scritto: true }, { percorso: 'README.md', letto: true }];
  const { grafo } = await apri(page, [figlia('a', 10, { attivita: { file, chiamate: 2, passi: [] } }), figlia('b', 11)]);
  await grafo.locator('[data-sessione="a"]').click();
  const righe = grafo.locator('.gv-dettaglio .talos-wfg__file');
  await expect(righe).toHaveCount(2);
  await righe.first().focus();
  expect((await fuoco(page)).percorso).toBe('src/listini.mjs');
  await page.waitForTimeout(2600); // più di due battiti da un secondo
  expect(await fuoco(page), 'il fuoco resta sulla riga del file').toMatchObject({ percorso: 'src/listini.mjs', nelDiagramma: true });
  await page.keyboard.press('ArrowDown'); // niente da fare qui: non deve rompere
  await page.keyboard.press('Enter');
  await expect(page.locator('#railTabs [data-rail="file"]')).toHaveAttribute('aria-selected', 'true');
});

for (const [lingua, parole] of [
  ['it', { scheda: /^Questa conversazione: Sistema i listini, ha avviato questi agenti$/u, riproduzione: 'Riproduzione del lavoro degli agenti', cursore: 'Istante della riproduzione', gioca: 'Riproduci dall’inizio', riprendi: 'Riprendi la riproduzione', vietate: /workflow|\brun\b/iu }],
  ['en', { scheda: /^This conversation: Sistema i listini, started these agents$/u, riproduzione: 'Replay of the agents’ work', cursore: 'Replayed instant', gioca: 'Replay from the start', riprendi: 'Resume the replay', vietate: /workflow|\b(the|a) run\b/iu }], // in inglese «run» è anche un verbo («what has already run»): si vieta il nome
]) {
  test(`DELEGHE-TASTIERA-05 (${lingua}) — le parole per le deleghe: niente «workflow» né «run» nelle etichette, e in pausa il pulsante dice che RIPRENDE`, async ({ page }) => {
    const { grafo } = await apri(page, [finita('a', 10, 70), finita('b', 80, 200), figlia('c', 210)], { lingua });
    const rip = grafo.locator('.gv-rip');
    await expect(rip).toHaveAttribute('data-pronta', 'true');
    await expect(grafo.locator('[data-coordinatore="true"]')).toHaveAttribute('aria-label', parole.scheda);
    await expect(rip).toHaveAttribute('aria-label', parole.riproduzione);
    const cursore = rip.getByRole('slider');
    await expect(cursore).toHaveAttribute('aria-label', parole.cursore);
    const gioca = rip.locator('.gv-rip-gioca');
    await expect(gioca).toHaveAttribute('aria-label', parole.gioca);
    // a metà storia, in pausa: il pulsante riprende da lì, e lo dice
    await cursore.focus();
    await page.keyboard.press('Home');
    await page.keyboard.press('ArrowRight');
    await expect(rip).toHaveAttribute('data-attiva', 'true');
    await expect(gioca).toHaveAttribute('aria-label', parole.riprendi);
    const istante = await cursore.getAttribute('aria-valuetext');
    await gioca.click();   // riprende…
    await gioca.click();   // …e si rimette in pausa: non è tornato all'inizio
    expect(await cursore.getAttribute('aria-valuetext')).not.toBe(await (async () => { await page.keyboard.press('Home'); const inizio = await cursore.getAttribute('aria-valuetext'); return inizio === istante ? '__uguale__' : inizio; })());
    // nessuna etichetta del diagramma (aria-label, title) porta le due parole del Workflow
    const etichette = await grafo.evaluate((radice) => [...radice.querySelectorAll('[aria-label], [title]')].filter((n) => !n.closest('[hidden]') && n.offsetParent !== null)
      .flatMap((n) => [n.getAttribute('aria-label'), n.getAttribute('title')]).filter(Boolean));
    expect(etichette.filter((t) => parole.vietate.test(t))).toEqual([]);
  });
}
