import { describe, expect, it } from 'vitest'
import { TALOS_EN_MESSAGES } from '@/i18n/locales/en'
import { TALOS_IT_MESSAGES } from '@/i18n/locales/it'
import {
    descriviRigaVivaR4,
    durataBreveR4,
    fineMutaR4,
    formattaTokenBreveR4,
    interpretaCompattazioneR4,
    percheRipiegoR4,
    stimaBreveR4,
    testoEsitoCompattazioneR4,
    type TraduttoreR4,
} from '@/lib/harness/r4/compattazioneR4'

/*
 * Ledger `LEDGER-RIGA-VIVA-CODICE-2026-10-21.md`: la riga viva del riassunto e l'esito del ripiego nel Codice del telefono, con le
 * regole e le frasi del desktop (r4 `f87c8f800`, `context-progress.js` e `compattazione-legacy.js`) e il contratto §2-§5, §8.
 * ⛔ Mai numeri inventati: un campo che il motore non dà resta fuori dalla frase.
 */
const traduttore = (messaggi: object): TraduttoreR4 => (chiave, valori) => {
    const v = chiave.split('.').reduce<unknown>((o, k) => (o && typeof o === 'object' ? (o as Record<string, unknown>)[k] : undefined), messaggi)
    if (typeof v !== 'string') throw new Error(`frase mancante: ${chiave}`)
    return v.replace(/\{(\w+)\}/g, (_, k: string) => (valori && k in valori ? String(valori[k]) : `{${k}}`))
}
const en = { t: traduttore(TALOS_EN_MESSAGES), lingua: 'en' as const }
const it_ = { t: traduttore(TALOS_IT_MESSAGES), lingua: 'it' as const }

describe('RV — gli eventi della compattazione di r4', () => {
    it('RV-01 inizio, fine, annullata e progresso nella forma del desktop; il resto è null', () => {
        expect(interpretaCompattazioneR4('talos.compattazione', { fase: 'inizio', motivo: 'overflow', tokenPrima: 20_000, soglia: 18_000 }))
            .toEqual({ tipo: 'inizio', motivo: 'overflow' })
        expect(interpretaCompattazioneR4('talos.compattazione', {
            fase: 'fine', compattato: true, at: 'A1', tokenPrima: 31_200, tokenDopo: 9_900, ripiego: true, ragione: 'tempo', annullabile: false,
        })).toEqual({ tipo: 'fine', compattato: true, at: 'A1', tokenPrima: 31_200, tokenDopo: 9_900, annullabile: false, ripiego: true, ragione: 'tempo', motivo: null, dettaglio: null })
        // l'`at` può stare nel record (forma vecchia); una ragione fuori elenco non si riporta
        expect(interpretaCompattazioneR4('talos.compattazione', { fase: 'fine', compattato: true, record: { at: 'A2' }, ripiego: true, ragione: 'boh' }))
            .toMatchObject({ at: 'A2', ripiego: true, ragione: null, annullabile: true })
        // una fine fallita: `errore: <testo>` diventa motivo + dettaglio; i numeri di una fine fallita non si tengono
        expect(interpretaCompattazioneR4('talos.compattazione', { fase: 'fine', compattato: false, motivo: 'errore: 503 dal fornitore', tokenPrima: 5 }))
            .toEqual({ tipo: 'fine', compattato: false, at: null, tokenPrima: null, tokenDopo: null, annullabile: false, ripiego: false, ragione: null, motivo: 'errore', dettaglio: '503 dal fornitore' })
        expect(interpretaCompattazioneR4('talos.compattazione', { fase: 'annullata', at: 'A1' })).toEqual({ tipo: 'annullata', at: 'A1' })
        expect(interpretaCompattazioneR4('talos.compattazione-annullata', { at: 'A1' })).toEqual({ tipo: 'annullata', at: 'A1' })
        expect(interpretaCompattazioneR4('talos.compattazione-progresso', {
            fase: 'lettura', motivo: 'overflow', tentativo: 1, tentativi: 3, trascorsoMs: 12_000, letti: 6_200, inCache: 4_000, totale: 10_000,
            stimaRestanteSec: 64, origine: 'adattatore',
        })).toEqual({
            tipo: 'progresso', fase: 'lettura', motivo: 'overflow', origine: 'adattatore', tentativo: 1, tentativi: 3, trascorsoMs: 12_000,
            letti: 6_200, inCache: 4_000, totale: 10_000, stimaRestanteSec: 64, tokenScritti: null,
        })
        // `tokenRiassunto` è il nome che il contatore del kernel dà oggi; un campo storto è null, mai zero
        expect(interpretaCompattazioneR4('talos.compattazione-progresso', { fase: 'riassunto', tokenRiassunto: 120, letti: -3, totale: 'x' }))
            .toMatchObject({ tokenScritti: 120, letti: null, totale: null })
        expect(interpretaCompattazioneR4('talos.compattazione', { fase: 'boh' })).toBeNull()
        expect(interpretaCompattazioneR4('talos.compattazione', null)).toBeNull()
        expect(interpretaCompattazioneR4('talos.altro', { fase: 'inizio' })).toBeNull()
    })

    it('RV-02 «ceduta» è una fine muta; le altre fini fallite no', () => {
        const ceduta = interpretaCompattazioneR4('talos.compattazione', { fase: 'fine', compattato: false, motivo: 'ceduta', interrottaIn: 'riassunto' })
        expect(fineMutaR4(ceduta)).toBe(true)
        expect(fineMutaR4(interpretaCompattazioneR4('talos.compattazione', { fase: 'fine', compattato: false, motivo: 'vuoto' }))).toBe(false)
        expect(fineMutaR4(interpretaCompattazioneR4('talos.compattazione', { fase: 'fine', compattato: true, at: 'A', motivo: 'ceduta' }))).toBe(false)
        expect(fineMutaR4(null)).toBe(false)
        // Desktop 21/10 notte: il riassunto atteso sulla strada del motore del contesto chiude con `motivo:'motore'`, muto (racconta il
        // separatore del motore)
        expect(fineMutaR4(interpretaCompattazioneR4('talos.compattazione', { fase: 'fine', compattato: false, motivo: 'motore', giro: 2 }))).toBe(true)
    })
})

describe('RV — la riga viva', () => {
    it('RV-03 senza numeri: solo l\'etichetta e un filo indeterminato', () => {
        const v = descriviRigaVivaR4({ tipo: 'inizio', motivo: 'overflow' }, en.t, en.lingua)
        expect(v.etichetta).toBe('Summarizing context')
        expect(v.dettaglio).toBe('')
        expect(v.determinato).toBe(false)
        expect(v.tratti).toBeNull()
        expect(v.valoreTesto).toBe('')
    })

    it('RV-04 con letti e totale: percento, stima, filo a due tratti; i numeri incoerenti non sforano', () => {
        const v = descriviRigaVivaR4({ tipo: 'progresso', fase: 'lettura', letti: 6_200, inCache: 4_000, totale: 10_000, stimaRestanteSec: 64 }, en.t, en.lingua)
        expect(v.dettaglio).toBe('62% · ~1 min')
        expect(v.determinato).toBe(true)
        expect(v.tratti).toEqual({ cache: 40, letto: 22 })
        expect(v.valoreTesto).toBe('62% · ~1 min')
        expect(v.titolo).toBe('10,000 tokens to read, 4,000 already cached')
        const storto = descriviRigaVivaR4({ tipo: 'progresso', letti: 12_000, inCache: 15_000, totale: 10_000 }, en.t, en.lingua)
        expect(storto.dettaglio).toBe('100%')
        expect(storto.tratti).toEqual({ cache: 100, letto: 0 })
        const italiano = descriviRigaVivaR4({ tipo: 'progresso', fase: 'lettura', letti: 6_200, inCache: 0, totale: 10_000, trascorsoMs: 192_000, tentativo: 2, tentativi: 3 }, it_.t, it_.lingua)
        expect(italiano.etichetta).toBe('Riassumo il contesto')
        expect(italiano.titolo).toBe('10.000 token da leggere · 3 min 12 s trascorsi · tentativo 2 di 3')
    })

    it('RV-05 mentre scrive il riassunto: i token scritti al posto del percento', () => {
        expect(descriviRigaVivaR4({ tipo: 'progresso', fase: 'riassunto', tokenScritti: 1_234, stimaRestanteSec: 20 }, en.t, en.lingua).dettaglio)
            .toBe('writing · 1,234 tokens · ~20 s')
        expect(descriviRigaVivaR4({ tipo: 'progresso', fase: 'riassunto', tokenScritti: 1 }, en.t, en.lingua).dettaglio).toBe('writing · 1 token')
        expect(descriviRigaVivaR4({ tipo: 'progresso', fase: 'riassunto' }, it_.t, it_.lingua).dettaglio).toBe('scrivo')
    })

    it('RV-06 la stima in breve: passi di 5 s, mai «~0 s» né «~60 s»; la durata trascorsa', () => {
        expect(stimaBreveR4(null, en.t)).toBe('')
        expect(stimaBreveR4(0, en.t)).toBe('')
        expect(stimaBreveR4(1, en.t)).toBe('~5 s')
        expect(stimaBreveR4(42, en.t)).toBe('~40 s')
        expect(stimaBreveR4(58, en.t)).toBe('~1 min')
        expect(stimaBreveR4(600, it_.t)).toBe('~10 min')
        expect(durataBreveR4(5_400, en.t)).toBe('5s')
        expect(durataBreveR4(192_000, en.t)).toBe('3m 12s')
        expect(durataBreveR4(192_000, it_.t)).toBe('3 min 12 s')
        expect(durataBreveR4(-1, en.t)).toBe('')
    })
})

describe('RV — l\'esito', () => {
    it('RV-07 il ripiego in una riga: ragione in una parola e numeri brevi', () => {
        expect(testoEsitoCompattazioneR4({ stato: 'riassunta', ripiego: true, ragione: 'tempo', tokenPrima: 31_234, tokenDopo: 9_870 }, en.t, en.lingua))
            .toBe('Compacted without the model (time limit) · 31.2k → 9.9k')
        expect(testoEsitoCompattazioneR4({ stato: 'riassunta', ripiego: true, ragione: 'saltato', tokenPrima: 31_234, tokenDopo: 9_870 }, it_.t, it_.lingua))
            .toBe('Compattata senza il modello (saltato) · 31,2k → 9,9k')
        expect(testoEsitoCompattazioneR4({ stato: 'riassunta', ripiego: true, ragione: null }, en.t, en.lingua)).toBe('Compacted without the model')
        expect(formattaTokenBreveR4(950, en.lingua, en.t)).toBe('950')
        expect(formattaTokenBreveR4(null, en.lingua, en.t)).toBeNull()
    })

    it('RV-08 una compattazione non riuscita dice perché, con parole e non codici', () => {
        expect(testoEsitoCompattazioneR4({ stato: 'non-riuscita', motivo: 'vuoto' }, en.t, en.lingua)).toBe('Conversation not summarized · the model answered with nothing')
        expect(testoEsitoCompattazioneR4({ stato: 'non-riuscita', motivo: 'errore', dettaglio: '503' }, it_.t, it_.lingua))
            .toBe('Conversazione non riassunta · il fornitore ha risposto con un errore (503)')
        // un motivo che non conosciamo si dice com'è: nasconderlo sarebbe dire meno del vero
        expect(testoEsitoCompattazioneR4({ stato: 'non-riuscita', motivo: 'nuovo-motivo' }, en.t, en.lingua)).toBe('Conversation not summarized · nuovo-motivo')
        expect(testoEsitoCompattazioneR4({ stato: 'non-riuscita' }, en.t, en.lingua)).toBe('Conversation not summarized')
    })

    it('RV-09 il perché del ripiego per esteso, una frase per ragione', () => {
        for (const ragione of ['tempo', 'saltato', 'rifiutato', 'stima', 'esaurito', null]) {
            const inglese = percheRipiegoR4(ragione, en.t)
            const italiano = percheRipiegoR4(ragione, it_.t)
            expect(inglese.length).toBeGreaterThan(20)
            expect(italiano).not.toBe(inglese)
        }
        expect(percheRipiegoR4('saltato', en.t)).toBe('You skipped the model’s summary, so TALOS went on with a summary made without the model.')
    })

    it('RV-10 revisione: l\'archivio riallineato non è un fallimento; `error:` del sottofondo e numeri con decimali', () => {
        expect(testoEsitoCompattazioneR4({ stato: 'non-riuscita', motivo: 'archivio-riallineato' }, en.t, en.lingua))
            .toBe('Context archive realigned with the conversation · the earlier versions are kept aside')
        expect(interpretaCompattazioneR4('talos.compattazione', { fase: 'fine', compattato: false, motivo: 'error: provider timeout' }))
            .toMatchObject({ motivo: 'errore', dettaglio: 'provider timeout' })
        expect(interpretaCompattazioneR4('talos.compattazione', { fase: 'fine', compattato: true, at: 'A', tokenPrima: 31_234.6, tokenDopo: 9_870.2, giro: 2 }))
            .toMatchObject({ tokenPrima: 31_235, tokenDopo: 9_870, giro: 2 })
        expect(interpretaCompattazioneR4('talos.compattazione', { fase: 'inizio', motivo: 'soglia', giro: 4 })).toEqual({ tipo: 'inizio', motivo: 'soglia', giro: 4 })
    })
})
