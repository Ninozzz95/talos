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

test('DISCHI-UI-03 col progetto scelto la finestra si apre su di lui, e la scheda accesa è una sola', async ({ page }) => {
  const progetto = 'C:\\lavoro\\progetto';
  await page.route('**/api/v1/workspace-browser**', async (route) => {
    const percorso = new URL(route.request().url()).searchParams.get('path') || 'C:\\';
    const corpo = rispostaDelBrowser(percorso);
    corpo.data.recommended = [{ label: 'progetto', path: progetto, kind: 'project', projectId: 'p1' }];
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(corpo) });
  });
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.goto('/');
  await page.locator('#newSessionBtn').click();
  await expect(page.locator('#sheetDialog')).toBeVisible();
  const scheda = page.locator('.workspace-chooser-shortcut[data-workspace-path]').filter({ hasText: 'progetto' });
  await expect(scheda).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('#sheetBody input').first()).toHaveValue(progetto);
  const dischi = page.locator('[data-workspace-disco]');
  await expect(dischi.nth(0)).toHaveAttribute('aria-pressed', 'false');
  // al contrario: guardare un altro disco si vede, e la scelta resta
  await dischi.nth(1).click();
  await expect(dischi.nth(1)).toHaveAttribute('aria-pressed', 'true');
  await expect(scheda).toHaveAttribute('aria-pressed', 'true');
});

test('DISCHI-UI-04 un progetto che non si apre più non lascia la finestra senza albero', async ({ page }) => {
  await page.route('**/api/v1/workspace-browser**', async (route) => {
    const percorso = new URL(route.request().url()).searchParams.get('path');
    if (percorso) return route.fulfill({ status: 404, contentType: 'application/json', body: JSON.stringify({ ok: false, error: { code: 'NOT_FOUND', message: 'sparita' } }) });
    const corpo = rispostaDelBrowser('C:\\');
    corpo.data.recommended = [{ label: 'progetto', path: 'C:\\lavoro\\sparito', kind: 'project', projectId: 'p1' }];
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(corpo) });
  });
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.goto('/');
  await page.locator('#newSessionBtn').click();
  await expect(page.locator('#sheetDialog')).toBeVisible();
  await expect(page.locator('#sheetBody')).toContainText('Users');
  await expect(page.locator('[data-workspace-selected-path]')).not.toContainText('sparito'); // non resta scelta, e non torna da sola
  await expect(page.locator('#sheetBody button', { hasText: /sparito/u })).toHaveCount(0);
});

test('DISCHI-UI-05 un disco toccato mentre il progetto si apre resta quello toccato', async ({ page }) => {
  const PROGETTO = 'C:\\lavoro\\lento';
  let libera;
  const attesa = new Promise((r) => { libera = r; });
  await page.route('**/api/v1/workspace-browser**', async (route) => {
    const percorso = new URL(route.request().url()).searchParams.get('path');
    if (percorso === PROGETTO) await attesa;
    const corpo = rispostaDelBrowser(percorso || 'C:\\');
    corpo.data.recommended = [{ label: 'lento', path: PROGETTO, kind: 'project', projectId: 'p1' }];
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(corpo) }).catch(() => {});
  });
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.goto('/');
  await page.locator('#newSessionBtn').click();
  const dischi = page.locator('[data-workspace-disco]');
  await expect(dischi).toHaveCount(2);
  await dischi.nth(1).click();
  await expect(page.locator('#sheetBody input').first()).toHaveValue('D:\\');
  libera();
  await page.waitForTimeout(400);
  await expect(page.locator('#sheetBody input').first()).toHaveValue('D:\\');
});
