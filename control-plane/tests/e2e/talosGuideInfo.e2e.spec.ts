import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Locator, type Page, type TestInfo } from '@playwright/test'
import { installTalosApiMocks } from './helpers/talosApiMocks'
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

async function expectContainedInViewport(page: Page, surface: Locator) {
    await expect(surface).toBeVisible()
    const geometry = await surface.evaluate((element) => {
        const rect = element.getBoundingClientRect()
        return {
            top: rect.top,
            left: rect.left,
            right: rect.right,
            bottom: rect.bottom,
            viewportWidth: window.innerWidth,
            viewportHeight: window.innerHeight,
        }
    })

    expect(geometry.left).toBeGreaterThanOrEqual(0)
    expect(geometry.top).toBeGreaterThanOrEqual(0)
    expect(geometry.right).toBeLessThanOrEqual(geometry.viewportWidth + 0.5)
    expect(geometry.bottom).toBeLessThanOrEqual(geometry.viewportHeight + 0.5)
}

async function expectGuideAccessible(page: Page) {
    const result = await new AxeBuilder({ page })
        .include('#talos-portal-root')
        .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
        .analyze()
    const violations = result.violations.map((violation) => ({
        id: violation.id,
        nodes: violation.nodes.map((node) => ({
            target: node.target,
            html: node.html,
            summary: node.failureSummary,
        })),
    }))
    const portalSurfaces = violations.length === 0
        ? []
        : await page.locator('#talos-portal-root .shadow-md').evaluateAll((elements) => elements.map((element) => {
            const style = window.getComputedStyle(element)
            return {
                className: element.className,
                text: element.textContent?.trim(),
                state: element.getAttribute('data-state'),
                backgroundColor: style.backgroundColor,
                color: style.color,
                display: style.display,
                opacity: style.opacity,
                visibility: style.visibility,
            }
        }))

    expect({ violations, portalSurfaces }).toEqual({ violations: [], portalSurfaces: [] })
}

async function openGuide(page: Page, guideId: string, title: string) {
    const trigger = page.locator(`[data-guide-id="${guideId}"]`).filter({ visible: true }).first()
    await expect(trigger).toBeVisible()
    await trigger.focus()
    await trigger.click()
    const content = page.locator('#talos-portal-root').getByRole('dialog', { name: `Information about ${title}` })
    await expectContainedInViewport(page, content)
    await expectGuideAccessible(page)

    return { trigger, content }
}

test.beforeEach(async ({ page }) => {
    await installTalosApiMocks(page)
    await page.emulateMedia({ reducedMotion: 'no-preference' })
    await openAuthenticatedWorkspace(page)
})

test('desktop branding promotes the rail mark and keeps the chat lockup compact', async ({ page, isMobile }, testInfo: TestInfo) => {
    test.skip(Boolean(isMobile), 'Desktop-only visual contract')

    const railLogo = page.getByTestId('talos-rail-brand-logo')
    const emptyBrand = page.getByTestId('talos-empty-brand')
    const chatLogo = emptyBrand.locator('.talos-chat-brand-logo')
    const chatTitle = emptyBrand.getByText('TALOS', { exact: true })

    await expect(railLogo).toBeVisible()
    await expect(emptyBrand).toBeVisible()
    await expect(chatLogo).toBeVisible()
    await expect(chatTitle).toBeVisible()

    const railPresentation = await railLogo.evaluate((element) => {
        const style = window.getComputedStyle(element)
        const rect = element.getBoundingClientRect()

        return {
            width: rect.width,
            height: rect.height,
            color: style.color,
            filter: style.filter,
            railBackground: window.getComputedStyle(element.closest('.talos-left-rail')!).backgroundColor,
        }
    })
    const chatLogoBox = await chatLogo.boundingBox()
    const chatTitleBox = await chatTitle.boundingBox()

    expect(railPresentation.width).toBeGreaterThanOrEqual(49)
    expect(railPresentation.width).toBeLessThanOrEqual(50.5)
    expect(railPresentation.height).toBeGreaterThanOrEqual(49)
    expect(railPresentation.height).toBeLessThanOrEqual(50.5)
    expect(railPresentation.color).not.toBe(railPresentation.railBackground)
    expect(railPresentation.color).not.toBe('transparent')
    expect(railPresentation.filter).not.toBe('none')
    expect(chatLogoBox).not.toBeNull()
    expect(chatTitleBox).not.toBeNull()
    expect(chatLogoBox!.width).toBeGreaterThanOrEqual(87.5)
    expect(chatLogoBox!.height).toBeGreaterThanOrEqual(87.5)

    const chatBrandGap = chatTitleBox!.x - (chatLogoBox!.x + chatLogoBox!.width)
    expect(chatBrandGap).toBeGreaterThanOrEqual(0)
    expect(chatBrandGap).toBeLessThanOrEqual(3)

    await testInfo.attach('talos-desktop-branding.png', {
        body: await page.screenshot({ fullPage: true, animations: 'disabled' }),
        contentType: 'image/png',
    })
})

test('contextual Info is non-activating, contained and focus-safe across desktop and mobile', async ({ page, isMobile }, testInfo: TestInfo) => {
    await expect(page.locator('button button')).toHaveCount(0)
    await expect(page.locator('[data-window-id="runtime"]')).toHaveCount(0)
    const rail = page.locator('[aria-label="TALOS workspace rail"]').filter({ visible: true }).first()
    await expect(rail.locator('[data-guide-id]')).toHaveCount(0)

    await page.getByRole('button', { name: 'Runtime', exact: true }).filter({ visible: true }).first().click()
    let runtimeWindow = page.locator('[data-window-id="runtime"]')
    await expect(runtimeWindow).toBeVisible()
    const timelineTab = runtimeWindow.getByRole('tab', { name: 'Timeline', exact: true })
    await expect(timelineTab).toHaveAttribute('aria-selected', 'true')

    const runtimeGuide = await openGuide(page, 'rail.runtime', 'Runtime')
    await expect(timelineTab).toHaveAttribute('aria-selected', 'true')
    await page.keyboard.press('Escape')
    await expect(runtimeGuide.trigger).toBeFocused()

    if (isMobile) {
        await runtimeWindow.getByRole('tab', { name: 'Recovery', exact: true }).click()
        const recoveryTab = runtimeWindow.getByRole('tab', { name: 'Recovery', exact: true })
        await expect(recoveryTab).toHaveAttribute('aria-selected', 'true')

        const recoveryGuide = await openGuide(page, 'runtime.recovery', 'Recovery')
        await expect(recoveryTab).toHaveAttribute('aria-selected', 'true')
        await page.keyboard.press('Escape')
        await expect(recoveryGuide.trigger).toBeFocused()
    } else {
        await page.getByRole('button', { name: 'Collapse sidebar', exact: true }).click()
        await expect(rail).toHaveAttribute('data-sidebar-state', 'collapsed')
        await expect(rail.locator('[data-guide-id]')).toHaveCount(0)

        await runtimeWindow.getByRole('tab', { name: 'Recovery', exact: true }).click()
        const recoveryTab = runtimeWindow.getByRole('tab', { name: 'Recovery', exact: true })
        await expect(recoveryTab).toHaveAttribute('aria-selected', 'true')

        const recoveryGuide = await openGuide(page, 'runtime.recovery', 'Recovery')
        await expect(recoveryTab).toHaveAttribute('aria-selected', 'true')
        await page.keyboard.press('Escape')
        await expect(recoveryGuide.trigger).toBeFocused()

        await runtimeWindow.getByRole('button', { name: 'Dock Runtime in right sidebar', exact: true }).click()
        const dock = page.getByTestId('talos-right-dock')
        await expect(dock).toBeVisible()
        runtimeWindow = dock.locator('[data-window-id="runtime"]')
        await expect(runtimeWindow).toBeVisible()
        await runtimeWindow.getByRole('tab', { name: 'Artifacts', exact: true }).click()
        const dockedGuide = await openGuide(page, 'runtime.artifacts', 'Run artifacts')
        await page.keyboard.press('Escape')
        await expect(dockedGuide.trigger).toBeFocused()
    }

    await testInfo.attach(`talos-guide-info-${testInfo.project.name}.png`, {
        body: await page.screenshot({ fullPage: true, animations: 'disabled' }),
        contentType: 'image/png',
    })
})

test('contextual Info survives hard reload and reduced-motion without stale overlays', async ({ page }) => {
    await page.getByRole('button', { name: 'Settings', exact: true }).filter({ visible: true }).first().click()
    await openGuide(page, 'rail.settings', 'Settings')
    await page.reload({ waitUntil: 'domcontentloaded' })
    await waitForTalosWorkspaceReady(page)
    await expect(page.locator('#talos-portal-root [role="dialog"]')).toHaveCount(0)

    await page.emulateMedia({ reducedMotion: 'reduce' })
    if (!await page.locator('[data-window-id="settings"]').isVisible().catch(() => false)) {
        await page.getByRole('button', { name: 'Settings', exact: true }).filter({ visible: true }).first().click()
    }
    const settingsGuide = await openGuide(page, 'rail.settings', 'Settings')
    await page.keyboard.press('Escape')
    await expect(settingsGuide.trigger).toBeFocused()
})
