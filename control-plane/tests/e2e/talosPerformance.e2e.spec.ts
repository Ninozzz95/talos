import { expect, test, type Page } from '@playwright/test'
import { installTalosApiMocks } from './helpers/talosApiMocks'

const e2eSetupEmail = 'talos-e2e@example.test'
const e2eSetupPassword = 'talos-e2e-password-123'
const e2eLoginEmail = process.env.TALOS_E2E_EMAIL ?? 'test@example.com'
const e2eLoginPassword = process.env.TALOS_E2E_PASSWORD ?? 'password'

async function isAuthenticatedWorkspace(page: Page) {
    return await page.locator('#talos-workspace-root[data-authenticated="true"]').count() > 0
}

async function waitForWorkspaceReady(page: Page) {
    await expect(page.locator('#talos-workspace-root[data-authenticated="true"]')).toHaveCount(1)
    await expect(page.getByLabel('Message TALOS')).toBeVisible({ timeout: 45_000 })
}

async function submitLogin(page: Page, email: string, password: string) {
    await page.goto('/login', { waitUntil: 'domcontentloaded' })

    const form = page.locator('#talos-login-form')
    if (!await form.isVisible().catch(() => false)) {
        return false
    }

    await form.getByLabel('Email').fill(email)
    await form.getByLabel('Password').fill(password)
    await Promise.all([
        page.waitForURL(/\/$/, { waitUntil: 'domcontentloaded', timeout: 4_000 }).catch(() => undefined),
        form.getByRole('button', { name: 'Sign in' }).click(),
    ])

    return isAuthenticatedWorkspace(page)
}

async function ensureTalosAuthenticated(page: Page) {
    await page.goto('/', { waitUntil: 'domcontentloaded' })

    if (await isAuthenticatedWorkspace(page)) {
        await waitForWorkspaceReady(page)
        return
    }

    await page.goto('/setup', { waitUntil: 'domcontentloaded' })

    const setupForm = page.locator('#talos-setup-form')
    if (await setupForm.isVisible().catch(() => false)) {
        await setupForm.getByLabel('Name').fill('TALOS E2E Admin')
        await setupForm.getByLabel('Email').fill(e2eSetupEmail)
        await setupForm.getByLabel('Password', { exact: true }).fill(e2eSetupPassword)
        await setupForm.getByLabel('Confirm password').fill(e2eSetupPassword)
        await Promise.all([
            page.waitForURL(/\/$/, { waitUntil: 'domcontentloaded', timeout: 4_000 }).catch(() => undefined),
            setupForm.getByRole('button', { name: 'Create first admin' }).click(),
        ])

        if (await isAuthenticatedWorkspace(page)) {
            await waitForWorkspaceReady(page)
            return
        }
    }

    const credentials = [
        [e2eLoginEmail, e2eLoginPassword],
        [e2eSetupEmail, e2eSetupPassword],
    ] as const

    for (const [email, password] of credentials) {
        if (await submitLogin(page, email, password)) {
            await waitForWorkspaceReady(page)
            return
        }
    }

    throw new Error('TALOS E2E could not authenticate through setup or login.')
}

async function setThemePreferences(page: Page, preferences: Record<string, unknown>) {
    await page.evaluate(async (nextPreferences) => {
        await fetch('/api/talos/settings', {
            method: 'PATCH',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                preferences: nextPreferences,
            }),
        })
    }, preferences)

    await page.reload({ waitUntil: 'domcontentloaded' })
    await waitForWorkspaceReady(page)
}

test.beforeEach(async ({ page }) => {
    await installTalosApiMocks(page)
    await page.emulateMedia({ reducedMotion: 'no-preference' })
    await ensureTalosAuthenticated(page)
})

test('procedural background motion is capped and exposes performance evidence', async ({ page }) => {
    await setThemePreferences(page, {
        theme: 'signal',
        reduced_motion: false,
        theme_motion: 'normal',
        theme_motion_disabled: false,
        theme_background_disabled: false,
        theme_customization: {
            effect: 'signal-mesh',
        },
    })

    const background = page.getByTestId('talos-background-effect')
    await expect(background).toHaveAttribute('data-performance-mode', 'motion')
    await expect(background).toHaveAttribute('data-performance-fps-cap', '30')
    await expect(background).toHaveAttribute('data-performance-dpr-cap', '1.5')
    await expect(background).toHaveAttribute('data-performance-raf-active', 'true')
    await expect(page.getByTestId('talos-procedural-canvas')).toHaveCount(1)

    await expect.poll(async () => background.evaluate((element) => (
        Number((element as HTMLElement).dataset.performanceFrameCount ?? 0)
    )), { timeout: 4_000 }).toBeGreaterThanOrEqual(2)

    const profile = await background.evaluate((element) => {
        const canvas = element.querySelector('[data-testid="talos-procedural-canvas"]') as HTMLCanvasElement | null
        const rect = canvas?.getBoundingClientRect()
        const dpr = canvas && rect && rect.width > 0 ? canvas.width / rect.width : 0

        return {
            frameCount: Number((element as HTMLElement).dataset.performanceFrameCount ?? 0),
            markCount: performance.getEntriesByName('talos-background-frame').length,
            dpr,
        }
    })

    expect(profile.frameCount).toBeGreaterThanOrEqual(2)
    expect(profile.frameCount).toBeLessThanOrEqual(35)
    expect(profile.markCount).toBeGreaterThanOrEqual(1)
    expect(profile.dpr).toBeGreaterThan(0)
    expect(profile.dpr).toBeLessThanOrEqual(1.5)
})

test('static background mode draws once and stops recurring animation frames', async ({ page }) => {
    await setThemePreferences(page, {
        theme: 'terminal',
        reduced_motion: false,
        theme_motion: 'off',
        theme_motion_disabled: false,
        theme_background_disabled: false,
        theme_customization: {
            effect: 'trace-rain',
        },
    })

    const background = page.getByTestId('talos-background-effect')
    await expect(background).toHaveAttribute('data-performance-mode', 'static')
    await expect(background).toHaveAttribute('data-performance-raf-active', 'false')
    await expect(page.getByTestId('talos-procedural-canvas')).toHaveCount(1)

    const firstFrame = await page.getByTestId('talos-procedural-canvas').evaluate((element) => (element as HTMLCanvasElement).toDataURL())
    await page.waitForTimeout(700)
    const secondFrame = await page.getByTestId('talos-procedural-canvas').evaluate((element) => (element as HTMLCanvasElement).toDataURL())
    const frameCount = await background.evaluate((element) => Number((element as HTMLElement).dataset.performanceFrameCount ?? 0))

    expect(secondFrame).toBe(firstFrame)
    expect(frameCount).toBeLessThanOrEqual(1)
})
