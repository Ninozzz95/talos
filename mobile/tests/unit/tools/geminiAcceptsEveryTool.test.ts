import { describe, expect, it, vi } from 'vitest'
import { createTalosToolset } from '@/lib/tools/toolset'
import { talosToolsForGemini } from '@/lib/tools/registry'
import { TALOS_AGENT_TOOL_IDS } from '@/lib/tools/toolControls'

/**
 * EVERY tool that can exist, not merely the ones a bare build offers.
 *
 * This used the default enabled-map, and on 2026-08-03 that hole cost a real
 * 400: `library_context_policy_update` is OFF by default and is exactly the
 * tool whose schema breaks providers. A guard that watches only the defaults
 * watches the wrong suite — someone turns one switch on and every call is
 * refused.
 */
const EVERY_TOOL_ENABLED = Object.freeze(
    Object.fromEntries(TALOS_AGENT_TOOL_IDS.map((id) => [id, true])),
) as Record<string, boolean>

/**
 * Owner 2026-07-31, visible in his screen recording at 00:18 — an old turn in a
 * chat, refused whole:
 *
 *   Invalid value at 'tools[0].function_declarations[10].parameters
 *   …items.any_of[1].properties[1].value.any_of[2].enum[0]' (TYPE_STRING)
 *   gemini / gemini-3.1-flash-lite   HTTP 400
 *
 * Gemini reads an OpenAPI SUBSET, and a schema it refuses takes the WHOLE call
 * with it: one bad branch in one tool and every tool is unavailable, on a
 * provider the user has already paid for. Two of these have been fixed one at a
 * time from the wire — `const` (2026-07-27), then non-string `const` becoming
 * `enum: [1]` (2026-07-30) — each after the owner hit it on his phone.
 *
 * Fixing them one at a time is the wrong shape. This walks the ACTUAL suite, as
 * the adapter would send it, and checks the dialect's rules on every node of
 * every schema. A tool added later that breaks Gemini fails here instead of on
 * his device.
 */
function everyNode(value: unknown, path: string, visit: (node: Record<string, unknown>, path: string) => void): void {
    if (Array.isArray(value)) {
        value.forEach((item, index) => everyNode(item, `${path}[${index}]`, visit))
        return
    }
    if (value === null || typeof value !== 'object') return
    const node = value as Record<string, unknown>
    visit(node, path)
    for (const [key, child] of Object.entries(node)) everyNode(child, `${path}.${key}`, visit)
}

/**
 * Every tool that can exist, not merely the ones a bare build offers.
 *
 * The 400 in the recording names `function_declarations[10]`, so the device had
 * at least eleven — a suite with the web, document and image tools present. A
 * guard that checks seven would have watched it happen.
 */
async function geminiPayload(): Promise<unknown> {
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
    expect(tools.length).toBeGreaterThan(10)
    return talosToolsForGemini(tools as never)
}

describe('the whole tool suite, as Gemini would receive it', () => {
    /** The exact 400 in the recording: a non-string sitting in an `enum`. */
    it('never puts a non-string in an enum', async () => {
        const offences: string[] = []
        everyNode(await geminiPayload(), 'tools', (node, path) => {
            if (!Array.isArray(node.enum)) return
            for (const [index, value] of node.enum.entries()) {
                if (typeof value !== 'string') {
                    offences.push(`${path}.enum[${index}] = ${JSON.stringify(value)}`)
                }
            }
        })

        expect(offences).toEqual([])
    })

    /** The 2026-07-27 400: `const` is not in Gemini's subset at all. */
    it('never sends const', async () => {
        const offences: string[] = []
        everyNode(await geminiPayload(), 'tools', (node, path) => {
            if ('const' in node) offences.push(`${path}.const`)
        })

        expect(offences).toEqual([])
    })

    /** `anyOf` is the one Gemini documents; `oneOf` is a maybe, and a maybe
     *  is not something to ship to a distributed app. */
    it('never sends oneOf', async () => {
        const offences: string[] = []
        everyNode(await geminiPayload(), 'tools', (node, path) => {
            if ('oneOf' in node) offences.push(`${path}.oneOf`)
        })

        expect(offences).toEqual([])
    })

    /** An empty enum is refused too, and says nothing a reader could act on. */
    it('never sends an empty enum', async () => {
        const offences: string[] = []
        everyNode(await geminiPayload(), 'tools', (node, path) => {
            if (Array.isArray(node.enum) && node.enum.length === 0) offences.push(`${path}.enum`)
        })

        expect(offences).toEqual([])
    })
})
