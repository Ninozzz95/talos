import { expect, test, type Page } from '@playwright/test'
import { geminiCompletionFulfill } from './completionMock'

const MENU = '[aria-label="Open menu"]'
const SIDEBAR = '[data-testid="talos-mobile-sidebar"]'
const SHEET = '[data-testid="talos-mobile-tool-sheet"]'

interface GeminiRequestBody {
    systemInstruction?: { parts?: Array<{ text?: string }> }
    contents?: Array<{ parts?: Array<{ text?: string }> }>
}

function geminiResponse(text: string) {
    return {
        modelVersion: 'gemini-live',
        candidates: [{ finishReason: 'STOP', content: { parts: [{ text }] } }],
    }
}

function firstUserText(body: GeminiRequestBody): string {
    return body.contents?.[0]?.parts?.[0]?.text ?? ''
}

async function configureGemini(page: Page): Promise<void> {
    await page.goto('/')
    await page.locator(MENU).click()
    await page.locator(`${SIDEBAR} [aria-label="Open Settings"]`).click()
    await expect(page.locator(SHEET)).toBeVisible()
    await page.locator('[data-settings-tab="models"]').click()
    await page.getByLabel('Google Gemini API key').fill('e2e-enhancer-gemini-key')
    await page.getByLabel('Save Google Gemini key').click()
    await expect(page.getByText('1 model available', { exact: true })).toBeVisible()
    await page.getByLabel('Default chat model').click()
    await page.locator('[data-testid="talos-themed-select-item"][data-value="gemini:gemini-live"]').click()
    await page.getByLabel('Back to chat').click()
    await expect(page.locator(SHEET)).toHaveCount(0)
}

test('uses the selected model to preview cancel insert replace and finally send', async ({ page }) => {
    const enhancementBodies: GeminiRequestBody[] = []
    const chatBodies: GeminiRequestBody[] = []

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

        const body = request.postDataJSON() as GeminiRequestBody
        const trustedInstruction = body.systemInstruction?.parts?.[0]?.text ?? ''
        if (trustedInstruction.includes('TALOS Prompt Enhancer')) {
            enhancementBodies.push(body)
            const payload = JSON.parse(firstUserText(body)) as { original_prompt: string }
            const turn = enhancementBodies.length
            await route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify(geminiResponse(JSON.stringify({
                    enhanced_prompt: `Enhanced ${turn}: ${payload.original_prompt}`,
                    summary: `Improved structure for preview ${turn}.`,
                    applied_principles: ['Explicit objective', 'Acceptance checks'],
                }))),
            })
            return
        }

        chatBodies.push(body)
        await route.fulfill(geminiCompletionFulfill(
            request.url(),
            JSON.stringify(geminiResponse('Provider accepted the final enhanced prompt.')),
            'Provider accepted the final enhanced prompt.',
        ))
    })

    await configureGemini(page)

    const composer = page.getByLabel('Message TALOS')
    const original = 'Draft a concise launch note for the mobile release.'
    await composer.fill(original)

    await page.getByLabel('Improve prompt').click()
    const preview = page.getByRole('dialog', { name: 'Prompt enhancement preview' })
    await expect(preview).toBeVisible()
    await expect(page.getByTestId('talos-mobile-enhancement-provenance'))
        .toHaveText('Enhanced with gemini · gemini-live')
    await expect(page.getByTestId('talos-mobile-enhancement-output'))
        .toContainText(`Enhanced 1: ${original}`)
    await preview.getByRole('button', { name: 'Cancel', exact: true }).click()
    await expect(preview).toHaveCount(0)
    await expect(composer).toHaveValue(original)

    await page.getByLabel('Improve prompt').click()
    await expect(preview).toBeVisible()
    await preview.getByRole('button', { name: 'Insert below', exact: true }).click()
    const inserted = `${original}\n\nEnhanced 2: ${original}`
    await expect(composer).toHaveValue(inserted)

    await page.getByLabel('Improve prompt').click()
    await expect(preview).toBeVisible()
    await preview.getByRole('button', { name: 'Replace prompt', exact: true }).click()
    const replaced = `Enhanced 3: ${inserted}`
    await expect(composer).toHaveValue(replaced)

    await composer.press('Enter')
    await expect(page.getByText('Provider accepted the final enhanced prompt.', { exact: true })).toBeVisible()
    await expect(page.getByTestId('talos-mobile-message-list').getByText(replaced, { exact: true }))
        .toBeVisible()

    expect(enhancementBodies).toHaveLength(3)
    expect(chatBodies).toHaveLength(1)
    expect(enhancementBodies.every((body) => (
        (body.systemInstruction?.parts?.[0]?.text ?? '').includes('untrusted data')
    ))).toBe(true)
    expect(firstUserText(enhancementBodies[0]!)).toBe(JSON.stringify({
        task: 'enhance_prompt',
        language_policy: 'same_as_original_prompt',
        original_prompt: original,
    }))
    expect(firstUserText(chatBodies[0]!)).toBe(replaced)
    await expect(page.locator(SHEET)).toHaveCount(0)
})

test('operates slash commands and disabled reasons at 360px without overflow', async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 640 })
    await page.goto('/')

    const composer = page.getByLabel('Message TALOS')
    await composer.fill('/')
    const menu = page.getByRole('listbox', { name: 'Composer slash commands' })
    await expect(menu).toBeVisible()
    await expect(menu.getByRole('option')).toHaveCount(21)

    await composer.fill('/file')
    const attachFile = menu.getByRole('option', { name: /Attach file/ })
    await expect(attachFile).toHaveAttribute('aria-disabled', 'true')
    await expect(attachFile).toContainText('The local Vault ingestion bridge is not installed.')
    await composer.press('Enter')
    await expect(composer).toHaveValue('/file')
    await expect(page).toHaveURL(/\/$/)

    await composer.fill('/model')
    await composer.press('Enter')
    await expect(page).toHaveURL(/\/settings\?tab=models$/)
    await expect(page.locator('[data-settings-panel="models"]')).toBeVisible()
    await page.getByLabel('Back to chat').click()
    await expect(page.locator(SHEET)).toHaveCount(0)

    await composer.fill('/context')
    await composer.press('Enter')
    await expect(page).toHaveURL(/\/context$/)
    await expect(page.locator(SHEET)).toHaveAttribute('aria-label', 'Library')
    await page.getByLabel('Back to chat').click()

    await composer.fill('/new')
    await composer.press('Enter')
    await expect(composer).toHaveValue('')
    await page.getByLabel('Open menu').click()
    // F3-T3 (owner #12): phones surface the count on the Chats entry; the
    // session list lives in the dedicated Chats page.
    await expect(page.locator('[data-testid="talos-sidebar-chats-entry"]')).toContainText('1')

    const horizontalOverflow = await page.evaluate(() => (
        document.documentElement.scrollWidth - document.documentElement.clientWidth
    ))
    expect(horizontalOverflow).toBeLessThanOrEqual(0)
})

test('preserves the draft on malformed provider output and reload', async ({ page }) => {
    let enhancementCalls = 0
    let chatCalls = 0
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
                        supportedGenerationMethods: ['generateContent'],
                    }],
                }),
            })
            return
        }

        const body = request.postDataJSON() as GeminiRequestBody
        if ((body.systemInstruction?.parts?.[0]?.text ?? '').includes('TALOS Prompt Enhancer')) {
            enhancementCalls += 1
            await route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify(geminiResponse('{"enhanced_prompt":[]}')),
            })
            return
        }

        chatCalls += 1
        await route.fulfill({
            status: 500,
            contentType: 'application/json',
            body: JSON.stringify({ error: { message: 'Unexpected chat request.' } }),
        })
    })

    await configureGemini(page)

    const composer = page.getByLabel('Message TALOS')
    const draft = 'Preserve this exact draft after malformed enhancement output.'
    await composer.fill(draft)
    await page.getByLabel('Improve prompt').click()
    await expect(page.getByTestId('talos-mobile-enhancer-error'))
        .toContainText('The selected model returned an invalid prompt enhancement.')
    await expect(composer).toHaveValue(draft)
    await expect(page.getByTestId('talos-empty-brand')).toBeVisible()

    await page.waitForTimeout(600)
    await page.reload()

    await expect(composer).toHaveValue(draft, { timeout: 15_000 })
    await expect(page.locator(SHEET)).toHaveCount(0)
    await expect(page.getByTestId('talos-empty-brand')).toBeVisible()
    expect(enhancementCalls).toBe(1)
    expect(chatCalls).toBe(0)
})
