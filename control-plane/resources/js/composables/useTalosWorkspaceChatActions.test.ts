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

    it('keeps the workspace stable when the selected model is not callable', async () => {
        const deps = dependencies()
        deps.modelSelectionIsUsable.value = false
        const actions = useTalosWorkspaceChatActions(deps)

        await expect(actions.sendChatText('Keep the current workspace visible.')).resolves.toBe(false)

        expect(deps.uiError.value).toBe('Choose a usable model or routing profile before sending.')
        expect(deps.openSettings).not.toHaveBeenCalled()
        expect(deps.openModelPopover).not.toHaveBeenCalled()
        expect(deps.ensureSessionForPrompt).not.toHaveBeenCalled()
        expect(deps.sendPersistentChat).not.toHaveBeenCalled()
    })

    it('passes correlated attachment authority grants through the workspace send path', async () => {
        const reset = vi.fn()
        const deps = {
            ...dependencies(),
            attachmentTray: {
                attachments: ref([{
                    id: 'attachment-1',
                    file_id: 'file-1',
                    grant_id: 'grant-1',
                    name: 'notes.md',
                    status: 'available',
                    failure_reason: null,
                }]),
                readyFileIds: ref(['file-1']),
                readyGrantIds: ref(['grant-1']),
                hasPendingUpload: ref(false),
                reset,
            },
        }
        const actions = useTalosWorkspaceChatActions(deps)

        await expect(actions.sendChatText('Read this file.')).resolves.toBe(true)

        expect(deps.sendPersistentChat).toHaveBeenCalledWith(expect.objectContaining({
            attachmentFileIds: ['file-1'],
            attachmentGrantIds: ['grant-1'],
        }))
        expect(reset).toHaveBeenCalledOnce()
    })

    it('blocks send while a failed attachment remains selected', async () => {
        const deps = {
            ...dependencies(),
            attachmentTray: {
                attachments: ref([{
                    id: 'attachment-failed',
                    file_id: null,
                    grant_id: null,
                    name: 'rejected.bin',
                    status: 'failed',
                    failure_reason: 'TALOS rejected this file for ingestion.',
                }]),
                readyFileIds: ref<string[]>([]),
                readyGrantIds: ref<string[]>([]),
                hasPendingUpload: ref(false),
                reset: vi.fn(),
            },
        }
        const actions = useTalosWorkspaceChatActions(deps)

        await expect(actions.sendChatText('Read the selected file.')).resolves.toBe(false)

        expect(deps.uiError.value).toMatch(/failed attachment/i)
        expect(deps.ensureSessionForPrompt).not.toHaveBeenCalled()
        expect(deps.persistUserMessage).not.toHaveBeenCalled()
        expect(deps.sendPersistentChat).not.toHaveBeenCalled()
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

    it('awaits Browser state reconciliation before completing a tool-backed reply', async () => {
        const deps = dependencies()
        const activity = {
            id: 'browser-command-await',
            operation: 'screenshot',
            status: 'succeeded',
            label: 'Screenshot',
            run_id: 'run-await',
            browser_session_id: 'browser-1',
            artifact_ids: ['artifact-await'],
            occurred_at: '2026-07-20T10:00:01Z',
        }
        const assistant: TalosMessage = {
            id: 'assistant-await',
            session_id: session.id,
            role: 'assistant',
            content: 'Screenshot captured.',
            run_id: 'run-await',
            metadata: { browser_activities: [activity] },
            created_at: '2026-07-20T10:00:01Z',
        }
        deps.sendPersistentChat.mockResolvedValue({ assistantMessage: assistant } as never)
        let releaseReconciliation: (() => void) | null = null
        deps.recordBrowserActivities = vi.fn(() => new Promise<void>((resolve) => {
            releaseReconciliation = resolve
        }))
        const actions = useTalosWorkspaceChatActions(deps)

        let settled: boolean | null = null
        const sendPromise = actions.sendChatText('Capture a screenshot.').then((result) => {
            settled = result
            return result
        })

        await vi.waitFor(() => expect(deps.recordBrowserActivities).toHaveBeenCalledWith([activity]))
        await Promise.resolve()
        await Promise.resolve()
        expect(settled).toBeNull()
        expect(deps.acceptPersistedMessage).toHaveBeenCalledWith(assistant)

        releaseReconciliation?.()
        await expect(sendPromise).resolves.toBe(true)
        expect(settled).toBe(true)
        expect(deps.uiError.value).toBeNull()
    })

    it('surfaces a reconciliation failure as an actionable error while keeping the accepted assistant reply', async () => {
        const deps = dependencies()
        const assistant: TalosMessage = {
            id: 'assistant-retained',
            session_id: session.id,
            role: 'assistant',
            content: 'Screenshot captured.',
            run_id: 'run-retained',
            metadata: {
                browser_activities: [{
                    id: 'browser-command-retained',
                    operation: 'screenshot',
                    status: 'succeeded',
                    label: 'Screenshot',
                    run_id: 'run-retained',
                    browser_session_id: 'browser-1',
                    artifact_ids: ['artifact-retained'],
                    occurred_at: '2026-07-20T10:00:01Z',
                }],
            },
            created_at: '2026-07-20T10:00:01Z',
        }
        deps.sendPersistentChat.mockResolvedValue({ assistantMessage: assistant } as never)
        deps.recordBrowserActivities = vi.fn(async () => {
            throw new Error('Browser evidence was saved, but TALOS could not refresh the Browser session. Reload it from the Browser card.')
        })
        const actions = useTalosWorkspaceChatActions(deps)

        await expect(actions.sendChatText('Capture a screenshot.')).resolves.toBe(false)

        expect(deps.uiError.value).toMatch(/could not refresh the Browser session/)
        expect(deps.acceptPersistedMessage).toHaveBeenCalledOnce()
        expect(deps.acceptPersistedMessage).toHaveBeenCalledWith(assistant)
        expect(actions.sending.value).toBe(false)
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
