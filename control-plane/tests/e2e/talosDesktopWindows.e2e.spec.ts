import { expect, test, type Page, type TestInfo } from '@playwright/test'
import { installTalosApiMocks } from './helpers/talosApiMocks'
import { capturePaintedTransition, expectPaintedTransition } from './helpers/talosVisibleMotion'
import { waitForTalosWorkspaceReady as waitForWorkspaceReady } from './helpers/talosWorkspaceReady'
import { createDefaultTalosMotionV6Preferences } from '../../resources/js/motion-v6/defaults'
import { TALOS_WINDOW_IDS, TALOS_WINDOW_REGISTRY, type TalosWindowId } from '../../resources/js/lib/talosWindowRegistry'

const e2eSetupEmail = 'talos-e2e@example.test'
const e2eSetupPassword = 'talos-e2e-password-123'
const e2eLoginEmail = process.env.TALOS_E2E_EMAIL ?? 'test@example.com'
const e2eLoginPassword = process.env.TALOS_E2E_PASSWORD ?? 'password'

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

function windowTitle(id: TalosWindowId) {
    return TALOS_WINDOW_REGISTRY[id].title
}

async function openDesktopWindow(page: Page, id: TalosWindowId) {
    const rail = page.getByRole('complementary', { name: 'TALOS workspace rail' })
    const title = windowTitle(id)
    const launcher = rail.getByRole('button', { name: title, exact: true })

    if (!await launcher.isVisible().catch(() => false)) {
        const advanced = rail.getByRole('button', { name: 'Advanced', exact: true })
        if (await advanced.getAttribute('aria-expanded') !== 'true') {
            await advanced.click()
        }
    }

    await expect(launcher).toBeVisible()
    await expect(launcher).toBeEnabled()
    await launcher.click()

    const window = page.locator(`[data-window-id="${id}"]`)
    await expect(window).toHaveCount(1)
    await expect(window).toBeVisible()
    await expect.poll(async () => window.getAttribute('data-window-transition')).toBe('idle')
    await expect(window.getByRole('status', { name: /^Loading / })).toHaveCount(0)
    await expect.poll(async () => window.evaluate((element) => element.contains(document.activeElement))).toBe(true)

    return { launcher, window }
}

async function inspectDesktopWindow(page: Page, id: TalosWindowId) {
    const title = windowTitle(id)
    const window = page.locator(`[data-window-id="${id}"]`)
    const titleBar = window.locator('header')
    const caption = titleBar.locator('[role="button"]')
    const titleBarButtons = titleBar.locator('button')
    const resizeHandles = window.locator('.talos-window-resize-handle')
    const controls = window.locator('header [role="button"], header button, .talos-window-resize-handle')
    const hasPeek = id === 'settings' || id === 'theme'

    await expect(window).toHaveAttribute('aria-label', title)
    await expect(titleBar).toBeVisible()
    await expect(caption).toHaveCount(1)
    await expect(titleBarButtons).toHaveCount(hasPeek ? 6 : 5)
    await expect(resizeHandles).toHaveCount(8)
    await expect(controls).toHaveCount(hasPeek ? 15 : 14)
    await expect(window.locator('.talos-tool-window-body')).toBeVisible()

    for (let index = 0; index < await controls.count(); index += 1) {
        const control = controls.nth(index)
        await expect(control).toBeVisible()
        await expect(control).toBeEnabled()
        await control.focus()
        await expect(control).toBeFocused()
    }

    const geometry = await page.evaluate((windowId) => {
        const windowElement = document.querySelector<HTMLElement>(`[data-window-id="${windowId}"]`)
        const composer = document.querySelector<HTMLElement>('.talos-chat-composer-shell')
        const composerArea = document.querySelector<HTMLElement>('.talos-composer-area')
        const workspace = document.querySelector<HTMLElement>('.talos-workspace')
        const stage = document.querySelector<HTMLElement>('[data-testid="talos-desktop-window-stage"]')
        const titleBar = windowElement?.querySelector<HTMLElement>('header')
        const body = windowElement?.querySelector<HTMLElement>('.talos-tool-window-body')

        if (!windowElement || !composer || !composerArea || !stage || !titleBar || !body) {
            return null
        }

        const viewport = { width: window.innerWidth, height: window.innerHeight }
        const windowRect = windowElement.getBoundingClientRect()
        const composerRect = composer.getBoundingClientRect()
        const composerAreaRect = composerArea.getBoundingClientRect()
        const stageRect = stage.getBoundingClientRect()
        const titleBarRect = titleBar.getBoundingClientRect()
        const bodyStyle = window.getComputedStyle(body)
        const controls = Array.from(windowElement.querySelectorAll<HTMLElement>(
            'header [role="button"], header button, .talos-window-resize-handle',
        ))
        const uniqueControls = [...new Set(controls)]
        const controlGeometry = uniqueControls.map((control) => {
            const rect = control.getBoundingClientRect()
            const x = rect.left + (rect.width / 2)
            const y = rect.top + (rect.height / 2)
            const hit = document.elementFromPoint(x, y)
            const style = window.getComputedStyle(control)

            return {
                label: control.getAttribute('aria-label') ?? control.textContent?.trim() ?? '',
                rect: {
                    top: rect.top,
                    right: rect.right,
                    bottom: rect.bottom,
                    left: rect.left,
                    width: rect.width,
                    height: rect.height,
                },
                enabled: !(control instanceof HTMLButtonElement) || !control.disabled,
                pointerEvents: style.pointerEvents,
                reachable: Boolean(hit && (hit === control || control.contains(hit))),
            }
        })
        const scrollableDescendants = [windowElement, ...Array.from(windowElement.querySelectorAll<HTMLElement>('*'))]
            .filter((element) => {
                const style = window.getComputedStyle(element)
                return ['auto', 'scroll'].includes(style.overflowY)
                    && element.scrollHeight > element.clientHeight + 1
            })
            .map((element) => element === body ? 'body' : element.className || element.tagName.toLowerCase())

        return {
            viewport,
            documentScrollWidth: document.documentElement.scrollWidth,
            bodyScrollWidth: document.body.scrollWidth,
            window: {
                top: windowRect.top,
                right: windowRect.right,
                bottom: windowRect.bottom,
                left: windowRect.left,
            },
            titleBar: {
                top: titleBarRect.top,
                right: titleBarRect.right,
                bottom: titleBarRect.bottom,
                left: titleBarRect.left,
            },
            composerTop: composerRect.top,
            composerHeight: composerRect.height,
            composerAreaHeight: composerAreaRect.height,
            composerHeightToken: workspace?.style.getPropertyValue('--talos-composer-height') ?? '',
            stage: { top: stageRect.top, bottom: stageRect.bottom, height: stageRect.height },
            bodyOverflowY: bodyStyle.overflowY,
            controlGeometry,
            scrollableDescendants,
        }
    }, id)

    expect(geometry).not.toBeNull()
    expect(geometry?.window.left).toBeGreaterThanOrEqual(0)
    expect(geometry?.window.top).toBeGreaterThanOrEqual(0)
    expect(geometry?.window.right).toBeLessThanOrEqual((geometry?.viewport.width ?? 0) + 0.5)
    expect(
        geometry?.window.bottom,
        `window/composer geometry: ${JSON.stringify(geometry)}`,
    ).toBeLessThanOrEqual((geometry?.composerTop ?? 0) - 8)
    expect(geometry?.titleBar.left).toBeGreaterThanOrEqual(geometry?.window.left ?? 0)
    expect(geometry?.titleBar.right).toBeLessThanOrEqual(geometry?.window.right ?? 0)
    expect(geometry?.titleBar.top).toBeGreaterThanOrEqual(geometry?.window.top ?? 0)
    expect(geometry?.titleBar.bottom).toBeLessThanOrEqual((geometry?.composerTop ?? 0) - 8)
    expect(geometry?.documentScrollWidth).toBeLessThanOrEqual((geometry?.viewport.width ?? 0) + 1)
    expect(geometry?.bodyScrollWidth).toBeLessThanOrEqual((geometry?.viewport.width ?? 0) + 1)
    expect(geometry?.bodyOverflowY).toBe('auto')
    expect(geometry?.scrollableDescendants.filter((owner) => owner !== 'body')).toEqual([])

    for (const control of geometry?.controlGeometry ?? []) {
        expect(control.enabled, control.label).toBe(true)
        expect(control.pointerEvents, control.label).not.toBe('none')
        expect(control.rect.width, control.label).toBeGreaterThan(0)
        expect(control.rect.height, control.label).toBeGreaterThan(0)
        expect(control.rect.left, control.label).toBeGreaterThanOrEqual(0)
        expect(control.rect.top, control.label).toBeGreaterThanOrEqual(0)
        expect(control.rect.right, control.label).toBeLessThanOrEqual((geometry?.viewport.width ?? 0) + 0.5)
        expect(control.rect.bottom, control.label).toBeLessThanOrEqual((geometry?.composerTop ?? 0) - 8)
        expect(control.reachable, control.label).toBe(true)
    }
}

async function attachViewportScreenshot(page: Page, testInfo: TestInfo, viewportName: string) {
    if (page.isClosed()) {
        return
    }

    await testInfo.attach(`talos-desktop-windows-${viewportName}.png`, {
        body: await page.screenshot({ fullPage: true, animations: 'disabled' }),
        contentType: 'image/png',
    })
}

async function enableExpressiveWindowMotion(page: Page) {
    const preferences = createDefaultTalosMotionV6Preferences()
    preferences.mode = 'adaptive'
    preferences.background_enabled = false
    preferences.interface_enabled = true
    preferences.interface.profile = 'expressive'
    preferences.interface.intensity = 70
    preferences.interface.easing = 'soft'

    await page.evaluate(async (motion) => {
        const current = await fetch('/api/talos/settings', { headers: { Accept: 'application/json' } })
        const currentPayload = await current.json() as { data?: { revision?: unknown } }
        const revision = currentPayload.data?.revision
        if (!Number.isSafeInteger(revision)) throw new Error('Window motion gate requires a settings revision.')
        const response = await fetch('/api/talos/settings', {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
            body: JSON.stringify({
                expected_revision: revision,
                preferences: { theme_motion_v6: motion },
            }),
        })
        if (!response.ok) throw new Error(`Window motion setup failed with ${response.status}.`)
    }, preferences)
}

function expectMatchingWindowBounds(
    actual: { x: number; y: number; width: number; height: number } | null,
    expected: { x: number; y: number; width: number; height: number } | null,
    tolerance = 2,
) {
    expect(actual).toBeTruthy()
    expect(expected).toBeTruthy()
    expect(Math.abs(actual!.x - expected!.x)).toBeLessThanOrEqual(tolerance)
    expect(Math.abs(actual!.y - expected!.y)).toBeLessThanOrEqual(tolerance)
    expect(Math.abs(actual!.width - expected!.width)).toBeLessThanOrEqual(tolerance)
    expect(Math.abs(actual!.height - expected!.height)).toBeLessThanOrEqual(tolerance)
}

test.beforeEach(async ({ page }) => {
    await installTalosApiMocks(page)
    await page.emulateMedia({ reducedMotion: 'no-preference' })
    await ensureTalosAuthenticated(page)
})

for (const viewport of [
    { name: '1280x800', width: 1280, height: 800 },
    { name: '1440x900', width: 1440, height: 900 },
    { name: '1920x1080', width: 1920, height: 1080 },
] as const) {
    test.describe(`TALOS desktop windows at ${viewport.name}`, () => {
        test.use({ viewport: { width: viewport.width, height: viewport.height } })

        test('opens every registered window one at a time through the desktop rail', async ({ page, isMobile }, testInfo) => {
            test.skip(isMobile, 'desktop window contract runs in the chromium desktop project')
            test.setTimeout(120_000)

            await page.goto('/', { waitUntil: 'domcontentloaded' })
            await waitForWorkspaceReady(page)
            const contractFailures: string[] = []

            try {
                for (const id of TALOS_WINDOW_IDS) {
                    const title = windowTitle(id)
                    let opened: Awaited<ReturnType<typeof openDesktopWindow>> | null = null

                    try {
                        opened = await openDesktopWindow(page, id)
                        await inspectDesktopWindow(page, id)
                    } catch (error) {
                        contractFailures.push(`${id}: ${error instanceof Error ? error.message : String(error)}`)
                    } finally {
                        if (opened) {
                            const close = opened.window.getByRole('button', { name: `Close ${title}`, exact: true })
                            await expect(close).toBeVisible()
                            await close.click()
                            await expect(page.locator(`[data-window-id="${id}"]`)).toHaveCount(0)
                            await expect(opened.launcher).toBeFocused()
                        }
                    }
                }
            } finally {
                await attachViewportScreenshot(page, testInfo, viewport.name)
            }

            expect(contractFailures).toEqual([])
        })
    })
}

test.describe('TALOS complete desktop window painted lifecycle', () => {
    test.use({ viewport: { width: 1440, height: 900 } })

    test('painted-frame trajectories cover open and close for every registered window', async ({ page, isMobile }) => {
        test.skip(isMobile, 'desktop painted lifecycle runs in the chromium desktop project')
        test.setTimeout(240_000)

        await enableExpressiveWindowMotion(page)
        await page.reload({ waitUntil: 'domcontentloaded' })
        await waitForWorkspaceReady(page)
        const workspace = page.getByTestId('talos-workspace')
        const stage = page.getByTestId('talos-desktop-window-stage')
        const rail = page.getByRole('complementary', { name: 'TALOS workspace rail' })
        const failures: string[] = []
        await expect(workspace).toHaveAttribute('data-ui-motion-disabled', 'false')
        await expect(workspace).toHaveAttribute('data-ui-animation-profile', 'expressive')
        for (const id of TALOS_WINDOW_IDS) {
            const title = windowTitle(id)
            const launcher = rail.getByRole('button', { name: title, exact: true })
            const window = page.locator(`[data-window-id="${id}"]`)

            try {
                if (!await launcher.isVisible().catch(() => false)) {
                    const advanced = rail.getByRole('button', { name: 'Advanced', exact: true })
                    if (await advanced.getAttribute('aria-expanded') !== 'true') await advanced.click()
                }
                await expect(launcher).toBeVisible()

                const opening = await capturePaintedTransition({
                    page,
                    target: window,
                    paintSurface: stage,
                    action: () => launcher.click(),
                    waitForFinal: () => expect(window).toHaveAttribute('data-window-transition', 'idle'),
                })
                expect(opening.presentation.lifecycle).toBe('opening')
                expectPaintedTransition(opening, { minimumDurationMs: 240, minimumPixelRatio: 0.001 })
                await expect(window.getByRole('status', { name: /^Loading / })).toHaveCount(0)

                const closing = await capturePaintedTransition({
                    page,
                    target: window,
                    paintSurface: stage,
                    action: () => window.getByRole('button', { name: `Close ${title}`, exact: true }).click(),
                    waitForFinal: () => expect(window).toHaveCount(0),
                })
                expect(closing.presentation.lifecycle).toBe('closing')
                expectPaintedTransition(closing, {
                    minimumDurationMs: 180,
                    minimumPixelRatio: 0.001,
                    midpointInteractive: false,
                })
                await expect(launcher).toBeFocused()
            } catch (error) {
                failures.push(`${id}: ${error instanceof Error ? error.message : String(error)}`)
            } finally {
                if (await window.count()) {
                    await window.getByRole('button', { name: `Close ${title}`, exact: true }).click().catch(() => undefined)
                    await expect(window).toHaveCount(0)
                }
            }
        }

        expect(failures).toEqual([])
    })

    test('painted-frame trajectories cover minimize, restore, fullscreen, and unfullscreen for every registered window', async ({ page, isMobile }) => {
        test.skip(isMobile, 'desktop painted lifecycle runs in the chromium desktop project')
        test.setTimeout(600_000)

        await enableExpressiveWindowMotion(page)
        await page.reload({ waitUntil: 'domcontentloaded' })
        await waitForWorkspaceReady(page)
        const workspace = page.getByTestId('talos-workspace')
        const stage = page.getByTestId('talos-desktop-window-stage')
        const rail = page.getByRole('complementary', { name: 'TALOS workspace rail' })
        const failures: string[] = []
        await expect(workspace).toHaveAttribute('data-ui-motion-disabled', 'false')
        await expect(workspace).toHaveAttribute('data-ui-animation-profile', 'expressive')
        const expectedDurations = await workspace.evaluate((element) => {
            const style = getComputedStyle(element)
            const milliseconds = (property: string) => {
                const value = style.getPropertyValue(property).trim()
                const match = value.match(/^([0-9]+(?:\.[0-9]+)?)ms$/)
                if (!match) throw new Error(`Expected ${property} to resolve to milliseconds, received "${value}".`)
                return Number(match[1])
            }

            return {
                minimize: milliseconds('--talos-motion-duration-window-minimize'),
                restore: milliseconds('--talos-motion-duration-window-restore'),
                open: milliseconds('--talos-motion-duration-window-open'),
            }
        })

        for (const id of TALOS_WINDOW_IDS) {
            const title = windowTitle(id)
            const launcher = rail.getByRole('button', { name: title, exact: true })
            const window = page.locator(`[data-window-id="${id}"]`)

            try {
                if (!await launcher.isVisible().catch(() => false)) {
                    const advanced = rail.getByRole('button', { name: 'Advanced', exact: true })
                    if (await advanced.getAttribute('aria-expanded') !== 'true') await advanced.click()
                }
                await launcher.click()
                await expect(window).toHaveAttribute('data-window-transition', 'idle')
                await expect(window.getByRole('status', { name: /^Loading / })).toHaveCount(0)
                const originalBounds = await window.boundingBox()

                const minimizing = await capturePaintedTransition({
                    page,
                    target: window,
                    paintSurface: stage,
                    action: () => window.getByRole('button', { name: `Minimize ${title}`, exact: true }).click(),
                    waitForFinal: () => expect(window).toHaveCount(0),
                })
                expect(minimizing.presentation.lifecycle).toBe('minimizing')
                expectPaintedTransition(minimizing, {
                    minimumDurationMs: Math.max(1, expectedDurations.minimize - 1),
                    minimumPixelRatio: 0.001,
                    midpointInteractive: false,
                })

                const restoreButton = page.getByTestId(`talos-restore-window-${id}`)
                await expect(restoreButton).toBeVisible()
                const restoring = await capturePaintedTransition({
                    page,
                    target: window,
                    paintSurface: stage,
                    action: () => restoreButton.click(),
                    waitForFinal: () => expect(window).toHaveAttribute('data-window-transition', 'idle'),
                })
                expect(restoring.presentation.lifecycle).toBe('restoring')
                expectPaintedTransition(restoring, {
                    minimumDurationMs: Math.max(1, expectedDurations.restore - 1),
                    minimumPixelRatio: 0.001,
                })
                expectMatchingWindowBounds(await window.boundingBox(), originalBounds)
                await expect(window).toBeFocused()

                const maximizing = await capturePaintedTransition({
                    page,
                    target: window,
                    paintSurface: stage,
                    action: () => window.getByRole('button', { name: `Fullscreen ${title}`, exact: true }).click(),
                    waitForFinal: () => expect(window).toHaveAttribute('data-window-transition', 'idle'),
                })
                expect(maximizing.presentation.lifecycle).toBe('maximizing')
                expectPaintedTransition(maximizing, {
                    minimumDurationMs: Math.max(1, expectedDurations.open - 1),
                    minimumPixelRatio: 0.01,
                })
                await expect(window).toHaveAttribute('data-window-fullscreen', 'true')
                expectMatchingWindowBounds(await window.boundingBox(), await stage.boundingBox(), 1)

                const unmaximizing = await capturePaintedTransition({
                    page,
                    target: window,
                    paintSurface: stage,
                    action: () => window.getByRole('button', { name: `Exit fullscreen ${title}`, exact: true }).click(),
                    waitForFinal: () => expect(window).toHaveAttribute('data-window-transition', 'idle'),
                })
                expect(unmaximizing.presentation.lifecycle).toBe('unmaximizing')
                expectPaintedTransition(unmaximizing, {
                    minimumDurationMs: Math.max(1, expectedDurations.open - 1),
                    minimumPixelRatio: 0.01,
                })
                await expect(window).toHaveAttribute('data-window-fullscreen', 'false')
                expectMatchingWindowBounds(await window.boundingBox(), originalBounds)

                await window.getByRole('button', { name: `Close ${title}`, exact: true }).click()
                await expect(window).toHaveCount(0)
            } catch (error) {
                failures.push(`${id}: ${error instanceof Error ? error.message : String(error)}`)
            } finally {
                if (await window.count()) {
                    await window.getByRole('button', { name: `Exit fullscreen ${title}`, exact: true }).click().catch(() => undefined)
                    await expect.poll(async () => window.getAttribute('data-window-transition')).toBe('idle').catch(() => undefined)
                    await window.getByRole('button', { name: `Close ${title}`, exact: true }).click().catch(() => undefined)
                    await expect(window).toHaveCount(0)
                }
            }
        }

        expect(failures).toEqual([])
    })
})

test.describe('TALOS upstream desktop window interactions', () => {
    test.use({ viewport: { width: 1440, height: 900 } })

    test('keeps a resized floating surface flush with the right stage edge', async ({ page, isMobile }) => {
        test.skip(isMobile, 'desktop interactions run in the chromium desktop project')

        await page.goto('/', { waitUntil: 'domcontentloaded' })
        await waitForWorkspaceReady(page)
        const { window } = await openDesktopWindow(page, 'theme')
        const frame = page.locator('[data-window-frame-id="theme"]')
        const stage = page.getByTestId('talos-desktop-window-stage')
        const resizeHandle = page.getByLabel('Resize Theme window right')
        const stageBounds = await stage.boundingBox()
        const resizeBounds = await resizeHandle.boundingBox()
        expect(stageBounds).toBeTruthy()
        expect(resizeBounds).toBeTruthy()

        const resizeX = resizeBounds!.x + (resizeBounds!.width / 2)
        const resizeY = resizeBounds!.y + Math.min(120, resizeBounds!.height / 2)
        await page.mouse.move(resizeX, resizeY)
        await page.mouse.down()
        await page.mouse.move(Math.min(resizeX + 300, stageBounds!.x + stageBounds!.width - 8), resizeY, { steps: 10 })
        await page.mouse.up()

        const resizedFrame = await frame.boundingBox()
        expect(resizedFrame).toBeTruthy()
        expect(resizedFrame!.width).toBeGreaterThan(980)

        const dragHandle = window.locator('.talos-window-drag-handle[aria-label="Drag Theme window"]')
        const dragBounds = await dragHandle.boundingBox()
        expect(dragBounds).toBeTruthy()
        const pointerOffsetX = (dragBounds!.x + 48) - resizedFrame!.x
        const targetPointerX = stageBounds!.x + stageBounds!.width - resizedFrame!.width + pointerOffsetX
        const targetPointerY = dragBounds!.y + (dragBounds!.height / 2)
        await page.mouse.move(dragBounds!.x + 48, targetPointerY)
        await page.mouse.down()
        await page.mouse.move(targetPointerX + 64, targetPointerY, { steps: 12 })
        await page.mouse.up()

        const finalFrame = await frame.boundingBox()
        const finalSurface = await window.boundingBox()
        const finalStage = await stage.boundingBox()
        expect(finalFrame).toBeTruthy()
        expect(finalSurface).toBeTruthy()
        expect(finalStage).toBeTruthy()
        expect(Math.abs((finalFrame!.x + finalFrame!.width) - (finalStage!.x + finalStage!.width))).toBeLessThanOrEqual(1)
        expect(Math.abs(finalSurface!.width - finalFrame!.width)).toBeLessThanOrEqual(1)
        expect(Math.abs((finalSurface!.x + finalSurface!.width) - (finalStage!.x + finalStage!.width))).toBeLessThanOrEqual(1)
    })

    test('drags through interactjs into side snap and fullscreen, restores geometry, and exposes transient Peek', async ({ page, isMobile }, testInfo) => {
        test.skip(isMobile, 'desktop interactions run in the chromium desktop project')

        await page.goto('/', { waitUntil: 'domcontentloaded' })
        await waitForWorkspaceReady(page)
        const { window } = await openDesktopWindow(page, 'theme')
        const frame = page.locator('[data-window-frame-id="theme"]')
        const stage = page.getByTestId('talos-desktop-window-stage')
        const handle = window.locator('.talos-window-drag-handle[aria-label="Drag Theme window"]')
        const initialBounds = await window.boundingBox()
        const stageBounds = await stage.boundingBox()
        expect(initialBounds).toBeTruthy()
        expect(stageBounds).toBeTruthy()

        const initialHandle = await handle.boundingBox()
        expect(initialHandle).toBeTruthy()
        await page.mouse.move(initialHandle!.x + 48, initialHandle!.y + (initialHandle!.height / 2))
        await page.mouse.down()
        await page.mouse.move(stageBounds!.x + 1, stageBounds!.y + (stageBounds!.height / 2), { steps: 12 })

        const preview = page.getByTestId('talos-window-snap-preview')
        await expect(preview).toBeVisible()
        await expect(preview).toHaveAttribute('data-snap-target', 'left-half')
        await page.mouse.up()

        await expect(frame).toHaveAttribute('data-window-tile-target', 'left-half')
        await expect(preview).toHaveCount(0)
        await expect(page.locator('.talos-left-rail')).toHaveAttribute('data-sidebar-state', 'collapsed')
        await expect(page.locator('.talos-chat-scroll-root')).toHaveAttribute('data-window-reflow', 'left')
        await expect(window).toHaveAttribute('data-window-transition', 'snapping')
        await expect.poll(async () => window.getAttribute('data-window-transition')).toBe('idle')
        const committedStageBounds = await stage.boundingBox()
        const snappedBounds = await window.boundingBox()
        expect(committedStageBounds).toBeTruthy()
        expect(snappedBounds).toBeTruthy()
        expect(Math.abs(snappedBounds!.x - committedStageBounds!.x)).toBeLessThanOrEqual(1)
        expect(Math.abs(snappedBounds!.y - committedStageBounds!.y)).toBeLessThanOrEqual(1)
        expect(Math.abs(snappedBounds!.width - (committedStageBounds!.width / 2))).toBeLessThanOrEqual(1)
        expect(Math.abs(snappedBounds!.height - committedStageBounds!.height)).toBeLessThanOrEqual(1)
        const snappedRight = snappedBounds!.x + snappedBounds!.width
        expect(Math.abs(snappedRight - (committedStageBounds!.x + (committedStageBounds!.width / 2)))).toBeLessThanOrEqual(1)
        const leftSnapSurfaceStyle = await window.evaluate((element) => {
            const style = window.getComputedStyle(element)
            return {
                borderRightWidth: style.borderRightWidth,
                borderTopRightRadius: style.borderTopRightRadius,
                borderBottomRightRadius: style.borderBottomRightRadius,
            }
        })
        expect(Number.parseFloat(leftSnapSurfaceStyle.borderRightWidth)).toBeGreaterThan(0)
        expect(leftSnapSurfaceStyle.borderTopRightRadius).toBe('0px')
        expect(leftSnapSurfaceStyle.borderBottomRightRadius).toBe('0px')
        for (const surface of [
            page.locator('.talos-workspace-header'),
            page.locator('.talos-chat-thread'),
            page.locator('.talos-composer-area'),
        ]) {
            const surfaceBounds = await surface.boundingBox()
            expect(surfaceBounds).toBeTruthy()
            expect(surfaceBounds!.x).toBeGreaterThanOrEqual(snappedRight - 1)
        }
        await expect.poll(() => page.evaluate(() => window.localStorage.getItem('talos.windowLayout.v2'))).toContain('left-half')

        await page.reload({ waitUntil: 'domcontentloaded' })
        await waitForWorkspaceReady(page)
        await openDesktopWindow(page, 'theme')
        await expect(frame).toHaveAttribute('data-window-tile-target', 'left-half')
        const reloadedSnapBounds = await window.boundingBox()
        expect(Math.abs(reloadedSnapBounds!.x - snappedBounds!.x)).toBeLessThanOrEqual(1)
        expect(Math.abs(reloadedSnapBounds!.y - snappedBounds!.y)).toBeLessThanOrEqual(1)
        expect(Math.abs(reloadedSnapBounds!.width - snappedBounds!.width)).toBeLessThanOrEqual(1)
        expect(Math.abs(reloadedSnapBounds!.height - snappedBounds!.height)).toBeLessThanOrEqual(1)

        const snappedHandle = await handle.boundingBox()
        expect(snappedHandle).toBeTruthy()
        await page.mouse.move(snappedHandle!.x + 72, snappedHandle!.y + (snappedHandle!.height / 2))
        await page.mouse.down()
        const restoredStageBounds = await stage.boundingBox()
        expect(restoredStageBounds).toBeTruthy()
        await page.mouse.move(restoredStageBounds!.x + (restoredStageBounds!.width * 0.58), restoredStageBounds!.y + 180, { steps: 12 })
        await page.mouse.up()
        await expect(frame).toHaveAttribute('data-window-tile-target', 'none')
        const restoredFromTile = await window.boundingBox()
        expect(Math.abs(restoredFromTile!.width - initialBounds!.width)).toBeLessThanOrEqual(2)
        expect(Math.abs(restoredFromTile!.height - initialBounds!.height)).toBeLessThanOrEqual(2)

        const peekButton = window.getByRole('button', { name: 'Peek behind Theme' })
        await peekButton.click()
        await expect(window).toHaveAttribute('data-window-peeking', 'true')
        await expect(window.getByRole('button', { name: 'Stop peeking behind Theme' })).toHaveAttribute('aria-pressed', 'true')
        const peekVisual = await window.evaluate((element) => ({
            background: window.getComputedStyle(element).backgroundColor,
            opacity: window.getComputedStyle(element).opacity,
        }))
        expect(peekVisual.opacity).toBe('1')
        expect(peekVisual.background).toMatch(/0\.55|55%/)
        await window.getByRole('button', { name: 'Stop peeking behind Theme' }).click()
        await expect(window).toHaveAttribute('data-window-peeking', 'false')

        const beforeFullscreen = await window.boundingBox()
        const floatingHandle = await handle.boundingBox()
        expect(floatingHandle).toBeTruthy()
        await page.mouse.move(floatingHandle!.x + 72, floatingHandle!.y + (floatingHandle!.height / 2))
        await page.mouse.down()
        const fullscreenStageBounds = await stage.boundingBox()
        expect(fullscreenStageBounds).toBeTruthy()
        await page.mouse.move(fullscreenStageBounds!.x + (fullscreenStageBounds!.width / 2), fullscreenStageBounds!.y + 18, { steps: 12 })
        await expect(preview).toBeVisible()
        await expect(preview).toHaveAttribute('data-snap-target', 'fullscreen-workspace')
        await page.mouse.move(fullscreenStageBounds!.x + (fullscreenStageBounds!.width / 2), fullscreenStageBounds!.y, { steps: 4 })
        await expect(preview).toHaveAttribute('data-snap-target', 'fullscreen-workspace')
        await page.mouse.up()

        await expect(frame).toHaveAttribute('data-window-tile-target', 'fullscreen-workspace')
        await expect(window).toHaveAttribute('data-window-transition', 'snapping')
        await expect.poll(async () => window.getAttribute('data-window-transition')).toBe('idle')
        const fullscreenBounds = await window.boundingBox()
        expect(Math.abs(fullscreenBounds!.x - fullscreenStageBounds!.x)).toBeLessThanOrEqual(1)
        expect(Math.abs(fullscreenBounds!.y - fullscreenStageBounds!.y)).toBeLessThanOrEqual(1)
        expect(Math.abs(fullscreenBounds!.width - fullscreenStageBounds!.width)).toBeLessThanOrEqual(1)
        expect(Math.abs(fullscreenBounds!.height - fullscreenStageBounds!.height)).toBeLessThanOrEqual(1)
        const composerBounds = await page.locator('.talos-chat-composer-shell').boundingBox()
        expect(fullscreenBounds!.y + fullscreenBounds!.height).toBeGreaterThan(composerBounds!.y)

        await window.getByRole('button', { name: 'Exit fullscreen Theme' }).click()
        await expect.poll(async () => window.getAttribute('data-window-transition')).toBe('idle')
        await expect(frame).toHaveAttribute('data-window-tile-target', 'none')
        const finalBounds = await window.boundingBox()
        expect(Math.abs(finalBounds!.x - beforeFullscreen!.x)).toBeLessThanOrEqual(2)
        expect(Math.abs(finalBounds!.y - beforeFullscreen!.y)).toBeLessThanOrEqual(2)
        expect(Math.abs(finalBounds!.width - beforeFullscreen!.width)).toBeLessThanOrEqual(2)
        expect(Math.abs(finalBounds!.height - beforeFullscreen!.height)).toBeLessThanOrEqual(2)

        await testInfo.attach('talos-window-interactions-final.png', {
            body: await page.screenshot({ animations: 'disabled' }),
            contentType: 'image/png',
        })
    })

    test('keeps snap functional while the operating system disables motion', async ({ page, isMobile }, testInfo) => {
        test.skip(isMobile, 'desktop interactions run in the chromium desktop project')
        await page.emulateMedia({ reducedMotion: 'reduce' })
        await page.goto('/', { waitUntil: 'domcontentloaded' })
        await waitForWorkspaceReady(page)
        const { window } = await openDesktopWindow(page, 'notes')
        const frame = page.locator('[data-window-frame-id="notes"]')
        const stageBounds = await page.getByTestId('talos-desktop-window-stage').boundingBox()
        const handleBounds = await window.locator('.talos-window-drag-handle[aria-label="Drag Notes window"]').boundingBox()
        expect(stageBounds).toBeTruthy()
        expect(handleBounds).toBeTruthy()

        await page.mouse.move(handleBounds!.x + 48, handleBounds!.y + (handleBounds!.height / 2))
        await page.mouse.down()
        await page.mouse.move(stageBounds!.x + stageBounds!.width - 1, stageBounds!.y + (stageBounds!.height / 2), { steps: 12 })
        const preview = page.getByTestId('talos-window-snap-preview')
        await expect(preview).toHaveAttribute('data-snap-target', 'right-half')
        expect(await preview.evaluate((element) => window.getComputedStyle(element).transitionDuration)).toBe('0s')
        await page.mouse.up()

        await expect(frame).toHaveAttribute('data-window-tile-target', 'right-half')
        await expect(window).toBeVisible()
        const snappedBounds = await window.boundingBox()
        const committedStageBounds = await page.getByTestId('talos-desktop-window-stage').boundingBox()
        const workspaceBounds = await page.getByTestId('talos-workspace').boundingBox()
        expect(snappedBounds).toBeTruthy()
        expect(committedStageBounds).toBeTruthy()
        expect(workspaceBounds).toBeTruthy()
        expect(Math.abs(
            (snappedBounds!.x + snappedBounds!.width)
            - (committedStageBounds!.x + committedStageBounds!.width),
        )).toBeLessThanOrEqual(1)
        expect(Math.abs(
            snappedBounds!.x - (committedStageBounds!.x + (committedStageBounds!.width / 2)),
        )).toBeLessThanOrEqual(1)
        expect(Math.abs(
            (committedStageBounds!.x + committedStageBounds!.width)
            - (workspaceBounds!.x + workspaceBounds!.width),
        )).toBeLessThanOrEqual(1)
        const snappedSurfaceStyle = await window.evaluate((element) => {
            const style = window.getComputedStyle(element)
            return {
                borderLeftWidth: style.borderLeftWidth,
                borderTopLeftRadius: style.borderTopLeftRadius,
                borderBottomLeftRadius: style.borderBottomLeftRadius,
            }
        })
        expect(Number.parseFloat(snappedSurfaceStyle.borderLeftWidth)).toBeGreaterThan(0)
        expect(snappedSurfaceStyle.borderTopLeftRadius).toBe('0px')
        expect(snappedSurfaceStyle.borderBottomLeftRadius).toBe('0px')

        const header = page.getByTestId('talos-workspace-header')
        const messageScaleControls = header.getByLabel('Message size controls')
        await expect(messageScaleControls).toBeVisible()
        await expect(page.locator('.talos-chat-thread').getByLabel('Message size controls')).toHaveCount(0)
        await testInfo.attach('talos-right-snap-regression.png', {
            body: await page.screenshot({ animations: 'disabled' }),
            contentType: 'image/png',
        })
    })
})
