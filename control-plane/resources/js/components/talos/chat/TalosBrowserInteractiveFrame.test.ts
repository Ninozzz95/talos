// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest'
import { createApp, h, nextTick, ref } from 'vue'
import TalosBrowserInteractiveFrame, {
    type TalosBrowserInteractiveFrameHandle,
} from './TalosBrowserInteractiveFrame.vue'
import type {
    TalosBrowserArtifact,
    TalosBrowserPointerFrame,
    TalosBrowserRefFrame,
    TalosBrowserRefInteraction,
    TalosBrowserScrollFrame,
    TalosBrowserSession,
    TalosMobileWindowPresentation,
} from '../../../lib/talosTypes'

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
    created_at: '2026-07-16T10:00:00Z',
}

const refreshedArtifact: TalosBrowserArtifact = {
    ...artifact,
    id: 'artifact-2',
    state_version: 8,
    source_state_version: 7,
    sha256: 'b'.repeat(64),
    created_at: '2026-07-16T10:01:00Z',
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
    created_at: '2026-07-16T10:00:00Z',
    updated_at: '2026-07-16T10:00:00Z',
}

const refFrame: TalosBrowserRefFrame = {
    schema_version: 'talos_browser_hmi_ref_targets_v2',
    browser_session_id: 'browser-1',
    state_version: 7,
    frame_sha256: `sha256:${'a'.repeat(64)}`,
    snapshot_id: `hmi_ref_${'d'.repeat(64)}`,
    screenshot: artifact,
    targets: [
        { ref: 'e1', role: 'button', name: 'Reject optional cookies', destination: null },
        { ref: 'e2', role: 'link', name: 'Privacy settings', destination: 'https://example.com/privacy' },
    ],
}

let app: ReturnType<typeof createApp> | null = null

function jsonResponse(data: unknown) {
    return new Response(JSON.stringify(data), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
    })
}

async function settle() {
    await nextTick()
    await new Promise((resolve) => setTimeout(resolve, 0))
    await nextTick()
}

async function mountFrame(options: {
    mobile?: boolean
    presentation?: TalosMobileWindowPresentation
    activeSession?: TalosBrowserSession | null
    artifactIds?: string[]
    refFrame?: TalosBrowserRefFrame | null
    refTargetsLoading?: boolean
    refTargetsError?: string | null
} = {}) {
    const portal = document.createElement('div')
    portal.id = 'talos-portal-root'
    const mountPoint = document.createElement('div')
    document.body.append(portal, mountPoint)
    const frame = ref<TalosBrowserInteractiveFrameHandle | null>(null)
    const interactions: TalosBrowserPointerFrame[] = []
    const refInteractions: TalosBrowserRefInteraction[] = []
    const scrolls: TalosBrowserScrollFrame[] = []

    app = createApp({
        setup() {
            return () => h('div', [
                h('button', {
                    type: 'button',
                    'data-testid': 'capture-launcher',
                    onClick: () => frame.value?.openArtifact('artifact-1'),
                }, 'Inspect capture'),
                h(TalosBrowserInteractiveFrame, {
                    ref: frame,
                    artifactIds: options.artifactIds ?? ['artifact-1'],
                    talosSessionId: 'chat-1',
                    activeBrowserSession: options.activeSession === undefined ? session : options.activeSession,
                    refFrame: options.refFrame ?? null,
                    refTargetsLoading: options.refTargetsLoading ?? false,
                    refTargetsError: options.refTargetsError ?? null,
                    mobile: options.mobile ?? false,
                    mobileWindowPresentation: options.presentation ?? 'drawer',
                    onInteract: (pointer: TalosBrowserPointerFrame) => interactions.push(pointer),
                    onInteractRef: (interaction: TalosBrowserRefInteraction) => refInteractions.push(interaction),
                    onScroll: (scroll: TalosBrowserScrollFrame) => scrolls.push(scroll),
                }),
            ])
        },
    })
    app.mount(mountPoint)
    await nextTick()

    const launcher = mountPoint.querySelector<HTMLButtonElement>('[data-testid="capture-launcher"]')
    expect(launcher).not.toBeNull()
    launcher?.focus()
    launcher?.click()
    await settle()

    return { portal, mountPoint, launcher, interactions, refInteractions, scrolls, frame }
}

async function decodeSelectedImage(portal: HTMLElement) {
    const image = portal.querySelector<HTMLImageElement>('[data-testid="browser-evidence-image-artifact-1"]')
    expect(image).not.toBeNull()
    Object.defineProperty(image, 'naturalWidth', { configurable: true, value: 800 })
    Object.defineProperty(image, 'naturalHeight', { configurable: true, value: 600 })
    image?.dispatchEvent(new Event('load'))
    await nextTick()
}

afterEach(() => {
    app?.unmount()
    app = null
    document.body.replaceChildren()
    vi.restoreAllMocks()
    vi.useRealTimers()
})

describe('TalosBrowserInteractiveFrame', () => {
    it('uses the real desktop Dialog, focuses its semantic title and restores the exact launcher', async () => {
        vi.spyOn(globalThis, 'fetch').mockResolvedValue(jsonResponse({ data: artifact }))
        const { portal, launcher } = await mountFrame({ mobile: false, presentation: 'drawer' })
        const surface = portal.querySelector<HTMLElement>('[data-testid="talos-browser-interactive-frame"]')

        expect(surface?.getAttribute('data-window-presentation')).toBe('desktop-dialog')
        expect(surface?.getAttribute('data-talos-upstream')).toBe('shadcn-vue-dialog')
        expect(document.activeElement?.getAttribute('data-testid')).toBe('talos-browser-interactive-frame-title')

        surface?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
        await settle()
        expect(document.activeElement).toBe(launcher)
    })

    it.each([
        ['drawer', 'shadcn-vue-reka-drawer'],
        ['fullscreen', 'shadcn-vue-dialog'],
    ] as const)('uses the persisted mobile %s upstream surface', async (presentation, upstream) => {
        vi.spyOn(globalThis, 'fetch').mockResolvedValue(jsonResponse({ data: artifact }))
        const { portal } = await mountFrame({ mobile: true, presentation })
        const surface = portal.querySelector<HTMLElement>('[data-testid="talos-browser-interactive-frame"]')

        expect(surface?.getAttribute('data-window-presentation')).toBe(presentation)
        expect(surface?.getAttribute('data-talos-upstream')).toBe(upstream)
        expect(surface?.getAttribute('aria-modal')).toBe('true')
    })

    it('preserves the original launcher when a current frame refreshes while open', async () => {
        vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
            const url = String(input)
            return jsonResponse({ data: url.endsWith('/artifact-2') ? refreshedArtifact : artifact })
        })
        const { frame, launcher, portal } = await mountFrame({ artifactIds: ['artifact-1', 'artifact-2'] })

        expect(document.activeElement?.getAttribute('data-testid')).toBe('talos-browser-interactive-frame-title')
        await frame.value?.openArtifact('artifact-2')
        await settle()
        expect(portal.querySelector('[data-testid="browser-evidence-image-artifact-2"]')).not.toBeNull()

        portal.querySelector<HTMLElement>('[data-testid="talos-browser-interactive-frame"]')
            ?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
        await settle()
        expect(document.activeElement).toBe(launcher)
    })

    it('isolates the coordinate stage from mobile drawer swipe capture', async () => {
        vi.spyOn(globalThis, 'fetch').mockResolvedValue(jsonResponse({ data: artifact }))
        const { portal } = await mountFrame({ mobile: true, presentation: 'drawer' })
        const surface = portal.querySelector<HTMLElement>('[data-testid="talos-browser-interactive-frame"]')
        const stage = portal.querySelector<HTMLElement>('[data-testid="browser-evidence-stage"]')
        const header = surface?.querySelector<HTMLElement>('header')
        const pointerStarts: EventTarget[] = []
        const touchStarts: EventTarget[] = []

        expect(surface).not.toBeNull()
        expect(stage).not.toBeNull()
        expect(header).not.toBeNull()
        surface?.addEventListener('pointerdown', (event) => pointerStarts.push(event.target!))
        surface?.addEventListener('touchstart', (event) => touchStarts.push(event.target!))

        const touch = { clientX: 120, clientY: 220 } as Touch
        const touchStart = () => new TouchEvent('touchstart', { bubbles: true, touches: [touch] })

        stage?.dispatchEvent(new Event('pointerdown', { bubbles: true }))
        stage?.dispatchEvent(touchStart())
        expect(pointerStarts).toHaveLength(0)
        expect(touchStarts).toHaveLength(0)

        header?.dispatchEvent(new Event('pointerdown', { bubbles: true }))
        header?.dispatchEvent(touchStart())
        expect(pointerStarts).toEqual([header])
        expect(touchStarts).toEqual([header])
    })

    it('keeps a stale decoded capture inspection-only and emits no pointer action', async () => {
        vi.spyOn(globalThis, 'fetch').mockResolvedValue(jsonResponse({ data: artifact }))
        const staleSession = { ...session, state_version: 8, last_screenshot_artifact_id: 'artifact-2' }
        const { portal, interactions } = await mountFrame({ activeSession: staleSession })
        await decodeSelectedImage(portal)

        const stage = portal.querySelector<HTMLElement>('[data-testid="browser-evidence-stage"]')
        expect(portal.textContent).toContain('Historical frame, inspection only')
        stage?.dispatchEvent(new MouseEvent('click', { bubbles: true, clientX: 400, clientY: 300 }))
        await new Promise((resolve) => setTimeout(resolve, 260))
        expect(interactions).toHaveLength(0)
    })

    it('STAGE2A-002 coalesces wheel input and exposes accessible scroll buttons only for the current decoded frame', async () => {
        vi.spyOn(globalThis, 'fetch').mockResolvedValue(jsonResponse({ data: artifact }))
        const { portal, scrolls } = await mountFrame()
        await decodeSelectedImage(portal)
        vi.useFakeTimers()

        const stage = portal.querySelector<HTMLElement>('[data-testid="browser-evidence-stage"]')
        const first = new WheelEvent('wheel', { bubbles: true, cancelable: true, deltaY: 2, deltaMode: 1 })
        const second = new WheelEvent('wheel', { bubbles: true, cancelable: true, deltaY: 1, deltaMode: 1 })
        stage?.dispatchEvent(first)
        stage?.dispatchEvent(second)

        expect(first.defaultPrevented).toBe(true)
        expect(second.defaultPrevented).toBe(true)
        expect(scrolls).toHaveLength(0)
        await vi.advanceTimersByTimeAsync(100)
        expect(scrolls).toEqual([{
            browserSessionId: 'browser-1',
            artifact,
            deltaY: 120,
        }])

        const up = portal.querySelector<HTMLButtonElement>('[aria-label="Scroll browser page up"]')
        const down = portal.querySelector<HTMLButtonElement>('[aria-label="Scroll browser page down"]')
        expect(up).not.toBeNull()
        expect(down).not.toBeNull()
        expect(up?.disabled).toBe(true)
        expect(down?.disabled).toBe(true)
    })

    it('STAGE2A-002 keeps historical frame scroll controls disabled', async () => {
        vi.spyOn(globalThis, 'fetch').mockResolvedValue(jsonResponse({ data: artifact }))
        const staleSession = { ...session, state_version: 8, last_screenshot_artifact_id: 'artifact-2' }
        const { portal, scrolls } = await mountFrame({ activeSession: staleSession })
        await decodeSelectedImage(portal)

        portal.querySelector<HTMLButtonElement>('[aria-label="Scroll browser page down"]')?.click()
        expect(scrolls).toHaveLength(0)
        expect(portal.querySelector<HTMLButtonElement>('[aria-label="Scroll browser page down"]')?.disabled).toBe(true)
    })

    it('STAGE2B-016 renders keyboard-reachable page controls only for the current decoded frame', async () => {
        vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
            const url = String(input)
            return jsonResponse({ data: url.endsWith('/artifact-2') ? refreshedArtifact : artifact })
        })
        const { portal, frame, refInteractions } = await mountFrame({
            artifactIds: ['artifact-1', 'artifact-2'],
            refFrame,
        })
        await decodeSelectedImage(portal)

        const rail = portal.querySelector<HTMLElement>('[data-testid="browser-page-controls"]')
        const controls = [...portal.querySelectorAll<HTMLButtonElement>('[data-browser-ref]')]
        expect(rail?.textContent).toContain('Page controls')
        expect(controls).toHaveLength(2)
        expect(controls.every((control) => control.tagName === 'BUTTON')).toBe(true)
        expect(controls[0]?.textContent).toContain('Reject optional cookies')
        expect(controls[1]?.textContent).toContain('example.com')
        controls[0]?.focus()
        expect(document.activeElement).toBe(controls[0])
        controls[0]?.click()
        expect(refInteractions).toEqual([{
            browserSessionId: 'browser-1',
            artifact,
            snapshotId: refFrame.snapshot_id,
            ref: 'e1',
            clickCount: 1,
        }])
        expect(portal.textContent).not.toContain('raw_snapshot')
        expect(portal.textContent).not.toContain('text_digest')

        await frame.value?.openArtifact('artifact-2')
        await settle()
        const historical = portal.querySelector<HTMLImageElement>('[data-testid="browser-evidence-image-artifact-2"]')
        Object.defineProperty(historical, 'naturalWidth', { configurable: true, value: 800 })
        Object.defineProperty(historical, 'naturalHeight', { configurable: true, value: 600 })
        historical?.dispatchEvent(new Event('load'))
        await nextTick()
        expect(portal.querySelectorAll('[data-browser-ref]')).toHaveLength(0)
    })

    it('STAGE2B-017 keeps coordinate interaction enabled beside a compact semantic-unavailable state', async () => {
        vi.spyOn(globalThis, 'fetch').mockResolvedValue(jsonResponse({ data: artifact }))
        const { portal, interactions } = await mountFrame({
            refTargetsError: 'Semantic page controls are temporarily unavailable. You can still interact directly with the screenshot.',
        })
        await decodeSelectedImage(portal)
        vi.useFakeTimers()

        const rail = portal.querySelector<HTMLElement>('[data-testid="browser-page-controls"]')
        const stage = portal.querySelector<HTMLElement>('[data-testid="browser-evidence-stage"]')
        expect(rail?.getAttribute('role')).toBe('status')
        expect(rail?.textContent).toContain('Semantic page controls are temporarily unavailable')
        expect(portal.querySelectorAll('[data-browser-ref]')).toHaveLength(0)
        expect(stage?.className).not.toContain('pointer-events-none')
        Object.defineProperty(stage, 'getBoundingClientRect', {
            configurable: true,
            value: () => ({ left: 0, top: 0, right: 800, bottom: 600, width: 800, height: 600, x: 0, y: 0, toJSON: () => ({}) }),
        })
        stage?.dispatchEvent(new MouseEvent('click', { bubbles: true, clientX: 400, clientY: 300, detail: 1 }))
        await vi.advanceTimersByTimeAsync(221)
        expect(interactions).toEqual([{
            browserSessionId: 'browser-1',
            artifact,
            normalizedX: 0.5,
            normalizedY: 0.5,
            clickCount: 1,
        }])
    })
})
