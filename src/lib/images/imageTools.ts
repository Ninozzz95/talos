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
    /**
     * L'immagine da cui partire, presa dalla Libreria per nome o per
     * identificativo.
     *
     * Il modello non ha i byte: ha visto un allegato nella conversazione e ne
     * conosce il nome. Questa funzione fa il ponte, ed e' l'unico posto che
     * puo' farlo — un tool che chiedesse al modello di incollare il base64
     * dell'immagine consumerebbe il contesto della conversazione per
     * trasportare dei byte che stanno gia' su questo disco.
     *
     * `null` quando quel file non c'e' o non e' un'immagine: due modi diversi
     * di non funzionare che il chiamante distingue col messaggio.
     */
    findImage(reference: string): Promise<{ base64: string, mediaType: string, name: string } | null>
    /**
     * I nomi delle immagini disponibili, per l'ERRORE.
     *
     * Un errore che dice «non trovata» senza dire cosa c'e' costringe a
     * indovinare. Misurato 2026-08-04: cinque tentativi di fila, tutti falliti
     * in 20ms, e poi il modello si e' arreso.
     */
    availableImages(): readonly string[]
    generate(
        prompt: string,
        shape: TalosImageShape,
        signal?: AbortSignal,
        source?: { base64: string, mediaType: string } | null,
        /** DOVE modificare. Trasparente = qui, opaco = lascia stare. */
        mask?: { base64: string, mediaType: string } | null,
    ): Promise<{
        images: TalosGeneratedImage[]
        error: string | null
        permanent: boolean
        /** HTTP 429. Transient, but asking again NOW is not the way through. */
        rateLimited: boolean
    }>
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
        description: 'Generate an image from a description, or change an image the user already has, and put the result in this conversation. '
            + 'The image is saved in the Library and comes back for you to look at, so you can judge it and try again if it is wrong. '
            + 'Describe the subject, the composition and the style in the prompt; there is no separate style setting. '
            + 'To CHANGE a picture instead of drawing a new one, pass from_image with the name of a file the user attached or has in the Library — '
            + 'then the prompt describes the change, not the whole scene. Without from_image the result is a brand new picture, '
            + 'which is not what someone asking to edit their own photo wants.',
        action: 'write',
        requiredActions: ['outbound', 'write'],
        input: z.object({
            prompt: z.string().min(1).max(4_000)
                .describe('What to draw, in full: subject, composition, style, colours, mood.'),
            shape: z.enum(SHAPES).optional()
                .describe('The proportions of the picture. Default square.'),
            from_image: z.string().min(1).max(300).optional()
                .describe('The name or id of an image the user attached or has in the Library, to change instead of drawing from scratch. Leave it out to draw a new picture.'),
            mask: z.string().min(1).max(300).optional()
                .describe(
                    'The name or id of a mask image, to change only PART of from_image. '
                    + 'The mask must be a PNG the same size as the picture, where the TRANSPARENT areas are the ones you want changed '
                    + 'and the opaque areas are left exactly as they are. Only use this when the user has a mask file: you cannot draw one, '
                    + 'and without it the whole scene is redrawn, so background and untouched objects will shift.',
                ),
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

            let drawn: {
                images: TalosGeneratedImage[]
                error: string | null
                permanent: boolean
                rateLimited: boolean
            }
            /*
             * L'immagine di partenza si cerca PRIMA di chiamare il provider.
             *
             * Un nome sbagliato deve costare zero: se si chiedesse a disegnare
             * e poi si scoprisse che il file non c'e', la persona avrebbe
             * pagato una generazione che non voleva. E il modello riceve un
             * motivo su cui puo' agire — chiedere quale file, invece di
             * riprovare lo stesso.
             */
            let source: { base64: string, mediaType: string } | null = null
            if (input.from_image) {
                const found = await sources.findImage(input.from_image).catch(() => null)
                if (!found) {
                    /*
                     * L'errore NOMINA cio' che c'e'.
                     *
                     * MISURATO 2026-08-04 dalla diagnostica dell'owner:
                     * gpt-5.6-terra ha chiamato questo tool cinque volte di
                     * fila con lo stesso riferimento, ogni volta fallendo in
                     * 20ms, e poi ha detto alla persona «errore tecnico del
                     * riferimento immagine». Claude, nella stessa situazione,
                     * aveva prima cercato il nome con `library_list` e
                     * `library_read` — e aveva funzionato.
                     *
                     * La differenza non era il modello: era che questo
                     * messaggio diceva «non c'e'» senza dire COSA c'e'. Un
                     * errore che offre l'alternativa si corregge al primo
                     * tentativo; uno che nega e basta si paga cinque volte.
                     */
                    const disponibili = sources.availableImages()
                    const elenco = disponibili.length > 0
                        ? `The images you can use are: ${disponibili.map((n) => `«${n}»`).join(', ')}. `
                            + 'Call this tool again with one of those exact names.'
                        : 'There are no images in this conversation or in the Library, so there is nothing to change. '
                            + 'Leave from_image out to draw a new picture, or ask the user to attach a photo.'
                    return {
                        ok: false,
                        code: 'TALOS_IMAGE_SOURCE_NOT_FOUND',
                        content: `No image called «${input.from_image}» is here. ${elenco}`,
                    }
                }
                source = { base64: found.base64, mediaType: found.mediaType }
            }
            /*
             * La maschera vive o muore con la sorgente.
             *
             * Una maschera senza immagine da modificare non ha niente da
             * mascherare: accettarla in silenzio manderebbe un disegno da zero
             * con un file in piu' nel pacco, e OpenAI risponderebbe con un
             * errore che nomina un campo che la persona non ha mai visto.
             */
            let mask: { base64: string, mediaType: string } | null = null
            if (input.mask) {
                if (!source) {
                    return {
                        ok: false,
                        code: 'TALOS_IMAGE_MASK_WITHOUT_SOURCE',
                        content: 'A mask says WHERE to change a picture, so it needs from_image too. '
                            + 'Pass the picture in from_image, or leave the mask out.',
                    }
                }
                const found = await sources.findImage(input.mask).catch(() => null)
                if (!found) {
                    const disponibili = sources.availableImages()
                    return {
                        ok: false,
                        code: 'TALOS_IMAGE_MASK_NOT_FOUND',
                        content: `No mask called «${input.mask}» is here. `
                            + (disponibili.length > 0
                                ? `The images you can use are: ${disponibili.map((n) => `«${n}»`).join(', ')}.`
                                : 'There are no images here at all, so leave the mask out.'),
                    }
                }
                mask = { base64: found.base64, mediaType: found.mediaType }
            }
            try {
                drawn = await sources.generate(input.prompt, input.shape ?? 'square', context.signal, source, mask)
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
                        : drawn.rateLimited
                            // Owner 2026-08-02, from the device: the model
                            // retried twice and hit the same 429 both times. It
                            // was not lying — the advice below used to say
                            // "retrying once may work", and against a rate limit
                            // that sends it straight back into the wall.
                            ? `${provider} is rate limiting this account — ${drawn.error}. `
                                + 'Asking again right now will fail the same way: do NOT retry immediately. '
                                + 'Tell the user it is a temporary limit, suggest trying again in a few minutes, '
                                + 'and offer to do something else meanwhile.'
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
