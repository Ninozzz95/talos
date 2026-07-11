import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'
import { installTalosApiMocks } from './helpers/talosApiMocks'

const setupEmail = 'talos-e2e@example.test'
const setupPassword = 'talos-e2e-password-123'

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

async function openAuthenticatedWorkspace(page: Page) {
    await page.goto('/', { waitUntil: 'domcontentloaded' })
    if (!await workspaceReady(page)) {
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
    if (!await workspaceReady(page)) {
        const authenticated = await signIn(page, process.env.TALOS_E2E_EMAIL ?? 'test@example.com', process.env.TALOS_E2E_PASSWORD ?? 'password')
            || await signIn(page, setupEmail, setupPassword)
        expect(authenticated).toBe(true)
    }
    await expect(page.getByLabel('Message TALOS')).toBeVisible({ timeout: 45_000 })
}

async function expectNoAccessibilityViolations(page: Page, state: string) {
    const results = await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
        .analyze()
    const violations = results.violations.map((violation) => ({
        id: violation.id,
        impact: violation.impact,
        help: violation.help,
        targets: violation.nodes.flatMap((node) => node.target),
    }))
    expect(violations, `${state}: ${JSON.stringify(violations, null, 2)}`).toEqual([])
}

test.beforeEach(async ({ page }) => {
    await installTalosApiMocks(page)
    await openAuthenticatedWorkspace(page)
})

test('authenticated workspace and complex overlays pass automated WCAG A/AA checks', async ({ page, isMobile }) => {
    await expectNoAccessibilityViolations(page, 'workspace')

    await page.getByRole('button', { name: 'Settings', exact: true }).click()
    await expect(page.getByText('Settings Center', { exact: true })).toBeVisible()
    await expectNoAccessibilityViolations(page, 'settings')

    if (isMobile) {
        await page.getByRole('button', { name: 'Close Settings', exact: true }).click()
    }
    await page.getByRole('button', { name: 'Theme', exact: true }).click()
    await expect(page.getByRole('heading', { name: 'Theme Engine', exact: true })).toBeVisible()
    await expectNoAccessibilityViolations(page, 'theme')

    if (isMobile) {
        await page.getByRole('button', { name: 'Close Theme', exact: true }).click()
    }
    await page.getByRole('button', { name: 'Open command palette' }).click()
    await expect(page.getByRole('dialog', { name: 'TALOS command palette' })).toBeVisible()
    await expectNoAccessibilityViolations(page, 'command palette')
})

test('conversation, evidence, menus, composer popovers, and mobile history pass WCAG A/AA checks', async ({ page, isMobile }) => {
    await page.getByLabel('Message TALOS').fill('Inspect this workflow with replayable evidence.')
    await page.getByRole('button', { name: 'Send', exact: true }).click()
    const assistant = page.locator('.talos-chat-message[data-message-role="assistant"]').last()
    await expect(assistant).toContainText('E2E response from AVM')
    await expectNoAccessibilityViolations(page, 'conversation with persisted messages')

    if (isMobile) {
        await assistant.getByRole('button', { name: 'More message actions' }).click()
        await expect(assistant.getByRole('menu', { name: 'More message actions' })).toBeVisible()
        await expectNoAccessibilityViolations(page, 'message actions menu')
        await assistant.getByRole('menuitem', { name: 'Open evidence' }).click()
    } else {
        await assistant.getByRole('button', { name: 'Open evidence' }).click()
    }
    await expect(page.getByText('Run evidence', { exact: true })).toBeVisible()
    await expectNoAccessibilityViolations(page, 'expanded message evidence')

    await page.getByRole('button', { name: 'Choose model profile' }).filter({ visible: true }).first().click()
    await expect(page.getByRole('dialog', { name: 'Model selection' })).toBeVisible()
    await expectNoAccessibilityViolations(page, 'model composer popover')
    await page.keyboard.press('Escape')

    await page.getByRole('button', { name: 'Browse', exact: true }).click()
    await page.getByRole('button', { name: 'Browse actions' }).click()
    await expect(page.getByRole('menu', { name: 'Browse actions' })).toBeVisible()
    await expectNoAccessibilityViolations(page, 'Browse actions menu')
    await page.keyboard.press('Escape')

    if (isMobile) {
        await page.getByRole('button', { name: 'Open chat history' }).click()
        await expect(page.getByRole('dialog', { name: 'Chat history' })).toBeVisible()
        await expectNoAccessibilityViolations(page, 'mobile chat history dialog')
    }
})

test('200 percent text zoom preserves the primary workspace and composer geometry', async ({ page }) => {
    await page.evaluate(() => { document.documentElement.style.fontSize = '200%' })
    await expect(page.getByLabel('Message TALOS')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Open command palette' })).toBeVisible()

    const geometry = await page.evaluate(() => ({
        viewportWidth: window.innerWidth,
        documentWidth: document.documentElement.scrollWidth,
        bodyWidth: document.body.scrollWidth,
        composer: document.querySelector('.talos-chat-composer-shell')?.getBoundingClientRect().toJSON(),
    }))
    expect(geometry.documentWidth).toBeLessThanOrEqual(geometry.viewportWidth + 1)
    expect(geometry.bodyWidth).toBeLessThanOrEqual(geometry.viewportWidth + 1)
    expect(geometry.composer).toBeTruthy()
    expect(geometry.composer?.left).toBeGreaterThanOrEqual(0)
    expect(geometry.composer?.right).toBeLessThanOrEqual(geometry.viewportWidth + 0.5)
})
