// @vitest-environment jsdom

import { describe, expect, it } from 'vitest'
import {
    TALOS_SOURCE_TEXT_FORMATS,
    generateTalosDocument,
} from '@/lib/documents/documentGenerator'
import { analyzeTalosMobileAttachment } from '@/lib/chat/attachmentAnalysis'

/**
 * Owner testing 2026-07-26: the model reported saving a PDF to the Library and
 * no file appeared; the same for xlsx; docx worked.
 *
 * The generator is not the problem — `documentGeneration.test.ts` reopens every
 * format and finds it valid. The SINK is: a generated file goes through the same
 * ingestion pipeline as a user upload, and that pipeline has an allowlist built
 * for uploads. TALOS was generating formats it then refused to store.
 *
 * So this test asserts the thing nobody had asserted: that what the generator
 * produces can actually be INGESTED. A document that cannot be saved is not a
 * document, and a tool that reports success for one is worse than a tool that
 * fails — the model repeats the claim to the user.
 */
const SPEC = {
    title: 'Report Annuale 2025',
    body: ['# Report', '', 'Fatturato 2.480.000 euro, crescita del 18,4 per cento.'].join('\n'),
    rows: [['Trimestre', 'Ricavi'], ['Q1', '510000'], ['Q2', '590000']],
    slides: [{ title: 'Sintesi', bullets: ['Fatturato in crescita'] }],
}

const BINARY = ['docx', 'xlsx', 'pptx', 'pdf'] as const

describe('every generated format survives the ingestion pipeline', () => {
    for (const format of BINARY) {
        it(`${format}: is accepted by the analyser that guards the Library`, async () => {
            const document = await generateTalosDocument({ format, ...SPEC })

            const analysis = await analyzeTalosMobileAttachment({
                bytes: document.bytes,
                name: document.fileName,
                declaredMediaType: document.mediaType,
            })

            expect(analysis.sha256).toMatch(/^[0-9a-f]{64}$/)
            expect(analysis.extension).toBe(format)
        }, 60_000)
    }

    for (const format of ['md', 'csv', 'html'] as const) {
        it(`${format}: the text formats too`, async () => {
            const document = await generateTalosDocument({ format, ...SPEC })
            const analysis = await analyzeTalosMobileAttachment({
                bytes: document.bytes,
                name: document.fileName,
                declaredMediaType: document.mediaType,
            })
            expect(analysis.extractedText.length).toBeGreaterThan(0)
        }, 30_000)
    }
})

describe('the exact document the owner asked for', () => {
    it('SOURCE-FILE-03 every advertised source extension survives the real ingestion guard', async () => {
        for (const format of TALOS_SOURCE_TEXT_FORMATS) {
            const body = `sample for .${format}\n`
            const document = await generateTalosDocument({
                format,
                title: `source.${format}`,
                body,
            })
            const analysis = await analyzeTalosMobileAttachment({
                bytes: document.bytes,
                name: document.fileName,
                declaredMediaType: document.mediaType,
            })

            expect(analysis.extension).toBe(format)
            expect(analysis.extractedText).toBe(body)
        }
    })

    it('SOURCE-FILE-03 a generated Python file survives the real ingestion guard', async () => {
        const document = await generateTalosDocument({
            format: 'py',
            title: 'patch_mock_gps_iterm.py',
            body: 'print("caffè")\n',
        })
        const analysis = await analyzeTalosMobileAttachment({
            bytes: document.bytes,
            name: document.fileName,
            declaredMediaType: document.mediaType,
        })

        expect(analysis.extension).toBe('py')
        expect(analysis.mediaType).toBe('text/plain')
        expect(analysis.extractedText).toBe('print("caffè")\n')
    })

    it('a long title with an en-dash still yields a storable pdf', async () => {
        // His file was "Report Annuale 2025 – Aurora Coffee Italia.pdf". The
        // dash and the length are the only differences from the case that
        // passes, so they are what gets tested rather than guessed at.
        const document = await generateTalosDocument({
            format: 'pdf',
            title: 'Report Annuale 2025 – Aurora Coffee Italia',
            body: Array.from({ length: 120 }, (_, index) =>
                `Riga ${index}: fatturato in crescita del 18,4 per cento sull'anno precedente.`).join('\n'),
        })
        expect(document.fileName).toBe('Report Annuale 2025 – Aurora Coffee Italia.pdf')
        const analysis = await analyzeTalosMobileAttachment({
            bytes: document.bytes,
            name: document.fileName,
            declaredMediaType: document.mediaType,
        })
        expect(analysis.extension).toBe('pdf')
    }, 60_000)
})
