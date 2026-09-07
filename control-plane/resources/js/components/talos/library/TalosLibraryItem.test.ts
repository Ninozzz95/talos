// @vitest-environment jsdom

import { afterEach, describe, expect, it } from 'vitest'
import { createApp, nextTick } from 'vue'
import type { TalosLibraryItem as LibraryItem } from '../../../lib/talosLibrary'
import TalosLibraryItem from './TalosLibraryItem.vue'

let app: ReturnType<typeof createApp> | undefined

afterEach(() => {
    app?.unmount()
    app = undefined
    document.body.replaceChildren()
})

function item(overrides: Partial<LibraryItem> = {}): LibraryItem {
    return {
        id: 'item-1',
        sourceType: 'file',
        sourceId: 'file-1',
        kind: 'image',
        origin: 'uploaded',
        title: 'Evidence.png',
        mimeType: 'image/png',
        byteSize: 1024,
        checksum: 'a'.repeat(64),
        sourceUrl: 'https://example.com/evidence',
        contentUrl: '/api/talos/files/file-1/content',
        trustBoundary: 'untrusted_upload',
        occurredAt: '2026-07-28T14:00:00.000000Z',
        metadata: Object.freeze({ width: 1280 }),
        chatCount: 2,
        backlinks: Object.freeze([]),
        canAttach: true,
        ...overrides,
    }
}

describe('TalosLibraryItem', () => {
    it('renders provenance and emits each governed action with the item', async () => {
        const current = item()
        const events: string[] = []
        const mountPoint = document.createElement('div')
        document.body.append(mountPoint)
        app = createApp(TalosLibraryItem, {
            item: current,
            selected: false,
            viewMode: 'grid',
            onToggleSelected: (value: LibraryItem) => events.push(`select:${value.id}`),
            onPreview: (value: LibraryItem) => events.push(`preview:${value.id}`),
            onAttach: (value: LibraryItem) => events.push(`attach:${value.id}`),
            onRequestRemove: (value: LibraryItem) => events.push(`remove:${value.id}`),
        })
        app.mount(mountPoint)

        expect(document.body.textContent).toContain('Evidence.png')
        expect(document.body.textContent).toContain('Uploaded')
        expect(document.body.textContent).toContain('2 chats')
        expect(document.querySelector<HTMLAnchorElement>('a[href="https://example.com/evidence"]')?.rel)
            .toContain('noopener')

        document.querySelector<HTMLInputElement>('[aria-label="Select Evidence.png"]')?.click()
        document.querySelector<HTMLButtonElement>('[aria-label="Preview Evidence.png"]')?.click()
        document.querySelector<HTMLButtonElement>('[aria-label="Use Evidence.png in chat"]')?.click()
        document.querySelector<HTMLButtonElement>('[aria-label="Remove Evidence.png from Library"]')?.click()
        await nextTick()

        expect(events).toEqual(['select:item-1', 'preview:item-1', 'attach:item-1', 'remove:item-1'])
    })

    it('never exposes preview or attach actions when the source contract does not allow them', () => {
        const mountPoint = document.createElement('div')
        document.body.append(mountPoint)
        app = createApp(TalosLibraryItem, {
            item: item({
                sourceType: 'document',
                kind: 'file',
                contentUrl: '/api/talos/documents/document-1',
                canAttach: false,
            }),
            selected: false,
            viewMode: 'list',
        })
        app.mount(mountPoint)

        expect(document.querySelector('[aria-label^="Preview"]')).toBeNull()
        expect(document.querySelector('[aria-label^="Use"]')).toBeNull()
        expect(document.querySelector('[data-library-view="list"]')).not.toBeNull()
    })
})
