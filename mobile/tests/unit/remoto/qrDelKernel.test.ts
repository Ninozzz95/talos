import { describe, expect, it } from 'vitest'
import { leggiQrRemoto } from '@/lib/remoto/filoRemoto'

/*
 * Il QR più piccolo (owner 26/10/2026 notte tarda, «Sì, rimpicciolisci»): r4 `153759c16` (`feat/qr-piu-piccolo`), `relayNelQr` con la
 * codifica leggera — crudi i non riservati e `: / ? =`, codificati `% + & #` e lo spazio — e niente `relay=` coi server di n0. I testi
 * qui sotto sono quelli VERI di `testoDelQr` a quel commit (generati col modulo del kernel, non ricopiati a mano), per i relay difficili
 * di ACC-QR-01..04: il telefono deve ritrovare il relay byte per byte, e gli altri campi intatti.
 */
const PC = 'a'.repeat(64)
const GETTONE = 'AbC-_9AbC-_9AbC-_9AbC-'
const DAL_KERNEL: ReadonlyArray<{ relay: string, qr: string }> = [
    { relay: 'https://relay.example', qr: `talos-remote:1?pc=${PC}&relay=https://relay.example&t=${GETTONE}&exp=1761500000` },
    { relay: 'https://euc1-1.relay.n0.example/', qr: `talos-remote:1?pc=${PC}&relay=https://euc1-1.relay.n0.example/&t=${GETTONE}&exp=1761500000` },
    {
        relay: 'https://relay.casa-di-nino.example/?token=segreto-43',
        qr: `talos-remote:1?pc=${PC}&relay=https://relay.casa-di-nino.example/?token=segreto-43&t=${GETTONE}&exp=1761500000`,
    },
    {
        relay: 'https://relay.example/talos/?token=a+b/c%2Fd&e=1#frammento',
        qr: `talos-remote:1?pc=${PC}&relay=https://relay.example/talos/?token=a%2Bb/c%252Fd%26e=1%23frammento&t=${GETTONE}&exp=1761500000`,
    },
    {
        relay: 'https://relay.example/?token=con spazio+più%25e&x=y=z?w',
        qr: `talos-remote:1?pc=${PC}&relay=https://relay.example/?token=con%20spazio%2Bpi%C3%B9%2525e%26x=y=z?w&t=${GETTONE}&exp=1761500000`,
    },
]

describe('il QR del kernel con la codifica leggera, letto dal telefono', () => {
    it('QRK-01 ogni relay difficile torna byte per byte, e pc, gettone e scadenza restano', () => {
        for (const { relay, qr } of DAL_KERNEL) {
            expect(leggiQrRemoto(qr), qr).toEqual({ pcId: PC, relay, gettone: GETTONE, scadeAlle: 1761500000_000 })
        }
    })

    it('QRK-02 il QR di n0 senza `relay=` (122 caratteri, 41 moduli a L) si legge con relay null: il telefono trova il PC dal suo id', () => {
        const qr = `talos-remote:1?pc=${'f'.repeat(64)}&t=${GETTONE}&exp=1761500000`
        expect(qr.length).toBe(122)
        expect(leggiQrRemoto(qr)).toEqual({ pcId: 'f'.repeat(64), relay: null, gettone: GETTONE, scadeAlle: 1761500000_000 })
    })

    it('QRK-03 ⛔ verso contrario: il vecchio difetto, un `+` o un `&` lasciati crudi, darebbe un relay diverso (per questo restano codificati)', () => {
        const crudo = `talos-remote:1?pc=${PC}&relay=https://relay.example/?token=a+b&e=1&t=${GETTONE}&exp=1761500000`
        expect(leggiQrRemoto(crudo)?.relay).toBe('https://relay.example/?token=a b')
    })

    /*
     * r4 `94726d284` (ACC-QR-05): il relay proprio si salva e va nel QR nella forma `URL.href`, perché `java.net.URI` del telefono
     * rifiuta spazi e caratteri non ASCII crudi. Testo del QR generato col modulo del kernel a quel commit; il gettone che ne stacca il
     * nativo è CUST-07 (`TalosRemotoCustodiaTest.kt`), uguale a quello del PC: «con spazio più%e».
     */
    it('QRK-04 il relay normalizzato del kernel torna identico: nessuno spazio né carattere non ASCII crudo arriva al nativo', () => {
        const relay = 'https://relay.example/?token=con%20spazio+pi%C3%B9%25e&x=y=z?w'
        const qr = `talos-remote:1?pc=${PC}&relay=https://relay.example/?token=con%2520spazio%2Bpi%25C3%25B9%2525e%26x=y=z?w&t=${GETTONE}&exp=1761500000`
        const letto = leggiQrRemoto(qr)
        expect(letto?.relay).toBe(relay)
        expect(letto?.relay).not.toMatch(/[\s\u0080-￿]/u)
    })
})
