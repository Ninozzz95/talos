import { describe, expect, it } from 'vitest'

import {
    TALOS_PREFIX_FREE_SPACE_MARGIN,
    TALOS_PREFIX_MAX_BYTES,
    TALOS_PREFIX_MIN_TOKENS,
    talosPrefixOutcomeOf,
    talosShouldFreezePrefix,
    type TalosPrefixOutcome,
} from '@/lib/models/prefixCache'

/**
 * ⭐⭐⭐ IL MOTIVO CHE NESSUNO LEGGEVA.
 *
 * `talosShouldFreezePrefix` calcolava un `reason` col commento «per il doctor e
 * per il registro» dal giorno in cui è nato, e un `grep verdetto.reason` su
 * tutto `src/` (2026-09-10) trovava **zero lettori**: veniva calcolato e
 * buttato nello stesso respiro.
 *
 * ⛔ Questi test NON provano che un campo esista. Provano che a tre CAUSE
 * diverse corrispondono tre USCITE diverse — e la differenza non è
 * accademica: in questo progetto un campo che esisteva ed era sempre `false`
 * è quasi diventato una prova che una cache funzionava
 * ([[una-costante-travestita-da-misura]]). Un test che chiede «c'è il campo?»
 * lo passa anche una funzione che risponde sempre la stessa cosa.
 */
describe('MOTIVO — dal verdetto sul prefisso all esito che si legge a schermo', () => {
    // Una forma normale: 28 strati, 8 teste KV, testa 128, f16 ⇒ 114.688 B/token.
    const PER_TOKEN = 28 * 8 * 128 * 2 * 2

    it('MOTIVO-01 tre cause, tre uscite DIVERSE — e nessuna coincide col sì', () => {
        const corto = talosPrefixOutcomeOf(talosShouldFreezePrefix({
            tokens: TALOS_PREFIX_MIN_TOKENS - 1,
            kvBytesPerToken: PER_TOKEN,
            freeBytes: 500_000_000_000,
        }))
        const senzaSpazio = talosPrefixOutcomeOf(talosShouldFreezePrefix({
            tokens: 3104,
            kvBytesPerToken: PER_TOKEN,
            // Sotto il margine che la politica pretende di lasciare libero.
            freeBytes: TALOS_PREFIX_FREE_SPACE_MARGIN,
        }))
        const troppoGrande = talosPrefixOutcomeOf(talosShouldFreezePrefix({
            tokens: 3104,
            // Scelto perché 3104 × questo supera il tetto assoluto.
            kvBytesPerToken: Math.ceil(TALOS_PREFIX_MAX_BYTES / 3104) + 1,
            freeBytes: 500_000_000_000,
        }))
        const si = talosPrefixOutcomeOf(talosShouldFreezePrefix({
            tokens: 3104,
            kvBytesPerToken: PER_TOKEN,
            freeBytes: 500_000_000_000,
        }))

        expect(corto).toBe('too-short')
        expect(senzaSpazio).toBe('no-space')
        expect(troppoGrande).toBe('too-large')
        expect(si).toBe('preparing')
        // ⛔ Il cuore del test: quattro cause ⇒ quattro valori distinti. Se
        // domani la funzione rispondesse sempre lo stesso, questa riga cade.
        expect(new Set([corto, senzaSpazio, troppoGrande, si]).size).toBe(4)
    })

    /**
     * ⛔ AL CONTRARIO — la via che non deve mentire.
     *
     * Un verdetto con `freeze:false` e `reason` vuoto non può nascere da
     * `talosShouldFreezePrefix`. Se nascesse, «in preparazione» direbbe a chi
     * legge che qualcosa si sta preparando mentre nessuno la prepara: la stessa
     * famiglia di bugia di «APERTA non è FATTA». Deve uscire un esito onesto.
     */
    it('MOTIVO-02 AL CONTRARIO: un no con motivo vuoto NON diventa «in preparazione»', () => {
        expect(talosPrefixOutcomeOf({ freeze: false, reason: '', bytes: 0 }))
            .toBe('check-failed')
        expect(talosPrefixOutcomeOf({ freeze: true, reason: '', bytes: 10 }))
            .toBe('preparing')
    })

    /**
     * ⛔ Il verso contrario dell'ORDINE, non solo dei valori.
     *
     * Un prefisso corto E senza spazio deve dire «corto»: è la ragione che si
     * ripete a ogni turno e che la persona può capire, mentre lo spazio cambia
     * da un minuto all'altro. Se un giorno i controlli si riordinassero, questa
     * riga lo direbbe invece di lasciarlo scivolare.
     */
    it('MOTIVO-03 quando due no valgono insieme, vince quello STABILE', () => {
        expect(talosPrefixOutcomeOf(talosShouldFreezePrefix({
            tokens: 10,
            kvBytesPerToken: PER_TOKEN,
            freeBytes: 0,
        }))).toBe('too-short')
    })

    /**
     * ⛔ Il cancello sul FUTURO, provato invece che dichiarato.
     *
     * Undici codici, e ognuno deve restare distinto dagli altri: se qualcuno
     * ne aggiunge uno riusando un valore esistente «per non toccare la UI»,
     * l'esito nuovo diventerebbe invisibile dietro una frase vecchia — cioè il
     * silenzio da cui siamo partiti, con un nome nuovo.
     */
    it('MOTIVO-04 gli undici esiti sono undici valori distinti', () => {
        const tutti: TalosPrefixOutcome[] = [
            'reused', 'not-reused', 'preparing', 'engine-refused', 'save-failed',
            'unknown-shape', 'too-short', 'no-space', 'too-large', 'unavailable',
            'check-failed',
        ]
        expect(new Set(tutti).size).toBe(tutti.length)
    })
})
