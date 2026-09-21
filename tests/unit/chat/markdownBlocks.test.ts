import { describe, expect, it } from 'vitest'
import { splitTalosMarkdownBlocks } from '@/lib/talosMessageMarkdown'

/**
 * Owner 2026-07-27, still: "animazione non è smooth con fade in" — after the
 * reveal was already paced.
 *
 * The pacing was correct and invisible, because of what happens downstream: the
 * whole message body is ONE `v-html`, re-rendered every 110ms as the markdown
 * is re-parsed. Nine times a second the entire paragraph is destroyed and
 * recreated, which snaps anything mid-fade and repaints text that had settled.
 * No amount of smoothing upstream can survive that.
 *
 * So the body is split into blocks and each is rendered on its own. A block
 * whose source has not changed is not re-rendered at all — which is every block
 * except the last one while an answer streams.
 */
describe('splitting a message into blocks that can be left alone', () => {
    it('separates paragraphs', () => {
        expect(splitTalosMarkdownBlocks('Primo paragrafo.\n\nSecondo paragrafo.'))
            .toEqual(['Primo paragrafo.', 'Secondo paragrafo.'])
    })

    it('keeps a fenced code block whole, blank lines and all', () => {
        // Splitting on blank lines alone would cut this in three.
        const source = ['```js', 'const a = 1', '', 'const b = 2', '```'].join('\n')
        expect(splitTalosMarkdownBlocks(source)).toEqual([source])
    })

    it('keeps a list as ONE block, so its numbering cannot restart', () => {
        const source = ['1. uno', '2. due', '3. tre'].join('\n')
        expect(splitTalosMarkdownBlocks(source)).toEqual([source])
    })

    it('keeps a table whole', () => {
        const source = ['| a | b |', '|---|---|', '| 1 | 2 |'].join('\n')
        expect(splitTalosMarkdownBlocks(source)).toEqual([source])
    })

    it('separates a heading from the prose under it', () => {
        const blocks = splitTalosMarkdownBlocks('## Titolo\n\nTesto sotto.')
        expect(blocks).toEqual(['## Titolo', 'Testo sotto.'])
    })

    it('leaves earlier blocks BYTE-IDENTICAL as the answer grows', () => {
        // This is the whole point: identical strings let the renderer skip the
        // work, so settled text is never destroyed and rebuilt mid-fade.
        const half = '# Report\n\nPrimo paragrafo completo.\n\nSecondo a metà'
        const full = '# Report\n\nPrimo paragrafo completo.\n\nSecondo a metà, ora finito.'
        const before = splitTalosMarkdownBlocks(half)
        const after = splitTalosMarkdownBlocks(full)

        expect(after.slice(0, before.length - 1)).toEqual(before.slice(0, before.length - 1))
        // Only the last one differs.
        expect(after[after.length - 1]).not.toBe(before[before.length - 1])
    })

    it('survives an empty document and pure whitespace', () => {
        expect(splitTalosMarkdownBlocks('')).toEqual([])
        expect(splitTalosMarkdownBlocks('   \n\n  ')).toEqual([])
    })

    it('never loses text: the blocks put back together still contain everything', () => {
        const source = [
            '# Titolo',
            '',
            'Un paragrafo con **grassetto**.',
            '',
            '- uno',
            '- due',
            '',
            '```py',
            'print(1)',
            '```',
            '',
            'Chiusura.',
        ].join('\n')
        const joined = splitTalosMarkdownBlocks(source).join('\n')
        for (const fragment of ['# Titolo', 'grassetto', '- due', 'print(1)', 'Chiusura.']) {
            expect(joined).toContain(fragment)
        }
    })
})
