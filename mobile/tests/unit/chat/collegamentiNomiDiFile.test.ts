// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { renderTalosMarkdown, renderTalosMarkdownBlock } from '@/lib/talosMessageMarkdown'

/**
 * ⭐ LINK-FILE-01 (owner 25/09/2026, «saltare le estensioni di file»; dossier
 * `.claude/ricerche/2026-09-25-dubbi-punto-6-10x4.md`).
 *
 * Visto sul Pad: nel testo del modello «Peloro.md» diventava un collegamento a http://Peloro.md (`.md` è il dominio della
 * Moldova), come «setup.sh». Stesso difetto in Claude Code (#56097, #53602); cura adottata come dray PR #292: i domini
 * scritti senza `http(s)://` restano collegamenti, tranne quando finiscono con un'estensione di file comune.
 */

function collegamenti(testo: string): string[] {
    return [...renderTalosMarkdown(testo).html.matchAll(/<a href="([^"]+)"/g)].map((voce) => voce[1]!)
}

describe('LINK-FILE-01: i nomi di file non sono collegamenti', () => {
    it('LINK-FILE-01: «Peloro.md», «setup.sh», «main.py», «lib.rs» restano testo', () => {
        expect(collegamenti('Ho salvato Peloro.md, setup.sh, main.py e lib.rs nella cartella.')).toEqual([])
    })

    it('LINK-FILE-02: i domini nudi, www e gli indirizzi scritti per intero restano collegamenti', () => {
        expect(collegamenti('Vedi example.com, www.example.com, z.ai, https://openrouter.ai e info@talos.it.')).toEqual([
            'http://example.com',
            'http://www.example.com',
            'http://z.ai',
            'https://openrouter.ai',
            'mailto:info@talos.it',
        ])
    })

    it('LINK-FILE-03: un indirizzo scritto per intero verso un .md resta un collegamento (è una scelta di chi scrive)', () => {
        expect(collegamenti('Il file è su https://esempio.md/guida e su www.peloro.md')).toEqual([
            'https://esempio.md/guida',
            'http://www.peloro.md',
        ])
    })

    it('LINK-FILE-04: vale anche nel rendering a blocchi della risposta in arrivo', () => {
        expect(renderTalosMarkdownBlock('Creato Prova casella.md')).not.toContain('<a ')
    })
})
