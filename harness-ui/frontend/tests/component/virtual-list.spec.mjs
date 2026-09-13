import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test } from '@playwright/test';

const artifacts = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../artifacts/phase-02');

test('PHASE2-VIRTUAL-IDENTITY-06 large list keeps mounted rows bounded', async ({ page }, testInfo) => {
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
  page.on('response', (response) => { if (response.status() >= 400) errors.push(`${response.status()} ${response.url()}`); });
  await page.goto('/?component=VirtualList&variant=large');
  const list = page.locator('[data-component="VirtualList"]');
  await expect(list).toBeVisible();
  const mounted = await list.locator('[data-virtual-row]').count();
  expect(mounted).toBeGreaterThan(5);
  expect(mounted).toBeLessThanOrEqual(40);
  await expect(list.locator('[data-virtual-row]').first()).toContainText('Item 0');
  await list.locator('[data-virtual-scroll]').evaluate((node) => {
    node.scrollTop = node.scrollHeight;
    node.dispatchEvent(new Event('scroll'));
  });
  await expect(list.locator('[data-virtual-row]').last()).toContainText('Item 9999');
  expect(await list.locator('[data-virtual-row]').count()).toBeLessThanOrEqual(40);
  const visual = await page.evaluate(() => {
    const viewport = document.querySelector('[data-virtual-scroll]');
    const rows = [...document.querySelectorAll('[data-virtual-row]')];
    const rect = viewport.getBoundingClientRect();
    return {
      noHorizontalOverflow: document.documentElement.scrollWidth === document.documentElement.clientWidth,
      viewportVisible: rect.top >= 0 && rect.bottom <= innerHeight && rect.width > 300,
      boundedDom: rows.length <= 40,
      hitInside: viewport.contains(document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2)),
    };
  });
  expect(visual).toEqual({ noHorizontalOverflow: true, viewportVisible: true, boundedDom: true, hitInside: true });
  expect(errors).toEqual([]);
  await mkdir(artifacts, { recursive: true });
  await page.screenshot({ path: path.join(artifacts, `virtual-list-${testInfo.project.name}.png`), fullPage: true });
});
