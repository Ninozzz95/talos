import { z } from 'zod'
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
    }): Promise<TalosGeneratedDocument>
    verify(document: TalosGeneratedDocument): Promise<{ ok: boolean; detail: string }>
    /** Puts it in the user's Library, and returns how it can be referred to. */
    save(document: TalosGeneratedDocument): Promise<{ id: string }>
    /** True when the user has switched diagnostics on; see talosFailureMessage. */
    diagnostics(): boolean
}

export function createTalosDocumentTools(
    sources: TalosDocumentToolSources,
): TalosToolDefinition<never>[] {
    const create = defineTalosTool({
        name: 'document_create',
        title: 'Create a document',
        description: [
            'Create a real document file and save it to the user\'s Library.',
            'Use `body` for prose formats (md, html, docx, pdf), `rows` for tables (csv, xlsx)',
            'and `slides` for presentations (pptx). The file is written on this device and',
            'reopened to check it is valid before you are told it succeeded.',
        ].join(' '),
        action: 'write',
        input: z.object({
            format: z.enum(TALOS_DOCUMENT_FORMATS).describe('The file format to produce.'),
            title: z.string().min(1).describe('The document title; it also becomes the file name.'),
            body: z.string().optional().describe('Prose content, markdown-flavoured.'),
            // Numbers and booleans are ACCEPTED and converted, not refused.
            //
            // Owner's R37 trace: the model spent sixty seconds writing a
            // six-page financial report, emitted `["Milano", 520000, 4.7]` —
            // the only natural way to express a table of figures — and zod
            // rejected the whole call in milliseconds. All sixty seconds went
            // in the bin, the model rewrote the report as prose, and a request
            // for a PDF came back as HTML. A schema a model cannot satisfy on
            // the obvious first try is a defect in the schema.
            rows: z.array(z.array(
                z.union([z.string(), z.number(), z.boolean()]).transform(String),
            )).optional()
                .describe('Table content. The first row is the header. Cells may be numbers.'),
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

            let saved: { id: string }
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
                }
            }

            const size = Math.max(1, Math.round(document.bytes.byteLength / 1024))
            return {
                ok: true,
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
