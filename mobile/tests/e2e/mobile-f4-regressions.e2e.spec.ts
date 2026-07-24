import { expect, test, type Page } from '@playwright/test'
import { geminiCompletionFulfill } from './completionMock'

// F4 owner regressions: #19 pasted links must survive into the visible
// message; #20 the prompt enhancer must be actionable with a prompt present.
const MENU = '[aria-label="Open menu"]'
const SIDEBAR = '[data-testid="talos-mobile-sidebar"]'
const SHEET = '[data-testid="talos-mobile-tool-sheet"]'

function geminiResponse(text: string) {
    return {
        modelVersion: 'gemini-live',
        candidates: [{ finishReason: 'STOP', content: { parts: [{ text }] } }],
    }
}

async function configureGemini(page: Page): Promise<void> {
    await page.goto('/')
    await page.locator(MENU).click()
    await page.locator(`${SIDEBAR} [aria-label="Open Settings"]`).click()
    await expect(page.locator(SHEET)).toBeVisible()
    await page.locator('[data-settings-tab="models"]').click()
    if (await page.locator('[data-provider="gemini"] button[aria-controls="provider-gemini-body"]').getAttribute('aria-expanded') === 'false') await page.locator('[data-provider="gemini"] button[aria-controls="provider-gemini-body"]').click()
    await page.getByLabel('Google Gemini API key').fill('e2e-f4-key')
    await page.getByLabel('Save Google Gemini key').click()
    await expect(page.getByText('1 model available', { exact: true })).toBeVisible()
    await page.getByLabel('Default chat model').click()
    await page.locator('[data-testid="talos-themed-select-item"][data-value="gemini:gemini-live"]').click()
    await page.getByLabel('Back to chat').click()
    await expect(page.locator(SHEET)).toHaveCount(0)
}

function mockProvider(page: Page): Promise<void> {
    return page.route('https://generativelanguage.googleapis.com/**', async (route) => {
        const request = route.request()
        if (request.method() === 'GET') {
            await route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify({
                    models: [{
                        name: 'models/gemini-live', displayName: 'Gemini Live',
                        inputTokenLimit: 128000, outputTokenLimit: 8192,
                        supportedGenerationMethods: ['generateContent'],
                    }],
                }),
            })
            return
        }
        const reply = 'Understood, checking that page.'
        await route.fulfill(geminiCompletionFulfill(request.url(), JSON.stringify(geminiResponse(reply)), reply))
    })
}

test('#19 a pasted URL survives into the sent message text', async ({ page }) => {
    await mockProvider(page)
    await configureGemini(page)

    const composer = page.getByLabel('Message TALOS')
    const text = 'Guarda questo link https://example.com/articolo?id=42 e dimmi cosa ne pensi'
    await composer.fill(text)
    // The URL must still be in the field after the browse suggestion appears.
    await expect(composer).toHaveValue(text)
    await expect(page.getByLabel('Send message')).toBeEnabled({ timeout: 15_000 })
    await composer.press('Enter')
    await expect(page.getByText('Understood, checking that page.', { exact: true })).toBeVisible()
    // #19 contract: the visible user message still contains the URL (scoped to
    // the message article — the header title may echo the prompt too).
    await expect(page.locator('article[data-message-kind="user"]').first()
        .getByText('https://example.com/articolo?id=42', { exact: false })).toBeVisible()
})

// F4-#22 — owner device report: "non riesco a modificare o eliminare una chat".
// The device runs the REAL defaults (immersive header) — reproduce there, not
// in the classic-seeded shell the other journeys use.
test.describe('#22 rename/delete on the immersive shell', () => {
    test.use({
        storageState: {
            cookies: [],
            origins: [{
                origin: 'http://127.0.0.1:4173',
                localStorage: [{
                    name: 'CapacitorStorage.talos.mobile.settings',
                    value: JSON.stringify({
                        defaults_v3: true,
                        presentation_v2: true,
                        shell: { immersive_header: true, composer_drawer: false },
                        onboarding: { intro_version: 1, intro_outcome: 'completed', setup_dismissed: true },
                    }),
                }],
            }],
        },
    })

    test('renames and deletes the active chat from the 3-dot menu', async ({ page }) => {
        await mockProvider(page)
        await configureGemini(page)

        const composer = page.getByLabel('Message TALOS')
        await composer.fill('Ciao, prima chat')
        await expect(page.getByLabel('Send message')).toBeEnabled({ timeout: 15_000 })
        await composer.press('Enter')
        await expect(page.getByText('Understood, checking that page.', { exact: true })).toBeVisible()

        // Rename through the immersive chat options menu; the truth lives on
        // the Chats page (phone IA: sidebar -> Chats -> rows).
        await page.getByLabel('Chat options').click()
        await page.getByRole('menuitem', { name: 'Rename chat' }).click()
        const nameInput = page.getByLabel('Chat name')
        await expect(nameInput).toBeVisible()
        await nameInput.fill('Titolo rinominato')
        await page.getByRole('button', { name: 'Save' }).click()
        await expect(nameInput).toHaveCount(0)
        await page.locator(MENU).click()
        await page.locator(SIDEBAR).getByRole('button', { name: /^Chats/ }).click()
        const row = page.locator('[data-testid="talos-chats-row"]')
        await expect(row).toHaveCount(1)
        await expect(row.first()).toContainText('Titolo rinominato')

        // Back into the chat, delete through the same menu — thread resets and
        // the Chats page ends up empty.
        await page.locator('[data-testid="talos-chats-open"]').first().click()
        await page.getByLabel('Chat options').click()
        await page.getByRole('menuitem', { name: 'Delete chat' }).click()
        await expect(page.getByText('Delete chat?', { exact: true })).toBeVisible()
        await page.getByRole('button', { name: 'Delete', exact: true }).click()
        await expect(page.getByText('Understood, checking that page.', { exact: true })).toHaveCount(0)
        await page.locator(MENU).click()
        await page.locator(SIDEBAR).getByRole('button', { name: /^Chats/ }).click()
        await expect(page.locator('[data-testid="talos-chats-row"]')).toHaveCount(0)
    })

    test('Memory station: create, inject as untrusted context, disclose, manage', async ({ page }) => {
        const providerBodies: string[] = []
        await page.route('https://generativelanguage.googleapis.com/**', async (route) => {
            const request = route.request()
            if (request.method() === 'GET') {
                await route.fulfill({
                    status: 200,
                    contentType: 'application/json',
                    body: JSON.stringify({
                        models: [{
                            name: 'models/gemini-live', displayName: 'Gemini Live',
                            inputTokenLimit: 128000, outputTokenLimit: 8192,
                            supportedGenerationMethods: ['generateContent'],
                        }],
                    }),
                })
                return
            }
            providerBodies.push(request.postData() ?? '')
            const reply = 'Ricevuto, uso il contesto.'
            await route.fulfill(geminiCompletionFulfill(request.url(), JSON.stringify(geminiResponse(reply)), reply))
        })
        await configureGemini(page)

        // Create a memory from the station.
        await page.locator(MENU).click()
        await page.locator(SIDEBAR).getByRole('button', { name: 'Open Memory' }).click()
        await expect(page.locator('[data-testid="talos-memory-screen"]')).toBeVisible()
        await page.locator('[data-testid="talos-memory-new"]').click()
        await page.locator('[data-testid="talos-memory-title"]').fill('Preferenza tono')
        await page.locator('[data-testid="talos-memory-content"]').fill('Rispondi sempre in italiano conciso.')
        await page.locator('[data-testid="talos-memory-save"]').click()
        await expect(page.locator('[data-testid="talos-memory-row"]')).toHaveCount(1)

        // Back to chat: the send must inject the untrusted block into the
        // PROVIDER payload and disclose the usage on the message.
        await page.getByLabel('Back to chat').click()
        const composer = page.getByLabel('Message TALOS')
        await composer.fill('Che piano abbiamo?')
        await expect(page.getByLabel('Send message')).toBeEnabled({ timeout: 15_000 })
        await composer.press('Enter')
        await expect(page.getByText('Ricevuto, uso il contesto.', { exact: true })).toBeVisible()

        const chatBody = providerBodies.find((body) => body.includes('Che piano abbiamo?'))
        expect(chatBody).toBeDefined()
        expect(chatBody).toContain('TALOS_MEMORY_CONTEXT')
        expect(chatBody).toContain('Rispondi sempre in italiano conciso.')
        expect(chatBody).toContain('USER_TASK')
        await expect(page.locator('[data-testid="talos-used-memories"]')).toContainText('1 memory used')

        // Persisted message stays verbatim (no injected block in the thread).
        const userMessage = page.locator('article[data-message-kind="user"]').first()
        await expect(userMessage).toContainText('Che piano abbiamo?')
        await expect(userMessage).not.toContainText('TALOS_MEMORY_CONTEXT')

        // Disable the memory: the next send must NOT inject it.
        await page.locator(MENU).click()
        await page.locator(SIDEBAR).getByRole('button', { name: 'Open Memory' }).click()
        await page.getByLabel('Disable memory Preferenza tono').click()
        await expect(page.locator('[data-memory-status="disabled"]')).toHaveCount(1)
        await page.getByLabel('Back to chat').click()
        await composer.fill('Seconda domanda')
        await composer.press('Enter')
        await expect(page.locator('article[data-message-kind="assistant"]')).toHaveCount(2)
        const secondBody = providerBodies.find((body) => body.includes('Seconda domanda'))
        expect(secondBody).toBeDefined()
        expect(secondBody).not.toContain('TALOS_MEMORY_CONTEXT')
    })

    test('#16 exports the chat from the 3-dot menu with desktop-parity artifacts', async ({ page }) => {
        await mockProvider(page)
        await configureGemini(page)

        const composer = page.getByLabel('Message TALOS')
        await composer.fill('Chat da esportare')
        await expect(page.getByLabel('Send message')).toBeEnabled({ timeout: 15_000 })
        await composer.press('Enter')
        await expect(page.getByText('Understood, checking that page.', { exact: true })).toBeVisible()

        await page.getByLabel('Chat options').click()
        await page.getByRole('menuitem', { name: 'Export chat' }).click()
        const sheet = page.locator('[data-testid="talos-export-sheet"]')
        await expect(sheet).toBeVisible()

        await sheet.getByLabel('Export Markdown transcript').click()
        const preview = page.locator('[data-testid="talos-session-export-preview"]')
        await expect(preview).toContainText('# TALOS Session Export')
        await expect(preview).toContainText('Chat da esportare')
        await expect(page.locator('[data-testid="talos-export-share"]')).toBeEnabled()

        await sheet.getByLabel('Export JSON evidence pack').click()
        await expect(preview).toContainText('talos_session_export')
        await expect(preview).toContainText('markdown_transcript')

        await sheet.getByLabel('Export Benchmark scenario').click()
        await expect(preview).toContainText('talos_session_benchmark_scenario')
    })

    test('#23/F5.1 hold-dropdown archives a chat and restores it from Archived', async ({ page }) => {
        await mockProvider(page)
        await configureGemini(page)

        const composer = page.getByLabel('Message TALOS')
        await composer.fill('Chat da archiviare')
        await expect(page.getByLabel('Send message')).toBeEnabled({ timeout: 15_000 })
        await composer.press('Enter')
        await expect(page.getByText('Understood, checking that page.', { exact: true })).toBeVisible()

        await page.locator(MENU).click()
        await page.locator(SIDEBAR).getByRole('button', { name: /^Chats/ }).click()
        const row = page.locator('[data-testid="talos-chats-row"]')
        await expect(row).toHaveCount(1)

        // The sidebar drawer keeps the body input-locked while it animates
        // out (reka-ui modal behavior) — wait for the release like a user
        // naturally does before gesturing.
        await page.waitForFunction(() => getComputedStyle(document.body).pointerEvents !== 'none')

        // F5.1 (owner): TAP-AND-HOLD opens the row dropdown.
        const box = (await row.first().boundingBox())!
        await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
        await page.mouse.down()
        await page.waitForTimeout(650)
        await page.mouse.up()
        const menu = page.locator('[data-testid="talos-chats-row-menu"]')
        await expect(menu).toBeVisible()
        await menu.getByRole('menuitem', { name: 'Archive' }).click()

        await expect(page.locator('[data-testid="talos-chats-row"]')).toHaveCount(0)
        const toggle = page.locator('[data-testid="talos-chats-archived-toggle"]')
        await expect(toggle).toContainText('Archived (1)')
        await toggle.click()

        const archivedRow = page.locator('[data-testid="talos-chats-archived-row"]')
        await expect(archivedRow).toContainText('Chat da archiviare')
        const archivedBox = (await archivedRow.first().boundingBox())!
        await page.mouse.move(archivedBox.x + archivedBox.width / 2, archivedBox.y + archivedBox.height / 2)
        await page.mouse.down()
        await page.waitForTimeout(650)
        await page.mouse.up()
        await expect(menu).toBeVisible()
        await menu.getByRole('menuitem', { name: 'Unarchive' }).click()
        await expect(page.locator('[data-testid="talos-chats-row"]')).toHaveCount(1)
        await expect(page.locator('[data-testid="talos-chats-archived-toggle"]')).toHaveCount(0)
    })

    test('renames and deletes a chat from the Chats page rows', async ({ page }) => {
        await mockProvider(page)
        await configureGemini(page)

        const composer = page.getByLabel('Message TALOS')
        await composer.fill('Ciao, chat da lista')
        await expect(page.getByLabel('Send message')).toBeEnabled({ timeout: 15_000 })
        await composer.press('Enter')
        await expect(page.getByText('Understood, checking that page.', { exact: true })).toBeVisible()

        await page.locator(MENU).click()
        await page.locator(SIDEBAR).getByRole('button', { name: /^Chats/ }).click()
        const row = page.locator('[data-testid="talos-chats-row"]')
        await expect(row).toHaveCount(1)

        // F5.1: actions live in the hold dropdown.
        async function holdFirstRow(): Promise<void> {
            await page.waitForFunction(() => getComputedStyle(document.body).pointerEvents !== 'none')
            const box = (await row.first().boundingBox())!
            await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
            await page.mouse.down()
            await page.waitForTimeout(650)
            await page.mouse.up()
            await expect(page.locator('[data-testid="talos-chats-row-menu"]')).toBeVisible()
        }

        await holdFirstRow()
        await page.locator('[data-testid="talos-chats-row-menu"]').getByRole('menuitem', { name: 'Rename' }).click()
        const nameInput = page.getByLabel('Chat name')
        await nameInput.fill('Lista rinominata')
        await page.getByRole('button', { name: 'Save' }).click()
        await expect(nameInput).toHaveCount(0)
        await expect(row.first()).toContainText('Lista rinominata')

        await holdFirstRow()
        await page.locator('[data-testid="talos-chats-row-menu"]').getByRole('menuitem', { name: 'Delete' }).click()
        await expect(page.getByText('Delete chat?', { exact: true })).toBeVisible()
        await page.getByRole('button', { name: 'Delete', exact: true }).click()
        await expect(page.locator('[data-testid="talos-chats-row"]')).toHaveCount(0)
    })
})

test('#20 the enhancer control is actionable once a prompt exists', async ({ page }) => {
    await mockProvider(page)
    await configureGemini(page)

    const composer = page.getByLabel('Message TALOS')
    await composer.fill('Migliora questo prompt per favore')
    // Classic bar (seeded classic shell): the wand must be enabled with text.
    const wand = page.getByLabel('Improve prompt')
    await expect(wand).toBeEnabled({ timeout: 15_000 })
})
