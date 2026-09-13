import { test as setup, expect } from '@playwright/test'
import {
    TALOS_IMMERSIVE_SEED,
    TALOS_PROVIDER_IMMERSIVE_STATE,
    TALOS_PROVIDER_STATE,
    configureChatProvider,
    mockChatProvider,
} from './chatFixtures'

/**
 * Configure a provider ONCE, for every test that needs one.
 *
 * Owner 2026-07-31: «quasi 10 minuti per e2e». Twenty-one of eighty-three tests
 * were driving the same Settings journey before they could send a message —
 * open the drawer, open Settings, the models tab, expand the provider, type a
 * key, wait for discovery, pick the default model, close the sheet — and none
 * of them was testing any of it.
 *
 * So it runs here and the resulting storage is saved. This is the shape
 * Playwright documents for authentication, and it is honest: the state is
 * PRODUCED by the real flow rather than hand-written. A hand-written blob would
 * drift silently the first time the settings shape changed, and every test
 * would inherit the lie.
 *
 * TWO states, because `storageState` is one blob and cannot be merged. Some
 * journeys run on the immersive shell and seed their own settings, so a single
 * classic-shell state would have silently replaced theirs — which it did on the
 * first attempt, and seven tests failed with a send button that never enabled.
 *
 * Specs opt IN by naming a file. Fresh-install, intro and provider-discovery
 * journeys must NOT inherit a configured provider, so this is never a default.
 */
setup('a provider on the classic shell', async ({ page }) => {
    await mockChatProvider(page)
    await page.goto('/')
    await configureChatProvider(page, 'e2e-shared-key')
    // Proven ready before it is saved: a state captured mid-journey would hand
    // every test a half-configured app and blame them for it. `toBeEnabled`
    // alone was not that proof — it passes with the Settings sheet still
    // covering the composer — so the sheet is checked gone as well.
    await expect(page.locator('[data-testid="talos-mobile-tool-sheet"]')).toHaveCount(0)
    await expect(page.getByLabel('Message TALOS')).toBeEnabled()
    await page.context().storageState({ path: TALOS_PROVIDER_STATE })
})

setup.describe('immersive shell', () => {
    setup.use({ storageState: TALOS_IMMERSIVE_SEED })

    setup('a provider on the immersive shell', async ({ page }) => {
        await mockChatProvider(page)
        await page.goto('/')
        await configureChatProvider(page, 'e2e-shared-key')
        await expect(page.locator('[data-testid="talos-mobile-tool-sheet"]')).toHaveCount(0)
        await expect(page.getByLabel('Message TALOS')).toBeEnabled()
        await page.context().storageState({ path: TALOS_PROVIDER_IMMERSIVE_STATE })
    })
})
