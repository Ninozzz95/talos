import { describe, expect, it } from 'vitest'
import { parseVaultOrigin, filterLibraryFiles } from '@/lib/vaultLibrary'
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
    it('does not mutate the input array', () => {
        const input = [...files]
        filterLibraryFiles(input, { query: '', origin: 'all' })
        expect(input.map((f) => f.id)).toEqual(['a', 'b', 'c'])
    })
})
