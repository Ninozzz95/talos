import { describe, expect, it } from 'vitest'
import { talosModoBarraDa } from '@/lib/barra/modoBarra'

/**
 * ⛔⛔ QUESTO CONTROLLO DECIDE COSA VEDE LA PERSONA QUANDO APRE L'APP.
 *
 * Un `null` di troppo e chi ha chiamato TALOS con la voce trova la schermata
 * intera (il difetto che l'owner ha bocciato: «potrei farlo con un tap»); un
 * `null` di meno e chi tocca l'icona sul telefono trova una barretta in fondo
 * allo schermo al posto della sua app. Non c'è un verso «sicuro»: si provano
 * tutti e due, ed è per questo che metà di questi casi sono NEGATIVI.
 */
describe('⛔ il modo barra si legge dall\'indirizzo di lancio', () => {
    it('legge il contesto MISURATO: nodi e immagine, dichiarati', () => {
        const modo = talosModoBarraDa('talos://barra?voce=1&nodi=319&immagine=1')
        // ⛔ `apertura` è `null` quando nessuno l'ha dichiarata, ed è un valore
        // vero: significa «questa porta non sa dire se mi ha già chiamato».
        // Vedi `unaAperturaUnAscolto.test.ts` per cosa ci si fa.
        expect(modo).toEqual({
            daVoce: true,
            contesto: { nodi: 319, immagine: true },
            apertura: null,
        })
    })

    it('e il verso contrario: chiamata senza voce, senza immagine', () => {
        // ⛔ Non è un doppione del caso sopra: qui `voce` e `immagine` sono
        // ASSENTI, non `0`. Un'implementazione che leggesse la presenza della
        // chiave invece del suo valore passerebbe il primo caso e sbaglierebbe
        // questo — e la barra aprirebbe il microfono a chi non ha parlato.
        expect(talosModoBarraDa('talos://barra?nodi=49'))
            .toEqual({ daVoce: false, contesto: { nodi: 49, immagine: false }, apertura: null })
        expect(talosModoBarraDa('talos://barra?voce=0&nodi=49&immagine=0'))
            .toEqual({ daVoce: false, contesto: { nodi: 49, immagine: false }, apertura: null })
    })

    it('⛔ l\'app aperta dall\'ICONA non ha nessun indirizzo, e resta l\'app', () => {
        // È il caso di gran lunga più frequente, e il più costoso da sbagliare.
        expect(talosModoBarraDa(null)).toBeNull()
        expect(talosModoBarraDa(undefined)).toBeNull()
        expect(talosModoBarraDa('')).toBeNull()
    })

    it('⛔ e qualunque ALTRO indirizzo apre l\'app, non la barra', () => {
        expect(talosModoBarraDa('https://ai.talos/barra')).toBeNull()
        expect(talosModoBarraDa('talos://chat?nodi=319')).toBeNull()
        expect(talosModoBarraDa('non e un indirizzo')).toBeNull()
    })

    it('accetta anche la forma senza doppia barra', () => {
        // `talos:barra?…` e `talos://barra?…` differiscono per due caratteri
        // scritti a mano dall'altra parte del ponte: la differenza non deve
        // decidere se la funzione esiste.
        expect(talosModoBarraDa('talos:barra?nodi=7')?.contesto.nodi).toBe(7)
    })

    it('⛔ un conteggio che non è un numero vale ZERO, cioè «non vedo niente»', () => {
        // Il chip dice «Vedo la tua schermata · N elementi». Con un NaN direbbe
        // «Vedo la tua schermata · NaN elementi», che è peggio del silenzio: è
        // una dichiarazione di contesto che nessuno può verificare.
        expect(talosModoBarraDa('talos://barra?nodi=molti')?.contesto.nodi).toBe(0)
        expect(talosModoBarraDa('talos://barra?nodi=-4')?.contesto.nodi).toBe(0)
        expect(talosModoBarraDa('talos://barra')?.contesto.nodi).toBe(0)
    })
})
