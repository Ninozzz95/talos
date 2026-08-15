import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * ⛔⛔ IL RIPIEGO DEL FRENO — il difetto che aveva SPENTO il pilota.
 *
 * Prima dell'11 agosto il freno era uno solo: `getevent` su `/dev/input`, che
 * vuole l'identità della shell. Quando il comando non partiva, `talosArmaIlFreno`
 * usciva subito con `comando-non-partito`, e il pilota si rifiutava di guidare.
 *
 * ⇒ Su qualunque telefono senza il ponte adb acceso — cioè su tutti tranne
 * quello di sviluppo, dove il comando l'avevo avviato io da fuori — la guida
 * dello schermo non esisteva. Il freno non proteggeva nessuno: spegneva la
 * funzione.
 *
 * Questi casi provano che con la shell assente si RESTA in servizio col freno
 * degli eventi, e — nell'altro verso — che se il ponte nativo è chiuso davvero
 * non si finge di essere armati.
 */

const guarda = vi.fn()
const armaIlFreno = vi.fn()
const runAsShell = vi.fn()

vi.mock('@capacitor/core', () => ({
    Capacitor: { isNativePlatform: () => true },
    registerPlugin: () => ({ guarda, armaIlFreno }),
}))
vi.mock('@/lib/device/privilegedShell', () => ({
    talosRunAsShell: (...a: unknown[]) => runAsShell(...a),
}))

const COMANDO = ['sh', '-c', 'getevent …']

describe('⛔ il freno quando la shell NON c\'è', () => {
    beforeEach(() => {
        vi.resetModules()
        guarda.mockReset()
        armaIlFreno.mockReset()
        runAsShell.mockReset()
        armaIlFreno.mockResolvedValue({ armato: true, comando: COMANDO, percorso: '/x' })
    })

    it('⭐ la shell fallisce e il freno resta ARMATO, sugli eventi', async () => {
        runAsShell.mockResolvedValue({ ok: false })
        guarda.mockResolvedValue({ frenoArmato: true, frenoTipo: 'eventi' })

        const { talosArmaIlFreno } = await import('@/lib/device/ponteSchermo')
        const esito = await talosArmaIlFreno()

        // ⛔ È QUESTA la riga che morde: prima usciva `armato: false` e il
        // pilota non partiva. Cambiando l'implementazione per uscire subito
        // sulla shell fallita, questo caso torna rosso.
        expect(esito.armato).toBe(true)
        expect(esito.motivo).toBe('pronto')
        expect(esito.tipo).toBe('eventi')
    })

    it('e quando la shell C\'È, il freno in servizio è quello GREZZO', async () => {
        runAsShell.mockResolvedValue({ ok: true })
        guarda.mockResolvedValue({ frenoArmato: true, frenoTipo: 'grezzo' })

        const { talosArmaIlFreno } = await import('@/lib/device/ponteSchermo')
        expect(await talosArmaIlFreno()).toEqual({
            armato: true,
            motivo: 'pronto',
            tipo: 'grezzo',
        })
    })

    it('⛔ AL CONTRARIO: se il nativo dice che NON è armato, non si inventa un sì', async () => {
        /*
         * Il caso è l'occhio spento: nessun servizio, nessuna shell, nessun
         * freno. Qui `armato: false` è la risposta giusta, e il rifiuto del
         * pilota è quello che deve succedere.
         */
        runAsShell.mockResolvedValue({ ok: false })
        guarda.mockResolvedValue({ frenoArmato: false, frenoTipo: 'eventi' })

        const { talosArmaIlFreno } = await import('@/lib/device/ponteSchermo')
        expect((await talosArmaIlFreno()).armato).toBe(false)
    })

    it('⛔ e se il PONTE è chiuso non si arriva nemmeno a chiedere alla shell', async () => {
        armaIlFreno.mockRejectedValue(new Error('niente plugin'))

        const { talosArmaIlFreno } = await import('@/lib/device/ponteSchermo')
        expect(await talosArmaIlFreno()).toEqual({ armato: false, motivo: 'ponte-chiuso' })
        expect(runAsShell).not.toHaveBeenCalled()
    })

    it('il comando viene DAL NATIVO, non è scritto nel TypeScript', async () => {
        runAsShell.mockResolvedValue({ ok: true })
        guarda.mockResolvedValue({ frenoArmato: true, frenoTipo: 'grezzo' })

        const { talosArmaIlFreno } = await import('@/lib/device/ponteSchermo')
        await talosArmaIlFreno()
        expect(runAsShell).toHaveBeenCalledWith(COMANDO)
    })
})
