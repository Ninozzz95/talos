import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { expect, test } from '@playwright/test';
import { apriDiagrammaDellaScena, costruisciScena, instradaScena } from './aiuto-workflow-v2.mjs';

// Le tre immagini sono concept approvati, 1672x941. Questo gate misura il
// browser alle risoluzioni Owner, conserva PNG reali e pretende la gerarchia
// visibile; non dichiara pixel-equality tra dimensioni/contenuti diversi.
const references = Object.freeze({
  14: { file: '../fixtures/r4-approved-14.png', sha256: '1b6f281af51e691883c2885948a29ba05d45d3abe72fd22744d31d860175e351', phases: 3 },
  200: { file: '../fixtures/r4-approved-200.png', sha256: 'c737e863b5009c9adfca0c205f20568cd026480d5a1c9938cc988c73e2a34ce7', phases: 6 },
  5000: { file: '../fixtures/r4-approved-5000.png', sha256: 'cd1650d8b28effacd66f9e4e3f2943b75227b459f54ae125d336a92d6ecc8471', phases: 6 },
});

for (const [count, reference] of Object.entries(references)) {
  test(`R4-MOCKUP-REFERENCE-${count}: approved visual source is pinned`, () => {
    const bytes = readFileSync(fileURLToPath(new URL(reference.file, import.meta.url)));
    expect(createHash('sha256').update(bytes).digest('hex')).toBe(reference.sha256);
  });
}

const matrix = [
  { viewport: { width: 1920, height: 1080 }, theme: 'light' },
  { viewport: { width: 1920, height: 1080 }, theme: 'dark' },
  { viewport: { width: 2560, height: 1440 }, theme: 'light' },
  { viewport: { width: 2560, height: 1440 }, theme: 'dark' },
];

for (const count of [14, 200, 5000]) {
  for (const { viewport, theme } of matrix) {
    test(`R4-MOCKUP-${count}-${viewport.width}x${viewport.height}-${theme}: graph central and phase hierarchy`, async ({ page }, testInfo) => {
      test.setTimeout(count === 5000 ? 120_000 : 45_000);
      // F3-42 (25/09/2026): la scena è un RUN v2 servito dalle rotte vere del backend (panoramica, pagine di fase, dettaglio),
      // con i numeri dimostrativi dei mockup — non più figli legacy promossi a fasi, che rendevano questa prova rossa per costruzione.
      const scena = costruisciScena(count, { sessionId: `r4-mockup-${count}` });
      await page.setViewportSize(viewport);
      await page.addInitScript((colorMode) => {
        localStorage.setItem('talos.harness.desktop.settings.v1', JSON.stringify({
          version: 1, appearance: { colorMode, uiLanguage: 'it' },
        }));
      }, theme);
      const { scritture } = await instradaScena(page, scena);
      const graph = await apriDiagrammaDellaScena(page, scena);
      await expect(graph).toBeVisible();
      await expect(graph).toHaveAttribute('data-sorgente', 'workflow');
      await expect(graph).toHaveAttribute('data-livello', count === 14 ? 'agenti' : 'gruppi');

      const screenshot = testInfo.outputPath(`r4-mockup-${count}-${viewport.width}x${viewport.height}-${theme}.png`);
      await page.screenshot({ path: screenshot, fullPage: false, animations: 'disabled' });
      await testInfo.attach('browser-view', { path: screenshot, contentType: 'image/png' });
      const imageSha256 = createHash('sha256').update(readFileSync(screenshot)).digest('hex');
      await testInfo.attach('visual-evidence', {
        body: Buffer.from(JSON.stringify({ referenceSha256: references[count].sha256,
          imageSha256, viewport, theme, count, fixture: 'workflow-v2 run routes (tests/browser/aiuto-workflow-v2.mjs), mockup numbers' }, null, 2)),
        contentType: 'application/json',
      });

      for (const [route, label] of [['chat', 'Chat'], ['terminale', 'Terminale'], ['review', 'Review'], ['browser', 'Browser']]) {
        const tab = page.locator(`#schermoChat .talos-topbar [data-vaia="${route}"]`);
        await expect(tab).toBeVisible();
        await expect(tab).toContainText(label);
      }
      expect(await page.locator('#railAgenti [data-c="GrafoAgenti"]').count()).toBe(0);
      const bounded = await graph.locator('[data-nodo-id]').count();
      // refactor dei grafi (26/09/2026, decisioni owner 28-31): oltre 12 passi il gruppo aperto è una GRIGLIA sul posto e la
      // tela monta solo ciò che si vede più un margine (`MARGINE_VISIBILE = 240` px, grafo/tela.js) — il DOM resta limitato
      // dalla VISTA, non da 25 card (il tetto del disegno R4 di prima, col campione di quattro righe). ⛔ Quindi il numero
      // dipende dalla finestra: a 2560×1440, 5.000 passi, le montate sono 276 (suite intera del 26/09), e il tetto fisso di
      // 150 scritto prima era una stima presa a 1920. Si prova la PROPRIETÀ — ogni carta montata tocca la tela allargata del
      // margine — e che il conto non segua il totale.
      if (count === 14) expect(bounded).toBe(14);
      else {
        await expect.poll(() => graph.locator('.gv-tela').evaluate((tela) => {
          const r = tela.getBoundingClientRect();
          const margine = 240 + 2; // il margine della tela, più l'arrotondamento dei pixel
          return [...tela.querySelectorAll('.gv-passo')].filter((carta) => {
            const b = carta.getBoundingClientRect();
            return b.right < r.left - margine || b.left > r.right + margine || b.bottom < r.top - margine || b.top > r.bottom + margine;
          }).length;
        }), 'carte montate fuori dalla tela e dal suo margine').toBe(0);
        expect(bounded, 'le carte montate seguono la vista, non il totale').toBeLessThan(count === 5000 ? 500 : 200);
      }

      // Un gruppo di fase nasce dalla Definition v2. Le classi di stato del
      // grafo legacy non sono fasi e non vanno promosse a falso verde.
      await expect(graph.locator('[data-phase-id]')).toHaveCount(references[count].phases);
      expect(scritture).toEqual([]);
    });
  }
}
