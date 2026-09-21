// @vitest-environment jsdom

import { describe, expect, it } from 'vitest'
import {
    TALOS_DOCUMENT_FORMATS,
    TALOS_SOURCE_TEXT_FORMATS,
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
        expect(TALOS_SOURCE_TEXT_FORMATS).toEqual([
            'txt', 'json', 'xml',
            'js', 'jsx', 'ts', 'tsx', 'vue',
            'css', 'scss', 'php', 'py', 'rb', 'go', 'rs', 'java', 'kt', 'kts',
            'swift', 'c', 'h', 'cpp', 'hpp', 'cs',
            'sh', 'bash', 'zsh', 'ps1', 'sql',
            'yaml', 'yml', 'toml', 'ini',
        ])
        expect(TALOS_DOCUMENT_FORMATS).toEqual([
            'md', 'csv', 'html', 'docx', 'xlsx', 'pptx', 'pdf',
            ...TALOS_SOURCE_TEXT_FORMATS,
        ])
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

    it('P2-FILENAME-03 never persists a partial emoji at the document-name boundary', async () => {
        const document = await generateTalosDocument({
            format: 'md',
            title: `${'a'.repeat(59)}😀tail`,
            body: 'verified body',
        })

        expect(document.fileName).toBe(`${'a'.repeat(59)}.md`)
        expect(document.fileName).not.toMatch(/[\ud800-\udfff](?![\udc00-\udfff])/u)
    })

    it('SOURCE-FILE-01/02 keeps one Python suffix and exact UTF-8 source bytes', async () => {
        const body = '# esempio\nprint("caffè 你好")\n'
        const document = await generateTalosDocument({
            format: 'py',
            title: 'patch_mock_gps_iterm.py',
            body,
        })

        expect(document.fileName).toBe('patch_mock_gps_iterm.py')
        expect(document.mediaType).toBe('text/plain')
        expect(new TextDecoder('utf-8', { fatal: true }).decode(document.bytes)).toBe(body)
        await expect(verifyTalosDocument(document)).resolves.toMatchObject({ ok: true })
    })

    it('SOURCE-FILE-05 preserves an unrelated final title suffix', async () => {
        const document = await generateTalosDocument({
            format: 'py',
            title: 'migration.v2',
            body: 'print("v2")',
        })

        expect(document.fileName).toBe('migration.v2.py')
    })
})
