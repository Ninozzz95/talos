import { describe, expect, it, vi } from 'vitest'
import { ponteDifferito } from '@/lib/remoto/ponteDifferito'
import { useTerminaleR4 } from '@/composables/useTerminaleR4'
import type { TalosR4ClientePonte } from '@/lib/harness/r4/clienteR4'

/*
 * Nota del Desktop sulla Fase 3 (J1-ter), voce 8 di J2: se il canale verso il PC non si apre, `apriTerminale` e `scriviTerminale` del
 * ponte differito si perdevano in silenzio (una scheda restava «Connessione…» per sempre). Ora rifiutano col codice del canale, come
 * `richiesta` risponde con la busta e quel codice; il Terminale lo registra e stacca la scheda.
 */
const guasto = (code: string) => Promise.reject(Object.assign(new Error(code), { code }))

function ponteVero(): TalosR4ClientePonte {
    return {
        richiesta: vi.fn(async () => ({ stato: 200, corpo: '{"ok":true,"data":{"items":[]}}' })),
        apriFlusso: vi.fn(async () => {}),
        chiudiFlusso: vi.fn(async () => {}),
        apriTerminale: vi.fn(async () => {}),
        scriviTerminale: vi.fn(async () => {}),
        ridimensionaTerminale: vi.fn(async () => {}),
        chiudiTerminale: vi.fn(async () => {}),
        addListener: vi.fn(async () => ({ remove: async () => {} })),
    }
}

describe('il ponte differito verso il PC', () => {
    it('PDIF-01 canale non aperto: apriTerminale e scriviTerminale rifiutano col codice del canale', async () => {
        const ponte = ponteDifferito(guasto('NOT_PAIRED'))
        await expect(ponte.apriTerminale({ id: 'term-t1', terminalId: 't1' })).rejects.toMatchObject({ code: 'NOT_PAIRED' })
        await expect(ponte.scriviTerminale({ id: 'term-t1', testo: 'ls\r' })).rejects.toMatchObject({ code: 'NOT_PAIRED' })
        // un guasto senza codice è un collegamento fallito, come per `richiesta`
        const muto = ponteDifferito(Promise.reject(new Error('boh')))
        await expect(muto.apriTerminale({ id: 'term-t1', terminalId: 't1' })).rejects.toMatchObject({ code: 'CONNECT_FAILED' })
    })

    it('PDIF-02 ⛔ verso contrario: a canale aperto le stesse chiamate vanno al ponte vero', async () => {
        const vero = ponteVero()
        const ponte = ponteDifferito(Promise.resolve(vero))
        await ponte.apriTerminale({ id: 'term-t1', terminalId: 't1' })
        await ponte.scriviTerminale({ id: 'term-t1', testo: 'ls\r' })
        expect(vero.apriTerminale).toHaveBeenCalledWith({ id: 'term-t1', terminalId: 't1' })
        expect(vero.scriviTerminale).toHaveBeenCalledWith({ id: 'term-t1', testo: 'ls\r' })
    })

    it('PDIF-03 il Terminale sopra un canale non aperto registra il codice e non resta in «Connessione…»', async () => {
        const terminale = useTerminaleR4({ sessioneId: () => 's1', cliente: ponteDifferito(guasto('CONNECT_FAILED')) })
        terminale.schede.value = [{
            terminalId: 't1', origine: 'utente', attiva: true, cartella: '/lavoro', creatoAlle: '2026-10-24T18:00:00.000Z',
            stato: 'attesa', ripreso: false, shell: null, comando: null, codiceUscita: null, erroreAvvio: null,
        }]
        await terminale.collega('t1', { scrivi: () => {}, azzera: () => {} })
        expect(terminale.errore.value).toBe('CONNECT_FAILED')
        expect(terminale.schede.value[0]!.stato).toBe('disconnesso')
    })

    it('PDIF-04 R5.13 F3: allegare in una sessione nuova passa dal ponte vero; a canale chiuso rifiuta col codice del canale', async () => {
        const vero = ponteVero()
        vero.allegaFile = vi.fn(async () => ({ tipo: 'file', nome: 'a.pdf', percorso: 'allegati/a.pdf', bytes: 3 }))
        vero.immagineScelta = vi.fn(async () => ({ tipo: 'image/png', base64: 'AQID' }))
        const ponte = ponteDifferito(Promise.resolve(vero))
        const onStato = () => {}
        await expect(ponte.allegaFile!({ uri: 'content://a', nome: 'a.pdf', testo: false, sessionId: 's1', onStato })).resolves.toMatchObject({ percorso: 'allegati/a.pdf' })
        expect(vero.allegaFile).toHaveBeenCalledWith({ uri: 'content://a', nome: 'a.pdf', testo: false, sessionId: 's1', onStato })
        await expect(ponte.immagineScelta!({ uri: 'content://i' })).resolves.toEqual({ tipo: 'image/png', base64: 'AQID' })
        const chiuso = ponteDifferito(guasto('NOT_PAIRED'))
        await expect(chiuso.allegaFile!({ uri: 'content://a', nome: 'a.pdf', testo: false, sessionId: 's1' })).rejects.toMatchObject({ code: 'NOT_PAIRED' })
    })
})
