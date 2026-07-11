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
        centerMessage: vi.fn(async () => undefined),
        recordBrowserActivities: vi.fn(),
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
