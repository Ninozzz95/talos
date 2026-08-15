/**
 * ⛔ Il guardiano COLLEGATO: legge, confronta, avvisa, ricorda.
 *
 * `capacitaCheSiSpengono` difende la regola; questo difende il giro completo —
 * perché una regola giusta che nessuno chiama, o che chiama male, è una regola
 * che non esiste. È lo stesso difetto per cui i nove strumenti del telefono
 * erano scritti e il modello non li vedeva.
 */
import { describe, expect, it, vi } from 'vitest'
import { talosCheckCapabilities } from '@/services/capabilityWatchService'

function impianto(prima: Record<string, boolean> | null, adesso: Record<string, boolean>) {
    const avvisi: Array<{ key: string, weight: string, id: string }> = []
    let ricordato: Record<string, boolean> | null = prima
    const deps = {
        leggiStato: vi.fn(async () => adesso),
        leggiPrecedente: vi.fn(async () => ricordato),
        scriviPrecedente: vi.fn(async (stato: Record<string, boolean>) => { ricordato = stato }),
        avvisa: vi.fn((evento: { key: string, weight: string, id: string }) => { avvisi.push(evento) }),
    }
    return { deps, avvisi, letto: () => ricordato }
}

describe('il guardiano collegato', () => {
    it('COLLEGATO-01 ⛔ al PRIMO avvio non annuncia niente, e ricorda', async () => {
        /*
         * Senza un «prima» non esiste una perdita: esiste solo uno stato.
         * Annunciarlo trasformerebbe la normalità di quel telefono in un
         * allarme — il modo più veloce per insegnare a ignorare gli allarmi.
         */
        const { deps, avvisi, letto } = impianto(null, { privileged_bridge: false })

        await talosCheckCapabilities(deps as never)

        expect(avvisi).toEqual([])
        expect(letto()).toEqual({ privileged_bridge: false })
    })

    it('COLLEGATO-02 ⛔ il ponte caduto si annuncia, una volta, col peso giusto', async () => {
        const { deps, avvisi } = impianto({ privileged_bridge: true }, { privileged_bridge: false })

        await talosCheckCapabilities(deps as never)

        expect(avvisi).toHaveLength(1)
        expect(avvisi[0]!.key).toBe('capability-lost:privileged_bridge')
        expect(avvisi[0]!.weight).toBe('notable')
    })

    it('COLLEGATO-03 due risvegli di fila NON raddoppiano l’avviso', async () => {
        // La memoria si aggiorna dopo il primo giro: il secondo confronta
        // «spento» con «spento» e tace.
        const { deps, avvisi } = impianto({ privileged_bridge: true }, { privileged_bridge: false })

        await talosCheckCapabilities(deps as never)
        await talosCheckCapabilities(deps as never)

        expect(avvisi).toHaveLength(1)
    })

    it('COLLEGATO-04 se il ponte torna, il prossimo spegnimento è di nuovo una notizia', async () => {
        const { deps, avvisi } = impianto({ privileged_bridge: false }, { privileged_bridge: true })
        await talosCheckCapabilities(deps as never)
        expect(avvisi).toEqual([])

        deps.leggiStato = vi.fn(async () => ({ privileged_bridge: false }))
        await talosCheckCapabilities(deps as never)
        expect(avvisi).toHaveLength(1)
    })
})
