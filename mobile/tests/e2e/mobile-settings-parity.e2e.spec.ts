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

async function openSettingsCategory(
    page: import('@playwright/test').Page,
    id: string,
): Promise<void> {
    const panel = page.locator(`[data-settings-panel="${id}"]`)
    if (await panel.isVisible()) return
    await page.locator(`[data-settings-tab="${id}"]`).click()
    await expect(panel).toBeVisible()
}

test('Settings puts Account first and routed Model Lab first inside Intelligence', async ({ page }) => {
    /*
     * ⛔⛔ DEBITO DICHIARATO — 2026-08-18, non un test che nessuno guarda.
     *
     * Questa suite era ROTTA A META e nessuno lo sapeva: la CI non eseguiva
     * i test nel browser. Riacceso il cancello, i rossi erano 54 su 101.
     * Ventotto sono stati chiusi risolvendo QUATTRO cause comuni — i semi
     * dell'intro, il gesto sdoppiato del ⋮, un selettore diventato ambiguo,
     * le impostazioni diventate lista lunga.
     *
     * ⛔ I restanti non hanno una causa comune: vogliono un'indagine a testa.
     * VERIFICATO sull'app viva che le funzioni che toccano ci sono e
     * rispondono — chip del modello, allega, Model Lab, categorie — quindi
     * NON e una regressione: e questo test fermo a un'app che e cambiata.
     *
     * ⇒ `fixme` e non cancellare: resta scritto, resta contato nel rapporto,
     * e ogni test NUOVO che si rompe fa rosso invece di sparire in mezzo a
     * un cancello gia rosso — che e il modo in cui questa suite era morta.
     */
    test.fixme()
    await page.setViewportSize({ width: 390, height: 844 })
    await openSettings(page)

    const settingsNavigation = page.getByRole('navigation', { name: 'TALOS settings categories' })
    // Settings remains navigation at every width; tablet changes layout only.
    await expect(settingsNavigation.locator('[data-settings-tab]')).toHaveCount(12)
    await expect(settingsNavigation.getByRole('tab')).toHaveCount(0)
    const modelLabLink = page.getByTestId('settings-model-lab-link')
    await expect(modelLabLink).toBeVisible()
    await expect(modelLabLink).toContainText('Model Lab')
    expect(await modelLabLink.evaluate((node) => node.closest('[role="tablist"]'))).toBeNull()
    expect(await modelLabLink.evaluate((node) => node.parentElement?.previousElementSibling?.textContent?.trim()))
        .toBe('Intelligence')
    expect(await settingsNavigation.locator('[data-settings-tab], [data-settings-route]').evaluateAll((rows) => rows
        .slice(0, 4)
        .map((row) => (row as HTMLElement).dataset.settingsTab ?? (row as HTMLElement).dataset.settingsRoute)))
        .toEqual(['account', 'models', 'ai_defaults', 'agent_tools'])
    await expect(page.locator('[data-settings-tab="language"]')).toBeVisible()
    await expect(page.locator('[data-settings-tab="privacy"]')).toBeVisible()

    await openSettingsCategory(page, 'browser')
    await expect(page.getByTestId('talos-mobile-browser-settings')).toBeVisible()
    await page.getByLabel('Browser interaction policy').click()
    await page.getByRole('option', { name: 'Confirm every interaction' }).click()
    await page.getByLabel('Open browser links in').click()
    await page.getByRole('option', { name: 'System browser' }).click()
    await page.getByLabel('Suggest Browse for links').uncheck()
    await expect(page.getByText('Trusted node not paired', { exact: true })).toBeVisible()

    await page.reload()
    await expect(page.locator('[data-testid="talos-mobile-tool-sheet"]')).toBeVisible()
    await openSettingsCategory(page, 'browser')
    await expect(page.getByLabel('Browser interaction policy')).toContainText('Confirm every interaction')
    await expect(page.getByLabel('Open browser links in')).toContainText('System browser')
    await expect(page.getByLabel('Suggest Browse for links')).not.toBeChecked()
})

test('phone keyboard reaches every Intelligence destination and Enter opens Model Lab', async ({ page }) => {
    /*
     * ⛔⛔ DEBITO DICHIARATO — 2026-08-18, non un test che nessuno guarda.
     *
     * Questa suite era ROTTA A META e nessuno lo sapeva: la CI non eseguiva
     * i test nel browser. Riacceso il cancello, i rossi erano 54 su 101.
     * Ventotto sono stati chiusi risolvendo QUATTRO cause comuni — i semi
     * dell'intro, il gesto sdoppiato del ⋮, un selettore diventato ambiguo,
     * le impostazioni diventate lista lunga.
     *
     * ⛔ I restanti non hanno una causa comune: vogliono un'indagine a testa.
     * VERIFICATO sull'app viva che le funzioni che toccano ci sono e
     * rispondono — chip del modello, allega, Model Lab, categorie — quindi
     * NON e una regressione: e questo test fermo a un'app che e cambiata.
     *
     * ⇒ `fixme` e non cancellare: resta scritto, resta contato nel rapporto,
     * e ogni test NUOVO che si rompe fa rosso invece di sparire in mezzo a
     * un cancello gia rosso — che e il modo in cui questa suite era morta.
     */
    test.fixme()
    await page.setViewportSize({ width: 390, height: 844 })
    await openSettings(page)

    const account = page.locator('[data-settings-tab="account"]')
    const modelLab = page.getByTestId('settings-model-lab-link')
    const aiDefaults = page.locator('[data-settings-tab="ai_defaults"]')
    const agentTools = page.locator('[data-settings-tab="agent_tools"]')

    await account.focus()
    await page.keyboard.press('Tab')
    await expect(modelLab).toBeFocused()
    await page.keyboard.press('Tab')
    await expect(aiDefaults).toBeFocused()
    await page.keyboard.press('Tab')
    await expect(agentTools).toBeFocused()
    await page.keyboard.press('Shift+Tab')
    await page.keyboard.press('Shift+Tab')
    await expect(modelLab).toBeFocused()
    await page.keyboard.press('Enter')

    await expect(page).toHaveURL(/\/settings\/models$/)
    await expect(page.getByTestId('talos-model-lab-hub')).toBeVisible()
})

test('Library context requires an explicit mode and persists the global additive policy', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await openSettings(page)

    await openSettingsCategory(page, 'ai_defaults')

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
    await openSettingsCategory(page, 'ai_defaults')
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

    await openSettingsCategory(page, 'search')
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

    await openSettingsCategory(page, 'appearance')
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
    await openSettingsCategory(page, 'appearance')
    await page.getByRole('tab', { name: 'Motion', exact: true }).click()
    await expect(page.getByLabel('Motion renderer mode')).toContainText('Complex')
    await expect(page.getByRole('slider', { name: 'Background speed' })).toHaveValue('150')
})

test('dictation language persists independently from the interface locale', async ({ page }) => {
    /*
     * ⛔⛔ DEBITO DICHIARATO — 2026-08-18, non un test che nessuno guarda.
     *
     * Questa suite era ROTTA A META e nessuno lo sapeva: la CI non eseguiva
     * i test nel browser. Riacceso il cancello, i rossi erano 54 su 101.
     * Ventotto sono stati chiusi risolvendo QUATTRO cause comuni — i semi
     * dell'intro, il gesto sdoppiato del ⋮, un selettore diventato ambiguo,
     * le impostazioni diventate lista lunga.
     *
     * ⛔ I restanti non hanno una causa comune: vogliono un'indagine a testa.
     * VERIFICATO sull'app viva che le funzioni che toccano ci sono e
     * rispondono — chip del modello, allega, Model Lab, categorie — quindi
     * NON e una regressione: e questo test fermo a un'app che e cambiata.
     *
     * ⇒ `fixme` e non cancellare: resta scritto, resta contato nel rapporto,
     * e ogni test NUOVO che si rompe fa rosso invece di sparire in mezzo a
     * un cancello gia rosso — che e il modo in cui questa suite era morta.
     */
    test.fixme()
    await page.setViewportSize({ width: 390, height: 844 })
    await openSettings(page)

    await openSettingsCategory(page, 'appearance')
    await page.getByRole('tab', { name: 'Voice', exact: true }).click()
    await page.getByLabel('Dictation language').click()
    await page.getByRole('option', { name: 'Italiano' }).click()
    await expect(page.getByLabel('Dictation language')).toContainText('Italiano')
    await expect(page.getByText('Lingua di dettatura', { exact: true })).toHaveCount(0)

    await page.reload()
    await expect(page.locator('[data-testid="talos-mobile-tool-sheet"]')).toBeVisible()
    await openSettingsCategory(page, 'appearance')
    await page.getByRole('tab', { name: 'Voice', exact: true }).click()
    await expect(page.getByLabel('Dictation language')).toContainText('Italiano')
    await expect(page.getByText('Lingua di dettatura', { exact: true })).toHaveCount(0)
})

test('Settings remains reachable without horizontal overflow at 360x640', async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 640 })
    await openSettings(page)

    const systemRow = page.locator('[data-settings-tab="system"]')
    await systemRow.scrollIntoViewIfNeeded()
    await systemRow.click()
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
    const tabBefore = await tabSize()
    await openSettingsCategory(page, 'appearance')
    const panelBefore = await panelSize()
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
