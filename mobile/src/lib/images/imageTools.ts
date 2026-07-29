import { z } from 'zod'
import { defineTalosTool, type TalosToolDefinition } from '@/lib/tools/registry'
import type { TalosGeneratedImage, TalosImageShape } from '@/lib/images/imageGateway'
import type { AppendChatAttachmentInput } from '@/repositories/chatRepository'

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
 * `outbound + write`: the prompt leaves the device for a configured provider
 * and the returned bytes are persisted. Either policy must be able to stop the
 * operation before the provider or Library is touched.
 */
export interface TalosImageToolSources {
    /** Which provider will draw, for the sentence the model gets back. */
    provider(): string | null
    generate(
        prompt: string,
        shape: TalosImageShape,
        signal?: AbortSignal,
    ): Promise<{ images: TalosGeneratedImage[]; error: string | null; permanent: boolean }>
    /** Into the Library, with the chat it came from. Returns the stored name. */
    save(image: TalosGeneratedImage, prompt: string): Promise<{
        id: string
        name: string
        sha256: string
        attachment: AppendChatAttachmentInput
    }>
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
        requiredActions: ['outbound', 'write'],
        input: z.object({
            prompt: z.string().min(1).max(4_000)
                .describe('What to draw, in full: subject, composition, style, colours, mood.'),
            shape: z.enum(SHAPES).optional()
                .describe('The proportions of the picture. Default square.'),
        }),
        async run(input, context) {
            const provider = sources.provider()
            if (!provider) {
                // Said plainly, because the model can act on it: it can offer to
                // describe the image instead of retrying a tool that cannot work.
                return {
                    ok: false,
                    code: 'TALOS_IMAGE_NO_PROVIDER',
                    content: 'No configured provider can generate images. A key for OpenAI, Gemini, or OpenRouter is needed in Settings.',
                }
            }

            let drawn: { images: TalosGeneratedImage[]; error: string | null; permanent: boolean }
            try {
                drawn = await sources.generate(input.prompt, input.shape ?? 'square', context.signal)
            } catch (cause) {
                const message = cause instanceof Error ? cause.message : String(cause)
                if (context.signal?.aborted) {
                    // Stopping must actually stop. Self-review 2026-07-27: the
                    // first cut ignored the signal, so a stopped message kept
                    // drawing and kept billing.
                    return { ok: false, code: 'TALOS_IMAGE_STOPPED', content: 'The drawing was stopped.' }
                }
                return {
                    ok: false,
                    code: 'TALOS_IMAGE_FAILED',
                    content: `${provider} did not return an image: ${message}`,
                }
            }

            if (drawn.error) {
                // The provider's own words, never a guess. Saying "usually a
                // content refusal" over an HTTP 400 is how a model ends up
                // telling the user his cat prompt was rejected.
                return {
                    ok: false,
                    code: drawn.permanent ? 'TALOS_IMAGE_REJECTED' : 'TALOS_IMAGE_FAILED',
                    content: drawn.permanent
                        ? `${provider} refused the request — ${drawn.error}. `
                            + 'This will fail the same way if you ask again: do NOT retry. '
                            + 'Tell the user what happened and stop.'
                        : `${provider} could not draw it right now — ${drawn.error}. Retrying once may work.`,
                }
            }

            const image = drawn.images[0]
            if (!image) {
                return {
                    ok: false,
                    code: 'TALOS_IMAGE_EMPTY',
                    content: `${provider} answered successfully but the response carried no image. `
                        + 'Do NOT retry with a different description: the request succeeded, so this is not a content refusal. '
                        + 'Tell the user the provider returned an empty result.',
                }
            }

            let saved: {
                id: string
                name: string
                sha256: string
                attachment: AppendChatAttachmentInput
            }
            try {
                saved = await sources.save(image, input.prompt)
            } catch {
                // There is no second durable image store behind a chat bubble.
                // Returning volatile bytes here used to make the next model
                // round claim success, while the final assistant message had no
                // attachment to render or reload. The provider has already run,
                // so neither saving nor generation is retried implicitly.
                return {
                    ok: false,
                    code: 'TALOS_IMAGE_PERSIST_FAILED',
                    content: 'TALOS_IMAGE_PERSIST_FAILED: The image was generated but could not be saved safely. '
                        + 'It is not available in chat or Library. Do not claim success and do not retry or regenerate automatically. '
                        + 'Tell the user to check encrypted local storage in Doctor and retry only after storage is healthy.',
                }
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
                content: `Drawn by ${provider} and saved to the Library as "${saved.name}". It follows for you to look at.`,
                images: [{
                    type: 'image' as const,
                    attachmentId: saved.attachment.id,
                    name: saved.name,
                    mediaType,
                    base64: image.base64,
                    sha256: saved.sha256,
                }],
                messageAttachments: [saved.attachment],
                evidence: { provider, shape: input.shape ?? 'square', saved: true },
            }
        },
    })

    return [generate] as TalosToolDefinition<never>[]
}
