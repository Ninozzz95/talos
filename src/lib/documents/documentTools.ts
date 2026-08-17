import { z } from 'zod'
import type { TalosReportInput } from './reportBuilder'
import { defineTalosTool, type TalosToolDefinition } from '@/lib/tools/registry'
import { talosFailureMessage } from '@/lib/talosFailureMessage'
import {
    TALOS_DOCUMENT_FORMATS,
    type TalosDocumentFormat,
    type TalosGeneratedDocument,
} from '@/lib/documents/documentGenerator'

/**
 * F2 — the tool that makes a document.
 *
 * It is a `write`: it creates a file the user keeps. So by D12 it asks once per
 * conversation, and by the gate it cannot happen silently — which is right,
 * because a model that fills someone's Library unprompted is a model nobody
 * leaves switched on.
 *
 * The quality check is not optional and not a flag. Every file is re-opened and
 * inspected before the tool reports success, and what the check FOUND goes back
 * to the model in the result: "3 sheets, 3 rows". A model told only "done"
 * cannot tell the user anything, and a model told "done" about a corrupt file
 * will say it confidently.
 */
export interface TalosDocumentToolSources {
    generate(spec: {
        format: TalosDocumentFormat
        title: string
        body?: string
        rows?: string[][]
        slides?: Array<{ title: string; bullets: string[] }>
        /** Declared, not merely tolerated by structural typing. */
        report?: TalosReportInput
    }): Promise<TalosGeneratedDocument>
    verify(document: TalosGeneratedDocument): Promise<{ ok: boolean; detail: string }>
    /** Puts it in the user's Library, and returns how it can be referred to. */
    /**
     * ⛔ Torna anche il PERCORSO, non solo l'id: la scheda deve poter aprire il
     * documento, e l'id da solo non basta perche' la Libreria non ha una rotta
     * per singolo file — vedi la nota sul `dove`, poco sotto.
     */
    save(document: TalosGeneratedDocument): Promise<{ id: string, percorso?: string }>
    /** True when the user has switched diagnostics on; see talosFailureMessage. */
    diagnostics(): boolean
}

export function createTalosDocumentTools(
    sources: TalosDocumentToolSources,
): TalosToolDefinition<never>[] {
    // Numbers and booleans are converted, never refused: see the note on `rows`.
    const cell = z.union([z.string(), z.number(), z.boolean()]).transform(String)

    const create = defineTalosTool({
        name: 'document_create',
        title: 'Create a document',
        description: [
            'Create a real document file and save it to the user\'s Library.',
            'Use `report` for a laid-out PDF (cover, KPI cards, tables, bar and pie charts),',
            '`body` for prose formats (md, html, docx, pdf) or source files (py, js, ts, sql',
            'and the other code formats in the enum), `rows` for tables (csv, xlsx), and',
            '`slides` for presentations (pptx). For a source file, `format` is its real',
            'extension and `body` is preserved as UTF-8. The file is written on this device',
            'and reopened to check it is valid before you are told it succeeded.',
        ].join(' '),
        action: 'write',
        input: z.object({
            format: z.enum(TALOS_DOCUMENT_FORMATS)
                .describe('The actual output file format and final filename extension.'),
            title: z.string().min(1).describe('The document title; it also becomes the file name.'),
            body: z.string().optional()
                .describe('Prose content, or exact UTF-8 source text for a code-file format.'),
            // Numbers and booleans are ACCEPTED and converted, not refused.
            //
            // Owner's R37 trace: the model spent sixty seconds writing a
            // six-page financial report, emitted `["Milano", 520000, 4.7]` —
            // the only natural way to express a table of figures — and zod
            // rejected the whole call in milliseconds. All sixty seconds went
            // in the bin, the model rewrote the report as prose, and a request
            // for a PDF came back as HTML. A schema a model cannot satisfy on
            // the obvious first try is a defect in the schema.
            rows: z.array(z.array(cell)).optional()
                .describe('Table content. The first row is the header. Cells may be numbers.'),
            /**
             * The rich path for a real report. Semantic, never presentational:
             * no coordinates, no font sizes, no colours. A theme is NAMED, and
             * the look is decided by the generator.
             *
             * Owner's R37 trace is the reason the keys are one character long:
             * the model spent sixty seconds emitting arguments for a six-page
             * document, and every token it does not have to spend restating
             * layout is a second it does not have to spend writing.
             */
            report: z.object({
                theme: z.enum(['report', 'plain']).optional().describe('Named palette.'),
                footer: z.object({
                    text: z.string().optional(),
                    pageNo: z.boolean().optional(),
                }).optional().describe('Repeated on every page.'),
                // DISCRIMINATED, not a plain union. A union reports the whole
                // block as "Invalid input"; a discriminated one knows which
                // block it is and names the single field that is wrong — the
                // difference between a model that repairs its call and a model
                // that re-emits the same six pages and fails again.
                blocks: z.array(z.discriminatedUnion('t', [
                    z.object({
                        t: z.literal('cover'),
                        title: cell,
                        subtitle: cell.optional(),
                        date: cell.optional(),
                    }),
                    z.object({
                        t: z.literal('h'),
                        lvl: z.union([z.literal(1), z.literal(2), z.literal(3)]).optional(),
                        x: cell,
                    }),
                    z.object({ t: z.literal('p'), x: cell }),
                    z.object({ t: z.literal('note'), x: cell }),
                    z.object({
                        t: z.literal('list'),
                        items: z.array(cell),
                        ordered: z.boolean().optional(),
                    }),
                    z.object({
                        t: z.literal('kpi'),
                        // A KPI value IS a number. Refusing one cost the owner
                        // sixty seconds of writing and a whole regeneration.
                        items: z.array(z.object({ l: cell, v: cell, d: cell.optional() })),
                    }),
                    z.object({
                        t: z.literal('table'),
                        head: z.array(cell).optional(),
                        align: z.array(z.enum(['l', 'c', 'r'])).optional(),
                        rows: z.array(z.array(cell)),
                        total: z.array(cell).optional(),
                    }),
                    z.object({
                        t: z.literal('chart'),
                        kind: z.enum(['bar', 'pie']),
                        // Years on an axis are numbers, and a value the model
                        // wrote as "510" is still a value.
                        labels: z.array(cell),
                        series: z.array(z.object({
                            name: z.string().optional(),
                            data: z.array(z.coerce.number()),
                        })),
                        unit: z.string().optional(),
                    }),
                    z.object({ t: z.literal('spacer') }),
                    z.object({ t: z.literal('pb') }),
                ]))
                    // Bounded: pdfmake lays out synchronously on the phone's
                    // main thread, and 2000 blocks is eleven seconds of frozen
                    // UI. Refusing with a number the model can act on beats
                    // freezing the app.
                    .max(400, 'Too many blocks: a document may have at most 400. Split it, or summarise.')
                    .describe('The document, block by block, in order.'),
            }).optional().describe(
                'PDF ONLY: a laid-out report — cover, headings, KPI cards, tables, bar and pie'
                + ' charts. Prefer it over `body` when the user asks for a report, and never send'
                + ' both. For any other format use `body` or `rows`.',
            ),
            slides: z.array(z.object({
                title: z.string(),
                bullets: z.array(z.string()),
            })).optional().describe('Slides, for pptx.'),
        }),
        async run(input) {
            let document: TalosGeneratedDocument
            try {
                document = await sources.generate(input)
            } catch (error) {
                const detail = error instanceof Error ? error.message : String(error)
                // The owner's R37 trace: this branch fired after sixty seconds
                // of the model writing the report, and `ok: false` was all the
                // evidence there was.
                const code = /^TALOS_[A-Z0-9_]+$/.test(detail) ? detail : 'TALOS_DOCUMENT_GENERATE_FAILED'
                return { ok: false, content: `The document was not created: ${detail}`, code }
            }

            // The step everyone skips. It runs BEFORE the file reaches the
            // Library, so a broken file is never handed over at all.
            const check = await sources.verify(document)
            if (!check.ok) {
                return {
                    ok: false,
                    content: `The file was written but failed its check (${check.detail}), so it was discarded. Tell the user, and try a simpler structure.`,
                    code: 'TALOS_DOCUMENT_VERIFY_FAILED',
                }
            }

            let saved: { id: string, percorso?: string }
            try {
                saved = await sources.save(document)
            } catch (error) {
                // The real code, not a shrug. "Could not be saved" left the
                // model to invent an explanation — it told the user it was a
                // temporary storage problem, which was not true and not
                // actionable. `TALOS_ATTACHMENT_TYPE_MISMATCH` is both.
                return {
                    ok: false,
                    content: [
                        talosFailureMessage(
                            `"${document.fileName}" was created and checked, but it could not be stored in the Library, so it is not there.`,
                            error,
                            sources.diagnostics(),
                        ),
                        // Unconditional: the switch decides how much detail the
                        // user sees, never whether the model tells the truth.
                        'Tell the user it was NOT saved. Do not claim otherwise, and do not invent a cause.',
                        'Do not silently retry the same format — offer a different one, or ask.',
                    ].join(' '),
                    // Owner's R38 trace: THIS is the branch that fired, and it
                    // was the one branch with no code — so the diagnostics JSON
                    // read `errorCode: null` and the model's paraphrase ("un
                    // problema tecnico di archiviazione") was all there was.
                    // The trace must name the failure even when the model does
                    // not, because the trace is the channel that cannot be
                    // rewritten in the telling.
                    code: (() => {
                        const detail = error instanceof Error ? error.message : String(error)
                        return /^TALOS_[A-Z0-9_]+$/.test(detail) ? detail : 'TALOS_DOCUMENT_SAVE_FAILED'
                    })(),
                }
            }

            const size = Math.max(1, Math.round(document.bytes.byteLength / 1024))
            return {
                ok: true,
                /*
                 * ⛔ Il dettaglio porta la DIMENSIONE, che qui non è un
                 * abbellimento: questo attrezzo riapre il file dopo averlo
                 * scritto, e i KB sono ciò che quella rilettura ha trovato. Un
                 * documento da 0 KB scritto «con successo» si riconosce a colpo
                 * d'occhio, e la frase da sola non lo farebbe vedere.
                 */
                scheda: {
                    tipo: 'creato' as const,
                    titolo: document.fileName,
                    genere: 'Documento',
                    dettaglio: `${size} KB`,
                    /*
                     * ⛔ NIENTE `dove`, e l'ho scoperto guardando le rotte
                     * invece di assumerle: la Libreria vive su `/context` e NON
                     * ha una rotta per singolo file. Avevo scritto
                     * `/library/${saved.id}`, che non esiste — un pulsante che
                     * non porta da nessuna parte è peggio di nessun pulsante,
                     * ed è la stessa regola per cui la sveglia tace
                     * sull'annulla che la ROM non le lascia fare.
                     *
                     * ⇒ Quando la Libreria avrà una schermata per file, il
                     * `dove` arriva qui.
                     *
                     * ⭐⭐⭐ Ma un PDF non aspetta quella schermata — owner
                     * 2026-08-17: «il PDF bisogna poterlo visualizzare dentro
                     * la app». Misurato sul Pad: la scheda mostrava nome e peso
                     * e toccandola non succedeva NIENTE.
                     *
                     * ⇒ `pdf` porta il percorso, e il tocco apre il
                     * visualizzatore invece di navigare. Non e' un `dove`
                     * travestito: e' un'altra cosa, e i due non si confondono.
                     */
                    ...(document.mediaType === 'application/pdf' && saved.percorso
                        ? { pdf: saved.percorso }
                        : {}),
                },
                content: [
                    `Created "${document.fileName}" (${size} KB) and saved it to the Library.`,
                    // What the check actually found, so the model can repeat
                    // something true rather than a reassurance.
                    `Checked by reopening it: ${check.detail}.`,
                    `Library id: ${saved.id}`,
                ].join('\n'),
                evidence: {
                    file_name: document.fileName,
                    format: document.format,
                    bytes: document.bytes.byteLength,
                    verified: check.detail,
                },
            }
        },
    })

    return [create] as TalosToolDefinition<never>[]
}
