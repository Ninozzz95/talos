// @vitest-environment jsdom

import { afterEach, describe, expect, it } from 'vitest'
import { createApp, defineComponent, h, nextTick, reactive } from 'vue'
import TalosLibraryFilters from './TalosLibraryFilters.vue'

let app: ReturnType<typeof createApp> | undefined

afterEach(() => {
    app?.unmount()
    app = undefined
    document.body.replaceChildren()
})

describe('TalosLibraryFilters', () => {
    it('emits one coherent filter payload and supports reset', async () => {
        const state = reactive({
            kind: null as 'image' | 'file' | 'link' | null,
            origin: null as 'uploaded' | 'generated' | 'browser' | 'search' | null,
            search: null as string | null,
        })
        const events: unknown[] = []
        const mountPoint = document.createElement('div')
        document.body.append(mountPoint)
        app = createApp(defineComponent({
            setup() {
                return () => h(TalosLibraryFilters, {
                    ...state,
                    viewMode: 'list',
                    selectedCount: 0,
                    removing: false,
                    loading: false,
                    onApplyFilters: (filters) => {
                        events.push(filters)
                        Object.assign(state, filters)
                    },
                })
            },
        }))
        app.mount(mountPoint)

        document.querySelector<HTMLButtonElement>('[data-testid="talos-library-kind-image"]')?.click()
        await nextTick()
        expect(events.at(-1)).toEqual({ kind: 'image', origin: null, search: null })

        const search = document.querySelector<HTMLInputElement>('[aria-label="Search Library"]')
        expect(search).not.toBeNull()
        if (search) {
            search.value = '  quarterly   report '
            search.dispatchEvent(new Event('input', { bubbles: true }))
            search.form?.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
        }
        await nextTick()
        expect(events.at(-1)).toEqual({ kind: 'image', origin: null, search: 'quarterly report' })

        document.querySelector<HTMLButtonElement>('[data-testid="talos-library-reset"]')?.click()
        await nextTick()
        expect(events.at(-1)).toEqual({ kind: null, origin: null, search: null })
    })

    it('exposes view, refresh and selected-removal actions without native selects', async () => {
        const emitted: string[] = []
        const mountPoint = document.createElement('div')
        const portal = document.createElement('div')
        portal.id = 'talos-portal-root'
        document.body.append(mountPoint, portal)
        app = createApp(TalosLibraryFilters, {
            kind: null,
            origin: null,
            search: null,
            viewMode: 'list',
            selectedCount: 2,
            removing: false,
            loading: false,
            'onUpdate:viewMode': (value: string) => emitted.push(`view:${value}`),
            onRefresh: () => emitted.push('refresh'),
            onRequestRemove: () => emitted.push('remove'),
        })
        app.mount(mountPoint)

        expect(document.querySelector('select')).toBeNull()
        document.querySelector<HTMLButtonElement>('[aria-label="Grid view"]')?.click()
        document.querySelector<HTMLButtonElement>('[aria-label="Refresh Library"]')?.click()
        document.querySelector<HTMLButtonElement>('[data-testid="talos-library-remove-selected"]')?.click()
        await nextTick()

        expect(emitted).toEqual(['view:grid', 'refresh', 'remove'])
    })
})
