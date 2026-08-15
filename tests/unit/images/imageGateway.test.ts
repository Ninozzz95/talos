import { describe, expect, it } from 'vitest'
import {
    chooseTalosImageProvider,
    parseTalosGeneratedImages,
    pickTalosImageModel,
    planTalosImageRequest,
} from '@/lib/images/imageGateway'
import * as imageGatewayModule from '@/lib/images/imageGateway'
import { parseTalosImageModels } from '@/lib/images/openRouterImageCatalog'

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
        expect(plan.body).toMatchObject({
            model: 'gemini-3.1-flash-image',
            input: [{ type: 'text', text: 'un gatto' }],
        })
        // The owner's device answered `HTTP 400: The 'type' parameter is
        // required at 'response_format'` — every request was rejected before a
        // pixel was drawn, and three models called it a content refusal.
        expect(plan.body.response_format).toEqual({
            type: 'image',
            // Normative ImageResponseFormat enum + owner wire: PNG is a 400.
            mime_type: 'image/jpeg',
            aspect_ratio: '3:4',
            image_size: '1K',
        })
    })

    it('IMAGE-OR-02 speaks the dedicated OpenRouter Image API contract', () => {
        const plan = planTalosImageRequest(
            'openrouter' as never,
            { prompt: 'un gatto', shape: 'landscape' },
            { apiKey: 'or-secret', model: 'google/gemini-3.1-flash-image' },
        )
        expect(plan.url).toBe('https://openrouter.ai/api/v1/images')
        expect(plan.headers.Authorization).toBe('Bearer or-secret')
        expect(plan.body).toEqual({
            model: 'google/gemini-3.1-flash-image',
            prompt: 'un gatto',
            n: 1,
            aspect_ratio: '16:9',
            output_format: 'png',
        })
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

describe('dedicated image model discovery', () => {
    const catalogApi = imageGatewayModule as unknown as {
        planTalosImageCatalogRequest(
            provider: 'openrouter',
            config: { apiKey: string; endpoint?: string | null },
        ): { url: string; headers: Record<string, string> }
    }

    it('IMAGE-OR-03 plans and shape-validates the dedicated OpenRouter image catalog', () => {
        const plan = catalogApi.planTalosImageCatalogRequest('openrouter', {
            apiKey: 'or-secret',
        })
        expect(plan.url).toBe('https://openrouter.ai/api/v1/images/models')
        expect(plan.headers.Authorization).toBe('Bearer or-secret')

        expect(parseTalosImageModels('openrouter', {
            data: [{
                id: 'google/gemini-3.1-flash-image',
                created: 123,
                architecture: {
                    input_modalities: ['text'],
                    output_modalities: ['image'],
                },
                supported_parameters: {
                    aspect_ratio: { type: 'enum', values: ['1:1', '16:9'] },
                },
            }],
        })).toEqual([expect.objectContaining({
            id: 'google/gemini-3.1-flash-image',
            createdAt: 123,
        })])
    })

    it('IMAGE-OR-03 rejects malformed catalog payloads instead of guessing', () => {
        expect(() => parseTalosImageModels('openrouter', {
            data: [{ id: '', architecture: { output_modalities: ['image'] } }],
        })).toThrow(/TALOS_IMAGE_CATALOG_INVALID/)
    })
})

describe('finding the picture in the answer', () => {
    const bytes = 'A'.repeat(600)

    it('reads the OpenAI shape', () => {
        expect(parseTalosGeneratedImages({ data: [{ b64_json: bytes }] }))
            .toEqual([{ base64: bytes, mediaType: 'image/png' }])
    })

    it('IMAGE-MIME-01 preserves a supported media_type beside b64_json', () => {
        expect(parseTalosGeneratedImages({
            data: [{ b64_json: bytes, media_type: 'image/webp' }],
        })).toEqual([{ base64: bytes, mediaType: 'image/webp' }])
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

    it('IMAGE-OR-01 keeps an OpenRouter conversation on its configured image API', () => {
        expect(chooseTalosImageProvider(
            { openrouter: true } as never,
            'openrouter',
        )).toBe('openrouter')
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

describe('which model draws', () => {
    // Self-review 2026-07-27: the first cut hardcoded `gpt-image-1` and
    // `gemini-3.1-flash-image` into the build. TALOS ships, so a frozen model
    // id ages in the field — the owner's "niente statico" rule exists for
    // exactly this.
    it('takes the newest image model the catalogue actually offers', () => {
        expect(pickTalosImageModel('openai', [
            { id: 'gpt-4o' }, { id: 'gpt-image-1' }, { id: 'gpt-image-1.5' },
        ])).toBe('gpt-image-1.5')
    })

    it('prefers the full model over the cheap one', () => {
        // The user asked for a picture; cheaper is not the right default.
        expect(pickTalosImageModel('openai', [
            { id: 'gpt-image-1-mini' }, { id: 'gpt-image-1' },
        ])).toBe('gpt-image-1')
    })

    it('takes the mini when it is the only one there is', () => {
        expect(pickTalosImageModel('openai', [{ id: 'gpt-image-1-mini' }])).toBe('gpt-image-1-mini')
    })

    it('never picks a model that cannot draw', () => {
        expect(pickTalosImageModel('gemini', [
            { id: 'text-embedding-004' }, { id: 'gemini-3.1-flash-image' },
        ])).toBe('gemini-3.1-flash-image')
        expect(pickTalosImageModel('openai', [{ id: 'gpt-4o' }])).not.toBe('gpt-4o')
    })

    it('IMAGE-GEM-01 never routes an Imagen model to Gemini Interactions', () => {
        expect(pickTalosImageModel('gemini', [
            { id: 'imagen-4.0-ultra-generate-001' },
            { id: 'gemini-3.1-flash-image' },
        ])).toBe('gemini-3.1-flash-image')
    })

    it('IMAGE-OR-04 prefers the current OpenRouter author before a newer unrelated image model', () => {
        expect(pickTalosImageModel(
            'openrouter' as never,
            [
                { id: 'zeta/new-image', createdAt: 200 },
                { id: 'google/gemini-3.1-flash-image', createdAt: 100 },
            ] as never,
            'google/gemini-3.6-flash',
        )).toBe('google/gemini-3.1-flash-image')
    })

    it('falls back to a floor rather than refusing when the catalogue is empty', () => {
        // Offline, or a listing that failed. Refusing to draw over that would
        // be worse than trying what was current when this shipped.
        expect(pickTalosImageModel('openai', [])).toBe('gpt-image-1')
        expect(pickTalosImageModel('gemini', [])).toBe('gemini-3.1-flash-image')
    })
})
