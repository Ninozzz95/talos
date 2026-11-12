import { describe, expect, it } from 'vitest'
import {
    accorciaPerLaFinestra,
    ESITO_TOLTO_PER_LA_FINESTRA,
    MARCATORE_RIASSUNTO,
    stimaTokenMessaggi,
    type TalosMessaggioCompattabile as M,
} from '@/lib/kernel/compattazione'

/*
 * Owner 11/11/2026 17:45 («Cura completa nella 0.1.48», punto 2): quando la richiesta non entra nella finestra del
 * dispositivo si accorcia anche la parte tenuta alla lettera — PRIMA le uscite vecchie degli strumenti (Hermes
 * `agent/context_compressor.py:836`, `_PRUNED_TOOL_PLACEHOLDER`), POI gli scambi più vecchi fra quelli tenuti (Codex
 * `codex-rs/core/src/compact.rs:366`, «removing oldest history item»), MAI la richiesta in corso.
 * Giudice v1510: tocca solo ciò che va al modello (qui: una copia; l'ingresso non cambia).
 */
const x = (n: number, c = 'x') => c.repeat(n)
const chiamata = (id: string, path: string) => ({ id, type: 'function', function: { name: 'leggi', arguments: JSON.stringify({ path }) } })

function proiezione(): M[] {
    return [
        { role: 'system', content: 'Sistema di TALOS.' },
        { role: 'user', content: 'domanda 3 tenuta alla lettera' },
        { role: 'user', content: `${MARCATORE_RIASSUNTO}\n\nIl riassunto.` },
        { role: 'user', content: 'domanda 4' },
        { role: 'assistant', content: '', tool_calls: [chiamata('c1', 'a.txt')] },
        { role: 'tool', tool_call_id: 'c1', content: x(2_000, 'a') },
        { role: 'assistant', content: x(800, 'b') },
        { role: 'user', content: 'domanda 5, la richiesta in corso' },
        { role: 'assistant', content: '', tool_calls: [chiamata('c2', 'b.txt')] },
        { role: 'tool', tool_call_id: 'c2', content: x(1_600, 'c') },
    ]
}

const testi = (lista: readonly M[]) => lista.map((m) => String(m.content ?? ''))

describe('accorciaPerLaFinestra — la parte tenuta intera, quando la richiesta non entra (0.1.48)', () => {
    it('FIN-01 se entra torna identica e non conta niente', () => {
        const lista = proiezione()
        const esito = accorciaPerLaFinestra(lista, { bersaglio: stimaTokenMessaggi(lista) })
        expect(esito).toMatchObject({ esitiTolti: 0, scambiTolti: 0, entra: true })
        expect(esito.messaggi).toEqual(lista)
    })

    it('FIN-02 PRIMA le uscite vecchie degli strumenti: basta quella, gli scambi restano tutti', () => {
        const lista = proiezione()
        const esito = accorciaPerLaFinestra(lista, { bersaglio: stimaTokenMessaggi(lista) - 300 })
        expect(esito).toMatchObject({ esitiTolti: 1, scambiTolti: 0, entra: true })
        expect(esito.messaggi).toHaveLength(lista.length)
        expect(esito.messaggi[5]).toEqual({ role: 'tool', tool_call_id: 'c1', content: ESITO_TOLTO_PER_LA_FINESTRA })
        expect(testi(esito.messaggi)).toContain('domanda 3 tenuta alla lettera')
        expect(testi(esito.messaggi)).toContain('domanda 4')
    })

    it('FIN-03 POI gli scambi più vecchi fra quelli tenuti, dal più vecchio; sistema e riassunto restano', () => {
        const lista = proiezione()
        const senzaEsito = stimaTokenMessaggi(lista) - 500 + Math.ceil(ESITO_TOLTO_PER_LA_FINESTRA.length / 4)
        // Un token sotto: non basta togliere l'uscita vecchia, va via anche la richiesta tenuta più vecchia (domanda 3).
        const uno = accorciaPerLaFinestra(lista, { bersaglio: senzaEsito - 1 })
        expect(uno).toMatchObject({ esitiTolti: 1, scambiTolti: 1, entra: true })
        expect(testi(uno.messaggi)).not.toContain('domanda 3 tenuta alla lettera')
        expect(testi(uno.messaggi)).toContain('domanda 4')
        // Più stretto: via anche lo scambio di «domanda 4», intero (chiamata, uscita e risposta: nessuna coppia spezzata).
        const due = accorciaPerLaFinestra(lista, { bersaglio: senzaEsito - 220 })
        expect(due).toMatchObject({ scambiTolti: 2, entra: true })
        expect(due.messaggi.map((m) => m.role)).toEqual(['system', 'user', 'user', 'assistant', 'tool'])
        expect(due.messaggi[0]).toEqual(lista[0])
        expect(due.messaggi[1]).toEqual(lista[2])
        // Nessun esito senza la sua chiamata.
        const chiamate = new Set(due.messaggi.flatMap((m) => (m.tool_calls ?? []).map((c) => c.id)))
        for (const m of due.messaggi) if (m.role === 'tool') expect(chiamate.has(String(m.tool_call_id))).toBe(true)
        // L'esito accorciato era dentro lo scambio tolto: il conto dice solo ciò che resta accorciato.
        expect(due.esitiTolti).toBe(0)
    })

    it('FIN-04 MAI la richiesta in corso: anche quando non entra, resta intera byte per byte (uscita compresa)', () => {
        const lista = proiezione()
        const esito = accorciaPerLaFinestra(lista, { bersaglio: 10 })
        expect(esito.entra).toBe(false)
        expect(esito.messaggi.slice(-3)).toEqual(lista.slice(-3))
        expect(esito.messaggi[0]).toEqual(lista[0])
        expect(esito.messaggi.some((m) => String(m.content).startsWith(MARCATORE_RIASSUNTO))).toBe(true)
    })

    it('FIN-05 l\'ingresso non cambia (è una copia per il modello: la storia salvata resta intera)', () => {
        const lista = proiezione()
        const copia = JSON.parse(JSON.stringify(lista)) as M[]
        accorciaPerLaFinestra(lista, { bersaglio: 10 })
        expect(lista).toEqual(copia)
    })

    it('FIN-06 un\'uscita già corta non si «accorcia» e non si conta', () => {
        const lista: M[] = [
            { role: 'user', content: 'vecchia' },
            { role: 'assistant', content: '', tool_calls: [chiamata('c1', 'a.txt')] },
            { role: 'tool', tool_call_id: 'c1', content: 'ok' },
            { role: 'assistant', content: x(400) },
            { role: 'user', content: 'in corso' },
        ]
        const esito = accorciaPerLaFinestra(lista, { bersaglio: stimaTokenMessaggi(lista) - 50 })
        expect(esito.esitiTolti).toBe(0)
        expect(esito.scambiTolti).toBe(1)
        expect(esito.messaggi).toEqual([lista[4]])
    })
})
