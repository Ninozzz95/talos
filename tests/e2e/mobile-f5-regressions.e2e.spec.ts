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
    await page.goto('/')

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
    await closeToolSheet(page)
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
    await closeToolSheet(page)
    await page.locator(MENU).click()
    await page.locator(SIDEBAR).getByRole('button', { name: 'Open Tasks' }).click()
    await expect(page.locator('[data-testid="talos-task-row"]')).toHaveCount(1)
    await expect(page.locator('[data-testid="talos-task-row"]').first()).toHaveAttribute('data-task-status', 'doing')
    await closeToolSheet(page)

    // Doctor
    await closeToolSheet(page)
    await page.locator(MENU).click()
    await page.locator(SIDEBAR).getByRole('button', { name: 'Open Doctor' }).click()
    await expect(page.locator('[data-testid="talos-doctor-screen"]')).toBeVisible()
    // Owner 2026-07-26: three fixed segments, and one verdict line on top so a
    // healthy device can be dismissed without reading anything.
    await expect(page.locator('[data-testid="talos-doctor-verdict"]')).toBeVisible()
    // One hook for every tab strip in the app since the shared strip landed:
    // the Doctor's own `data-doctor-tab` was the last screen-specific one.
    await expect(page.locator('[data-talos-tabs="doctor"] [data-talos-tab]')).toHaveCount(3)

    // Checks that PASSED are folded into a single row; opening it reveals them.
    await page.locator('[data-testid="talos-doctor-passing-toggle"]').click()
    await expect(page.locator('[data-doctor-id="storage"]')).toContainText('ready')
    await expect(page.locator('[data-doctor-id="platform"]')).toContainText('web preview')
    // 7 rows: build stamp + platform + storage + speech + biometrics + share + network.
    await expect(page.locator('[data-testid="talos-doctor-row"]')).toHaveCount(7)
    await expect(page.locator('[data-doctor-id="build"]')).toBeVisible()

    // Timings are recorded only behind the debug switch — and the screen says
    // so, rather than showing an empty list that reads as "it was fast".
    await page.locator('[data-talos-tab="data"]').click()
    await expect(page.locator('[data-testid="talos-doctor-timings-off"]')).toBeVisible()
    await page.locator('[data-talos-tab="advanced"]').click()
    await expect(page.locator('[data-testid="talos-debug-diagnostics"]')).toBeVisible()
})
