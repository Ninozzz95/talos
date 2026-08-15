import { expect, test, type Page } from '@playwright/test'
import { TALOS_PROVIDER_STATE } from './chatFixtures'

/**
 * The provider is configured ONCE for the whole suite (provider.setup.ts) and
 * inherited here. Driving the Settings journey in every test cost about two
 * minutes of the ten, and not one of these tests is about it — owner
 * 2026-07-31: «quasi 10 minuti per e2e».
 */
test.use({ storageState: TALOS_PROVIDER_STATE })


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
    await page.goto('/')
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
 * Owner 2026-07-31: «la possibilità di aprire una nuova chat in incognito quando
 * sei in una normale, dai puntini in alto a destra, deve sparire. La lasciamo
 * esclusivamente quando si inizia una nuova chat».
 *
 * It always opened a NEW chat, so it was never destructive — but it read as an
 * offer to make THIS conversation anonymous, and sat one tap away in every chat
 * he had. Offered only where it means what it says.
 */
test('the chat menu stops offering incognito once the conversation has started', async ({ page }) => {
    await mockProvider(page)
    await page.goto('/')

    // On a chat with nothing in it, both doors are there.
    await expect(page.getByTestId('talos-make-temporary')).toBeVisible()
    await page.getByRole('button', { name: 'Chat options' }).click()
    await expect(page.getByRole('menuitem', { name: 'Incognito mode', exact: true })).toBeVisible()
    await page.keyboard.press('Escape')

    await sendMessage(page, 'Una conversazione che voglio tenere')

    // Now neither is, and the rest of the menu is untouched.
    await expect(page.getByTestId('talos-make-temporary')).toHaveCount(0)
    await page.getByRole('button', { name: 'Chat options' }).click()
    await expect(page.getByRole('menuitem', { name: 'Incognito mode', exact: true })).toHaveCount(0)
    await expect(page.getByRole('menuitem', { name: 'New chat', exact: true })).toBeVisible()
    await expect(page.getByRole('menuitem', { name: 'Delete chat', exact: true })).toBeVisible()
})

/**
 * The second door, on the welcome itself — owner 2026-07-31: «la pill modalità
 * incognito sotto la scritta welcome è sparita e non doveva sparire».
 *
 * It is a door, so it gets the same test as the other one. A control that
 * reaches the right function and is then undone a frame later is exactly the
 * defect this file exists for.
 */
test('the welcome pill is a door into incognito, and it holds', async ({ page }) => {
    await mockProvider(page)
    await page.goto('/')
    await sendMessage(page, 'Una conversazione che voglio tenere')

    await chooseFromChatMenu(page, 'New chat')
    await page.getByTestId('talos-make-temporary').click()

    await expect(page.getByTestId('talos-temporary-chat-badge')).toBeVisible()
    await historySettlesAt(page, 1)
    await expect(page.getByTestId('talos-temporary-chat-badge')).toBeVisible()
    // Inside incognito the same pill reads the other way, and is the way out.
    await expect(page.getByTestId('talos-make-temporary')).toHaveCount(0)
    await expect(page.getByTestId('talos-make-permanent')).toBeVisible()
})

/** The way back, by the same rule: incognito goes, whatever is in it. */
test('leaving incognito takes the incognito chat with it', async ({ page }) => {
    await mockProvider(page)
    await page.goto('/')
    await sendMessage(page, 'Prima conversazione')

    // Incognito is reachable only from a chat with nothing in it, so that is
    // where this starts — the same route the owner's thumb now has.
    await chooseFromChatMenu(page, 'New chat')
    await chooseFromChatMenu(page, 'Incognito mode')
    await expect(page.getByTestId('talos-temporary-chat-badge')).toBeVisible()
    await sendMessage(page, 'Qualcosa di privato')

    // The switch now reads the other way — that is how you know where you are.
    await chooseFromChatMenu(page, 'Normal mode')

    // …and it asks first, because leaving destroys what is in it. Owner
    // 2026-07-31 watched that happen with no warning and reported it as a bug.
    await expect(page.getByText('Leave incognito mode?', { exact: true })).toBeVisible()
    // Still in it while the question stands: the private message is on screen.
    await expect(page.getByText('Qualcosa di privato', { exact: true })).toBeVisible()
    await page.getByTestId('talos-leave-incognito-confirm').click()

    // Out, and into an ordinary chat with nothing in it — so the welcome offers
    // the way back IN, not the way back out.
    await expect(page.getByTestId('talos-make-temporary')).toBeVisible()
    await expect(page.getByTestId('talos-make-permanent')).toHaveCount(0)

    // One: the conversation it was opened from. The incognito chat is gone, and
    // the ordinary chat you have just been put into has nothing in it yet, so
    // it is not in the history either (owner 2026-07-31).
    await historySettlesAt(page, 1)
    await expect(page.getByText('Qualcosa di privato', { exact: true })).toHaveCount(0)
})
