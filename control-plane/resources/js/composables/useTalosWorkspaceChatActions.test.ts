// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ref } from 'vue'
import { talosFetch } from '../lib/api'
import { useTalosWorkspaceChatActions } from './useTalosWorkspaceChatActions'
import type { TalosMessage, TalosSession } from '../lib/talosTypes'

vi.mock('../lib/api', () => ({ talosFetch: vi.fn() }))

const session: TalosSession = {
    id: 'session-1',
    title: 'New chat',
    surface: 'chat',
    mode: 'verified_execution',
    persistence_mode: 'persistent',
    metadata: {},
    created_at: '2026-07-11T10:00:00Z',
    updated_at: '2026-07-11T10:00:00Z',
}

const userMessage: TalosMessage = {
    id: 'message-1', session_id: session.id, role: 'user', content: 'Hello', created_at: '2026-07-11T10:00:00Z',
}

function dependencies() {
    const activeSession = ref<TalosSession | null>(session)
    const sendPersistentChat = vi.fn(async () => ({ assistantMessage: null, response: null, systemMessages: [], userMessage }))

    return {
        prompt: ref(''),
        sending: ref(false),
        activeSession,
        messages: ref<TalosMessage[]>([]),
        uiError: ref<string | null>(null),
        setFeedback: vi.fn(),
        modelSelectionIsUsable: ref(true),
        browserReadyForSend: ref(true),
        browseModeEnabled: ref(false),
        activeBrowserSession: ref<{ id: string } | null>(null),
        selectedModelProfileId: ref('model-1'),
        selectedModelRoutingProfileId: ref(''),
        selectedContextSetId: ref(''),
        ensureSessionForPrompt: vi.fn(async () => session),
        persistUserMessage: vi.fn(async () => userMessage),
        sendPersistentChat,
        createMessage: vi.fn(async (_sessionId, payload) => ({ ...userMessage, ...payload, id: 'message-2' })),
        acceptPersistedMessage: vi.fn(),
        centerMessage: vi.fn(async () => undefined),
        recordBrowserActivities: vi.fn(),
        recordPendingToolApprovals: vi.fn(),
        openSettings: vi.fn(),
        closePopover: vi.fn(),
        openModelPopover: vi.fn(),
        openCompare: vi.fn(),
        previousUserMessageFor: vi.fn(() => userMessage),
        scrollChat: vi.fn(),
        selectedBenchmarkScenarioRef: ref<string | null>('018f47a2-7f42-7d10-9b37-abcdef123456'),
        selectedBenchmarkScenarioIsRunnable: ref(true),
        benchmarkDisabledReason: ref(''),
    }
}

describe('useTalosWorkspaceChatActions', () => {
    beforeEach(() => vi.mocked(talosFetch).mockReset())

    it('persists and sends the trimmed composer value, then clears it', async () => {
        const deps = dependencies()
        const actions = useTalosWorkspaceChatActions(deps)
        actions.prompt.value = '  Hello  '

        await expect(actions.sendChat()).resolves.toBe(true)

        expect(deps.ensureSessionForPrompt).toHaveBeenCalledWith('Hello')
        expect(deps.persistUserMessage).toHaveBeenCalledWith(session.id, 'Hello', expect.any(Function), {})
        expect(deps.sendPersistentChat).toHaveBeenCalledWith(expect.objectContaining({
            sessionId: session.id,
            prompt: 'Hello',
            modelProfileId: 'model-1',
        }))
        expect(actions.prompt.value).toBe('')
        expect(actions.sending.value).toBe(false)
    })

    it('resends a user message with explicit provenance metadata', async () => {
        const deps = dependencies()
        const actions = useTalosWorkspaceChatActions(deps)

        await actions.resendMessage(userMessage)

        expect(deps.sendPersistentChat).toHaveBeenCalled()
        expect(deps.setFeedback).toHaveBeenCalledWith('Message resent through TALOS chat.')
    })

    it('publishes a server-persisted procedural answer immediately without a duplicate POST', async () => {
        const deps = dependencies()
        const activity = {
            id: 'browser-command-1',
            operation: 'screenshot',
            status: 'succeeded',
            label: 'Screenshot',
            run_id: 'run-1',
            browser_session_id: 'browser-1',
            artifact_ids: ['artifact-1'],
            occurred_at: '2026-07-14T10:00:01Z',
        }
        const assistant: TalosMessage = {
            id: 'assistant-1',
            session_id: session.id,
            role: 'assistant',
            content: 'Screenshot captured.',
            run_id: 'run-1',
            metadata: { browser_activities: [activity] },
            created_at: '2026-07-14T10:00:01Z',
        }
        deps.sendPersistentChat.mockResolvedValue({ assistantMessage: assistant } as never)
        const actions = useTalosWorkspaceChatActions(deps)

        await expect(actions.sendChatText('Cattura screenshot.')).resolves.toBe(true)

        expect(deps.acceptPersistedMessage).toHaveBeenCalledOnce()
        expect(deps.acceptPersistedMessage).toHaveBeenCalledWith(assistant)
        expect(deps.recordBrowserActivities).toHaveBeenCalledWith([activity])
        expect(deps.createMessage).not.toHaveBeenCalledWith(session.id, expect.objectContaining({ role: 'assistant' }))
    })

    it('publishes pending procedural approvals and browser activity directly from a 202 response', async () => {
        const deps = dependencies()
        const activity = {
            id: 'snapshot-1',
            operation: 'snapshot',
            status: 'succeeded',
            label: 'Page structure capture succeeded',
            run_id: 'run-1',
            browser_session_id: 'browser-1',
            artifact_ids: ['artifact-1'],
            occurred_at: '2026-07-14T10:00:01Z',
        }
        const pending = [{ id: 'call-1', turn_id: 'turn-1', plan_hash: `sha256:${'a'.repeat(64)}` }]
        deps.sendPersistentChat.mockResolvedValue({
            assistantMessage: null,
            response: {
                agent_turn: { id: 'turn-1', status: 'awaiting_approval' },
                browser_activities: [activity],
                pending_approvals: pending,
            },
        } as never)
        const actions = useTalosWorkspaceChatActions(deps)

        await expect(actions.sendChatText('Accept the cookie banner.')).resolves.toBe(true)

        expect(deps.recordBrowserActivities).toHaveBeenCalledWith([activity])
        expect(deps.recordPendingToolApprovals).toHaveBeenCalledWith(pending)
    })

    it('creates a benchmark for a run, persists the system notice, and opens Compare', async () => {
        vi.mocked(talosFetch).mockResolvedValue({ benchmark_group: { id: 'group-1' } })
        const deps = dependencies()
        const actions = useTalosWorkspaceChatActions(deps)
        const message: TalosMessage = { ...userMessage, role: 'assistant', run_id: 'run-1', content: 'Answer' }

        await actions.benchmarkMessageRun(message)

        expect(talosFetch).toHaveBeenCalledWith('/api/talos/runs/run-1/benchmark', expect.objectContaining({ method: 'POST' }))
        expect(deps.createMessage).toHaveBeenCalledWith(session.id, expect.objectContaining({ run_id: 'run-1', role: 'system' }))
        expect(deps.openCompare).toHaveBeenCalledOnce()
        expect(actions.benchmarkingRunId.value).toBeNull()
    })

    it('runs an uploaded file benchmark using only its opaque scenario reference', async () => {
        vi.mocked(talosFetch).mockResolvedValue({ benchmark_group: { id: 'group-2' } })
        const deps = dependencies()
        const actions = useTalosWorkspaceChatActions(deps)

        await actions.runSelectedBenchmarkScenario()

        expect(talosFetch).toHaveBeenCalledWith('/api/benchmarks/compare', expect.objectContaining({
            body: JSON.stringify({ scenario_ref: deps.selectedBenchmarkScenarioRef.value, runs: 1 }),
        }))
        expect(deps.openCompare).toHaveBeenCalledOnce()
    })
})
