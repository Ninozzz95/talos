import { expect, test, type Page, type Request } from '@playwright/test'

// F1-T6 shell journeys — hamburger header + full-width sidebar (D5/D6) replace
// the retired top icon rail; default theme is now `calm` (D3/D4), with the
// legacy telemetry poster contract preserved behind an explicit theme opt-in.
const LOCAL_HOSTS = new Set(['127.0.0.1', 'localhost'])
const HEADER = '[data-testid="talos-mobile-header"]'
const SIDEBAR = '[data-testid="talos-mobile-sidebar"]'
const SHEET = '[data-testid="talos-mobile-tool-sheet"]'
const MENU = '[aria-label="Open menu"]'

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

async function openStation(page: Page, label: string): Promise<void> {
    await page.locator(MENU).click()
    await page.locator(`${SIDEBAR} [aria-label="Open ${label}"]`).click()
}

test('mission path has no visible or focusable phone representation', async ({ page }) => {
    await page.goto('/')
    await expect(page.locator(HEADER)).toBeVisible()
    await expect(page.getByText(/mission path/i)).toHaveCount(0)
    const focusableMission = await page.locator('a, button, [tabindex]').filter({ hasText: /mission path/i }).count()
    expect(focusableMission).toBe(0)
})

test('320x800 375x812 and tablet viewports show no horizontal overflow', async ({ page }) => {
    for (const size of [{ width: 320, height: 800 }, { width: 375, height: 812 }, { width: 768, height: 1024 }]) {
        await page.setViewportSize(size)
        await page.goto('/')
        await expect(page.locator(HEADER)).toBeVisible()
        const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
        expect(overflow, `viewport ${size.width}x${size.height}`).toBeLessThanOrEqual(0)
    }
})

test('header and sidebar actions expose accessible names and 44x44 touch targets', async ({ page }) => {
    await page.goto('/')
    await expect(page.locator(HEADER)).toBeVisible()
    const headerButtons = page.locator(`${HEADER} button`)
    // Two on a fresh app: hamburger + 3-dot chat options. Sessions are created
    // lazily, and with no chat there is nothing to show media FOR — so the
    // title stays a plain <p> rather than a button that opens nothing. That is
    // the fix for a dead affordance, and it is asserted below.
    await expect(headerButtons).toHaveCount(2)
    await expect(page.getByTestId('talos-mobile-header-title')).toHaveCount(1)
    await expect(page.locator(`${HEADER} button[data-testid="talos-mobile-header-title"]`))
        .toHaveCount(0)
    const count = await headerButtons.count()
    for (let i = 0; i < count; i += 1) {
        const button = headerButtons.nth(i)
        expect(await button.getAttribute('aria-label')).toBeTruthy()
        const box = await button.boundingBox()
        expect(box, `header button ${i} box`).not.toBeNull()
        expect(box!.width).toBeGreaterThanOrEqual(44)
        expect(box!.height).toBeGreaterThanOrEqual(44)
    }

    await page.locator(MENU).click()
    await expect(page.locator(SIDEBAR)).toBeVisible()
    // «Open Cockpit» è uscito il 2026-08-09 su decisione dell'owner: al suo
    // posto entrerà Codice (fase agentica B).
    for (const label of ['Open Research', 'Open Library', 'Open Settings']) {
        const entry = page.locator(`${SIDEBAR} [aria-label="${label}"]`)
        await expect(entry).toBeVisible()
        const box = await entry.boundingBox()
        expect(box, `${label} box`).not.toBeNull()
        expect(box!.height).toBeGreaterThanOrEqual(44)
    }
    await expect(page.locator(`${SIDEBAR} [aria-label="Open Model Lab"]`)).toHaveCount(0)
})

test('a station opens from the sidebar in a tool-sheet over the chat base and returns to chat', async ({ page }) => {
    await page.goto('/')
    await expect(page.locator(HEADER)).toBeVisible()
    await expect(page.locator(SHEET)).toHaveCount(0)

    await openStation(page, 'Research')
    await expect(page.locator('div[data-talos-route]')).toHaveAttribute('data-talos-route', 'research')
    await expect(page.locator(SHEET)).toBeVisible()
    // The chat base persists behind the sheet. Bind to stable structure rather
    // than one title from the localized, time/date-dependent welcome library.
    await expect(page.getByTestId('talos-chat-scroll')).toBeVisible()

    await page.locator('[aria-label="Back to chat"]').click()
    await expect(page.locator(SHEET)).toHaveCount(0)
    await expect(page.locator('div[data-talos-route]')).toHaveAttribute('data-talos-route', 'chat')
})

test('F2-RED-20 Model Lab has one primary path through Settings', async ({ page }) => {
    await page.goto('/')

    await openStation(page, 'Settings')
    await page.getByTestId('settings-model-lab-link').click()

    await expect(page).toHaveURL(/\/settings\/models$/)
    await expect(page.getByTestId('talos-model-lab-hub')).toBeVisible()
    await expect(page.getByTestId('talos-model-lab-destination')).toHaveCount(3)
    await expect(page.getByRole('tablist', { name: 'Model Lab sections' })).toHaveCount(0)
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
    await expect(page.locator(HEADER)).toBeVisible()
    // Perf review 2026-07-25: station chunks are warmed AFTER mount (awaiting them
    // before first paint was a 792KB cold-start regression). On device they are
    // local file:// assets; on the web preview they must finish warming before the
    // network is cut — the shell is already interactive well before this resolves.
    await page.waitForFunction(() => window.__TALOS_ROUTES_WARM__ === true, null, { timeout: 20_000 })
    await context.setOffline(true)
    await openStation(page, 'Research')
    await expect(page.locator('div[data-talos-route]')).toHaveAttribute('data-talos-route', 'research')
    await expect(page.locator(SHEET)).toBeVisible()
    await context.setOffline(false)
})

test('startup applies the bundled calm identity without network', async ({ page }) => {
    const external = trackExternalRequests(page)
    await page.goto('/')
    await expect(page.locator('html')).toHaveAttribute('data-talos-theme', 'calm')
    expect(external, external.join('\n')).toEqual([])
})

test('calm hides the poster layer; legacy telemetry still serves its bundled poster offline', async ({ page }) => {
    const external = trackExternalRequests(page)
    await page.goto('/')
    // AUD-001: under the calm default the decorative poster layer is absent.
    await expect(page.locator('[data-testid="telemetry-poster"]')).toHaveCount(0)

    // F3-T1 (owner #9): a PRE-calm persisted telemetry default (no flag) is a
    // leftover default, not a choice — it migrates to calm once.
    await page.addInitScript(() => {
        window.localStorage.setItem(
            'CapacitorStorage.talos.mobile.theme',
            JSON.stringify({ theme: 'telemetry', mode: 'system' }),
        )
    })
    await page.reload()
    await expect(page.locator('html')).toHaveAttribute('data-talos-theme', 'calm')
    await expect(page.locator('[data-testid="telemetry-poster"]')).toHaveCount(0)

    // An EXPLICIT post-migration telemetry choice keeps the offline poster contract.
    await page.addInitScript(() => {
        window.localStorage.setItem(
            'CapacitorStorage.talos.mobile.theme',
            JSON.stringify({ theme: 'telemetry', mode: 'system', calm_migrated: true }),
        )
    })
    await page.reload()
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
    await expect(page.locator('html')).not.toHaveAttribute('data-talos-theme', 'calm')
    // shell still functional with the style.css defaults.
    await expect(page.locator(HEADER)).toBeVisible()
    await openStation(page, 'Settings')
    await expect(page.locator('div[data-talos-route]')).toHaveAttribute('data-talos-route', 'settings')
})

test('shell stays functional with lifecycle registration disabled and default back behavior', async ({ page }) => {
    const errors: string[] = []
    page.on('pageerror', (e) => errors.push(String(e)))
    await disableSubsystems(page, ['lifecycle'])
    await page.goto('/')
    await expect(page.locator(HEADER)).toBeVisible()
    // La stazione qui serve solo a provare che il guscio regge senza il ciclo
    // di vita nativo: dopo la rimozione del Cockpit si usa la Diagnostica, che
    // è una stazione come le altre.
    await openStation(page, 'Doctor')
    await expect(page.locator('div[data-talos-route]')).toHaveAttribute('data-talos-route', 'doctor')
    expect(errors, errors.join('\n')).toEqual([])
})

test('settings subsection back returns to the categories list, not straight to chat', async ({ page }) => {
    // Owner 2026-07-24 regression: on the phone the header shows ONE contextual
    // Back. Opening a subsection (Account) titles the header "Account"; Back must
    // return to the categories list with the sheet STILL open (not close it).
    await page.setViewportSize({ width: 375, height: 720 })
    await page.goto('/')
    await openStation(page, 'Settings')
    await expect(page.locator(SHEET)).toBeVisible()

    // Categories list is shown first.
    await expect(page.locator('[data-testid="settings-category-pane"]')).toBeVisible()
    /*
     * ⛔ Si porta la voce SOTTO GLI OCCHI prima di toccarla.
     *
     * Le impostazioni sono una lista lunga dentro uno scorrevole. La voce
     * si trova nel DOM ma non diventa mai «visible, enabled and stable»
     * per Playwright, che aspetta sessanta secondi e poi rinuncia — pur
     * essendo cliccabile, come ho verificato sondando la pagina viva.
     */
    await page.locator('[data-settings-tab="account"]').scrollIntoViewIfNeeded()
    await page.locator('[data-settings-tab="account"]').click()

    // Detail pane open; the sheet header reflects the subsection + Back arrow.
    await expect(page.locator('[data-testid="settings-detail-pane"]')).toBeVisible()
    const back = page.locator('[data-testid="talos-sheet-back"]')
    await expect(back).toHaveAttribute('aria-label', 'Back')

    // Back returns to the categories list — the sheet stays open.
    await back.click()
    await page.waitForTimeout(320)
    await expect(page.locator(SHEET)).toBeVisible()
    await expect(page.locator('[data-testid="settings-category-pane"]')).toBeVisible()
    await expect(back).toHaveAttribute('aria-label', 'Back to chat')

    // A second Back closes the sheet, returning to chat.
    await back.click()
    await page.waitForTimeout(320)
    await expect(page.locator(SHEET)).toHaveCount(0)
})

test('shell renders a fail-closed fallback when upstream ui components are disabled', async ({ page }) => {
    await disableSubsystems(page, ['ui'])
    await page.goto('/')
    await expect(page.locator('[data-testid="ui-fallback"]')).toBeVisible()
    // the header/sidebar shell is not mounted in the fallback.
    await expect(page.locator(HEADER)).toHaveCount(0)
    await page.locator('[data-testid="ui-fallback"] [data-nav="context"]').click()
    await expect(page.locator('div[data-talos-route]')).toHaveAttribute('data-talos-route', 'context')
})

test('the chat title opens that chat\u2019s media once a chat exists, and not before', async ({ page }) => {
    // Owner 2026-07-26. The gallery had zero e2e coverage: neither entry point,
    // neither header mode — which is how a missing icon import reached a commit.
    await page.addInitScript(() => {
        window.localStorage.setItem('talos.mobile.settings.v1', JSON.stringify({
            shell: { immersive_header: false },
        }))
    })
    await page.goto('/')
    await expect(page.locator(HEADER)).toBeVisible()

    // No chat yet: the title is inert and the menu offers no media entry.
    await expect(page.locator(`${HEADER} button[data-testid="talos-mobile-header-title"]`))
        .toHaveCount(0)
    await page.locator(`${HEADER} [aria-label="Chat options"]`).first().click()
    await expect(page.getByTestId('talos-chat-options-media')).toHaveCount(0)
    await page.keyboard.press('Escape')

    // Create one, and both entry points appear.
    await page.locator(`${HEADER} [aria-label="Chat options"]`).first().click()
    await page.getByRole('menuitem', { name: 'New chat' }).click()
    await expect(page.locator(`${HEADER} button[data-testid="talos-mobile-header-title"]`))
        .toHaveCount(1, { timeout: 15_000 })

    await page.locator(`${HEADER} [aria-label="Chat options"]`).first().click()
    const mediaEntry = page.getByTestId('talos-chat-options-media')
    await expect(mediaEntry).toBeVisible()
    await mediaEntry.click()

    const panel = page.getByTestId('talos-chat-media-panel')
    await expect(panel).toBeVisible()
    // It names the chat it belongs to — the owner's "che fa capire che sia
    // relativo a quella chat".
    await expect(page.getByTestId('talos-chat-media-scope')).toBeVisible()
    await expect(page.getByTestId('talos-chat-media-empty')).toBeVisible()

    // Escape closes it, like every other modal surface in the app.
    await page.keyboard.press('Escape')
    await expect(panel).toHaveCount(0)
})
