import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import { defineTalosTool } from '@/lib/tools/registry'
import { talosToolsForGemini } from '@/lib/tools/registry'
import { buildAnthropicRequest } from '@/lib/chat/anthropicClient'

/**
 * Two live provider failures the owner hit on 2026-07-27, both reported with
 * the exact HTTP 400 body.
 *
 * The Gemini one was PREDICTED by the adversarial review of the PDF work —
 * "document_create is the first tool in the suite to emit `const` and `anyOf`
 * into the provider schema; `const` is not part of Gemini's OpenAPI subset,
 * worth one live smoke test" — and I filed it as a MINOR to verify later
 * instead of fixing it. Later arrived.
 */
const REPORT_TOOL = defineTalosTool({
    name: 'document_create',
    title: 'Create a document',
    description: 'A tool whose schema contains a discriminated union.',
    action: 'write',
    input: z.object({
        title: z.string(),
        report: z.object({
            blocks: z.array(z.discriminatedUnion('t', [
                z.object({ t: z.literal('p'), x: z.string() }),
                z.object({ t: z.literal('h'), x: z.string() }),
            ])),
        }).optional(),
    }),
    run: async () => ({ ok: true, content: '' }),
})

function everyKey(node: unknown, seen: (key: string, value: unknown) => void): void {
    if (Array.isArray(node)) { node.forEach((entry) => everyKey(entry, seen)); return }
    if (node === null || typeof node !== 'object') return
    for (const [key, value] of Object.entries(node)) {
        seen(key, value)
        everyKey(value, seen)
    }
}

describe('the schema Gemini is willing to read', () => {
    it('carries no `const` anywhere, at any depth', () => {
        // Gemini's validator names the exact path and refuses the whole call:
        // `Unknown name "const" at 'tools[0].function_declarations[8]…'`.
        const declared = talosToolsForGemini([REPORT_TOOL as never])
        const found: string[] = []
        everyKey(declared, (key) => { if (key === 'const') found.push(key) })
        expect(found).toEqual([])
    })

    it('keeps the meaning by turning each literal into a one-value enum', () => {
        // The discriminator is what makes the union repairable for the model;
        // dropping it silently would trade a 400 for a schema that no longer
        // says which block is which.
        const declared = talosToolsForGemini([REPORT_TOOL as never])
        const enums: unknown[] = []
        everyKey(declared, (key, value) => { if (key === 'enum') enums.push(value) })
        expect(enums).toContainEqual(['p'])
        expect(enums).toContainEqual(['h'])
    })

    it('carries no `oneOf` either — only the `anyOf` Gemini documents', () => {
        // The 400 walked THROUGH `one_of` to complain about `const`, which
        // suggests it parsed. "Suggests" is not something to ship: for a
        // discriminated union the two are interchangeable, since the branches
        // are told apart by their discriminator enum.
        const declared = talosToolsForGemini([REPORT_TOOL as never])
        const found: string[] = []
        everyKey(declared, (key) => { if (key === 'oneOf') found.push(key) })
        expect(found).toEqual([])
    })

    it('leaves the other providers untouched', async () => {
        // Only Gemini's dialect is this narrow. Rewriting for everyone would be
        // a lie about what the schema says.
        const { talosToolsForOpenAi } = await import('@/lib/tools/registry')
        const declared = talosToolsForOpenAi([REPORT_TOOL as never])
        const found: string[] = []
        everyKey(declared, (key) => { if (key === 'const') found.push(key) })
        expect(found.length).toBeGreaterThan(0)
    })
})

describe('what Anthropic is asked for', () => {
    it('does not impose a temperature nobody chose', () => {
        // Owner 2026-07-27 on claude-opus-5: HTTP 400,
        // "`temperature` is deprecated for this model."
        //
        // The 0.7 was not his setting — TALOS has no temperature control at
        // all — it was a value I hardcoded. The parameter is optional and
        // defaults to 1.0, so omitting it lets every model use its own default
        // and lets the newest ones stop refusing the call. Pinning a list of
        // models that still accept it would be exactly the static catalogue a
        // distributed app must not ship.
        const request = buildAnthropicRequest('k', {
            model: 'claude-opus-5',
            turns: [{ role: 'user', content: 'ciao' }],
        })
        expect(request.body).not.toHaveProperty('temperature')
    })

    it('still asks for thinking when thinking was asked for', () => {
        const request = buildAnthropicRequest('k', {
            model: 'claude-opus-5',
            turns: [{ role: 'user', content: 'hard' }],
            effort: 'high',
            thinking: true,
        })
        // Adaptive is the default now: `enabled` is a 400 on this very model.
        expect(request.body.thinking).toEqual({ type: 'adaptive' })
        expect(request.body.output_config).toEqual({ effort: 'high' })
        expect(request.body).not.toHaveProperty('temperature')
    })
})
