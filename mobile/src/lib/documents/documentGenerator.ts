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

export const TALOS_DOCUMENT_FORMATS = [
    'md', 'csv', 'html', 'docx', 'xlsx', 'pptx', 'pdf',
] as const

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

const MEDIA_TYPES: Record<TalosDocumentFormat, string> = {
    md: 'text/markdown',
    csv: 'text/csv',
    html: 'text/html',
    docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    pdf: 'application/pdf',
}

/** A title is not a filename: it can contain anything a person can type. */
function safeFileName(title: string, format: TalosDocumentFormat): string {
    const base = title
        .replace(/[/\\:"*?<>|]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 60) || 'document'
    return `${base}.${format}`
}

function encode(text: string): Uint8Array {
    return new TextEncoder().encode(text)
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
    const hasContent = (spec.body ?? '').trim() !== ''
        || (spec.rows?.length ?? 0) > 0
        || (spec.slides?.length ?? 0) > 0
    if (!hasContent) {
        // Refuse before a file exists. An empty document that opens is still a
        // failure, and it is one the user only discovers later.
        throw new Error('TALOS_DOCUMENT_EMPTY: there is nothing to write.')
    }

    const fileName = safeFileName(spec.title, spec.format)
    const common = { format: spec.format, fileName, mediaType: MEDIA_TYPES[spec.format] }

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
            const { PDFDocument, StandardFonts } = await import('pdf-lib')
            const pdf = await PDFDocument.create()
            const font = await pdf.embedFont(StandardFonts.Helvetica)
            const bold = await pdf.embedFont(StandardFonts.HelveticaBold)
            let page = pdf.addPage()
            const { width, height } = page.getSize()
            const margin = 56
            let y = height - margin

            // pdf-lib's standard fonts are WinAnsi: a character outside it throws
            // rather than degrading, so unrepresentable ones are replaced. An
            // exception here would lose the whole document over one glyph.
            const draw = (text: string, size: number, useBold: boolean): void => {
                const safe = text.replace(/[^\x20-\xFF]/g, '?')
                const usable = width - margin * 2
                const chars = Math.max(1, Math.floor(usable / (size * 0.5)))
                for (let index = 0; index < safe.length; index += chars) {
                    if (y < margin) { page = pdf.addPage(); y = height - margin }
                    page.drawText(safe.slice(index, index + chars), {
                        x: margin, y, size, font: useBold ? bold : font,
                    })
                    y -= size * 1.4
                }
            }

            draw(spec.title, 18, true)
            y -= 8
            for (const line of (spec.body ?? '').split('\n')) {
                if (line.trim() === '') { y -= 8; continue }
                draw(line, 11, false)
            }
            return { ...common, bytes: await pdf.save() }
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
        switch (document.format) {
            case 'md':
            case 'csv':
            case 'html': {
                const text = new TextDecoder('utf-8', { fatal: true }).decode(document.bytes)
                if (text.trim() === '') return { ok: false, detail: 'the file is empty' }
                const lines = text.split('\n').length
                return { ok: true, detail: `${text.length} characters, ${lines} lines` }
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
