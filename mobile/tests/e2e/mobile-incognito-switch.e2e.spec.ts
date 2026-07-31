import { expect, test, type Page } from '@playwright/test'
import { closeToolSheet } from './toolSheet'

/**
 * Owner 2026-07-31, on video: he pressed «Modalità incognito», the incognito
 * chat rendered for one frame, and the app threw him back into the conversation
 * he had open before — with its messages on screen. Frame 00:28 shows incognito;
 * frame 00:28+0.1s shows the old chat.
 *
 * The unit tests pin the store rule. This walks the thumb, on a real build,
 * because that defect lived UNDER the switch: entering incognito worked, and
 * then the cleanup of the blank chat it replaced re-pointed the screen. Every
 * test that stopped at "incognito appeared" would have passed — it did appear.
 * The assertion has to survive what happens next.
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

async function mockProvider(page: Page): Promise<void> {
    await page.route('https://generativelanguage.googleapis.com/**', async (route) => {
        if (route.request().method() === 'GET') {
            await route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify({ models: [{ name: 'models/gemini-live', supportedGenerationMethods: ['generateContent'] }] }),
            })
            return
        }
        await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify(geminiResponse('Understood.')),
        })
    })
}

async function configureGemini(page: Page): Promise<void> {
    await page.goto('/')
    await page.locator(MENU).click()
    await page.locator(`${SIDEBAR} [aria-label="Open Settings"]`).click()
    await expect(page.locator(SHEET)).toBeVisible()
    await page.locator('[data-settings-tab="models"]').click()
    if (await page.locator('[data-provider="gemini"] button[aria-controls="provider-gemini-body"]').getAttribute('aria-expanded') === 'false') {
        await page.locator('[data-provider="gemini"] button[aria-controls="provider-gemini-body"]').click()
    }
    await page.getByLabel('Google Gemini API key').fill('e2e-incognito-key')
    await page.getByLabel('Save Google Gemini key').click()
    await expect(page.getByText('1 model available', { exact: true })).toBeVisible()
    await page.getByLabel('Default chat model').click()
    await page.locator('[data-testid="talos-themed-select-item"][data-value="gemini:gemini-live"]').click()
    await closeToolSheet(page)
}

async function sendMessage(page: Page, text: string): Promise<void> {
    const composer = page.getByLabel('Message TALOS')
    await composer.fill(text)
    await expect(page.getByLabel('Send message')).toBeEnabled({ timeout: 15_000 })
    await composer.press('Enter')
    await expect(page.getByText('Understood.', { exact: true }).first()).toBeVisible()
}

async function chooseFromChatMenu(page: Page, item: string): Promise<void> {
    // The open menu carries the SAME aria-label as the button that opens it, and
    // lingers for its leave transition — so target the button by role, and wait
    // for the previous menu to be gone rather than racing its animation.
    await expect(page.getByTestId('talos-chat-options-menu')).toHaveCount(0)
    await page.getByRole('button', { name: 'Chat options' }).click()
    await page.getByRole('menuitem', { name: item, exact: true }).click()
}

/**
 * Wait for the switch to have FINISHED, not merely started.
 *
 * The defect arrived after the visible part: creating the incognito chat is the
 * first half, disposing of the chat it replaced is the second, and it was the
 * second that moved the screen. The history count only reaches its final value
 * once that has landed, so it is the honest settle point — and it is also what
 * the owner checks by hand ("apri la lista chat: deve essercene una sola").
 */
async function historySettlesAt(page: Page, count: number): Promise<void> {
    await page.locator(MENU).click()
    await expect(page.getByTestId('talos-sidebar-chats-entry')).toContainText(String(count))
    await page.locator(`${SIDEBAR} [aria-label="Close menu"]`).click()
    await expect(page.locator(SIDEBAR)).toHaveCount(0)
}

test('entering incognito leaves you in incognito, and stays there', async ({ page }) => {
    await mockProvider(page)
    await configureGemini(page)
    await sendMessage(page, 'Sei capace di generazione immagini?')

    // The blank chat the owner was in when he pressed it.
    await chooseFromChatMenu(page, 'New chat')
    await expect(page.getByTestId('talos-empty-brand')).toBeVisible()

    await chooseFromChatMenu(page, 'Incognito mode')
    await expect(page.getByTestId('talos-temporary-chat-badge')).toBeVisible()

    // The blank chat is cleaned up: one conversation left in the history, and
    // the incognito one is in no history at all.
    await historySettlesAt(page, 1)

    // The assertion the video failed: still incognito AFTER the cleanup landed.
    await expect(page.getByTestId('talos-temporary-chat-badge')).toBeVisible()
    await expect(page.getByTestId('talos-temporary-welcome')).toBeVisible()
    // And the old conversation has not been dragged onto the screen with it.
    await expect(page.getByText('Understood.', { exact: true })).toHaveCount(0)
})

/**
 * The chat menu offers incognito from ANY chat, so this is one tap away at all
 * times. The rule that decides what is thrown away used to be written three
 * times over, and the copy behind this path checked nothing at all.
 */
test('entering incognito from a chat with content does not destroy it', async ({ page }) => {
    await mockProvider(page)
    await configureGemini(page)
    await sendMessage(page, 'Una conversazione che voglio tenere')

    await chooseFromChatMenu(page, 'Incognito mode')
    await expect(page.getByTestId('talos-temporary-chat-badge')).toBeVisible()

    // Nothing was replaced, so the conversation is still there — and still the
    // only one, because incognito never joins the history.
    await historySettlesAt(page, 1)
    await expect(page.getByTestId('talos-temporary-chat-badge')).toBeVisible()

    // Not merely counted: reachable, with what was written in it. The reply is
    // the proof — a row shows its title whether or not the messages survived.
    await page.locator(MENU).click()
    await page.locator(SIDEBAR).getByTestId('talos-sidebar-chats-entry').click()
    const row = page.locator('[data-testid="talos-chats-row"]')
    await expect(row).toHaveCount(1)
    await expect(row.first()).toContainText('Una conversazione che voglio tenere')
    await row.first().click()
    await expect(page.getByText('Understood.', { exact: true }).first()).toBeVisible()
})

/** The way back, by the same rule: incognito goes, whatever is in it. */
test('leaving incognito takes the incognito chat with it', async ({ page }) => {
    await mockProvider(page)
    await configureGemini(page)
    await sendMessage(page, 'Prima conversazione')

    await chooseFromChatMenu(page, 'Incognito mode')
    await expect(page.getByTestId('talos-temporary-chat-badge')).toBeVisible()
    await sendMessage(page, 'Qualcosa di privato')

    // The switch now reads the other way — that is how you know where you are.
    await chooseFromChatMenu(page, 'Normal mode')
    await expect(page.getByTestId('talos-temporary-chat-badge')).toHaveCount(0)

    // Two: the conversation it was opened from, and the ordinary chat you have
    // just been put into. The incognito one is in neither — it was never in the
    // history, and leaving took it away.
    await historySettlesAt(page, 2)
    await expect(page.getByText('Qualcosa di privato', { exact: true })).toHaveCount(0)
})
