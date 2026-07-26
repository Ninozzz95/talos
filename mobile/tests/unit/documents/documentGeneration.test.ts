import { describe, expect, it } from 'vitest'
import {
    TALOS_DOCUMENT_FORMATS,
    generateTalosDocument,
    verifyTalosDocument,
} from '@/lib/documents/documentGenerator'

/**
 * F2 — generating documents on the device.
 *
 * The vision document's pipeline is `generate → parse → preview → quality check
 * → correct → export`, and the step everyone skips is the quality check. So it
 * is the shape of this whole test file: nothing is asserted about the bytes we
 * *meant* to write. Every format is generated, RE-OPENED, and inspected.
 *
 * A corrupt DOCX handed over with confidence is worse than a refusal: the user
 * finds out in front of whoever they sent it to.
 */
const SPEC = {
    title: 'Fattura novembre',
    body: [
        '# Fattura novembre',
        '',
        'Il totale dovuto è di **2196 euro**, con pagamento a trenta giorni.',
        '',
        '- Prima voce',
        '- Seconda voce',
    ].join('\n'),
    rows: [
        ['Voce', 'Importo'],
        ['Consulenza', '1800'],
        ['Spese', '396'],
    ],
    slides: [
        { title: 'Riepilogo', bullets: ['Totale 2196 euro', 'Scadenza a trenta giorni'] },
        { title: 'Dettaglio', bullets: ['Consulenza 1800', 'Spese 396'] },
    ],
}

describe('document generation', () => {
    it('offers every format the owner decided, together (D9)', () => {
        expect([...TALOS_DOCUMENT_FORMATS].sort())
            .toEqual(['csv', 'docx', 'html', 'md', 'pdf', 'pptx', 'xlsx'])
    })

    for (const format of TALOS_DOCUMENT_FORMATS) {
        it(`${format}: is generated, then RE-OPENED and found valid`, async () => {
            const document = await generateTalosDocument({ format, ...SPEC })

            expect(document.bytes.byteLength).toBeGreaterThan(0)
            expect(document.fileName.endsWith(`.${format}`)).toBe(true)
            expect(document.mediaType).not.toBe('')

            // The quality check: not "we wrote something", but "we opened what
            // we wrote and it is what we claimed".
            const check = await verifyTalosDocument(document)
            expect(check.ok, `${format}: ${check.detail}`).toBe(true)
            // And it must be able to SAY what it found, because "verified" with
            // nothing behind it is exactly the empty promise being fixed.
            expect(check.detail.length).toBeGreaterThan(0)
        }, 30_000)
    }

    it('the spreadsheet really contains the rows, not just a valid container', async () => {
        const document = await generateTalosDocument({ format: 'xlsx', ...SPEC })
        const check = await verifyTalosDocument(document)
        expect(check.detail).toMatch(/3 rows/i)
    })

    it('the presentation really contains the slides', async () => {
        const document = await generateTalosDocument({ format: 'pptx', ...SPEC })
        const check = await verifyTalosDocument(document)
        expect(check.detail).toMatch(/2 slides/i)
    })

    it('the pdf really has a page', async () => {
        const document = await generateTalosDocument({ format: 'pdf', ...SPEC })
        const check = await verifyTalosDocument(document)
        expect(check.detail).toMatch(/page/i)
    })

    it('a truncated file is CAUGHT, which is the whole point of re-opening it', async () => {
        const document = await generateTalosDocument({ format: 'docx', ...SPEC })
        const damaged = {
            ...document,
            bytes: document.bytes.slice(0, Math.floor(document.bytes.byteLength / 2)),
        }
        const check = await verifyTalosDocument(damaged)
        expect(check.ok).toBe(false)
    }, 30_000)

    it('empty content is refused before a file is written, not after', async () => {
        await expect(generateTalosDocument({ format: 'md', title: '', body: '' }))
            .rejects.toThrow(/TALOS_DOCUMENT_EMPTY/)
    })

    it('the text formats carry the content verbatim, so nothing is lost in translation', async () => {
        // md and html render the prose; csv renders the ROWS, which are
        // different content. Asserting the same string against both would be a
        // test that passes for the wrong reason.
        for (const format of ['md', 'html'] as const) {
            const text = new TextDecoder().decode((await generateTalosDocument({ format, ...SPEC })).bytes)
            expect(text).toContain('2196 euro')
        }
        const csv = new TextDecoder().decode((await generateTalosDocument({ format: 'csv', ...SPEC })).bytes)
        expect(csv).toContain('Consulenza,1800')
    })

    it('csv quotes the fields that would otherwise break the file', async () => {
        const document = await generateTalosDocument({
            format: 'csv',
            title: 'x',
            rows: [['Voce'], ['Consulenza, urgente'], ['Ha detto "ok"']],
        })
        const text = new TextDecoder().decode(document.bytes)
        // RFC 4180: an unquoted comma silently splits a column and corrupts
        // every row after it, with nothing looking wrong on the surface.
        expect(text).toContain('"Consulenza, urgente"')
        expect(text).toContain('""ok""')
    })

    it('html escapes the content instead of letting it become markup', async () => {
        const document = await generateTalosDocument({
            format: 'html',
            title: '<script>alert(1)</script>',
            body: 'testo & altro',
        })
        const text = new TextDecoder().decode(document.bytes)
        // The body is model output, and model output can contain anything a web
        // page contained. It is content, never markup.
        expect(text).not.toContain('<script>alert(1)</script>')
        expect(text).toContain('&amp;')
    })

    it('a file name is safe for a filesystem, whatever the title contains', async () => {
        const document = await generateTalosDocument({
            format: 'md',
            title: 'Fattura 11/2026: "urgente" \\ finale',
            body: 'x'.repeat(50),
        })
        expect(document.fileName).not.toMatch(/[/\\:"*?<>|]/)
    })
})
