/**
 * F2 — generating documents ON THE DEVICE.
 *
 * The vision document lists `python-docx`, `openpyxl`, `python-pptx`,
 * WeasyPrint and headless LibreOffice. None of those exist inside a Capacitor
 * app. The pure-JS equivalents do, with no native dependency — so document
 * generation ends up **entirely local**, which is better than the source
 * document assumed, and means nothing the user writes leaves the phone.
 *
 * The pipeline is `generate → parse → preview → quality check → correct →
 * export`, and the step everybody skips is the quality check. It is the reason
 * `verifyTalosDocument` exists: every file is RE-OPENED and inspected before it
 * is handed over. A corrupt DOCX delivered with confidence is worse than a
 * refusal — the user finds out in front of whoever they sent it to.
 *
 * Every generator is imported dynamically. The libraries are megabytes and the
 * chat's first paint must never carry them (D11).
 */

import type { TalosReportBlock, TalosReportInput, TalosReportSpec } from './reportBuilder'
import { talosSafeFileStem } from '@/lib/fileNamePolicy'

export const TALOS_SOURCE_TEXT_FORMATS = [
    'txt', 'json', 'xml',
    'js', 'jsx', 'ts', 'tsx', 'vue',
    'css', 'scss', 'php', 'py', 'rb', 'go', 'rs', 'java', 'kt', 'kts',
    'swift', 'c', 'h', 'cpp', 'hpp', 'cs',
    'sh', 'bash', 'zsh', 'ps1', 'sql',
    'yaml', 'yml', 'toml', 'ini',
] as const

export const TALOS_DOCUMENT_FORMATS = [
    'md', 'csv', 'html', 'docx', 'xlsx', 'pptx', 'pdf',
    ...TALOS_SOURCE_TEXT_FORMATS,
] as const

export type TalosSourceTextFormat = (typeof TALOS_SOURCE_TEXT_FORMATS)[number]
export type TalosDocumentFormat = (typeof TALOS_DOCUMENT_FORMATS)[number]

export interface TalosDocumentSpec {
    format: TalosDocumentFormat
    title: string
    /** Prose body, markdown-flavoured, for the text and document formats. */
    body?: string
    /** Tabular content; the first row is treated as the header. */
    rows?: string[][]
    /** Slides, for the presentation format. */
    slides?: Array<{ title: string; bullets: string[] }>
    /**
     * The rich path for PDFs: a document DESCRIBED block by block, with the
     * look decided by the theme rather than restated by the caller.
     */
    report?: TalosReportInput
}

/**
 * The simple `body`/`rows` spec, promoted to a laid-out document.
 *
 * Everything that already produced a PDF keeps working, and gets a cover-less
 * but properly typeset one: markdown headings become headings, blank lines
 * separate paragraphs, and `rows` becomes a real table with a repeating header
 * instead of a wall of pipe characters.
 */
function specToReport(spec: TalosDocumentSpec): TalosReportSpec {
    // The title is DRAWN, not merely stored in the file metadata. The old
    // branch opened every document with it at 18pt; losing it was a regression
    // in the one thing every PDF has.
    const blocks: TalosReportBlock[] = [{ t: 'h', lvl: 1, x: spec.title }]
    const body = (spec.body ?? '').replace(/\r\n/g, '\n')

    // Line by line, not chunk by chunk: `# Titolo` followed immediately by its
    // paragraph used to render the hash literally, because the heading test was
    // applied to the whole blank-line-delimited block.
    let paragraph: string[] = []
    let bullets: string[] = []
    const flush = (): void => {
        if (bullets.length) { blocks.push({ t: 'list', items: bullets }); bullets = [] }
        if (paragraph.length) { blocks.push({ t: 'p', x: paragraph.join(' ') }); paragraph = [] }
    }

    for (const line of body.split('\n')) {
        const text = line.trim()
        if (text === '') { flush(); continue }
        const heading = /^(#{1,3})\s+(.*)$/.exec(text)
        if (heading) {
            flush()
            blocks.push({ t: 'h', lvl: heading[1]!.length as 1 | 2 | 3, x: heading[2]!.trim() })
            continue
        }
        const bullet = /^[-*]\s+(.*)$/.exec(text)
        if (bullet) {
            if (paragraph.length) { blocks.push({ t: 'p', x: paragraph.join(' ') }); paragraph = [] }
            bullets.push(bullet[1]!)
            continue
        }
        if (bullets.length) { blocks.push({ t: 'list', items: bullets }); bullets = [] }
        paragraph.push(text)
    }
    flush()

    if (spec.rows?.length) {
        const [head, ...rest] = spec.rows
        blocks.push({ t: 'table', head, rows: rest })
    }

    return { meta: { title: spec.title }, theme: 'report', blocks }
}

export interface TalosGeneratedDocument {
    format: TalosDocumentFormat
    fileName: string
    mediaType: string
    bytes: Uint8Array
}

export interface TalosDocumentCheck {
    ok: boolean
    /**
     * What was actually found on re-opening, in words a person can check:
     * "3 sheets, 3 rows". "Verified" with nothing behind it is the empty
     * promise this whole step exists to stop.
     */
    detail: string
}

const SOURCE_MEDIA_TYPES: Record<TalosSourceTextFormat, string> = {
    txt: 'text/plain',
    json: 'application/json',
    xml: 'application/xml',
    js: 'text/javascript',
    jsx: 'text/javascript',
    ts: 'text/plain',
    tsx: 'text/plain',
    vue: 'text/plain',
    css: 'text/css',
    scss: 'text/plain',
    php: 'text/plain',
    py: 'text/plain',
    rb: 'text/plain',
    go: 'text/plain',
    rs: 'text/plain',
    java: 'text/plain',
    kt: 'text/plain',
    kts: 'text/plain',
    swift: 'text/plain',
    c: 'text/plain',
    h: 'text/plain',
    cpp: 'text/plain',
    hpp: 'text/plain',
    cs: 'text/plain',
    sh: 'text/plain',
    bash: 'text/plain',
    zsh: 'text/plain',
    ps1: 'text/plain',
    sql: 'application/sql',
    yaml: 'application/yaml',
    yml: 'application/yaml',
    toml: 'application/toml',
    ini: 'text/plain',
}

const MEDIA_TYPES: Record<TalosDocumentFormat, string> = {
    md: 'text/markdown',
    csv: 'text/csv',
    html: 'text/html',
    docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    pdf: 'application/pdf',
    ...SOURCE_MEDIA_TYPES,
}

/** A title is not a filename: it can contain anything a person can type. */
async function safeFileName(title: string, format: TalosDocumentFormat): Promise<string> {
    const trimmed = title.trim()
    const suffix = `.${format}`
    // A model naturally includes the requested suffix in a code-file title.
    // Remove one matching final suffix before canonical re-append: never
    // `script.py.py`, while `migration.v2` remains `migration.v2.py`.
    const stemSource = trimmed.toLowerCase().endsWith(suffix)
        ? trimmed.slice(0, -suffix.length)
        : title
    const base = await talosSafeFileStem(stemSource, 60, 'document')
    return `${base}.${format}`
}

const SOURCE_TEXT_FORMAT_SET: ReadonlySet<string> = new Set(TALOS_SOURCE_TEXT_FORMATS)

function isTalosSourceTextFormat(
    format: TalosDocumentFormat,
): format is TalosSourceTextFormat {
    return SOURCE_TEXT_FORMAT_SET.has(format)
}

function encode(text: string): Uint8Array {
    return new TextEncoder().encode(text)
}

function verifyUtf8Text(bytes: Uint8Array): TalosDocumentCheck {
    const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes)
    if (text.trim() === '') return { ok: false, detail: 'the file is empty' }
    return {
        ok: true,
        detail: `${text.length} characters, ${text.split('\n').length} lines`,
    }
}

function escapeHtml(value: string): string {
    return value
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
}

/** RFC 4180: a field containing a comma, a quote or a newline must be quoted. */
function csvField(value: string): string {
    return /[",\n\r]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value
}

function rowsOf(spec: TalosDocumentSpec): string[][] {
    return spec.rows?.length ? spec.rows : [['Content'], [spec.body ?? '']]
}

export async function generateTalosDocument(
    spec: TalosDocumentSpec,
): Promise<TalosGeneratedDocument> {
    if (spec.report && spec.format !== 'pdf') {
        // SF-critic 2026-07-26 (BLOCKER): `report` was accepted for any format
        // but read only by the pdf branch, so a .docx came back holding nothing
        // but its title — and the model was told it had been verified, which is
        // the exact outcome this module exists to prevent.
        throw new Error(
            'TALOS_DOCUMENT_REPORT_PDF_ONLY: `report` describes a laid-out PDF.'
            + ` For ${spec.format}, use \`body\` (prose) or \`rows\` (a table).`,
        )
    }

    if (isTalosSourceTextFormat(spec.format) && (spec.body ?? '').trim() === '') {
        throw new Error(
            'TALOS_DOCUMENT_SOURCE_BODY_REQUIRED: a source file requires non-empty `body` text.',
        )
    }

    const hasContent = (spec.body ?? '').trim() !== ''
        || (spec.rows?.length ?? 0) > 0
        || (spec.slides?.length ?? 0) > 0
        || (spec.format === 'pdf' && (spec.report?.blocks.length ?? 0) > 0)
    if (!hasContent) {
        // Refuse before a file exists. An empty document that opens is still a
        // failure, and it is one the user only discovers later.
        throw new Error('TALOS_DOCUMENT_EMPTY: there is nothing to write.')
    }

    const fileName = await safeFileName(spec.title, spec.format)
    const common = { format: spec.format, fileName, mediaType: MEDIA_TYPES[spec.format] }

    if (isTalosSourceTextFormat(spec.format)) {
        return { ...common, bytes: encode(spec.body!) }
    }

    switch (spec.format) {
        case 'md':
            return { ...common, bytes: encode(spec.body ?? spec.title) }

        case 'csv':
            return {
                ...common,
                bytes: encode(rowsOf(spec).map((row) => row.map(csvField).join(',')).join('\r\n')),
            }

        case 'html':
            return {
                ...common,
                bytes: encode([
                    '<!doctype html>',
                    '<html><head><meta charset="utf-8">',
                    `<title>${escapeHtml(spec.title)}</title></head><body>`,
                    `<h1>${escapeHtml(spec.title)}</h1>`,
                    ...(spec.body ?? '').split('\n\n').map((block) => `<p>${escapeHtml(block)}</p>`),
                    '</body></html>',
                ].join('\n')),
            }

        case 'docx': {
            const { Document, Packer, Paragraph, HeadingLevel } = await import('docx')
            const paragraphs = [
                new Paragraph({ text: spec.title, heading: HeadingLevel.HEADING_1 }),
                ...(spec.body ?? '').split('\n').map((line) => new Paragraph({ text: line })),
            ]
            const document = new Document({ sections: [{ children: paragraphs }] })
            const blob = await Packer.toBlob(document)
            return { ...common, bytes: new Uint8Array(await blob.arrayBuffer()) }
        }

        case 'xlsx': {
            const xlsx = await import('xlsx')
            const sheet = xlsx.utils.aoa_to_sheet(rowsOf(spec))
            const book = xlsx.utils.book_new()
            xlsx.utils.book_append_sheet(book, sheet, 'Sheet1')
            const written = xlsx.write(book, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer
            return { ...common, bytes: new Uint8Array(written) }
        }

        case 'pptx': {
            const PptxGenJS = (await import('pptxgenjs')).default
            const deck = new PptxGenJS()
            const slides = spec.slides?.length
                ? spec.slides
                : [{ title: spec.title, bullets: (spec.body ?? '').split('\n').filter(Boolean) }]
            for (const entry of slides) {
                const slide = deck.addSlide()
                slide.addText(entry.title, { x: 0.5, y: 0.4, w: 9, h: 0.8, fontSize: 28, bold: true })
                if (entry.bullets.length) {
                    slide.addText(
                        entry.bullets.map((text) => ({ text, options: { bullet: true } })),
                        { x: 0.6, y: 1.4, w: 8.8, h: 4, fontSize: 16 },
                    )
                }
            }
            const written = await deck.write({ outputType: 'arraybuffer' }) as ArrayBuffer
            return { ...common, bytes: new Uint8Array(written) }
        }

        case 'pdf': {
            /**
             * A laid-out document, not a wall of text.
             *
             * Owner 2026-07-26: this branch used to draw wrapped lines with
             * pdf-lib and nothing else — no tables, no charts, no colour, no
             * page furniture — so a request for a six-page branded report came
             * back as HTML. It also replaced every character outside WinAnsi
             * with "?". Precisely: the range was `[^ -ÿ]`, so the
             * Italian accents survived — what it destroyed was €, the en and em
             * dashes and every curly quote. Worth stating exactly, because an
             * overstated bug is how the next reader stops trusting the comment.
             *
             * pdfmake is a flow engine: it breaks pages, repeats table headers
             * and gives the footer the page number. Loaded here, inside the
             * branch, so an app that never makes a PDF never pays for it.
             */
            const [{ default: pdfMake }, { TALOS_PDF_VFS }, { buildTalosReportDefinition }] =
                await Promise.all([
                    import('pdfmake/build/pdfmake.min.js'),
                    import('./pdfFonts'),
                    import('./reportBuilder'),
                ])

            // NEVER `pdfMake.vfs = ...`: that reassigns an ESM import, which is
            // the single most reported pdfmake failure and shows up only in the
            // production build ("Unknown font format").
            pdfMake.addVirtualFileSystem(TALOS_PDF_VFS)
            pdfMake.setFonts({
                Roboto: {
                    normal: 'Roboto-Regular.ttf',
                    bold: 'Roboto-Medium.ttf',
                    italics: 'Roboto-Italic.ttf',
                    // No bold-italic weight is shipped; pointing it at medium
                    // keeps pdfkit from throwing if a style ever asks for it.
                    bolditalics: 'Roboto-Medium.ttf',
                },
            })

            // The title lives at the top level of the tool call, so the report
            // never has to repeat it — one fewer thing for the model to get
            // subtly different between the file name and the cover.
            const definition = buildTalosReportDefinition(
                spec.report
                    ? { ...spec.report, meta: { title: spec.title } }
                    : specToReport(spec),
            )
            // 0.3 is promise-based. Passing a callback here is the documented
            // way to get a silent hang that never resolves.
            const buffer = await pdfMake.createPdf(definition).getBuffer()
            return { ...common, bytes: new Uint8Array(buffer) }
        }
    }
}

/**
 * Re-open the file and report what is really inside it.
 *
 * This is the quality check of the pipeline, and it is deliberately not a
 * checksum: a checksum proves we wrote what we meant to write, which is not the
 * question. The question is whether the file a reader opens is intact.
 */
export async function verifyTalosDocument(
    document: TalosGeneratedDocument,
): Promise<TalosDocumentCheck> {
    try {
        if (isTalosSourceTextFormat(document.format)) {
            return verifyUtf8Text(document.bytes)
        }

        switch (document.format) {
            case 'md':
            case 'csv':
            case 'html': {
                return verifyUtf8Text(document.bytes)
            }

            case 'docx': {
                const parts = await openOoxml(document.bytes)
                const body = parts['word/document.xml']
                if (!body) return { ok: false, detail: 'no document part inside the file' }
                const paragraphs = (body.match(/<w:p[ >]/g) ?? []).length
                if (paragraphs === 0) return { ok: false, detail: 'the document has no paragraphs' }
                return { ok: true, detail: `reopened: ${paragraphs} paragraphs` }
            }

            case 'xlsx': {
                const xlsx = await import('xlsx')
                const book = xlsx.read(document.bytes, { type: 'array' })
                const names = book.SheetNames
                if (!names.length) return { ok: false, detail: 'no sheets inside the file' }
                const first = book.Sheets[names[0]!]!
                const rows = xlsx.utils.sheet_to_json(first, { header: 1 }) as unknown[][]
                return {
                    ok: rows.length > 0,
                    detail: `reopened: ${names.length} sheet${names.length === 1 ? '' : 's'}, ${rows.length} rows`,
                }
            }

            case 'pptx': {
                const parts = await openOoxml(document.bytes)
                const slides = Object.keys(parts).filter((name) => /^ppt\/slides\/slide\d+\.xml$/.test(name))
                if (slides.length === 0) return { ok: false, detail: 'no slides inside the file' }
                return { ok: true, detail: `reopened: ${slides.length} slides` }
            }

            case 'pdf': {
                const { PDFDocument } = await import('pdf-lib')
                const pdf = await PDFDocument.load(document.bytes)
                const pages = pdf.getPageCount()
                if (pages === 0) return { ok: false, detail: 'the pdf has no pages' }
                return { ok: true, detail: `reopened: ${pages} page${pages === 1 ? '' : 's'}` }
            }
        }
    } catch (error) {
        const detail = error instanceof Error ? error.message : String(error)
        return { ok: false, detail: `it could not be reopened: ${detail}` }
    }
}

/** Reads the OOXML container back, so a truncated archive fails here. */
async function openOoxml(bytes: Uint8Array): Promise<Record<string, string>> {
    const JSZip = (await import('jszip')).default
    const archive = await JSZip.loadAsync(bytes)
    const parts: Record<string, string> = {}
    for (const [name, entry] of Object.entries(archive.files)) {
        if (entry.dir) continue
        // Only the parts that are inspected are inflated; a deck of images
        // should not be decoded into memory to count its slides.
        parts[name] = /\.xml$/.test(name) && /document\.xml$|presentation\.xml$/.test(name)
            ? await entry.async('string')
            : ''
    }
    return parts
}
