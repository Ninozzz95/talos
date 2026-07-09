import { expect, test, type Page, type TestInfo } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { installTalosApiMocks } from './helpers/talosApiMocks'

const e2eSetupEmail = 'talos-e2e@example.test'
const e2eSetupPassword = 'talos-e2e-password-123'
const e2eLoginEmail = process.env.TALOS_E2E_EMAIL ?? 'test@example.com'
const e2eLoginPassword = process.env.TALOS_E2E_PASSWORD ?? 'password'
const talosThemePresetCount = 12

async function expectNoHorizontalOverflow(page: Page) {
    const result = await page.evaluate(() => {
        const root = document.documentElement
        const overflow = Math.ceil(root.scrollWidth) - Math.ceil(root.clientWidth)

        if (overflow <= 1) {
            return { overflow, offenders: [] }
        }

        const viewportWidth = root.clientWidth
        const offenders = Array.from(document.querySelectorAll('body *')).flatMap((element) => {
            const rect = element.getBoundingClientRect()

            if (rect.right <= viewportWidth + 0.5 && rect.left >= -0.5) {
                return []
            }

            return [{
                tag: element.tagName.toLowerCase(),
                className: String(element.getAttribute('class') ?? '').slice(0, 160),
                text: String(element.textContent ?? '').replace(/\s+/g, ' ').trim().slice(0, 120),
                left: Math.round(rect.left),
                right: Math.round(rect.right),
                width: Math.round(rect.width),
            }]
        }).slice(0, 5)

        return { overflow, offenders }
    })

    expect(result.overflow, JSON.stringify(result.offenders, null, 2)).toBeLessThanOrEqual(1)
}

async function expectProceduralCanvasAboveScrim(page: Page) {
    const layering = await page.getByTestId('talos-background-effect').evaluate((root) => {
        const canvas = root.querySelector('.talos-procedural-canvas') as HTMLElement | null
        const scrim = root.querySelector('.talos-theme-background-scrim') as HTMLElement | null

        if (!canvas || !scrim) {
            return {
                hasCanvas: Boolean(canvas),
                hasScrim: Boolean(scrim),
                canvasZ: -1,
                scrimZ: -1,
            }
        }

        const toNumber = (value: string) => value === 'auto' ? 0 : Number(value)

        return {
            hasCanvas: true,
            hasScrim: true,
            canvasZ: toNumber(window.getComputedStyle(canvas).zIndex),
            scrimZ: toNumber(window.getComputedStyle(scrim).zIndex),
        }
    })

    expect(layering.hasCanvas).toBe(true)
    expect(layering.hasScrim).toBe(true)
    expect(layering.canvasZ).toBeGreaterThan(layering.scrimZ)
}

async function expectProceduralCanvasFrameChanges(page: Page) {
    const canvas = page.getByTestId('talos-procedural-canvas')
    await expect(canvas).toHaveCount(1)

    const firstFrame = await canvas.evaluate((element) => (element as HTMLCanvasElement).toDataURL())
    await expect.poll(async () => canvas.evaluate((element) => (element as HTMLCanvasElement).toDataURL()), {
        timeout: 2500,
        intervals: [180, 240, 360, 520, 800],
    }).not.toBe(firstFrame)
}

async function expectProceduralCanvasFrameStaysStill(page: Page) {
    const canvas = page.getByTestId('talos-procedural-canvas')
    await expect(canvas).toHaveCount(1)

    const firstFrame = await canvas.evaluate((element) => (element as HTMLCanvasElement).toDataURL())
    await page.waitForTimeout(360)
    const secondFrame = await canvas.evaluate((element) => (element as HTMLCanvasElement).toDataURL())

    expect(secondFrame).toBe(firstFrame)
}

async function expectProceduralCanvasHasVisibleSignal(page: Page) {
    const canvas = page.getByTestId('talos-procedural-canvas')
    await expect(canvas).toHaveCount(1)

    const signal = await canvas.evaluate((element) => {
        const target = element as HTMLCanvasElement
        const context = target.getContext('2d')

        if (!context) {
            return {
                hasContext: false,
                contrastRatio: 0,
                maxContrast: 0,
                meanContrast: 0,
            }
        }

        const data = context.getImageData(0, 0, target.width, target.height).data
        const sampleStep = 16 * 4
        let contrastSamples = 0
        let sampleCount = 0
        let maxContrast = 0
        let contrastSum = 0

        for (let index = 0; index < data.length; index += sampleStep) {
            const red = data[index]
            const green = data[index + 1]
            const blue = data[index + 2]
            const alpha = data[index + 3] / 255
            const luma = (0.2126 * red) + (0.7152 * green) + (0.0722 * blue)
            const contrastStrength = Math.max(luma, 255 - luma) * alpha

            sampleCount += 1
            contrastSum += contrastStrength
            maxContrast = Math.max(maxContrast, contrastStrength)

            if (contrastStrength > 42) {
                contrastSamples += 1
            }
        }

        return {
            hasContext: true,
            contrastRatio: contrastSamples / Math.max(1, sampleCount),
            maxContrast,
            meanContrast: contrastSum / Math.max(1, sampleCount),
        }
    })

    expect(signal.hasContext).toBe(true)
    expect(signal.maxContrast, JSON.stringify(signal)).toBeGreaterThan(75)
    expect(signal.meanContrast, JSON.stringify(signal)).toBeGreaterThan(10)
    expect(signal.contrastRatio, JSON.stringify(signal)).toBeGreaterThanOrEqual(0.01)
}

async function expectProceduralBackgroundVisiblyChanges(page: Page) {
    const background = page.getByTestId('talos-background-effect')
    await expect(background).toBeVisible()
    const clip = await background.evaluate((element) => {
        const rect = element.getBoundingClientRect()

        return {
            x: Math.max(0, Math.floor(rect.x)),
            y: Math.max(0, Math.floor(rect.y)),
            width: Math.max(1, Math.floor(rect.width)),
            height: Math.max(1, Math.floor(rect.height)),
        }
    })

    const firstFrame = await page.screenshot({ clip })
    await page.waitForTimeout(420)
    const secondFrame = await page.screenshot({ clip })

    expect(secondFrame.equals(firstFrame)).toBe(false)
}

async function expectNoComposerOverlap(page: Page) {
    const result = await page.evaluate(() => {
        const composer = document.querySelector('.talos-chat-composer-shell')?.getBoundingClientRect()

        if (!composer) {
            return { missingComposer: true, overlaps: [] }
        }

        const overlaps = Array.from(document.querySelectorAll('.talos-tool-window')).flatMap((element) => {
            const rect = element.getBoundingClientRect()
            const intersects = rect.bottom > composer.top - 8
                && rect.top < composer.bottom + 8
                && rect.right > composer.left
                && rect.left < composer.right

            if (!intersects) {
                return []
            }

            return [{
                label: String(element.getAttribute('aria-label') ?? '').trim(),
                windowBottom: Math.round(rect.bottom),
                composerTop: Math.round(composer.top),
            }]
        })

        return { missingComposer: false, overlaps }
    })

    expect(result.missingComposer).toBe(false)
    expect(result.overlaps, JSON.stringify(result.overlaps, null, 2)).toEqual([])
}

async function selectDashboardTab(page: Page, name: string) {
    const moduleName = {
        Agents: 'Model Lab',
        Knowledge: 'Library',
        Benchmarks: 'Compare',
        Runtime: 'Runtime',
        Productivity: 'Tasks',
        Admin: 'Doctor',
    }[name] ?? name
    const matcher = new RegExp(moduleName)
    const tab = page.getByRole('tab', { name: matcher }).first()

    if (await tab.isVisible().catch(() => false)) {
        await tab.click()
        return
    }

    await page.getByRole('button', { name: moduleName, exact: true }).first().click()
}

async function chooseModelProfile(page: Page, profileId = 'profile-e2e') {
    await page.getByRole('button', { name: 'Choose model profile' }).click()
    await page.getByLabel('Server-side model profile').selectOption(profileId)
}

async function chooseContextSet(page: Page, contextSetId = 'context-set-e2e') {
    await page.getByRole('button', { name: 'Choose grounding context' }).click()
    await page.getByLabel('Grounding context set').selectOption(contextSetId)
}

async function expectUnifiedWorkspaceChrome(page: Page) {
    await expect(page.getByRole('heading', { name: 'TALOS', exact: true })).toBeVisible()
    await expect(page.getByTestId('talos-header-brand')).toBeVisible()
    await expect(page.locator('.talos-short-logo-mark:visible').first()).toBeVisible()
    await expect(page.getByText('Ready for verified workflows', { exact: true })).toBeVisible()
    await expect(page.locator('[data-testid="talos-workspace"], .talos-workspace').first()).toBeVisible()
    await expect(page.locator('[aria-label="TALOS workspace rail"]').filter({ visible: true }).first()).toBeVisible()
    await expect(page.getByLabel('Message TALOS')).toBeVisible()

    for (const name of ['New Chat', 'Knowledge', 'Brain', 'Compare', 'Artifacts', 'Notes', 'Settings', 'Doctor']) {
        await expect(page.getByRole('button', { name, exact: true })).toBeVisible()
    }

    await expect(page.getByText('No server-side model profiles')).toBeHidden()
    await expect(page.getByText('No Context Vault sets')).toBeHidden()
    await expect(page.locator('input[aria-label*="Provider API key" i], input[placeholder*="Provider API key" i]')).toBeHidden()
}

async function attachWorkspaceScreenshot(page: Page, testInfo: TestInfo, routeName: string) {
    await testInfo.attach(`talos-workspace-${routeName}-${testInfo.project.name}.png`, {
        body: await page.screenshot({ fullPage: true, animations: 'disabled' }),
        contentType: 'image/png',
    })
}

async function isAuthenticatedWorkspace(page: Page) {
    return await page.locator('#talos-workspace-root[data-authenticated="true"]').count() > 0
}

async function waitForWorkspaceReady(page: Page) {
    await expect(page.locator('#talos-workspace-root[data-authenticated="true"]')).toHaveCount(1)
    await expect(page.getByLabel('Message TALOS')).toBeVisible({ timeout: 45_000 })
}

async function openWorkspace(page: Page) {
    if (await page.getByLabel('Message TALOS').isVisible().catch(() => false)) {
        return
    }

    await page.goto('/', { waitUntil: 'domcontentloaded' })
    await waitForWorkspaceReady(page)
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

test.beforeEach(async ({ page }) => {
    await installTalosApiMocks(page)
    await page.emulateMedia({ reducedMotion: 'no-preference' })
    await ensureTalosAuthenticated(page)
})

test('guest users see the auth gate before the TALOS workspace', async ({ browser }) => {
    const context = await browser.newContext()
    const page = await context.newPage()

    try {
        await page.goto('/', { waitUntil: 'domcontentloaded' })
        await expect(page.locator('#talos-workspace-root')).toHaveCount(0)
        await expect(page.getByRole('heading', { name: 'TALOS' })).toBeVisible()
        await expect(page.getByText(/Sign in with a Laravel operator account|Create the first local administrator/)).toBeVisible()
        await expect(page.getByRole('link', { name: 'Back to TALOS' })).toHaveCount(0)
    } finally {
        await context.close()
    }
})

test('root is the canonical TALOS workspace and legacy routes redirect to it', async ({ page }, testInfo) => {
    await openWorkspace(page)
    await attachWorkspaceScreenshot(page, testInfo, 'root')
    await expectUnifiedWorkspaceChrome(page)
    await expect(page.getByTestId('talos-theme-background-video')).toHaveCount(0)
    await expect(page.getByTestId('talos-theme-background-poster')).toHaveCount(0)
    await expect(page.getByTestId('talos-background-effect')).toHaveAttribute('data-effect', 'dag-flow')
    await expect(page.locator('.talos-shell')).toHaveAttribute('data-background-effect', 'dag-flow')
    await expectNoHorizontalOverflow(page)

    for (const routePath of ['/chat', '/dashboard'] as const) {
        await page.goto(routePath, { waitUntil: 'domcontentloaded' })
        await expect(page).toHaveURL(/\/$/)
        await expectUnifiedWorkspaceChrome(page)
    }
})

test('floating windows enter real fullscreen across the workspace width', async ({ page }) => {
    await openWorkspace(page)

    await page.getByRole('button', { name: 'Artifacts', exact: true }).click()
    const artifactWindow = page.locator('[data-window-id="gallery"]')
    await expect(artifactWindow).toBeVisible()

    await artifactWindow.getByRole('button', { name: 'Fullscreen Artifacts' }).click()
    await expect(artifactWindow).toHaveAttribute('data-window-fullscreen', 'true')

    const metrics = await artifactWindow.evaluate((element) => {
        const rect = element.getBoundingClientRect()
        const rail = document.querySelector('[aria-label="TALOS workspace rail"]')?.getBoundingClientRect()
        const railWidth = rail?.width ?? 0

        return {
            left: Math.round(rect.left),
            right: Math.round(rect.right),
            width: Math.round(rect.width),
            expectedMinWidth: Math.round(window.innerWidth - railWidth - 48),
        }
    })

    expect(metrics.left).toBeLessThanOrEqual(280)
    expect(metrics.right).toBeGreaterThan(1200)
    expect(metrics.width, JSON.stringify(metrics)).toBeGreaterThanOrEqual(metrics.expectedMinWidth)
})

test('left rail exposes real persistent chat history', async ({ page }) => {
    await openWorkspace(page)

    await page.getByRole('button', { name: 'New Chat', exact: true }).click()
    await expect(page.getByTestId('talos-session-history')).toBeVisible()
    await expect(page.getByTestId('talos-session-history')).toContainText('New chat')

    await page.getByLabel('Message TALOS').fill('Investigate missing history rail')
    await page.getByRole('button', { name: 'Send', exact: true }).click()
    await expect(page.getByText('E2E response from AVM with replayable evidence.')).toBeVisible()
    await expect(page.getByTestId('talos-session-history')).toContainText('Investigate missing history rail')

    await page.getByRole('button', { name: 'New Chat', exact: true }).click()
    await expect(page.getByTestId('talos-session-history').getByRole('button', { name: /New chat/ })).toBeVisible()
    await page.getByTestId('talos-session-history').getByRole('button', { name: /Investigate missing history rail/ }).click()
    await expect(page.getByLabel('TALOS chat thread').getByText('Investigate missing history rail')).toBeVisible()
})

test('left rail and empty chat brand expose polished pointer and logo affordances', async ({ page }) => {
    await openWorkspace(page)

    const knowledgeButton = page.getByRole('button', { name: 'Knowledge', exact: true })
    await expect(knowledgeButton).toBeVisible()
    await expect.poll(async () => knowledgeButton.evaluate((element) => window.getComputedStyle(element).cursor)).toBe('pointer')

    const railBrand = page.getByTestId('talos-rail-brand')
    await expect(railBrand).toBeVisible()
    const brandMetrics = await railBrand.evaluate((element) => {
        const logo = element.querySelector('[data-testid="talos-rail-brand-logo"]')?.getBoundingClientRect()
        const copy = element.querySelector('[data-testid="talos-rail-brand-copy"]')?.getBoundingClientRect()

        return {
            hasLogo: Boolean(logo),
            hasCopy: Boolean(copy),
            logoLeft: Math.round(logo?.left ?? 0),
            copyLeft: Math.round(copy?.left ?? 0),
            logoCenterY: Math.round((logo?.top ?? 0) + ((logo?.height ?? 0) / 2)),
            copyCenterY: Math.round((copy?.top ?? 0) + ((copy?.height ?? 0) / 2)),
        }
    })
    expect(brandMetrics.hasLogo).toBe(true)
    expect(brandMetrics.hasCopy).toBe(true)
    expect(brandMetrics.logoLeft).toBeLessThan(brandMetrics.copyLeft)
    expect(Math.abs(brandMetrics.logoCenterY - brandMetrics.copyCenterY), JSON.stringify(brandMetrics)).toBeLessThanOrEqual(10)

    const emptyBrandLogo = page.getByTestId('talos-empty-brand').locator('.talos-short-logo').first()
    const headerBrandLogo = page.getByTestId('talos-header-brand').locator('.talos-short-logo').first()
    const logoSizes = await page.evaluate(() => {
        const empty = document.querySelector('[data-testid="talos-empty-brand"] .talos-short-logo')?.getBoundingClientRect()
        const header = document.querySelector('[data-testid="talos-header-brand"] .talos-short-logo')?.getBoundingClientRect()

        return {
            emptyWidth: Math.round(empty?.width ?? 0),
            headerWidth: Math.round(header?.width ?? 0),
        }
    })
    await expect(emptyBrandLogo).toBeVisible()
    await expect(headerBrandLogo).toBeVisible()
    expect(logoSizes.emptyWidth, JSON.stringify(logoSizes)).toBeGreaterThanOrEqual(64)
    expect(logoSizes.emptyWidth, JSON.stringify(logoSizes)).toBeGreaterThan(logoSizes.headerWidth + 20)
})

test('header account label opens settings directly on account tab', async ({ page }) => {
    await openWorkspace(page)

    await page.getByRole('button', { name: /Open account settings for/i }).click()

    const settingsWindow = page.locator('[data-window-id="settings"]')
    await expect(settingsWindow).toBeVisible()
    await expect(settingsWindow.getByRole('tab', { name: 'Account', exact: true })).toHaveAttribute('aria-selected', 'true')
    await expect(settingsWindow.getByText('Authenticated Laravel operator session.')).toBeVisible()
})

test('chat loads, sends a deterministic persisted turn, and stays keyboard reachable', async ({ page }, testInfo) => {
    await openWorkspace(page)

    await expect(page.getByRole('heading', { name: /^(What workflow should TALOS handle\?|What claim should we benchmark\?)$/ })).toBeVisible()
    await expect(page.getByTestId('talos-empty-brand')).toContainText('TALOS')
    await expect(page.getByTestId('talos-empty-brand').locator('.talos-short-logo-mark')).toBeVisible()
    await expect(page.getByText('Mission Path', { exact: true })).toBeVisible()
    await expect(page.getByText('Model linked', { exact: true })).toBeVisible()
    await expect(page.getByText('Context optional', { exact: true })).toBeVisible()
    await expect(page.getByText('Session staged', { exact: true })).toBeVisible()
    await expect(page.getByText('Evidence pending', { exact: true })).toBeVisible()
    await expect(page.getByLabel('Message TALOS')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Choose model profile' })).toContainText('E2E server-side profile')
    await expect(page.getByRole('button', { name: 'Send', exact: true })).toHaveAttribute('title', 'Type a workflow in the composer before sending.')

    await page.getByRole('button', { name: 'Open command palette' }).click()
    await page.getByLabel('Search TALOS commands').fill('send message')
    await expect(page.getByRole('option', { name: /Send message/ })).toHaveAttribute('aria-disabled', 'true')
    await expect(page.getByText('Type a workflow in the composer before sending.')).toBeVisible()
    await page.keyboard.press('Escape')

    await page.getByLabel('Message TALOS').fill('Create a replayable file audit workflow.')
    await page.getByRole('button', { name: 'Open command palette' }).click()
    await page.getByLabel('Search TALOS commands').fill('send message')
    await expect(page.getByRole('option', { name: /Send message/ })).toHaveAttribute('aria-disabled', 'false')
    await page.getByRole('option', { name: /Send message/ }).click()

    await expect(page.locator('p').filter({ hasText: 'Create a replayable file audit workflow.' })).toBeVisible()
    await expect(page.getByText('E2E response from AVM with replayable evidence.')).toBeVisible()
    await expect(page.getByText('1 JMP')).toBeVisible()
    await expect(page.getByText('Persisted', { exact: true })).toBeVisible()
    await page.getByRole('button', { name: 'Evidence', exact: true }).click()
    await expect(page.getByText('Run evidence', { exact: true })).toBeVisible()
    await expect(page.getByText('Run run-e2e', { exact: true })).toBeVisible()
    await expect(page.getByText('Model openai / gpt-e2e', { exact: true })).toBeVisible()
    await expect(page.getByText('Status succeeded', { exact: true })).toBeVisible()
    await expect(page.getByText('1 mutation', { exact: true })).toBeVisible()
    await expect(page.getByText('Sources 0', { exact: true })).toBeVisible()
    await expect(page.getByText('Only safe provenance is shown here. Local storage paths and raw extracted content stay out of chat.')).toBeVisible()
    const benchmarkFromRun = page.waitForRequest((request) => {
        if (!request.url().endsWith('/api/talos/runs/run-e2e/benchmark') || request.method() !== 'POST') {
            return false
        }

        const body = request.postDataJSON() as Record<string, unknown>

        return body.runs === 1
    })
    await page.getByRole('button', { name: 'Compare AVM ON/OFF', exact: true }).click()
    await benchmarkFromRun
    await expect(page.getByText('Benchmark run created for run-e2e. Group: benchmark-group-from-run-e2e. Open Compare to inspect persisted AVM ON/OFF lanes.')).toBeVisible()
    await expect(page.getByText('E2E benchmark from chat run')).toBeVisible()
    await expect(page.getByText('AVM ON from chat run')).toBeVisible()
    await expect(page.getByText('Chat run benchmark preserved replayable AVM evidence.')).toBeVisible()

    await page.keyboard.press('Tab')
    await expect(page.locator(':focus')).toBeVisible()
    await expectNoHorizontalOverflow(page)
    await testInfo.attach(`chat-${testInfo.project.name}.png`, {
        body: await page.screenshot({ fullPage: true, animations: 'disabled' }),
        contentType: 'image/png',
    })
})

test('composer slash commands open real TALOS modules and keep unavailable actions disabled', async ({ page }) => {
    await openWorkspace(page)

    await page.getByLabel('Message TALOS').fill('/')
    const slashMenu = page.getByTestId('talos-slash-command-menu')
    await expect(slashMenu).toBeVisible()
    await expect(page.getByRole('listbox', { name: 'Composer slash commands' })).toBeVisible()
    await expect.poll(async () => slashMenu.evaluate((element) => window.getComputedStyle(element).animationName)).toContain('talos-composer-popover-in')
    await expect(page.getByRole('option', { name: /\/model/ })).toContainText('Open model center')
    await expect(page.getByRole('option', { name: /\/doctor/ })).toContainText('Open doctor')
    await expect(page.getByRole('option', { name: /\/recover/ })).toHaveAttribute('aria-disabled', 'true')
    await expect(page.getByText('Select a failed node in the dashboard timeline.')).toBeVisible()
    await expect(page.getByRole('option', { name: /\/send\s+Send message/ })).toHaveCount(0)

    await page.getByRole('option', { name: /\/model/ }).click()
    await expect(page.getByRole('region', { name: 'Model Lab' })).toBeVisible()
    await expect(page.getByLabel('Message TALOS')).toHaveValue('')

    await page.getByLabel('Message TALOS').fill('/doctor')
    await expect(page.getByRole('listbox', { name: 'Composer slash commands' })).toBeVisible()
    await page.keyboard.press('Enter')
    await expect(page.getByRole('region', { name: 'Doctor' })).toBeVisible()
})

test('composer model and context popovers animate from the chat field', async ({ page }) => {
    await openWorkspace(page)

    await page.getByRole('button', { name: 'Choose model profile' }).click()
    const modelPopover = page.getByTestId('talos-model-popover')
    await expect(modelPopover).toBeVisible()
    await expect.poll(async () => modelPopover.evaluate((element) => window.getComputedStyle(element).animationName)).toContain('talos-composer-popover-in')

    await page.getByRole('button', { name: 'Choose grounding context' }).click()
    await expect(modelPopover).toHaveCount(0)
    const contextPopover = page.getByTestId('talos-context-popover')
    await expect(contextPopover).toBeVisible()
    await expect.poll(async () => contextPopover.evaluate((element) => window.getComputedStyle(element).animationName)).toContain('talos-composer-popover-in')

    await expectNoHorizontalOverflow(page)
})

test('message actions copy, reuse, resend, and retry through explicit chat controls', async ({ page }) => {
    await page.context().grantPermissions(['clipboard-read', 'clipboard-write'], { origin: 'http://127.0.0.1:8014' })
    await openWorkspace(page)

    await page.getByLabel('Message TALOS').fill('Create a replayable file audit workflow.')
    await page.getByRole('button', { name: 'Send' }).click()
    await expect(page.getByText('E2E response from AVM with replayable evidence.')).toBeVisible()

    await page.getByRole('button', { name: 'Copy message' }).first().click()
    await expect(page.getByText('Message copied.')).toBeVisible()
    await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toBe('Create a replayable file audit workflow.')

    await page.getByRole('button', { name: 'Reuse prompt' }).click()
    await expect(page.getByLabel('Message TALOS')).toHaveValue('Create a replayable file audit workflow.')
    await expect(page.getByText('Prompt loaded for reuse.')).toBeVisible()

    const resendMessageRequest = page.waitForRequest((request) => {
        if (!request.url().includes('/api/talos/sessions/session-e2e/messages') || request.method() !== 'POST') {
            return false
        }

        const body = request.postDataJSON() as Record<string, unknown>
        const metadata = body.metadata as Record<string, unknown> | undefined

        return body.role === 'user'
            && metadata?.command_id === 'resend_message'
            && metadata?.resend_of_message_id === 'message-e2e-1'
    })
    await page.getByRole('button', { name: 'Resend message' }).click()
    await resendMessageRequest
    await expect(page.getByText('Message resent through TALOS chat.')).toBeVisible()

    const retryMessageRequest = page.waitForRequest((request) => {
        if (!request.url().includes('/api/talos/sessions/session-e2e/messages') || request.method() !== 'POST') {
            return false
        }

        const body = request.postDataJSON() as Record<string, unknown>
        const metadata = body.metadata as Record<string, unknown> | undefined

        return body.role === 'user'
            && metadata?.command_id === 'retry_assistant_response'
            && metadata?.retry_of_message_id === 'message-e2e-2'
            && metadata?.resend_of_message_id === 'message-e2e-1'
    })
    await page.getByRole('button', { name: 'Retry assistant response' }).first().click()
    await retryMessageRequest
    await expect(page.getByText('Assistant response retried through TALOS chat.')).toBeVisible()
    await expect(page.getByText('E2E response from AVM with replayable evidence.')).toHaveCount(3)
})

test('settings boolean preferences render as accessible switch controls', async ({ page }) => {
    await openWorkspace(page)

    await page.getByRole('button', { name: 'Settings', exact: true }).click()
    await page.getByRole('tab', { name: 'AI Defaults' }).click()
    const visionSwitch = page.getByRole('switch', { name: 'Vision routing preference' })
    await expect(visionSwitch).toBeVisible()
    const initialVisionState = await visionSwitch.isChecked()
    await page.getByText('Vision routing preference', { exact: true }).click()
    await expect(visionSwitch).toBeChecked({ checked: !initialVisionState })
    const visionPatchRequest = page.waitForRequest((request) => {
        if (!request.url().endsWith('/api/talos/settings') || request.method() !== 'PATCH') {
            return false
        }

        const body = request.postDataJSON() as Record<string, unknown>
        const preferences = body.preferences as Record<string, unknown> | undefined
        const aiDefaults = preferences?.ai_defaults as Record<string, unknown> | undefined

        return aiDefaults?.vision_enabled === !initialVisionState
    })
    await page.getByRole('button', { name: 'Save settings' }).click()
    await visionPatchRequest

    await page.getByRole('tab', { name: 'Appearance' }).click()
    await page.getByRole('tab', { name: 'Motion' }).click()
    await expect(page.getByRole('switch', { name: 'Settings disable motion' })).toBeVisible()
    await expect(page.getByRole('switch', { name: 'Settings disable procedural background' })).toBeVisible()
    await page.getByRole('tab', { name: 'Visibility' }).click()
    await expect(page.getByRole('switch', { name: 'Brand name' })).toBeVisible()

    await page.getByRole('tab', { name: 'Agent Tools' }).click()
    await expect(page.getByRole('switch', { name: 'Code tools' })).toBeVisible()
})

test('google integration shows connected account without exposing tokens', async ({ page }) => {
    await openWorkspace(page)

    await page.getByRole('button', { name: 'Settings', exact: true }).click()
    await page.getByRole('tab', { name: /Integrations/ }).click()

    await expect(page.getByText('Google Workspace')).toBeVisible()
    await expect(page.getByText('operator@example.test')).toBeVisible()
    await expect(page.getByText(/Access token|Refresh token|encrypted_/i)).toHaveCount(0)
})

test('dashboard loads cockpit panels and opens the command palette', async ({ page }, testInfo) => {
    await openWorkspace(page)

    await expectUnifiedWorkspaceChrome(page)

    await selectDashboardTab(page, 'Agents')
    await expect(page.getByText('Model Center', { exact: true })).toBeVisible()
    const modelProfile = page.getByRole('button', { name: /E2E server-side profile/ })
    await expect(modelProfile).toContainText('AVM compatibility A')
    await expect(modelProfile).toContainText('JSON')
    await expect(modelProfile).toContainText('Tools')
    await expect(modelProfile).toContainText('Embeddings')
    await expect(modelProfile).toContainText('Remote')
    await expect(modelProfile).toContainText('Vision unavailable')
    await expect(page.getByText('sk-')).toBeHidden()
    await expect(page.getByText('encrypted_secret')).toBeHidden()

    await selectDashboardTab(page, 'Knowledge')
    await expect(page.getByText('Context Vault', { exact: true })).toBeVisible()

    await page.getByRole('button', { name: 'Open command palette' }).click()
    await expect(page.getByRole('listbox', { name: 'TALOS commands' })).toBeVisible()
    await page.getByLabel('Search TALOS commands').fill('send message')
    await expect(page.getByRole('option', { name: /Send message/ })).toHaveAttribute('aria-disabled', 'true')
    await expect(page.getByRole('listbox', { name: 'TALOS commands' })).toBeVisible()
    await expect(page.getByText('Type a workflow in the composer before sending.')).toBeVisible()

    await page.getByLabel('Search TALOS commands').fill('new session')
    await expect(page.getByRole('option', { name: /New session/ })).toHaveAttribute('aria-disabled', 'false')
    const commandSessionRequest = page.waitForRequest((request) => (
        request.url().endsWith('/api/talos/sessions')
        && request.method() === 'POST'
        && request.postDataJSON().title === 'New chat'
    ))
    await page.getByRole('option', { name: /New session/ }).click()
    await commandSessionRequest
    await expect(page.getByText('New session opened.')).toBeVisible()

    await page.getByRole('button', { name: 'Open command palette' }).click()
    await page.getByLabel('Search TALOS commands').fill('model center')
    await page.getByRole('option', { name: /Open model center/ }).click()
    await expect(page.getByRole('listbox', { name: 'TALOS commands' })).toBeHidden()
    await expect(page.getByText('Model Center', { exact: true })).toBeVisible()

    await page.getByRole('button', { name: 'Open command palette' }).click()
    await page.getByLabel('Search TALOS commands').fill('attach file')
    await expect(page.getByRole('option', { name: /Attach file/ })).toHaveAttribute('aria-disabled', 'false')
    await page.getByRole('option', { name: /Attach file/ }).click()
    await expect(page.getByText('Context Vault', { exact: true })).toBeVisible()
    await expect(page.locator('input[type="file"]')).toBeVisible()

    await page.getByRole('button', { name: 'Open command palette' }).click()
    await page.getByLabel('Search TALOS commands').fill('trace replay')
    await expect(page.getByRole('option', { name: /Open trace replay/ })).toHaveAttribute('aria-disabled', 'false')
    await page.getByRole('option', { name: /Open trace replay/ }).click()
    await expect(page.getByRole('tab', { name: 'Trace replay' })).toHaveAttribute('aria-selected', 'true')
    await expect(page.getByRole('button', { name: 'Play', exact: true })).toBeVisible()
    await page.getByRole('tab', { name: 'Timeline' }).click()
    await expect(page.getByRole('tab', { name: 'Timeline' })).toHaveAttribute('aria-selected', 'true')
    await page.getByRole('button', { name: 'Open command palette' }).click()
    await page.getByLabel('Search TALOS commands').fill('trace replay')
    await page.getByRole('option', { name: /Open trace replay/ }).click()
    await expect(page.getByRole('tab', { name: 'Trace replay' })).toHaveAttribute('aria-selected', 'true')

    await page.getByRole('button', { name: 'Open command palette' }).click()
    await page.getByLabel('Search TALOS commands').fill('audit log')
    await expect(page.getByRole('option', { name: /Open audit log/ })).toHaveAttribute('aria-disabled', 'false')
    await page.getByRole('option', { name: /Open audit log/ }).click()
    await expect(page.getByTestId('talos-admin-section-audit')).toBeVisible()
    await expect(page.getByTestId('talos-admin-section-audit')).toContainText('Redacted security events')

    await page.getByRole('button', { name: 'Open command palette' }).click()
    await page.getByLabel('Search TALOS commands').fill('policy panel')
    await page.getByRole('option', { name: /Open policy panel/ }).click()
    await expect(page.getByTestId('talos-admin-section-policy')).toBeVisible()
    await expect(page.getByTestId('talos-admin-section-policy')).toContainText('Capability boundary')

    await page.getByRole('button', { name: 'Open command palette' }).click()
    await page.getByLabel('Search TALOS commands').fill('backup panel')
    await page.getByRole('option', { name: /Open backup panel/ }).click()
    await expect(page.getByTestId('talos-admin-section-backup')).toBeVisible()
    await expect(page.getByTestId('talos-admin-section-backup')).toContainText('Dry-run restore policy')
    await expect(page.getByTestId('talos-admin-section-backup').getByRole('button', { name: 'Validate restore dry-run' })).toBeDisabled()

    await page.getByRole('button', { name: 'Open command palette' }).click()
    await page.getByLabel('Search TALOS commands').fill('email triage')
    await page.getByRole('option', { name: /Open email triage/ }).click()
    await expect(page.getByTestId('talos-productivity-section-email-triage')).toBeVisible()
    await expect(page.getByTestId('talos-productivity-section-email-triage')).toContainText('Read-only and draft-only')
    await expect(page.getByTestId('talos-productivity-section-email-triage')).toContainText('send_enabled false')
    await expect(page.getByTestId('talos-productivity-section-email-triage').getByRole('button', { name: 'Create draft' })).toBeDisabled()

    await page.getByRole('button', { name: 'Open command palette' }).click()
    await page.getByLabel('Search TALOS commands').fill('send email draft')
    await expect(page.getByRole('option', { name: /Send email draft/ })).toHaveAttribute('aria-disabled', 'true')
    await expect(page.getByText('Email send is disabled until HMI confirmation and audit exist.')).toBeVisible()

    await page.keyboard.press('Escape')
    await expect(page.getByRole('listbox', { name: 'TALOS commands' })).toBeHidden()
    await expectNoHorizontalOverflow(page)
    await testInfo.attach(`dashboard-${testInfo.project.name}.png`, {
        body: await page.screenshot({ fullPage: true, animations: 'disabled' }),
        contentType: 'image/png',
    })
})

test('model center offers provider-first quick add with optional draft test', async ({ page }, testInfo) => {
    await openWorkspace(page)
    await selectDashboardTab(page, 'Agents')

    await expect(page.getByText('Provider-first model setup', { exact: true })).toBeVisible()
    const quickAdd = page.getByTestId('talos-model-quick-add')

    for (const provider of ['OpenAI', 'DeepSeek', 'Anthropic', 'Google Gemini', 'OpenRouter', 'Ollama Local']) {
        await expect(quickAdd.getByRole('button', { name: `Choose ${provider} provider` })).toBeVisible()
    }

    await quickAdd.getByRole('button', { name: 'Choose OpenRouter provider' }).click()
    await expect(quickAdd.getByLabel('Provider API key')).toBeVisible()
    await expect(quickAdd.getByLabel('Model name')).toBeHidden()
    await expect(quickAdd.getByLabel('Base URL')).toBeHidden()

    await quickAdd.getByLabel('Provider API key').fill('sk-openrouter-e2e-secret')
    await expect(quickAdd.getByRole('button', { name: 'Add profile' })).toBeEnabled()
    await quickAdd.getByRole('button', { name: 'Advanced options' }).click()
    await expect(quickAdd.getByLabel('Timeout seconds')).toBeVisible()
    await quickAdd.getByLabel('Timeout seconds').fill('45')
    const draftProbeRequest = page.waitForRequest((request) => {
        if (!request.url().endsWith('/api/talos/model-profiles/probe-draft') || request.method() !== 'POST') {
            return false
        }

        const body = request.postDataJSON() as Record<string, unknown>

        return body.provider === 'openrouter'
            && body.secret === 'sk-openrouter-e2e-secret'
            && body.model === 'openai/gpt-4.1-mini'
            && body.base_url === 'https://openrouter.ai/api/v1'
            && body.timeout_seconds === 45
    })

    await quickAdd.getByRole('button', { name: 'Test', exact: true }).click()
    await draftProbeRequest
    await expect(quickAdd.getByText('Draft probe healthy').first()).toBeVisible()

    const createRequest = page.waitForRequest((request) => {
        if (!request.url().endsWith('/api/talos/model-profiles') || request.method() !== 'POST') {
            return false
        }

        const body = request.postDataJSON() as Record<string, unknown>

        return body.provider === 'openrouter'
            && body.secret === 'sk-openrouter-e2e-secret'
            && body.model === 'openai/gpt-4.1-mini'
            && body.base_url === 'https://openrouter.ai/api/v1'
            && body.timeout_seconds === 45
    })
    await quickAdd.getByRole('button', { name: 'Add profile' }).click()
    await createRequest

    const openRouterProfile = page.getByRole('button').filter({ hasText: 'OpenRouter quick profile' })
    await expect(openRouterProfile).toBeVisible()
    await expect(openRouterProfile.getByText('Secret stored server-side.')).toBeVisible()
    await expect(page.getByText('sk-openrouter-e2e-secret')).toBeHidden()
    await expect(page.getByText('encrypted_secret')).toBeHidden()

    await quickAdd.getByRole('button', { name: 'Choose Ollama Local provider' }).click()
    await expect(quickAdd.getByLabel('Local endpoint')).toBeVisible()
    await expect(quickAdd.getByLabel('Provider API key')).toBeHidden()
    await expect(page.getByText('Local providers are allowed only without bearer tokens.')).toBeVisible()

    await testInfo.attach(`model-center-quick-add-${testInfo.project.name}.png`, {
        body: await page.screenshot({ fullPage: true, animations: 'disabled' }),
        contentType: 'image/png',
    })
})

test('model center can save a provider profile after a failed optional draft probe', async ({ page }) => {
    await page.route('**/api/talos/model-profiles/probe-draft', async (route) => {
        await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({
                data: {
                    status: 'failed',
                    result: {
                        ok: false,
                        code: 'PROVIDER_HTTP_ERROR',
                        message: 'Provider rejected the test request.',
                    },
                },
            }),
        })
    })

    await openWorkspace(page)
    await selectDashboardTab(page, 'Agents')

    const quickAdd = page.getByTestId('talos-model-quick-add')
    await quickAdd.getByRole('button', { name: 'Choose OpenRouter provider' }).click()
    await quickAdd.getByLabel('Provider API key').fill('sk-openrouter-e2e-secret')
    await expect(quickAdd.getByRole('button', { name: 'Add profile' })).toBeEnabled()

    await quickAdd.getByRole('button', { name: 'Test', exact: true }).click()
    await expect(quickAdd.getByText('Draft probe failed').first()).toBeVisible()
    await expect(quickAdd.getByText('Provider rejected the test request.').first()).toBeVisible()
    await expect(quickAdd.getByRole('button', { name: 'Add profile' })).toBeEnabled()

    const createRequest = page.waitForRequest((request) => {
        if (!request.url().endsWith('/api/talos/model-profiles') || request.method() !== 'POST') {
            return false
        }

        const body = request.postDataJSON() as Record<string, unknown>

        return body.provider === 'openrouter'
            && body.secret === 'sk-openrouter-e2e-secret'
            && body.status === 'untested'
    })

    await quickAdd.getByRole('button', { name: 'Add profile' }).click()
    await createRequest
    await expect(page.getByRole('button').filter({ hasText: 'OpenRouter quick profile' })).toBeVisible()
})

test('cookbook model lab shows hardware scan fit score and preview-only commands', async ({ page }, testInfo) => {
    await openWorkspace(page)
    await selectDashboardTab(page, 'Runtime')
    await page.getByRole('button', { name: /Model Lab|Cookbook/ }).click()

    await expect(page.getByRole('heading', { name: 'Model Lab', exact: true })).toBeVisible()
    await expect(page.getByText('Hardware scan', { exact: true })).toBeVisible()
    await expect(page.getByText('Fit score', { exact: true })).toBeVisible()

    await page.getByRole('tab', { name: 'Download' }).click()
    const previewRequest = page.waitForRequest((request) => (
        request.url().endsWith('/api/talos/cookbook/download-preview')
        && request.method() === 'POST'
    ))
    await page.getByRole('button', { name: /Preview download command/ }).click()
    await previewRequest
    await expect(page.getByText('Dry-run preview')).toBeVisible()
    await expect(page.getByText('No host command has been executed.')).toBeVisible()

    await testInfo.attach('cookbook-model-lab.png', {
        body: await page.screenshot({ fullPage: true }),
        contentType: 'image/png',
    })
})

test('settings window loads safe preferences and persists theme through the settings API', async ({ page }, testInfo) => {
    test.setTimeout(130_000)

    await openWorkspace(page)

    await page.getByLabel('Message TALOS').fill('Keep focus in the composer.')
    await page.keyboard.press('Control+K')
    await expect(page.getByRole('listbox', { name: 'TALOS commands' })).toBeVisible()
    await page.keyboard.press('Escape')

    await page.getByRole('button', { name: 'Settings', exact: true }).click()
    await expect(page.getByText('Settings Center', { exact: true })).toBeVisible()
    await expect(page.getByText('Workspace defaults, model behavior and operator preferences from /api/talos/settings.')).toBeVisible()
    await expect(page.getByRole('tab', { name: 'AI Defaults' })).toBeVisible()
    await expect(page.getByRole('tab', { name: 'Search' })).toBeVisible()
    await expect(page.getByRole('tab', { name: 'Appearance' })).toBeVisible()
    await expect(page.getByText('api_key')).toBeHidden()
    await expect(page.getByText('encrypted_secret')).toBeHidden()

    await page.getByRole('tab', { name: 'Search' }).click()
    await page.getByLabel('Search provider').selectOption('searxng')
    await page.getByLabel('Results per query').fill('7')
    await page.getByLabel('Search endpoint URL').fill('http://localhost:8080')
    const searchPatchRequest = page.waitForRequest((request) => {
        if (!request.url().endsWith('/api/talos/settings') || request.method() !== 'PATCH') {
            return false
        }

        const body = request.postDataJSON() as Record<string, unknown>
        const preferences = body.preferences as Record<string, unknown> | undefined
        const search = preferences?.search as Record<string, unknown> | undefined

        return search?.provider === 'searxng'
            && Number(search?.results_per_query) === 7
            && search?.url === 'http://localhost:8080'
    })
    await page.getByRole('button', { name: 'Save settings' }).click()
    await searchPatchRequest
    await expect(page.getByText('Settings saved through /api/talos/settings.')).toBeVisible()

    await page.getByRole('button', { name: 'Theme', exact: true }).click()
    await expect(page.getByText('Theme Engine', { exact: true })).toBeVisible()
    await expect(page.getByRole('tab', { name: 'Presets' })).toBeVisible()
    await expect(page.getByRole('tab', { name: 'Customize' })).toBeVisible()
    await expect(page.getByRole('switch', { name: 'Video backgrounds' })).toHaveCount(0)
    await expect(page.getByTestId('talos-theme-preview-video')).toHaveCount(0)
    await expect(page.getByTestId('talos-theme-preview-poster')).toHaveCount(talosThemePresetCount)
    await expect.poll(async () => page.getByTestId('talos-theme-preview-poster').evaluateAll((images) => images.every((image) => {
        const poster = image as HTMLImageElement

        return poster.complete && poster.naturalWidth > 0
    }))).toBe(true)
    const posterSources = await page.getByTestId('talos-theme-preview-poster').evaluateAll((images) => (
        images.map((image) => (image as HTMLImageElement).getAttribute('src'))
    ))
    expect(new Set(posterSources).size).toBe(talosThemePresetCount)
    expect(posterSources).toContain('/talos/backgrounds/violet-poster.webp')
    expect(posterSources).toContain('/talos/backgrounds/claudius-poster.webp')
    expect(posterSources).toContain('/talos/backgrounds/basicus-poster.webp')
    await expect(page.locator('[data-testid="talos-theme-preset"]')).toHaveCount(talosThemePresetCount)
    await expect(page.locator('[data-testid="talos-theme-preview-swatch"]')).toHaveCount(talosThemePresetCount)
    const forgeActionMotion = await page.locator('.talos-shell').evaluate((element) => {
        const style = window.getComputedStyle(element)

        return {
            surface: style.getPropertyValue('--talos-motion-surface-style').trim(),
            feedback: style.getPropertyValue('--talos-motion-feedback-style').trim(),
            hover: style.getPropertyValue('--talos-motion-hover-style').trim(),
        }
    })
    const terminalThemePreset = page.getByRole('button', { name: 'Terminal Operator' })
    await expect(terminalThemePreset).toContainText('Procedural effect')
    const themePatchRequest = page.waitForRequest((request) => {
        if (!request.url().endsWith('/api/talos/settings') || request.method() !== 'PATCH') {
            return false
        }

        const body = request.postDataJSON() as Record<string, unknown>
        const preferences = body.preferences as Record<string, unknown> | undefined

        return preferences?.theme === 'terminal'
    })
    await terminalThemePreset.click()
    await themePatchRequest
    await expect(page.getByText('Theme saved through /api/talos/settings.')).toBeVisible()
    await expect(page.locator('.talos-shell')).toHaveClass(/talos-theme-terminal/)
    const terminalActionMotion = await page.locator('.talos-shell').evaluate((element) => {
        const style = window.getComputedStyle(element)

        return {
            surface: style.getPropertyValue('--talos-motion-surface-style').trim(),
            feedback: style.getPropertyValue('--talos-motion-feedback-style').trim(),
            hover: style.getPropertyValue('--talos-motion-hover-style').trim(),
        }
    })
    expect(terminalActionMotion).not.toEqual(forgeActionMotion)
    expect(terminalActionMotion).toMatchObject({
        surface: 'scanline',
        feedback: 'trace',
        hover: 'underline',
    })
    await expect(page.getByTestId('talos-theme-background-video')).toHaveCount(0)
    await expect(page.getByTestId('talos-theme-background-poster')).toHaveCount(0)
    await expect(page.getByTestId('talos-background-effect')).toHaveAttribute('data-effect', 'trace-rain')
    await page.emulateMedia({ reducedMotion: 'no-preference' })
    const terminalMotion = await page.getByTestId('talos-background-effect').evaluate((element) => {
        const stream = element.querySelector('.talos-trace-stream-a')

        return stream ? window.getComputedStyle(stream).animationName : ''
    })
    expect(terminalMotion).toContain('talos-trace-rain')

    await page.getByRole('tab', { name: 'Customize' }).click()
    await expect(page.getByText('Workspace customization', { exact: true })).toBeVisible()
    await page.getByLabel('Accent color').fill('#31d6c8')
    await page.getByLabel('Background color').fill('#02080c')
    await page.getByLabel('Panel color').fill('#08121a')
    await page.getByLabel('Text color').fill('#e8fbff')
    await page.getByLabel('Background effect').selectOption('trace-rain')
    await page.getByLabel('Density').selectOption('compact')
    await page.getByLabel('Corner radius').selectOption('sharp')
    await page.getByLabel('Effect intensity').fill('82')
    const customizationPatchRequest = page.waitForRequest((request) => {
        if (!request.url().endsWith('/api/talos/settings') || request.method() !== 'PATCH') {
            return false
        }

        const body = request.postDataJSON() as Record<string, unknown>
        const preferences = body.preferences as Record<string, unknown> | undefined
        const customization = preferences?.theme_customization as Record<string, unknown> | undefined

        return customization?.accent === '#31d6c8'
            && customization?.background === '#02080c'
            && customization?.panel === '#08121a'
            && customization?.text === '#e8fbff'
            && customization?.effect === 'trace-rain'
            && customization?.density === 'compact'
            && customization?.radius === 'sharp'
            && Number(customization?.effect_intensity) === 82
    })
    await page.getByRole('button', { name: 'Save customization' }).click()
    await customizationPatchRequest
    await expect(page.locator('.talos-shell')).toHaveClass(/talos-density-compact/)
    await expect(page.locator('.talos-shell')).toHaveClass(/talos-radius-sharp/)
    await expect(page.locator('.talos-shell')).toHaveAttribute('data-background-effect', 'trace-rain')
    await expect(page.locator('.talos-shell')).toHaveAttribute('style', /--talos-accent:\s*#31d6c8/)
    await expect(page.getByTestId('talos-background-effect')).toHaveAttribute('data-effect', 'trace-rain')
    await expect(page.getByTestId('talos-theme-background-video')).toHaveCount(0)
    await expect(page.getByText('Theme customization saved through /api/talos/settings.')).toBeVisible()

    await page.reload({ waitUntil: 'domcontentloaded' })
    await waitForWorkspaceReady(page)
    await expect(page.locator('.talos-shell')).toHaveClass(/talos-theme-terminal/)
    await expect(page.locator('.talos-shell')).toHaveClass(/talos-density-compact/)
    await expect(page.locator('.talos-shell')).toHaveClass(/talos-radius-sharp/)
    await expect(page.locator('.talos-shell')).toHaveAttribute('data-background-effect', 'trace-rain')
    await expect(page.locator('.talos-shell')).toHaveAttribute('style', /--talos-accent:\s*#31d6c8/)
    await expect(page.getByTestId('talos-theme-background-video')).toHaveCount(0)
    await expect(page.getByTestId('talos-theme-background-poster')).toHaveCount(0)
    await expect(page.getByTestId('talos-background-effect')).toHaveAttribute('data-effect', 'trace-rain')
    await expectNoHorizontalOverflow(page)

    await page.getByRole('button', { name: 'Theme', exact: true }).click()
    const auroraPreset = page.getByRole('button', { name: 'Aurora Research' })
    const presetResetPatchRequest = page.waitForRequest((request) => {
        if (!request.url().endsWith('/api/talos/settings') || request.method() !== 'PATCH') {
            return false
        }

        const body = request.postDataJSON() as Record<string, unknown>
        const preferences = body.preferences as Record<string, unknown> | undefined
        const customization = preferences?.theme_customization as Record<string, unknown> | undefined

        return preferences?.theme === 'aurora'
            && customization !== undefined
            && Object.keys(customization).length === 0
    })
    await auroraPreset.click()
    await presetResetPatchRequest
    await expect(page.locator('.talos-shell')).toHaveClass(/talos-theme-aurora/)
    await expect(page.locator('.talos-shell')).not.toHaveAttribute('style', /--talos-accent/)
    await expect(page.getByTestId('talos-background-effect')).toHaveAttribute('data-effect', 'signal-mesh')
    const auroraActionMotion = await page.locator('.talos-shell').evaluate((element) => {
        const style = window.getComputedStyle(element)

        return {
            surface: style.getPropertyValue('--talos-motion-surface-style').trim(),
            feedback: style.getPropertyValue('--talos-motion-feedback-style').trim(),
            hover: style.getPropertyValue('--talos-motion-hover-style').trim(),
        }
    })
    expect(auroraActionMotion).toMatchObject({
        surface: 'scale-fade',
        feedback: 'pulse',
        hover: 'node-glow',
    })
    const auroraAccent = await page.locator('.talos-shell').evaluate((element) => (
        window.getComputedStyle(element).getPropertyValue('--talos-accent').trim()
    ))
    expect(auroraAccent).toBe('#42e7c7')

    await testInfo.attach(`settings-theme-${testInfo.project.name}.png`, {
        body: await page.screenshot({ fullPage: true, animations: 'disabled' }),
        contentType: 'image/png',
    })
})

test('theme engine v2 manages custom themes, live preview, motion, area tokens and import export', async ({ page }, testInfo) => {
    test.setTimeout(120_000)

    await openWorkspace(page)

    await page.getByRole('button', { name: 'Theme', exact: true }).click()
    await expect(page.getByText('Theme Engine', { exact: true })).toBeVisible()

    await page.getByRole('tab', { name: 'Customize' }).click()
    await page.getByLabel('Accent color').fill('#7c3aed')
    await expect(page.locator('.talos-shell')).toHaveAttribute('style', /--talos-accent:\s*#7c3aed/)

    await page.getByRole('button', { name: 'Discard changes' }).click()
    await expect(page.locator('.talos-shell')).not.toHaveAttribute('style', /#7c3aed/)

    await page.getByLabel('Accent color').fill('#31d6c8')
    await page.getByLabel('Background effect').selectOption('trace-rain')
    const saveNamedThemeRequest = page.waitForRequest((request) => {
        if (!request.url().endsWith('/api/talos/settings') || request.method() !== 'PATCH') {
            return false
        }

        const body = request.postDataJSON() as Record<string, unknown>
        const preferences = body.preferences as Record<string, unknown> | undefined
        const library = preferences?.theme_library as Array<Record<string, unknown>> | undefined
        const customization = preferences?.theme_customization as Record<string, unknown> | undefined

        return Array.isArray(library)
            && library.some((theme) => theme.name === 'Ninox Dark' && (theme.tokens as Record<string, unknown> | undefined)?.accent === '#31d6c8')
            && typeof preferences?.active_custom_theme_id === 'string'
            && customization?.accent === '#31d6c8'
    })
    await page.getByRole('button', { name: 'Save as theme' }).click()
    await page.getByLabel('Theme name').fill('Ninox Dark')
    await page.getByRole('button', { name: 'Create theme' }).click()
    await saveNamedThemeRequest
    await expect(page.getByText('Ninox Dark', { exact: true })).toBeVisible()

    await page.reload({ waitUntil: 'domcontentloaded' })
    await waitForWorkspaceReady(page)
    await page.getByRole('button', { name: 'Theme', exact: true }).click()
    await page.getByRole('tab', { name: 'Library' }).click()
    await expect(page.getByText('Ninox Dark', { exact: true })).toBeVisible()

    await page.getByRole('button', { name: 'Export active theme' }).click()
    const exportedTheme = await page.getByTestId('talos-theme-export-json').inputValue()
    expect(JSON.parse(exportedTheme)).toMatchObject({
        schema: 'talos_theme_export_v1',
        theme: {
            name: 'Ninox Dark',
        },
    })

    await page.getByLabel('Import theme JSON').fill('{bad json')
    await page.getByRole('button', { name: 'Import theme' }).click()
    await expect(page.getByText('TALOS rejected this theme import.')).toBeVisible()

    await page.getByLabel('Import theme JSON').fill('{"schema":"wrong","theme":{"name":"Bad"}}')
    await page.getByRole('button', { name: 'Import theme' }).click()
    await expect(page.getByText('TALOS rejected this theme import.')).toBeVisible()

    await page.getByLabel('Import theme JSON').fill(JSON.stringify({
        schema: 'talos_theme_export_v1',
        exported_at: '2026-07-08T12:00:00.000Z',
        theme: {
            id: 'imported-e2e',
            name: 'Imported Mint',
            base_theme: 'aurora',
            tokens: {
                accent: '#6ee7b7',
                effect: 'signal-mesh',
            },
            motion: 'subtle',
        },
    }))
    const importThemeRequest = page.waitForRequest((request) => {
        if (!request.url().endsWith('/api/talos/settings') || request.method() !== 'PATCH') {
            return false
        }

        const body = request.postDataJSON() as Record<string, unknown>
        const preferences = body.preferences as Record<string, unknown> | undefined
        const library = preferences?.theme_library as Array<Record<string, unknown>> | undefined

        return Array.isArray(library) && library.some((theme) => theme.name === 'Imported Mint')
    })
    await page.getByRole('button', { name: 'Import theme' }).click()
    await importThemeRequest
    await expect(page.getByText('Imported Mint', { exact: true })).toBeVisible()

    await page.getByRole('tab', { name: 'Motion' }).click()
    const motionOffRequest = page.waitForRequest((request) => {
        if (!request.url().endsWith('/api/talos/settings') || request.method() !== 'PATCH') {
            return false
        }

        const body = request.postDataJSON() as Record<string, unknown>
        const preferences = body.preferences as Record<string, unknown> | undefined

        return preferences?.theme_motion === 'off'
    })
    await page.getByLabel('Theme motion', { exact: true }).selectOption('off')
    await motionOffRequest
    await expect(page.locator('.talos-shell')).toHaveAttribute('data-background-effect', 'signal-mesh')
    await expect(page.getByTestId('talos-background-effect')).toHaveAttribute('data-motion-disabled', 'true')
    await expect(page.getByTestId('talos-procedural-canvas')).toHaveCount(1)
    await expectProceduralCanvasFrameStaysStill(page)

    const motionCinematicRequest = page.waitForRequest((request) => {
        if (!request.url().endsWith('/api/talos/settings') || request.method() !== 'PATCH') {
            return false
        }

        const body = request.postDataJSON() as Record<string, unknown>
        const preferences = body.preferences as Record<string, unknown> | undefined

        return preferences?.theme_motion === 'cinematic'
    })
    await page.getByLabel('Theme motion', { exact: true }).selectOption('cinematic')
    await motionCinematicRequest
    await expect(page.locator('.talos-shell')).toHaveAttribute('data-background-effect', 'signal-mesh')
    await expect(page.getByTestId('talos-procedural-canvas')).toHaveCount(1)
    const canvasHasPixels = await page.getByTestId('talos-procedural-canvas').evaluate((canvas) => {
        const element = canvas as HTMLCanvasElement
        const context = element.getContext('2d')
        if (!context || element.width === 0 || element.height === 0) {
            return false
        }

        const sample = context.getImageData(0, 0, Math.min(80, element.width), Math.min(80, element.height)).data
        for (let index = 3; index < sample.length; index += 4) {
            if (sample[index] > 0) {
                return true
            }
        }

        return false
    })
    expect(canvasHasPixels).toBe(true)
    await expectProceduralCanvasAboveScrim(page)
    const cinematicOpacity = await page.locator('.talos-shell').evaluate((element) => (
        Number(window.getComputedStyle(element).getPropertyValue('--talos-effect-opacity').trim())
    ))
    expect(cinematicOpacity).toBeGreaterThan(0.8)

    await page.getByRole('tab', { name: 'Advanced' }).evaluate((element) => {
        (element as HTMLElement).click()
    })
    await page.getByLabel('Area', { exact: true }).selectOption('composer')
    await page.getByLabel('Area background').fill('#111827')
    const areaTokenRequest = page.waitForRequest((request) => {
        if (!request.url().endsWith('/api/talos/settings') || request.method() !== 'PATCH') {
            return false
        }

        const body = request.postDataJSON() as Record<string, unknown>
        const preferences = body.preferences as Record<string, unknown> | undefined
        const areaTokens = preferences?.theme_area_tokens as Record<string, Record<string, unknown>> | undefined

        return areaTokens?.composer?.background === '#111827'
    })
    await page.getByRole('button', { name: 'Save area tokens' }).click()
    await areaTokenRequest
    await expect(page.locator('.talos-shell')).toHaveAttribute('style', /--talos-composer-bg:\s*#111827/)

    await testInfo.attach(`theme-engine-v2-${testInfo.project.name}.png`, {
        body: await page.screenshot({ fullPage: true, animations: 'disabled' }),
        contentType: 'image/png',
    })
})

test('theme engine v3 persists interface motion tokens and previews action animation', async ({ page }, testInfo) => {
    await openWorkspace(page)

    const defaultMotionState = await page.locator('.talos-shell').evaluate((element) => {
        const style = window.getComputedStyle(element)

        return {
            profile: element.getAttribute('data-ui-animation-profile'),
            openDuration: style.getPropertyValue('--talos-motion-open-duration').trim(),
            hover: style.getPropertyValue('--talos-motion-hover-style').trim(),
        }
    })
    expect(defaultMotionState.profile).toBe('preset')
    expect(defaultMotionState.openDuration).toMatch(/ms$/)
    expect(defaultMotionState.hover).toBeTruthy()

    await page.getByRole('button', { name: 'Theme', exact: true }).click()
    await page.getByRole('tab', { name: 'Customize' }).click()
    await expect(page.getByText('Interface motion', { exact: true })).toBeVisible()

    await page.getByLabel('Animation profile').selectOption('custom')
    await page.getByLabel('Open/close style').selectOption('terminal-snap')
    await page.getByLabel('Surface transition').selectOption('scanline')
    await page.getByLabel('Feedback style').selectOption('trace')
    await page.getByLabel('Hover/focus style').selectOption('node-glow')
    await page.getByLabel('Duration scale').fill('125')
    await page.getByLabel('Motion intensity').fill('86')
    await page.getByLabel('Motion stagger').fill('64')
    await page.getByLabel('Motion easing').selectOption('cinematic')

    await page.getByRole('button', { name: 'Preview motion' }).click()
    await expect(page.getByTestId('talos-motion-preview-surface')).toHaveAttribute('data-preview-state', 'open')
    await expect.poll(async () => page.getByTestId('talos-motion-preview-surface').evaluate((element) => (
        window.getComputedStyle(element).animationName
    ))).toContain('talos-feedback-trace')

    const saveMotionRequest = page.waitForRequest((request) => {
        if (!request.url().endsWith('/api/talos/settings') || request.method() !== 'PATCH') {
            return false
        }

        const body = request.postDataJSON() as Record<string, unknown>
        const preferences = body.preferences as Record<string, unknown> | undefined
        const animation = preferences?.ui_animation_customization as Record<string, unknown> | undefined

        return preferences?.ui_animation_profile === 'custom'
            && animation?.open_close === 'terminal-snap'
            && animation?.surface_transition === 'scanline'
            && animation?.feedback === 'trace'
            && animation?.hover === 'node-glow'
            && animation?.duration_scale === 125
            && animation?.intensity === 86
            && animation?.stagger === 64
            && animation?.easing === 'cinematic'
    })
    await page.getByRole('button', { name: 'Save customization' }).click()
    await saveMotionRequest
    await expect(page.locator('.talos-shell')).toHaveAttribute('data-ui-animation-profile', 'custom')

    const customMotionState = await page.locator('.talos-shell').evaluate((element) => {
        const style = window.getComputedStyle(element)

        return {
            profile: element.getAttribute('data-ui-animation-profile'),
            surface: style.getPropertyValue('--talos-motion-surface-style').trim(),
            feedback: style.getPropertyValue('--talos-motion-feedback-style').trim(),
            hover: style.getPropertyValue('--talos-motion-hover-style').trim(),
            intensity: style.getPropertyValue('--talos-motion-intensity').trim(),
            stagger: style.getPropertyValue('--talos-motion-stagger').trim(),
        }
    })
    expect(customMotionState.profile).toBe('custom')
    expect(customMotionState.surface).toBe('scanline')
    expect(customMotionState.feedback).toBe('trace')
    expect(customMotionState.hover).toBe('node-glow')
    expect(Number(customMotionState.intensity)).toBeGreaterThan(0.8)
    expect(customMotionState.stagger).toBe('64ms')

    await page.reload({ waitUntil: 'domcontentloaded' })
    await waitForWorkspaceReady(page)

    const persistedMotionState = await page.locator('.talos-shell').evaluate((element) => ({
        profile: element.getAttribute('data-ui-animation-profile'),
        feedback: window.getComputedStyle(element).getPropertyValue('--talos-motion-feedback-style').trim(),
    }))
    expect(persistedMotionState).toEqual({
        profile: 'custom',
        feedback: 'trace',
    })

    await page.getByRole('button', { name: 'Theme', exact: true }).click()
    await page.getByRole('tab', { name: 'Library' }).click()
    await page.getByRole('button', { name: 'Export active theme' }).click()
    const exportedTheme = JSON.parse(await page.getByTestId('talos-theme-export-json').inputValue()) as Record<string, unknown>
    expect(exportedTheme).toMatchObject({
        schema: 'talos_theme_export_v1',
        theme: {
            ui_animation_profile: 'custom',
            ui_animation_customization: {
                feedback: 'trace',
            },
        },
    })

    await testInfo.attach(`theme-engine-v3-motion-${testInfo.project.name}.png`, {
        body: await page.screenshot({ fullPage: true, animations: 'disabled' }),
        contentType: 'image/png',
    })
})

test('system motion follows browser reduced motion while explicit motion can animate', async ({ page }) => {
    await openWorkspace(page)
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await page.evaluate(async () => {
        await fetch('/api/talos/settings', {
            method: 'PATCH',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                preferences: {
                    theme: 'forge',
                    reduced_motion: false,
                    theme_motion: 'system',
                    theme_customization: {
                        effect: 'dag-flow',
                    },
                },
            }),
        })
    })
    await page.reload({ waitUntil: 'domcontentloaded' })
    await waitForWorkspaceReady(page)

    await expect(page.locator('.talos-shell')).toHaveAttribute('data-background-effect', 'dag-flow')
    await expect(page.locator('.talos-shell')).toHaveAttribute('data-ui-motion-disabled', 'true')
    await expect.poll(async () => page.locator('.talos-shell').evaluate((element) => (
        window.getComputedStyle(element).getPropertyValue('--talos-motion-open-duration').trim()
    ))).toBe('0ms')
    await expect(page.getByTestId('talos-background-effect')).toHaveAttribute('data-motion-disabled', 'true')
    await expect(page.getByTestId('talos-procedural-canvas')).toHaveCount(1)
    await expectProceduralCanvasFrameStaysStill(page)

    await page.getByRole('button', { name: 'Theme', exact: true }).click()
    await page.getByRole('tab', { name: 'Motion' }).click()
    const motionCinematicRequest = page.waitForRequest((request) => {
        if (!request.url().endsWith('/api/talos/settings') || request.method() !== 'PATCH') {
            return false
        }

        const body = request.postDataJSON() as Record<string, unknown>
        const preferences = body.preferences as Record<string, unknown> | undefined

        return preferences?.theme_motion === 'cinematic'
    })
    await page.getByLabel('Theme motion', { exact: true }).selectOption('cinematic')
    await motionCinematicRequest

    await expect(page.locator('.talos-shell')).toHaveAttribute('data-background-effect', 'dag-flow')
    await expect(page.locator('.talos-shell')).toHaveAttribute('data-ui-motion-disabled', 'false')
    await expect.poll(async () => page.locator('.talos-shell').evaluate((element) => (
        window.getComputedStyle(element).getPropertyValue('--talos-motion-open-duration').trim()
    ))).not.toBe('0ms')
    await expect(page.getByTestId('talos-background-effect')).toHaveAttribute('data-motion-disabled', 'false')
    await expect(page.getByTestId('talos-procedural-canvas')).toHaveCount(1)
    await expectProceduralCanvasAboveScrim(page)
    await expectProceduralCanvasFrameChanges(page)
})

test('theme engine defaults to simple animation and warns before rich motion', async ({ page }) => {
    await openWorkspace(page)
    await page.getByRole('button', { name: 'Theme', exact: true }).click()
    await page.getByRole('tab', { name: 'Motion' }).click()

    await expect(page.getByRole('switch', { name: 'Use simple animation' })).toBeChecked()
    await expect(page.getByTestId('talos-background-effect')).toHaveAttribute('data-simple-animation', 'true')

    const richMotionRequest = page.waitForRequest((request) => {
        if (!request.url().endsWith('/api/talos/settings') || request.method() !== 'PATCH') {
            return false
        }

        const body = request.postDataJSON() as Record<string, unknown>
        const preferences = body.preferences as Record<string, unknown> | undefined

        return preferences?.theme_simple_animation === false
    })
    await page.getByRole('switch', { name: 'Use simple animation' }).click()
    await richMotionRequest

    await expect(page.getByText('Rich animation raises frame rate, DPR and effect complexity.')).toBeVisible()
    await expect(page.getByTestId('talos-background-effect')).toHaveAttribute('data-simple-animation', 'false')
    await expect(page.getByTestId('talos-background-effect')).toHaveAttribute('data-performance-dpr-cap', '1.5')
})

test('theme switches disable motion separately from the procedural background', async ({ page }) => {
    test.setTimeout(90_000)

    await openWorkspace(page)
    await page.evaluate(async () => {
        await fetch('/api/talos/settings', {
            method: 'PATCH',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                preferences: {
                    theme: 'terminal',
                    reduced_motion: false,
                    theme_motion: 'cinematic',
                    theme_motion_disabled: false,
                    theme_background_disabled: false,
                    theme_customization: {
                        effect: 'trace-rain',
                    },
                },
            }),
        })
    })
    await page.reload({ waitUntil: 'domcontentloaded' })
    await waitForWorkspaceReady(page)

    await expect(page.locator('.talos-shell')).toHaveAttribute('data-background-effect', 'trace-rain')
    await expect(page.getByTestId('talos-procedural-canvas')).toHaveCount(1)
    await expectProceduralCanvasFrameChanges(page)

    await page.getByRole('button', { name: 'Theme', exact: true }).click()
    await page.getByRole('tab', { name: 'Motion' }).click()
    await expect(page.getByRole('switch', { name: 'Disable motion' })).toBeVisible()
    await expect(page.getByRole('switch', { name: 'Disable procedural background' })).toBeVisible()

    const motionDisabledRequest = page.waitForRequest((request) => {
        if (!request.url().endsWith('/api/talos/settings') || request.method() !== 'PATCH') {
            return false
        }

        const body = request.postDataJSON() as Record<string, unknown>
        const preferences = body.preferences as Record<string, unknown> | undefined

        return preferences?.theme_motion_disabled === true
            && preferences?.theme_background_disabled === false
    })
    await page.getByRole('switch', { name: 'Disable motion' }).click()
    await motionDisabledRequest
    await expect(page.locator('.talos-shell')).toHaveAttribute('data-background-effect', 'trace-rain')
    await expect(page.locator('.talos-shell')).toHaveAttribute('data-ui-motion-disabled', 'false')
    await expect.poll(async () => page.locator('.talos-shell').evaluate((element) => (
        window.getComputedStyle(element).getPropertyValue('--talos-motion-open-duration').trim()
    ))).not.toBe('0ms')
    await expect(page.getByTestId('talos-background-effect')).toHaveAttribute('data-effect', 'trace-rain')
    await expect(page.getByTestId('talos-background-effect')).toHaveAttribute('data-motion-disabled', 'true')
    await expect(page.getByTestId('talos-procedural-canvas')).toHaveCount(1)
    await expectProceduralCanvasFrameStaysStill(page)

    const backgroundDisabledRequest = page.waitForRequest((request) => {
        if (!request.url().endsWith('/api/talos/settings') || request.method() !== 'PATCH') {
            return false
        }

        const body = request.postDataJSON() as Record<string, unknown>
        const preferences = body.preferences as Record<string, unknown> | undefined

        return preferences?.theme_background_disabled === true
    })
    await page.getByRole('switch', { name: 'Disable procedural background' }).click()
    await backgroundDisabledRequest
    await expect(page.locator('.talos-shell')).toHaveAttribute('data-background-effect', 'none')
    await expect(page.getByTestId('talos-background-effect')).toHaveAttribute('data-effect', 'none')
    await expect(page.getByTestId('talos-procedural-canvas')).toHaveCount(0)

    const backgroundEnabledRequest = page.waitForRequest((request) => {
        if (!request.url().endsWith('/api/talos/settings') || request.method() !== 'PATCH') {
            return false
        }

        const body = request.postDataJSON() as Record<string, unknown>
        const preferences = body.preferences as Record<string, unknown> | undefined

        return preferences?.theme_background_disabled === false
            && preferences?.theme_motion_disabled === true
    })
    await page.getByRole('switch', { name: 'Disable procedural background' }).click()
    await backgroundEnabledRequest
    await expect(page.locator('.talos-shell')).toHaveAttribute('data-background-effect', 'trace-rain')
    await expect(page.getByTestId('talos-procedural-canvas')).toHaveCount(1)
    await expectProceduralCanvasFrameStaysStill(page)

    const motionEnabledRequest = page.waitForRequest((request) => {
        if (!request.url().endsWith('/api/talos/settings') || request.method() !== 'PATCH') {
            return false
        }

        const body = request.postDataJSON() as Record<string, unknown>
        const preferences = body.preferences as Record<string, unknown> | undefined

        return preferences?.theme_motion_disabled === false
            && preferences?.theme_background_disabled === false
    })
    await page.getByRole('switch', { name: 'Disable motion' }).click()
    await motionEnabledRequest
    await expect(page.locator('.talos-shell')).toHaveAttribute('data-background-effect', 'trace-rain')
    await expect(page.locator('.talos-shell')).toHaveAttribute('data-ui-motion-disabled', 'false')
    await expect.poll(async () => page.locator('.talos-shell').evaluate((element) => (
        window.getComputedStyle(element).getPropertyValue('--talos-motion-open-duration').trim()
    ))).not.toBe('0ms')
    await expect(page.getByTestId('talos-procedural-canvas')).toHaveCount(1)
    await expectProceduralCanvasFrameChanges(page)

    await page.evaluate(async () => {
        await fetch('/api/talos/settings', {
            method: 'PATCH',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                preferences: {
                    theme: 'terminal',
                    reduced_motion: false,
                    theme_motion: 'cinematic',
                    theme_motion_disabled: false,
                    theme_background_disabled: false,
                    ui_animation_profile: 'off',
                    theme_customization: {
                        effect: 'trace-rain',
                    },
                },
            }),
        })
    })
    await page.reload({ waitUntil: 'domcontentloaded' })
    await waitForWorkspaceReady(page)
    await expect(page.locator('.talos-shell')).toHaveAttribute('data-background-effect', 'trace-rain')
    await expect(page.locator('.talos-shell')).toHaveAttribute('data-ui-animation-profile', 'off')
    await expect(page.locator('.talos-shell')).toHaveAttribute('data-ui-motion-disabled', 'true')
    await expect.poll(async () => page.locator('.talos-shell').evaluate((element) => (
        window.getComputedStyle(element).getPropertyValue('--talos-motion-open-duration').trim()
    ))).toBe('0ms')
    await expect(page.getByTestId('talos-background-effect')).toHaveAttribute('data-motion-disabled', 'false')
    await expect(page.getByTestId('talos-procedural-canvas')).toHaveCount(1)
    await expectProceduralCanvasFrameChanges(page)
})

test('settings preset changes refresh procedural background immediately', async ({ page }) => {
    test.setTimeout(75_000)

    await openWorkspace(page)
    await page.getByRole('button', { name: 'Theme', exact: true }).click()
    await page.getByRole('tab', { name: 'Customize' }).click()
    await page.getByLabel('Background effect').selectOption('none')
    const disabledEffectRequest = page.waitForRequest((request) => {
        if (!request.url().endsWith('/api/talos/settings') || request.method() !== 'PATCH') {
            return false
        }

        const body = request.postDataJSON() as Record<string, unknown>
        const preferences = body.preferences as Record<string, unknown> | undefined
        const customization = preferences?.theme_customization as Record<string, unknown> | undefined

        return customization?.effect === 'none'
    })
    await page.getByRole('button', { name: 'Save customization' }).click()
    await disabledEffectRequest
    await expect(page.locator('.talos-shell')).toHaveAttribute('data-background-effect', 'none')
    await expect(page.getByTestId('talos-procedural-canvas')).toHaveCount(0)

    await page.getByRole('button', { name: 'Settings', exact: true }).click()
    await page.getByRole('tab', { name: 'Appearance' }).click()
    await page.getByLabel('Theme preset').selectOption('terminal')
    const settingsPresetRequest = page.waitForRequest((request) => {
        if (!request.url().endsWith('/api/talos/settings') || request.method() !== 'PATCH') {
            return false
        }

        const body = request.postDataJSON() as Record<string, unknown>
        const preferences = body.preferences as Record<string, unknown> | undefined
        const customization = preferences?.theme_customization as Record<string, unknown> | undefined

        return preferences?.theme === 'terminal'
            && customization !== undefined
            && Object.keys(customization).length === 0
    })
    await page.getByRole('button', { name: 'Save settings' }).click()
    await settingsPresetRequest

    await expect(page.locator('.talos-shell')).toHaveClass(/talos-theme-terminal/)
    await expect(page.locator('.talos-shell')).toHaveAttribute('data-background-effect', 'trace-rain')
    await expect(page.getByTestId('talos-background-effect')).toHaveAttribute('data-effect', 'trace-rain')
    await expectProceduralCanvasAboveScrim(page)
    await expectProceduralCanvasFrameChanges(page)
    await expectProceduralCanvasHasVisibleSignal(page)
    await expectProceduralBackgroundVisiblyChanges(page)
})

test('every theme preset switches to its animated procedural default', async ({ page, isMobile }, testInfo) => {
    test.setTimeout(120_000)
    test.skip(Boolean(isMobile), 'desktop covers exhaustive preset animation; mobile verifies preset refresh in the targeted settings flow.')

    await openWorkspace(page)
    await page.getByRole('button', { name: 'Theme', exact: true }).click()
    await page.getByRole('tab', { name: 'Presets' }).click()

    const presets = [
        ['AVM Forge', 'talos-theme-forge', 'dag-flow'],
        ['Paper Review', 'talos-theme-paper', 'kahn-grid'],
        ['Terminal Operator', 'talos-theme-terminal', 'trace-rain'],
        ['Aurora Research', 'talos-theme-aurora', 'signal-mesh'],
        ['Glacier Desk', 'talos-theme-glacier', 'kahn-grid'],
        ['Ember Incident', 'talos-theme-ember', 'trace-rain'],
        ['Atlas Enterprise', 'talos-theme-atlas', 'signal-mesh'],
        ['Noir Contrast', 'talos-theme-noir', 'trace-rain'],
        ['Signal Command', 'talos-theme-signal', 'signal-mesh'],
        ['Violet Lab', 'talos-theme-violet', 'dag-flow'],
        ['Claudius Review', 'talos-theme-claudius', 'kahn-grid'],
        ['Basicus Material', 'talos-theme-basicus', 'kahn-grid'],
    ] as const

    for (const [label, themeClass, effect] of presets) {
        const presetRequest = page.waitForRequest((request) => {
            if (!request.url().endsWith('/api/talos/settings') || request.method() !== 'PATCH') {
                return false
            }

            const body = request.postDataJSON() as Record<string, unknown>
            const preferences = body.preferences as Record<string, unknown> | undefined
            const customization = preferences?.theme_customization as Record<string, unknown> | undefined

            return preferences?.theme === themeClass.replace('talos-theme-', '')
                && customization !== undefined
                && Object.keys(customization).length === 0
        })

        await page.getByRole('button', { name: label }).click()
        await presetRequest
        await expect(page.locator('.talos-shell')).toHaveClass(new RegExp(themeClass))
        await expect(page.locator('.talos-shell')).toHaveAttribute('data-background-effect', effect)
        await expect(page.getByTestId('talos-background-effect')).toHaveAttribute('data-effect', effect)
        await expectProceduralCanvasAboveScrim(page)
        await expectProceduralCanvasFrameChanges(page)
        await expectProceduralCanvasHasVisibleSignal(page)
        await testInfo.attach(`theme-preset-${label.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${testInfo.project.name}.png`, {
            body: await page.screenshot({ fullPage: true, animations: 'disabled' }),
            contentType: 'image/png',
        })
    }
})

test('theme engine shows workspace policy lock as read only', async ({ page }) => {
    await openWorkspace(page)
    await page.evaluate(async () => {
        await fetch('/api/talos/settings', {
            method: 'PATCH',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                preferences: {
                    theme_policy_locked: true,
                },
            }),
        })
    })

    await page.getByRole('button', { name: 'Theme', exact: true }).click()
    await expect(page.getByText('Theme changes are locked by workspace policy.')).toBeVisible()
    await page.getByRole('tab', { name: 'Customize' }).click()
    await expect(page.getByRole('button', { name: 'Save customization' })).toBeDisabled()
    await expect(page.getByRole('button', { name: 'Save as theme' })).toBeDisabled()
})

test('desktop sidebar collapses, expands, and resizes without overflow', async ({ page, isMobile }, testInfo) => {
    test.skip(Boolean(isMobile), 'desktop sidebar behavior is covered by the desktop project')

    await openWorkspace(page)

    const rail = page.locator('[aria-label="TALOS workspace rail"]').filter({ visible: true }).first()
    const expandedBefore = await rail.boundingBox()
    expect(expandedBefore?.width).toBeGreaterThan(200)

    await page.getByRole('button', { name: 'Collapse sidebar' }).click()
    await expect(rail).toHaveAttribute('data-sidebar-state', 'collapsed')
    const collapsedMotion = await rail.evaluate((element) => {
        const style = window.getComputedStyle(element)
        const duration = style.transitionDuration.split(',')[0]?.trim() ?? '0s'
        const durationMs = duration.endsWith('ms')
            ? Number(duration.replace('ms', ''))
            : Number(duration.replace('s', '')) * 1000

        return {
            transitionProperty: style.transitionProperty,
            transitionDurationMs: durationMs,
        }
    })
    expect(collapsedMotion.transitionProperty).toContain('width')
    expect(collapsedMotion.transitionDurationMs).toBeGreaterThanOrEqual(140)
    await expect.poll(async () => {
        const collapsed = await rail.boundingBox()

        return collapsed?.width ?? 0
    }).toBeLessThan(96)

    await page.getByRole('button', { name: 'Expand sidebar' }).click()
    await expect(rail).toHaveAttribute('data-sidebar-state', 'expanded')
    await expect.poll(async () => {
        const expanded = await rail.boundingBox()

        return expanded?.width ?? 0
    }).toBeGreaterThan(180)
    const expanded = await rail.boundingBox()

    const resizeHandle = page.getByLabel('Resize sidebar')
    const handleBox = await resizeHandle.boundingBox()
    expect(handleBox).toBeTruthy()

    await page.mouse.move((handleBox?.x ?? 0) + 2, (handleBox?.y ?? 0) + 24)
    await page.mouse.down()
    await page.mouse.move((handleBox?.x ?? 0) + 44, (handleBox?.y ?? 0) + 24)
    await page.mouse.up()

    const resized = await rail.boundingBox()
    expect(resized?.width).toBeGreaterThan((expanded?.width ?? 0) + 24)
    await expectNoHorizontalOverflow(page)
    await testInfo.attach(`sidebar-resize-${testInfo.project.name}.png`, {
        body: await page.screenshot({ fullPage: true, animations: 'disabled' }),
        contentType: 'image/png',
    })
})

test('floating tool windows are independent, draggable, and the right dock is only visible when populated', async ({ page, isMobile }, testInfo) => {
    test.skip(Boolean(isMobile), 'desktop floating windows are covered by the desktop project')

    await openWorkspace(page)
    await expect(page.getByTestId('talos-right-dock')).toHaveCount(0)

    await page.getByRole('button', { name: 'Theme', exact: true }).click()
    const themeWindow = page.getByRole('region', { name: 'Theme' }).first()
    await expect(themeWindow).toBeVisible()
    await expect.poll(async () => themeWindow.getAttribute('data-window-transition')).toBe('idle')

    const before = await themeWindow.boundingBox()
    const dragHandle = page.getByLabel('Drag Theme window')
    const handleBox = await dragHandle.boundingBox()
    expect(before).toBeTruthy()
    expect(handleBox).toBeTruthy()

    await page.mouse.move((handleBox?.x ?? 0) + 24, (handleBox?.y ?? 0) + 10)
    await page.mouse.down()
    await page.mouse.move((handleBox?.x ?? 0) - 96, (handleBox?.y ?? 0) + 52)
    await page.mouse.up()

    const after = await themeWindow.boundingBox()
    expect(after?.x).toBeLessThan((before?.x ?? 0) - 40)
    expect(after?.y).toBeGreaterThan((before?.y ?? 0) + 24)

    await page.getByRole('button', { name: 'Dock Theme' }).click()
    await expect(page.getByTestId('talos-right-dock')).toBeVisible()
    await expectNoHorizontalOverflow(page)
    await testInfo.attach(`floating-window-dock-${testInfo.project.name}.png`, {
        body: await page.screenshot({ fullPage: true, animations: 'disabled' }),
        contentType: 'image/png',
    })
})

test('floating windows launch from the sidebar and animate minimize, restore, and expand', async ({ page, isMobile }, testInfo) => {
    test.skip(Boolean(isMobile), 'desktop window transition behavior is covered by the desktop project')

    await openWorkspace(page)

    const rail = page.locator('.talos-left-rail')
    const railBox = await rail.boundingBox()
    expect(railBox).toBeTruthy()

    await page.getByRole('button', { name: 'Theme', exact: true }).click()
    const themeWindow = page.locator('[data-window-id="theme"]')
    await expect(themeWindow).toBeVisible()
    await expect(themeWindow).toHaveAttribute('data-window-transition', 'opening')
    await expect(themeWindow).toHaveAttribute('data-window-origin-source', 'sidebar')

    const openingMotion = await themeWindow.evaluate((element) => {
        const style = window.getComputedStyle(element)

        return {
            animationName: style.animationName,
            originX: Number(element.getAttribute('data-window-origin-x')),
            launchDx: style.getPropertyValue('--talos-window-launch-dx').trim(),
        }
    })
    expect(openingMotion.animationName).toContain('talos-window-open-from-sidebar')
    expect(openingMotion.originX).toBeLessThan(0)
    expect(openingMotion.launchDx).toMatch(/px$/)

    await expect.poll(async () => themeWindow.getAttribute('data-window-transition')).toBe('idle')

    await page.getByRole('button', { name: 'Minimize Theme' }).click()
    await expect(themeWindow).toHaveAttribute('data-window-transition', 'minimizing')
    await expect.poll(async () => themeWindow.evaluate((element) => window.getComputedStyle(element).animationName)).toContain('talos-window-minimize-to-dock')
    await page.waitForTimeout(170)
    const midMinimizeMotion = await themeWindow.evaluate((element) => {
        const style = window.getComputedStyle(element)
        const duration = style.animationDuration.split(',')[0]?.trim() ?? '0s'
        const durationMs = duration.endsWith('ms')
            ? Number(duration.replace('ms', ''))
            : Number(duration.replace('s', '')) * 1000

        return {
            animationDurationMs: durationMs,
            opacity: Number(style.opacity),
        }
    })
    expect(midMinimizeMotion.animationDurationMs).toBeGreaterThanOrEqual(280)
    expect(midMinimizeMotion.opacity).toBeGreaterThan(0.1)
    await expect(themeWindow).toHaveCount(0)

    const restoreButton = page.getByTestId('talos-restore-window-theme')
    await expect(restoreButton).toBeVisible()
    await restoreButton.click()
    await expect(themeWindow).toBeVisible()
    await expect(themeWindow).toHaveAttribute('data-window-transition', 'restoring')
    await expect(themeWindow).toHaveAttribute('data-window-origin-source', 'dock')
    await expect.poll(async () => themeWindow.evaluate((element) => window.getComputedStyle(element).animationName)).toContain('talos-window-restore-from-dock')
    await expect.poll(async () => themeWindow.getAttribute('data-window-transition')).toBe('idle')

    await page.getByRole('button', { name: 'Theme', exact: true }).click()
    await expect(themeWindow).toHaveAttribute('data-window-transition', 'opening')
    await expect(themeWindow).toHaveAttribute('data-window-origin-source', 'sidebar')
    await expect.poll(async () => themeWindow.getAttribute('data-window-transition')).toBe('idle')

    await page.getByRole('button', { name: 'Minimize Theme' }).click()
    await expect(themeWindow).toHaveAttribute('data-window-transition', 'minimizing')
    await expect.poll(async () => themeWindow.evaluate((element) => window.getComputedStyle(element).animationName)).toContain('talos-window-minimize-to-dock')
    await page.waitForTimeout(170)
    const sidebarRefocusMinimizeMotion = await themeWindow.evaluate((element) => {
        const style = window.getComputedStyle(element)

        return {
            opacity: Number(style.opacity),
            animationName: style.animationName,
        }
    })
    expect(sidebarRefocusMinimizeMotion.animationName).toContain('talos-window-minimize-to-dock')
    expect(sidebarRefocusMinimizeMotion.opacity).toBeGreaterThan(0.1)
    await expect(themeWindow).toHaveCount(0)
    await restoreButton.click()
    await expect(themeWindow).toBeVisible()
    await expect.poll(async () => themeWindow.getAttribute('data-window-transition')).toBe('idle')

    await page.getByRole('button', { name: 'Fullscreen Theme' }).click()
    await expect(themeWindow).toHaveAttribute('data-window-transition', 'expanding')
    await expect.poll(async () => themeWindow.evaluate((element) => window.getComputedStyle(element).animationName)).toContain('talos-window-expand')
    await expect.poll(async () => themeWindow.getAttribute('data-window-transition')).toBe('idle')

    await expectNoHorizontalOverflow(page)
    await testInfo.attach(`floating-window-transitions-${testInfo.project.name}.png`, {
        body: await page.screenshot({ fullPage: true, animations: 'disabled' }),
        contentType: 'image/png',
    })
})

test('floating tool windows are resizable and can reset their saved size', async ({ page, isMobile }, testInfo) => {
    test.skip(Boolean(isMobile), 'desktop window resizing is covered by the desktop project')

    await openWorkspace(page)
    await page.getByRole('button', { name: 'Theme', exact: true }).click()

    const themeWindow = page.getByRole('region', { name: 'Theme' }).first()
    await expect(themeWindow).toBeVisible()
    await expect.poll(async () => themeWindow.getAttribute('data-window-transition')).toBe('idle')

    const before = await themeWindow.boundingBox()
    const resizeHandle = page.getByLabel('Resize Theme window bottom right')
    const handleBox = await resizeHandle.boundingBox()
    expect(before).toBeTruthy()
    expect(handleBox).toBeTruthy()

    await page.mouse.move((handleBox?.x ?? 0) + 8, (handleBox?.y ?? 0) + 8)
    await page.mouse.down()
    await page.mouse.move((handleBox?.x ?? 0) + 168, (handleBox?.y ?? 0) + 108)
    await page.mouse.up()

    const resized = await themeWindow.boundingBox()
    expect(resized?.width).toBeGreaterThan((before?.width ?? 0) + 100)
    expect(resized?.height).toBeGreaterThan((before?.height ?? 0) + 70)
    await expect(themeWindow).toHaveAttribute('data-window-width', String(Math.round(resized?.width ?? 0)))
    await expect(themeWindow).toHaveAttribute('data-window-height', String(Math.round(resized?.height ?? 0)))
    const storedLayout = await page.evaluate(() => JSON.parse(window.localStorage.getItem('talos.windowLayout.v1') ?? '{}'))
    expect(storedLayout?.sizes?.theme?.width).toBe(Math.round(resized?.width ?? 0))
    expect(storedLayout?.sizes?.theme?.height).toBe(Math.round(resized?.height ?? 0))
    await expectNoComposerOverlap(page)

    await page.getByRole('button', { name: 'Reset Theme size' }).click()
    const reset = await themeWindow.boundingBox()
    expect(reset?.width).toBeLessThan((resized?.width ?? 0) - 80)
    await expectNoHorizontalOverflow(page)

    await testInfo.attach(`floating-window-resize-${testInfo.project.name}.png`, {
        body: await page.screenshot({ fullPage: true, animations: 'disabled' }),
        contentType: 'image/png',
    })
})

test('slice one appearance shortcuts and fullscreen windows stay connected to workspace state', async ({ page, isMobile }, testInfo) => {
    test.skip(Boolean(isMobile), 'desktop fullscreen and keyboard shortcut behavior is covered by the desktop project')

    await openWorkspace(page)

    await page.getByRole('button', { name: 'Settings', exact: true }).click()
    await expect(page.getByText('Settings Center', { exact: true })).toBeVisible()

    await page.getByRole('tab', { name: 'Appearance' }).click()
    await page.getByRole('tab', { name: 'Visibility' }).click()
    const appearancePatchRequest = page.waitForRequest((request) => {
        if (!request.url().endsWith('/api/talos/settings') || request.method() !== 'PATCH') {
            return false
        }

        const body = request.postDataJSON() as Record<string, unknown>
        const preferences = body.preferences as Record<string, unknown> | undefined
        const appearance = preferences?.appearance_visibility as Record<string, Record<string, unknown>> | undefined

        return appearance?.chat_area?.welcome_message === false
            && appearance?.chat_area?.full_width_chat === true
    })
    await page.getByRole('switch', { name: 'Welcome message' }).click()
    await page.getByRole('switch', { name: 'Full-width chat' }).click()
    await page.getByRole('button', { name: 'Save settings' }).click()
    await appearancePatchRequest
    await expect(page.locator('[aria-label="TALOS chat thread"] h2')).toHaveCount(0)

    await page.getByRole('tab', { name: 'Shortcuts' }).click()
    const compareShortcutRow = page.getByTestId('talos-shortcut-row-open_compare')
    await compareShortcutRow.getByRole('button', { name: /^Set$/ }).click()
    await page.keyboard.press('Control+Alt+M')
    await expect(compareShortcutRow.getByText('Ctrl+Alt+M')).toBeVisible()

    const cookbookShortcutRow = page.getByTestId('talos-shortcut-row-open_cookbook')
    await cookbookShortcutRow.getByRole('button', { name: /^Set$/ }).click()
    await page.keyboard.press('Control+Alt+M')
    await expect(page.getByText('Ctrl+Alt+M is already assigned to Open Compare.')).toBeVisible()
    await page.keyboard.press('Escape')

    const shortcutPatchRequest = page.waitForRequest((request) => {
        if (!request.url().endsWith('/api/talos/settings') || request.method() !== 'PATCH') {
            return false
        }

        const body = request.postDataJSON() as Record<string, unknown>
        const preferences = body.preferences as Record<string, unknown> | undefined
        const shortcuts = preferences?.keyboard_shortcuts as Record<string, unknown> | undefined

        return shortcuts?.open_compare === 'Ctrl+Alt+M'
    })
    await page.getByRole('button', { name: 'Save settings' }).click()
    await shortcutPatchRequest

    await page.locator('body').click({ position: { x: 24, y: 24 } })
    await page.keyboard.press('Control+Alt+M')
    await expect(page.getByRole('heading', { name: 'Compare', exact: true })).toBeVisible()

    await page.getByRole('button', { name: 'Theme', exact: true }).click()
    const themeWindow = page.getByRole('region', { name: 'Theme' }).first()
    await expect(themeWindow).toBeVisible()
    await page.getByRole('button', { name: 'Fullscreen Theme' }).click()
    await expect(themeWindow).toHaveAttribute('data-window-fullscreen', 'true')
    const fullscreenBox = await themeWindow.boundingBox()
    expect(fullscreenBox?.width).toBeGreaterThan(900)
    expect(fullscreenBox?.height).toBeGreaterThan(620)

    await page.getByRole('button', { name: 'Minimize Theme' }).click()
    await expect(page.getByTestId('talos-minimized-window-dock')).toBeVisible()
    await page.getByTestId('talos-restore-window-theme').click()
    await expect(themeWindow).toHaveAttribute('data-window-fullscreen', 'true')

    await testInfo.attach(`slice-one-workspace-controls-${testInfo.project.name}.png`, {
        body: await page.screenshot({ fullPage: true, animations: 'disabled' }),
        contentType: 'image/png',
    })
})

test('prompt enhancer previews the server-side prompt template without sending the chat turn', async ({ page }, testInfo) => {
    await openWorkspace(page)

    await page.getByLabel('Message TALOS').fill('Draft a recovery plan for failed payment jobs.')
    await page.getByRole('button', { name: 'Improve prompt' }).click()

    await expect(page.getByText('Prompt enhancement preview', { exact: true })).toBeVisible()
    await expect(page.getByText('Server-side prompt template through /api/talos/prompts/enhance.')).toBeVisible()
    await expect(page.getByText('Objective:')).toBeVisible()
    await expect(page.getByLabel('Message TALOS')).toHaveValue('Draft a recovery plan for failed payment jobs.')

    await page.getByRole('button', { name: 'Replace prompt' }).click()

    await expect(page.getByLabel('Message TALOS')).toHaveValue(/Objective:\n\nDraft a recovery plan/)
    await expect(page.getByText('E2E response from AVM with replayable evidence.')).toBeHidden()

    await testInfo.attach(`prompt-enhancer-${testInfo.project.name}.png`, {
        body: await page.screenshot({ fullPage: true, animations: 'disabled' }),
        contentType: 'image/png',
    })
})

test('temporary chat mode creates an explicit temporary session before sending', async ({ page }, testInfo) => {
    await openWorkspace(page)

    await page.getByRole('button', { name: 'Temporary chat' }).click()
    await expect(page.getByText('Temporary mode')).toBeVisible()

    await page.getByLabel('Message TALOS').fill('Run this as a disposable investigation.')
    await page.getByRole('button', { name: 'Send' }).click()

    await expect(page.getByText('Temporary session')).toBeVisible()
    await expect(page.getByText('E2E response from AVM with replayable evidence.')).toBeVisible()

    await testInfo.attach(`temporary-session-${testInfo.project.name}.png`, {
        body: await page.screenshot({ fullPage: true, animations: 'disabled' }),
        contentType: 'image/png',
    })
})

test('temporary chat mode starts a temporary session instead of reusing an active persistent session', async ({ page }) => {
    await page.unroute('**/api/**')
    await installTalosApiMocks(page, {
        initialSessions: [
            {
                id: 'session-persistent',
                title: 'Persistent history',
                persistence_mode: 'persistent',
            },
        ],
    })

    const persistentMessagesRequest = page.waitForRequest((request) => (
        request.url().includes('/api/talos/sessions/session-persistent/messages') && request.method() === 'GET'
    ))
    await page.goto('/', { waitUntil: 'domcontentloaded' })
    await waitForWorkspaceReady(page)
    await persistentMessagesRequest

    await page.getByRole('button', { name: 'Temporary chat' }).click()
    const temporarySessionRequest = page.waitForRequest((request) => {
        if (!request.url().endsWith('/api/talos/sessions') || request.method() !== 'POST') {
            return false
        }

        return request.postDataJSON().persistence_mode === 'temporary'
    })

    await page.getByLabel('Message TALOS').fill('Do not append this to persistent history.')
    await page.getByRole('button', { name: 'Send' }).click()
    await temporarySessionRequest

    await expect(page.getByText('Temporary session')).toBeVisible()
    await expect(page.getByText('E2E response from AVM with replayable evidence.')).toBeVisible()
})

test('dashboard exports a persisted benchmark report through a real endpoint', async ({ page }) => {
    await openWorkspace(page)
    await selectDashboardTab(page, 'Benchmarks')

    await expect(page.getByText('E2E benchmark export')).toBeVisible()
    await expect(page.getByText('Fairness contract')).toBeVisible()
    await expect(page.getByText('Proof Builder', { exact: true })).toBeVisible()
    await expect(page.getByText('Persisted benchmark group', { exact: true })).toBeVisible()
    await expect(page.getByText('2 persisted lanes', { exact: true })).toBeVisible()
    await expect(page.getByText('Export ready', { exact: true })).toBeVisible()

    const downloadPromise = page.waitForEvent('download')
    await page.getByRole('button', { name: 'Export report' }).click()
    const download = await downloadPromise

    expect(download.suggestedFilename()).toBe('talos-benchmark-benchmark-group-e2e.json')
    const path = await download.path()
    expect(path).toBeTruthy()
    const report = JSON.parse(readFileSync(path as string, 'utf8'))
    expect(report.report_type).toBe('talos_benchmark_export')
    expect(report.export_status).toBe('complete')
    expect(report.fairness_contract.same_prompt).toBe('prompthash-e2e')
    expect(report.results).toHaveLength(2)
    await expect(page.getByText('Benchmark report exported.')).toBeVisible()
})

test('dashboard ingests a user file and creates a grounded context set', async ({ page }) => {
    await openWorkspace(page)
    await selectDashboardTab(page, 'Knowledge')

    await page.locator('input[type="file"]').setInputFiles({
        name: 'workflow.md',
        mimeType: 'text/markdown',
        buffer: Buffer.from('Approve deployment only after replay evidence is attached.'),
    })

    await expect(page.getByText('workflow.md uploaded through /api/files/ingest.')).toBeVisible()
    await expect(page.getByText('workflow.md').first()).toBeVisible()

    await page.getByRole('button', { name: /workflow.md/ }).click()
    await page.getByPlaceholder('Incident response context').fill('E2E grounded context')
    await page.getByRole('button', { name: 'Create context set' }).click()

    await expect(page.getByText('Context set "E2E grounded context" created with 1 sources.')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Choose grounding context' })).toContainText('E2E grounded context')
})

test('dashboard opens a real file benchmark scenario from a fresh upload', async ({ page }) => {
    await openWorkspace(page)
    await selectDashboardTab(page, 'Knowledge')

    await page.locator('input[type="file"]').setInputFiles({
        name: 'workflow.md',
        mimeType: 'text/markdown',
        buffer: Buffer.from('Approve deployment only after replay evidence is attached.'),
    })

    await expect(page.getByText('workflow.md uploaded through /api/files/ingest.')).toBeVisible()
    await page.getByRole('button', { name: 'Benchmark this file' }).click()

    await expect(page.getByRole('heading', { name: 'AVM ON/OFF evidence' })).toBeVisible()
    await expect(page.getByText('Proof Builder', { exact: true })).toBeVisible()
    await expect(page.getByText('File handoff', { exact: true })).toBeVisible()
    await expect(page.getByLabel('Benchmark scenario path')).toHaveValue('benchmark-scenarios/e2e/workflow-file.json')

    const fileBenchmarkRequest = page.waitForRequest((request) => {
        if (!request.url().endsWith('/api/benchmarks/compare') || request.method() !== 'POST') {
            return false
        }

        const body = request.postDataJSON() as Record<string, unknown>

        return body.scenario_path === 'benchmark-scenarios/e2e/workflow-file.json'
            && body.runs === 1
    })
    await page.getByRole('button', { name: 'Open command palette' }).click()
    await page.getByLabel('Search TALOS commands').fill('run avm compare')
    await expect(page.getByRole('option', { name: /Run AVM compare/ })).toHaveAttribute('aria-disabled', 'false')
    await page.getByRole('option', { name: /Run AVM compare/ }).click()
    await fileBenchmarkRequest
    await expect(page.getByText('Benchmark comparison completed.')).toBeVisible()
    await expect(page.getByText('E2E generated compare')).toBeVisible()
})

test('file context grounds a chat turn and exposes source provenance', async ({ page }) => {
    await openWorkspace(page)
    await selectDashboardTab(page, 'Knowledge')

    await page.locator('input[type="file"]').setInputFiles({
        name: 'workflow.md',
        mimeType: 'text/markdown',
        buffer: Buffer.from('Approve deployment only after replay evidence is attached.'),
    })
    await page.getByRole('button', { name: /workflow.md/ }).click()
    await page.getByPlaceholder('Incident response context').fill('E2E grounded context')
    await page.getByRole('button', { name: 'Create context set' }).click()
    await expect(page.getByText('Context set "E2E grounded context" created with 1 sources.')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Choose grounding context' })).toContainText('E2E grounded context')

    await page.getByLabel('Message TALOS').fill('Use the uploaded file and cite the source.')
    await page.getByRole('button', { name: 'Send' }).click()

    await expect(page.getByText('E2E response from AVM with replayable evidence and grounded file context.')).toBeVisible()
    const chatThread = page.getByLabel('TALOS chat thread')
    await expect(chatThread.getByText('Source provenance')).toBeVisible()
    await expect(chatThread.getByText('workflow.md').first()).toBeVisible()
    await expect(chatThread.getByText('Workflow file says approve the deployment checklist.')).toBeVisible()
})

test('context vault can import a selected google drive file through the real import endpoint', async ({ page }) => {
    await openWorkspace(page)
    await selectDashboardTab(page, 'Knowledge')

    await page.getByRole('button', { name: /Import from Drive/ }).click()
    await page.getByRole('button', { name: /Import Drive Notes.md/ }).click()

    await expect(page.getByText('Imported Drive Notes.md into Context Vault.')).toBeVisible()
})

test('deep research v3 queues source-backed draft reports with claim graph evidence', async ({ page }, testInfo) => {
    await openWorkspace(page)
    await selectDashboardTab(page, 'Deep Research')

    await expect(page.getByRole('heading', { name: 'Deep Research V3' })).toBeVisible()
    await expect(page.getByLabel('Research query')).toBeVisible()
    await page.getByLabel('Report title').fill('AVM evidence review')
    await page.getByLabel('Research query').fill('Map AVM evidence to every product claim before publishing.')
    await page.getByLabel('Primary source URL').fill('https://example.com/avm-evidence')
    await page.getByLabel('Source title').fill('AVM evidence source')
    await page.getByLabel('Initial claim').fill('AVM research claims stay pending until fetched evidence exists.')

    await page.getByRole('button', { name: 'Research settings' }).click()
    await page.getByLabel('Rounds selector').selectOption('2')
    await page.getByLabel('Format selector').selectOption('briefing')
    await page.getByLabel('Search engine selector').selectOption('searxng')
    await page.getByLabel('Endpoint selector').selectOption('local')
    await page.getByLabel('Model selector').selectOption('profile-e2e')

    const createRequest = page.waitForRequest((request) => {
        if (!request.url().endsWith('/api/talos/research-reports') || request.method() !== 'POST') {
            return false
        }

        const body = request.postDataJSON() as Record<string, unknown>
        const metadata = body.metadata as Record<string, unknown>
        const sources = body.sources as Array<Record<string, unknown>>
        const claims = body.claims as Array<Record<string, unknown>>

        return metadata.queue_status === 'queued'
            && metadata.rounds === 2
            && metadata.format === 'briefing'
            && metadata.search_engine === 'searxng'
            && metadata.endpoint === 'local'
            && metadata.model_profile_id === 'profile-e2e'
            && sources[0]?.status === 'planned'
            && claims[0]?.status === 'pending'
    })

    await page.getByRole('button', { name: 'Queue report' }).click()
    await createRequest

    await expect(page.getByText('Research queue')).toBeVisible()
    const queuedReport = page.getByRole('button', { name: /AVM evidence review/ })
    await expect(queuedReport.getByText('queue_status')).toBeVisible()
    await expect(queuedReport.getByText('queued', { exact: true })).toBeVisible()
    await expect(page.getByText('Claim-source graph')).toBeVisible()
    await expect(page.getByText('src-1 -> claim #1')).toBeVisible()
    await expect(page.getByText('planned').first()).toBeVisible()
    await expect(page.getByText('pending').first()).toBeVisible()
    await expect(page.getByText('talos://research-reports/')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Chat with report' })).toBeDisabled()
    await expect(page.getByText('Report chat context export is not available yet.')).toBeVisible()

    await expectNoHorizontalOverflow(page)
    await testInfo.attach(`deep-research-v3-${testInfo.project.name}.png`, {
        body: await page.screenshot({ fullPage: true, animations: 'disabled' }),
        contentType: 'image/png',
    })
})

test('calendar v3 renders drafts as events and parses quick add safely', async ({ page }, testInfo) => {
    await openWorkspace(page)
    await selectDashboardTab(page, 'Calendar')

    await expect(page.getByRole('heading', { name: 'Calendar V3' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Previous month' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Today' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Next month' })).toBeVisible()
    await expect(page.getByLabel('Calendar view mode')).toContainText('Week')
    await expect(page.getByLabel('Calendar view mode')).toContainText('Month')
    await expect(page.getByLabel('Calendar view mode')).toContainText('Year')
    await expect(page.getByLabel('Calendar view mode')).toContainText('Agenda')
    await expect(page.getByText('Month grid')).toBeVisible()

    await page.getByLabel('Quick add event').fill('just vibes')
    await page.getByRole('button', { name: 'Quick add' }).click()
    await expect(page.getByText('Could not parse quick add. Try "crew muster 10am daily", "meeting tomorrow 15:00", or "review Friday 9-10".')).toBeVisible()
    await expect(page.getByLabel('Quick add event')).toHaveValue('just vibes')

    const createRequest = page.waitForRequest((request) => {
        if (!request.url().endsWith('/api/talos/calendar-drafts') || request.method() !== 'POST') {
            return false
        }

        const body = request.postDataJSON() as Record<string, unknown>
        const metadata = body.metadata as Record<string, unknown>

        return body.title === 'crew muster'
            && body.timezone === 'Europe/Rome'
            && metadata.quick_add_raw === 'crew muster 10am daily'
            && metadata.recurrence === 'daily'
    })

    await page.getByLabel('Quick add event').fill('crew muster 10am daily')
    await page.getByRole('button', { name: 'Quick add' }).click()
    await createRequest

    await expect(page.getByText('crew muster')).toBeVisible()
    await expect(page.getByText('confirmation_required: true')).toBeVisible()
    await page.getByLabel('Search all events').fill('crew')
    await expect(page.getByText('crew muster')).toBeVisible()

    const confirmRequest = page.waitForRequest((request) => request.url().includes('/api/talos/calendar-drafts/calendar-draft-e2e-1/confirm') && request.method() === 'POST')
    await page.getByRole('button', { name: 'Confirm draft' }).click()
    await confirmRequest
    await expect(page.getByText('confirmed')).toBeVisible()
    await expect(page.getByText('confirmation_required: false')).toBeVisible()

    await expectNoHorizontalOverflow(page)
    await testInfo.attach(`calendar-v3-${testInfo.project.name}.png`, {
        body: await page.screenshot({ fullPage: true, animations: 'disabled' }),
        contentType: 'image/png',
    })
})

test('calendar shows google sync state and keeps publish gated', async ({ page }) => {
    await openWorkspace(page)
    await selectDashboardTab(page, 'Productivity')
    await page.getByRole('button', { name: /Calendar/ }).click()

    await expect(page.getByText('Google Calendar')).toBeVisible()
    await expect(page.getByText('External writes require confirmation.')).toBeVisible()
})

test('dashboard replays a persisted failed run and exposes fault evidence', async ({ page }) => {
    await openWorkspace(page)
    await selectDashboardTab(page, 'Runtime')

    await expect(page.getByRole('button', { name: /run-e2e verified execution/ })).toBeVisible()
    await expect(page.getByRole('button', { name: /#2 node_failed/ })).toBeVisible()
    await expect(page.getByLabel('Run timeline').getByText('3 events', { exact: true })).toBeVisible()
    await page.getByRole('tab', { name: 'Trace replay' }).click()
    await expect(page.getByText('2 node states')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Play', exact: true })).toBeVisible()
    await expect(page.getByRole('button', { name: /#2 node_failed HTTP 503 failure fault/ }).getByText('fault', { exact: true })).toBeVisible()
})

test('dashboard replay filters to fault steps through a real control', async ({ page }) => {
    await openWorkspace(page)
    await selectDashboardTab(page, 'Runtime')
    await page.getByRole('tab', { name: 'Trace replay', exact: true }).click()

    await expect(page.getByRole('button', { name: /#1 node_started Node started state/ })).toBeVisible()
    await expect(page.getByRole('button', { name: /#2 node_failed HTTP 503 failure fault/ })).toBeVisible()

    await page.getByLabel('Replay step filter').selectOption('fault')

    await expect(page.getByRole('button', { name: /#1 node_started Node started state/ })).toBeHidden()
    await expect(page.getByRole('button', { name: /#2 node_failed HTTP 503 failure fault/ })).toBeVisible()
    await expect(page.getByRole('button', { name: /#3 node_blocked Blocked by node-e2e fault/ })).toBeVisible()
    await expect(page.getByText('1/2')).toBeVisible()

    await page.keyboard.press('Tab')
    await expect(page.locator(':focus')).toBeVisible()
})

test('runtime cockpit organizes run evidence into summary tabs and recovery preview', async ({ page }, testInfo) => {
    await openWorkspace(page)
    await selectDashboardTab(page, 'Runtime')

    await expect(page.getByRole('heading', { name: 'Runtime cockpit' })).toBeVisible()
    const runSummary = page.getByLabel('Run summary')
    await expect(runSummary.getByText('Run summary')).toBeVisible()
    await expect(runSummary.getByText('Model', { exact: true })).toBeVisible()
    await expect(runSummary.getByText('profile-e2e')).toBeVisible()
    await expect(runSummary.getByText('AVM mode')).toBeVisible()
    await expect(runSummary.getByText('verified execution')).toBeVisible()
    await expect(runSummary.getByText('Replayable')).toBeVisible()
    await expect(runSummary.getByText('3 events')).toBeVisible()
    await expect(runSummary.getByText('2 nodes')).toBeVisible()

    await page.getByRole('tab', { name: 'Trace replay', exact: true }).click()
    await page.getByLabel('Replay step filter').selectOption('fault')
    await expect(page.getByRole('button', { name: /#1 node_started Node started state/ })).toBeHidden()
    await expect(page.getByRole('button', { name: /#2 node_failed HTTP 503 failure fault/ })).toBeVisible()
    await expect(page.getByRole('button', { name: /#3 node_blocked Blocked by node-e2e fault/ })).toBeVisible()

    await page.getByRole('tab', { name: 'DAG', exact: true }).click()
    await expect(page.getByText('Blocked by dependency')).toBeVisible()
    await expect(page.getByText('Parent node node-e2e failed before this branch could run.')).toBeVisible()

    await page.getByRole('tab', { name: 'Timeline', exact: true }).click()
    await page.getByLabel('Runtime event filter').selectOption('fault')
    await expect(page.getByRole('button', { name: /#1 node_started/ })).toBeHidden()
    await expect(page.getByRole('button', { name: /#2 node_failed/ })).toBeVisible()
    await expect(page.getByRole('button', { name: /#3 node_blocked/ })).toBeVisible()

    await page.getByRole('button', { name: /#2 node_failed/ }).click()
    await expect(page.getByText('Validation faults')).toBeVisible()
    await expect(page.getByLabel('Validation faults evidence').getByText('UPSTREAM_UNAVAILABLE')).toBeVisible()
    await expect(page.getByText('Policy decisions')).toBeVisible()
    await expect(page.getByText('Worker output')).toBeVisible()
    await expect(page.getByLabel('Worker output evidence').getByText('HTTP 503')).toBeVisible()

    await page.getByRole('tab', { name: 'Recovery', exact: true }).click()
    await expect(page.getByText('Recovery preview')).toBeVisible()
    await expect(page.getByText('Target node node-e2e')).toBeVisible()
    await page.getByLabel('Recovery reason').fill('Retry after upstream returned healthy.')
    await page.getByRole('button', { name: 'Submit recovery' }).click()
    await expect(page.getByText('Audit: recovery.requested for node-e2e')).toBeVisible()

    await page.getByRole('tab', { name: 'Artifacts', exact: true }).click()
    await expect(page.getByText('Run evidence report')).toBeVisible()
    await expect(page.getByText('local://reports/run-e2e.json')).toBeVisible()

    await page.getByRole('button', { name: 'Open audit log' }).click()
    await expect(page.getByTestId('talos-admin-section-audit')).toBeVisible()

    await expectNoHorizontalOverflow(page)
    await testInfo.attach(`runtime-cockpit-v3-${testInfo.project.name}.png`, {
        body: await page.screenshot({ fullPage: true, animations: 'disabled' }),
        contentType: 'image/png',
    })
})

test('dashboard runs a fresh benchmark comparison and inspects created lanes', async ({ page }) => {
    await openWorkspace(page)
    await selectDashboardTab(page, 'Benchmarks')

    await page.getByLabel('Benchmark scenario path').fill('benchmark-scenarios/e2e/generated.json')
    await page.getByLabel('Benchmark runs').fill('1')
    await page.getByRole('button', { name: 'Compare', exact: true }).last().click()

    await expect(page.getByText('Benchmark comparison completed.')).toBeVisible()
    await expect(page.getByText('E2E generated compare')).toBeVisible()
    await expect(page.getByText('AVM ON generated')).toBeVisible()
    await expect(page.getByText('AVM OFF generated')).toBeVisible()
    await expect(page.getByText('Generated AVM lane preserved node evidence.')).toBeVisible()
    await expect(page.getByText('Direct lane completed without replayable node evidence.')).toBeVisible()
})

test('mobile chat and dashboard avoid layout overflow', async ({ page, isMobile }) => {
    test.skip(!isMobile, 'mobile overflow is covered by the mobile project')

    await openWorkspace(page)
    await expect(page.getByLabel('Message TALOS')).toBeVisible()
    await expectNoHorizontalOverflow(page)

    await openWorkspace(page)
    await expectUnifiedWorkspaceChrome(page)
    await expectNoHorizontalOverflow(page)
})

test('chat exports session evidence pack with context and benchmark readiness', async ({ page }, testInfo) => {
    await openWorkspace(page)

    await page.getByLabel('Message TALOS').fill('Create a replayable export pack.')
    await page.getByRole('button', { name: 'Send', exact: true }).click()
    await expect(page.getByText('E2E response from AVM with replayable evidence.')).toBeVisible()

    await page.getByRole('button', { name: 'Export session' }).click()
    const exportDialog = page.getByRole('dialog', { name: 'Export session evidence' })
    await expect(exportDialog).toBeVisible()
    await expect(exportDialog.getByText('JSON evidence pack', { exact: true })).toBeVisible()
    await expect(exportDialog.getByText('Markdown transcript', { exact: true })).toBeVisible()
    await expect(exportDialog.getByText('Context manifest', { exact: true })).toBeVisible()
    await expect(exportDialog.getByText('Benchmark scenario', { exact: true })).toBeVisible()

    const jsonRequest = page.waitForRequest((request) => request.url().includes('/api/talos/sessions/session-e2e/export?format=json') && request.method() === 'GET')
    await page.getByRole('button', { name: 'Export JSON evidence pack' }).click()
    await jsonRequest
    await expect(exportDialog.getByText('talos_session_export', { exact: true })).toBeVisible()
    await expect(exportDialog.getByText('workflow.md').first()).toBeVisible()
    await expect(exportDialog.getByText('Benchmark ready', { exact: true })).toBeVisible()
    await expect(page.getByText('sk-live-secret')).toBeHidden()
    await expect(page.getByText('private/storage/path')).toBeHidden()

    const markdownRequest = page.waitForRequest((request) => request.url().includes('/api/talos/sessions/session-e2e/export?format=markdown') && request.method() === 'GET')
    await page.getByRole('button', { name: 'Export Markdown transcript' }).click()
    await markdownRequest
    await expect(exportDialog.getByText('talos_session_markdown_export', { exact: true })).toBeVisible()
    await expect(exportDialog.getByText('# TALOS Session Export')).toBeVisible()

    await expectNoHorizontalOverflow(page)
    await testInfo.attach(`session-export-${testInfo.project.name}.png`, {
        body: await page.screenshot({ fullPage: true, animations: 'disabled' }),
        contentType: 'image/png',
    })
})

test('mobile tool windows stay above the composer', async ({ page, isMobile }) => {
    test.skip(!isMobile, 'mobile window overlap is covered by the mobile project')

    await openWorkspace(page)
    await page.getByRole('button', { name: 'Theme', exact: true }).click()
    await expect(page.getByText('Theme Engine', { exact: true })).toBeVisible()
    await page.getByLabel('Message TALOS').fill('Line one\nLine two\nLine three\nLine four\nLine five')

    await expectNoComposerOverlap(page)
    await expectNoHorizontalOverflow(page)
})
