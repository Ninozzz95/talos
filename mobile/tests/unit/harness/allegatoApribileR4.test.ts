import { describe, expect, it } from 'vitest'
import { percorsoApribileR4 } from '@/lib/harness/r4/allegatoApribileR4'

/*
 * ⛔ Owner 26/10/2026: «dalla chat il file ordini dal pad si deve poter aprire se ci clicco sopra, come qualunque altro file sia su
 * mobile che su desktop». Il chip sotto il messaggio della persona si apre solo se il percorso sta DENTRO la cartella della sessione:
 * relativo, o assoluto sotto la radice (maiuscole indifferenti); mai «..», «~», un segmento vuoto, un indirizzo web o un nome nudo
 * (si tirerebbe a indovinare dove sta il file). La stessa regola del desktop (`feat/allegati-apribili`, ALL-APRI-01..03).
 */
describe('percorsoApribileR4', () => {
    it('ALL-APRI-M01 un percorso relativo dentro la cartella si apre così com\'è', () => {
        expect(percorsoApribileR4('allegati/ordini-dal-pad.csv', null)).toBe('allegati/ordini-dal-pad.csv')
        expect(percorsoApribileR4('src\\app\\main.ts', null)).toBe('src/app/main.ts')
        expect(percorsoApribileR4('./allegati/nota.md', null)).toBe('allegati/nota.md')
        // revisione del Desktop 26/10: un relativo di UN segmento nel campo `percorso` è un file vero alla radice, e si apre
        expect(percorsoApribileR4('note.txt', null)).toBe('note.txt')
        expect(percorsoApribileR4('ordini.csv', '/w')).toBe('ordini.csv')
    })

    it('ALL-APRI-M06 i file della chat stanno nella cartella di PARTENZA: un relativo si risolve sulla base, verso la radice', () => {
        // Accesso pieno da un progetto: radice = il disco, base = il progetto (r4 7d1d3d7dd, `contesto.cartellaBase`)
        expect(percorsoApribileR4('allegati/x.csv', 'C:/', 'C:/Progetti/Demo')).toBe('Progetti/Demo/allegati/x.csv')
        expect(percorsoApribileR4('allegati/x.csv', '/w', '/w/sotto')).toBe('sotto/allegati/x.csv')
        // una base uguale alla radice, o assente: come prima
        expect(percorsoApribileR4('allegati/x.csv', '/w', '/w')).toBe('allegati/x.csv')
        expect(percorsoApribileR4('allegati/x.csv', '/w', null)).toBe('allegati/x.csv')
        // una base FUORI dalla radice (la radice si è ristretta): non si apre, si tirerebbe a indovinare
        expect(percorsoApribileR4('allegati/x.csv', '/w', '/altro')).toBeNull()
        // un assoluto si prova sempre contro la radice
        expect(percorsoApribileR4('/w/sotto/allegati/x.csv', '/w', '/w/sotto')).toBe('sotto/allegati/x.csv')
    })

    it('ALL-APRI-M02 un assoluto si apre solo sotto la radice conosciuta, e diventa relativo', () => {
        expect(percorsoApribileR4('/w/allegati/NOTA.md', '/w')).toBe('allegati/NOTA.md')
        expect(percorsoApribileR4('C:\\Progetti\\Demo\\allegati\\x.csv', 'c:/progetti/demo')).toBe('allegati/x.csv')
        expect(percorsoApribileR4('C:/Progetti/Demo/allegati/x.csv', 'C:\\Progetti\\Demo\\')).toBe('allegati/x.csv')
        // fuori dalla radice, o una radice che è solo l'inizio del nome di un'altra cartella
        expect(percorsoApribileR4('/w2/allegati/NOTA.md', '/w')).toBeNull()
        expect(percorsoApribileR4('/altro/NOTA.md', '/w')).toBeNull()
        // «/wxy» comincia con «/w» ma è un'altra cartella: la radice vale solo seguita dal separatore
        expect(percorsoApribileR4('/wxy/a/b.md', '/w')).toBeNull()
        // senza radice (sessione del PC: il percorso assoluto del PC non arriva mai al dispositivo) un assoluto non si può provare
        expect(percorsoApribileR4('/w/allegati/NOTA.md', null)).toBeNull()
        expect(percorsoApribileR4('C:\\Progetti\\Demo\\x.csv', null)).toBeNull()
        // la radice stessa non è un file
        expect(percorsoApribileR4('/w', '/w')).toBeNull()
    })

    it('ALL-APRI-M03 «..», «~», segmenti vuoti, indirizzi web e percorsi vuoti restano etichette', () => {
        for (const percorso of [
            '../segreti.txt', 'allegati/../../segreti.txt', '/w/allegati/../../etc/passwd', '~/file.txt', 'allegati/~/x',
            'allegati//x.csv', 'https://example.com/x.csv', 'http://127.0.0.1/x', 'file:///w/x.csv', '', '   ', '.',
            '\\\\server\\share\\x.csv',
        ]) {
            expect(percorsoApribileR4(percorso, '/w'), percorso).toBeNull()
        }
        expect(percorsoApribileR4(undefined, '/w')).toBeNull()
    })
})
