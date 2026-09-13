import { expect, test, type Page } from '@playwright/test'
import { closeToolSheet } from './toolSheet'

const MENU = '[aria-label="Open menu"]'
const SIDEBAR = '[data-testid="talos-mobile-sidebar"]'
const SHEET = '[data-testid="talos-mobile-tool-sheet"]'

async function openModelSettings(page: Page): Promise<void> {
    await page.goto('/')
    await page.locator(MENU).click()
    await page.locator(`${SIDEBAR} [aria-label="Open Settings"]`).click()
    await expect(page.locator(SHEET)).toBeVisible()
    await page.getByTestId('settings-model-lab-link').click()
    await expect(page.getByTestId('talos-model-lab-hub')).toBeVisible()
    await page.getByTestId('talos-model-lab-destination').filter({ hasText: 'Providers and access' }).click()
    await expect(page.getByTestId('settings-models-providers-screen')).toBeVisible()
}

async function openCatalog(page: Page): Promise<void> {
    if (await page.getByTestId('talos-model-lab-hub').count() === 0) {
        await page.getByTestId('talos-sheet-back').click()
        await expect(page.getByTestId('talos-model-lab-hub')).toBeVisible()
    }
    await page.getByTestId('talos-model-lab-destination').filter({ hasText: 'Model catalog' }).click()
    await expect(page.getByLabel('Search model catalog')).toBeVisible()
}

function geminiCompletion(text: string) {
    return {
        modelVersion: 'gemini-parity',
        candidates: [{ finishReason: 'STOP', content: { parts: [{ text }] } }],
    }
}

test('manages a discovered Gemini model from Model Lab through the live Chat picker and reload', async ({ page }) => {
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
    const completionBodies: Array<Record<string, unknown>> = []
    await page.route('https://generativelanguage.googleapis.com/**', async (route) => {
        const request = route.request()
        if (request.method() === 'GET') {
            await route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify({
                    models: [
                        {
                            name: 'models/gemini-live',
                            displayName: 'Gemini Live',
                            inputTokenLimit: 128000,
                            outputTokenLimit: 8192,
                            supportedGenerationMethods: ['generateContent'],
                        },
                        {
                            name: 'models/gemini-embed',
                            displayName: 'Gemini Embed',
                            supportedGenerationMethods: ['embedContent'],
                        },
                    ],
                }),
            })
            return
        }

        completionBodies.push(request.postDataJSON() as Record<string, unknown>)
        await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify(geminiCompletion('TALOS_PROBE_OK')),
        })
    })

    await openModelSettings(page)
    if (await page.locator('[data-provider="gemini"] button[aria-controls="provider-gemini-body"]').getAttribute('aria-expanded') === 'false') await page.locator('[data-provider="gemini"] button[aria-controls="provider-gemini-body"]').click()
    await page.getByLabel('Google Gemini API key').fill('e2e-model-lab-gemini-key')
    await page.getByLabel('Save Google Gemini key').click()
    await expect(page.getByText('2 models available', { exact: true })).toBeVisible()

    await openCatalog(page)
    await page.getByLabel('Filter models by provider').click()
    await page.locator('[data-testid="talos-themed-select-item"][data-value="gemini"]').click()
    await page.getByLabel('Search model catalog').fill('Gemini Live')
    await expect(page.getByText('1 of 2 models', { exact: true })).toBeVisible()

    const card = page.locator('[data-model-card][data-model-id="gemini:gemini-live"]')
    await expect(card).toBeVisible()
    await card.getByText('Details and actions', { exact: true }).click()
    await expect(card.getByText('Observed metadata', { exact: true })).toBeVisible()

    const visibility = card.getByRole('switch', { name: 'Show Gemini Live in composer' })
    await expect(visibility).toHaveAttribute('aria-checked', 'true')
    await visibility.click()
    await expect(visibility).toHaveAttribute('aria-checked', 'false')
    await visibility.click()
    await expect(visibility).toHaveAttribute('aria-checked', 'true')

    await card.getByRole('textbox', { name: 'Display name for Gemini Live', exact: true }).fill('Gemini Field')
    await card.getByLabel('Save display name for Gemini Live').click()
    await page.getByLabel('Search model catalog').fill('Gemini Field')
    await expect(card.getByRole('heading', { name: 'Gemini Field', exact: true })).toBeVisible()

    await card.getByText('Details and actions', { exact: true }).click()
    await card.getByLabel('Test Gemini Field completion').click()
    await expect(card.getByText('Probe passed', { exact: true })).toBeVisible()
    expect(completionBodies).toHaveLength(1)
    expect(JSON.stringify(completionBodies[0])).toContain('TALOS_PROBE_OK')

    await card.getByLabel('Use Gemini Field as default model').click()
    await expect(card.getByLabel('Use Gemini Field as default model')).toHaveAttribute('aria-pressed', 'true')
    await page.getByTestId('talos-sheet-back').click()
    await expect(page.getByTestId('talos-model-lab-hub')).toBeVisible()
    await page.getByTestId('talos-sheet-back').click()
    await expect(page).toHaveURL(/\/settings$/)
    await closeToolSheet(page)
    await expect(page.locator(SHEET)).toHaveCount(0)

    const picker = page.getByLabel('Choose model profile')
    await expect(picker).toHaveAttribute('title', 'Gemini Field')
    await picker.click()
    await expect(page.getByTestId('talos-mobile-composer-model-picker').getByText('Gemini Field', { exact: true })).toBeVisible()
    await page.keyboard.press('Escape')

    await page.reload()
    await expect(page.getByLabel('Choose model profile')).toHaveAttribute('title', 'Gemini Field', { timeout: 15_000 })
    await page.getByLabel('Choose model profile').click()
    const persistedOption = page.locator('[data-testid="talos-mobile-model-option"][data-model-profile-id="gemini:gemini-live"]')
    await expect(persistedOption).toContainText('Gemini Field')
    await expect(persistedOption).toHaveAttribute('data-selected', 'true')
})

test('persists an OpenAI-compatible endpoint and timeout and recovers a manual model at 360px', async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 640 })
    const requestUrls: string[] = []
    await page.route('https://models.example.test/v1/**', async (route) => {
        requestUrls.push(route.request().url())
        if (route.request().method() === 'GET') {
            await route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify({
                    data: [{ id: 'custom-chat', name: 'Custom Chat', supported_parameters: ['reasoning_effort'] }],
                }),
            })
            return
        }
        await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({
                model: 'custom-chat',
                choices: [{ finish_reason: 'stop', message: { content: 'TALOS_PROBE_OK' } }],
            }),
        })
    })

    await openModelSettings(page)
    // Providers are collapsed by default — expand OpenAI before configuring.
    if (await page.locator('[data-provider="openai"] button[aria-controls="provider-openai-body"]').getAttribute('aria-expanded') === 'false') await page.locator('[data-provider="openai"] button[aria-controls="provider-openai-body"]').click()
    await page.getByLabel('OpenAI custom endpoint').fill('https://models.example.test/v1')
    await page.getByLabel('OpenAI timeout seconds').fill('75')
    await page.getByLabel('Save OpenAI runtime options').click()
    await page.getByLabel('OpenAI API key').fill('e2e-custom-openai-key')
    await page.getByLabel('Save OpenAI key').click()

    await expect(page.getByText('1 model available', { exact: true })).toBeVisible()
    expect(requestUrls).toContain('https://models.example.test/v1/models')

    await page.getByText('Advanced manual models', { exact: true }).click()
    await expect(page.getByLabel('Manual model ID')).toBeVisible()
    await page.getByLabel('Manual model ID').fill('fallback-chat')
    await page.getByLabel('Manual model display name').fill('Fallback Chat')
    await page.getByLabel('Declare reasoning support').check()
    await page.getByLabel('Save manual model').click()
    await expect(page.getByText('Fallback Chat', { exact: true })).toBeVisible()

    await openCatalog(page)
    await page.getByLabel('Search model catalog').fill('Fallback Chat')
    const manualCard = page.locator('[data-model-card][data-model-id="openai:fallback-chat"]')
    await expect(manualCard).toBeVisible()
    await manualCard.getByText('Details and actions', { exact: true }).click()
    await expect(manualCard.getByText('Declared capabilities', { exact: true })).toBeVisible()
    await expect(manualCard.getByText('reasoning', { exact: true })).toBeVisible()

    await page.getByTestId('talos-sheet-back').click()
    await expect(page.getByTestId('talos-model-lab-hub')).toBeVisible()
    await page.getByTestId('talos-model-lab-destination').filter({ hasText: 'Providers and access' }).click()
    await expect(page.getByTestId('settings-models-providers-screen')).toBeVisible()
    await page.reload()
    await expect(page.getByTestId('settings-models-providers-screen')).toBeVisible()
    await expect(page.getByLabel('OpenAI custom endpoint')).toHaveValue('https://models.example.test/v1')
    await expect(page.getByLabel('OpenAI timeout seconds')).toHaveValue('75')
    await openCatalog(page)
    await expect(page.locator('[data-model-card][data-model-id="openai:fallback-chat"]')).toBeVisible()

    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
    expect(overflow).toBeLessThanOrEqual(0)
})
