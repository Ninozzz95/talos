import { beforeEach, describe, expect, it, vi } from 'vitest'
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
