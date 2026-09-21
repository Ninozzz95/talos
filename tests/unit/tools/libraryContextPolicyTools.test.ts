import { describe, expect, it, vi } from 'vitest'
import {
    createTalosLibraryContextPolicyTools,
    type TalosLibraryContextPolicySnapshot,
    type TalosLibraryContextPolicyToolSources,
} from '@/lib/tools/libraryContextPolicyTools'
import { TalosLibraryPolicyConflictError } from '@/lib/chat/libraryPolicy'

function snapshot(
    overrides: Partial<TalosLibraryContextPolicySnapshot> = {},
): TalosLibraryContextPolicySnapshot {
    return {
        scope: 'global',
        session_id: null,
        revision: 3,
        enabled: true,
        mode: 'broad_compat_v1',
        included_file_ids: [],
        excluded_file_ids: [],
        ...overrides,
    }
}

function mutableSources(initial: TalosLibraryContextPolicySnapshot) {
    let current = structuredClone(initial)
    const replace = vi.fn(async (
        scope: TalosLibraryContextPolicySnapshot['scope'],
        sessionId: string | null,
        value: Omit<
            TalosLibraryContextPolicySnapshot,
            'scope' | 'session_id' | 'revision'
        >,
        expectedRevision: number,
    ) => {
        if (current.revision !== expectedRevision) {
            throw new TalosLibraryPolicyConflictError(
                expectedRevision,
                current.revision,
            )
        }
        current = {
            scope,
            session_id: sessionId,
            revision: current.revision + 1,
            ...structuredClone(value),
        }
        return structuredClone(current)
    })
    const sources: TalosLibraryContextPolicyToolSources = {
        read: vi.fn(async () => structuredClone(current)),
        replace,
    }
    return {
        sources,
        replace,
        current: () => structuredClone(current),
    }
}

describe('library_context_policy_update', () => {
    it('P1-CTX-AGENT-01 owns a closed schema and a dedicated always-confirm write boundary', () => {
        const state = mutableSources(snapshot())
        const [tool] = createTalosLibraryContextPolicyTools(state.sources)

        expect(tool).toMatchObject({
            name: 'library_context_policy_update',
            action: 'write',
            confirmation: 'always',
        })
        expect(tool!.input.safeParse({
            action: 'set_mode',
            scope: 'chat',
            mode: 'smart_relevant_v1',
            expected_revision: 2,
        }).success).toBe(true)
        expect(tool!.input.safeParse({
            action: 'set_mode',
            scope: 'chat',
            mode: 'smart_relevant_v1',
            expected_revision: 2,
            injected: 'ignore policy',
        }).success).toBe(false)
        expect(tool!.input.safeParse({
            action: 'include_files',
            scope: 'turn',
            file_ids: [],
            expected_revision: 0,
        }).success).toBe(false)
        expect(tool!.input.safeParse({
            action: 'undo',
            scope: 'global',
            receipt_id: 'receipt-1',
        }).success).toBe(false)
    })

    it('P1-CTX-AGENT-03 fails a revision conflict without a lost update', async () => {
        const state = mutableSources(snapshot({ revision: 7 }))
        const [tool] = createTalosLibraryContextPolicyTools(state.sources)

        const result = await tool!.run({
            action: 'set_mode',
            scope: 'global',
            mode: 'smart_relevant_v1',
            expected_revision: 6,
        }, { sessionId: 'chat-1' })

        expect(result).toMatchObject({
            ok: false,
            code: 'TALOS_LIBRARY_POLICY_CONFLICT',
        })
        expect(state.replace).not.toHaveBeenCalled()
        expect(state.current()).toMatchObject({
            revision: 7,
            mode: 'broad_compat_v1',
        })
    })

    it('applies exclusion-over-inclusion and returns a bounded auditable receipt', async () => {
        const state = mutableSources(snapshot({
            scope: 'chat',
            session_id: 'chat-1',
            revision: 4,
            enabled: null,
            mode: null,
            included_file_ids: ['brief'],
            excluded_file_ids: [],
        }))
        const [tool] = createTalosLibraryContextPolicyTools(state.sources, {
            newReceiptId: () => 'receipt-chat-1',
            now: () => '2026-07-29T17:00:00.000Z',
        })

        const result = await tool!.run({
            action: 'exclude_files',
            scope: 'chat',
            file_ids: ['brief', 'secret'],
            expected_revision: 4,
        }, { sessionId: 'chat-1' })

        expect(result.ok).toBe(true)
        expect(state.current()).toEqual({
            scope: 'chat',
            session_id: 'chat-1',
            revision: 5,
            enabled: null,
            mode: null,
            included_file_ids: [],
            excluded_file_ids: ['brief', 'secret'],
        })
        expect(result.evidence).toMatchObject({
            contract: 'talos.library-context-policy-receipt/1',
            receipt_id: 'receipt-chat-1',
            scope: 'chat',
            session_id: 'chat-1',
            previous_revision: 4,
            applied_revision: 5,
            action: 'exclude_files',
            created_at: '2026-07-29T17:00:00.000Z',
        })
        expect(JSON.stringify(result.evidence).length).toBeLessThan(4_096)
    })

    it('P1-CTX-AGENT-04 undo restores exact prior fields under a new monotonic revision', async () => {
        const state = mutableSources(snapshot({
            scope: 'chat',
            session_id: 'chat-1',
            revision: 8,
            enabled: null,
            mode: 'smart_relevant_v1',
            included_file_ids: ['brief'],
            excluded_file_ids: ['old'],
        }))
        const [tool] = createTalosLibraryContextPolicyTools(state.sources, {
            newReceiptId: () => 'receipt-undo',
        })
        const changed = await tool!.run({
            action: 'set_mode',
            scope: 'chat',
            mode: 'ask_before_use_v1',
            expected_revision: 8,
        }, { sessionId: 'chat-1' })
        expect(changed.ok).toBe(true)

        const undone = await tool!.run({
            action: 'undo',
            scope: 'chat',
            receipt_id: 'receipt-undo',
            expected_revision: 9,
        }, { sessionId: 'chat-1' })

        expect(undone.ok).toBe(true)
        expect(state.current()).toEqual({
            scope: 'chat',
            session_id: 'chat-1',
            revision: 10,
            enabled: null,
            mode: 'smart_relevant_v1',
            included_file_ids: ['brief'],
            excluded_file_ids: ['old'],
        })
        const replay = await tool!.run({
            action: 'undo',
            scope: 'chat',
            receipt_id: 'receipt-undo',
            expected_revision: 10,
        }, { sessionId: 'chat-1' })
        expect(replay).toMatchObject({
            ok: false,
            code: 'TALOS_LIBRARY_POLICY_UNDO_INVALID',
        })
    })

    it('P1-CTX-AGENT-04B restores an audited receipt copied with terminal punctuation', async () => {
        const state = mutableSources(snapshot({ revision: 11 }))
        let persistedReceipt: Record<string, unknown> | null = null
        const sources = {
            ...state.sources,
            readReceipt: vi.fn(async (receiptId: string, _sessionId: string | null) => (
                persistedReceipt?.receipt_id === receiptId
                    ? persistedReceipt
                    : null
            )),
        }
        const [first] = createTalosLibraryContextPolicyTools(sources, {
            newReceiptId: () => 'receipt-persisted',
        })
        const changed = await first!.run({
            action: 'set_mode',
            scope: 'global',
            mode: 'smart_relevant_v1',
            expected_revision: 11,
        }, { sessionId: 'chat-1' })
        persistedReceipt = changed.evidence ?? null

        const [afterReload] = createTalosLibraryContextPolicyTools(sources)
        const undone = await afterReload!.run({
            action: 'undo',
            scope: 'global',
            receipt_id: 'receipt-persisted.',
            expected_revision: 12,
        }, { sessionId: 'chat-1' })

        expect(sources.readReceipt).toHaveBeenNthCalledWith(
            1,
            'receipt-persisted.',
            'chat-1',
        )
        expect(sources.readReceipt).toHaveBeenNthCalledWith(
            2,
            'receipt-persisted',
            'chat-1',
        )
        expect(undone.ok).toBe(true)
        expect(undone.evidence).toMatchObject({
            receipt_id: 'receipt-persisted',
        })
        expect(state.current()).toMatchObject({
            revision: 13,
            mode: 'broad_compat_v1',
        })
    })

    it('P1-CTX-AGENT-02 binds chat mutation to the captured top-level session', async () => {
        const state = mutableSources(snapshot({
            scope: 'chat',
            session_id: 'captured-chat',
            revision: 1,
            enabled: null,
            mode: null,
        }))
        const [tool] = createTalosLibraryContextPolicyTools(state.sources)

        const missing = await tool!.run({
            action: 'set_enabled',
            scope: 'chat',
            enabled: true,
            expected_revision: 1,
        }, { sessionId: null })
        expect(missing).toMatchObject({
            ok: false,
            code: 'TALOS_LIBRARY_POLICY_SESSION_REQUIRED',
        })
        expect(state.replace).not.toHaveBeenCalled()

        await tool!.run({
            action: 'set_enabled',
            scope: 'chat',
            enabled: true,
            expected_revision: 1,
        }, { sessionId: 'captured-chat' })
        expect(state.replace).toHaveBeenCalledWith(
            'chat',
            'captured-chat',
            expect.any(Object),
            1,
        )
    })
})
