import { expect, test, type Page } from '@playwright/test'
import { geminiCompletionFulfill } from './completionMock'

// F5 — #28 back-to-bottom pill: scrolling up detaches the live edge and shows
// the pill; tapping it rejoins the bottom.
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
    await page.getByLabel('Google Gemini API key').fill('e2e-f5-key')
    await page.getByLabel('Save Google Gemini key').click()
    await expect(page.getByText('1 model available', { exact: true })).toBeVisible()
    await page.getByLabel('Default chat model').click()
    await page.locator('[data-testid="talos-themed-select-item"][data-value="gemini:gemini-live"]').click()
    if (await page.locator('[data-testid="talos-mobile-tool-sheet"]').count() > 0) { await page.locator('[data-testid="talos-sheet-back"]').click(); await page.waitForTimeout(320) }
    if (await page.locator('[data-testid="talos-mobile-tool-sheet"]').count() > 0) { await page.locator('[data-testid="talos-sheet-back"]').click(); await page.waitForTimeout(320) }
    await expect(page.locator(SHEET)).toHaveCount(0)
}

test('#28 scrolling up shows the back-to-bottom pill and tapping it rejoins the edge', async ({ page }) => {
    const longReply = Array.from({ length: 90 }, (_, i) => `Riga ${i + 1} della risposta lunga.`).join('\n\n')
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
        await route.fulfill(geminiCompletionFulfill(request.url(), JSON.stringify(geminiResponse(longReply)), longReply))
    })
    await configureGemini(page)

    const composer = page.getByLabel('Message TALOS')
    await composer.fill('Scrivi una risposta molto lunga')
    await expect(page.getByLabel('Send message')).toBeEnabled({ timeout: 15_000 })
    await composer.press('Enter')
    await expect(page.getByText('Riga 90 della risposta lunga.', { exact: true })).toBeVisible()

    const scroller = page.locator('[data-testid="talos-chat-scroll"]')
    // The thread opens at the live edge — no pill.
    await expect(page.locator('[data-testid="talos-back-to-bottom"]')).toHaveCount(0)

    // Scroll up: the pill appears and the position HOLDS (no re-anchor).
    await scroller.hover()
    await page.mouse.wheel(0, -1200)
    const pill = page.locator('[data-testid="talos-back-to-bottom"]')
    await expect(pill).toBeVisible()
    const topAfterScroll = await scroller.evaluate((el) => el.scrollTop)
    await page.waitForTimeout(300)
    expect(await scroller.evaluate((el) => el.scrollTop)).toBe(topAfterScroll)

    // Tap the pill: back to the bottom, pill gone.
    await pill.click()
    await expect(pill).toHaveCount(0)
    // Smooth scroll animates — poll until the edge is reached.
    await expect.poll(async () => scroller.evaluate((el) => el.scrollHeight - el.scrollTop - el.clientHeight < 30))
        .toBe(true)
})

test('stations: tasks and notes persist across reload, doctor reports honestly', async ({ page }) => {
    await page.goto('/')

    // Tasks
    await page.locator(MENU).click()
    await page.locator(SIDEBAR).getByRole('button', { name: 'Open Tasks' }).click()
    await expect(page.locator('[data-testid="talos-tasks-screen"]')).toBeVisible()
    await page.locator('[data-testid="talos-task-title"]').fill('Verifica claim EV')
    await page.getByLabel('Optional run ID').fill('run-e2e-42')
    await page.locator('[data-testid="talos-task-save"]').click()
    const taskRow = page.locator('[data-testid="talos-task-row"]')
    await expect(taskRow).toHaveCount(1)
    await expect(taskRow.first()).toContainText('run-e2e-42'.slice(0, 12))
    await page.getByLabel('Cycle status of Verifica claim EV').click()
    await expect(taskRow.first()).toHaveAttribute('data-task-status', 'doing')

    // Notes
    if (await page.locator('[data-testid="talos-mobile-tool-sheet"]').count() > 0) { await page.locator('[data-testid="talos-sheet-back"]').click(); await page.waitForTimeout(320) }
    if (await page.locator('[data-testid="talos-mobile-tool-sheet"]').count() > 0) { await page.locator('[data-testid="talos-sheet-back"]').click(); await page.waitForTimeout(320) }
    await page.locator(MENU).click()
    await page.locator(SIDEBAR).getByRole('button', { name: 'Open Notes' }).click()
    await expect(page.locator('[data-testid="talos-notes-screen"]')).toBeVisible()
    await page.locator('[data-testid="talos-note-title"]').fill('Osservazione')
    await page.locator('[data-testid="talos-note-content"]').fill('Il recognizer richiede i servizi Google.')
    await page.locator('[data-testid="talos-note-save"]').click()
    await expect(page.locator('[data-testid="talos-note-row"]')).toHaveCount(1)
    await expect(page.locator('[data-testid="talos-note-row"]').first()).toContainText('untrusted')

    // Restart: both persist (encrypted local store)
    await page.reload()
    // The reload restores the /notes station sheet over the chat — assert the
    // persisted note right there, then walk back out.
    await page.locator('[data-testid="talos-boot-logo"]').waitFor({ state: 'visible', timeout: 10_000 }).catch(() => undefined)
    await page.locator('[data-testid="talos-boot-logo"]').waitFor({ state: 'detached', timeout: 20_000 })
    await expect(page.locator('[data-testid="talos-note-row"]')).toHaveCount(1)
    if (await page.locator('[data-testid="talos-mobile-tool-sheet"]').count() > 0) { await page.locator('[data-testid="talos-sheet-back"]').click(); await page.waitForTimeout(320) }
    if (await page.locator('[data-testid="talos-mobile-tool-sheet"]').count() > 0) { await page.locator('[data-testid="talos-sheet-back"]').click(); await page.waitForTimeout(320) }
    await page.locator(MENU).click()
    await page.locator(SIDEBAR).getByRole('button', { name: 'Open Tasks' }).click()
    await expect(page.locator('[data-testid="talos-task-row"]')).toHaveCount(1)
    await expect(page.locator('[data-testid="talos-task-row"]').first()).toHaveAttribute('data-task-status', 'doing')
    if (await page.locator('[data-testid="talos-mobile-tool-sheet"]').count() > 0) { await page.locator('[data-testid="talos-sheet-back"]').click(); await page.waitForTimeout(320) }
    if (await page.locator('[data-testid="talos-mobile-tool-sheet"]').count() > 0) { await page.locator('[data-testid="talos-sheet-back"]').click(); await page.waitForTimeout(320) }

    // Doctor
    if (await page.locator('[data-testid="talos-mobile-tool-sheet"]').count() > 0) { await page.locator('[data-testid="talos-sheet-back"]').click(); await page.waitForTimeout(320) }
    if (await page.locator('[data-testid="talos-mobile-tool-sheet"]').count() > 0) { await page.locator('[data-testid="talos-sheet-back"]').click(); await page.waitForTimeout(320) }
    await page.locator(MENU).click()
    await page.locator(SIDEBAR).getByRole('button', { name: 'Open Doctor' }).click()
    await expect(page.locator('[data-testid="talos-doctor-screen"]')).toBeVisible()
    await expect(page.locator('[data-doctor-id="storage"]')).toContainText('ready')
    await expect(page.locator('[data-doctor-id="platform"]')).toContainText('web preview')
    // 7 rows: build stamp + platform + storage + speech + biometrics + share + network.
    await expect(page.locator('[data-testid="talos-doctor-row"]')).toHaveCount(7)
    await expect(page.locator('[data-doctor-id="build"]')).toBeVisible()
})
