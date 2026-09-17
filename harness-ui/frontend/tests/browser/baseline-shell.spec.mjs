import { expect, test } from '@playwright/test';
import pixelmatch from 'pixelmatch';
import { PNG } from 'pngjs';
import { mkdir } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';

test('baseline desktop shell is served by the real harness server', async ({ page }) => {
  const response = await page.goto('/');
  expect(response?.ok()).toBe(true);
  await expect(page.locator('body')).toBeVisible();
  await expect(page.locator('#app, main, [role="main"], .app-shell').first()).toBeVisible();
});

test('production shell does not expose laboratory demo badges', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('.demo-surface-badge')).toHaveCount(0);
});

test('VISUAL-CONTRAST-LIGHT-ASSISTANT-01 — il tema chiaro completa i token semantici e mantiene leggibile la risposta', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('talos.harness.desktop.settings.v1', JSON.stringify({
      version: 1,
      appearance: { colorMode: 'light' },
    }));
  });
  await page.goto('/');
  await page.locator('#conversation').evaluate((conversation) => {
    const article = document.createElement('article');
    article.className = 'message assistant-message compact-message';
    const copy = document.createElement('div');
    copy.className = 'assistant-copy';
    copy.dataset.contrastProbe = 'true';
    copy.textContent = 'Risposta TALOS leggibile nel tema chiaro.';
    article.append(copy);
    conversation.append(article);
  });

  const audit = await page.locator('[data-contrast-probe="true"]').evaluate((copy) => {
    const parseRgb = (value) => {
      const channels = (value.match(/[\d.]+/gu) || []).slice(0, 3).map(Number);
      return value.startsWith('color(srgb ') ? channels.map((channel) => channel * 255) : channels;
    };
    const luminance = (value) => {
      const channels = parseRgb(value).map((channel) => {
        const normalized = channel / 255;
        return normalized <= 0.04045 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4;
      });
      return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
    };
    const foreground = getComputedStyle(copy).color;
    const background = getComputedStyle(document.documentElement).backgroundColor;
    const lighter = Math.max(luminance(foreground), luminance(background));
    const darker = Math.min(luminance(foreground), luminance(background));
    const rootStyle = getComputedStyle(document.documentElement);
    return {
      foreground,
      background,
      ratio: (lighter + 0.05) / (darker + 0.05),
      tokens: Object.fromEntries([
        '--talos-assistant-text',
        '--talos-panel-soft',
        '--talos-card',
        '--talos-window-bg',
        '--talos-border-strong',
      ].map((name) => [name, rootStyle.getPropertyValue(name).trim()])),
    };
  });

  expect(audit.tokens['--talos-assistant-text']).not.toBe('');
  expect(audit.tokens['--talos-panel-soft']).not.toBe('');
  expect(audit.tokens['--talos-card']).not.toBe('');
  expect(audit.tokens['--talos-window-bg']).not.toBe('');
  expect(audit.tokens['--talos-border-strong']).not.toBe('');
  expect(audit.ratio).toBeGreaterThanOrEqual(4.5);
});

test('BACKGROUND-MOTION-COMPOSITOR-02 — lo sfondo si muove senza mutare lo style della radice a ogni frame', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('talos.harness.desktop.settings.v1', JSON.stringify({
      version: 1,
      appearance: { backgroundMotion: true, motionMode: 'adaptive', reducedMotion: false, pauseWhenHidden: true },
    }));
  });
  await page.goto('/');
  await page.waitForTimeout(250);
  const prima = await page.evaluate(() => ({
    rootStyle: document.documentElement.getAttribute('style') ?? '',
    transform: getComputedStyle(document.querySelector('.scene-orb-a')).transform,
  }));
  await page.waitForTimeout(300);
  const dopo = await page.evaluate(() => ({
    rootStyle: document.documentElement.getAttribute('style') ?? '',
    transform: getComputedStyle(document.querySelector('.scene-orb-a')).transform,
    animations: document.querySelector('.scene-orb-a').getAnimations().map((animation) => ({
      currentTime: animation.currentTime,
      playState: animation.playState,
    })),
  }));
  expect(dopo.rootStyle).toBe(prima.rootStyle);
  expect(dopo.rootStyle).not.toContain('--talos-motion-phase');
  expect(dopo.rootStyle).not.toContain('--talos-motion-x');
  expect(dopo.rootStyle).not.toContain('--talos-motion-y');
  expect(dopo.animations.some((animation) => animation.playState === 'running' && Number(animation.currentTime) > 0)).toBe(true);
  expect(dopo.transform).not.toBe(prima.transform);
});

test('BACKGROUND-MOTION-PERF-03 — lo sfondo non forza ricalcoli stile continui sul main thread', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('talos.harness.desktop.settings.v1', JSON.stringify({
      version: 1,
      appearance: { backgroundMotion: true, motionMode: 'adaptive', reducedMotion: false },
    }));
  });
  await page.goto('/');
  await page.waitForTimeout(500);
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Performance.enable');
  const metric = (payload, name) => payload.metrics.find((entry) => entry.name === name)?.value ?? 0;
  const before = await cdp.send('Performance.getMetrics');
  await page.waitForTimeout(1500);
  const after = await cdp.send('Performance.getMetrics');
  const recalcStyleSeconds = metric(after, 'RecalcStyleDuration') - metric(before, 'RecalcStyleDuration');
  expect(recalcStyleSeconds).toBeLessThan(0.04);
});

test('BACKGROUND-MOTION-PAUSE-04 — static e visibility usano uno stato di pausa esplicito', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('talos.harness.desktop.settings.v1', JSON.stringify({
      version: 1,
      appearance: { backgroundMotion: true, motionMode: 'static', reducedMotion: false, pauseWhenHidden: true },
    }));
  });
  await page.goto('/');
  await expect(page.locator('html')).toHaveClass(/background-motion-paused/);
  const stati = await page.locator('.scene-orb').evaluateAll((orbs) => orbs.map((orb) => {
    const style = getComputedStyle(orb);
    return { animationName: style.animationName, animationPlayState: style.animationPlayState };
  }));
  expect(stati.every(({ animationName, animationPlayState }) => animationName === 'none' || animationPlayState === 'paused')).toBe(true);
});

test('LAG-INTERACTION-DIALOG-38 — una modale pausa lo sfondo e la chiusura lo riprende', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('talos.harness.desktop.settings.v1', JSON.stringify({
      version: 1,
      appearance: { backgroundMotion: true, motionMode: 'adaptive', reducedMotion: false },
    }));
  });
  await page.goto('/');
  const root = page.locator('html');
  await expect(root).toHaveClass(/background-motion-active/);
  await expect(root).not.toHaveClass(/background-motion-paused/);

  await page.locator('#commandPaletteBtn').click();
  await expect(page.locator('#commandDialog')).toBeVisible();
  await expect(root).toHaveClass(/background-motion-active/);
  await expect(root).toHaveClass(/background-motion-paused/);

  await page.locator('#closeCommand').click();
  await expect(page.locator('#commandDialog')).toBeHidden();
  await expect(root).toHaveClass(/background-motion-active/);
  await expect(root).not.toHaveClass(/background-motion-paused/);
});

test('LAG-INTERACTION-SCROLL-39 — lo scroll pausa lo sfondo solo durante il gesto', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('talos.harness.desktop.settings.v1', JSON.stringify({
      version: 1,
      appearance: { backgroundMotion: true, motionMode: 'adaptive', reducedMotion: false },
    }));
  });
  await page.goto('/');
  const root = page.locator('html');
  const conversation = page.locator('#conversation');
  await conversation.evaluate((element) => {
    const spacer = document.createElement('div');
    spacer.style.height = '2400px';
    spacer.setAttribute('aria-hidden', 'true');
    element.append(spacer);
  });
  await expect(root).toHaveClass(/background-motion-active/);
  await expect(root).not.toHaveClass(/background-motion-paused/);

  const box = await conversation.boundingBox();
  expect(box).not.toBeNull();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.wheel(0, 420);
  await expect.poll(() => conversation.evaluate((element) => element.scrollTop)).toBeGreaterThan(0);
  await expect(root).toHaveClass(/background-motion-paused/);
  await expect(root).toHaveClass(/background-motion-active/);
  await expect(root).not.toHaveClass(/background-motion-paused/, { timeout: 1_000 });
});

test('FILE-EXPLORER-TOOLBAR-05 — la sidebar Files espone i quattro comandi e li disabilita senza sessione', async ({ page }) => {
  await page.goto('/');
  await page.locator('[data-inspector-tab="files"]').click();
  for (const label of ['Nuovo file', 'Nuova cartella', 'Aggiorna file', 'Comprimi cartelle']) {
    const button = page.locator('#inspector-files').getByRole('button', { name: label });
    await expect(button).toBeVisible();
    await expect(button).toBeDisabled();
  }
});

test('FILE-EXPLORER-REFRESH-06 — sessione reale abilita crea, aggiorna e comprimi senza cache stantia', async ({ page }) => {
  let rootReads = 0;
  await page.route('**/api/v1/sessions', async (route) => route.fulfill({
    status: 200, contentType: 'application/json',
    body: JSON.stringify({ ok: true, data: { items: [{
      sessionId: 'session-tree-tools', taskId: 'libero:default', nome: 'File tools',
      avviataAlle: '2026-09-01T08:00:00.000Z', conclusa: true,
      modello: 'qwen/qwen3.8-flash', provider: 'cloud',
    }] }, meta: { schema: 'talos.harness-ui.api.v1' } }),
  }));
  await page.route('**/api/v1/sessions/session-tree-tools/events', async (route) => route.fulfill({
    status: 200, contentType: 'text/event-stream', body: '',
  }));
  await page.route('**/api/v1/sessions/session-tree-tools/tree**', async (route) => {
    const path = new URL(route.request().url()).searchParams.get('percorso') || '';
    if (path === '') rootReads += 1;
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({
      ok: true,
      data: { voci: path === '' ? [{ nome: 'src', cartella: true }] : [{ nome: 'app.js', cartella: false }] },
      meta: { schema: 'talos.harness-ui.api.v1' },
    }) });
  });

  await page.goto('/');
  await page.locator('[data-real-session-id="session-tree-tools"]').click();
  await page.locator('[data-inspector-tab="files"]').click();
  const toolbar = page.locator('#inspector-files');
  for (const label of ['Nuovo file', 'Nuova cartella', 'Aggiorna file', 'Comprimi cartelle']) {
    await expect(toolbar.getByRole('button', { name: label })).toBeEnabled();
  }
  const folder = page.locator('#inspector-files .ft-node[data-percorso="src"] > .ft-row');
  await folder.click();
  await expect(page.locator('#inspector-files .ft-node[data-percorso="src"]')).toHaveAttribute('aria-expanded', 'true');
  const beforeRefresh = rootReads;
  await toolbar.getByRole('button', { name: 'Aggiorna file' }).click();
  await expect.poll(() => rootReads).toBeGreaterThan(beforeRefresh);
  await toolbar.getByRole('button', { name: 'Comprimi cartelle' }).click();
  await expect(page.locator('#inspector-files .ft-node[data-percorso="src"]')).toHaveAttribute('aria-expanded', 'false');
  await toolbar.getByRole('button', { name: 'Nuova cartella' }).click();
  await expect(page.locator('#sheetTitle')).toHaveText('Nuova cartella');
});

test('LAG-REPLAY-TREE-31 — una raffica storica invalida il tree una volta senza render concorrenti', async ({ page }) => {
  let rootReads = 0;
  await page.route('**/api/v1/sessions/lag-replay-tree/tree**', async (route) => {
    rootReads += 1;
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({
      ok: true,
      data: { voci: [{ nome: 'src', cartella: true }] },
      meta: { schema: 'talos.harness-ui.api.v1' },
    }) });
  });
  await page.goto('/');
  const result = await page.evaluate(async () => {
    const runtime = window.__talosHarnessUiRuntime;
    const session = runtime.realSessionState;
    session.id = 'lag-replay-tree';
    session.taskId = 'workspace';
    session.generation += 1;
    session.sequenzeViste.clear();
    const generation = session.generation;
    let mutations = 0;
    const observer = new MutationObserver((records) => { mutations += records.length; });
    observer.observe(document.querySelector('#inspector-files .file-tree'), { childList: true, subtree: true, attributes: true });
    for (let index = 0; index < 500; index += 1) {
      runtime.handleRealEvent({ type: 'WorkspaceChanged', percorsi: [`file-${index}.txt`], _sequenza: 10000 + index }, generation);
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
    observer.disconnect();
    return { mutations, treeNodes: document.querySelectorAll('#inspector-files .ft-node').length };
  });
  expect(rootReads).toBeLessThanOrEqual(2);
  expect(result.mutations).toBeLessThanOrEqual(12);
  expect(result.treeNodes).toBe(1);
});

test('LAG-REPLAY-TEXT-32 — molti delta storici fanno un solo commit visuale finale', async ({ page }) => {
  await page.goto('/');
  const result = await page.evaluate(async () => {
    const runtime = window.__talosHarnessUiRuntime;
    const session = runtime.realSessionState;
    document.querySelector('#conversation').replaceChildren();
    session.messageElements.clear();
    session.testoGrezzoMessaggi.clear();
    session.sequenzeViste.clear();
    let mutations = 0;
    const conversation = document.querySelector('#conversation');
    const observer = new MutationObserver((records) => { mutations += records.length; });
    observer.observe(conversation, { childList: true, subtree: true, characterData: true, attributes: true });
    for (let index = 0; index < 250; index += 1) {
      runtime.handleRealEvent({ type: 'TextMessageContent', messageId: 'history-message', delta: 'a', _sequenza: 20000 + index }, session.generation);
    }
    runtime.handleRealEvent({ type: 'TextMessageEnd', messageId: 'history-message', _sequenza: 20250 }, session.generation);
    await new Promise((resolve) => setTimeout(resolve, 100));
    observer.disconnect();
    return {
      mutations,
      text: conversation.querySelector('.assistant-copy')?.textContent || '',
      messages: conversation.querySelectorAll('.assistant-message').length,
    };
  });
  expect(result.text).toBe('a'.repeat(250));
  expect(result.messages).toBe(1);
  expect(result.mutations).toBeLessThanOrEqual(12);
});

test('LAG-REPLAY-PACED-35 — una cronologia conclusa non riparsa il markdown a ogni delta cadenzato', async ({ page }) => {
  await page.goto('/');
  const result = await page.evaluate(async () => {
    const runtime = window.__talosHarnessUiRuntime;
    const session = runtime.realSessionState;
    const conversation = document.querySelector('#conversation');
    conversation.replaceChildren();
    session.messageElements.clear();
    session.testoGrezzoMessaggi.clear();
    session.sequenzeViste.clear();
    session.deferHistoricalRendering = true;
    let mutations = 0;
    const observer = new MutationObserver((records) => { mutations += records.length; });
    observer.observe(conversation, { childList: true, subtree: true, characterData: true, attributes: true });
    for (let index = 0; index < 40; index += 1) {
      runtime.handleRealEvent({ type: 'TextMessageContent', messageId: 'paced-history', delta: `${index} `, _sequenza: 21000 + index }, session.generation);
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
    const beforeEnd = conversation.querySelector('.assistant-copy')?.textContent || '';
    runtime.handleRealEvent({ type: 'TextMessageEnd', messageId: 'paced-history', _sequenza: 21040 }, session.generation);
    await new Promise((resolve) => setTimeout(resolve, 50));
    observer.disconnect();
    return {
      mutations,
      beforeEnd,
      afterEnd: conversation.querySelector('.assistant-copy')?.textContent || '',
    };
  });
  expect(result.beforeEnd).toBe('');
  expect(result.afterEnd).toBe(Array.from({ length: 40 }, (_, index) => `${index} `).join(''));
  expect(result.mutations).toBeLessThanOrEqual(12);
});

test('LAG-REPLAY-REASONING-36 — il ragionamento storico conserva il testo senza commit per delta', async ({ page }) => {
  await page.goto('/');
  const result = await page.evaluate(async () => {
    const runtime = window.__talosHarnessUiRuntime;
    const session = runtime.realSessionState;
    const conversation = document.querySelector('#conversation');
    conversation.replaceChildren();
    session.ragionamentoBubble.clear();
    session.sequenzeViste.clear();
    session.deferHistoricalRendering = true;
    let mutations = 0;
    const observer = new MutationObserver((records) => { mutations += records.length; });
    observer.observe(conversation, { childList: true, subtree: true, characterData: true, attributes: true });
    runtime.handleRealEvent({ type: 'ReasoningMessageStart', messageId: 'paced-reasoning', _sequenza: 22000 }, session.generation);
    for (let index = 0; index < 30; index += 1) {
      runtime.handleRealEvent({ type: 'ReasoningMessageContent', messageId: 'paced-reasoning', delta: `passo ${index} `, _sequenza: 22001 + index }, session.generation);
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
    runtime.handleRealEvent({ type: 'ReasoningMessageEnd', messageId: 'paced-reasoning', _sequenza: 22031 }, session.generation);
    await new Promise((resolve) => setTimeout(resolve, 50));
    observer.disconnect();
    return {
      mutations,
      text: conversation.querySelector('.real-reasoning-note .tool-note-detail')?.textContent || '',
    };
  });
  expect(result.text).toBe(Array.from({ length: 30 }, (_, index) => `passo ${index} `).join(''));
  expect(result.mutations).toBeLessThanOrEqual(20);
});

test('LAG-LIVE-TEXT-37 — il resume disattiva il differimento e mostra lo streaming prima della fine', async ({ page }) => {
  await page.route('**/api/v1/sessions/lag-live-text/resume', async (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ ok: true, data: { sessionId: 'lag-live-text' }, meta: { schema: 'talos.harness-ui.api.v1' } }),
  }));
  await page.route('**/api/v1/sessions/lag-live-text/events', async (route) => route.fulfill({
    status: 200,
    contentType: 'text/event-stream',
    body: '',
  }));
  await page.goto('/');
  const result = await page.evaluate(async () => {
    const runtime = window.__talosHarnessUiRuntime;
    runtime.passaASessione('lag-live-text', 'workspace', 'Cronologia', 'qwen/qwen3.8-flash', { conclusa: true, modello: 'qwen/qwen3.8-flash' });
    const deferredBeforeResume = runtime.realSessionState.deferHistoricalRendering;
    await runtime.resumeSession('Continua il controllo');
    const generation = runtime.realSessionState.generation;
    runtime.handleRealEvent({ type: 'TextMessageContent', messageId: 'live-after-resume', delta: 'Testo vivo', _sequenza: 23000 }, generation);
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    return {
      deferredBeforeResume,
      deferredAfterResume: runtime.realSessionState.deferHistoricalRendering,
      text: document.querySelector('.assistant-copy:last-child')?.textContent || document.querySelector('.assistant-message:last-child .assistant-copy')?.textContent || '',
    };
  });
  expect(result.deferredBeforeResume).toBe(true);
  expect(result.deferredAfterResume).toBe(false);
  expect(result.text).toContain('Testo vivo');
});

test('LAG-LIVE-WORKSPACE-33 — un cambiamento live isolato aggiorna ancora il tree', async ({ page }) => {
  let rootReads = 0;
  await page.route('**/api/v1/sessions/lag-live-tree/tree**', async (route) => {
    rootReads += 1;
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({
      ok: true,
      data: { voci: [{ nome: 'README.md', cartella: false }] },
      meta: { schema: 'talos.harness-ui.api.v1' },
    }) });
  });
  await page.goto('/');
  await page.evaluate(() => {
    const runtime = window.__talosHarnessUiRuntime;
    const session = runtime.realSessionState;
    session.id = 'lag-live-tree';
    session.taskId = 'workspace';
    session.generation += 1;
    session.sequenzeViste.clear();
    runtime.handleRealEvent({ type: 'WorkspaceChanged', percorsi: ['README.md'], _sequenza: 30001 }, session.generation);
  });
  await expect.poll(() => rootReads).toBe(1);
  await expect(page.locator('#inspector-files .ft-node')).toHaveCount(1);
});

test('LAG-GENERATION-CANCEL-34 — il cambio sessione annulla il tree differito precedente', async ({ page }) => {
  const reads = { old: 0, current: 0 };
  await page.route('**/api/v1/sessions/*/tree**', async (route) => {
    const sessionId = new URL(route.request().url()).pathname.split('/')[4];
    if (sessionId === 'lag-old') reads.old += 1;
    if (sessionId === 'lag-current') reads.current += 1;
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({
      ok: true,
      data: { voci: [] },
      meta: { schema: 'talos.harness-ui.api.v1' },
    }) });
  });
  await page.goto('/');
  await page.evaluate(() => {
    const runtime = window.__talosHarnessUiRuntime;
    const session = runtime.realSessionState;
    session.id = 'lag-old';
    session.taskId = 'old';
    session.generation += 1;
    runtime.handleRealEvent({ type: 'WorkspaceChanged', percorsi: ['old.txt'], _sequenza: 40001 }, session.generation);
    session.id = 'lag-current';
    session.taskId = 'current';
    session.generation += 1;
    runtime.handleRealEvent({ type: 'WorkspaceChanged', percorsi: ['current.txt'], _sequenza: 40002 }, session.generation);
  });
  await expect.poll(() => reads.current).toBe(1);
  expect(reads.old).toBe(0);
});

test('cold start does not expose invented runtime telemetry', async ({ page }) => {
  await page.goto('/');
  const text = await page.locator('body').innerText();
  for (const value of ['wt/auth', 'feat/mobile', '18.7k / 128k', '142 tok/s', 'cache 78%', 'Attrezzi\n7', 'Browser\nScoped']) {
    expect(text).not.toContain(value);
  }
  await expect(page.locator('[data-runtime-usage]')).toHaveText('Contesto non osservato');
  await expect(page.locator('[data-environment-label]').first()).toHaveText('Ambiente non osservato');
});

test('model chip never exposes the server-default label', async ({ page }) => {
  await page.goto('/');
  const chip = page.locator('[data-open-sheet="model"] span').first();
  await expect(chip).toBeVisible();
  await expect(chip).not.toHaveText('Predefinito del server');
  await expect(page.locator('body')).not.toContainText('Predefinito del server');
});

test('Nuova sessione usa la workspace desktop senza configurazione manuale', async ({ page }) => {
  const project = 'C:\\Users\\esempio\\Desktop\\projects\\AVM-harness-desktop';
  await page.route('**/api/v1/workspace-browser**', async (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ ok: true, data: {
      root: 'C:\\', path: 'C:\\', parent: null,
      items: [{ name: 'Users', path: 'C:\\Users', projectId: null }],
      recommended: [{ label: 'AVM-harness-desktop', path: project, kind: 'project', projectId: 'default' }],
    }, meta: { schema: 'talos.harness-ui.api.v1' } }),
  }));
  await page.goto('/');
  await page.locator('#newSessionBtn').click();
  await expect(page.locator('#sheetDialog')).toBeVisible();
  await expect(page.locator('#sheetTitle')).toHaveText('Su quale progetto lavora TALOS?');
  await expect(page.locator('[data-workspace-selected-path]')).toHaveText(project);
  await expect(page.locator('#workspaceChooserSubmit')).toBeEnabled();
  await expect(page.locator('#workspaceChooserSubmit')).toContainText('AVM-harness-desktop');
  await expect(page.locator('#sheetBody')).not.toContainText('Non c’è ancora una cartella di progetto disponibile');
  await expect(page.locator('#sheetBody')).not.toContainText('Imposta TALOS_HARNESS_UI_PROJECT_DIRS');
});

test('OPEN-WITH-TALOS-BROWSER-01 — il fragment prepara il workspace senza inventare Full access', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  const launchId = 'A'.repeat(32);
  let corpoAvvio = null;
  await page.route(`**/api/v1/workspace-launches/${launchId}`, async (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ ok: true, data: { id: launchId, nome: 'Progetto Ω', scadeAlle: '2026-09-01T12:02:00.000Z' } }),
  }));
  await page.route('**/api/v1/sessions/custom', async (route) => {
    corpoAvvio = route.request().postDataJSON();
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, data: { sessionId: 'session-open-with' } }) });
  });
  await page.route('**/api/v1/sessions/session-open-with/events', async (route) => route.fulfill({ status: 200, contentType: 'text/event-stream', body: '' }));

  await page.goto(`/#open-workspace=${launchId}`);
  await expect(page.locator('#sessionTitle')).toHaveText('Nuova · Progetto Ω');
  await expect(page.locator('#conversation')).toContainText('Sessione pronta su Progetto Ω.');
  await expect(page.locator('#inspector-files .file-tree')).toContainText('Progetto Ω');
  await expect(page.locator('#inspector-files .file-tree')).toContainText('I file appariranno appena inizi la sessione.');
  await expect(page.locator('#inspector-files .file-tree')).not.toContainText('Nessuna cartella ancora scelta');
  await expect(page.locator('[data-open-sheet="permissions"] span')).toHaveText('Workspace write');
  await expect.poll(() => new URL(page.url()).hash).toBe('');
  const visualDir = resolve(process.cwd(), 'artifacts', 'visual-audit-2026-09-01');
  await mkdir(visualDir, { recursive: true });
  await page.screenshot({ path: resolve(visualDir, 'open-with-talos-1440x900.png'), fullPage: true });

  await page.locator('#composerInput').fill('Controlla il progetto');
  await page.locator('#composerForm').evaluate((form) => form.requestSubmit());
  await expect.poll(() => corpoAvvio).not.toBeNull();
  expect(corpoAvvio.workspaceLaunchId).toBe(launchId);
  expect(corpoAvvio.permessi).toBe('Workspace write');
  expect(corpoAvvio).not.toHaveProperty('cartellaLibera');
});

test('selezionare una sessione sincronizza la pillola con il suo modello reale', async ({ page }) => {
  await page.route('**/api/v1/sessions', async (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ ok: true, data: { items: [{
      sessionId: 'session-model-sync',
      taskId: 'libero:default',
      nome: 'Sessione Qwen',
      avviataAlle: '2026-09-01T07:00:00.000Z',
      conclusa: true,
      modello: 'qwen/qwen3.8-flash',
      provider: 'cloud',
    }, {
      sessionId: 'session-without-model',
      taskId: 'libero:legacy',
      nome: 'Sessione storica',
      avviataAlle: '2026-08-31T07:00:00.000Z',
      conclusa: true,
      provider: 'cloud',
    }] }, meta: { schema: 'talos.harness-ui.api.v1' } }),
  }));
  await page.route('**/api/v1/sessions/session-model-sync/events', async (route) => route.fulfill({
    status: 200,
    contentType: 'text/event-stream',
    body: '',
  }));
  await page.goto('/');
  const session = page.locator('[data-real-session-id="session-model-sync"]');
  await expect(session).toBeVisible();
  await session.click();
  await expect(page.locator('[data-open-sheet="model"] span')).toHaveText('qwen/qwen3.8-flash');
  await page.locator('[data-real-session-id="session-without-model"]').click();
  await expect(page.locator('[data-open-sheet="model"] span')).toHaveText('Seleziona modello');
});

test('il modello della sessione resta identico dopo un reload', async ({ page }) => {
  const sessione = {
    sessionId: 'session-gemini-reload', taskId: 'libero:default', nome: 'Sessione Gemini',
    avviataAlle: '2026-09-01T07:00:00.000Z', conclusa: true,
    modello: 'google/gemini-3.7-flash', provider: 'cloud',
  };
  await page.route('**/api/v1/sessions', async (route) => route.fulfill({
    status: 200, contentType: 'application/json',
    body: JSON.stringify({ ok: true, data: { items: [sessione] }, meta: { schema: 'talos.harness-ui.api.v1' } }),
  }));
  await page.route('**/api/v1/sessions/session-gemini-reload/events', async (route) => route.fulfill({
    status: 200, contentType: 'text/event-stream', body: '',
  }));
  await page.goto('/');
  await page.locator('[data-real-session-id="session-gemini-reload"]').click();
  await expect(page.locator('[data-open-sheet="model"] span')).toHaveText('google/gemini-3.7-flash');
  await page.reload();
  await page.locator('[data-real-session-id="session-gemini-reload"]').click({ button: 'right' });
  await page.locator('.session-actions-menu').getByRole('menuitem', { name: 'Apri' }).click();
  await expect(page.locator('[data-open-sheet="model"] span')).toHaveText('google/gemini-3.7-flash');
});

test('SESSION-MODEL-CHANGE-RELOAD-02 — la pillola cambia solo dopo il salvataggio e resta corretta al reload', async ({ page }) => {
  const sessione = {
    sessionId: 'session-model-change', taskId: 'libero:default', nome: 'Cambio modello',
    avviataAlle: '2026-09-01T07:00:00.000Z', conclusa: true,
    modello: 'z-ai/glm-4.7-flash', modelId: 'z-ai/glm-4.7-flash', provider: 'cloud',
    reasoning: { effort: 'none' },
  };
  const aggiornamenti = [];
  await page.route('**/api/v1/sessions', async (route) => route.fulfill({
    status: 200, contentType: 'application/json',
    body: JSON.stringify({ ok: true, data: { items: [sessione] }, meta: { schema: 'talos.harness-ui.api.v1' } }),
  }));
  await page.route('**/api/v1/sessions/session-model-change/events', async (route) => route.fulfill({
    status: 200, contentType: 'text/event-stream', body: '',
  }));
  await page.route('**/api/v1/models', async (route) => route.fulfill({
    status: 200, contentType: 'application/json',
    body: JSON.stringify({ ok: true, data: { modelli: [
      { id: 'z-ai/glm-4.7-flash', provider: 'z-ai', nome: 'Z.AI: GLM 4.7 Flash', reasoning: { supportedEfforts: [], defaultEffort: null, defaultEnabled: false, mandatory: false } },
      { id: 'google/gemini-3.7-flash', provider: 'google', nome: 'Google: Gemini 3.7 Flash', reasoning: { supportedEfforts: ['low', 'medium', 'high'], defaultEffort: 'medium', defaultEnabled: true, mandatory: true } },
    ], daCache: true }, meta: { schema: 'talos.harness-ui.api.v1' } }),
  }));
  await page.route('**/api/v1/sessions/session-model-change/settings', async (route) => {
    const patch = route.request().postDataJSON();
    aggiornamenti.push(patch);
    await new Promise((resolve) => setTimeout(resolve, 300));
    Object.assign(sessione, patch);
    sessione.modelId = patch.modello;
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, data: { updated: true } }) });
  });

  await page.goto('/');
  await page.locator('[data-real-session-id="session-model-change"]').click();
  const pillola = page.locator('[data-open-sheet="model"] span').first();
  await expect(pillola).toHaveText('z-ai/glm-4.7-flash');
  await page.locator('[data-open-sheet="model"]').click();
  await page.locator('.model-picker-search input').fill('gemini-3.7-flash');
  await page.getByRole('option').filter({ hasText: 'google/gemini-3.7-flash' }).click();
  await expect(page.locator('#sheetDialog')).toBeVisible();
  await expect(pillola).toHaveText('z-ai/glm-4.7-flash');
  await expect.poll(() => aggiornamenti).toEqual([{
    modello: 'google/gemini-3.7-flash',
    reasoning: { effort: 'medium' },
  }]);
  await expect(page.locator('#sheetDialog')).not.toBeVisible();
  await expect(pillola).toHaveText('google/gemini-3.7-flash');

  await page.reload();
  await page.locator('[data-real-session-id="session-model-change"]').click();
  await expect(page.locator('[data-open-sheet="model"] span').first()).toHaveText('google/gemini-3.7-flash');
  await page.locator('[data-open-sheet="model"]').click();
  await expect(page.locator('.effort-picker-selected')).toHaveText('Medio');
  const visualDir = resolve(process.cwd(), 'artifacts', 'visual-audit-2026-09-01');
  await mkdir(visualDir, { recursive: true });
  await page.screenshot({ path: resolve(visualDir, 'model-switch-reasoning-1440x900.png'), fullPage: true });
});

test('SESSION-MODEL-UPDATE-FAIL-01 — un server incompatibile non produce una pillola falsa', async ({ page }) => {
  const sessione = {
    sessionId: 'session-model-failure', taskId: 'libero:default', nome: 'Modello invariato',
    avviataAlle: '2026-09-01T07:00:00.000Z', conclusa: true,
    modello: 'z-ai/glm-4.7-flash', modelId: 'z-ai/glm-4.7-flash', provider: 'cloud',
    reasoning: { effort: 'none' },
  };
  await page.route('**/api/v1/sessions', async (route) => route.fulfill({
    status: 200, contentType: 'application/json',
    body: JSON.stringify({ ok: true, data: { items: [sessione] }, meta: { schema: 'talos.harness-ui.api.v1' } }),
  }));
  await page.route('**/api/v1/sessions/session-model-failure/events', async (route) => route.fulfill({ status: 200, contentType: 'text/event-stream', body: '' }));
  await page.route('**/api/v1/models', async (route) => route.fulfill({
    status: 200, contentType: 'application/json',
    body: JSON.stringify({ ok: true, data: { modelli: [
      { id: 'google/gemini-3.7-flash', provider: 'google', nome: 'Google: Gemini 3.7 Flash', reasoning: { supportedEfforts: ['low', 'medium'], defaultEffort: 'medium', defaultEnabled: true, mandatory: true } },
    ], daCache: true }, meta: { schema: 'talos.harness-ui.api.v1' } }),
  }));
  await page.route('**/api/v1/sessions/session-model-failure/settings', async (route) => route.fulfill({
    status: 405, contentType: 'application/json',
    body: JSON.stringify({ ok: false, error: { code: 'METHOD_NOT_ALLOWED', message: 'Questa installazione deve essere aggiornata' } }),
  }));

  await page.goto('/');
  await page.locator('[data-real-session-id="session-model-failure"]').click();
  const pillola = page.locator('[data-open-sheet="model"] span').first();
  await page.locator('[data-open-sheet="model"]').click();
  await page.locator('.model-picker-search input').fill('gemini-3.7-flash');
  await page.getByRole('option').filter({ hasText: 'google/gemini-3.7-flash' }).click();
  await expect(page.locator('#sheetDialog')).toBeVisible();
  await expect(pillola).toHaveText('z-ai/glm-4.7-flash');
  await expect(page.locator('.effort-picker-selected')).toHaveText('Off');
  await expect(page.locator('#toastRegion')).toContainText('Preferenza non salvata');
  await page.reload();
  await page.locator('[data-real-session-id="session-model-failure"]').click();
  await expect(page.locator('[data-open-sheet="model"] span').first()).toHaveText('z-ai/glm-4.7-flash');
});

test('RUN-MODEL-RESUME-RACE-10 — il RunStarted visto durante la POST conserva il modello nel bubble del follow-up', async ({ page }) => {
  await page.route('**/api/v1/sessions/model-resume-race/resume', async (route) => {
    await page.evaluate(() => {
      const runtime = window.__talosHarnessUiRuntime;
      runtime.handleRealEvent({
        type: 'RunStarted',
        input: { consegna: 'follow-up', seguito: true },
        contesto: { modello: 'qwen/qwen3.8-flash', reasoning: { effort: 'medium' } },
        _sequenza: 92001,
      }, runtime.realSessionState.generation);
    });
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ ok: true, data: { sessionId: 'model-resume-race' } }),
    });
  });
  await page.route('**/api/v1/sessions/model-resume-race/events', async (route) => route.fulfill({
    status: 200,
    contentType: 'text/event-stream',
    body: '',
  }));
  await page.goto('/');
  await page.evaluate(() => {
    const runtime = window.__talosHarnessUiRuntime;
    runtime.realSessionState.id = 'model-resume-race';
    runtime.realSessionState.taskId = 'libero:default';
    runtime.realSessionState.eventoTerminaleVisto = true;
    runtime.realSessionState.currentRunModel = 'modello-precedente';
    runtime.syncRunComposerState();
  });

  await page.evaluate(() => window.__talosHarnessUiRuntime.resumeSession('follow-up'));
  await page.evaluate(() => {
    const runtime = window.__talosHarnessUiRuntime;
    runtime.handleRealEvent({ type: 'TextMessageContent', messageId: 'race-answer', delta: 'Risposta coerente', _sequenza: 92002 }, runtime.realSessionState.generation);
    runtime.handleRealEvent({ type: 'TextMessageEnd', messageId: 'race-answer', _sequenza: 92003 }, runtime.realSessionState.generation);
  });

  await expect(page.locator('.assistant-meta').last()).toContainText('qwen/qwen3.8-flash');
});

test('RUN-MODEL-TRACE-UI-07 — ogni risposta e l’export conservano il modello del proprio giro', async ({ page }) => {
  await page.goto('/');
  const prova = await page.evaluate(() => {
    const runtime = window.__talosHarnessUiRuntime;
    const session = runtime.realSessionState;
    document.querySelector('#conversation').replaceChildren();
    session.messageElements.clear();
    session.testoGrezzoMessaggi.clear();
    session.sequenzeViste.clear();
    session.runCount = 0;
    session.taskBubbleMostrata = false;

    const eventi = [
      { type: 'RunStarted', input: { consegna: 'Primo giro' }, contesto: { modello: 'qwen/qwen3.8-flash', reasoning: { effort: 'low' } }, _sequenza: 91001 },
      { type: 'TextMessageContent', messageId: 'turn-qwen', delta: 'Risposta Qwen', _sequenza: 91002 },
      { type: 'TextMessageEnd', messageId: 'turn-qwen', _sequenza: 91003 },
      { type: 'ToolCallStart', toolCallId: 'tool-qwen', toolCallName: 'leggi', _sequenza: 91004 },
      { type: 'ToolCallArgs', toolCallId: 'tool-qwen', delta: '{"percorso":"README.md"}', _sequenza: 91005 },
      { type: 'ToolCallResult', toolCallId: 'tool-qwen', content: 'contenuto letto', _sequenza: 91006 },
      { type: 'RunFinished', _sequenza: 91007 },
      { type: 'RunStarted', input: { consegna: 'Secondo giro', seguito: true }, contesto: { modello: 'google/gemini-3.7-flash', reasoning: { effort: 'medium' } }, _sequenza: 91008 },
      { type: 'TextMessageContent', messageId: 'turn-gemini', delta: 'Risposta Gemini', _sequenza: 91009 },
      { type: 'TextMessageEnd', messageId: 'turn-gemini', _sequenza: 91010 },
    ];
    for (const evento of eventi) runtime.handleRealEvent(evento, session.generation);

    const meta = [...document.querySelectorAll('.assistant-meta')].map((elemento) => elemento.textContent.trim());
    const tool = document.querySelector('[data-tool-state="complete"]')?.textContent || '';
    const exportMd = runtime.costruisciTrascrizioneMarkdown({
      sessionId: 'switch-trace',
      taskId: 'libero:default',
      nome: 'Cambio fluido',
      modello: 'google/gemini-3.7-flash',
      eventi: eventi.map(({ _sequenza, ...evento }) => evento),
    });
    return { meta, tool, exportMd };
  });

  expect(prova.meta).toEqual([
    'TALOS · qwen/qwen3.8-flash',
    'TALOS · google/gemini-3.7-flash',
  ]);
  expect(prova.tool).toContain('README.md');
  expect(prova.exportMd).toContain('**Modello del giro:** qwen/qwen3.8-flash');
  expect(prova.exportMd).toContain('**Modello del giro:** google/gemini-3.7-flash');
  expect(prova.exportMd).toContain('**🔧 leggi**');
  const visualDir = resolve(process.cwd(), 'artifacts', 'visual-audit-2026-09-01');
  await mkdir(visualDir, { recursive: true });
  await page.screenshot({ path: resolve(visualDir, 'model-switch-turn-attribution-1440x900.png'), fullPage: true });
});

test('la sidebar consente selezione massiva e cancellazione esplicita delle sessioni', async ({ page }) => {
  let sessioni = [
    { sessionId: 'bulk-a', taskId: 'a', nome: 'Sessione A', avviataAlle: '2026-09-01T07:00:00.000Z', conclusa: true, modello: 'google/gemini-3.7-flash', provider: 'cloud' },
    { sessionId: 'bulk-b', taskId: 'b', nome: 'Sessione B', avviataAlle: '2026-09-01T06:00:00.000Z', conclusa: true, modello: 'qwen/qwen3.8-flash', provider: 'cloud' },
    { sessionId: 'bulk-c', taskId: 'c', nome: 'Sessione C', avviataAlle: '2026-09-01T05:00:00.000Z', conclusa: true, modello: 'z-ai/glm-4.7-flash', provider: 'cloud' },
  ];
  const eliminati = [];
  await page.route('**/api/v1/sessions', async (route) => route.fulfill({
    status: 200, contentType: 'application/json',
    body: JSON.stringify({ ok: true, data: { items: sessioni }, meta: { schema: 'talos.harness-ui.api.v1' } }),
  }));
  await page.route('**/api/v1/sessions/*/events', async (route) => route.fulfill({ status: 200, contentType: 'text/event-stream', body: '' }));
  await page.route('**/api/v1/sessions/*/delete', async (route) => {
    const id = route.request().url().split('/sessions/')[1].split('/delete')[0];
    eliminati.push(id);
    sessioni = sessioni.filter((sessione) => sessione.sessionId !== id);
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, data: {} }) });
  });
  await page.goto('/');
  await expect(page.locator('#sessionSelectionToolbar')).toBeVisible();
  await page.locator('#sessionSelectionToggle').click();
  await page.locator('[data-session-select="bulk-a"]').check();
  await page.locator('[data-session-select="bulk-b"]').check();
  await expect(page.locator('#sessionSelectionCount')).toHaveText('2 selezionate');
  await expect(page.locator('#sessionSelectionDelete')).toBeEnabled();
  await page.evaluate(() => { window.confirm = () => true; });
  await page.locator('#sessionSelectionDelete').click();
  await expect.poll(() => eliminati.sort()).toEqual(['bulk-a', 'bulk-b']);
  await expect(page.locator('[data-real-session-id="bulk-a"]')).toHaveCount(0);
  await expect(page.locator('[data-real-session-id="bulk-b"]')).toHaveCount(0);
  await expect(page.locator('[data-real-session-id="bulk-c"]')).toBeVisible();
});

test('Doctor mostra la prontezza reale del runtime agente', async ({ page }) => {
  await page.goto('/');
  await page.locator('[data-open-view="settings"]').click();
  await page.locator('[data-settings-tab="account"]').click();
  await page.getByRole('button', { name: 'Agents', exact: true }).click();
  await page.locator('#sheetBody [data-control-action="doctor"]').click();
  await expect(page.locator('#sheetBody [data-doctor-status]')).not.toHaveText('Healthy');
});

test('Nuova automazione comunica in linguaggio naturale quando non ci sono attività', async ({ page }) => {
  await page.route('**/api/v1/tasks', async (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ ok: true, data: { items: [] }, meta: { schema: 'talos.harness-ui.api.v1' } }),
  }));
  await page.goto('/');
  await page.locator('[data-open-view="automations"]').evaluate((element) => element.click());
  await page.locator('[data-automation-action="new"]').evaluate((element) => element.click());
  await expect(page.locator('#sheetBody')).toContainText('Non ci sono ancora attività pronte');
  await expect(page.locator('#sheetBody')).not.toContainText('TASK_NOT_AVAILABLE');
});

test('desktop primary controls meet the 36 px hit-area gate', async ({ page }) => {
  await page.goto('/');
  const sizes = await page.locator('.topbar-right .icon-btn, #redirectRunButton:not([hidden])').evaluateAll((elements) => elements.map((element) => {
    const rect = element.getBoundingClientRect();
    return { width: rect.width, height: rect.height };
  }));
  expect(sizes.length).toBeGreaterThan(0);
  for (const size of sizes) {
    expect(size.width).toBeGreaterThanOrEqual(36);
    expect(size.height).toBeGreaterThanOrEqual(36);
  }
});

test('settings controls meet the same desktop hit-area gate', async ({ page }) => {
  await page.goto('/');
  await page.locator('[data-open-view="settings"]').click();
  const sizes = await page.locator('.settings-card button, .settings-card input, .settings-card select').evaluateAll((elements) => elements.map((element) => {
    const rect = element.getBoundingClientRect();
    return { id: element.id, tag: element.tagName, width: rect.width, height: rect.height };
  }).filter(({ width, height }) => width > 0 && height > 0));
  expect(sizes.length).toBeGreaterThan(0);
  for (const size of sizes) {
    expect(size.width, `${size.tag}#${size.id} width`).toBeGreaterThanOrEqual(36);
    expect(size.height, `${size.tag}#${size.id} height`).toBeGreaterThanOrEqual(36);
  }
});

test('Model Lab filters have explicit names and hit areas', async ({ page }) => {
  await page.goto('/');
  await page.locator('button[data-open-view="settings"]').click();
  await page.locator('[data-settings-tab="models"]').click();
  await page.locator('#modelLabHfTab').click();
  await expect(page.locator('#modelLabHfAuthorControl')).toHaveAttribute('aria-label', 'Filtra per autore Hugging Face');
  await expect(page.locator('#modelLabHfFiltersControl')).toHaveAttribute('aria-label', 'Filtra modelli Hugging Face');
  await expect(page.locator('#modelLabHfSortControl')).toHaveAttribute('aria-label', 'Ordina risultati Hugging Face');
  const sizes = await page.locator('#modelLabHfSearch, #modelLabHfAuthorControl, #modelLabHfFiltersControl, #modelLabHfSortControl').evaluateAll((elements) => elements.map((element) => {
    const rect = element.getBoundingClientRect();
    return { width: rect.width, height: rect.height };
  }));
  for (const size of sizes) {
    expect(size.width).toBeGreaterThanOrEqual(36);
    expect(size.height).toBeGreaterThanOrEqual(36);
  }
});

test('laboratory opt-in keeps demo labels available for visual scenarios', async ({ page }) => {
  await page.goto('/#ui-lab');
  expect(await page.locator('.demo-surface-badge').count()).toBeGreaterThan(0);
});

test('long response content owns overflow locally without widening the page', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => {
    const conversation = document.querySelector('#conversation');
    conversation.replaceChildren();
    const article = document.createElement('article');
    article.className = 'message assistant-message';
    const copy = document.createElement('div');
    copy.className = 'assistant-copy';
    const paragraph = document.createElement('p');
    paragraph.textContent = 'Percorso estremamente lungo senza spazi '.repeat(80);
    const pre = document.createElement('pre');
    const code = document.createElement('code');
    code.textContent = 'const extremelyLongIdentifier = "' + 'x'.repeat(240) + '";';
    pre.appendChild(code);
    copy.append(paragraph, pre);
    article.appendChild(copy);
    conversation.appendChild(article);
  });
  const metrics = await page.evaluate(() => {
    const copy = document.querySelector('.assistant-copy');
    const code = copy?.querySelector('pre');
    return {
      pageOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
      copyOverflow: Boolean(copy && copy.scrollWidth > copy.clientWidth + 1),
      codeOverflow: Boolean(code && code.scrollWidth > code.clientWidth + 1),
      codeWidth: code?.clientWidth ?? 0,
      codeScrollWidth: code?.scrollWidth ?? 0,
    };
  });
  expect(metrics.pageOverflow).toBe(false);
  expect(metrics.copyOverflow).toBe(false);
  expect(metrics.codeWidth).toBeGreaterThan(0);
  expect(metrics.codeScrollWidth).toBeGreaterThan(metrics.codeWidth);
});

/*
 * ⛔⛔ 13/09 sera — QUESTA PROVA FISSAVA IL COMPORTAMENTO VECCHIO, e l'owner l'ha cambiato apposta.
 *   Si chiamava «il ragionamento resta nascosto finché l'utente non attiva Mostra ragionamento». Dopo
 *   una ricerca (Hermes desktop, assistant-ui, AI SDK Elements, NN/g) la decisione è: il ragionamento
 *   non sparisce, si COMPRIME; di serie resta sempre compresso; l'interruttore dice se aprirlo mentre il
 *   modello scrive. Riscritta per dire la regola nuova, non allentata per far passare quella vecchia.
 */
test('RAGIONAMENTO-COMPRESSO — si comprime invece di sparire: riga chiusa di serie, aperta mentre scrive solo se lo chiedi', async ({ page }) => {
  /* ⛔ Il clic sul foglio «Modello» veniva intercettato prima dal velo d'avvio e poi dalla finestra del primo avvio: si salta l'introduzione e si aspetta che il velo sia rimosso. */
  await page.goto('/');
  await page.waitForFunction(() => window.__talosHarnessUiRuntime);
  await page.locator('#talosAvvio').waitFor({ state: 'detached', timeout: 8000 });
  const pulisci = () => page.evaluate(() => {
    const session = window.__talosHarnessUiRuntime.realSessionState;
    document.querySelector('#conversation')?.replaceChildren();
    session.sequenzeViste.clear();
    session.ragionamentoBubble.clear();
  });
  const eventi = (lista) => page.evaluate((lista) => {
    const runtime = window.__talosHarnessUiRuntime;
    for (const evento of lista) runtime.handleRealEvent(evento, runtime.realSessionState.generation);
  }, lista);
  const nota = page.locator('.real-reasoning-note');
  const testa = nota.locator(':scope > .talos-activity__head');

  await pulisci();
  await eventi([{ type: 'ReasoningMessageStart', messageId: 'reasoning-toggle', _sequenza: 90001 }]);
  await expect(nota, 'un ragionamento senza testo non ha riga').toBeHidden();
  await eventi([{ type: 'ReasoningMessageContent', messageId: 'reasoning-toggle', delta: 'Dettaglio interno', _sequenza: 90002 }]);
  await expect(nota, 'al primo testo la riga compare, anche con l’interruttore spento').toBeVisible();
  await expect(testa, 'di serie resta compressa').toHaveAttribute('aria-expanded', 'false');
  await expect(testa).toContainText('Sta ragionando…');
  await eventi([{ type: 'ReasoningMessageEnd', messageId: 'reasoning-toggle', _sequenza: 90003 }]);
  await expect(testa).toContainText('Ha ragionato');
  await expect(testa, 'un ragionamento finito non dice più che sta ragionando').not.toContainText('Sta ragionando');

  await page.locator('[data-open-sheet="model"]').click();
  const toggle = page.locator('#showReasoningToggle');
  await expect(toggle).toBeVisible();
  await expect(toggle).not.toBeChecked();
  await expect(toggle).toHaveAttribute('aria-label', 'Apri il ragionamento mentre scrive');
  await toggle.check();
  await expect(nota, 'accendere l’interruttore non fa sparire né riaprire un ragionamento già finito').toBeVisible();
  await expect(testa).toHaveAttribute('aria-expanded', 'false');

  await pulisci();
  await eventi([
    { type: 'ReasoningMessageStart', messageId: 'reasoning-live', _sequenza: 90011 },
    { type: 'ReasoningMessageContent', messageId: 'reasoning-live', delta: 'Leggo i file', _sequenza: 90012 },
  ]);
  await expect(testa, 'con l’interruttore acceso si apre mentre scrive').toHaveAttribute('aria-expanded', 'true');
  await eventi([{ type: 'ReasoningMessageEnd', messageId: 'reasoning-live', _sequenza: 90013 }]);
  await expect(testa, 'e si richiude da sola quando ha finito').toHaveAttribute('aria-expanded', 'false');
});

test('REASONING-INDICATOR-01 — il ragionamento nascosto mantiene un indicatore visibile e annunciato', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/');
  await page.evaluate(() => {
    const runtime = window.__talosHarnessUiRuntime;
    const session = runtime.realSessionState;
    document.querySelector('#conversation')?.replaceChildren();
    session.sequenzeViste.clear();
    session.ragionamentoBubble.clear();
    runtime.handleRealEvent({ type: 'ReasoningMessageStart', messageId: 'reasoning-live', _sequenza: 90011 }, session.generation);
  });
  /* ⛔ 13/09 sera — `.real-waiting-note` non esiste più (zero occorrenze nel monolite): questa prova era rossa anche col pacchetto di prima. L'attesa è `.talos-waiting`, con `role="status"` (`creaAttesa`). */
  const indicator = page.locator('.talos-waiting');
  await expect(indicator).toBeVisible();
  await expect(indicator).toHaveAttribute('role', 'status');
  await expect(indicator).toContainText('Ragionamento in corso');
  await expect(page.locator('.real-reasoning-note')).toBeHidden();
  const visualDir = resolve(process.cwd(), 'artifacts', 'visual-audit-2026-09-01');
  await mkdir(visualDir, { recursive: true });
  await page.screenshot({ path: resolve(visualDir, 'run-reasoning-indicator-1440x900.png'), fullPage: true });
});

test('REDUCED-MOTION-02 — l’indicatore resta leggibile e CALMO con movimento ridotto, mai fermo', async ({ page }) => {
  /*
   * ⛔⛔⛔ 02/9 — contratto CAMBIATO due volte in un colpo, per due ordini
   * espliciti dell'owner: la linea del mobile ORA deve esserci (prima
   * questo test ne pretendeva l'assenza), e sotto movimento ridotto il
   * loader NON deve essere spento (prima pretendeva `animation-name:
   * none`). Su questa macchina `prefers-reduced-motion` è vero a livello
   * di sistema, quindi quel "none" era esattamente ciò che l'owner vedeva
   * come "il logo di caricamento non è animato". Vedi il commento sul
   * loader in styles.css per la ricerca che regge la scelta: un
   * indicatore di stato essenziale si CALMA, non si congela.
   */
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  await page.evaluate(() => {
    const runtime = window.__talosHarnessUiRuntime;
    runtime.handleRealEvent({ type: 'ReasoningMessageStart', messageId: 'reasoning-reduced', _sequenza: 90021 }, runtime.realSessionState.generation);
  });
  await expect(page.locator('.talos-waiting')).toContainText('Ragionamento in corso'); // ⛔ 13/09 sera: era `.real-waiting-note`, selettore morto, rossa anche col pacchetto di prima
  /*
   * ⛔ 13/09 sera — RESTA ROSSA, per una seconda ragione che non è del ragionamento, e la si scrive invece di
   *   inseguirla. Riparato il selettore, la prova arriva qui e trova 0 nodi `.talos-line-loader-node`: il
   *   segnavia a linee esiste ancora nel codice, ma l'attesa non lo usa più — `creaAttesa` disegna l'orb
   *   (`talos-assistant-orb`). Queste righe controllano l'animazione di un componente che in questo punto non
   *   c'è: vanno riscritte sull'orb da chi tocca l'attesa, non spente.
   */
  const punti = page.locator('.talos-line-loader-node');
  await expect(punti).toHaveCount(3);
  await expect(page.locator('.talos-line-loader-head, .run-activity-shimmer')).toHaveCount(0);
  await expect(page.locator('.talos-line-loader-sweep')).toHaveCount(1);
  for (const punto of await punti.all()) await expect(punto).toHaveCSS('animation-name', 'talosLineNodeFill');
  await expect(page.locator('.talos-line-loader-sweep')).toHaveCSS('animation-name', 'talosLineSweep');
  // ⛔ La prova che conta: il browser le sta DAVVERO eseguendo, e non a
  // durata zero (il modo in cui `animation:none` si traveste da animazione).
  const stato = await page.locator('.talos-line-loader').first().evaluate((el) => el.getAnimations({ subtree: true }).map((a) => ({ p: a.playState, d: a.effect?.getTiming().duration, i: a.effect?.getTiming().iterations })));
  expect(stato).toHaveLength(4);
  expect(stato.every((a) => a.p === 'running' && a.d > 100 && a.i === Infinity)).toBe(true);
});

test('RUN-PRIMARY-STOP-03/RUN-QUEUE-04 — durante il run il primario ferma, Enter accoda e il testo abilita Reindirizza', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  let stopCalls = 0;
  let queued = null;
  await page.route('**/api/v1/sessions/run-active/stop', async (route) => {
    stopCalls += 1;
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, data: { stopped: true } }) });
  });
  await page.route('**/api/v1/sessions/run-active/queue', async (route) => {
    queued = route.request().postDataJSON();
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, data: { ok: true, posizione: 1 } }) });
  });
  await page.goto('/');
  await page.evaluate(() => {
    const runtime = window.__talosHarnessUiRuntime;
    const session = runtime.realSessionState;
    document.querySelector('#conversation')?.replaceChildren();
    session.id = 'run-active';
    session.taskBubbleMostrata = false;
    session.runCount = 0;
    session.sequenzeViste.clear();
    runtime.handleRealEvent({
      type: 'RunStarted',
      input: { consegna: 'Controlla il flusso di salvataggio e correggi il test instabile.' },
      _sequenza: 90031,
    }, session.generation);
  });
  const primary = page.locator('.send-btn');
  await expect(primary).toHaveAttribute('aria-label', 'Interrompi risposta');
  await expect(page.locator('#redirectRunButton')).toBeHidden();
  await page.locator('#composerInput').fill('prima attendi il confine sicuro');
  await expect(page.locator('#redirectRunButton')).toBeVisible();
  const visualDir = resolve(process.cwd(), 'artifacts', 'visual-audit-2026-09-01');
  await mkdir(visualDir, { recursive: true });
  await page.screenshot({ path: resolve(visualDir, 'run-stop-redirect-composer-1440x900.png'), fullPage: true });
  await page.setViewportSize({ width: 1280, height: 800 });
  await expect(page.locator('#redirectRunButton')).toBeVisible();
  await page.screenshot({ path: resolve(visualDir, 'run-stop-redirect-composer-1280x800.png'), fullPage: true });
  await page.setViewportSize({ width: 1024, height: 800 });
  await expect(page.locator('#redirectRunButton')).toBeVisible();
  await page.screenshot({ path: resolve(visualDir, 'run-stop-redirect-composer-1024x800.png'), fullPage: true });
  await page.locator('#composerInput').press('Enter');
  await expect.poll(() => queued).toEqual({ messaggio: 'prima attendi il confine sicuro' });
  await page.locator('.send-btn').click();
  await expect.poll(() => stopCalls).toBe(1);
});

test('RUN-REDIRECT-05 — Reindirizza usa la rotta prioritaria e non la coda', async ({ page }) => {
  let redirected = null;
  let queueCalls = 0;
  await page.route('**/api/v1/sessions/run-redirect/redirect', async (route) => {
    redirected = route.request().postDataJSON();
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, data: { ok: true, redirectId: 'd1' } }) });
  });
  await page.route('**/api/v1/sessions/run-redirect/queue', async (route) => {
    queueCalls += 1;
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, data: { ok: true, posizione: 1 } }) });
  });
  await page.goto('/');
  await page.evaluate(() => {
    const runtime = window.__talosHarnessUiRuntime;
    runtime.realSessionState.id = 'run-redirect';
    runtime.realSessionState.eventoTerminaleVisto = false;
    runtime.syncRunComposerState();
  });
  await page.locator('#composerInput').fill('fermati e usa la nuova API');
  await page.locator('#redirectRunButton').click();
  await expect.poll(() => redirected?.messaggio).toBe('fermati e usa la nuova API');
  expect(redirected.redirectId).toMatch(/^[0-9a-f-]{36}$/u);
  expect(queueCalls).toBe(0);
  await expect(page.locator('#composerInput')).toHaveValue('');
});

test('RUN-REDIRECT-FAILURE-06 — un rifiuto del server conserva il testo e riabilita Reindirizza', async ({ page }) => {
  await page.route('**/api/v1/sessions/run-redirect-failure/redirect', async (route) => {
    await route.fulfill({
      status: 409,
      contentType: 'application/json',
      body: JSON.stringify({ ok: false, error: { code: 'SESSION_NOT_READY' } }),
    });
  });
  await page.goto('/');
  await page.evaluate(() => {
    const runtime = window.__talosHarnessUiRuntime;
    runtime.realSessionState.id = 'run-redirect-failure';
    runtime.realSessionState.eventoTerminaleVisto = false;
    runtime.syncRunComposerState();
  });
  const input = page.locator('#composerInput');
  const redirect = page.locator('#redirectRunButton');
  await input.fill('non perdere questa correzione');
  await redirect.click();
  await expect(input).toHaveValue('non perdere questa correzione');
  await expect(redirect).toBeEnabled();
  await expect(redirect).not.toHaveAttribute('aria-busy', 'true');
  await expect(page.locator('.toast')).toContainText('Reindirizzamento non riuscito');
});

test('RUN-REDIRECT-STOP-RACE-16 — una cancellazione autoritativa prevale sul 200 tardivo e conserva il testo', async ({ page }) => {
  let richiestaVista = false;
  let sbloccaRisposta;
  const rispostaSospesa = new Promise((resolve) => { sbloccaRisposta = resolve; });
  await page.route('**/api/v1/sessions/run-redirect-race/redirect', async (route) => {
    richiestaVista = true;
    await rispostaSospesa;
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ ok: true, data: { ok: true, redirectId: 'd-race' } }),
    });
  });
  await page.goto('/');
  await page.evaluate(() => {
    const runtime = window.__talosHarnessUiRuntime;
    runtime.realSessionState.id = 'run-redirect-race';
    runtime.realSessionState.eventoTerminaleVisto = false;
    runtime.syncRunComposerState();
  });
  const input = page.locator('#composerInput');
  await input.fill('conserva questa correzione');
  await page.locator('#redirectRunButton').click();
  await expect.poll(() => richiestaVista).toBe(true);
  await page.evaluate(() => {
    const runtime = window.__talosHarnessUiRuntime;
    const generation = runtime.realSessionState.generation;
    runtime.handleRealEvent({ type: 'RunRedirectRequested', redirectId: 'd-race', testo: 'conserva questa correzione', _sequenza: 91601 }, generation);
    runtime.handleRealEvent({ type: 'RunRedirectCancelled', redirectId: 'd-race', reason: 'stop-richiesto', _sequenza: 91602 }, generation);
  });
  sbloccaRisposta();
  await expect(page.locator('#redirectRunButton')).not.toHaveAttribute('aria-busy', 'true');
  await expect(input).toHaveValue('conserva questa correzione');
  expect((await page.locator('.toast').allTextContents()).join(' ')).not.toContain('Reindirizzamento richiesto');
});

test('RUN-STOP-BEFORE-REDIRECT-20 — Stop invalida anche una richiesta redirect che il server non ha ancora registrato', async ({ page }) => {
  let redirectBody = null;
  let stopBody = null;
  let sbloccaRedirect;
  const redirectSospeso = new Promise((resolve) => { sbloccaRedirect = resolve; });
  await page.route('**/api/v1/sessions/run-stop-before-redirect/redirect', async (route) => {
    redirectBody = route.request().postDataJSON();
    await redirectSospeso;
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, data: { ok: true, redirectId: redirectBody.redirectId } }) });
  });
  await page.route('**/api/v1/sessions/run-stop-before-redirect/stop', async (route) => {
    stopBody = route.request().postDataJSON();
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, data: { stopped: true } }) });
  });
  await page.goto('/');
  await page.evaluate(() => {
    const runtime = window.__talosHarnessUiRuntime;
    runtime.realSessionState.id = 'run-stop-before-redirect';
    runtime.realSessionState.eventoTerminaleVisto = false;
    runtime.syncRunComposerState();
  });
  const input = page.locator('#composerInput');
  await input.fill('questa correzione non va più applicata');
  await page.locator('#redirectRunButton').click();
  await expect.poll(() => redirectBody).not.toBeNull();
  await page.locator('.send-btn').click();
  await expect.poll(() => stopBody).not.toBeNull();
  expect(stopBody.redirectId).toBe(redirectBody.redirectId);
  sbloccaRedirect();
  await expect(page.locator('#redirectRunButton')).not.toHaveAttribute('aria-busy', 'true');
  await expect(input).toHaveValue('questa correzione non va più applicata');
  expect((await page.locator('.toast').allTextContents()).join(' ')).not.toContain('Reindirizzamento richiesto');
});

test('RUN-REDIRECT-PENDING-17 — un redirect pendente non offre una seconda azione destinata al 409', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => {
    const runtime = window.__talosHarnessUiRuntime;
    runtime.realSessionState.id = 'run-redirect-pending';
    runtime.realSessionState.eventoTerminaleVisto = false;
    runtime.syncRunComposerState();
  });
  const input = page.locator('#composerInput');
  const redirect = page.locator('#redirectRunButton');
  await input.fill('una sola correzione');
  await page.evaluate(() => {
    const runtime = window.__talosHarnessUiRuntime;
    runtime.handleRealEvent({ type: 'RunRedirectRequested', redirectId: 'd-pending', testo: 'una sola correzione', _sequenza: 91701 }, runtime.realSessionState.generation);
  });
  await expect(redirect).toBeVisible();
  await expect(redirect).toBeDisabled();
});

test('RUN-REDIRECT-NO-FLICKER-13 — il terminale del giro interrotto non trasforma Stop in Invia prima della ripartenza', async ({ page }) => {
  await page.goto('/');
  const state = await page.evaluate(() => {
    const runtime = window.__talosHarnessUiRuntime;
    runtime.realSessionState.id = 'run-no-flicker';
    runtime.realSessionState.eventoTerminaleVisto = false;
    runtime.syncRunComposerState();
    const generation = runtime.realSessionState.generation;
    runtime.handleRealEvent({ type: 'RunRedirectRequested', redirectId: 'd-no-flicker', testo: 'correggi', _sequenza: 90601 }, generation);
    runtime.handleRealEvent({ type: 'RunFinished', threadId: 't1', runId: 'r1', outcome: 'fermato', _sequenza: 90602 }, generation);
    return {
      terminale: runtime.realSessionState.eventoTerminaleVisto,
      primary: document.querySelector('.send-btn')?.getAttribute('aria-label'),
      activity: document.querySelector('.run-activity-label')?.textContent,
    };
  });
  expect(state).toEqual({ terminale: false, primary: 'Interrompi risposta', activity: 'Reindirizzamento al prossimo punto sicuro…' });
});

test('TOOL-BATCH-HIDDEN-REASONING-01 — il ragionamento nascosto non spezza il gruppo dei comandi', async ({ page }) => {
  await page.goto('/');
  const batches = await page.evaluate(() => {
    const runtime = window.__talosHarnessUiRuntime;
    const session = runtime.realSessionState;
    document.querySelector('#conversation')?.replaceChildren();
    session.sequenzeViste.clear();
    session.batchAttivo = null;
    session.ultimoBatchChiuso = null;
    session.toolCallNomi.clear();
    session.ragionamentoBubble.clear();
    const generation = session.generation;
    runtime.handleRealEvent({ type: 'ToolCallStart', toolCallId: 'tool-before', toolCallName: 'leggi', _sequenza: 90101 }, generation);
    runtime.handleRealEvent({ type: 'ReasoningMessageStart', messageId: 'reasoning-between', _sequenza: 90102 }, generation);
    runtime.handleRealEvent({ type: 'ToolCallStart', toolCallId: 'tool-after', toolCallName: 'cerca', _sequenza: 90103 }, generation);
    return {
      /*
       * ⛔⛔ 13/09 sera — QUESTA GUARDIA NON GUARDAVA NIENTE. `.tool-batch` e `.real-tool-note` non esistono
       *   più nel monolite (zero occorrenze): era rossa col pacchetto di prima E con quello nuovo, con
       *   0 gruppi e 0 righe, cioè per un selettore morto e non per il difetto che nomina. Il gruppo oggi è
       *   la card `[data-c="ActivityBundle"]` (la nota del ragionamento è un bundle anche lei, e si esclude)
       *   e la riga è `.talos-tool-row`. Morde perché la prova sotto, VISIBILE-02, pretende 2 gruppi sugli
       *   stessi selettori: un selettore che non conta niente non passerebbe entrambe.
       */
      batches: document.querySelectorAll('#conversation [data-c="ActivityBundle"]:not(.real-reasoning-note)').length,
      rows: document.querySelectorAll('#conversation [data-c="ActivityBundle"]:not(.real-reasoning-note) .talos-tool-row').length,
      reasoningHidden: document.querySelector('.real-reasoning-note')?.hidden ?? false,
    };
  });
  expect(batches).toEqual({ batches: 1, rows: 2, reasoningHidden: true });
});

test('TOOL-BATCH-REASONING-VISIBILE-02 — un ragionamento CON testo fra due comandi è un confine: due gruppi, in ordine', async ({ page }) => {
  /*
   * ⛔ Il verso contrario della prova qui sopra, nata col ragionamento compresso (13/09 sera): senza testo
   *   il ragionamento non ha riga e non spezza il gruppo; con testo la riga c'è, e il comando che viene
   *   dopo deve stare SOTTO di lei, non risalire nel gruppo di prima.
   */
  await page.goto('/');
  const esito = await page.evaluate(() => {
    const runtime = window.__talosHarnessUiRuntime;
    const session = runtime.realSessionState;
    document.querySelector('#conversation')?.replaceChildren();
    session.sequenzeViste.clear();
    session.batchAttivo = null;
    session.ultimoBatchChiuso = null;
    session.toolCallNomi.clear();
    session.ragionamentoBubble.clear();
    const generation = session.generation;
    runtime.handleRealEvent({ type: 'ToolCallStart', toolCallId: 'tool-before-v', toolCallName: 'leggi', _sequenza: 90151 }, generation);
    runtime.handleRealEvent({ type: 'ReasoningMessageStart', messageId: 'reasoning-visible', _sequenza: 90152 }, generation);
    runtime.handleRealEvent({ type: 'ReasoningMessageContent', messageId: 'reasoning-visible', delta: 'Prima guardo il README.', _sequenza: 90153 }, generation);
    runtime.handleRealEvent({ type: 'ToolCallStart', toolCallId: 'tool-after-v', toolCallName: 'cerca', _sequenza: 90154 }, generation);
    const gruppi = [...document.querySelectorAll('#conversation [data-c="ActivityBundle"]:not(.real-reasoning-note)')];
    const nota = document.querySelector('.real-reasoning-note');
    const segue = (a, b) => Boolean(a && b && (a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING));
    return {
      batches: gruppi.length,
      reasoningHidden: nota?.hidden ?? true,
      ordine: segue(gruppi[0], nota) && segue(nota, gruppi[1]),
    };
  });
  expect(esito).toEqual({ batches: 2, reasoningHidden: false, ordine: true });
});

test('TOOL-LIFECYCLE-SAME-ROW-01 — start, argomenti ed esito aggiornano la stessa riga', async ({ page }) => {
  await page.goto('/');
  const result = await page.evaluate(() => {
    const runtime = window.__talosHarnessUiRuntime;
    const session = runtime.realSessionState;
    document.querySelector('#conversation')?.replaceChildren();
    session.sequenzeViste.clear();
    session.batchAttivo = null;
    session.ultimoBatchChiuso = null;
    session.toolCallNomi.clear();
    const generation = session.generation;
    runtime.handleRealEvent({ type: 'ToolCallStart', toolCallId: 'read-one', toolCallName: 'leggi', _sequenza: 90201 }, generation);
    const before = document.querySelector('.real-tool-note');
    const start = {
      state: before?.dataset.toolState ?? null,
      busy: before?.getAttribute('aria-busy'),
      text: before?.querySelector('.tool-note-summary-text')?.textContent ?? '',
    };
    runtime.handleRealEvent({ type: 'ToolCallArgs', toolCallId: 'read-one', delta: '{"percorso":"src/app.js"}', _sequenza: 90202 }, generation);
    const during = before?.querySelector('.tool-note-summary-text')?.textContent ?? '';
    runtime.handleRealEvent({ type: 'ToolCallResult', toolCallId: 'read-one', content: 'contenuto letto', _sequenza: 90203 }, generation);
    const after = document.querySelector('.real-tool-note');
    return {
      sameNode: before === after,
      start,
      during,
      end: {
        state: after?.dataset.toolState ?? null,
        busy: after?.getAttribute('aria-busy'),
        text: after?.querySelector('.tool-note-summary-text')?.textContent ?? '',
      },
    };
  });
  expect(result).toEqual({
    sameNode: true,
    start: { state: 'running', busy: 'true', text: 'Lettura file…' },
    during: 'Lettura di src/app.js…',
    end: { state: 'complete', busy: 'false', text: '1 file letto' },
  });
});

test('TOOL-DESCRIPTION-LIFECYCLE-04 — la descrizione del modello resta nella stessa riga dopo la conclusione', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/');
  const result = await page.evaluate(() => {
    const runtime = window.__talosHarnessUiRuntime;
    const session = runtime.realSessionState;
    document.querySelector('#conversation')?.replaceChildren();
    session.sequenzeViste.clear();
    session.batchAttivo = null;
    session.ultimoBatchChiuso = null;
    session.toolCallNomi.clear();
    const generation = session.generation;
    runtime.handleRealEvent({ type: 'ToolCallStart', toolCallId: 'described-shell', toolCallName: 'shell', _sequenza: 90211 }, generation);
    const row = document.querySelector('.real-tool-note');
    runtime.handleRealEvent({
      type: 'ToolCallArgs',
      toolCallId: 'described-shell',
      delta: JSON.stringify({ comando: 'node --test tests/config.test.mjs', descrizione: 'Verifica la configurazione del server' }),
      _sequenza: 90212,
    }, generation);
    const during = row?.querySelector('.tool-note-summary-text')?.textContent ?? '';
    runtime.handleRealEvent({ type: 'ToolCallResult', toolCallId: 'described-shell', content: 'exit 0\npass 7\nfail 0', _sequenza: 90213 }, generation);
    const after = document.querySelector('.real-tool-note');
    document.querySelector('.tool-batch-summary')?.click();
    after?.querySelector('.tool-note-summary')?.click();
    return {
      sameNode: row === after,
      during,
      final: after?.querySelector('.tool-note-summary-text')?.textContent ?? '',
      detail: after?.querySelector('.tool-note-detail')?.textContent ?? '',
      batch: document.querySelector('.tool-batch-summary .tool-note-summary-text')?.textContent ?? '',
    };
  });
  expect(result.sameNode).toBe(true);
  expect(result.during).toBe('Verifica la configurazione del server…');
  expect(result.final).toBe('Verifica la configurazione del server');
  expect(result.detail).toContain('comando: node --test tests/config.test.mjs');
  expect(result.detail).not.toContain('descrizione:');
  expect(result.batch).toBe('1 comando eseguito');
  await page.screenshot({ path: 'artifacts/tool-description-1440x900.png', fullPage: true });
  await page.setViewportSize({ width: 1024, height: 800 });
  await page.screenshot({ path: 'artifacts/tool-description-1024x800.png', fullPage: true });
});

test('TOOL-BATCH-AGGREGATION-01 — cinque letture diventano un solo totale grammaticalmente corretto', async ({ page }) => {
  await page.goto('/');
  const summaries = await page.evaluate(() => {
    const runtime = window.__talosHarnessUiRuntime;
    const session = runtime.realSessionState;
    const reset = () => {
      document.querySelector('#conversation')?.replaceChildren();
      session.sequenzeViste.clear();
      session.batchAttivo = null;
      session.ultimoBatchChiuso = null;
      session.toolCallNomi.clear();
    };
    const runReads = (count, sequenceBase) => {
      for (let index = 0; index < count; index += 1) {
        const id = `read-${sequenceBase}-${index}`;
        runtime.handleRealEvent({ type: 'ToolCallStart', toolCallId: id, toolCallName: 'leggi', _sequenza: sequenceBase + index * 3 }, session.generation);
        runtime.handleRealEvent({ type: 'ToolCallArgs', toolCallId: id, delta: JSON.stringify({ percorso: `src/${index}.js` }), _sequenza: sequenceBase + index * 3 + 1 }, session.generation);
        runtime.handleRealEvent({ type: 'ToolCallResult', toolCallId: id, content: 'ok', _sequenza: sequenceBase + index * 3 + 2 }, session.generation);
      }
      return {
        batches: document.querySelectorAll('.tool-batch').length,
        rows: document.querySelectorAll('.tool-batch .real-tool-note').length,
        summary: document.querySelector('.tool-batch-summary .tool-note-summary-text')?.textContent ?? '',
      };
    };
    reset();
    const singular = runReads(1, 90300);
    reset();
    const plural = runReads(5, 90400);
    return { singular, plural };
  });
  expect(summaries.singular).toEqual({ batches: 1, rows: 1, summary: '1 file letto' });
  expect(summaries.plural).toEqual({ batches: 1, rows: 5, summary: '5 file letti' });
});

test('TOOL-LIFECYCLE-ERROR-01 — l’errore conclude la riga e aggiorna il batch correlato', async ({ page }) => {
  await page.goto('/');
  const result = await page.evaluate(() => {
    const runtime = window.__talosHarnessUiRuntime;
    const session = runtime.realSessionState;
    document.querySelector('#conversation')?.replaceChildren();
    session.sequenzeViste.clear();
    session.batchAttivo = null;
    session.ultimoBatchChiuso = null;
    session.toolCallNomi.clear();
    const generation = session.generation;
    runtime.handleRealEvent({ type: 'ToolCallStart', toolCallId: 'old-shell', toolCallName: 'shell', _sequenza: 90501 }, generation);
    runtime.handleRealEvent({ type: 'ToolCallArgs', toolCallId: 'old-shell', delta: '{"comando":"exit 1"}', _sequenza: 90502 }, generation);
    const oldRow = document.querySelector('.real-tool-note');
    runtime.handleRealEvent({ type: 'TextMessageContent', messageId: 'visible-boundary', delta: 'Continuo.', _sequenza: 90503 }, generation);
    runtime.handleRealEvent({ type: 'ToolCallStart', toolCallId: 'new-read', toolCallName: 'leggi', _sequenza: 90504 }, generation);
    runtime.handleRealEvent({ type: 'ToolCallResult', toolCallId: 'old-shell', content: 'exit 1\nfailed', _sequenza: 90505 }, generation);
    const batches = [...document.querySelectorAll('.tool-batch-summary .tool-note-summary-text')].map((node) => node.textContent);
    return {
      rowState: oldRow?.dataset.toolState ?? null,
      rowBusy: oldRow?.getAttribute('aria-busy'),
      rowText: oldRow?.querySelector('.tool-note-summary-text')?.textContent ?? '',
      batches,
    };
  });
  expect(result).toEqual({
    rowState: 'error',
    rowBusy: 'false',
    rowText: '1 comando fallito',
    batches: ['1 comando eseguito (1 errore)', 'Lettura di 1 file…'],
  });
});

async function triggerWaitingLoader(page) {
  await page.route('**/api/v1/sessions', async (route) => {
    if (route.request().method() === 'GET') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ ok: true, data: { items: [] }, meta: { schema: 'talos.harness-ui.api.v1' } }),
      });
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 1_500));
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ ok: true, data: { sessionId: 'waiting-loader-session' }, meta: { schema: 'talos.harness-ui.api.v1' } }),
    });
  });
  await page.goto('/');
  await page.evaluate(() => {
    void window.__talosHarnessUiRuntime.startRealSession({
      id: 'waiting-loader-task',
      nome: 'Verifica loader',
      consegna: 'Verifica il movimento del loader.',
    });
  });
  const loader = page.locator('.real-waiting-note .talos-line-loader');
  await expect(loader).toBeVisible();
  return loader;
}

test('WAITING-LOADER-MOTION-01 — il loader reale è quello del mobile e avanza fra due fotogrammi', async ({ page }) => {
  /*
   * ⛔⛔⛔ 02/9 — contratto CAMBIATO per ordine diretto dell'owner: "usa
   * direttamente la stessa identica immagine animata del mobile... ci deve
   * essere una linea che attraversa i dot". La versione precedente di
   * questo test PRETENDEVA l'assenza dello sweep
   * (`.talos-line-loader-sweep` count 0) e una durata legata al token
   * `--motion-response-activity`: era la divergenza desktop congelata in
   * un test. Ora si prova la cosa vera — la linea ESISTE, e sweep + tre
   * nodi girano tutti all'infinito (4 animazioni, non 3).
   */
  const loader = await triggerWaitingLoader(page);
  await expect(page.locator('.run-activity-shimmer, .talos-line-loader-head')).toHaveCount(0);
  await expect(loader.locator('.talos-line-loader-track')).toHaveCount(1);
  await expect(loader.locator('.talos-line-loader-sweep')).toHaveCount(1);
  await expect(loader.locator('.talos-line-loader-node')).toHaveCount(3);
  const { animationState, geometria } = await loader.evaluate((element) => ({
    geometria: {
      viewBox: element.getAttribute('viewBox'),
      nodi: [...element.querySelectorAll('.talos-line-loader-node')].map((n) => n.getAttribute('cx')),
    },
    animationState: element.getAnimations({ subtree: true }).map((animation) => ({
      playState: animation.playState,
      duration: animation.effect?.getTiming().duration,
      iterations: animation.effect?.getTiming().iterations,
    })),
  }));
  expect(geometria.viewBox).toBe('0 0 96 16');
  expect(geometria.nodi).toEqual(['16', '48', '80']);
  expect(animationState).toHaveLength(4); // lo sweep + i tre nodi (la traccia è ferma per disegno)
  expect(animationState.every((animation) => animation.playState === 'running')).toBe(true);
  expect(animationState.every((animation) => animation.duration > 0)).toBe(true);
  expect(animationState.every((animation) => animation.iterations === Infinity)).toBe(true);
  const visualDir = resolve(process.cwd(), 'artifacts', 'visual-audit-2026-09-01');
  await mkdir(visualDir, { recursive: true });
  await page.screenshot({ path: resolve(visualDir, 'response-activity-dots-1440x900.png'), fullPage: true });
  const first = PNG.sync.read(await loader.screenshot({ animations: 'allow' }));
  await page.waitForTimeout(480);
  const second = PNG.sync.read(await loader.screenshot({ animations: 'allow' }));
  expect(first.width).toBe(second.width);
  expect(first.height).toBe(second.height);
  const changed = pixelmatch(first.data, second.data, null, first.width, first.height, { threshold: 0.05 });
  expect(changed).toBeGreaterThan(0);
});

test('WAITING-LOADER-REDUCED-MOTION-01 — ridurre il movimento CALMA il loader, non lo congela', async ({ page }) => {
  /*
   * ⛔ 02/9 — contratto CAMBIATO deliberatamente: la versione precedente di
   * questo test pretendeva `changed === 0` (congelamento totale) sotto
   * `prefers-reduced-motion: reduce`. Owner, dal vivo: "il logo di
   * caricamento non è animato" — su una macchina reale con quella
   * preferenza attiva a livello di sistema (misurato via CDP, non
   * presunto) il congelamento si vedeva come un loader rotto durante
   * un'attesa reale. Vedi il commento su `talosLineNodeBreath` in
   * styles.css: un "sto ancora lavorando" resta vivo (più calmo — sola
   * opacità, nessuno scale — non il pulse pieno) anche a movimento
   * ridotto, non zittito del tutto. Qui si prova solo "vivo", non
   * "quanto": il "più calmo del pulse pieno" è già provato a livello di
   * sorgente CSS in tests/response-activity-indicator.test.mjs
   * (RESPONSE-ACTIVITY-REDUCED-03, keyframe `talosLineNodeBreath` invece
   * di `talosLineNodePulse`) — misurato qui il 02/9: 93 pixel cambiati
   * su 480ms con la nuova keyframe, 0 con quella vecchia.
   */
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const loader = await triggerWaitingLoader(page);
  const first = PNG.sync.read(await loader.screenshot({ animations: 'allow' }));
  await page.waitForTimeout(480);
  const second = PNG.sync.read(await loader.screenshot({ animations: 'allow' }));
  const changed = pixelmatch(first.data, second.data, null, first.width, first.height, { threshold: 0.05 });
  const nodeStyles = await loader.locator('.talos-line-loader-node').evaluateAll((nodes) => nodes.map((node) => ({
    stroke: getComputedStyle(node).stroke,
    strokeWidth: getComputedStyle(node).strokeWidth,
    opacity: getComputedStyle(node).opacity,
  })));
  expect(changed).toBeGreaterThan(0);
  expect(nodeStyles).toHaveLength(3);
  /*
   * ⛔ 02/9 — si guarda lo STROKE, non il fill: nel disegno del mobile i
   * nodi sono cerchi VUOTI (`fill: transparent`) che si riempiono solo
   * quando lo sweep li raggiunge — il fill trasparente è il loro stato
   * normale, non un nodo invisibile. Quello che deve essere sempre
   * visibile è il contorno.
   */
  expect(nodeStyles.every((node) => node.stroke !== 'none' && node.stroke !== 'rgba(0, 0, 0, 0)' && node.opacity !== '0')).toBe(true);
  const visualDir = resolve(process.cwd(), 'artifacts', 'visual-audit-2026-09-01');
  await mkdir(visualDir, { recursive: true });
  await page.screenshot({ path: resolve(visualDir, 'response-activity-reduced-1440x900.png'), fullPage: true });
});

test('lo streaming porta l’ultimo output verso il centro della conversazione', async ({ page }) => {
  await page.goto('/');
  const metrics = await page.evaluate(async () => {
    const conversation = document.querySelector('#conversation');
    conversation.replaceChildren();
    for (let i = 0; i < 18; i += 1) {
      const previous = document.createElement('article');
      previous.className = 'message assistant-message';
      previous.style.height = '90px';
      previous.textContent = `Output precedente ${i}`;
      conversation.appendChild(previous);
    }
    conversation.scrollTop = 0;
    const runtime = window.__talosHarnessUiRuntime;
    const session = runtime.realSessionState;
    session.sequenzeViste.clear();
    session.testoGrezzoMessaggi.clear();
    runtime.handleRealEvent({ type: 'TextMessageContent', messageId: 'stream-center', delta: 'Ultimo output in streaming', _sequenza: 90201 }, session.generation);
    await new Promise((resolve) => setTimeout(resolve, 100));
    const output = conversation.querySelector('.assistant-message:last-child');
    const containerRect = conversation.getBoundingClientRect();
    const outputRect = output.getBoundingClientRect();
    return {
      targetCenter: outputRect.top + outputRect.height / 2 - containerRect.top,
      viewport: conversation.clientHeight,
      scrollTop: conversation.scrollTop,
    };
  });
  expect(metrics.scrollTop).toBeGreaterThan(0);
  expect(metrics.targetCenter).toBeGreaterThan(metrics.viewport * 0.4);
  expect(metrics.targetCenter).toBeLessThan(metrics.viewport * 0.6);
});

test('SESSION-SETTINGS-RELOAD-01 — permessi e override della sessione restano veri dopo il reload', async ({ page }) => {
  const sessione = {
    sessionId: 'session-settings-reload', taskId: 'libero:default', nome: 'Sessione persistente',
    avviataAlle: '2026-09-01T09:00:00.000Z', conclusa: true,
    modello: 'google/gemini-3.7-flash', reasoning: { effort: 'high' },
    permessi: 'Read only', permessiPerAttrezzo: { shell: 'nega' }, provider: 'cloud',
  };
  const aggiornamenti = [];
  await page.route('**/api/v1/sessions', async (route) => route.fulfill({
    status: 200, contentType: 'application/json',
    body: JSON.stringify({ ok: true, data: { items: [sessione] }, meta: { schema: 'talos.harness-ui.api.v1' } }),
  }));
  await page.route('**/api/v1/sessions/session-settings-reload/events', async (route) => route.fulfill({
    status: 200, contentType: 'text/event-stream', body: '',
  }));
  await page.route('**/api/v1/sessions/session-settings-reload/settings', async (route) => {
    const patch = route.request().postDataJSON();
    aggiornamenti.push(patch);
    Object.assign(sessione, patch);
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, data: { updated: true } }) });
  });
  await page.goto('/');
  await page.locator('[data-real-session-id="session-settings-reload"]').click();
  await expect(page.locator('[data-open-sheet="model"] span')).toHaveText('google/gemini-3.7-flash');
  await page.locator('.selector-pill[data-open-sheet="permissions"]').click();
  await expect(page.locator('[data-permission-choice="Read only"]')).toHaveClass(/active/);
  await expect(page.locator('[data-tool-permission-select="shell"]')).toHaveValue('nega');
  await page.locator('[data-permission-choice="On request"]').click();
  await expect.poll(() => aggiornamenti.some((patch) => patch.permessi === 'On request')).toBe(true);
  await page.reload();
  await page.locator('[data-real-session-id="session-settings-reload"]').click();
  await page.locator('.selector-pill[data-open-sheet="permissions"]').click();
  await expect(page.locator('[data-permission-choice="On request"]')).toHaveClass(/active/);
  await expect(page.locator('[data-tool-permission-select="shell"]')).toHaveValue('nega');
});

test('VIEW-TRANSITION-RACE-01 — una navigazione rapida non lascia la colonna centrale vuota', async ({ page }) => {
  await page.goto('/');

  for (let tentativo = 0; tentativo < 2; tentativo += 1) {
    await page.locator('[data-open-view="settings"]').dispatchEvent('click');
    await page.locator('.mode-tab[data-mode="chat"]').dispatchEvent('click');
    await page.waitForTimeout(400);

    const activeViews = page.locator('.view-pane.active');
    await expect(activeViews).toHaveCount(1);
    await expect(activeViews).toHaveAttribute('data-view', 'chat');
    await expect(page.locator('#conversation')).toBeVisible();
    await expect(page.locator('.composer')).toBeVisible();
  }
});

test('SETTINGS-VIEW-ISOLATION-01 — impostazioni non lasciano trasparire chat e composer', async ({ page }) => {
  await page.goto('/');
  await page.locator('[data-open-view="settings"]').dispatchEvent('click');
  await page.waitForTimeout(400);

  const activeViews = page.locator('.view-pane.active');
  await expect(activeViews).toHaveCount(1);
  await expect(activeViews).toHaveAttribute('data-view', 'settings');
  await expect(page.locator('.view-pane[data-view="settings"] .settings-layout')).toBeVisible();
  await expect(page.locator('#conversation')).not.toBeVisible();
  await expect(page.locator('.composer')).not.toBeVisible();
});

test('CHAT-FULL-WIDTH-01 — allarga solo messaggi e bolle, mai il composer', async ({ page }) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.goto('/');

  const preparaMessaggi = async () => {
    await page.locator('#conversation').evaluate((conversation) => {
      conversation.replaceChildren();
      const user = document.createElement('article');
      user.className = 'message user-message';
      user.innerHTML = '<div class="message-bubble">Analizza l’intero workspace, confronta ogni dipendenza, verifica i contratti pubblici e prepara una risposta completa. Includi i rischi di regressione, le prove sintetiche, le verifiche reali e le fonti primarie consultate. Concludi con una consegna esplicita che renda misurabile la larghezza massima della bolla utente senza cambiare il composer.</div>';
      const assistant = document.createElement('article');
      assistant.className = 'message assistant-message';
      assistant.innerHTML = '<div class="assistant-copy"><p>Ho analizzato il workspace e raccolto evidenze sufficienti per misurare la risposta su tutta la larghezza disponibile della conversazione, senza modificare il composer.</p></div>';
      conversation.append(user, assistant);
    });
  };
  const misura = () => page.evaluate(() => {
    const conversation = document.querySelector('#conversation');
    const padding = getComputedStyle(conversation);
    const composer = document.querySelector('.composer');
    const composerStyle = getComputedStyle(composer);
    return {
      composer: composer.getBoundingClientRect().width,
      composerGeometry: {
        height: composer.getBoundingClientRect().height,
        minHeight: composerStyle.minHeight,
        borderRadius: composerStyle.borderRadius,
        padding: composerStyle.padding,
      },
      disponibile: conversation.clientWidth - Number.parseFloat(padding.paddingLeft) - Number.parseFloat(padding.paddingRight),
      utente: document.querySelector('.message-bubble').getBoundingClientRect().width,
      assistente: document.querySelector('.assistant-message').getBoundingClientRect().width,
    };
  });

  await preparaMessaggi();
  const prima = await misura();
  expect(prima.utente).toBeLessThanOrEqual(681);
  expect(prima.assistente).toBeLessThanOrEqual(761);

  await page.locator('[data-open-view="settings"]').click();
  await page.locator('[data-settings-tab="chat"]').click();
  const toggle = page.locator('#chatFullWidthToggle');
  await expect(toggle).not.toBeChecked();
  await toggle.check();
  await page.locator('.mode-tab[data-mode="chat"]').click();
  const estesa = await misura();
  expect.soft(Math.abs(estesa.composer - prima.composer), 'il composer non deve cambiare larghezza').toBeLessThanOrEqual(1);
  expect.soft(estesa.composerGeometry, 'il composer non deve cambiare forma').toEqual(prima.composerGeometry);
  expect.soft(estesa.utente, 'la bolla utente deve occupare la larghezza disponibile').toBeGreaterThan(prima.utente + 200);
  expect.soft(estesa.assistente, 'la risposta deve occupare la larghezza disponibile').toBeGreaterThan(prima.assistente + 200);
  expect.soft(Math.abs(estesa.utente - estesa.disponibile)).toBeLessThanOrEqual(1);
  expect.soft(Math.abs(estesa.assistente - estesa.disponibile)).toBeLessThanOrEqual(1);

  await page.reload();
  await expect(page.locator('html')).toHaveClass(/chat-full-width/);
  await preparaMessaggi();
  const ricaricata = await misura();
  expect(Math.abs(ricaricata.composer - prima.composer)).toBeLessThanOrEqual(1);
  expect(ricaricata.composerGeometry).toEqual(prima.composerGeometry);
  expect(Math.abs(ricaricata.utente - ricaricata.disponibile)).toBeLessThanOrEqual(1);
  expect(Math.abs(ricaricata.assistente - ricaricata.disponibile)).toBeLessThanOrEqual(1);

  await page.locator('[data-open-view="settings"]').click();
  await page.locator('[data-settings-tab="chat"]').click();
  await page.locator('#chatFullWidthToggle').uncheck();
  await page.locator('.mode-tab[data-mode="chat"]').click();
  const ripristinata = await misura();
  expect(Math.abs(ripristinata.composer - prima.composer)).toBeLessThanOrEqual(1);
  expect(ripristinata.composerGeometry).toEqual(prima.composerGeometry);
  expect(ripristinata.utente).toBeLessThanOrEqual(681);
  expect(ripristinata.assistente).toBeLessThanOrEqual(761);
});

test('COMPOSER-SHAPE-FULL-WIDTH-01 — il toggle full width preserva ogni forma del composer', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/');
  const misuraComposer = () => page.locator('.composer').evaluate((composer) => {
    const style = getComputedStyle(composer);
    const rect = composer.getBoundingClientRect();
    return { width: rect.width, height: rect.height, minHeight: style.minHeight, borderRadius: style.borderRadius, padding: style.padding };
  });

  for (const forma of ['standard', 'classic', 'compact']) {
    await page.locator('[data-open-view="settings"]').click();
    await page.locator('[data-settings-tab="appearance"]').click();
    await page.locator('#composerShapeSelect').selectOption(forma);
    await page.locator('.mode-tab[data-mode="chat"]').click();
    const prima = await misuraComposer();

    await page.locator('[data-open-view="settings"]').click();
    await page.locator('[data-settings-tab="chat"]').click();
    const fullWidth = page.locator('#chatFullWidthToggle');
    if (await fullWidth.isChecked()) await fullWidth.uncheck();
    await fullWidth.check();
    await page.locator('.mode-tab[data-mode="chat"]').click();
    const dopo = await misuraComposer();
    expect(dopo, `forma ${forma}`).toEqual(prima);

    await page.reload();
    expect(await misuraComposer(), `forma ${forma} dopo reload`).toEqual(prima);
    await page.locator('[data-open-view="settings"]').click();
    await page.locator('[data-settings-tab="chat"]').click();
    await page.locator('#chatFullWidthToggle').uncheck();
    await page.locator('.mode-tab[data-mode="chat"]').click();
  }
});

test('COMPOSER-MOCKUP-HEIGHT-01 — ogni forma desktop conserva l’altezza canonica del mockup', async ({ page, context }) => {
  const mockup = await context.newPage();
  await mockup.setViewportSize({ width: 1440, height: 900 });
  await mockup.goto(pathToFileURL(resolve(process.cwd(), '..', 'mockup-originale', 'index.html')).href);
  const altezzaMockup = await mockup.locator('.composer').evaluate((composer) => composer.getBoundingClientRect().height);
  expect(altezzaMockup).toBe(116);
  await mockup.close();

  for (const viewport of [{ width: 1440, height: 900 }, { width: 1024, height: 800 }]) {
    await page.setViewportSize(viewport);
    await page.goto('/');
    for (const forma of ['standard', 'classic', 'compact']) {
      await page.locator('[data-open-view="settings"]').click();
      await page.locator('[data-settings-tab="appearance"]').click();
      await page.locator('#composerShapeSelect').selectOption(forma);
      await page.locator('.mode-tab[data-mode="chat"]').click();

      const misura = await page.locator('.composer').evaluate((composer) => {
        const input = composer.querySelector('textarea');
        const toolbar = composer.querySelector('.composer-toolbar');
        const rect = composer.getBoundingClientRect();
        return {
          height: rect.height,
          inputBottom: input.getBoundingClientRect().bottom,
          toolbarTop: toolbar.getBoundingClientRect().top,
        };
      });
      expect(Math.abs(misura.height - altezzaMockup), `${viewport.width}px · ${forma}`).toBeLessThanOrEqual(1);
      expect(misura.inputBottom, `${viewport.width}px · ${forma} · input`).toBeLessThanOrEqual(misura.toolbarTop + 1);

      await page.locator('#composerInput').fill('Prima riga\nSeconda riga');
      const multilinea = await page.locator('.composer').evaluate((composer) => ({
        height: composer.getBoundingClientRect().height,
        inputBottom: composer.querySelector('textarea').getBoundingClientRect().bottom,
        toolbarTop: composer.querySelector('.composer-toolbar').getBoundingClientRect().top,
      }));
      expect(multilinea.height).toBeGreaterThanOrEqual(altezzaMockup);
      expect(multilinea.inputBottom).toBeLessThanOrEqual(multilinea.toolbarTop + 1);

      await page.reload();
      const dopoReload = await page.locator('.composer').evaluate((composer) => composer.getBoundingClientRect().height);
      expect(Math.abs(dopoReload - altezzaMockup), `${viewport.width}px · ${forma} · reload`).toBeLessThanOrEqual(1);
    }
  }
});

test('CHAT-FULL-WIDTH-SHORT-BUBBLE-01 — una domanda breve non viene stirata', async ({ page }) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.goto('/');

  const preparaDomandaBreve = async () => {
    await page.locator('#conversation').evaluate((conversation) => {
      conversation.replaceChildren();
      const user = document.createElement('article');
      user.className = 'message user-message';
      user.innerHTML = '<div class="message-bubble">Ci sei?</div>';
      conversation.append(user);
    });
  };
  const misura = () => page.evaluate(() => ({
    composer: document.querySelector('.composer').getBoundingClientRect().width,
    bolla: document.querySelector('.message-bubble').getBoundingClientRect().width,
  }));

  await preparaDomandaBreve();
  const prima = await misura();
  expect(prima.bolla).toBeLessThan(180);

  await page.locator('[data-open-view="settings"]').click();
  await page.locator('[data-settings-tab="chat"]').click();
  await page.locator('#chatFullWidthToggle').check();
  await page.locator('.mode-tab[data-mode="chat"]').click();
  const estesa = await misura();
  expect(Math.abs(estesa.composer - prima.composer)).toBeLessThanOrEqual(1);
  expect(Math.abs(estesa.bolla - prima.bolla)).toBeLessThanOrEqual(1);
  expect(estesa.bolla).toBeLessThan(180);

  await page.reload();
  await preparaDomandaBreve();
  const ricaricata = await misura();
  expect(Math.abs(ricaricata.composer - prima.composer)).toBeLessThanOrEqual(1);
  expect(Math.abs(ricaricata.bolla - prima.bolla)).toBeLessThanOrEqual(1);
});

test('CHAT-FULL-WIDTH-COPY-01 — le impostazioni descrivono il perimetro reale', async ({ page }) => {
  await page.goto('/');
  await page.locator('[data-open-view="settings"]').click();
  await page.locator('[data-settings-tab="chat"]').click();
  const panel = page.locator('#settingsChatPanel');
  await expect(panel).toContainText('Risposte e domande lunghe');
  await expect(panel).toContainText('Le domande brevi, il composer e le sidebar non cambiano');
  await expect(panel).not.toContainText('conversazione e del composer');
});

test('INSPECTOR-WIDTH-01 — il pannello destro cresce senza schiacciare la chat e si adatta al viewport', async ({ page }) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.goto('/');
  const handle = page.locator('#inspectorResizeHandle');
  const box = await handle.boundingBox();
  expect(box).not.toBeNull();
  await page.mouse.move(box.x + 2, box.y + 120);
  await page.mouse.down();
  await page.mouse.move(box.x - 360, box.y + 120, { steps: 12 });
  await page.mouse.up();
  const larga = await page.locator('#inspectorPanel').evaluate((element) => element.getBoundingClientRect().width);
  expect(larga).toBeGreaterThanOrEqual(620);
  expect(larga).toBeLessThanOrEqual(720);
  await page.reload();
  await expect.poll(() => page.locator('#inspectorPanel').evaluate((element) => element.getBoundingClientRect().width)).toBeGreaterThanOrEqual(620);
  await page.setViewportSize({ width: 1200, height: 900 });
  await expect.poll(() => page.locator('#inspectorPanel').evaluate((element) => element.getBoundingClientRect().width)).toBeLessThanOrEqual(420);
  const ridotta = await page.locator('#inspectorPanel').evaluate((element) => element.getBoundingClientRect().width);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1);
  expect(ridotta).toBeLessThanOrEqual(420);
  expect(overflow).toBe(false);
});

test('DESKTOP-SETTINGS-PERSISTENCE-01 — i controlli di aspetto producono stato reale e persistono', async ({ page }) => {
  await page.goto('/');
  await page.locator('[data-open-view="settings"]').click();
  await page.locator('#composerShapeSelect').selectOption('compact');
  await page.locator('#messageStyleSelect').selectOption('bubbles');
  await page.locator('#streamingAnimationSelect').selectOption('fade');
  await page.locator('#windowPresentationSelect').selectOption('fullscreen');
  await page.locator('#motionQualitySelect').selectOption('high');
  await page.locator('#motionEasingSelect').selectOption('soft');
  await page.locator('#immersiveHeaderToggle').check();
  await expect(page.locator('html')).toHaveAttribute('data-talos-composer-shape', 'compact');
  await expect(page.locator('html')).toHaveAttribute('data-talos-message-style', 'bubbles');
  await expect(page.locator('html')).toHaveAttribute('data-talos-streaming-animation', 'fade');
  await expect(page.locator('html')).toHaveAttribute('data-talos-window-presentation', 'fullscreen');
  await expect(page.locator('html')).toHaveAttribute('data-talos-motion-quality', 'high');
  await expect(page.locator('html')).toHaveAttribute('data-talos-motion-easing', 'soft');
  await expect(page.locator('html')).toHaveClass(/immersive-header/);
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-talos-composer-shape', 'compact');
  await expect(page.locator('html')).toHaveAttribute('data-talos-message-style', 'bubbles');
  await expect(page.locator('html')).toHaveClass(/immersive-header/);
});

/*
 * ⭐⭐⭐ 02/09 — review complessiva: lo streaming vivo rilavorava TUTTO il
 * markdown a ogni frame (13k caratteri in 162 delta = 1,28 s di main thread).
 * Ora i blocchi chiusi (riga vuota fuori fence) si rendono una volta sola e
 * restano gli STESSI nodi DOM; solo la coda si rifà. Il test prova l'identità
 * dei nodi, non solo il testo: un renderer che ricrea tutto passerebbe un
 * controllo sul solo textContent.
 */
test('LAG-LIVE-INCREMENTAL-40 — i blocchi già chiusi non vengono ricreati a ogni delta, la coda sì e il testo finale è completo', async ({ page }) => {
  await page.route('**/api/v1/sessions/lag-live-incremental/events', async (route) => route.fulfill({ status: 200, contentType: 'text/event-stream', body: '' }));
  await page.goto('/');
  const result = await page.evaluate(async () => {
    const runtime = window.__talosHarnessUiRuntime;
    runtime.passaASessione('lag-live-incremental', 'workspace', 'Live', 'qwen/qwen3.8-flash', { conclusa: false, modello: 'qwen/qwen3.8-flash' });
    const generation = runtime.realSessionState.generation;
    const frame = () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    const mid = 'inc-1';
    let seq = 31000;
    const invia = (delta) => runtime.handleRealEvent({ type: 'TextMessageContent', messageId: mid, delta, _sequenza: seq += 1 }, generation);

    invia('Primo paragrafo con **grassetto**.\n\n');
    await frame();
    const copia = document.querySelector('.assistant-message:last-child .assistant-copy');
    const primoNodo = copia?.firstElementChild || null;
    const primoTag = primoNodo?.tagName || null;

    invia('```js\nconst a = 1;\n\nconst b = 2;\n');   // fence APERTO con una riga vuota dentro: non deve chiudere il blocco
    await frame();
    const figliDuranteFence = copia.children.length;
    const preDuranteFence = copia.querySelector('pre')?.textContent || '';

    invia('```\n\n- uno\n- due\n\n');
    await frame();
    const stessoPrimoNodo = copia.firstElementChild === primoNodo;
    const preFinale = copia.querySelector('pre');

    for (let i = 0; i < 40; i += 1) { invia(`riga ${i} della coda `); await frame(); }
    const stessoPrimoNodoDopo40 = copia.firstElementChild === primoNodo;
    const stessoPre = copia.querySelector('pre') === preFinale;

    runtime.handleRealEvent({ type: 'TextMessageEnd', messageId: mid, _sequenza: seq += 1 }, generation);
    await frame();
    return {
      primoTag, figliDuranteFence, preDuranteFence, stessoPrimoNodo, stessoPrimoNodoDopo40, stessoPre,
      testo: copia.textContent, ul: copia.querySelectorAll('ul').length, strong: copia.querySelectorAll('strong').length,
      ultimoP: copia.lastElementChild?.textContent || '',
    };
  });
  expect(result.primoTag).toBe('P');
  expect(result.figliDuranteFence).toBe(2); // il paragrafo stabile + il pre della coda (la riga vuota dentro il fence non ha spezzato niente)
  expect(result.preDuranteFence).toContain('const b = 2;');
  expect(result.stessoPrimoNodo).toBe(true);
  expect(result.stessoPrimoNodoDopo40).toBe(true);
  expect(result.stessoPre).toBe(true);
  expect(result.strong).toBe(1);
  expect(result.ul).toBe(1);
  expect(result.testo).toContain('riga 39 della coda');
  expect(result.ultimoP).toContain('riga 0 della coda');
});
