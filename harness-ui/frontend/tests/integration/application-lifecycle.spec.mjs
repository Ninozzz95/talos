import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test } from '@playwright/test';

const artifacts = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../artifacts/phase-02');

test('PHASE2-APPLICATION-TEARDOWN-08 laboratory bootstrap owns one runtime lifecycle', async ({ page }, testInfo) => {
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
  page.on('response', (response) => { if (response.status() >= 400) errors.push(`${response.status()} ${response.url()}`); });
  await page.goto('/?component=ApplicationLifecycle');
  await expect(page.locator('[data-runtime-phase="ready-empty"]')).toHaveText('Pronto per una nuova sessione');
  const visible = await page.evaluate(() => {
    const surface = document.querySelector('.application-surface');
    const rect = surface.getBoundingClientRect();
    return {
      noHorizontalOverflow: document.documentElement.scrollWidth === document.documentElement.clientWidth,
      insideViewport: rect.left >= 0 && rect.right <= innerWidth && rect.top >= 0 && rect.bottom <= innerHeight,
      hitInside: surface.contains(document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2)),
    };
  });
  expect(visible).toEqual({ noHorizontalOverflow: true, insideViewport: true, hitInside: true });
  expect(errors).toEqual([]);
  await mkdir(artifacts, { recursive: true });
  await page.screenshot({ path: path.join(artifacts, `application-lifecycle-${testInfo.project.name}.png`), fullPage: true });
  const result = await page.evaluate(async () => {
    const before = window.__talosHarnessUiRuntime;
    const destroy = window.__talosHarnessDestroy;
    const first = destroy();
    const second = destroy();
    return { beforePhase: before.phase, first, second, afterPresent: Boolean(window.__talosHarnessUiRuntime) };
  });
  expect(result.beforePhase).toBe(2);
  expect(result.first).toBe(true);
  expect(result.second).toBe(false);
  expect(result.afterPresent).toBe(false);
});
