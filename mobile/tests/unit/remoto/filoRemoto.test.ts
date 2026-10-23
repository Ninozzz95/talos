import { describe, expect, it } from 'vitest'
import {
    CODICI_ERRORE_REMOTO,
    codiceDiAccoppiamento,
    leggiQrRemoto,
    messaggioRemotoValido,
    nuovoNumeroRichiesta,
} from '@/lib/remoto/filoRemoto'

/**
 * ⛔ CLIENT DEL CONTROLLO REMOTO (ledger `LEDGER-CLIENT-REMOTO-MOBILE-2026-10-20.md`, fetta R-M1). Il lato PC è il riferimento:
 * r4 `aeab15222`, `harness-ui/src/remoto/accoppiamento.mjs` (`testoDelQr`, `codiceDiVerifica`) e `filo.mjs` (`CODICI`, `creaLettore`);
 * il foglio `FILO-REMOTO-v1-2026-10-18.md` §1-§3.
 */
const B64_ZERO = 'AAAAAAAAAAAAAAAAAAAAAA' // 16 byte a zero, base64url senza riempimento

describe('il filo del controllo remoto, lato telefono', () => {
    it('FILO-01 il codice di 6 cifre: il vettore del foglio (pc/tel/16 byte a zero ⇒ 645739)', async () => {
        await expect(codiceDiAccoppiamento('pc', 'tel', B64_ZERO)).resolves.toBe('645739')
    })

    it('FILO-02 il codice tiene gli zeri davanti ed è sempre di 6 cifre; un gettone non da 16 byte è un errore', async () => {
        const codici = await Promise.all(['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'].map((x) => codiceDiAccoppiamento(`pc-${x}`, 'tel', B64_ZERO)))
        for (const c of codici) expect(c).toMatch(/^\d{6}$/u)
        await expect(codiceDiAccoppiamento('pc', 'tel', 'AAAA')).rejects.toThrow()
        await expect(codiceDiAccoppiamento('', 'tel', B64_ZERO)).rejects.toThrow()
    })

    it('FILO-03 il QR del PC: id, relay decodificato, gettone, scadenza in millisecondi', () => {
        // la forma di `testoDelQr` del PC: pc e relay con encodeURIComponent, exp in secondi Unix
        const relay = 'https://relay.example.org/?token=abc&x=1'
        const testo = `talos-remote:1?pc=${encodeURIComponent('ab12cd')}&relay=${encodeURIComponent(relay)}&t=${B64_ZERO}&exp=1792400000`
        expect(leggiQrRemoto(testo)).toEqual({ pcId: 'ab12cd', relay, gettone: B64_ZERO, scadeAlle: 1792400000_000 })
        expect(leggiQrRemoto(`talos-remote:1?pc=ab12cd&t=${B64_ZERO}&exp=1792400000`)).toEqual({ pcId: 'ab12cd', relay: null, gettone: B64_ZERO, scadeAlle: 1792400000_000 })
    })

    it('FILO-04 un QR che non è del controllo remoto, o rotto, non diventa un accoppiamento', () => {
        for (const testo of [
            'https://talos-code.com', 'talos-remote:2?pc=a&t=' + B64_ZERO + '&exp=1', 'talos-remote:1?t=' + B64_ZERO + '&exp=1',
            'talos-remote:1?pc=a&exp=1', 'talos-remote:1?pc=a&t=corto&exp=1', 'talos-remote:1?pc=a&t=' + B64_ZERO,
            'talos-remote:1?pc=a&t=' + B64_ZERO + '&exp=domani', 'talos-remote:1?pc=a&relay=ftp%3A%2F%2Fx&t=' + B64_ZERO + '&exp=1', '',
        ]) expect(leggiQrRemoto(testo), testo).toBeNull()
    })

    it('FILO-08 il relay in http solo verso la propria macchina, come `configuraRelay` del PC', () => {
        const qr = (relay: string) => `talos-remote:1?pc=a&relay=${encodeURIComponent(relay)}&t=${B64_ZERO}&exp=1`
        expect(leggiQrRemoto(qr('http://relay.example.org/'))).toBeNull()
        expect(leggiQrRemoto(qr('http://192.168.1.10:3340/'))).toBeNull()
        for (const locale of ['http://127.0.0.1:3340/', 'http://localhost:3340/', 'http://[::1]:3340/']) {
            expect(leggiQrRemoto(qr(locale))?.relay, locale).toBe(locale)
        }
    })

    it('FILO-05 i messaggi: oggetto con v:1 e t; tutto il resto è da scartare', () => {
        expect(messaggioRemotoValido({ v: 1, t: 'res', n: 'abcdefgh', ok: true })).toBe(true)
        for (const m of [null, [], 'x', { t: 'res' }, { v: 2, t: 'res' }, { v: 1 }, { v: 1, t: '' }]) expect(messaggioRemotoValido(m)).toBe(false)
    })

    it('FILO-06 i codici d\'errore sono quelli del PC (`filo.mjs` CODICI @ aeab15222)', () => {
        expect([...CODICI_ERRORE_REMOTO]).toEqual([
            'VERSION_UNSUPPORTED', 'NOT_PAIRED', 'PAIR_TOKEN_INVALID', 'PAIR_LOCKED', 'PAIR_REJECTED', 'PAIR_EXPIRED', 'REVOKED',
            'RATE_LIMITED', 'TOO_LARGE', 'BAD_MESSAGE', 'UNKNOWN_OPERATION', 'NOT_ALLOWED_REMOTELY', 'OPERATION_FAILED', 'WAKE_TOKEN_INVALID',
        ])
    })

    it('FILO-07 il numero di una richiesta: 8-64 caratteri [A-Za-z0-9_-], ogni volta diverso', () => {
        const visti = new Set(Array.from({ length: 200 }, () => nuovoNumeroRichiesta()))
        expect(visti.size).toBe(200)
        for (const n of visti) expect(n).toMatch(/^[A-Za-z0-9_-]{8,64}$/u)
    })
})
