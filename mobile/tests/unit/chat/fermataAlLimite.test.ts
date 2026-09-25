import { afterEach, describe, expect, it, vi } from 'vitest'
import { anthropicAdapter } from '@/lib/chat/providers/anthropicAdapter'
import { openRouterAdapter } from '@/lib/chat/providers/openAiCompatibleAdapter'
import { geminiAdapter } from '@/lib/chat/providers/geminiAdapter'
import { ollamaAdapter } from '@/lib/chat/providers/ollamaAdapter'
import type { TalosMobileCompletionInput } from '@/lib/chat/providerContracts'
import * as traccia from '@/lib/tools/tracciaAzione'

/*
 * CONT (25/09/2026, owner «3 sì», «Nuovo messaggio «Continua»», «Solo col pulsante»). La risposta di GLM 5.3 di 45.580
 * caratteri si fermava a metà frase senza alcun segno: l'avviso «Si è fermata qui» esisteva dal 12/08, ma in STREAMING
 * nessun adattatore riportava il motivo di fine, e il controller guardava solo `'length'` (Anthropic dice `max_tokens`,
 * Gemini `MAX_TOKENS`). Dossier: `.claude/ricerche/2026-09-25-cura2-continua-dopo-il-limite-10x4.md`.
 */
function inputFor(provider: string, modelId: string): TalosMobileCompletionInput {
    return {
        model: {
            id: modelId, provider: provider as never, displayName: modelId, chatCompatibility: 'supported',
            inputModalities: ['text'], outputModalities: ['text'], supportedParameters: [],
        },
        turns: [{ role: 'user', content: 'hi' }],
        effort: 'off',
        thinking: false,
    }
}

function streamResponse(chunks: string[]): Response {
    const encoder = new TextEncoder()
    return new Response(new ReadableStream<Uint8Array>({
        start(controller) {
            for (const chunk of chunks) controller.enqueue(encoder.encode(chunk))
            controller.close()
        },
    }), { status: 200 })
}

afterEach(() => { vi.unstubAllGlobals() })

describe('CONT — lo streaming dice com’è finita la risposta', () => {
    it('CONT-01 OpenRouter/compatibili: finish_reason dell’ultimo evento', async () => {
        vi.stubGlobal('fetch', vi.fn(async () => streamResponse([
            'data: {"choices":[{"delta":{"content":"Un racconto che"},"finish_reason":null}]}\n\n',
            'data: {"choices":[{"delta":{"content":" si ferma"},"finish_reason":"length"}]}\n\ndata: [DONE]\n\n',
        ])))
        const tagliata = await openRouterAdapter.streamComplete!(inputFor('openrouter', 'z-ai/glm-5.3-flash'), { apiKey: 'k' }, { onChunk: () => {} })
        expect(tagliata.finishReason).toBe('length')

        vi.stubGlobal('fetch', vi.fn(async () => streamResponse([
            'data: {"choices":[{"delta":{"content":"Finita."},"finish_reason":"stop"}]}\n\ndata: [DONE]\n\n',
        ])))
        const finita = await openRouterAdapter.streamComplete!(inputFor('openrouter', 'z-ai/glm-5.3-flash'), { apiKey: 'k' }, { onChunk: () => {} })
        expect(finita.finishReason).toBe('stop')
    })

    it('CONT-02 Anthropic: stop_reason del message_delta', async () => {
        vi.stubGlobal('fetch', vi.fn(async () => streamResponse([
            'data: {"type":"content_block_delta","delta":{"type":"text_delta","text":"Si ferma"}}\n\n',
            'data: {"type":"message_delta","delta":{"stop_reason":"max_tokens"},"usage":{"output_tokens":9}}\n\n',
            'data: {"type":"message_stop"}\n\n',
        ])))
        const r = await anthropicAdapter.streamComplete!(inputFor('anthropic', 'claude-opus-4-8'), { apiKey: 'k' }, { onChunk: () => {} })
        expect(r.finishReason).toBe('max_tokens')
    })

    it('CONT-03 Gemini: finishReason del candidato', async () => {
        vi.stubGlobal('fetch', vi.fn(async () => streamResponse([
            'data: {"candidates":[{"content":{"parts":[{"text":"Si ferma"}]}}]}\n\n',
            'data: {"candidates":[{"content":{"parts":[{"text":" qui"}]},"finishReason":"MAX_TOKENS"}]}\n\n',
        ])))
        const r = await geminiAdapter.streamComplete!(inputFor('gemini', 'gemini-live'), { apiKey: 'k' }, { onChunk: () => {} })
        expect(r.finishReason).toBe('MAX_TOKENS')
    })

    it('CONT-04 Ollama: done_reason dell’ultima riga', async () => {
        vi.stubGlobal('fetch', vi.fn(async () => streamResponse([
            '{"message":{"content":"Si ferma"},"done":false}\n',
            '{"message":{"content":" qui"},"done":true,"done_reason":"length"}\n',
        ])))
        const r = await ollamaAdapter.streamComplete!(inputFor('ollama', 'gemma3:4b'), { endpoint: 'http://127.0.0.1:11434' }, { onChunk: () => {} })
        expect(r.finishReason).toBe('length')
    })

    it('CONT-05 un nome solo per «fermata dalla lunghezza», qualunque sia il fornitore', () => {
        const fermata = (traccia as unknown as { talosFermataDallaLunghezza?: (r: unknown) => boolean }).talosFermataDallaLunghezza
        expect(typeof fermata).toBe('function')
        for (const motivo of ['length', 'max_tokens', 'MAX_TOKENS']) expect(fermata!(motivo)).toBe(true)
        for (const motivo of ['stop', 'end_turn', 'STOP', 'tool_calls', 'tool_use', 'content_filter', null, undefined, '']) {
            expect(fermata!(motivo)).toBe(false)
        }
    })
})
