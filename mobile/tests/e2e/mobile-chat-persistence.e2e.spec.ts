import { expect, test, type Page } from '@playwright/test'

const RAIL = '[data-testid="talos-mobile-rail"]'
const SHEET = '[data-testid="talos-mobile-tool-sheet"]'

function geminiResponse(text: string) {
    return {
        modelVersion: 'gemini-live',
        candidates: [{ finishReason: 'STOP', content: { parts: [{ text }] } }],
    }
}

async function configureGemini(page: Page): Promise<void> {
    await page.goto('/')
    await page.locator(`${RAIL} [aria-label="Settings"]`).click()
    await expect(page.locator(SHEET)).toBeVisible()
    await page.locator('[data-settings-tab="models"]').click()
    await page.getByLabel('Google Gemini API key').fill('e2e-durable-gemini-key')
    await page.getByLabel('Save Google Gemini key').click()
    await expect(page.getByText('1 model available', { exact: true })).toBeVisible()
    await page.getByLabel('Default chat model').click()
    await page.locator('[data-testid="talos-themed-select-item"][data-value="gemini:gemini-live"]').click()
    await page.getByLabel('Back to chat').click()
    await expect(page.locator(SHEET)).toHaveCount(0)
}

async function sendAndExpect(page: Page, prompt: string, reply: string): Promise<void> {
    const composer = page.getByLabel('Message TALOS')
    const sendButton = page.getByTestId('talos-mobile-composer')
        .getByRole('button', { name: 'Send message', exact: true })
    await composer.fill(prompt)
    await expect(sendButton).toBeEnabled({ timeout: 15_000 })
    await composer.press('Enter')
    await expect(page.getByText(reply, { exact: true })).toBeVisible()
}

test('persists contextual chat sessions through reload, rename, switch and active deletion', async ({ page }) => {
    const completions: Array<Record<string, unknown>> = []
    const pageErrors: string[] = []
    const localDataRequests: string[] = []

    page.on('pageerror', (error) => pageErrors.push(error.message))
    page.on('request', (request) => {
        const url = new URL(request.url())
        const isLocalDataRequest = url.origin === 'http://127.0.0.1:4173'
            && ['fetch', 'xhr'].includes(request.resourceType())
            && url.pathname !== '/assets/sql-wasm.wasm'
        if (isLocalDataRequest) localDataRequests.push(`${request.method()} ${url.pathname}`)
    })
    await page.route('https://generativelanguage.googleapis.com/**', async (route) => {
        const request = route.request()
        if (request.method() === 'GET') {
            await route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify({
                    models: [{
                        name: 'models/gemini-live',
                        displayName: 'Gemini Live',
                        inputTokenLimit: 128000,
                        outputTokenLimit: 8192,
                        supportedGenerationMethods: ['generateContent'],
                    }],
                }),
            })
            return
        }

        completions.push(request.postDataJSON() as Record<string, unknown>)
        const replies = [
            'Alpha is recorded.',
            'The earlier value was alpha.',
            'Secondary thread is isolated.',
        ]
        await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify(geminiResponse(replies[completions.length - 1] ?? 'Unexpected completion.')),
        })
    })

    await configureGemini(page)

    const firstTitle = 'Remember alpha as the value.'
    await sendAndExpect(page, firstTitle, 'Alpha is recorded.')
    await sendAndExpect(page, 'What value did I give you?', 'The earlier value was alpha.')
    expect(JSON.stringify(completions[1])).toContain(firstTitle)
    expect(JSON.stringify(completions[1])).toContain('Alpha is recorded.')

    await page.getByTestId('talos-mobile-chat-header').getByLabel('New Chat').click()
    await expect(page.getByTestId('talos-empty-brand')).toBeVisible()

    const secondTitle = 'Draft a secondary release plan.'
    await sendAndExpect(page, secondTitle, 'Secondary thread is isolated.')
    await expect(page.getByTestId('talos-mobile-chat-title')).toHaveText(secondTitle)

    await page.reload()
    await expect(page.getByTestId('talos-mobile-chat-title')).toHaveText(secondTitle, { timeout: 15_000 })
    await expect(page.getByText('Secondary thread is isolated.', { exact: true })).toBeVisible()

    await page.getByLabel('Open chat history').click()
    await expect(page.getByRole('list', { name: 'Chat history' })).toBeVisible()
    await expect(page.getByText('2 conversations on this device', { exact: true })).toBeVisible()
    await page.getByLabel(`Open chat ${firstTitle}`).click()
    await expect(page.getByText('Alpha is recorded.', { exact: true })).toBeVisible()
    await expect(page.getByText('The earlier value was alpha.', { exact: true })).toBeVisible()
    await expect(page.getByText('Secondary thread is isolated.', { exact: true })).toHaveCount(0)

    await page.getByLabel('Open chat history').click()
    await page.getByLabel(`Rename ${firstTitle}`).click()
    await page.getByLabel('Chat name').fill('Primary evidence')
    await page.getByRole('button', { name: 'Save', exact: true }).click()
    await expect(page.getByLabel('Open chat Primary evidence')).toBeVisible()
    await page.getByLabel('Close chat history').click()
    await expect(page.getByTestId('talos-mobile-chat-title')).toHaveText('Primary evidence')

    await page.reload()
    await expect(page.getByTestId('talos-mobile-chat-title')).toHaveText('Primary evidence', { timeout: 15_000 })
    await expect(page.getByText('The earlier value was alpha.', { exact: true })).toBeVisible()

    await page.getByLabel('Open chat history').click()
    await page.getByLabel('Delete Primary evidence').click()
    await expect(page.getByRole('heading', { name: 'Delete chat?' })).toBeVisible()
    await page.getByRole('button', { name: 'Delete', exact: true }).click()
    await expect(page.getByText('1 conversation on this device', { exact: true })).toBeVisible()
    await page.getByLabel('Close chat history').click()
    await expect(page.getByTestId('talos-mobile-chat-title')).toHaveText(secondTitle)
    await expect(page.getByText('Secondary thread is isolated.', { exact: true })).toBeVisible()

    await page.reload()
    await expect(page.getByTestId('talos-mobile-chat-title')).toHaveText(secondTitle, { timeout: 15_000 })
    await page.getByLabel('Open chat history').click()
    await expect(page.getByLabel('Open chat Primary evidence')).toHaveCount(0)
    await expect(page.getByLabel(`Open chat ${secondTitle}`)).toHaveAttribute('aria-current', 'page')

    expect(completions).toHaveLength(3)
    expect(localDataRequests).toEqual([])
    expect(pageErrors).toEqual([])
})
