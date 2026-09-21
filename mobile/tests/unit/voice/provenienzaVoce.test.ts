import { describe, expect, it } from 'vitest'
import { talosProvenienzaVoce } from '@/lib/voice/provenienzaVoce'

/**
 * ⭐ «Se parlo, la risposta deve essere automaticamente in TTS» — owner
 * 2026-08-10. Non è un rilevamento: è una provenienza. Questi casi sono i
 * quattro gesti che una persona fa davvero.
 */
describe('⭐ un turno nato dalla voce si riconosce, non si indovina', () => {
    it('detto e mandato: nasce di voce', () => {
        const p = talosProvenienzaVoce()
        p.dettatura('', 'accendi la torcia')
        expect(p.nataDiVoce()).toBe(true)
    })

    it('scritto a mano e basta: NON nasce di voce', () => {
        const p = talosProvenienzaVoce()
        p.aggiornaBozza('accendi la torcia')
        expect(p.nataDiVoce()).toBe(false)
    })

    it('⛔ dettato e poi CORRETTO a mano: resta di voce', () => {
        const p = talosProvenienzaVoce()
        p.dettatura('', 'accendi la torcia')
        p.aggiornaBozza('accendi la torcia adesso')
        expect(p.nataDiVoce()).toBe(true)
    })

    it('⛔ dettato, CANCELLATO tutto e riscritto a mano: torna scritto', () => {
        const p = talosProvenienzaVoce()
        p.dettatura('', 'accendi la torcia')
        p.aggiornaBozza('')
        p.aggiornaBozza('spegni il wifi')
        expect(p.nataDiVoce()).toBe(false)
    })

    it('⛔ dettato e poi SOSTITUITO senza passare dal vuoto: torna scritto', () => {
        // Selezione totale + digitazione: il campo non è mai vuoto, ma del
        // pezzo dettato non resta niente.
        const p = talosProvenienzaVoce()
        p.dettatura('', 'accendi la torcia')
        p.aggiornaBozza('spegni il wifi')
        expect(p.nataDiVoce()).toBe(false)
    })

    it('la dettatura che si AGGIUNGE a una bozza scritta a mano vale come voce', () => {
        const p = talosProvenienzaVoce()
        p.aggiornaBozza('ciao ')
        p.dettatura('ciao ', 'ciao come stai')
        expect(p.nataDiVoce()).toBe(true)
    })

    it('⛔ una dettatura VUOTA non accende niente: il silenzio non è una voce', () => {
        const p = talosProvenienzaVoce()
        p.dettatura('ciao', 'ciao')
        expect(p.nataDiVoce()).toBe(false)
        p.dettatura('ciao', 'ciao   ')
        expect(p.nataDiVoce()).toBe(false)
    })

    it('⛔ dopo l invio il turno DOPO riparte pulito', () => {
        const p = talosProvenienzaVoce()
        p.dettatura('', 'accendi la torcia')
        expect(p.nataDiVoce()).toBe(true)
        p.azzera()
        expect(p.nataDiVoce()).toBe(false)
        p.aggiornaBozza('e adesso spegnila')
        expect(p.nataDiVoce()).toBe(false)
    })
})
