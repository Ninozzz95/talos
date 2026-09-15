import { describe, expect, it } from 'vitest'
import { talosProjectLocalToolConversation } from '@/lib/chat/localToolPromptProtocol'

/**
 * ⛔⛔ CHIAMATA-SCRITTA-COME-PROSA-01 — sapeva COSA, non sapeva COME.
 *
 * MISURATO sul Pad il 2026-08-19, `gemma-3-4b-it-Q4_K_M`, «Dimmi le coordinate
 * del telefono». La risposta arrivata in chat, per intero:
 *
 * ```
 *   tool_details library_list device_location
 * ```
 *
 * Il nome della funzione è quello vero e i due argomenti sono i due strumenti
 * che servivano davvero: è la chiamata **giusta, scritta male**. Senza la forma
 * non è una chiamata — è testo, e finisce nella bolla come se fosse la risposta.
 *
 * Su questo trasporto llama.cpp non riceve né attrezzi né grammatica
 * (`tool: 0, grammatica: no`): la forma è tutta nostra, e l'unica leva è il
 * prompt. ⇒ Accanto allo scheletro coi segnaposto ci va la chiamata **vera**
 * che farà per prima, e il contro-esempio di ciò che ha sbagliato.
 */

function intestazione(): string {
    const proiezione = talosProjectLocalToolConversation({
        transport: 'prompt-json-v1',
        turns: [
            { role: 'system', content: 'You are TALOS.' },
            { role: 'user', content: 'Dimmi le coordinate del telefono' },
        ] as never,
        tools: [{ type: 'function', function: { name: 'tool_details' } }],
        capabilities: { supportsTools: false, supportsToolCalls: false, supportsSystemRole: true },
    } as never)
    return proiezione.turns.find((turno) => turno.role === 'system')?.content ?? ''
}

describe('CHIAMATA-SCRITTA-COME-PROSA-01 il protocollo mostra la chiamata vera', () => {
    it('⛔ porta un esempio CONCRETO, non solo i segnaposto', () => {
        const testo = intestazione()
        expect(testo).toContain('{"name":"tool_details","arguments":{"names":["device_location","library_list"]}}')
    })

    it('⛔ mostra anche la forma SBAGLIATA, cioè quella che ha prodotto davvero', () => {
        const testo = intestazione()
        expect(testo).toMatch(/wrong/i)
        expect(testo).toContain('tool_details device_location library_list')
    })

    it('l\'esempio giusto viene PRIMA di quello sbagliato', () => {
        const testo = intestazione()
        const giusto = testo.indexOf('{"name":"tool_details"')
        const sbagliato = testo.search(/wrong/i)
        expect(giusto).toBeGreaterThanOrEqual(0)
        expect(sbagliato).toBeGreaterThan(giusto)
    })

    it('lo scheletro coi segnaposto resta: era già giusto, mancava il caso concreto', () => {
        expect(intestazione()).toContain('{"name":"function_name","arguments":{"argument_name":"value"}}')
    })

    it('⛔ e al contrario: senza attrezzi il protocollo non compare affatto', () => {
        const proiezione = talosProjectLocalToolConversation({
            transport: 'prompt-json-v1',
            turns: [
                { role: 'system', content: 'You are TALOS.' },
                { role: 'user', content: 'Ciao' },
            ] as never,
            capabilities: { supportsTools: false, supportsToolCalls: false, supportsSystemRole: true },
        } as never)
        const sistema = proiezione.turns.find((turno) => turno.role === 'system')?.content ?? ''
        expect(sistema).not.toMatch(/prompt-json-v1/)
        expect(sistema).toContain('You are TALOS.')
    })
})
