/**
 * ⛔⛔ OGNI RIGA DEI PERMESSI HA UN NOME, IN TUTTE E DUE LE LINGUE.
 *
 * ## Il difetto che questo file ha trovato, il 2026-08-14
 *
 * Tre righe erano nell'elenco e **nessuna delle due lingue le sapeva nominare**:
 * `contacts`, `calendar`, `camera`. La schermata le disegnava lo stesso, con la
 * chiave grezza al posto del titolo:
 *
 * ```
 *   privacyPermissions.rows.calendar.title
 *   privacyPermissions.rows.calendar.purpose
 * ```
 *
 * Non è un difetto grafico. La regola dell'owner su questo progetto è che i
 * permessi si elencano **TUTTI** — «tutti i permessi della app necessari vanno
 * collegati nella relativa schermata» — e un permesso che la sua stessa pagina
 * non sa nominare non è elencato: è una riga che chi legge salta.
 *
 * ⛔ E si vede solo aprendo quella schermata **in quella lingua**. Un `t()` che
 * non trova la chiave torna la chiave: non lancia, non avverte, non rompe
 * nessun test. Questo cancello è l'unica cosa che se ne accorge prima di una
 * persona.
 */
import { describe, expect, it } from 'vitest'
import { TALOS_PERMISSION_ROWS } from '@/lib/permissions/permissionRows'
import { TALOS_IT_MESSAGES } from '@/i18n/locales/it'
import { TALOS_EN_MESSAGES } from '@/i18n/locales/en'

type Voce = { title?: unknown, purpose?: unknown }

const LINGUE: Array<[string, Record<string, Voce>]> = [
    ['it', TALOS_IT_MESSAGES.privacyPermissions.rows as unknown as Record<string, Voce>],
    ['en', TALOS_EN_MESSAGES.privacyPermissions.rows as unknown as Record<string, Voce>],
]

describe('le righe dei permessi, e il loro nome', () => {
    for (const [lingua, righe] of LINGUE) {
        it(`⛔ ogni riga ha titolo e scopo in ${lingua}`, () => {
            const mute = TALOS_PERMISSION_ROWS
                .filter((riga) => typeof righe[riga.id]?.title !== 'string'
                    || typeof righe[riga.id]?.purpose !== 'string')
                .map((riga) => riga.id)
            // Il messaggio elenca QUALI: «una manca» manderebbe a cercarla a mano.
            expect(mute, `righe senza traduzione in ${lingua}: ${mute.join(', ')}`).toEqual([])
        })

        it(`nessuna traduzione avanzata in ${lingua}: sarebbe una riga sparita dall'elenco`, () => {
            const conosciute = new Set<string>(TALOS_PERMISSION_ROWS.map((riga) => riga.id))
            /*
             * ⛔ Il verso contrario, e non è simmetria per bellezza: una voce
             * tradotta che non esiste più nell'elenco vuol dire che qualcuno ha
             * tolto un permesso dalla schermata e la traduzione è rimasta lì a
             * far credere che ci sia ancora.
             */
            const orfane = Object.keys(righe).filter((id) => !conosciute.has(id))
            expect(orfane, `traduzioni senza riga in ${lingua}: ${orfane.join(', ')}`).toEqual([])
        })
    }

    it('⛔ il conteggio della posta è elencato, ed è `runtime` perché SI CHIEDE', () => {
        const riga = TALOS_PERMISSION_ROWS.find((r) => r.id === 'mailCount')
        expect(riga, 'il permesso di Gmail deve stare nella schermata').toBeDefined()
        /*
         * MISURATO sul Pad il 2026-08-14: `dumpsys package permission
         * com.google.android.gm.permission.READ_CONTENT_PROVIDER` → `prot=dangerous`.
         * Dichiararlo nel manifest non basta, e chiamarlo `install` qui
         * rassicurerebbe la persona su una voce sbagliata.
         */
        expect(riga!.kind).toBe('runtime')
        // ⛔ E la riga dice «quanti», non «legge la posta»: da quella strada il
        // testo di una email non è raggiungibile, e spaventare più del vero è
        // un difetto quanto rassicurare più del vero.
        expect(riga!.purpose).toContain('never the sender')
    })
})
