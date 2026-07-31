import { expect, type Page } from '@playwright/test'
import { closeToolSheet } from './toolSheet'

/**
 * Getting a chat into a state worth testing: a provider that answers, a model
 * selected, and a message actually sent.
 *
 * Copied by hand into six specs before this existed, which is how they drifted.
 * It also matters more since 2026-07-31: a chat enters the HISTORY only when it
 * has something in it, so a test that needs a chat in a list has to put
 * something in it — clicking "New chat" is no longer enough, and should not be.
 */
const MENU = '[aria-label="Open menu"]'
const SIDEBAR = '[data-testid="talos-mobile-sidebar"]'
const SHEET = '[data-testid="talos-mobile-tool-sheet"]'

function geminiResponse(text: string) {
    return {
        modelVersion: 'gemini-live',
        candidates: [{ finishReason: 'STOP', content: { parts: [{ text }] } }],
    }
}

/** A Gemini that lists one model and answers everything with `reply`. */
export async function mockChatProvider(page: Page, reply = 'Understood.'): Promise<void> {
    await page.route('https://generativelanguage.googleapis.com/**', async (route) => {
        if (route.request().method() === 'GET') {
            await route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify({
                    models: [{ name: 'models/gemini-live', supportedGenerationMethods: ['generateContent'] }],
                }),
            })
            return
        }
        await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify(geminiResponse(reply)),
        })
    })
}

/** Save a key and pick the model, through the real Settings flow. */
export async function configureChatProvider(page: Page, key = 'e2e-key'): Promise<void> {
    await page.locator(MENU).click()
    await page.locator(`${SIDEBAR} [aria-label="Open Settings"]`).click()
    await expect(page.locator(SHEET)).toBeVisible()
    await page.locator('[data-settings-tab="models"]').click()
    const expander = page.locator('[data-provider="gemini"] button[aria-controls="provider-gemini-body"]')
    if (await expander.getAttribute('aria-expanded') === 'false') await expander.click()
    await page.getByLabel('Google Gemini API key').fill(key)
    await page.getByLabel('Save Google Gemini key').click()
    await expect(page.getByText('1 model available', { exact: true })).toBeVisible()
    await page.getByLabel('Default chat model').click()
    await page.locator('[data-testid="talos-themed-select-item"][data-value="gemini:gemini-live"]').click()
    await closeToolSheet(page)
}

/** Send one message and wait for the answer to land. */
export async function sendChatMessage(page: Page, text: string, reply = 'Understood.'): Promise<void> {
    const composer = page.getByLabel('Message TALOS')
    await composer.fill(text)
    await expect(page.getByLabel('Send message')).toBeEnabled({ timeout: 15_000 })
    await composer.press('Enter')
    await expect(page.getByText(reply, { exact: true }).first()).toBeVisible()
}

/** Everything above, in the order a person would do it. */
export async function startChatWithContent(page: Page, text: string): Promise<void> {
    await mockChatProvider(page)
    await configureChatProvider(page)
    await sendChatMessage(page, text)
}
