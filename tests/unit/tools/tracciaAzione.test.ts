import { describe, expect, it } from 'vitest'
import {
    TALOS_METADATA_AZIONI,
    talosAzioniEseguite,
    talosHaAzioniDaMostrare,
} from '@/lib/tools/tracciaAzione'
import type { TalosToolAuditRow } from '@/lib/tools/executor'

/**
 * ⛔⛔ L'AZIONE RIESCE E LA CHAT DICE DI NO.
 *
 * MISURATO sul Pad il 2026-08-10, Qwen3-1.7B, chat nuova, torcia accesa:
 *
 * ```
 *   dumpsys   07:26:12 : Torch … turned off for client PID 1246   ✅ SPENTA
 *   in chat   «The tool_results do not contain what the user asked for.»
 * ```
 *
 * Con la chiave lo stesso turno dice «Fatto, torcia spenta! 🔦». ⇒ Finché
 * l'unico narratore è il modello, quello che la persona legge dipende da quanto
 * è bravo il modello. La traccia la scrive TALOS.
 */

const riga = (over: Partial<TalosToolAuditRow>): TalosToolAuditRow => ({
    tool: 'device_torch',
    action: 'write',
    requiredActions: ['write'],
    status: 'succeeded',
    input: {},
    ...over,
} as TalosToolAuditRow)

describe('⛔ la traccia dice cosa è stato FATTO, non cosa è stato chiamato', () => {
    it('il caso che l\'ha fatta nascere: la torcia spenta compare', () => {
        expect(talosAzioniEseguite([riga({})])).toEqual([{ tool: 'device_torch' }])
    })

    it('⛔ una LETTURA non si annuncia: dieci righe nascondono l\'unica che conta', () => {
        const solo = talosAzioniEseguite([
            riga({ tool: 'library_search', action: 'read' }),
            riga({ tool: 'device_status', action: 'read' }),
            riga({ tool: 'device_torch', action: 'write' }),
        ])
        expect(solo).toEqual([{ tool: 'device_torch' }])
    })

    it('⛔ un tool FALLITO non entra: sarebbe la bugia opposta', () => {
        expect(talosAzioniEseguite([riga({ status: 'failed' })])).toEqual([])
        expect(talosAzioniEseguite([riga({ status: 'denied' })])).toEqual([])
        expect(talosAzioniEseguite([riga({ status: 'refused_busy' })])).toEqual([])
    })

    it('lo stesso strumento due volte compare una volta sola', () => {
        // I modelli piccoli richiamano lo stesso tool: misurato quattro giri
        // sullo stesso turno. Ripeterlo non aggiunge niente a chi legge.
        const r = talosAzioniEseguite([riga({}), riga({}), riga({ tool: 'device_volume' })])
        expect(r).toEqual([{ tool: 'device_torch' }, { tool: 'device_volume' }])
    })

    it('l\'ordine è quello in cui le cose sono successe', () => {
        const r = talosAzioniEseguite([
            riga({ tool: 'device_volume' }),
            riga({ tool: 'device_torch' }),
        ])
        expect(r.map((a) => a.tool)).toEqual(['device_volume', 'device_torch'])
    })

    it('senza azioni non c\'è niente da mostrare, e la vista non disegna il vuoto', () => {
        expect(talosAzioniEseguite([])).toEqual([])
        expect(talosHaAzioniDaMostrare({})).toBe(false)
        expect(talosHaAzioniDaMostrare({ [TALOS_METADATA_AZIONI]: [] })).toBe(false)
        expect(talosHaAzioniDaMostrare(null)).toBe(false)
        expect(talosHaAzioniDaMostrare({ [TALOS_METADATA_AZIONI]: [{ tool: 'device_torch' }] })).toBe(true)
    })
})
