import { describe, expect, it } from 'vitest'

import { creaPonteRemotoR4, type ClientePerIlPonte } from '@/lib/remoto/ponteRemotoR4'
import type { NativoFileRemoti } from '@/lib/remoto/fileRemoti'
import { ATTESE_DELLA_RIPRESA_MS, attendiConnessione } from '@/lib/remoto/sessioneRemota'

/**
 * ⛔ R5.13 F3 (ledger `LEDGER-SCAMBIO-FILE-R5-13-CODICE-DISPOSITIVO-2026-10-25.md`; contratto Parte 2, «Revision 3», Desktop 25/10):
 * allegare da una sessione SUL PC, come la finestra (`legacy/app.js:28648-28680` di r4 `16790f3fa`):
 *  - un FILE va in `allegati/` con `file.upload.*` e solo in una conversazione che esiste (altrimenti `fileNoConversation`);
 *  - un'IMMAGINE va SOLO al modello: il Codice fa la stessa `POST /api/v1/chat-images {nome, dataUrl}` che fa in locale, e il ponte la
 *    porta al PC a pezzi con `file.upload.begin {immagine: true}` SENZA sessione; `end` torna `{immagineId, mime, byte}`.
 */
const PEZZO = 512 * 1024
const errore = (code: string, extra: Record<string, unknown> = {}) => Object.assign(new Error(code), { code }, extra)

function clienteFinto({ rifiutaImmagine = null as string | null } = {}) {
    const richieste: Array<{ op: string, args: Record<string, unknown> }> = []
    let ricevuti = 0
    let byteImmagine = 0
    const cliente: ClientePerIlPonte = {
        async richiesta(op, args) {
            richieste.push({ op, args })
            if (op === 'file.upload.begin') {
                if (args.immagine === true && 'sessionId' in args) throw errore('BAD_MESSAGE')
                ricevuti = 0
                return { trasferimentoId: 't'.repeat(22), pezzo: PEZZO, ricevuti: 0 }
            }
            if (op === 'file.upload.chunk') {
                const n = Buffer.from(args.dati as string, 'base64url').length
                if ((args.da as number) !== ricevuti) throw errore('BAD_MESSAGE', { reason: 'offset-mismatch', params: { ricevuti: String(ricevuti) } })
                ricevuti += n; byteImmagine = ricevuti
                return { ricevuti }
            }
            if (op === 'file.upload.end') {
                const inizio = richieste.find((r) => r.op === 'file.upload.begin')!.args
                if (inizio.immagine === true) {
                    if (rifiutaImmagine) throw errore('BAD_MESSAGE', { reason: rifiutaImmagine, stato: 415 })
                    return { immagineId: 'a'.repeat(64), mime: 'image/png', byte: byteImmagine }
                }
                return { fileId: 'F'.repeat(32), versione: 'V'.repeat(32), nome: 'fattura.pdf', percorso: 'allegati/fattura.pdf', dimensione: ricevuti, mime: 'application/pdf', immagine: false, sha256: 'b'.repeat(64) }
            }
            throw errore('OPERATION_FAILED')
        },
        async iscrivi() { return { sub: 's', disiscrivi: async () => {} } },
        onChiuso() {},
    }
    return { cliente, richieste }
}

function nativoFinto(dimensione = 900_000, contenuto?: Uint8Array): NativoFileRemoti {
    const file = contenuto ?? new Uint8Array(dimensione).map((_, i) => i % 256)
    return {
        async preparaInvio() { return { invioId: 'i1', nome: 'fattura.pdf', dimensione: file.length, sha256: 'b'.repeat(64) } },
        async pezzoInvio({ da, quanti }) { return { dati: Buffer.from(file.subarray(da, da + Math.min(quanti, PEZZO))).toString('base64url') } },
        async chiudiInvio() {},
        async iniziaScarico() { throw errore('OPERATION_FAILED') },
        async accodaScarico() { throw errore('OPERATION_FAILED') },
        async concludiScarico() { throw errore('OPERATION_FAILED') },
    }
}

const png = () => {
    const byte = new Uint8Array(700_000)
    byte.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
    return `data:image/png;base64,${Buffer.from(byte).toString('base64')}`
}

describe('R5.13 F3 — allegare da una sessione sul PC', () => {
    it('ARF-01 un file va in allegati/ con file.upload.* nella sessione; la ricevuta come allegaFile, senza percorso assoluto del PC', async () => {
        const { cliente, richieste } = clienteFinto()
        const ponte = creaPonteRemotoR4(cliente, { file: { nativo: () => nativoFinto(), attendi: async () => {} } })
        const r = await ponte.allegaFile!({ uri: 'content://x', nome: 'fattura.pdf', testo: false, sessionId: 's'.repeat(10) })
        expect(r).toEqual({ tipo: 'file', nome: 'fattura.pdf', percorso: 'allegati/fattura.pdf', bytes: 900_000 })
        expect(r).not.toHaveProperty('assoluto')
        expect(richieste[0]).toMatchObject({ op: 'file.upload.begin', args: { sessionId: 's'.repeat(10), nome: 'fattura.pdf', dimensione: 900_000 } })
    })

    it('ARF-02 un file in una conversazione non ancora partita: FILE_NO_CONVERSATION, come la finestra, e nulla parte', async () => {
        const { cliente, richieste } = clienteFinto()
        const ponte = creaPonteRemotoR4(cliente, { file: { nativo: () => nativoFinto(), attendi: async () => {} } })
        await expect(ponte.allegaFile!({ uri: 'content://x', nome: 'a.pdf', testo: false })).rejects.toMatchObject({ code: 'FILE_NO_CONVERSATION' })
        expect(richieste).toHaveLength(0)
    })

    it('ARF-03 lo stato dell’invio (in-invio, pausa) arriva a chi allega', async () => {
        const { cliente } = clienteFinto()
        const vero = cliente.richiesta
        let caduta = true
        cliente.richiesta = async (op, args) => {
            if (op === 'file.upload.chunk' && caduta && (args.da as number) > 0) { caduta = false; throw errore('DISCONNECTED') }
            if (op === 'file.upload.begin' && args.riprendi) return { trasferimentoId: 't'.repeat(22), pezzo: PEZZO, ricevuti: PEZZO }
            return vero(op, args)
        }
        const stati: string[] = []
        const ponte = creaPonteRemotoR4(cliente, { file: { nativo: () => nativoFinto(), attendi: async () => {} } })
        await ponte.allegaFile!({ uri: 'content://x', nome: 'fattura.pdf', testo: false, sessionId: 's'.repeat(10), onStato: (s) => stati.push(s.stato) })
        expect(stati).toContain('in-invio')
        expect(stati).toContain('pausa')
        expect(stati.at(-1)).toBe('sul-pc')
    })

    it('ARF-04 senza il nativo (fuori dall’app) un file si rifiuta col motivo, senza partire', async () => {
        const { cliente, richieste } = clienteFinto()
        const ponte = creaPonteRemotoR4(cliente, { file: { nativo: () => null, attendi: async () => {} } })
        await expect(ponte.allegaFile!({ uri: 'content://x', nome: 'a.pdf', testo: false, sessionId: 's'.repeat(10) })).rejects.toMatchObject({ code: 'NOT_AVAILABLE_REMOTELY' })
        expect(richieste).toHaveLength(0)
    })

    it('ARF-05 un’immagine: la POST /api/v1/chat-images del Codice va al PC a pezzi SENZA sessione e torna {id, mimeType, byte} come r4', async () => {
        const { cliente, richieste } = clienteFinto()
        const ponte = creaPonteRemotoR4(cliente, { file: { nativo: () => nativoFinto(), attendi: async () => {} } })
        const risposta = await ponte.richiesta({ metodo: 'POST', percorso: '/api/v1/chat-images', corpo: JSON.stringify({ nome: 'lavagna.png', dataUrl: png() }) })
        expect(risposta.stato).toBe(200)
        expect(JSON.parse(risposta.corpo)).toEqual({ ok: true, data: { id: 'a'.repeat(64), mimeType: 'image/png', byte: 700_000 } })
        const inizio = richieste.find((r) => r.op === 'file.upload.begin')!
        expect(inizio.args).toMatchObject({ immagine: true, nome: 'lavagna.png', dimensione: 700_000 })
        expect(inizio.args).not.toHaveProperty('sessionId')
        expect(inizio.args.sha256).toMatch(/^[0-9a-f]{64}$/u)
        expect(richieste.filter((r) => r.op === 'file.upload.chunk').every((r) => Buffer.from(r.args.dati as string, 'base64url').length <= PEZZO)).toBe(true)
    })

    it('ARF-06 un’immagine rifiutata dal PC (image-invalid): la busta d’errore di r4, col motivo', async () => {
        const { cliente } = clienteFinto({ rifiutaImmagine: 'image-invalid' })
        const ponte = creaPonteRemotoR4(cliente, { file: { nativo: () => nativoFinto(), attendi: async () => {} } })
        const risposta = await ponte.richiesta({ metodo: 'POST', percorso: '/api/v1/chat-images', corpo: JSON.stringify({ nome: 'x.png', dataUrl: png() }) })
        expect(risposta.stato).toBe(415)
        expect(JSON.parse(risposta.corpo)).toMatchObject({ ok: false, error: { code: 'BAD_MESSAGE', reason: 'image-invalid' } })
    })

    it('ARF-07 una chat-images con un corpo storto non parte', async () => {
        const { cliente, richieste } = clienteFinto()
        const ponte = creaPonteRemotoR4(cliente, { file: { nativo: () => nativoFinto(), attendi: async () => {} } })
        for (const corpo of [JSON.stringify({ nome: 'x.png' }), JSON.stringify({ nome: 'x.png', dataUrl: 'non-un-data-url' }), '[]']) {
            const r = await ponte.richiesta({ metodo: 'POST', percorso: '/api/v1/chat-images', corpo })
            expect(r.stato).toBe(400)
        }
        expect(richieste).toHaveLength(0)
    })

    it('ARF-08 un file di testo piccolo torna col suo testo, come il nativo locale; un binario no', async () => {
        const testo = ('Ciao, è un appunto ✓' + String.fromCharCode(10)).repeat(50)
        const { cliente } = clienteFinto()
        const ponte = creaPonteRemotoR4(cliente, { file: { nativo: () => nativoFinto(0, new TextEncoder().encode(testo)), attendi: async () => {} } })
        const r = await ponte.allegaFile!({ uri: 'content://x', nome: 'appunti.txt', testo: true, sessionId: 's'.repeat(10) })
        expect(r.testo).toBe(testo)
        const binario = creaPonteRemotoR4(clienteFinto().cliente, { file: { nativo: () => nativoFinto(0, new Uint8Array([0xff, 0xfe, 0x00, 0xc3])), attendi: async () => {} } })
        expect(await binario.allegaFile!({ uri: 'content://y', nome: 'b.bin', testo: true, sessionId: 's'.repeat(10) })).not.toHaveProperty('testo')
    })

    it('ARF-09 un’immagine che cade a metà riprende col trasferimento e con immagine: true, come vuole il PC', async () => {
        const { cliente, richieste } = clienteFinto()
        const vero = cliente.richiesta
        let caduta = true
        cliente.richiesta = async (op, args) => {
            if (op === 'file.upload.chunk' && caduta && (args.da as number) > 0) { caduta = false; throw errore('DISCONNECTED') }
            if (op === 'file.upload.begin' && args.riprendi) {
                richieste.push({ op, args })
                if (args.immagine !== true || 'sessionId' in args) throw errore('BAD_MESSAGE')
                return { trasferimentoId: 't'.repeat(22), pezzo: PEZZO, ricevuti: PEZZO }
            }
            return vero(op, args)
        }
        let attese = 0
        const ponte = creaPonteRemotoR4(cliente, { file: { nativo: () => null, attendi: async () => { attese += 1 } } })
        const risposta = await ponte.richiesta({ metodo: 'POST', percorso: '/api/v1/chat-images', corpo: JSON.stringify({ nome: 'lavagna.png', dataUrl: png() }) })
        expect(risposta.stato).toBe(200)
        expect(attese).toBe(1)
        expect(richieste.find((r) => r.op === 'file.upload.begin' && r.args.riprendi)?.args).toEqual({ immagine: true, riprendi: 't'.repeat(22) })
    })

    it('ARF-10 la pausa riprova a riaprire il canale con attese da 1 a 15 s; a Codice chiuso smette col guasto', async () => {
        const dormite: number[] = []
        let tentativi = 0
        await attendiConnessione(async () => { tentativi += 1; if (tentativi < 8) throw errore('CONNECT_FAILED') }, () => false, async (ms) => { dormite.push(ms) })
        expect(dormite).toEqual([1000, 2000, 4000, 8000, 15000, 15000, 15000])
        expect(ATTESE_DELLA_RIPRESA_MS.at(-1)).toBe(15000)
        await expect(attendiConnessione(async () => { throw errore('DISCONNECTED') }, () => true, async () => {})).rejects.toMatchObject({ code: 'DISCONNECTED' })
    })

    it('ARF-11 le offerte di file del PC: la rotta del Codice diventa `file.offers` senza argomenti', async () => {
        const { cliente, richieste } = clienteFinto()
        cliente.richiesta = async (op, args) => { richieste.push({ op, args }); return { items: [] } }
        const ponte = creaPonteRemotoR4(cliente)
        const r = await ponte.richiesta({ metodo: 'GET', percorso: '/api/v1/remote/file-offers' })
        expect(r.stato).toBe(200)
        expect(richieste).toEqual([{ op: 'file.offers', args: {} }])
    })

    it('ARF-13 ⛔ CAMBIA 2 (Desktop 25/10): un guasto senza codice nell’immagine non diventa «connessione persa»', async () => {
        const { cliente } = clienteFinto()
        cliente.richiesta = async () => { throw new Error('boom') }
        const ponte = creaPonteRemotoR4(cliente, { file: { nativo: () => null, attendi: async () => {} } })
        const risposta = await ponte.richiesta({ metodo: 'POST', percorso: '/api/v1/chat-images', corpo: JSON.stringify({ nome: 'x.png', dataUrl: png() }) })
        expect(JSON.parse(risposta.corpo)).toMatchObject({ ok: false, error: { code: 'BAD_MESSAGE' } })
        expect(risposta.stato).toBe(400)
    })

    it('ARF-12 il PC tiene al più 8 trasferimenti per dispositivo (Desktop, blocco 8): dieci immagini insieme ne aprono al più 3 alla volta', async () => {
        let aperti = 0
        let massimo = 0
        const cliente: ClientePerIlPonte = {
            async richiesta(op) {
                if (op === 'file.upload.begin') { aperti += 1; massimo = Math.max(massimo, aperti); return { trasferimentoId: 't'.repeat(22), pezzo: PEZZO, ricevuti: 0 } }
                if (op === 'file.upload.chunk') { await new Promise((r) => setTimeout(r, 5)); return { ricevuti: 700_000 } }
                if (op === 'file.upload.end') { aperti -= 1; return { immagineId: 'a'.repeat(64), mime: 'image/png', byte: 700_000 } }
                throw errore('OPERATION_FAILED')
            },
            async iscrivi() { return { sub: 's', disiscrivi: async () => {} } },
            onChiuso() {},
        }
        const ponte = creaPonteRemotoR4(cliente, { file: { nativo: () => null, attendi: async () => {} } })
        const risposte = await Promise.all(Array.from({ length: 10 }, (_, i) =>
            ponte.richiesta({ metodo: 'POST', percorso: '/api/v1/chat-images', corpo: JSON.stringify({ nome: `f${i}.png`, dataUrl: png() }) })))
        expect(risposte.every((r) => r.stato === 200)).toBe(true)
        expect(massimo).toBeLessThanOrEqual(3)
    })

    it('ARF-14 ⛔ B9-2: un’immagine tolta mentre aspetta il turno lascia la coda e non parte mai', async () => {
        const begins: string[] = []
        let apri: () => void = () => {}
        const cancello = new Promise<void>((r) => { apri = r })
        const cliente: ClientePerIlPonte = {
            async richiesta(op, args) {
                if (op === 'file.upload.begin') { begins.push(String(args.nome)); return { trasferimentoId: 't'.repeat(22), pezzo: PEZZO, ricevuti: 0 } }
                if (op === 'file.upload.chunk') { await cancello; return { ricevuti: 700_000 } }
                if (op === 'file.upload.end') return { immagineId: 'a'.repeat(64), mime: 'image/png', byte: 700_000 }
                throw errore('OPERATION_FAILED')
            },
            async iscrivi() { return { sub: 's', disiscrivi: async () => {} } },
            onChiuso() {},
        }
        const ponte = creaPonteRemotoR4(cliente, { file: { nativo: () => null, attendi: async () => {} } })
        const manda = (nome: string, segnale?: AbortSignal) => ponte.richiesta({ metodo: 'POST', percorso: '/api/v1/chat-images', corpo: JSON.stringify({ nome, dataUrl: png() }), segnale })
        const tre = ['a.png', 'b.png', 'c.png'].map((n) => manda(n))
        const ferma = new AbortController()
        const quarta = manda('d.png', ferma.signal)
        await new Promise((r) => setTimeout(r, 20))
        ferma.abort()
        const r4 = await quarta
        expect(JSON.parse(r4.corpo)).toMatchObject({ ok: false, error: { code: 'CANCELLED' } })
        apri()
        await Promise.all(tre)
        expect(begins.sort()).toEqual(['a.png', 'b.png', 'c.png'])
    })

    it('ARF-15 ⛔ B9-5: un’immagine dice il suo avanzamento come un file', async () => {
        const { cliente } = clienteFinto()
        const ponte = creaPonteRemotoR4(cliente, { file: { nativo: () => null, attendi: async () => {} } })
        const stati: string[] = []
        await ponte.richiesta({ metodo: 'POST', percorso: '/api/v1/chat-images', corpo: JSON.stringify({ nome: 'x.png', dataUrl: png() }), onStato: (s) => stati.push(s.stato) })
        expect(stati).toContain('in-invio')
        expect(stati.at(-1)).toBe('sul-pc')
    })

    it('ARF-16 ⛔ B9-7: un’immagine vuota si ferma sul dispositivo col motivo image-empty', async () => {
        const { cliente, richieste } = clienteFinto()
        const ponte = creaPonteRemotoR4(cliente, { file: { nativo: () => null, attendi: async () => {} } })
        const r = await ponte.richiesta({ metodo: 'POST', percorso: '/api/v1/chat-images', corpo: JSON.stringify({ nome: 'x.png', dataUrl: 'data:image/png;base64,' }) })
        expect(JSON.parse(r.corpo)).toMatchObject({ ok: false, error: { code: 'BAD_MESSAGE', reason: 'image-empty' } })
        expect(richieste).toHaveLength(0)
    })

    it('ARF-10b ⛔ B9-8: un dispositivo revocato o non più accoppiato non resta in pausa per sempre', async () => {
        for (const code of ['NOT_PAIRED', 'REVOKED']) {
            let giri = 0
            // il PC tornerebbe al quarto giro: chi aspetta ancora dopo un REVOKED lo prenderebbe per buono (il mutante risolve)
            await expect(attendiConnessione(async () => { giri += 1; if (giri < 4) throw errore(code) }, () => false, async () => {})).rejects.toMatchObject({ code })
            expect(giri).toBe(1)
        }
    })

    it('ALL-APRI-M12 il ponte apre un file allegato alla sessione del PC: file.list + file.read, mai un percorso', async () => {
        const richieste: Array<{ op: string, args: Record<string, unknown> }> = []
        const cliente: ClientePerIlPonte = {
            async richiesta(op, args) {
                richieste.push({ op, args })
                if (op === 'file.list') return { items: [{ fileId: 'F'.repeat(32), nome: 'ordini-dal-pad-2.csv', dimensione: 3, mime: 'text/csv', immagine: false, origine: 'allegato', versione: 'V'.repeat(32) }] }
                if (op === 'file.read') return { dati: Buffer.from('a,b').toString('base64url'), fine: true }
                throw errore('OPERATION_FAILED')
            },
            async iscrivi() { return { sub: 's', disiscrivi: async () => {} } },
            onChiuso() {},
        }
        const ponte = creaPonteRemotoR4(cliente)
        expect(await ponte.anteprimaFile!({ sessionId: 'sessione-1', nome: 'ordini-dal-pad-2.csv' })).toEqual({ esito: 'testo', testo: 'a,b', mime: 'text/csv' })
        expect(richieste.map((r) => r.op)).toEqual(['file.list', 'file.read'])
        await expect(ponte.anteprimaFile!({ sessionId: '..', nome: 'x' })).rejects.toMatchObject({ code: 'FILE_NO_CONVERSATION' })
    })
})
