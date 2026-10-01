import { test, expect } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { resolve, join } from 'node:path';

const sessionId = 'retry05-ui';
const evidence = resolve(process.cwd(), '..', '..', 'artifacts', 'retry05-ui');
const partial = 'Ho letto i file del progetto. La verifica è ancora da completare.';
const technical = `Risposta interrotta durante la generazione. ${'diagnostica_'.repeat(180)}`;
const events = [
  { type: 'RunStarted', threadId: sessionId, runId: 'retry05-run', input: { consegna: 'Controlla i file del progetto' } },
  { type: 'TextMessageStart', messageId: 'retry05-partial', role: 'assistant' },
  { type: 'TextMessageContent', messageId: 'retry05-partial', delta: partial },
  { type: 'TextMessageEnd', messageId: 'retry05-partial' },
  { type: 'RunError', code: 'PROVIDER_OUTCOME_UNKNOWN', message: technical },
].map((e, i) => ({ ...e, _sequenza: i + 1 }));

async function openSession(page) {
  await page.waitForFunction(() => window.__talosHarnessUiRuntime);
  await page.locator('#talosAvvio').waitFor({ state: 'detached' });
  await page.evaluate((id) => window.__talosHarnessUiRuntime.passaASessione(id, 'workspace', 'Verifica interrotta', 'test/model', { conclusa: true, modello: 'test/model' }), sessionId);
  await page.waitForFunction(() => window.__talosHarnessUiRuntime.realSessionState.inRigiocata === false);
}

for (const theme of ['dark', 'light']) {
  test(`RETRY05-UI ${theme}: parziale, recupero esplicito, reload e layout`, async ({ page }) => {
    await page.setViewportSize({ width: 1920, height: 1080 });
    await page.emulateMedia({ reducedMotion: 'reduce', colorScheme: theme });
    await page.addInitScript((mode) => {
      if (window !== window.top) return;
      localStorage.setItem('talos.harness.desktop.settings.v1', JSON.stringify({ version: 1, appearance: { colorMode: mode, uiLanguage: 'it', interfaceMotion: false } }));
    }, theme);
    const mutations = [], errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.route('**/api/v1/**', route => {
      const request = route.request();
      const path = new URL(request.url()).pathname;
      if (request.method() !== 'GET' && path.startsWith('/api/v1/sessions/')) {
        mutations.push(`${request.method()} ${path}`);
        return route.abort();
      }
      if (path === `/api/v1/sessions/${sessionId}/events`) {
        return route.fulfill({ contentType: 'text/event-stream', body: `retry: 3600000\n${[...events, { type: 'CUSTOM', name: 'talos.fine-rigiocata', value: null }].map(e => `data: ${JSON.stringify(e)}\n\n`).join('')}` });
      }
      if (path === `/api/v1/sessions/${sessionId}/children`) return route.fulfill({ json: { ok: true, data: { figli: [] } } });
      return route.continue();
    });
    await page.goto('/');
    await openSession(page);
    const conversation = page.locator('#conversation');
    const note = conversation.locator('[data-c="SystemNote"]').filter({ hasText: 'Non è stato possibile completare la risposta' });
    await expect(note).toHaveCount(1);
    await expect(conversation).toContainText(partial);
    await expect(note).toContainText('non l’ha reinviata automaticamente');
    await expect(note).toContainText('un altro costo');
    await expect(note.locator('.talos-badge--warning')).toHaveText('Risposta interrotta');
    await expect(note.locator('details')).not.toHaveAttribute('open', '');
    await expect(note).not.toContainText(/non è arrivata|non è ancora tradotta/u);
    mkdirSync(evidence, { recursive: true });
    for (const [width, height] of [[1920, 1080], [2560, 1440]]) {
      await page.setViewportSize({ width, height });
      await note.scrollIntoViewIfNeeded();
      const summary = note.locator('summary');
      await summary.focus();
      await summary.press('Enter');
      await expect(note.locator('details')).toHaveAttribute('open', '');
      await expect(note.locator('pre')).toContainText(technical);
      const colors = await note.evaluate(e => {
        const expected = token => {
          const probe = document.createElement('span');
          probe.style.color = getComputedStyle(e).getPropertyValue(token).trim();
          e.append(probe);
          const value = getComputedStyle(probe).color;
          probe.remove();
          return value;
        };
        return { border: getComputedStyle(e).borderLeftColor, warning: expected('--talos-warning'),
          code: getComputedStyle(e.querySelector('pre')).backgroundColor, surface: expected('--talos-panel-soft') };
      });
      expect.soft(colors.border, 'RETRY05-TONE: badge e bordo esprimono lo stesso avviso').toBe(colors.warning);
      expect.soft(colors.code, 'RETRY05-CODE-SURFACE: dettaglio leggibile sul token del tema').toBe(colors.surface);
      const geometry = await note.evaluate(e => {
        const rect = e.getBoundingClientRect();
        const parent = e.closest('#conversation').getBoundingClientRect();
        return { right: rect.right, left: rect.left, parentRight: parent.right, parentLeft: parent.left, width: e.clientWidth, scroll: e.scrollWidth };
      });
      expect(geometry.right).toBeLessThanOrEqual(geometry.parentRight + 1);
      expect(geometry.left).toBeGreaterThanOrEqual(geometry.parentLeft - 1);
      expect(geometry.scroll).toBeLessThanOrEqual(geometry.width + 1);
      await page.screenshot({ path: join(evidence, `provider-detail-${width}x${height}-${theme}.png`), animations: 'disabled' });
      await summary.press('Enter');
      await expect(summary).toBeFocused();
      await page.screenshot({ path: join(evidence, `provider-error-${width}x${height}-${theme}.png`), animations: 'disabled' });
    }
    await page.reload();
    await openSession(page);
    await expect(note).toHaveCount(1);
    await expect(conversation).toContainText(partial);
    await expect(note).toContainText('un altro costo');
    expect(mutations).toEqual([]);
    expect(errors).toEqual([]);
  });
}
