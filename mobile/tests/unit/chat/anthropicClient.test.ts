import { describe, expect, it, vi } from 'vitest'
import {
    ANTHROPIC_MESSAGES_URL,
    ANTHROPIC_VERSION,
    AnthropicChatError,
    buildAnthropicRequest,
    parseAnthropicResponse,
    sendAnthropicChat,
    type HttpTransport,
} from '@/lib/chat/anthropicClient'

describe('buildAnthropicRequest', () => {
    it('targets the messages endpoint with the required auth + version headers', () => {
        const req = buildAnthropicRequest('sk-key-123', {
            model: 'claude-opus-4-8',
            turns: [{ role: 'user', content: 'hi' }],
        })
        expect(req.url).toBe(ANTHROPIC_MESSAGES_URL)
        expect(req.headers['x-api-key']).toBe('sk-key-123')
        expect(req.headers['anthropic-version']).toBe(ANTHROPIC_VERSION)
        expect(req.headers['content-type']).toBe('application/json')
    })

    it('maps turns + system into the body, and imposes no temperature', () => {
        const req = buildAnthropicRequest('k', {
            model: 'claude-sonnet-5',
            system: 'You are TALOS.',
            turns: [
                { role: 'user', content: 'a' },
                { role: 'assistant', content: 'b' },
                { role: 'user', content: 'c' },
            ],
        })
        expect(req.body.model).toBe('claude-sonnet-5')
        expect(req.body.system).toBe('You are TALOS.')
        expect(req.body.messages).toEqual([
            { role: 'user', content: 'a' },
            { role: 'assistant', content: 'b' },
            { role: 'user', content: 'c' },
        ])
        expect(req.body.max_tokens).toBeGreaterThan(0)
        // Owner 2026-07-27: claude-opus-5 answers HTTP 400 to `temperature`.
        // It is optional, TALOS has no control for it, and the value sent was
        // one I invented — so it is not sent at all.
        expect(req.body).not.toHaveProperty('temperature')
        expect(req.body).not.toHaveProperty('thinking')
    })

    it('omits an empty system prompt', () => {
        const req = buildAnthropicRequest('k', { model: 'm', system: '   ', turns: [{ role: 'user', content: 'x' }] })
        expect(req.body).not.toHaveProperty('system')
    })

    it('enables extended thinking with a budget below max_tokens', () => {
        const req = buildAnthropicRequest('k', {
            model: 'claude-opus-4-8',
            turns: [{ role: 'user', content: 'hard' }],
            effort: 'high',
            thinking: true,
            // Named, because there are two shapes now and only this one
            // reserves headroom for a budget.
            thinkingMode: 'enabled',
        })
        expect(req.body.thinking).toEqual({ type: 'enabled', budget_tokens: 24576 })
        expect(req.body.max_tokens as number).toBeGreaterThan(24576)
        expect(req.body).not.toHaveProperty('temperature')
    })

    it('does not enable thinking when effort is off even if the toggle is on', () => {
        const req = buildAnthropicRequest('k', {
            model: 'm',
            turns: [{ role: 'user', content: 'x' }],
            effort: 'off',
            thinking: true,
        })
        expect(req.body).not.toHaveProperty('thinking')
    })
})

describe('parseAnthropicResponse', () => {
    it('concatenates text blocks and ignores non-text (thinking) blocks', () => {
        const text = parseAnthropicResponse(200, {
            content: [
                { type: 'thinking', thinking: 'hmm' },
                { type: 'text', text: 'Hello ' },
                { type: 'text', text: 'world' },
            ],
        })
        expect(text).toBe('Hello world')
    })

    it('throws AnthropicChatError with the API message on a non-2xx status', () => {
        expect(() => parseAnthropicResponse(401, { error: { message: 'invalid x-api-key' } }))
            .toThrowError(/invalid x-api-key/)
    })

    it('throws when the response carries no text', () => {
        expect(() => parseAnthropicResponse(200, { content: [] })).toThrow(AnthropicChatError)
    })

    it('throws on a malformed body', () => {
        expect(() => parseAnthropicResponse(200, { nope: true })).toThrow(AnthropicChatError)
    })
})

describe('sendAnthropicChat', () => {
    it('posts the built request through the transport and returns the assistant text', async () => {
        const post = vi.fn().mockResolvedValue({ status: 200, data: { content: [{ type: 'text', text: 'pong' }] } })
        const transport: HttpTransport = { post }
        const out = await sendAnthropicChat('k', { model: 'm', turns: [{ role: 'user', content: 'ping' }] }, transport)
        expect(out).toBe('pong')
        expect(post).toHaveBeenCalledOnce()
        const arg = post.mock.calls[0][0]
        expect(arg.url).toBe(ANTHROPIC_MESSAGES_URL)
        expect(arg.headers['x-api-key']).toBe('k')
        expect(arg.data.messages).toEqual([{ role: 'user', content: 'ping' }])
    })

    it('propagates a transport-level error as an AnthropicChatError', async () => {
        const transport: HttpTransport = { post: vi.fn().mockResolvedValue({ status: 500, data: { error: { message: 'overloaded' } } }) }
        await expect(sendAnthropicChat('k', { model: 'm', turns: [{ role: 'user', content: 'x' }] }, transport))
            .rejects.toThrow(/overloaded/)
    })
})

describe('extended thinking alongside tools', () => {
    const tools = [{ name: 'library_search', description: 'x', input_schema: { type: 'object' } }]

    it('thinks freely on the first round, where there is no tool result yet', () => {
        const request = buildAnthropicRequest('k', {
            model: 'claude-opus-4-8',
            turns: [{ role: 'user', content: 'quanto devo?' }],
            thinking: true,
            effort: 'high',
            thinkingMode: 'enabled',
            tools,
        })
        expect(request.body.thinking).toMatchObject({ type: 'enabled' })
    })

    it('stops asking to think once a tool result is in the history, instead of 400ing', () => {
        // Anthropic requires the COMPLETE, signed thinking blocks to be replayed
        // on an assistant turn that precedes a tool_result. We do not capture the
        // signature (the reasoning channel is a flat string), so replaying is
        // impossible — and sending the turn without them is a documented 400.
        // Every Anthropic model advertises `thinking`, and the composer toggle is
        // one tap away, so this was a guaranteed failure on round two of any
        // tool-using conversation.
        const request = buildAnthropicRequest('k', {
            model: 'claude-opus-4-8',
            turns: [
                { role: 'user', content: 'quanto devo?' },
                {
                    role: 'assistant',
                    content: 'Guardo.',
                    toolCalls: [{ id: 'tu_1', name: 'library_search', arguments: '{"query":"f"}' }],
                },
                { role: 'tool', content: 'found', toolCallId: 'tu_1', toolName: 'library_search' },
            ],
            thinking: true,
            effort: 'high',
            tools,
        })
        expect(request.body.thinking).toBeUndefined()
    })

    /*
     * ⛔⛔ E IL VERSO OPPOSTO, che è il difetto che il restringimento evita —
     * 2026-08-13.
     *
     * Da oggi la storia riconsegna anche le chiamate dei messaggi PASSATI (la
     * cura per cui TALOS diceva «Messaggio inviato» senza aver chiamato niente,
     * vedi `storiaConLeChiamate.ts`). Con la vecchia condizione `some()`, una
     * sessione che ha usato un tool **una volta** avrebbe perso il ragionamento
     * **per sempre**: ogni messaggio successivo porta un risultato in mezzo
     * alla storia, e il pensiero sarebbe stato spento a vita.
     *
     * L'API pretende i blocchi firmati solo sull'assistente che precede
     * IMMEDIATAMENTE un risultato — cioè quando l'ULTIMO turno è un risultato.
     */
    it('continua a pensare quando il risultato è STORIA, non la domanda di adesso', () => {
        const request = buildAnthropicRequest('k', {
            model: 'claude-opus-4-8',
            turns: [
                { role: 'user', content: 'manda un whatsapp che dice occhio aperto' },
                {
                    role: 'assistant',
                    content: 'Messaggio inviato.',
                    toolCalls: [{ id: 'tu_1', name: 'app_azione', arguments: '{}' }],
                },
                { role: 'tool', content: 'ok', toolCallId: 'tu_1', toolName: 'app_azione' },
                { role: 'user', content: 'manda un whatsapp che dice occhio spento' },
            ],
            thinking: true,
            effort: 'high',
            thinkingMode: 'enabled',
            tools,
        })
        expect(request.body.thinking).toEqual({ type: 'enabled', budget_tokens: 24576 })
    })

    it('batches a round of results into ONE user message, as the protocol describes', () => {
        const request = buildAnthropicRequest('k', {
            model: 'claude-opus-4-8',
            turns: [
                { role: 'user', content: 'q' },
                {
                    role: 'assistant',
                    content: '',
                    toolCalls: [
                        { id: 'tu_1', name: 'a', arguments: '{}' },
                        { id: 'tu_2', name: 'b', arguments: '{}' },
                    ],
                },
                { role: 'tool', content: 'ra', toolCallId: 'tu_1', toolName: 'a' },
                { role: 'tool', content: 'rb', toolCallId: 'tu_2', toolName: 'b' },
            ],
            tools,
        })
        const messages = request.body.messages as Array<{ role: string; content: unknown }>
        expect(messages).toHaveLength(3)
        expect(messages[2]).toMatchObject({
            role: 'user',
            content: [
                { type: 'tool_result', tool_use_id: 'tu_1', content: 'ra' },
                { type: 'tool_result', tool_use_id: 'tu_2', content: 'rb' },
            ],
        })
    })
})

/**
 * C45-RED-19E — il tetto di risposta lo dichiara il modello.
 *
 * `DEFAULT_MAX_TOKENS = 4096` era un numero scritto a mano, e poiché nessun
 * adattatore passava mai `maxTokens` era diventato il tetto di OGNI risposta di
 * Claude — un trentaduesimo di quello che i modelli attuali reggono. Le risposte
 * lunghe si fermavano a metà frase e sembrava un limite del modello.
 */
describe('C45-RED-19E declared output ceiling', () => {
    const turns = [{ role: 'user' as const, content: 'Scrivi un saggio lungo.' }]

    it('asks for what the model declares, not the local fallback', () => {
        const request = buildAnthropicRequest('k', {
            model: 'claude-opus-5',
            turns,
            maxTokens: 128000,
        })
        expect(request.body.max_tokens).toBe(128000)
    })

    it('falls back only when nothing was declared', () => {
        const request = buildAnthropicRequest('k', { model: 'claude-opus-5', turns })
        expect(request.body.max_tokens).toBe(4096)
    })

    /**
     * Il pezzo che senza prova si romperebbe in silenzio: lo spazio per il
     * ragionamento alzava `max_tokens` con un `Math.max`, e su un modello che
     * dichiara poco quello diventerebbe una richiesta oltre il suo limite —
     * cioè un 400 a ogni messaggio invece di una risposta più corta.
     */
    it('never asks above the declared ceiling to make room for thinking', () => {
        const request = buildAnthropicRequest('k', {
            model: 'claude-haiku-4-5',
            turns,
            maxTokens: 8192,
            thinking: true,
            thinkingMode: 'enabled',
            effort: 'high',
        })
        expect(request.body.max_tokens as number).toBeLessThanOrEqual(8192)
    })

    it('still reserves thinking headroom when the model declares plenty', () => {
        const request = buildAnthropicRequest('k', {
            model: 'claude-opus-5',
            turns,
            maxTokens: 128000,
            thinking: true,
            thinkingMode: 'enabled',
            effort: 'high',
        })
        expect(request.body.max_tokens as number).toBeGreaterThan(4096)
    })
})
