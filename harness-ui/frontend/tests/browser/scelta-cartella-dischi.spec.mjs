import { expect, test } from '@playwright/test';

/*
 * DISCHI-UI-01..02 (owner 29/10/2026: «prevedi anche computer con più dischi non solo il C»). Il server dice tutti i dischi presenti
 * (`roots`, `src/workspace-browser.mjs` `elencaDischi`); la scelta della cartella li mostra in fondo alle scorciatoie quando sono più di
 * uno, e toccarne uno apre QUEL disco senza sceglierlo come progetto. Il server è finto qui: la forma della risposta è quella vera di
 * `browse()` (`root`, `path`, `parent`, `items`, `recommended`, `roots`).
 */
function rispostaDelBrowser(percorso) {
  const radice = /^D:/iu.test(percorso) ? 'D:\\' : 'C:\\';
  const items = radice === 'D:\\'
    ? [{ name: 'Progetti', path: 'D:\\Progetti', projectId: null }]
    : [{ name: 'Users', path: 'C:\\Users', projectId: null }];
  return {
    ok: true,
    data: {
      root: radice, path: percorso, parent: null, items,
      recommended: [],
      roots: [{ path: 'C:\\', label: 'C:' }, { path: 'D:\\', label: 'D:' }],
    },
    meta: { schema: 'talos.harness-ui.api.v1' },
  };
}

test('DISCHI-UI-01 con due dischi la scelta della cartella li mostra, e toccare D: apre D: senza sceglierlo', async ({ page }) => {
  const richieste = [];
  await page.route('**/api/v1/workspace-browser**', async (route) => {
    const url = new URL(route.request().url());
    const percorso = url.searchParams.get('path') || 'C:\\';
    richieste.push(percorso);
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(rispostaDelBrowser(percorso)) });
  });
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.goto('/');
  await page.locator('#newSessionBtn').click();
  await expect(page.locator('#sheetDialog')).toBeVisible();
  const dischi = page.locator('[data-workspace-disco]');
  await expect(dischi).toHaveCount(2);
  await expect(dischi.nth(0)).toContainText('C:');
  await expect(dischi.nth(1)).toContainText('D:');
  await expect(dischi.nth(0)).toHaveAttribute('aria-pressed', 'true');
  await expect(dischi.nth(1)).toHaveAttribute('aria-pressed', 'false');

  await dischi.nth(1).click();
  await expect.poll(() => richieste.at(-1)).toBe('D:\\');
  await expect(dischi.nth(1)).toHaveAttribute('aria-pressed', 'true');
  await expect(dischi.nth(0)).toHaveAttribute('aria-pressed', 'false');
  await expect(page.locator('#sheetBody')).toContainText('Progetti');
  // un disco intero non diventa il progetto: la conferma resta senza cartella scelta
  await expect(page.locator('#workspaceChooserSubmit')).toHaveText('Scegli una cartella');
  await expect(page.locator('[data-workspace-selected-path]')).not.toHaveText('D:\\');
  await page.screenshot({ path: 'test-results/scelta-cartella-dischi.png' });
});

test('DISCHI-UI-02 al contrario: con un disco solo nessun pulsante dei dischi', async ({ page }) => {
  await page.route('**/api/v1/workspace-browser**', async (route) => {
    const corpo = rispostaDelBrowser('C:\\');
    corpo.data.roots = [{ path: 'C:\\', label: 'C:' }];
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(corpo) });
  });
  await page.goto('/');
  await page.locator('#newSessionBtn').click();
  await expect(page.locator('#sheetDialog')).toBeVisible();
  await expect(page.locator('#sheetBody')).toContainText('Users');
  await expect(page.locator('[data-workspace-disco]')).toHaveCount(0);
  // 29/10/2026: con poche cartelle le righe dell'albero si allungavano fino a 89 px (griglia che stira); restano alla loro altezza
  const altezze = await page.locator('.workspace-chooser-tree-row').evaluateAll((righe) => righe.map((r) => r.getBoundingClientRect().height));
  expect(altezze.length).toBeGreaterThan(0);
  for (const h of altezze) expect(h).toBeLessThanOrEqual(40);
});
