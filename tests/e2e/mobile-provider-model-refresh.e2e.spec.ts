import { expect, test, type Page, type Request } from '@playwright/test'
import { geminiCompletionFulfill } from './completionMock'
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
    await page.getByTestId('talos-model-lab-destination').filter({ hasText: 'Providers and access' }).click()
    await expect(page.getByTestId('settings-models-providers-screen')).toBeVisible()
}

function geminiResponse(text: string) {
    return {
        modelVersion: 'gemini-live',
        candidates: [{ finishReason: 'STOP', content: { parts: [{ text }] } }],
    }
}

test('saving a key refreshes models immediately and preserves context across two chat turns', async ({ page }) => {
    const completions: Array<Record<string, unknown>> = []
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

        const body = request.postDataJSON() as Record<string, unknown>
        completions.push(body)
        const reply = completions.length === 1
            ? 'Alpha is recorded.'
            : 'The earlier value was alpha.'
        await route.fulfill(geminiCompletionFulfill(
            request.url(),
            JSON.stringify(geminiResponse(reply)),
            reply,
        ))
    })

    await openModelSettings(page)
    if (await page.locator('[data-provider="gemini"] button[aria-controls="provider-gemini-body"]').getAttribute('aria-expanded') === 'false') await page.locator('[data-provider="gemini"] button[aria-controls="provider-gemini-body"]').click()
    await page.getByLabel('Google Gemini API key').fill('e2e-sentinel-gemini-key')
    await page.getByLabel('Save Google Gemini key').click()

    await expect(page.getByText('2 models available', { exact: true })).toBeVisible()

    await page.getByTestId('talos-sheet-back').click()
    await page.getByTestId('talos-model-lab-destination').filter({ hasText: 'Model catalog' }).click()
    const liveModel = page.locator('[data-model-card][data-model-id="gemini:gemini-live"]')
    const embedModel = page.locator('[data-model-card][data-model-id="gemini:gemini-embed"]')
    await expect(liveModel.getByRole('heading', { name: 'Gemini Live' })).toBeVisible()
    await expect(embedModel.getByRole('heading', { name: 'Gemini Embed' })).toBeVisible()
    await expect(embedModel.getByRole('button', { name: /Use .* as default model/ })).toBeDisabled()
    await liveModel.getByRole('button', { name: /Use .* as default model/ }).click()
    await page.getByTestId('talos-sheet-back').click()
    await page.getByTestId('talos-sheet-back').click()
    await closeToolSheet(page)
    await expect(page.locator(SHEET)).toHaveCount(0)

    const composer = page.getByLabel('Message TALOS')
    await composer.fill('Remember alpha as the value.')
    await expect(page.getByLabel('Send message')).toBeEnabled({ timeout: 15_000 })
    await composer.press('Enter')
    await expect(page.getByText('Alpha is recorded.', { exact: true })).toBeVisible()

    await composer.fill('What value did I give you?')
    await composer.press('Enter')
    await expect(page.getByText('The earlier value was alpha.', { exact: true })).toBeVisible()

    expect(completions).toHaveLength(2)
    expect(JSON.stringify(completions[1])).toContain('Remember alpha as the value.')
    expect(JSON.stringify(completions[1])).toContain('Alpha is recorded.')
    await expect(page.locator(SHEET)).toHaveCount(0)
})

test('failed discovery keeps chat reachable and does not reopen Settings', async ({ page }) => {
    await page.route('https://generativelanguage.googleapis.com/**', async (route) => {
        await route.fulfill({
            status: 401,
            contentType: 'application/json',
            body: JSON.stringify({ error: { message: 'The test credential was rejected.' } }),
        })
    })

    await openModelSettings(page)
    if (await page.locator('[data-provider="gemini"] button[aria-controls="provider-gemini-body"]').getAttribute('aria-expanded') === 'false') await page.locator('[data-provider="gemini"] button[aria-controls="provider-gemini-body"]').click()
    await page.getByLabel('Google Gemini API key').fill('e2e-rejected-key')
    await page.getByLabel('Save Google Gemini key').click()
    await expect(page.getByTestId('settings-models-providers-screen').getByRole('alert'))
        .toContainText('The test credential was rejected.')

    await closeToolSheet(page)
    await expect(page.locator(SHEET)).toHaveCount(0)
    await expect(page.getByLabel('Message TALOS')).toBeEnabled()
    await page.getByLabel('Message TALOS').fill('Composer remains usable')
    await expect(page.getByLabel('Send message')).toBeDisabled()
    await expect(page.locator(SHEET)).toHaveCount(0)
})
