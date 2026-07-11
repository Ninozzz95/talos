import { expect, test, type Page, type TestInfo } from '@playwright/test'
import { installTalosApiMocks } from './helpers/talosApiMocks'
import { TALOS_WINDOW_IDS, TALOS_WINDOW_REGISTRY, type TalosWindowId } from '../../resources/js/lib/talosWindowRegistry'

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

    await expect(window).toHaveAttribute('aria-label', title)
    await expect(titleBar).toBeVisible()
    await expect(caption).toHaveCount(1)
    await expect(titleBarButtons).toHaveCount(5)
    await expect(resizeHandles).toHaveCount(8)
    await expect(controls).toHaveCount(14)
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
