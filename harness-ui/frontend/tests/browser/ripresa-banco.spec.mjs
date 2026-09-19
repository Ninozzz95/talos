import { test, expect } from '@playwright/test';

test('RIPRESA-R0-SANDBOX — il banco non inventa errori in una cornice senza codice prodotto', async ({ page }) => {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  // Navigazione a documento minimo servito dal routing: nessun codice TALOS.
  await page.route('**/ripresa-empty.html', route => route.fulfill({
    contentType: 'text/html',
    body: '<!doctype html><title>Banco</title><iframe title="Isolata" sandbox="allow-scripts" srcdoc="<!doctype html><p>Pronta</p>"></iframe>',
  }));
  await page.goto('/ripresa-empty.html');
  await expect(page.frameLocator('iframe').getByText('Pronta')).toBeVisible();
  expect(errors).toEqual([]);
});
