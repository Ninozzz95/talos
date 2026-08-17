import { describe, expect, it } from 'vitest'
import { talosFraseDiFine, type TalosFineCorsa } from '@/lib/agent/pilotaDelloSchermo'
import { talosLeggiAzione } from '@/lib/agent/passoDelloSchermo'
import { talosRacconto } from '@/lib/tools/schermoTools'

/**
 * ⭐⭐⭐ «FATTO» SOLO SE L'HA DETTO.
 *
 * ## Il difetto, ed era una bugia detta AD ALTA VOCE
 *
 * `fine` significava DUE cose opposte — «obiettivo raggiunto» e «obiettivo
 * impossibile, mi fermo» — e la fine della corsa non le distingueva. Quindi:
 *
 *   `talosFraseDiFine` → «Fatto.»   detto alla PERSONA, dall'altoparlante,
 *                                    mentre TALOS pilota un'altra app e non e'
 *                                    nemmeno a schermo
 *   `talosRacconto`    → «Done»     detto al MODELLO, che poi lo ripete
 *
 * Due bugie da una riga sola, sulla corsa che si era appena arresa. E' la stessa
 * famiglia dell'«inviato ✓» su un messaggio fermo nel campo, e stava nel pilota
 * da prima.
 *
 * ## ⛔ Gli esiti sono TRE, non due
 *
 * La letteratura del 2026 dice che gli agenti «terminate execution without
 * explicitly verifying that the required artifacts were actually produced»: un
 * `riuscito` autodichiarato e' una PRETESA, non una prova.
 *
 *   fallito     si crede, e si dice — nessuno si arrende per sbaglio
 *   riuscito    e' la sua opinione, e resta «Fatto»
 *   non detto   ⛔ NON diventa «Fatto»
 *
 * Il terzo e' quello che conta: trattare il silenzio come un successo e'
 * il difetto di partenza rimesso dentro dalla porta di servizio.
 */
describe('⭐⭐⭐ «fine» dice se ce l\'ha fatta', () => {
    const fine = (extra: Partial<Extract<TalosFineCorsa, { motivo: 'fine' }>> = {}): TalosFineCorsa =>
        ({ motivo: 'fine', ...extra } as TalosFineCorsa)

    describe('la frase detta alla PERSONA', () => {
        it('⛔⛔ chi si e ARRESO non si sente dire «Fatto»', () => {
            const detta = talosFraseDiFine(fine({ esito: 'fallito', testo: 'la pagina non si apre' }))
            expect(detta).not.toMatch(/fatto/i)
            expect(detta).toContain('la pagina non si apre')
        })

        it('e chi ce l ha fatta si sente dire Fatto', () => {
            expect(talosFraseDiFine(fine({ esito: 'riuscito', testo: 'wifi acceso' })))
                .toBe('Fatto: wifi acceso')
        })

        /*
         * ⛔⛔ IL RAMO CHE MORDE DI PIU: se il modello non ha dichiarato niente,
         * il silenzio NON diventa un successo. E il caso che si presenta da se,
         * senza che nessuno lo scelga — basta un modello che ignora un campo.
         */
        it('⛔⛔ e il SILENZIO non diventa «Fatto»', () => {
            const detta = talosFraseDiFine(fine({ testo: 'ho premuto tre volte' }))
            expect(detta).not.toMatch(/fatto/i)
            expect(detta).toMatch(/non so dirti|mi fermo/i)
        })

        it('⛔ e nemmeno il silenzio SENZA testo', () => {
            expect(talosFraseDiFine(fine())).not.toMatch(/fatto/i)
        })
    })

    describe('il racconto dato al MODELLO', () => {
        const corsa = (f: TalosFineCorsa) => talosRacconto({
            fine: f, storia: [], passi: 3, millisecondi: 4000,
        } as Parameters<typeof talosRacconto>[0])

        it('⛔⛔ chi si e ARRESO non torna come «Done»', () => {
            const testo = corsa(fine({ esito: 'fallito' }))
            expect(testo).not.toMatch(/^Done/)
            expect(testo).toMatch(/GAVE UP/)
            // ⛔ E col divieto: un esito onesto non basta, lo sappiamo.
            expect(testo).toMatch(/Do NOT say it is done/i)
        })

        it('e chi ce l ha fatta torna come Done', () => {
            expect(corsa(fine({ esito: 'riuscito' }))).toMatch(/^Done/)
        })

        it('⛔⛔ e il SILENZIO non torna come «Done»', () => {
            const testo = corsa(fine({}))
            expect(testo).not.toMatch(/^Done/)
            expect(testo).toMatch(/Do NOT claim success/i)
        })
    })

    describe('il campo arriva dal modello, e solo dove ha senso', () => {
        const leggi = (riga: string) => talosLeggiAzione(riga, [0])

        it('⛔ «fine» con esito lo porta', () => {
            const letta = leggi('{"azione":"fine","esito":"fallito","perche":"non ci arrivo"}')
            expect(letta.ok).toBe(true)
            if (letta.ok) expect(letta.azione.esito).toBe('fallito')
        })

        /*
         * ⛔ Un valore inventato NON diventa «riuscito»: sparisce, e chi legge
         * tratta la corsa come non dichiarata. Tradurlo in un successo sarebbe
         * il difetto di partenza con un passaggio in piu.
         */
        it('⛔⛔ ma un valore INVENTATO sparisce, non diventa riuscito', () => {
            const letta = leggi('{"azione":"fine","esito":"benissimo","perche":"x"}')
            expect(letta.ok).toBe(true)
            if (letta.ok) expect(letta.azione.esito).toBeUndefined()
        })

        it('⛔ e su un TOCCO non si legge: li non vuol dire niente', () => {
            const letta = leggi('{"azione":"tocca","indice":0,"esito":"riuscito","perche":"x"}')
            expect(letta.ok).toBe(true)
            if (letta.ok) expect(letta.azione.esito).toBeUndefined()
        })
    })

    /*
     * ⛔ AL CONTRARIO: le altre fini non si toccano. Se questa diventasse rossa
     * vorrebbe dire che la cura ha invaso i motivi che gia funzionavano — e
     * quelli sono le frasi che la persona sente quando toglie la mano dallo
     * schermo o quando scade il tempo.
     */
    it('⛔ e le altre fini restano quelle di prima', () => {
        expect(talosFraseDiFine({ motivo: 'mano-sullo-schermo', passo: 2 })).toMatch(/toccare lo schermo/i)
        expect(talosFraseDiFine({ motivo: 'tempo-scaduto' })).toMatch(/troppo/i)
        expect(talosFraseDiFine({ motivo: 'troppi-passi' })).toMatch(/passaggi/i)
    })
})
