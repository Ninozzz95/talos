import { z } from 'zod'
import { defineTalosTool, type TalosToolDefinition } from '@/lib/tools/registry'
import type { TalosGeneratedImage, TalosImageShape } from '@/lib/images/imageGateway'

/**
 * Drawing, as something the conversation can do.
 *
 * The picture comes back on BOTH doors at once, which is the part that is not
 * ordinary. Every assistant can show you an image it made; this one hands the
 * bytes back to the model as well, on the user turn that already carries
 * attachments — so the model can look at what it drew and fix it, instead of
 * arguing about a picture it has never seen. The plumbing for that already
 * exists: `TalosToolResult.images` is the same path the Library uses to let a
 * model look at a photo.
 *
 * And it is saved before it is shown. An image that only lives in a chat bubble
 * is gone the moment the message is deleted; in the Library it keeps the chat it
 * came from, which is how every other generated file here behaves.
 *
 * `write`, not `read`: this spends the user's money and puts a file on the
 * device. The permission layer must be able to stop it.
 */
export interface TalosImageToolSources {
    /** Which provider will draw, for the sentence the model gets back. */
    provider(): string | null
    generate(prompt: string, shape: TalosImageShape): Promise<TalosGeneratedImage[]>
    /** Into the Library, with the chat it came from. Returns the stored name. */
    save(image: TalosGeneratedImage, prompt: string): Promise<{ id: string; name: string }>
}

const SHAPES = ['square', 'portrait', 'landscape'] as const

export function createTalosImageTools(sources: TalosImageToolSources): TalosToolDefinition<never>[] {
    const generate = defineTalosTool({
        name: 'generate_image',
        title: 'Draw an image',
        description: 'Generate an image from a description and put it in this conversation. '
            + 'The image is saved in the Library and comes back for you to look at, so you can judge it and try again if it is wrong. '
            + 'Describe the subject, the composition and the style in the prompt; there is no separate style setting.',
        action: 'write',
        input: z.object({
            prompt: z.string().min(1).max(4_000)
                .describe('What to draw, in full: subject, composition, style, colours, mood.'),
            shape: z.enum(SHAPES).optional()
                .describe('The proportions of the picture. Default square.'),
        }),
        async run(input) {
            const provider = sources.provider()
            if (!provider) {
                // Said plainly, because the model can act on it: it can offer to
                // describe the image instead of retrying a tool that cannot work.
                return {
                    ok: false,
                    code: 'TALOS_IMAGE_NO_PROVIDER',
                    content: 'No configured provider can generate images. A key for OpenAI or Gemini is needed in Settings.',
                }
            }

            let images: TalosGeneratedImage[]
            try {
                images = await sources.generate(input.prompt, input.shape ?? 'square')
            } catch (cause) {
                const message = cause instanceof Error ? cause.message : String(cause)
                return {
                    ok: false,
                    code: 'TALOS_IMAGE_FAILED',
                    content: `${provider} did not return an image: ${message}`,
                }
            }

            const image = images[0]
            if (!image) {
                // A refusal upstream is not a crash, and telling the model the
                // truth lets it say so rather than retrying the same prompt.
                return {
                    ok: false,
                    code: 'TALOS_IMAGE_EMPTY',
                    content: `${provider} accepted the request but returned no image. `
                        + 'This is usually a content refusal; a different description may work.',
                }
            }

            let saved: { id: string; name: string } | null = null
            try {
                saved = await sources.save(image, input.prompt)
            } catch {
                // Degrade rather than lose it: the picture is already drawn and
                // paid for, so it goes to the conversation even when the Library
                // would not take it. Saying so keeps the model from claiming the
                // file is somewhere it is not.
                saved = null
            }

            // The three types every provider adapter can carry. A generator
            // that returned something else would otherwise reach the wire as an
            // unsupported media type and fail the whole turn.
            const mediaType: 'image/png' | 'image/jpeg' | 'image/webp'
                = image.mediaType === 'image/jpeg' || image.mediaType === 'image/webp'
                    ? image.mediaType
                    : 'image/png'

            return {
                ok: true,
                content: saved
                    ? `Drawn by ${provider} and saved to the Library as "${saved.name}". It follows for you to look at.`
                    : `Drawn by ${provider}. It could not be saved to the Library, so it exists only in this conversation. It follows for you to look at.`,
                images: [{
                    type: 'image' as const,
                    attachmentId: saved?.id ?? `generated-${provider}`,
                    name: saved?.name ?? 'generated.png',
                    mediaType,
                    base64: image.base64,
                    sha256: '',
                }],
                evidence: { provider, shape: input.shape ?? 'square', saved: saved !== null },
            }
        },
    })

    return [generate] as TalosToolDefinition<never>[]
}
