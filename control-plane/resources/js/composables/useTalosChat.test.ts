import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ref } from 'vue'
import { talosFetch } from '../lib/api'
import type { TalosMessage } from '../lib/talosTypes'
import { useTalosChat } from './useTalosChat'

vi.mock('../lib/api', async (importOriginal) => ({
    ...await importOriginal<typeof import('../lib/api')>(),
    talosFetch: vi.fn(),
}))

const talosFetchMock = vi.mocked(talosFetch)

function message(role: TalosMessage['role'], content: string, id: string): TalosMessage {
    return {
        id,
        session_id: 'session-1',
        role,
        content,
        model_profile_id: 'profile-1',
        run_id: role === 'assistant' ? 'run-1' : null,
        metadata: {},
        created_at: '2026-07-14T10:00:00Z',
    }
}

describe('useTalosChat server-persisted procedural responses', () => {
    beforeEach(() => {
        talosFetchMock.mockReset()
    })

    it('does not duplicate an assistant message already persisted by the procedural runtime', async () => {
        const user = message('user', 'Inspect the page.', 'user-1')
        const assistant = message('assistant', 'Verified browser answer.', 'assistant-1')
        const persistMessage = vi.fn(async (_sessionId, payload) => {
            if (payload.role === 'user') return user
            throw new Error('The client attempted to persist a duplicate assistant message.')
        })
        talosFetchMock.mockResolvedValue({
            text: assistant.content,
            mutations: [],
            errors: [],
            assistant_message: assistant,
            agent_turn: { id: 'turn-1', status: 'completed', failure_code: null },
            run: {
                id: 'run-1',
                mode: 'verified_execution',
                status: 'succeeded',
                prompt_hash: 'hash',
                created_at: '2026-07-14T10:00:00Z',
                updated_at: '2026-07-14T10:00:00Z',
            },
        } as never)

        const result = await useTalosChat().sendPersistentChat({
            sessionId: 'session-1',
            prompt: user.content,
            modelProfileId: 'profile-1',
            browserMode: { enabled: true, browserSessionId: 'browser-1' },
            persistMessage,
        })

        expect(result.assistantMessage).toEqual(assistant)
        expect(persistMessage).toHaveBeenCalledTimes(1)
        expect(persistMessage).toHaveBeenCalledWith('session-1', expect.objectContaining({ role: 'user' }))
    })

    it('sends correlated attachment file and authority grant identities to Laravel', async () => {
        const user = message('user', 'Read the attached file.', 'user-1')
        const assistant = message('assistant', 'Attachment read.', 'assistant-1')
        const persistMessage = vi.fn(async () => user)
        talosFetchMock.mockResolvedValue({
            text: assistant.content,
            assistant_message: assistant,
            agent_turn: { id: 'turn-1', status: 'completed', failure_code: null },
        } as never)

        await useTalosChat().sendPersistentChat({
            sessionId: 'session-1',
            prompt: user.content,
            modelProfileId: 'profile-1',
            attachmentFileIds: ['file-1'],
            attachmentGrantIds: ['grant-1'],
            persistMessage,
        })

        const [, options] = talosFetchMock.mock.calls[0]
        expect(JSON.parse(String(options?.body))).toMatchObject({
            attachment_file_ids: ['file-1'],
            attachment_grant_ids: ['grant-1'],
        })
    })

    it('threads the frozen effort and thinking wire fields into the chat POST body', async () => {
        const user = message('user', 'Reason carefully.', 'user-effort')
        const assistant = message('assistant', 'Reasoned.', 'assistant-effort')
        const persistMessage = vi.fn(async () => user)
        talosFetchMock.mockResolvedValue({
            text: assistant.content,
            assistant_message: assistant,
            agent_turn: { id: 'turn-1', status: 'completed', failure_code: null },
        } as never)

        await useTalosChat().sendPersistentChat({
            sessionId: 'session-1',
            prompt: user.content,
            modelProfileId: 'profile-1',
            effort: 'high',
            thinking: true,
            persistMessage,
        })

        const [, options] = talosFetchMock.mock.calls[0]
        expect(JSON.parse(String(options?.body))).toMatchObject({ effort: 'high', thinking: true })
    })

    it('sends null effort and thinking when the composer leaves them unset', async () => {
        const user = message('user', 'Default reasoning.', 'user-default')
        const assistant = message('assistant', 'Answered.', 'assistant-default')
        const persistMessage = vi.fn(async () => user)
        talosFetchMock.mockResolvedValue({
            text: assistant.content,
            assistant_message: assistant,
            agent_turn: { id: 'turn-1', status: 'completed', failure_code: null },
        } as never)

        await useTalosChat().sendPersistentChat({
            sessionId: 'session-1',
            prompt: user.content,
            modelProfileId: 'profile-1',
            persistMessage,
        })

        expect(JSON.parse(String(talosFetchMock.mock.calls[0][1]?.body))).toMatchObject({ effort: null, thinking: null })
    })

    it('persists attachment provenance on a fallback assistant message', async () => {
        const user = message('user', 'Summarize the attached report.', 'user-attachment')
        const assistant = message('assistant', 'The report is summarized.', 'assistant-attachment')
        const usedAttachments = [{
            file_id: '019f7000-0000-7000-8000-000000000001',
            file_name: 'report.txt',
            sha256: 'a'.repeat(64),
        }]
        const persistMessage = vi.fn(async (_sessionId, payload) => payload.role === 'user'
            ? user
            : {
                ...assistant,
                metadata: payload.metadata ?? {},
            })
        talosFetchMock.mockResolvedValue({
            text: assistant.content,
            mutations: [],
            errors: [],
            used_attachments: [
                ...usedAttachments,
                { file_id: 'invalid-file', file_name: 'invalid.txt', sha256: 'not-a-sha256' },
            ],
            run: {
                id: 'run-attachment',
                mode: 'verified_execution',
                status: 'succeeded',
                prompt_hash: 'hash',
                created_at: '2026-07-17T15:00:00Z',
                updated_at: '2026-07-17T15:00:01Z',
            },
        } as never)

        const result = await useTalosChat().sendPersistentChat({
            sessionId: 'session-1',
            prompt: user.content,
            modelProfileId: 'profile-1',
            attachmentFileIds: [usedAttachments[0].file_id],
            attachmentGrantIds: ['grant-attachment'],
            persistMessage,
        })

        expect(persistMessage).toHaveBeenLastCalledWith('session-1', expect.objectContaining({
            role: 'assistant',
            metadata: expect.objectContaining({
                used_attachments: usedAttachments,
            }),
        }))
        expect(result.assistantMessage?.metadata).toMatchObject({
            used_attachments: usedAttachments,
        })
    })

    it('attaches canonical browser evidence to a server-persisted assistant message', async () => {
        const user = message('user', 'Cattura screenshot.', 'user-1')
        const assistant = message('assistant', 'Screenshot captured.', 'assistant-1')
        const activity = {
            id: 'command-1',
            operation: 'screenshot',
            status: 'succeeded',
            label: 'Screenshot',
            run_id: 'run-1',
            browser_session_id: 'browser-1',
            artifact_ids: ['artifact-1'],
            occurred_at: '2026-07-14T10:00:01Z',
        }
        const persistMessage = vi.fn(async (_sessionId, payload) => {
            if (payload.role === 'user') return user
            throw new Error('The client attempted to persist a duplicate assistant message.')
        })
        talosFetchMock.mockResolvedValue({
            text: assistant.content,
            mutations: [],
            errors: [],
            assistant_message: assistant,
            browser_activities: [activity],
            used_browser_context: { browser_session_id: 'browser-1' },
            run: {
                id: 'run-1',
                mode: 'verified_execution',
                status: 'succeeded',
                prompt_hash: 'hash',
                created_at: '2026-07-14T10:00:00Z',
                updated_at: '2026-07-14T10:00:01Z',
            },
        } as never)

        const result = await useTalosChat().sendPersistentChat({
            sessionId: 'session-1',
            prompt: user.content,
            modelProfileId: 'profile-1',
            browserMode: { enabled: true, browserSessionId: 'browser-1' },
            persistMessage,
        })

        expect(result.assistantMessage?.metadata).toMatchObject({
            browser_activities: [activity],
            used_browser_context: { browser_session_id: 'browser-1' },
        })
        expect(persistMessage).toHaveBeenCalledTimes(1)
    })

    it('keeps a successful upload activity on the server-persisted assistant message', async () => {
        const user = message('user', 'Upload the attached proof.', 'user-upload')
        const assistant = message('assistant', 'Proof uploaded with verified evidence.', 'assistant-upload')
        const activity = {
            id: 'command-upload',
            operation: 'upload',
            status: 'succeeded',
            label: 'Upload files',
            run_id: 'run-1',
            browser_session_id: 'browser-1',
            artifact_ids: ['screenshot-upload', 'snapshot-upload'],
            occurred_at: '2026-07-17T14:00:01Z',
        }
        const persistMessage = vi.fn(async (_sessionId, payload) => {
            if (payload.role === 'user') return user
            throw new Error('The client attempted to persist a duplicate assistant message.')
        })
        talosFetchMock.mockResolvedValue({
            text: assistant.content,
            assistant_message: assistant,
            browser_activities: [activity],
            used_browser_context: { browser_session_id: 'browser-1' },
            agent_turn: { id: 'turn-upload', status: 'completed', failure_code: null },
        } as never)

        const result = await useTalosChat().sendPersistentChat({
            sessionId: 'session-1',
            prompt: user.content,
            modelProfileId: 'profile-1',
            browserMode: { enabled: true, browserSessionId: 'browser-1' },
            persistMessage,
        })

        expect(result.assistantMessage?.metadata).toMatchObject({
            browser_activities: [activity],
        })
    })

    it('keeps canonical evidence visible locally when a legacy assistant is persisted without server-owned metadata', async () => {
        const user = message('user', 'Inspect this page.', 'user-1')
        const assistant = message('assistant', 'Verified legacy answer.', 'assistant-1')
        const activity = {
            id: 'command-legacy',
            operation: 'snapshot',
            status: 'succeeded',
            label: 'Snapshot',
            run_id: 'run-1',
            browser_session_id: 'browser-1',
            artifact_ids: ['artifact-legacy'],
            occurred_at: '2026-07-14T10:00:01Z',
        }
        const persistMessage = vi.fn(async (_sessionId, payload) => payload.role === 'user'
            ? user
            : {
                ...assistant,
                metadata: { source: payload.metadata?.source },
            })
        talosFetchMock.mockResolvedValue({
            text: assistant.content,
            mutations: [],
            errors: [],
            browser_activities: [activity],
            used_browser_context: { browser_session_id: 'browser-1', snapshot_artifact_id: 'artifact-legacy' },
            run: {
                id: 'run-1',
                mode: 'verified_execution',
                status: 'succeeded',
                prompt_hash: 'hash',
                created_at: '2026-07-14T10:00:00Z',
                updated_at: '2026-07-14T10:00:01Z',
            },
        } as never)

        const result = await useTalosChat().sendPersistentChat({
            sessionId: 'session-1',
            prompt: user.content,
            modelProfileId: 'profile-1',
            browserMode: { enabled: true, browserSessionId: 'browser-1' },
            persistMessage,
        })

        expect(result.assistantMessage?.metadata).toMatchObject({
            browser_activities: [activity],
            used_browser_context: { browser_session_id: 'browser-1', snapshot_artifact_id: 'artifact-legacy' },
        })
        expect(persistMessage).toHaveBeenLastCalledWith('session-1', expect.objectContaining({
            role: 'assistant',
            metadata: expect.not.objectContaining({
                browser_activities: expect.anything(),
                used_browser_context: expect.anything(),
            }),
        }))
    })

    it('does not persist a fallback assistant while the agent turn awaits approval', async () => {
        const user = message('user', 'Accept the cookie banner.', 'user-1')
        const persistMessage = vi.fn(async (_sessionId, payload) => payload.role === 'user'
            ? user
            : message(payload.role, payload.content, `${payload.role}-1`))
        talosFetchMock.mockResolvedValue({
            text: '',
            assistant_message: null,
            agent_turn: { id: 'turn-1', status: 'awaiting_approval', failure_code: null },
            pending_approvals: [{ id: 'approval-1', decision: null }],
        } as never)

        const result = await useTalosChat().sendPersistentChat({
            sessionId: 'session-1',
            prompt: user.content,
            modelProfileId: 'profile-1',
            browserMode: { enabled: true, browserSessionId: 'browser-1' },
            persistMessage,
        })

        expect(result.assistantMessage).toBeNull()
        expect(persistMessage).toHaveBeenCalledTimes(1)
        expect(persistMessage).toHaveBeenCalledWith('session-1', expect.objectContaining({ role: 'user' }))
    })

    it('does not persist a fallback assistant when approval is rejected', async () => {
        const user = message('user', 'Accept the cookie banner.', 'user-1')
        const persistMessage = vi.fn(async (_sessionId, payload) => payload.role === 'user'
            ? user
            : message(payload.role, payload.content, `${payload.role}-1`))
        talosFetchMock.mockResolvedValue({
            text: '',
            assistant_message: null,
            agent_turn: { id: 'turn-1', status: 'failed', failure_code: 'TALOS_TOOL_APPROVAL_REJECTED' },
            approval_decision: { id: 'approval-1', decision: 'reject' },
        } as never)

        const result = await useTalosChat().sendPersistentChat({
            sessionId: 'session-1',
            prompt: user.content,
            modelProfileId: 'profile-1',
            browserMode: { enabled: true, browserSessionId: 'browser-1' },
            persistMessage,
        })

        expect(result.assistantMessage).toBeNull()
        expect(persistMessage).toHaveBeenCalledTimes(1)
        expect(persistMessage).toHaveBeenCalledWith('session-1', expect.objectContaining({ role: 'user' }))
    })
})

function streamingController(result: unknown) {
    return {
        state: {
            ownerSessionId: null,
            ownerMessageId: null,
            runId: 'run-stream-1',
            rawText: '',
            reasoningText: '',
            tools: [],
            artifacts: [],
            usage: null,
            status: 'idle' as const,
            lastSequence: 0,
            attempts: 0,
            reconciled: false,
            error: null,
            cancelError: null,
            diagnostic: null,
        },
        canCancel: ref(false),
        start: vi.fn().mockResolvedValue(result),
        cancel: vi.fn().mockResolvedValue(true),
        clear: vi.fn(),
    }
}

function streamedMessage(content = 'Incremental answer') {
    return {
        id: 'assistant-stream-1',
        session_id: 'session-1',
        role: 'assistant' as const,
        content,
        model_profile_id: 'profile-1',
        run_id: 'run-stream-1',
        request_key: 'talos.chat.stream.v1:run-stream-1:assistant',
        metadata: { source: 'talos_agent_turn' },
        created_at: '2026-07-28T10:00:01.000Z',
        updated_at: '2026-07-28T10:00:01.000Z',
    }
}

function streamFrame(sequence: number, kind: string, payload: Record<string, unknown>) {
    return `id: ${sequence}\nevent: ${kind}\ndata: ${JSON.stringify({
        contract: 'talos.chat.stream.v1',
        run_id: 'run-stream-1',
        sequence,
        kind,
        occurred_at: '2026-07-28T10:00:00.000Z',
        payload,
    })}\n\n`
}

describe('useTalosChat streaming compatibility', () => {
    beforeEach(() => {
        talosFetchMock.mockReset()
    })

    it('uses the durable stream for a profile-backed turn without duplicating either message', async () => {
        const user = message('user', 'Stream this answer.', 'user-stream-1')
        const assistant = streamedMessage()
        const persistMessage = vi.fn(async () => user)
        const streaming = streamingController({
            kind: 'stream',
            assistantMessage: assistant,
            awaitingApproval: false,
            cancelled: false,
        })
        const chat = useTalosChat({
            streaming,
            streamingEnabled: () => true,
        })

        const result = await chat.sendPersistentChat({
            sessionId: 'session-1',
            prompt: user.content,
            modelProfileId: 'profile-1',
            effort: 'high',
            thinking: true,
            persistMessage,
        })

        expect(streaming.start).toHaveBeenCalledWith({
            sessionId: 'session-1',
            userMessageId: 'user-stream-1',
            payload: expect.objectContaining({
                message: user.content,
                session_id: 'session-1',
                user_message_id: 'user-stream-1',
                model_profile_id: 'profile-1',
                effort: 'high',
                thinking: true,
            }),
        })
        expect(result.assistantMessage).toEqual(expect.objectContaining({
            id: assistant.id,
            content: assistant.content,
        }))
        expect(persistMessage).toHaveBeenCalledOnce()
        expect(talosFetchMock).not.toHaveBeenCalled()
    })

    it('passes a JSON compatibility response through the existing persisted-message path', async () => {
        const user = message('user', 'Use buffered compatibility.', 'user-stream-json')
        const assistant = message('assistant', 'Buffered compatibility answer.', 'assistant-json')
        const persistMessage = vi.fn(async () => user)
        const streaming = streamingController({
            kind: 'json',
            response: {
                text: assistant.content,
                assistant_message: assistant,
                pending_approvals: [],
            },
        })
        const chat = useTalosChat({ streaming, streamingEnabled: () => true })

        const result = await chat.sendPersistentChat({
            sessionId: 'session-1',
            prompt: user.content,
            modelProfileId: 'profile-1',
            persistMessage,
        })

        expect(result.assistantMessage).toEqual(assistant)
        expect(persistMessage).toHaveBeenCalledOnce()
    })

    it('loads the production streaming controller lazily and completes a JSON compatibility turn', async () => {
        const user = message('user', 'Load the streaming runtime.', 'user-stream-lazy')
        const assistant = message('assistant', 'Lazy streaming answer.', 'assistant-stream-lazy')
        const persistMessage = vi.fn(async (_sessionId, payload) => {
            if (payload.role === 'user') return user
            throw new Error('The client attempted to persist a duplicate assistant message.')
        })
        const request = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({
            text: assistant.content,
            assistant_message: assistant,
            pending_approvals: [],
        }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
        }))

        try {
            const chat = useTalosChat({ streamingEnabled: () => true })
            const result = await chat.sendPersistentChat({
                sessionId: 'session-1',
                prompt: user.content,
                modelProfileId: 'profile-1',
                persistMessage,
            })

            expect(request).toHaveBeenCalledOnce()
            expect(request).toHaveBeenCalledWith('/api/talos/chat/stream', expect.objectContaining({
                method: 'POST',
                credentials: 'same-origin',
            }))
            expect(result.assistantMessage).toEqual(assistant)
            expect(persistMessage).toHaveBeenCalledOnce()
            expect(chat.streamingState.status).toBe('completed')
            expect(talosFetchMock).not.toHaveBeenCalled()
        } finally {
            request.mockRestore()
        }
    })

    it('keeps the lazy production Stop signal active until the owned stream terminates', async () => {
        const encoder = new TextEncoder()
        const user = message('user', 'Keep this response cancellable.', 'user-stream-lazy-stop')
        const assistant = streamedMessage('Partial response completed.')
        let streamController!: ReadableStreamDefaultController<Uint8Array>
        const response = new Response(new ReadableStream<Uint8Array>({
            start(controller) {
                streamController = controller
            },
        }), {
            status: 200,
            headers: {
                'Content-Type': 'text/event-stream; charset=UTF-8',
                'X-Talos-Run-ID': 'run-stream-1',
                'X-Talos-Reconciled': '0',
            },
        })
        const request = vi.spyOn(globalThis, 'fetch').mockResolvedValue(response)
        const persistMessage = vi.fn(async (_sessionId, payload) => {
            if (payload.role === 'user') return user
            throw new Error('The client attempted to persist a duplicate assistant message.')
        })

        try {
            const chat = useTalosChat({ streamingEnabled: () => true })
            expect(chat.streamingCanCancel.value).toBe(false)

            const pending = chat.sendPersistentChat({
                sessionId: 'session-1',
                prompt: user.content,
                modelProfileId: 'profile-1',
                persistMessage,
            })
            streamController.enqueue(encoder.encode(streamFrame(1, 'run.started', {
                run: {
                    id: 'run-stream-1',
                    session_id: 'session-1',
                    model_profile_id: 'profile-1',
                    model_routing_profile_id: null,
                    context_set_id: null,
                    mode: 'verified_execution',
                    status: 'running',
                    provider: 'deepseek',
                    model: 'deepseek-chat',
                    started_at: '2026-07-28T10:00:00.000Z',
                },
            })))
            streamController.enqueue(encoder.encode(streamFrame(2, 'text.delta', {
                text: 'Partial response',
                provider_sequence: 1,
            })))

            await vi.waitFor(() => expect(chat.streamingState.rawText).toBe('Partial response'))
            expect(chat.streamingCanCancel.value).toBe(true)

            streamController.enqueue(encoder.encode(streamFrame(3, 'message.completed', {
                message_id: assistant.id,
                request_key: assistant.request_key,
                message: assistant,
            })))
            streamController.close()

            await pending
            expect(chat.streamingCanCancel.value).toBe(false)
        } finally {
            request.mockRestore()
        }
    })

    it('hydrates pending approvals after a clean awaiting-approval stream EOF', async () => {
        const user = message('user', 'Click only after approval.', 'user-approval-stream')
        const pending = [{ id: 'approval-1', tool_name: 'browser_click' }]
        const persistMessage = vi.fn(async () => user)
        const streaming = streamingController({
            kind: 'stream',
            assistantMessage: null,
            awaitingApproval: true,
            cancelled: false,
        })
        talosFetchMock.mockResolvedValue({ pending_approvals: pending } as never)
        const chat = useTalosChat({ streaming, streamingEnabled: () => true })

        const result = await chat.sendPersistentChat({
            sessionId: 'session-1',
            prompt: user.content,
            modelProfileId: 'profile-1',
            browserMode: { enabled: true, browserSessionId: 'browser-1' },
            persistMessage,
        })

        expect(talosFetchMock).toHaveBeenCalledWith('/api/talos/sessions/session-1/pending-tool-approvals')
        expect(result.response?.pending_approvals).toEqual(pending)
        expect(result.assistantMessage).toBeNull()
        expect(persistMessage).toHaveBeenCalledOnce()
    })

    it('keeps direct API-key and manifest-disabled turns on the buffered endpoint', async () => {
        const user = message('user', 'Use buffered mode.', 'user-buffered')
        const assistant = message('assistant', 'Buffered answer.', 'assistant-buffered')
        const persistMessage = vi.fn(async () => user)
        const streaming = streamingController(null)
        talosFetchMock.mockResolvedValue({
            text: assistant.content,
            assistant_message: assistant,
        } as never)
        const chat = useTalosChat({ streaming, streamingEnabled: () => false })

        await chat.sendPersistentChat({
            sessionId: 'session-1',
            prompt: user.content,
            apiKey: 'server-compatibility-key',
            persistMessage,
        })

        expect(streaming.start).not.toHaveBeenCalled()
        expect(talosFetchMock).toHaveBeenCalledWith('/api/talos/chat', expect.objectContaining({
            method: 'POST',
        }))
    })

    it('exposes the authoritative cancel handle from the streaming controller', async () => {
        const streaming = streamingController(null)
        const chat = useTalosChat({ streaming, streamingEnabled: () => true })

        await chat.cancelStreaming()

        expect(streaming.cancel).toHaveBeenCalledOnce()
        expect(chat.streamingState).toBe(streaming.state)
        expect(chat.streamingCanCancel).toBe(streaming.canCancel)
    })
})
