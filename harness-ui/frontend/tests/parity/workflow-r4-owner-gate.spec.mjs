/*
 * OWNER UI GATE R4 — mockup Workflow/Plan/Ask.
 * Inserito da ChatGPT / GPT-5.6 Sol su istruzione Owner, 22/09/2026.
 *
 * 14 scene normative × 4 progetti (1920×1080 / 2560×1440, light/dark)
 * = 56 screenshot destinati alla review visuale dell'Owner.
 *
 * Questo gate NON autorizza production.
 */
import { expect, test } from '@playwright/test';
import { R4_PRIMARY_SCENES as WORKFLOW_R4_PRIMARY_SCENES } from '../../lab/fixtures/workflow-r4.js';

const GRAPH_SCENES = new Set([
  'workflow-graph-14',
  'workflow-graph-200',
  'workflow-graph-5000',
]);
const PLAN_SCENES = new Set([
  'plan-proposed',
  'plan-error',
  'plan-approved',
]);
const ASK_ACTIVE_SCENES = new Set([
  'ask-single',
  'ask-multi-review',
]);

function themeFor(projectName) {
  return projectName.endsWith('-light') ? 'light' : 'dark';
}

test.describe('UI-OWNER-FINAL-GATE-R4', () => {
  for (const scene of WORKFLOW_R4_PRIMARY_SCENES) {
    test(`R4 OWNER MOCKUP · ${scene}`, async ({ page }, testInfo) => {
      const pageErrors = [];
      const consoleErrors = [];
      page.on('pageerror', (error) => pageErrors.push(error.message));
      page.on('console', (message) => {
        if (message.type() === 'error') consoleErrors.push(message.text());
      });

      await page.goto(`/?componente=WorkflowSpec&scena=${encodeURIComponent(scene)}`);
      await expect(page.locator('html')).toHaveAttribute('data-visual-ready', 'true', { timeout: 20_000 });
      await page.evaluate((mode) => {
        document.documentElement.setAttribute('data-theme', mode);
        document.documentElement.setAttribute('data-talos-mode', mode);
      }, themeFor(testInfo.project.name));
      await page.evaluate(() => document.fonts.ready);

      const topbar = page.locator('#schermoChat .talos-topbar');
      await expect(topbar).toBeAttached();
      const topText = ((await topbar.textContent()) || '').replace(/\s+/g, ' ');
      for (const label of ['Chat', 'Terminale', 'Review', 'Browser']) {
        expect(topText, `header R4 deve conservare ${label}`).toContain(label);
      }
      await expect(topbar).toBeVisible();

      await expect(page.locator('.wf-graph')).toHaveCount(0);
      await expect(page.locator('.wf-node')).toHaveCount(0);
      await expect(page.locator('[data-workflow-route], [data-workflow-tab]')).toHaveCount(0);

      if (PLAN_SCENES.has(scene)) {
        await expect(page.locator('[data-r4-plan]')).toBeVisible();
        await expect(page.locator('[data-r4-plan]')).toContainText('hash');
      }

      if (ASK_ACTIVE_SCENES.has(scene)) {
        const ask = page.locator('.r4-ask');
        await expect(ask).toBeVisible();
        expect(await ask.evaluate((node) => node.nextElementSibling?.id)).toBe('composerForm');
      }

      if (scene === 'ask-resolved-receipt') {
        await expect(page.locator('.r4-ask')).toHaveCount(0);
        await expect(page.locator('[data-r4-receipt]')).toBeVisible();
      }

      if (scene.startsWith('rail-')) {
        await expect(page.locator('#railAgenti')).toBeVisible();
        await expect(page.locator('#railTabs [data-rail="agenti"]')).toHaveAttribute('aria-selected', 'true');
      }

      if (scene === 'rail-current-3') {
        await expect(page.locator('#railAgenti [data-c="AgentRow"]')).toHaveCount(3);
        await expect(page.locator('#railAgenti').getByRole('button', { name: /Apri visuale diagramma/i })).toBeVisible();
      }

      if (scene.startsWith('rail-status-first-')) {
        await expect(page.locator('#railAgenti')).toHaveAttribute('data-r4-variant', 'status-first');
      }
      if (scene.startsWith('rail-group-first-')) {
        await expect(page.locator('#railAgenti')).toHaveAttribute('data-r4-variant', 'group-first');
      }
      if (scene.startsWith('rail-hybrid-')) {
        await expect(page.locator('#railAgenti')).toHaveAttribute('data-r4-variant', 'hybrid');
      }

      if (GRAPH_SCENES.has(scene)) {
        const graph = page.locator('#schermoChat.talos-grafo-aperto > [data-c="GrafoAgenti"]');
        await expect(graph).toBeVisible();
        const topbarBottom = await topbar.evaluate((node) => node.getBoundingClientRect().bottom);
        const graphTop = await graph.evaluate((node) => node.getBoundingClientRect().top);
        expect(graphTop, 'il diagramma deve iniziare sotto la testata intatta').toBeGreaterThanOrEqual(topbarBottom - 1);
        await expect(page.locator('#railAgenti [data-c="GrafoAgenti"]')).toHaveCount(0);
        await expect(graph.getByRole('button', { name: 'Chiudi il diagramma' })).toBeVisible();
        await expect(graph.getByRole('searchbox', { name: 'Cerca agente nel diagramma' })).toBeVisible();
        await expect(graph.getByRole('button', { name: 'Adatta', exact: true })).toBeVisible();
        await expect(graph.getByRole('button', { name: 'Lettura', exact: true })).toBeVisible();
      }

      if (scene === 'workflow-graph-5000') {
        await expect(page.locator('.r4-graph-note')).toContainText('5.000 agenti logici');
        const domNodes = await page.locator('[data-c="GrafoAgenti"] [data-nodo-id]').count();
        expect(domNodes, 'WF-5000-BOUNDED-DOM').toBeLessThan(100);
      }

      const layout = await page.evaluate(() => {
        const doc = document.documentElement;
        const body = document.body;
        const rail = document.querySelector('#railAgenti');
        const directBodyText = [...body.childNodes]
          .filter((node) => node.nodeType === Node.TEXT_NODE)
          .map((node) => node.textContent || '')
          .join(' ');
        return {
          pageOverflowX: doc.scrollWidth - doc.clientWidth,
          railOverflowX: rail ? rail.scrollWidth - rail.clientWidth : 0,
          viewportHeight: window.innerHeight,
          scrollHeight: Math.max(doc.scrollHeight, body.scrollHeight),
          railTop: rail ? rail.getBoundingClientRect().top : null,
          rawCssLeak:
            directBodyText.includes('.talos-') ||
            directBodyText.includes('--talos-') ||
            directBodyText.includes('@media'),
        };
      });
      expect(layout.pageOverflowX, 'nessun overflow orizzontale della pagina').toBeLessThanOrEqual(1);
      expect(layout.railOverflowX, 'nessun overflow orizzontale nel rail').toBeLessThanOrEqual(1);
      expect(layout.rawCssLeak, 'nessun CSS grezzo deve finire come testo nel documento').toBe(false);
      expect(
        layout.scrollHeight,
        'la shell owner-gate non può diventare una pagina verticale multi-viewport',
      ).toBeLessThanOrEqual(layout.viewportHeight * 2);
      if (layout.railTop != null) {
        expect(
          layout.railTop,
          'il rail deve restare nella shell, non migliaia di pixel sotto il viewport',
        ).toBeLessThanOrEqual(layout.viewportHeight * 1.5);
      }

      expect(pageErrors, 'nessun pageerror nel mockup').toEqual([]);
      expect(consoleErrors, 'nessun console.error nel mockup').toEqual([]);

      await page.screenshot({
        path: testInfo.outputPath(`R4-${scene}-${testInfo.project.name}.png`),
        // La baseline owner è il viewport del progetto; fullPage può mascherare
        // una regressione della shell trasformandola in una pagina verticale enorme.
        fullPage: false,
      });
    });
  }
});

test.describe('R4 focused interactions', () => {
  test('ASK-MULTI-REVIEW — review resta sopra il composer e non apre modal', async ({ page }) => {
    await page.goto('/?componente=WorkflowSpec&scena=ask-multi');
    await expect(page.locator('html')).toHaveAttribute('data-visual-ready', 'true');
    const dock = page.locator('.r4-ask');
    await dock.getByRole('checkbox').first().check();
    await dock.getByRole('button', { name: 'Rivedi risposte' }).click();
    await expect(dock.locator('.r4-ask__review')).toBeVisible();
    expect(await dock.evaluate((node) => node.nextElementSibling?.id)).toBe('composerForm');
    await expect(page.locator('[role="dialog"].r4-ask')).toHaveCount(0);
  });

  test('WORKFLOW-PENDING-ASK — il grafo resta centrale finché la persona apre la domanda', async ({ page }) => {
    await page.goto('/?componente=WorkflowSpec&scena=workflow-graph-pending-question');
    await expect(page.locator('html')).toHaveAttribute('data-visual-ready', 'true');
    const graph = page.locator('#schermoChat > [data-c="GrafoAgenti"]');
    await expect(graph).toBeVisible();
    await page.getByRole('button', { name: 'Apri domanda' }).click();
    await expect(graph).toHaveCount(0);
    const ask = page.locator('.r4-ask');
    await expect(ask).toBeVisible();
    expect(await ask.evaluate((node) => node.nextElementSibling?.id)).toBe('composerForm');
  });

  test('RAIL-HYBRID-5000 — nessuna lista infinita di AgentRow', async ({ page }) => {
    await page.goto('/?componente=WorkflowSpec&scena=rail-hybrid-5000');
    await expect(page.locator('html')).toHaveAttribute('data-visual-ready', 'true');
    await expect(page.locator('#railAgenti')).toHaveAttribute('data-r4-variant', 'hybrid');
    await expect(page.locator('#railAgenti [data-c="AgentRow"]')).toHaveCount(0);
    expect(await page.locator('#railAgenti .r4-group').count()).toBeLessThanOrEqual(10);
    await expect(page.locator('#railAgenti')).toContainText('5.000 agenti logici');
    await expect(page.locator('#railAgenti .r4-summary__item').last().locator('b')).toHaveText('3.733');
  });
});
