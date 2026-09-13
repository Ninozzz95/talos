import { describe, expect, it } from 'vitest'
import { talosChatDateBuckets } from '@/lib/chat/chatDateBuckets'

/**
 * ⛔⛔ SIDEBAR-PIATTA-01 — venti righe uguali, tutte «1 h fa».
 *
 * ## Cosa ho visto, misurato il 2026-08-20
 *
 * Provando i modelli locali ho aperto venti chat di prova. La barra laterale è
 * diventata un muro: «Dimmi le coordinate del telefono» ripetuto dodici volte,
 * e sotto ognuna «1 h fa», «1 h fa», «1 h fa». Nessun appiglio per scorrere:
 * l'unica cosa che distingue due righe è un tempo relativo che a quella
 * distanza è identico.
 *
 * ## La convenzione, dalla ricerca del 2026-08-20
 *
 * È lo stesso schema in tutti i prodotti di chat: **Oggi · Ieri · Precedenti 7
 * giorni · Precedenti 30 giorni**, poi il nome del mese. E l'ordinamento è per
 * ULTIMO AGGIORNAMENTO, non per creazione: una chat di sei mesi fa risale in
 * cima nel momento in cui le scrivi.
 *
 * ## ⛔ «Oggi» è un GIORNO, non ventiquattro ore
 *
 * Una chat delle 23:50 di ieri, letta alle 00:10, non è «oggi» perché sono
 * passati venti minuti: è **ieri**, e chi la cerca la cerca lì. Il confine è la
 * mezzanotte locale.
 *
 * ## ⛔⛔ E per questo le date qui sotto sono in ORA LOCALE
 *
 * La prima stesura le scriveva in UTC — `'2026-08-19T22:00:00.000Z'` — su una
 * macchina in CEST, dove quell'istante è già **il 20 agosto**. Due test sono
 * falliti dicendo «today» dove mi aspettavo «yesterday», e non era il codice a
 * sbagliare: era la prova.
 *
 * ⇒ Un test sui confini del calendario scritto in UTC prova una cosa diversa a
 * seconda di dove gira, e sulla CI passerebbe o fallirebbe per il fuso della
 * macchina. `new Date(anno, mese, giorno, ora)` è locale per definizione: qui
 * la mezzanotte è la mezzanotte di chi legge, che è esattamente ciò che il
 * codice deve rispettare.
 */

/** Ora LOCALE, sempre — vedi la nota qui sopra. Il mese è 0-based. */
const L = (a: number, m: number, g: number, h = 12, min = 0) =>
    new Date(a, m - 1, g, h, min).toISOString()

const ADESSO = new Date(2026, 7, 20, 10, 0)

function riga(id: string, updatedAt: string) {
    return { id, updated_at: updatedAt }
}

const quando = (item: { updated_at: string }) => item.updated_at

describe('SIDEBAR-PIATTA-01 i gruppi', () => {
    it('mette oggi, ieri e la settimana in tre gruppi distinti', () => {
        const gruppi = talosChatDateBuckets(
            [
                riga('a', L(2026, 8, 20, 9)),
                riga('b', L(2026, 8, 19, 22)),
                riga('c', L(2026, 8, 16)),
            ],
            quando,
            ADESSO,
        )

        expect(gruppi.map((g) => g.bucket)).toEqual(['today', 'yesterday', 'last7'])
        expect(gruppi[0]?.items.map((i) => i.id)).toEqual(['a'])
    })

    it('⛔ «oggi» finisce a MEZZANOTTE, non ventiquattro ore fa', () => {
        // Le 23:50 di ieri, guardate alle 00:10: venti minuti fa, ma è IERI.
        const gruppi = talosChatDateBuckets(
            [riga('a', L(2026, 8, 19, 23, 50))],
            quando,
            new Date(2026, 7, 20, 0, 10),
        )

        expect(gruppi[0]?.bucket).toBe('yesterday')
    })

    it('separa i trenta giorni dal più vecchio', () => {
        const gruppi = talosChatDateBuckets(
            [riga('a', L(2026, 8, 5)), riga('b', L(2026, 5, 2))],
            quando,
            ADESSO,
        )

        expect(gruppi.map((g) => g.bucket)).toEqual(['last30', 'older'])
    })

    it('⛔ i più vecchi si dividono per MESE, non in un mucchio solo', () => {
        const gruppi = talosChatDateBuckets(
            [riga('a', L(2026, 5, 2)), riga('b', L(2026, 3, 14))],
            quando,
            ADESSO,
        )

        expect(gruppi).toHaveLength(2)
        expect(gruppi[0]?.monthKey).toBe('2026-05')
        expect(gruppi[1]?.monthKey).toBe('2026-03')
    })

    it('l\'ordine dentro un gruppo è dal più recente', () => {
        const gruppi = talosChatDateBuckets(
            [riga('vecchia', L(2026, 8, 20, 1)), riga('nuova', L(2026, 8, 20, 9))],
            quando,
            ADESSO,
        )

        expect(gruppi[0]?.items.map((i) => i.id)).toEqual(['nuova', 'vecchia'])
    })

    it('⛔ un gruppo VUOTO non compare: un titolo senza righe sembra un guasto', () => {
        const gruppi = talosChatDateBuckets([riga('a', L(2026, 8, 20, 9))], quando, ADESSO)

        expect(gruppi).toHaveLength(1)
        expect(gruppi[0]?.bucket).toBe('today')
    })

    it('⛔ e al contrario: una chat SENZA data non sparisce', () => {
        // Sparire è la cosa peggiore: la persona la cerca, non c'è, e non ha
        // modo di sapere che esiste ancora. Va in fondo, dove si guarda per
        // ultimo, ma va.
        const gruppi = talosChatDateBuckets(
            [riga('a', L(2026, 8, 20, 9)), { id: 'senza', updated_at: '' }],
            quando,
            ADESSO,
        )

        expect(gruppi.at(-1)?.bucket).toBe('undated')
        expect(gruppi.at(-1)?.items.map((i) => i.id)).toEqual(['senza'])
    })

    it('nessuna chat non fa nessun gruppo', () => {
        expect(talosChatDateBuckets([], quando, ADESSO)).toEqual([])
    })
})
