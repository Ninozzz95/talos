import { describe, expect, it, vi } from 'vitest'
import { createMemoryChatRepository } from '@/repositories/memoryChatRepository'
import {
    TALOS_MESSAGE_PAGE_SIZE,
    createChatStore as createLocalizedChatStore,
    type ChatCompletion,
    type ChatStoreOptions,
    type ChatTurn,
} from '@/stores/chat'
import { TalosMobileProviderError } from '@/lib/chat/providerErrors'
import { parseTalosSessionLibraryContextPolicy } from '@/lib/chat/libraryPolicy'
import { talosTestT } from '../../helpers/talosTestI18n'

function createChatStore(
    complete: ChatCompletion,
    options: Omit<ChatStoreOptions, 'translate'>,
) {
    return createLocalizedChatStore(complete, {
        ...options,
        translate: talosTestT('en'),
    })
}

function makeClock(): () => string {
    let tick = 0
    return () => `2026-07-22T10:00:${String(tick++).padStart(2, '0')}.000Z`
}

function makeIds(): () => string {
    let sequence = 0
    return () => `local-${++sequence}`
}

function deferred<T = void>() {
    let resolve!: (value: T | PromiseLike<T>) => void
    const promise = new Promise<T>((settle) => { resolve = settle })
    return { promise, resolve }
}

describe('createChatStore durable sessions', () => {
    it('BR-09 persists Browse per session and restores only session-level browser lifecycle evidence', async () => {
        const now = makeClock()
        const makeId = makeIds()
        const repository = createMemoryChatRepository({ now })
        const first = createChatStore(vi.fn().mockResolvedValue({ text: 'unused', finishReason: 'stop' }), { repository, makeId, now })
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

        const restored = createChatStore(vi.fn().mockResolvedValue({ text: 'unused', finishReason: 'stop' }), { repository, makeId, now })
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
        const store = createChatStore(vi.fn().mockResolvedValue({ text: 'unused', finishReason: 'stop' }), {
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
        const first = createChatStore(vi.fn().mockResolvedValue({ text: 'Page summary.', finishReason: 'stop' }), { repository, makeId, now })
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

        const restored = createChatStore(vi.fn().mockResolvedValue({ text: 'unused', finishReason: 'stop' }), { repository, makeId, now })
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
        const complete = vi.fn().mockResolvedValue({ text: 'Read it.', finishReason: 'stop' })
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

        const restored = createChatStore(vi.fn().mockResolvedValue({ text: 'unused', finishReason: 'stop' }), {
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
            return { text: 'Hi there', finishReason: 'stop' }
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
        const firstCompletion = vi.fn().mockResolvedValue({ text: 'A1', finishReason: 'stop' })
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
        const first = createChatStore(vi.fn().mockResolvedValue({ text: 'A1', finishReason: 'stop' }), { repository, makeId, now })
        await first.initialize()
        await first.send('Q1', 'anthropic:claude-live', {
            command_id: 'resend_message',
            resend_of_message_id: 'original-user',
        })

        const restored = createChatStore(vi.fn().mockResolvedValue({ text: 'unused', finishReason: 'stop' }), { repository, makeId, now })
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
        const store = createChatStore(vi.fn().mockResolvedValue({ text: 'answer', finishReason: 'stop' }), {
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
        const store = createChatStore(vi.fn().mockResolvedValue({ text: 'unused', finishReason: 'stop' }), {
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

    it('P1-CTX-ISO-06 R8-A-SEND-04 cannot reactivate an old session when its model persistence resolves late', async () => {
        const now = makeClock()
        const repository = createMemoryChatRepository({ now })
        const store = createChatStore(vi.fn().mockResolvedValue({ text: 'unused', finishReason: 'stop' }), {
            repository,
            makeId: makeIds(),
            now,
        })
        await store.initialize()
        const owner = await store.createSession('Owner', 'openai:model-a')
        const destination = await store.createSession('Destination', 'openai:model-a')
        await store.selectSession(owner.id)

        const updateStarted = deferred()
        const releaseUpdate = deferred()
        const updateSession = repository.updateSession.bind(repository)
        vi.spyOn(repository, 'updateSession').mockImplementation(async (sessionId, patch) => {
            if (sessionId === owner.id && patch.active_model_profile_id === 'anthropic:model-b') {
                updateStarted.resolve()
                await releaseUpdate.promise
            }
            return updateSession(sessionId, patch)
        })

        const pending = store.setActiveModelProfile('anthropic:model-b')
        await updateStarted.promise
        await store.selectSession(destination.id)
        releaseUpdate.resolve()
        await pending

        expect(store.activeSession.value?.id).toBe(destination.id)
        expect(store.activeSession.value?.active_model_profile_id).toBe('openai:model-a')
        expect((await repository.listSessions()).find((session) => session.id === owner.id))
            .toMatchObject({ active_model_profile_id: 'anthropic:model-b' })
    })

    it('fails closed when persistence initialization fails and recovers only through retry', async () => {
        const now = makeClock()
        const repository = createMemoryChatRepository({ now })
        const initialize = vi.spyOn(repository, 'initialize')
            .mockRejectedValueOnce(new Error('database unavailable'))
            .mockResolvedValue(undefined)
        const complete = vi.fn().mockResolvedValue({ text: 'must not run', finishReason: 'stop' })
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

        const restored = createChatStore(vi.fn().mockResolvedValue({ text: 'unused', finishReason: 'stop' }), { repository, makeId, now })
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

    it('P1-CTX-ISO-08 releases the send lock without poisoning storage when preparation fails', async () => {
        type Runtime = Readonly<{ marker: string }>
        const repository = createMemoryChatRepository()
        const prepareSend = vi.fn()
            .mockRejectedValueOnce(new Error('context retrieval failed'))
            .mockImplementationOnce(async (context) => ({
                runtime: context.runtime,
                metadata: { prepared: true },
            }))
        const complete = vi.fn().mockResolvedValue({ text: 'ok', finishReason: 'stop' })
        const store = createLocalizedChatStore<Runtime>(complete, {
            repository,
            translate: talosTestT('en'),
            captureSendRuntime: () => Object.freeze({ marker: 'captured' }),
            prepareSend,
        })
        await store.initialize()

        await expect(store.send('first')).resolves.toBe(false)
        expect(store.state.persistenceStatus).toBe('ready')
        expect(store.state.sending).toBe(false)
        expect(store.state.lastError).toContain('context retrieval failed')
        expect(await repository.listSessions()).toHaveLength(1)
        expect(store.messages).toEqual([])

        await expect(store.send('second')).resolves.toBe(true)
        expect(prepareSend).toHaveBeenCalledTimes(2)
        expect(complete).toHaveBeenCalledTimes(1)
        expect(store.messages.find((message) => message.role === 'user')?.metadata)
            .toMatchObject({ prepared: true })
    })

    // F4-#16 — export snapshot: raw session/messages/activities/attachments
    // (sha256-enriched from the vault) assembled for the local export builders.
    it('assembles an export snapshot of the active session with sha256-enriched attachments', async () => {
        const now = makeClock()
        const repository = createMemoryChatRepository({ now })
        const store = createChatStore(vi.fn().mockResolvedValue({ text: 'unused', finishReason: 'stop' }), {
            repository, makeId: makeIds(), now,
        })
        await store.initialize()
        const session = await store.createSession('Da esportare')

        await repository.createVaultFile({
            id: 'vault-9', display_name: 'report.pdf', media_type: 'application/pdf',
            size_bytes: 1024, private_uri: 'talos-vault/files/vault-9.pdf', status: 'available',
            trust: 'untrusted', sha256: 'c'.repeat(64), extracted_text: 'body', metadata: {},
            created_at: now(),
        })
        const grant = await repository.createFileAuthorityGrant({
            id: 'grant-9', vault_file_id: 'vault-9', permissions: ['model.read'], label: 'report.pdf',
            created_at: now(),
        })
        await repository.appendMessage({
            id: 'm1', session_id: session.id, role: 'user', content: 'Analizza il report',
            state: 'persisted', created_at: now(),
            attachments: [{ id: 'b1', vault_file_id: 'vault-9', grant_id: grant.id }],
        })
        await repository.appendMessage({
            id: 'm2', session_id: session.id, role: 'assistant', content: 'Fatto.',
            state: 'persisted', created_at: now(),
        })

        const snapshot = await store.exportSnapshot()
        expect(snapshot.session.id).toBe(session.id)
        expect(snapshot.messages.map((message) => message.id)).toEqual(['m1', 'm2'])
        expect(snapshot.attachments).toEqual([
            expect.objectContaining({ message_id: 'm1', display_name: 'report.pdf', sha256: 'c'.repeat(64) }),
        ])
        expect(JSON.stringify(snapshot.attachments)).not.toContain('private_uri')
    })

    // F4-#23 — chat-list management: archive (swipe) and manual order
    // (hold-to-move) live in session metadata so they survive restart and
    // stay local-first.
    it('archives and unarchives a session through metadata without losing other keys', async () => {
        const now = makeClock()
        const repository = createMemoryChatRepository({ now })
        const store = createChatStore(vi.fn().mockResolvedValue({ text: 'unused', finishReason: 'stop' }), {
            repository, makeId: makeIds(), now,
        })
        await store.initialize()
        const session = await store.createSession('To archive')

        const before = store.sessions.find((candidate) => candidate.id === session.id)?.updated_at
        await store.setSessionArchived(session.id, true)
        const archived = store.sessions.find((candidate) => candidate.id === session.id)
        expect(archived?.metadata.archived).toBe(true)
        // SF-5: archive/order are metadata-only — recency must NOT change.
        expect(archived?.updated_at).toBe(before)

        await store.setSessionArchived(session.id, false)
        const restored = store.sessions.find((candidate) => candidate.id === session.id)
        expect(restored?.metadata.archived).toBe(false)
    })

    it('P1-CTX-POLICY-02 aborts chat policy publication when metadata persistence fails', async () => {
        const now = makeClock()
        const repository = createMemoryChatRepository({ now })
        const store = createChatStore(vi.fn().mockResolvedValue({
            text: 'unused',
            finishReason: 'stop',
        }), { repository, makeId: makeIds(), now })
        await store.initialize()
        const session = await store.createSession('Policy owner')
        const update = vi.spyOn(repository, 'updateSessionMetadata')
            .mockRejectedValueOnce(new Error('session metadata write failed'))

        try {
            await expect(store.setSessionLibraryContextPolicy(
                session.id,
                { enabled: true, mode: 'smart_relevant_v1' },
                0,
            )).rejects.toThrow('session metadata write failed')

            expect(store.sessions.find((item) => item.id === session.id)?.metadata)
                .not.toHaveProperty('library_context_policy')

            await store.retryPersistence()
            const committed = await store.setSessionLibraryContextPolicy(
                session.id,
                { enabled: true, mode: 'smart_relevant_v1' },
                0,
            )
            expect(committed).toMatchObject({
                revision: 1,
                enabled: true,
                mode: 'smart_relevant_v1',
            })
        } finally {
            update.mockRestore()
        }
    })

    it('P1-CTX-POLICY-02 serializes chat policy revisions without reactivating its owner', async () => {
        const now = makeClock()
        const repository = createMemoryChatRepository({ now })
        const store = createChatStore(vi.fn().mockResolvedValue({
            text: 'unused',
            finishReason: 'stop',
        }), { repository, makeId: makeIds(), now })
        await store.initialize()
        const owner = await store.createSession('Policy owner')
        const ownerUpdatedAt = owner.updated_at
        const gate = deferred()
        const original = repository.updateSessionMetadata.bind(repository)
        let calls = 0
        const update = vi.spyOn(repository, 'updateSessionMetadata')
            .mockImplementation(async (sessionId, metadata) => {
                calls += 1
                if (calls === 1) await gate.promise
                return original(sessionId, metadata)
            })

        try {
            const first = store.setSessionLibraryContextPolicy(
                owner.id,
                { enabled: true },
                0,
            )
            await Promise.resolve()
            const other = await store.createSession('Current chat')
            const second = store.setSessionLibraryContextPolicy(
                owner.id,
                { mode: 'ask_before_use_v1' },
                1,
            )
            await Promise.resolve()

            expect(update).toHaveBeenCalledTimes(1)
            gate.resolve()
            const [, committed] = await Promise.all([first, second])

            expect(update).toHaveBeenCalledTimes(2)
            expect(committed).toMatchObject({
                revision: 2,
                enabled: true,
                mode: 'ask_before_use_v1',
            })
            expect(store.activeSession.value?.id).toBe(other.id)
            const persistedOwner = store.sessions.find((item) => item.id === owner.id)!
            expect(persistedOwner.updated_at).toBe(ownerUpdatedAt)
            expect(parseTalosSessionLibraryContextPolicy(
                persistedOwner.metadata.library_context_policy,
            )).toEqual(committed)
        } finally {
            update.mockRestore()
        }
    })

    it('persists a manual order as sort_index for every listed session', async () => {
        const now = makeClock()
        const repository = createMemoryChatRepository({ now })
        const store = createChatStore(vi.fn().mockResolvedValue({ text: 'unused', finishReason: 'stop' }), {
            repository, makeId: makeIds(), now,
        })
        await store.initialize()
        const first = await store.createSession('First')
        const second = await store.createSession('Second')
        const third = await store.createSession('Third')

        const recencyBefore = new Map(store.sessions.map((session) => [session.id, session.updated_at]))
        await store.setSessionOrder([second.id, third.id, first.id])
        const byId = new Map(store.sessions.map((session) => [session.id, session]))
        expect(byId.get(second.id)?.metadata.sort_index).toBe(0)
        expect(byId.get(second.id)?.updated_at).toBe(recencyBefore.get(second.id))
        expect(byId.get(first.id)?.updated_at).toBe(recencyBefore.get(first.id))
        expect(byId.get(third.id)?.metadata.sort_index).toBe(1)
        expect(byId.get(first.id)?.metadata.sort_index).toBe(2)

        const reloaded = createChatStore(vi.fn().mockResolvedValue({ text: 'unused', finishReason: 'stop' }), {
            repository, makeId: makeIds(), now,
        })
        await reloaded.initialize()
        expect(reloaded.sessions.find((session) => session.id === second.id)?.metadata.sort_index).toBe(0)
    })
})

/**
 * Owner 2026-07-25 (defect #4): a chat used to load EVERY message on open, so
 * the conversations you use most became the slowest. The newest page loads
 * first and older ones arrive as you scroll up.
 */
describe('message paging (defect #4)', () => {
    async function seeded(count: number) {
        const repository = createMemoryChatRepository()
        const store = createChatStore(async () => ({ text: 'ok' }), { repository })
        await store.initialize()
        // A fresh store has no session until one is created.
        const session = await store.createSession('Conversazione lunga')
        const sessionId = session.id
        for (let index = 0; index < count; index += 1) {
            await repository.appendMessage({
                id: `m${String(index).padStart(3, '0')}`,
                session_id: sessionId,
                role: index % 2 === 0 ? 'user' : 'assistant',
                content: `messaggio ${index}`,
                state: 'persisted',
                model_profile_id: null,
            })
        }
        return { store, repository, sessionId }
    }

    it('opens with the NEWEST page, not the whole history', async () => {
        const { store, sessionId } = await seeded(95)
        await store.selectSession(sessionId)
        expect(store.messages).toHaveLength(TALOS_MESSAGE_PAGE_SIZE)
        // The newest must be on screen: opening on ancient history would be a
        // different bug wearing the fix's clothes.
        expect(store.messages.at(-1)?.content).toBe('messaggio 94')
        expect(store.state.hasOlderMessages).toBe(true)
    })

    it('prepends older pages in order and stops when the top is reached', async () => {
        const { store, sessionId } = await seeded(95)
        await store.selectSession(sessionId)
        expect(await store.loadOlderMessages()).toBe(TALOS_MESSAGE_PAGE_SIZE)
        expect(store.messages).toHaveLength(80)
        expect(store.messages[0]?.content).toBe('messaggio 15')
        expect(await store.loadOlderMessages()).toBe(15)
        expect(store.messages).toHaveLength(95)
        expect(store.messages[0]?.content).toBe('messaggio 0')
        expect(store.state.hasOlderMessages).toBe(false)
        // Nothing left above: further calls must be free, not another query.
        expect(await store.loadOlderMessages()).toBe(0)
    })

    it('a short conversation loads whole and never offers to load more', async () => {
        const { store, sessionId } = await seeded(5)
        await store.selectSession(sessionId)
        expect(store.messages).toHaveLength(5)
        expect(store.state.hasOlderMessages).toBe(false)
        expect(await store.loadOlderMessages()).toBe(0)
    })

    it('never duplicates a message across pages', async () => {
        const { store, sessionId } = await seeded(95)
        await store.selectSession(sessionId)
        await store.loadOlderMessages()
        await store.loadOlderMessages()
        const ids = store.messages.map((message) => message.id)
        expect(new Set(ids).size).toBe(ids.length)
    })
})

/**
 * Found while re-reviewing the six changes TOGETHER: paging the VIEW is right,
 * paging the model's memory is not. Building turns from the on-screen list
 * would have truncated the conversation the model sees to the last page — the
 * answers would silently get worse the longer you had talked, and nothing
 * would say so.
 */
describe('the model still sees the whole conversation (defect #4 follow-up)', () => {
    it('sends every message as history even when the view holds only a page', async () => {
        const repository = createMemoryChatRepository()
        const seen: ChatTurn[][] = []
        const store = createChatStore(async (turns) => {
            seen.push(turns)
            return { text: 'ok' }
        }, { repository })
        await store.initialize()
        const session = await store.createSession('Lunga')
        for (let index = 0; index < 60; index += 1) {
            await repository.appendMessage({
                id: `h${String(index).padStart(3, '0')}`,
                session_id: session.id,
                role: index % 2 === 0 ? 'user' : 'assistant',
                content: `storia ${index}`,
                state: 'persisted',
                model_profile_id: null,
            })
        }
        await store.selectSession(session.id)
        expect(store.messages).toHaveLength(TALOS_MESSAGE_PAGE_SIZE)

        await store.send('e adesso?')
        const turns = seen.at(-1)!
        // 60 restored + the new user turn: the page size must not appear here.
        expect(turns).toHaveLength(61)
        expect(turns[0]?.content).toBe('storia 0')
        expect(turns.at(-1)?.content).toBe('e adesso?')
    })
})
