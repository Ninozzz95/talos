import { describe, expect, it } from 'vitest'
import { talosTestoPerVoce } from '@/lib/voice/testoPerVoce'

describe('talosTestoPerVoce()', () => {
    /**
     * ⛔⛔⛔ 22/8, owner, sentito dal vivo: «dice documento_complesso come
     * documento underscore complesso». Il caso che ha aperto il fix.
     */
    it('TESTOVOCE-01 an underscore inside a word becomes a space, not a spoken symbol', () => {
        expect(talosTestoPerVoce('Apri documento_complesso.pdf')).toBe('Apri documento complesso.pdf')
    })

    it('AL CONTRARIO: text with no underscore is returned unchanged', () => {
        expect(talosTestoPerVoce('Apri il documento complesso')).toBe('Apri il documento complesso')
    })

    it('TESTOVOCE-02 markdown bold/italic markers are stripped, the words stay', () => {
        expect(talosTestoPerVoce('Il file è **importante** e *urgente*')).toBe('Il file è importante e urgente')
    })

    it('TESTOVOCE-03 inline code backticks are stripped, the content stays', () => {
        expect(talosTestoPerVoce('Esegui `npm install` prima')).toBe('Esegui npm install prima')
    })

    it('TESTOVOCE-04 a heading marker at line start is stripped', () => {
        expect(talosTestoPerVoce('## Riepilogo\nTutto ok')).toBe('Riepilogo\nTutto ok')
    })

    it('TESTOVOCE-05 a code block\'s fence markers survive, but the same underscore rule still applies inside it', () => {
        // ⛔ Non elimina il CONTENUTO di un blocco di codice (vedi il
        // commento nel modulo) - ma non è nemmeno cieco ai suoi confini:
        // un trattino basso dentro resta comunque uno spazio, non "underscore".
        expect(talosTestoPerVoce('```js\nconst x_y = 1\n```')).toBe('```js\nconst x y = 1\n```')
    })

    it('collapses the double spaces left behind by stripped markers', () => {
        expect(talosTestoPerVoce('uno_due **tre**')).toBe('uno due tre')
    })
})
