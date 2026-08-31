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
];

const outputDir = resolve(process.cwd(), 'artifacts', 'visual-audit-2026-08-31');

async function injectConversation(page, kind) {
  if (!['active', 'approval', 'long'].includes(kind)) return;
  await page.evaluate((variant) => {
    const conversation = document.querySelector('#conversation');
    conversation.replaceChildren();
    const user = document.createElement('article');
    user.className = 'message user-message';
    const userBubble = document.createElement('div');
    userBubble.className = 'message-bubble';
    userBubble.textContent = variant === 'long'
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
  } else if (kind === 'settings' || kind === 'model-lab') {
    await clickDirect('[data-open-view="settings"]');
    if (kind === 'model-lab') {
      await clickDirect('[data-settings-tab="models"]');
      await clickDirect('#modelLabHfTab');
    }
  } else if (kind === 'terminal') {
    await clickDirect('[data-mode="terminal"]');
  } else if (kind === 'capabilities') {
    await clickDirect('#manageCapabilitiesBtn');
  } else {
    await injectConversation(page, kind);
  }
  await page.waitForTimeout(250);
}

test('12-scenario visual matrix stays inside the desktop contract', async ({ browser }) => {
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
    if (kind !== 'reduced-motion') expect(metrics.bodyClass).not.toContain('reduce-motion');
    await context.close();
  }
  await writeFile(resolve(outputDir, 'index.json'), `${JSON.stringify({ generatedAt: new Date().toISOString(), scenarios: allMetrics }, null, 2)}\n`, 'utf8');
  expect(allMetrics).toHaveLength(12);
});
