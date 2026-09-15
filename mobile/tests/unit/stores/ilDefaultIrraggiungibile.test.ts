/**
 * ⛔⛔ UN DEFAULT CHE NESSUN PERCORSO PUÒ PRODURRE NON È UN DEFAULT.
 *
 * Trovato il 2026-08-16 guardando lo schermo dell'owner: «Salva automaticamente
 * i file generati» era **spento**, e il valore dichiarato in
 * `DEFAULT_SHELL_PREFERENCES` è `true`, con la sua ragione scritta accanto:
 *
 * > Owner 2026-07-27: *«on by default. A document the model made and did not
 * > save is simply lost — the chat scrolls away and the bytes go with it, which
 * > is not a preference so much as a bug with a switch on it.»*
 *
 * ## Il meccanismo
 *
 * La migrazione `library_defaults_v1` nasce dalla revisione di sicurezza del
 * **25 luglio** — due giorni PRIMA di quella decisione — e spegneva **tutti e
 * due** gli interruttori della Libreria. Su `library_context_enabled` aveva
 * ragione: mandare l'intera Libreria a un fornitore terzo è un consenso
 * esplicito. Il salvataggio automatico c'è finito per compagnia: è locale, è un
 * file della persona, e non esce da nessuna parte.
 *
 * ⇒ E la migrazione gira anche su un'installazione **nuova**, perché
 * `parseTalosMobileSettings(null)` non ha la bandiera. Quindi quel `true` non
 * lo vedeva **nessuno, mai**: una decisione dell'owner zittita da una
 * migrazione più vecchia, in silenzio, su ogni telefono.
 *
 * ⛔ Questa è la classe di difetto peggiore in un file di impostazioni: non
 * fallisce, non lancia, e chi legge il codice vede una decisione che il codice
 * non applica.
 */
import { describe, expect, it } from 'vitest'
import { parseTalosMobileSettings } from '@/stores/settings'

describe('⛔ il salvataggio automatico dei file generati', () => {
    it('⭐ installazione NUOVA: acceso, come deciso il 2026-07-27', () => {
        const stato = parseTalosMobileSettings(null)
        expect(stato.shell.library_autosave_generated).toBe(true)
    })

    it('chi aveva già subito la forzatura lo ritrova acceso', () => {
        // Aveva passato `library_defaults_v1`, quindi si portava dietro il
        // `false` che nessuno aveva scelto.
        const vecchio = JSON.stringify({
            library_defaults_v1: true,
            shell: { library_autosave_generated: false },
        })
        expect(parseTalosMobileSettings(vecchio).shell.library_autosave_generated).toBe(true)
    })

    it('⛔ ma dopo il giro, spegnerlo DI PROPOSITO regge', () => {
        const scelto = JSON.stringify({
            library_autosave_defaults_v2: true,
            shell: { library_autosave_generated: false },
        })
        expect(parseTalosMobileSettings(scelto).shell.library_autosave_generated).toBe(false)
    })

    it('e chi lo aveva acceso resta acceso', () => {
        const acceso = JSON.stringify({
            library_autosave_defaults_v2: true,
            shell: { library_autosave_generated: true },
        })
        expect(parseTalosMobileSettings(acceso).shell.library_autosave_generated).toBe(true)
    })
})

describe('⛔ la Libreria nel contesto, invece, resta SPENTA', () => {
    /*
     * ⛔ Non è simmetrica all'altra, e la differenza è il motivo per cui la
     * revisione di sicurezza aveva ragione su questa:
     *
     *   salvataggio automatico → un file, LOCALE, della persona
     *   Libreria nel contesto  → TUTTA la Libreria, a OGNI messaggio, a un
     *                            fornitore terzo
     *
     * La seconda è la trifecta che il modello di sicurezza sorveglia: dati
     * privati + uscita. Resta un consenso esplicito.
     */
    it('installazione nuova: spenta', () => {
        expect(parseTalosMobileSettings(null).shell.library_context_enabled).toBe(false)
    })

    it('⛔ e il giro nuovo NON la riaccende per sbaglio', () => {
        const dopo = JSON.stringify({
            library_autosave_defaults_v2: true,
            shell: { library_context_enabled: false },
        })
        expect(parseTalosMobileSettings(dopo).shell.library_context_enabled).toBe(false)
    })
})
