/**
 * One way to ask for a picture, whoever draws it.
 *
 * The owner's own sketch: chat → model → gateway → provider adapters → a local
 * asset store → the image shown in the conversation. This is the gateway and
 * the adapters; the store is the Library, which already keeps generated files
 * beside the chat they came from.
 *
 * Two adapters to begin with, and the choice is not arbitrary: OpenAI and
 * Gemini are the providers whose keys the user ALREADY has, so drawing costs
 * nobody a new signup. BFL, Replicate and a local ComfyUI are new BYOK surfaces
 * and arrive later behind this same seam.
 *
 * Both return base64 rather than a URL, which is what makes this fit a
 * local-first app: the picture arrives as bytes, is saved on the device, and
 * there is no remote link to expire, leak, or need fetching again.
 *   - OpenAI  https://developers.openai.com/api/docs/api-reference/images/create
 *     POST /images/generations; the GPT-image models return `b64_json` only.
 *   - Gemini  https://ai.google.dev/gemini-api/docs/image-generation
 *     POST /v1beta/interactions; base64 under `output_image.data`.
 *     (both read 2026-07-27)
 *
 * The model is never asked for a vendor's pixel strings. It asks for a shape —
 * square, portrait, landscape — and each adapter says what that means in its own
 * dialect. A tool whose arguments are one vendor's enum breaks the day you add
 * the second vendor.
 */
export type TalosImageProvider = 'openai' | 'gemini'
export type TalosImageShape = 'square' | 'portrait' | 'landscape'

export interface TalosImageRequest {
    prompt: string
    shape: TalosImageShape
}

export interface TalosImagePlan {
    url: string
    headers: Record<string, string>
    body: Record<string, unknown>
}

export interface TalosGeneratedImage {
    base64: string
    mediaType: string
}

const OPENAI_SIZE: Record<TalosImageShape, string> = {
    square: '1024x1024',
    portrait: '1024x1536',
    landscape: '1536x1024',
}

const GEMINI_ASPECT: Record<TalosImageShape, string> = {
    square: '1:1',
    portrait: '3:4',
    landscape: '16:9',
}

export function planTalosImageRequest(
    provider: TalosImageProvider,
    request: TalosImageRequest,
    config: { apiKey: string; model: string; endpoint?: string | null },
): TalosImagePlan {
    if (provider === 'openai') {
        const base = (config.endpoint ?? 'https://api.openai.com/v1').replace(/\/+$/, '')
        return {
            url: `${base}/images/generations`,
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${config.apiKey}`,
            },
            body: {
                model: config.model,
                prompt: request.prompt,
                size: OPENAI_SIZE[request.shape],
                // Exactly one. A tool that can spend four times the money
                // because the model felt generous is a tool that eventually will.
                n: 1,
                output_format: 'png',
            },
        }
    }
    const base = (config.endpoint ?? 'https://generativelanguage.googleapis.com/v1beta').replace(/\/+$/, '')
    return {
        url: `${base}/interactions`,
        headers: {
            'Content-Type': 'application/json',
            // Header, never the query string: a url with a key in it ends up in
            // logs, history and crash reports.
            'x-goog-api-key': config.apiKey,
        },
        body: {
            model: config.model,
            input: request.prompt,
            response_format: { aspect_ratio: GEMINI_ASPECT[request.shape] },
        },
    }
}

/**
 * The picture out of whatever shape the provider chose to wrap it in.
 *
 * Searched rather than addressed, on purpose. Gemini documents the image at
 * `output_image.data` and ALSO describes interleaved content under `steps`, so
 * both are covered without betting on which one a given model returns. A
 * generation that succeeded upstream and is dropped here because a field moved
 * costs the user real money for nothing.
 */
export function parseTalosGeneratedImages(payload: unknown): TalosGeneratedImage[] {
    const found: TalosGeneratedImage[] = []
    walk(payload, found, 0)
    return found
}

function walk(node: unknown, found: TalosGeneratedImage[], depth: number): void {
    if (depth > 8 || node === null || typeof node !== 'object' || found.length >= 4) return
    if (Array.isArray(node)) {
        for (const item of node) walk(item, found, depth + 1)
        return
    }
    const record = node as Record<string, unknown>
    // OpenAI: data[].b64_json
    const b64 = record.b64_json
    if (typeof b64 === 'string' && b64 !== '') {
        found.push({ base64: b64, mediaType: 'image/png' })
        return
    }
    // Gemini: output_image.data, and inlineData.data on interleaved steps.
    const data = record.data
    const mime = record.mime_type ?? record.mimeType
    if (typeof data === 'string' && looksLikeImageBytes(data)) {
        found.push({
            base64: data,
            mediaType: typeof mime === 'string' && mime.startsWith('image/') ? mime : 'image/png',
        })
        return
    }
    for (const value of Object.values(record)) walk(value, found, depth + 1)
}

/**
 * Enough to tell an image payload from a caption.
 *
 * `data` is a common field name. Without this, a response carrying a text field
 * called `data` would be saved as a picture and shown as a broken one.
 */
function looksLikeImageBytes(value: string): boolean {
    return value.length > 512 && /^[A-Za-z0-9+/=\r\n]+$/.test(value.slice(0, 512))
}

/**
 * Who draws it.
 *
 * The provider already running the conversation wins when it can draw at all,
 * so a chat on OpenAI does not quietly bill a Google key. Otherwise the first
 * one with a key — and nothing at all when neither has one, in which case the
 * tool is not offered rather than offered and failing.
 */
export function chooseTalosImageProvider(
    available: Partial<Record<TalosImageProvider, boolean>>,
    preferred?: string | null,
): TalosImageProvider | null {
    if ((preferred === 'openai' || preferred === 'gemini') && available[preferred] === true) return preferred
    if (available.openai === true) return 'openai'
    if (available.gemini === true) return 'gemini'
    return null
}
