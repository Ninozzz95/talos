import { expect, test } from '@playwright/test';

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

test('desktop primary controls meet the 36 px hit-area gate', async ({ page }) => {
  await page.goto('/');
  const sizes = await page.locator('.topbar-right .icon-btn, #queueToggle').evaluateAll((elements) => elements.map((element) => {
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
