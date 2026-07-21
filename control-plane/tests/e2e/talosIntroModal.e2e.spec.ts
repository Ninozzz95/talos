import { expect, test, type Page } from '@playwright/test'
import { installTalosApiMocks, type TalosSettingsRequestLedger } from './helpers/talosApiMocks'
import { waitForTalosWorkspaceReady } from './helpers/talosWorkspaceReady'

const setupEmail = 'talos-e2e@example.test'
const setupPassword = 'talos-e2e-password-123'

async function authenticated(page: Page) {
    return await page.locator('#talos-workspace-root[data-authenticated="true"]').count() > 0
}

async function signIn(page: Page, email: string, password: string) {
    await page.goto('/login', { waitUntil: 'domcontentloaded' })
    const form = page.locator('#talos-login-form')
    if (!await form.isVisible().catch(() => false)) return false
    await form.getByLabel('Email').fill(email)
    await form.getByLabel('Password').fill(password)
    await form.getByRole('button', { name: 'Sign in' }).click()
    return authenticated(page)
}

async function openAuthenticatedWorkspace(page: Page) {
    await page.goto('/', { waitUntil: 'domcontentloaded' })
    if (!await authenticated(page)) {
        await page.goto('/setup', { waitUntil: 'domcontentloaded' })
        const setup = page.locator('#talos-setup-form')
        if (await setup.isVisible().catch(() => false)) {
            await setup.getByLabel('Name').fill('TALOS E2E Admin')
            await setup.getByLabel('Email').fill(setupEmail)
            await setup.getByLabel('Password', { exact: true }).fill(setupPassword)
            await setup.getByLabel('Confirm password').fill(setupPassword)
            await setup.getByRole('button', { name: 'Create first admin' }).click()
        }
    }

    if (!await authenticated(page)) {
        const signedIn = await signIn(
            page,
            process.env.TALOS_E2E_EMAIL ?? 'test@example.com',
            process.env.TALOS_E2E_PASSWORD ?? 'password',
        ) || await signIn(page, setupEmail, setupPassword)
        expect(signedIn).toBe(true)
    }

    await waitForTalosWorkspaceReady(page)
}

function introModal(page: Page) {
    return page.getByTestId('talos-intro-modal')
}

function composerField(page: Page) {
    return page.locator('textarea[aria-label="Message TALOS"]').first()
}

async function installFirstRunMocks(page: Page): Promise<TalosSettingsRequestLedger> {
    return installTalosApiMocks(page, {
        initialSettings: { preferences: { onboarding: {} } },
    })
}

test('first-run intro opens once ready, walks six slides and persists completed before focusing the composer', async ({ page }) => {
    const ledger = await installFirstRunMocks(page)
    await openAuthenticatedWorkspace(page)

    const modal = introModal(page)
    await expect(modal).toBeVisible()
    await expect(modal).toContainText('Meet TALOS')
    await expect(modal).toContainText('Step 1 of 6')

    for (let step = 2; step <= 6; step += 1) {
        await modal.getByRole('button', { name: 'Next' }).click()
        await expect(modal).toContainText(`Step ${step} of 6`)
    }

    await expect(modal).toContainText('Plugged into your world')
    await modal.getByRole('button', { name: 'Start your first chat' }).click()

    const ack = await ledger.waitForAck({ key: 'onboarding' })
    const preferences = ack.request.payload.preferences as Record<string, unknown>
    expect(preferences.onboarding).toEqual({ intro_version: 1, intro_outcome: 'completed' })

    await expect(modal).toBeHidden()
    await expect(composerField(page)).toBeFocused()
})

test('returning operator with a saved intro version never sees the modal', async ({ page }) => {
    await installTalosApiMocks(page)
    await openAuthenticatedWorkspace(page)

    await expect(composerField(page)).toBeVisible()
    await expect(introModal(page)).toHaveCount(0)
})

test('skip persists the skipped outcome and latches the session', async ({ page }) => {
    const ledger = await installFirstRunMocks(page)
    await openAuthenticatedWorkspace(page)

    const modal = introModal(page)
    await expect(modal).toBeVisible()
    await modal.getByRole('button', { name: 'Skip introduction' }).click()

    const ack = await ledger.waitForAck({ key: 'onboarding' })
    const preferences = ack.request.payload.preferences as Record<string, unknown>
    expect(preferences.onboarding).toEqual({ intro_version: 1, intro_outcome: 'skipped' })

    await expect(modal).toBeHidden()
    await expect(introModal(page)).toHaveCount(0)
})

test('settings account replay closes the settings window and reopens the intro exactly once', async ({ page }) => {
    await installTalosApiMocks(page)
    await openAuthenticatedWorkspace(page)

    await expect(introModal(page)).toHaveCount(0)

    const accountTrigger = page
        .locator('button[aria-label^="Open account settings for"]')
        .filter({ visible: true })
        .first()
    await accountTrigger.click()

    const replayRow = page.getByTestId('talos-settings-intro-replay')
    await expect(replayRow).toBeVisible()
    await replayRow.getByRole('button', { name: 'Replay introduction' }).click()

    await expect(replayRow).toBeHidden()
    const modal = introModal(page)
    await expect(modal).toBeVisible()
    await expect(modal).toContainText('Step 1 of 6')

    await modal.getByRole('button', { name: 'Skip introduction' }).click()
    await expect(modal).toBeHidden()
    await expect(introModal(page)).toHaveCount(0)
})

test('slide three renders the AVM deep dive link only when the blade bridge provides it', async ({ page }) => {
    const ledger = await installFirstRunMocks(page)
    await openAuthenticatedWorkspace(page)

    const modal = introModal(page)
    await expect(modal).toBeVisible()
    await modal.getByRole('button', { name: 'Next' }).click()
    await modal.getByRole('button', { name: 'Next' }).click()
    await expect(modal).toContainText('Powered by AVM')

    const bridgedUrl = await page.evaluate(() => (
        document.getElementById('talos-workspace-root')?.dataset.talosAvmDeepDiveUrl ?? ''
    ))
    const deepDiveLink = modal.locator('a', { hasText: 'Read the AVM deep dive' })
    if (bridgedUrl.startsWith('https://')) {
        await expect(deepDiveLink).toHaveAttribute('href', bridgedUrl)
        await expect(deepDiveLink).toHaveAttribute('rel', 'noopener noreferrer')
    } else {
        await expect(deepDiveLink).toHaveCount(0)
    }

    await modal.getByRole('button', { name: 'Skip introduction' }).click()
    await ledger.waitForAck({ key: 'onboarding' })
})
