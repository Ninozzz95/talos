import { beforeEach, describe, expect, it, vi } from 'vitest'
import { z } from 'zod'
import { defineTalosTool } from '@/lib/tools/registry'
import {
    TALOS_DEFAULT_TOOL_PERMISSIONS,
    decideTalosToolPermission,
    executeTalosTool,
} from '@/lib/tools/executor'

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

const audit = vi.fn(async () => {})
const consent = vi.fn(async () => true)

function deps(overrides: Record<string, unknown> = {}) {
    return {
        permissions: TALOS_DEFAULT_TOOL_PERMISSIONS,
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
        expect(TALOS_DEFAULT_TOOL_PERMISSIONS).toEqual({ read: 'allow', write: 'ask', outbound: 'deny' })
    })

    it('an unknown or corrupt preference falls back to the SAFEST option, never the loosest', () => {
        expect(decideTalosToolPermission('write', { read: 'allow', write: 'banana' as never, outbound: 'deny' }))
            .toBe('ask')
        expect(decideTalosToolPermission('outbound', {} as never)).toBe('deny')
    })
})

describe('executeTalosTool', () => {
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
