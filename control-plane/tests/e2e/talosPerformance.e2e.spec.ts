import { expect, test, type Page } from '@playwright/test'
import { installTalosApiMocks } from './helpers/talosApiMocks'

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

async function setThemePreferences(page: Page, preferences: Record<string, unknown>) {
    await page.evaluate(async (nextPreferences) => {
        await fetch('/api/talos/settings', {
            method: 'PATCH',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                preferences: nextPreferences,
            }),
        })
    }, preferences)

    await page.reload({ waitUntil: 'domcontentloaded' })
    await waitForWorkspaceReady(page)
}

async function measureCanvasCadence(page: Page, intervalMs: number) {
    const background = page.getByTestId('talos-background-effect')
    await expect(background).toBeVisible()

    return background.evaluate(async (element, duration) => {
        const canvas = element.querySelector('[data-testid="talos-procedural-canvas"]')
        if (!(canvas instanceof HTMLCanvasElement)) {
            return {
                elapsedMs: 0,
                frameCount: 0,
                observedFps: 0,
                intervals: [],
                p95IntervalMs: Number.POSITIVE_INFINITY,
                maxIntervalMs: Number.POSITIVE_INFINITY,
            }
        }

        const frameTimes: number[] = []
        const originalMark = performance.mark
        performance.mark = ((name: string, options?: PerformanceMarkOptions) => {
            if (name === 'talos-background-frame') {
                frameTimes.push(performance.now())
            }

            return originalMark.call(performance, name, options)
        }) as typeof performance.mark

        const startedAt = performance.now()
        try {
            await new Promise<void>((resolve) => window.setTimeout(resolve, duration))
        } finally {
            performance.mark = originalMark
        }

        const elapsedMs = performance.now() - startedAt
        const frames = frameTimes.filter((time) => time >= startedAt && time <= startedAt + elapsedMs)
        const intervals = frames.slice(1).map((time, index) => time - frames[index])
        const sortedIntervals = [...intervals].sort((left, right) => left - right)
        const p95Index = Math.max(0, Math.ceil(sortedIntervals.length * 0.95) - 1)

        return {
            elapsedMs,
            frameCount: frames.length,
            observedFps: frames.length / (elapsedMs / 1000),
            intervals,
            p95IntervalMs: sortedIntervals[p95Index] ?? Number.POSITIVE_INFINITY,
            maxIntervalMs: intervals.length > 0 ? Math.max(...intervals) : Number.POSITIVE_INFINITY,
        }
    }, intervalMs)
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
        theme_motion: 'normal',
        theme_motion_disabled: false,
        theme_simple_animation: false,
        theme_background_disabled: false,
        theme_customization: {
            effect: 'dag-flow',
        },
    })

    const background = page.getByTestId('talos-background-effect')
    await expect(background).toHaveAttribute('data-performance-mode', 'motion')
    await expect(background).toHaveAttribute('data-performance-fps-cap', '30')
    await expect(background).toHaveAttribute('data-performance-dpr-cap', '1.5')
    await expect(background).toHaveAttribute('data-performance-raf-active', 'true')
    await expect(page.getByTestId('talos-procedural-canvas')).toHaveCount(1)

    const cadence = await measureCanvasCadence(page, 2_000)

    const profile = await background.evaluate((element) => {
        const canvas = element.querySelector('[data-testid="talos-procedural-canvas"]') as HTMLCanvasElement | null
        const rect = canvas?.getBoundingClientRect()
        const dpr = canvas && rect && rect.width > 0 ? canvas.width / rect.width : 0

        return {
            frameCount: Number((element as HTMLElement).dataset.performanceFrameCount ?? 0),
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
    expect(profile.frameCount).toBeGreaterThan(0)
    expect(profile.dpr).toBeGreaterThan(0)
    expect(profile.dpr).toBeLessThanOrEqual(1.5)
})

test('reduced motion remains a hard gate for procedural background animation', async ({ page }) => {
    await setThemePreferences(page, {
        theme: 'signal',
        reduced_motion: false,
        theme_motion: 'normal',
        theme_motion_disabled: false,
        theme_background_disabled: false,
        theme_customization: {
            effect: 'signal-mesh',
        },
    })
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await page.reload({ waitUntil: 'domcontentloaded' })
    await waitForWorkspaceReady(page)

    const background = page.getByTestId('talos-background-effect')
    await expect(background).toHaveAttribute('data-performance-mode', 'static')
    await expect(background).toHaveAttribute('data-performance-raf-active', 'false')
    const canvas = page.getByTestId('talos-procedural-canvas')
    await expect(canvas).toHaveCount(1)
    await expect.poll(async () => background.evaluate((element) => (
        Number((element as HTMLElement).dataset.performanceFrameCount ?? 0)
    ))).toBeGreaterThanOrEqual(1)

    const firstFrame = await canvas.evaluate((element) => (element as HTMLCanvasElement).toDataURL())
    const cadence = await measureCanvasCadence(page, 700)
    const secondFrame = await canvas.evaluate((element) => (element as HTMLCanvasElement).toDataURL())

    expect(cadence.elapsedMs).toBeGreaterThanOrEqual(700)
    expect(cadence.frameCount, JSON.stringify(cadence)).toBeLessThanOrEqual(1)
    expect(secondFrame).toBe(firstFrame)
})

test('static background mode draws once and stops recurring animation frames', async ({ page }) => {
    await setThemePreferences(page, {
        theme: 'terminal',
        reduced_motion: false,
        theme_motion: 'off',
        theme_motion_disabled: false,
        theme_background_disabled: false,
        theme_customization: {
            effect: 'trace-rain',
        },
    })

    const background = page.getByTestId('talos-background-effect')
    await expect(background).toHaveAttribute('data-performance-mode', 'static')
    await expect(background).toHaveAttribute('data-performance-raf-active', 'false')
    await expect(page.getByTestId('talos-procedural-canvas')).toHaveCount(1)

    const firstFrame = await page.getByTestId('talos-procedural-canvas').evaluate((element) => (element as HTMLCanvasElement).toDataURL())
    await page.waitForTimeout(700)
    const secondFrame = await page.getByTestId('talos-procedural-canvas').evaluate((element) => (element as HTMLCanvasElement).toDataURL())
    const frameCount = await background.evaluate((element) => Number((element as HTMLElement).dataset.performanceFrameCount ?? 0))

    expect(secondFrame).toBe(firstFrame)
    expect(frameCount).toBeLessThanOrEqual(1)
})
