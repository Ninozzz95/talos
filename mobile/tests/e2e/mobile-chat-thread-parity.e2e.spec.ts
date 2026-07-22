import { expect, test, type Page } from '@playwright/test'

const RAIL = '[data-testid="talos-mobile-rail"]'
const SHEET = '[data-testid="talos-mobile-tool-sheet"]'

const initialPrompt = 'Render the verified mobile thread proof.'
const richReply = `## Verified result

- Context is durable
- Actions are available

| Check | State |
| --- | --- |
| Mobile | Ready |

Contact reviewer@example.com.

\`\`\`ts
const result = "verified"
\`\`\`

<form><input autofocus onfocus=alert(1)></form>

[unsafe](javascript:alert(1))
![Screenshot](https://fabricated.example/private.png)`

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
    await page.getByLabel('Google Gemini API key').fill('e2e-thread-parity-key')
    await page.getByLabel('Save Google Gemini key').click()
    await expect(page.getByText('1 model available', { exact: true })).toBeVisible()
    await page.getByLabel('Default chat model').click()
    await page.locator('[data-testid="talos-themed-select-item"][data-value="gemini:gemini-live"]').click()
    await page.getByLabel('Back to chat').click()
    await expect(page.locator(SHEET)).toHaveCount(0)
}

async function send(page: Page, prompt: string): Promise<void> {
    const composer = page.getByLabel('Message TALOS')
    const sendButton = page.getByTestId('talos-mobile-composer')
        .getByRole('button', { name: 'Send message', exact: true })
    await composer.fill(prompt)
    await expect(sendButton).toBeEnabled({ timeout: 15_000 })
    await composer.press('Enter')
}

async function clipboardText(page: Page): Promise<string> {
    return (await page.evaluate(() => navigator.clipboard.readText())).replace(/\r\n?/g, '\n')
}

test.use({
    viewport: { width: 360, height: 640 },
    permissions: ['clipboard-read', 'clipboard-write'],
})

test('renders and operates a durable safe thread through the final mobile UI', async ({ page }) => {
    const completions: Array<Record<string, unknown>> = []
    const fabricatedImageRequests: string[] = []
    const pageErrors: string[] = []

    page.on('pageerror', (error) => pageErrors.push(error.message))
    page.on('request', (request) => {
        if (request.url().startsWith('https://fabricated.example/')) fabricatedImageRequests.push(request.url())
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
        if (completions.length === 4) {
            await route.fulfill({
                status: 429,
                contentType: 'application/json',
                body: JSON.stringify({ error: { message: 'Rate limited for the parity journey.' } }),
            })
            return
        }
        const replies = [
            richReply,
            '### Resent response\n\nContext remained available.',
            '### Retried response\n\nHistory remained append-only.',
        ]
        await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify(geminiResponse(replies[completions.length - 1]!)),
        })
    })

    await configureGemini(page)
    await send(page, initialPrompt)

    const firstAssistant = page.locator('article[data-message-kind="assistant"]').first()
    await expect(firstAssistant.getByRole('heading', { name: 'Verified result' })).toBeVisible()
    await expect(firstAssistant.getByRole('table')).toBeVisible()
    await expect(firstAssistant.getByText('External image omitted: Screenshot', { exact: true })).toBeVisible()
    await expect(firstAssistant.locator('img, form, input, a[href^="javascript:"]')).toHaveCount(0)
    expect(fabricatedImageRequests).toEqual([])

    const sensitiveEmail = firstAssistant.locator('button[data-censored-kind="email"]')
    await expect(sensitiveEmail).toHaveAttribute('aria-label', 'Reveal sensitive email')
    await expect(sensitiveEmail).toHaveAttribute('aria-pressed', 'false')
    await sensitiveEmail.click()
    await expect(sensitiveEmail).toHaveAttribute('aria-pressed', 'true')
    await expect(sensitiveEmail).toHaveAttribute('aria-label', 'Hide sensitive email')

    await firstAssistant.getByRole('button', { name: 'Copy code' }).click()
    await expect(firstAssistant.getByRole('status')).toHaveText('Code copied.')
    await expect.poll(() => clipboardText(page)).toBe('const result = "verified"\n')

    await firstAssistant.getByLabel('Copy message').click()
    await expect(page.getByTestId('talos-mobile-message-action-status')).toHaveText('Message copied.')
    await expect.poll(() => clipboardText(page)).toBe(richReply)

    const firstUser = page.locator('article[data-message-kind="user"]').first()
    await firstUser.getByLabel('More message actions').click()
    await page.getByRole('menuitem', { name: 'Reuse prompt' }).click()
    await expect(page.getByLabel('Message TALOS')).toHaveValue(initialPrompt)
    await expect(page.getByLabel('Message TALOS')).toBeFocused()

    await firstUser.getByLabel('Resend message').click()
    await expect(page.getByRole('heading', { name: 'Resent response' })).toBeVisible()
    await firstAssistant.getByLabel('Retry assistant response').click()
    await expect(page.getByRole('heading', { name: 'Retried response' })).toBeVisible()
    expect(completions).toHaveLength(3)
    expect(JSON.stringify(completions[1])).toContain(initialPrompt)
    expect(JSON.stringify(completions[2])).toContain('Resent response')

    await send(page, 'Trigger the controlled provider failure.')
    const fault = page.getByTestId('talos-mobile-controlled-fault')
    await expect(fault).toContainText('Provider failure')
    await expect(fault).toContainText('PROVIDER_HTTP_429')
    await expect(fault).toContainText('HTTP 429')
    await expect(fault).toContainText('Retry available')

    await page.reload()
    await expect(page.getByRole('heading', { name: 'Verified result' })).toBeVisible({ timeout: 15_000 })
    await expect(page.getByRole('heading', { name: 'Resent response' })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Retried response' })).toBeVisible()
    await expect(page.getByTestId('talos-mobile-controlled-fault')).toContainText('PROVIDER_HTTP_429')
    await expect(page.locator('article[data-message-kind="user"]').first().getByLabel('More message actions')).toBeVisible()

    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
    expect(overflow).toBeLessThanOrEqual(0)
    expect(completions).toHaveLength(4)
    expect(pageErrors).toEqual([])
})
