import { describe, expect, it } from 'vitest'
import {
    filterLibraryFiles,
    matchesTalosLibrarySurfaceTab,
    parseVaultOrigin,
    talosLibraryFileType,
} from '@/lib/vaultLibrary'
import type { TalosLocalVaultFile } from '@/repositories/chatRepository'

function file(over: Partial<TalosLocalVaultFile> = {}): TalosLocalVaultFile {
    return {
        id: 'f1', display_name: 'notes.pdf', media_type: 'application/pdf', size_bytes: 10,
        private_uri: 'p', status: 'available', trust: 'untrusted', sha256: 'a'.repeat(64),
        extracted_text: null, failure_code: null, metadata: {},
        created_at: '2026-07-01T00:00:00.000Z', updated_at: '2026-07-01T00:00:00.000Z', ...over,
    }
}

describe('parseVaultOrigin', () => {
    it('defaults to uploaded for legacy rows (no origin) — fail-closed', () => {
        expect(parseVaultOrigin({})).toBe('uploaded')
        expect(parseVaultOrigin(null)).toBe('uploaded')
        expect(parseVaultOrigin({ origin: 'nonsense' })).toBe('uploaded')
    })
    it('reads generated only when explicitly marked', () => {
        expect(parseVaultOrigin({ origin: 'generated' })).toBe('generated')
        expect(parseVaultOrigin({ origin: 'uploaded' })).toBe('uploaded')
    })
})

describe('filterLibraryFiles', () => {
    const files = [
        file({ id: 'a', display_name: 'budget.xlsx', created_at: '2026-07-01T00:00:00.000Z' }),
        file({ id: 'b', display_name: 'diagram.png', media_type: 'image/png',
            metadata: { origin: 'generated' }, created_at: '2026-07-03T00:00:00.000Z' }),
        file({ id: 'c', display_name: 'contract.pdf', extracted_text: 'quarterly REVENUE report',
            created_at: '2026-07-02T00:00:00.000Z' }),
    ]

    it('sorts by recency (newest first) by default', () => {
        expect(filterLibraryFiles(files, { query: '', origin: 'all' }).map((f) => f.id))
            .toEqual(['b', 'c', 'a'])
    })
    it('filters by origin', () => {
        expect(filterLibraryFiles(files, { query: '', origin: 'generated' }).map((f) => f.id)).toEqual(['b'])
        expect(filterLibraryFiles(files, { query: '', origin: 'uploaded' }).map((f) => f.id)).toEqual(['c', 'a'])
    })
    it('searches file names case-insensitively', () => {
        expect(filterLibraryFiles(files, { query: 'BUDG', origin: 'all' }).map((f) => f.id)).toEqual(['a'])
    })
    it('searches INSIDE documents via extracted text (TALOS one-up)', () => {
        expect(filterLibraryFiles(files, { query: 'revenue', origin: 'all' }).map((f) => f.id)).toEqual(['c'])
    })
    it.each([
        ['canonical accents', 'CAFÉ', 'cafe\u0301-notes.md', 'plain'],
        ['full-width compatibility', 'AVM', 'ＡＶＭ-plan.md', 'plain'],
        ['CJK substring', '预算', '项目预算.md', 'plain'],
        ['currency symbol', '€', 'invoice.md', 'Totale € 42'],
        ['emoji only', '🔒', 'security-🔒.md', 'plain'],
        ['emoji presentation variant', '☕', 'menu-☕️.md', 'plain'],
    ])('P2-UI-01 matches %s with the agent-compatible Unicode contract', (
        _label,
        query,
        displayName,
        extractedText,
    ) => {
        const relevant = file({
            id: 'unicode-relevant',
            display_name: displayName,
            extracted_text: extractedText,
            created_at: '2026-07-01T00:00:00.000Z',
        })
        const unrelated = file({
            id: 'unrelated-newer',
            display_name: 'plain.txt',
            extracted_text: 'nothing relevant',
            created_at: '2026-07-03T00:00:00.000Z',
        })

        expect(filterLibraryFiles(
            [unrelated, relevant],
            { query, origin: 'all' },
        ).map((entry) => entry.id)).toEqual(['unicode-relevant'])
    })
    it('does not mutate the input array', () => {
        const input = [...files]
        filterLibraryFiles(input, { query: '', origin: 'all' })
        expect(input.map((f) => f.id)).toEqual(['a', 'b', 'c'])
    })
})

describe('canonical Library type', () => {
    const image = file({ id: 'image', media_type: 'image/png' })
    const document = file({ id: 'document', media_type: 'application/pdf' })
    const sourceWithImageMime = file({
        id: 'source',
        media_type: 'image/png',
        metadata: { kind: 'web_source' },
    })

    it('LIB-FILTER-PARITY-02 gives source kind precedence over an image-looking MIME', () => {
        expect(talosLibraryFileType(sourceWithImageMime)).toBe('link')
        expect(talosLibraryFileType(image)).toBe('image')
        expect(talosLibraryFileType(document)).toBe('document')
    })

    it('assigns mutually exclusive global/chat tab membership', () => {
        const membership = (candidate: TalosLocalVaultFile) => (
            ['all', 'images', 'files', 'links'] as const
        ).filter((tab) => matchesTalosLibrarySurfaceTab(candidate, tab))

        expect(membership(image)).toEqual(['all', 'images'])
        expect(membership(document)).toEqual(['all', 'files'])
        expect(membership(sourceWithImageMime)).toEqual(['links'])
    })
})
