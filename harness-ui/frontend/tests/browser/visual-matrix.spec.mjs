import { expect, test } from '@playwright/test';
import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const scenarios = [
  ['empty-1024x768', { width: 1024, height: 768 }, 'empty'],
  ['empty-1440x900', { width: 1440, height: 900 }, 'empty'],
  ['empty-2560x1080', { width: 2560, height: 1080 }, 'empty'],
  ['active-chat-1440x900', { width: 1440, height: 900 }, 'active'],
  ['approval-pending-1440x900', { width: 1440, height: 900 }, 'approval'],
  ['long-content-1280x800', { width: 1280, height: 800 }, 'long'],
  ['dashboard-1440x900', { width: 1440, height: 900 }, 'dashboard'],
  ['settings-1440x900', { width: 1440, height: 900 }, 'settings'],
  ['model-lab-1440x900', { width: 1440, height: 900 }, 'model-lab'],
  ['terminal-1440x900', { width: 1440, height: 900 }, 'terminal'],
  ['capabilities-1440x900', { width: 1440, height: 900 }, 'capabilities'],
  ['reduced-motion-1440x900', { width: 1440, height: 900 }, 'reduced-motion'],
  ['settings-chat-1440x900', { width: 1440, height: 900 }, 'settings-chat'],
  ['chat-standard-1920x1080', { width: 1920, height: 1080 }, 'chat-standard'],
  ['chat-full-width-1920x1080', { width: 1920, height: 1080 }, 'chat-full-width'],
  ['inspector-wide-1920x1080', { width: 1920, height: 1080 }, 'inspector-wide'],
  ['inspector-clamped-1200x900', { width: 1200, height: 900 }, 'inspector-clamped'],
  ['tool-lifecycle-running-1440x900', { width: 1440, height: 900 }, 'tool-running'],
  ['tool-lifecycle-complete-1440x900', { width: 1440, height: 900 }, 'tool-complete'],
  ['waiting-loader-1440x900', { width: 1440, height: 900 }, 'waiting-loader'],
  ['composer-standard-1440x900', { width: 1440, height: 900 }, 'composer-standard'],
  ['composer-classic-1440x900', { width: 1440, height: 900 }, 'composer-classic'],
  ['composer-compact-1440x900', { width: 1440, height: 900 }, 'composer-compact'],
  ['compact-390x844', { width: 390, height: 844 }, 'empty'],
];

const outputDir = resolve(process.cwd(), 'artifacts', 'visual-audit-2026-09-01');

async function injectConversation(page, kind) {
  if (!['active', 'approval', 'long', 'full-width', 'chat-standard'].includes(kind)) return;
  await page.evaluate((variant) => {
    const conversation = document.querySelector('#conversation');
    conversation.replaceChildren();
    const widthComparison = variant === 'full-width' || variant === 'chat-standard';
    if (widthComparison) {
      const shortUser = document.createElement('article');
      shortUser.className = 'message user-message';
      shortUser.innerHTML = '<div class="message-bubble">Ci sei?</div>';
      conversation.appendChild(shortUser);
    }
    const user = document.createElement('article');
    user.className = 'message user-message';
    const userBubble = document.createElement('div');
    userBubble.className = 'message-bubble';
    userBubble.textContent = widthComparison
      ? 'Analizza l’intero workspace, confronta ogni dipendenza, verifica i contratti pubblici e prepara una risposta completa. Includi i rischi di regressione, le prove sintetiche, le verifiche reali e le fonti primarie consultate. Concludi con una consegna esplicita che renda misurabile la larghezza massima della bolla utente senza cambiare il composer.'
      : variant === 'long'
      ? 'Verifica una risposta con percorsi e codice molto lunghi.'
      : 'Rifinisci la superficie desktop e verifica ogni stato operativo.';
    user.appendChild(userBubble);
    const assistant = document.createElement('article');
    assistant.className = 'message assistant-message';
    const copy = document.createElement('div');
    copy.className = 'assistant-copy';
    const paragraph = document.createElement('p');
    paragraph.textContent = variant === 'long'
      ? 'Percorso estremamente lungo senza spazi '.repeat(80)
      : 'La superficie è pronta per la verifica visuale e funzionale.';
    copy.appendChild(paragraph);
    if (variant === 'long') {
      const pre = document.createElement('pre');
      const code = document.createElement('code');
      code.textContent = `const extremelyLongIdentifier = "${'x'.repeat(240)}";`;
      pre.appendChild(code);
      copy.appendChild(pre);
    }
    assistant.appendChild(copy);
    conversation.append(user, assistant);
    if (variant === 'approval') {
      const approval = document.createElement('section');
      approval.className = 'approval-card';
      const approvalIcon = document.createElement('span');
      approvalIcon.className = 'approval-icon';
      approvalIcon.textContent = '⏸';
      const approvalCopy = document.createElement('div');
      approvalCopy.className = 'assistant-copy';
      approvalCopy.textContent = 'Conferma richiesta: il prossimo passaggio attende il tuo consenso.';
      const approvalActions = document.createElement('div');
      approvalActions.className = 'sheet-actions';
      approvalActions.append(document.createElement('button'), document.createElement('button'));
      approval.append(approvalIcon, approvalCopy, approvalActions);
      conversation.appendChild(approval);
    }
  }, kind);
}

async function applyScenario(page, kind) {
  const clickDirect = async (selector) => page.locator(selector).dispatchEvent('click');
  if (kind === 'dashboard') {
    await clickDirect('[data-mode="dashboard"]');
  } else if (kind === 'settings' || kind === 'model-lab' || kind === 'settings-chat') {
    await clickDirect('[data-open-view="settings"]');
    if (kind === 'model-lab') {
      await clickDirect('[data-settings-tab="models"]');
      await clickDirect('#modelLabHfTab');
    } else if (kind === 'settings-chat') {
      await clickDirect('[data-settings-tab="chat"]');
    }
  } else if (kind === 'chat-standard') {
    await injectConversation(page, 'chat-standard');
  } else if (kind === 'chat-full-width') {
    await clickDirect('[data-open-view="settings"]');
    await clickDirect('[data-settings-tab="chat"]');
    await page.locator('#chatFullWidthToggle').check();
    await clickDirect('[data-mode="chat"]');
    await injectConversation(page, 'full-width');
  } else if (kind === 'inspector-wide' || kind === 'inspector-clamped') {
    await page.evaluate(() => localStorage.setItem('talos-harness-panel-widths', JSON.stringify({ sessions: 292, inspector: 680 })));
    await page.reload();
    await injectConversation(page, 'active');
  } else if (kind === 'terminal') {
    await clickDirect('[data-mode="terminal"]');
  } else if (kind === 'capabilities') {
    await clickDirect('#manageCapabilitiesBtn');
  } else if (kind === 'tool-running' || kind === 'tool-complete') {
    await page.evaluate((variant) => {
      const runtime = window.__talosHarnessUiRuntime;
      const session = runtime.realSessionState;
      document.querySelector('#conversation')?.replaceChildren();
      session.sequenzeViste.clear();
      session.batchAttivo = null;
      session.ultimoBatchChiuso = null;
      session.toolCallNomi.clear();
      const total = variant === 'tool-complete' ? 5 : 1;
      for (let index = 0; index < total; index += 1) {
        const id = `visual-read-${index}`;
        const sequence = 99000 + index * 3;
        runtime.handleRealEvent({ type: 'ToolCallStart', toolCallId: id, toolCallName: 'leggi', _sequenza: sequence }, session.generation);
        runtime.handleRealEvent({ type: 'ToolCallArgs', toolCallId: id, delta: JSON.stringify({ percorso: `src/components/feature-${index}.js` }), _sequenza: sequence + 1 }, session.generation);
        if (variant === 'tool-complete') runtime.handleRealEvent({ type: 'ToolCallResult', toolCallId: id, content: 'ok', _sequenza: sequence + 2 }, session.generation);
      }
    }, kind);
    await page.locator('.tool-batch-summary').click();
  } else if (kind === 'waiting-loader') {
    await page.route('**/api/v1/sessions', async (route) => {
      if (route.request().method() !== 'POST') { await route.continue(); return; }
      await new Promise((resolve) => setTimeout(resolve, 1_500));
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ ok: true, data: { sessionId: 'visual-loader-session' }, meta: { schema: 'talos.harness-ui.api.v1' } }),
      });
    });
    await page.evaluate(() => {
      void window.__talosHarnessUiRuntime.startRealSession({ id: 'visual-loader-task', nome: 'Attesa risposta', consegna: 'Verifica il loader TALOS.' });
    });
    await expect(page.locator('.real-waiting-note .talos-line-loader')).toBeVisible();
  } else if (kind.startsWith('composer-')) {
    await clickDirect('[data-open-view="settings"]');
    await clickDirect('[data-settings-tab="appearance"]');
    await page.locator('#composerShapeSelect').selectOption(kind.slice('composer-'.length));
    await clickDirect('[data-mode="chat"]');
    await injectConversation(page, 'active');
  } else {
    await injectConversation(page, kind);
  }
  await page.waitForTimeout(250);
}

test('@visual 24-scenario visual matrix stays inside the desktop contract', async ({ browser }) => {
  test.setTimeout(120_000);
  await mkdir(outputDir, { recursive: true });
  const allMetrics = [];
  for (const [name, viewport, kind] of scenarios) {
    const context = await browser.newContext({
      viewport,
      reducedMotion: kind === 'reduced-motion' ? 'reduce' : 'no-preference',
    });
    const page = await context.newPage();
    const consoleErrors = [];
    page.on('console', (message) => {
      if (message.type() === 'error') consoleErrors.push(message.text());
    });
    page.on('pageerror', (error) => consoleErrors.push(String(error)));
    await page.goto('/');
    await applyScenario(page, kind);
    const metrics = await page.evaluate(() => ({
      activeView: document.querySelector('.view-pane.active')?.dataset.view || null,
      page: {
        scrollWidth: document.documentElement.scrollWidth,
        clientWidth: document.documentElement.clientWidth,
        scrollHeight: document.documentElement.scrollHeight,
        clientHeight: document.documentElement.clientHeight,
      },
      visibleDemoBadges: [...document.querySelectorAll('.demo-surface-badge')]
        .filter((element) => element.getBoundingClientRect().width > 0)
        .map((element) => element.textContent.trim()),
      interactiveCount: [...document.querySelectorAll('button, a[href], input, select, textarea')]
        .filter((element) => element.getBoundingClientRect().width > 0).length,
      bodyClass: document.body.className,
      composerGeometry: (() => {
        const composer = document.querySelector('.composer');
        if (!composer || composer.getBoundingClientRect().width === 0) return null;
        const style = getComputedStyle(composer);
        const rect = composer.getBoundingClientRect();
        return { width: rect.width, height: rect.height, minHeight: style.minHeight, borderRadius: style.borderRadius, padding: style.padding };
      })(),
      toolStates: [...document.querySelectorAll('.real-tool-note[data-tool-state]')].map((element) => element.dataset.toolState),
      waitingLoaderAnimations: document.querySelector('.talos-line-loader')?.getAnimations({ subtree: true }).map((animation) => animation.playState) ?? [],
    }));
    const screenshotPath = resolve(outputDir, `${name}.png`);
    await page.screenshot({ path: screenshotPath, fullPage: true });
    const screenshotSha256 = createHash('sha256').update(await (await import('node:fs/promises')).readFile(screenshotPath)).digest('hex');
    const expectedCspWarnings = consoleErrors.filter((message) => message.includes("Content Security Policy directive 'style-src 'self'"));
    const unexpectedConsoleErrors = consoleErrors.filter((message) => !message.includes("Content Security Policy directive 'style-src 'self'"));
    const record = { scenario: name, viewport, ...metrics, consoleErrors, expectedCspWarnings, unexpectedConsoleErrors, screenshot: screenshotPath, screenshotSha256 };
    await writeFile(resolve(outputDir, `${name}.json`), `${JSON.stringify(record, null, 2)}\n`, 'utf8');
    allMetrics.push(record);
    expect(unexpectedConsoleErrors, `${name} unexpected console/page errors`).toEqual([]);
    expect(metrics.page.scrollWidth, `${name} page horizontal overflow`).toBeLessThanOrEqual(metrics.page.clientWidth + 1);
    expect(metrics.interactiveCount, `${name} interactive surface`).toBeGreaterThan(0);
    if (kind === 'chat-full-width' || kind === 'chat-standard') expect(metrics.activeView, `${name} active chat view`).toBe('chat');
    if (kind !== 'reduced-motion') expect(metrics.bodyClass).not.toContain('reduce-motion');
    await context.close();
  }
  const composerStandard = allMetrics.find((item) => item.scenario === 'chat-standard-1920x1080')?.composerGeometry;
  const composerFullWidth = allMetrics.find((item) => item.scenario === 'chat-full-width-1920x1080')?.composerGeometry;
  expect(composerFullWidth, 'full width must preserve the original composer geometry').toEqual(composerStandard);
  for (const forma of ['standard', 'classic', 'compact']) {
    const geometry = allMetrics.find((item) => item.scenario === `composer-${forma}-1440x900`)?.composerGeometry;
    expect(geometry?.height, `${forma} must preserve the mockup composer height`).toBe(116);
  }
  await writeFile(resolve(outputDir, 'index.json'), `${JSON.stringify({ generatedAt: new Date().toISOString(), scenarios: allMetrics }, null, 2)}\n`, 'utf8');
  expect(allMetrics).toHaveLength(24);
});
