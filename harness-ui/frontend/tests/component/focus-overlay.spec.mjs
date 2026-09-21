import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test } from '@playwright/test';

const artifacts = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../artifacts/phase-02');

test('PHASE2-OVERLAY-FOCUS-07 modal traps focus, closes on Escape and restores invoker', async ({ page }, testInfo) => {
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
  page.on('response', (response) => { if (response.status() >= 400) errors.push(`${response.status()} ${response.url()}`); });
  await page.goto('/?component=FocusOverlay');
  await page.evaluate(() => {
    const persistent = document.createElement('aside');
    persistent.dataset.preexistingInert = '';
    persistent.hidden = true;
    persistent.inert = true;
    persistent.setAttribute('aria-hidden', 'true');
    document.querySelector('#app').append(persistent);
  });
  const invoker = page.getByRole('button', { name: 'Apri dialogo' });
  await invoker.click();
  const dialog = page.getByRole('dialog', { name: 'Conferma operazione' });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole('button', { name: 'Conferma' })).toBeFocused();
  const visual = await page.evaluate(() => {
    const dialogElement = document.querySelector('[role="dialog"]');
    const surface = document.querySelector('.lab-surface');
    const rect = dialogElement.getBoundingClientRect();
    return {
      backgroundInert: surface.inert && surface.getAttribute('aria-hidden') === 'true',
      insideViewport: rect.left >= 0 && rect.right <= innerWidth && rect.top >= 0 && rect.bottom <= innerHeight,
      hitDialog: dialogElement.contains(document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2)),
      noHorizontalOverflow: document.documentElement.scrollWidth === document.documentElement.clientWidth,
    };
  });
  expect(visual).toEqual({ backgroundInert: true, insideViewport: true, hitDialog: true, noHorizontalOverflow: true });
  await mkdir(artifacts, { recursive: true });
  await page.screenshot({ path: path.join(artifacts, `focus-overlay-${testInfo.project.name}.png`), fullPage: true });
  await page.keyboard.press('Shift+Tab');
  await expect(dialog.getByRole('button', { name: 'Annulla' })).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await expect(invoker).toBeFocused();
  await expect(page.locator('.lab-surface')).not.toHaveAttribute('aria-hidden', 'true');
  const restoredBackgroundState = await page.locator('[data-preexisting-inert]').evaluate((element) => ({
    inert: element.inert,
    ariaHidden: element.getAttribute('aria-hidden'),
  }));
  expect(restoredBackgroundState).toEqual({ inert: true, ariaHidden: 'true' });
  expect(errors).toEqual([]);
});

test('PHASE2-LIVE-REGION-MODAL-21 owned live regions remain exposed while modal background is inert', async ({ page }) => {
  await page.goto('/?component=FocusOverlay');
  await page.getByRole('button', { name: 'Apri dialogo' }).click();
  const liveRegions = await page.locator('[role="status"], [role="alert"]').evaluateAll((elements) => elements.map((element) => ({
    inert: element.inert,
    ariaHidden: element.getAttribute('aria-hidden'),
  })));
  expect(liveRegions).toEqual([
    { inert: false, ariaHidden: null },
    { inert: false, ariaHidden: null },
  ]);
  await expect(page.locator('.lab-surface')).toHaveAttribute('aria-hidden', 'true');
});
