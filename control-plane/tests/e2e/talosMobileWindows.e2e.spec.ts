import { expect, test, type Locator, type Page } from '@playwright/test'
import { installTalosApiMocks } from './helpers/talosApiMocks'
import { exerciseResponsiveSubsections } from './helpers/talosResponsivePanelAudit'
import { waitForTalosWorkspaceReady as waitForWorkspaceReady } from './helpers/talosWorkspaceReady'
import { TALOS_WINDOW_IDS, TALOS_WINDOW_REGISTRY, type TalosWindowId } from '../../resources/js/lib/talosWindowRegistry'

const e2eSetupEmail = 'talos-e2e@example.test'
const e2eSetupPassword = 'talos-e2e-password-123'
const e2eLoginEmail = process.env.TALOS_E2E_EMAIL ?? 'test@example.com'
const e2eLoginPassword = process.env.TALOS_E2E_PASSWORD ?? 'password'
const ADVANCED_WINDOW_IDS = new Set<TalosWindowId>(['search', 'brain', 'tasks', 'notes', 'tools', 'doctor'])
const requestedWindowId = process.env.TALOS_E2E_WINDOW_ID
if (requestedWindowId && !TALOS_WINDOW_IDS.includes(requestedWindowId as TalosWindowId)) {
    throw new Error(`Unknown TALOS_E2E_WINDOW_ID: ${requestedWindowId}`)
}
const WINDOW_IDS_UNDER_TEST: readonly TalosWindowId[] = requestedWindowId
    ? [requestedWindowId as TalosWindowId]
    : TALOS_WINDOW_IDS

async function isAuthenticatedWorkspace(page: Page) {
    return await page.locator('#talos-workspace-root[data-authenticated="true"]').count() > 0
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

function mobileRailLabel(id: TalosWindowId) {
    return TALOS_WINDOW_REGISTRY[id].title
}

async function openMobileWindow(page: Page, id: TalosWindowId) {
    const rail = page.locator('[aria-label="TALOS workspace rail"]:visible').first()
    const label = mobileRailLabel(id)
    let launcher = rail.getByRole('button', { name: label, exact: true })

    if (await launcher.count() === 0) {
        const compactMobileRailVisible = await page.locator('.talos-mobile-rail:visible').count() > 0
        if (compactMobileRailVisible) {
            await page.getByRole('button', { name: 'Open navigation menu', exact: true }).click()
            const navigation = page.getByRole('dialog', { name: 'TALOS navigation', exact: true })
            await expect(navigation).toBeVisible()
            const advanced = navigation.getByRole('button', { name: 'Workbench', exact: true })
            if (await advanced.getAttribute('aria-expanded') !== 'true') await advanced.click()
            launcher = navigation.getByRole('button', { name: label, exact: true })
        } else {
            const advanced = rail.getByRole('button', { name: 'Workbench', exact: true })
            if (await advanced.getAttribute('aria-expanded') !== 'true') {
                await advanced.click()
            }

            const inlineLauncher = rail.getByRole('button', { name: label, exact: true })
            launcher = await inlineLauncher.count() > 0
                ? inlineLauncher
                : page.locator('.talos-advanced-rail-popover:visible')
                    .getByRole('button', { name: label, exact: true })
        }
    }

    await launcher.scrollIntoViewIfNeeded()
    await expect(launcher).toBeVisible()
    await launcher.click()

    const sheet = page.getByTestId('talos-mobile-tool-sheet')
    await expect(sheet).toHaveCount(1)
    await expect(sheet).toHaveAttribute('data-window-id', id)
    await expect(sheet).toBeVisible()
    await expect(sheet.getByRole('status', { name: /^Loading / })).toHaveCount(0)
    await sheet.evaluate(async (element) => {
        await Promise.all(element.getAnimations().map((animation) => animation.finished.catch(() => undefined)))
    })

    return sheet
}

async function expectMobileSheetContract(page: Page, id: TalosWindowId) {
    const sheet = page.getByTestId('talos-mobile-tool-sheet')
    const label = mobileRailLabel(id)

    await expect(page.getByTestId('talos-mobile-tool-sheet')).toHaveCount(1)
    await expect(sheet).toHaveAttribute('role', 'dialog')
    await expect(sheet).toHaveAttribute('aria-modal', 'true')
    await expect(sheet.getByRole('button', { name: 'Back to chat', exact: true })).toBeVisible()
    await expect(sheet.getByRole('button', { name: `Close ${label}`, exact: true })).toBeVisible()
    await expect(sheet.getByRole('button', { name: /dock|fullscreen|resize/i })).toHaveCount(0)

    const geometry = await page.evaluate(() => {
        const sheet = document.querySelector<HTMLElement>('[data-testid="talos-mobile-tool-sheet"]')
        const body = sheet?.querySelector<HTMLElement>('[data-testid="talos-mobile-sheet-body"]')
        const sheetHeader = sheet?.querySelector<HTMLElement>('header')

        if (!sheet || !body || !sheetHeader) return null

        const sheetRect = sheet.getBoundingClientRect()
        const bodyRect = body.getBoundingClientRect()
        const headerRect = sheetHeader.getBoundingClientRect()
        const bodyStyle = window.getComputedStyle(body)
        const headerStyle = window.getComputedStyle(sheetHeader)
        const captionControlsWithinSheet = Array.from(sheetHeader.querySelectorAll<HTMLElement>('button')).every((control) => {
            const rect = control.getBoundingClientRect()
            return rect.left >= sheetRect.left - 0.5
                && rect.right <= sheetRect.right + 0.5
                && rect.top >= sheetRect.top - 0.5
                && rect.bottom <= sheetRect.bottom + 0.5
        })

        return {
            presentation: sheet.dataset.windowPresentation,
            viewport: { width: window.innerWidth, height: window.innerHeight },
            sheet: {
                top: sheetRect.top,
                right: sheetRect.right,
                bottom: sheetRect.bottom,
                left: sheetRect.left,
                height: sheetRect.height,
            },
            bodyOverflowX: bodyStyle.overflowX,
            bodyOverflowY: bodyStyle.overflowY,
            bodySafePaddingBottom: Number.parseFloat(bodyStyle.paddingBottom),
            headerSafePaddingTop: Number.parseFloat(headerStyle.paddingTop),
            bodyWithinSheet: bodyRect.top >= headerRect.bottom - 0.5
                && bodyRect.right <= sheetRect.right + 0.5
                && bodyRect.bottom <= sheetRect.bottom + 0.5
                && bodyRect.left >= sheetRect.left - 0.5,
            captionControlsWithinSheet,
            pageHorizontalOverflow: document.documentElement.scrollWidth - window.innerWidth,
        }
    })

    expect(geometry).not.toBeNull()
    expect(geometry?.sheet.left).toBeGreaterThanOrEqual(-0.5)
    expect(geometry?.sheet.top).toBeGreaterThanOrEqual(-0.5)
    expect(geometry?.sheet.right).toBeCloseTo(geometry?.viewport.width ?? 0, 0)
    expect(geometry?.sheet.bottom).toBeCloseTo(geometry?.viewport.height ?? 0, 0)
    if (geometry?.presentation === 'drawer') {
        expect(geometry.sheet.top).toBeGreaterThan(0)
        expect(geometry.sheet.top).toBeLessThanOrEqual(geometry.viewport.height * 0.16)
        expect(geometry.sheet.height).toBeGreaterThanOrEqual(geometry.viewport.height * 0.8)
    } else {
        expect(geometry?.presentation).toBe('fullscreen')
        expect(geometry?.sheet.top).toBeCloseTo(0, 0)
    }
    expect(geometry?.bodyOverflowX).toBe('hidden')
    expect(geometry?.bodyOverflowY).toBe('auto')
    expect(geometry?.bodySafePaddingBottom).toBeGreaterThanOrEqual(12)
    expect(geometry?.headerSafePaddingTop).toBeGreaterThanOrEqual(8)
    expect(geometry?.bodyWithinSheet).toBe(true)
    expect(geometry?.captionControlsWithinSheet).toBe(true)
    expect(geometry?.pageHorizontalOverflow).toBeLessThanOrEqual(1)
}

async function setMobileWindowPresentation(page: Page, presentation: 'drawer' | 'fullscreen') {
    const settings = await openMobileWindow(page, 'settings')
    const activePresentation = await settings.getAttribute('data-window-presentation')
    await settings.getByRole('tab', { name: 'Appearance', exact: true }).click()
    await settings.getByLabel('Mobile tool window presentation', { exact: true }).selectOption(presentation)
    await settings.getByRole('button', { name: 'Save settings', exact: true }).click()
    await expect(settings.getByText('Settings saved through /api/talos/settings.', { exact: true })).toBeVisible()
    await expect(settings).toHaveAttribute('data-window-presentation', activePresentation ?? 'drawer')
    return settings
}

async function expectGuideFocusRoundTrip(
    page: Page,
    surface: Locator,
    guideId: string,
    title: string,
) {
    const trigger = surface.locator(`[data-guide-id="${guideId}"]`).first()
    await expect(trigger).toBeVisible()
    await trigger.click()
    const dialog = page.locator('#talos-portal-root').getByRole('dialog', { name: `Information about ${title}`, exact: true })
    await expect(dialog).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(dialog).toHaveCount(0)
    await expect(trigger).toBeFocused()
}

test.beforeEach(async ({ page }) => {
    await installTalosApiMocks(page)
    await page.emulateMedia({ reducedMotion: 'no-preference' })
    await ensureTalosAuthenticated(page)
})

for (const viewport of [
    { name: '320x800', width: 320, height: 800 },
    { name: '375x812', width: 375, height: 812 },
    { name: '768x1024', width: 768, height: 1024 },
    { name: '1100x800', width: 1100, height: 800 },
] as const) {
    test.describe(`TALOS mobile window sheet at ${viewport.name}`, () => {
        test.use({ viewport: { width: viewport.width, height: viewport.height } })

        test('exercises every registered window through the mobile rail', async ({ page }) => {
            test.setTimeout(300_000)
            await page.goto('/', { waitUntil: 'domcontentloaded' })
            await waitForWorkspaceReady(page)

            for (const id of WINDOW_IDS_UNDER_TEST) {
                const sheet = await openMobileWindow(page, id)
                await expectMobileSheetContract(page, id)
                await exerciseResponsiveSubsections(
                    sheet,
                    sheet.getByTestId('talos-mobile-sheet-body'),
                    `${viewport.name} / ${mobileRailLabel(id)}`,
                )

                const rail = page.locator('[aria-label="TALOS workspace rail"]:visible').first()
                const compactMobileRailVisible = await page.locator('.talos-mobile-rail:visible').count() > 0
                const returnTarget = ADVANCED_WINDOW_IDS.has(id) && compactMobileRailVisible
                    ? page.locator('button[aria-label="Open navigation menu"]')
                    : rail.locator(`button[aria-label="${mobileRailLabel(id)}"]`)
                await sheet.getByRole('button', { name: `Close ${mobileRailLabel(id)}`, exact: true }).click()
                await expect(page.getByTestId('talos-mobile-tool-sheet')).toHaveCount(0)
                await expect.poll(async () => returnTarget.evaluate((target) => {
                    const values: string[] = []
                    let current: Element | null = target
                    while (current) {
                        if (current.getAttribute('aria-hidden') === 'true' || current.getAttribute('data-aria-hidden') === 'true') {
                            values.push(`${current.tagName.toLowerCase()}#${current.id || '(no-id)'}`)
                        }
                        current = current.parentElement
                    }
                    return values
                })).toEqual([])
                await expect(returnTarget).toBeFocused()
            }
        })
    })
}

test.describe('TALOS mobile presentation preference', () => {
    test.use({ viewport: { width: 375, height: 812 } })

    test('changes presentation through Appearance and preserves keyboard, reload, reduced-motion, and 200% text reflow', async ({ page }) => {
        await page.goto('/', { waitUntil: 'domcontentloaded' })
        await waitForWorkspaceReady(page)

        let settings = await setMobileWindowPresentation(page, 'fullscreen')
        await expectMobileSheetContract(page, 'settings')
        await settings.getByRole('button', { name: 'Close Settings', exact: true }).click()
        await expect(page.getByTestId('talos-mobile-tool-sheet')).toHaveCount(0)

        let theme = await openMobileWindow(page, 'theme')
        await expect(theme).toHaveAttribute('data-window-presentation', 'fullscreen')
        await expectMobileSheetContract(page, 'theme')
        await theme.getByRole('button', { name: 'Close Theme', exact: true }).click()
        await expect(page.getByTestId('talos-mobile-tool-sheet')).toHaveCount(0)

        await page.reload({ waitUntil: 'domcontentloaded' })
        await waitForWorkspaceReady(page)
        await page.emulateMedia({ reducedMotion: 'reduce' })
        theme = await openMobileWindow(page, 'theme')
        await expect(theme).toHaveAttribute('data-window-presentation', 'fullscreen')
        await expectMobileSheetContract(page, 'theme')
        const reducedMotionStyle = await theme.evaluate((element) => {
            const style = window.getComputedStyle(element)
            return { animationName: style.animationName, transitionDuration: style.transitionDuration }
        })
        expect(reducedMotionStyle.animationName).toBe('none')
        expect(reducedMotionStyle.transitionDuration).toBe('0s')

        const themeLauncher = page.locator('[aria-label="TALOS workspace rail"]:visible').first()
            .getByRole('button', { name: 'Theme', exact: true })
        await page.keyboard.press('Escape')
        await expect(page.getByTestId('talos-mobile-tool-sheet')).toHaveCount(0)
        await expect(themeLauncher).toBeFocused()

        await page.evaluate(() => {
            document.documentElement.style.fontSize = '200%'
        })
        const notes = await openMobileWindow(page, 'notes')
        await expect(notes).toHaveAttribute('data-window-presentation', 'fullscreen')
        await expectMobileSheetContract(page, 'notes')
        await expectGuideFocusRoundTrip(page, notes, 'rail.notes', 'Notes')
        await notes.getByRole('button', { name: 'Close Notes', exact: true }).click()
        await expect(page.getByTestId('talos-mobile-tool-sheet')).toHaveCount(0)
        await page.evaluate(() => {
            document.documentElement.style.fontSize = ''
        })

        settings = await setMobileWindowPresentation(page, 'drawer')
        await expectMobileSheetContract(page, 'settings')
        await settings.getByRole('button', { name: 'Close Settings', exact: true }).click()
        await expect(page.getByTestId('talos-mobile-tool-sheet')).toHaveCount(0)

        const drawer = await openMobileWindow(page, 'notes')
        await expect(drawer).toHaveAttribute('data-window-presentation', 'drawer')
        await expectMobileSheetContract(page, 'notes')
        await expectGuideFocusRoundTrip(page, drawer, 'rail.notes', 'Notes')
        await drawer.getByRole('button', { name: 'Back to chat', exact: true }).click()
        await expect(page.getByTestId('talos-mobile-tool-sheet')).toHaveCount(0)
        const advancedLauncher = page.getByRole('button', { name: 'Open navigation menu', exact: true })
        await expect(advancedLauncher).toBeFocused()
    })
})

test.describe('TALOS mobile modal lifecycle regressions', () => {
    test.use({ viewport: { width: 375, height: 812 } })

    test('keeps chat actions inside the navigation dialog focus scope', async ({ page }) => {
        await page.unroute('**/api/**')
        await installTalosApiMocks(page, {
            initialSessions: [{ id: 'session-mobile-actions', title: 'Actionable chat' }],
        })
        await page.goto('/', { waitUntil: 'domcontentloaded' })
        await waitForWorkspaceReady(page)

        await page.getByRole('button', { name: 'Open navigation menu', exact: true }).click()
        const navigation = page.getByRole('dialog', { name: 'TALOS navigation', exact: true })
        await expect(navigation).toBeVisible()

        const trigger = navigation.locator('[data-talos-session-menu-trigger="true"]').first()
        await expect(trigger).toBeVisible()
        await trigger.click()
        const menu = page.getByRole('menu', { name: 'Chat actions for Actionable chat', exact: true })
        await expect(menu).toBeVisible()
        await expect.poll(() => menu.evaluate((element) => (
            element.closest('[role="dialog"][aria-modal="true"]')?.getAttribute('aria-label')
                || element.closest('[role="dialog"][aria-modal="true"]')?.getAttribute('aria-labelledby')
                || null
        ))).not.toBeNull()

        await menu.getByRole('menuitem', { name: 'Delete', exact: true }).focus()
        await page.keyboard.press('Tab')
        await expect.poll(() => navigation.evaluate((element) => element.contains(document.activeElement))).toBe(true)
    })

    test('releases mobile navigation isolation when crossing the desktop breakpoint', async ({ page }) => {
        await page.goto('/', { waitUntil: 'domcontentloaded' })
        await waitForWorkspaceReady(page)

        await page.getByRole('button', { name: 'Open navigation menu', exact: true }).click()
        const navigation = page.getByRole('dialog', { name: 'TALOS navigation', exact: true })
        const chat = page.locator('.talos-chat-scroll-root')
        await expect(navigation).toBeVisible()
        await expect(chat).toHaveAttribute('inert', '')

        await page.setViewportSize({ width: 1100, height: 800 })

        await expect(navigation).toHaveCount(0)
        await expect(chat).not.toHaveAttribute('inert', '')
        await expect(chat).not.toHaveAttribute('aria-hidden', 'true')
    })

    test('restores focus to a visible launcher after responsive rail replacement', async ({ page }) => {
        await page.goto('/', { waitUntil: 'domcontentloaded' })
        await waitForWorkspaceReady(page)

        const sheet = await openMobileWindow(page, 'theme')
        await expect.poll(() => page.locator('[data-aria-hidden="true"]').count()).toBeGreaterThan(0)

        await page.setViewportSize({ width: 1100, height: 800 })
        const desktopLauncher = page.locator('[aria-label="TALOS workspace rail"]:visible').first()
            .locator('button[aria-label="Theme"]')
        await expect(desktopLauncher).toBeVisible()
        await sheet.getByRole('button', { name: 'Close Theme', exact: true }).click()

        await expect(page.getByTestId('talos-mobile-tool-sheet')).toHaveCount(0)
        await expect(desktopLauncher).toBeFocused()
        await expect(page.locator('[data-aria-hidden="true"]')).toHaveCount(0)
    })

    test('renders Theme preview tooltips above the active tool sheet', async ({ page }) => {
        await page.goto('/', { waitUntil: 'domcontentloaded' })
        await waitForWorkspaceReady(page)

        const sheet = await openMobileWindow(page, 'theme')
        await sheet.getByRole('tab', { name: 'Motion', exact: true }).click()
        const trigger = sheet.getByRole('button', { name: 'Light preview', exact: true })
        await trigger.focus()
        const describedBy = await trigger.getAttribute('aria-describedby')
        expect(describedBy).toBeTruthy()
        const accessibleTooltip = page.locator(`#${describedBy}`)
        await expect(accessibleTooltip).toHaveAttribute('role', 'tooltip')
        await expect(accessibleTooltip).toHaveText('Light preview')

        const tooltip = page.locator('#talos-mobile-tooltip-root [data-state="instant-open"], #talos-mobile-tooltip-root [data-state="delayed-open"]')
            .filter({ hasText: 'Light preview' })
            .first()
        await expect(tooltip).toBeVisible()
        const blockingAncestors = await tooltip.evaluate((element) => {
            const values: string[] = []
            let current: Element | null = element
            while (current) {
                if (current.getAttribute('aria-hidden') === 'true' || current.hasAttribute('inert')) {
                    values.push(`${current.tagName.toLowerCase()}#${current.id || '(no-id)'}.${current.className || '(no-class)'}`)
                }
                current = current.parentElement
            }
            return values
        })
        expect(blockingAncestors).toEqual([])

        const stacking = await page.evaluate(() => {
            const sheet = document.querySelector<HTMLElement>('[data-testid="talos-mobile-tool-sheet"]')
            const tooltip = document.querySelector<HTMLElement>('#talos-mobile-tooltip-root [data-state="instant-open"], #talos-mobile-tooltip-root [data-state="delayed-open"]')
            if (!sheet || !tooltip) return null
            const rect = tooltip.getBoundingClientRect()
            const topmost = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2)

            return {
                sheetZ: Number.parseInt(window.getComputedStyle(sheet).zIndex, 10),
                tooltipZ: Number.parseInt(window.getComputedStyle(tooltip).zIndex, 10),
                topmost: topmost === tooltip || Boolean(topmost && tooltip.contains(topmost)),
            }
        })

        expect(stacking).not.toBeNull()
        expect(stacking?.tooltipZ).toBeGreaterThan(stacking?.sheetZ ?? 0)
        expect(stacking?.topmost).toBe(true)
    })
})

test.describe('TALOS mobile quick navigation', () => {
    test.use({ viewport: { width: 375, height: 812 } })

    test('keeps Chat focus separate from the complete navigation sidebar', async ({ page }) => {
        await page.goto('/', { waitUntil: 'domcontentloaded' })
        await waitForWorkspaceReady(page)

        const rail = page.locator('.talos-mobile-rail:visible')
        await expect(rail.getByRole('button', { name: 'Chat', exact: true })).toBeVisible()
        await expect(page.getByRole('button', { name: 'Open navigation menu', exact: true })).toBeVisible()
        await expect(rail.getByRole('button', { name: 'Workbench', exact: true })).toHaveCount(0)

        await rail.getByRole('button', { name: 'Chat', exact: true }).click()
        await expect(page.getByLabel('Message TALOS')).toBeFocused()
        await expect(page.getByRole('dialog', { name: 'TALOS navigation', exact: true })).toHaveCount(0)

        await page.getByRole('button', { name: 'Open navigation menu', exact: true }).click()
        const navigation = page.getByRole('dialog', { name: 'TALOS navigation', exact: true })
        await expect(navigation).toBeVisible()
        await expect(navigation.getByRole('button', { name: 'Workbench', exact: true })).toBeVisible()
        await expect(navigation.getByRole('button', { name: 'Close navigation menu', exact: true })).toBeFocused()
    })
})
