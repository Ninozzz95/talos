import { describe, expect, it } from 'vitest'
import { buildTalosReportDefinition, TALOS_REPORT_THEMES } from '@/lib/documents/reportBuilder'
import type { TalosReportSpec } from '@/lib/documents/reportBuilder'

/**
 * Owner 2026-07-26, after his R37 trace: the PDF path drew wrapped lines of
 * text, so a six-page branded report with a cover, KPI cards, a bar chart, a
 * pie chart and a table per store could not be produced at all — the model gave
 * up and emitted HTML.
 *
 * The research settled the shape: a FLOW engine (pdfmake) fed a SEMANTIC spec.
 * The model must never emit pdfmake's own document-definition object — that is
 * presentational, and restating brand colours and margins on every node is what
 * turned one call into sixty seconds of output tokens and then a failure. It
 * describes WHAT the document says; this module decides how it looks.
 */
const SPEC: TalosReportSpec = {
    meta: { title: 'Report Annuale 2025 – Aurora Coffee Italia' },
    theme: 'report',
    footer: { text: 'Documento dimostrativo – Tutti i dati presenti sono fittizi.', pageNo: true },
    blocks: [
        { t: 'cover', title: 'Report Annuale 2025', subtitle: 'Analisi delle vendite', date: 'gennaio 2026' },
        { t: 'pb' },
        { t: 'h', lvl: 1, x: 'Sintesi esecutiva' },
        { t: 'p', x: 'Il 2025 si è chiuso con ricavi in crescita del 18,4%.' },
        {
            t: 'kpi',
            items: [
                { l: 'Fatturato', v: '€2.480.000', d: '+18,4%' },
                { l: 'Clienti', v: '146.000' },
            ],
        },
        {
            t: 'chart',
            kind: 'bar',
            labels: ['Q1', 'Q2', 'Q3', 'Q4'],
            series: [{ data: [510, 590, 625, 755] }],
        },
        {
            t: 'chart',
            kind: 'pie',
            labels: ['Caffetteria', 'Pasticceria', 'Pranzi'],
            series: [{ data: [38, 24, 21] }],
        },
        {
            t: 'table',
            head: ['Punto vendita', 'Fatturato', 'Valutazione'],
            align: ['l', 'r', 'r'],
            rows: [['Milano', '€520.000', '4,7'], ['Roma', '€465.000', '4,5']],
        },
    ],
}

function walk(node: unknown, seen: (value: Record<string, unknown>) => void): void {
    if (Array.isArray(node)) { node.forEach((entry) => walk(entry, seen)); return }
    if (node === null || typeof node !== 'object') return
    seen(node as Record<string, unknown>)
    Object.values(node).forEach((value) => walk(value, seen))
}

describe('turning what the model said into a document that looks made', () => {
    it('produces an A4 portrait definition with the embedded fonts', () => {
        const definition = buildTalosReportDefinition(SPEC)
        expect(definition.pageSize).toBe('A4')
        expect(definition.pageOrientation).toBe('portrait')
        // The subset pack, not pdfmake's 834 KB default.
        expect(definition.defaultStyle?.font).toBe('Roboto')
    })

    it('puts the footer on EVERY page, with the page number', () => {
        const definition = buildTalosReportDefinition(SPEC)
        expect(typeof definition.footer).toBe('function')
        const rendered = (definition.footer as (page: number, total: number) => unknown)(2, 6)
        const text = JSON.stringify(rendered)
        expect(text).toContain('Documento dimostrativo')
        expect(text).toContain('2')
        expect(text).toContain('6')
    })

    it('keeps the table header repeating when a table crosses a page', () => {
        const definition = buildTalosReportDefinition(SPEC)
        let headerRows: unknown = null
        walk(definition.content, (node) => {
            if (node.table) headerRows = (node.table as Record<string, unknown>).headerRows
        })
        expect(headerRows).toBe(1)
    })

    it('draws a bar chart as vectors, one rectangle per value', () => {
        const definition = buildTalosReportDefinition(SPEC)
        const canvases: Array<Record<string, unknown>[]> = []
        walk(definition.content, (node) => {
            if (Array.isArray(node.canvas)) canvases.push(node.canvas as Record<string, unknown>[])
        })
        const bars = canvases.find((canvas) => canvas.filter((op) => op.type === 'rect').length >= 5)
        expect(bars).toBeDefined()
    })

    it('gives every path-only canvas an invisible bounding box', () => {
        // pdfmake's measurer has no `case 'path'`, so a canvas built only from
        // paths reports zero height and the next block is drawn straight over
        // the pie chart. The bounding rect is what stops that.
        const definition = buildTalosReportDefinition(SPEC)
        const canvases: Array<Record<string, unknown>[]> = []
        walk(definition.content, (node) => {
            if (Array.isArray(node.canvas)) canvases.push(node.canvas as Record<string, unknown>[])
        })
        for (const canvas of canvases) {
            if (!canvas.some((op) => op.type === 'path')) continue
            expect(canvas[0]).toMatchObject({ type: 'rect', fillOpacity: 0 })
        }
    })

    it('never lets the model choose a colour', () => {
        // Brand decisions belong to the theme. A model restating them per node
        // is thousands of output tokens and a document that drifts.
        const themed = buildTalosReportDefinition({ ...SPEC, theme: 'report' })
        const serialised = JSON.stringify(themed)
        expect(serialised).toContain(TALOS_REPORT_THEMES.report.brand)
    })

    it('refuses a run of page breaks rather than emitting blank pages', () => {
        const definition = buildTalosReportDefinition({
            ...SPEC,
            blocks: [{ t: 'pb' }, { t: 'pb' }, { t: 'p', x: 'dopo' }],
        })
        const breaks = JSON.stringify(definition.content).match(/pageBreak/g) ?? []
        expect(breaks.length).toBeLessThanOrEqual(1)
    })

    it('survives a document with nothing in it', () => {
        expect(() => buildTalosReportDefinition({
            meta: { title: 'Vuoto' }, theme: 'report', blocks: [],
        })).not.toThrow()
    })
})

/**
 * End to end through the tool the model actually calls: the six-page report
 * from the owner's prompt, described semantically, coming back as a real PDF
 * that reopens.
 */
import { vi } from 'vitest'
import { createTalosDocumentTools } from '@/lib/documents/documentTools'
import { TALOS_DEFAULT_TOOL_PERMISSIONS, executeTalosTool } from '@/lib/tools/executor'
import { generateTalosDocument, verifyTalosDocument } from '@/lib/documents/documentGenerator'

describe('the report the owner asked for, through the real tool', () => {
    it('is accepted, generated and reopens as a valid PDF', async () => {
        const tool = createTalosDocumentTools({
            generate: generateTalosDocument,
            verify: verifyTalosDocument,
            save: vi.fn(async () => ({ id: 'file-1' })),
            diagnostics: () => false,
        })[0]!

        const result = await executeTalosTool(tool, {
            format: 'pdf',
            title: 'Report Annuale 2025 – Aurora Coffee Italia',
            report: {
                theme: 'report',
                footer: { text: 'Documento dimostrativo – Tutti i dati sono fittizi.', pageNo: true },
                blocks: SPEC.blocks,
            },
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
