import { expect, test, type Page, type Route } from '@playwright/test'
import { installTalosApiMocks } from './helpers/talosApiMocks'

const appEntryPattern = /\/(?:build\/assets\/app-[^/]+\.js|resources\/js\/app\.js)(?:\?.*)?$/

async function capturePaintedFrame(page: Page): Promise<Buffer> {
    const session = await page.context().newCDPSession(page)
    try {
        const frame = await session.send('Page.captureScreenshot', {
            format: 'png',
            fromSurface: true,
            captureBeyondViewport: false,
        })
        return Buffer.from(frame.data, 'base64')
    } finally {
        await session.detach()
    }
}

async function signIn(page: Page) {
    await page.goto('/login', { waitUntil: 'domcontentloaded' })

    const form = page.locator('#talos-login-form')
    if (await form.isVisible().catch(() => false)) {
        await form.getByLabel('Email').fill(process.env.TALOS_E2E_EMAIL ?? 'test@example.com')
        await form.getByLabel('Password').fill(process.env.TALOS_E2E_PASSWORD ?? 'password')
        await Promise.all([
            page.waitForURL(/\/$/, { waitUntil: 'domcontentloaded' }),
            form.getByRole('button', { name: 'Sign in' }).click(),
        ])
    }

    await expect(page.locator('#talos-workspace-root[data-authenticated="true"]')).toHaveCount(1)
    await expect(page.getByLabel('Message TALOS')).toBeVisible({ timeout: 45_000 })
}

async function gateAppEntry(page: Page) {
    let release!: () => void
    let intercepted = false
    const gate = new Promise<void>((resolve) => {
        release = resolve
    })
    const handler = async (route: Route) => {
        intercepted = true
        await gate
        await route.continue()
    }

    await page.route(appEntryPattern, handler)

    return {
        release,
        waitUntilIntercepted: () => expect.poll(() => intercepted).toBe(true),
        dispose: () => page.unroute(appEntryPattern, handler),
    }
}

async function expectServerRenderedBootFrame(page: Page) {
    const loader = page.locator('[data-talos-boot-loader="true"]')
    const root = page.locator('#talos-workspace-root')

    await expect(loader).toBeVisible()
    await expect(loader).toHaveAttribute('role', 'status')
    await expect(loader).toHaveAttribute('data-state', 'loading')
    await expect(root).toHaveAttribute('aria-busy', 'true')
    await expect(root).toHaveAttribute('data-talos-app-ready', 'false')

    const firstFrameAccent = await loader.evaluate((element) => {
        const accent = (element as HTMLElement).style.getPropertyValue('--talos-boot-accent').trim()
        const probe = document.createElement('span')
        probe.style.color = accent
        document.body.append(probe)
        const normalizedAccent = window.getComputedStyle(probe).color
        probe.remove()
        const edge = element.querySelector<SVGElement>('.edge-main')
        return {
            accent,
            normalizedAccent,
            edgeStroke: edge ? window.getComputedStyle(edge).stroke : '',
            bridgeIsCritical: document.head.querySelector('[data-talos-boot-theme-bridge]') !== null,
            bridgePrecedesLoader: Boolean(
                document.head.querySelector('[data-talos-boot-theme-bridge]')
                && (document.head.querySelector('[data-talos-boot-theme-bridge]')!
                    .compareDocumentPosition(element) & Node.DOCUMENT_POSITION_FOLLOWING),
            ),
        }
    })
    expect(firstFrameAccent.accent).toMatch(/^#[0-9a-f]{6}$/i)
    expect(firstFrameAccent.edgeStroke).toBe(firstFrameAccent.normalizedAccent)
    expect(firstFrameAccent.bridgeIsCritical).toBe(true)
    expect(firstFrameAccent.bridgePrecedesLoader).toBe(true)
}

async function expectMountedWorkspace(page: Page) {
    const root = page.locator('#talos-workspace-root')

    await expect(root).toHaveAttribute('aria-busy', 'false')
    await expect(root).toHaveAttribute('data-talos-app-ready', 'true')
    await expect(page.locator('[data-talos-boot-loader="true"]')).toHaveCount(0)
    await expect(page.getByLabel('Message TALOS')).toBeVisible()
}

test.beforeEach(async ({ page }) => {
    await installTalosApiMocks(page)
    await signIn(page)
})

test('hard reload shows the exact server boot logo until Vue has painted', async ({ page }, testInfo) => {
    await page.emulateMedia({ reducedMotion: 'no-preference' })
    const animatedGate = await gateAppEntry(page)

    await page.reload({ waitUntil: 'commit' })
    await animatedGate.waitUntilIntercepted()
    await expectServerRenderedBootFrame(page)

    const animatedStyles = await page.locator('.edge-main').evaluate((element) => {
        const style = window.getComputedStyle(element)
        return { animationName: style.animationName, animationDuration: style.animationDuration }
    })
    expect(animatedStyles.animationName).toBe('flowData')
    expect(animatedStyles.animationDuration).not.toBe('0s')
    const firstDashOffset = await page.locator('.edge-main').evaluate((element) => (
        window.getComputedStyle(element).strokeDashoffset
    ))
    await expect.poll(() => page.locator('.edge-main').evaluate((element) => (
        window.getComputedStyle(element).strokeDashoffset
    )), {
        intervals: [180, 240, 360],
        timeout: 1_500,
    }).not.toBe(firstDashOffset)
    await testInfo.attach(`talos-boot-loader-painted-frame-${testInfo.project.name}.png`, {
        body: await capturePaintedFrame(page),
        contentType: 'image/png',
    })

    animatedGate.release()
    await expectMountedWorkspace(page)
    await animatedGate.dispose()

    await page.emulateMedia({ reducedMotion: 'reduce' })
    const reducedGate = await gateAppEntry(page)

    await page.reload({ waitUntil: 'commit' })
    await reducedGate.waitUntilIntercepted()
    await expectServerRenderedBootFrame(page)

    const reducedStyles = await page.locator('.edge-main').evaluate((element) => {
        const edge = window.getComputedStyle(element)
        const loader = window.getComputedStyle(document.querySelector('.talos-boot-loader') as HTMLElement)
        return { animationName: edge.animationName, transitionDuration: loader.transitionDuration }
    })
    expect(reducedStyles.animationName).toBe('none')
    expect(reducedStyles.transitionDuration).toBe('0s')
    const reducedDashOffset = await page.locator('.edge-main').evaluate((element) => (
        window.getComputedStyle(element).strokeDashoffset
    ))
    await page.waitForTimeout(700)
    await expect(page.locator('.edge-main')).toHaveCSS('stroke-dashoffset', reducedDashOffset)
    await testInfo.attach(`talos-boot-loader-reduced-${testInfo.project.name}.png`, {
        body: await capturePaintedFrame(page),
        contentType: 'image/png',
    })

    reducedGate.release()
    await expectMountedWorkspace(page)
    await reducedGate.dispose()
})

test('an unthrottled hard reload keeps the real boot animation perceptible before exit', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'no-preference' })
    await page.reload({ waitUntil: 'domcontentloaded' })

    const loader = page.locator('[data-talos-boot-loader="true"]')
    await expect(loader).toBeVisible()
    await expect(page.locator('.talos-boot-loader__wordmark')).toHaveCount(0)

    const firstDashOffset = await page.locator('.edge-main').evaluate((element) => (
        window.getComputedStyle(element).strokeDashoffset
    ))
    await expect.poll(() => page.locator('.edge-main').evaluate((element) => (
        window.getComputedStyle(element).strokeDashoffset
    )), {
        intervals: [180, 240, 360],
        timeout: 1_500,
    }).not.toBe(firstDashOffset)

    const accentBridge = await page.evaluate(() => {
        const shell = document.querySelector<HTMLElement>('.talos-shell')
        const edge = document.querySelector<SVGElement>('.talos-boot-loader .edge-main')
        const themeAccent = shell ? window.getComputedStyle(shell).getPropertyValue('--talos-accent').trim() : ''
        const colorProbe = document.createElement('span')
        colorProbe.style.color = themeAccent
        document.body.append(colorProbe)
        const normalizedThemeAccent = window.getComputedStyle(colorProbe).color
        colorProbe.remove()
        return {
            themeAccent,
            normalizedThemeAccent,
            loaderStroke: edge ? window.getComputedStyle(edge).stroke : '',
        }
    })
    expect(accentBridge.themeAccent).not.toBe('')
    expect(accentBridge.loaderStroke).toBe(accentBridge.normalizedThemeAccent)

    await expect(loader).toHaveCount(0, { timeout: 4_000 })
    expect(await page.evaluate(() => performance.now())).toBeGreaterThanOrEqual(1_900)
})
