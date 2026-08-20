import { fileTypeFromBuffer } from 'file-type'
import {
    TALOS_MOBILE_ATTACHMENT_LIMITS,
    type TalosMobileAttachmentAnalysis,
} from '@/lib/chat/attachmentContracts'

export interface TalosAttachmentAnalysisRequest {
    bytes: Uint8Array
    name: string
    declaredMediaType: string
}

const TEXT_EXTENSIONS = new Set([
    'txt', 'md', 'markdown', 'json', 'csv', 'html', 'htm', 'xml', 'js', 'jsx',
    'ts', 'tsx', 'vue', 'css', 'scss', 'php', 'py', 'rb', 'go', 'rs', 'java',
    'kt', 'kts', 'swift', 'c', 'h', 'cpp', 'hpp', 'cs', 'sh', 'bash', 'zsh',
    'ps1', 'sql', 'yaml', 'yml', 'toml', 'ini',
])
const TEXT_MEDIA_TYPES = new Set([
    'text/plain', 'text/markdown', 'text/csv', 'text/html', 'text/xml',
    'application/json', 'application/xml', 'application/javascript',
    'application/typescript', 'application/x-httpd-php', 'application/sql',
    'application/x-yaml', 'application/yaml', 'application/toml',
])
const BINARY_TYPES: Record<string, { extensions: readonly string[]; mediaTypes: readonly string[] }> = {
    png: { extensions: ['png'], mediaTypes: ['image/png'] },
    jpg: { extensions: ['jpg', 'jpeg'], mediaTypes: ['image/jpeg'] },
    webp: { extensions: ['webp'], mediaTypes: ['image/webp'] },
    pdf: { extensions: ['pdf'], mediaTypes: ['application/pdf'] },
    docx: {
        extensions: ['docx'],
        mediaTypes: ['application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
    },
    // Owner testing 2026-07-26: F2 generated spreadsheets and decks that this
    // very allowlist then refused, so the model reported a save that never
    // happened. The list was written for USER UPLOADS, before TALOS could make
    // documents of its own; docx was on it and its two siblings were not, which
    // is why Word worked and Excel did not.
    xlsx: {
        extensions: ['xlsx'],
        mediaTypes: ['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'],
    },
    pptx: {
        extensions: ['pptx'],
        mediaTypes: ['application/vnd.openxmlformats-officedocument.presentationml.presentation'],
    },
}

function fileExtension(name: string): string {
    const extension = name.split('.').at(-1)?.trim().toLowerCase() ?? ''
    if (!extension || extension === name.toLowerCase()) {
        throw new Error('TALOS_ATTACHMENT_EXTENSION_UNSUPPORTED')
    }
    return extension
}

function normalizedDeclaredMediaType(value: string): string {
    return value.split(';', 1)[0]?.trim().toLowerCase() ?? ''
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
    return Uint8Array.from(bytes).buffer
}

async function sha256(bytes: Uint8Array): Promise<string> {
    const digest = await crypto.subtle.digest('SHA-256', toArrayBuffer(bytes))
    return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('')
}

function boundedText(value: string): string {
    if (value.length > TALOS_MOBILE_ATTACHMENT_LIMITS.maxExtractedCodeUnits) {
        throw new Error('TALOS_ATTACHMENT_TEXT_TOO_LARGE')
    }
    return value
}

function extractUtf8(bytes: Uint8Array): string {
    try {
        return boundedText(new TextDecoder('utf-8', { fatal: true }).decode(bytes))
    } catch (error) {
        if (error instanceof Error && error.message === 'TALOS_ATTACHMENT_TEXT_TOO_LARGE') throw error
        throw new Error('TALOS_ATTACHMENT_TEXT_INVALID_UTF8')
    }
}

async function extractPdf(bytes: Uint8Array): Promise<{ text: string; pages: number }> {
    const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs')
    /*
     * ⛔⛔ PDF-NON-SI-ALLEGA-01 — «TALOS non ha potuto esaminare questo file.»
     *
     * FOTOGRAFATO sul Pad il 2026-08-20, allegando un PDF da 20,5 kB — un
     * rapporto scritto da TALOS stesso il giorno prima. Sul telefono falliva
     * sempre; **negli stessi test in Node passava**, e quella differenza è
     * tutta la diagnosi.
     *
     * pdf.js ha bisogno del suo worker. In Node, quando `workerSrc` è vuoto,
     * ripiega su un finto worker che gira nello stesso thread — quindi i test
     * verdi non dicevano niente sul telefono. Nel browser quel ripiego non
     * c'è: la documentazione è esplicita — «The `workerSrc` option should
     * always be set, in order to prevent any issues» — e da noi non era
     * impostato affatto.
     *
     * ⇒ Si lega al file VERO. `new URL(…, import.meta.url)` è la forma che
     * Vite riconosce: emette `pdf.worker.mjs` fra le risorse e riscrive
     * l'indirizzo, così vale anche dentro l'APK, dove non c'è nessun CDN da
     * cui scaricarlo — e non deve esserci.
     */
    if (!pdfjs.GlobalWorkerOptions.workerSrc) {
        pdfjs.GlobalWorkerOptions.workerSrc = new URL(
            'pdfjs-dist/legacy/build/pdf.worker.mjs',
            import.meta.url,
        ).href
    }
    const { getDocument } = pdfjs
    const loadingTask = getDocument({
        data: Uint8Array.from(bytes),
        disableFontFace: true,
        useSystemFonts: false,
        useWorkerFetch: false,
    })
    const document = await loadingTask.promise
    try {
        if (document.numPages > TALOS_MOBILE_ATTACHMENT_LIMITS.maxPdfPages) {
            throw new Error('TALOS_ATTACHMENT_PDF_PAGE_LIMIT')
        }
        const pages: string[] = []
        let length = 0
        for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
            const page = await document.getPage(pageNumber)
            const content = await page.getTextContent()
            const text = content.items
                .map((item) => ('str' in item && typeof item.str === 'string' ? item.str : ''))
                .filter(Boolean)
                .join(' ')
            length += text.length + (pages.length > 0 ? 2 : 0)
            if (length > TALOS_MOBILE_ATTACHMENT_LIMITS.maxExtractedCodeUnits) {
                throw new Error('TALOS_ATTACHMENT_TEXT_TOO_LARGE')
            }
            pages.push(text)
        }
        return { text: pages.join('\n\n'), pages: document.numPages }
    } finally {
        await loadingTask.destroy()
    }
}

async function extractDocx(bytes: Uint8Array): Promise<string> {
    const imported = await import('mammoth/mammoth.browser.js')
    const mammoth = imported.default
    const result = await mammoth.extractRawText({ arrayBuffer: toArrayBuffer(bytes) })
    return boundedText(result.value)
}

export async function analyzeTalosMobileAttachment(
    request: TalosAttachmentAnalysisRequest,
): Promise<TalosMobileAttachmentAnalysis> {
    if (!ArrayBuffer.isView(request.bytes)
        || request.bytes.BYTES_PER_ELEMENT !== 1
        || request.bytes.byteLength === 0
        || request.bytes.byteLength > TALOS_MOBILE_ATTACHMENT_LIMITS.maxBytesPerFile) {
        throw new Error('TALOS_ATTACHMENT_SIZE_INVALID')
    }
    const bytes = Uint8Array.from(request.bytes)
    const extension = fileExtension(request.name)
    const declared = normalizedDeclaredMediaType(request.declaredMediaType)
    const digest = await sha256(bytes)

    if (TEXT_EXTENSIONS.has(extension)) {
        if (declared && !declared.startsWith('text/') && !TEXT_MEDIA_TYPES.has(declared)) {
            throw new Error('TALOS_ATTACHMENT_TYPE_MISMATCH')
        }
        return {
            mediaType: declared || 'text/plain',
            extension,
            sha256: digest,
            extractedText: extractUtf8(bytes),
            pageCount: null,
        }
    }

    const detected = await fileTypeFromBuffer(bytes)
    if (!detected) throw new Error('TALOS_ATTACHMENT_SIGNATURE_UNKNOWN')
    const contract = BINARY_TYPES[detected.ext]
    if (!contract
        || !contract.extensions.includes(extension)
        || (declared !== '' && !contract.mediaTypes.includes(declared))
        || !contract.mediaTypes.includes(detected.mime)) {
        throw new Error('TALOS_ATTACHMENT_TYPE_MISMATCH')
    }

    if (detected.ext === 'pdf') {
        const pdf = await extractPdf(bytes)
        return {
            mediaType: detected.mime,
            extension: detected.ext,
            sha256: digest,
            extractedText: pdf.text,
            pageCount: pdf.pages,
        }
    }
    if (detected.ext === 'docx') {
        return {
            mediaType: detected.mime,
            extension: detected.ext,
            sha256: digest,
            extractedText: await extractDocx(bytes),
            pageCount: null,
        }
    }
    return {
        mediaType: detected.mime,
        extension: detected.ext,
        sha256: digest,
        extractedText: null,
        pageCount: null,
    }
}
