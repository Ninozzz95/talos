// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest'
import { createApp, defineComponent, h, nextTick, ref } from 'vue'
import type { TalosWindowModuleContext } from '../../../../lib/talosWindowModuleContext'

vi.mock('../../library/TalosLibrary.vue', async () => {
    const { defineComponent, h } = await import('vue')

    return {
        default: defineComponent({
            props: {
                authenticated: { type: Boolean, required: true },
                ownerKey: { type: String, default: null },
            },
            emits: ['attachFile'],
            setup(props, { emit }) {
                return () => h('button', {
                    type: 'button',
                    'data-testid': 'library-stub',
                    'data-authenticated': String(props.authenticated),
                    'data-owner-key': props.ownerKey,
                    onClick: () => emit('attachFile', 'file-from-library'),
                }, 'Use file')
            },
        }),
    }
})

vi.mock('./TalosKnowledgeWindow.vue', async () => {
    const { defineComponent, h } = await import('vue')

    return {
        default: defineComponent({
            props: {
                context: { type: Object, required: true },
            },
            setup(props) {
                return () => h('div', {
                    'data-testid': 'knowledge-window-stub',
                    'data-active-section': (props.context as TalosWindowModuleContext).activeSection,
                })
            },
        }),
    }
})

import TalosLibraryWindow from './TalosLibraryWindow.vue'

const mounted: Array<ReturnType<typeof createApp>> = []

afterEach(() => {
    mounted.splice(0).forEach((app) => app.unmount())
    document.body.replaceChildren()
    vi.restoreAllMocks()
})

function mountLibraryWindow() {
    const activeSection = ref('unified')
    const requestedWindowSection = ref<string | null>(null)
    const requestedWindowSectionRevision = ref(0)
    const attachLibraryFile = vi.fn()
    const host = document.createElement('div')
    document.body.append(host)
    const app = createApp(defineComponent({
        setup() {
            return () => h(TalosLibraryWindow, {
                context: {
                    id: 'library',
                    activeSection: activeSection.value,
                    requestedWindowSection: requestedWindowSection.value,
                    requestedWindowSectionRevision: requestedWindowSectionRevision.value,
                    authenticated: true,
                    settingsOwnerKey: 'settings-owner-a',
                    attachLibraryFile,
                } as TalosWindowModuleContext,
            })
        },
    }))
    mounted.push(app)
    app.mount(host)

    return {
        activeSection,
        requestedWindowSection,
        requestedWindowSectionRevision,
        attachLibraryFile,
        host,
    }
}

describe('TalosLibraryWindow', () => {
    it('renders the owner-fenced unified Library and bridges Use in chat once', async () => {
        const { attachLibraryFile, host } = mountLibraryWindow()
        await nextTick()

        const library = host.querySelector<HTMLButtonElement>('[data-testid="library-stub"]')
        expect(library?.dataset.authenticated).toBe('true')
        expect(library?.dataset.ownerKey).toBe('settings-owner-a')
        library?.click()
        await nextTick()

        expect(attachLibraryFile).toHaveBeenCalledTimes(1)
        expect(attachLibraryFile).toHaveBeenCalledWith('file-from-library')
    })

    it('keeps Context Vault and Documents reachable inside Sources', async () => {
        const { activeSection, host } = mountLibraryWindow()
        activeSection.value = 'sources'
        await nextTick()

        const knowledge = () => host.querySelector<HTMLElement>('[data-testid="knowledge-window-stub"]')
        expect(knowledge()?.dataset.activeSection).toBe('context')

        host.querySelector<HTMLButtonElement>('#talos-window-section-tab-library-documents')?.click()
        await nextTick()

        expect(knowledge()?.dataset.activeSection).toBe('documents')
    })

    it('returns Sources to Context Vault for every new file command request', async () => {
        const {
            activeSection,
            requestedWindowSection,
            requestedWindowSectionRevision,
            host,
        } = mountLibraryWindow()
        activeSection.value = 'sources'
        await nextTick()

        host.querySelector<HTMLButtonElement>('#talos-window-section-tab-library-documents')?.click()
        await nextTick()
        const knowledge = () => host.querySelector<HTMLElement>('[data-testid="knowledge-window-stub"]')
        expect(knowledge()?.dataset.activeSection).toBe('documents')

        requestedWindowSection.value = 'sources'
        requestedWindowSectionRevision.value += 1
        await nextTick()

        expect(knowledge()?.dataset.activeSection).toBe('context')
    })
})
