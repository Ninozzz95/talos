import { expect, test, type Page } from '@playwright/test'
import { installTalosApiMocks } from './helpers/talosApiMocks'

const e2eLoginEmail = process.env.TALOS_E2E_EMAIL ?? 'test@example.com'
const e2eLoginPassword = process.env.TALOS_E2E_PASSWORD ?? 'password'

async function openAuthenticatedWorkspace(page: Page) {
    await page.goto('/', { waitUntil: 'domcontentloaded' })
    if (await page.locator('#talos-workspace-root[data-authenticated="true"]').count() === 0) {
        await page.goto('/login', { waitUntil: 'domcontentloaded' })
        const form = page.locator('#talos-login-form')
        await expect(form).toBeVisible()
        await form.getByLabel('Email').fill(e2eLoginEmail)
        await form.getByLabel('Password').fill(e2eLoginPassword)
        await Promise.all([
            page.waitForURL(/\/$/, { waitUntil: 'domcontentloaded' }),
            form.getByRole('button', { name: 'Sign in' }).click(),
        ])
    }
    await expect(page.getByLabel('Message TALOS')).toBeVisible({ timeout: 45_000 })
}

test('desktop rail shows stations and the session menu opens as a reka menu that Escape closes first', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'chromium', 'desktop rail journey')

    await installTalosApiMocks(page)
    await openAuthenticatedWorkspace(page)

    const rail = page.locator('.talos-left-rail')
    await expect(rail.getByRole('button', { name: 'Cockpit', exact: true })).toBeVisible()
    await expect(rail.getByRole('button', { name: 'Benchmarks', exact: true })).toBeVisible()
    await expect(rail.getByRole('button', { name: 'Browse', exact: true })).toBeVisible()
    await expect(rail.locator('.talos-chip-code', { hasText: 'RUN' })).toBeVisible()
    await expect(rail.getByRole('button', { name: 'Workbench' })).toBeVisible()
    await expect(rail.getByRole('button', { name: 'Toggle theme' })).toBeVisible()

    const composer = page.getByLabel('Message TALOS')
    await composer.fill('Create the station journey chat')
    await composer.press('Enter')
    await expect(page.locator('article[data-message-role="assistant"]').last()).toBeVisible()

    const trigger = rail.locator('[data-talos-session-menu-trigger="true"]').first()
    await expect(trigger).toBeVisible()
    await trigger.click()

    const menu = page.locator('#talos-portal-root [role="menu"][aria-label="Chat actions"]')
    await expect(menu).toBeVisible()
    await expect(menu.getByRole('menuitem', { name: 'Rename' })).toBeVisible()

    await page.keyboard.press('Escape')
    await expect(menu).toHaveCount(0)
    await expect(rail).toBeVisible()

    await trigger.click()
    await expect(menu).toBeVisible()
    await menu.getByRole('menuitem', { name: 'Rename' }).click()
    const dialogInput = page.locator('#talos-session-edit-value')
    await expect(dialogInput).toBeVisible()
    await dialogInput.fill('Station journey renamed')
    await page.getByRole('button', { name: 'Save', exact: true }).click()
    await expect(dialogInput).toHaveCount(0)
})

test('cockpit window titlebar carries the station chip', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'chromium', 'desktop windowing journey')

    await installTalosApiMocks(page)
    await openAuthenticatedWorkspace(page)

    await page.locator('.talos-left-rail').getByRole('button', { name: 'Cockpit', exact: true }).click()
    const titleBar = page.locator('.talos-tool-window header')
    await expect(titleBar.getByText('Cockpit', { exact: true })).toBeVisible()
    await expect(titleBar.locator('.talos-chip-code', { hasText: 'RUN' })).toBeVisible()
})

test('mobile hamburger sits top-left in the header and opens the navigation drawer', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'mobile-chrome', 'mobile shell journey')

    await installTalosApiMocks(page)
    await openAuthenticatedWorkspace(page)

    const header = page.getByTestId('talos-workspace-header')
    const hamburger = header.getByRole('button', { name: 'Open navigation menu' })
    await expect(hamburger).toBeVisible()

    const headerBox = await header.boundingBox()
    const hamburgerBox = await hamburger.boundingBox()
    expect(hamburgerBox!.x - headerBox!.x).toBeLessThan(64)

    await expect(page.locator('.talos-mobile-rail').getByRole('button', { name: 'Open navigation menu' })).toHaveCount(0)

    await hamburger.click()
    await expect(page.getByTestId('talos-mobile-history-dialog')).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(page.getByTestId('talos-mobile-history-dialog')).toBeHidden()
})

test('rail item order and collapse state persist through the settings API and survive reload', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'chromium', 'desktop preferences journey')

    const ledger = await installTalosApiMocks(page)
    await openAuthenticatedWorkspace(page)

    const rail = page.locator('.talos-left-rail')
    const cockpit = rail.getByRole('button', { name: 'Cockpit', exact: true })
    await cockpit.focus()
    await page.keyboard.press('Alt+ArrowDown')

    await expect.poll(() => ledger.entries.some((entry) => entry.preferenceKeys.includes('sidebar_rail'))).toBe(true)

    const labels = rail.locator('nav[aria-label="TALOS modules"] .talos-type-label')
    await expect(labels.nth(0)).toHaveText('Calendar')
    await expect(labels.nth(1)).toHaveText('Cockpit')

    await page.reload({ waitUntil: 'domcontentloaded' })
    await expect(page.getByLabel('Message TALOS')).toBeVisible({ timeout: 45_000 })
    const reloadedLabels = page.locator('.talos-left-rail nav[aria-label="TALOS modules"] .talos-type-label')
    await expect(reloadedLabels.nth(0)).toHaveText('Calendar')
    await expect(reloadedLabels.nth(1)).toHaveText('Cockpit')
})

test('telemetry preset is the default and renders the cyan instrument accent', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'chromium', 'desktop theme journey')

    await installTalosApiMocks(page, {
        initialSettings: { preferences: { theme: undefined } },
    })
    await openAuthenticatedWorkspace(page)

    const shell = page.locator('main[data-testid="talos-workspace"]')
    await expect(shell).toHaveAttribute('data-theme-preset', 'telemetry')

    const accent = await shell.evaluate((element) => getComputedStyle(element).getPropertyValue('--talos-accent').trim())
    expect(accent.toLowerCase()).toBe('#6ad4d4')

    const radiusControl = await shell.evaluate((element) => getComputedStyle(element).getPropertyValue('--talos-radius-control').trim())
    expect(radiusControl).toBe('3px')
})
