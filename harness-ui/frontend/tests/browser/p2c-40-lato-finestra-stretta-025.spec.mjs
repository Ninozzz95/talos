import { expect, test } from '@playwright/test';

import { bancoBlocco, voceDelMenu } from './aiuto-p2c-025.mjs';

/*
 * P2-C della PC 0.2.5, riga 40 (decisione 401, limite noto 12): su una finestra stretta «Chiudi» della vista a lato chiude anche il pannello
 * che «Apri a lato» aveva aperto sopra la chat; su una finestra larga la colonna resta com'era.
 */

test.describe('riga 40 · «Apri a lato» su una finestra stretta', () => {
  test('P2C-40 finestra stretta: «Chiudi» della vista a lato chiude anche il pannello che si era aperto sopra la chat', async ({ page }) => {
    await page.setViewportSize({ width: 1100, height: 800 });
    await bancoBlocco(page, { invio: 'ok' });
    await expect(page.locator('#inspectorPanel')).not.toHaveClass(/\bopen\b/u);
    await voceDelMenu(page, page.locator('#conversation .gu').first(), 'Apri a lato');
    const lato = page.locator('#inspectorPanel > .gu-lato');
    await expect(lato).toBeVisible();
    await expect(page.locator('#inspectorPanel')).toHaveClass(/\bopen\b/u);
    await lato.locator('.gu-lato__testa button', { hasText: 'Chiudi' }).click();
    await expect(page.locator('.gu-lato')).toHaveCount(0);
    await expect(page.locator('#inspectorPanel'), 'il pannello non resta sopra la chat').not.toHaveClass(/\bopen\b/u);
    await expect(page.locator('#overlayBackdrop')).not.toHaveClass(/\bshow\b/u);
    expect(page.errori).toEqual([]);
  });

  test('P2C-40 al contrario: finestra larga, la colonna di destra resta al suo posto dopo «Chiudi»', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 860 });
    await bancoBlocco(page, { invio: 'ok' });
    await voceDelMenu(page, page.locator('#conversation .gu').first(), 'Apri a lato');
    const lato = page.locator('#inspectorPanel > .gu-lato');
    await expect(lato).toBeVisible();
    await lato.locator('.gu-lato__testa button', { hasText: 'Chiudi' }).click();
    await expect(page.locator('.gu-lato')).toHaveCount(0);
    await expect(page.locator('#inspectorPanel')).toBeVisible();
    expect(await page.evaluate(() => document.querySelector('.inspector-collapsed')), 'la colonna resta aperta').toBe(null);
    expect(page.errori).toEqual([]);
  });
});

