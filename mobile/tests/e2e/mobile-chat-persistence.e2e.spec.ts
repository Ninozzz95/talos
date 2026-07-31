import { expect, test, type Page } from '@playwright/test'
import { TALOS_PROVIDER_STATE } from './chatFixtures'
import { geminiCompletionFulfill } from './completionMock'
import { closeToolSheet } from './toolSheet'

/**
 * The provider is configured ONCE for the whole suite (provider.setup.ts) and
 * inherited here. Driving the Settings journey in every test cost about two
 * minutes of the ten, and not one of these tests is about it — owner
 * 2026-07-31: «quasi 10 minuti per e2e».
 */
test.use({ storageState: TALOS_PROVIDER_STATE })


const MENU = '[aria-label="Open menu"]'
const SIDEBAR = '[data-testid="talos-mobile-sidebar"]'
const SHEET = '[data-testid="talos-mobile-tool-sheet"]'

function geminiResponse(text: string) {
    return {
        modelVersion: 'gemini-live',
        candidates: [{ finishReason: 'STOP', content: { parts: [{ text }] } }],
    }
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
        const reply = replies[completions.length - 1] ?? 'Unexpected completion.'
        await route.fulfill(geminiCompletionFulfill(
            request.url(),
            JSON.stringify(geminiResponse(reply)),
            reply,
        ))
    })

    await page.goto('/')

    const firstTitle = 'Remember alpha as the value.'
    await sendAndExpect(page, firstTitle, 'Alpha is recorded.')
    await sendAndExpect(page, 'What value did I give you?', 'The earlier value was alpha.')
    expect(JSON.stringify(completions[1])).toContain(firstTitle)
    expect(JSON.stringify(completions[1])).toContain('Alpha is recorded.')

    await page.getByTestId('talos-mobile-header').getByLabel('Chat options').click()
    await page.getByRole('menuitem', { name: 'New chat' }).click()
    await expect(page.getByTestId('talos-empty-brand')).toBeVisible()

    const secondTitle = 'Draft a secondary release plan.'
    await sendAndExpect(page, secondTitle, 'Secondary thread is isolated.')
    await expect(page.getByTestId('talos-mobile-header-title')).toHaveText(secondTitle)

    await page.reload()
    await expect(page.getByTestId('talos-mobile-header-title')).toHaveText(secondTitle, { timeout: 15_000 })
    await expect(page.getByText('Secondary thread is isolated.', { exact: true })).toBeVisible()

    // F3-T3 (owner #12, Claude pattern): on phones the session list lives in
    // the dedicated Chats page reached from the sidebar entry.
    async function openChatsPage(): Promise<void> {
        await page.getByLabel('Open menu').click()
        await page.getByTestId('talos-sidebar-chats-entry').click()
        await expect(page.getByTestId('talos-chats-screen')).toBeVisible()
    }

    // F5.1: row actions live in the hold dropdown.
    async function holdRowByTitle(title: string): Promise<void> {
        // The sidebar drawer input-locks the body while animating out.
        await page.waitForFunction(() => getComputedStyle(document.body).pointerEvents !== 'none')
        const row = page.getByTestId('talos-chats-row').filter({ hasText: title })
        const box = (await row.first().boundingBox())!
        await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
        await page.mouse.down()
        await page.waitForTimeout(650)
        await page.mouse.up()
        await expect(page.locator('[data-testid="talos-chats-row-menu"]')).toBeVisible()
    }

    await openChatsPage()
    await expect(page.getByTestId('talos-sidebar-chats-entry')).toHaveCount(0)
    await expect(page.getByTestId('talos-chats-row')).toHaveCount(2)
    await page.getByTestId('talos-chats-row').filter({ hasText: firstTitle }).getByTestId('talos-chats-open').click()
    await expect(page.getByText('Alpha is recorded.', { exact: true })).toBeVisible()
    await expect(page.getByText('The earlier value was alpha.', { exact: true })).toBeVisible()
    await expect(page.getByText('Secondary thread is isolated.', { exact: true })).toHaveCount(0)

    await openChatsPage()
    await holdRowByTitle(firstTitle)
    await page.locator('[data-testid="talos-chats-row-menu"]').getByRole('menuitem', { name: 'Rename' }).click()
    await page.getByLabel('Chat name').fill('Primary evidence')
    await page.getByRole('button', { name: 'Save', exact: true }).click()
    await expect(page.getByTestId('talos-chats-row').filter({ hasText: 'Primary evidence' })).toBeVisible()
    await closeToolSheet(page)
    await expect(page.getByTestId('talos-mobile-header-title')).toHaveText('Primary evidence')

    await page.reload()
    await expect(page.getByTestId('talos-mobile-header-title')).toHaveText('Primary evidence', { timeout: 15_000 })
    await expect(page.getByText('The earlier value was alpha.', { exact: true })).toBeVisible()

    await openChatsPage()
    // F5.1: delete lives in the hold dropdown.
    await holdRowByTitle('Primary evidence')
    await page.locator('[data-testid="talos-chats-row-menu"]').getByRole('menuitem', { name: 'Delete' }).click()
    await expect(page.getByRole('heading', { name: 'Delete chat?' })).toBeVisible()
    await page.getByRole('button', { name: 'Delete', exact: true }).click()
    await expect(page.getByTestId('talos-chats-row')).toHaveCount(1)
    await closeToolSheet(page)
    await expect(page.getByTestId('talos-mobile-header-title')).toHaveText(secondTitle)
    await expect(page.getByText('Secondary thread is isolated.', { exact: true })).toBeVisible()

    await page.reload()
    await expect(page.getByTestId('talos-mobile-header-title')).toHaveText(secondTitle, { timeout: 15_000 })
    await openChatsPage()
    await expect(page.getByTestId('talos-chats-row').filter({ hasText: 'Primary evidence' })).toHaveCount(0)
    await expect(page.getByTestId('talos-chats-row')).toHaveAttribute('data-active', 'true')

    expect(completions).toHaveLength(3)
    expect(localDataRequests).toEqual([])
    expect(pageErrors).toEqual([])
})
