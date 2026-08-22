import { describe, expect, it } from 'vitest'
import type {
    TalosMobileHttpRequest,
    TalosMobileHttpTransport,
} from '@/lib/chat/httpTransport'
import { geminiAdapter } from '@/lib/chat/providers/geminiAdapter'
import { openRouterAdapter } from '@/lib/chat/providers/openAiCompatibleAdapter'

const geminiApiKey = process.env.TALOS_TEST_GEMINI_API_KEY?.trim() ?? ''
const openRouterApiKey = process.env.TALOS_TEST_OPENROUTER_API_KEY?.trim() ?? ''

const liveTransport: TalosMobileHttpTransport = {
    async request(request: TalosMobileHttpRequest) {
        const url = new URL(request.url)
        for (const [key, value] of Object.entries(request.params ?? {})) url.searchParams.set(key, value)
        const response = await fetch(url, {
            method: request.method,
            headers: request.headers,
            body: request.data === undefined ? undefined : JSON.stringify(request.data),
        })
        const text = await response.text()
        let data: unknown = text
        try {
            data = text ? JSON.parse(text) : null
        } catch {
            // Provider error handling receives the original non-JSON response.
        }
        return { status: response.status, data }
    },
}

describe.skipIf(!geminiApiKey)('Gemini real upstream', () => {
    it('discovers the live catalog and completes one minimal chat turn', async () => {
        const catalog = await geminiAdapter.listModels({ apiKey: geminiApiKey }, liveTransport)
        const model = catalog.models.find((candidate) =>
            candidate.chatCompatibility === 'supported' && candidate.id.includes('flash'),
        ) ?? catalog.models.find((candidate) => candidate.chatCompatibility === 'supported')

        expect(catalog.models.length).toBeGreaterThan(0)
        expect(model).toBeDefined()
        const result = await geminiAdapter.complete({
            model: model!,
            turns: [{ role: 'user', content: 'Reply with exactly TALOS_OK.' }],
            effort: 'off',
            thinking: false,
        }, { apiKey: geminiApiKey }, liveTransport)
        expect(result.text.trim()).toContain('TALOS_OK')
    }, 45_000)
})

describe.skipIf(!openRouterApiKey)('OpenRouter real upstream', () => {
    it('discovers the live catalog and completes one free routed chat turn', async () => {
        const catalog = await openRouterAdapter.listModels({ apiKey: openRouterApiKey }, liveTransport)
        const model = catalog.models.find((candidate) => candidate.id === 'openrouter/free')
            ?? catalog.models.find((candidate) => candidate.id.endsWith(':free') && candidate.chatCompatibility !== 'unsupported')
        expect(catalog.models.length).toBeGreaterThan(0)
        expect(catalog.models.every((model) => model.provider === 'openrouter')).toBe(true)
        expect(JSON.stringify(catalog)).not.toContain(openRouterApiKey)
        expect(model).toBeDefined()

        const result = await openRouterAdapter.complete({
            model: model!,
            turns: [{ role: 'user', content: 'Reply with exactly TALOS_OK.' }],
            effort: 'off',
            thinking: false,
        }, { apiKey: openRouterApiKey }, liveTransport)
        expect(result.text.trim()).toContain('TALOS_OK')
    }, 60_000)
})
