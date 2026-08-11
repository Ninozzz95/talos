import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * ⛔⛔ LA BOLLA NON DEVE ESISTERE IN PRODUZIONE — e questo è il presidio.
 *
 * Owner 2026-08-11: «voglio solo che sia nella versione di sviluppo, non nella
 * versione di produzione. È solo una cosa che serve a me».
 *
 * La separazione vera la fa il sistema di build: il plugin nativo sta nel source
 * set `debug` e in release non viene compilato (provato: `SYSTEM_ALERT_WINDOW`
 * compare 1 volta nel manifest fuso di debug e **0** in quello di release).
 *
 * ⛔ Ma il pacchetto WEB è lo stesso per le due varianti, e lì la sola difesa è
 * che `talosLeggiLaBolla()` risponda `available: false` quando il ponte non ha
 * il plugin. Se un giorno qualcuno «migliorasse» quel catch tornando
 * `available: true` per comodità, in produzione comparirebbe una scheda che
 * offre di accendere qualcosa che non esiste — e nessuno se ne accorgerebbe
 * finché non lo vede un utente.
 *
 * ⇒ Questi casi mordono su quello, non sulla chiamata.
 */

const state = vi.fn()
const enable = vi.fn()
const disable = vi.fn()

vi.mock('@capacitor/core', () => ({
    Capacitor: { isNativePlatform: () => true },
    registerPlugin: () => ({ state, enable, disable }),
}))

describe('⛔ la bolla in PRODUZIONE non c\'è', () => {
    beforeEach(() => {
        vi.resetModules()
        state.mockReset()
        enable.mockReset()
        disable.mockReset()
    })

    it('⭐ il plugin manca (release) → available è FALSO, e la scheda non si disegna', async () => {
        // È ciò che fa Capacitor quando la classe nativa non è registrata.
        state.mockRejectedValue(new Error('unable to find plugin : TalosBolla'))
        const { talosLeggiLaBolla } = await import('@/lib/device/bolla')
        expect(await talosLeggiLaBolla()).toEqual({ available: false, granted: false, on: false })
    })

    it('⭐ anche ACCENDERE fallisce chiuso: nessun «on» inventato', async () => {
        enable.mockRejectedValue(new Error('unable to find plugin : TalosBolla'))
        const { talosAccendiLaBolla } = await import('@/lib/device/bolla')
        const esito = await talosAccendiLaBolla()
        expect(esito.available).toBe(false)
        expect(esito.on).toBe(false)
    })

    it('⭐ in sviluppo con plugin presente: available VERO, e i tre stati passano', async () => {
        state.mockResolvedValue({ available: true, granted: true, on: true })
        const { talosLeggiLaBolla } = await import('@/lib/device/bolla')
        expect(await talosLeggiLaBolla()).toEqual({ available: true, granted: true, on: true })
    })

    it('⛔ il permesso manca: si è APERTA la pagina, ma «on» resta falso', async () => {
        // ⛔ Il caso che distingue «ti ho mandato a concedere» da «è acceso».
        // Darlo per acceso qui è lo stesso difetto del «Fatto ✅» su una
        // notifica mai rimossa: si dichiara fatto ciò che è stato solo chiesto.
        enable.mockResolvedValue({ opened: true, granted: false, on: false })
        const { talosAccendiLaBolla } = await import('@/lib/device/bolla')
        const esito = await talosAccendiLaBolla()
        expect(esito.opened).toBe(true)
        expect(esito.granted).toBe(false)
        expect(esito.on).toBe(false)
    })

    it('⛔ un ponte bugiardo non passa: valori non booleani diventano falsi', async () => {
        // Se il nativo un giorno tornasse `on: 'si'`, `Boolean('si')` sarebbe
        // vero e la scheda mostrerebbe acceso qualcosa di spento. Il confronto
        // è con `true`, non una conversione.
        state.mockResolvedValue({ available: 1, granted: 'si', on: 'true' })
        const { talosLeggiLaBolla } = await import('@/lib/device/bolla')
        expect(await talosLeggiLaBolla()).toEqual({ available: false, granted: false, on: false })
    })
})
