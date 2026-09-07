// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest'
import { createApp, nextTick } from 'vue'
import TalosLibrary from './TalosLibrary.vue'

let app: ReturnType<typeof createApp> | undefined

afterEach(() => {
    app?.unmount()
    app = undefined
    document.body.replaceChildren()
    localStorage.clear()
    vi.restoreAllMocks()
})

function rawItem(id: string, overrides: Record<string, unknown> = {}) {
    return {
        id,
        source_type: 'file',
        source_id: `file-${id}`,
        kind: 'file',
        origin: 'uploaded',
        title: `${id}.txt`,
        mime_type: 'text/plain',
        byte_size: 12,
        checksum: 'a'.repeat(64),
        source_url: null,
        content_url: `/api/talos/files/file-${id}/content`,
        trust_boundary: 'untrusted_upload',
        occurred_at: '2026-07-28T14:00:00.000000Z',
        metadata: {},
        chat_count: 0,
        backlinks: [],
        can_attach: true,
        ...overrides,
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

function mountLibrary(onAttachFile = vi.fn()) {
    const portal = document.createElement('div')
    portal.id = 'talos-portal-root'
    const mountPoint = document.createElement('div')
    document.body.append(mountPoint, portal)
    app = createApp(TalosLibrary, {
        authenticated: true,
        ownerKey: 'owner-a',
        onAttachFile,
    })
    app.mount(mountPoint)

    return { onAttachFile }
}

describe('TalosLibrary', () => {
    it('renders projected items, previews images and delegates governed attachment reuse', async () => {
        localStorage.setItem('talos.library.view.v1', 'grid')
        vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:preview')
        vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined)
        vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
            const url = String(input)
            if (url.includes('/content')) {
                return new Response('image', {
                    status: 200,
                    headers: { 'Content-Type': 'image/png' },
                })
            }
            return jsonResponse({
                data: [
                    rawItem('image', {
                        title: 'Evidence.png',
                        kind: 'image',
                        mime_type: 'image/png',
                    }),
                    rawItem('file', { title: 'Brief.txt' }),
                ],
                meta: { count: 2, has_more: false, next_cursor: null },
            })
        })
        const { onAttachFile } = mountLibrary()
        await settle()
        await settle()

        expect(document.body.textContent).toContain('Evidence.png')
        expect(document.body.textContent).toContain('Brief.txt')
        expect(document.querySelectorAll('[data-library-view="grid"]')).toHaveLength(2)

        document.querySelector<HTMLButtonElement>('[aria-label="Use Brief.txt in chat"]')?.click()
        expect(onAttachFile).toHaveBeenCalledWith('file-file')

        document.querySelector<HTMLButtonElement>('[aria-label="Preview Evidence.png"]')?.click()
        await settle()
        await settle()
        expect(document.querySelector('[role="dialog"]')?.textContent).toContain('Evidence.png')
        expect(document.querySelector<HTMLImageElement>('[data-testid="talos-library-lightbox-image"]')?.src)
            .toContain('blob:preview')
    })

    it('applies kind filters and removes selected rows only after AlertDialog confirmation', async () => {
        const requests: string[] = []
        vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
            const url = String(input)
            requests.push(`${init?.method ?? 'GET'} ${url}`)
            if (init?.method === 'DELETE') {
                return jsonResponse({ data: { removed_count: 1 } })
            }
            const imageOnly = url.includes('kind=image')
            const data = imageOnly
                ? [rawItem('image', { title: 'Only image.png', kind: 'image', mime_type: 'image/png' })]
                : [rawItem('one', { title: 'One.txt' })]
            return jsonResponse({
                data,
                meta: { count: data.length, has_more: false, next_cursor: null },
            })
        })
        mountLibrary()
        await settle()
        await settle()

        document.querySelector<HTMLButtonElement>('[data-testid="talos-library-kind-image"]')?.click()
        await settle()
        await settle()
        expect(requests.some((request) => request.includes('kind=image'))).toBe(true)
        expect(document.body.textContent).toContain('Only image.png')

        const selection = document.querySelector<HTMLInputElement>('[aria-label="Select Only image.png"]')
        expect(selection).not.toBeNull()
        selection?.click()
        await nextTick()
        expect(selection?.checked).toBe(true)
        const removeSelected = document.querySelector<HTMLButtonElement>('[data-testid="talos-library-remove-selected"]')
        expect(removeSelected).not.toBeNull()
        removeSelected?.click()
        await settle()
        const confirmation = document.querySelector('[role="alertdialog"], [role="dialog"]')
        expect(confirmation).not.toBeNull()
        expect(confirmation?.textContent).toContain('Remove from Library')
        expect(requests.some((request) => request.startsWith('DELETE'))).toBe(false)

        document.querySelector<HTMLButtonElement>('[data-testid="talos-library-confirm-remove"]')?.click()
        await settle()
        expect(requests.some((request) => request.startsWith('DELETE'))).toBe(true)
        expect(document.body.textContent).not.toContain('Only image.png')
    })

    it('shows actionable load failure and recovers to an empty state', async () => {
        const fetch = vi.spyOn(globalThis, 'fetch')
            .mockResolvedValueOnce(jsonResponse({ message: 'Library unavailable' }, 500))
            .mockResolvedValueOnce(jsonResponse({
                data: [],
                meta: { count: 0, has_more: false, next_cursor: null },
            }))
        mountLibrary()
        await settle()
        await settle()

        expect(document.querySelector('[role="alert"]')?.textContent).toContain('Library unavailable')
        document.querySelector<HTMLButtonElement>('[data-testid="talos-library-retry"]')?.click()
        await settle()
        await settle()

        expect(fetch).toHaveBeenCalledTimes(2)
        expect(document.body.textContent).toContain('No Library items match this view.')
    })

    it('keeps loaded items visible and announces pagination failure with recovery', async () => {
        const fetch = vi.spyOn(globalThis, 'fetch')
            .mockResolvedValueOnce(jsonResponse({
                data: [rawItem('one', { title: 'One.txt' })],
                meta: { count: 1, has_more: true, next_cursor: 'cursor-next' },
            }))
            .mockResolvedValueOnce(jsonResponse({ message: 'Next page unavailable' }, 503))
            .mockResolvedValueOnce(jsonResponse({
                data: [rawItem('one', { title: 'One.txt' })],
                meta: { count: 1, has_more: false, next_cursor: null },
            }))
        mountLibrary()
        await settle()
        await settle()

        const loadMore = Array.from(document.querySelectorAll<HTMLButtonElement>('button'))
            .find((button) => button.textContent?.includes('Load more'))
        expect(loadMore).not.toBeUndefined()
        loadMore?.click()
        await settle()
        await settle()

        expect(document.body.textContent).toContain('One.txt')
        const alert = document.querySelector('[data-testid="talos-library-inline-error"]')
        expect(alert?.getAttribute('role')).toBe('alert')
        expect(alert?.textContent).toContain('Next page unavailable')

        document.querySelector<HTMLButtonElement>('[data-testid="talos-library-inline-retry"]')?.click()
        await settle()
        await settle()

        expect(fetch).toHaveBeenCalledTimes(3)
        expect(document.querySelector('[data-testid="talos-library-inline-error"]')).toBeNull()
        expect(document.body.textContent).toContain('One.txt')
    })

    it('keeps removal confirmation open and announces mutation failure', async () => {
        vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
            if (init?.method === 'DELETE') {
                return jsonResponse({ message: 'Removal unavailable' }, 503)
            }

            return jsonResponse({
                data: [rawItem('one', { title: 'One.txt' })],
                meta: { count: 1, has_more: false, next_cursor: null },
            })
        })
        mountLibrary()
        await settle()
        await settle()

        document.querySelector<HTMLInputElement>('[aria-label="Select One.txt"]')?.click()
        await nextTick()
        document.querySelector<HTMLButtonElement>('[data-testid="talos-library-remove-selected"]')?.click()
        await settle()
        document.querySelector<HTMLButtonElement>('[data-testid="talos-library-confirm-remove"]')?.click()
        await settle()
        await settle()

        expect(document.querySelector('[role="alertdialog"], [role="dialog"]')).not.toBeNull()
        expect(document.body.textContent).toContain('One.txt')
        const alert = document.querySelector('[data-testid="talos-library-removal-error"]')
        expect(alert?.getAttribute('role')).toBe('alert')
        expect(alert?.textContent).toContain('Removal unavailable')
    })
})
