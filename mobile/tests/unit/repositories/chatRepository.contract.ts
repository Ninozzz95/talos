import { expect } from 'vitest'
import type { TalosChatRepository } from '@/repositories/chatRepository'

export async function exerciseChatRepositoryContract(repository: TalosChatRepository): Promise<void> {
    await repository.initialize()
    const alpha = await repository.createSession({
        id: 'session-alpha',
        title: 'Alpha',
        active_model_profile_id: 'openrouter:model-a',
        created_at: '2026-07-22T10:00:00.000Z',
    })
    expect(await repository.getActiveSessionId()).toBe(alpha.id)

    await repository.appendMessage({
        id: 'message-a1',
        session_id: alpha.id,
        role: 'user',
        content: 'Remember alpha.',
        state: 'persisted',
        created_at: '2026-07-22T10:00:01.000Z',
    })
    await repository.appendMessage({
        id: 'message-a2',
        session_id: alpha.id,
        role: 'assistant',
        content: 'Alpha is recorded.',
        state: 'persisted',
        created_at: '2026-07-22T10:00:02.000Z',
    })
    const browserActivity = await repository.appendToolActivity({
        id: 'activity-alpha',
        session_id: alpha.id,
        message_id: 'message-a2',
        operation: 'screenshot',
        status: 'succeeded',
        payload: { source: 'trusted_node' },
        evidence: {
            contract: 'talos.mobile.browser.evidence.v1',
            source: 'trusted_node',
        },
        created_at: '2026-07-22T10:00:02.500Z',
    })
    expect(browserActivity).toMatchObject({
        id: 'activity-alpha',
        message_id: 'message-a2',
        status: 'succeeded',
    })
    await repository.updateToolActivity(browserActivity.id, {
        status: 'recovery_required',
        evidence: {
            contract: 'talos.mobile.browser.evidence.v1',
            source: 'trusted_node',
            retry: { status: 'available' },
        },
    })
    expect(await repository.listMessageToolActivities('message-a2')).toEqual([
        expect.objectContaining({
            id: browserActivity.id,
            status: 'recovery_required',
            payload: { source: 'trusted_node' },
            evidence: expect.objectContaining({ retry: { status: 'available' } }),
        }),
    ])
    expect(await repository.listSessionToolActivities(alpha.id)).toEqual([
        expect.objectContaining({ id: browserActivity.id }),
    ])

    const vaultFile = await repository.createVaultFile({
        id: 'vault-alpha',
        display_name: 'alpha.txt',
        media_type: 'text/plain',
        size_bytes: 13,
        private_uri: 'talos-vault/files/vault-alpha.txt',
        status: 'available',
        trust: 'untrusted',
        sha256: 'a'.repeat(64),
        extracted_text: 'Remember alpha.',
        failure_code: null,
        created_at: '2026-07-22T10:00:00.500Z',
    })
    const grant = await repository.createFileAuthorityGrant({
        id: 'grant-alpha',
        vault_file_id: vaultFile.id,
        permissions: ['model.read', 'browser.upload'],
        label: 'Alpha file',
        created_at: '2026-07-22T10:00:00.750Z',
    })
    const messageWithFile = await repository.appendMessage({
        id: 'message-a3',
        session_id: alpha.id,
        role: 'user',
        content: 'Use the attached file.',
        state: 'persisted',
        created_at: '2026-07-22T10:00:03.000Z',
        attachments: [{
            id: 'binding-alpha',
            vault_file_id: vaultFile.id,
            grant_id: grant.id,
        }],
    })
    // Owner 2026-07-26, per-chat media gallery: the files ATTACHED in one chat.
    // Asserted against EVERY implementation on purpose — the lazy wrapper once
    // dropped an argument the direct implementations honoured, and the broken
    // one was the production path.
    expect(await repository.listSessionAttachmentFileIds(alpha.id)).toEqual([vaultFile.id])
    // The SAME file attached to a second message must appear ONCE — dropping
    // DISTINCT (sqlite) or the Set (memory) is otherwise undetectable, and the
    // gallery would render duplicate tiles.
    await repository.appendMessage({
        id: 'message-a4',
        session_id: alpha.id,
        role: 'user',
        content: 'The same file again.',
        state: 'persisted',
        created_at: '2026-07-22T10:00:05.000Z',
        attachments: [{
            id: 'binding-alpha-2',
            vault_file_id: vaultFile.id,
            grant_id: grant.id,
        }],
    })
    expect(await repository.listSessionAttachmentFileIds(alpha.id)).toEqual([vaultFile.id])
    expect(await repository.listSessionAttachmentFileIds('session-that-does-not-exist')).toEqual([])

    expect((await repository.listMessageAttachments(messageWithFile.id))).toEqual([
        expect.objectContaining({
            id: 'binding-alpha',
            message_id: messageWithFile.id,
            vault_file_id: vaultFile.id,
            grant_id: grant.id,
            display_name: 'alpha.txt',
            media_type: 'text/plain',
            size_bytes: 13,
        }),
    ])
    expect(await repository.getVaultFile(vaultFile.id)).toMatchObject({
        id: vaultFile.id,
        extracted_text: 'Remember alpha.',
    })
    expect(await repository.listVaultFiles()).toEqual([
        expect.objectContaining({ id: vaultFile.id }),
    ])

    const otherFile = await repository.createVaultFile({
        id: 'vault-other',
        display_name: 'other.txt',
        media_type: 'text/plain',
        size_bytes: 5,
        private_uri: 'talos-vault/files/vault-other.txt',
        status: 'available',
        trust: 'untrusted',
        sha256: 'b'.repeat(64),
        extracted_text: 'Other',
        failure_code: null,
        created_at: '2026-07-22T10:00:04.000Z',
    })
    await expect(repository.appendMessage({
        id: 'message-invalid-binding',
        session_id: alpha.id,
        role: 'user',
        content: 'This must roll back.',
        state: 'persisted',
        created_at: '2026-07-22T10:00:05.000Z',
        attachments: [{
            id: 'binding-invalid',
            vault_file_id: otherFile.id,
            grant_id: grant.id,
        }],
    })).rejects.toThrow('TALOS_FILE_GRANT_MISMATCH')
    expect((await repository.listMessages(alpha.id)).some(
        (message) => message.id === 'message-invalid-binding',
    )).toBe(false)

    await repository.revokeFileAuthorityGrant(grant.id)
    await expect(repository.appendMessage({
        id: 'message-revoked-binding',
        session_id: alpha.id,
        role: 'user',
        content: 'Revoked grants cannot bind.',
        state: 'persisted',
        created_at: '2026-07-22T10:00:06.000Z',
        attachments: [{
            id: 'binding-revoked',
            vault_file_id: vaultFile.id,
            grant_id: grant.id,
        }],
    })).rejects.toThrow('TALOS_FILE_GRANT_INACTIVE')
    const beta = await repository.createSession({
        id: 'session-beta',
        title: 'Beta',
        active_model_profile_id: null,
        created_at: '2026-07-22T10:01:00.000Z',
    })
    expect(await repository.getActiveSessionId()).toBe(beta.id)
    expect((await repository.listSessions()).map((session) => session.id)).toEqual([
        'session-beta',
        'session-alpha',
    ])

    expect(await repository.loadComposerDraft(alpha.id)).toBe('')
    await repository.saveComposerDraft(alpha.id, 'Draft for alpha')
    await repository.saveComposerDraft(beta.id, 'Draft for beta')
    expect(await repository.loadComposerDraft(alpha.id)).toBe('Draft for alpha')
    expect(await repository.loadComposerDraft(beta.id)).toBe('Draft for beta')
    await repository.saveComposerDraft(alpha.id, '')
    expect(await repository.loadComposerDraft(alpha.id)).toBe('')

    await repository.selectSession(alpha.id)
    expect(await repository.getActiveSessionId()).toBe(alpha.id)
    expect((await repository.listMessages(alpha.id)).map((message) => message.content)).toEqual([
        'Remember alpha.',
        'Alpha is recorded.',
        'Use the attached file.',
        'The same file again.',
    ])

    const renamed = await repository.renameSession(alpha.id, '  Durable alpha  ')
    expect(renamed.title).toBe('Durable alpha')

    const browsing = await repository.updateSession(alpha.id, { surface: 'browse' })
    expect(browsing.surface).toBe('browse')
    expect((await repository.listSessions()).find((session) => session.id === alpha.id)?.surface)
        .toBe('browse')

    await repository.deleteSession(alpha.id)
    expect(await repository.getActiveSessionId()).toBe(beta.id)
    expect(await repository.listMessages(alpha.id)).toEqual([])
    expect(await repository.getVaultFile(vaultFile.id)).toMatchObject({ id: vaultFile.id })
    expect(await repository.listMessageAttachments(messageWithFile.id)).toEqual([])
    expect(await repository.listSessionToolActivities(alpha.id)).toEqual([])
    await repository.deleteVaultFile(otherFile.id)
    expect(await repository.getVaultFile(otherFile.id)).toBeNull()
    await repository.deleteSession(beta.id)
    expect(await repository.getActiveSessionId()).toBeNull()
    expect(await repository.listSessions()).toEqual([])

    // F4 Memory station — desktop-parity memory registry CRUD. Untrusted by
    // construction; disable is a status transition, delete is explicit.
    const memory = await repository.createMemory({
        id: 'memory-1',
        scope_type: 'global',
        scope_id: null,
        kind: 'preference',
        title: 'Tone preference',
        content: 'The owner prefers concise italian answers.',
        source: 'talos_mobile_station',
        metadata: { created_from: 'contract-test' },
        created_at: '2026-07-22T11:00:00.000Z',
    })
    expect(memory).toMatchObject({
        id: 'memory-1',
        status: 'active',
        trust_level: 'untrusted',
        kind: 'preference',
        last_used_at: null,
    })
    await repository.createMemory({
        id: 'memory-2',
        scope_type: 'project',
        scope_id: 'avm',
        kind: 'project_fact',
        title: 'Project fact',
        content: 'AVM is local-first.',
        source: null,
        metadata: {},
        created_at: '2026-07-22T11:00:01.000Z',
    })
    expect((await repository.listMemories()).map((entry) => entry.id)).toEqual(['memory-2', 'memory-1'])

    const disabled = await repository.updateMemoryStatus('memory-1', 'disabled')
    expect(disabled.status).toBe('disabled')
    expect((await repository.listMemories()).find((entry) => entry.id === 'memory-1')?.status).toBe('disabled')

    await repository.touchMemories(['memory-2'], '2026-07-22T11:05:00.000Z')
    expect((await repository.listMemories()).find((entry) => entry.id === 'memory-2')?.last_used_at)
        .toBe('2026-07-22T11:05:00.000Z')

    await repository.deleteMemory('memory-1')
    expect((await repository.listMemories()).map((entry) => entry.id)).toEqual(['memory-2'])
    await expect(repository.updateMemoryStatus('memory-1', 'active'))
        .rejects.toThrow('TALOS_MEMORY_NOT_FOUND')

    // SF-10: deleting a session sweeps its session-scoped memories — they can
    // never be injected again and must not linger as dead rows.
    const gamma = await repository.createSession({
        id: 'session-gamma',
        title: 'Gamma',
        active_model_profile_id: null,
        created_at: '2026-07-22T12:00:00.000Z',
    })
    await repository.createMemory({
        id: 'memory-gamma',
        scope_type: 'session',
        scope_id: gamma.id,
        kind: 'procedure',
        title: 'Session-scoped',
        content: 'Dies with its session.',
        source: null,
        metadata: {},
        created_at: '2026-07-22T12:00:01.000Z',
    })
    await repository.deleteSession(gamma.id)
    expect((await repository.listMemories()).map((entry) => entry.id)).toEqual(['memory-2'])

    // F5 stations — run-linked tasks and untrusted notes, local CRUD.
    const task = await repository.createTask({
        id: 'task-1',
        title: 'Verify the EV claim',
        description: 'Benchmark against AVM ON/OFF evidence.',
        run_id: 'run-42',
        priority: 'normal',
        created_at: '2026-07-23T09:00:00.000Z',
    })
    expect(task).toMatchObject({ id: 'task-1', status: 'todo', run_id: 'run-42' })
    await repository.createTask({
        id: 'task-2',
        title: 'Second task',
        description: null,
        run_id: null,
        priority: 'high',
        created_at: '2026-07-23T09:00:01.000Z',
    })
    expect((await repository.listTasks()).map((entry) => entry.id)).toEqual(['task-2', 'task-1'])
    const doing = await repository.setTaskStatus('task-1', 'doing')
    expect(doing.status).toBe('doing')
    await repository.deleteTask('task-2')
    expect((await repository.listTasks()).map((entry) => entry.id)).toEqual(['task-1'])
    await expect(repository.setTaskStatus('task-2', 'done')).rejects.toThrow('TALOS_TASK_NOT_FOUND')

    const note = await repository.createNote({
        id: 'note-1',
        title: 'Field observation',
        content: 'The recognizer needs Google speech services.',
        created_at: '2026-07-23T09:10:00.000Z',
    })
    expect(note).toMatchObject({ id: 'note-1', trust_level: 'untrusted' })
    await repository.createNote({
        id: 'note-2',
        title: 'Second note',
        content: 'Content two.',
        created_at: '2026-07-23T09:10:01.000Z',
    })
    expect((await repository.listNotes()).map((entry) => entry.id)).toEqual(['note-2', 'note-1'])
    await repository.deleteNote('note-2')
    expect((await repository.listNotes()).map((entry) => entry.id)).toEqual(['note-1'])
    await expect(repository.deleteNote('note-2')).rejects.toThrow('TALOS_NOTE_NOT_FOUND')

    // SF-CRITICAL (2026-07-26): the LAZY wrapper — the one production uses —
    // silently dropped the paging options, so the shipped app never paged and
    // scrolling up re-prepended the whole thread, doubling it every time.
    // TypeScript cannot catch that: a one-argument function satisfies a
    // two-argument signature. Only the contract, run against every
    // implementation including the wrapper, can.
    const pagingSession = await repository.createSession({
        id: 'session-paging',
        title: 'Paging',
        active_model_profile_id: null,
        created_at: '2026-07-22T12:00:00.000Z',
    })
    for (let index = 0; index < 6; index += 1) {
        await repository.appendMessage({
            id: `paging-${index}`,
            session_id: pagingSession.id,
            role: index % 2 === 0 ? 'user' : 'assistant',
            content: `paging ${index}`,
            state: 'persisted',
            created_at: `2026-07-22T12:00:0${index}.000Z`,
        })
    }
    const newest = await repository.listMessages(pagingSession.id, { limit: 2 })
    expect(newest.map((message) => message.content)).toEqual(['paging 4', 'paging 5'])
    const older = await repository.listMessages(pagingSession.id, {
        limit: 2,
        before: { ordinal: newest[0]!.ordinal, id: newest[0]!.id },
    })
    expect(older.map((message) => message.content)).toEqual(['paging 2', 'paging 3'])
    // No overlap between pages: an inclusive cursor would duplicate a message.
    expect(older.some((message) => newest.some((row) => row.id === message.id))).toBe(false)
    const everything = await repository.listMessages(pagingSession.id)
    expect(everything).toHaveLength(6)
}
