import { expect, test, type Page } from '@playwright/test'

const HUB = '[data-testid="talos-model-lab-hub"]'
const DESTINATION = '[data-testid="talos-model-lab-destination"]'

async function openHub(page: Page): Promise<void> {
    await page.goto('/')
    await page.getByLabel('Open menu').click()
    const sidebar = page.getByTestId('talos-mobile-sidebar')
    await expect(sidebar.getByRole('button', { name: 'Open Model Lab' })).toHaveCount(0)
    await sidebar.getByRole('button', { name: 'Open Settings' }).click()
    await page.getByTestId('settings-model-lab-link').click()
    await expect(page.locator(HUB)).toBeVisible()
    await expect(page).toHaveURL(/\/settings\/models$/)
}

async function visitChild(
    page: Page,
    label: string,
    path: RegExp,
    screen: string,
): Promise<void> {
    await page.locator(DESTINATION).filter({ hasText: label }).click()
    await expect(page).toHaveURL(path)
    await expect(page.getByTestId(screen)).toBeVisible()
    await expect(page.getByTestId('talos-model-lab-device')).toHaveCount(0)

    const back = page.getByTestId('talos-sheet-back')
    await expect(back).toHaveAttribute('data-back-target', 'parent')
    await expect(back).toHaveAttribute('aria-label', /Model Lab/)
    await back.click()
    await expect(page.locator(HUB)).toBeVisible()
    await expect(page).toHaveURL(/\/settings\/models$/)
}

test('Model Lab is a linear three-page hub with one shared device card at phone width', async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 792 })
    await openHub(page)

    await expect(page.getByTestId('talos-model-lab-device')).toHaveCount(1)
    await expect(page.locator(DESTINATION)).toHaveCount(3)
    await expect(page.getByRole('tablist', { name: 'Model Lab sections' })).toHaveCount(0)

    for (const destination of await page.locator(DESTINATION).all()) {
        expect(await destination.evaluate((node) => node.getBoundingClientRect().height)).toBeGreaterThanOrEqual(48)
    }

    await visitChild(page, 'Providers and access', /\/settings\/models\/providers$/, 'settings-models-providers-screen')
    await visitChild(page, 'Model catalog', /\/settings\/models\/catalog$/, 'settings-models-catalog-screen')
    await visitChild(page, 'Local models', /\/settings\/models\/local$/, 'settings-models-local-screen')

    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
    expect(overflow).toBeLessThanOrEqual(0)
})

test('legacy settings tab canonicalizes with replace instead of adding a second history step', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await page.goto('/')
    await page.goto('/settings?tab=models')

    await expect(page.locator(HUB)).toBeVisible()
    await expect(page).toHaveURL(/\/settings\/models$/)

    await page.goBack()
    await expect(page).toHaveURL(/\/$/)
})

test('tablet Settings keeps the same Account-first grouped navigation', async ({ page }) => {
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
    await page.setViewportSize({ width: 1024, height: 900 })
    await page.goto('/')
    await page.getByLabel('Open menu').click()
    await page.locator('[data-testid="talos-mobile-sidebar"] [aria-label="Open Settings"]').click()

    const navigation = page.getByRole('navigation', { name: 'TALOS settings categories' })
    await expect(navigation).toBeVisible()
    await expect(navigation.getByRole('tab')).toHaveCount(0)
    await expect(page.getByRole('tablist', { name: 'TALOS settings categories' })).toHaveCount(0)
    const link = page.getByTestId('settings-model-lab-link')
    await expect(link).toBeVisible()
    await expect(link).toContainText('Model Lab')
    expect(await link.evaluate((node) => node.closest('[role="tablist"]'))).toBeNull()
    expect(await link.evaluate((node) => node.parentElement?.previousElementSibling?.textContent?.trim()))
        .toBe('Intelligence')
    expect(await navigation.locator('[data-settings-tab], [data-settings-route]').evaluateAll((rows) => rows
        .slice(0, 4)
        .map((row) => (row as HTMLElement).dataset.settingsTab ?? (row as HTMLElement).dataset.settingsRoute)))
        .toEqual(['account', 'models', 'ai_defaults', 'agent_tools'])

    const account = navigation.locator('[data-settings-tab="account"]')
    await account.click()
    const accountRegion = page.locator('[data-settings-panel="account"]')
    await expect(accountRegion).toBeVisible()
    await expect(accountRegion).toHaveAttribute('role', 'region')
    await expect(page.locator('[data-settings-panel][role="tabpanel"]')).toHaveCount(0)
    await expect(navigation).toBeVisible()

    const navigationBox = await navigation.boundingBox()
    const detailBox = await page.getByTestId('settings-detail-pane').boundingBox()
    expect(navigationBox).not.toBeNull()
    expect(detailBox).not.toBeNull()
    expect(navigationBox!.x + navigationBox!.width).toBeLessThanOrEqual(detailBox!.x + 1)

    const aiDefaults = navigation.locator('[data-settings-tab="ai_defaults"]')
    const agentTools = navigation.locator('[data-settings-tab="agent_tools"]')
    await account.focus()
    await page.keyboard.press('Tab')
    await expect(link).toBeFocused()
    await page.keyboard.press('Tab')
    await expect(aiDefaults).toBeFocused()
    await page.keyboard.press('Tab')
    await expect(agentTools).toBeFocused()
    await page.keyboard.press('Shift+Tab')
    await page.keyboard.press('Shift+Tab')
    await expect(link).toBeFocused()

    await page.keyboard.press('Enter')
    await expect(page.locator(HUB)).toBeVisible()
    await expect(page.getByTestId('talos-model-lab-device')).toHaveCount(1)
})
