import { expect, type Page } from '@playwright/test'

export async function waitForTalosWorkspaceReady(page: Page, timeout = 45_000): Promise<void> {
    const workspace = page.locator('#talos-workspace-root[data-authenticated="true"]')

    await expect(workspace).toHaveCount(1, { timeout })
    await expect(workspace).toHaveAttribute('data-talos-app-ready', 'true', { timeout })
    await expect(page.locator('[data-talos-boot-loader="true"]')).toHaveCount(0, { timeout })
    await expect(page.getByLabel('Message TALOS')).toBeVisible({ timeout })
}
