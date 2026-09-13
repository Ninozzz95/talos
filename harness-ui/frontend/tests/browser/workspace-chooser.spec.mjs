import { expect, test } from '@playwright/test';

const root = 'C:\\';
const project = 'C:\\Users\\esempio\\Desktop\\projects\\AVM-harness-desktop';
const desktop = 'C:\\Users\\esempio\\Desktop';

function envelope(data) {
  return { ok: true, data, meta: { schema: 'talos.harness-ui.api.v1' } };
}

async function mockWorkspaceBrowser(page) {
  await page.route('**/api/v1/workspace-browser**', async (route) => {
    const url = new URL(route.request().url());
    const path = url.searchParams.get('path') || root;
    const items = path === root
      ? [{ name: 'Users', path: 'C:\\Users', projectId: null }, { name: 'Windows', path: 'C:\\Windows', projectId: null }]
      : path === desktop
        ? [{ name: 'projects', path: `${desktop}\\projects`, projectId: null }]
        : [];
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(envelope({
        root,
        path,
        parent: path === root ? null : root,
        items,
        recommended: [
          { label: 'AVM-harness-desktop', path: project, kind: 'project', projectId: 'default' },
          { label: 'Desktop', path: desktop, kind: 'known', projectId: null },
        ],
      })),
    });
  });
}

test.beforeEach(async ({ page }) => {
  await mockWorkspaceBrowser(page);
  await page.goto('/');
  await page.locator('#newSessionBtn').click();
});

test('WORKSPACE-CHOOSER-DIALOG-09 — apre una workbench ampia, semantica e senza picker legacy visibile', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  const dialog = page.locator('#sheetDialog');
  await expect(dialog).toHaveClass(/sheet-dialog--new-session/);
  await expect(page.locator('#workspaceChooser')).toBeVisible();
  await expect(page.getByRole('tree', { name: 'Cartelle del computer' })).toBeVisible();
  await expect(page.getByRole('treeitem', { name: 'Users' })).toBeVisible();
  await expect(page.getByRole('button', { name: /Desktop/ })).toBeVisible();
  await expect(page.locator('#customTaskCartella:visible, #customTaskCartellaLibera:visible')).toHaveCount(0);
  const box = await dialog.boundingBox();
  expect(box.width).toBeGreaterThan(1050);
  expect(box.height).toBeGreaterThan(650);
  expect(box.x).toBeGreaterThanOrEqual(12);
  expect(box.x + box.width).toBeLessThanOrEqual(1428);
});

test('WORKSPACE-CHOOSER-PROJECT-11 — il progetto corrente resta pronto senza configurazione manuale', async ({ page }) => {
  await expect(page.locator('[data-workspace-selected-path]')).toHaveText(project);
  await expect(page.locator('#workspaceChooserSubmit')).toBeEnabled();
  await expect(page.locator('#workspaceChooserSubmit')).toContainText('AVM-harness-desktop');
});

test('WORKSPACE-CHOOSER-RECOMMENDED-06 — una scorciatoia aggiorna lo stesso albero e la selezione in tempo reale', async ({ page }) => {
  await page.getByRole('button', { name: /Desktop/ }).click();
  await expect(page.locator('#workspaceChooserPath')).toHaveValue(desktop);
  await expect(page.getByRole('treeitem', { name: 'projects' })).toBeVisible();
  await expect(page.locator('[data-workspace-selected-path]')).toHaveText(desktop);
});

test('WORKSPACE-CHOOSER-INVERSE-19 — cartella arbitraria non eleva da sola i permessi', async ({ page }) => {
  await page.getByRole('treeitem', { name: 'Users' }).click();
  await expect(page.locator('#workspaceChooserSubmit')).toBeDisabled();
  await expect(page.locator('[data-workspace-policy-gate]')).toContainText('Full access');
  await expect(page.locator('[data-workspace-permission="Workspace write"]')).toHaveAttribute('aria-pressed', 'true');
  await page.locator('[data-workspace-permission="Full access"]').click();
  await expect(page.locator('#workspaceChooserSubmit')).toBeEnabled();
});

test('WORKSPACE-CHOOSER-KEYBOARD-08 — focus e selezione restano distinti e la tastiera governa il tree', async ({ page }) => {
  const users = page.getByRole('treeitem', { name: 'Users' });
  await users.focus();
  await expect(users).toBeFocused();
  await expect(users).toHaveAttribute('aria-selected', 'false');
  await users.press('Enter');
  await expect(users).toHaveAttribute('aria-selected', 'true');
  await expect(page.locator('[data-workspace-selected-path]')).toHaveText('C:\\Users');
  await users.press('ArrowDown');
  await expect(page.getByRole('treeitem', { name: 'Windows' })).toBeFocused();
});

test('WORKSPACE-CHOOSER-NO-MUTATION-17 — il chooser non espone azioni distruttive', async ({ page }) => {
  const chooser = page.locator('#workspaceChooser');
  await expect(chooser.getByText(/Elimina|Rinomina|Allega|Sposta/i)).toHaveCount(0);
  await expect(chooser.locator('[draggable="true"], [data-file-action], [data-context-menu]')).toHaveCount(0);
});

test('WORKSPACE-CHOOSER-SUBMIT-10 — una cartella allowlisted conserva cartellaId e non invia il percorso libero', async ({ page }) => {
  let body = null;
  await page.route('**/api/v1/sessions/custom', async (route) => {
    body = route.request().postDataJSON();
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(envelope({ sessionId: 'session-workspace-chooser' })) });
  });
  await page.route('**/api/v1/sessions/session-workspace-chooser/events', async (route) => route.fulfill({ status: 200, contentType: 'text/event-stream', body: '' }));
  await page.locator('#workspaceChooserSubmit').click();
  await page.locator('#composerInput').fill('Controlla la cartella scelta');
  await page.locator('#composerForm').evaluate((form) => form.requestSubmit());
  await expect.poll(() => body).not.toBeNull();
  expect(body.cartellaId).toBe('default');
  expect(body).not.toHaveProperty('cartellaLibera');
  expect(body.permessi).toBe('Workspace write');
});

test('WORKSPACE-CHOOSER-CANCEL-12 — annullare non persiste una policy incompleta', async ({ page }) => {
  await page.locator('[data-workspace-permission="Full access"]').click();
  await page.getByRole('button', { name: 'Annulla' }).click();
  await expect(page.locator('#sheetDialog')).not.toBeVisible();
  await page.locator('#newSessionBtn').click();
  await expect(page.locator('[data-workspace-permission="Workspace write"]')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('[data-workspace-permission="Full access"]')).toHaveAttribute('aria-pressed', 'false');
});

test('WORKSPACE-CHOOSER-RACE-14 — una risposta lenta non sovrascrive la scelta più recente', async ({ page }) => {
  await page.unroute('**/api/v1/workspace-browser**');
  await page.route('**/api/v1/workspace-browser**', async (route) => {
    const url = new URL(route.request().url());
    const path = url.searchParams.get('path') || root;
    if (path === desktop) await new Promise((resolve) => setTimeout(resolve, 180));
    const items = path === root ? [{ name: 'Users', path: 'C:\\Users', projectId: null }] : [];
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(envelope({
      root, path, parent: path === root ? null : root, items,
      recommended: [
        { label: 'AVM-harness-desktop', path: project, kind: 'project', projectId: 'default' },
        { label: 'Desktop', path: desktop, kind: 'known', projectId: null },
      ],
    })) });
  });
  await page.reload();
  await page.locator('#newSessionBtn').click();
  await page.getByRole('button', { name: /Desktop/ }).click();
  await page.locator('.workspace-chooser-shortcut').filter({ hasText: 'AVM-harness-desktop' }).click();
  await expect(page.locator('[data-workspace-selected-path]')).toHaveText(project);
  await expect(page.locator('#workspaceChooserPath')).toHaveValue(project);
  await page.waitForTimeout(220);
  await expect(page.locator('[data-workspace-selected-path]')).toHaveText(project);
});

test('WORKSPACE-CHOOSER-PENDING-22 — una navigazione in corso non può inviare la selezione precedente', async ({ page }) => {
  await page.unroute('**/api/v1/workspace-browser**');
  let desktopRequestedResolve;
  const desktopRequested = new Promise((resolve) => { desktopRequestedResolve = resolve; });
  let releaseDesktopResolve;
  const releaseDesktop = new Promise((resolve) => { releaseDesktopResolve = resolve; });
  await page.route('**/api/v1/workspace-browser**', async (route) => {
    const url = new URL(route.request().url());
    const path = url.searchParams.get('path') || root;
    if (path === desktop) {
      desktopRequestedResolve();
      await releaseDesktop;
    }
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(envelope({
      root, path, parent: path === root ? null : root, items: [],
      recommended: [
        { label: 'AVM-harness-desktop', path: project, kind: 'project', projectId: 'default' },
        { label: 'Desktop', path: desktop, kind: 'known', projectId: null },
      ],
    })) });
  });
  await page.reload();
  await page.locator('#newSessionBtn').click();
  await page.getByRole('button', { name: /Desktop/ }).click();
  await desktopRequested;

  const submitDisabled = await page.locator('#workspaceChooserSubmit').isDisabled();
  const selectedDuringBrowse = await page.locator('[data-workspace-selected-path]').textContent();
  await page.locator('#workspaceChooser').evaluate((form) => form.requestSubmit());
  const dialogStillOpen = await page.locator('#sheetDialog').evaluate((dialog) => dialog.open);
  releaseDesktopResolve();
  await expect(page.locator('[data-workspace-selected-path]')).toHaveText(desktop);

  expect(submitDisabled).toBe(true);
  expect(selectedDuringBrowse).not.toBe(project);
  expect(dialogStillOpen).toBe(true);
});

test('WORKSPACE-CHOOSER-TREE-23 — ArrowRight, ArrowLeft e chevron rispettano la gerarchia del tree', async ({ page }) => {
  const current = page.getByRole('treeitem', { name: 'C:' });
  const users = page.getByRole('treeitem', { name: 'Users' });
  await current.focus();
  await current.press('ArrowRight');
  await expect(users).toBeFocused();
  await users.press('ArrowLeft');
  await expect(current).toBeFocused();
  await users.locator('.workspace-chooser-tree-toggle').click();
  await expect(page.locator('#workspaceChooserPath')).toHaveValue('C:\\Users');
  await expect(page.locator('[data-workspace-selected-path]')).toHaveText('C:\\Users');
});

test('WORKSPACE-CHOOSER-MODAL-24 — Tab e Shift+Tab restano nel foglio Nuova sessione', async ({ page }) => {
  const close = page.locator('#closeSheet');
  const submit = page.locator('#workspaceChooserSubmit');
  await expect(submit).toBeEnabled();
  await close.focus();
  await close.press('Shift+Tab');
  await expect(submit).toBeFocused();
  await submit.press('Tab');
  await expect(close).toBeFocused();
});

test('WORKSPACE-CHOOSER-ESCAPE-25 — Escape chiude prima il picker annidato e poi il foglio', async ({ page }) => {
  const triggers = page.locator('#workspaceChooser .model-picker-trigger');
  const panels = page.locator('#workspaceChooser .model-picker-panel');
  const searches = page.locator('#workspaceChooser .model-picker-search input');
  await expect(triggers).toHaveCount(2);

  for (const index of [0, 1]) {
    await triggers.nth(index).click();
    await expect(panels.nth(index)).toBeVisible();
    await searches.nth(index).press('Escape');
    await expect(panels.nth(index)).toBeHidden();
    await expect(triggers.nth(index)).toBeFocused();
    await expect(page.locator('#sheetDialog')).toBeVisible();
  }

  await page.locator('#workspaceChooser').press('Escape');
  await expect(page.locator('#sheetDialog')).not.toBeVisible();
});

test('WORKSPACE-CHOOSER-ERROR-15 — un errore resta naturale e offre ripresa e Doctor', async ({ page }) => {
  await page.unroute('**/api/v1/workspace-browser**');
  await page.route('**/api/v1/workspace-browser**', async (route) => route.fulfill({
    status: 422,
    contentType: 'application/json',
    body: JSON.stringify({ ok: false, error: { code: 'WORKSPACE_NOT_AVAILABLE', message: 'Cartella non disponibile' }, meta: { schema: 'talos.harness-ui.api.v1' } }),
  }));
  await page.reload();
  await page.locator('#newSessionBtn').click();
  await expect(page.locator('.workspace-chooser-tree-state')).toContainText(/cartella|Doctor/i);
  await expect(page.getByRole('button', { name: 'Riprova' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Apri Doctor' })).toBeVisible();
  await expect(page.locator('#workspaceChooserSubmit')).toBeDisabled();
});

test('WORKSPACE-CHOOSER-DIALOG-09 — 1280 e 1024 restano contenuti nel viewport senza overflow pagina', async ({ page }) => {
  for (const viewport of [{ width: 1280, height: 800 }, { width: 1024, height: 800 }]) {
    await page.setViewportSize(viewport);
    const dialog = page.locator('#sheetDialog');
    const box = await dialog.boundingBox();
    expect(box.x).toBeGreaterThanOrEqual(10);
    expect(box.x + box.width).toBeLessThanOrEqual(viewport.width - 10);
    expect(box.y).toBeGreaterThanOrEqual(10);
    expect(box.y + box.height).toBeLessThanOrEqual(viewport.height - 10);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  }
});

test('WORKSPACE-CHOOSER-REDUCED-MOTION-16 — il chooser rispetta reduced motion', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const transition = await page.locator('.workspace-chooser-shortcut').first().evaluate((element) => getComputedStyle(element).transitionDuration);
  expect(transition.split(',').every((value) => Number.parseFloat(value) <= 0.001)).toBe(true);
});

test('MODAL-RESIZE-PERSIST-01 — la diagonale salva entrambe le dimensioni per Nuova sessione', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  const dialog = page.locator('#sheetDialog');
  const handle = dialog.locator('[data-dialog-resize="both"]');
  await expect(handle).toBeVisible();
  const before = await dialog.boundingBox();
  const grip = await handle.boundingBox();
  await page.mouse.move(grip.x + grip.width / 2, grip.y + grip.height / 2);
  await page.mouse.down();
  await page.mouse.move(grip.x + grip.width / 2 - 90, grip.y + grip.height / 2 - 70, { steps: 6 });
  await page.mouse.up();
  const resized = await dialog.boundingBox();
  expect(resized.width).toBeLessThan(before.width - 50);
  expect(resized.height).toBeLessThan(before.height - 40);

  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('talos-harness-modal-sizes-v1') || '{}'));
  expect(saved['sheet:new-session'].width).toBeCloseTo(resized.width, 0);
  expect(saved['sheet:new-session'].height).toBeCloseTo(resized.height, 0);

  await page.locator('#closeSheet').click();
  await page.reload();
  await page.locator('#newSessionBtn').click();
  await page.locator('#sheetDialog').evaluate((element) => Promise.all(element.getAnimations().map((animation) => animation.finished)));
  const restored = await page.locator('#sheetDialog').boundingBox();
  expect(restored.width).toBeCloseTo(resized.width, 0);
  expect(restored.height).toBeCloseTo(resized.height, 0);
});

test('MODAL-RESIZE-ISOLATION-02 — Modello e Permessi non condividono la stessa misura', async ({ page }) => {
  await page.evaluate(() => localStorage.setItem('talos-harness-modal-sizes-v1', JSON.stringify({
    'sheet:model': { width: 640, height: 480 },
    'sheet:permissions': { width: 780, height: 620 },
  })));
  await page.locator('#closeSheet').click();
  await page.locator('[data-open-sheet="model"]').first().click();
  await page.locator('#sheetDialog').evaluate((element) => Promise.all(element.getAnimations().map((animation) => animation.finished)));
  let box = await page.locator('#sheetDialog').boundingBox();
  expect(box.width).toBeCloseTo(640, 0);
  expect(box.height).toBeCloseTo(480, 0);
  await page.locator('#closeSheet').click();
  await page.locator('[data-open-sheet="permissions"]').first().click();
  await page.locator('#sheetDialog').evaluate((element) => Promise.all(element.getAnimations().map((animation) => animation.finished)));
  box = await page.locator('#sheetDialog').boundingBox();
  expect(box.width).toBeCloseTo(780, 0);
  expect(box.height).toBeCloseTo(620, 0);
});

test('MODAL-RESIZE-AXES-03 — destra cambia solo larghezza e sotto cambia solo altezza', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  const dialog = page.locator('#sheetDialog');
  await dialog.evaluate((element) => Promise.all(element.getAnimations().map((animation) => animation.finished)));
  const start = await dialog.boundingBox();
  const widthHandle = dialog.locator('[data-dialog-resize="width"]');
  let grip = await widthHandle.boundingBox();
  await page.mouse.move(grip.x + grip.width / 2, grip.y + grip.height / 2);
  await page.mouse.down();
  await page.mouse.move(grip.x + grip.width / 2 - 80, grip.y + grip.height / 2, { steps: 5 });
  await page.mouse.up();
  const widthOnly = await dialog.boundingBox();
  expect(widthOnly.width).toBeLessThan(start.width - 50);
  expect(widthOnly.height).toBeCloseTo(start.height, 0);

  const heightHandle = dialog.locator('[data-dialog-resize="height"]');
  grip = await heightHandle.boundingBox();
  await page.mouse.move(grip.x + grip.width / 2, grip.y + grip.height / 2);
  await page.mouse.down();
  await page.mouse.move(grip.x + grip.width / 2, grip.y + grip.height / 2 - 60, { steps: 5 });
  await page.mouse.up();
  const heightOnly = await dialog.boundingBox();
  expect(heightOnly.width).toBeCloseTo(widthOnly.width, 0);
  expect(heightOnly.height).toBeLessThan(widthOnly.height - 35);
});

test('MODAL-RESIZE-VIEWPORT-04 — misure enormi vengono limitate e il bottom sheet non espone prese', async ({ page }) => {
  await page.evaluate(() => localStorage.setItem('talos-harness-modal-sizes-v1', JSON.stringify({
    'sheet:model': { width: 9000, height: 9000 },
  })));
  await page.locator('#closeSheet').click();
  await page.setViewportSize({ width: 900, height: 600 });
  await page.locator('[data-open-sheet="model"]').first().click();
  await page.locator('#sheetDialog').evaluate((element) => Promise.all(element.getAnimations().map((animation) => animation.finished)));
  let box = await page.locator('#sheetDialog').boundingBox();
  expect(box.x).toBeGreaterThanOrEqual(10);
  expect(box.x + box.width).toBeLessThanOrEqual(890);
  expect(box.y).toBeGreaterThanOrEqual(10);
  expect(box.y + box.height).toBeLessThanOrEqual(590);

  await page.setViewportSize({ width: 780, height: 700 });
  box = await page.locator('#sheetDialog').boundingBox();
  await expect(page.locator('#sheetDialog .dialog-resize-handle')).toHaveCount(3);
  await expect(page.locator('#sheetDialog [data-dialog-resize="both"]')).toBeHidden();
  expect(box.width).toBeLessThanOrEqual(780);
});

test('WORKSPACE-TOOLBAR-09 — Nuova cartella, Aggiorna, Comprimi e Copia percorso sono azioni reali', async ({ page }) => {
  const calls = [];
  await page.route('**/api/v1/workspace-browser/folders', async (route) => {
    calls.push(route.request().postDataJSON());
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(envelope({ name: 'Nuovo progetto', path: 'C:\\Nuovo progetto' })) });
  });
  await expect(page.getByRole('button', { name: 'Nuova cartella' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Aggiorna cartelle' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Comprimi cartelle' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Copia percorso cartella' })).toBeVisible();

  await page.getByRole('button', { name: 'Nuova cartella' }).click();
  await page.getByLabel('Nome nuova cartella').fill('Nuovo progetto');
  await page.getByRole('button', { name: 'Crea cartella' }).click();
  await expect.poll(() => calls).toEqual([{ parentPath: 'C:\\', name: 'Nuovo progetto' }]);
});
