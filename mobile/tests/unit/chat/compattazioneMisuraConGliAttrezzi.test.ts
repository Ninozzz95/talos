import { describe, expect, it, vi } from 'vitest'
import { creaCompattazioneDelController } from '@/stores/chatControllerCompattazione'

/*
 * Telefono 0.1.48 (owner 11/11/2026 17:45, punto 1; giudice v1510): la stima del guadagno si fa sulla richiesta INTERA,
 * attrezzi compresi. Sul telefono il catalogo degli attrezzi pesa quanto mezza finestra del Pad: una stima che li
 * ignora vede un guadagno che non c'è e paga il riassunto per niente.
 */
const conta = vi.hoisted(() => vi.fn(async (input: { turns: unknown[], tools?: unknown[], system?: string }) =>
    Math.ceil((JSON.stringify(input.turns).length + JSON.stringify(input.tools ?? []).length + (input.system ?? '').length) / 4)))
vi.mock('@/lib/chat/providers/localAdapter', () => ({
    talosLocalTokenDellaRichiesta: conta,
    talosLocalFinestraPerCompattazione: () => null,
}))

const ATTREZZI = [{ type: 'function', function: { name: 'notes_list', description: 'd'.repeat(4_000), parameters: { type: 'object' } } }]

function controller(provider: 'local' | 'openrouter', taratura: number | null = null) {
    return creaCompattazioneDelController({
        modelloDelProfilo: () => ({ provider, model: { id: 'm', provider, displayName: 'm' } as never }),
        ultimoGiro: () => ({ system: 'Sistema.', tools: ATTREZZI, effort: 'off', thinking: false }),
        tokenUltimoGiro: () => null,
        taratura: () => taratura,
        getKey: async () => null,
        getEndpoint: async () => null,
        transport: { request: vi.fn() } as never,
        locale: () => 'en',
    })
}

describe('la misura della richiesta conta gli attrezzi dell\'ultimo giro', () => {
    it('MIS-01 locale: il motore conta anche sistema e attrezzi', async () => {
        const misura = await controller('local').misuraRichiesta({ sessionId: 's', modelProfileId: 'p', turni: [{ role: 'user', content: 'ciao' }] })
        expect(conta).toHaveBeenLastCalledWith(expect.objectContaining({ tools: ATTREZZI, system: 'Sistema.' }))
        expect(misura?.token).toBeGreaterThan(1_000)
    })

    it('MIS-02 remoto tarato: la stima comprende gli schemi degli attrezzi', async () => {
        const misura = await controller('openrouter', 1).misuraRichiesta({ sessionId: 's', modelProfileId: 'p', turni: [{ role: 'user', content: 'ciao' }] })
        expect(misura?.token).toBeGreaterThan(1_000)
    })
})
