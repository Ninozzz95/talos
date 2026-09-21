import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import {
    defineTalosTool,
    talosToolsForAnthropic,
    talosToolsForGemini,
    talosToolsForOpenAi,
    parseTalosToolCallArguments,
} from '@/lib/tools/registry'

/**
 * Owner sequence: the tool block. Four provider families, four wire formats,
 * one internal representation — the research is unanimous that the loop is
 * identical everywhere and the friction is purely the shape of the payload.
 *
 * These tests pin the translation, because a silent mistranslation is the worst
 * failure available here: the model would be told a tool exists, call it with
 * arguments the schema never described, and the failure would look like the
 * model being stupid rather than us being wrong.
 */
const searchTool = defineTalosTool({
    name: 'library_search',
    title: 'Search the Library',
    description: 'Find documents in the local Library by meaning, not just keywords.',
    action: 'read',
    input: z.object({
        query: z.string().min(1).describe('What to look for, in natural language.'),
        limit: z.number().int().min(1).max(20).default(5).describe('How many documents to return.'),
    }),
    async run() {
        return { ok: true, content: 'unused in this test' }
    },
})

describe('tool registry translation', () => {
    it('OpenAI: a function with a JSON Schema, arguments arrive as a STRING', () => {
        const [tool] = talosToolsForOpenAi([searchTool])
        expect(tool).toMatchObject({
            type: 'function',
            function: { name: 'library_search' },
        })
        const schema = (tool as { function: { parameters: Record<string, unknown> } }).function.parameters
        expect(schema).toMatchObject({ type: 'object' })
        expect(Object.keys(schema.properties as Record<string, unknown>)).toEqual(['query', 'limit'])
        // The description reaches the model: a tool the model cannot understand
        // is a tool it will misuse.
        expect(JSON.stringify(schema)).toContain('natural language')
    })

    it('Anthropic: input_schema, not parameters — the field name is the whole difference', () => {
        const [tool] = talosToolsForAnthropic([searchTool])
        expect(tool).toMatchObject({ name: 'library_search' })
        expect(tool).toHaveProperty('input_schema')
        expect(tool).not.toHaveProperty('parameters')
        expect((tool as { input_schema: { type: string } }).input_schema.type).toBe('object')
    })

    it('Gemini: functionDeclarations wrapped in one tool entry', () => {
        const tools = talosToolsForGemini([searchTool])
        expect(tools).toHaveLength(1)
        const declarations = (tools[0] as { functionDeclarations: Array<{ name: string }> }).functionDeclarations
        expect(declarations.map((entry) => entry.name)).toEqual(['library_search'])
    })

    it('parses arguments from both shapes: a JSON string and an object', () => {
        expect(parseTalosToolCallArguments(searchTool, '{"query":"fattura","limit":3}'))
            .toEqual({ ok: true, value: { query: 'fattura', limit: 3 } })
        // Anthropic hands back an object, already parsed.
        expect(parseTalosToolCallArguments(searchTool, { query: 'fattura' }))
            .toEqual({ ok: true, value: { query: 'fattura', limit: 5 } })
    })

    it('REFUSES arguments that do not match the schema, with a reason the model can act on', () => {
        const result = parseTalosToolCallArguments(searchTool, '{"limit":99}')
        expect(result.ok).toBe(false)
        if (result.ok) throw new Error('unreachable')
        // The message goes back to the MODEL as a tool result: it has to say
        // what was wrong, or the model just repeats the same call.
        expect(result.error).toMatch(/query/i)
        expect(result.error).toMatch(/limit/i)
    })

    it('refuses malformed JSON instead of throwing into the agent loop', () => {
        const result = parseTalosToolCallArguments(searchTool, '{"query": ')
        expect(result.ok).toBe(false)
        if (result.ok) throw new Error('unreachable')
        expect(result.error).toMatch(/json/i)
    })

    it('every tool declares its action class — the permission gate reads it', () => {
        expect(searchTool.action).toBe('read')
        // A tool without a class would default to the most powerful one by
        // accident; the type makes that impossible, this proves the value.
        expect(['read', 'write', 'outbound']).toContain(searchTool.action)
    })
})
