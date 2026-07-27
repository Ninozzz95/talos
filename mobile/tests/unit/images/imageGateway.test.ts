import { describe, expect, it } from 'vitest'
import {
    chooseTalosImageProvider,
    parseTalosGeneratedImages,
    planTalosImageRequest,
} from '@/lib/images/imageGateway'

/**
 * Owner's own architecture sketch: chat → model → gateway → provider adapters →
 * local asset store → the image shown in chat. These cover the gateway.
 *
 * Both providers documented 2026-07-27:
 *  - https://developers.openai.com/api/docs/api-reference/images/create
 *  - https://ai.google.dev/gemini-api/docs/image-generation
 */
const KEY = { apiKey: 'sk-secret', model: 'gpt-image-1' }

describe('asking two different providers for the same picture', () => {
    it('speaks OpenAI: /images/generations, bearer, pixel size', () => {
        const plan = planTalosImageRequest('openai', { prompt: 'un gatto', shape: 'landscape' }, KEY)
        expect(plan.url).toBe('https://api.openai.com/v1/images/generations')
        expect(plan.headers.Authorization).toBe('Bearer sk-secret')
        expect(plan.body).toMatchObject({ model: 'gpt-image-1', prompt: 'un gatto', size: '1536x1024', n: 1 })
    })

    it('speaks Gemini: /interactions, key header, aspect ratio', () => {
        const plan = planTalosImageRequest(
            'gemini',
            { prompt: 'un gatto', shape: 'portrait' },
            { apiKey: 'AIza-secret', model: 'gemini-3.1-flash-image' },
        )
        expect(plan.url).toBe('https://generativelanguage.googleapis.com/v1beta/interactions')
        expect(plan.headers['x-goog-api-key']).toBe('AIza-secret')
        expect(plan.body).toMatchObject({ model: 'gemini-3.1-flash-image', input: 'un gatto' })
        expect(JSON.stringify(plan.body)).toContain('3:4')
    })

    it('never puts the key in the url', () => {
        // A url with a key in it ends up in logs, history and crash reports.
        for (const provider of ['openai', 'gemini'] as const) {
            const plan = planTalosImageRequest(provider, { prompt: 'x', shape: 'square' }, KEY)
            expect(plan.url).not.toContain('sk-secret')
            expect(plan.url).not.toContain('key=')
        }
    })

    it('asks for exactly one image', () => {
        // The model does not get to spend four times the money at will.
        const plan = planTalosImageRequest('openai', { prompt: 'x', shape: 'square' }, KEY)
        expect(plan.body.n).toBe(1)
    })

    it('honours a custom endpoint without doubling the slash', () => {
        const plan = planTalosImageRequest('openai', { prompt: 'x', shape: 'square' }, {
            ...KEY, endpoint: 'https://proxy.example/v1/',
        })
        expect(plan.url).toBe('https://proxy.example/v1/images/generations')
    })
})

describe('finding the picture in the answer', () => {
    const bytes = 'A'.repeat(600)

    it('reads the OpenAI shape', () => {
        expect(parseTalosGeneratedImages({ data: [{ b64_json: bytes }] }))
            .toEqual([{ base64: bytes, mediaType: 'image/png' }])
    })

    it('reads the Gemini shape, and the interleaved one too', () => {
        expect(parseTalosGeneratedImages({ output_image: { data: bytes, mime_type: 'image/jpeg' } }))
            .toEqual([{ base64: bytes, mediaType: 'image/jpeg' }])
        expect(parseTalosGeneratedImages({
            steps: [{ text: 'thinking' }, { inlineData: { data: bytes, mimeType: 'image/png' } }],
        })).toEqual([{ base64: bytes, mediaType: 'image/png' }])
    })

    it('does not mistake a text field called data for a picture', () => {
        // Without this, a caption gets saved as an image and shown broken.
        expect(parseTalosGeneratedImages({ data: 'nessuna immagine disponibile' })).toEqual([])
    })

    it('returns nothing rather than guessing when the answer carries no image', () => {
        expect(parseTalosGeneratedImages({ error: { message: 'content policy' } })).toEqual([])
        expect(parseTalosGeneratedImages(null)).toEqual([])
    })
})

describe('choosing who draws', () => {
    it('keeps the conversation on the provider it is already running on', () => {
        // A chat on OpenAI must not quietly bill a Google key.
        expect(chooseTalosImageProvider({ openai: true, gemini: true }, 'gemini')).toBe('gemini')
        expect(chooseTalosImageProvider({ openai: true, gemini: true }, 'openai')).toBe('openai')
    })

    it('falls back to whoever has a key when the current provider cannot draw', () => {
        expect(chooseTalosImageProvider({ gemini: true }, 'anthropic')).toBe('gemini')
        expect(chooseTalosImageProvider({ openai: true }, 'deepseek')).toBe('openai')
    })

    it('says no when nobody can, so the tool is never offered', () => {
        expect(chooseTalosImageProvider({}, 'openai')).toBeNull()
        expect(chooseTalosImageProvider({ openai: false, gemini: false }, null)).toBeNull()
    })
})
