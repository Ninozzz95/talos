// @vitest-environment jsdom

import { afterEach, describe, expect, it } from 'vitest'
import { createApp, defineComponent, h, nextTick, ref } from 'vue'
import TalosComposerDock from './TalosComposerDock.vue'
import type { TalosBrowserMode } from '../../../lib/talosTypes'
import type { TalosChatViewportController } from '../../../composables/useTalosChatViewport'

let app: ReturnType<typeof createApp> | undefined

afterEach(() => {
    app?.unmount()
    app = undefined
    document.body.replaceChildren()
})

function fakeViewport(): TalosChatViewportController {
    return {
        atLiveEdge: ref(true),
        unseenCount: ref(0),
        composerHeight: ref(168),
        registerThread: () => undefined,
        registerComposer: () => undefined,
        centerMessage: async () => undefined,
        followLatest: async () => undefined,
        noteIncomingContent: () => undefined,
    }
}

const browserMode: TalosBrowserMode = {
    enabled: false,
    session_id: null,
    status: 'disconnected',
    capabilities: [],
}

describe('TalosComposerDock intro focus contract', () => {
    it('delegates intro close focus to the message textarea', async () => {
        let exposed: { focusPrompt?: () => void } | null = null
        const mountPoint = document.createElement('div')
        document.body.append(mountPoint)

        app = createApp(defineComponent({
            setup() {
                return () => h(TalosComposerDock, {
                    ref: (instance: unknown) => { exposed = instance as { focusPrompt?: () => void } },
                    prompt: '',
                    browserMode,
                    composerMode: 'full',
                    viewport: fakeViewport(),
                    commands: [],
                    canSend: true,
                    sending: false,
                    statusText: 'Ready',
                    modelLabel: 'Model',
                    contextLabel: 'Context',
                    temporaryMode: false,
                    sendDisabledReason: '',
                    enhancerDisabledReason: '',
                    modelPopoverOpen: false,
                    contextPopoverOpen: false,
                    modelProfiles: [],
                    modelRoutingProfiles: [],
                    contextSets: [],
                    selectedModelProfileId: '',
                    selectedModelRoutingProfileId: '',
                    selectedContextSetId: '',
                    selectedContextSet: null,
                    loadingModelProfiles: false,
                    loadingModelRoutingProfiles: false,
                    loadingContextSets: false,
                    promptEnhancementResult: null,
                    enhancingPrompt: false,
                    promptEnhancementError: null,
                    visibility: {},
                })
            },
        }))
        app.mount(mountPoint)
        await nextTick()
        await nextTick()

        expect(typeof exposed?.focusPrompt).toBe('function')
        exposed?.focusPrompt?.()
        const field = document.querySelector<HTMLTextAreaElement>('[aria-label="Message TALOS"]')
        expect(field).toBeTruthy()
        expect(document.activeElement).toBe(field)
    })
})
