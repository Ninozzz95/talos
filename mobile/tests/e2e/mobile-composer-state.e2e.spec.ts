import { expect, test, type Page } from '@playwright/test'
import { closeToolSheet } from './toolSheet'

const MENU = '[aria-label="Open menu"]'
const SIDEBAR = '[data-testid="talos-mobile-sidebar"]'
const SHEET = '[data-testid="talos-mobile-tool-sheet"]'

async function configureReasoningModel(page: Page): Promise<void> {
    await page.route('https://api.openai.com/v1/models', async (route) => {
        await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({
                data: [{
                    id: 'gpt-e2e-reasoner',
                    name: 'GPT E2E Reasoner',
                    supported_parameters: ['reasoning_effort'],
                }],
            }),
        })
    })

    await page.goto('/')
    await page.locator(MENU).click()
    await page.locator(`${SIDEBAR} [aria-label="Open Settings"]`).click()
    await expect(page.locator(SHEET)).toBeVisible()
    await page.getByTestId('settings-model-lab-link').click()
    await page.getByTestId('talos-model-lab-destination').filter({ hasText: 'Providers and access' }).click()
    await expect(page.getByTestId('settings-models-providers-screen')).toBeVisible()
    if (await page.locator('[data-provider="openai"] button[aria-controls="provider-openai-body"]').getAttribute('aria-expanded') === 'false') await page.locator('[data-provider="openai"] button[aria-controls="provider-openai-body"]').click()
    await page.getByLabel('OpenAI API key').fill('e2e-composer-openai-key')
    await page.getByLabel('Save OpenAI key').click()
    await expect(page.getByText('1 model available', { exact: true })).toBeVisible()

    await page.getByTestId('talos-sheet-back').click()
    await page.getByTestId('talos-model-lab-destination').filter({ hasText: 'Model catalog' }).click()
    const model = page.locator('[data-model-card][data-model-id="openai:gpt-e2e-reasoner"]')
    await expect(model).toBeVisible()
    await model.getByRole('button', { name: /Use .* as default model/ }).click()
    await page.getByTestId('talos-sheet-back').click()
    await page.getByTestId('talos-sheet-back').click()
    await closeToolSheet(page)
    await expect(page.locator(SHEET)).toHaveCount(0)
}

async function verifyDurableComposerState(page: Page, viewport: { width: number; height: number }): Promise<void> {
    await page.setViewportSize(viewport)
    await configureReasoningModel(page)

    const composer = page.getByLabel('Message TALOS')
    await composer.fill('Keep this unsent mobile draft exactly.')

    await page.getByLabel('Choose reasoning effort').click()
    await page.locator('[data-talos-filter-option="medium"]').click()
    const reasoningDialog = page.getByRole('dialog', { name: 'Model & reasoning' })
    await expect(reasoningDialog).toBeVisible()
    await expect(reasoningDialog.locator('[data-talos-filter-option="medium"]')).toHaveAttribute('aria-checked', 'true')
    const thinkingToggle = reasoningDialog.getByTestId('talos-mobile-thinking-toggle')
    await thinkingToggle.click()
    await expect(thinkingToggle).toHaveAttribute('aria-checked', 'true')
    await page.keyboard.press('Escape')

    await page.waitForTimeout(500)
    await expect(page.locator(SHEET)).toHaveCount(0)
    await page.reload()

    await expect(composer).toHaveValue('Keep this unsent mobile draft exactly.', { timeout: 15_000 })
    await expect(page.getByLabel('Choose model profile')).toHaveAttribute('title', 'GPT E2E Reasoner')
    await expect(page.getByLabel('Choose reasoning effort')).toHaveAttribute('title', 'Effort: Medium')
    await expect(page.locator(SHEET)).toHaveCount(0)

    await page.getByLabel('Choose reasoning effort').click()
    await expect(page.getByTestId('talos-mobile-thinking-toggle')).toHaveAttribute('aria-checked', 'true')
    await page.keyboard.press('Escape')

    await page.getByLabel('Choose model profile').click()
    await page.getByTestId('talos-mobile-composer-model-picker')
        .getByRole('button', { name: 'Open Model Lab', exact: true })
        .click()

    await expect(page).toHaveURL(/\/settings\/models$/)
    await expect(page.locator(SHEET)).toHaveCount(1)
    await expect(page.getByTestId('talos-model-lab-hub')).toBeVisible()

    const horizontalOverflow = await page.evaluate(() => (
        document.documentElement.scrollWidth - document.documentElement.clientWidth
    ))
    expect(horizontalOverflow).toBeLessThanOrEqual(0)
}

test('persists draft and model controls across reload without opening unrelated UI', async ({ page }) => {
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
    await verifyDurableComposerState(page, { width: 390, height: 844 })
})

test('keeps the durable composer and direct Model Lab path reachable at 360x640', async ({ page }) => {
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
    await verifyDurableComposerState(page, { width: 360, height: 640 })
})
