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
export type TalosImageProvider = 'openai' | 'gemini' | 'openrouter'
export type TalosImageShape = 'square' | 'portrait' | 'landscape'

export interface TalosImageRequest {
    prompt: string
    shape: TalosImageShape
    /**
     * L'immagine da cui partire, quando non si disegna da zero.
     *
     * Owner 2026-08-04: «bisogna rendere disponibile il tool di generazione da
     * immagine utente a invio modello». Prima non c'era un posto dove metterla:
     * la richiesta sapeva solo descrivere, e chiedere «modificami questa foto»
     * produceva una scena nuova con persone diverse — non una versione peggiore
     * di cio' che si voleva, un'altra cosa.
     *
     * I byte, non un indirizzo: TALOS e' local-first e l'immagine sta gia' sul
     * dispositivo. Un URL vorrebbe dire pubblicarla da qualche parte per poterla
     * modificare.
     */
    source?: { base64: string, mediaType: string } | null
    /**
     * DOVE modificare: la maschera.
     *
     * Owner 2026-08-04, «questo lo dobbiamo risolvere», citando la diagnosi che
     * il modello stesso aveva fatto del nostro tool:
     *
     *   «il generatore e' image-to-image su tutta la scena, non un compositing
     *   mascherato per-ROI; non garantisce invarianza pixel-level di sfondo,
     *   pose e corpi»
     *
     * Senza, «cambia lo sfondo» ridisegna anche il soggetto — prova visiva
     * dell'owner: una foto ristilizzata bene, ma «le scritte sulle casse sono
     * inventate e qualche oggetto sul tavolo e' spostato».
     *
     * Un PNG con canale alfa: **trasparente = modifica qui**, opaco = lascia
     * stare. E' il contratto di OpenAI, non una nostra convenzione, e va detto
     * perche' e' il contrario di quello che quasi tutti si aspettano.
     */
    mask?: { base64: string, mediaType: string } | null
}

export interface TalosImagePlan {
    url: string
    headers: Record<string, string>
    body: Record<string, unknown>
    /**
     * Quando c'e', la richiesta NON passa dal trasporto JSON dell'app.
     *
     * OpenAI accetta una modifica solo in `multipart/form-data`: e' l'unico
     * posto in tutta TALOS che vuole un corpo non-JSON. Descritto qui invece
     * che assemblato: questo modulo pianifica e basta — resta una funzione pura,
     * verificabile senza un DOM, e i byte li impacchetta chi spedisce.
     *
     * `body` resta popolato con gli stessi campi, cosi' chi legge un piano
     * vede cosa parte senza dover sapere che forma ha il pacco.
     */
    multipart?: {
        fields: Record<string, string>
        /**
         * I file del pacco: l'immagine, e la maschera quando c'e'.
         *
         * Una LISTA e non un file solo, perche' una modifica mascherata ne
         * porta due e un contratto con un file cablato andrebbe riscritto al
         * primo che se ne aggiunge.
         */
        files: { field: string, base64: string, mediaType: string, filename: string }[]
    }
}

export interface TalosGeneratedImage {
    base64: string
    mediaType: string
}

export interface TalosImageModelCandidate {
    id: string
    createdAt?: string | number | null
    inputModalities?: readonly string[]
    outputModalities?: readonly string[]
    supportedParameters?: readonly string[]
}

const OPENAI_SIZE: Record<TalosImageShape, string> = {
    square: '1024x1024',
    portrait: '1024x1536',
    landscape: '1536x1024',
}

/**
 * Il nome del file che accompagna l'immagine nel pacco.
 *
 * Non e' una formalita': un `multipart` porta il nome accanto ai byte, e un
 * server che trova `sorgente` senza estensione puo' rifiutarsi di indovinare
 * che tipo di immagine sia. L'estensione la ricaviamo dal tipo dichiarato,
 * che e' quello che la Libreria ha registrato al salvataggio.
 */
function extensionFor(mediaType: string): string {
    const sotto = mediaType.split('/')[1]?.split(';')[0]?.trim().toLowerCase() ?? ''
    if (sotto === 'jpeg' || sotto === 'jpg') return 'jpg'
    if (sotto === 'png' || sotto === 'webp' || sotto === 'gif') return sotto
    return 'png'
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
    /**
     * Partire da un'immagine: la sanno fare Gemini e OpenAI, non OpenRouter.
     *
     * OpenRouter lo dice invece di provarci. Una richiesta che ignora
     * l'immagine in silenzio consegna una scena nuova al posto di una modifica,
     * e chi guarda non ha modo di capire che e' successo.
     */
    if (request.source && provider === 'openrouter') {
        throw new Error(`TALOS_IMAGE_EDIT_UNSUPPORTED_PROVIDER:${provider}`)
    }
    if (provider === 'openai') {
        const base = (config.endpoint ?? 'https://api.openai.com/v1').replace(/\/+$/, '')
        /**
         * Modificare e disegnare sono due INDIRIZZI diversi, non due modi di
         * chiamare lo stesso.
         *
         * MISURATO dal dispositivo il 2026-08-04: `fetch` con `FormData` dalla
         * WebView arriva a `api.openai.com/v1/images/edits` e viene letto — la
         * risposta e' 401 sulla chiave, non un errore di trasporto ne' un muro
         * CORS. Era la sola cosa che mancava per scrivere questo ramo, perche'
         * la documentazione dice cosa accetta il server, non cosa riesce a
         * mandare questo telefono.
         *
         * Documentazione letta il 2026-08-04: obbligatori `model`, `image`,
         * `prompt`; la risposta torna in `b64_json` come le generazioni, quindi
         * il lettore a valle non cambia.
         */
        if (request.source) {
            const fields: Record<string, string> = {
                model: config.model,
                prompt: request.prompt,
                size: OPENAI_SIZE[request.shape],
                n: '1',
                output_format: 'png',
            }
            /*
             * La fedelta' dei volti si chiede solo dove esiste.
             *
             * `input_fidelity` tiene i tratti del viso quando la modifica non
             * doveva toccarli — ed e' esattamente cio' che serve a chi dice
             * «cambia lo sfondo alla MIA foto». Ma vale su gpt-image-1 e su
             * gpt-image-2 NON e' applicabile: mandarlo la' fa fallire tutto.
             *
             * Il modello qui non lo scegliamo noi, lo pesca il catalogo — e
             * pesca il piu' nuovo. Quindi si chiede solo dove la
             * documentazione lo prevede, e ogni modello che non riconosciamo
             * non lo riceve: una modifica meno fedele si vede e si puo'
             * rifare, una chiamata rifiutata no.
             */
            if (/^gpt-image-1/i.test(config.model)) fields.input_fidelity = 'high'
            /*
             * La maschera e' un SECONDO file nello stesso pacco.
             *
             * Non un campo di testo: `mask` e' un'immagine come `image`, e va
             * spedita con gli stessi byte binari. Per questo il piano porta una
             * lista di file invece di uno solo — un contratto con un file
             * cablato avrebbe richiesto di riscriverlo qui il giorno dopo.
             */
            const files = [{
                field: 'image',
                base64: request.source.base64,
                mediaType: request.source.mediaType,
                filename: `sorgente.${extensionFor(request.source.mediaType)}`,
            }]
            if (request.mask) {
                files.push({
                    field: 'mask',
                    base64: request.mask.base64,
                    mediaType: request.mask.mediaType,
                    filename: `maschera.${extensionFor(request.mask.mediaType)}`,
                })
            }
            return {
                url: `${base}/images/edits`,
                headers: {
                    // Nessun `Content-Type`: lo scrive FormData, con il
                    // confine che si e' scelto. Deciderlo qui lo romperebbe.
                    Authorization: `Bearer ${config.apiKey}`,
                },
                body: fields,
                multipart: { fields, files },
            }
        }
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
    if (provider === 'openrouter') {
        const base = (config.endpoint ?? 'https://openrouter.ai/api/v1').replace(/\/+$/, '')
        return {
            url: `${base}/images`,
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${config.apiKey}`,
            },
            body: {
                model: config.model,
                prompt: request.prompt,
                n: 1,
                aspect_ratio: GEMINI_ASPECT[request.shape],
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
            // A list of content blocks, not a bare string. The docs' own example
            // sends `[{type:'text', text:...}]`, and this is the shape that
            // leaves room for the reference images the API also accepts.
            /*
             * MISURATO contro l'API il 2026-08-04, non ricordato.
             *
             * Il blocco immagine e' `{ type: 'image', mime_type, data }` — i due
             * campi PIATTI, non annidati sotto una chiave `image`. Ci si e'
             * arrivati facendo parlare l'API: un `type` inventato le fa
             * elencare tutti quelli che accetta (`image` c'e'), e un blocco
             * `{type:'image'}` nudo risponde «Missing/unsupported mime_type in
             * image content», cioe' nomina il campo che vuole.
             *
             * L'immagine va DOPO il testo: l'istruzione dice cosa fare, e
             * quello che segue e' la cosa su cui farlo.
             */
            input: [
                { type: 'text', text: request.prompt },
                ...(request.source
                    ? [{ type: 'image', mime_type: request.source.mediaType, data: request.source.base64 }]
                    : []),
            ],
            /**
             * Owner's device, 2026-07-27, verbatim from the wire at last:
             *   HTTP 400: The 'type' parameter is required at 'response_format'.
             *
             * Three paraphrases from three models had called this a content
             * refusal and a temporary outage. It was neither: `response_format`
             * was missing its required discriminator, so every request was
             * rejected before a single pixel was drawn — which is also why each
             * attempt came back in 150ms.
             *
             * `image_size` needs the uppercase K; the docs say lowercase is
             * rejected. 1K is the default and the right one here: it is about
             * 1.1k tokens when the model looks at what it drew, where 4K would
             * be several times that for a picture on a phone screen.
             */
            response_format: {
                type: 'image',
                /**
                 * The normative Interactions ImageResponseFormat enum exposes
                 * only JPEG, and the owner's real wire response confirms it:
                 *   HTTP 400: The value 'image/png' is not supported.
                 *   Supported values: 'image/jpeg'.
                 * Some guide snippets still show PNG; schema + live endpoint
                 * are the binding contract when examples disagree.
                 */
                mime_type: 'image/jpeg',
                aspect_ratio: GEMINI_ASPECT[request.shape],
                image_size: '1K',
            },
        },
    }
}

export function planTalosImageCatalogRequest(
    provider: Extract<TalosImageProvider, 'openrouter'>,
    config: { apiKey: string; endpoint?: string | null },
): Pick<TalosImagePlan, 'url' | 'headers'> {
    if (provider !== 'openrouter') throw new Error('TALOS_IMAGE_CATALOG_PROVIDER_UNSUPPORTED')
    const base = (config.endpoint ?? 'https://openrouter.ai/api/v1').replace(/\/+$/, '')
    return {
        url: `${base}/images/models`,
        headers: { Authorization: `Bearer ${config.apiKey}` },
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
        const normalized = normalizeBase64Bytes(b64, false)
        const declared = record.media_type ?? record.mime_type ?? record.mimeType
        const mediaType = declared === undefined
            ? 'image/png'
            : declared === 'image/png' || declared === 'image/jpeg' || declared === 'image/webp'
                ? declared
                : null
        if (normalized && mediaType) found.push({ base64: normalized, mediaType })
        return
    }
    // Gemini: output_image.data, and inlineData.data on interleaved steps.
    const data = record.data
    const mime = record.mime_type ?? record.mimeType
    const normalizedData = typeof data === 'string' ? normalizeBase64Bytes(data, true) : null
    if (normalizedData) {
        found.push({
            base64: normalizedData,
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
function normalizeBase64Bytes(value: string, requireImageSize: boolean): string | null {
    const compact = value.replace(/\s+/g, '')
    if (!compact || !/^[A-Za-z0-9+/=]+$/.test(compact)) return null
    return !requireImageSize || compact.length > 512 ? compact : null
}

/**
 * Who draws it.
 *
 * The provider already running the conversation wins when it can draw at all,
 * so a chat on OpenAI does not quietly bill a Google key. Otherwise the first
 * one with a key — and nothing at all when neither has one, in which case the
 * tool is not offered rather than offered and failing.
 */
/**
 * Which model draws — asked of the catalogue, never baked into the APK.
 *
 * Self-review 2026-07-27: the first cut hardcoded `gpt-image-1` and
 * `gemini-3.1-flash-image`, which breaks the owner's binding rule that TALOS
 * will be DISTRIBUTED and so no list that ages may be frozen into the build.
 * The day OpenAI ships the next image model, a hardcoded app keeps paying for
 * the old one until someone rebuilds it.
 *
 * TALOS already discovers each provider's models, so the catalogue answers.
 * Newest first, and a `-mini` only if it is the only one — cheaper is not the
 * right default for something the user explicitly asked to be drawn.
 *
 * The floor exists because a catalogue can be empty (offline, a listing that
 * failed) and refusing to draw over that would be worse than trying the model
 * that was current when this shipped. It is a floor, not a list.
 */
const IMAGE_MODEL_FLOOR: Record<TalosImageProvider, string> = {
    openai: 'gpt-image-1',
    gemini: 'gemini-3.1-flash-image',
    openrouter: 'google/gemini-3.1-flash-image',
}

export function pickTalosImageModel(
    provider: TalosImageProvider,
    models: ReadonlyArray<TalosImageModelCandidate>,
    preferredModel?: string | null,
): string {
    let candidates = models.filter((model) => {
        if (/embed|vision|edit/i.test(model.id)) return false
        if (provider === 'openai') return /^gpt-image/i.test(model.id)
        if (provider === 'gemini') return /^gemini-[a-z0-9.-]*image[a-z0-9.-]*$/i.test(model.id)
        // OpenRouter's text catalogue contains models such as Gemini 3.7
        // Flash beside the image models. An untyped candidate is not evidence
        // that it can draw; fail closed and use the image floor instead.
        return model.outputModalities?.includes('image') ?? false
    })
    if (candidates.length === 0) return IMAGE_MODEL_FLOOR[provider]

    if (provider === 'openrouter') {
        const preferredAuthor = preferredModel?.includes('/')
            ? preferredModel.slice(0, preferredModel.indexOf('/'))
            : null
        const sameAuthor = preferredAuthor
            ? candidates.filter((model) => model.id.startsWith(`${preferredAuthor}/`))
            : []
        if (sameAuthor.length > 0) candidates = sameAuthor
    }

    const full = candidates.filter((model) => !/mini|lite|flash-lite/i.test(model.id))
    const pool = full.length > 0 ? full : candidates
    return [...pool].sort((left, right) => {
        if (provider === 'gemini') {
            const version = (id: string): number => {
                const match = /^gemini-(\d+)(?:\.(\d+))?/i.exec(id)
                return match ? Number(match[1]) * 1_000 + Number(match[2] ?? 0) : 0
            }
            const versionDifference = version(right.id) - version(left.id)
            if (versionDifference !== 0) return versionDifference
        }
        const leftCreated = typeof left.createdAt === 'number' ? left.createdAt : 0
        const rightCreated = typeof right.createdAt === 'number' ? right.createdAt : 0
        if (leftCreated !== rightCreated) return rightCreated - leftCreated
        return right.id.localeCompare(left.id)
    })[0]!.id
}

/**
 * What the provider said went wrong, in its own words.
 *
 * Owner 2026-07-27, from a real trace: `generate_image` failed in 140-389ms on
 * every attempt — far too fast to be a drawing — and the model was told
 * "usually a content refusal", so it went on to tell the owner his innocent cat
 * prompts had been rejected. Twice, on two providers, retrying three to five
 * times.
 *
 * The cause was mine twice over. The http transport does NOT throw on a non-2xx
 * response, it returns `{status, data}` — so a 400 arrived looking like a
 * successful call with no picture in it — and my copy then guessed the reason.
 * A tool that guesses why it failed teaches the model to lie to the user.
 */
export function readTalosImageError(status: number, payload: unknown): string | null {
    if (status >= 200 && status < 300) return null
    const message = findMessage(payload, 0)
    const detail = message ? `: ${message}` : ''
    return `HTTP ${status}${detail}`
}

function findMessage(node: unknown, depth: number): string | null {
    if (depth > 6 || node === null) return null
    if (typeof node === 'string') return node.length > 0 && node.length < 400 ? node : null
    if (typeof node !== 'object') return null
    if (Array.isArray(node)) {
        for (const item of node) {
            const found = findMessage(item, depth + 1)
            if (found) return found
        }
        return null
    }
    const record = node as Record<string, unknown>
    for (const key of ['message', 'error_description', 'detail', 'reason']) {
        const value = record[key]
        if (typeof value === 'string' && value !== '') return value.slice(0, 400)
    }
    for (const key of ['error', 'errors', 'status', 'data']) {
        const found = findMessage(record[key], depth + 1)
        if (found) return found
    }
    return null
}

/**
 * Whether asking again could possibly help.
 *
 * A 400 means the request shape is wrong and will be wrong the next four times
 * too. The owner's trace shows the model retrying five times against the same
 * 400 — that is billed thinking spent on something that cannot succeed, and the
 * tool has to say so plainly enough that the model stops.
 */
export function talosImageErrorIsPermanent(status: number): boolean {
    return status >= 400 && status < 500 && status !== 408 && status !== 429
}

export { chooseTalosImageProvider } from '@/lib/images/imageProviderSelection'
