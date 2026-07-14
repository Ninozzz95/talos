import { expect, test, type Page } from '@playwright/test'
import { installTalosApiMocks } from './helpers/talosApiMocks'
import { waitForTalosWorkspaceReady as waitForWorkspaceReady } from './helpers/talosWorkspaceReady'
import { TALOS_WINDOW_IDS, TALOS_WINDOW_REGISTRY, type TalosWindowId } from '../../resources/js/lib/talosWindowRegistry'

const e2eSetupEmail = 'talos-e2e@example.test'
const e2eSetupPassword = 'talos-e2e-password-123'
const e2eLoginEmail = process.env.TALOS_E2E_EMAIL ?? 'test@example.com'
const e2eLoginPassword = process.env.TALOS_E2E_PASSWORD ?? 'password'
const ADVANCED_WINDOW_IDS = new Set<TalosWindowId>(['search', 'brain', 'tasks', 'notes', 'tools', 'doctor'])

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
    const railButton = rail.getByRole('button', { name: label, exact: true })

    if (!await railButton.isVisible().catch(() => false)) {
        const advanced = rail.getByRole('button', { name: 'Advanced', exact: true })
        if (await advanced.getAttribute('aria-expanded') !== 'true') {
            await advanced.click()
        }
    }

    await expect(rail.getByRole('button', { name: label, exact: true })).toBeVisible()
    await rail.getByRole('button', { name: label, exact: true }).click()

    const sheet = page.getByTestId('talos-mobile-tool-sheet')
    await expect(sheet).toHaveCount(1)
    await expect(sheet).toHaveAttribute('data-window-id', id)
    await expect(sheet).toBeVisible()
    await expect(sheet.getByRole('status', { name: /^Loading / })).toHaveCount(0)

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
        const header = document.querySelector<HTMLElement>('.talos-workspace-header')
        const mobileRail = document.querySelector<HTMLElement>('.talos-mobile-rail')
        const composer = document.querySelector<HTMLElement>('.talos-chat-composer-shell')
        const body = sheet?.querySelector<HTMLElement>('[data-testid="talos-mobile-sheet-body"]')

        if (!sheet || !header || !composer || !body) {
            return null
        }

        const sheetRect = sheet.getBoundingClientRect()
        const headerRect = header.getBoundingClientRect()
        const mobileRailRect = mobileRail?.getBoundingClientRect()
        const composerRect = composer.getBoundingClientRect()
        const bodyRect = body.getBoundingClientRect()
        const sheetHeader = sheet.querySelector<HTMLElement>('header')
        const sheetHeaderStyle = sheetHeader ? window.getComputedStyle(sheetHeader) : null
        const bodyStyle = window.getComputedStyle(body)
        const captionControlsWithinSheet = Array.from(sheet.querySelectorAll<HTMLElement>('header button')).every((control) => {
            const rect = control.getBoundingClientRect()
            return rect.left >= sheetRect.left - 0.5
                && rect.right <= sheetRect.right + 0.5
                && rect.top >= sheetRect.top - 0.5
                && rect.bottom <= sheetRect.bottom + 0.5
        })
        const scrollableDescendants = [sheet, ...Array.from(sheet.querySelectorAll<HTMLElement>('*'))]
            .filter((element) => {
                const style = window.getComputedStyle(element)
                return ['auto', 'scroll'].includes(style.overflowY)
                    && element.scrollHeight > element.clientHeight + 1
            })
            .map((element) => element === body ? 'body' : element.tagName.toLowerCase())

        const interactiveDescendants = Array.from(sheet.querySelectorAll<HTMLElement>(
            'button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
        )).filter((element) => !element.hasAttribute('hidden') && element.getAttribute('aria-hidden') !== 'true')
        const interactiveComposerIntersections = interactiveDescendants.flatMap((element) => {
            const rect = element.getBoundingClientRect()
            const visibleRect = {
                top: Math.max(rect.top, bodyRect.top),
                bottom: Math.min(rect.bottom, bodyRect.bottom),
                left: Math.max(rect.left, bodyRect.left),
                right: Math.min(rect.right, bodyRect.right),
            }
            const hasVisibleArea = visibleRect.bottom > visibleRect.top && visibleRect.right > visibleRect.left
            const intersects = hasVisibleArea
                && visibleRect.bottom > composerRect.top
                && visibleRect.top < composerRect.bottom
                && visibleRect.right > composerRect.left
                && visibleRect.left < composerRect.right

            return intersects ? [{ tag: element.tagName.toLowerCase(), label: element.getAttribute('aria-label') ?? element.textContent?.trim() ?? '' }] : []
        })

        return {
            viewport: { width: window.innerWidth, height: window.innerHeight },
            sheet: { top: sheetRect.top, right: sheetRect.right, bottom: sheetRect.bottom, left: sheetRect.left },
            headerBottom: headerRect.bottom,
            navigationBottom: mobileRailRect && mobileRailRect.height > 0 ? mobileRailRect.bottom : headerRect.bottom,
            composerTop: composerRect.top,
            bodyOverflowY: bodyStyle.overflowY,
            bodySafePaddingBottom: Number.parseFloat(bodyStyle.paddingBottom),
            headerSafePaddingTop: Number.parseFloat(sheetHeaderStyle?.paddingTop ?? '0'),
            captionControlsWithinSheet,
            scrollableDescendants,
            interactiveComposerIntersections,
        }
    })

    expect(geometry).not.toBeNull()
    expect(geometry?.sheet.left).toBeGreaterThanOrEqual(0)
    expect(geometry?.sheet.top).toBeGreaterThanOrEqual(Math.max(geometry?.headerBottom ?? 0, geometry?.navigationBottom ?? 0) - 0.5)
    expect(geometry?.sheet.right).toBeLessThanOrEqual((geometry?.viewport.width ?? 0) + 0.5)
    expect(geometry?.sheet.bottom).toBeLessThanOrEqual((geometry?.viewport.height ?? 0) + 0.5)
    expect(geometry?.sheet.bottom).toBeLessThanOrEqual((geometry?.composerTop ?? 0) - 8)
    expect(geometry?.bodyOverflowY).toBe('auto')
    expect(geometry?.bodySafePaddingBottom).toBeGreaterThanOrEqual(12)
    expect(geometry?.headerSafePaddingTop).toBeGreaterThanOrEqual(8)
    expect(geometry?.captionControlsWithinSheet).toBe(true)
    expect(geometry?.scrollableDescendants.filter((item) => item !== 'body')).toEqual([])
    expect(geometry?.interactiveComposerIntersections).toEqual([])
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
            await page.goto('/', { waitUntil: 'domcontentloaded' })
            await waitForWorkspaceReady(page)
            const contractFailures: string[] = []

            for (const id of TALOS_WINDOW_IDS) {
                const sheet = await openMobileWindow(page, id)
                try {
                    await expectMobileSheetContract(page, id)
                } catch (error) {
                    contractFailures.push(`${id}: ${error instanceof Error ? error.message : String(error)}`)
                } finally {
                    const rail = page.locator('[aria-label="TALOS workspace rail"]:visible').first()
                    const compactMobileRailVisible = await page.locator('.talos-mobile-rail:visible').count() > 0
                    const returnTarget = ADVANCED_WINDOW_IDS.has(id) && compactMobileRailVisible
                        ? rail.getByRole('button', { name: 'Advanced', exact: true })
                        : rail.getByRole('button', { name: mobileRailLabel(id), exact: true })
                    await sheet.getByRole('button', { name: `Close ${mobileRailLabel(id)}`, exact: true }).click()
                    await expect(page.getByTestId('talos-mobile-tool-sheet')).toHaveCount(0)
                    await expect(returnTarget).toBeFocused()
                }
            }

            expect(contractFailures).toEqual([])
        })
    })
}
