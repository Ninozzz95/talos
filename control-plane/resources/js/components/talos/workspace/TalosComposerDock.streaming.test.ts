// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest'
import { createApp, h, nextTick, ref } from 'vue'
import type { TalosChatViewportController } from '../../../composables/useTalosChatViewport'
import type { TalosBrowserMode } from '../../../lib/talosTypes'
import TalosComposerDock from './TalosComposerDock.vue'

let app: ReturnType<typeof createApp> | null = null

afterEach(() => {
    app?.unmount()
    app = null
    document.body.replaceChildren()
})

function viewport(): TalosChatViewportController {
    return {
        atLiveEdge: ref(true),
        unseenCount: ref(0),
        composerHeight: ref(168),
        registerThread: vi.fn(),
        registerComposer: vi.fn(),
        centerMessage: vi.fn().mockResolvedValue(undefined),
        followLatest: vi.fn().mockResolvedValue(undefined),
        noteIncomingContent: vi.fn(),
    }
}

const browserMode: TalosBrowserMode = {
    enabled: false,
    session_id: null,
    status: 'disconnected',
    capabilities: [],
}

function mountDock(cancelStream: () => void) {
    const portal = document.createElement('div')
    portal.id = 'talos-portal-root'
    document.body.append(portal)
    const container = document.createElement('div')
    document.body.append(container)
    app = createApp({
        render: () => h(TalosComposerDock, {
            prompt: 'Stop this response',
            browserMode,
            composerMode: 'full',
            viewport: viewport(),
            commands: [],
            canSend: false,
            sending: true,
            streamingActive: true,
            statusText: 'Responding',
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
            onCancelStream: cancelStream,
        }),
    })
    app.mount(container)
    return container
}

describe('TalosComposerDock streaming control', () => {
    it('forwards the visible Stop command exactly once', async () => {
        const cancelStream = vi.fn()
        const container = mountDock(cancelStream)
        await nextTick()

        const stop = container.querySelector<HTMLButtonElement>('[aria-label="Stop response"]')
        expect(stop).not.toBeNull()
        stop?.click()

        expect(cancelStream).toHaveBeenCalledOnce()
    })
})
