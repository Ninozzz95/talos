import { z } from 'zod'
import type { TalosImageModelCandidate, TalosImageProvider } from '@/lib/images/imageGateway'

const modelSchema = z.object({
    id: z.string().min(1),
    created: z.number().finite().optional(),
    architecture: z.object({
        input_modalities: z.array(z.string()),
        output_modalities: z.array(z.string()),
    }),
    supported_parameters: z.record(
        z.string(),
        z.object({
            type: z.enum(['enum', 'range', 'boolean']),
        }).passthrough(),
    ).optional().default({}),
}).passthrough()

const catalogSchema = z.object({
    data: z.array(modelSchema),
}).passthrough()

/**
 * The dedicated catalog is loaded only when an OpenRouter image is requested.
 * Keeping its Zod schema out of the bootstrap path protects the initial chat
 * bundle while retaining a pinned, fail-visible upstream boundary.
 */
export function parseTalosImageModels(
    provider: Extract<TalosImageProvider, 'openrouter'>,
    payload: unknown,
): TalosImageModelCandidate[] {
    if (provider !== 'openrouter') throw new Error('TALOS_IMAGE_CATALOG_PROVIDER_UNSUPPORTED')
    const parsed = catalogSchema.safeParse(payload)
    if (!parsed.success) throw new Error('TALOS_IMAGE_CATALOG_INVALID')
    return parsed.data.data
        .filter((model) => model.architecture.input_modalities.includes('text'))
        .filter((model) => model.architecture.output_modalities.includes('image'))
        .map((model) => ({
            id: model.id,
            createdAt: model.created ?? null,
            inputModalities: [...model.architecture.input_modalities],
            outputModalities: [...model.architecture.output_modalities],
            supportedParameters: Object.keys(model.supported_parameters),
        }))
}

