import { expect, test, type Page } from '@playwright/test'
import { installTalosApiMocks } from './helpers/talosApiMocks'
import type {
    TalosMotionRendererMode,
    TalosMotionV6Preferences,
} from '../../resources/js/motion-v6/contracts'

const e2eSetupEmail = 'talos-e2e@example.test'
const e2eSetupPassword = 'talos-e2e-password-123'
const e2eLoginEmail = process.env.TALOS_E2E_EMAIL ?? 'test@example.com'
const e2eLoginPassword = process.env.TALOS_E2E_PASSWORD ?? 'password'

const TALOS_PRESET_IDS = [
    'forge',
    'paper',
    'terminal',
    'aurora',
    'glacier',
    'ember',
    'atlas',
    'noir',
    'signal',
    'violet',
    'claudius',
    'basicus',
] as const

const TALOS_MOTION_MODES = [
    { id: 'simple', mode: 'simple', expectedEffectiveMode: 'simple', expectedActiveKind: 'simple', backgroundEnabled: true },
    { id: 'complex', mode: 'complex', expectedEffectiveMode: 'complex', expectedActiveKind: 'complex', backgroundEnabled: true },
    { id: 'static', mode: 'static', expectedEffectiveMode: 'static', expectedActiveKind: 'static', backgroundEnabled: true },
    { id: 'off', mode: 'off', expectedEffectiveMode: 'off', expectedActiveKind: null, backgroundEnabled: false },
    { id: 'adaptive', mode: 'adaptive', expectedEffectiveMode: 'complex', expectedActiveKind: 'complex', backgroundEnabled: true },
] as const

const DESKTOP_VIEWPORT = { width: 1440, height: 900 }
const RAF_SAMPLE_WINDOW_MS = 500
const RAF_SAMPLE_LIMIT = 512
const CANVAS_PIXEL_SAMPLE_LIMIT = 20_000
const SCENE_VARIATION_RGB_DISTANCE_THRESHOLD = 16
const FRAME_DELTA_RGB_DISTANCE_THRESHOLD = 12
const FRAME_DELTA_ALPHA_DISTANCE_THRESHOLD = 8
const DIAGNOSTIC_EVENT_LIMIT = 200
const BODY_SHAPE_MAX_DEPTH = 3
const BODY_SHAPE_MAX_KEYS = 40
const LOOPBACK_HOSTNAMES = new Set(['localhost', '127.0.0.1', '::1', '[::1]'])

type TalosPresetId = typeof TALOS_PRESET_IDS[number]
type TalosMotionMode = typeof TALOS_MOTION_MODES[number]

type RendererSampleWindow = {
    rendererActivitySource: 'complex-canvas-clear' | 'simple-dom-style' | 'none'
    requestedSampleWindowMs: number
    actualElapsedMs: number
    timerOverrun: boolean
    timerOverrunMs: number
    rendererActivityCount: number
    capturedRendererActivityTimestamps: number
    droppedRendererActivityTimestamps: number
    rendererActivityRafCallbackCount: number
    capturedRendererCallbackDurations: number
    droppedRendererCallbackDurations: number
    rendererActivityOutsideRaf: number
    rendererCallbackDurationMs: {
        p50: number | null
        p95: number | null
        max: number | null
    }
    observedCadence: {
        frameCount: number
        observedFps: number
        intervalMs: {
            p50: number | null
            p95: number | null
            max: number | null
        }
    }
    visualFrameDelta: {
        comparable: boolean
        reason: string | null
        sampledPairCount: number
        changedSampleCount: number
        changedSampleRatio: number | null
        rgbDistanceThreshold: number
        alphaDistanceThreshold: number
    }
}

type CanvasSceneMetrics = {
    exists: boolean
    width: number
    height: number
    cssWidth: number
    cssHeight: number
    sampleStride: number
    sampledPixelCount: number
    alphaCoveredSampleCount: number
    alphaCoverageRatio: number
    dominantSampledRgb: {
        red: number
        green: number
        blue: number
        sampleCount: number
    } | null
    uniqueSampledRgbCount: number
    sceneVariationSampleCount: number
    backgroundSceneVariationRatio: number
    sceneVariationRgbDistanceThreshold: number
    hasVisibleSceneSignal: boolean
}

type DomSceneMetrics = {
    exists: boolean
    layerCount: number
    visibleLayerCount: number
    roles: string[]
    geometryFingerprint: string
    hasVisibleSceneSignal: boolean
}

type JsonShape =
    | { type: 'null' }
    | { type: 'boolean' | 'number' | 'string' }
    | { type: 'array', length: number, itemShapes: JsonShape[] }
    | { type: 'object', keys: string[], truncatedKeyCount: number, properties?: Record<string, JsonShape> }

type ResponseBodyShape =
    | { kind: 'empty', byteLength: number }
    | { kind: 'json', byteLength: number, value: JsonShape }
    | { kind: 'text', byteLength: number, preview: string }
    | { kind: 'unavailable', byteLength: null, error: string }

type SettingsPatchExchange = {
    sequence: number
    request: {
        url: string
        method: string
        payload: unknown
    }
    response: {
        status: number
        ok: boolean
        contentType: string | null
        bodyShape: ResponseBodyShape
    }
}

type BrowserDiagnosticEvent = {
    sequence: number
    kind: 'console' | 'pageerror' | 'requestfailed'
    severity: 'warning' | 'error'
    message: string
    url?: string
    method?: string
    resourceType?: string
    location?: {
        url: string
        lineNumber: number
        columnNumber: number
    }
    stack?: string
}

type BoundedBrowserDiagnostics = {
    limit: number
    events: BrowserDiagnosticEvent[]
    droppedEventCount: number
}

type MotionV6RendererState = {
    workspace: {
        themePreset: string | null
        requestedMode: string | null
        effectiveMode: string | null
    }
    stage: {
        exists: boolean
        requestedMode: string | null
        effectiveMode: string | null
        paused: string | null
        fallbackReason: string | null
        status: string | null
        activeKind: string | null
        sceneId: string | null
        requestedSceneId: string | null
        solidFallback: string | null
        canvasCount: number
        simpleLayerCount: number
        simpleLayerRoles: string[]
    }
    background: {
        exists: boolean
        solidFallbackCount: number
    }
}

function createCompleteMotionV6Preferences(
    mode: TalosMotionRendererMode,
    backgroundEnabled = mode !== 'off',
): TalosMotionV6Preferences {
    return {
        schema_version: 1,
        mode,
        background_enabled: backgroundEnabled,
        interface_enabled: true,
        scene_override: null,
        speed: 100,
        intensity: 65,
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
            duration_scale: 100,
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

const diagnosticsByPage = new WeakMap<Page, BoundedBrowserDiagnostics>()

function boundedText(value: unknown, limit = 2_000) {
    const text = String(value ?? '')
    return text.length > limit ? `${text.slice(0, limit)}...[truncated]` : text
}

function requireLoopbackHttpUrl(value: string | undefined, label: string) {
    if (!value) {
        throw new Error(`${label} is required for the TALOS screenshot baseline.`)
    }

    let url: URL
    try {
        url = new URL(value)
    } catch {
        throw new Error(`${label} is not a valid URL: ${value}`)
    }

    const hostname = url.hostname.toLowerCase()
    if (!['http:', 'https:'].includes(url.protocol) || !LOOPBACK_HOSTNAMES.has(hostname)) {
        throw new Error(`${label} must use localhost, 127.0.0.1, or ::1 before TALOS screenshots may be captured; received ${url.origin}.`)
    }

    return url.toString()
}

function describeJsonShape(value: unknown, depth = 0): JsonShape {
    if (value === null) return { type: 'null' }
    if (Array.isArray(value)) {
        const itemShapes = depth < BODY_SHAPE_MAX_DEPTH
            ? value.slice(0, BODY_SHAPE_MAX_KEYS).map((item) => describeJsonShape(item, depth + 1))
            : []
        return { type: 'array', length: value.length, itemShapes }
    }
    if (typeof value === 'object') {
        const entries = Object.entries(value as Record<string, unknown>)
        const retainedEntries = entries.slice(0, BODY_SHAPE_MAX_KEYS)
        const keys = retainedEntries.map(([key]) => key)
        const properties = depth < BODY_SHAPE_MAX_DEPTH
            ? Object.fromEntries(retainedEntries.map(([key, item]) => [key, describeJsonShape(item, depth + 1)]))
            : undefined
        return {
            type: 'object',
            keys,
            truncatedKeyCount: Math.max(0, entries.length - retainedEntries.length),
            ...(properties ? { properties } : {}),
        }
    }

    return { type: typeof value as 'boolean' | 'number' | 'string' }
}

function describeResponseBody(body: string, contentType: string | null): ResponseBodyShape {
    const byteLength = Buffer.byteLength(body, 'utf8')
    if (body.length === 0) return { kind: 'empty', byteLength }

    if (contentType?.toLowerCase().includes('json')) {
        try {
            return { kind: 'json', byteLength, value: describeJsonShape(JSON.parse(body)) }
        } catch {
            return { kind: 'text', byteLength, preview: boundedText(body, 500) }
        }
    }

    return { kind: 'text', byteLength, preview: boundedText(body, 500) }
}

function installBoundedBrowserDiagnostics(page: Page) {
    const diagnostics: BoundedBrowserDiagnostics = {
        limit: DIAGNOSTIC_EVENT_LIMIT,
        events: [],
        droppedEventCount: 0,
    }
    let sequence = 0
    const append = (event: Omit<BrowserDiagnosticEvent, 'sequence'>) => {
        sequence += 1
        if (diagnostics.events.length < diagnostics.limit) {
            diagnostics.events.push({ sequence, ...event })
        } else {
            diagnostics.droppedEventCount += 1
        }
    }

    page.on('console', (message) => {
        if (message.type() !== 'error' && message.type() !== 'warning') return

        append({
            kind: 'console',
            severity: message.type() === 'warning' ? 'warning' : 'error',
            message: boundedText(message.text()),
            location: message.location(),
        })
    })
    page.on('pageerror', (error) => {
        append({
            kind: 'pageerror',
            severity: 'error',
            message: boundedText(error.message),
            stack: boundedText(error.stack),
            url: page.url(),
        })
    })
    page.on('requestfailed', (request) => {
        append({
            kind: 'requestfailed',
            severity: 'error',
            message: boundedText(request.failure()?.errorText ?? 'Request failed without an error string.'),
            url: boundedText(request.url(), 1_000),
            method: request.method(),
            resourceType: request.resourceType(),
        })
    })

    diagnosticsByPage.set(page, diagnostics)
}

function observeSettingsPatchExchanges(page: Page) {
    const exchanges: SettingsPatchExchange[] = []
    const pendingCaptures: Array<Promise<void>> = []
    let sequence = 0

    page.on('response', (response) => {
        const request = response.request()
        const url = new URL(request.url())
        if (url.pathname !== '/api/talos/settings' || request.method() !== 'PATCH') return

        sequence += 1
        const currentSequence = sequence
        const capture = (async () => {
            let payload: unknown = request.postData()
            try {
                payload = request.postDataJSON()
            } catch {
                // Preserve the raw request body when it is not valid JSON.
            }

            const contentType = response.headers()['content-type'] ?? null
            let bodyShape: ResponseBodyShape
            try {
                bodyShape = describeResponseBody(await response.text(), contentType)
            } catch (error) {
                bodyShape = {
                    kind: 'unavailable',
                    byteLength: null,
                    error: boundedText(error instanceof Error ? error.message : error, 500),
                }
            }

            exchanges.push({
                sequence: currentSequence,
                request: {
                    url: request.url(),
                    method: request.method(),
                    payload,
                },
                response: {
                    status: response.status(),
                    ok: response.ok(),
                    contentType,
                    bodyShape,
                },
            })
        })()
        pendingCaptures.push(capture)
    })

    return {
        async settle() {
            await Promise.all(pendingCaptures)
            return exchanges.sort((left, right) => left.sequence - right.sequence)
        },
    }
}

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

async function applyMotionV6Settings(
    page: Page,
    preset: TalosPresetId,
    mode: TalosMotionMode,
    expectedRevision: number,
) {
    const motionPreferences = createCompleteMotionV6Preferences(mode.mode, mode.backgroundEnabled)
    const responseRevision = await page.evaluate(async ({ preset: nextPreset, preferences, revision }) => {
        const response = await fetch('/api/talos/settings', {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                expected_revision: revision,
                preferences: {
                    theme: nextPreset,
                    reduced_motion: false,
                    theme_motion_v6: preferences,
                },
            }),
        })
        const ok = response.ok
        const status = response.status
        const body = await response.text()

        if (!ok) {
            throw new Error(`TALOS settings PATCH failed with ${status}: ${body.slice(0, 240)}`)
        }

        try {
            const parsed = JSON.parse(body) as { data?: { revision?: unknown } }
            return typeof parsed.data?.revision === 'number' ? parsed.data.revision : revision + 1
        } catch {
            return revision + 1
        }
    }, { preset, preferences: motionPreferences, revision: expectedRevision })

    await page.reload({ waitUntil: 'domcontentloaded' })
    await waitForWorkspaceReady(page)
    return responseRevision
}

async function readMotionV6RendererState(page: Page): Promise<MotionV6RendererState> {
    const workspace = await page.getByTestId('talos-workspace').evaluate((element) => ({
        themePreset: element.getAttribute('data-theme-preset'),
        requestedMode: element.getAttribute('data-motion-v6-requested'),
        effectiveMode: element.getAttribute('data-motion-v6-effective'),
    }))
    const background = page.getByTestId('talos-motion-background')
    const stage = page.locator('[data-talos-motion-stage]')

    return {
        workspace,
        stage: await stage.count() === 0
            ? {
                exists: false,
                requestedMode: null,
                effectiveMode: null,
                paused: null,
                fallbackReason: null,
                status: null,
                activeKind: null,
                sceneId: null,
                requestedSceneId: null,
                solidFallback: null,
                canvasCount: 0,
                simpleLayerCount: 0,
                simpleLayerRoles: [],
            }
            : await stage.evaluate((element) => ({
                exists: true,
                requestedMode: element.getAttribute('data-requested-mode'),
                effectiveMode: element.getAttribute('data-effective-mode'),
                paused: element.getAttribute('data-paused'),
                fallbackReason: element.getAttribute('data-fallback-reason'),
                status: element.getAttribute('data-status'),
                activeKind: element.getAttribute('data-active-kind'),
                sceneId: element.getAttribute('data-scene-id'),
                requestedSceneId: element.getAttribute('data-requested-scene-id'),
                solidFallback: element.getAttribute('data-solid-fallback'),
                canvasCount: element.querySelectorAll('[data-testid="talos-procedural-canvas"]').length,
                simpleLayerCount: element.querySelectorAll('.talos-v6-simple-layer').length,
                simpleLayerRoles: Array.from(element.querySelectorAll('.talos-v6-simple-layer')).map((layer) => layer.getAttribute('data-talos-motion-layer-role') ?? ''),
            })),
        background: {
            exists: await background.count() > 0,
            solidFallbackCount: await page.locator('[data-talos-motion-solid-fallback]').count(),
        },
    }
}

async function readCanvasSceneMetrics(page: Page): Promise<CanvasSceneMetrics> {
    const canvas = page.getByTestId('talos-procedural-canvas')
    if (await canvas.count() === 0) {
        return {
            exists: false,
            width: 0,
            height: 0,
            cssWidth: 0,
            cssHeight: 0,
            sampleStride: 0,
            sampledPixelCount: 0,
            alphaCoveredSampleCount: 0,
            alphaCoverageRatio: 0,
            dominantSampledRgb: null,
            uniqueSampledRgbCount: 0,
            sceneVariationSampleCount: 0,
            backgroundSceneVariationRatio: 0,
            sceneVariationRgbDistanceThreshold: SCENE_VARIATION_RGB_DISTANCE_THRESHOLD,
            hasVisibleSceneSignal: false,
        }
    }

    return canvas.evaluate((element, options) => {
        if (!(element instanceof HTMLCanvasElement)) {
            return {
                exists: false,
                width: 0,
                height: 0,
                cssWidth: 0,
                cssHeight: 0,
                sampleStride: 0,
                sampledPixelCount: 0,
                alphaCoveredSampleCount: 0,
                alphaCoverageRatio: 0,
                dominantSampledRgb: null,
                uniqueSampledRgbCount: 0,
                sceneVariationSampleCount: 0,
                backgroundSceneVariationRatio: 0,
                sceneVariationRgbDistanceThreshold: options.rgbDistanceThreshold,
                hasVisibleSceneSignal: false,
            }
        }

        const width = element.width
        const height = element.height
        const rect = element.getBoundingClientRect()
        const context = width > 0 && height > 0
            ? element.getContext('2d', { willReadFrequently: true })
            : null

        if (!context) {
            return {
                exists: true,
                width,
                height,
                cssWidth: rect.width,
                cssHeight: rect.height,
                sampleStride: 0,
                sampledPixelCount: 0,
                alphaCoveredSampleCount: 0,
                alphaCoverageRatio: 0,
                dominantSampledRgb: null,
                uniqueSampledRgbCount: 0,
                sceneVariationSampleCount: 0,
                backgroundSceneVariationRatio: 0,
                sceneVariationRgbDistanceThreshold: options.rgbDistanceThreshold,
                hasVisibleSceneSignal: false,
            }
        }

        const pixels = context.getImageData(0, 0, width, height).data
        const stride = Math.max(1, Math.ceil(Math.sqrt((width * height) / options.sampleLimit)))
        const rgbCounts = new Map<string, number>()
        const sampledRgb: number[] = []
        let sampledPixelCount = 0
        let alphaCoveredSampleCount = 0

        for (let y = 0; y < height; y += stride) {
            for (let x = 0; x < width; x += stride) {
                const offset = (y * width + x) * 4
                const red = pixels[offset]
                const green = pixels[offset + 1]
                const blue = pixels[offset + 2]
                const alpha = pixels[offset + 3]
                const rgbKey = `${red},${green},${blue}`
                rgbCounts.set(rgbKey, (rgbCounts.get(rgbKey) ?? 0) + 1)
                sampledRgb.push(red, green, blue)
                sampledPixelCount += 1
                if (alpha > 0) alphaCoveredSampleCount += 1
            }
        }

        let dominantKey: string | null = null
        let dominantSampleCount = 0
        for (const [rgbKey, sampleCount] of rgbCounts) {
            if (sampleCount > dominantSampleCount) {
                dominantKey = rgbKey
                dominantSampleCount = sampleCount
            }
        }

        const dominantChannels = dominantKey?.split(',').map(Number) ?? null
        let sceneVariationSampleCount = 0
        if (dominantChannels) {
            for (let index = 0; index < sampledRgb.length; index += 3) {
                const redDistance = sampledRgb[index] - dominantChannels[0]
                const greenDistance = sampledRgb[index + 1] - dominantChannels[1]
                const blueDistance = sampledRgb[index + 2] - dominantChannels[2]
                const rgbDistance = Math.sqrt(
                    redDistance * redDistance
                    + greenDistance * greenDistance
                    + blueDistance * blueDistance,
                )
                if (rgbDistance >= options.rgbDistanceThreshold) sceneVariationSampleCount += 1
            }
        }

        const alphaCoverageRatio = sampledPixelCount > 0 ? alphaCoveredSampleCount / sampledPixelCount : 0
        const backgroundSceneVariationRatio = sampledPixelCount > 0 ? sceneVariationSampleCount / sampledPixelCount : 0

        return {
            exists: true,
            width,
            height,
            cssWidth: rect.width,
            cssHeight: rect.height,
            sampleStride: stride,
            sampledPixelCount,
            alphaCoveredSampleCount,
            alphaCoverageRatio,
            dominantSampledRgb: dominantChannels
                ? {
                    red: dominantChannels[0],
                    green: dominantChannels[1],
                    blue: dominantChannels[2],
                    sampleCount: dominantSampleCount,
                }
                : null,
            uniqueSampledRgbCount: rgbCounts.size,
            sceneVariationSampleCount,
            backgroundSceneVariationRatio,
            sceneVariationRgbDistanceThreshold: options.rgbDistanceThreshold,
            hasVisibleSceneSignal: alphaCoveredSampleCount > 0 && sceneVariationSampleCount > 0,
        }
    }, {
        sampleLimit: CANVAS_PIXEL_SAMPLE_LIMIT,
        rgbDistanceThreshold: SCENE_VARIATION_RGB_DISTANCE_THRESHOLD,
    })
}

async function readDomSceneMetrics(page: Page): Promise<DomSceneMetrics> {
    const stage = page.locator('[data-talos-motion-stage]')
    if (await stage.count() === 0) {
        return {
            exists: false,
            layerCount: 0,
            visibleLayerCount: 0,
            roles: [],
            geometryFingerprint: '',
            hasVisibleSceneSignal: false,
        }
    }

    return stage.evaluate((element) => {
        const layers = Array.from(element.querySelectorAll<HTMLElement>('.talos-v6-simple-layer'))
        const geometry = layers.map((layer) => {
            const rect = layer.getBoundingClientRect()
            const style = getComputedStyle(layer)
            return [
                layer.dataset.talosMotionLayerId ?? '',
                layer.dataset.talosMotionLayerRole ?? '',
                Math.round(rect.left * 100) / 100,
                Math.round(rect.top * 100) / 100,
                Math.round(rect.width * 100) / 100,
                Math.round(rect.height * 100) / 100,
                style.transform,
                style.opacity,
            ].join('|')
        })
        const visibleLayerCount = layers.filter((layer) => {
            const rect = layer.getBoundingClientRect()
            return rect.width > 0 && rect.height > 0 && Number(getComputedStyle(layer).opacity) > 0
        }).length

        return {
            exists: layers.length > 0,
            layerCount: layers.length,
            visibleLayerCount,
            roles: layers.map((layer) => layer.dataset.talosMotionLayerRole ?? ''),
            geometryFingerprint: geometry.join(';'),
            hasVisibleSceneSignal: visibleLayerCount > 0,
        }
    })
}

async function sampleRendererWindow(page: Page): Promise<RendererSampleWindow> {
    return page.evaluate(async (options) => {
        type RendererRafContext = {
            startedAt: number
            rendererActivityCount: number
        }
        type RendererInstrumentationState = {
            active: boolean
            rendererActivityTimes: number[]
            rendererCallbackDurations: number[]
            rendererActivityCount: number
            rendererActivityRafCallbackCount: number
            rendererActivityOutsideRaf: number
            droppedRendererActivityTimestamps: number
            droppedRendererCallbackDurations: number
            currentRaf: RendererRafContext | null
        }
        type InstrumentedWindow = Window & { __talosMotionV6Instrumentation?: RendererInstrumentationState }
        type CanvasSample = {
            exists: boolean
            width: number
            height: number
            stride: number
            rgba: number[]
        }

        const state = (window as InstrumentedWindow).__talosMotionV6Instrumentation
        if (!state) {
            throw new Error('TALOS V6 renderer instrumentation was not installed before navigation.')
        }

        const sampleCanvas = (): CanvasSample => {
            const canvas = stage?.querySelector('[data-testid="talos-procedural-canvas"]')
            if (!(canvas instanceof HTMLCanvasElement) || canvas.width <= 0 || canvas.height <= 0) {
                return { exists: false, width: 0, height: 0, stride: 0, rgba: [] }
            }

            const context = canvas.getContext('2d', { willReadFrequently: true })
            if (!context) {
                return { exists: false, width: canvas.width, height: canvas.height, stride: 0, rgba: [] }
            }

            const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data
            const stride = Math.max(1, Math.ceil(Math.sqrt((canvas.width * canvas.height) / options.pixelSampleLimit)))
            const rgba: number[] = []
            for (let y = 0; y < canvas.height; y += stride) {
                for (let x = 0; x < canvas.width; x += stride) {
                    const offset = (y * canvas.width + x) * 4
                    rgba.push(pixels[offset], pixels[offset + 1], pixels[offset + 2], pixels[offset + 3])
                }
            }

            return { exists: true, width: canvas.width, height: canvas.height, stride, rgba }
        }

        const stage = document.querySelector<HTMLElement>('[data-talos-motion-stage]')
        const activeKind = stage?.dataset.activeKind ?? null
        const rendererActivitySource: RendererSampleWindow['rendererActivitySource'] = activeKind === 'complex'
            ? 'complex-canvas-clear'
            : activeKind === 'simple'
                ? 'simple-dom-style'
                : 'none'
        const sampleDom = (): string => Array.from(stage?.querySelectorAll<HTMLElement>('.talos-v6-simple-layer') ?? [])
            .map((layer) => {
                const rect = layer.getBoundingClientRect()
                const style = getComputedStyle(layer)
                return [
                    layer.dataset.talosMotionLayerId ?? '',
                    Math.round(rect.left * 100) / 100,
                    Math.round(rect.top * 100) / 100,
                    Math.round(rect.width * 100) / 100,
                    Math.round(rect.height * 100) / 100,
                    style.transform,
                    style.opacity,
                ].join('|')
            })
            .join(';')

        const beforeFrame = sampleCanvas()
        const beforeDom = sampleDom()
        state.active = true
        state.rendererActivityTimes = []
        state.rendererCallbackDurations = []
        state.rendererActivityCount = 0
        state.rendererActivityRafCallbackCount = 0
        state.rendererActivityOutsideRaf = 0
        state.droppedRendererActivityTimestamps = 0
        state.droppedRendererCallbackDurations = 0
        state.currentRaf = null
        const startedAt = performance.now()

        let endedAt = startedAt
        try {
            if (activeKind === 'simple') {
                await new Promise<void>((resolve) => {
                    const deadline = startedAt + options.requestedSampleWindowMs
                    let previous = beforeDom
                    const sample = () => {
                        const now = performance.now()
                        const current = sampleDom()
                        if (current !== previous) {
                            state.rendererActivityCount += 1
                            if (state.rendererActivityTimes.length < options.maxSamples) {
                                state.rendererActivityTimes.push(now)
                            } else {
                                state.droppedRendererActivityTimestamps += 1
                            }
                            state.rendererActivityRafCallbackCount += 1
                            previous = current
                        }
                        if (now >= deadline) {
                            resolve()
                            return
                        }
                        window.requestAnimationFrame(sample)
                    }
                    window.requestAnimationFrame(sample)
                })
            } else {
                await new Promise<void>((resolve) => window.setTimeout(resolve, options.requestedSampleWindowMs))
            }
        } finally {
            endedAt = performance.now()
            state.active = false
            state.currentRaf = null
        }

        const afterFrame = sampleCanvas()
        const afterDom = sampleDom()
        const actualElapsedMs = endedAt - startedAt
        const activityTimes = activeKind === 'simple' ? state.rendererActivityTimes : state.rendererActivityTimes
        const intervals = activityTimes
            .slice(1)
            .map((time, index) => time - activityTimes[index])
        const observedFps = actualElapsedMs > 0
            ? activityTimes.length / (actualElapsedMs / 1000)
            : 0

        const localPercentile = (values: number[], fraction: number) => {
            if (values.length === 0) return null

            const sorted = [...values].sort((left, right) => left - right)
            return sorted[Math.max(0, Math.ceil(sorted.length * fraction) - 1)] ?? null
        }

        let visualFrameDelta: RendererSampleWindow['visualFrameDelta'] = {
            comparable: false,
            reason: rendererActivitySource === 'none' ? 'No active V6 renderer stage was present.' : 'Renderer samples were unavailable.',
            sampledPairCount: 0,
            changedSampleCount: 0,
            changedSampleRatio: null,
            rgbDistanceThreshold: options.frameDeltaRgbDistanceThreshold,
            alphaDistanceThreshold: options.frameDeltaAlphaDistanceThreshold,
        }
        if (
            beforeFrame.exists
            && afterFrame.exists
            && beforeFrame.width === afterFrame.width
            && beforeFrame.height === afterFrame.height
            && beforeFrame.stride === afterFrame.stride
            && beforeFrame.rgba.length === afterFrame.rgba.length
        ) {
            let changedSampleCount = 0
            const sampledPairCount = beforeFrame.rgba.length / 4
            for (let index = 0; index < beforeFrame.rgba.length; index += 4) {
                const redDistance = afterFrame.rgba[index] - beforeFrame.rgba[index]
                const greenDistance = afterFrame.rgba[index + 1] - beforeFrame.rgba[index + 1]
                const blueDistance = afterFrame.rgba[index + 2] - beforeFrame.rgba[index + 2]
                const alphaDistance = Math.abs(afterFrame.rgba[index + 3] - beforeFrame.rgba[index + 3])
                const rgbDistance = Math.sqrt(
                    redDistance * redDistance
                    + greenDistance * greenDistance
                    + blueDistance * blueDistance,
                )
                if (
                    rgbDistance >= options.frameDeltaRgbDistanceThreshold
                    || alphaDistance >= options.frameDeltaAlphaDistanceThreshold
                ) {
                    changedSampleCount += 1
                }
            }

            visualFrameDelta = {
                comparable: true,
                reason: null,
                sampledPairCount,
                changedSampleCount,
                changedSampleRatio: sampledPairCount > 0 ? changedSampleCount / sampledPairCount : 0,
                rgbDistanceThreshold: options.frameDeltaRgbDistanceThreshold,
                alphaDistanceThreshold: options.frameDeltaAlphaDistanceThreshold,
            }
        } else if (beforeFrame.exists && afterFrame.exists) {
            visualFrameDelta.reason = 'Canvas dimensions or sampling stride changed during the requested window.'
        } else if (stage && (rendererActivitySource === 'simple-dom-style' || activeKind === 'static')) {
            visualFrameDelta = {
                comparable: true,
                reason: null,
                sampledPairCount: 1,
                changedSampleCount: beforeDom !== afterDom ? 1 : 0,
                changedSampleRatio: beforeDom !== afterDom ? 1 : 0,
                rgbDistanceThreshold: options.frameDeltaRgbDistanceThreshold,
                alphaDistanceThreshold: options.frameDeltaAlphaDistanceThreshold,
            }
        }

        return {
            rendererActivitySource,
            requestedSampleWindowMs: options.requestedSampleWindowMs,
            actualElapsedMs,
            timerOverrun: actualElapsedMs > options.requestedSampleWindowMs,
            timerOverrunMs: Math.max(0, actualElapsedMs - options.requestedSampleWindowMs),
            rendererActivityCount: state.rendererActivityCount,
            capturedRendererActivityTimestamps: activityTimes.length,
            droppedRendererActivityTimestamps: state.droppedRendererActivityTimestamps,
            rendererActivityRafCallbackCount: state.rendererActivityRafCallbackCount,
            capturedRendererCallbackDurations: state.rendererCallbackDurations.length,
            droppedRendererCallbackDurations: state.droppedRendererCallbackDurations,
            rendererActivityOutsideRaf: state.rendererActivityOutsideRaf,
            rendererCallbackDurationMs: {
                p50: localPercentile(state.rendererCallbackDurations, 0.5),
                p95: localPercentile(state.rendererCallbackDurations, 0.95),
                max: state.rendererCallbackDurations.length > 0 ? Math.max(...state.rendererCallbackDurations) : null,
            },
            observedCadence: {
                frameCount: activityTimes.length,
                observedFps,
                intervalMs: {
                    p50: localPercentile(intervals, 0.5),
                    p95: localPercentile(intervals, 0.95),
                    max: intervals.length > 0 ? Math.max(...intervals) : null,
                },
            },
            visualFrameDelta,
        }
    }, {
        requestedSampleWindowMs: RAF_SAMPLE_WINDOW_MS,
        pixelSampleLimit: CANVAS_PIXEL_SAMPLE_LIMIT,
        maxSamples: RAF_SAMPLE_LIMIT,
        frameDeltaRgbDistanceThreshold: FRAME_DELTA_RGB_DISTANCE_THRESHOLD,
        frameDeltaAlphaDistanceThreshold: FRAME_DELTA_ALPHA_DISTANCE_THRESHOLD,
    })
}

test.describe.configure({ mode: 'serial' })

test.beforeEach(async ({ page, isMobile, baseURL }) => {
    requireLoopbackHttpUrl(baseURL, 'Configured Playwright baseURL')
    installBoundedBrowserDiagnostics(page)

    await page.addInitScript(({ maxSamples }) => {
        type RendererRafContext = {
            startedAt: number
            rendererActivityCount: number
        }
        type RendererInstrumentationState = {
            active: boolean
            rendererActivityTimes: number[]
            rendererCallbackDurations: number[]
            rendererActivityCount: number
            rendererActivityRafCallbackCount: number
            rendererActivityOutsideRaf: number
            droppedRendererActivityTimestamps: number
            droppedRendererCallbackDurations: number
            currentRaf: RendererRafContext | null
        }

        const state: RendererInstrumentationState = {
            active: false,
            rendererActivityTimes: [],
            rendererCallbackDurations: [],
            rendererActivityCount: 0,
            rendererActivityRafCallbackCount: 0,
            rendererActivityOutsideRaf: 0,
            droppedRendererActivityTimestamps: 0,
            droppedRendererCallbackDurations: 0,
            currentRaf: null,
        }
        const nativeRequestAnimationFrame = window.requestAnimationFrame.bind(window)

        window.requestAnimationFrame = (callback) => nativeRequestAnimationFrame((timestamp) => {
            if (!state.active) {
                callback(timestamp)
                return
            }

            const rafContext: RendererRafContext = {
                startedAt: performance.now(),
                rendererActivityCount: 0,
            }
            const previousRaf = state.currentRaf
            state.currentRaf = rafContext

            try {
                callback(timestamp)
            } finally {
                state.currentRaf = previousRaf
                if (rafContext.rendererActivityCount > 0) {
                    state.rendererActivityRafCallbackCount += 1
                    const duration = performance.now() - rafContext.startedAt
                    if (state.rendererCallbackDurations.length < maxSamples) {
                        state.rendererCallbackDurations.push(duration)
                    } else {
                        state.droppedRendererCallbackDurations += 1
                    }
                }
            }
        })

        const canvasContext = window.CanvasRenderingContext2D
        if (canvasContext) {
            const nativeClearRect = canvasContext.prototype.clearRect
            canvasContext.prototype.clearRect = function (...args) {
                const canvas = this.canvas
                const stage = canvas?.closest<HTMLElement>('[data-talos-motion-stage]')
                if (state.active && stage?.dataset.activeKind === 'complex') {
                    state.rendererActivityCount += 1
                    if (state.rendererActivityTimes.length < maxSamples) {
                        state.rendererActivityTimes.push(performance.now())
                    } else {
                        state.droppedRendererActivityTimestamps += 1
                    }
                    if (state.currentRaf) {
                        state.currentRaf.rendererActivityCount += 1
                    } else {
                        state.rendererActivityOutsideRaf += 1
                    }
                }
                return nativeClearRect.apply(this, args)
            }
        }

        Object.defineProperty(window, '__talosMotionV6Instrumentation', {
            configurable: true,
            value: state,
        })
    }, {
        maxSamples: RAF_SAMPLE_LIMIT,
    })

    if (!isMobile) {
        await page.setViewportSize(DESKTOP_VIEWPORT)
    }

    await installTalosApiMocks(page)
    await page.emulateMedia({ reducedMotion: 'no-preference' })
    await ensureTalosAuthenticated(page)
})

test('records the TALOS Theme Motion Engine V6 A0 baseline', async ({ page, isMobile, baseURL }, testInfo) => {
    test.setTimeout(300_000)

    const configuredBaseURL = requireLoopbackHttpUrl(baseURL, 'Configured Playwright baseURL')
    const viewport = await page.evaluate(() => ({ width: window.innerWidth, height: window.innerHeight }))
    if (!isMobile) {
        expect(viewport).toEqual(DESKTOP_VIEWPORT)
    }

    const settingsPatchCollector = observeSettingsPatchExchanges(page)

    const cases = isMobile
        ? TALOS_MOTION_MODES.map((mode) => ({
            preset: 'signal' as TalosPresetId,
            mode,
            coverage: 'mobile-representative' as const,
        }))
        : [
            ...TALOS_MOTION_MODES.slice(0, 2).flatMap((mode) => TALOS_PRESET_IDS.map((preset) => ({
                preset,
                mode,
                coverage: 'desktop-12-presets' as const,
            }))),
            ...TALOS_MOTION_MODES.slice(2).map((mode) => ({
                preset: 'signal' as TalosPresetId,
                mode,
                coverage: 'desktop-representative-mode' as const,
            })),
    ]
    const caseMeasurements: Array<Record<string, unknown>> = []
    let expectedSettingsRevision = 0

    for (const currentCase of cases) {
        expectedSettingsRevision = await applyMotionV6Settings(page, currentCase.preset, currentCase.mode, expectedSettingsRevision)

        const workspace = page.getByTestId('talos-workspace')
        const background = page.getByTestId('talos-motion-background')
        const stage = page.locator('[data-talos-motion-stage]')
        await expect(workspace).toHaveAttribute('data-theme-preset', currentCase.preset)
        await expect(workspace).toHaveAttribute('data-motion-v6-requested', currentCase.mode.mode)
        await expect(workspace).toHaveAttribute('data-motion-v6-effective', currentCase.mode.expectedEffectiveMode)
        await expect(background).toBeVisible()
        await expect(stage).toHaveCount(currentCase.mode.expectedActiveKind === null ? 0 : 1)

        const motionV6RendererState = await readMotionV6RendererState(page)
        expect(motionV6RendererState.workspace).toEqual({
            themePreset: currentCase.preset,
            requestedMode: currentCase.mode.mode,
            effectiveMode: currentCase.mode.expectedEffectiveMode,
        })
        expect(motionV6RendererState.stage.exists).toBe(currentCase.mode.expectedActiveKind !== null)
        if (currentCase.mode.expectedActiveKind === null) {
            expect(motionV6RendererState.stage.canvasCount).toBe(0)
            expect(motionV6RendererState.stage.simpleLayerCount).toBe(0)
        } else {
            await expect(stage).toHaveAttribute('data-requested-mode', currentCase.mode.mode)
            await expect(stage).toHaveAttribute('data-effective-mode', currentCase.mode.expectedEffectiveMode)
            await expect(stage).toHaveAttribute('data-status', 'active')
            await expect(stage).toHaveAttribute('data-active-kind', currentCase.mode.expectedActiveKind)
            await expect(stage).toHaveAttribute('data-scene-id', currentCase.preset)
            await expect(stage).toHaveAttribute('data-requested-scene-id', currentCase.preset)
            await expect(stage).toHaveAttribute('data-paused', 'false')
            await expect(stage).toHaveAttribute('data-fallback-reason', '')
            await expect(stage).toHaveAttribute('data-solid-fallback', 'false')
            if (currentCase.mode.expectedActiveKind === 'complex') {
                await expect(stage.locator('[data-testid="talos-procedural-canvas"]')).toHaveCount(1)
                await expect(stage.locator('.talos-v6-simple-layer')).toHaveCount(0)
            } else {
                await expect(stage.locator('[data-testid="talos-procedural-canvas"]')).toHaveCount(0)
                expect(await stage.locator('.talos-v6-simple-layer').count()).toBeGreaterThan(0)
            }
        }

        const canvasSceneMetrics = await readCanvasSceneMetrics(page)
        const domSceneMetrics = await readDomSceneMetrics(page)
        const rendererSampleWindow = await sampleRendererWindow(page)
        const screenshotPageUrl = requireLoopbackHttpUrl(page.url(), 'Current TALOS screenshot page URL')

        if (currentCase.mode.expectedActiveKind === 'complex') {
            expect(canvasSceneMetrics.hasVisibleSceneSignal).toBe(true)
            expect(rendererSampleWindow.rendererActivitySource).toBe('complex-canvas-clear')
            expect(rendererSampleWindow.rendererActivityCount).toBeGreaterThan(0)
            expect(rendererSampleWindow.rendererActivityOutsideRaf).toBe(0)
            expect(rendererSampleWindow.visualFrameDelta.comparable).toBe(true)
            expect(rendererSampleWindow.visualFrameDelta.changedSampleRatio).toBeGreaterThan(0)
        } else if (currentCase.mode.expectedActiveKind === 'simple') {
            expect(domSceneMetrics.hasVisibleSceneSignal).toBe(true)
            expect(rendererSampleWindow.rendererActivitySource).toBe('simple-dom-style')
            expect(rendererSampleWindow.rendererActivityCount).toBeGreaterThan(0)
            expect(rendererSampleWindow.visualFrameDelta.comparable, JSON.stringify(rendererSampleWindow)).toBe(true)
            expect(rendererSampleWindow.visualFrameDelta.changedSampleRatio, JSON.stringify(rendererSampleWindow)).toBeGreaterThan(0)
        } else if (currentCase.mode.expectedActiveKind === 'static') {
            expect(domSceneMetrics.hasVisibleSceneSignal).toBe(true)
            expect(rendererSampleWindow.rendererActivitySource).toBe('none')
            expect(rendererSampleWindow.rendererActivityCount).toBe(0)
            expect(rendererSampleWindow.visualFrameDelta.comparable).toBe(true)
            expect(rendererSampleWindow.visualFrameDelta.changedSampleRatio).toBe(0)
        } else {
            expect(rendererSampleWindow.rendererActivitySource).toBe('none')
            expect(rendererSampleWindow.rendererActivityCount).toBe(0)
            expect(rendererSampleWindow.visualFrameDelta.comparable).toBe(false)
        }

        await testInfo.attach(`talos-v6-baseline-${currentCase.mode.id}-${currentCase.preset}.png`, {
            body: await page.screenshot({ animations: 'disabled' }),
            contentType: 'image/png',
        })

        caseMeasurements.push({
            coverage: currentCase.coverage,
            preset: currentCase.preset,
            mode: currentCase.mode.id,
            viewport,
            screenshotPageUrl,
            motionV6Settings: {
                theme: currentCase.preset,
                reduced_motion: false,
                theme_motion_v6: createCompleteMotionV6Preferences(currentCase.mode.mode, currentCase.mode.backgroundEnabled),
            },
            motionV6RendererState,
            domSceneMetrics,
            canvasSceneMetrics,
            rendererSampleWindow,
        })
    }

    const settingsPatchExchanges = await settingsPatchCollector.settle()
    expect(settingsPatchExchanges).toHaveLength(cases.length)
    expect(settingsPatchExchanges.every(({ response }) => response.ok)).toBe(true)
    expect(settingsPatchExchanges.every(({ response }) => response.contentType !== null)).toBe(true)
    expect(settingsPatchExchanges.every(({ response }) => response.bodyShape.kind !== 'unavailable')).toBe(true)
    expect(settingsPatchExchanges.map(({ request }) => (request.payload as { expected_revision?: unknown }).expected_revision))
        .toEqual(cases.map((_, index) => index))
    settingsPatchExchanges.forEach(({ request }, index) => {
        const payload = request.payload as { preferences?: Record<string, unknown> }
        expect(payload.preferences?.theme_motion_v6).toEqual(
            createCompleteMotionV6Preferences(cases[index].mode.mode, cases[index].mode.backgroundEnabled),
        )
    })

    const browserDiagnostics = diagnosticsByPage.get(page)
    if (!browserDiagnostics) {
        throw new Error('Bounded browser diagnostics were not installed before navigation.')
    }

    await testInfo.attach(`talos-v6-baseline-${testInfo.project.name}.json`, {
        body: Buffer.from(JSON.stringify({
            schema: 'talos_theme_motion_v6_a0_baseline_v3',
            schemaVersion: 3,
            harness: 'QA-0/V6-renderer-stage',
            project: testInfo.project.name,
            configuredBaseURL,
            viewport,
            coverage: isMobile ? 'mobile-representative-five-mode' : 'desktop-12-presets-simple-complex-plus-mode-probes',
            presetIds: TALOS_PRESET_IDS,
            modes: TALOS_MOTION_MODES,
            screenshotSafety: {
                policy: 'loopback-only',
                allowedHostnames: ['localhost', '127.0.0.1', '::1'],
                configuredBaseURLCheckedBeforeNavigation: true,
                currentPageUrlCheckedBeforeEveryCapture: true,
            },
            persistenceEvidenceScope: {
                kind: 'mocked-ui-state-persistence',
                apiMock: 'installTalosApiMocks',
                stateLifetime: 'in-memory for this Playwright test page',
                verifiesWorkspaceReloadFromMockedSettingsState: true,
                verifiesLaravelDatabasePersistence: false,
                statement: 'PATCH and GET /api/talos/settings are fulfilled by the Playwright API mock. This report proves mocked UI-state persistence across reloads, not Laravel database persistence.',
            },
            measurementDefinitions: {
                canvasScene: {
                    alphaCoverageRatio: 'Sampled pixels with alpha > 0 divided by all sampled pixels.',
                    backgroundSceneVariationRatio: `Sampled pixels whose Euclidean 8-bit sRGB distance from the dominant sampled RGB is at least ${SCENE_VARIATION_RGB_DISTANCE_THRESHOLD}, divided by all sampled pixels.`,
                    physicalOccupancyClaimed: false,
                },
                rendererTiming: {
                    activitySources: ['complex-canvas-clear', 'simple-dom-style', 'none'],
                    callbackScope: 'Complex callback duration is recorded only when a V6 Complex canvas clear occurs inside that currently executing wrapped requestAnimationFrame callback; Simple activity is a changed DOM style sample.',
                    unrelatedPageRafCallbacksIncluded: false,
                    fallbackActivityAccepted: false,
                    sampleWindow: 'The timer requests a sampling window. actualElapsedMs and timerOverrun report event-loop delay; the timer is not a hard runtime bound.',
                },
                visualFrameDelta: {
                    changedSample: `RGB distance >= ${FRAME_DELTA_RGB_DISTANCE_THRESHOLD} or alpha distance >= ${FRAME_DELTA_ALPHA_DISTANCE_THRESHOLD} between matched before/after canvas samples.`,
                },
            },
            settingsPatchExchanges,
            browserDiagnostics: {
                limit: browserDiagnostics.limit,
                capturedEventCount: browserDiagnostics.events.length,
                droppedEventCount: browserDiagnostics.droppedEventCount,
                events: browserDiagnostics.events,
            },
            rendererDiagnosticsNote: 'Requested/effective state comes from the V6 workspace and Motion Stage attributes. Renderer kind is read from the active stage and its current DOM/Canvas surface; no compatibility attributes are used as V6 evidence.',
            caseMeasurements,
        }, null, 2), 'utf8'),
        contentType: 'application/json',
    })
})
