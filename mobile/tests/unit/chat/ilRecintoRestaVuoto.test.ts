import { describe, expect, it } from 'vitest'
import { talosRecuperaChiamateNude } from '@/lib/chat/localToolCalls'

/**
 * ⛔⛔ RECINTO-VUOTO-01 — tolto l'oggetto, il RIQUADRO resta.
 *
 * ## Fotografato sul Pad il 2026-08-20, `gemma-3-4b-it-Q4_K_M`
 *
 * La risposta funzionava — «Le coordinate del telefono sono latitudine 37.547 e
 * longitudine 15.0801», vere, Catania — ma sopra c'erano **due riquadri di
 * codice vuoti**, col titolo «JSON» e il pulsante «Copia», e niente dentro.
 *
 * Perché: Gemma scrive la chiamata dentro un recinto markdown —
 *
 * ```json
 * {"name":"device_location","arguments":{}}
 * ```
 *
 * — e il recupero toglie **l'oggetto**, che è la cosa giusta. Ma i due delimitatori
 * non sono l'oggetto: restano lì, e il renderer fa il suo mestiere disegnando un
 * blocco di codice attorno al nulla.
 *
 * ⇒ Un recinto rimasto vuoto **non è testo della persona**: è l'impalcatura di
 * una chiamata che abbiamo appena preso. Si porta via con lei. ⛔ Ma solo se è
 * VUOTO: un blocco di codice con dentro qualcosa è contenuto vero — magari
 * proprio quello che la persona aveva chiesto — e non si tocca.
 */

const OFFERTI = new Set(['device_location', 'tool_details'])

describe('RECINTO-VUOTO-01 il recinto se ne va con la chiamata', () => {
    it('⛔ il recinto rimasto vuoto sparisce', () => {
        const testo = 'Ecco le coordinate:\n\n```json\n{"name":"device_location","arguments":{}}\n```'
        const esito = talosRecuperaChiamateNude(testo, OFFERTI)

        expect(esito.calls).toHaveLength(1)
        expect(esito.text).not.toContain('```')
    })

    it('il testo vero della risposta resta', () => {
        const testo = 'Ecco le coordinate:\n\n```json\n{"name":"device_location","arguments":{}}\n```'
        const esito = talosRecuperaChiamateNude(testo, OFFERTI)

        expect(esito.text).toContain('Ecco le coordinate:')
    })

    it('funziona anche col recinto senza linguaggio', () => {
        const testo = '```\n{"name":"device_location","arguments":{}}\n```'
        const esito = talosRecuperaChiamateNude(testo, OFFERTI)

        expect(esito.calls).toHaveLength(1)
        expect(esito.text.trim()).toBe('')
    })

    it('⛔ e al contrario: un blocco di codice CON dentro qualcosa non si tocca', () => {
        const testo = 'Ecco lo script:\n\n```bash\necho ciao\n```\n\n{"name":"device_location","arguments":{}}'
        const esito = talosRecuperaChiamateNude(testo, OFFERTI)

        expect(esito.calls).toHaveLength(1)
        expect(esito.text).toContain('```bash')
        expect(esito.text).toContain('echo ciao')
    })

    it('⛔ e senza nessuna chiamata il testo non si tocca affatto', () => {
        const testo = 'Ecco un esempio:\n\n```json\n{"a":1}\n```'
        const esito = talosRecuperaChiamateNude(testo, OFFERTI)

        expect(esito.calls).toHaveLength(0)
        expect(esito.text).toBe(testo)
    })
})
