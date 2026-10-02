import { expect, test } from '@playwright/test';

test('UI-DEFAULTS-FRESH: a clean profile shows the requested UI, chat and list defaults', async ({ page }) => {
  await page.goto('/');
  // owner 02/10/2026: la grandezza dell'interfaccia di serie è «Predefinita» (prima 'large')
  await expect(page.locator('#uiFontScaleSelect')).toHaveValue('default');
  await expect(page.locator('#chatFontScaleSelect')).toHaveValue('balanced');
  await expect(page.locator('#setting-uiDensitySelect')).toHaveValue('compatta');
  await expect(page.locator('html')).toHaveAttribute('data-density', 'compact');
  await expect(page.locator('html')).toHaveAttribute('data-densita', 'compatta');
});

test('UI-DEFAULTS-SAVED: reload keeps three explicit older preferences', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('talos.harness.desktop.settings.v1', JSON.stringify({version:1,appearance:{uiFontScale:'small',chatFontScale:'expanded',uiDensity:'comoda'},chat:{},workspaces:{}}));
    localStorage.setItem('talos.desktop.workspace.v2', JSON.stringify({version:2,density:'comfortable',restoreWorkspace:true,lastSession:null}));
  });
  await page.goto('/');
  await expect(page.locator('#uiFontScaleSelect')).toHaveValue('small');
  await expect(page.locator('#chatFontScaleSelect')).toHaveValue('expanded');
  await expect(page.locator('#setting-uiDensitySelect')).toHaveValue('comoda');
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-density', 'comfortable');
});
