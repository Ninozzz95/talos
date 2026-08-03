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
    /**
     * A stable code for WHY it failed — for the diagnostics trace, never for
     * the model. Codes travel; sentences get rewritten.
     */
    code?: string | null
    /**
     * Something for the model to LOOK at, not read.
     *
     * Not inside the tool result: Anthropic accepts image blocks there, OpenAI
     * only in the Responses API (which is not the one TALOS speaks), Gemini and
     * Ollama not at all. Every provider does accept an image on a USER turn —
     * the path attachments already use — so the loop hands these over as parts
     * after the results, and all four adapters translate them unchanged.
     */
    images?: import('@/lib/chat/attachmentContracts').TalosMobileImageInputPart[]
    /** Vault bindings to persist on the final assistant message. */
    messageAttachments?: import('@/repositories/chatRepository').AppendChatAttachmentInput[]
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
    /**
     * Complete capability set for compound tools. `action` remains the stable
     * primary activity label; legacy tools omit this field and require only it.
     */
    requiredActions?: readonly TalosToolAction[]
    action: TalosToolAction
    /**
     * `always` is a hard per-call confirmation boundary. It ignores baseline
     * allow and saved grants; deny and disabled state still win.
     */
    confirmation?: 'policy' | 'always'
    input: ZodType<Input>
    run(input: Input, context: TalosToolContext): Promise<TalosToolResult>
}

export function defineTalosTool<Input>(definition: TalosToolDefinition<Input>): TalosToolDefinition<Input> {
    return definition
}

/**
 * One canonical permission view for schema offering, execution and audit.
 *
 * Always retain the primary action even if a malformed compound declaration
 * omits it, and remove duplicates without changing declaration order.
 */
export function talosToolRequiredActions(
    tool: Pick<TalosToolDefinition<never>, 'action' | 'requiredActions'>,
): TalosToolAction[] {
    const actions: TalosToolAction[] = [tool.action]
    for (const action of tool.requiredActions ?? []) {
        if (!actions.includes(action)) actions.push(action)
    }
    return actions
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
    /**
     * A top-level union loses its `type`, and Anthropic refuses the whole call.
     *
     * Owner 2026-08-03, verbatim from the device:
     * `tools.4.custom.input_schema.type: Field required` — HTTP 400, every send
     * to Anthropic, not just the one that wanted the tool. `z.discriminatedUnion`
     * emits `{oneOf: [...]}` with no `type` of its own, which is correct JSON
     * Schema and unacceptable to a provider that requires the key.
     *
     * Saying `type: 'object'` here is not a guess: every branch of those unions
     * IS an object, and the tool-calling contract of all four providers takes an
     * object and nothing else. It is written down rather than assumed, and the
     * gate in registry.test.ts fails if a tool ever advertises otherwise.
     */
    if (typeof schema.type !== 'string') return { type: 'object', ...schema }
    return schema
}

/**
 * La stessa cosa, PIATTA — la forma che vuole `/v1/responses`.
 *
 * `name`, `description` e `parameters` accanto a `type: "function"`, non
 * annidati. Sta qui e non nel modulo dell'endpoint perche' deve passare dallo
 * STESSO `schemaOf`: e' li' che uno schema senza `type` viene normalizzato, e
 * due normalizzazioni diverse sarebbero due descrizioni dello stesso tool a
 * seconda di quale endpoint lo riceve.
 */
export function talosToolsForOpenAiResponses(
    tools: ReadonlyArray<TalosToolDefinition<never>>,
): unknown[] {
    return tools.map((tool) => ({
        type: 'function',
        name: tool.name,
        description: tool.description,
        parameters: schemaOf(tool),
    }))
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

/**
 * Gemini reads an OpenAPI SUBSET, and `const` is not in it.
 *
 * Owner 2026-07-27, verbatim from the wire: `Unknown name "const" at
 * 'tools[0].function_declarations[8].parameters…one_of[0].properties[0].value'`
 * — the whole call refused. `const` arrives from every `z.literal()`, which is
 * how a discriminated union names its discriminator, so the first tool with one
 * broke Gemini for the entire suite.
 *
 * Rewritten, not dropped: a one-value `enum` says exactly what `const` said,
 * and Gemini accepts it. Dropping the discriminator would trade a 400 for a
 * schema that no longer tells the model which block is which.
 */
function forGeminiDialect(node: unknown): unknown {
    if (Array.isArray(node)) return node.map(forGeminiDialect)
    if (node === null || typeof node !== 'object') return node
    const out: Record<string, unknown> = {}
    for (const [key, value] of Object.entries(node)) {
        if (key === 'const') {
            /**
             * Owner 2026-07-30, live on the wire, the same bug one layer down:
             *
             *   Invalid value at '…enum[0]' (TYPE_STRING), 1
             *
             * Gemini's `enum` accepts STRINGS only. Rewriting every `const` to a
             * one-value enum fixed the string discriminators and broke the
             * numeric ones — `document_create` types a heading level as
             * `z.union([z.literal(1), z.literal(2), z.literal(3)])`, and each
             * became `enum: [1]`, which kills the whole call.
             *
             * A non-string literal keeps its meaning through `type` instead. The
             * exact value is lost, which is the honest trade: Gemini has nowhere
             * to put it, and saying "an integer" is true where `enum: [1]` was
             * simply refused.
             */
            if (typeof value === 'string') {
                out.enum = [value]
            } else if (typeof value === 'number') {
                out.type = Number.isInteger(value) ? 'integer' : 'number'
            } else if (typeof value === 'boolean') {
                out.type = 'boolean'
            }
            // null and anything else: no faithful representation exists, so the
            // key is dropped rather than turned into something untrue.
            continue
        }
        if (key === 'oneOf') {
            /**
             * `anyOf` is the one Gemini documents; `oneOf` is a maybe.
             *
             * The 400 the owner hit walked THROUGH `one_of` to complain about
             * `const`, which suggests it parsed — but "suggests" is not a thing
             * to ship to a distributed app. For a discriminated union the two
             * are interchangeable in practice: the branches are distinguished
             * by their discriminator enum, not by the exclusivity rule. So this
             * costs nothing and removes the doubt.
             */
            out.anyOf = forGeminiDialect(value)
            continue
        }
        out[key] = forGeminiDialect(value)
    }
    return out
}

export function talosToolsForGemini(tools: ReadonlyArray<TalosToolDefinition<never>>): unknown[] {
    if (tools.length === 0) return []
    return [{
        functionDeclarations: tools.map((tool) => ({
            name: tool.name,
            description: tool.description,
            parameters: forGeminiDialect(schemaOf(tool)),
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
