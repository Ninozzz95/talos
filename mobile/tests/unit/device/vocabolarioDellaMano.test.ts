/**
 * ⭐⭐ IL VOCABOLARIO DELLA MANO — e il parametro che moriva a metà strada.
 *
 * ## ⛔ Il difetto che questo file esiste per non far tornare
 *
 * Trovato il 2026-08-16 leggendo il codice per allargare il vocabolario.
 *
 * `talosIstruzioneDelPilota` diceva al modello, testualmente:
 *
 * ```
 * {"azione":"<nome>","indice":<numero>,"testo":"<testo>",
 *  "direzione":"su|giu|sinistra|destra","perche":"<in poche parole>"}
 * ```
 *
 * Il modello la produceva. `talosLeggiAzione` la validava e la metteva nel
 * `TalosAzione`. E poi **`creaManoDelloSchermo` non la passava al ponte**, la
 * firma del ponte non la dichiarava, e `TalosOcchio.esegui()` non la leggeva:
 * `scorri` faceva `ACTION_SCROLL_FORWARD` e basta.
 *
 * ⇒ Un modello che diceva «scorri su» per tornare in cima a una lista **la
 * faceva scendere**. E non se ne accorgeva nessuno, perché l'azione riusciva:
 * `fatto: true`, dal verso sbagliato.
 *
 * ⭐ È la forma peggiore di difetto che ci sia in un agente: **non fallisce**.
 * Un parametro che il modello produce e nessuno legge è peggio di un parametro
 * assente — l'assente lo vedi il primo giorno.
 *
 * ## Le tre azioni nuove, e il filtro che hanno passato
 *
 * `passoDelloSchermo.ts` si dà una regola: *«un'azione che non sappiamo
 * verificare è un'azione che non sappiamo raccontare, e su un telefono altrui
 * non si fa»*. Quindi ognuna ha dovuto rispondere a «come si verifica»:
 *
 * - `premiALungo` → lo schermo cambia, e chi guida riguarda
 * - `recenti` → il pacchetto in primo piano cambia
 * - `imposta` → ⭐ si rilegge `rangeInfo`: porta la propria prova
 *
 * E `trascina` NON è entrata: pretende coordinate, e non sappiamo verificarla.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { TalosAzione } from '@/lib/agent/passoDelloSchermo'

const agisci = vi.fn()
const sistema = vi.fn()

vi.mock('@capacitor/core', () => ({
    Capacitor: { isNativePlatform: () => true },
    registerPlugin: () => ({ agisci, sistema }),
}))

async function mano() {
    const { creaManoDelloSchermo } = await import('@/lib/device/manoDelloSchermo')
    return creaManoDelloSchermo({
        elencoApp: async () => [],
        apriApp: async () => ({ done: true }),
        aspetta: async () => {},
    } as never)
}

describe('⛔ la direzione arriva fino in fondo', () => {
    beforeEach(() => {
        vi.resetModules()
        agisci.mockReset()
        sistema.mockReset()
        agisci.mockResolvedValue({ fatto: true, millisecondi: 3 })
        sistema.mockResolvedValue({ fatto: true })
    })

    it('⭐ «scorri su» arriva al ponte CON la direzione', async () => {
        const esegui = await mano()
        await esegui({ azione: 'scorri', indice: 2, direzione: 'su' } as TalosAzione)
        expect(agisci).toHaveBeenCalledWith(
            expect.objectContaining({ indice: 2, azione: 'scorri', direzione: 'su' }),
        )
    })

    it('⛔ AL CONTRARIO: senza direzione il campo non si inventa', async () => {
        const esegui = await mano()
        await esegui({ azione: 'scorri', indice: 2 } as TalosAzione)
        const passato = agisci.mock.calls[0]![0] as Record<string, unknown>
        expect(passato).not.toHaveProperty('direzione')
    })

    it('tutte e quattro le direzioni passano intatte', async () => {
        const esegui = await mano()
        for (const direzione of ['su', 'giu', 'sinistra', 'destra'] as const) {
            agisci.mockClear()
            await esegui({ azione: 'scorri', indice: 0, direzione } as TalosAzione)
            expect(agisci).toHaveBeenCalledWith(expect.objectContaining({ direzione }))
        }
    })
})

describe('le azioni nuove arrivano al ponte giusto', () => {
    beforeEach(() => {
        vi.resetModules()
        agisci.mockReset()
        sistema.mockReset()
        agisci.mockResolvedValue({ fatto: true, millisecondi: 3 })
        sistema.mockResolvedValue({ fatto: true })
    })

    it('`premiALungo` va su un NODO, quindi passa da agisci()', async () => {
        const esegui = await mano()
        await esegui({ azione: 'premiALungo', indice: 7 } as TalosAzione)
        expect(agisci).toHaveBeenCalledWith(
            expect.objectContaining({ indice: 7, azione: 'premiALungo' }),
        )
        expect(sistema).not.toHaveBeenCalled()
    })

    it('`imposta` porta il VALORE, che è tutto il suo senso', async () => {
        const esegui = await mano()
        await esegui({ azione: 'imposta', indice: 4, valore: 30 } as TalosAzione)
        expect(agisci).toHaveBeenCalledWith(
            expect.objectContaining({ indice: 4, azione: 'imposta', valore: 30 }),
        )
    })

    it('⛔ `imposta` a ZERO non si perde: zero è un valore, non un vuoto', async () => {
        const esegui = await mano()
        await esegui({ azione: 'imposta', indice: 4, valore: 0 } as TalosAzione)
        expect(agisci).toHaveBeenCalledWith(expect.objectContaining({ valore: 0 }))
    })

    it('`recenti` NON ha un indice, quindi passa da sistema()', async () => {
        const esegui = await mano()
        await esegui({ azione: 'recenti' } as TalosAzione)
        expect(sistema).toHaveBeenCalledWith({ azione: 'recenti' })
        expect(agisci).not.toHaveBeenCalled()
    })

    it('⛔ le azioni sul nodo senza indice si rifiutano invece di indovinarlo', async () => {
        const esegui = await mano()
        for (const azione of ['premiALungo', 'imposta'] as const) {
            const esito = await esegui({ azione } as TalosAzione)
            expect(esito).toEqual({ fatto: false, motivo: 'indiceMancante' })
        }
        expect(agisci).not.toHaveBeenCalled()
    })
})
