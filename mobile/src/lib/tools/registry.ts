import { z, type ZodType } from 'zod'

/**
 * The tool suite — one internal representation, four wire formats.
 *
 * Web research (2026): the agent loop is identical across providers — declare
 * schemas, detect calls, execute, feed results back — and all the friction is
 * in the payload shape. Anthropic wants `input_schema` and hands back an
 * already-parsed object; OpenAI and DeepSeek want `parameters` and hand back a
 * JSON *string*; Gemini wants `functionDeclarations`; Ollama follows the
 * OpenAI shape. Translating at the edge keeps every tool written once.
 *
 * The other half of that research is blunter: prompt injection is not solved at
 * the model layer, so the strategy is containment. Hence `action`, which the
 * permission gate reads, and hence arguments that are VALIDATED against a
 * schema before any tool body runs — a tool that accepts free-form text is a
 * tool that can be talked into anything.
 */
export type { TalosToolAction } from '@/lib/tools/permissionTypes'
import type { TalosToolAction } from '@/lib/tools/permissionTypes'

export interface TalosToolResult {
    ok: boolean
    /** What the model receives back. Data, never instructions. */
    content: string
    /** Anything the audit row should keep that the model does not need. */
    evidence?: Record<string, unknown>
}

export interface TalosToolContext {
    sessionId: string | null
    signal?: AbortSignal
}

export interface TalosToolDefinition<Input = unknown> {
    name: string
    /** Shown to a HUMAN in the consent sheet and the activity row. */
    title: string
    /** Read by the MODEL: it decides whether the tool fits the question. */
    description: string
    action: TalosToolAction
    input: ZodType<Input>
    run(input: Input, context: TalosToolContext): Promise<TalosToolResult>
}

export function defineTalosTool<Input>(definition: TalosToolDefinition<Input>): TalosToolDefinition<Input> {
    return definition
}

type JsonSchema = Record<string, unknown>

function schemaOf(tool: TalosToolDefinition<never>): JsonSchema {
    // zod 4 emits JSON Schema natively — no second schema to keep in sync, and
    // no chance of the validated shape and the advertised shape drifting apart.
    // It also emits `$schema`, which Gemini's OpenAPI-subset validator rejects
    // outright and OpenAI's strict mode refuses; nobody needs the dialect URL
    // inside a function declaration, so it is dropped here rather than in each
    // of the four translations.
    const { $schema: _dialect, ...schema } = z.toJSONSchema(tool.input, { io: 'input' }) as JsonSchema
    return schema
}

/** OpenAI, DeepSeek, OpenRouter and Ollama all speak this shape. */
export function talosToolsForOpenAi(tools: ReadonlyArray<TalosToolDefinition<never>>): unknown[] {
    return tools.map((tool) => ({
        type: 'function',
        function: {
            name: tool.name,
            description: tool.description,
            parameters: schemaOf(tool),
        },
    }))
}

export function talosToolsForAnthropic(tools: ReadonlyArray<TalosToolDefinition<never>>): unknown[] {
    return tools.map((tool) => ({
        name: tool.name,
        description: tool.description,
        input_schema: schemaOf(tool),
    }))
}

export function talosToolsForGemini(tools: ReadonlyArray<TalosToolDefinition<never>>): unknown[] {
    if (tools.length === 0) return []
    return [{
        functionDeclarations: tools.map((tool) => ({
            name: tool.name,
            description: tool.description,
            parameters: schemaOf(tool),
        })),
    }]
}

export type TalosToolArguments =
    | { ok: true; value: unknown }
    | { ok: false; error: string }

/**
 * Arguments arrive as a JSON string (OpenAI family) or as an object
 * (Anthropic). Both are validated against the same schema, and a failure is a
 * VALUE, not an exception: the message goes back to the model as a tool result
 * so it can correct itself, which is the difference between an agent that
 * recovers and one that derails.
 */
export function parseTalosToolCallArguments(
    tool: TalosToolDefinition<never>,
    raw: unknown,
): TalosToolArguments {
    let candidate: unknown = raw
    if (typeof raw === 'string') {
        const text = raw.trim()
        try {
            candidate = text === '' ? {} : JSON.parse(text)
        } catch {
            return { ok: false, error: 'The arguments were not valid JSON. Send a single JSON object.' }
        }
    }
    const parsed = tool.input.safeParse(candidate)
    if (parsed.success) return { ok: true, value: parsed.data }
    const detail = parsed.error.issues
        .map((issue) => `${issue.path.join('.') || '(root)'}: ${issue.message}`)
        .join('; ')
    return { ok: false, error: `The arguments do not match the schema — ${detail}` }
}
