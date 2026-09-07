import { expect, test, type Page } from '@playwright/test'
import { PNG } from 'pngjs'
import { createDefaultTalosMotionV6Preferences } from '../../resources/js/motion-v6/defaults'
import { installTalosApiMocks, type InstallTalosApiMocksOptions } from './helpers/talosApiMocks'

const e2eSetupEmail = 'talos-e2e@example.test'
const e2eSetupPassword = 'talos-e2e-password-123'
const e2eLoginEmail = process.env.TALOS_E2E_EMAIL ?? 'test@example.com'
const e2eLoginPassword = process.env.TALOS_E2E_PASSWORD ?? 'password'

function cloneMotion(overrides: Record<string, unknown> = {}) {
    const motion = createDefaultTalosMotionV6Preferences()
    Object.assign(motion, overrides)
    return motion
}

function migratedV1Motion() {
    const motion = createDefaultTalosMotionV6Preferences()
    motion.mode = 'simple'
    motion.speed = 140
    motion.intensity = 85
    motion.interface = {
        ...motion.interface,
        profile: 'expressive',
        duration_scale: 125,
        intensity: 80,
        easing: 'cinematic',
        stagger: 60,
    }
    return motion
}

async function isAuthenticatedWorkspace(page: Page) {
    return await page.locator('#talos-workspace-root[data-authenticated="true"]').count() > 0
}

async function waitForWorkspaceReady(page: Page) {
    const workspace = page.locator('#talos-workspace-root[data-authenticated="true"]')
    await expect(workspace).toHaveCount(1)
    await expect(workspace).toHaveAttribute('data-talos-app-ready', 'true')
    await expect(page.locator('[data-talos-boot-loader="true"]')).toHaveCount(0, { timeout: 8_000 })
}

async function submitLogin(page: Page, email: string, password: string) {
    await page.goto('/login', { waitUntil: 'domcontentloaded' })

    const form = page.locator('#talos-login-form')
    if (!await form.isVisible().catch(() => false)) return false

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

    for (const [email, password] of [
        [e2eLoginEmail, e2eLoginPassword],
        [e2eSetupEmail, e2eSetupPassword],
    ] as const) {
        if (await submitLogin(page, email, password)) {
            await waitForWorkspaceReady(page)
            return
        }
    }

    throw new Error('TALOS E2E could not authenticate through setup or login.')
}

async function bootstrap(page: Page, options: InstallTalosApiMocksOptions = {}) {
    const configuredBaseURL = process.env.TALOS_E2E_BASE_URL ?? 'http://127.0.0.1:8014'
    const url = new URL(configuredBaseURL)
    if (!['127.0.0.1', 'localhost', '::1'].includes(url.hostname)) {
        throw new Error(`TALOS V6 E2E requires a loopback baseURL, received ${url.origin}.`)
    }

    const ledger = await installTalosApiMocks(page, options)
    await page.emulateMedia({ reducedMotion: 'no-preference' })
    await ensureTalosAuthenticated(page)
    return ledger
}

async function openThemeMotion(page: Page, isMobile: boolean) {
    await page.getByRole('button', { name: 'Theme', exact: true }).filter({ visible: true }).first().click()
    await expect(page.locator('#talos-theme-control-tab-motion')).toBeVisible()
    await page.locator('#talos-theme-control-tab-motion').click()
    await expect(page.getByTestId('talos-motion-v6-editor')).toBeVisible()
}

async function setRange(page: Page, label: string, value: number) {
    await page.getByRole('slider', { name: label }).evaluate((element, nextValue) => {
        const input = element as HTMLInputElement
        input.value = String(nextValue)
        input.dispatchEvent(new Event('input', { bubbles: true }))
    }, value)
}

async function openThemeMotionResponsive(page: Page) {
    await page.getByRole('button', { name: 'Theme', exact: true }).filter({ visible: true }).first().click()
    await expect(page.locator('#talos-theme-control-tab-motion')).toBeVisible()
    await page.locator('#talos-theme-control-tab-motion').click()
    await expect(page.getByTestId('talos-motion-v6-editor')).toBeVisible()
}

async function expectInterfaceDuration(page: Page, value: number) {
    const slider = page.getByRole('slider', { name: 'Interface duration' })
    await expect(slider).toHaveValue(String(value))
    await expect(page.locator('label', { has: slider }).locator('output')).toHaveText(`${value}%`)
}

function visiblePixelDifference(before: Buffer, after: Buffer) {
    const first = PNG.sync.read(before)
    const second = PNG.sync.read(after)
    expect(second.width).toBe(first.width)
    expect(second.height).toBe(first.height)

    let changed = 0
    let totalDelta = 0
    const pixels = first.width * first.height
    for (let offset = 0; offset < first.data.length; offset += 4) {
        const delta = Math.abs(first.data[offset] - second.data[offset])
            + Math.abs(first.data[offset + 1] - second.data[offset + 1])
            + Math.abs(first.data[offset + 2] - second.data[offset + 2])
            + Math.abs(first.data[offset + 3] - second.data[offset + 3])
        totalDelta += delta
        if (delta >= 12) changed += 1
    }

    return {
        changedRatio: changed / pixels,
        meanChannelDelta: totalDelta / (pixels * 4),
    }
}

async function readPreviewCanvas(page: Page) {
    return page.getByTestId('talos-motion-v6-preview').locator('canvas[data-testid="talos-procedural-canvas"]').evaluate((element) => {
        const canvas = element as HTMLCanvasElement
        const context = canvas.getContext('2d', { willReadFrequently: true })
        if (!context || canvas.width === 0 || canvas.height === 0) return null

        const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data
        const stride = Math.max(1, Math.ceil(Math.sqrt((canvas.width * canvas.height) / 2_048)))
        let covered = 0
        let checksum = 0
        let sampled = 0
        for (let y = 0; y < canvas.height; y += stride) {
            for (let x = 0; x < canvas.width; x += stride) {
                const offset = (y * canvas.width + x) * 4
                const red = pixels[offset]
                const green = pixels[offset + 1]
                const blue = pixels[offset + 2]
                const alpha = pixels[offset + 3]
                sampled += 1
                if (alpha > 0 && (red > 0 || green > 0 || blue > 0)) covered += 1
                checksum = (checksum * 31 + red * 3 + green * 5 + blue * 7 + alpha * 11) >>> 0
            }
        }

        return {
            width: canvas.width,
            height: canvas.height,
            sampled,
            covered,
            checksum,
        }
    })
}

test.describe.configure({ mode: 'serial' })

test('fresh Calm workspace keeps background off until explicit opt-in while interface motion stays on', async ({ page, isMobile }) => {
    const ledger = await bootstrap(page, {
        initialSettings: {
            preferences: {
                theme: 'calm',
            },
        },
    })
    await openThemeMotion(page, isMobile)

    await expect(page.locator('.talos-shell')).toHaveAttribute('data-theme-preset', 'calm')
    await expect(page.getByRole('button', { name: 'Motion mode Off' })).toHaveAttribute('aria-pressed', 'true')
    await expect(page.getByRole('switch', { name: 'Procedural background' })).not.toBeChecked()
    await expect(page.getByTestId('talos-background-motion-state')).toHaveText('Off')
    await expect(page.getByRole('switch', { name: 'Interface motion' })).toBeChecked()
    await expect(page.getByTestId('talos-interface-motion-state')).toHaveText('Active')
    await expect(page.locator('.talos-shell')).toHaveAttribute('data-motion-v6-requested', 'off')
    await expect(page.getByTestId('talos-motion-background').locator('[data-talos-motion-stage]')).toHaveCount(0)
    expect(ledger.patches).toHaveLength(0)

    await page.emulateMedia({ reducedMotion: 'reduce' })
    await expect(page.getByTestId('talos-interface-motion-state')).toHaveText('Suppressed')
    expect(ledger.patches).toHaveLength(0)

    await page.emulateMedia({ reducedMotion: 'no-preference' })
    await page.getByRole('button', { name: 'Motion mode Simple' }).click()
    await expect(page.getByRole('button', { name: 'Motion mode Simple' })).toHaveAttribute('aria-pressed', 'true')
    const backgroundSwitch = page.getByRole('switch', { name: 'Procedural background' })
    await expect(backgroundSwitch).toBeChecked()
    const optInAck = ledger.waitForAck({ key: 'theme_motion_v6', revision: 1 })
    await page.getByRole('button', { name: 'Save motion' }).click()
    await optInAck

    const stage = page.getByTestId('talos-motion-background').locator('[data-talos-motion-stage]')
    await expect(page.locator('.talos-shell')).toHaveAttribute('data-theme-preset', 'calm')
    await expect(page.locator('.talos-shell')).toHaveAttribute('data-motion-v6-requested', 'simple')
    await expect(page.locator('.talos-shell')).toHaveAttribute('data-motion-v6-effective', 'simple')
    await expect(stage).toHaveAttribute('data-scene-id', 'calm')
    await expect(stage).toHaveAttribute('data-active-kind', 'simple')
    await expect(stage).toHaveAttribute('data-status', 'active')
    expect(ledger.patches).toHaveLength(1)
})

for (const viewport of [
    { name: '320x800', width: 320, height: 800 },
    { name: '375x812', width: 375, height: 812 },
    { name: '1280x800', width: 1280, height: 800 },
    { name: '1440x900', width: 1440, height: 900 },
] as const) {
    test.describe(`interface duration contract at ${viewport.name}`, () => {
        test.use({ viewport: { width: viewport.width, height: viewport.height } })

        test('keeps first-run, saved, reduced-motion and reset values human-visible', async ({ page, isMobile }) => {
            test.skip(isMobile, 'the exact viewport matrix runs once in the desktop Chromium project')
            const ledger = await bootstrap(page)
            await openThemeMotionResponsive(page)
            ledger.clear()

            await expectInterfaceDuration(page, 50)
            await setRange(page, 'Interface duration', 125)
            await expectInterfaceDuration(page, 125)
            const savedAck = ledger.waitForAck({ key: 'theme_motion_v6', revision: 1 })
            await page.getByRole('button', { name: 'Save motion' }).click()
            await savedAck

            await page.reload({ waitUntil: 'domcontentloaded' })
            await waitForWorkspaceReady(page)
            await openThemeMotionResponsive(page)
            await expectInterfaceDuration(page, 125)

            await page.emulateMedia({ reducedMotion: 'reduce' })
            await page.reload({ waitUntil: 'domcontentloaded' })
            await waitForWorkspaceReady(page)
            await openThemeMotionResponsive(page)
            await expectInterfaceDuration(page, 125)

            await page.getByRole('button', { name: 'Reset interface', exact: true }).click()
            await expectInterfaceDuration(page, 50)
            const resetAck = ledger.waitForAck({ key: 'theme_motion_v6', revision: 2 })
            await page.getByRole('button', { name: 'Save motion' }).click()
            await resetAck

            await page.reload({ waitUntil: 'domcontentloaded' })
            await waitForWorkspaceReady(page)
            await openThemeMotionResponsive(page)
            await expectInterfaceDuration(page, 50)
        })
    })
}

test('saves only a complete Motion V6 payload and preserves it across reload', async ({ page, isMobile }) => {
    const initialMotion = cloneMotion()
    const ledger = await bootstrap(page, {
        initialSettings: { preferences: { theme_motion_v6: initialMotion } },
    })
    const initialSettings = await page.evaluate(async () => (await fetch('/api/talos/settings')).json()) as { data: { revision: number } }
    expect(initialSettings.data.revision).toBe(0)
    await openThemeMotion(page, isMobile)
    ledger.clear()

    await page.getByRole('button', { name: 'Motion mode Complex' }).click()
    await setRange(page, 'Motion speed', 145)
    await expect(page.getByText('Unsaved motion changes')).toBeVisible()
    expect(ledger.patches).toHaveLength(0)

    const expectedMotion = cloneMotion({ mode: 'complex', speed: 145 })
    const ack = ledger.waitForAck({ key: 'theme_motion_v6', revision: 1 })
    await page.getByRole('button', { name: 'Save motion' }).click()
    const saved = await ack

    expect(saved.request.payload).toEqual({
        expected_revision: 0,
        preferences: { theme_motion_v6: expectedMotion },
    })
    await expect(page.getByText('Motion settings are synchronized')).toBeVisible()

    await page.reload({ waitUntil: 'domcontentloaded' })
    await waitForWorkspaceReady(page)
    await openThemeMotion(page, isMobile)
    await expect(page.getByRole('button', { name: 'Motion mode Complex' })).toHaveAttribute('aria-pressed', 'true')
    await expect(page.getByRole('slider', { name: 'Motion speed' })).toHaveValue('145')
})

test('renders independent glow as a visible effect beneath the readability scrim', async ({ page, isMobile }) => {
    await bootstrap(page, {
        initialSettings: { preferences: { theme_motion_v6: cloneMotion({ mode: 'static' }) } },
    })
    await openThemeMotion(page, isMobile)

    const preview = page.getByTestId('talos-motion-v6-preview').locator('.talos-background-procedural')
    const glow = preview.locator('[data-talos-background-glow]')
    const scrim = preview.locator('[data-talos-background-scrim]')
    await expect(glow).toHaveCount(1)
    await expect(scrim).toHaveCount(1)
    await expect.poll(() => glow.evaluate((element) => window.getComputedStyle(element).opacity)).toBe('0')
    const withoutGlow = await preview.screenshot({ animations: 'disabled' })

    await setRange(page, 'Glow / lens flare', 80)
    await expect.poll(() => glow.evaluate((element) => window.getComputedStyle(element).opacity)).toBe('0.8')
    const layerOrder = await preview.evaluate((root) => {
        const glowLayer = root.querySelector('[data-talos-background-glow]') as HTMLElement
        const scrimLayer = root.querySelector('[data-talos-background-scrim]') as HTMLElement
        return {
            glow: Number(window.getComputedStyle(glowLayer).zIndex),
            scrim: Number(window.getComputedStyle(scrimLayer).zIndex),
            scrimImage: window.getComputedStyle(scrimLayer).backgroundImage,
        }
    })
    expect(layerOrder.scrim).toBeGreaterThan(layerOrder.glow)
    expect(layerOrder.scrimImage).toContain('linear-gradient')

    const withGlow = await preview.screenshot({ animations: 'disabled' })
    const difference = visiblePixelDifference(withoutGlow, withGlow)
    expect(difference.changedRatio).toBeGreaterThan(0.01)
    expect(difference.meanChannelDelta).toBeGreaterThan(0.25)
})

test('applies background intensity, contrast and independent glow through preview, save, reset and reload', async ({ page, isMobile }) => {
    const ledger = await bootstrap(page, {
        initialSettings: { preferences: { theme_motion_v6: cloneMotion({ mode: 'adaptive' }) } },
    })
    await openThemeMotion(page, isMobile)
    ledger.clear()

    const workspaceBackground = page.getByTestId('talos-motion-background')
    const previewBackground = page.getByTestId('talos-motion-v6-preview').locator('.talos-background-procedural')
    const customProperty = (locator: typeof workspaceBackground, name: string) => locator.evaluate(
        (element, property) => (element as HTMLElement).style.getPropertyValue(property),
        name,
    )

    await expect.poll(() => customProperty(workspaceBackground, '--talos-background-stage-opacity')).toBe('0.65')
    await expect.poll(() => customProperty(workspaceBackground, '--talos-background-glow-opacity')).toBe('0')
    await setRange(page, 'Background intensity', 20)
    await setRange(page, 'Ambient contrast', 30)
    await setRange(page, 'Glow / lens flare', 75)

    await expect.poll(() => customProperty(previewBackground, '--talos-background-stage-opacity')).toBe('0.2')
    await expect.poll(() => customProperty(previewBackground, '--talos-background-scrim-start')).toBe('69.6%')
    await expect.poll(() => customProperty(previewBackground, '--talos-background-filter-contrast')).toBe('0.99')
    await expect.poll(() => customProperty(previewBackground, '--talos-background-glow-opacity')).toBe('0.75')
    await expect.poll(() => customProperty(workspaceBackground, '--talos-background-stage-opacity')).toBe('0.65')
    await expect.poll(() => customProperty(workspaceBackground, '--talos-background-glow-opacity')).toBe('0')
    expect(ledger.patches).toHaveLength(0)

    const customAck = ledger.waitForAck({ key: 'theme_motion_v6', revision: 1 })
    await page.getByRole('button', { name: 'Save motion' }).click()
    await customAck
    await expect.poll(() => customProperty(workspaceBackground, '--talos-background-stage-opacity')).toBe('0.2')
    await expect.poll(() => customProperty(workspaceBackground, '--talos-background-scrim-end')).toBe('81%')
    await expect.poll(() => customProperty(workspaceBackground, '--talos-background-glow-opacity')).toBe('0.75')

    await page.emulateMedia({ reducedMotion: 'reduce' })
    await expect(workspaceBackground).toHaveAttribute('data-motion-disabled', 'true')
    await expect(workspaceBackground.locator('[data-talos-background-glow]')).toHaveCount(1)
    await expect.poll(() => customProperty(workspaceBackground, '--talos-background-glow-opacity')).toBe('0.75')
    await page.emulateMedia({ reducedMotion: 'no-preference' })

    await page.getByRole('switch', { name: 'Procedural background' }).click()
    await expect(previewBackground.locator('[data-talos-background-glow]')).toHaveCount(0)
    await expect(previewBackground.locator('[data-talos-background-scrim]')).toHaveCount(0)
    await expect(previewBackground.locator('[data-talos-motion-stage]')).toHaveCount(0)
    await expect(previewBackground.locator('canvas')).toHaveCount(0)
    await expect(workspaceBackground.locator('[data-talos-background-glow]')).toHaveCount(1)
    const disabledAck = ledger.waitForAck({ key: 'theme_motion_v6', revision: 2 })
    await page.getByRole('button', { name: 'Save motion' }).click()
    await disabledAck
    await expect(workspaceBackground.locator('[data-talos-background-glow]')).toHaveCount(0)
    await expect(workspaceBackground.locator('[data-talos-background-scrim]')).toHaveCount(0)
    await expect(workspaceBackground.locator('[data-talos-motion-stage]')).toHaveCount(0)
    await expect(workspaceBackground.locator('canvas')).toHaveCount(0)
    await expect(workspaceBackground).toHaveAttribute('data-performance-raf-active', 'false')

    await page.reload({ waitUntil: 'domcontentloaded' })
    await waitForWorkspaceReady(page)
    const reloadedBackground = page.getByTestId('talos-motion-background')
    await expect(reloadedBackground.locator('[data-talos-background-glow]')).toHaveCount(0)
    await expect(reloadedBackground.locator('[data-talos-background-scrim]')).toHaveCount(0)
    await expect(reloadedBackground.locator('[data-talos-motion-stage]')).toHaveCount(0)
    await expect(reloadedBackground.locator('canvas')).toHaveCount(0)
    await expect(reloadedBackground).toHaveAttribute('data-performance-raf-active', 'false')
    await openThemeMotion(page, isMobile)

    await page.getByRole('button', { name: 'Reset all defaults' }).click()
    await expect(page.getByRole('slider', { name: 'Background intensity' })).toHaveValue('65')
    await expect(page.getByRole('slider', { name: 'Glow / lens flare' })).toHaveValue('0')
    await expect.poll(() => customProperty(previewBackground, '--talos-background-stage-opacity')).toBe('0.65')
    await expect.poll(() => customProperty(previewBackground, '--talos-background-glow-opacity')).toBe('0')
    const resetAck = ledger.waitForAck({ key: 'theme_motion_v6', revision: 3 })
    await page.getByRole('button', { name: 'Save motion' }).click()
    await resetAck

    await page.reload({ waitUntil: 'domcontentloaded' })
    await waitForWorkspaceReady(page)
    await expect.poll(() => customProperty(page.getByTestId('talos-motion-background'), '--talos-background-stage-opacity')).toBe('0.65')
    await expect.poll(() => customProperty(page.getByTestId('talos-motion-background'), '--talos-background-glow-opacity')).toBe('0')
})

test('rolls back the first rejected save and retries the exact failed draft', async ({ page, isMobile }) => {
    const ledger = await bootstrap(page, {
        initialSettings: { preferences: { theme_motion_v6: cloneMotion({ mode: 'adaptive' }) } },
        settingsPatchFailure: { status: 422, message: 'Deterministic V6 settings rejection.' },
    })
    await openThemeMotion(page, isMobile)
    ledger.clear()

    await page.getByRole('button', { name: 'Motion mode Complex' }).click()
    await setRange(page, 'Motion speed', 145)
    await setRange(page, 'Glow / lens flare', 80)
    const workspaceBackground = page.getByTestId('talos-motion-background')
    const previewBackground = page.getByTestId('talos-motion-v6-preview').locator('.talos-background-procedural')
    const customProperty = (locator: typeof workspaceBackground, name: string) => locator.evaluate(
        (element, property) => (element as HTMLElement).style.getPropertyValue(property),
        name,
    )
    await expect.poll(() => customProperty(previewBackground, '--talos-background-glow-opacity')).toBe('0.8')
    await expect.poll(() => customProperty(workspaceBackground, '--talos-background-glow-opacity')).toBe('0')
    const expectedFailedPayload = {
        expected_revision: 0,
        preferences: { theme_motion_v6: cloneMotion({ mode: 'complex', speed: 145, glow_intensity: 80 }) },
    }

    const failureExchange = ledger.waitForPatch({ key: 'theme_motion_v6', revision: 1 })
    await page.getByRole('button', { name: 'Save motion' }).click()
    const failed = await failureExchange
    expect(failed.response.status).toBe(422)
    expect(failed.request.payload).toEqual(expectedFailedPayload)
    await expect(page.getByRole('alert')).toContainText('Deterministic V6 settings rejection.')
    await expect(page.getByRole('button', { name: 'Motion mode Adaptive' })).toHaveAttribute('aria-pressed', 'true')
    await expect(page.getByRole('slider', { name: 'Motion speed' })).toHaveValue('100')
    await expect(page.getByRole('slider', { name: 'Glow / lens flare' })).toHaveValue('0')
    await expect.poll(() => customProperty(previewBackground, '--talos-background-glow-opacity')).toBe('0')
    await expect.poll(() => customProperty(workspaceBackground, '--talos-background-glow-opacity')).toBe('0')
    await expect(page.getByRole('button', { name: 'Retry last change' })).toBeVisible()

    const retryAck = ledger.waitForAck({ key: 'theme_motion_v6', revision: 2 })
    await page.getByRole('button', { name: 'Retry last change' }).click()
    const retried = await retryAck
    expect(retried.request.payload).toEqual(failed.request.payload)
    expect(retried.settingsRevision).toBe(1)
    expect(ledger.patches).toHaveLength(2)
    await expect(page.getByRole('button', { name: 'Motion mode Complex' })).toHaveAttribute('aria-pressed', 'true')
    await expect(page.getByRole('slider', { name: 'Motion speed' })).toHaveValue('145')
    await expect(page.getByRole('slider', { name: 'Glow / lens flare' })).toHaveValue('80')
    await expect.poll(() => customProperty(workspaceBackground, '--talos-background-glow-opacity')).toBe('0.8')

    const conflictWait = ledger.waitForPatch({ revision: 3, status: 409 })
    const conflict = await page.evaluate(async () => {
        const response = await fetch('/api/talos/settings', {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
            body: JSON.stringify({
                expected_revision: 0,
                preferences: { theme_motion_v6: { mode: 'adaptive' } },
            }),
        })

        return { status: response.status, body: await response.json() }
    })
    const conflicted = await conflictWait
    expect(conflict).toMatchObject({
        status: 409,
        body: {
            code: 'TALOS_SETTINGS_REVISION_CONFLICT',
            data: { revision: 1 },
        },
    })
    expect(failed.response.body).not.toHaveProperty('code', 'TALOS_SETTINGS_REVISION_CONFLICT')
    expect(conflicted.expectedRevision).toBe(0)
    expect(conflicted.settingsRevision).toBe(1)
})

test('migrates strict V1 theme motion and round-trips strict V2 without legacy fields', async ({ page, isMobile }) => {
    const ledger = await bootstrap(page)
    await openThemeMotion(page, isMobile)
    await page.locator('#talos-theme-control-tab-library').click()
    await expect(page.getByRole('button', { name: 'Import theme', exact: true })).toBeVisible()
    ledger.clear()

    const v1 = {
        schema: 'talos_theme_export_v1',
        exported_at: '2026-07-12T07:00:00.000Z',
        theme: {
            id: 'v1-motion-import',
            name: 'V1 Motion Import',
            base_theme: 'aurora',
            tokens: {},
            motion: 'cinematic',
            ui_animation_profile: 'expressive',
            ui_animation_customization: {
                duration_scale: 125,
                intensity: 80,
                easing: 'cinematic',
                stagger: 60,
            },
        },
    }
    const v1Ack = ledger.waitForAck({ key: 'theme_motion_v6', revision: 1 })
    await page.getByLabel('Import theme JSON').fill(JSON.stringify(v1))
    await page.getByRole('button', { name: 'Import theme', exact: true }).click()
    const v1Saved = await v1Ack
    expect(v1Saved.request.payload).toMatchObject({ expected_revision: 0 })
    expect((v1Saved.request.payload as { preferences: Record<string, unknown> }).preferences.theme_motion_v6).toEqual(migratedV1Motion())

    await page.locator('#talos-theme-control-tab-library').click()
    await page.getByRole('button', { name: 'Export active theme', exact: true }).click()
    const exported = JSON.parse(await page.getByLabel('Exported theme JSON').inputValue()) as {
        schema: string
        theme: Record<string, unknown>
    }
    expect(exported.schema).toBe('talos_theme_export_v2')
    expect(exported.theme.motion_v6).toEqual(migratedV1Motion())
    expect(exported.theme).not.toHaveProperty('motion')
    expect(exported.theme).not.toHaveProperty('ui_animation_profile')
    expect(exported.theme).not.toHaveProperty('ui_animation_customization')

    const v2 = {
        ...exported,
        theme: {
            ...exported.theme,
            id: 'v2-motion-round-trip',
            name: 'V2 Motion Round Trip',
        },
    }
    const v2Ack = ledger.waitForAck({ key: 'theme_motion_v6', revision: 2 })
    await page.getByLabel('Import theme JSON').fill(JSON.stringify(v2))
    await page.getByRole('button', { name: 'Import theme', exact: true }).click()
    const v2Saved = await v2Ack
    expect(v2Saved.request.payload).toMatchObject({ expected_revision: 1 })
    const savedPreferences = (v2Saved.request.payload as { preferences: Record<string, unknown> }).preferences
    const roundTripped = (savedPreferences.theme_library as Array<Record<string, unknown>>).find((theme) => theme.id === 'v2-motion-round-trip')
    expect(roundTripped?.motion_v6).toEqual(migratedV1Motion())
    expect(roundTripped).not.toHaveProperty('motion')
    expect(roundTripped).not.toHaveProperty('ui_animation_profile')
    expect(roundTripped).not.toHaveProperty('ui_animation_customization')

    const patchesBeforeInvalidImport = ledger.patches.length
    const invalidV2 = structuredClone(v2)
    invalidV2.theme.id = 'invalid-motion-v2-import'
    invalidV2.theme.name = 'Invalid Motion V2 Import'
    ;(invalidV2.theme.motion_v6 as ReturnType<typeof migratedV1Motion>).interface.duration_scale = 151
    await page.getByLabel('Import theme JSON').fill(JSON.stringify(invalidV2))
    await page.getByRole('button', { name: 'Import theme', exact: true }).click()
    await expect(page.getByText(/rejected/i)).toBeVisible()
    expect(ledger.patches).toHaveLength(patchesBeforeInvalidImport)

    await page.locator('#talos-theme-control-tab-motion').click()
    await expectInterfaceDuration(page, 125)
    const settingsAfterInvalidImport = await page.evaluate(async () => (await fetch('/api/talos/settings')).json()) as {
        data: { preferences: { theme_motion_v6: ReturnType<typeof migratedV1Motion> } }
    }
    expect(settingsAfterInvalidImport.data.preferences.theme_motion_v6.interface.duration_scale).toBe(125)
})

test('mounts the real product preview and proves mode controls and supported canvas motion', async ({ page, isMobile }) => {
    const ledger = await bootstrap(page)
    await openThemeMotion(page, isMobile)
    const preview = page.getByTestId('talos-motion-v6-preview')
    const stage = preview.locator('[data-talos-motion-stage]')

    await expect(preview).toBeVisible()
    await expect(stage).toHaveCount(1)
    await expect(preview.locator('[data-preview-sample="window"]')).toBeVisible()
    await expect(preview.locator('[data-preview-sample="menu"]')).toBeVisible()
    await expect(preview.locator('[data-preview-sample="message"]')).toBeVisible()
    await expect(preview.locator('[data-preview-sample="feedback"]')).toContainText('Success')
    await expect(preview.locator('[data-preview-sample="feedback"]')).toContainText('Warning')
    await expect(preview.locator('[data-preview-sample="feedback"]')).toContainText('Error')

    await preview.getByRole('button', { name: 'Light preview' }).click()
    await expect(preview.locator('[data-preview-color-mode]')).toHaveAttribute('data-preview-color-mode', 'light')
    await preview.getByRole('button', { name: 'Dark preview' }).click()
    await expect(preview.locator('[data-preview-color-mode]')).toHaveAttribute('data-preview-color-mode', 'dark')

    await preview.getByRole('button', { name: 'Pause preview' }).click()
    await expect(preview.getByRole('button', { name: 'Resume preview' })).toBeVisible()
    await expect(stage).toHaveAttribute('data-paused', 'true')
    await preview.getByRole('button', { name: 'Resume preview' }).click()
    await expect(preview.getByRole('button', { name: 'Pause preview' })).toBeVisible()
    await expect(stage).toHaveAttribute('data-paused', 'false')
    await preview.getByRole('button', { name: 'Restart preview' }).click()
    await expect(stage).toHaveAttribute('data-status', 'active')

    const canvas = preview.locator('canvas[data-testid="talos-procedural-canvas"]')
    if (await canvas.count() > 0) {
        await expect.poll(async () => (await readPreviewCanvas(page))?.covered ?? 0).toBeGreaterThan(0)
        const first = await readPreviewCanvas(page)
        await expect.poll(async () => {
            const next = await readPreviewCanvas(page)
            return next !== null && first !== null && next.checksum !== first.checksum
        }).toBe(true)
    } else {
        await expect(preview.locator('.talos-v6-simple-layer')).toHaveCount(1)
        await expect(stage).not.toHaveAttribute('data-status', 'solid-fallback')
    }

    expect(ledger.patches).toHaveLength(0)
})
