import { describe, expect, it } from 'vitest'
import { creaScansione } from '@/lib/streaming/desktop/markdown-in-arrivo.js'
import { aperturaDelRecinto } from '@/lib/streaming/aperturaDelRecinto'

/**
 * #24, revisione del Desktop (23/10): la funzione da sola, senza il ritmo dello svelamento. Il ritmo di oggi trattiene l'ultima
 * parola e nasconde una riga «```» incompleta; al passo 2 (il ritmo del desktop) potrebbe non farlo più. Regola del 10/10: un
 * mutante equivalente va dimostrato, e qui non lo è.
 */
const apertura = (testo: string) => aperturaDelRecinto(creaScansione(), testo)

describe('aperturaDelRecinto (#24)', () => {
    it('APRE-01 fuori da un recinto, una riga «```» ancora incompleta non è un recinto aperto: -1', () => {
        expect(apertura('Ecco la pagina.\n\n```')).toBe(-1)
        expect(apertura('Ecco la pagina.\n\n```css')).toBe(-1)
    })

    it('APRE-02 dentro un recinto aperto: l\'inizio della riga d\'apertura, anche rientrata', () => {
        expect(apertura('Ecco la pagina.\n\n```css\n.a { color: red; }\n')).toBe(17)
        expect(apertura('Ecco.\n\n   ```js\nconst a = 1\n')).toBe(7)
        expect(apertura('```\nsolo codice\n')).toBe(0)
    })

    it('APRE-03 la stessa scansione che avanza col testo tiene lo stesso inizio finché il recinto è aperto, poi -1', () => {
        const s = creaScansione()
        let testo = 'Prima.\n\n```py\n'
        for (let i = 0; i < 20; i += 1) {
            testo += `print(${i})\n`
            expect(aperturaDelRecinto(s, testo)).toBe(8)
        }
        testo += '```\n\nDopo.'
        expect(aperturaDelRecinto(s, testo)).toBe(-1)
    })

    it('APRE-04 `~~~` e i recinti da quattro apici restano sul parse di sempre: -1', () => {
        expect(apertura('Prova.\n\n~~~js\nconst a = 1\n')).toBe(-1)
        expect(apertura('Prova.\n\n````js\nconst a = 1\n')).toBe(-1)
    })

    it('APRE-05 un recinto già chiuso seguito da testo: -1', () => {
        expect(apertura('```css\n.a {}\n```\n\nFatto.')).toBe(-1)
    })
})
