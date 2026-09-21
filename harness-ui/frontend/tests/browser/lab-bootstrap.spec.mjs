import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test } from '@playwright/test';

const artifacts = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../artifacts');

test('PHASE1-LAB-VISIBLE-01 mostra il bootstrap isolato senza errori', async ({ page }, testInfo) => {
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
  page.on('response', (response) => { if (response.status() >= 400) errors.push(`${response.status()} ${response.url()}`); });
  await page.goto('/?component=bootstrap&variant=default');
  await expect(page.getByRole('heading', { name: 'Fondazioni modulari pronte' })).toBeVisible();
  await expect(page.getByText('Laboratorio UI · non produzione')).toBeVisible();
  await expect(page.locator('html')).toHaveAttribute('data-visual-ready', 'true');
  await page.locator('#app').focus();
  await expect(page.locator('#app')).toBeFocused();
  const visible = await page.evaluate(async () => {
    await document.fonts.ready;
    const surface = document.querySelector('.foundation-surface');
    const rect = surface.getBoundingClientRect();
    const hit = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2);
    return {
      fontLoaded: document.fonts.check('16px "Instrument Sans"'),
      noHorizontalOverflow: document.documentElement.scrollWidth === document.documentElement.clientWidth,
      insideViewport: rect.left >= 0 && rect.right <= innerWidth && rect.top >= 0 && rect.bottom <= innerHeight,
      hitInsideSurface: surface.contains(hit),
    };
  });
  expect(visible).toEqual({ fontLoaded: true, noHorizontalOverflow: true, insideViewport: true, hitInsideSurface: true });
  expect(errors).toEqual([]);
  await mkdir(artifacts, { recursive: true });
  await page.screenshot({ path: path.join(artifacts, `phase-01-${testInfo.project.name}.png`), fullPage: true });
});
