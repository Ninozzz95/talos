import { expect, test, type Page } from '@playwright/test'
import { installTalosApiMocks } from './helpers/talosApiMocks'
import type {
    TalosMotionRendererMode,
    TalosMotionV6Preferences,
} from '../../resources/js/motion-v6/contracts'
import { TALOS_THEME_PRESETS } from '../../resources/js/lib/talosThemes'

const e2eSetupEmail = 'talos-e2e@example.test'
const e2eSetupPassword = 'talos-e2e-password-123'
const e2eLoginEmail = process.env.TALOS_E2E_EMAIL ?? 'test@example.com'
const e2eLoginPassword = process.env.TALOS_E2E_PASSWORD ?? 'password'

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

async function setThemePreferences(
    page: Page,
    preferences: Record<string, unknown>,
    expectedRevision = 0,
) {
    return page.evaluate(async ({ nextPreferences, revision }) => {
        await fetch('/api/talos/settings', {
            method: 'PATCH',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                expected_revision: revision,
                preferences: nextPreferences,
            }),
        })
            .then(async (response) => {
                const body = await response.text()
                if (!response.ok) {
                    throw new Error(`TALOS settings PATCH failed with ${response.status}: ${body.slice(0, 240)}`)
                }
                try {
                    const parsed = JSON.parse(body) as { data?: { revision?: unknown } }
                    return typeof parsed.data?.revision === 'number' ? parsed.data.revision : revision + 1
                } catch {
                    return revision + 1
                }
            })
    }, { nextPreferences: preferences, revision: expectedRevision }).then(async (revision) => {
        await page.reload({ waitUntil: 'domcontentloaded' })
        await waitForWorkspaceReady(page)
        return revision
    })
}

async function measureCanvasCadence(page: Page, intervalMs: number) {
    const background = page.getByTestId('talos-motion-background')
    await expect(background).toBeVisible()

    return background.evaluate(async (element, duration) => {
        type MotionV6PerformanceState = {
            active: boolean
            rendererFrameTimes: number[]
            rendererCallbackDurations: number[]
            rendererActivityOutsideRaf: number
        }
        type InstrumentedWindow = Window & { __talosMotionV6Performance?: MotionV6PerformanceState }
        const state = (window as InstrumentedWindow).__talosMotionV6Performance
        if (!state) throw new Error('TALOS V6 performance instrumentation was not installed before navigation.')

        state.active = true
        state.rendererFrameTimes = []
        state.rendererCallbackDurations = []
        state.rendererActivityOutsideRaf = 0

        const startedAt = performance.now()
        try {
            await new Promise<void>((resolve) => window.setTimeout(resolve, duration))
        } finally {
            state.active = false
        }

        const elapsedMs = performance.now() - startedAt
        const frames = state.rendererFrameTimes.filter((time) => time >= startedAt && time <= startedAt + elapsedMs)
        const intervals = frames.slice(1).map((time, index) => time - frames[index])
        const sortedIntervals = [...intervals].sort((left, right) => left - right)
        const p95Index = Math.max(0, Math.ceil(sortedIntervals.length * 0.95) - 1)
        const sortedCallbackDurations = [...state.rendererCallbackDurations].sort((left, right) => left - right)
        const p95CallbackIndex = Math.max(0, Math.ceil(sortedCallbackDurations.length * 0.95) - 1)

        return {
            elapsedMs,
            frameCount: frames.length,
            observedFps: frames.length / (elapsedMs / 1000),
            intervals,
            p95IntervalMs: sortedIntervals[p95Index] ?? Number.POSITIVE_INFINITY,
            maxIntervalMs: intervals.length > 0 ? Math.max(...intervals) : Number.POSITIVE_INFINITY,
            rendererCallbackCount: state.rendererCallbackDurations.length,
            rendererCallbackP95Ms: sortedCallbackDurations[p95CallbackIndex] ?? null,
            rendererActivityOutsideRaf: state.rendererActivityOutsideRaf,
        }
    }, intervalMs)
}

async function readDomRendererFingerprint(page: Page) {
    const stage = page.locator('[data-talos-motion-stage]')
    if (await stage.count() === 0) return null

    return stage.evaluate((element) => JSON.stringify(Array.from(element.querySelectorAll<HTMLElement>('.talos-v6-simple-layer')).map((layer) => {
        const rect = layer.getBoundingClientRect()
        const style = getComputedStyle(layer)
        return {
            id: layer.dataset.talosMotionLayerId ?? '',
            role: layer.dataset.talosMotionLayerRole ?? '',
            left: Math.round(rect.left * 100) / 100,
            top: Math.round(rect.top * 100) / 100,
            width: Math.round(rect.width * 100) / 100,
            height: Math.round(rect.height * 100) / 100,
            transform: style.transform,
            opacity: style.opacity,
        }
    })))
}

async function readMotionLifecycleSnapshot(page: Page) {
    return page.evaluate(() => {
        type MotionLifecycleState = {
            snapshot: () => {
                pendingRafCount: number
                activeIntervalCount: number
                activeResizeObserverCount: number
                observedResizeTargetCount: number
                trackedListenerCount: number
            }
        }
        const lifecycle = (window as typeof window & { __talosMotionV6Lifecycle?: MotionLifecycleState }).__talosMotionV6Lifecycle
        if (!lifecycle) throw new Error('TALOS V6 lifecycle instrumentation was not installed before navigation.')

        return {
            ...lifecycle.snapshot(),
            canvasCount: document.querySelectorAll('[data-talos-motion-stage] canvas').length,
            stageCount: document.querySelectorAll('[data-talos-motion-stage]').length,
        }
    })
}

test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
        const metrics = {
            cls: 0,
            longTasks: [] as Array<{ startTime: number, duration: number }>,
            shifts: [] as Array<{ value: number, sources: string[] }>,
        }

        Object.defineProperty(window, '__talosPerformanceMetrics', {
            configurable: true,
            value: metrics,
        })

        try {
            new PerformanceObserver((list) => {
                for (const entry of list.getEntries()) {
                    const shift = entry as PerformanceEntry & {
                        hadRecentInput?: boolean
                        value?: number
                        sources?: Array<{ node?: Node | null }>
                    }
                    if (!shift.hadRecentInput) {
                        const value = shift.value ?? 0
                        metrics.cls += value
                        metrics.shifts.push({
                            value,
                            sources: (shift.sources ?? []).map((source) => {
                                const node = source.node
                                if (!(node instanceof Element)) return 'unknown'

                                return `${node.tagName.toLowerCase()}${node.id ? `#${node.id}` : ''}${node.classList.length ? `.${[...node.classList].slice(0, 3).join('.')}` : ''}`
                            }),
                        })
                    }
                }
            }).observe({ type: 'layout-shift', buffered: true })
        } catch {
            // Unsupported observers leave a deterministic zero-valued metric.
        }

        try {
            new PerformanceObserver((list) => {
                for (const entry of list.getEntries()) {
                    metrics.longTasks.push({ startTime: entry.startTime, duration: entry.duration })
                }
            }).observe({ type: 'longtask', buffered: true })
        } catch {
            // Chromium exposes long tasks; this keeps the diagnostic portable.
        }
    })
    await page.addInitScript(({ maxSamples }) => {
        type RendererRafContext = {
            startedAt: number
            rendererActivityCount: number
        }
        type MotionV6PerformanceState = {
            active: boolean
            rendererFrameTimes: number[]
            rendererCallbackDurations: number[]
            rendererActivityOutsideRaf: number
            currentRaf: RendererRafContext | null
        }

        const state: MotionV6PerformanceState = {
            active: false,
            rendererFrameTimes: [],
            rendererCallbackDurations: [],
            rendererActivityOutsideRaf: 0,
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
                    const duration = performance.now() - rafContext.startedAt
                    if (state.rendererCallbackDurations.length < maxSamples) {
                        state.rendererCallbackDurations.push(duration)
                    }
                }
            }
        })

        const canvasContext = window.CanvasRenderingContext2D
        if (canvasContext) {
            const nativeClearRect = canvasContext.prototype.clearRect
            canvasContext.prototype.clearRect = function (x, y, width, height) {
                const stage = this.canvas?.closest<HTMLElement>('[data-talos-motion-stage]')
                if (state.active && stage?.dataset.activeKind === 'complex') {
                    if (state.rendererFrameTimes.length < maxSamples) {
                        state.rendererFrameTimes.push(performance.now())
                    }
                    if (state.currentRaf) {
                        state.currentRaf.rendererActivityCount += 1
                    } else {
                        state.rendererActivityOutsideRaf += 1
                    }
                }
                return nativeClearRect.call(this, x, y, width, height)
            }
        }

        Object.defineProperty(window, '__talosMotionV6Performance', {
            configurable: true,
            value: state,
        })
    }, { maxSamples: 512 })
    await page.addInitScript(() => {
        const nativeRequestAnimationFrame = window.requestAnimationFrame.bind(window)
        const nativeCancelAnimationFrame = window.cancelAnimationFrame.bind(window)
        const nativeSetInterval = window.setInterval.bind(window)
        const nativeClearInterval = window.clearInterval.bind(window)
        const nativeResizeObserver = window.ResizeObserver
        const nativeAddEventListener = EventTarget.prototype.addEventListener
        const nativeRemoveEventListener = EventTarget.prototype.removeEventListener
        const pendingRafIds = new Set<number>()
        const activeIntervalIds = new Set<number>()
        const resizeObservers = new Set<{ targets: Set<Element>, disconnected: boolean }>()
        const listenerIds = new WeakMap<object, number>()
        const trackedListeners = new Set<string>()
        let nextListenerId = 1

        window.requestAnimationFrame = (callback) => {
            let id = 0
            id = nativeRequestAnimationFrame((timestamp) => {
                pendingRafIds.delete(id)
                callback(timestamp)
            })
            pendingRafIds.add(id)
            return id
        }
        window.cancelAnimationFrame = (id) => {
            pendingRafIds.delete(id)
            nativeCancelAnimationFrame(id)
        }
        window.setInterval = ((handler: TimerHandler, timeout?: number, ...args: unknown[]) => {
            const id = nativeSetInterval(handler, timeout, ...args)
            activeIntervalIds.add(id)
            return id
        }) as typeof window.setInterval
        window.clearInterval = ((id?: number) => {
            if (typeof id === 'number') activeIntervalIds.delete(id)
            nativeClearInterval(id)
        }) as typeof window.clearInterval

        if (nativeResizeObserver) {
            class InstrumentedResizeObserver {
                private readonly observer: ResizeObserver
                private readonly record = { targets: new Set<Element>(), disconnected: false }

                constructor(callback: ResizeObserverCallback) {
                    this.observer = new nativeResizeObserver(callback)
                    resizeObservers.add(this.record)
                }

                observe(target: Element, options?: ResizeObserverOptions) {
                    this.record.disconnected = false
                    this.record.targets.add(target)
                    resizeObservers.add(this.record)
                    this.observer.observe(target, options)
                }

                unobserve(target: Element) {
                    this.record.targets.delete(target)
                    this.observer.unobserve(target)
                }

                disconnect() {
                    this.record.targets.clear()
                    this.record.disconnected = true
                    resizeObservers.delete(this.record)
                    this.observer.disconnect()
                }
            }
            Object.defineProperty(window, 'ResizeObserver', { configurable: true, writable: true, value: InstrumentedResizeObserver })
        }

        function listenerKey(target: EventTarget, type: string, listener: EventListenerOrEventListenerObject | null, options?: boolean | AddEventListenerOptions) {
            if (!listener || (target !== window && target !== document)) return null
            if (!['resize', 'visibilitychange', 'orientationchange'].includes(type)) return null
            const listenerObject = listener as object
            let id = listenerIds.get(listenerObject)
            if (!id) {
                id = nextListenerId
                nextListenerId += 1
                listenerIds.set(listenerObject, id)
            }
            const capture = typeof options === 'boolean' ? options : options?.capture === true
            return `${target === window ? 'window' : 'document'}:${type}:${capture ? 'capture' : 'bubble'}:${id}`
        }

        EventTarget.prototype.addEventListener = function (type, listener, options) {
            const key = listenerKey(this, type, listener, options)
            if (key) trackedListeners.add(key)
            nativeAddEventListener.call(this, type, listener, options)
        }
        EventTarget.prototype.removeEventListener = function (type, listener, options) {
            const key = listenerKey(this, type, listener, options)
            if (key) trackedListeners.delete(key)
            nativeRemoveEventListener.call(this, type, listener, options)
        }

        Object.defineProperty(window, '__talosMotionV6Lifecycle', {
            configurable: true,
            value: Object.freeze({
                snapshot: () => Object.freeze({
                    pendingRafCount: pendingRafIds.size,
                    activeIntervalCount: activeIntervalIds.size,
                    activeResizeObserverCount: resizeObservers.size,
                    observedResizeTargetCount: Array.from(resizeObservers).reduce((total, observer) => total + observer.targets.size, 0),
                    trackedListenerCount: trackedListeners.size,
                }),
            }),
        })
    })
    await installTalosApiMocks(page)
    await page.emulateMedia({ reducedMotion: 'no-preference' })
    await ensureTalosAuthenticated(page)
})

test('warm window interactions meet responsiveness and layout stability budgets', async ({ page, isMobile }) => {
    await page.evaluate(async () => { await document.fonts.ready })
    const settingsButton = page.getByRole('button', { name: 'Settings', exact: true })
    const settingsWindow = page.locator('[data-window-id="settings"]')

    await settingsButton.click()
    await expect(settingsWindow).toBeVisible()
    await expect(settingsWindow.getByText('Loading settings', { exact: true })).toBeHidden()
    await settingsWindow.getByRole('button', { name: 'Close Settings', exact: true }).click()
    await expect(settingsWindow).toHaveCount(0)

    const baseline = await page.evaluate(() => {
        const metrics = (window as typeof window & {
            __talosPerformanceMetrics: { cls: number, longTasks: Array<{ startTime: number, duration: number }>, shifts: Array<{ value: number, sources: string[] }> }
        }).__talosPerformanceMetrics

        return {
            startedAt: performance.now(),
            cls: metrics.cls,
            longTaskCount: metrics.longTasks.length,
            shiftCount: metrics.shifts.length,
        }
    })

    await settingsButton.evaluate((button) => {
        const performanceWindow = window as typeof window & {
            __talosMeasuredInteraction?: { clickAt: number, visibleAt: number }
        }
        const measurement = { clickAt: 0, visibleAt: 0 }
        performanceWindow.__talosMeasuredInteraction = measurement

        button.addEventListener('click', () => {
            measurement.clickAt = performance.now()
            const detectVisibleWindow = () => {
                const windowElement = document.querySelector('[data-window-id="settings"]')
                const bounds = windowElement?.getBoundingClientRect()
                if (bounds && bounds.width > 0 && bounds.height > 0) {
                    measurement.visibleAt = performance.now()
                    return
                }
                requestAnimationFrame(detectVisibleWindow)
            }
            requestAnimationFrame(detectVisibleWindow)
        }, { once: true })
    })

    await settingsButton.click()
    await expect(settingsWindow).toBeVisible()
    await expect.poll(() => page.evaluate(() => (
        (window as typeof window & {
            __talosMeasuredInteraction?: { clickAt: number, visibleAt: number }
        }).__talosMeasuredInteraction?.visibleAt ?? 0
    ))).toBeGreaterThan(0)
    const interaction = await page.evaluate(() => (
        (window as typeof window & {
            __talosMeasuredInteraction: { clickAt: number, visibleAt: number }
        }).__talosMeasuredInteraction
    ))
    if (isMobile) {
        await page.waitForTimeout(300)
    } else {
        await expect.poll(async () => settingsWindow.getAttribute('data-window-transition')).toBe('idle')
    }

    const result = await settingsWindow.evaluate(async (element, timing) => {
        const metrics = (window as typeof window & {
            __talosPerformanceMetrics: { cls: number, longTasks: Array<{ startTime: number, duration: number }>, shifts: Array<{ value: number, sources: string[] }> }
        }).__talosPerformanceMetrics
        const samples: Array<{ width: number, height: number }> = []

        for (let index = 0; index < 5; index += 1) {
            await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
            const rect = element.getBoundingClientRect()
            samples.push({ width: rect.width, height: rect.height })
        }

        return {
            interactionMs: timing.interaction.visibleAt - timing.interaction.clickAt,
            clsDelta: metrics.cls - timing.baseline.cls,
            longTasks: metrics.longTasks
                .slice(timing.baseline.longTaskCount)
                .filter((entry) => entry.startTime >= timing.interaction.clickAt && entry.duration > 100),
            widthSpread: Math.max(...samples.map((sample) => sample.width)) - Math.min(...samples.map((sample) => sample.width)),
            heightSpread: Math.max(...samples.map((sample) => sample.height)) - Math.min(...samples.map((sample) => sample.height)),
            shifts: metrics.shifts.slice(timing.baseline.shiftCount),
        }
    }, { baseline, interaction })

    expect(result.interactionMs).toBeLessThanOrEqual(333)
    expect(result.clsDelta, JSON.stringify(result.shifts, null, 2)).toBeLessThanOrEqual(0.02)
    expect(result.longTasks).toEqual([])
    expect(result.widthSpread).toBeLessThanOrEqual(1)
    expect(result.heightSpread).toBeLessThanOrEqual(1)
})

test('procedural background motion stays within its cap based on actual frame cadence', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'no-preference' })
    await setThemePreferences(page, {
        theme: 'signal',
        reduced_motion: false,
        theme_motion_v6: createCompleteMotionV6Preferences('complex'),
    })

    const workspace = page.getByTestId('talos-workspace')
    const background = page.getByTestId('talos-motion-background')
    const stage = page.locator('[data-talos-motion-stage]')
    await expect(background).toBeVisible()
    await expect(workspace).toHaveAttribute('data-motion-v6-requested', 'complex')
    await expect(workspace).toHaveAttribute('data-motion-v6-effective', 'complex')
    await expect(stage).toHaveAttribute('data-requested-mode', 'complex')
    await expect(stage).toHaveAttribute('data-effective-mode', 'complex')
    await expect(stage).toHaveAttribute('data-status', 'active')
    await expect(stage).toHaveAttribute('data-active-kind', 'complex')
    await expect(stage).toHaveAttribute('data-fallback-reason', '')
    await expect(stage).toHaveAttribute('data-solid-fallback', 'false')
    await expect(stage.locator('[data-testid="talos-procedural-canvas"]')).toHaveCount(1)
    await expect(stage.locator('.talos-v6-simple-layer')).toHaveCount(0)

    const cadence = await measureCanvasCadence(page, 2_000)

    const profile = await background.evaluate((element) => {
        const canvas = element.querySelector('[data-testid="talos-procedural-canvas"]') as HTMLCanvasElement | null
        const stage = element.querySelector<HTMLElement>('[data-talos-motion-stage]')
        const rect = canvas?.getBoundingClientRect()
        const dpr = canvas && rect && rect.width > 0 ? canvas.width / rect.width : 0

        return {
            renderer: stage?.dataset.activeKind ?? null,
            sceneId: stage?.dataset.sceneId ?? null,
            dpr,
        }
    })

    expect(cadence.elapsedMs).toBeGreaterThanOrEqual(2_000)
    const diagnostic = JSON.stringify({ cadence, profile })
    expect(cadence.frameCount, diagnostic).toBeGreaterThanOrEqual(30)
    expect(cadence.observedFps, diagnostic).toBeGreaterThanOrEqual(14.5)
    expect(cadence.observedFps, diagnostic).toBeLessThanOrEqual(35)
    expect(cadence.p95IntervalMs, diagnostic).toBeLessThanOrEqual(150)
    expect(cadence.maxIntervalMs, diagnostic).toBeLessThanOrEqual(300)
    expect(cadence.rendererCallbackCount, diagnostic).toBe(cadence.frameCount)
    expect(cadence.rendererActivityOutsideRaf, diagnostic).toBe(0)
    expect(cadence.rendererCallbackP95Ms, diagnostic).not.toBeNull()
    expect(profile.renderer).toBe('complex')
    expect(profile.sceneId).toBe('signal')
    expect(profile.dpr).toBeGreaterThan(0)
    expect(profile.dpr).toBeLessThanOrEqual(1.25)
})

test('Adaptive degrades from measured renderer cost and recovers with longer hysteresis', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'no-preference' })
    await setThemePreferences(page, {
        theme: 'signal',
        reduced_motion: false,
        theme_motion_v6: createCompleteMotionV6Preferences('adaptive'),
    })

    const workspace = page.getByTestId('talos-workspace')
    const stage = page.locator('[data-talos-motion-stage]')
    await expect(workspace).toHaveAttribute('data-motion-v6-requested', 'adaptive')
    await expect(workspace).toHaveAttribute('data-motion-v6-effective', 'complex')
    await expect(workspace).toHaveAttribute('data-motion-v6-degradation-stage', '0')
    await expect(stage).toHaveAttribute('data-active-kind', 'complex')

    await page.evaluate(() => {
        const nativeNow = Performance.prototype.now
        let accumulatedOffset = 0
        const runtimeWindow = window as typeof window & { __talosInflateMotionCost?: boolean }
        runtimeWindow.__talosInflateMotionCost = true
        Object.defineProperty(Performance.prototype, 'now', {
            configurable: true,
            value: function talosMeasuredNow(this: Performance) {
                if (runtimeWindow.__talosInflateMotionCost) accumulatedOffset += 20
                return nativeNow.call(this) + accumulatedOffset
            },
        })
    })

    await expect(workspace).toHaveAttribute('data-motion-v6-degradation-stage', '1', { timeout: 12_000 })
    await expect(workspace).toHaveAttribute('data-motion-v6-reason', 'performance_degraded')
    await expect(workspace).toHaveAttribute('data-motion-v6-effective', 'complex')
    await expect.poll(async () => Number(await workspace.getAttribute('data-motion-v6-frame-p95-ms'))).toBeGreaterThan(12)

    await page.evaluate(() => {
        ;(window as typeof window & { __talosInflateMotionCost?: boolean }).__talosInflateMotionCost = false
    })

    await expect(workspace).toHaveAttribute('data-motion-v6-degradation-stage', '0', { timeout: 16_000 })
    await expect(workspace).toHaveAttribute('data-motion-v6-reason', 'requested')
    await expect(workspace).toHaveAttribute('data-motion-v6-effective', 'complex')
    await expect(stage).toHaveAttribute('data-active-kind', 'complex')
})

test('reduced motion remains a hard gate for procedural background animation', async ({ page }) => {
    await setThemePreferences(page, {
        theme: 'signal',
        reduced_motion: false,
        theme_motion_v6: createCompleteMotionV6Preferences('complex'),
    })
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await page.reload({ waitUntil: 'domcontentloaded' })
    await waitForWorkspaceReady(page)

    const workspace = page.getByTestId('talos-workspace')
    const background = page.getByTestId('talos-motion-background')
    const stage = page.locator('[data-talos-motion-stage]')
    await expect(background).toBeVisible()
    await expect(workspace).toHaveAttribute('data-motion-v6-requested', 'complex')
    await expect(workspace).toHaveAttribute('data-motion-v6-effective', 'static')
    await expect(workspace).toHaveAttribute('data-motion-v6-reason', 'os_reduced_motion')
    await expect(workspace).toHaveAttribute('data-ui-motion-disabled', 'true')
    await expect(stage).toHaveAttribute('data-requested-mode', 'complex')
    await expect(stage).toHaveAttribute('data-effective-mode', 'static')
    await expect(stage).toHaveAttribute('data-active-kind', 'static')
    await expect(stage).toHaveAttribute('data-status', 'active')
    await expect(stage.locator('[data-testid="talos-procedural-canvas"]')).toHaveCount(0)
    await expect(stage.locator('.talos-v6-simple-layer')).not.toHaveCount(0)

    const firstFrame = await readDomRendererFingerprint(page)
    const cadence = await measureCanvasCadence(page, 700)
    const secondFrame = await readDomRendererFingerprint(page)

    expect(cadence.elapsedMs).toBeGreaterThanOrEqual(700)
    expect(cadence.frameCount, JSON.stringify(cadence)).toBeLessThanOrEqual(1)
    expect(cadence.rendererCallbackCount, JSON.stringify(cadence)).toBe(0)
    expect(secondFrame).toBe(firstFrame)

    await page.getByRole('button', { name: 'Settings', exact: true }).click()
    const settingsWindow = page.locator('[data-window-id="settings"]')
    await expect(settingsWindow).toBeVisible()
    const motionState = await settingsWindow.evaluate((element) => {
        const style = getComputedStyle(element)
        return {
            animationName: style.animationName,
            transitionDuration: style.transitionDuration,
            runningAnimations: element.getAnimations({ subtree: true }).filter((animation) => animation.playState === 'running').length,
        }
    })
    expect(motionState.animationName).toBe('none')
    expect(motionState.transitionDuration.split(',').every((duration) => Number.parseFloat(duration) === 0)).toBe(true)
    expect(motionState.runningAnimations).toBe(0)
})

test('static background mode draws once and stops recurring animation frames', async ({ page }) => {
    await setThemePreferences(page, {
        theme: 'terminal',
        reduced_motion: false,
        theme_motion_v6: createCompleteMotionV6Preferences('static'),
    })

    const workspace = page.getByTestId('talos-workspace')
    const background = page.getByTestId('talos-motion-background')
    const stage = page.locator('[data-talos-motion-stage]')
    await expect(background).toBeVisible()
    await expect(workspace).toHaveAttribute('data-motion-v6-requested', 'static')
    await expect(workspace).toHaveAttribute('data-motion-v6-effective', 'static')
    await expect(stage).toHaveAttribute('data-requested-mode', 'static')
    await expect(stage).toHaveAttribute('data-effective-mode', 'static')
    await expect(stage).toHaveAttribute('data-active-kind', 'static')
    await expect(stage).toHaveAttribute('data-status', 'active')
    await expect(stage.locator('[data-testid="talos-procedural-canvas"]')).toHaveCount(0)
    await expect(stage.locator('.talos-v6-simple-layer')).not.toHaveCount(0)

    const firstFrame = await readDomRendererFingerprint(page)
    await page.waitForTimeout(700)
    const secondFrame = await readDomRendererFingerprint(page)
    const cadence = await measureCanvasCadence(page, 700)

    expect(secondFrame).toBe(firstFrame)
    expect(cadence.frameCount).toBe(0)
    expect(cadence.rendererCallbackCount).toBe(0)
})

test('hidden documents and Motion Off stop recurring renderer work', async ({ page }) => {
    await setThemePreferences(page, {
        theme: 'signal',
        reduced_motion: false,
        theme_motion_v6: createCompleteMotionV6Preferences('complex'),
    })

    const background = page.getByTestId('talos-motion-background')
    const stage = page.locator('[data-talos-motion-stage]')
    await expect(stage).toHaveAttribute('data-active-kind', 'complex')

    await page.evaluate(() => {
        Object.defineProperty(document, 'hidden', { configurable: true, get: () => true })
        document.dispatchEvent(new Event('visibilitychange'))
    })
    await expect(background).toHaveAttribute('data-performance-raf-active', 'false')
    await expect(stage).toHaveAttribute('data-paused', 'true')
    const hiddenCadence = await measureCanvasCadence(page, 700)
    expect(hiddenCadence.rendererCallbackCount, JSON.stringify(hiddenCadence)).toBe(0)
    expect(hiddenCadence.rendererActivityOutsideRaf, JSON.stringify(hiddenCadence)).toBe(0)

    await page.evaluate(() => {
        Object.defineProperty(document, 'hidden', { configurable: true, get: () => false })
        document.dispatchEvent(new Event('visibilitychange'))
    })
    await expect(background).toHaveAttribute('data-performance-raf-active', 'true')

    await setThemePreferences(page, {
        theme: 'signal',
        reduced_motion: false,
        theme_motion_v6: createCompleteMotionV6Preferences('off', false),
    }, 1)
    await expect(background).toHaveAttribute('data-performance-raf-active', 'false')
    await expect(page.locator('[data-talos-motion-stage]')).toHaveCount(0)
    const offCadence = await measureCanvasCadence(page, 700)
    const offLifecycle = await readMotionLifecycleSnapshot(page)
    expect(offCadence.rendererCallbackCount, JSON.stringify(offCadence)).toBe(0)
    expect(offCadence.rendererActivityOutsideRaf, JSON.stringify(offCadence)).toBe(0)
    expect(offLifecycle.canvasCount).toBe(0)
    expect(offLifecycle.activeIntervalCount).toBe(0)
})

test('twenty live preset switches and a five minute Adaptive soak do not leak renderer resources', async ({ page, context, isMobile }) => {
    test.skip(isMobile, 'The five-minute lifecycle soak runs once against the desktop Chromium product surface.')
    const soakMs = Number(process.env.TALOS_MOTION_SOAK_MS ?? 300_000)
    test.setTimeout(soakMs + 150_000)

    await setThemePreferences(page, {
        theme: 'signal',
        reduced_motion: false,
        theme_motion_v6: createCompleteMotionV6Preferences('adaptive'),
    })
    const workspace = page.getByTestId('talos-workspace')
    await expect(workspace).toHaveAttribute('data-motion-v6-effective', 'complex')
    await expect(page.locator('[data-talos-motion-stage]')).toHaveAttribute('data-active-kind', 'complex')
    await page.waitForTimeout(500)
    const baseline = await readMotionLifecycleSnapshot(page)

    await page.getByRole('button', { name: 'Theme', exact: true }).click()
    await expect(page.getByRole('heading', { name: 'Theme Engine', exact: true })).toBeVisible()
    const presetSequence = [...TALOS_THEME_PRESETS.slice(1), TALOS_THEME_PRESETS[0]]
    for (let index = 0; index < 20; index += 1) {
        const nextPreset = presetSequence[index % presetSequence.length]
        const preset = page.getByRole('button', { name: nextPreset.label, exact: true })
        await expect(preset).toBeEnabled()
        await preset.click()
        await expect(preset).toBeEnabled()
        await expect(workspace).toHaveAttribute('data-theme-preset', nextPreset.id)
        await expect(page.locator('[data-talos-motion-stage]').first()).toHaveAttribute('data-scene-id', nextPreset.id)
    }
    await page.getByRole('button', { name: 'Close Theme', exact: true }).click()
    await expect(page.getByRole('heading', { name: 'Theme Engine', exact: true })).toHaveCount(0)
    await page.waitForTimeout(500)

    const afterSwitches = await readMotionLifecycleSnapshot(page)
    expect(afterSwitches.canvasCount).toBe(1)
    expect(afterSwitches.stageCount).toBe(1)
    expect(afterSwitches.activeIntervalCount).toBe(baseline.activeIntervalCount)
    expect(afterSwitches.activeResizeObserverCount).toBe(baseline.activeResizeObserverCount)
    expect(afterSwitches.observedResizeTargetCount).toBe(baseline.observedResizeTargetCount)
    expect(afterSwitches.trackedListenerCount).toBe(baseline.trackedListenerCount)
    expect(afterSwitches.pendingRafCount).toBeLessThanOrEqual(baseline.pendingRafCount + 1)

    const cdp = await context.newCDPSession(page)
    await cdp.send('Performance.enable')
    await cdp.send('HeapProfiler.enable')
    const collectHeap = async () => {
        await cdp.send('HeapProfiler.collectGarbage')
        const response = await cdp.send('Performance.getMetrics') as { metrics: Array<{ name: string, value: number }> }
        return response.metrics.find((metric) => metric.name === 'JSHeapUsedSize')?.value ?? 0
    }
    const initialHeapBytes = await collectHeap()
    await page.evaluate(() => {
        const metrics = (window as typeof window & { __talosPerformanceMetrics?: { longTasks: unknown[] } }).__talosPerformanceMetrics
        if (metrics) metrics.longTasks.length = 0
    })

    const samples: Array<Awaited<ReturnType<typeof readMotionLifecycleSnapshot>> & { elapsedMs: number, heapBytes: number }> = []
    const startedAt = Date.now()
    while (Date.now() - startedAt < soakMs) {
        const remaining = soakMs - (Date.now() - startedAt)
        await page.waitForTimeout(Math.min(30_000, Math.max(1, remaining)))
        const resources = await readMotionLifecycleSnapshot(page)
        const heapBytes = await page.evaluate(() => {
            const memory = (performance as Performance & { memory?: { usedJSHeapSize?: number } }).memory
            return memory?.usedJSHeapSize ?? 0
        })
        samples.push({ ...resources, elapsedMs: Date.now() - startedAt, heapBytes })
        console.log(`[motion-soak] ${samples.at(-1)?.elapsedMs}ms canvas=${resources.canvasCount} observers=${resources.activeResizeObserverCount} intervals=${resources.activeIntervalCount}`)
    }

    const longTasks = await page.evaluate(() => {
        const metrics = (window as typeof window & { __talosPerformanceMetrics?: { longTasks: Array<{ startTime: number, duration: number }> } }).__talosPerformanceMetrics
        return (metrics?.longTasks ?? []).filter((entry) => entry.duration > 50)
    })
    const finalHeapBytes = await collectHeap()
    const finalResources = await readMotionLifecycleSnapshot(page)
    const degradationStage = Number(await workspace.getAttribute('data-motion-v6-degradation-stage') ?? 0)
    const frameP95Ms = Number(await workspace.getAttribute('data-motion-v6-frame-p95-ms') ?? 0)

    for (const sample of samples) {
        expect(sample.canvasCount).toBe(1)
        expect(sample.stageCount).toBe(1)
        expect(sample.activeIntervalCount).toBe(afterSwitches.activeIntervalCount)
        expect(sample.activeResizeObserverCount).toBe(afterSwitches.activeResizeObserverCount)
        expect(sample.observedResizeTargetCount).toBe(afterSwitches.observedResizeTargetCount)
        expect(sample.trackedListenerCount).toBe(afterSwitches.trackedListenerCount)
        expect(sample.pendingRafCount).toBeLessThanOrEqual(afterSwitches.pendingRafCount + 1)
    }
    expect(longTasks, JSON.stringify(longTasks, null, 2)).toEqual([])
    expect(finalHeapBytes - initialHeapBytes).toBeLessThanOrEqual(8 * 1024 * 1024)
    expect(finalResources).toMatchObject({
        canvasCount: 1,
        stageCount: 1,
        activeIntervalCount: afterSwitches.activeIntervalCount,
        activeResizeObserverCount: afterSwitches.activeResizeObserverCount,
        observedResizeTargetCount: afterSwitches.observedResizeTargetCount,
        trackedListenerCount: afterSwitches.trackedListenerCount,
    })
    expect(frameP95Ms <= 12 || degradationStage > 0, JSON.stringify({ frameP95Ms, degradationStage })).toBe(true)
    await test.info().attach('talos-motion-v6-soak.json', {
        body: Buffer.from(JSON.stringify({ soakMs, baseline, afterSwitches, finalResources, initialHeapBytes, finalHeapBytes, frameP95Ms, degradationStage, longTasks, samples }, null, 2)),
        contentType: 'application/json',
    })
})
