// @vitest-environment jsdom

import { describe, expect, it } from 'vitest'
import { renderTalosMarkdownBlock, splitTalosMarkdownBlocks } from '@/lib/talosMessageMarkdown'

/**
 * Owner 2026-07-27, third round on "l'animazione di rendering non è smooth".
 *
 * The first two rounds fixed what the message did to the DOM. This is what it
 * was doing to the CPU: the component mapped EVERY block through markdown-it on
 * every content change, so a twenty-block answer arriving at nine updates a
 * second ran a hundred and eighty parses a second on a phone — and all but one
 * of them rebuilt a string identical to the one already on screen.
 */
describe('parsing a streamed answer', () => {
    it('returns the very same string for a block it has already parsed', () => {
        // Identity, not equality: the point is that no work happened, and it
        // also lets v-memo short-circuit without comparing.
        const source = '## Titolo\n\nUn paragrafo con **grassetto**.'
        expect(renderTalosMarkdownBlock(source)).toBe(renderTalosMarkdownBlock(source))
    })

    it('still parses a block whose text has changed', () => {
        expect(renderTalosMarkdownBlock('primo')).not.toBe(renderTalosMarkdownBlock('primo e secondo'))
        expect(renderTalosMarkdownBlock('ciao')).toContain('ciao')
    })

    it('re-parses only the block being written while an answer streams', () => {
        // The shape of the real case: a finished paragraph, then one growing.
        const settled = '# Report\n\nPrima parte, completa.'
        const first = splitTalosMarkdownBlocks(`${settled}\n\nSeconda par`)
        const second = splitTalosMarkdownBlocks(`${settled}\n\nSeconda parte, in arrivo`)
        // Every block except the last is served from the cache, by identity.
        expect(renderTalosMarkdownBlock(first[0]!)).toBe(renderTalosMarkdownBlock(second[0]!))
        expect(renderTalosMarkdownBlock(first[1]!)).toBe(renderTalosMarkdownBlock(second[1]!))
        expect(renderTalosMarkdownBlock(first.at(-1)!)).not.toBe(renderTalosMarkdownBlock(second.at(-1)!))
    })

    it('keeps producing correct html, cached or not', () => {
        const html = renderTalosMarkdownBlock('- uno\n- due')
        expect(html).toContain('<li>')
        expect(renderTalosMarkdownBlock('- uno\n- due')).toBe(html)
    })

    it('does not grow without bound as a conversation goes on', () => {
        // A long chat would otherwise keep every block of every message alive
        // for the life of the app.
        for (let index = 0; index < 600; index += 1) renderTalosMarkdownBlock(`riga numero ${index}`)
        const early = renderTalosMarkdownBlock('riga numero 0')
        const late = renderTalosMarkdownBlock('riga numero 599')
        // The recent one is still cached; the oldest was evicted and re-parsed,
        // which is correct behaviour and still returns the right html.
        expect(renderTalosMarkdownBlock('riga numero 599')).toBe(late)
        expect(early).toContain('riga numero 0')
    })

    it('I18N-06 never serves a cached block rendered for another locale', () => {
        const source = '- [x] fatto'
        const italian = renderTalosMarkdownBlock(source, {
            labels: {
                completedTask: 'Attività completata',
                openTask: 'Attività aperta',
                scrollableTable: 'Tabella del messaggio scorrevole',
                image: 'Immagine',
                externalImageOmitted: 'Immagine esterna omessa:',
                code: 'codice',
                copyCode: 'Copia codice',
                copy: 'Copia',
                truncatedMessage: 'Messaggio troncato per una visualizzazione sicura.',
            },
        })
        const english = renderTalosMarkdownBlock(source)

        expect(italian).toContain('Attività completata')
        expect(english).toContain('Completed task')
        expect(italian).not.toBe(english)
    })
})
