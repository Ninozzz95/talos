import { describe, expect, it } from 'vitest'
import { cartaFermatoR4 } from '@/lib/harness/r4/fermatoR4'
import errori from '@/lib/harness/r4/testi/errori-fermato-r4.json'

/**
 * ⛔ K3 Stop come il desktop (ledger `LEDGER-K3-STOP-2026-10-16.md`; owner 16/10 «Come il desktop»). Il golden sono le parole del
 * desktop r4 @ 2161afb32 (`errori.js`, regola `fermato-da-te` e vestizione `fermato`), prese dal JSON estratto al pin, e il punto
 * di fermata tradotto come `puntoNellaLingua`.
 */
const STOP_VERO = '⛔ stopped on request: while "shell" was running.'

describe('la nota dello Stop (K3 Stop)', () => {
    it('FERMO-01 italiano: badge, titolo, cosa, il perché col punto nella lingua, il rimedio e il grezzo', () => {
        expect(cartaFermatoR4(STOP_VERO, 'it')).toEqual({
            badge: 'Fermato',
            titolo: 'TALOS · fermato',
            cosa: 'Hai fermato il giro.',
            perche: 'Il lavoro si è chiuso al primo punto sicuro (mentre «shell» era in corso), come chiesto. Quello che era già fatto resta: i file scritti restano scritti.',
            rimedi: ['Scrivi un altro messaggio per continuare da qui, nella stessa sessione.'],
            etichettaTecnico: 'Testo del server',
            tecnico: STOP_VERO,
        })
        expect(errori.origine.commit.startsWith('701c6c0d2')).toBe(true)
    })

    it('FERMO-02 inglese, e senza punto la frase senza parentesi', () => {
        const en = cartaFermatoR4(STOP_VERO, 'en-US')
        expect(en.cosa).toBe('You stopped the turn.')
        expect(en.perche).toBe('The work closed at the first safe point (while “shell” was running), as requested. What was already done stays: the files written stay written.')
        expect([en.badge, en.titolo, en.etichettaTecnico]).toEqual(['Stopped', 'TALOS · stopped', 'Server text'])
        expect(cartaFermatoR4('⛔ stopped on request.', 'it').perche).toBe(errori.it['turno.fermato.perche'])
        // l'italiano delle sessioni salvate prima
        expect(cartaFermatoR4('⛔ interrotto su richiesta: before round 3.', 'it').perche).toContain('(prima del giro 3)')
    })

    it('FERMO-03 un punto che non si riconosce passa com\'è; solo la prima riga conta; il grezzo resta intero', () => {
        const testo = '⛔ stopped on request: somewhere new.\nultimo testo del modello.'
        const carta = cartaFermatoR4(testo, 'it')
        expect(carta.perche).toContain('(somewhere new)')
        expect(carta.tecnico).toBe(testo)
    })
})
