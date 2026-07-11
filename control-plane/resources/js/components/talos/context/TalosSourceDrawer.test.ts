// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest'
import { createApp, defineComponent, h, nextTick, ref } from 'vue'
import TalosSourceDrawer from './TalosSourceDrawer.vue'
import type { TalosFile, TalosFileWithChunks } from '../../../lib/talosTypes'

const mounted: Array<ReturnType<typeof createApp>> = []

const file = {
    id: 'file-1',
    original_name: 'incident-report.md',
    status: 'available',
    created_at: '2026-07-10T00:00:00.000Z',
    updated_at: '2026-07-10T00:00:00.000Z',
    metadata: {},
} as TalosFile

const details = {
    ...file,
    chunks: [
        {
            id: 'chunk-1',
            file_id: 'file-1',
            sequence: 1,
            preview: 'First chunk preview',
            content: 'First chunk content',
            content_hash: 'hash-1',
            start_offset: 0,
            end_offset: 42,
        },
        {
            id: 'chunk-2',
            file_id: 'file-1',
            sequence: 2,
            preview: 'Second chunk preview',
            content: 'Second chunk content',
            content_hash: 'hash-2',
            start_offset: 43,
            end_offset: 84,
        },
    ],
} as TalosFileWithChunks

afterEach(() => {
    mounted.splice(0).forEach((app) => app.unmount())
    document.body.replaceChildren()
})

function mountDrawer(selectedChunkIds: string[] = ['chunk-2']) {
    const open = ref(true)
    const closeCount = ref(0)
    const toggledChunkIds: string[] = []
    const refreshedFileIds: string[] = []
    const app = createApp(defineComponent({
        setup() {
            return () => h(TalosSourceDrawer, {
                open: open.value,
                file,
                details,
                selectedChunkIds,
                loading: false,
                error: null,
                onClose: () => {
                    closeCount.value += 1
                    open.value = false
                },
                onRefresh: (nextFile: TalosFile) => {
                    refreshedFileIds.push(nextFile.id)
                },
                onToggleChunk: (chunk: { id: string }) => {
                    toggledChunkIds.push(chunk.id)
                },
            })
        },
    }))

    const container = document.createElement('div')
    document.body.append(container)
    mounted.push(app)
    app.mount(container)

    return {
        container,
        open,
        closeCount,
        toggledChunkIds,
        refreshedFileIds,
    }
}

describe('TalosSourceDrawer', () => {
    it('focuses the close action, closes on Escape, and restores prior focus', async () => {
        const opener = document.createElement('button')
        opener.textContent = 'Open drawer'
        document.body.append(opener)
        opener.focus()

        const { closeCount, open } = mountDrawer()
        await nextTick()

        const closeButton = document.querySelector('button[aria-label="Close source drawer"]') as HTMLButtonElement | null

        expect(closeButton).toBeTruthy()
        expect(document.activeElement).toBe(closeButton)

        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
        await nextTick()

        expect(closeCount.value).toBe(1)
        expect(open.value).toBe(false)
        expect(document.activeElement).toBe(opener)
    })

    it('renders an accessible dialog label and selected chunk semantics', async () => {
        const { container, toggledChunkIds, refreshedFileIds } = mountDrawer()
        await nextTick()

        const dialog = container.querySelector('[role="dialog"]') as HTMLElement | null
        const labelledBy = dialog?.getAttribute('aria-labelledby')
        const selectedOption = container.querySelector('[data-testid="talos-source-chunk-option-chunk-2"]') as HTMLElement | null
        const selectedButton = container.querySelector('[data-testid="talos-source-chunk-chunk-2"]') as HTMLButtonElement | null
        const refreshButton = document.querySelector('button[aria-label="Reload source drawer file"]') as HTMLButtonElement | null

        expect(dialog?.getAttribute('aria-modal')).toBe('true')
        expect(labelledBy).toBeTruthy()
        expect(labelledBy ? container.querySelector(`#${labelledBy}`)?.textContent : '').toContain('incident-report.md')
        expect(selectedOption?.getAttribute('aria-selected')).toBe('true')
        expect(selectedButton?.getAttribute('aria-pressed')).toBe('true')

        selectedButton?.click()
        refreshButton?.click()
        await nextTick()

        expect(toggledChunkIds).toEqual(['chunk-2'])
        expect(refreshedFileIds).toEqual(['file-1'])
    })

    it('traps keyboard focus and marks every background branch inert while open', async () => {
        const opener = document.createElement('button')
        opener.textContent = 'Open drawer'
        document.body.append(opener)
        opener.focus()

        const { open } = mountDrawer()
        await nextTick()

        const closeButton = document.querySelector('button[aria-label="Close source drawer"]') as HTMLButtonElement
        const focusable = Array.from(document.querySelectorAll<HTMLButtonElement>('[role="dialog"] button:not([disabled])'))
        const lastButton = focusable.at(-1)

        expect(opener.hasAttribute('inert')).toBe(true)
        expect(opener.getAttribute('aria-hidden')).toBe('true')
        expect(document.activeElement).toBe(closeButton)

        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', shiftKey: true, bubbles: true, cancelable: true }))
        expect(document.activeElement).toBe(lastButton)

        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true }))
        expect(document.activeElement).toBe(closeButton)

        open.value = false
        await nextTick()
        expect(opener.hasAttribute('inert')).toBe(false)
        expect(opener.hasAttribute('aria-hidden')).toBe(false)
    })
})
