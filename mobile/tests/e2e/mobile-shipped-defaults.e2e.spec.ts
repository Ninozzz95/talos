import { expect, test, type Page } from '@playwright/test'
import { configureChatProvider } from './chatFixtures'

/**
 * This spec seeds a THIRD shell — the shipped default, immersive AND drawer
 * composer — and `storageState` is one blob that cannot be merged, so it
 * configures its own provider rather than earning a saved state for one test.
 */


// R3-12 — the playwright default storageState seeds the CLASSIC shell, so the
// SHIPPED default (owner #15: immersive chrome + drawer composer) was the
// least-covered configuration (F1-F6 review finding). This spec exercises the
// core flows on the REAL shipped default — including the R1 device-proven
// confirm dialog on the Memory station, the #1 device-bite debt. File-local
// storageState, no shared state (playwright best practice).
const MENU = '[aria-label="Open menu"]'
const SIDEBAR = '[data-testid="talos-mobile-sidebar"]'
const SHEET = '[data-testid="talos-mobile-tool-sheet"]'

test.use({
    storageState: {
        cookies: [],
        origins: [{
            origin: 'http://127.0.0.1:4173',
            localStorage: [{
                name: 'CapacitorStorage.talos.mobile.settings',
                // The SHIPPED default: immersive chrome AND the drawer composer.
                value: JSON.stringify({
                    defaults_v3: true,
                    presentation_v2: true,
                    shell: { immersive_header: true, composer_drawer: true },
                    onboarding: { intro_version: 2, intro_outcome: 'completed', setup_dismissed: true },
                }),
            }],
        }],
    },
})

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
        const reply = 'Shipped-default reply.'
        await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({
                modelVersion: 'gemini-live',
                candidates: [{ finishReason: 'STOP', content: { parts: [{ text: reply }] } }],
            }),
        })
    })
}


test('sends a message end-to-end on the immersive + drawer-composer default', async ({ page }) => {
    await mockProvider(page)
    await page.goto('/')
    await configureChatProvider(page)

    // Immersive chrome is the shipped chrome (no classic header bar).
    await expect(page.locator('[data-testid="talos-mobile-immersive-chrome"]')).toBeVisible()
    await expect(page.locator('[data-testid="talos-mobile-header"]')).toHaveCount(0)

    const composer = page.getByLabel('Message TALOS')
    await composer.fill('Ciao dal default spedito')
    await expect(page.getByLabel('Send message')).toBeEnabled({ timeout: 15_000 })
    await composer.press('Enter')
    await expect(page.getByText('Shipped-default reply.', { exact: true })).toBeVisible()
})

test('R1: Memory station delete confirm renders and works on the shipped default', async ({ page }) => {
    await page.goto('/')
    await page.locator(MENU).click()
    await page.locator(`${SIDEBAR} [aria-label="Open Memory"]`).click()
    await expect(page.locator(SHEET)).toBeVisible()

    // Create a memory.
    await page.locator('[data-testid="talos-memory-new"]').click()
    await page.locator('[data-testid="talos-memory-title"]').fill('Ricorda questo')
    await page.locator('[data-testid="talos-memory-content"]').fill('Contenuto della memoria di test.')
    await page.locator('[data-testid="talos-memory-save"]').click()
    const row = page.locator('[data-testid="talos-memory-row"]')
    await expect(row).toHaveCount(1)

    // Delete it — the R1 device-proven confirm dialog MUST render (reka Dialog
    // never appeared on the owner's WebView; this was device-bite debt #1).
    await page.getByLabel('Delete memory Ricorda questo').click()
    const dialog = page.locator('[data-testid="talos-confirm-dialog"]')
    await expect(dialog).toBeVisible()
    await expect(dialog.getByText('Delete memory?', { exact: true })).toBeVisible()
    await dialog.getByRole('button', { name: 'Delete', exact: true }).click()
    await expect(page.locator('[data-testid="talos-memory-row"]')).toHaveCount(0)
})
