import { expect, test, type Page, type Request } from '@playwright/test'

const RAIL = '[data-testid="talos-mobile-rail"]'
const SHEET = '[data-testid="talos-mobile-tool-sheet"]'

async function openModelSettings(page: Page): Promise<void> {
    await page.goto('/')
    await page.locator(`${RAIL} [aria-label="Settings"]`).click()
    await expect(page.locator(SHEET)).toBeVisible()
    await page.locator('[data-settings-tab="models"]').click()
    await expect(page.locator('[data-settings-panel="models"]')).toBeVisible()
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
        await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify(geminiResponse(completions.length === 1
                ? 'Alpha is recorded.'
                : 'The earlier value was alpha.')),
        })
    })

    await openModelSettings(page)
    await page.getByLabel('Google Gemini API key').fill('e2e-sentinel-gemini-key')
    await page.getByLabel('Save Google Gemini key').click()

    await expect(page.getByText('2 models available', { exact: true })).toBeVisible()
    await page.getByLabel('Default chat model').click()
    const liveModel = page.locator('[data-testid="talos-themed-select-item"][data-value="gemini:gemini-live"]')
    const embedModel = page.locator('[data-testid="talos-themed-select-item"][data-value="gemini:gemini-embed"]')
    await expect(liveModel).toContainText('Gemini Live')
    await expect(embedModel).toContainText('Gemini Embed')
    await expect(embedModel).toHaveAttribute('data-disabled', '')
    await liveModel.click()
    await page.getByLabel('Back to chat').click()
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
    await page.getByLabel('Google Gemini API key').fill('e2e-rejected-key')
    await page.getByLabel('Save Google Gemini key').click()
    await expect(page.locator('[data-settings-panel="models"]').getByRole('alert'))
        .toContainText('The test credential was rejected.')

    await page.getByLabel('Back to chat').click()
    await expect(page.locator(SHEET)).toHaveCount(0)
    await expect(page.getByLabel('Message TALOS')).toBeEnabled()
    await page.getByLabel('Message TALOS').fill('Composer remains usable')
    await expect(page.getByLabel('Send message')).toBeDisabled()
    await expect(page.locator(SHEET)).toHaveCount(0)
})
