import { createHash } from 'node:crypto'
import { expect, test, type Locator, type Page, type Route } from '@playwright/test'
import { PNG } from 'pngjs'
import { installTalosApiMocks } from './helpers/talosApiMocks'

const loginEmail = process.env.TALOS_E2E_EMAIL ?? 'test@example.com'
const loginPassword = process.env.TALOS_E2E_PASSWORD ?? 'password'
const talosSessionId = 'browser-card-e2e'
const browserSessionId = 'browser-session-card-e2e'
const taskId = 'browser-task-card-e2e'
const runId = 'run-browser-card-e2e'

type MobilePresentation = 'drawer' | 'fullscreen'
type BrowserFrame = {
    artifact: Record<string, unknown>
    bytes: Buffer
}

type BrowserCardFixtureState = {
    task: Record<string, unknown>
    session: Record<string, unknown>
    events: Record<string, unknown>[]
    frames: Map<string, BrowserFrame>
    pointerRequests: Record<string, unknown>[]
    screenshotRequests: number
    sessionRequests: string[]
    staleOnce: boolean
    completeTask: () => void
}

function frameFixture(index: number, stateVersion = index): BrowserFrame {
    const id = `browser-card-frame-${index}`
    const width = 96
    const height = 60
    const png = new PNG({ width, height })
    for (let y = 0; y < height; y += 1) {
        for (let x = 0; x < width; x += 1) {
            const offset = ((y * width) + x) * 4
            png.data[offset] = (index * 47 + x * 2) % 256
            png.data[offset + 1] = (index * 71 + y * 3) % 256
            png.data[offset + 2] = (x + y + index * 29) % 256
            png.data[offset + 3] = 255
        }
    }
    const bytes = PNG.sync.write(png)

    return {
        bytes,
        artifact: {
            id,
            browser_session_id: browserSessionId,
            source_state_version: Math.max(0, stateVersion - 1),
            state_version: stateVersion,
            trust_boundary: 'untrusted_browser_content',
            type: 'screenshot',
            mime: 'image/png',
            sha256: createHash('sha256').update(bytes).digest('hex'),
            metadata: { width, height },
            created_at: `2026-07-16T12:0${index}:00Z`,
        },
    }
}

function screenshotActivity(index: number) {
    return {
        id: `browser-card-activity-${index}`,
        operation: 'screenshot',
        status: 'succeeded',
        label: index === 1 ? 'Initial verified browser capture' : `Verified browser capture ${index}`,
        run_id: runId,
        browser_session_id: browserSessionId,
        artifact_ids: [`browser-card-frame-${index}`],
        occurred_at: `2026-07-16T12:0${index}:00Z`,
    }
}

function browserEvent(index: number) {
    const activity = screenshotActivity(index)
    return {
        id: activity.id,
        type: 'hmi.evidence.persisted',
        actor: 'system',
        payload: {
            operation: 'screenshot',
            run_id: runId,
            artifact_id: activity.artifact_ids[0],
            artifact_ids: activity.artifact_ids,
        },
        created_at: activity.occurred_at,
    }
}

function json(route: Route, body: unknown, status = 200) {
    return route.fulfill({
        status,
        contentType: 'application/json',
        body: JSON.stringify(body),
    })
}

async function installBrowserCardFixture(
    page: Page,
    options: {
        presentation: MobilePresentation
        includeAssistant: boolean
        staleOnce?: boolean
        browseEnabled?: boolean
    },
): Promise<BrowserCardFixtureState> {
    const initialActivity = screenshotActivity(1)
    await installTalosApiMocks(page, {
        initialSessions: [{
            id: talosSessionId,
            title: 'Browser card E2E',
            metadata: { surface: 'chat', chat_state: { browse_enabled: options.browseEnabled ?? true } },
            messages: [
                {
                    role: 'user',
                    content: 'Inspect the current page and preserve verified evidence.',
                    run_id: runId,
                },
                ...(options.includeAssistant ? [{
                    role: 'assistant',
                    content: 'The page was inspected with verified browser evidence.',
                    run_id: runId,
                    metadata: { browser_activities: [initialActivity] },
                }] : []),
            ],
        }],
        initialSettings: {
            preferences: {
                chat_layout: {
                    bubble_scale: 'balanced',
                    composer_mode: 'full',
                    advanced_rail_expanded: false,
                    mobile_window_presentation: options.presentation,
                },
            },
        },
    })

    const frames = new Map([[1, 1], [2, 1], [3, 2]].map(([index, stateVersion]) => {
        const frame = frameFixture(index, stateVersion)
        return [String(frame.artifact.id), frame] as const
    }))
    const state: BrowserCardFixtureState = {
        task: {
            id: taskId,
            talos_session_id: talosSessionId,
            origin_message_id: 'message-e2e-1',
            browser_session_id: browserSessionId,
            runtime_id: 'browser-runtime-card-e2e',
            active_tab_id: 'browser-tab-card-e2e',
            goal: 'Inspect the current page and preserve verified evidence.',
            status: options.includeAssistant ? 'completed' : 'running',
            autonomy_profile: 'assist',
            budget: { max_domains: 2, max_tokens: 4096 },
            state_version: options.includeAssistant ? 2 : 1,
            requested_at: '2026-07-16T12:00:00Z',
            started_at: '2026-07-16T12:00:01Z',
            completed_at: options.includeAssistant ? '2026-07-16T12:01:00Z' : null,
            failed_at: null,
            cancelled_at: null,
            reconciled_at: '2026-07-16T12:01:01Z',
            created_at: '2026-07-16T12:00:00Z',
            updated_at: '2026-07-16T12:01:01Z',
        },
        session: {
            id: browserSessionId,
            talos_session_id: talosSessionId,
            status: 'active',
            mode: 'read_only',
            capabilities: ['navigate', 'snapshot', 'screenshot', 'interact'],
            state_version: 1,
            viewport: { width: 96, height: 60 },
            current_url: 'https://fixture.example.test/evidence',
            current_title: 'Verified Browser Fixture',
            last_screenshot_artifact_id: 'browser-card-frame-1',
            last_snapshot_artifact_id: null,
            created_at: '2026-07-16T12:00:00Z',
            updated_at: '2026-07-16T12:01:00Z',
        },
        events: [browserEvent(1)],
        frames,
        pointerRequests: [],
        screenshotRequests: 0,
        sessionRequests: [],
        staleOnce: options.staleOnce ?? false,
        completeTask() {
            state.task = {
                ...state.task,
                status: 'completed',
                state_version: 2,
                completed_at: '2026-07-16T12:01:00Z',
                updated_at: '2026-07-16T12:01:01Z',
            }
        },
    }

    const advanceFrame = (index: number) => {
        const frame = state.frames.get(`browser-card-frame-${index}`)
        if (!frame) throw new Error(`Missing Browser frame fixture ${index}.`)
        state.session = {
            ...state.session,
            state_version: frame.artifact.state_version,
            last_screenshot_artifact_id: `browser-card-frame-${index}`,
            updated_at: `2026-07-16T12:0${index}:00Z`,
        }
        if (!state.events.some((event) => event.id === `browser-card-activity-${index}`)) {
            state.events = [...state.events, browserEvent(index)]
        }
    }

    await page.route('**/api/talos/browser/**', async (route) => {
        const request = route.request()
        const url = new URL(request.url())
        const path = url.pathname
        const method = request.method()
        const ownerHeader = request.headers()['x-talos-session-id']

        if (ownerHeader && ownerHeader !== talosSessionId) {
            return json(route, { code: 'NOT_FOUND', message: 'Browser owner scope mismatch.' }, 404)
        }

        if (path.startsWith('/api/talos/browser/sessions')) {
            state.sessionRequests.push(`${method} ${path}`)
        }

        if (path === '/api/talos/browser/tasks' && method === 'GET') {
            if (url.searchParams.get('talos_session_id') !== talosSessionId) {
                return json(route, { code: 'NOT_FOUND', message: 'Browser task scope mismatch.' }, 404)
            }
            return json(route, { data: [state.task] })
        }

        if (path === '/api/talos/browser/sessions' && method === 'GET') {
            return json(route, { data: [state.session] })
        }

        if (path === `/api/talos/browser/sessions/${browserSessionId}` && method === 'GET') {
            return json(route, { data: state.session })
        }

        if (path === `/api/talos/browser/sessions/${browserSessionId}/events` && method === 'GET') {
            return json(route, { data: state.events })
        }

        const artifactMatch = path.match(/^\/api\/talos\/browser\/artifacts\/([^/]+)$/)
        if (artifactMatch && method === 'GET') {
            const frame = state.frames.get(decodeURIComponent(artifactMatch[1]))
            return frame
                ? json(route, { data: frame.artifact })
                : json(route, { code: 'NOT_FOUND', message: 'Browser artifact not found.' }, 404)
        }

        const previewMatch = path.match(/^\/api\/talos\/browser\/artifacts\/([^/]+)\/preview$/)
        if (previewMatch && method === 'GET') {
            const frame = state.frames.get(decodeURIComponent(previewMatch[1]))
            if (!frame || url.searchParams.get('talos_session_id') !== talosSessionId) {
                return json(route, { code: 'NOT_FOUND', message: 'Browser preview scope mismatch.' }, 404)
            }
            return route.fulfill({ status: 200, contentType: 'image/png', body: frame.bytes })
        }

        if (path === `/api/talos/browser/sessions/${browserSessionId}/screenshot` && method === 'POST') {
            state.screenshotRequests += 1
            advanceFrame(2)
            const frame = state.frames.get('browser-card-frame-2')
            if (!frame) return json(route, { code: 'FIXTURE_EXHAUSTED', message: 'No fresh frame is available.' }, 500)
            return json(route, { data: frame.artifact }, 201)
        }

        if (path === `/api/talos/browser/sessions/${browserSessionId}/interactions/pointer` && method === 'POST') {
            const body = request.postDataJSON() as Record<string, unknown>
            state.pointerRequests.push(body)
            if (state.staleOnce && state.pointerRequests.length === 1) {
                return json(route, {
                    code: 'TALOS_BROWSER_FRAME_STALE',
                    message: 'The page changed before the action could be applied.',
                    details: { current_state_version: 1 },
                }, 409)
            }

            const nextIndex = 3
            advanceFrame(nextIndex)
            const frame = state.frames.get(`browser-card-frame-${nextIndex}`)
            if (!frame) return json(route, { code: 'FIXTURE_EXHAUSTED', message: 'No fresh frame is available.' }, 500)

            return json(route, {
                data: {
                    interaction: {
                        status: 'executed',
                        command_id: `browser-card-command-${nextIndex}`,
                    },
                    session: state.session,
                    screenshot: {
                        ...frame.artifact,
                        preview_url: `/api/talos/browser/artifacts/${frame.artifact.id}/preview`,
                    },
                    snapshot: {
                        id: `browser-card-snapshot-${nextIndex}`,
                        browser_session_id: browserSessionId,
                        state_version: nextIndex,
                        type: 'snapshot',
                        mime: 'application/json',
                        sha256: 'c'.repeat(64),
                    },
                },
            }, 201)
        }

        return route.fallback()
    })

    return state
}

async function isAuthenticatedWorkspace(page: Page) {
    return await page.locator('#talos-workspace-root[data-authenticated="true"]').count() > 0
}

async function openAuthenticatedWorkspace(page: Page) {
    await page.goto('/', { waitUntil: 'domcontentloaded' })
    if (!await isAuthenticatedWorkspace(page)) {
        await page.goto('/login', { waitUntil: 'domcontentloaded' })
        const form = page.locator('#talos-login-form')
        await expect(form).toBeVisible()
        await form.getByLabel('Email').fill(loginEmail)
        await form.getByLabel('Password').fill(loginPassword)
        await Promise.all([
            page.waitForURL(/\/$/, { waitUntil: 'domcontentloaded' }),
            form.getByRole('button', { name: 'Sign in' }).click(),
        ])
    }
    await expect(page.locator('#talos-workspace-root[data-authenticated="true"]')).toHaveCount(1)
    await expect(page.getByLabel('Message TALOS')).toBeVisible({ timeout: 45_000 })
    await expect(page.getByTestId('talos-browser-card')).toBeVisible({ timeout: 15_000 })
}

async function persistAssistantResponse(page: Page) {
    const activity = screenshotActivity(1)
    const response = await page.evaluate(async ({ sessionId, responseRunId, browserActivity }) => {
        const request = await fetch(`/api/talos/sessions/${encodeURIComponent(sessionId)}/messages`, {
            method: 'POST',
            headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
            body: JSON.stringify({
                role: 'assistant',
                content: 'The page was inspected with verified browser evidence.',
                run_id: responseRunId,
                metadata: { browser_activities: [browserActivity] },
            }),
        })
        return { status: request.status, body: await request.json() }
    }, { sessionId: talosSessionId, responseRunId: runId, browserActivity: activity })
    expect(response.status).toBe(201)
    expect(response.body.data.id).toBe('message-e2e-2')
}

async function assertNoDocumentOverflow(page: Page) {
    const dimensions = await page.evaluate(() => ({
        viewport: window.innerWidth,
        document: document.documentElement.scrollWidth,
        body: document.body.scrollWidth,
    }))
    expect(dimensions.document).toBeLessThanOrEqual(dimensions.viewport + 1)
    expect(dimensions.body).toBeLessThanOrEqual(dimensions.viewport + 1)
}

async function waitForSurfaceGeometry(surface: Locator, presentation: MobilePresentation, viewport: { width: number; height: number }) {
    await expect.poll(async () => {
        const bounds = await surface.boundingBox()
        if (!bounds) return false
        const reachesHorizontalEdges = Math.abs(bounds.x) <= 1
            && Math.abs((bounds.x + bounds.width) - viewport.width) <= 1
        const reachesBottom = Math.abs((bounds.y + bounds.height) - viewport.height) <= 1
        const fillsHeight = Math.abs(bounds.y) <= 1 && Math.abs(bounds.height - viewport.height) <= 1
        return reachesHorizontalEdges && reachesBottom && (presentation === 'drawer' || fillsHeight)
    }).toBe(true)
}

async function assertDecodedNonBlankFrame(image: Locator) {
    await expect(image).toBeVisible()
    await expect.poll(() => image.evaluate((element) => (element as HTMLImageElement).naturalWidth)).toBe(96)
    await expect.poll(() => image.evaluate((element) => (element as HTMLImageElement).naturalHeight)).toBe(60)
    const evidence = await image.evaluate(async (element) => {
        const source = element as HTMLImageElement
        const response = await fetch(source.currentSrc || source.src, { headers: { Accept: 'image/png' } })
        const bytes = [...new Uint8Array(await response.arrayBuffer())]
        const canvas = document.createElement('canvas')
        canvas.width = source.naturalWidth
        canvas.height = source.naturalHeight
        const context = canvas.getContext('2d')
        context?.drawImage(source, 0, 0)
        const pixels = context?.getImageData(0, 0, canvas.width, canvas.height).data ?? new Uint8ClampedArray()
        return {
            ok: response.ok,
            contentType: response.headers.get('content-type'),
            bytes,
            paintedSamples: [
                [...pixels.slice(0, 4)],
                [...pixels.slice(Math.floor(pixels.length / 2), Math.floor(pixels.length / 2) + 4)],
                [...pixels.slice(-4)],
            ],
        }
    })
    expect(evidence.ok).toBe(true)
    expect(evidence.contentType).toContain('image/png')
    const decoded = PNG.sync.read(Buffer.from(evidence.bytes))
    expect(decoded.width).toBe(96)
    expect(decoded.height).toBe(60)
    expect(new Set(evidence.paintedSamples.map((sample) => sample.join(','))).size).toBeGreaterThan(1)
    expect(evidence.paintedSamples.every((sample) => sample[3] === 255)).toBe(true)
}

test('BREG-011 task card migrates from the exact user turn to its persisted response and survives hard reload', async ({ page, isMobile }) => {
    test.skip(isMobile, 'Desktop placement coverage')
    await page.setViewportSize({ width: 1440, height: 900 })
    const state = await installBrowserCardFixture(page, { presentation: 'drawer', includeAssistant: false })
    await openAuthenticatedWorkspace(page)

    const transient = page.locator(`article[data-browser-task-id="${taskId}"]`)
    await expect(transient).toBeVisible()
    await expect(page.getByTestId('talos-browser-card')).toHaveCount(1)
    expect(await transient.evaluate((element) => element.previousElementSibling?.getAttribute('data-message-id'))).toBe('message-e2e-1')
    expect(await page.getByTestId('talos-browser-card').evaluate((element) => Boolean(element.closest('.talos-chat-message')))).toBe(true)

    await persistAssistantResponse(page)
    state.completeTask()
    await page.reload({ waitUntil: 'domcontentloaded' })
    await expect(page.getByLabel('Message TALOS')).toBeVisible({ timeout: 45_000 })
    const responseBubble = page.locator('article[data-message-id="message-e2e-2"]')
    await expect(responseBubble.getByTestId('talos-browser-card')).toHaveCount(1)
    await expect(transient).toHaveCount(0)
    await expect(page.locator('article[data-message-id="message-e2e-1"]').getByTestId('talos-browser-card')).toHaveCount(0)
    await expect(page.getByTestId('talos-browser-card')).toHaveCount(1)
    await expect(page.getByTestId('talos-browser-raw-evidence-trigger')).toHaveCount(0)
    await assertDecodedNonBlankFrame(responseBubble.getByRole('img', { name: 'Browser screenshot 1 of 1' }))
    await assertNoDocumentOverflow(page)

    await page.reload({ waitUntil: 'domcontentloaded' })
    await expect(page.getByLabel('Message TALOS')).toBeVisible({ timeout: 45_000 })
    await expect(page.locator('article[data-message-id="message-e2e-2"]').getByTestId('talos-browser-card')).toHaveCount(1)
    await expect(page.getByTestId('talos-browser-card')).toHaveCount(1)
})

test('BREG-021 completed task card survives hard reload while Browse stays disabled', async ({ page, isMobile }) => {
    test.skip(isMobile, 'Desktop durable-history coverage')
    await page.setViewportSize({ width: 1440, height: 900 })
    const state = await installBrowserCardFixture(page, {
        presentation: 'drawer',
        includeAssistant: true,
        browseEnabled: false,
    })
    await openAuthenticatedWorkspace(page)

    await expect(page.getByTestId('talos-browser-card')).toHaveCount(1)
    await expect(page.getByTestId('talos-browser-task-status')).toContainText('Browser task completed')
    await assertDecodedNonBlankFrame(page.getByRole('img', { name: 'Browser screenshot 1 of 1' }))
    expect(state.sessionRequests).toEqual([])

    await page.reload({ waitUntil: 'domcontentloaded' })
    await expect(page.getByLabel('Message TALOS')).toBeVisible({ timeout: 45_000 })
    await expect(page.getByTestId('talos-browser-card')).toHaveCount(1)
    await expect(page.getByTestId('talos-browser-task-status')).toContainText('Browser task completed')
    expect(state.sessionRequests).toEqual([])
})

test('BREG-022 desktop lightbox captures and renders the physical frame after stale rejection', async ({ page, isMobile }) => {
    test.skip(Boolean(isMobile), 'Desktop stale-frame recovery coverage')
    await page.setViewportSize({ width: 1440, height: 900 })
    const state = await installBrowserCardFixture(page, {
        presentation: 'drawer',
        includeAssistant: true,
        staleOnce: true,
    })
    await openAuthenticatedWorkspace(page)

    const trigger = page.getByTestId('browser-evidence-open-browser-card-frame-1')
    await trigger.click()
    const surface = page.getByTestId('talos-browser-interactive-frame')
    await expect(surface).toBeVisible()
    await expect(surface).toHaveAttribute('data-window-presentation', 'desktop-dialog')

    const firstPointer = page.waitForResponse((response) => (
        response.request().method() === 'POST'
        && new URL(response.url()).pathname.endsWith('/interactions/pointer')
    ))
    await page.getByTestId('browser-evidence-stage').click()
    expect((await firstPointer).status()).toBe(409)

    await expect(page.getByText('The page changed before the action. Review the refreshed frame and try again.')).toBeVisible()
    await assertDecodedNonBlankFrame(page.getByTestId('browser-evidence-image-browser-card-frame-2'))
    expect(state.screenshotRequests).toBe(1)
    expect(state.pointerRequests).toHaveLength(1)
})

for (const presentation of ['drawer', 'fullscreen'] as const) {
    test(`BREG-012 BREG-022 mobile ${presentation} refreshes stale evidence and renders the verified post-action frame`, async ({ page, isMobile }) => {
        test.skip(!isMobile, 'Mobile responsive viewer coverage')
        await page.setViewportSize({ width: 390, height: 844 })
        const state = await installBrowserCardFixture(page, {
            presentation,
            includeAssistant: true,
            staleOnce: true,
        })
        await openAuthenticatedWorkspace(page)

        const firstTrigger = page.getByTestId('browser-evidence-open-browser-card-frame-1')
        await assertDecodedNonBlankFrame(firstTrigger.getByRole('img'))
        await firstTrigger.focus()
        await firstTrigger.click()
        const surface = page.getByTestId('talos-browser-interactive-frame')
        await expect(surface).toBeVisible()
        await expect(surface).toHaveAttribute('data-window-presentation', presentation)
        await expect(surface).toHaveAttribute('data-talos-upstream', presentation === 'drawer'
            ? 'shadcn-vue-reka-drawer'
            : 'shadcn-vue-dialog')
        await expect(page.getByTestId('talos-browser-interactive-frame-title')).toBeFocused()
        await page.keyboard.press('Tab')
        expect(await surface.evaluate((element) => element.contains(document.activeElement))).toBe(true)
        await assertNoDocumentOverflow(page)

        const viewport = page.viewportSize()
        expect(viewport).not.toBeNull()
        await waitForSurfaceGeometry(surface, presentation, viewport ?? { width: 0, height: 0 })

        await page.keyboard.press('Escape')
        await expect(surface).toBeHidden()
        await expect(firstTrigger).toBeFocused()
        await firstTrigger.click()
        await expect(surface).toBeVisible()
        await assertDecodedNonBlankFrame(page.getByTestId('browser-evidence-image-browser-card-frame-1'))

        const firstPointer = page.waitForResponse((response) => (
            response.request().method() === 'POST'
            && new URL(response.url()).pathname.endsWith('/interactions/pointer')
        ))
        await page.getByTestId('browser-evidence-stage').click()
        expect((await firstPointer).status()).toBe(409)
        await expect(page.getByText('The page changed before the action. Review the refreshed frame and try again.')).toBeVisible()
        const refreshedFrame = page.getByTestId('browser-evidence-image-browser-card-frame-2')
        await assertDecodedNonBlankFrame(refreshedFrame)
        expect(state.pointerRequests).toHaveLength(1)
        expect(state.screenshotRequests).toBe(1)

        const secondPointer = page.waitForResponse((response) => (
            response.request().method() === 'POST'
            && new URL(response.url()).pathname.endsWith('/interactions/pointer')
        ))
        await page.getByTestId('browser-evidence-stage').click()
        expect((await secondPointer).status()).toBe(201)
        const postActionFrame = page.getByTestId('browser-evidence-image-browser-card-frame-3')
        await assertDecodedNonBlankFrame(postActionFrame)
        await expect(page.getByText('Click the current frame to interact')).toBeVisible()
        expect(state.pointerRequests).toHaveLength(2)

        await page.getByRole('button', { name: 'Previous capture' }).click()
        await expect(page.getByText('Historical frame, inspection only')).toBeVisible()
        await page.getByTestId('browser-evidence-stage').click()
        await page.waitForTimeout(350)
        expect(state.pointerRequests).toHaveLength(2)

        await page.keyboard.press('Escape')
        await page.reload({ waitUntil: 'domcontentloaded' })
        await expect(page.getByLabel('Message TALOS')).toBeVisible({ timeout: 45_000 })
        const restoredTrigger = page.getByTestId('browser-evidence-open-browser-card-frame-3')
        await assertDecodedNonBlankFrame(restoredTrigger.getByRole('img'))
        await restoredTrigger.click()
        await expect(page.getByTestId('talos-browser-interactive-frame')).toHaveAttribute('data-window-presentation', presentation)
        await assertDecodedNonBlankFrame(page.getByTestId('browser-evidence-image-browser-card-frame-3'))
        await page.keyboard.press('Escape')
        await expect(restoredTrigger).toBeFocused()
        await assertNoDocumentOverflow(page)
    })
}
