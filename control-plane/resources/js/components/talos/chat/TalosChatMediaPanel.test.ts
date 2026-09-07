// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest'
import { createApp, defineComponent, h, nextTick, ref } from 'vue'
import TalosChatMediaPanel from './TalosChatMediaPanel.vue'

const apps: Array<ReturnType<typeof createApp>> = []

function rawItem(id: string, overrides: Record<string, unknown> = {}) {
    return {
        id,
        source_type: 'file',
        source_id: `source-${id}`,
        kind: 'file',
        origin: 'uploaded',
        title: `Item ${id}`,
        mime_type: 'text/plain',
        byte_size: 12,
        checksum: 'a'.repeat(64),
        source_url: null,
        content_url: `/api/talos/files/source-${id}/content`,
        trust_boundary: 'untrusted_upload',
        occurred_at: '2026-07-28T14:00:00.000000Z',
        metadata: {},
        chat_count: 1,
        backlinks: [{
            session_id: 'session-a',
            title: 'Active chat',
            relation: 'attachment',
            occurred_at: '2026-07-28T14:00:00.000000Z',
        }],
        can_attach: true,
        ...overrides,
    }
}

function mediaResponse() {
    return {
        data: [
            rawItem('image', {
                title: 'evidence.png',
                kind: 'image',
                mime_type: 'image/png',
            }),
            rawItem('file', {
                title: 'report.pdf',
                mime_type: 'application/pdf',
            }),
            rawItem('source', {
                source_type: 'run_artifact',
                source_id: 'source-result',
                title: 'Official source',
                kind: 'link',
                origin: 'search',
                mime_type: 'text/html',
                checksum: null,
                source_url: 'https://example.com/source',
                content_url: null,
                can_attach: false,
            }),
        ],
        meta: { count: 3, has_more: false },
    }
}

function jsonResponse(value: unknown, status = 200) {
    return new Response(JSON.stringify(value), {
        status,
        headers: { 'Content-Type': 'application/json' },
    })
}

async function settle() {
    await nextTick()
    await new Promise<void>((resolve) => window.setTimeout(resolve, 0))
    await nextTick()
}

afterEach(() => {
    apps.splice(0).forEach((app) => app.unmount())
    document.body.replaceChildren()
    vi.restoreAllMocks()
})

function mountPanel() {
    const portal = document.createElement('div')
    portal.id = 'talos-portal-root'
    document.body.append(portal)
    const open = ref(true)
    const sessionId = ref<string | null>('session-a')
    const container = document.createElement('div')
    document.body.append(container)
    const app = createApp(defineComponent({
        setup() {
            return () => h(TalosChatMediaPanel, {
                open: open.value,
                authenticated: true,
                ownerKey: 'settings-owner-a',
                sessionId: sessionId.value,
                'onUpdate:open': (value: boolean) => { open.value = value },
            })
        },
    }))
    apps.push(app)
    app.mount(container)

    return { open, sessionId }
}

describe('TalosChatMediaPanel', () => {
    it('loads only active-session media and filters All, Images, Files, and Sources', async () => {
        const requests: string[] = []
        vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
            const url = String(input)
            requests.push(url)
            return jsonResponse(mediaResponse())
        })
        mountPanel()
        await settle()
        await settle()

        expect(requests).toEqual(['/api/talos/sessions/session-a/media'])
        const dialog = document.querySelector<HTMLElement>('#talos-portal-root [role="dialog"]')
        expect(dialog?.textContent).toContain('evidence.png')
        expect(dialog?.textContent).toContain('report.pdf')
        expect(dialog?.textContent).toContain('Official source')

        dialog?.querySelector<HTMLButtonElement>('#talos-chat-media-tab-images')?.click()
        await nextTick()
        expect(dialog?.textContent).toContain('evidence.png')
        expect(dialog?.textContent).not.toContain('report.pdf')

        dialog?.querySelector<HTMLButtonElement>('#talos-chat-media-tab-files')?.click()
        await nextTick()
        expect(dialog?.textContent).toContain('report.pdf')
        expect(dialog?.textContent).not.toContain('Official source')

        dialog?.querySelector<HTMLButtonElement>('#talos-chat-media-tab-sources')?.click()
        await nextTick()
        expect(dialog?.querySelector<HTMLAnchorElement>('a[href="https://example.com/source"]')).not.toBeNull()
    })

    it('opens an authenticated image preview from current-chat media', async () => {
        vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
            const url = String(input)
            if (url.endsWith('/content')) {
                return new Response('image-bytes', {
                    status: 200,
                    headers: { 'Content-Type': 'image/png' },
                })
            }
            return jsonResponse(mediaResponse())
        })
        vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:session-image')
        vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined)
        mountPanel()
        await settle()
        await settle()

        document.querySelector<HTMLButtonElement>('[aria-label="Preview evidence.png"]')?.click()
        await settle()

        expect(URL.createObjectURL).toHaveBeenCalledTimes(1)
        expect(document.querySelector<HTMLImageElement>('img[src="blob:session-image"]')).not.toBeNull()
    })

    it('closes only the nested preview on Escape and restores its trigger focus', async () => {
        vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
            const url = String(input)
            if (url.endsWith('/content')) {
                return new Response('image-bytes', {
                    status: 200,
                    headers: { 'Content-Type': 'image/png' },
                })
            }
            return jsonResponse(mediaResponse())
        })
        vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:session-image')
        vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined)
        const { open } = mountPanel()
        await settle()
        await settle()

        const previewTrigger = document.querySelector<HTMLButtonElement>('[aria-label="Preview evidence.png"]')
        previewTrigger?.focus()
        previewTrigger?.click()
        await settle()

        expect(document.querySelectorAll('#talos-portal-root [role="dialog"]')).toHaveLength(2)
        const lightboxClose = document.querySelector<HTMLButtonElement>('[aria-label="Close media preview"]')
        expect(document.activeElement).toBe(lightboxClose)
        lightboxClose?.dispatchEvent(new KeyboardEvent('keydown', {
            key: 'Escape',
            bubbles: true,
            cancelable: true,
        }))
        await settle()

        expect(document.querySelectorAll('#talos-portal-root [role="dialog"]')).toHaveLength(1)
        expect(document.querySelector('[role="dialog"]')?.textContent).toContain('Chat media')
        expect(open.value).toBe(true)
        expect(document.activeElement).toBe(previewTrigger)
    })

    it('shows an actionable session-media failure and retries the same session', async () => {
        const fetch = vi.spyOn(globalThis, 'fetch')
            .mockResolvedValueOnce(jsonResponse({ message: 'Media unavailable' }, 500))
            .mockResolvedValueOnce(jsonResponse({ data: [], meta: { count: 0, has_more: false } }))
        mountPanel()
        await settle()
        await settle()

        const alert = document.querySelector<HTMLElement>('#talos-portal-root [role="alert"]')
        expect(alert?.textContent).toContain('Media unavailable')
        alert?.querySelector<HTMLButtonElement>('[data-testid="talos-chat-media-retry"]')?.click()
        await settle()

        expect(fetch).toHaveBeenCalledTimes(2)
        expect(document.body.textContent).toContain('This chat has no Library media yet.')
    })

    it('distinguishes the visible footer close action from the dialog close icon', async () => {
        vi.spyOn(globalThis, 'fetch').mockResolvedValue(jsonResponse(mediaResponse()))
        const { open } = mountPanel()
        await settle()

        const footerClose = document.querySelectorAll<HTMLButtonElement>('[aria-label="Close chat media"]')
        expect(footerClose).toHaveLength(1)
        footerClose[0].click()
        await nextTick()

        expect(open.value).toBe(false)
    })
})
