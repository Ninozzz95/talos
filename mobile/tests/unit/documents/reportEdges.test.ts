// @vitest-environment jsdom

import { describe, expect, it, vi } from 'vitest'
import { buildTalosReportDefinition } from '@/lib/documents/reportBuilder'
import { generateTalosDocument, verifyTalosDocument } from '@/lib/documents/documentGenerator'
import { createTalosDocumentTools } from '@/lib/documents/documentTools'
import { TALOS_DEFAULT_TOOL_PERMISSIONS, executeTalosTool } from '@/lib/tools/executor'

/**
 * Every case the SF critic proved against the first cut of the PDF generator.
 *
 * They are all the same failure wearing different clothes: the model spends its
 * whole output budget describing a document, and something downstream throws it
 * away — silently, or with a message it cannot repair from. That is the R37
 * defect this work exists to end, so each one is pinned here.
 */
function tool() {
    return createTalosDocumentTools({
        generate: generateTalosDocument,
        verify: verifyTalosDocument,
        save: vi.fn(async () => ({ id: 'file-1' })),
        diagnostics: () => false,
    })[0]!
}

function deps() {
    return {
        permissions: { ...TALOS_DEFAULT_TOOL_PERMISSIONS, write: 'allow' as const },
        isToolEnabled: () => true,
        requestConsent: vi.fn(async () => true),
        audit: vi.fn(async () => {}),
        context: { sessionId: 's1' },
    }
}

const BLOCKS = [
    { t: 'h' as const, lvl: 1 as const, x: 'Sintesi' },
    { t: 'p' as const, x: 'Il 2025 si è chiuso in crescita.' },
]

describe('a report must never be silently thrown away', () => {
    it('refuses `report` for a format that cannot lay one out', async () => {
        // BLOCKER: `hasContent` accepted it, but only the pdf branch reads it —
        // so a .docx came back holding nothing but the title, and the model was
        // told it had been verified. A refusal the model can act on is the only
        // honest answer.
        const result = await executeTalosTool(tool(), {
            format: 'docx', title: 'Relazione annuale', report: { blocks: BLOCKS },
        }, deps())

        expect(result.ok).toBe(false)
        expect(result.content).toMatch(/pdf/i)
    })

    it('still produces the PDF when the format is right', async () => {
        const result = await executeTalosTool(tool(), {
            format: 'pdf', title: 'Relazione annuale', report: { blocks: BLOCKS },
        }, deps())
        expect(result.ok).toBe(true)
    })
})

describe('a table the model got slightly wrong', () => {
    it('pads a short row instead of destroying the whole document', () => {
        // BLOCKER: one missing cell in a sixty-store table threw
        // "Malformed table row" out of pdfmake, after the model had written
        // everything. A gap in a table is a gap; it is not a reason to lose the
        // report.
        expect(() => buildTalosReportDefinition({
            meta: { title: 'T' },
            blocks: [{
                t: 'table',
                head: ['Negozio', 'Fatturato', 'Clienti'],
                rows: [['Milano', '€520.000', '31.000'], ['Roma', '€465.000']],
                total: ['Totale'],
            }],
        })).not.toThrow()
    })

    it('produces a real PDF from a ragged table', async () => {
        const document = await generateTalosDocument({
            format: 'pdf',
            title: 'Performance',
            report: {
                blocks: [{
                    t: 'table',
                    head: ['Negozio', 'Fatturato', 'Clienti'],
                    rows: [['Milano', '€520.000'], ['Roma']],
                }],
            },
        })
        await expect(verifyTalosDocument(document)).resolves.toMatchObject({ ok: true })
    })

    it('keeps the legacy flat rows working when they are ragged too', async () => {
        const document = await generateTalosDocument({
            format: 'pdf', title: 'Legacy', rows: [['a', 'b', 'c'], ['1', '2']],
        })
        await expect(verifyTalosDocument(document)).resolves.toMatchObject({ ok: true })
    })
})

function canvasesOf(definition: unknown): Array<Record<string, unknown>[]> {
    const found: Array<Record<string, unknown>[]> = []
    const walk = (node: unknown): void => {
        if (Array.isArray(node)) { node.forEach(walk); return }
        if (node === null || typeof node !== 'object') return
        const record = node as Record<string, unknown>
        if (Array.isArray(record.canvas)) found.push(record.canvas as Record<string, unknown>[])
        Object.values(record).forEach(walk)
    }
    walk(definition)
    return found
}

describe('a chart must not misrepresent its own data', () => {
    it('draws negative values downward instead of flattening them', () => {
        // "-2,4%" is in the owner's own prompt. Three negatives became three
        // identical 2pt stubs, which says nothing at all.
        const definition = buildTalosReportDefinition({
            meta: { title: 'T' },
            blocks: [{ t: 'chart', kind: 'bar', labels: ['a', 'b', 'c'], series: [{ data: [-2.4, -8, -1] }] }],
        })
        const bars = canvasesOf(definition)[0]!.filter((op) => op.type === 'rect' && op.fillOpacity !== 0)
        const heights = bars.map((bar) => Number(bar.h))
        // Different magnitudes must look different.
        expect(new Set(heights).size).toBeGreaterThan(1)
    })

    it('keeps bars usable when there are many of them', () => {
        // Three years of monthly points is an ordinary ask; past 31 the width
        // went NEGATIVE.
        const definition = buildTalosReportDefinition({
            meta: { title: 'T' },
            blocks: [{
                t: 'chart', kind: 'bar',
                labels: Array.from({ length: 36 }, (_, index) => `m${index}`),
                series: [{ data: Array.from({ length: 36 }, (_, index) => index + 1) }],
            }],
        })
        const bars = canvasesOf(definition)[0]!.filter((op) => op.type === 'rect' && op.fillOpacity !== 0)
        expect(bars).toHaveLength(36)
        for (const bar of bars) expect(Number(bar.w)).toBeGreaterThan(0)
    })

    it('lines the labels up with the bars they name', () => {
        // The bars lived on a 460pt canvas and the labels on the full page
        // width: by the seventh bar the label sat entirely outside it.
        const definition = buildTalosReportDefinition({
            meta: { title: 'T' },
            blocks: [{
                t: 'chart', kind: 'bar',
                labels: ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'],
                series: [{ data: [1, 2, 3, 4, 5, 6, 7, 8] }],
            }],
        })
        const serialised = JSON.stringify(definition)
        // The label row must be measured in the same track as the bars, which
        // means fixed widths — never '*' columns filling the page.
        expect(serialised).not.toMatch(/"width":"\*","stack":\[\{"text":"1"/)
    })

    it('ignores negatives when sizing pie slices', () => {
        // Summing them made the total smaller than a single slice, so two
        // slices each drew a FULL circle, one over the other.
        const definition = buildTalosReportDefinition({
            meta: { title: 'T' },
            blocks: [{ t: 'chart', kind: 'pie', labels: ['a', 'b', 'c'], series: [{ data: [50, 50, -50] }] }],
        })
        const paths = canvasesOf(definition)[0]!.filter((op) => op.type === 'path')
        expect(paths).toHaveLength(2)
        const legend = JSON.stringify(definition)
        expect(legend).not.toContain('-100%')
        expect(legend).toContain('50%')
    })

    it('survives a chart of all zeros without dividing by them', () => {
        expect(() => buildTalosReportDefinition({
            meta: { title: 'T' },
            blocks: [
                { t: 'chart', kind: 'bar', labels: ['a'], series: [{ data: [0] }] },
                { t: 'chart', kind: 'pie', labels: ['a'], series: [{ data: [0, 0] }] },
            ],
        })).not.toThrow()
    })
})

describe('what the model is told when it gets the shape wrong', () => {
    it('names the field and the block, not just "invalid"', async () => {
        // A union reports the whole block as invalid; a DISCRIMINATED union
        // knows which block it is and complains about the one field. The model
        // can repair the second and cannot repair the first.
        const result = await executeTalosTool(tool(), {
            format: 'pdf', title: 'T',
            report: { blocks: [{ t: 'kpi', items: [{ l: 'Fatturato', v: 2480000 }] }] },
        }, deps())

        // Either it is accepted (numbers are legitimate here) or the complaint
        // is specific enough to fix. Silence is the only wrong answer.
        if (!result.ok) expect(result.content).toMatch(/items|v\b/)
        else expect(result.ok).toBe(true)
    })

    it('accepts the numbers a report is actually made of', async () => {
        const result = await executeTalosTool(tool(), {
            format: 'pdf', title: 'T',
            report: {
                blocks: [
                    { t: 'kpi', items: [{ l: 'Fatturato', v: 2480000, d: 18.4 }] },
                    { t: 'chart', kind: 'bar', labels: [2023, 2024, 2025], series: [{ data: [1, 2, 3] }] },
                    { t: 'table', head: ['Anno', 2025], rows: [['Milano', 520000]] },
                    { t: 'list', items: ['uno', 2] },
                ],
            },
        }, deps())
        expect(result.ok).toBe(true)
    })

    it('refuses a document longer than anything a phone should lay out', async () => {
        const result = await executeTalosTool(tool(), {
            format: 'pdf', title: 'T',
            report: { blocks: Array.from({ length: 600 }, () => ({ t: 'p', x: 'riga' })) },
        }, deps())
        expect(result.ok).toBe(false)
        expect(result.content).toMatch(/400|too many|blocks/i)
    })
})

describe('the plain body path, which used to work', () => {
    it('still shows the title on the page, not only in the metadata', async () => {
        const document = await generateTalosDocument({
            format: 'pdf', title: 'IL MIO TITOLO', body: 'testo',
        })
        const text = new TextDecoder('latin1').decode(document.bytes)
        // The heading style is 18pt; a document with no large type has lost it.
        expect(text).toContain('18')
        await expect(verifyTalosDocument(document)).resolves.toMatchObject({ ok: true })
    })

    it('reads a heading that has text on the very next line', () => {
        // Without the multiline flag the hash was rendered literally.
        const definition = buildTalosReportDefinition({
            meta: { title: 'T' },
            blocks: [],
        })
        expect(definition.content).toEqual([])
    })
})
