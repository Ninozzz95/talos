// @vitest-environment jsdom

import { describe, expect, it } from 'vitest'
import {
    TalosLibraryPolicyConflictError,
    applyTalosLibraryContextPolicyPatch,
    applyTalosSessionLibraryContextPolicyPatch,
    assessTalosLibraryAnswerRelevance,
    buildTalosLibraryTopicAnchor,
    parseTalosLibraryContextPolicy,
    resolveTalosLibraryContextPolicy,
    selectTalosLibraryContext,
    shouldGuardTalosBroadLibraryAnswer,
    type TalosLibraryContextPolicyV1,
} from '@/lib/chat/libraryPolicy'
import type { LibraryDoc } from '@/lib/chat/libraryContext'

function doc(overrides: Partial<LibraryDoc>): LibraryDoc {
    return {
        id: 'doc',
        displayName: 'document.md',
        origin: 'uploaded',
        originSessionId: 'origin-chat',
        originSessionTitle: 'Origin',
        text: 'content',
        createdAt: '2026-07-29T10:00:00.000Z',
        ...overrides,
    }
}

function policy(
    overrides: Partial<TalosLibraryContextPolicyV1> = {},
): TalosLibraryContextPolicyV1 {
    return {
        schema_version: 1,
        revision: 1,
        enabled: true,
        mode: 'broad_compat_v1',
        included_file_ids: [],
        excluded_file_ids: [],
        updated_at: '2026-07-29T10:00:00.000Z',
        ...overrides,
    }
}

const selectionOptions = {
    charBudget: 20_000,
    maxDocs: 8,
    perDocChars: 4_000,
}

describe('versioned Library context policy', () => {
    it('P1-CTX-POLICY-00 parses valid storage, deduplicates ids, and fails malformed objects closed', () => {
        expect(parseTalosLibraryContextPolicy(undefined)).toBeNull()
        expect(parseTalosLibraryContextPolicy({
            schema_version: 1,
            revision: 4,
            enabled: true,
            mode: 'smart_relevant_v1',
            included_file_ids: ['a', 'a', '', 'b'],
            excluded_file_ids: ['b', 'c', 'c'],
            updated_at: '2026-07-29T10:00:00.000Z',
        })).toEqual({
            schema_version: 1,
            revision: 4,
            enabled: true,
            mode: 'smart_relevant_v1',
            included_file_ids: ['a'],
            excluded_file_ids: ['b', 'c'],
            updated_at: '2026-07-29T10:00:00.000Z',
        })
        expect(parseTalosLibraryContextPolicy({
            schema_version: 1,
            revision: 2,
            enabled: true,
            mode: 'future_ambient_mode',
        })).toMatchObject({
            schema_version: 1,
            revision: 2,
            enabled: false,
            mode: 'broad_compat_v1',
        })
    })

    it('P1-CTX-POLICY-03 resolves a legacy enabled user to broad compatibility without creating policy state', () => {
        const effective = resolveTalosLibraryContextPolicy({
            legacy_enabled: true,
            global_policy: null,
            session_policy: null,
            turn_override: null,
        })

        expect(effective).toMatchObject({
            enabled: true,
            mode: 'broad_compat_v1',
            source: 'legacy',
            global_revision: 0,
            session_revision: 0,
        })
        expect(effective.included_file_ids).toEqual([])
        expect(effective.excluded_file_ids).toEqual([])
    })

    it('P1-CTX-POLICY-01 applies global, chat, and turn precedence with exclusion always winning', () => {
        const effective = resolveTalosLibraryContextPolicy({
            legacy_enabled: false,
            global_policy: policy({
                revision: 3,
                mode: 'smart_relevant_v1',
                included_file_ids: ['global-a', 'shared-c'],
                excluded_file_ids: ['global-x'],
            }),
            session_policy: {
                schema_version: 1,
                revision: 5,
                enabled: true,
                mode: 'ask_before_use_v1',
                included_file_ids: ['chat-b', 'global-x'],
                excluded_file_ids: ['global-a'],
                updated_at: '2026-07-29T10:01:00.000Z',
            },
            turn_override: {
                enabled: true,
                mode: 'smart_relevant_v1',
                included_file_ids: ['global-a', 'turn-d'],
                excluded_file_ids: ['chat-b'],
            },
        })

        expect(effective.mode).toBe('smart_relevant_v1')
        expect(effective.included_file_ids).toEqual(['shared-c', 'turn-d'])
        expect(effective.excluded_file_ids).toEqual([
            'global-x',
            'global-a',
            'chat-b',
        ])
        expect(effective.global_revision).toBe(3)
        expect(effective.session_revision).toBe(5)
        expect(effective.source).toBe('turn')
    })

    it('P1-CTX-POLICY-02 rejects stale revisions without mutating the current value', () => {
        const current = policy({ revision: 7, mode: 'broad_compat_v1' })

        expect(() => applyTalosLibraryContextPolicyPatch(
            current,
            { mode: 'smart_relevant_v1' },
            6,
            '2026-07-29T10:02:00.000Z',
        )).toThrow(TalosLibraryPolicyConflictError)
        expect(current).toEqual(policy({ revision: 7, mode: 'broad_compat_v1' }))

        expect(applyTalosLibraryContextPolicyPatch(
            current,
            { mode: 'smart_relevant_v1', included_file_ids: ['forced'] },
            7,
            '2026-07-29T10:02:00.000Z',
        )).toMatchObject({
            revision: 8,
            mode: 'smart_relevant_v1',
            included_file_ids: ['forced'],
        })
    })

    it('P1-CTX-POLICY-02 supports explicit chat inheritance with revision checks', () => {
        const current = {
            schema_version: 1 as const,
            revision: 2,
            enabled: true,
            mode: 'ask_before_use_v1' as const,
            included_file_ids: ['chat-file'],
            excluded_file_ids: [],
            updated_at: '2026-07-29T10:00:00.000Z',
        }

        expect(applyTalosSessionLibraryContextPolicyPatch(
            current,
            { enabled: null, mode: null },
            2,
            '2026-07-29T10:03:00.000Z',
        )).toMatchObject({
            revision: 3,
            enabled: null,
            mode: null,
            included_file_ids: ['chat-file'],
        })
        expect(() => applyTalosSessionLibraryContextPolicyPatch(
            current,
            { enabled: false },
            1,
            '2026-07-29T10:03:00.000Z',
        )).toThrow(TalosLibraryPolicyConflictError)
    })
})

describe('Library context decisions', () => {
    const docs = [
        doc({
            id: 'omniroute',
            displayName: 'Contratto OmniRoute.md',
            text: 'Il contratto OmniRoute scade nel marzo 2027.',
        }),
        doc({
            id: 'garden',
            displayName: 'Garden notes.md',
            text: 'Water the basil every morning.',
            createdAt: '2026-07-29T10:01:00.000Z',
        }),
    ]

    it('P1-CTX-SMART-01 excludes zero-evidence documents and keeps forced positive scope', () => {
        const decision = selectTalosLibraryContext(docs, {
            policy: resolveTalosLibraryContextPolicy({
                legacy_enabled: false,
                global_policy: policy({
                    mode: 'smart_relevant_v1',
                    included_file_ids: ['garden'],
                }),
            }),
            query: 'Quando scade OmniRoute?',
            ...selectionOptions,
        })

        expect(decision.candidates.map((candidate) => candidate.id)).toEqual([
            'omniroute',
            'garden',
        ])
        expect(decision.transmitted.map((candidate) => candidate.id)).toEqual([
            'omniroute',
            'garden',
        ])

        const withoutForced = selectTalosLibraryContext(docs, {
            policy: resolveTalosLibraryContextPolicy({
                legacy_enabled: false,
                global_policy: policy({ mode: 'smart_relevant_v1' }),
            }),
            query: 'Quando scade OmniRoute?',
            ...selectionOptions,
        })
        expect(withoutForced.transmitted.map((candidate) => candidate.id))
            .toEqual(['omniroute'])
    })

    it.each([
        {
            prior: 'Controlla il contratto OmniRoute e la sua data di rinnovo.',
            followUp: 'Quando scade?',
        },
        {
            prior: 'Review the OmniRoute agreement renewal date.',
            followUp: 'What about that one?',
        },
        {
            prior: 'Vérifie la date de renouvellement du contrat OmniRoute.',
            followUp: 'Et celui-ci ?',
        },
    ])('P1-CTX-SMART-02 resolves multilingual anaphoric follow-ups: $followUp', ({ prior, followUp }) => {
        const anchor = buildTalosLibraryTopicAnchor([
            { role: 'user', content: prior },
            { role: 'assistant', content: 'I found the agreement.' },
        ], followUp)
        const decision = selectTalosLibraryContext(docs, {
            policy: resolveTalosLibraryContextPolicy({
                legacy_enabled: false,
                global_policy: policy({ mode: 'smart_relevant_v1' }),
            }),
            query: anchor,
            ...selectionOptions,
        })

        expect(decision.transmitted.map((candidate) => candidate.id))
            .toEqual(['omniroute'])
    })

    it('P1-CTX-ASK-01 records candidates but sends no body before consent', () => {
        const effective = resolveTalosLibraryContextPolicy({
            legacy_enabled: false,
            global_policy: policy({ mode: 'ask_before_use_v1' }),
        })
        const beforeConsent = selectTalosLibraryContext(docs, {
            policy: effective,
            query: 'OmniRoute renewal',
            consent_granted: false,
            ...selectionOptions,
        })
        expect(beforeConsent.candidates.map((candidate) => candidate.id)).toEqual(['omniroute'])
        expect(beforeConsent.transmitted).toEqual([])
        expect(beforeConsent.requires_consent).toBe(true)

        const afterConsent = selectTalosLibraryContext(docs, {
            policy: effective,
            query: 'OmniRoute renewal',
            consent_granted: true,
            ...selectionOptions,
        })
        expect(afterConsent.transmitted.map((candidate) => candidate.id)).toEqual(['omniroute'])
        expect(afterConsent.requires_consent).toBe(false)
    })

    it('P1-CTX-ONDEMAND-01 sends no ambient body while leaving explicit tools out of this selector', () => {
        const decision = selectTalosLibraryContext(docs, {
            policy: resolveTalosLibraryContextPolicy({
                legacy_enabled: false,
                global_policy: policy({ mode: 'agentic_on_demand_v1' }),
            }),
            query: 'OmniRoute',
            ...selectionOptions,
        })

        expect(decision.candidates).toEqual([])
        expect(decision.transmitted).toEqual([])
        expect(decision.requires_consent).toBe(false)
        expect(decision.receipt.reason).toBe('agentic_on_demand')
    })

    it('P1-CTX-ISO-01 keeps every broad document while preserving per-document OmniRoute relevance', () => {
        const anchor = buildTalosLibraryTopicAnchor([
            { role: 'user', content: 'Parlami di omnirouter' },
            { role: 'assistant', content: 'Ho trovato due possibili significati.' },
            { role: 'user', content: 'Il secondo' },
            { role: 'assistant', content: 'OmniRoute coordina instradamento e rinnovi.' },
        ], 'Si spiegami')
        const decision = selectTalosLibraryContext(docs, {
            policy: resolveTalosLibraryContextPolicy({
                legacy_enabled: true,
                global_policy: null,
            }),
            query: anchor,
            ...selectionOptions,
        })

        expect(decision.transmitted.map((candidate) => candidate.id))
            .toEqual(['garden', 'omniroute'])
        expect(decision.document_relevance).toEqual([
            { file_id: 'garden', lexical_score: 0 },
            { file_id: 'omniroute', lexical_score: expect.any(Number) },
        ])
        expect(decision.document_relevance?.[1]!.lexical_score).toBeGreaterThan(0)
        expect(shouldGuardTalosBroadLibraryAnswer(decision, anchor)).toBe(true)
        const legacyDecision = { ...decision, document_relevance: undefined }
        expect(shouldGuardTalosBroadLibraryAnswer(legacyDecision, anchor)).toBe(false)
    })

    it('P1-CTX-ISO-02 catches the exact iTerm/mock-GPS pivot and accepts the OmniRoute correction', () => {
        const anchor = buildTalosLibraryTopicAnchor([
            { role: 'user', content: 'Parlami di omnirouter' },
            { role: 'user', content: 'Il secondo' },
        ], 'Si spiegami')

        expect(assessTalosLibraryAnswerRelevance(
            anchor,
            'Dal documento che hai caricato: iTerm può simulare una posizione con mock GPS.',
        )).toMatchObject({ relevant: false, score: 0 })
        expect(assessTalosLibraryAnswerRelevance(
            anchor,
            'OmniRoute mantiene il routing coerente tra i servizi.',
        )).toMatchObject({ relevant: true })
    })

    it('assesses answer relevance against the immutable query/topic anchor', () => {
        expect(assessTalosLibraryAnswerRelevance(
            'OmniRoute renewal expires in March 2027',
            'The OmniRoute renewal is March 2027.',
        )).toMatchObject({ relevant: true })
        expect(assessTalosLibraryAnswerRelevance(
            'OmniRoute renewal expires in March 2027',
            'Water basil in the morning.',
        )).toMatchObject({ relevant: false, score: 0 })
    })
})
