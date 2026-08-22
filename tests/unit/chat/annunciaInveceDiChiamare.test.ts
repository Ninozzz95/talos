import { describe, expect, it } from 'vitest'
import { talosProjectLocalToolConversation } from '@/lib/chat/localToolPromptProtocol'

/**
 * ⛔⛔ ANNUNCIA-INVECE-DI-CHIAMARE-01 — «Sto leggendo la posizione del telefono.»
 *
 * ## Misurato sul Pad il 2026-08-20, `gemma-3-4b-it-Q4_K_M`, tre formulazioni
 *
 * | domanda | risposta | attrezzo |
 * |---|---|---|
 * | «Dimmi le coordinate del telefono» | «Ecco le coordinate: 45.4619, 9.1864» (Milano, inventata) | nessuno |
 * | «Dove mi trovo adesso? Usa gli strumenti.» | «Mi trovo in una chat con un utente…» | nessuno |
 * | «In che città sono? Leggi la posizione del telefono.» | «Sto leggendo la posizione del telefono.» | nessuno |
 *
 * Tre su tre. E la terza è la più istruttiva: **annuncia l'azione invece di
 * farla**. Non è che non sappia cosa serve — lo dice. Non emette la chiamata.
 *
 * ## Perché tocca a noi, e non al motore
 *
 * Il template di Gemma non dichiara gli strumenti, quindi il trasporto è
 * `prompt-json-v1` e llama.cpp riceve `tool: 0, grammatica: no`: **nessuna
 * grammatica vincola l'uscita**. Qwen3-1.7B, che è meno di metà, ci riesce
 * perché il suo template è nativo e prende la grammatica pigra del motore.
 * ⇒ Non è la taglia: è il trasporto. L'unica leva qui è il prompt.
 *
 * ## Dove va messo
 *
 * Il protocollo sta nel turno di sistema, cioè **all'inizio**, dietro a
 * migliaia di token di catalogo. L'ultima cosa che il modello legge prima di
 * generare è il messaggio della persona. È la terza volta stanotte che la cura
 * è la stessa — vedi `linguaDopoIlTool.test.ts` e
 * `loSchemaNonEIlRISULTATO.test.ts`: **il promemoria si mette dove guarda per
 * ultimo**.
 *
 * ⛔ Il messaggio della persona non si tocca: si tocca la sua PROIEZIONE, che è
 * già il contratto dichiarato di questo modulo — la conversazione canonica non
 * viene mai mutata.
 */

function ultimoTurno(conTool: boolean): string {
    const proiezione = talosProjectLocalToolConversation({
        transport: 'prompt-json-v1',
        turns: [
            { role: 'system', content: 'You are TALOS.' },
            { role: 'user', content: 'In che città sono?' },
        ] as never,
        ...(conTool ? { tools: [{ type: 'function', function: { name: 'tool_details' } }] } : {}),
        capabilities: { supportsTools: false, supportsToolCalls: false, supportsSystemRole: true },
    } as never)
    return proiezione.turns.at(-1)?.content ?? ''
}

describe('ANNUNCIA-INVECE-DI-CHIAMARE-01 il promemoria sta dopo la domanda', () => {
    it('⛔ vieta di ANNUNCIARE la chiamata invece di farla', () => {
        const testo = ultimoTurno(true)
        expect(testo).toMatch(/do not (announce|say)/i)
    })

    it('⛔ vieta di rispondere a memoria: è l\'invenzione misurata', () => {
        expect(ultimoTurno(true)).toMatch(/from memory|do not guess/i)
    })

    it('⛔ il promemoria arriva DOPO la domanda della persona', () => {
        const testo = ultimoTurno(true)
        const domanda = testo.indexOf('In che città sono?')
        const promemoria = testo.search(/do not (announce|say)/i)
        expect(domanda).toBeGreaterThanOrEqual(0)
        expect(promemoria).toBeGreaterThan(domanda)
    })

    it('la domanda resta intatta, parola per parola', () => {
        expect(ultimoTurno(true)).toContain('In che città sono?')
    })

    it('⛔ e al contrario: senza attrezzi non compare nessun promemoria', () => {
        const testo = ultimoTurno(false)
        expect(testo).toContain('In che città sono?')
        expect(testo).not.toMatch(/do not announce/i)
    })
})
