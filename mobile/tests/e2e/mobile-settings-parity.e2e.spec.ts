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

test('Settings exposes all eleven desktop categories plus mobile-only Language and Privacy, real Browser controls, and honest remaining gates', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await openSettings(page)

    const settingsTabs = page.getByRole('tablist', { name: 'TALOS settings categories' })
    // Eleven from the desktop, plus mobile-owned Language and Privacy:
    // Android locale and runtime-permission contracts have no desktop peer.
    await expect(settingsTabs.getByRole('tab')).toHaveCount(13)
    await expect(settingsTabs.getByRole('tab', { name: 'Language' })).toBeVisible()
    await expect(settingsTabs.getByRole('tab', { name: /Privacy and permissions/ })).toBeVisible()

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

test('Library context requires an explicit mode and persists the global additive policy', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await openSettings(page)

    await page.getByRole('tablist', { name: 'TALOS settings categories' })
        .getByRole('tab', { name: 'AI Defaults' }).click()

    const master = page.getByRole('switch', { name: 'Let chats use your Library' })
    await expect(master).not.toBeChecked()
    await master.check()

    const chooser = page.getByTestId('talos-library-mode-chooser')
    const mode = page.getByLabel('Library context mode')
    await expect(chooser).toHaveAttribute('data-policy-source', 'pending')
    await expect(mode).toContainText('Choose how TALOS may use it')

    await mode.click()
    await expect(page.locator('[data-testid="talos-themed-select-item"][data-value="broad_compat_v1"]')).toContainText('Broad compatibility')
    await expect(page.locator('[data-testid="talos-themed-select-item"][data-value="smart_relevant_v1"]')).toContainText('Relevant sources only')
    await expect(page.locator('[data-testid="talos-themed-select-item"][data-value="ask_before_use_v1"]')).toContainText('Ask before using sources')
    await expect(page.locator('[data-testid="talos-themed-select-item"][data-value="agentic_on_demand_v1"]')).toContainText('Only when requested')
    await page.locator('[data-testid="talos-themed-select-item"][data-value="smart_relevant_v1"]').click()

    await expect(chooser).toHaveAttribute('data-policy-source', 'global')
    await expect(mode).toContainText('Relevant sources only')
    await expect(master).toBeChecked()

    await page.reload()
    await expect(page.locator('[data-testid="talos-mobile-tool-sheet"]')).toBeVisible()
    await page.getByRole('tab', { name: 'AI Defaults' }).click()
    await expect(page.getByRole('switch', { name: 'Let chats use your Library' })).toBeChecked()
    await expect(page.getByLabel('Library context mode')).toContainText('Relevant sources only')
    await expect(page.getByTestId('talos-library-mode-chooser')).toHaveAttribute('data-policy-source', 'global')
})

test('Tavily key setup opens only the official platform in a user-owned browser tab', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await page.context().route('https://app.tavily.com/**', async (route) => {
        await route.fulfill({
            status: 200,
            contentType: 'text/html',
            body: '<!doctype html><title>Tavily platform test boundary</title>',
        })
    })
    await openSettings(page)

    await page.getByRole('tablist', { name: 'TALOS settings categories' })
        .getByRole('tab', { name: 'AI Defaults' }).click()
    await page.getByTestId('talos-search-source-tavily').click()
    await expect(page.getByTestId('talos-tavily-api-key-link')).toBeVisible()

    const popupPromise = page.waitForEvent('popup')
    await page.getByTestId('talos-tavily-api-key-link').click()
    const popup = await popupPromise
    await popup.waitForLoadState('domcontentloaded')
    expect(popup.url()).toBe('https://app.tavily.com/')
    await popup.close()
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

test('dictation language persists independently from the interface locale', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await openSettings(page)

    await page.getByRole('tab', { name: 'Appearance', exact: true }).click()
    await page.getByRole('tab', { name: 'Voice', exact: true }).click()
    await page.getByLabel('Dictation language').click()
    await page.getByRole('option', { name: 'Italiano' }).click()
    await expect(page.getByLabel('Dictation language')).toContainText('Italiano')
    await expect(page.getByText('Lingua di dettatura', { exact: true })).toHaveCount(0)

    await page.reload()
    await expect(page.locator('[data-testid="talos-mobile-tool-sheet"]')).toBeVisible()
    await page.getByRole('tab', { name: 'Appearance', exact: true }).click()
    await page.getByRole('tab', { name: 'Voice', exact: true }).click()
    await expect(page.getByLabel('Dictation language')).toContainText('Italiano')
    await expect(page.getByText('Lingua di dettatura', { exact: true })).toHaveCount(0)
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

test('Font size scales interface chrome and persists', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })

    // The menu is the surface the owner named: "il font size DEVE impattare
    // anche il font dei menù e di tutto il sistema non solo chat."
    const menuItemSize = async (): Promise<number> => {
        await page.locator('[aria-label="Open menu"]').click()
        const size = await page.locator('[data-testid="talos-sidebar-tools"]').first()
            .evaluate((node) => Number.parseFloat(getComputedStyle(node).fontSize))
        await page.keyboard.press('Escape')
        return size
    }
    const panelSize = async (): Promise<number> => page.getByText('Chat message size').first()
        .evaluate((node) => Number.parseFloat(getComputedStyle(node).fontSize))
    // The label span carries the text utility; the trigger itself is a flex row.
    const tabSize = async (): Promise<number> => page.locator('[data-settings-tab="appearance"] span.truncate').first()
        .evaluate((node) => Number.parseFloat(getComputedStyle(node).fontSize))

    await page.goto('/')
    await expect(page.locator('[data-testid="talos-mobile-header"]')).toBeVisible({ timeout: 15000 })
    const menuBefore = await menuItemSize()

    await openSettings(page)
    await page.getByRole('tablist', { name: 'TALOS settings categories' })
        .getByRole('tab', { name: 'Appearance' }).click()
    const panelBefore = await panelSize()
    const tabBefore = await tabSize()
    expect(menuBefore).toBeGreaterThan(0)

    await page.locator('[data-testid="talos-font-scale-select"] [data-testid="talos-themed-select-trigger"]').click()
    await page.locator('[data-testid="talos-themed-select-item"]', { hasText: 'Extra large' }).click()
    await expect.poll(panelSize).toBeGreaterThan(panelBefore)
    expect(await tabSize(), 'the settings tab strip must scale').toBeGreaterThan(tabBefore)

    await page.goBack()
    await expect(page.locator('[data-testid="talos-mobile-header"]')).toBeVisible({ timeout: 15000 })
    expect(await menuItemSize(), 'the menu must follow the interface scale').toBeGreaterThan(menuBefore)

    // The scale survives a reload — a persisted preference, not view state.
    await page.reload()
    await expect(page.locator('[data-testid="talos-mobile-header"]')).toBeVisible({ timeout: 15000 })
    const scale = await page.evaluate(() =>
        getComputedStyle(document.documentElement).getPropertyValue('--talos-ui-scale').trim())
    expect(scale).toBe('1.3')
})
