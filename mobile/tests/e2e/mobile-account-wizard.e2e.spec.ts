import { expect, test, type Page } from '@playwright/test'

// N1 — guided account-creation wizard. First-run gate opens AFTER the intro is
// resolved (intro_version:1) and only once per wizard version (wizard_version:0
// on a fresh install). Local-first, no fake auth. File-local storageState.
const WIZARD = '[data-testid="talos-account-wizard"]'
const PRIMARY = '[data-testid="talos-wizard-primary"]'
const MENU = '[aria-label="Open menu"]'
const SIDEBAR = '[data-testid="talos-mobile-sidebar"]'
const SHEET = '[data-testid="talos-mobile-tool-sheet"]'

function settings(onboarding: Record<string, unknown>): string {
    return JSON.stringify({
        defaults_v3: true, presentation_v2: true,
        shell: { immersive_header: true, composer_drawer: true },
        onboarding,
    })
}
function stateWith(onboarding: Record<string, unknown>) {
    return {
        cookies: [],
        origins: [{
            origin: 'http://127.0.0.1:4173',
            localStorage: [{ name: 'CapacitorStorage.talos.mobile.settings', value: settings(onboarding) }],
        }],
    }
}
// Fresh install: intro resolved, wizard never run → the wizard opens.
const FRESH = stateWith({ intro_version: 1, intro_outcome: 'completed', setup_dismissed: true })
// Returning user: both resolved → nothing intercepts.
const RETURNING = stateWith({ intro_version: 1, intro_outcome: 'completed', setup_dismissed: true, wizard_version: 1, wizard_outcome: 'completed' })

async function next(page: Page): Promise<void> { await page.locator(PRIMARY).click() }

test.describe('account wizard — first run', () => {
    test.use({ storageState: FRESH })

    test('walks the flow, persists the name, and never reopens', async ({ page }) => {
        await page.goto('/')
        await expect(page.locator(WIZARD)).toBeVisible({ timeout: 15000 })
        await expect(page.locator(PRIMARY)).toHaveText('Get started')

        await next(page) // → identity
        await expect(page.locator('[data-testid="wizard-step-identity"]')).toBeVisible()
        await page.locator('[data-testid="wizard-name"]').fill('Nino')
        await next(page) // → personalize
        await expect(page.locator('[data-testid="wizard-step-personalize"]')).toBeVisible()
        await next(page) // → protect
        await expect(page.locator('[data-testid="wizard-step-protect"]')).toBeVisible()
        await next(page) // → signin
        await expect(page.locator('[data-testid="wizard-step-signin"]')).toBeVisible()
        await next(page) // → done
        await expect(page.locator('[data-testid="wizard-step-done"]')).toBeVisible()
        await expect(page.locator(PRIMARY)).toHaveText('Enter TALOS')
        await next(page) // finish
        await expect(page.locator(WIZARD)).toHaveCount(0)

        // The typed name persisted into the local account (sidebar shows it).
        await page.locator(MENU).click()
        await expect(page.locator(SIDEBAR)).toContainText('Nino')

        // Reload: the wizard does NOT reopen (outcome persisted).
        await page.reload()
        await expect(page.locator(WIZARD)).toHaveCount(0)
    })

    test('skipping from welcome completes with defaults and does not reopen', async ({ page }) => {
        await page.goto('/')
        await expect(page.locator(WIZARD)).toBeVisible({ timeout: 15000 })
        await page.locator('[data-testid="wizard-skip-all"]').click()
        await expect(page.locator(WIZARD)).toHaveCount(0)
        await page.reload()
        await expect(page.locator(WIZARD)).toHaveCount(0)
    })

    test('OAuth is predisposed but honestly gated — a tap surfaces the gate, no session', async ({ page }) => {
        await page.goto('/')
        await expect(page.locator(WIZARD)).toBeVisible({ timeout: 15000 })
        await next(page); await next(page); await next(page); await next(page) // → signin
        await expect(page.locator('[data-testid="wizard-step-signin"]')).toBeVisible()
        await page.locator('[data-testid="wizard-oauth-google"]').click()
        // The honest gate toast (unique wording vs the step body that also
        // mentions the sovereign core).
        await expect(page.getByText(/Sign-in syncs with the sovereign core/i)).toBeVisible()
        // Still on the wizard, no navigation/session.
        await expect(page.locator(WIZARD)).toBeVisible()
    })

    test('the protect step opens the device app-lock setup modal', async ({ page }) => {
        await page.goto('/')
        await expect(page.locator(WIZARD)).toBeVisible({ timeout: 15000 })
        await next(page); await next(page); await next(page) // → protect
        await expect(page.locator('[data-testid="wizard-step-protect"]')).toBeVisible()
        await page.locator('[data-testid="wizard-setup-pin"]').click()
        await expect(page.locator('[data-testid="talos-applock-modal"]')).toBeVisible()
    })

    test('Back walks one step up (welcome → identity → back to welcome)', async ({ page }) => {
        await page.goto('/')
        await expect(page.locator(WIZARD)).toBeVisible({ timeout: 15000 })
        await next(page) // → identity
        await expect(page.locator('[data-testid="wizard-step-identity"]')).toBeVisible()
        await page.locator('[data-testid="talos-wizard-back"]').click()
        await expect(page.locator('[data-testid="wizard-step-welcome"]')).toBeVisible()
        await expect(page.locator(PRIMARY)).toHaveText('Get started')
    })
})

test.describe('account wizard — replay', () => {
    test.use({ storageState: RETURNING })

    test('does not open for a returning user but is replayable from Settings', async ({ page }) => {
        await page.goto('/')
        await expect(page.locator(WIZARD)).toHaveCount(0)

        await page.locator(MENU).click()
        await page.locator(`${SIDEBAR} [aria-label="Open Settings"]`).click()
        await expect(page.locator(SHEET)).toBeVisible()
        await page.locator('[data-settings-tab="account"]').click()
        await page.locator('[data-testid="talos-wizard-replay"]').click()
        await expect(page.locator(WIZARD)).toBeVisible({ timeout: 15000 })
    })
})
