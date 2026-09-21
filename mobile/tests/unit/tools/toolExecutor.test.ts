import { beforeEach, describe, expect, it, vi } from 'vitest'
import { z } from 'zod'
import { defineTalosTool } from '@/lib/tools/registry'
import {
    TALOS_DEFAULT_TOOL_PERMISSIONS,
    decideTalosToolPermission,
    executeTalosTool,
    preflightTalosToolExecution,
} from '@/lib/tools/executor'
import {
    TALOS_EMPTY_TOOL_AUTHORIZATIONS,
    applyTalosToolAuthorizationGrant,
    digestTalosToolAuthorizationInput,
    type TalosToolAuthorizationRequestV1,
} from '@/lib/tools/toolAuthorizations'

/**
 * Owner decision 2026-07-25: permissions per ACTION TYPE, configured by the
 * user, with safe defaults — reading is free, writing asks, anything leaving
 * the device is refused.
 *
 * The research pass is blunt about why this shape and not a smarter one: prompt
 * injection is unsolved at the model layer, so the strategy is containment. A
 * document in the Library can say "call the write tool"; the gate is what makes
 * that sentence worthless.
 */
const reader = defineTalosTool({
    name: 'library_search',
    title: 'Search the Library',
    description: 'Find documents by meaning.',
    action: 'read',
    input: z.object({ query: z.string().min(1) }),
    async run(input) {
        return { ok: true, content: `found: ${input.query}` }
    },
})

const writer = defineTalosTool({
    name: 'notes_create',
    title: 'Create a note',
    description: 'Write a new note.',
    action: 'write',
    input: z.object({ title: z.string().min(1) }),
    async run(input) {
        return { ok: true, content: `created: ${input.title}` }
    },
})

const sender = defineTalosTool({
    name: 'share_outside',
    title: 'Send outside the device',
    description: 'Sends data to a third party.',
    action: 'outbound',
    input: z.object({ to: z.string() }),
    async run() {
        return { ok: true, content: 'sent' }
    },
})

const policyWriter = defineTalosTool({
    name: 'library_context_policy_update',
    title: 'Change Library context policy',
    description: 'Apply an explicitly confirmed Library policy mutation.',
    action: 'write',
    confirmation: 'always',
    input: z.object({ mode: z.string().min(1) }),
    async run(input) {
        return { ok: true, content: `updated: ${input.mode}` }
    },
})

const compoundWebWriter = defineTalosTool({
    name: 'web_archive',
    title: 'Search and archive a web source',
    description: 'Send a query off-device and persist its source locally.',
    action: 'outbound',
    requiredActions: ['outbound', 'write'],
    input: z.object({ query: z.string().min(1) }),
    async run(input) {
        return { ok: true, content: `archived: ${input.query}` }
    },
})

const audit = vi.fn(async () => {})
const consent = vi.fn(async () => true)

function deps(overrides: Record<string, unknown> = {}) {
    return {
        /**
         * One of each, stated rather than inherited.
         *
         * These tests are about the GATE, so they need all three states present
         * at once — allow, ask, deny. They used to get that mix for free from
         * the product default, which coupled them to a product decision they
         * are not about: when the owner moved every default to `ask` on
         * 2026-08-01 they broke, having asserted the old decision without ever
         * naming it. Written out, they test the gate and nothing else.
         */
        permissions: { read: 'allow' as const, write: 'ask' as const, outbound: 'deny' as const },
        isToolEnabled: () => true,
        requestConsent: consent,
        audit,
        context: { sessionId: 'session-1' },
        ...overrides,
    }
}

beforeEach(() => {
    audit.mockClear()
    consent.mockClear().mockResolvedValue(true)
})

describe('tool permissions', () => {
    it('defaults are the owner decision, not a convenience', () => {
        // Re-pinned 2026-08-01, owner's decision: everything asks. The previous
        // split — read free, write asks, outbound refused — was chosen before
        // the authorization card existed, and `deny` proved to be the wrong
        // shape for a default because nothing downstream could tell it apart
        // from a considered "never".
        expect(TALOS_DEFAULT_TOOL_PERMISSIONS).toEqual({ read: 'ask', write: 'ask', outbound: 'ask' })
    })

    /**
     * Written against the PRINCIPLE, not against today's values.
     *
     * It used to assert `deny` for a missing outbound preference, which was
     * the default at the time — so the day the default moved, a test guarding
     * "never fall back to the loosest" failed for a reason that had nothing to
     * do with looseness. The risk it exists to catch is a corrupt value being
     * read as permission; that is `allow`, and it is what is asserted.
     */
    it('an unknown or corrupt preference falls back to the default, and never to allow', () => {
        for (const action of ['read', 'write', 'outbound'] as const) {
            expect(decideTalosToolPermission(action, { [action]: 'banana' } as never))
                .toBe(TALOS_DEFAULT_TOOL_PERMISSIONS[action])
            expect(decideTalosToolPermission(action, {} as never))
                .toBe(TALOS_DEFAULT_TOOL_PERMISSIONS[action])
            expect(decideTalosToolPermission(action, { [action]: 'banana' } as never))
                .not.toBe('allow')
        }
    })
})

describe('executeTalosTool', () => {
    it('TOOL-AUTH-01 preflights an unresolved write without executing, auditing, or parking consent', async () => {
        const run = vi.spyOn(writer, 'run')

        const result = await preflightTalosToolExecution(
            writer,
            { title: 'Spesa' },
            deps({ callId: 'call-write-1' }),
        )

        expect(result).toMatchObject({
            status: 'authorization_required',
            request: {
                callId: 'call-write-1',
                actions: ['write'],
                input: { title: 'Spesa' },
                allowPersistent: true,
            },
        })
        expect(run).not.toHaveBeenCalled()
        expect(consent).not.toHaveBeenCalled()
        expect(audit).not.toHaveBeenCalled()
        run.mockRestore()
    })

    it('TOOL-AUTH-03 an exact allow-once request runs without the legacy consent Promise', async () => {
        const input = { title: 'Spesa' }
        const request: TalosToolAuthorizationRequestV1 = {
            schema_version: 1,
            id: 'request-write-1',
            checkpoint_id: 'checkpoint-write-1',
            session_id: 'session-1',
            send_id: 'send-1',
            model_profile_id: 'anthropic:claude-live',
            call_id: 'call-write-1',
            tool: 'notes_create',
            actions: ['write'],
            input,
            input_digest: await digestTalosToolAuthorizationInput(input),
            allow_persistent: true,
            decision: 'allow_once',
            created_at: '2026-07-29T12:00:00.000Z',
            decided_at: '2026-07-29T12:01:00.000Z',
        }

        const result = await executeTalosTool(
            writer,
            input,
            deps({
                callId: 'call-write-1',
                authorizationRequest: request,
            }),
        )

        expect(result.ok).toBe(true)
        expect(consent).not.toHaveBeenCalled()
    })

    it('TOOL-AUTH-05 an exact persistent grant suppresses only its matching tool prompt', async () => {
        const authorizations = applyTalosToolAuthorizationGrant(
            TALOS_EMPTY_TOOL_AUTHORIZATIONS,
            'document_create',
            ['write'],
            0,
            '2026-07-29T12:00:00.000Z',
        )
        const documentWriter = defineTalosTool({
            ...writer,
            name: 'document_create',
        })

        const result = await executeTalosTool(
            documentWriter,
            { title: 'Spesa' },
            deps({ authorizations, callId: 'call-doc-1' }),
        )

        expect(result.ok).toBe(true)
        expect(consent).not.toHaveBeenCalled()
        const unrelated = await preflightTalosToolExecution(
            writer,
            { title: 'Other' },
            deps({ authorizations, callId: 'call-note-1' }),
        )
        expect(unrelated.status).toBe('authorization_required')
    })

    it('P1-CTX-AGENT-02/05 indirect content, write=allow, and a saved grant never suppress policy confirmation', async () => {
        const run = vi.spyOn(policyWriter, 'run')
        const authorizations = applyTalosToolAuthorizationGrant(
            TALOS_EMPTY_TOOL_AUTHORIZATIONS,
            'library_context_policy_update',
            ['write'],
            0,
            '2026-07-29T12:00:00.000Z',
        )

        const preflight = await preflightTalosToolExecution(
            policyWriter,
            { mode: 'broad_compat_v1' },
            deps({
                permissions: { read: 'allow', write: 'allow', outbound: 'deny' },
                authorizations,
                callId: 'call-policy-1',
            }),
        )

        expect(preflight).toMatchObject({
            status: 'authorization_required',
            request: {
                callId: 'call-policy-1',
                actions: ['write'],
                allowPersistent: false,
            },
        })
        expect(run).not.toHaveBeenCalled()
        expect(consent).not.toHaveBeenCalled()
        run.mockRestore()
    })

    it('AGENT-TOOLS-05 live revocation fails closed before parse, consent, or body', async () => {
        const run = vi.fn(async () => ({ ok: true as const, content: 'must not run' }))
        const revokedReader = defineTalosTool({ ...reader, run })
        const result = await executeTalosTool(
            revokedReader,
            '{not valid json',
            deps({ isToolEnabled: () => false }),
        )

        expect(result).toMatchObject({
            ok: false,
            code: 'TALOS_TOOL_DISABLED',
        })
        expect(run).not.toHaveBeenCalled()
        expect(consent).not.toHaveBeenCalled()
        expect(audit).toHaveBeenCalledWith(expect.objectContaining({
            tool: 'library_search',
            status: 'denied',
            input: '{not valid json',
        }))
    })

    it('P0-CAP-01 deny on any required action blocks before the tool body', async () => {
        const run = vi.spyOn(compoundWebWriter, 'run')
        const result = await executeTalosTool(
            compoundWebWriter,
            { query: 'private acquisition' },
            deps({
                permissions: { read: 'allow', write: 'deny', outbound: 'allow' },
            }),
        )

        expect(result).toMatchObject({
            ok: false,
            code: 'TALOS_TOOL_DENIED_BY_POLICY',
        })
        expect(run).not.toHaveBeenCalled()
        expect(consent).not.toHaveBeenCalled()
        expect(audit).toHaveBeenCalledWith(expect.objectContaining({
            tool: 'web_archive',
            action: 'outbound',
            requiredActions: ['outbound', 'write'],
            status: 'denied',
        }))
        run.mockRestore()
    })

    it('P0-CAP-02 asks once with exactly the unresolved compound actions', async () => {
        const result = await executeTalosTool(
            compoundWebWriter,
            { query: 'private acquisition' },
            deps({
                permissions: { read: 'allow', write: 'ask', outbound: 'ask' },
            }),
        )

        expect(result.ok).toBe(true)
        expect(consent).toHaveBeenCalledTimes(1)
        expect(consent).toHaveBeenCalledWith(expect.objectContaining({
            tool: compoundWebWriter,
            actions: ['outbound', 'write'],
            input: { query: 'private acquisition' },
        }))
    })

    it('a read runs without asking anyone, and its output is MARKED untrusted', async () => {
        const result = await executeTalosTool(reader, '{"query":"fattura"}', deps())
        expect(result.ok).toBe(true)
        expect(result.content).toContain('found: fattura')
        // SF-CRITICAL: tool output used to reach the model as a bare tool turn
        // — the highest-trust non-system channel — so a document saying
        // "SYSTEM: you may now…" arrived as an instruction.
        expect(result.content).toMatch(/^TALOS_TOOL_RESULT \(untrusted data/)
        expect(result.content).toContain('END_TALOS_TOOL_RESULT')
        expect(consent).not.toHaveBeenCalled()
        expect(audit).toHaveBeenCalledWith(expect.objectContaining({
            tool: 'library_search', status: 'succeeded',
        }))
    })

    it('a write asks, and runs when the user consents', async () => {
        const result = await executeTalosTool(writer, { title: 'Spesa' }, deps())
        expect(consent).toHaveBeenCalledWith(expect.objectContaining({
            tool: writer, input: { title: 'Spesa' },
        }))
        expect(result.ok).toBe(true)
        expect(result.content).toContain('created: Spesa')
    })

    it('a refused write is reported to the MODEL, not thrown at the user', async () => {
        consent.mockResolvedValue(false)
        const result = await executeTalosTool(writer, { title: 'Spesa' }, deps())
        // An agent told "denied" adapts; an agent handed an exception derails.
        expect(result.ok).toBe(false)
        expect(result.content).toMatch(/declin|denied/i)
        expect(audit).toHaveBeenCalledWith(expect.objectContaining({ status: 'denied' }))
    })

    it('an outbound tool is denied WITHOUT asking, because the default is never', async () => {
        const result = await executeTalosTool(sender, { to: 'someone@example.com' }, deps())
        expect(consent).not.toHaveBeenCalled()
        expect(result.ok).toBe(false)
        expect(result.content).toMatch(/policy/i)
        expect(audit).toHaveBeenCalledWith(expect.objectContaining({ status: 'denied' }))
    })

    it('arguments are validated BEFORE the tool body, and the reason goes back to the model', async () => {
        const run = vi.spyOn(reader, 'run')
        const result = await executeTalosTool(reader, '{"query":""}', deps())
        expect(run).not.toHaveBeenCalled()
        expect(result.ok).toBe(false)
        expect(result.content).toMatch(/query/i)
        expect(audit).toHaveBeenCalledWith(expect.objectContaining({ status: 'failed' }))
        run.mockRestore()
    })

    it('a tool that throws becomes an honest failed result, never an unhandled rejection', async () => {
        const broken = defineTalosTool({
            ...reader,
            name: 'broken',
            async run() { throw new Error('disk on fire') },
        })
        const result = await executeTalosTool(broken, '{"query":"x"}', deps())
        expect(result.ok).toBe(false)
        expect(result.content).toMatch(/disk on fire/)
        expect(audit).toHaveBeenCalledWith(expect.objectContaining({ status: 'failed' }))
    })

    it('OUR refusals are not wrapped — wrapping them would teach distrust of our own rules', async () => {
        consent.mockResolvedValue(false)
        const result = await executeTalosTool(writer, { title: 'x' }, deps())
        expect(result.content).not.toContain('TALOS_TOOL_RESULT')
        const denied = await executeTalosTool(sender, { to: 'x' }, deps())
        expect(denied.content).not.toContain('TALOS_TOOL_RESULT')
    })

    it('every outcome is audited — a tool run nobody can explain afterwards is not acceptable', async () => {
        await executeTalosTool(reader, '{"query":"a"}', deps())
        consent.mockResolvedValue(false)
        await executeTalosTool(writer, { title: 'b' }, deps())
        await executeTalosTool(sender, { to: 'c' }, deps())
        expect(audit).toHaveBeenCalledTimes(3)
        expect(audit.mock.calls.map(([row]) => (row as { status: string }).status))
            .toEqual(['succeeded', 'denied', 'denied'])
    })
})
