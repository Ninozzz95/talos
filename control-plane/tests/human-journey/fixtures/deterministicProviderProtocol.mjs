import { createHash } from 'node:crypto'
import { z } from 'zod'

export const MAX_PROVIDER_REQUEST_BYTES = 262_144

const identifier = z.string().min(1).max(128).regex(/^[A-Za-z0-9][A-Za-z0-9._:-]*$/)
const contentText = z.string().max(131_072)
const toolArguments = z.string().min(2).max(262_144)

const functionToolCallSchema = z.object({
    id: identifier,
    type: z.literal('function'),
    function: z.object({
        name: z.string().min(1).max(64).regex(/^[A-Za-z0-9_-]+$/),
        arguments: toolArguments,
    }).strict(),
}).strict()

const textMessageSchema = z.object({
    role: z.enum(['system', 'developer', 'user']),
    content: contentText,
    name: z.string().min(1).max(64).optional(),
}).strict()

const assistantMessageSchema = z.object({
    role: z.literal('assistant'),
    content: contentText.nullable(),
    tool_calls: z.array(functionToolCallSchema).min(1).max(8).optional(),
    reasoning_content: contentText.optional(),
}).strict().superRefine((message, context) => {
    if ((message.content === null || message.content.trim() === '') && message.tool_calls === undefined) {
        context.addIssue({ code: 'custom', message: 'Assistant message requires content or tool calls.' })
    }
})

const toolMessageSchema = z.object({
    role: z.literal('tool'),
    tool_call_id: identifier,
    content: z.string().min(2).max(262_144),
}).strict()

const canonicalToolResultSchema = z.object({
    schema_version: z.literal('talos_tool_result_v1'),
    tool_use_id: identifier,
    isError: z.boolean(),
    content: z.array(z.object({
        type: z.enum(['text', 'image', 'audio', 'resource_link', 'resource']),
    }).passthrough()).max(64),
    structuredContent: z.record(z.string(), z.unknown()).nullable(),
    evidence: z.array(z.object({
        artifact_id: z.string().min(1).max(256),
        kind: z.string().min(1).max(128),
        sha256: z.string().regex(/^sha256:[a-f0-9]{64}$/),
        trusted_boundary: z.string().min(1).max(128),
    }).strict()).max(128),
}).strict()

const providerToolSchema = z.object({
    type: z.literal('function'),
    function: z.object({
        name: z.string().min(1).max(64).regex(/^[A-Za-z0-9_-]+$/),
        description: z.string().max(4_096).optional(),
        parameters: z.record(z.string(), z.unknown()),
    }).strict(),
}).strict()

const providerRequestSchema = z.object({
    model: z.string().min(1).max(256),
    messages: z.array(z.union([textMessageSchema, assistantMessageSchema, toolMessageSchema])).min(1).max(128),
    tools: z.array(providerToolSchema).max(64).default([]),
    tool_choice: z.literal('auto').optional(),
    max_tokens: z.number().int().min(1).max(1_000_000).optional(),
    temperature: z.number().min(0).max(2).optional(),
    stream: z.literal(false).optional(),
}).strict().superRefine((request, context) => {
    if (request.tools.length === 0 && request.tool_choice !== undefined) {
        context.addIssue({
            code: 'custom',
            path: ['tool_choice'],
            message: 'Tool choice requires at least one declared tool.',
        })
    }

    const declared = new Set()
    for (const [index, tool] of request.tools.entries()) {
        const name = tool.function.name
        if (declared.has(name)) {
            context.addIssue({ code: 'custom', path: ['tools', index, 'function', 'name'], message: 'Tool names must be unique.' })
        }
        declared.add(name)
    }

    const pending = new Map()
    const seenCallIds = new Set()
    for (const [messageIndex, message] of request.messages.entries()) {
        if (message.role === 'assistant' && message.tool_calls !== undefined) {
            for (const [callIndex, call] of message.tool_calls.entries()) {
                if (seenCallIds.has(call.id)) {
                    context.addIssue({
                        code: 'custom',
                        path: ['messages', messageIndex, 'tool_calls', callIndex, 'id'],
                        message: 'Tool call IDs must be unique.',
                    })
                }
                seenCallIds.add(call.id)
                pending.set(call.id, call.function.name)
                if (!declared.has(call.function.name)) {
                    context.addIssue({
                        code: 'custom',
                        path: ['messages', messageIndex, 'tool_calls', callIndex, 'function', 'name'],
                        message: 'Assistant tool call must use a declared tool.',
                    })
                }
                try {
                    const parsed = JSON.parse(call.function.arguments)
                    if (!isObject(parsed)) throw new Error('not-object')
                } catch {
                    context.addIssue({
                        code: 'custom',
                        path: ['messages', messageIndex, 'tool_calls', callIndex, 'function', 'arguments'],
                        message: 'Tool arguments must encode a JSON object.',
                    })
                }
            }
            continue
        }

        if (message.role === 'tool') {
            if (!pending.has(message.tool_call_id)) {
                context.addIssue({
                    code: 'custom',
                    path: ['messages', messageIndex, 'tool_call_id'],
                    message: 'Tool result must match a prior unresolved assistant call.',
                })
            } else {
                pending.delete(message.tool_call_id)
            }
            try {
                const parsed = canonicalToolResultSchema.parse(JSON.parse(message.content))
                if (parsed.tool_use_id !== message.tool_call_id) throw new Error('mismatch')
            } catch {
                context.addIssue({
                    code: 'custom',
                    path: ['messages', messageIndex, 'content'],
                    message: 'Tool result content must be canonical JSON for the matching call.',
                })
            }
        }
    }
})

const ALLOWED_TOOLS = new Set([
    'browser_navigate',
    'browser_snapshot',
    'browser_read',
    'browser_take_screenshot',
    'browser_click',
])
const ALLOWED_FAULTS = new Set(['http_503_once', 'malformed_json_once'])
const TALOS_CONVERSATION_PREFIX = 'TALOS_CONVERSATION_CONTEXT:\n'
const TALOS_CURRENT_TASK_MARKER = '\n\nCURRENT_USER_TASK:\n'
const TALOS_TOOL_REGISTRY_MARKER = '\n\nAuthorized TALOS tool registry:\n'

class ProviderFixtureError extends Error {
    constructor(message, status = 422, code = 'TALOS_HJ_PROVIDER_REQUEST_INVALID') {
        super(message)
        this.name = 'ProviderFixtureError'
        this.status = status
        this.code = code
    }
}

export function parseProviderRequest(value) {
    const result = providerRequestSchema.safeParse(value)
    if (!result.success) {
        throw new ProviderFixtureError('Provider fixture request failed schema validation.')
    }
    return result.data
}

export class DeterministicProviderProtocol {
    #expectedPrefix = null
    #fault = null

    armFault(name) {
        if (!ALLOWED_FAULTS.has(name)) {
            throw new ProviderFixtureError('Unknown provider fixture fault.', 422, 'TALOS_HJ_PROVIDER_FAULT_UNKNOWN')
        }
        if (this.#fault !== null) {
            throw new ProviderFixtureError('A provider fixture fault is already armed.', 409, 'TALOS_HJ_PROVIDER_FAULT_ALREADY_ARMED')
        }
        this.#fault = name
    }

    reset() {
        this.#expectedPrefix = null
        this.#fault = null
    }

    respond(value) {
        const request = parseProviderRequest(value)
        if (this.#fault !== null) {
            const name = this.#fault
            this.#fault = null
            return { kind: 'fixture_fault', name, request }
        }

        if (this.#expectedPrefix !== null && !hasExactPrefix(request.messages, this.#expectedPrefix)) {
            throw new ProviderFixtureError(
                'Provider continuation omitted or reordered prior context.',
                409,
                'TALOS_HJ_PROVIDER_CONTEXT_INCOMPLETE',
            )
        }

        const response = buildResponse(request)
        const message = response.choices[0].message
        this.#expectedPrefix = Array.isArray(message.tool_calls) && message.tool_calls.length > 0
            ? [...request.messages, message]
            : null
        return { kind: 'response', request, response }
    }
}

function buildResponse(request) {
    const decision = decide(request)
    const responseId = `chatcmpl-hj-${digest({ request, decision }).slice(0, 24)}`
    const message = decision.kind === 'tool_call'
        ? {
            role: 'assistant',
            content: null,
            tool_calls: [{
                id: `call_hj_${digest({ messages: request.messages, name: decision.name, arguments: decision.arguments }).slice(0, 24)}`,
                type: 'function',
                function: {
                    name: decision.name,
                    arguments: JSON.stringify(decision.arguments),
                },
            }],
        }
        : { role: 'assistant', content: decision.content }

    return {
        id: responseId,
        object: 'chat.completion',
        created: 0,
        model: request.model,
        choices: [{
            index: 0,
            message,
            logprobs: null,
            finish_reason: decision.kind === 'tool_call' ? 'tool_calls' : 'stop',
        }],
        usage: deterministicUsage(request, message),
    }
}

function decide(request) {
    const declared = new Set(request.tools.map((tool) => tool.function.name))
    const userEnvelope = latestUserEnvelope(request.messages)
    const userText = userEnvelope.currentTask
    const results = collectToolResults(request.messages)
    const navigateResults = results.filter((result) => result.name === 'browser_navigate')
    const snapshotResults = results.filter((result) => result.name === 'browser_snapshot')
    const readResults = results.filter((result) => result.name === 'browser_read')
    const screenshotResults = results.filter((result) => result.name === 'browser_take_screenshot')
    const clickResults = results.filter((result) => result.name === 'browser_click')
    const latestResult = results.at(-1)
    const targetUrl = extractHttpUrl(userText)
        ?? (isContextualRetry(userText)
            ? latestPriorUserHttpUrl(request.messages, userEnvelope.priorUserTurns)
            : null)
    const wantsScreenshot = /\b(?:screen(?:shot)?|schermata|cattura)\b/i.test(userText)
    const wantsClick = /\b(?:cookie|modale|nascond|accett|clic|click)\w*/i.test(userText)
    const wantsRead = /\b(?:leggi|read)\b/i.test(userText)

    if (latestResult?.isError === true) {
        return final('L\'operazione browser non ha prodotto evidenza verificata; nessun contenuto della pagina viene dichiarato.')
    }

    if (targetUrl !== null && navigateResults.length === 0) {
        return call(declared, 'browser_navigate', { url: targetUrl })
    }

    if (wantsScreenshot && screenshotResults.length === 0 && targetUrl === null && results.length === 0) {
        return call(declared, 'browser_take_screenshot', {})
    }

    if (wantsClick && snapshotResults.length === 0) {
        return call(declared, 'browser_snapshot', {})
    }

    if (navigateResults.length > 0 && snapshotResults.length === 0) {
        return call(declared, 'browser_snapshot', {})
    }

    if (snapshotResults.length > 0 && wantsClick && clickResults.length === 0) {
        const target = findSemanticTarget(snapshotResults.at(-1)?.structuredContent, /accept cookies|accetta|cookie/i)
        if (target === null) {
            return final('La pagina e verificata, ma il controllo cookie richiesto non e presente nello snapshot corrente.')
        }
        return call(declared, 'browser_click', { target: target.ref, element: target.name })
    }

    if (clickResults.length > 0 && snapshotResults.length < 2) {
        return call(declared, 'browser_snapshot', {})
    }

    if (snapshotResults.length > 0 && wantsScreenshot && screenshotResults.length === 0) {
        return call(declared, 'browser_take_screenshot', {})
    }

    if (snapshotResults.length > 0 && wantsRead && readResults.length === 0) {
        return call(declared, 'browser_read', { query: readQuery(userText) })
    }

    if (screenshotResults.length > 0) {
        const screenshot = screenshotResults.at(-1)
        const evidence = screenshot?.evidence ?? []
        const evidenceIds = new Set(Array.isArray(screenshot?.structuredContent?.evidence_ids)
            ? screenshot.structuredContent.evidence_ids.filter((value) => typeof value === 'string')
            : [])
        const verified = evidence.find((item) => isObject(item)
            && typeof item.artifact_id === 'string'
            && item.kind === 'screenshot'
            && evidenceIds.has(item.artifact_id))
        if (verified === undefined) {
            return final('Screenshot non confermato: il risultato non contiene evidenza TALOS persistita.')
        }
        return final(`Screenshot verificato e associato all\'evidenza TALOS ${verified.artifact_id}.`)
    }

    const grounding = [...readResults, ...snapshotResults].at(-1)
    if (grounding !== undefined) {
        const title = boundedText(grounding.structuredContent?.title, 'pagina controllata')
        const digestText = boundedText(
            grounding.structuredContent?.text_digest,
            boundedText(grounding.structuredContent?.matches?.[0]?.name, 'contenuto accessibile disponibile'),
        )
        return final(`Evidenza browser verificata. Titolo: ${title}. Contenuto visibile: ${digestText}.`)
    }

    if (targetUrl === null && results.length === 0 && /\b(?:pagina|browser|navig|web|cosa vedi)\b/i.test(userText)) {
        return call(declared, 'browser_snapshot', {})
    }

    return final('Fixture TALOS pronta. Non e stata dichiarata alcuna osservazione browser senza evidenza.')
}

function collectToolResults(messages) {
    const calls = new Map()
    const results = []
    for (const message of messages) {
        if (message.role === 'assistant') {
            for (const toolCall of message.tool_calls ?? []) calls.set(toolCall.id, toolCall.function.name)
            continue
        }
        if (message.role !== 'tool') continue
        const value = JSON.parse(message.content)
        results.push({
            name: calls.get(message.tool_call_id),
            isError: value.isError === true,
            structuredContent: isObject(value.structuredContent) ? value.structuredContent : {},
            evidence: Array.isArray(value.evidence) ? value.evidence : [],
        })
    }
    return results
}

function call(declared, name, args) {
    if (!ALLOWED_TOOLS.has(name)) {
        throw new ProviderFixtureError(
            `Required fixture tool is unknown: ${name}.`,
            422,
            'TALOS_HJ_PROVIDER_TOOL_UNDECLARED',
        )
    }
    if (declared.size === 0) {
        return final('Browse non e attivo per questo turno. Abilita Browse e riprova.')
    }
    if (!declared.has(name)) {
        throw new ProviderFixtureError(
            `Required fixture tool is not declared: ${name}.`,
            422,
            'TALOS_HJ_PROVIDER_TOOL_UNDECLARED',
        )
    }
    return { kind: 'tool_call', name, arguments: args }
}

function final(content) {
    return { kind: 'final', content }
}

function findSemanticTarget(structuredContent, pattern) {
    if (!isObject(structuredContent) || !Array.isArray(structuredContent.nodes)) return null
    for (const node of structuredContent.nodes) {
        if (!isObject(node) || typeof node.ref !== 'string' || typeof node.name !== 'string') continue
        if (/^r[0-9]+$/.test(node.ref) && pattern.test(node.name)) return { ref: node.ref, name: node.name }
    }
    return null
}

function latestUserEnvelope(messages) {
    for (let index = messages.length - 1; index >= 0; index -= 1) {
        if (messages[index].role === 'user') return parseTalosConversationEnvelope(messages[index].content)
    }
    return { currentTask: '', priorUserTurns: [] }
}

function parseTalosConversationEnvelope(text) {
    const corePrompt = text.startsWith('User: ') ? text.slice('User: '.length) : text
    const markerIndex = corePrompt.lastIndexOf(TALOS_CURRENT_TASK_MARKER)
    if (!corePrompt.startsWith(TALOS_CONVERSATION_PREFIX) || markerIndex < TALOS_CONVERSATION_PREFIX.length) {
        return {
            currentTask: corePrompt.split(TALOS_TOOL_REGISTRY_MARKER, 1)[0].trim(),
            priorUserTurns: [],
        }
    }

    const history = corePrompt.slice(TALOS_CONVERSATION_PREFIX.length, markerIndex)
    const currentWithRegistry = corePrompt.slice(markerIndex + TALOS_CURRENT_TASK_MARKER.length)
    const priorUserTurns = history.split('\n').flatMap((line) => {
        const match = /^\[user\] (.*)$/u.exec(line)
        return match === null ? [] : [match[1]]
    })

    return {
        currentTask: currentWithRegistry.split(TALOS_TOOL_REGISTRY_MARKER, 1)[0].trim(),
        priorUserTurns,
    }
}

function latestPriorUserHttpUrl(messages, embeddedPriorUserTurns = []) {
    for (let index = embeddedPriorUserTurns.length - 1; index >= 0; index -= 1) {
        const candidate = extractHttpUrl(embeddedPriorUserTurns[index])
        if (candidate !== null) return candidate
    }

    let latestUserSkipped = false
    for (let index = messages.length - 1; index >= 0; index -= 1) {
        const message = messages[index]
        if (message.role !== 'user') continue
        if (!latestUserSkipped) {
            latestUserSkipped = true
            continue
        }
        const candidate = extractHttpUrl(parseTalosConversationEnvelope(message.content).currentTask)
        if (candidate !== null) return candidate
    }
    return null
}

function isContextualRetry(text) {
    const normalized = text.normalize('NFC').trim().replace(/\s+/gu, ' ')
    return /^(?:(?:per favore|please)(?:,\s*|\s+))?(?:(?:puoi|potresti|riesci a|can you|could you)\s+)?(?:riprova(?:re)?|ritenta(?:re)?|prova(?:re)? ancora|retry|try again)(?:\s+[\p{L}\p{M}\p{N}_'’-]+){0,12}[.!?]?$/iu.test(normalized)
}

function extractHttpUrl(text) {
    const match = text.match(/https?:\/\/[^\s<>"']+/i)
    if (match === null) return null
    const candidate = match[0].replace(/[),.!?;:]+$/g, '')
    try {
        const url = new URL(candidate)
        if (!['http:', 'https:'].includes(url.protocol) || url.username !== '' || url.password !== '') return null
        return url.toString()
    } catch {
        return null
    }
}

function readQuery(text) {
    const match = text.match(/\b(?:leggi|read)\s+([\p{L}\p{N}_-]+)/iu)
    return match?.[1]?.slice(0, 512) ?? 'contenuto visibile'
}

function hasExactPrefix(messages, expectedPrefix) {
    if (messages.length < expectedPrefix.length) return false
    return expectedPrefix.every((message, index) => canonical(message) === canonical(messages[index]))
}

function deterministicUsage(request, message) {
    const promptTokens = Math.max(1, Math.ceil(Buffer.byteLength(JSON.stringify(request.messages), 'utf8') / 4))
    const completionTokens = Math.max(1, Math.ceil(Buffer.byteLength(JSON.stringify(message), 'utf8') / 4))
    return { prompt_tokens: promptTokens, completion_tokens: completionTokens, total_tokens: promptTokens + completionTokens }
}

function digest(value) {
    return createHash('sha256').update(canonical(value)).digest('hex')
}

function canonical(value) {
    if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`
    if (isObject(value)) {
        return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`
    }
    return JSON.stringify(value)
}

function boundedText(value, fallback) {
    return typeof value === 'string' && value.trim() !== '' ? value.trim().slice(0, 512) : fallback
}

function isObject(value) {
    return typeof value === 'object' && value !== null && !Array.isArray(value)
}
