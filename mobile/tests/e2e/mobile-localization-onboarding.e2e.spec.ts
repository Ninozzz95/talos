import { expect, test } from '@playwright/test'

const EMPTY_STATE = { cookies: [], origins: [] }

test.use({
    locale: 'it-IT',
    storageState: EMPTY_STATE,
})

test('system locale, explicit override and dedicated setting share one persistent contract', async ({ page }) => {
    await page.goto('/')

    const intro = page.locator('[data-testid="talos-intro-modal"]')
    await expect(intro).toBeVisible({ timeout: 15_000 })
    await expect(intro.getByRole('heading', { name: 'Scegli la tua lingua' })).toBeVisible()
    await expect(intro.locator('[data-language-mode="system"]')).toHaveAttribute('aria-checked', 'true')
    await expect(page.getByRole('status'))
        .toContainText('Aggiungi una chiave API del provider o un endpoint locale nelle Impostazioni')

    await intro.locator('[data-language-mode="en"]').click()
    await expect(intro.getByRole('heading', { name: 'Choose your language' })).toBeVisible()
    await expect(intro.locator('[data-language-mode="en"]')).toHaveAttribute('aria-checked', 'true')
    await intro.locator('[data-testid="talos-setup-skip"]').click()

    await page.getByRole('button', { name: 'Open menu' }).click()
    await page.locator('[data-testid="talos-mobile-sidebar"]')
        .getByRole('button', { name: 'Open Settings' })
        .click()
    await page.locator('[data-settings-tab="language"]').click()
    const languagePanel = page.locator('[data-testid="talos-settings-language"]')
    await expect(languagePanel).toBeVisible()
    await expect(languagePanel.locator('[data-language-mode="en"]')).toHaveAttribute('aria-checked', 'true')

    await languagePanel.locator('[data-language-mode="system"]').click()
    await expect(languagePanel.locator('[data-language-mode="system"]')).toHaveAttribute('aria-checked', 'true')
    await expect(page.getByRole('dialog', { name: 'Centro impostazioni' })).toBeVisible()

    await page.reload()
    await expect(page.getByRole('dialog', { name: 'Centro impostazioni' })).toBeVisible({ timeout: 15_000 })
    await page.locator('[data-settings-tab="language"]').click()
    await expect(page.locator('[data-testid="talos-settings-language"] [data-language-mode="system"]'))
        .toHaveAttribute('aria-checked', 'true')
})
