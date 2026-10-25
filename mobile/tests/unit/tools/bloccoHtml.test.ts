import { describe, expect, it } from 'vitest'
import { talosBloccoHtml, talosUnisciSeguito } from '@/lib/tools/bloccoHtml'

/**
 * BLK — il corpo di un artefatto arriva come blocco ```html nella risposta (owner 2026-10-23: per i modelli LOCALI
 * l'HTML fuori dal JSON). Precedente: Jan (`web-app/src/lib/utils.ts:86-121`), che separa i blocchi `html`/`svg` dal
 * markdown. Qui serve una cosa sola: il PRIMO blocco html CHIUSO, il testo senza di lui, e sapere se è rimasto aperto.
 */
describe('BLK il blocco html della risposta', () => {
    it('BLK-01 trova il primo blocco chiuso e restituisce il testo senza di lui', () => {
        const testo = 'Ecco il sito.\n\n```html\n<!doctype html><html><body>ok</body></html>\n```\n\nFammi sapere.'
        const letto = talosBloccoHtml(testo)
        expect(letto).toEqual({
            html: '<!doctype html><html><body>ok</body></html>',
            senzaBlocco: 'Ecco il sito.\n\nFammi sapere.',
        })
    })

    it('BLK-02 l’etichetta si legge senza badare alle maiuscole, e un blocco di altro codice non conta', () => {
        expect(talosBloccoHtml('```css\nbody{}\n```\n```HTML\n<p>x</p>\n```')).toMatchObject({ html: '<p>x</p>' })
        expect(talosBloccoHtml('```js\nalert(1)\n```')).toBeNull()
    })

    it('BLK-03 un blocco aperto si dice aperto, col testo prima e il corpo fin lì: decide chi sa se è stato tagliato', () => {
        expect(talosBloccoHtml('Ecco:\n```html\n<html><body><div class="hero">')).toEqual({
            aperto: true,
            prima: 'Ecco:',
            corpo: '<html><body><div class="hero">',
        })
    })

    it('BLK-04 senza blocco html: null', () => {
        expect(talosBloccoHtml('Mi servono più dettagli.')).toBeNull()
        expect(talosBloccoHtml('')).toBeNull()
    })

    it('BLK-05 il seguito di un blocco tagliato si attacca senza ripetere la recinzione d’apertura', () => {
        const primo = 'Ecco:\n```html\n<html><body><div class="hero">'
        expect(talosUnisciSeguito(primo, '```html\nCasa</div></body></html>\n```')).toBe(
            'Ecco:\n```html\n<html><body><div class="hero">Casa</div></body></html>\n```',
        )
        expect(talosUnisciSeguito(primo, 'Casa</div></body></html>\n```')).toBe(
            'Ecco:\n```html\n<html><body><div class="hero">Casa</div></body></html>\n```',
        )
    })
})
