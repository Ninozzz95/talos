import { describe, expect, it } from 'vitest'
import {
    TALOS_EMPTY_TOOL_AUTHORIZATIONS,
    applyTalosToolAuthorizationGrant,
    canonicalizeTalosToolAuthorizationInput,
    digestTalosToolAuthorizationInput,
    parseTalosToolAuthorizationGrants,
    resolveTalosToolAuthorization,
    revokeTalosToolAuthorizationGrant,
    type TalosToolAuthorizationRequestV1,
} from '@/lib/tools/toolAuthorizations'

const ASK_WRITES = { read: 'allow', write: 'ask', outbound: 'deny' } as const
const ASK_EXTERNAL_WRITES = { read: 'allow', write: 'ask', outbound: 'ask' } as const

function request(
    patch: Partial<TalosToolAuthorizationRequestV1> = {},
): TalosToolAuthorizationRequestV1 {
    return {
        schema_version: 1,
        id: 'request-1',
        checkpoint_id: 'checkpoint-1',
        session_id: 'session-1',
        send_id: 'send-1',
        model_profile_id: 'anthropic:claude-live',
        call_id: 'call-1',
        tool: 'document_create',
        actions: ['write'],
        input: { title: 'Q2', body: 'Verified.' },
        input_digest: 'a'.repeat(64),
        allow_persistent: true,
        decision: 'allow_once',
        created_at: '2026-07-29T12:00:00.000Z',
        decided_at: '2026-07-29T12:01:00.000Z',
        ...patch,
    }
}

describe('talos.tool.authorization-grants/1', () => {
    it('TOOL-AUTH-08 missing, unknown, and corrupt state fail closed to no grants', () => {
        expect(parseTalosToolAuthorizationGrants(null))
            .toEqual(TALOS_EMPTY_TOOL_AUTHORIZATIONS)
        expect(parseTalosToolAuthorizationGrants({
            schema_version: 99,
            revision: 12,
            grants: {
                document_create: {
                    schema_version: 1,
                    tool: 'document_create',
                    actions: ['write'],
                    scope: 'device',
                    granted_at: '2026-07-29T12:00:00.000Z',
                },
            },
        })).toEqual(TALOS_EMPTY_TOOL_AUTHORIZATIONS)

        expect(parseTalosToolAuthorizationGrants({
            schema_version: 1,
            revision: 3,
            grants: {
                unknown_tool: {
                    schema_version: 1,
                    tool: 'unknown_tool',
                    actions: ['write'],
                    scope: 'device',
                    granted_at: '2026-07-29T12:00:00.000Z',
                },
                document_create: {
                    schema_version: 1,
                    tool: 'document_create',
                    actions: ['banana'],
                    scope: 'device',
                    granted_at: 'yesterday',
                },
            },
        })).toEqual({
            schema_version: 1,
            revision: 3,
            grants: {},
        })
    })

    it('TOOL-AUTH-04 applies an exact device grant transactionally and round-trips it', () => {
        const granted = applyTalosToolAuthorizationGrant(
            TALOS_EMPTY_TOOL_AUTHORIZATIONS,
            'document_create',
            ['write', 'write'],
            0,
            '2026-07-29T12:00:00.000Z',
        )

        expect(granted).toEqual({
            schema_version: 1,
            revision: 1,
            grants: {
                document_create: {
                    schema_version: 1,
                    tool: 'document_create',
                    actions: ['write'],
                    scope: 'device',
                    granted_at: '2026-07-29T12:00:00.000Z',
                },
            },
        })
        expect(parseTalosToolAuthorizationGrants(JSON.parse(JSON.stringify(granted))))
            .toEqual(granted)
        expect(TALOS_EMPTY_TOOL_AUTHORIZATIONS.grants).toEqual({})
    })

    it('TOOL-AUTH-04 rejects stale grant and revoke revisions without mutation', () => {
        const granted = applyTalosToolAuthorizationGrant(
            TALOS_EMPTY_TOOL_AUTHORIZATIONS,
            'document_create',
            ['write'],
            0,
            '2026-07-29T12:00:00.000Z',
        )

        expect(() => applyTalosToolAuthorizationGrant(
            granted,
            'generate_image',
            ['write', 'outbound'],
            0,
            '2026-07-29T12:01:00.000Z',
        )).toThrow('TALOS_TOOL_AUTHORIZATION_REVISION_CONFLICT')
        expect(() => revokeTalosToolAuthorizationGrant(
            granted,
            'document_create',
            0,
        )).toThrow('TALOS_TOOL_AUTHORIZATION_REVISION_CONFLICT')
        expect(granted.revision).toBe(1)
        expect(granted.grants.document_create).toBeDefined()
    })

    /**
     * ⛔⛔⛔ Owner 2026-08-27 — chiude il gap onestamente lasciato aperto in
     * Fase 8: "Consenti sempre" su un tool forgiato (`dynamic:*`) falliva
     * SEMPRE con `TALOS_TOOL_AUTHORIZATION_TOOL_INVALID`, perché queste
     * funzioni validavano `tool` contro `TalosAgentToolId` (l'unione statica
     * dei built-in, che un nome `dynamic:*` non può mai abitare per
     * costruzione). Ora la guardia è `isTalosAuthorizableToolName`
     * (built-in O `dynamic:*`), e questo lo prova sia nel verso GIUSTO
     * (funziona) sia in quello CONTRARIO (un nome che non è né l'uno né
     * l'altro resta rifiutato — la guardia non si è solo allargata a
     * "qualunque stringa").
     */
    it('un tool FORGIATO riceve "Consenti sempre" quanto un built-in, e sopravvive al round-trip', () => {
        const granted = applyTalosToolAuthorizationGrant(
            TALOS_EMPTY_TOOL_AUTHORIZATIONS,
            'dynamic:close-with-note',
            ['write'],
            0,
            '2026-08-27T13:00:00.000Z',
        )
        expect(granted.grants['dynamic:close-with-note']).toEqual({
            schema_version: 1,
            tool: 'dynamic:close-with-note',
            actions: ['write'],
            scope: 'device',
            granted_at: '2026-08-27T13:00:00.000Z',
        })
        expect(parseTalosToolAuthorizationGrants(JSON.parse(JSON.stringify(granted))))
            .toEqual(granted)

        const revoked = revokeTalosToolAuthorizationGrant(granted, 'dynamic:close-with-note', 1)
        expect(revoked.grants['dynamic:close-with-note']).toBeUndefined()
    })

    it('⛔ verso contrario: un nome che non è né built-in né dynamic:* resta rifiutato', () => {
        expect(() => applyTalosToolAuthorizationGrant(
            TALOS_EMPTY_TOOL_AUTHORIZATIONS,
            'qualcosa_di_inventato_che_non_esiste',
            ['write'],
            0,
            '2026-08-27T13:00:00.000Z',
        )).toThrow('TALOS_TOOL_AUTHORIZATION_TOOL_INVALID')
        // Nemmeno un prefisso `dynamic:` con uno slug malformato basta: la
        // guardia richiama `dynamicToolIdFromName`, che valida lo slug.
        expect(() => applyTalosToolAuthorizationGrant(
            TALOS_EMPTY_TOOL_AUTHORIZATIONS,
            'dynamic:',
            ['write'],
            0,
            '2026-08-27T13:00:00.000Z',
        )).toThrow('TALOS_TOOL_AUTHORIZATION_TOOL_INVALID')
    })
})

describe('exact tool authorization resolution', () => {
    it('TOOL-AUTH-03 allows baseline policy and an exact one-time decision only', () => {
        expect(resolveTalosToolAuthorization({
            tool: 'library_search',
            requiredActions: ['read'],
            permissions: ASK_WRITES,
            grants: TALOS_EMPTY_TOOL_AUTHORIZATIONS,
            callId: 'call-read',
            inputDigest: 'b'.repeat(64),
        })).toMatchObject({ status: 'allowed', source: 'baseline' })

        expect(resolveTalosToolAuthorization({
            tool: 'document_create',
            requiredActions: ['write'],
            permissions: ASK_WRITES,
            grants: TALOS_EMPTY_TOOL_AUTHORIZATIONS,
            callId: 'call-1',
            inputDigest: 'a'.repeat(64),
            request: request(),
        })).toMatchObject({ status: 'allowed', source: 'allow_once' })

        expect(resolveTalosToolAuthorization({
            tool: 'document_create',
            requiredActions: ['write'],
            permissions: ASK_WRITES,
            grants: TALOS_EMPTY_TOOL_AUTHORIZATIONS,
            callId: 'call-2',
            inputDigest: 'a'.repeat(64),
            request: request(),
        })).toEqual({
            status: 'ask',
            actions: ['write'],
            allow_persistent: true,
        })
    })

    it('⛔ un grant persistente su un tool forgiato risolve "allowed" da persistent, non solo "ask"', () => {
        // `write`, non `read`: con ASK_WRITES la lettura è già permessa dal
        // baseline (il grant non servirebbe a nulla, il test non proverebbe
        // il percorso persistente). La scrittura invece chiede conferma —
        // ESATTAMENTE dove il grant "sempre" deve intervenire.
        const grants = applyTalosToolAuthorizationGrant(
            TALOS_EMPTY_TOOL_AUTHORIZATIONS,
            'dynamic:close-with-note',
            ['write'],
            0,
            '2026-08-27T13:00:00.000Z',
        )
        expect(resolveTalosToolAuthorization({
            tool: 'dynamic:close-with-note',
            requiredActions: ['write'],
            permissions: ASK_WRITES,
            grants,
            callId: 'call-close',
            inputDigest: 'e'.repeat(64),
        })).toMatchObject({ status: 'allowed', source: 'persistent' })
    })

    it('TOOL-AUTH-05 never lets one tool grant authorize another tool', () => {
        const grants = applyTalosToolAuthorizationGrant(
            TALOS_EMPTY_TOOL_AUTHORIZATIONS,
            'document_create',
            ['write'],
            0,
            '2026-07-29T12:00:00.000Z',
        )

        expect(resolveTalosToolAuthorization({
            tool: 'document_create',
            requiredActions: ['write'],
            permissions: ASK_WRITES,
            grants,
            callId: 'call-doc',
            inputDigest: 'b'.repeat(64),
        })).toMatchObject({ status: 'allowed', source: 'persistent' })
        expect(resolveTalosToolAuthorization({
            tool: 'library_export',
            requiredActions: ['write', 'read'],
            permissions: ASK_WRITES,
            grants,
            callId: 'call-export',
            inputDigest: 'c'.repeat(64),
        })).toMatchObject({ status: 'ask', actions: ['write'] })
    })

    it('TOOL-AUTH-06 a newly required action invalidates old grant coverage', () => {
        const grants = applyTalosToolAuthorizationGrant(
            TALOS_EMPTY_TOOL_AUTHORIZATIONS,
            'generate_image',
            ['write'],
            0,
            '2026-07-29T12:00:00.000Z',
        )

        expect(resolveTalosToolAuthorization({
            tool: 'generate_image',
            requiredActions: ['write', 'outbound'],
            permissions: ASK_EXTERNAL_WRITES,
            grants,
            callId: 'call-image',
            inputDigest: 'd'.repeat(64),
        })).toEqual({
            status: 'ask',
            actions: ['write', 'outbound'],
            allow_persistent: true,
        })
    })

    it('TOOL-AUTH-07 deny overrides baseline, one-time, and persistent grants', () => {
        const grants = applyTalosToolAuthorizationGrant(
            TALOS_EMPTY_TOOL_AUTHORIZATIONS,
            'document_create',
            ['write'],
            0,
            '2026-07-29T12:00:00.000Z',
        )

        expect(resolveTalosToolAuthorization({
            tool: 'document_create',
            requiredActions: ['write'],
            permissions: { ...ASK_WRITES, write: 'deny' },
            grants,
            callId: 'call-1',
            inputDigest: 'a'.repeat(64),
            request: request(),
        })).toEqual({ status: 'denied', actions: ['write'], source: 'policy' })
    })

    it('TOOL-AUTH-20 revoking an always grant invalidates its in-flight decision live', () => {
        const grants = applyTalosToolAuthorizationGrant(
            TALOS_EMPTY_TOOL_AUTHORIZATIONS,
            'document_create',
            ['write'],
            0,
            '2026-07-29T12:00:00.000Z',
        )
        const always = request({ decision: 'always_allow' })
        const base = {
            tool: 'document_create' as const,
            requiredActions: ['write'] as const,
            permissions: ASK_WRITES,
            callId: 'call-1',
            inputDigest: 'a'.repeat(64),
            request: always,
        }

        expect(resolveTalosToolAuthorization({ ...base, grants }))
            .toMatchObject({ status: 'allowed', source: 'always_allow' })
        expect(resolveTalosToolAuthorization({
            ...base,
            grants: revokeTalosToolAuthorizationGrant(grants, 'document_create', 1),
        })).toEqual({
            status: 'ask',
            actions: ['write'],
            allow_persistent: true,
        })
    })

    it('TOOL-AUTH-09 refuses mismatched digest, tool, actions, and denied decisions', () => {
        const base = {
            tool: 'document_create' as const,
            requiredActions: ['write'] as const,
            permissions: ASK_WRITES,
            grants: TALOS_EMPTY_TOOL_AUTHORIZATIONS,
            callId: 'call-1',
            inputDigest: 'a'.repeat(64),
        }

        expect(resolveTalosToolAuthorization({
            ...base,
            request: request({ input_digest: 'b'.repeat(64) }),
        }).status).toBe('ask')
        expect(resolveTalosToolAuthorization({
            ...base,
            request: request({ tool: 'generate_image' }),
        }).status).toBe('ask')
        expect(resolveTalosToolAuthorization({
            ...base,
            request: request({ actions: ['outbound'] }),
        }).status).toBe('ask')
        expect(resolveTalosToolAuthorization({
            ...base,
            request: request({ decision: 'deny' }),
        })).toEqual({ status: 'denied', actions: ['write'], source: 'user' })
    })
})

describe('RFC 8785 input binding', () => {
    it('TOOL-AUTH-09 canonicalizes object keys recursively and preserves array order', async () => {
        const left = {
            z: 1,
            a: { y: 'two', x: [3, { b: true, a: null }] },
        }
        const reordered = {
            a: { x: [3, { a: null, b: true }], y: 'two' },
            z: 1,
        }

        expect(canonicalizeTalosToolAuthorizationInput(left))
            .toBe('{"a":{"x":[3,{"a":null,"b":true}],"y":"two"},"z":1}')
        await expect(digestTalosToolAuthorizationInput(left))
            .resolves.toBe(await digestTalosToolAuthorizationInput(reordered))
        await expect(digestTalosToolAuthorizationInput({ values: [1, 2] }))
            .resolves.not.toBe(await digestTalosToolAuthorizationInput({ values: [2, 1] }))
    })

    it('TOOL-AUTH-08 rejects non-I-JSON values instead of hashing an ambiguous form', () => {
        expect(() => canonicalizeTalosToolAuthorizationInput({ value: Number.NaN }))
            .toThrow('TALOS_TOOL_AUTHORIZATION_INPUT_INVALID')
        expect(() => canonicalizeTalosToolAuthorizationInput({ value: Number.POSITIVE_INFINITY }))
            .toThrow('TALOS_TOOL_AUTHORIZATION_INPUT_INVALID')
        expect(() => canonicalizeTalosToolAuthorizationInput({ value: undefined }))
            .toThrow('TALOS_TOOL_AUTHORIZATION_INPUT_INVALID')
        expect(() => canonicalizeTalosToolAuthorizationInput('\ud800'))
            .toThrow('TALOS_TOOL_AUTHORIZATION_INPUT_INVALID')
    })
})
