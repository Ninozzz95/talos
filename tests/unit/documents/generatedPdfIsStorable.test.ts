// @vitest-environment jsdom

import { describe, expect, it } from 'vitest'
import { generateTalosDocument } from '@/lib/documents/documentGenerator'
import { analyzeTalosMobileAttachment } from '@/lib/chat/attachmentAnalysis'

/**
 * Owner's R38 run: the PDF was generated and passed its own check, and then
 * "non è stato possibile salvarlo nella Libreria a causa di un problema tecnico
 * di archiviazione" — and the model went on to offer him DOCX, MD or PPTX
 * instead, which is the worst possible outcome of a working generator.
 *
 * Saving re-ANALYSES the bytes: signature, media type, and for a PDF an actual
 * text-and-page-count extraction. Making a file is therefore not enough — it
 * has to survive being read back by a different library than the one that wrote
 * it. That gap is exactly where this failed, so it is pinned here.
 */
const REPORT = {
    format: 'pdf' as const,
    title: 'Report Annuale 2025 – Aurora Coffee Italia',
    report: {
        theme: 'report',
        footer: { text: 'Documento dimostrativo – Tutti i dati sono fittizi.', pageNo: true },
        blocks: [
            { t: 'cover' as const, title: 'Report Annuale 2025', subtitle: 'Analisi delle vendite', date: 'gennaio 2026' },
            { t: 'pb' as const },
            { t: 'h' as const, lvl: 1 as const, x: 'Sintesi esecutiva' },
            { t: 'p' as const, x: 'Fatturato €2.480.000, in crescita del 18,4% — con 146.000 clienti.' },
            {
                t: 'kpi' as const,
                items: [{ l: 'Fatturato', v: '€2.480.000', d: '+18,4%' }, { l: 'Clienti', v: '146.000' }],
            },
            {
                t: 'chart' as const, kind: 'bar' as const,
                labels: ['Q1', 'Q2', 'Q3', 'Q4'],
                series: [{ data: [510, 590, 625, 755] }],
            },
            {
                t: 'chart' as const, kind: 'pie' as const,
                labels: ['Caffetteria', 'Pasticceria', 'Pranzi'],
                series: [{ data: [38, 24, 21] }],
            },
            {
                t: 'table' as const,
                head: ['Punto vendita', 'Fatturato', 'Valutazione'],
                align: ['l' as const, 'r' as const, 'r' as const],
                rows: [['Milano', '€520.000', '4,7'], ['Roma', '€465.000', '4,5']],
            },
        ],
    },
}

describe('a document TALOS made must survive being read back', () => {
    it('is accepted by the same analysis the Library runs on save', async () => {
        const document = await generateTalosDocument(REPORT)

        const analysis = await analyzeTalosMobileAttachment({
            bytes: document.bytes,
            name: document.fileName,
            declaredMediaType: document.mediaType,
        })

        expect(analysis.mediaType).toBe('application/pdf')
        expect(analysis.extension).toBe('pdf')
        // Page count is what the Library shows; zero means the extraction gave
        // up quietly rather than throwing.
        expect(analysis.pageCount).toBeGreaterThan(0)
    })

    it('reads back the accented text and the euro sign it was given', async () => {
        const document = await generateTalosDocument(REPORT)
        const analysis = await analyzeTalosMobileAttachment({
            bytes: document.bytes,
            name: document.fileName,
            declaredMediaType: document.mediaType,
        })
        // The whole point of embedding a real font: these must come back out.
        expect(analysis.extractedText).toContain('€')
        expect(analysis.extractedText.toLowerCase()).toContain('crescita')
    })
})
