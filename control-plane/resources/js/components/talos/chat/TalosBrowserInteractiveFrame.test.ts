// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest'
import { createApp, h, nextTick, ref } from 'vue'
import TalosBrowserInteractiveFrame, {
    type TalosBrowserInteractiveFrameHandle,
} from './TalosBrowserInteractiveFrame.vue'
import type {
    TalosBrowserArtifact,
    TalosBrowserPointerFrame,
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
} = {}) {
    const portal = document.createElement('div')
    portal.id = 'talos-portal-root'
    const mountPoint = document.createElement('div')
    document.body.append(portal, mountPoint)
    const frame = ref<TalosBrowserInteractiveFrameHandle | null>(null)
    const interactions: TalosBrowserPointerFrame[] = []

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
                    mobile: options.mobile ?? false,
                    mobileWindowPresentation: options.presentation ?? 'drawer',
                    onInteract: (pointer: TalosBrowserPointerFrame) => interactions.push(pointer),
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

    return { portal, mountPoint, launcher, interactions, frame }
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
})
