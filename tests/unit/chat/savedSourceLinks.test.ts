import { describe, expect, it } from 'vitest'
import { parseVaultSourceUrl } from '@/lib/vaultLibrary'

/**
 * Owner 2026-07-27: "nuova sezione link in libreria, tutti i link salvati nella
 * ricerca devono essere stampati nella libreria sottoforma di link oltre
 * all'attuale transcript MD … magari nella visualizzazione mettere un pulsante
 * open in browser".
 *
 * Today a page TALOS read is saved as markdown with `Source: https://…` inside
 * the prose. The Library cannot turn that into a link without rummaging through
 * the text of every file it lists, which is both slow and a guess. The address
 * belongs in the metadata, where it is a fact rather than a pattern someone
 * hopes holds.
 */
describe('the address a saved page came from', () => {
    it('is read back exactly as it was stored', () => {
        expect(parseVaultSourceUrl({ source_url: 'https://example.com/a?b=1' }))
            .toBe('https://example.com/a?b=1')
    })

    it('is absent for anything that did not come from the web', () => {
        expect(parseVaultSourceUrl({})).toBeNull()
        expect(parseVaultSourceUrl(null)).toBeNull()
        expect(parseVaultSourceUrl(undefined)).toBeNull()
    })

    it('refuses anything that is not an http address', () => {
        // A Library row becomes a tappable link, so this decides what a tap can
        // reach: `javascript:` and `file:` are not addresses, they are attacks.
        expect(parseVaultSourceUrl({ source_url: 'javascript:alert(1)' })).toBeNull()
        expect(parseVaultSourceUrl({ source_url: 'file:///etc/passwd' })).toBeNull()
        expect(parseVaultSourceUrl({ source_url: 'data:text/html,<script>' })).toBeNull()
    })

    it('refuses a value that is not a string at all', () => {
        expect(parseVaultSourceUrl({ source_url: 42 })).toBeNull()
        expect(parseVaultSourceUrl({ source_url: '' })).toBeNull()
    })
})
