// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest'
import { createApp, h, nextTick, ref } from 'vue'
import type { TalosChatViewportController } from '../../../composables/useTalosChatViewport'
import type { TalosStreamingChatState } from '../../../composables/useTalosStreamingChat'
import TalosChatSurface from './TalosChatSurface.vue'

const apps: Array<ReturnType<typeof createApp>> = []

afterEach(() => {
    apps.splice(0).forEach((app) => app.unmount())
    document.body.replaceChildren()
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
})

async function settle() {
    for (let round = 0; round < 4; round += 1) {
        await nextTick()
        await new Promise<void>((resolve) => window.setTimeout(resolve, 0))
    }
}

function viewport(): TalosChatViewportController {
    return {
        atLiveEdge: ref(true),
        unseenCount: ref(0),
        composerHeight: ref(160),
        registerThread: vi.fn(),
        registerComposer: vi.fn(),
        centerMessage: vi.fn().mockResolvedValue(undefined),
        followLatest: vi.fn().mockResolvedValue(undefined),
        noteIncomingContent: vi.fn(),
    }
}

function streamState(
    overrides: Partial<TalosStreamingChatState> = {},
): TalosStreamingChatState {
    return {
        ownerSessionId: 'session-1',
        ownerMessageId: 'message-user-1',
        runId: 'run-1',
        rawText: 'A live answer.',
        reasoningText: '',
        tools: [],
        artifacts: [],
        usage: null,
        status: 'streaming',
        lastSequence: 2,
        attempts: 1,
        reconciled: false,
        error: null,
        cancelError: null,
        diagnostic: null,
        ...overrides,
    }
}

function mountSurface(
    state: TalosStreamingChatState | null,
    options: { activeSessionId?: string; sending?: boolean } = {},
) {
    let frameTime = 0
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
        queueMicrotask(() => callback(frameTime += 40))
        return frameTime
    })
    vi.stubGlobal('cancelAnimationFrame', vi.fn())
    const portal = document.createElement('div')
    portal.id = 'talos-portal-root'
    document.body.append(portal)
    const container = document.createElement('div')
    document.body.append(container)
    const app = createApp({
        render: () => h(TalosChatSurface, {
            uiError: null,
            sessionError: null,
            messageError: null,
            modelProfileError: null,
            contextSetError: null,
            loadingMessages: false,
            messages: [{
                id: 'message-user-1',
                session_id: 'session-1',
                role: 'user',
                content: 'Stream this response.',
                run_id: null,
                metadata: {},
                created_at: '2026-07-28T08:00:00Z',
            }],
            logoUrl: '',
            selectedModelProfileIsUsable: true,
            contextSelected: false,
            contextSetsCount: 0,
            sessionReady: true,
            messageEvidenceReady: false,
            sending: options.sending ?? true,
            streamingState: state,
            streamingReducedMotion: true,
            benchmarkingRunId: null,
            expandedEvidenceMessageIds: [],
            welcomePromptId: null,
            showWelcomeMessage: false,
            showMissionPath: false,
            fullWidthChat: false,
            sensitiveBlur: false,
            messageScale: 1,
            messageStyle: 'sections',
            browserActivities: [],
            browserSnapshot: null,
            activeBrowserSession: null,
            browserInteractionPending: false,
            browserInteractionLocked: false,
            browserInteractionError: null,
            pendingBrowserInteractionApproval: null,
            browserRefFrame: null,
            browserRefTargetsLoading: false,
            browserRefTargetsError: null,
            pendingToolApprovals: [],
            decidingToolApprovalIds: [],
            browserTasks: [],
            browserTaskBusy: false,
            browserTaskError: null,
            browserTaskCommandTargetId: null,
            devBrowserEvidence: false,
            activeTalosSessionId: options.activeSessionId ?? 'session-1',
            mobile: false,
            mobileWindowPresentation: 'drawer',
            viewport: viewport(),
        }),
    })
    apps.push(app)
    app.mount(container)

    return container
}

describe('TalosChatSurface streaming projection', () => {
    it('renders the active session reply without a duplicate Processing placeholder', async () => {
        const container = mountSurface(streamState())
        await settle()

        await vi.waitFor(() => {
            expect(container.querySelector('[data-testid="talos-streaming-reply"]')).not.toBeNull()
            expect(container.textContent).toContain('A live answer.')
        })
        expect(container.textContent).not.toContain('Processing')
    })

    it('fences a stream owned by another session and retains the buffered placeholder', async () => {
        const container = mountSurface(streamState({ ownerSessionId: 'session-2' }))
        await settle()

        expect(container.querySelector('[data-testid="talos-streaming-reply"]')).toBeNull()
        expect(container.textContent).toContain('Processing')
        expect(container.textContent).not.toContain('A live answer.')
    })

    it('leaves completed rendering to the durable persisted message', async () => {
        const container = mountSurface(streamState({ status: 'completed' }), {
            sending: false,
        })
        await settle()

        expect(container.querySelector('[data-testid="talos-streaming-reply"]')).toBeNull()
        expect(container.textContent).not.toContain('A live answer.')
        expect(container.textContent).not.toContain('Processing')
    })
})
