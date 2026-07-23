import { describe, expect, it, vi } from 'vitest'
import { createMemoryChatRepository } from '@/repositories/memoryChatRepository'
import { createChatStore, type ChatTurn } from '@/stores/chat'
import { TalosMobileProviderError } from '@/lib/chat/providerErrors'

function makeClock(): () => string {
    let tick = 0
    return () => `2026-07-22T10:00:${String(tick++).padStart(2, '0')}.000Z`
}

function makeIds(): () => string {
    let sequence = 0
    return () => `local-${++sequence}`
}

describe('createChatStore durable sessions', () => {
    it('BR-09 persists Browse per session and restores only session-level browser lifecycle evidence', async () => {
        const now = makeClock()
        const makeId = makeIds()
        const repository = createMemoryChatRepository({ now })
        const first = createChatStore(vi.fn().mockResolvedValue('unused'), { repository, makeId, now })
        await first.initialize()

        await first.setSurface('browse')
        const sessionId = first.activeSession.value!.id
        expect(first.activeSession.value?.surface).toBe('browse')

        await first.recordBrowserActivity(sessionId, {
            id: 'manual-open',
            operation: 'navigate',
            status: 'succeeded',
            payload: { presentation: 'isolated_webview' },
            evidence: {
                contract: 'talos.mobile.browser.evidence.v1',
                source: 'manual_local',
                activity: {
                    id: 'manual-open', operation: 'navigate', status: 'succeeded',
                    label: 'Opened https://example.com/ manually', run_id: null,
                    browser_session_id: 'browser-local', artifact_ids: [], occurred_at: now(),
                },
                artifacts: [], snapshot: null, retry: null,
            },
            created_at: now(),
        })

        expect(first.sessionBrowserActivities).toEqual([
            expect.objectContaining({ id: 'manual-open', operation: 'navigate', failure_code: null }),
        ])
        expect(await repository.listSessionToolActivities(sessionId)).toEqual([
            expect.objectContaining({ id: 'manual-open', message_id: null }),
        ])

        const restored = createChatStore(vi.fn().mockResolvedValue('unused'), { repository, makeId, now })
        await restored.initialize()
        expect(restored.activeSession.value?.surface).toBe('browse')
        expect(restored.sessionBrowserActivities).toEqual([
            expect.objectContaining({ id: 'manual-open', evidence: expect.objectContaining({ source: 'manual_local' }) }),
        ])

        await restored.setSurface('chat')
        expect(restored.activeSession.value?.surface).toBe('chat')
    })

    it('BR-A5 persists late browser events to their owner without leaking into the selected session', async () => {
        const now = makeClock()
        const repository = createMemoryChatRepository({ now })
        const store = createChatStore(vi.fn().mockResolvedValue('unused'), {
            repository, makeId: makeIds(), now,
        })
        await store.initialize()
        const owner = await store.createSession('Browser owner')
        await store.setSurface('browse')
        const current = await store.createSession('Other chat')

        await store.recordBrowserActivity(owner.id, {
            id: 'late-navigation', operation: 'navigate', status: 'succeeded', payload: {},
            evidence: {
                contract: 'talos.mobile.browser.evidence.v1', source: 'manual_local',
                activity: {
                    id: 'late-navigation', operation: 'navigate', status: 'succeeded',
                    label: 'Late navigation', run_id: null, browser_session_id: 'browser-owner',
                    artifact_ids: [], occurred_at: now(),
                },
                artifacts: [], snapshot: null, retry: null,
            },
            created_at: now(),
        })

        expect(store.activeSession.value?.id).toBe(current.id)
        expect(store.sessionBrowserActivities).toEqual([])
        await store.selectSession(owner.id)
        expect(store.sessionBrowserActivities).toEqual([expect.objectContaining({ id: 'late-navigation' })])
    })

    it('BR-04 restores canonical browser evidence on its owning message and rejects malformed rows', async () => {
        const now = makeClock()
        const makeId = makeIds()
        const repository = createMemoryChatRepository({ now })
        const first = createChatStore(vi.fn().mockResolvedValue('Page summary.'), { repository, makeId, now })
        await first.initialize()
        await first.send('Inspect https://example.com', 'anthropic:claude-live')
        const assistant = first.messages.find((message) => message.role === 'assistant')!
        const sessionId = first.activeSession.value!.id
        const envelope = {
            contract: 'talos.mobile.browser.evidence.v1',
            source: 'trusted_node',
            activity: {
                id: 'browser-activity-1', operation: 'screenshot', status: 'succeeded',
                label: 'Captured page', run_id: null, browser_session_id: 'browser-1',
                artifact_ids: ['artifact-1'], occurred_at: now(),
            },
            artifacts: [{
                id: 'artifact-1', type: 'screenshot', media_type: 'image/png',
                preview_uri: 'https://node.example/artifact-1', sha256: 'a'.repeat(64),
                width: 1280, height: 800, source_url: 'https://example.com/', created_at: now(),
            }],
            snapshot: null,
            retry: null,
        }
        await repository.appendToolActivity({
            id: 'tool-valid', session_id: sessionId, message_id: assistant.id,
            operation: 'screenshot', status: 'succeeded', payload: {}, evidence: envelope, created_at: now(),
        })
        await repository.appendToolActivity({
            id: 'tool-invalid', session_id: sessionId, message_id: assistant.id,
            operation: 'snapshot', status: 'recovery_required', payload: {},
            evidence: { ...envelope, service_token: 'must-not-cast' }, created_at: now(),
        })
        await repository.appendToolActivity({
            id: 'tool-session-only', session_id: sessionId, message_id: null,
            operation: 'session_start', status: 'succeeded', payload: {}, evidence: {}, created_at: now(),
        })

        const restored = createChatStore(vi.fn().mockResolvedValue('unused'), { repository, makeId, now })
        await restored.initialize()
        const restoredAssistant = restored.messages.find((message) => message.id === assistant.id)!

        expect(restoredAssistant.browserActivities).toEqual([
            expect.objectContaining({
                id: 'tool-valid',
                evidence: expect.objectContaining({ contract: 'talos.mobile.browser.evidence.v1' }),
                failure_code: null,
            }),
            expect.objectContaining({
                id: 'tool-invalid',
                evidence: null,
                failure_code: 'TALOS_BROWSER_EVIDENCE_INVALID',
            }),
        ])
        expect(JSON.stringify(restoredAssistant.browserActivities)).not.toContain('must-not-cast')
        expect(restored.messages.flatMap((message) => message.browserActivities ?? []))
            .not.toContainEqual(expect.objectContaining({ id: 'tool-session-only' }))
    })

    it('AV-08 persists bindings, restores message chips, and resolves authorized parts after reload', async () => {
        const now = makeClock()
        const makeId = makeIds()
        const repository = createMemoryChatRepository({ now })
        const file = await repository.createVaultFile({
            id: 'vault-report',
            display_name: 'report.txt',
            media_type: 'text/plain',
            size_bytes: 6,
            private_uri: 'talos-vault/files/vault-report.txt',
            status: 'available',
            trust: 'untrusted',
            sha256: 'a'.repeat(64),
            extracted_text: 'Report',
            failure_code: null,
            created_at: now(),
        })
        const grant = await repository.createFileAuthorityGrant({
            id: 'grant-report',
            vault_file_id: file.id,
            permissions: ['model.read'],
            label: file.display_name,
            created_at: now(),
        })
        const resolveMessageParts = vi.fn(async (messageId: string) => [{
            type: 'document_text' as const,
            attachmentId: file.id,
            name: file.display_name,
            mediaType: file.media_type,
            text: file.extracted_text!,
            sha256: file.sha256!,
        }])
        const complete = vi.fn().mockResolvedValue('Read it.')
        const first = createChatStore(complete, { repository, makeId, now, resolveMessageParts })
        await first.initialize()

        await first.send('Use this report.', 'anthropic:claude-live', {}, [{
            id: 'binding-report',
            vault_file_id: file.id,
            grant_id: grant.id,
        }])

        expect(complete).toHaveBeenCalledWith([expect.objectContaining({
            role: 'user',
            content: 'Use this report.',
            parts: [expect.objectContaining({ type: 'document_text', text: 'Report' })],
        })], expect.anything())
        const user = first.messages.find((message) => message.role === 'user')!
        expect(user.attachments).toEqual([expect.objectContaining({
            id: 'binding-report',
            display_name: 'report.txt',
        })])
        expect(resolveMessageParts).toHaveBeenCalledWith(user.id)

        const restored = createChatStore(vi.fn().mockResolvedValue('unused'), {
            repository,
            makeId,
            now,
            resolveMessageParts,
        })
        await restored.initialize()
        expect(restored.messages[0]?.attachments).toEqual([expect.objectContaining({
            vault_file_id: file.id,
            grant_status: 'active',
        })])
    })

    it('persists the user message before provider execution and then persists the reply', async () => {
        const now = makeClock()
        const repository = createMemoryChatRepository({ now })
        const complete = vi.fn(async () => {
            const sessionId = await repository.getActiveSessionId()
            expect(sessionId).not.toBeNull()
            expect(await repository.listMessages(sessionId!)).toEqual([
                expect.objectContaining({ role: 'user', content: 'Hello', state: 'persisted' }),
            ])
            return 'Hi there'
        })
        const store = createChatStore(complete, { repository, makeId: makeIds(), now })

        await store.initialize()
        await expect(store.send('Hello', 'anthropic:claude-live')).resolves.toBe(true)

        expect(store.messages).toEqual([
            expect.objectContaining({ role: 'user', content: 'Hello', state: 'persisted' }),
            expect.objectContaining({ role: 'assistant', content: 'Hi there', state: 'persisted' }),
        ])
        expect(store.activeSession.value?.active_model_profile_id).toBe('anthropic:claude-live')
        expect(store.state.sending).toBe(false)
        expect(store.state.lastError).toBeNull()
    })

    it('restores the active thread and passes its full context after process restart', async () => {
        const now = makeClock()
        const makeId = makeIds()
        const repository = createMemoryChatRepository({ now })
        const firstCompletion = vi.fn().mockResolvedValue('A1')
        const first = createChatStore(firstCompletion, { repository, makeId, now })
        await first.initialize()
        await first.send('Q1', 'anthropic:claude-live')

        const secondCompletion = vi.fn<(turns: ChatTurn[]) => Promise<string>>().mockResolvedValue('A2')
        const restored = createChatStore(secondCompletion, { repository, makeId, now })
        await restored.initialize()

        expect(restored.messages.map(({ role, content }) => ({ role, content }))).toEqual([
            { role: 'user', content: 'Q1' },
            { role: 'assistant', content: 'A1' },
        ])
        expect(restored.activeSession.value?.active_model_profile_id).toBe('anthropic:claude-live')

        await restored.send('Q2', 'anthropic:claude-live')
        expect(secondCompletion).toHaveBeenCalledWith([
            { role: 'user', content: 'Q1' },
            { role: 'assistant', content: 'A1' },
            { role: 'user', content: 'Q2' },
        ], expect.anything())
    })

    it('persists action provenance metadata across process restart', async () => {
        const now = makeClock()
        const makeId = makeIds()
        const repository = createMemoryChatRepository({ now })
        const first = createChatStore(vi.fn().mockResolvedValue('A1'), { repository, makeId, now })
        await first.initialize()
        await first.send('Q1', 'anthropic:claude-live', {
            command_id: 'resend_message',
            resend_of_message_id: 'original-user',
        })

        const restored = createChatStore(vi.fn().mockResolvedValue('unused'), { repository, makeId, now })
        await restored.initialize()
        expect(restored.messages[0]).toMatchObject({
            model_profile_id: 'anthropic:claude-live',
            run_id: null,
            metadata: {
                command_id: 'resend_message',
                resend_of_message_id: 'original-user',
            },
        })
    })

    it('creates, switches, renames, and deletes durable sessions', async () => {
        const now = makeClock()
        const repository = createMemoryChatRepository({ now })
        const store = createChatStore(vi.fn().mockResolvedValue('answer'), {
            repository,
            makeId: makeIds(),
            now,
        })
        await store.initialize()

        const first = await store.createSession('First')
        await store.send('First thread')
        const second = await store.createSession('Second')
        await store.send('Second thread')

        expect(store.sessions).toHaveLength(2)
        expect(store.activeSession.value?.id).toBe(second.id)
        expect(store.messages[0]?.content).toBe('Second thread')

        await store.selectSession(first.id)
        expect(store.messages[0]?.content).toBe('First thread')
        await store.renameSession(first.id, '  Renamed  ')
        expect(store.activeSession.value?.title).toBe('Renamed')

        await store.deleteSession(first.id)
        expect(store.activeSession.value?.id).toBe(second.id)
        await store.deleteSession(second.id)
        expect(store.activeSession.value).toBeNull()
        expect(store.messages).toHaveLength(0)
    })

    it('persists session-scoped drafts and an immediate active model change', async () => {
        const now = makeClock()
        const repository = createMemoryChatRepository({ now })
        const store = createChatStore(vi.fn().mockResolvedValue('unused'), {
            repository,
            makeId: makeIds(),
            now,
        })
        await store.initialize()
        const first = await store.createSession('First', 'openai:model-a')

        await store.saveComposerDraft('Draft A')
        expect(await store.loadComposerDraft()).toBe('Draft A')
        await store.setActiveModelProfile('anthropic:model-b')
        expect(store.activeSession.value?.active_model_profile_id).toBe('anthropic:model-b')
        expect((await repository.listSessions()).find((item) => item.id === first.id)?.active_model_profile_id)
            .toBe('anthropic:model-b')

        const second = await store.createSession('Second', 'openai:model-a')
        await store.saveComposerDraft('Draft B')
        await store.selectSession(first.id)
        expect(await store.loadComposerDraft()).toBe('Draft A')
        await store.selectSession(second.id)
        expect(await store.loadComposerDraft()).toBe('Draft B')
    })

    it('fails closed when persistence initialization fails and recovers only through retry', async () => {
        const now = makeClock()
        const repository = createMemoryChatRepository({ now })
        const initialize = vi.spyOn(repository, 'initialize')
            .mockRejectedValueOnce(new Error('database unavailable'))
            .mockResolvedValue(undefined)
        const complete = vi.fn().mockResolvedValue('must not run')
        const store = createChatStore(complete, { repository, makeId: makeIds(), now })

        await store.initialize()
        expect(store.state.persistenceStatus).toBe('error')
        expect(store.state.persistenceError).toContain('database unavailable')

        await expect(store.send('do not send')).resolves.toBe(false)
        expect(complete).not.toHaveBeenCalled()
        expect(store.messages).toHaveLength(0)

        await store.retryPersistence()
        expect(initialize).toHaveBeenCalledTimes(2)
        expect(store.state.persistenceStatus).toBe('ready')
        expect(store.state.persistenceError).toBeNull()
    })

    it('persists a structured provider failure as a system row that survives restart', async () => {
        const now = makeClock()
        const makeId = makeIds()
        const repository = createMemoryChatRepository({ now })
        const first = createChatStore(vi.fn().mockRejectedValue(new TalosMobileProviderError({
            provider: 'deepseek',
            operation: 'complete',
            status: 401,
            message: 'invalid credential',
        })), {
            repository,
            makeId,
            now,
        })
        await first.initialize()
        await first.send('hi', 'deepseek:deepseek-chat')

        const restored = createChatStore(vi.fn().mockResolvedValue('unused'), { repository, makeId, now })
        await restored.initialize()
        expect(restored.state.sending).toBe(false)
        expect(restored.messages.at(-1)).toMatchObject({
            role: 'system',
            state: 'failed',
            content: 'invalid credential',
            model_profile_id: 'deepseek:deepseek-chat',
            metadata: {
                chat_error: expect.objectContaining({
                    layer: 'provider',
                    code: 'PROVIDER_HTTP_401',
                    retryable: false,
                    status: 401,
                    provider: 'deepseek',
                    model: 'deepseek-chat',
                }),
            },
        })
    })

    it('ignores empty input and concurrent sends while one is in flight', async () => {
        const now = makeClock()
        const repository = createMemoryChatRepository({ now })
        let resolveReply: (value: string) => void = () => {}
        const complete = vi.fn(() => new Promise<string>((resolve) => { resolveReply = resolve }))
        const store = createChatStore(complete, { repository, makeId: makeIds(), now })
        await store.initialize()

        await store.send('   ')
        expect(complete).not.toHaveBeenCalled()

        const first = store.send('one')
        await store.send('two')
        await vi.waitFor(() => expect(complete).toHaveBeenCalledTimes(1))
        resolveReply('done')
        await first
    })
})
