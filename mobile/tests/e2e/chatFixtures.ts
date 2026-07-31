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
/**
 * Where the once-configured provider state is saved (see provider.setup.ts).
 *
 * It lives HERE, in a plain module, because Playwright refuses to let one test
 * file import another — and a spec that imported the setup would be silently
 * dropped from the run rather than told off.
 */
export const TALOS_PROVIDER_STATE = 'tests/e2e/.auth/provider.json'
/** The same, on the immersive shell — `storageState` is one blob, never merged. */
export const TALOS_PROVIDER_IMMERSIVE_STATE = 'tests/e2e/.auth/provider-immersive.json'

/** The shell those journeys seed for themselves; the setup starts from it. */
export const TALOS_IMMERSIVE_SEED = {
    cookies: [],
    origins: [{
        origin: 'http://127.0.0.1:4173',
        localStorage: [{
            name: 'CapacitorStorage.talos.mobile.settings',
            value: JSON.stringify({
                defaults_v3: true,
                presentation_v2: true,
                shell: { immersive_header: true, composer_drawer: false },
                onboarding: { intro_version: 2, intro_outcome: 'completed', setup_dismissed: true },
            }),
        }],
    }],
}

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
