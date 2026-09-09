import { test, expect } from '@playwright/test';
import { readFile, mkdir } from 'node:fs/promises';
import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';

const base = `http://127.0.0.1:${process.env.TALOS_LAB_PORT || 4176}`;
const root = new URL('../../', import.meta.url);
const bundle = (await build({ entryPoints: [fileURLToPath(new URL('src/components/context-compactor.js', root))], bundle: true, format: 'iife', globalName: 'TcecUI', write: false })).outputFiles[0].text;
const template = await readFile(new URL('index.template.html', root), 'utf8');

async function mount(page) {
  expect(template.includes('id="veloContesto"'), 'CTX-UI-MARKUP: la modale deve provenire dal mockup canonico').toBe(true);
  await page.goto(`${base}/health`);
  await page.setContent(template.replace(/<script\b[^>]*>[\s\S]*?<\/script>/g, ''));
  await page.addScriptTag({ content: bundle });
  await page.evaluate(() => {
    document.querySelectorAll('.overlay-layer').forEach(n => { n.hidden = true; });
    const trigger = document.createElement('button'); trigger.id = 'ctx-open'; trigger.textContent = 'Compatta'; document.body.prepend(trigger);
    window.ctxState = { sessionId: 'chat-a', revision: 1, settings: { auto: true }, facts: [], jobs: [], activeVersion: null };
    window.ctxHistory = []; window.ctxCalls = []; window.ctxPending = []; window.ctxHold = false; window.ctxFail = false;
    const clone = x => structuredClone(x);
    const client = {
      async getContextState() {
        if (window.ctxHold) return new Promise(resolve => window.ctxPending.push(resolve));
        if (window.ctxFail) throw new Error('offline');
        return clone(window.ctxState);
      },
      async listContextVersions() { return { versions: clone(window.ctxHistory) }; },
      async updateContextSettings(o) { window.ctxCalls.push(clone({ ...o, signal: undefined })); Object.assign(window.ctxState.settings, o.patch); window.ctxState.revision++; if (window.ctxHoldMutation) await new Promise(resolve => { window.ctxFinishMutation = resolve; }); },
      async upsertProtectedFact(o) { window.ctxCalls.push(o.fact); window.ctxState.facts = [{ id: 'fact-1', ...o.fact }]; window.ctxState.revision++; },
      async removeProtectedFact() { window.ctxState.facts = []; window.ctxState.revision++; },
      async resolveFactConflict() {},
      async startCompaction() { if (window.ctxSmall) throw Object.assign(new Error('small'), { code: 'CTX_NOTHING_TO_COMPACT' }); window.ctxState.jobs = [{ id: 'job-1', state: 'summarizing', progress: { completed: 1, total: 3 } }]; },
      async cancelCompaction() { window.ctxState.jobs[0].state = 'cancelled'; },
      async resumeCompaction() {},
      async restoreContextVersion(o) { window.ctxState.activeVersion = window.ctxHistory.find(v => v.id === o.versionId); window.ctxState.revision++; },
      async readContextSource(o) { return { source: { id: o.sourceId, message: { content: 'La decisione originale era SQLite.' } } }; },
    };
    window.ctx = TcecUI.montaContextCompactor(document.getElementById('veloContesto'), { client, sessionId: 'chat-a' });
    trigger.addEventListener('click', () => window.ctx.open());
  });
  await page.locator('#ctx-open').click();
  await expect(page.locator('[data-context-start]')).toBeEnabled();
}

test('CTX-UI-SMALL-NOOP una chat breve riceve una spiegazione senza progresso fittizio', async ({ page }) => {
  await mount(page);
  await page.evaluate(() => { window.ctxSmall = true; });
  await page.locator('[data-context-start]').click();
  await expect(page.locator('[data-context-status]')).toHaveAttribute('role', 'status');
  await expect(page.locator('[data-context-status]')).toContainText('ultimo scambio');
  await expect(page.locator('[data-context-status]')).toContainText('Nessun messaggio');
  await expect(page.locator('[data-context-start]')).toBeEnabled();
  expect(await page.evaluate(() => window.ctxState.jobs)).toEqual([]);
  await expect(page.locator('[data-context-job]')).toHaveText('Nessuna compattazione in corso.');
});

test('CTX-UI-LIFECYCLE chiusura e cambio chat respingono risposte tardive', async ({ page }) => {
  await mount(page);
  await expect(page.locator('[data-context-title]')).toBeFocused();
  await expect(page.locator('#ctx-open')).toHaveJSProperty('inert', true);
  await page.keyboard.press('Shift+Tab');
  await expect(page.locator('#veloContesto [data-context-close]').last()).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(page.locator('#veloContesto')).toBeHidden();
  await expect(page.locator('#ctx-open')).toBeFocused();
  await page.evaluate(() => { window.ctxHold = true; window.ctx.open(); });
  await expect.poll(() => page.evaluate(() => window.ctxPending.length)).toBe(1);
  await page.evaluate(() => { window.ctx.close(); window.ctxHold = false; window.ctx.open(); });
  await expect(page.locator('[data-context-start]')).toBeEnabled();
  await page.evaluate(() => { window.ctxPending.shift()({ ...window.ctxState, settings: { auto: false } }); });
  await expect(page.locator('[data-context-auto]')).toBeChecked();
  await page.evaluate(() => { window.ctxHold = true; void window.ctx.refresh(); });
  await expect.poll(() => page.evaluate(() => window.ctxPending.length)).toBe(1);
  await page.evaluate(() => { window.ctxHold = false; window.ctxState = { ...window.ctxState, sessionId: 'chat-b', revision: 2, facts: [] }; void window.ctx.setSession('chat-b'); window.ctxPending.shift()({ sessionId: 'chat-a', revision: 99, facts: [{ id: 'bad', text: 'SEGRETO ALTRA CHAT' }] }); });
  await expect(page.locator('[data-context-start]')).toBeEnabled();
  await expect(page.locator('#veloContesto')).not.toContainText('SEGRETO ALTRA CHAT');
});

test('CTX-UI-INTERACTIONS fatti, fonti, ripristino e guasti restano visibili', async ({ page }) => {
  await mount(page);
  await page.locator('[data-context-auto]').uncheck();
  await expect.poll(() => page.evaluate(() => window.ctxState.settings.auto)).toBe(false);
  await page.getByText('Da non dimenticare', { exact: true }).click();
  await page.locator('[data-context-fact-text]').fill('Il database scelto è SQLite.');
  await page.locator('[data-context-fact-form]').getByRole('button', { name: 'Salva fatto' }).click();
  await expect(page.locator('[data-context-facts]')).toContainText('Il database scelto è SQLite.');
  await page.locator('[data-context-facts]').getByRole('button', { name: 'Modifica', exact: true }).click();
  await page.locator('[data-context-fact-text]').fill('Solo SQLite locale.');
  await page.locator('[data-context-fact-form]').getByRole('button', { name: 'Salva fatto' }).click();
  await expect(page.locator('[data-context-facts]')).toContainText('Solo SQLite locale.');
  await page.evaluate(async () => {
    window.ctxHistory = [{ id: 'v1', sessionId: 'chat-a', createdAt: '2026-09-09T08:00:00Z', summary: { text: 'Decisione sul database', sources: [{ recordId: 'message-1', quote: 'SQLite' }] } }];
    await window.ctx.refresh();
  });
  await page.getByText('Versioni', { exact: true }).click();
  await page.getByRole('button', { name: 'Ripristina', exact: true }).click();
  await page.getByRole('button', { name: 'Conferma ripristino' }).click();
  await expect(page.locator('[data-context-versions]')).toContainText('Versione attiva');
  await page.getByText('Fonti', { exact: true }).click();
  await page.getByRole('button', { name: 'Apri fonte' }).click();
  await expect(page.locator('[data-context-source-text]')).toContainText('La decisione originale era SQLite.');
  await page.evaluate(async () => { window.ctxFail = true; await window.ctx.refresh(); });
  await expect(page.locator('[data-context-status]')).toHaveAttribute('role', 'alert');
  await expect(page.locator('[data-context-status]')).toContainText('non disponibile');
  await expect(page.locator('[data-context-start]')).toBeDisabled();
});

test('CTX-UI-CLOSE-MUTATION riaprire durante una modifica non lascia la modale bloccata', async ({ page }) => {
  await mount(page);
  await page.evaluate(() => { window.ctxHoldMutation = true; });
  await page.locator('[data-context-auto]').click();
  await expect(page.locator('[data-context-start]')).toBeDisabled();
  await page.keyboard.press('Escape');
  await page.locator('#ctx-open').click();
  await expect(page.locator('[data-context-start]')).toBeEnabled();
  await page.evaluate(() => { window.ctxFinishMutation(); });
  await expect(page.locator('[data-context-auto]')).not.toBeChecked();
});

test('CTX-UI-PROGRESS avanzamento e resize usano dati e maniglie reali', async ({ page }) => {
  await mount(page);
  await page.locator('[data-context-start]').click();
  await expect(page.locator('[data-context-job]')).toHaveText('Sintesi in corso');
  await expect(page.locator('[data-context-progress]')).toHaveText('Completati 1 di 3');
  await expect(page.locator('[data-context-progress-bar]')).toHaveAttribute('value', '1');
  await page.evaluate(() => { window.ctxState.jobs[0].progress = { completed: 0, total: 0 }; window.ctx.update(window.ctxState); });
  await expect(page.locator('[data-context-progress-bar]')).not.toHaveAttribute('value');
  await page.locator('[data-context-cancel]').click();
  await expect(page.locator('[data-context-job]')).toHaveText('Compattazione annullata');
  const dialog = page.locator('#veloContesto .talos-dialog');
  const before = await dialog.boundingBox();
  await page.locator('#veloContesto [data-dialog-resize="width"]').focus();
  await page.keyboard.press('ArrowRight');
  await expect.poll(async () => (await dialog.boundingBox()).width).toBe(before.width + 16);
  await page.keyboard.press('Escape');
  await page.locator('#ctx-open').click();
  await expect.poll(async () => (await dialog.boundingBox()).width).toBe(before.width + 16);
});

test('CTX-UI-VIEWPORTS ispezione 1080p 1440p 4K e dimensioni di regressione', async ({ page }, info) => {
  await mount(page);
  const sizes = [info.project.use.viewport];
  if (info.project.name === 'desktop-1440x900') sizes.push({ width: 1920, height: 1080 }, { width: 2560, height: 1440 }, { width: 3840, height: 2160 });
  const directory = new URL('artifacts/context-compactor/', root);
  await mkdir(directory, { recursive: true });
  for (const viewport of sizes) {
    await page.setViewportSize(viewport);
    const geometry = await page.locator('#veloContesto .talos-dialog').evaluate(el => {
      const r = el.getBoundingClientRect(); return { left: r.left, right: r.right, top: r.top, bottom: r.bottom, overflow: el.scrollWidth > el.clientWidth };
    });
    expect(geometry.left).toBeGreaterThanOrEqual(0); expect(geometry.right).toBeLessThanOrEqual(viewport.width);
    expect(geometry.top).toBeGreaterThanOrEqual(0); expect(geometry.bottom).toBeLessThanOrEqual(viewport.height); expect(geometry.overflow).toBe(false);
    await page.locator('[data-context-start]').click({ trial: true });
    await page.screenshot({ path: fileURLToPath(new URL(`context-${viewport.width}x${viewport.height}.png`, directory)) });
  }
});
