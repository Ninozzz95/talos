// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest'
import { createApp, defineComponent, h, nextTick, reactive } from 'vue'
import type { TalosLibraryItem } from '../../../lib/talosLibrary'
import TalosMediaLightbox from './TalosMediaLightbox.vue'

let app: ReturnType<typeof createApp> | undefined

afterEach(() => {
    app?.unmount()
    app = undefined
    document.body.replaceChildren()
    vi.restoreAllMocks()
})

function item(id: string): TalosLibraryItem {
    return {
        id,
        sourceType: 'file',
        sourceId: `file-${id}`,
        kind: 'image',
        origin: 'uploaded',
        title: `${id}.png`,
        mimeType: 'image/png',
        byteSize: 20,
        checksum: 'a'.repeat(64),
        sourceUrl: null,
        contentUrl: `/api/talos/files/file-${id}/content`,
        trustBoundary: 'untrusted_upload',
        occurredAt: '2026-07-28T14:00:00.000000Z',
        metadata: Object.freeze({}),
        chatCount: 0,
        backlinks: Object.freeze([]),
        canAttach: true,
    }
}

async function settle() {
    await nextTick()
    await new Promise<void>((resolve) => window.setTimeout(resolve, 0))
    await nextTick()
}

describe('TalosMediaLightbox', () => {
    it('loads authenticated images, navigates, revokes replaced URLs and focuses close', async () => {
        vi.spyOn(globalThis, 'fetch').mockImplementation(async () => new Response('image', {
            status: 200,
            headers: { 'Content-Type': 'image/png' },
        }))
        vi.spyOn(URL, 'createObjectURL')
            .mockReturnValueOnce('blob:first')
            .mockReturnValueOnce('blob:second')
        const revoke = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined)
        const state = reactive({ open: true, activeId: 'first' })
        const portal = document.createElement('div')
        portal.id = 'talos-portal-root'
        const mountPoint = document.createElement('div')
        document.body.append(mountPoint, portal)
        app = createApp(defineComponent({
            setup() {
                return () => h(TalosMediaLightbox, {
                    open: state.open,
                    items: [item('first'), item('second')],
                    activeItemId: state.activeId,
                    'onUpdate:open': (value: boolean) => { state.open = value },
                    'onUpdate:activeItemId': (value: string) => { state.activeId = value },
                })
            },
        }))
        app.mount(mountPoint)
        await settle()

        expect(globalThis.fetch).toHaveBeenCalledWith(
            '/api/talos/files/file-first/content',
            expect.objectContaining({ credentials: 'same-origin' }),
        )
        expect(document.querySelector<HTMLImageElement>('[data-testid="talos-library-lightbox-image"]')?.src)
            .toContain('blob:first')
        expect(document.activeElement?.getAttribute('aria-label')).toBe('Close media preview')

        document.querySelector<HTMLButtonElement>('[aria-label="Next image"]')?.click()
        await settle()
        await settle()
        expect(state.activeId).toBe('second')
        expect(revoke).toHaveBeenCalledWith('blob:first')
        expect(document.querySelector<HTMLImageElement>('[data-testid="talos-library-lightbox-image"]')?.src)
            .toContain('blob:second')

        document.querySelector<HTMLButtonElement>('[aria-label="Close media preview"]')?.click()
        await settle()
        expect(state.open).toBe(false)
        expect(revoke).toHaveBeenCalledWith('blob:second')
    })

    it('renders an actionable failure and never creates an object URL for invalid content', async () => {
        vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('no', { status: 500 }))
        const create = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:never')
        vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined)
        const portal = document.createElement('div')
        portal.id = 'talos-portal-root'
        const mountPoint = document.createElement('div')
        document.body.append(mountPoint, portal)
        app = createApp(TalosMediaLightbox, {
            open: true,
            items: [item('failed')],
            activeItemId: 'failed',
        })
        app.mount(mountPoint)
        await settle()

        expect(document.querySelector('[role="alert"]')?.textContent).toContain('HTTP 500')
        expect(create).not.toHaveBeenCalled()
    })
})
