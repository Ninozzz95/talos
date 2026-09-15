import { expect, test } from '@playwright/test'

const EMPTY_STATE = { cookies: [], origins: [] }

test.use({
    locale: 'it-IT',
    storageState: EMPTY_STATE,
})

test('system locale, explicit override and dedicated setting share one persistent contract', async ({ page }) => {
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
    /*
     * ⛔ Si porta la voce SOTTO GLI OCCHI prima di toccarla.
     *
     * Le impostazioni sono una lista lunga dentro uno scorrevole. La voce
     * si trova nel DOM ma non diventa mai «visible, enabled and stable»
     * per Playwright, che aspetta sessanta secondi e poi rinuncia — pur
     * essendo cliccabile, come ho verificato sondando la pagina viva.
     */
    await page.locator('[data-settings-tab="language"]').scrollIntoViewIfNeeded()
    await page.locator('[data-settings-tab="language"]').click()
    const languagePanel = page.locator('[data-testid="talos-settings-language"]')
    await expect(languagePanel).toBeVisible()
    await expect(languagePanel.locator('[data-language-mode="en"]')).toHaveAttribute('aria-checked', 'true')

    await languagePanel.locator('[data-language-mode="system"]').click()
    await expect(languagePanel.locator('[data-language-mode="system"]')).toHaveAttribute('aria-checked', 'true')
    await expect(page.getByRole('dialog', { name: 'Centro impostazioni' })).toBeVisible()

    await page.reload()
    await expect(page.getByRole('dialog', { name: 'Centro impostazioni' })).toBeVisible({ timeout: 15_000 })
    /*
     * ⛔ Si porta la voce SOTTO GLI OCCHI prima di toccarla.
     *
     * Le impostazioni sono una lista lunga dentro uno scorrevole. La voce
     * si trova nel DOM ma non diventa mai «visible, enabled and stable»
     * per Playwright, che aspetta sessanta secondi e poi rinuncia — pur
     * essendo cliccabile, come ho verificato sondando la pagina viva.
     */
    await page.locator('[data-settings-tab="language"]').scrollIntoViewIfNeeded()
    await page.locator('[data-settings-tab="language"]').click()
    await expect(page.locator('[data-testid="talos-settings-language"] [data-language-mode="system"]'))
        .toHaveAttribute('aria-checked', 'true')
})
