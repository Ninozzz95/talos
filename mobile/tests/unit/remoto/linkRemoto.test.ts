import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * ⛔ CLIENT DEL CONTROLLO REMOTO, fetta R-M3: il collegamento `talos-remote:` aperto sul telefono (mockup v5, «Senza fotocamera: il
 * collegamento copiato»). A freddo (`getLaunchUrl`) e a caldo (`appUrlOpen`), come la consegna della barra; la stessa consegna due
 * volte (Capacitor #971) non apre due accoppiamenti; il gettone non entra in nessun diario né nell'indirizzo della rotta.
 */
let lancio: string | null = null
let caldo: (e: { url: string }) => void = () => {}
vi.mock('@capacitor/app', () => ({
    App: {
        getLaunchUrl: vi.fn(async () => (lancio ? { url: lancio } : undefined)),
        addListener: vi.fn(async (_e: string, cb: (e: { url: string }) => void) => { caldo = cb; return { remove: async () => {} } }),
    },
}))

const QR = 'talos-remote:1?pc=pc-uno&t=AAAAAAAAAAAAAAAAAAAAAA&exp=4000000000'

beforeEach(() => {
    vi.resetModules()
    lancio = null
})

describe('il collegamento talos-remote:', () => {
    it('LNK-01 a freddo: il QR resta in attesa e si va alla sezione «Computer», una volta sola', async () => {
        lancio = QR
        const { ascoltaLinkRemoti, prendiQrInAttesa } = await import('@/lib/remoto/linkRemoto')
        const vai = vi.fn()
        await ascoltaLinkRemoti(vai)
        caldo({ url: QR }) // la consegna doppia di Capacitor
        expect(vai).toHaveBeenCalledTimes(1)
        expect(prendiQrInAttesa()).toBe(QR)
        expect(prendiQrInAttesa()).toBeNull()
    })

    it('LNK-02 a caldo: un collegamento nuovo arriva; un indirizzo che non è nostro non fa niente', async () => {
        const { ascoltaLinkRemoti, prendiQrInAttesa } = await import('@/lib/remoto/linkRemoto')
        const vai = vi.fn()
        await ascoltaLinkRemoti(vai)
        caldo({ url: 'https://talos-code.com/x' })
        caldo({ url: 'talos-remote:2?pc=x' })
        expect(vai).not.toHaveBeenCalled()
        caldo({ url: QR })
        expect(vai).toHaveBeenCalledTimes(1)
        expect(prendiQrInAttesa()).toBe(QR)
    })
})
