import { describe, expect, it } from 'vitest'
import {
    TALOS_CODICE_CONTEXT_TOKENS,
    TALOS_CODICE_MIN_CONTEXT_TOKENS,
    talosCodiceContextCandidates,
} from '@/lib/models/localContextPolicy'

/**
 * ⛔ CODICE COL MOTORE LOCALE — la finestra del Codice (ledger `LEDGER-CODICE-MOTORE-LOCALE-2026-10-18.md`): obiettivo 32k ridotto al
 * tetto di quel modello su quel telefono, gradini 32k → 24k, minimo 24k, cache `f16` e `q8_0` solo dopo, mai `q4`.
 * Owner 18/10 «Sì, minimo 16k», poi 19/10 «Minimo 24k + preambolo più leggero»: sul Pad il prompt di r4 è 18.331 token, a 16k non
 * entrava nemmeno il primo messaggio. I tetti arrivano da `localContextCeiling` (lo stesso calcolo della chat); `null` = non misurato.
 */
describe('la finestra del Codice col motore locale', () => {
    it('CTX-COD-01 i numeri dell\'owner: 32k e minimo 24k', () => {
        expect(TALOS_CODICE_CONTEXT_TOKENS).toBe(32768)
        expect(TALOS_CODICE_MIN_CONTEXT_TOKENS).toBe(24576)
    })

    it('CTX-COD-02 con un tetto largo si apre a 32k in f16, poi i gradini', () => {
        expect(talosCodiceContextCandidates({ f16: 65536, q8_0: 120000 })).toEqual([
            { contextTokens: 32768, kvCacheType: 'f16' },
            { contextTokens: 24576, kvCacheType: 'f16' },
            { contextTokens: 32768, kvCacheType: 'q8_0' },
            { contextTokens: 24576, kvCacheType: 'q8_0' },
        ])
    })

    it('CTX-COD-03 un tetto fra 24k e 32k riduce l\'obiettivo, arrotondato in giù a 512', () => {
        expect(talosCodiceContextCandidates({ f16: 28000, q8_0: 37000 })[0]).toEqual({ contextTokens: 27648, kvCacheType: 'f16' })
    })

    it('CTX-COD-04 f16 sotto il minimo: si passa a q8_0', () => {
        expect(talosCodiceContextCandidates({ f16: 20000, q8_0: 30000 })).toEqual([
            { contextTokens: 29696, kvCacheType: 'q8_0' },
            { contextTokens: 24576, kvCacheType: 'q8_0' },
        ])
    })

    it('CTX-COD-05 la stima sotto il minimo con tutte e due le cache: un solo tentativo, al minimo con la cache leggera', () => {
        // owner 19/10 «Provare comunque, rifiutare solo se fallisce»: sul Pad la stima dava 7k a LFM2.5, che a 32k si apre e risponde.
        // La memoria «libera» di Android non conta quella che il sistema può riprendersi: il no del motore è la misura.
        expect(talosCodiceContextCandidates({ f16: 9000, q8_0: 16384 })).toEqual([{ contextTokens: 24576, kvCacheType: 'q8_0' }])
    })

    it('CTX-COD-06 tetto non misurato: si chiede l\'obiettivo e decide il motore', () => {
        expect(talosCodiceContextCandidates({ f16: null, q8_0: null })).toEqual([
            { contextTokens: 32768, kvCacheType: 'f16' },
            { contextTokens: 24576, kvCacheType: 'f16' },
            { contextTokens: 32768, kvCacheType: 'q8_0' },
            { contextTokens: 24576, kvCacheType: 'q8_0' },
        ])
    })

    it('CTX-COD-07 il tetto esattamente al minimo si apre', () => {
        expect(talosCodiceContextCandidates({ f16: 24576, q8_0: 24576 })).toEqual([
            { contextTokens: 24576, kvCacheType: 'f16' },
            { contextTokens: 24576, kvCacheType: 'q8_0' },
        ])
    })
})
