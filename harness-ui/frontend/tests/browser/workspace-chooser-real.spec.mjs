import { expect, test } from '@playwright/test';

test('WORKSPACE-CHOOSER-REAL-21 — UI e browser directory reale condividono il contratto', async ({ page }) => {
  test.skip(process.env.TALOS_WORKSPACE_REAL_GATE !== '1', 'Gate opt-in: richiede il server isolato col nuovo endpoint.');
  const response = await page.goto('/');
  expect(response?.ok()).toBe(true);
  await page.locator('#newSessionBtn').click();
  await expect(page.locator('#workspaceChooser')).toBeVisible();
  await expect(page.locator('#workspaceChooserPath')).toHaveValue('C:\\');
  await expect(page.getByRole('treeitem', { name: 'Users' })).toBeVisible();
  await expect(page.locator('[data-workspace-selected-path]')).toContainText('AVM-harness-desktop');
  await expect(page.locator('#workspaceChooserSubmit')).toBeEnabled();
  await expect(page.locator('.workspace-chooser-tree-state')).not.toContainText(/errore|non disponibile|configur/i);
});
