import { expect, test } from '@playwright/test'

async function openSettings(page: import('@playwright/test').Page): Promise<void> {
    await page.goto('/')
    await expect(page.locator('[data-testid="talos-mobile-header"]')).toBeVisible()
    await page.locator('[aria-label="Open menu"]').click()
    await page.locator('[data-testid="talos-mobile-sidebar"] [aria-label="Open Settings"]').click()
    await expect(page.locator('[data-testid="talos-mobile-tool-sheet"]')).toBeVisible()
    // F3-T3 chrome dedup: ONE title per surface — the sheet header owns it.
    await expect(page.locator('[data-testid="talos-mobile-tool-sheet"]').getByText('Settings Center').first()).toBeVisible()
}

test('Settings exposes all eleven desktop categories, real Browser controls, and honest remaining gates', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await openSettings(page)

    const settingsTabs = page.getByRole('tablist', { name: 'TALOS settings categories' })
    await expect(settingsTabs.getByRole('tab')).toHaveCount(11)

    await settingsTabs.getByRole('tab', { name: 'Browser' }).click()
    await expect(page.getByTestId('talos-mobile-browser-settings')).toBeVisible()
    await page.getByLabel('Browser interaction policy').click()
    await page.getByRole('option', { name: 'Confirm every interaction' }).click()
    await page.getByLabel('Open browser links in').click()
    await page.getByRole('option', { name: 'System browser' }).click()
    await page.getByLabel('Suggest Browse for links').uncheck()
    await expect(page.getByText('Trusted node not paired', { exact: true })).toBeVisible()

    await page.reload()
    await expect(page.locator('[data-testid="talos-mobile-tool-sheet"]')).toBeVisible()
    await page.getByRole('tab', { name: 'Browser' }).click()
    await expect(page.getByLabel('Browser interaction policy')).toContainText('Confirm every interaction')
    await expect(page.getByLabel('Open browser links in')).toContainText('System browser')
    await expect(page.getByLabel('Suggest Browse for links')).not.toBeChecked()
})

test('Appearance changes theme and Motion V6 preferences without reload and persists them', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await openSettings(page)

    await page.getByRole('tab', { name: 'Appearance', exact: true }).click()
    await page.getByLabel('Theme preset').click()
    await page.getByRole('option', { name: 'Aurora Research' }).click()
    await expect(page.locator('html')).toHaveAttribute('data-theme-preset', 'aurora')

    await page.getByRole('tab', { name: 'Motion', exact: true }).click()
    await page.getByLabel('Motion renderer mode').click()
    await page.getByRole('option', { name: 'Complex' }).click()
    await page.getByRole('slider', { name: 'Background speed' }).fill('150')

    await page.reload()
    await expect(page.locator('html')).toHaveAttribute('data-theme-preset', 'aurora')
    await expect(page.locator('[data-testid="talos-mobile-tool-sheet"]')).toBeVisible()
    await page.getByRole('tab', { name: 'Appearance', exact: true }).click()
    await page.getByRole('tab', { name: 'Motion', exact: true }).click()
    await expect(page.getByLabel('Motion renderer mode')).toContainText('Complex')
    await expect(page.getByRole('slider', { name: 'Background speed' })).toHaveValue('150')
})

test('Settings remains reachable without horizontal overflow at 360x640', async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 640 })
    await openSettings(page)

    const categoryList = page.getByRole('tablist', { name: 'TALOS settings categories' })
    await categoryList.getByRole('tab', { name: 'System' }).scrollIntoViewIfNeeded()
    await categoryList.getByRole('tab', { name: 'System' }).click()
    await expect(page.locator('[data-settings-panel="system"]')).toBeVisible()

    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
    expect(overflow).toBeLessThanOrEqual(0)
})
