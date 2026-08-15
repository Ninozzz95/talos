import { describe, expect, it } from 'vitest'
import { filterTalosSavedLinkRows, talosSavedLinkRows } from '@/lib/vaultLibrary'
import type { TalosLocalVaultFile } from '@/repositories/chatRepository'

/**
 * Owner 2026-07-27: "nuova sezione link in libreria, tutti i link salvati nella
 * ricerca devono essere stampati nella libreria sottoforma di link oltre
 * all'attuale transcript MD … magari nella visualizzazione mettere un pulsante
 * open in browser".
 *
 * The transcript stays — a dossier that survives dead links is the point. What
 * is added is the address as an ADDRESS: a row you can tap to go back to the
 * page, next to the copy TALOS kept.
 */
function sourceFile(over: Partial<TalosLocalVaultFile> & { url?: string }): TalosLocalVaultFile {
    const { url, ...rest } = over
    return {
        id: 'f1',
        display_name: 'Una pagina.md',
        media_type: 'text/markdown',
        size_bytes: 10,
        sha256: 'a'.repeat(64),
        status: 'available',
        created_at: '2026-07-27T10:00:00.000Z',
        extracted_text: null,
        metadata: {
            origin: 'generated',
            kind: 'web_source',
            ...(url === undefined ? {} : { source_url: url }),
        },
        ...rest,
    } as TalosLocalVaultFile
}

describe('the links a search left behind', () => {
    it('lists a read page as an address with a readable host', () => {
        const rows = talosSavedLinkRows([
            sourceFile({ url: 'https://www.corriere.it/economia/articolo.html' }),
        ])

        expect(rows).toHaveLength(1)
        expect(rows[0]!.url).toBe('https://www.corriere.it/economia/articolo.html')
        // `www.` is noise on a phone screen where the row is one line.
        expect(rows[0]!.host).toBe('corriere.it')
        // The transcript is still reachable from the row, not replaced by it.
        expect(rows[0]!.fileId).toBe('f1')
    })

    it('leaves out documents the user made and pages saved before URLs were kept', () => {
        const rows = talosSavedLinkRows([
            sourceFile({ id: 'old', url: undefined }),
            { ...sourceFile({ url: 'https://example.com' }), id: 'doc', metadata: { origin: 'uploaded' } } as TalosLocalVaultFile,
        ])
        expect(rows).toEqual([])
    })

    it('shows a page read three times once, keeping the most recent copy', () => {
        const rows = talosSavedLinkRows([
            sourceFile({ id: 'a', url: 'https://example.com/x', created_at: '2026-07-25T09:00:00.000Z' }),
            sourceFile({ id: 'b', url: 'https://example.com/x', created_at: '2026-07-27T09:00:00.000Z' }),
            sourceFile({ id: 'c', url: 'https://example.com/x', created_at: '2026-07-26T09:00:00.000Z' }),
        ])
        expect(rows).toHaveLength(1)
        expect(rows[0]!.fileId).toBe('b')
    })

    it('LIB-ALL-LINK-03 keeps one newest row per canonical URL while preserving distinct dossier links', () => {
        const rows = talosSavedLinkRows([
            sourceFile({
                id: 'old',
                url: 'https://www.example.com/alpha#old',
                created_at: '2026-07-25T09:00:00.000Z',
            }),
            sourceFile({
                id: 'new-dossier',
                url: undefined,
                created_at: '2026-07-28T09:00:00.000Z',
                metadata: {
                    origin: 'generated',
                    kind: 'web_source',
                    source_links: [
                        { url: 'https://www.example.com/alpha#fresh', title: 'Alpha latest' },
                        { url: 'https://example.org/beta', title: 'Beta report' },
                    ],
                },
            }),
        ])

        expect(rows).toHaveLength(2)
        expect(rows).toEqual(expect.arrayContaining([
            expect.objectContaining({
                fileId: 'new-dossier',
                url: 'https://www.example.com/alpha',
                title: 'Alpha latest',
            }),
            expect.objectContaining({
                fileId: 'new-dossier',
                url: 'https://example.org/beta',
                title: 'Beta report',
            }),
        ]))
    })

    it('LIB-ALL-LINK-04 searches visible link identity and retained-copy text with canonical Unicode rules', () => {
        const files = [
            sourceFile({
                id: 'search-dossier',
                url: undefined,
                display_name: 'Ricerca mercati globali.md',
                // A real search dossier repeats every result URL in its body.
                // A direct host match must still narrow to that one logical row
                // instead of admitting every sibling through shared copy text.
                extracted_text: [
                    'Analisi macroeconomica del budget \u20ac per \u9879\u76ee\u9884\u7b97',
                    'Source: https://www.reuters.com/world/alpha',
                    'Source: https://example.org/beta-report',
                ].join('\n'),
                metadata: {
                    origin: 'generated',
                    kind: 'web_source',
                    source_links: [
                        { url: 'https://www.reuters.com/world/alpha', title: 'Caf\u00e9 Alpha' },
                        { url: 'https://example.org/beta-report', title: 'Beta report' },
                    ],
                },
            }),
        ]

        expect(filterTalosSavedLinkRows(files, 'CAFE\u0301').map((row) => row.title))
            .toEqual(['Caf\u00e9 Alpha'])
        expect(filterTalosSavedLinkRows(files, 'reuters.com').map((row) => row.host))
            .toEqual(['reuters.com'])
        expect(filterTalosSavedLinkRows(files, 'beta-report').map((row) => row.host))
            .toEqual(['example.org'])
        expect(filterTalosSavedLinkRows(files, '\u9879\u76ee\u9884\u7b97')).toHaveLength(2)
        expect(filterTalosSavedLinkRows(files, 'not-present')).toEqual([])
    })

    it('WEB-LIB-03 expands one search dossier into every canonical result link', () => {
        const rows = talosSavedLinkRows([
            sourceFile({
                id: 'search-1',
                url: undefined,
                display_name: 'Web search - aziende lusso.md',
                metadata: {
                    origin: 'generated',
                    kind: 'web_source',
                    source_links: [
                        { url: 'https://www.example.com/alpha#team', title: 'Alpha' },
                        { url: 'https://example.org/beta', title: 'Beta' },
                    ],
                },
            }),
        ])

        expect(rows).toEqual([
            expect.objectContaining({
                fileId: 'search-1',
                url: 'https://www.example.com/alpha',
                title: 'Alpha',
                host: 'example.com',
            }),
            expect.objectContaining({
                fileId: 'search-1',
                url: 'https://example.org/beta',
                title: 'Beta',
                host: 'example.org',
            }),
        ])
    })

    it('puts the most recent link first', () => {
        const rows = talosSavedLinkRows([
            sourceFile({ id: 'old', url: 'https://a.com', created_at: '2026-07-20T09:00:00.000Z' }),
            sourceFile({ id: 'new', url: 'https://b.com', created_at: '2026-07-27T09:00:00.000Z' }),
        ])
        expect(rows.map((row) => row.fileId)).toEqual(['new', 'old'])
    })

    it('finds the address of a page saved before the address was kept', () => {
        // Self-review 2026-07-27: the owner has been searching with TALOS for
        // days. Every source already in his Library predates the metadata, so
        // shipping this without a fallback means opening Links and finding it
        // empty — the feature would read as broken on the only Library that
        // matters. The transcript has always begun with a `Source:` line.
        const rows = talosSavedLinkRows([
            {
                ...sourceFile({ id: 'legacy', url: undefined }),
                display_name: 'Il prezzo del gas.md',
                extracted_text: ['# Il prezzo del gas', '', 'Source: https://www.corriere.it/gas', 'Published: 2026-07-01'].join('\n'),
            } as TalosLocalVaultFile,
        ])
        expect(rows).toHaveLength(1)
        expect(rows[0]!.url).toBe('https://www.corriere.it/gas')
        expect(rows[0]!.host).toBe('corriere.it')
    })

    it('does not mistake a link inside a page for the page it came from', () => {
        // Only the header line counts. A quoted url further down is something
        // the page mentioned, not where the page lives.
        const rows = talosSavedLinkRows([
            {
                ...sourceFile({ id: 'legacy', url: undefined }),
                extracted_text: ['# Una pagina', '', 'leggi anche Source: https://altrove.example/x'].join('\n'),
            } as TalosLocalVaultFile,
        ])
        expect(rows).toEqual([])
    })

    it('prefers the stored address over the one written in the prose', () => {
        const rows = talosSavedLinkRows([
            {
                ...sourceFile({ url: 'https://truth.example/a' }),
                extracted_text: 'Source: https://stale.example/b',
            } as TalosLocalVaultFile,
        ])
        expect(rows[0]!.url).toBe('https://truth.example/a')
    })

    it('refuses an address a tap must never reach', () => {
        // The row is a button that opens a browser. Whatever a page put in the
        // metadata gets to decide where that goes, so it is checked here too.
        expect(talosSavedLinkRows([sourceFile({ url: 'javascript:alert(1)' })])).toEqual([])
    })

    it('WEB-LIB-08 refuses credentialed URLs in both old and multi-link metadata', () => {
        expect(talosSavedLinkRows([
            sourceFile({ url: 'https://user:pass@example.com/private' }),
            sourceFile({
                id: 'multi',
                url: undefined,
                metadata: {
                    origin: 'generated',
                    kind: 'web_source',
                    source_links: [
                        { url: 'https://user@example.com/private', title: 'Private' },
                    ],
                },
            }),
        ])).toEqual([])
    })

    it('titles the row with the page, not the filename it was stored under', () => {
        const rows = talosSavedLinkRows([
            sourceFile({ display_name: 'Il prezzo del gas.md', url: 'https://example.com/g' }),
        ])
        expect(rows[0]!.title).toBe('Il prezzo del gas')
    })
})
