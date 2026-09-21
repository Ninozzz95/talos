import { describe, expect, it } from 'vitest'
import { generateTalosDocument, verifyTalosDocument } from '@/lib/documents/documentGenerator'

/**
 * Owner's R37 trace, 2026-07-26: `document_create` failed after the model had
 * spent sixty seconds writing a six-page report, and the whole thing was
 * regenerated as HTML. Forty per cent of a 110-second wait went to that retry.
 *
 * Reproducing it here rather than asking him to run it again — the rule is to
 * reproduce before claiming anything, and a failing test is the only version of
 * "why" that cannot be argued with.
 */
const REPORT_BODY = [
    '# Report Annuale 2025 – Aurora Coffee Italia',
    '',
    'Analisi delle vendite, dei clienti e delle prospettive di crescita.',
    '',
    '## Sintesi esecutiva',
    'Fatturato annuale: €2.480.000 — crescita del +18,4% rispetto al 2024.',
    'Clienti: 146.000. Scontrino medio: €17,00. Dodici punti vendita in Italia.',
    '',
    '## Vendite trimestrali',
    'Q1 €510.000 · Q2 €590.000 · Q3 €625.000 · Q4 €755.000',
    '',
    '## Profilo dei clienti',
    '18–24 anni: 22% · 25–34 anni: 36% · 35–44 anni: 24% · oltre 55: 6%',
    '',
    'Documento dimostrativo – Tutti i dati presenti sono fittizi.',
].join('\n')

const STORE_ROWS = [
    ['Punto vendita', 'Fatturato', 'Clienti', 'Valutazione', 'Variazione'],
    ['Milano', '€520.000', '31.000', '4,7', '+21,3%'],
    ['Roma', '€465.000', '28.400', '4,5', '+17,8%'],
    ['Torino', '€388.000', '23.100', '4,6', '+15,2%'],
    ['Bologna', '€352.000', '20.900', '4,4', '+12,9%'],
    ['Firenze', '€401.000', '24.200', '4,8', '+19,6%'],
    ['Napoli', '€354.000', '18.400', '4,3', '+9,7%'],
]

describe('the PDF the owner actually asked for', () => {
    it('survives Italian accents and the euro sign', async () => {
        const document = await generateTalosDocument({
            format: 'pdf',
            title: 'Report Annuale 2025 – Aurora Coffee Italia',
            body: REPORT_BODY,
        })
        await expect(verifyTalosDocument(document)).resolves.toMatchObject({ ok: true })
    })

    it('accepts a table without losing it', async () => {
        const document = await generateTalosDocument({
            format: 'pdf',
            title: 'Performance dei punti vendita',
            rows: STORE_ROWS,
        })
        await expect(verifyTalosDocument(document)).resolves.toMatchObject({ ok: true })
    })

    it('handles body and table together, which is what a report is', async () => {
        const document = await generateTalosDocument({
            format: 'pdf',
            title: 'Report Annuale 2025 – Aurora Coffee Italia',
            body: REPORT_BODY,
            rows: STORE_ROWS,
        })
        await expect(verifyTalosDocument(document)).resolves.toMatchObject({ ok: true })
    })

    it('does not fall over on a six-page document', async () => {
        const document = await generateTalosDocument({
            format: 'pdf',
            title: 'Report Annuale 2025',
            body: Array.from({ length: 6 }, () => REPORT_BODY).join('\n\n'),
            rows: STORE_ROWS,
        })
        await expect(verifyTalosDocument(document)).resolves.toMatchObject({ ok: true })
    })
})

/**
 * The 286-millisecond failure in the owner's R37 trace.
 *
 * The generator handles the content above perfectly well, so the refusal came
 * from further up: the argument schema demanded every table cell be a STRING,
 * and an annual report is nothing but numbers. The model emitted
 * `["Milano", 520000, 31000, 4.7]`, zod rejected it in milliseconds, and the
 * sixty seconds spent writing the document went in the bin. It then rewrote the
 * whole thing as prose, which is why a PDF request came back as HTML.
 *
 * A schema that a model cannot satisfy on the obvious first try is a defect in
 * the schema, not in the model.
 */
import { vi } from 'vitest'
import { createTalosDocumentTools } from '@/lib/documents/documentTools'
import { TALOS_DEFAULT_TOOL_PERMISSIONS, executeTalosTool } from '@/lib/tools/executor'

describe('a table full of numbers, which is what a report is', () => {
    function documentTool() {
        return createTalosDocumentTools({
            generate: vi.fn(async (spec) => ({
                format: spec.format,
                fileName: 'Report.pdf',
                mediaType: 'application/pdf',
                bytes: new Uint8Array([1, 2, 3]),
                spec,
            })),
            verify: vi.fn(async () => ({ ok: true, detail: '6 pages' })),
            save: vi.fn(async () => ({ id: 'file-1' })),
            diagnostics: () => false,
        })[0]!
    }

    it('accepts numeric cells instead of throwing the whole document away', async () => {
        const result = await executeTalosTool(documentTool(), {
            format: 'pdf',
            title: 'Performance dei punti vendita',
            rows: [
                ['Punto vendita', 'Fatturato', 'Clienti', 'Valutazione'],
                ['Milano', 520000, 31000, 4.7],
                ['Roma', 465000, 28400, 4.5],
            ],
        }, {
            permissions: { ...TALOS_DEFAULT_TOOL_PERMISSIONS, write: 'allow' as const },
            isToolEnabled: () => true,
            requestConsent: vi.fn(async () => true),
            audit: vi.fn(async () => {}),
            context: { sessionId: 's1' },
        })

        expect(result.code).toBeUndefined()
        expect(result.ok).toBe(true)
    })
})
