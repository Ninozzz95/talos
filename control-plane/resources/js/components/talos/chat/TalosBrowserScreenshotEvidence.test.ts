// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest'
import { createApp, h, nextTick, reactive } from 'vue'
import TalosBrowserScreenshotEvidence from './TalosBrowserScreenshotEvidence.vue'
import type {
    TalosBrowserActivity,
    TalosBrowserArtifact,
    TalosBrowserHmiChallenge,
    TalosBrowserPointerFrame,
    TalosBrowserSession,
} from '../../../lib/talosTypes'

const activity: TalosBrowserActivity = {
    id: 'event-1',
    operation: 'screenshot',
    status: 'succeeded',
    label: 'Screenshot captured',
    run_id: null,
    browser_session_id: 'browser-1',
    artifact_ids: ['artifact-1'],
    occurred_at: '2026-07-13T10:00:00Z',
}

const session: TalosBrowserSession = {
    id: 'browser-1',
    talos_session_id: 'chat-1',
    status: 'active',
    mode: 'read_only',
    capabilities: ['screenshots', 'interact'],
    state_version: 7,
    viewport: { width: 800, height: 600 },
    last_screenshot_artifact_id: 'artifact-1',
    created_at: '2026-07-13T10:00:00Z',
    updated_at: '2026-07-13T10:00:00Z',
}

const artifact: TalosBrowserArtifact = {
    id: 'artifact-1',
    browser_session_id: 'browser-1',
    state_version: 7,
    source_state_version: 6,
    trust_boundary: 'untrusted_browser_content',
    type: 'screenshot',
    mime: 'image/png',
    sha256: 'a'.repeat(64),
    metadata: { width: 800, height: 600 },
    created_at: '2026-07-13T10:00:00Z',
}

const challenge: TalosBrowserHmiChallenge = {
    approval_id: 'approval-1',
    request_hash: `sha256:${'b'.repeat(64)}`,
    expires_at: '2099-07-13T10:01:00Z',
    action: {
        category: 'purchase',
        label: 'Place order',
        origin: 'https://shop.example',
        consequence: 'This action can create a financial commitment.',
    },
}

let app: ReturnType<typeof createApp> | null = null

function jsonResponse(data: unknown) {
    return new Response(JSON.stringify(data), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
    })
}

async function mountEvidence(overrides: Record<string, unknown> = {}) {
    const shell = document.createElement('main')
    shell.className = 'talos-shell'
    const portal = document.createElement('div')
    portal.id = 'talos-portal-root'
    const mountPoint = document.createElement('div')
    shell.append(portal, mountPoint)
    document.body.append(shell)

    const interactions: TalosBrowserPointerFrame[] = []
    const confirmations: Array<'approve' | 'reject'> = []
    const state = reactive({
        activities: [activity],
        talosSessionId: 'chat-1',
        activeBrowserSession: session,
        interactionPending: false,
        interactionLocked: false,
        interactionError: null,
        pendingInteractionApproval: null,
        ...overrides,
    })
    app = createApp({
        render: () => h(TalosBrowserScreenshotEvidence, {
            ...state,
            onInteract: (frame: TalosBrowserPointerFrame) => interactions.push(frame),
            onConfirm: (decision: 'approve' | 'reject') => confirmations.push(decision),
        }),
    })
    app.mount(mountPoint)
    await nextTick()

    return { shell, portal, mountPoint, interactions, confirmations, state }
}

async function openViewer(mountPoint: HTMLElement) {
    const trigger = mountPoint.querySelector<HTMLButtonElement>('[data-testid="browser-evidence-open-artifact-1"]')
    expect(trigger).not.toBeNull()
    trigger?.click()
    await nextTick()
    await new Promise((resolve) => setTimeout(resolve, 0))
    await nextTick()
}

async function loadSelectedImage(portal: HTMLElement, artifactId = 'artifact-1', width = 800, height = 600) {
    const image = portal.querySelector<HTMLImageElement>(`[data-testid="browser-evidence-image-${artifactId}"]`)
    expect(image).not.toBeNull()
    Object.defineProperty(image, 'naturalWidth', { configurable: true, value: width })
    Object.defineProperty(image, 'naturalHeight', { configurable: true, value: height })
    image?.dispatchEvent(new Event('load'))
    await nextTick()
}

afterEach(() => {
    app?.unmount()
    app = null
    document.body.replaceChildren()
    vi.restoreAllMocks()
})

describe('TalosBrowserScreenshotEvidence', () => {
    it('opens the real artifact in an in-app shadcn Dialog instead of a new browser tab', async () => {
        const warningSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
        const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(jsonResponse({ data: artifact }))
        const { mountPoint, portal } = await mountEvidence()

        expect(mountPoint.querySelector('a[target="_blank"]')).toBeNull()
        await openViewer(mountPoint)

        expect(fetchSpy).toHaveBeenCalledWith(
            '/api/talos/browser/artifacts/artifact-1',
            expect.objectContaining({ headers: expect.any(Headers) }),
        )
        expect(portal.querySelector('[role="dialog"]')).not.toBeNull()
        expect(portal.textContent).toContain('Integrity-verified capture')
        expect(portal.textContent).toContain('Untrusted browser content')
        expect(portal.querySelector('[data-testid="browser-evidence-image-artifact-1"]')).not.toBeNull()
        expect(warningSpy).not.toHaveBeenCalledWith(expect.stringContaining('Missing `Description`'))
    })

    it('closes the main screenshot Dialog on Escape', async () => {
        vi.spyOn(globalThis, 'fetch').mockResolvedValue(jsonResponse({ data: artifact }))
        const { mountPoint, portal } = await mountEvidence()
        await openViewer(mountPoint)

        const dialog = portal.querySelector<HTMLElement>('[role="dialog"]')
        expect(dialog?.getAttribute('data-state')).toBe('open')
        dialog?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
        await nextTick()

        expect(portal.querySelector('[role="dialog"]')?.getAttribute('data-state')).toBe('closed')
    })

    it('maps only clicks inside the painted image and emits a current typed pointer frame', async () => {
        vi.spyOn(globalThis, 'fetch').mockResolvedValue(jsonResponse({ data: artifact }))
        const { mountPoint, portal, interactions } = await mountEvidence()
        await openViewer(mountPoint)
        await loadSelectedImage(portal)

        const stage = portal.querySelector<HTMLElement>('[data-testid="browser-evidence-stage"]')
        expect(stage).not.toBeNull()
        vi.spyOn(stage!, 'getBoundingClientRect').mockReturnValue({
            x: 0,
            y: 0,
            left: 0,
            top: 0,
            right: 800,
            bottom: 800,
            width: 800,
            height: 800,
            toJSON: () => ({}),
        } as DOMRect)

        stage?.dispatchEvent(new MouseEvent('click', { bubbles: true, clientX: 400, clientY: 50 }))
        await nextTick()
        expect(interactions).toHaveLength(0)

        stage?.dispatchEvent(new MouseEvent('click', { bubbles: true, clientX: 400, clientY: 400 }))
        await new Promise((resolve) => setTimeout(resolve, 260))
        await nextTick()
        expect(interactions).toHaveLength(1)
        expect(interactions[0]).toMatchObject({
            browserSessionId: 'browser-1',
            artifact: { id: 'artifact-1', sha256: 'a'.repeat(64), state_version: 7 },
            normalizedX: 0.5,
            normalizedY: 0.5,
            clickCount: 1,
        })
    })

    it('blocks duplicate pointer input while an interaction is pending', async () => {
        vi.spyOn(globalThis, 'fetch').mockResolvedValue(jsonResponse({ data: artifact }))
        const { mountPoint, portal, interactions } = await mountEvidence({ interactionPending: true })
        await openViewer(mountPoint)
        await loadSelectedImage(portal)

        const stage = portal.querySelector<HTMLElement>('[data-testid="browser-evidence-stage"]')
        vi.spyOn(stage!, 'getBoundingClientRect').mockReturnValue({
            x: 0, y: 0, left: 0, top: 0, right: 800, bottom: 600, width: 800, height: 600, toJSON: () => ({}),
        } as DOMRect)
        stage?.dispatchEvent(new MouseEvent('click', { bubbles: true, clientX: 400, clientY: 300 }))
        await nextTick()

        expect(interactions).toHaveLength(0)
        expect(portal.textContent).toContain('Interaction in progress')
    })

    it('turns a native double click into one click_count=2 interaction', async () => {
        vi.spyOn(globalThis, 'fetch').mockResolvedValue(jsonResponse({ data: artifact }))
        const { mountPoint, portal, interactions } = await mountEvidence()
        await openViewer(mountPoint)
        await loadSelectedImage(portal)

        const stage = portal.querySelector<HTMLElement>('[data-testid="browser-evidence-stage"]')
        vi.spyOn(stage!, 'getBoundingClientRect').mockReturnValue({
            x: 0, y: 0, left: 0, top: 0, right: 800, bottom: 600, width: 800, height: 600, toJSON: () => ({}),
        } as DOMRect)
        stage?.dispatchEvent(new MouseEvent('click', { bubbles: true, clientX: 400, clientY: 300, detail: 1 }))
        stage?.dispatchEvent(new MouseEvent('click', { bubbles: true, clientX: 400, clientY: 300, detail: 2 }))
        await nextTick()

        expect(interactions).toHaveLength(1)
        expect(interactions[0]?.clickCount).toBe(2)
    })

    it('keeps the evidence surface locked after recovery is required', async () => {
        vi.spyOn(globalThis, 'fetch').mockResolvedValue(jsonResponse({ data: artifact }))
        const { mountPoint, portal, interactions } = await mountEvidence({
            interactionLocked: true,
            interactionError: 'Browser recovery is required.',
        })
        await openViewer(mountPoint)
        await loadSelectedImage(portal)

        const stage = portal.querySelector<HTMLElement>('[data-testid="browser-evidence-stage"]')
        vi.spyOn(stage!, 'getBoundingClientRect').mockReturnValue({
            x: 0, y: 0, left: 0, top: 0, right: 800, bottom: 600, width: 800, height: 600, toJSON: () => ({}),
        } as DOMRect)
        stage?.dispatchEvent(new MouseEvent('click', { bubbles: true, clientX: 400, clientY: 300 }))
        await new Promise((resolve) => setTimeout(resolve, 260))
        await nextTick()

        expect(interactions).toHaveLength(0)
        expect(portal.textContent).toContain('Recovery required')
    })

    it('does not dispatch before the selected PNG has decoded successfully', async () => {
        vi.spyOn(globalThis, 'fetch').mockResolvedValue(jsonResponse({ data: artifact }))
        const { mountPoint, portal, interactions } = await mountEvidence()
        await openViewer(mountPoint)

        const stage = portal.querySelector<HTMLElement>('[data-testid="browser-evidence-stage"]')
        vi.spyOn(stage!, 'getBoundingClientRect').mockReturnValue({
            x: 0, y: 0, left: 0, top: 0, right: 800, bottom: 600, width: 800, height: 600, toJSON: () => ({}),
        } as DOMRect)
        stage?.dispatchEvent(new MouseEvent('click', { bubbles: true, clientX: 400, clientY: 300 }))
        await new Promise((resolve) => setTimeout(resolve, 260))
        await nextTick()

        expect(interactions).toHaveLength(0)
        expect(portal.textContent).toContain('Capture is still loading')
    })

    it('fails closed on preview decode failure and offers a retry', async () => {
        vi.spyOn(globalThis, 'fetch').mockResolvedValue(jsonResponse({ data: artifact }))
        const { mountPoint, portal, interactions } = await mountEvidence()
        await openViewer(mountPoint)
        const image = portal.querySelector<HTMLImageElement>('[data-testid="browser-evidence-image-artifact-1"]')
        image?.dispatchEvent(new Event('error'))
        await nextTick()

        expect(interactions).toHaveLength(0)
        expect(portal.querySelector('[role="alert"]')?.textContent).toContain('could not decode')
        expect(portal.querySelector('[data-testid="browser-evidence-retry"]')).not.toBeNull()
    })

    it('rejects a decoded preview whose dimensions do not match signed metadata', async () => {
        vi.spyOn(globalThis, 'fetch').mockResolvedValue(jsonResponse({ data: artifact }))
        const { mountPoint, portal, interactions } = await mountEvidence()
        await openViewer(mountPoint)
        await loadSelectedImage(portal, 'artifact-1', 640, 480)

        expect(interactions).toHaveLength(0)
        expect(portal.querySelector('[role="alert"]')?.textContent).toContain('dimensions did not match')
    })

    it('closes and clears the open viewer when the owning chat changes', async () => {
        vi.spyOn(globalThis, 'fetch').mockResolvedValue(jsonResponse({ data: artifact }))
        const { mountPoint, portal, state } = await mountEvidence()
        await openViewer(mountPoint)
        expect(portal.querySelector('[role="dialog"]')).not.toBeNull()

        state.talosSessionId = 'chat-2'
        state.activeBrowserSession = null
        state.activities = []
        await nextTick()

        expect(portal.querySelector('[role="dialog"][data-state="open"]')).toBeNull()
        expect(portal.querySelector('[data-testid="browser-evidence-image-artifact-1"]')).toBeNull()
    })

    it('moves the open gallery to the persisted post-action frame when activity arrives after session state', async () => {
        const artifact2 = {
            ...artifact,
            id: 'artifact-2',
            state_version: 8,
            source_state_version: 7,
            sha256: 'c'.repeat(64),
        }
        vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
            const url = String(input)
            return jsonResponse({ data: url.endsWith('/artifact-2') ? artifact2 : artifact })
        })
        const { mountPoint, portal, state } = await mountEvidence()
        await openViewer(mountPoint)

        state.activeBrowserSession = {
            ...session,
            state_version: 8,
            last_screenshot_artifact_id: 'artifact-2',
        }
        state.activities = [activity, {
            ...activity,
            id: 'event-2',
            artifact_ids: ['artifact-2'],
        }]
        await nextTick()
        await new Promise((resolve) => setTimeout(resolve, 0))
        await nextTick()

        expect(portal.querySelector('[data-testid="browser-evidence-image-artifact-2"]')).not.toBeNull()
        expect(portal.textContent).toContain('2 / 2')
    })

    it('moves an open persisted-message viewer to the shared current HMI frame without duplicating closed thumbnails', async () => {
        const activity2 = { ...activity, id: 'event-2', artifact_ids: ['artifact-2'] }
        const artifact2 = {
            ...artifact,
            id: 'artifact-2',
            state_version: 8,
            source_state_version: 7,
            sha256: 'c'.repeat(64),
        }
        vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => (
            jsonResponse({ data: String(input).endsWith('/artifact-2') ? artifact2 : artifact })
        ))
        const { mountPoint, portal } = await mountEvidence({
            currentFrameActivity: activity2,
            activeBrowserSession: { ...session, state_version: 8, last_screenshot_artifact_id: 'artifact-2' },
        })

        expect(mountPoint.querySelector('[data-testid="browser-evidence-open-artifact-2"]')).toBeNull()
        await openViewer(mountPoint)
        await new Promise((resolve) => setTimeout(resolve, 0))
        await nextTick()

        expect(portal.querySelector('[data-testid="browser-evidence-image-artifact-2"]')).not.toBeNull()
        expect(portal.textContent).toContain('2 / 2')
    })

    it('ignores a stale metadata failure after the user selects a newer capture', async () => {
        const activity2 = { ...activity, id: 'event-2', artifact_ids: ['artifact-2'] }
        const artifact2 = { ...artifact, id: 'artifact-2', sha256: 'c'.repeat(64) }
        let rejectFirst: ((reason?: unknown) => void) | null = null
        vi.spyOn(globalThis, 'fetch').mockImplementation((input) => {
            if (String(input).endsWith('/artifact-2')) return Promise.resolve(jsonResponse({ data: artifact2 }))
            return new Promise<Response>((_resolve, reject) => {
                rejectFirst = reject
            })
        })
        const { mountPoint, portal } = await mountEvidence({ activities: [activity, activity2] })
        await openViewer(mountPoint)

        portal.querySelector<HTMLButtonElement>('[aria-label="Next capture"]')?.click()
        await new Promise((resolve) => setTimeout(resolve, 0))
        await nextTick()
        rejectFirst?.(new Error('stale artifact request failed'))
        await new Promise((resolve) => setTimeout(resolve, 0))
        await nextTick()

        expect(portal.querySelector('[data-testid="browser-evidence-image-artifact-2"]')).not.toBeNull()
        expect(portal.textContent).not.toContain('stale artifact request failed')
    })

    it('allows authorized historical inspection without an active browser session', async () => {
        vi.spyOn(globalThis, 'fetch').mockResolvedValue(jsonResponse({ data: artifact }))
        const { mountPoint, portal } = await mountEvidence({ activeBrowserSession: null })
        await openViewer(mountPoint)
        await loadSelectedImage(portal)

        expect(portal.querySelector('[data-testid="browser-evidence-image-artifact-1"]')).not.toBeNull()
        expect(portal.querySelector('[role="alert"]')).toBeNull()
        expect(portal.textContent).toContain('Historical frame, inspection only')
    })

    it('uses an upstream AlertDialog for the exact sensitive-action challenge', async () => {
        vi.spyOn(globalThis, 'fetch').mockResolvedValue(jsonResponse({ data: artifact }))
        const { mountPoint, portal, confirmations } = await mountEvidence({ pendingInteractionApproval: challenge })
        await openViewer(mountPoint)

        const alert = portal.querySelector('[role="alertdialog"]')
        expect(alert).not.toBeNull()
        expect(alert?.textContent).toContain('Place order')
        expect(alert?.textContent).toContain('https://shop.example')
        expect(alert?.textContent).toContain('financial commitment')
        expect(alert?.textContent).toContain('Approval expires')

        portal.querySelector<HTMLButtonElement>('[data-testid="browser-hmi-confirm"]')?.click()
        await nextTick()
        expect(confirmations).toEqual(['approve'])
    })

    it('treats Escape from a sensitive-action AlertDialog as an explicit rejection', async () => {
        vi.spyOn(globalThis, 'fetch').mockResolvedValue(jsonResponse({ data: artifact }))
        const { mountPoint, portal, confirmations } = await mountEvidence({ pendingInteractionApproval: challenge })
        await openViewer(mountPoint)

        const alert = portal.querySelector<HTMLElement>('[role="alertdialog"]')
        expect(alert).not.toBeNull()
        alert?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
        await nextTick()

        expect(confirmations).toEqual(['reject'])
    })

    it('prevents approval after the signed challenge has expired', async () => {
        vi.spyOn(globalThis, 'fetch').mockResolvedValue(jsonResponse({ data: artifact }))
        const expiredChallenge = { ...challenge, expires_at: '2020-01-01T00:00:00Z' }
        const { mountPoint, portal, confirmations } = await mountEvidence({ pendingInteractionApproval: expiredChallenge })
        await openViewer(mountPoint)

        const confirm = portal.querySelector<HTMLButtonElement>('[data-testid="browser-hmi-confirm"]')
        expect(portal.querySelector('[role="alert"]')?.textContent).toContain('Approval expired')
        expect(confirm?.disabled).toBe(true)
        confirm?.click()
        await nextTick()
        expect(confirmations).toEqual([])
    })
})
