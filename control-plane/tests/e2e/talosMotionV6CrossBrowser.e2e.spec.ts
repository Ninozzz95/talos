import { expect, test, type Page } from '@playwright/test'
import { installTalosApiMocks } from './helpers/talosApiMocks'
import { createDefaultTalosMotionV6Preferences } from '../../resources/js/motion-v6/defaults'

const setupEmail = 'talos-e2e@example.test'
const setupPassword = 'talos-e2e-password-123'
const pageErrors = new WeakMap<Page, string[]>()

async function workspaceReady(page: Page) {
    return await page.locator('#talos-workspace-root[data-authenticated="true"]').count() > 0
}

async function signIn(page: Page, email: string, password: string) {
    await page.goto('/login', { waitUntil: 'domcontentloaded' })
    const form = page.locator('#talos-login-form')
    if (!await form.isVisible().catch(() => false)) return false
    await form.getByLabel('Email').fill(email)
    await form.getByLabel('Password').fill(password)
    await form.getByRole('button', { name: 'Sign in' }).click()
    return workspaceReady(page)
}

async function openWorkspace(page: Page) {
    await page.goto('/', { waitUntil: 'domcontentloaded' })
    if (!await workspaceReady(page)) {
        await page.goto('/setup', { waitUntil: 'domcontentloaded' })
        const setup = page.locator('#talos-setup-form')
        if (await setup.isVisible().catch(() => false)) {
            await setup.getByLabel('Name').fill('TALOS Cross Browser Admin')
            await setup.getByLabel('Email').fill(setupEmail)
            await setup.getByLabel('Password', { exact: true }).fill(setupPassword)
            await setup.getByLabel('Confirm password').fill(setupPassword)
            await setup.getByRole('button', { name: 'Create first admin' }).click()
        }
    }
    if (!await workspaceReady(page)) {
        const signedIn = await signIn(page, process.env.TALOS_E2E_EMAIL ?? 'test@example.com', process.env.TALOS_E2E_PASSWORD ?? 'password')
            || await signIn(page, setupEmail, setupPassword)
        expect(signedIn).toBe(true)
    }
    await expect(page.getByLabel('Message TALOS')).toBeVisible({ timeout: 45_000 })
}

test.beforeEach(async ({ page }) => {
    const errors: string[] = []
    pageErrors.set(page, errors)
    page.on('pageerror', (error) => errors.push(error.message))
    await installTalosApiMocks(page)
    await page.emulateMedia({ reducedMotion: 'no-preference', colorScheme: 'dark' })
    await openWorkspace(page)
})

test('desktop cross-browser smoke covers Complex, reduced motion and Motion Off', async ({ page, browserName }, testInfo) => {
    const errors = pageErrors.get(page) ?? []
    const motion = createDefaultTalosMotionV6Preferences()
    motion.mode = 'complex'
    const response = await page.evaluate(async (preferences) => {
        const result = await fetch('/api/talos/settings', {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                expected_revision: 0,
                preferences: {
                    theme: 'signal',
                    theme_mode: 'dark',
                    reduced_motion: false,
                    theme_motion_v6: preferences,
                },
            }),
        })
        return { ok: result.ok, status: result.status, body: await result.text() }
    }, motion)
    expect(response.ok, JSON.stringify(response)).toBe(true)
    await page.reload({ waitUntil: 'domcontentloaded' })
    await expect(page.getByLabel('Message TALOS')).toBeVisible({ timeout: 45_000 })

    const workspace = page.getByTestId('talos-workspace')
    const stage = page.locator('[data-talos-motion-stage]')
    const canvas = stage.getByTestId('talos-procedural-canvas')
    await expect(workspace).toHaveAttribute('data-theme-preset', 'signal')
    await expect(workspace).toHaveAttribute('data-motion-v6-effective', 'complex')
    await expect(stage).toHaveAttribute('data-active-kind', 'complex')
    await expect.poll(async () => canvas.evaluate((element) => (element as HTMLCanvasElement).width)).toBeGreaterThan(100)
    const first = await canvas.screenshot()
    await expect.poll(async () => !(await canvas.screenshot()).equals(first)).toBe(true)
    await testInfo.attach(`motion-v6-complex-${browserName}.png`, {
        body: await page.screenshot({ animations: 'disabled' }),
        contentType: 'image/png',
    })

    await page.emulateMedia({ reducedMotion: 'reduce' })
    await page.reload({ waitUntil: 'domcontentloaded' })
    await expect(page.getByLabel('Message TALOS')).toBeVisible({ timeout: 45_000 })
    await expect(workspace).toHaveAttribute('data-motion-v6-effective', 'static')
    await expect(page.locator('[data-talos-motion-stage]')).toHaveAttribute('data-active-kind', 'static')
    await expect(page.getByTestId('talos-procedural-canvas')).toHaveCount(0)

    await page.emulateMedia({ reducedMotion: 'no-preference' })
    const off = createDefaultTalosMotionV6Preferences()
    off.mode = 'off'
    off.background_enabled = false
    const offResponse = await page.evaluate(async (preferences) => {
        const result = await fetch('/api/talos/settings', {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ expected_revision: 1, preferences: { theme_motion_v6: preferences } }),
        })
        return { ok: result.ok, status: result.status, body: await result.text() }
    }, off)
    expect(offResponse.ok, JSON.stringify(offResponse)).toBe(true)
    await page.reload({ waitUntil: 'domcontentloaded' })
    await expect(page.getByLabel('Message TALOS')).toBeVisible({ timeout: 45_000 })
    await expect(workspace).toHaveAttribute('data-motion-v6-effective', 'off')
    await expect(page.locator('[data-talos-motion-stage]')).toHaveCount(0)

    await page.getByRole('button', { name: 'Theme', exact: true }).click()
    await expect(page.getByRole('heading', { name: 'Theme Engine', exact: true })).toBeVisible()
    await page.locator('#talos-theme-control-tab-motion').click()
    await expect(page.getByTestId('talos-motion-v6-editor')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Motion mode Off' })).toHaveAttribute('aria-pressed', 'true')
    expect(errors).toEqual([])

    await testInfo.attach(`motion-v6-off-${browserName}.png`, {
        body: await page.screenshot({ animations: 'disabled' }),
        contentType: 'image/png',
    })
})
