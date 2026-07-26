import { z } from 'zod'
import { defineTalosTool, type TalosToolDefinition } from '@/lib/tools/registry'
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
    save(document: TalosGeneratedDocument): Promise<{ id: string } | null>
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
            rows: z.array(z.array(z.string())).optional()
                .describe('Table content. The first row is the header.'),
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
                return { ok: false, content: `The document was not created: ${detail}` }
            }

            // The step everyone skips. It runs BEFORE the file reaches the
            // Library, so a broken file is never handed over at all.
            const check = await sources.verify(document)
            if (!check.ok) {
                return {
                    ok: false,
                    content: `The file was written but failed its check (${check.detail}), so it was discarded. Tell the user, and try a simpler structure.`,
                }
            }

            const saved = await sources.save(document).catch(() => null)
            if (!saved) {
                return {
                    ok: false,
                    content: `"${document.fileName}" was created and verified but could not be saved to the Library.`,
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
