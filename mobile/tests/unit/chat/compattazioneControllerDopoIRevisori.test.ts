import { beforeEach, describe, expect, it, vi } from 'vitest'
import { dividiPerCompattazione, PAROLE_MASSIME_RIASSUNTO } from '@/lib/kernel/compattazione'
import { stimaDellaRichiestaDelPc, stimaRichiesta } from '@/lib/chat/compattazioneChat'
import { creaCompattazioneDelController } from '@/stores/chatControllerCompattazione'
import type { ChatTurn } from '@/stores/chat'

/*
 * Telefono 0.1.48 — il giro dopo i tre revisori (giudice v1535 e v1536), dal lato del controller:
 * - R1: la misura porta anche la stima del PC della stessa richiesta intera (sistema, turni, attrezzi), il denominatore di k;
 * - v1536: oltre la finestra lo store passa lo spazio libero, e la richiesta del riassunto lo dice in parole (metà dei token);
 *   sotto la finestra la richiesta resta quella di prima.
 */
const locale = vi.hoisted(() => ({
    talosLocalFinestraPerCompattazione: vi.fn(() => null),
    talosLocalTokenDellaRichiesta: vi.fn(async () => 777),
}))
vi.mock('@/lib/chat/providers/localAdapter', () => locale)
const fornitore = vi.hoisted(() => ({ complete: vi.fn() }))
vi.mock('@/lib/chat/providerRegistry', () => ({ providerAdapterFor: () => ({ complete: fornitore.complete }) }))

const ATTREZZI = [{ type: 'function', function: { name: 'notes_list', description: 'd'.repeat(4_000), parameters: { type: 'object' } } }]
const giro = { system: 'Sistema del giro.', tools: ATTREZZI, effort: 'off', thinking: false }

function controller(provider: 'local' | 'openrouter', taratura: number | null = null, conGiro = true) {
    return creaCompattazioneDelController({
        modelloDelProfilo: () => ({ provider, model: { id: 'm', provider, displayName: 'm' } as never }),
        ultimoGiro: () => (conGiro ? giro as never : null),
        tokenUltimoGiro: () => null,
        taratura: () => taratura,
        getKey: async () => null,
        getEndpoint: async () => null,
        transport: { request: vi.fn() } as never,
        locale: () => 'en',
    })
}

const turni: ChatTurn[] = Array.from({ length: 8 }, (_, i) => [
    { role: 'user', content: `domanda ${i}` } as ChatTurn,
    { role: 'assistant', content: `risposta ${i} ${'r'.repeat(1_600)}` } as ChatTurn,
]).flat()
const parti = () => dividiPerCompattazione(turni.map((t) => ({ role: t.role, content: t.content })))
const parole = () => Number(/at most (\d+) words/.exec(String((fornitore.complete.mock.calls.at(-1)![0] as { turns: ChatTurn[] }).turns.at(-1)?.content))?.[1])

beforeEach(() => {
    fornitore.complete.mockReset().mockResolvedValue({ text: 'RIASSUNTO', finishReason: 'stop' })
})

describe('Telefono 0.1.48 — controller dopo i revisori', () => {
    it('DK-01 remoto tarato: token = rapporto × stima del telefono, e la stima del PC della stessa richiesta per k', async () => {
        const misura = await controller('openrouter', 2.5).misuraRichiesta({ sessionId: 's', modelProfileId: 'p', turni })
        expect(misura).toEqual({
            token: Math.round(2.5 * stimaRichiesta({ turni, system: giro.system, tools: ATTREZZI })),
            misura: 'fornitore',
            stima: stimaDellaRichiestaDelPc({ turni, system: giro.system, tools: ATTREZZI }),
        })
    })

    it('DK-02 locale: il conteggio del motore e la stima del PC della stessa richiesta', async () => {
        const misura = await controller('local').misuraRichiesta({ sessionId: 's', modelProfileId: 'p', turni })
        expect(misura).toEqual({ token: 777, misura: 'motore', stima: stimaDellaRichiestaDelPc({ turni, system: giro.system, tools: ATTREZZI }) })
    })

    it('DK-03 oltre la finestra il tetto dello spazio arriva al modello in parole (metà dei token)', async () => {
        await controller('openrouter').riassumiConversazione({ sessionId: 's', modelProfileId: 'p', motivo: 'overflow', turni, parti: parti(), spazioDelRiassunto: 241 })
        expect(parole()).toBe(120)
    })

    it('DK-04 sotto la finestra la richiesta resta quella di prima', async () => {
        await controller('openrouter').riassumiConversazione({ sessionId: 's', modelProfileId: 'p', motivo: 'manuale', turni, parti: parti() })
        expect(parole()).toBe(PAROLE_MASSIME_RIASSUNTO)
    })
})
