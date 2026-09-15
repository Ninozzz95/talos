import { describe, expect, it, vi } from 'vitest'
import { createTalosToolset } from '@/lib/tools/toolset'
import { talosToolsForAnthropic } from '@/lib/tools/registry'
import { TALOS_AGENT_TOOL_IDS } from '@/lib/tools/toolControls'

/**
 * EVERY tool that can exist, not merely the ones a bare build offers.
 *
 * The first version of this gate used the default enabled-map and the mutation
 * proof did not bite: `library_context_policy` is OFF by default, and it is
 * precisely the tool whose `z.discriminatedUnion` produced the 400. A guard
 * that only watches the defaults watches the wrong suite — someone turns one
 * switch on and the provider refuses every call.
 */
const EVERY_TOOL_ENABLED = Object.freeze(
    Object.fromEntries(TALOS_AGENT_TOOL_IDS.map((id) => [id, true])),
) as Record<string, boolean>

/**
 * Owner 2026-08-03, verbatim from his tablet, asking for a PDF:
 *
 *   tools.4.custom.input_schema.type: Field required
 *   anthropic / claude-sonnet-5   HTTP 400
 *
 * `z.discriminatedUnion` emits `{oneOf: [...]}` with no `type` of its own. That
 * is correct JSON Schema and unacceptable to Anthropic, which requires the key
 * — and a refused schema takes the WHOLE call with it, so one tool without a
 * `type` made every send to Anthropic fail, not only the one that wanted it.
 *
 * The sibling of the Gemini gate beside this file, and for the same reason:
 * fixing these one at a time, from a screenshot, after the owner hits them, is
 * the wrong shape. This walks the ACTUAL suite as the adapter would send it.
 */
async function anthropicPayload(): Promise<Array<Record<string, unknown>>> {
    const toolset = await createTalosToolset({
        repository: {} as never,
        readVaultFileText: vi.fn(async () => null),
        readVaultFileBytes: vi.fn(async () => null),
        requestConsent: vi.fn(async () => true),
        sessionTitles: vi.fn(async () => new Map<string, string>()),
        libraryEnabled: () => true,
        web: () => ({}) as never,
        documents: () => ({}) as never,
        images: () => ({}) as never,
        saveVaultFileToDevice: vi.fn(async () => ({}) as never),
        libraryContextPolicy: {} as never,
    })
    const tools = toolset.offer(
        { read: 'allow', write: 'allow', outbound: 'allow' },
        EVERY_TOOL_ENABLED as never,
    )
    // The 400 names `tools.4`, so the device had at least five. A guard that
    // checked three would have watched it happen.
    expect(tools.length).toBeGreaterThan(10)
    return talosToolsForAnthropic(tools as never) as Array<Record<string, unknown>>
}

describe('the whole tool suite, as Anthropic would receive it', () => {
    /** The exact 400 the owner hit. */
    it('gives every tool an input_schema that declares its type', async () => {
        const offences: string[] = []
        for (const tool of await anthropicPayload()) {
            const schema = tool.input_schema as Record<string, unknown> | undefined
            if (!schema || typeof schema.type !== 'string') {
                offences.push(`${String(tool.name)}: type=${JSON.stringify(schema?.type)}`)
            }
        }

        expect(offences).toEqual([])
    })

    /**
     * And it has to be `object`, not merely present. Anthropic takes an object
     * of arguments and nothing else; a tool advertising a string or an array
     * would be accepted by the check above while still being unusable.
     */
    it('declares that type as object, because that is what a tool call is', async () => {
        const wrong = (await anthropicPayload())
            .filter((tool) => (tool.input_schema as Record<string, unknown>).type !== 'object')
            .map((tool) => String(tool.name))

        expect(wrong).toEqual([])
    })

    /**
     * The SECOND 400, raised by the live API the moment the first was fixed:
     *
     *   input_schema does not support oneOf, allOf, or anyOf at the top level
     *
     * Adding `type` was necessary and not sufficient. Anthropic refuses a union
     * at the top of an input schema outright, so the shape itself has to be a
     * plain object — which is why `library_context_policy_update` was flattened.
     */
    it('never puts a union at the top of an input schema', async () => {
        const offences: string[] = []
        for (const tool of await anthropicPayload()) {
            const schema = tool.input_schema as Record<string, unknown>
            for (const key of ['oneOf', 'allOf', 'anyOf']) {
                if (key in schema) offences.push(`${String(tool.name)}.${key}`)
            }
        }

        expect(offences).toEqual([])
    })

    /** A named tool with no description is a tool the model has to guess at. */
    it('names and describes every tool', async () => {
        for (const tool of await anthropicPayload()) {
            expect(typeof tool.name === 'string' && tool.name.length > 0).toBe(true)
            expect(typeof tool.description === 'string' && (tool.description as string).length > 0).toBe(true)
        }
    })
})
