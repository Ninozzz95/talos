import { expect, test, type Page, type Request } from '@playwright/test'

const LOCAL_HOSTS = new Set(['127.0.0.1', 'localhost'])
const RAIL = '[data-testid="talos-mobile-rail"]'
const SHEET = '[data-testid="talos-mobile-tool-sheet"]'

function trackExternalRequests(page: Page): string[] {
    const external: string[] = []
    page.on('request', (req: Request) => {
        let url: URL
        try {
            url = new URL(req.url())
        } catch {
            return
        }
        if (url.protocol !== 'http:' && url.protocol !== 'https:') return
        if (!LOCAL_HOSTS.has(url.hostname)) external.push(req.url())
    })
    return external
}

async function disableSubsystems(page: Page, names: string[]): Promise<void> {
    await page.addInitScript((disabled) => {
        ;(window as unknown as { __TALOS_M1_DISABLE__: string[] }).__TALOS_M1_DISABLE__ = disabled
    }, names)
}

test('mission path has no visible or focusable phone representation', async ({ page }) => {
    await page.goto('/')
    await expect(page.locator(RAIL)).toBeVisible()
    await expect(page.getByText(/mission path/i)).toHaveCount(0)
    const focusableMission = await page.locator('a, button, [tabindex]').filter({ hasText: /mission path/i }).count()
    expect(focusableMission).toBe(0)
})

test('320x800 375x812 and tablet viewports show no horizontal overflow', async ({ page }) => {
    for (const size of [{ width: 320, height: 800 }, { width: 375, height: 812 }, { width: 768, height: 1024 }]) {
        await page.setViewportSize(size)
        await page.goto('/')
        await expect(page.locator(RAIL)).toBeVisible()
        const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
        expect(overflow, `viewport ${size.width}x${size.height}`).toBeLessThanOrEqual(0)
    }
})

test('icon-only rail actions expose accessible names and 44x44 touch targets', async ({ page }) => {
    await page.goto('/')
    const buttons = page.locator(`${RAIL} button`)
    const count = await buttons.count()
    expect(count).toBe(6) // New Chat + Chat + 4 stations
    for (let i = 0; i < count; i += 1) {
        const button = buttons.nth(i)
        expect(await button.getAttribute('aria-label')).toBeTruthy()
        const box = await button.boundingBox()
        expect(box, `button ${i} box`).not.toBeNull()
        expect(box!.width).toBeGreaterThanOrEqual(44)
        expect(box!.height).toBeGreaterThanOrEqual(44)
    }
})

test('a station opens in a tool-sheet over the chat base and returns to chat', async ({ page }) => {
    await page.goto('/')
    await expect(page.locator(RAIL)).toBeVisible()
    await expect(page.locator(SHEET)).toHaveCount(0)

    await page.locator(`${RAIL} [aria-label="Research"]`).click()
    await expect(page.locator('div[data-talos-route]')).toHaveAttribute('data-talos-route', 'research')
    await expect(page.locator(SHEET)).toBeVisible()
    // chat base persists behind the sheet
    await expect(page.getByText('What claim should we benchmark?')).toBeVisible()

    await page.locator('[aria-label="Back to chat"]').click()
    await expect(page.locator(SHEET)).toHaveCount(0)
    await expect(page.locator('div[data-talos-route]')).toHaveAttribute('data-talos-route', 'chat')
})

test('reload restores the active route and presentation preference', async ({ page }) => {
    await page.addInitScript(() => {
        window.localStorage.setItem(
            'CapacitorStorage.talos.mobile.preferences',
            JSON.stringify({ schema_version: 1, presentation: 'fullscreen', last_route: 'research' }),
        )
    })
    await page.goto('/')
    const root = page.locator('div[data-talos-route]')
    await expect(root).toHaveAttribute('data-talos-route', 'research')
    await expect(root).toHaveAttribute('data-talos-presentation', 'fullscreen')

    await page.reload()
    await expect(root).toHaveAttribute('data-talos-route', 'research')
    await expect(root).toHaveAttribute('data-talos-presentation', 'fullscreen')
})

test('shell opens and navigates locally in airplane mode', async ({ page, context }) => {
    await page.goto('/')
    await expect(page.locator(RAIL)).toBeVisible()
    await context.setOffline(true)
    await page.locator(`${RAIL} [aria-label="Research"]`).click()
    await expect(page.locator('div[data-talos-route]')).toHaveAttribute('data-talos-route', 'research')
    await expect(page.locator(SHEET)).toBeVisible()
    await context.setOffline(false)
})

test('startup applies the bundled telemetry identity without network', async ({ page }) => {
    const external = trackExternalRequests(page)
    await page.goto('/')
    await expect(page.locator('html')).toHaveAttribute('data-talos-theme', 'telemetry')
    expect(external, external.join('\n')).toEqual([])
})

test('telemetry poster renders offline from the bundled asset with zero network requests', async ({ page }) => {
    const external = trackExternalRequests(page)
    await page.goto('/')
    const poster = page.locator('[data-testid="telemetry-poster"]')
    await expect(poster).toHaveCount(1)
    const bg = await poster.evaluate((el) => getComputedStyle(el).backgroundImage)
    expect(bg).toContain('/talos/backgrounds/telemetry-poster.webp')
    const response = await page.request.get('/talos/backgrounds/telemetry-poster.webp')
    expect(response.status()).toBe(200)
    expect(external, external.join('\n')).toEqual([])
})

test('instrument sans and jetbrains mono load from local packages with zero font network requests', async ({ page }) => {
    const external = trackExternalRequests(page)
    await page.goto('/')
    await page.evaluate(() => document.fonts.ready)
    const families = await page.evaluate(() => Array.from(document.fonts).map((f) => f.family))
    expect(families).toContain('Instrument Sans')
    expect(families).toContain('JetBrains Mono')
    const externalFonts = external.filter((u) => /\.woff2?($|\?)/.test(u))
    expect(externalFonts, externalFonts.join('\n')).toEqual([])
    expect(external, external.join('\n')).toEqual([])
})

test('shell stays functional with the theme adapter disabled and default tokens', async ({ page }) => {
    await disableSubsystems(page, ['theme'])
    await page.goto('/')
    // adapter did not run: no theme id attribute stamped.
    await expect(page.locator('html')).not.toHaveAttribute('data-talos-theme', 'telemetry')
    // shell still functional with the style.css defaults.
    await expect(page.locator(RAIL)).toBeVisible()
    await page.locator(`${RAIL} [aria-label="Settings"]`).click()
    await expect(page.locator('div[data-talos-route]')).toHaveAttribute('data-talos-route', 'settings')
})

test('shell stays functional with lifecycle registration disabled and default back behavior', async ({ page }) => {
    const errors: string[] = []
    page.on('pageerror', (e) => errors.push(String(e)))
    await disableSubsystems(page, ['lifecycle'])
    await page.goto('/')
    await expect(page.locator(RAIL)).toBeVisible()
    await page.locator(`${RAIL} [aria-label="Cockpit"]`).click()
    await expect(page.locator('div[data-talos-route]')).toHaveAttribute('data-talos-route', 'runs')
    expect(errors, errors.join('\n')).toEqual([])
})

test('shell renders a fail-closed fallback when upstream ui components are disabled', async ({ page }) => {
    await disableSubsystems(page, ['ui'])
    await page.goto('/')
    await expect(page.locator('[data-testid="ui-fallback"]')).toBeVisible()
    // the rail/sheet shell is not mounted in the fallback.
    await expect(page.locator(RAIL)).toHaveCount(0)
    await page.locator('[data-testid="ui-fallback"] [data-nav="context"]').click()
    await expect(page.locator('div[data-talos-route]')).toHaveAttribute('data-talos-route', 'context')
})
