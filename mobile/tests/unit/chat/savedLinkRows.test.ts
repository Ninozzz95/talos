import { describe, expect, it } from 'vitest'
import { talosSavedLinkRows } from '@/lib/vaultLibrary'
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

    it('puts the most recent link first', () => {
        const rows = talosSavedLinkRows([
            sourceFile({ id: 'old', url: 'https://a.com', created_at: '2026-07-20T09:00:00.000Z' }),
            sourceFile({ id: 'new', url: 'https://b.com', created_at: '2026-07-27T09:00:00.000Z' }),
        ])
        expect(rows.map((row) => row.fileId)).toEqual(['new', 'old'])
    })

    it('refuses an address a tap must never reach', () => {
        // The row is a button that opens a browser. Whatever a page put in the
        // metadata gets to decide where that goes, so it is checked here too.
        expect(talosSavedLinkRows([sourceFile({ url: 'javascript:alert(1)' })])).toEqual([])
    })

    it('titles the row with the page, not the filename it was stored under', () => {
        const rows = talosSavedLinkRows([
            sourceFile({ display_name: 'Il prezzo del gas.md', url: 'https://example.com/g' }),
        ])
        expect(rows[0]!.title).toBe('Il prezzo del gas')
    })
})
