import { describe, expect, it } from 'vitest'
import {
    talosEngineDiagnosticRows,
    talosKvBytesPerTokenOf,
    type TalosEngineFacts,
} from '@/lib/models/engineDiagnostics'

/**
 * Il motore locale, raccontato a chi deve capire perché è lento.
 *
 * Owner 2026-08-06: «dobbiamo espandere il doctor con funzioni diagnostiche
 * avanzate, soprattutto per i modelli locali». La prova che aveva ragione era
 * arrivata poche ore prima, dal suo registro: **111 secondi** prima della prima
 * parola e **195 millisecondi** ai giri successivi dello stesso invio.
 *
 * Tutti i numeri per capire il perché esistevano già — li misura il motore da
 * stamattina — e non erano visibili da nessuna parte. **Una misura che nessuno
 * può leggere è una misura che non è stata presa.**
 *
 * Queste prove guardano soprattutto le righe che devono diventare ROSSE, perché
 * una diagnostica che non sa dire «qui c'è qualcosa che non va» è un elenco di
 * numeri.
 */
const SANO: TalosEngineFacts = {
    available: true,
    backends: 'CPU',
    loadedPath: '/storage/emulated/0/…/unsloth/Qwen3-1.7B-GGUF/main/Qwen3-1.7B-Q8_0.gguf',
    shape: {
        layers: 28, kvHeads: 8, headDim: 128,
        trainedContext: 32_768, weightBytes: 1_830_000_000, kvBytesPerElement: 2,
    },
    kvCacheType: 'f16',
    opensSinceStart: 1,
    threads: 4,
    threadsBatch: 7,
    microBatch: 512,
    contextTokens: 8_192,
    contextCeiling: 14_202,
    timings: {
        tokenizeMs: 1, prefixMs: 1, prefillMs: 126, firstTokenMs: 126, totalMs: 600,
        promptTokens: 366, reusedTokens: 342, newTokens: 24, producedTokens: 12,
        reusedContext: true,
    },
    cpuCores: 8,
    cpuCapacities: [792, 792, 792, 792, 792, 792, 1024, 1024],
    installedTotal: 7,
    installedConversational: 6,
}

function riga(facts: TalosEngineFacts, id: string) {
    return talosEngineDiagnosticRows(facts).find((row) => row.id === id)
}

describe('il conto che ridimensiona ogni discussione sul contesto', () => {
    /**
     * 28 strati × 8 teste KV × 128 × 2 (K e V) × 2 byte = **112 KiB per token**.
     * È il numero che spiega perché un contesto «solo» di 14.202 token aggiunge
     * più di un gigabyte e mezzo.
     */
    it('la cache costa 112 KiB per token su questo modello', () => {
        expect(talosKvBytesPerTokenOf(SANO.shape!)).toBe(114_688)
    })

    it('e con la cache leggera costa quasi la metà', () => {
        expect(talosKvBytesPerTokenOf({ ...SANO.shape!, kvBytesPerElement: 34 / 32 }))
            .toBeCloseTo(60_928, 0)
    })
})

describe('le righe che devono diventare rosse', () => {
    it('senza motore nativo lo dice, invece di mostrare una riga vuota', () => {
        expect(riga({ ...SANO, available: false, backends: '' }, 'engine')?.ok).toBe(false)
    })

    /**
     * ⛔ Il difetto tolto l'8B: prefill e generazione con lo STESSO numero di
     * thread. Sono carichi opposti — MISURATO, il prefill raddoppia da 2 a 8
     * thread mentre la generazione è piatta — e se ricompare deve vedersi.
     */
    it('due numeri di thread UGUALI sono un difetto, non una configurazione', () => {
        expect(riga(SANO, 'engine-threads')?.ok).toBe(true)
        expect(riga({ ...SANO, threads: 4, threadsBatch: 4 }, 'engine-threads')?.ok).toBe(false)
    })

    /**
     * ⛔ Un contesto più grande di quanto il dispositivo concederebbe adesso:
     * sta funzionando, ed è la condizione in cui il sistema uccide il processo a
     * metà risposta. MISURATO sul Pad: 8192 in uso contro 2304 di tetto.
     */
    it('un contesto oltre il tetto attuale è un avviso', () => {
        expect(riga(SANO, 'engine-context')?.ok).toBe(true)
        expect(riga({ ...SANO, contextTokens: 8_192, contextCeiling: 2_304 }, 'engine-context')?.ok)
            .toBe(false)
    })

    /**
     * ⛔ La riga che avrebbe fatto risparmiare cento secondi: zero token riusati
     * su un prompt lungo significa che si sta ripagando il prefill di tutta la
     * conversazione.
     */
    it('zero riusati su un prompt lungo è rosso', () => {
        const rifatto = {
            ...SANO,
            timings: { ...SANO.timings!, reusedTokens: 0, newTokens: 7_052, promptTokens: 7_052 },
        }
        expect(riga(rifatto, 'engine-reuse')?.ok).toBe(false)
    })

    it('ma sul primo turno, dove non c\'era niente da riusare, non lo è', () => {
        const primoTurno = {
            ...SANO,
            timings: { ...SANO.timings!, reusedTokens: 0, newTokens: 300, promptTokens: 300 },
        }
        expect(riga(primoTurno, 'engine-reuse')?.ok).toBe(true)
    })

    it('e in modalità banco di prova, dove si azzera apposta, nemmeno', () => {
        const banco = {
            ...SANO,
            timings: {
                ...SANO.timings!, reusedContext: false,
                reusedTokens: 0, newTokens: 5_000, promptTokens: 5_000,
            },
        }
        expect(riga(banco, 'engine-reuse')?.ok).toBe(true)
    })
})

describe('quello che le righe dicono', () => {
    it('i cinque stadi, non un totale solo', () => {
        const stadi = riga(SANO, 'engine-stages')?.value ?? ''
        for (const stadio of ['tok', 'pref', 'prefill', '1° tok', 'tot']) {
            expect(stadi).toContain(stadio)
        }
    })

    /**
     * ⛔ Il contatore che rende visibile in un istante la doppia apertura: due
     * aperture per un messaggio solo vogliono dire gigabyte ricaricati.
     */
    it('quante volte il modello è stato aperto', () => {
        expect(riga(SANO, 'engine-opens')?.value).toBe('1')
        expect(riga({ ...SANO, opensSinceStart: 2 }, 'engine-opens')?.value).toBe('2')
    })

    it('il modello per NOME, non per percorso', () => {
        const valore = riga(SANO, 'engine-model')?.value ?? ''
        expect(valore).toBe('Qwen3-1.7B-Q8_0.gguf')
        expect(valore).not.toContain('/storage')
    })

    /**
     * La differenza fra i due numeri sono i proiettori: GGUF validi con cui non
     * si parla. Evita la domanda «perché ne vedo sette nella cartella e sei nel
     * selettore».
     */
    it('quanti file e quanti sono davvero modelli', () => {
        expect(riga(SANO, 'engine-installed')?.value).toBe('6 / 7')
        expect(riga({ ...SANO, installedConversational: 7 }, 'engine-installed')?.value).toBe('7')
    })

    it('i core forti, contati e non dedotti dal nome del chip', () => {
        expect(riga(SANO, 'engine-cpu')?.value).toContain('8 core')
        expect(riga(SANO, 'engine-cpu')?.value).toContain('2 forti')
    })

    it('senza modello aperto non inventa una forma', () => {
        const spento = { ...SANO, loadedPath: null, shape: null, timings: null }
        expect(riga(spento, 'engine-shape')).toBeUndefined()
        expect(riga(spento, 'engine-stages')).toBeUndefined()
        expect(riga(spento, 'engine-model')?.value).toBe('—')
        // E «nessun modello aperto» NON è un guasto: si apre al primo messaggio.
        expect(riga(spento, 'engine-model')?.ok).toBe(true)
    })
})
