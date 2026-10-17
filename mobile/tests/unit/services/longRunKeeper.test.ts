// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest'

const plugin = vi.hoisted(() => ({
    start: vi.fn(async () => ({ ok: true })),
    update: vi.fn(async () => ({ ok: true })),
    stop: vi.fn(async () => ({ ok: true })),
}))
vi.mock('@capacitor/core', () => ({ registerPlugin: () => plugin }))

/**
 * ⛔ KEEPER-01 (13/10/2026, trovato scrivendo N15): il servizio in primo piano è UNO SOLO (`TalosRunService`) e il suo
 * `stop` è incondizionato. Due custodi vivi insieme — un giro di chat e l'attesa dell'accesso a ChatGPT, o due giri —
 * e il primo che rilasciava spegneva la notifica anche all'altro, che restava senza protezione dal sistema.
 * Il servizio si ferma solo quando l'ULTIMO custode rilascia.
 */
describe('il custode del servizio in primo piano', () => {
    beforeEach(() => { vi.resetModules(); for (const f of Object.values(plugin)) f.mockClear() })

    it('KEEPER-01: con due custodi vivi, il rilascio del primo NON ferma il servizio; lo ferma il rilascio dell ultimo', async () => {
        const { createTalosRunKeeper } = await import('@/services/longRunKeeper')
        const giro = createTalosRunKeeper('Giro')
        const accesso = createTalosRunKeeper('Accesso')
        giro.engage('in corso')
        accesso.engage('in attesa')
        expect(plugin.start).toHaveBeenCalledTimes(2)
        accesso.release()
        expect(plugin.stop).not.toHaveBeenCalled()
        // chi resta riprende la notifica col SUO testo, non con quello di chi è uscito
        expect(plugin.update).toHaveBeenLastCalledWith({ title: 'Giro', text: 'in corso' })
        giro.release()
        expect(plugin.stop).toHaveBeenCalledTimes(1)
    })

    it('KEEPER-02 AL CONTRARIO: un custode solo si comporta come prima; uno mai partito non ferma niente; rilasciare due volte è una volta', async () => {
        const { createTalosRunKeeper } = await import('@/services/longRunKeeper')
        const solo = createTalosRunKeeper('Solo')
        solo.engage('lavoro')
        solo.release()
        solo.release()
        expect(plugin.stop).toHaveBeenCalledTimes(1)
        const maiPartito = createTalosRunKeeper('Breve')
        maiPartito.release()
        expect(plugin.start).toHaveBeenCalledTimes(1)
        expect(plugin.stop).toHaveBeenCalledTimes(1)
    })
})
