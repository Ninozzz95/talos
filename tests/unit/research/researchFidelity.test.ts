import { describe, expect, it } from 'vitest'
import { talosResearchFidelity } from '@/lib/research/researchFidelity'
import type { TalosResearchVerifiedClaim } from '@/lib/research/researchVerification'

/**
 * ⛔⛔ FEDELTA-05 — le quattro misure, e il divieto di darne una quando non c'è.
 *
 * ## Da dove vengono
 *
 * Ricerca del 2026-08-20 sui benchmark per gli agenti di ricerca profonda
 * (DeepResearch Bench, TRACE, e il lavoro sull'attribuzione delle fonti): le
 * dimensioni su cui si giudica un rapporto sono **copertura**, **fedeltà delle
 * citazioni**, **ancoraggio delle affermazioni** e — perché conta quanto le
 * altre tre — **quante prove distinte** ci sono davvero.
 *
 * ⛔ E la stessa ricerca dice perché una di queste misure invecchia: FACT è
 * considerato inaffidabile per la riproducibilità *perché le pagine citate
 * diventano irraggiungibili nel tempo*. È la ragione per cui accanto a queste
 * misure ci vuole la tenuta nel tempo, e per cui un punteggio si mostra sempre
 * **con la sua data**.
 *
 * ## ⛔ La regola che conta più delle formule
 *
 * Un numero su cui nessuno ha giudicato non è un numero basso: **non è un
 * numero**. Una ricerca senza giudice non produce «40%», produce «non
 * verificata» — perché un 40% viene letto come una misura, e sarebbe una
 * misura di niente.
 */

function affermazione(
    resolved: 'page' | 'snippet' | 'missing',
    quotePresent: boolean,
    claimSupported: 'yes' | 'partial' | 'no' | 'unchecked',
    judge: string | null = 'giudice',
): TalosResearchVerifiedClaim {
    return {
        claim: { text: 'una affermazione' } as never,
        passage: quotePresent ? 'il passaggio' : '',
        checks: {
            resolved,
            quotePresent,
            quoteSpan: quotePresent ? { from: 0, to: 3 } : null,
            claimSupported,
            supportReason: '',
            judge,
            judgedAt: judge ? '2026-08-20T00:00:00.000Z' : null,
        },
    }
}

describe('FEDELTA-05 le quattro misure', () => {
    it('⛔ senza NESSUN giudizio non c\'è punteggio: c\'è «non verificata»', () => {
        const esito = talosResearchFidelity({
            claims: [
                affermazione('page', true, 'unchecked', null),
                affermazione('page', true, 'unchecked', null),
            ],
            sources: [{ url: 'https://uno.example/a' }],
        })

        expect(esito.verified).toBe(false)
        expect(esito.coverage).toBeNull()
        expect(esito.citationFaithfulness).toBeNull()
        expect(esito.claimGroundedness).toBeNull()
    })

    it('⛔ ma le fonti indipendenti si contano lo stesso: non dipendono dal giudice', () => {
        const esito = talosResearchFidelity({
            claims: [affermazione('page', true, 'unchecked', null)],
            sources: [
                { url: 'https://uno.example/a' },
                { url: 'https://uno.example/b' },
                { url: 'https://due.example/c' },
            ],
        })

        expect(esito.independentSources).toBe(2)
    })

    it('la copertura è la quota di affermazioni su cui qualcuno ha giudicato', () => {
        const esito = talosResearchFidelity({
            claims: [
                affermazione('page', true, 'yes'),
                affermazione('page', true, 'no'),
                affermazione('page', true, 'unchecked', null),
                affermazione('page', true, 'unchecked', null),
            ],
            sources: [{ url: 'https://uno.example/a' }],
        })

        expect(esito.verified).toBe(true)
        expect(esito.coverage).toBeCloseTo(0.5, 5)
    })

    it('⛔ la fedeltà delle citazioni guarda se il passaggio C\'È DAVVERO nella fonte', () => {
        const esito = talosResearchFidelity({
            claims: [
                affermazione('page', true, 'yes'),
                affermazione('page', true, 'yes'),
                affermazione('snippet', false, 'yes'),
                affermazione('missing', false, 'partial'),
            ],
            sources: [{ url: 'https://uno.example/a' }],
        })

        // Due su quattro portano un passaggio ritrovato nella pagina.
        expect(esito.citationFaithfulness).toBeCloseTo(0.5, 5)
    })

    it('l\'ancoraggio conta solo le sostenute PIENE, e le parziali per metà', () => {
        const esito = talosResearchFidelity({
            claims: [
                affermazione('page', true, 'yes'),
                affermazione('page', true, 'partial'),
                affermazione('page', true, 'no'),
                affermazione('page', true, 'no'),
            ],
            sources: [{ url: 'https://uno.example/a' }],
        })

        // (1 + 0,5) su 4 giudicate.
        expect(esito.claimGroundedness).toBeCloseTo(0.375, 5)
    })

    it('⛔ e al contrario: zero affermazioni non fa una divisione per zero', () => {
        const esito = talosResearchFidelity({ claims: [], sources: [] })

        expect(esito.verified).toBe(false)
        expect(esito.coverage).toBeNull()
        expect(esito.claimGroundedness).toBeNull()
        expect(esito.independentSources).toBe(0)
    })

    it('⛔ ogni punteggio porta la sua DATA, perché le pagine muoiono', () => {
        const esito = talosResearchFidelity({
            claims: [affermazione('page', true, 'yes')],
            sources: [{ url: 'https://uno.example/a' }],
        })

        expect(esito.measuredAt).toBe('2026-08-20T00:00:00.000Z')
    })
})
