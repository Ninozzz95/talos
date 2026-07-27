import { expect, test, type Page } from '@playwright/test'

// F2 journeys — intro modal (versioned, mobile-truth), first-run checklist,
// immersive header toggle, Account replay and the app lock. The config seeds
// the intro as seen; fresh-state journeys override with an empty storage.
const INTRO = '[data-testid="talos-intro-modal"]'
const HEADER = '[data-testid="talos-mobile-header"]'
const CHECKLIST = '[data-testid="talos-setup-checklist"]'
const LOCK = '[data-testid="talos-lock-screen"]'

const EMPTY_STATE = { cookies: [], origins: [] }
const WIZARD = '[data-testid="talos-account-wizard"]'

// Owner 2026-07-27: the account wizard no longer follows setup on a fresh
// install — it opens only on an explicit replay from Settings. A fresh install
// must land in the shell with nothing else in the way, which is what this
// asserts rather than dismisses.
async function expectNoWizard(page: Page): Promise<void> {
    await expect(page.locator(WIZARD)).toHaveCount(0)
}

// Owner #15: fresh installs boot into the NEW defaults.
test.describe('fresh-install defaults (owner #15)', () => {
    test.use({ storageState: EMPTY_STATE })

    test('boots with immersive chrome and the drawer-mode composer', async ({ page }) => {
        await page.goto('/')
        const intro = page.locator(INTRO)
        await expect(intro).toBeVisible({ timeout: 15000 })
        await page.locator('[data-testid="talos-setup-skip"]').click()
        await expectNoWizard(page)
        await expect(page.locator('[data-testid="talos-mobile-immersive-chrome"]')).toBeVisible({ timeout: 15000 })
        await expect(page.locator(HEADER)).toHaveCount(0)
        await expect(page.locator('[aria-label="Add to chat"]')).toBeVisible()
        await expect(page.locator('[data-testid="talos-composer-model-chip"]')).toBeVisible()
    })
})

const SEEN_NOT_DISMISSED = {
    cookies: [],
    origins: [{
        origin: 'http://127.0.0.1:4173',
        localStorage: [{
            name: 'CapacitorStorage.talos.mobile.settings',
            value: JSON.stringify({
                defaults_v3: true,
            presentation_v2: true,
            shell: { immersive_header: false, composer_drawer: false },
            onboarding: { intro_version: 1, intro_outcome: 'completed', setup_dismissed: false, wizard_version: 1, wizard_outcome: 'completed' },
            }),
        }],
    }],
}

test.describe('intro first-run (fresh install)', () => {
    test.use({ storageState: EMPTY_STATE })

    test('asks for the two things TALOS needs, completes and never reopens', async ({ page }) => {
        await page.goto('/')
        const intro = page.locator(INTRO)
        await expect(intro).toBeVisible({ timeout: 15000 })
        // It opens by saying what TALOS is, with the claim made against itself.
        await expect(intro).toContainText('no us to reach')
        await expect(intro).toContainText('Zethos')
        await page.locator('[data-testid="talos-setup-begin"]').click()
        // Then two steps, named after what the person controls.
        await expect(intro.locator('[data-testid="talos-setup-step"]')).toHaveCount(2)
        // Step 1 leads with the consequence, because the PIN really is the key.
        await expect(intro).toContainText('no recovery')
        // Nothing that does not exist on this device is promised anywhere.
        await expect(intro).not.toContainText('ROADMAP')
        await page.locator('[data-testid="talos-setup-next"]').click()
        // Step 2 keeps the Keystore truth (never a server-side claim).
        await expect(intro).toContainText('Keystore')
        await page.locator('[data-testid="talos-intro-cta"]').click()
        await expect(intro).toHaveCount(0)
        // The wizard must NOT appear behind it any more.
        await expectNoWizard(page)
        // The completed version persists — a reload must NOT re-offer the
        // intro; fresh installs land in the immersive default shell (#15).
        await page.reload()
        await expect(page.locator('[data-testid="talos-mobile-immersive-chrome"]')).toBeVisible({ timeout: 15000 })
        await expect(page.locator(INTRO)).toHaveCount(0)
    })

    test('skipping persists the outcome and the intro stays closed', async ({ page }) => {
        await page.goto('/')
        const intro = page.locator(INTRO)
        await expect(intro).toBeVisible({ timeout: 15000 })
        await page.locator('[data-testid="talos-setup-skip"]').click()
        await expect(intro).toHaveCount(0)
        await expectNoWizard(page)
        await page.reload()
        await expect(page.locator('[data-testid="talos-mobile-immersive-chrome"]')).toBeVisible({ timeout: 15000 })
        await expect(page.locator(INTRO)).toHaveCount(0)
    })
})

test.describe('first-run setup checklist', () => {
    test.use({ storageState: SEEN_NOT_DISMISSED })

    test('shows honest steps, routes to Models, and dismissal persists', async ({ page }) => {
        await page.goto('/')
        const checklist = page.locator(CHECKLIST)
        await expect(checklist).toBeVisible({ timeout: 15000 })
        await expect(checklist).toContainText('Add a provider key')
        await expect(checklist).toContainText('Choose your model')
        await page.locator('[data-testid="talos-setup-step-key"]').click()
        await expect(page.locator('[data-settings-panel="models"]')).toBeVisible()
        await page.goBack()
        await expect(checklist).toBeVisible({ timeout: 15000 })
        await page.locator('[data-testid="talos-setup-dismiss"]').click()
        await expect(checklist).toHaveCount(0)
        await page.reload()
        await expect(page.locator(HEADER)).toBeVisible({ timeout: 15000 })
        await expect(page.locator(CHECKLIST)).toHaveCount(0)
    })
})

test('immersive header toggle swaps the header bar for floating pills', async ({ page }) => {
    await page.goto('/')
    await expect(page.locator(HEADER)).toBeVisible({ timeout: 15000 })
    await page.locator('[aria-label="Open menu"]').click()
    await page.locator('[data-testid="talos-mobile-sidebar"] [aria-label="Open Settings"]').click()
    await page.locator('[data-settings-tab="appearance"]').click()
    await page.locator('[role="switch"][aria-label="Immersive header"]').click()
    await page.goBack()
    await expect(page.locator(HEADER)).toHaveCount(0)
    const chrome = page.locator('[data-testid="talos-mobile-immersive-chrome"]')
    await expect(chrome).toBeVisible()
    await chrome.locator('[aria-label="Chat options"]').click()
    await expect(page.locator('[data-testid="talos-chat-options-menu"]')).toContainText('New chat')
})

test('Account panel replays first-run setup from Settings', async ({ page }) => {
    await page.goto('/')
    await expect(page.locator(HEADER)).toBeVisible({ timeout: 15000 })
    await page.locator('[aria-label="Open menu"]').click()
    await page.locator('[data-testid="talos-mobile-sidebar"] [aria-label="Open Settings"]').click()
    await page.locator('[data-settings-tab="account"]').click()
    await page.locator('[data-testid="talos-replay-intro"]').click()
    await expect(page.locator(INTRO)).toBeVisible({ timeout: 15000 })
    await page.locator('[data-testid="talos-setup-begin"]').click()
    await expect(page.locator(INTRO)).toContainText('Your PIN is the key')
    await expect(page.locator(INTRO).locator('[data-testid="talos-setup-step"]')).toHaveCount(2)
})

test('app lock arms with a PIN, gates the cold start, and only a real PIN unlocks', async ({ page }) => {
    await page.goto('/')
    await expect(page.locator(HEADER)).toBeVisible({ timeout: 15000 })
    await page.locator('[aria-label="Open menu"]').click()
    await page.locator('[data-testid="talos-mobile-sidebar"] [aria-label="Open Settings"]').click()
    await page.locator('[data-settings-tab="account"]').click()
    await page.locator('[data-testid="talos-applock-toggle"]').click()
    // F4-#25: OTP-style setup — 6 digits, then the confirm step auto-arms.
    await page.locator('[data-testid="talos-applock-pin"]').fill('432187')
    await page.locator('[data-testid="talos-applock-pin-confirm"]').fill('432187')
    await expect(page.locator('[data-testid="talos-applock-toggle"]')).toHaveAttribute('aria-checked', 'true')

    await page.reload()
    const lock = page.locator(LOCK)
    await expect(lock).toBeVisible({ timeout: 15000 })
    await lock.locator('[data-testid="talos-lock-pin"]').fill('0000')
    await lock.locator('[data-testid="talos-lock-submit"]').click()
    await expect(lock).toContainText(/wrong pin/i)
    await lock.locator('[data-testid="talos-lock-pin"]').fill('432187')
    await lock.locator('[data-testid="talos-lock-submit"]').click()
    await expect(page.locator(LOCK)).toHaveCount(0)
    await expect(page.locator(HEADER)).toBeVisible()
})
