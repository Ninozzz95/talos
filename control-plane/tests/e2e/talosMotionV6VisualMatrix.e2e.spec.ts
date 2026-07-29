import { mkdirSync, rmSync } from 'node:fs'
import { expect, test, type BrowserContext, type Page, type TestInfo } from '@playwright/test'
import { installTalosApiMocks } from './helpers/talosApiMocks'
import type { TalosMotionRendererMode, TalosMotionV6Preferences } from '../../resources/js/motion-v6/contracts'

const setupEmail = 'talos-e2e@example.test'
const setupPassword = 'talos-e2e-password-123'
const loginEmail = process.env.TALOS_E2E_EMAIL ?? 'test@example.com'
const loginPassword = process.env.TALOS_E2E_PASSWORD ?? 'password'

const PRESETS = [
    'forge', 'paper', 'terminal', 'aurora', 'glacier', 'ember',
    'atlas', 'noir', 'signal', 'violet', 'claudius', 'basicus', 'calm',
] as const
const COLOR_MODES = ['light', 'dark'] as const
const RENDERER_MODES = ['simple', 'complex', 'static'] as const

type PresetId = typeof PRESETS[number]
type ColorMode = typeof COLOR_MODES[number]
type RendererMode = typeof RENDERER_MODES[number]

function preferences(mode: TalosMotionRendererMode): TalosMotionV6Preferences {
    return {
        schema_version: 1,
        mode,
        background_enabled: true,
        interface_enabled: true,
        scene_override: null,
        speed: 100,
        intensity: 65,
        glow_intensity: 0,
        density: 100,
        depth: 50,
        trails: 35,
        contrast: 60,
        parallax: 20,
        quality: 'adaptive',
        fps_cap: 30,
        dpr_cap: 1.25,
        pause_when_hidden: true,
        respect_data_saver: true,
        interface: {
            profile: 'preset',
            duration_scale: 50,
            intensity: 65,
            easing: 'precise',
            stagger: 40,
            categories: {
                windows: true,
                surfaces: true,
                navigation: true,
                composer: true,
                messages: true,
                feedback: true,
            },
        },
    }
}

async function isAuthenticated(page: Page) {
    return await page.locator('#talos-workspace-root[data-authenticated="true"]').count() > 0
}

async function waitForWorkspace(page: Page) {
    const workspace = page.locator('#talos-workspace-root[data-authenticated="true"]')
    await expect(workspace).toHaveCount(1)
    await expect(workspace).toHaveAttribute('data-talos-app-ready', 'true')
    await expect(page.locator('[data-talos-boot-loader="true"]')).toHaveCount(0, { timeout: 8_000 })
    await expect(page.getByLabel('Message TALOS')).toBeVisible({ timeout: 45_000 })
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
    return isAuthenticated(page)
}

async function ensureAuthenticated(page: Page) {
    await page.goto('/', { waitUntil: 'domcontentloaded' })
    if (await isAuthenticated(page)) {
        await waitForWorkspace(page)
        return
    }

    await page.goto('/setup', { waitUntil: 'domcontentloaded' })
    const form = page.locator('#talos-setup-form')
    if (await form.isVisible().catch(() => false)) {
        await form.getByLabel('Name').fill('TALOS E2E Admin')
        await form.getByLabel('Email').fill(setupEmail)
        await form.getByLabel('Password', { exact: true }).fill(setupPassword)
        await form.getByLabel('Confirm password').fill(setupPassword)
        await Promise.all([
            page.waitForURL(/\/$/, { waitUntil: 'domcontentloaded', timeout: 4_000 }).catch(() => undefined),
            form.getByRole('button', { name: 'Create first admin' }).click(),
        ])
        if (await isAuthenticated(page)) {
            await waitForWorkspace(page)
            return
        }
    }

    for (const [email, password] of [[loginEmail, loginPassword], [setupEmail, setupPassword]] as const) {
        if (await submitLogin(page, email, password)) {
            await waitForWorkspace(page)
            return
        }
    }
    throw new Error('TALOS visual matrix could not authenticate through setup or login.')
}

async function applyState(
    page: Page,
    preset: PresetId,
    colorMode: ColorMode,
    rendererMode: RendererMode,
    expectedRevision: number,
): Promise<number> {
    const revision = await page.evaluate(async ({ presetId, mode, renderer, revision }) => {
        const response = await fetch('/api/talos/settings', {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                expected_revision: revision,
                preferences: {
                    theme: presetId,
                    theme_mode: mode,
                    reduced_motion: false,
                    theme_motion_v6: renderer,
                },
            }),
        })
        const body = await response.text()
        if (!response.ok) throw new Error(`Settings PATCH failed with ${response.status}: ${body.slice(0, 240)}`)
        const parsed = JSON.parse(body) as { data?: { revision?: unknown } }
        if (typeof parsed.data?.revision !== 'number') throw new Error('Settings PATCH omitted the numeric revision.')
        return parsed.data.revision
    }, {
        presetId: preset,
        mode: colorMode,
        renderer: preferences(rendererMode),
        revision: expectedRevision,
    })

    await page.reload({ waitUntil: 'domcontentloaded' })
    await waitForWorkspace(page)
    return revision
}

async function canvasMetrics(page: Page) {
    const canvas = page.getByTestId('talos-motion-background').getByTestId('talos-procedural-canvas')
    await expect(canvas).toHaveCount(1)
    await expect.poll(async () => canvas.evaluate((element) => (element as HTMLCanvasElement).width)).toBeGreaterThan(100)
    await expect.poll(async () => canvas.evaluate((element) => (element as HTMLCanvasElement).height)).toBeGreaterThan(100)
    return canvas.evaluate((element) => {
        const target = element as HTMLCanvasElement
        const context = target.getContext('2d')
        if (!context) return { width: target.width, height: target.height, alphaCoverage: 0, uniqueColors: 0, contrastSignalP95: 0, fingerprint: 'missing-context' }
        const shell = target.closest<HTMLElement>('.talos-shell')
        const backgroundValue = shell ? getComputedStyle(shell).getPropertyValue('--talos-background').trim() : '#000000'
        const backgroundMatch = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(backgroundValue)
        const background = backgroundMatch
            ? backgroundMatch.slice(1).map((channel) => Number.parseInt(channel, 16))
            : [0, 0, 0]
        const pixels = context.getImageData(0, 0, target.width, target.height).data
        const stride = Math.max(4, Math.floor((pixels.length / 4) / 12_000) * 4)
        let samples = 0
        let covered = 0
        let fingerprint = 2_166_136_261
        const colors = new Set<string>()
        const contrastSignals: number[] = []
        for (let index = 0; index < pixels.length; index += stride) {
            samples += 1
            if (pixels[index + 3] > 4) covered += 1
            if (pixels[index + 3] > 4 && colors.size < 512) {
                colors.add(`${pixels[index] >> 3}:${pixels[index + 1] >> 3}:${pixels[index + 2] >> 3}:${pixels[index + 3] >> 4}`)
            }
            if (pixels[index + 3] > 4) {
                const alpha = pixels[index + 3] / 255
                const red = alpha * Math.abs(pixels[index] - background[0])
                const green = alpha * Math.abs(pixels[index + 1] - background[1])
                const blue = alpha * Math.abs(pixels[index + 2] - background[2])
                contrastSignals.push(Math.sqrt((red * red) + (green * green) + (blue * blue)))
            }
            fingerprint ^= pixels[index] | (pixels[index + 1] << 8) | (pixels[index + 2] << 16) | (pixels[index + 3] << 24)
            fingerprint = Math.imul(fingerprint, 16_777_619) >>> 0
        }
        contrastSignals.sort((left, right) => left - right)
        const contrastIndex = Math.max(0, Math.ceil(contrastSignals.length * 0.95) - 1)
        return {
            width: target.width,
            height: target.height,
            alphaCoverage: covered / Math.max(1, samples),
            uniqueColors: colors.size,
            contrastSignalP95: contrastSignals[contrastIndex] ?? 0,
            fingerprint: fingerprint.toString(16).padStart(8, '0'),
        }
    })
}

async function domMetrics(page: Page) {
    const layers = page.getByTestId('talos-motion-background').locator('.talos-v6-simple-layer')
    const count = await layers.count()
    const visible = await layers.evaluateAll((elements) => elements.filter((element) => {
        const bounds = element.getBoundingClientRect()
        const style = getComputedStyle(element)
        return bounds.width > 1 && bounds.height > 1 && Number(style.opacity) > 0.02
    }).length)
    const fingerprint = await layers.evaluateAll((elements) => JSON.stringify(elements.map((element) => {
        const style = getComputedStyle(element)
        return {
            role: (element as HTMLElement).dataset.talosMotionLayerRole ?? '',
            background: style.background,
            border: style.border,
            borderRadius: style.borderRadius,
            clipPath: style.clipPath,
        }
    })))
    return { count, visible, fingerprint }
}

async function domFrameFingerprint(page: Page) {
    return page.getByTestId('talos-motion-background').locator('.talos-v6-simple-layer').evaluateAll((elements) => JSON.stringify(elements.map((element) => {
        const style = getComputedStyle(element)
        return {
            role: (element as HTMLElement).dataset.talosMotionLayerRole ?? '',
            transform: style.transform,
            opacity: style.opacity,
        }
    })))
}

async function assertNoHorizontalOverflow(page: Page) {
    const overflow = await page.evaluate(() => ({
        document: document.documentElement.scrollWidth - document.documentElement.clientWidth,
        body: document.body.scrollWidth - document.body.clientWidth,
    }))
    expect(overflow.document).toBeLessThanOrEqual(1)
    expect(overflow.body).toBeLessThanOrEqual(1)
}

async function assertPrimaryFocusAndTarget(page: Page) {
    const commandButton = page.getByRole('button', { name: 'Open command palette' })
    await expect(commandButton).toBeVisible()
    await commandButton.focus()
    const focus = await commandButton.evaluate((element) => {
        const bounds = element.getBoundingClientRect()
        const style = getComputedStyle(element)
        return {
            width: bounds.width,
            height: bounds.height,
            focusVisible: element.matches(':focus-visible'),
            outlineWidth: Number.parseFloat(style.outlineWidth) || 0,
            boxShadow: style.boxShadow,
        }
    })
    expect(focus.width).toBeGreaterThanOrEqual(24)
    expect(focus.height).toBeGreaterThanOrEqual(24)
    expect(focus.focusVisible).toBe(true)
    expect(focus.outlineWidth > 0 || focus.boxShadow !== 'none', JSON.stringify(focus)).toBe(true)
}

async function writeContactSheet(
    context: BrowserContext,
    images: Array<{ label: string, buffer: Buffer }>,
    path: string,
    title: string,
    testInfo: TestInfo,
) {
    const contactPage = await context.newPage()
    await contactPage.setViewportSize({ width: 1280, height: 900 })
    const cards = images.map(({ label, buffer }) => `
        <figure><img src="data:image/png;base64,${buffer.toString('base64')}" alt=""><figcaption>${label}</figcaption></figure>
    `).join('')
    await contactPage.setContent(`<!doctype html><html><head><style>
        *{box-sizing:border-box}body{margin:0;padding:24px;background:#0b0d10;color:#f3f5f7;font:14px/1.4 system-ui,sans-serif}
        h1{margin:0 0 18px;font-size:20px;letter-spacing:0}main{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:14px}
        figure{margin:0;background:#15181d;border:1px solid #303640;padding:8px}img{display:block;width:100%;height:320px;object-fit:contain;object-position:center;background:#080a0d}
        figcaption{padding:8px 2px 2px;color:#cbd2dc;font:600 12px/1.2 ui-monospace,monospace;text-transform:uppercase;letter-spacing:0}
    </style></head><body><h1>${title}</h1><main>${cards}</main></body></html>`)
    await contactPage.waitForFunction(() => Array.from(document.images).every((image) => image.complete))
    const contactSheet = await contactPage.screenshot({ path, fullPage: true, animations: 'disabled' })
    await testInfo.attach(`${title.toLowerCase().replace(/[^a-z0-9]+/g, '-')}.png`, { body: contactSheet, contentType: 'image/png' })
    await contactPage.close()
}

test.describe.configure({ mode: 'serial' })

test.beforeEach(async ({ page }) => {
    await installTalosApiMocks(page)
    await page.emulateMedia({ reducedMotion: 'no-preference' })
    await ensureAuthenticated(page)
})

test('does not declare the workspace ready while the boot loader still covers it', async ({ page }) => {
    await page.reload({ waitUntil: 'domcontentloaded' })
    await waitForWorkspace(page)

    expect(await page.locator('[data-talos-boot-loader="true"]').count()).toBe(0)
    await expect(page.locator('#talos-workspace-root')).toHaveAttribute('data-talos-app-ready', 'true')
})

test('verifies all Motion V6 preset, color, renderer and viewport states', async ({ page, context, isMobile }, testInfo) => {
    test.setTimeout(600_000)
    await page.setViewportSize(isMobile ? { width: 412, height: 915 } : { width: 1440, height: 900 })

    const rawPresetFilter = process.env.TALOS_VISUAL_MATRIX_PRESET
    const rawColorFilter = process.env.TALOS_VISUAL_MATRIX_COLOR
    const rawRendererFilter = process.env.TALOS_VISUAL_MATRIX_RENDERER
    if (rawPresetFilter && !PRESETS.includes(rawPresetFilter as PresetId)) throw new Error(`Invalid TALOS_VISUAL_MATRIX_PRESET: ${rawPresetFilter}`)
    if (rawColorFilter && !COLOR_MODES.includes(rawColorFilter as ColorMode)) throw new Error(`Invalid TALOS_VISUAL_MATRIX_COLOR: ${rawColorFilter}`)
    if (rawRendererFilter && !RENDERER_MODES.includes(rawRendererFilter as RendererMode)) throw new Error(`Invalid TALOS_VISUAL_MATRIX_RENDERER: ${rawRendererFilter}`)
    const presetFilter = rawPresetFilter as PresetId | undefined
    const colorFilter = rawColorFilter as ColorMode | undefined
    const rendererFilter = rawRendererFilter as RendererMode | undefined
    const presets = presetFilter && PRESETS.includes(presetFilter) ? [presetFilter] : [...PRESETS]
    const colorModes = colorFilter && COLOR_MODES.includes(colorFilter) ? [colorFilter] : [...COLOR_MODES]
    const rendererModes = rendererFilter && RENDERER_MODES.includes(rendererFilter) ? [rendererFilter] : [...RENDERER_MODES]
    const artifactRoot = `storage/playwright-live/v6-theme-matrix-full/${testInfo.project.name}`
    rmSync(artifactRoot, { recursive: true, force: true })
    mkdirSync(artifactRoot, { recursive: true })

    let expectedRevision = 0
    const evidence: Array<Record<string, unknown>> = []
    const fingerprints = new Map<string, Set<string>>()
    for (const rendererMode of rendererModes) {
        for (const colorMode of colorModes) {
            const contactImages: Array<{ label: string, buffer: Buffer }> = []
            const stateDirectory = `${artifactRoot}/${rendererMode}/${colorMode}`
            mkdirSync(stateDirectory, { recursive: true })
            for (const preset of presets) {
                expectedRevision = await applyState(page, preset, colorMode, rendererMode, expectedRevision)
                const workspace = page.getByTestId('talos-workspace')
                const stage = page.getByTestId('talos-motion-background').locator('[data-talos-motion-stage]')
                await expect(workspace).toHaveAttribute('data-theme-preset', preset)
                await expect(workspace).toHaveAttribute('data-theme-mode', colorMode)
                await expect(workspace).toHaveAttribute('data-motion-v6-requested', rendererMode)
                await expect(workspace).toHaveAttribute('data-motion-v6-effective', rendererMode)
                await expect(workspace).toHaveAttribute('data-motion-v6-degradation-stage', '0')
                await expect(stage).toHaveAttribute('data-active-kind', rendererMode)
                await expect(stage).toHaveAttribute('data-scene-id', preset)
                await expect(stage).toHaveAttribute('data-status', 'active')
                await expect(stage).toHaveAttribute('data-fallback-reason', '')
                await assertNoHorizontalOverflow(page)
                await assertPrimaryFocusAndTarget(page)

                let rendererEvidence: Record<string, unknown>
                if (rendererMode === 'complex') {
                    const metrics = await canvasMetrics(page)
                    expect(metrics.alphaCoverage).toBeGreaterThan(0.015)
                    expect(metrics.uniqueColors).toBeGreaterThan(8)
                    expect(metrics.contrastSignalP95).toBeGreaterThan(4)
                    await expect(stage.locator('.talos-v6-simple-layer')).toHaveCount(0)
                    rendererEvidence = metrics
                } else if (rendererMode === 'simple') {
                    await expect(stage.getByTestId('talos-procedural-canvas')).toHaveCount(0)
                    const metrics = await domMetrics(page)
                    expect(metrics.count).toBeGreaterThanOrEqual(7)
                    expect(metrics.visible).toBeGreaterThanOrEqual(6)
                    rendererEvidence = metrics
                } else {
                    await expect(stage.getByTestId('talos-procedural-canvas')).toHaveCount(0)
                    await expect(page.getByTestId('talos-motion-background')).toHaveAttribute('data-motion-disabled', 'true')
                    const metrics = await domMetrics(page)
                    expect(metrics.count).toBeGreaterThanOrEqual(7)
                    expect(metrics.visible).toBeGreaterThanOrEqual(6)
                    const runningAnimations = await stage.evaluate((element) => element.getAnimations({ subtree: true }).filter((animation) => animation.playState === 'running').length)
                    expect(runningAnimations).toBe(0)
                    const before = await domFrameFingerprint(page)
                    await page.waitForTimeout(180)
                    expect(await domFrameFingerprint(page)).toBe(before)
                    rendererEvidence = { ...metrics, runningAnimations, frameStable: true }
                }

                const fingerprint = String(rendererEvidence.fingerprint)
                const fingerprintKey = `${rendererMode}:${colorMode}`
                const group = fingerprints.get(fingerprintKey) ?? new Set<string>()
                group.add(fingerprint)
                fingerprints.set(fingerprintKey, group)

                const screenshot = await page.screenshot({
                    path: `${stateDirectory}/${preset}.png`,
                    animations: 'disabled',
                })
                contactImages.push({ label: preset, buffer: screenshot })
                evidence.push({ preset, colorMode, rendererMode, rendererEvidence })
            }

            await writeContactSheet(
                context,
                contactImages,
                `${artifactRoot}/contact-${rendererMode}-${colorMode}.png`,
                `${testInfo.project.name} / ${rendererMode} / ${colorMode}`,
                testInfo,
            )
        }
    }

    const expectedStateCount = presets.length * colorModes.length * rendererModes.length
    expect(evidence).toHaveLength(expectedStateCount)
    for (const rendererMode of rendererModes) {
        for (const colorMode of colorModes) {
            expect(fingerprints.get(`${rendererMode}:${colorMode}`)?.size).toBe(presets.length)
        }
    }
    await testInfo.attach(`talos-motion-v6-visual-matrix-${testInfo.project.name}.json`, {
        body: Buffer.from(JSON.stringify({
            schema: 'talos_motion_v6_visual_matrix_v1',
            project: testInfo.project.name,
            viewport: await page.evaluate(() => ({ width: innerWidth, height: innerHeight })),
            filtered: Boolean(presetFilter || colorFilter || rendererFilter),
            expectedStateCount,
            evidence,
        }, null, 2)),
        contentType: 'application/json',
    })
})
