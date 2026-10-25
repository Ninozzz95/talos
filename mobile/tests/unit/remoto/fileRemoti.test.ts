import { describe, expect, it } from 'vitest'

import {
    elencoFileDelPc, inviaFileAlPc, scaricaFileDalPc,
    type NativoFileRemoti, type StatoFileRemoto,
} from '@/lib/remoto/fileRemoti'

/**
 * ⛔ R5.13 scambio di file, fetta F2 (ledger `LEDGER-SCAMBIO-FILE-R5-13-CODICE-DISPOSITIVO-2026-10-25.md`): il protocollo del
 * dispositivo contro un PC finto che rifà le regole di `harness-ui/src/remoto/file-dispositivi.mjs` di r4 `d3d36f1c6` (prove FD-*):
 * `da` in byte, pezzi di al più 512 KiB, un pezzo ripetuto idempotente, `da ≠ ricevuti` ⇒ 409 `offset-mismatch` con `ricevuti`,
 * `riprendi` dopo una caduta, `FILE_GONE` quando la versione non torna. I byte stanno nel nativo finto: JS vede solo i pezzi.
 */
const PEZZO = 512 * 1024
const errore = (code: string, extra: Record<string, unknown> = {}) => Object.assign(new Error(code), { code }, extra)
const DISCONNESSO = () => errore('DISCONNECTED')

function nativoFinto(file: Uint8Array) {
    const b64 = (b: Uint8Array) => Buffer.from(b).toString('base64url')
    const scarichi = new Map<string, number[]>()
    const conta = { pezzi: 0, maxQuanti: 0 }
    const nativo: NativoFileRemoti = {
        async preparaInvio() { return { invioId: 'i1', nome: 'fattura.pdf', dimensione: file.length, sha256: 'a'.repeat(64) } },
        async pezzoInvio({ da, quanti }) {
            conta.pezzi += 1; conta.maxQuanti = Math.max(conta.maxQuanti, quanti)
            return { dati: b64(file.subarray(da, Math.min(file.length, da + Math.min(quanti, PEZZO)))) }
        },
        async chiudiInvio() {},
        async iniziaScarico({ fileId }) { const s = scarichi.get(fileId) ?? []; scarichi.set(fileId, s); return { scaricoId: fileId, ricevuti: s.length } },
        async accodaScarico({ scaricoId, da, dati }) {
            const s = scarichi.get(scaricoId)!
            const byte = [...Buffer.from(dati, 'base64url')]
            if (da + byte.length <= s.length) return { ricevuti: s.length }
            if (da !== s.length) throw errore('OFFSET_MISMATCH', { ricevuti: s.length })
            for (const x of byte) s.push(x)
            return { ricevuti: s.length }
        },
        async concludiScarico({ scaricoId, sha256 }) {
            if (sha256 === 'f'.repeat(64)) { scarichi.delete(scaricoId); throw errore('CHECKSUM_MISMATCH') }
            return { percorsoLocale: `/cache/remoto-file/${scaricoId}.bin`, mime: 'application/pdf', eseguibile: false, byte: scarichi.get(scaricoId)!.length }
        },
    }
    return { nativo, conta, scarichi }
}

/** Il PC finto: le stesse risposte e gli stessi codici di `file-dispositivi.mjs`. `cadute` = quante richieste falliscono con DISCONNECTED. */
function pcFinto({ cadute = new Set<number>(), scaduto = false, lunghezza = 1_300_000, pieno = 0, perdiFine = 0, riavvioDopoFine = false, liberaAlPezzo = 0 } = {}) {
    // B10-3: il PC libera un trasferimento inattivo; un pezzo dopo risponde TRANSFER_UNKNOWN (una volta)
    let pezzi = 0
    let liberato = false
    let pienoAncora = pieno
    // B9-1: il PC salva il file a `end`; una risposta persa non lo salva di nuovo se il dispositivo richiede `end` (o riprende)
    let salvati = 0
    let finePerse = perdiFine
    let riavviato = false
    const completati = new Map<string, Record<string, unknown>>()
    let ricevuti = 0
    let numero = 0
    let inVolo = 0
    let massimoInVolo = 0
    const richieste: Array<{ op: string, args: Record<string, unknown> }> = []
    const sorgente = Uint8Array.from({ length: lunghezza }, (_, i) => (i * 7) % 251)
    let versione = 'v'.repeat(32)
    const cliente = {
        async richiesta(op: string, args: Record<string, unknown>) {
            richieste.push({ op, args })
            const mio = ++numero
            inVolo += 1; massimoInVolo = Math.max(massimoInVolo, inVolo)
            try {
                await new Promise((r) => setTimeout(r, 0))
                if (cadute.has(mio)) throw DISCONNESSO()
                if (op === 'file.upload.begin') {
                    if (!args.riprendi && pienoAncora > 0) { pienoAncora -= 1; throw errore('RATE_LIMITED', { stato: 429 }) }
                    // il PC con la cura del Desktop: un trasferimento finito si riprende con ricevuti = dimensione
                    if (args.riprendi && completati.has(String(args.riprendi))) return { trasferimentoId: args.riprendi, pezzo: PEZZO, ricevuti }
                    if (args.riprendi) { if (scaduto) throw errore('TRANSFER_EXPIRED', { stato: 410 }); return { trasferimentoId: 't'.repeat(22), pezzo: PEZZO, ricevuti } }
                    if ((args.dimensione as number) > 25 * 1024 * 1024) throw errore('FILE_TOO_LARGE', { stato: 413 })
                    ricevuti = 0
                    return { trasferimentoId: 't'.repeat(22), pezzo: PEZZO, ricevuti: 0 }
                }
                if (op === 'file.upload.chunk') {
                    pezzi += 1
                    if (liberaAlPezzo && pezzi === liberaAlPezzo && !liberato) { liberato = true; ricevuti = 0; throw errore('TRANSFER_UNKNOWN', { stato: 404 }) }
                    const n = Buffer.from(args.dati as string, 'base64url').length
                    const da = args.da as number
                    if (da + n <= ricevuti) return { ricevuti }
                    if (da !== ricevuti) throw errore('BAD_MESSAGE', { stato: 409, reason: 'offset-mismatch', params: { ricevuti: String(ricevuti) } })
                    ricevuti += n
                    return { ricevuti }
                }
                if (op === 'file.upload.end') {
                    const id = String(args.trasferimentoId)
                    if (riavvioDopoFine && completati.has(id) && !riavviato) { riavviato = true; throw errore('TRANSFER_UNKNOWN', { stato: 404 }) }
                    const gia = completati.get(id)
                    if (gia) return gia
                    salvati += 1
                    const r = { fileId: 'F'.repeat(32), versione: 'V'.repeat(32), nome: 'fattura.pdf', percorso: 'allegati/fattura.pdf', dimensione: ricevuti, mime: 'application/pdf', immagine: false, sha256: 'a'.repeat(64) }
                    completati.set(id, r)
                    if (finePerse > 0) { finePerse -= 1; throw DISCONNESSO() }
                    return r
                }
                if (op === 'file.read') {
                    if (args.versione !== versione) throw errore('FILE_GONE', { stato: 410 })
                    const da = args.da as number; const q = args.quanti as number
                    const parte = sorgente.subarray(da, Math.min(sorgente.length, da + q))
                    return { dati: Buffer.from(parte).toString('base64url'), fine: da + parte.length >= sorgente.length }
                }
                throw errore('OPERATION_FAILED')
            } finally { inVolo -= 1 }
        },
    }
    return { cliente, richieste, get salvati() { return salvati }, get massimoInVolo() { return massimoInVolo }, get ricevuti() { return ricevuti }, sorgente, cambiaVersione() { versione = 'w'.repeat(32) } }
}

const file = Uint8Array.from({ length: 1_900_000 }, (_, i) => i % 256)
const subito = async () => {}

describe('R5.13 — il protocollo del dispositivo (F2)', () => {
    it('FRT-01 invio: begin, pezzi di al più 512 KiB, al più 4 in volo, end; la ricevuta come allegaFile', async () => {
        const pc = pcFinto(); const { nativo, conta } = nativoFinto(file)
        const stati: StatoFileRemoto[] = []
        const r = await inviaFileAlPc(pc.cliente, nativo, { sessionId: 's1', uri: 'content://x' }, (s) => stati.push(s), subito)
        expect(r).toEqual({ tipo: 'file', nome: 'fattura.pdf', percorso: 'allegati/fattura.pdf', bytes: file.length, fileId: 'F'.repeat(32), versione: 'V'.repeat(32) })
        expect(pc.ricevuti).toBe(file.length)
        expect(pc.massimoInVolo).toBeLessThanOrEqual(4)
        expect(conta.maxQuanti).toBeLessThanOrEqual(PEZZO)
        expect(pc.richieste.filter((x) => x.op === 'file.upload.chunk').every((x) => typeof x.args.da === 'number')).toBe(true)
        expect(stati.at(-1)).toEqual({ stato: 'sul-pc', fatti: file.length, totale: file.length })
    })

    it('FRT-02 la finestra lavora davvero in parallelo (più di un pezzo in volo)', async () => {
        const pc = pcFinto(); const { nativo } = nativoFinto(file)
        await inviaFileAlPc(pc.cliente, nativo, { sessionId: 's1', uri: 'content://x' }, () => {}, subito)
        expect(pc.massimoInVolo).toBeGreaterThan(1)
    })

    it('FRT-03 una caduta a metà: «pausa» coi byte fatti, poi riprende con `riprendi` dal `ricevuti` del PC', async () => {
        const pc = pcFinto({ cadute: new Set([3]) }); const { nativo } = nativoFinto(file)
        const stati: StatoFileRemoto[] = []
        let attese = 0
        await inviaFileAlPc(pc.cliente, nativo, { sessionId: 's1', uri: 'content://x' }, (s) => stati.push(s), async () => { attese += 1 })
        expect(attese).toBe(1)
        expect(stati.some((s) => s.stato === 'pausa')).toBe(true)
        expect(pc.richieste.some((x) => x.op === 'file.upload.begin' && x.args.riprendi === 't'.repeat(22))).toBe(true)
        expect(pc.ricevuti).toBe(file.length)
    })

    it('FRT-04 `offset-mismatch`: si riparte dal `ricevuti` che il PC dice', async () => {
        const pc = pcFinto(); const { nativo } = nativoFinto(file)
        const vero = pc.cliente.richiesta
        let storto = true
        pc.cliente.richiesta = async (op, args) => {
            if (op === 'file.upload.chunk' && storto && (args.da as number) > 0) { storto = false; return vero(op, { ...args, da: (args.da as number) + 1 }) }
            return vero(op, args)
        }
        await inviaFileAlPc(pc.cliente, nativo, { sessionId: 's1', uri: 'content://x' }, () => {}, subito)
        expect(pc.ricevuti).toBe(file.length)
        // ci si riallinea dentro lo stesso trasferimento: nessun `begin` in più (uno costerebbe un giro col PC)
        expect(pc.richieste.filter((x) => x.op === 'file.upload.begin')).toHaveLength(1)
    })

    it('FRT-05 la ripresa trova il trasferimento scaduto: si ricomincia da 0', async () => {
        const pc = pcFinto({ cadute: new Set([2]), scaduto: true }); const { nativo } = nativoFinto(file)
        await inviaFileAlPc(pc.cliente, nativo, { sessionId: 's1', uri: 'content://x' }, () => {}, subito)
        expect(pc.richieste.filter((x) => x.op === 'file.upload.begin' && !x.args.riprendi)).toHaveLength(2)
        expect(pc.ricevuti).toBe(file.length)
    })

    it('FRT-06 oltre 25 MiB: errore FILE_TOO_LARGE prima di qualunque `begin`', async () => {
        const pc = pcFinto(); const { nativo } = nativoFinto(file)
        nativo.preparaInvio = async () => { throw errore('FILE_TOO_LARGE') }
        await expect(inviaFileAlPc(pc.cliente, nativo, { sessionId: 's1', uri: 'content://x' }, () => {}, subito)).rejects.toMatchObject({ code: 'FILE_TOO_LARGE' })
        expect(pc.richieste).toHaveLength(0)
    })

    it('FRT-07 scarico: dal punto del parziale, pezzi di 512 KiB, lo sha alla fine; la ricevuta col percorso locale', async () => {
        const pc = pcFinto(); const { nativo, scarichi } = nativoFinto(file)
        scarichi.set('G'.repeat(32), [...pc.sorgente.subarray(0, 300_000)])
        const stati: StatoFileRemoto[] = []
        const riga = { fileId: 'G'.repeat(32), nome: 'report.pdf', dimensione: pc.sorgente.length, mime: 'application/pdf', immagine: false, origine: 'inviato' as const, versione: 'v'.repeat(32), sha256: 'a'.repeat(64) }
        const r = await scaricaFileDalPc(pc.cliente, nativo, { pcId: 'pc1', sessionId: 's1', riga }, (s) => stati.push(s), subito)
        expect(pc.richieste.filter((x) => x.op === 'file.read')[0].args.da).toBe(300_000)
        expect(pc.richieste.filter((x) => x.op === 'file.read').every((x) => (x.args.quanti as number) <= PEZZO)).toBe(true)
        expect(scarichi.get('G'.repeat(32))).toEqual([...pc.sorgente])
        expect(r).toMatchObject({ percorsoLocale: expect.stringContaining('.bin'), eseguibile: false })
        expect(stati.at(-1)).toEqual({ stato: 'scaricato', fatti: pc.sorgente.length, totale: pc.sorgente.length })
    })

    it('FRT-08 il file è cambiato sul PC: stato «cambiato», senza riprovare', async () => {
        const pc = pcFinto(); const { nativo } = nativoFinto(file)
        pc.cambiaVersione()
        const stati: StatoFileRemoto[] = []
        const riga = { fileId: 'G'.repeat(32), nome: 'x.pdf', dimensione: 10, mime: 'application/pdf', immagine: false, origine: 'inviato' as const, versione: 'v'.repeat(32) }
        await expect(scaricaFileDalPc(pc.cliente, nativo, { pcId: 'pc1', sessionId: 's1', riga }, (s) => stati.push(s), subito)).rejects.toMatchObject({ code: 'FILE_GONE' })
        expect(stati.at(-1)).toMatchObject({ stato: 'cambiato' })
        expect(pc.richieste.filter((x) => x.op === 'file.read')).toHaveLength(1)
    })

    it('FRT-09 sha diverso alla fine: errore e nessun file tenuto', async () => {
        const pc = pcFinto(); const { nativo, scarichi } = nativoFinto(file)
        const riga = { fileId: 'H'.repeat(32), nome: 'x.png', dimensione: pc.sorgente.length, mime: 'image/png', immagine: true, origine: 'inviato' as const, versione: 'v'.repeat(32), sha256: 'f'.repeat(64) }
        const stati: StatoFileRemoto[] = []
        await expect(scaricaFileDalPc(pc.cliente, nativo, { pcId: 'pc1', sessionId: 's1', riga }, (s) => stati.push(s), subito)).rejects.toMatchObject({ code: 'CHECKSUM_MISMATCH' })
        expect(scarichi.has('H'.repeat(32))).toBe(false)
        expect(stati.at(-1)).toMatchObject({ stato: 'errore', codice: 'CHECKSUM_MISMATCH' })
    })

    it('FRT-10 lo scarico cade a metà: «pausa», poi riprende dal parziale', async () => {
        const pc = pcFinto({ cadute: new Set([2]) }); const { nativo, scarichi } = nativoFinto(file)
        const riga = { fileId: 'K'.repeat(32), nome: 'x.pdf', dimensione: pc.sorgente.length, mime: 'application/pdf', immagine: false, origine: 'inviato' as const, versione: 'v'.repeat(32) }
        const stati: StatoFileRemoto[] = []
        await scaricaFileDalPc(pc.cliente, nativo, { pcId: 'pc1', sessionId: 's1', riga }, (s) => stati.push(s), subito)
        expect(stati.some((s) => s.stato === 'pausa')).toBe(true)
        expect(scarichi.get('K'.repeat(32))).toEqual([...pc.sorgente])
    })

    it('FRT-11 `file.list`: le righe buone passano tipate, le storte si scartano e si contano; mai un percorso', async () => {
        const buona = { fileId: 'A'.repeat(32), nome: 'a.pdf', dimensione: 10, mime: 'application/pdf', immagine: false, origine: 'inviato', versione: 'B'.repeat(32), sha256: 'c'.repeat(64), offertaId: 'o1', inviataAlle: 1_761_390_000_000 }
        const items = [
            buona,
            { ...buona, fileId: 'corto' },
            { ...buona, nome: '../fuori' },
            { ...buona, origine: 'altro' },
            { ...buona, dimensione: 30 * 1024 * 1024 },
            { ...buona, percorso: 'C:/segreto/a.pdf' },
            'stringa',
        ]
        const cliente = { richiesta: async () => ({ items }) }
        const r = await elencoFileDelPc(cliente, 's1')
        expect(r.righe).toHaveLength(2)
        expect(r.righe[0]).toEqual(buona)
        expect(r.righe[1]).not.toHaveProperty('percorso')
        expect(r.scartate).toBe(5)
    })

    it('FRT-13 (revisione S3-1) un PC che risponde sempre pezzi vuoti senza `fine`: lo scarico si ferma con TRANSFER_STALLED, non gira per sempre', async () => {
        const { nativo } = nativoFinto(file)
        let letture = 0
        // il `setTimeout` cede il turno: se il ciclo non si fermasse, cade il tempo della prova invece del processo
        const cliente = { richiesta: async () => { letture += 1; await new Promise((r) => setTimeout(r, 0)); return { dati: '', fine: false } } }
        const riga = { fileId: 'L'.repeat(32), nome: 'x.pdf', dimensione: 1000, mime: 'application/pdf', immagine: false, origine: 'inviato' as const, versione: 'v'.repeat(32) }
        const stati: StatoFileRemoto[] = []
        await expect(scaricaFileDalPc(cliente, nativo, { pcId: 'pc1', sessionId: 's1', riga }, (s) => stati.push(s), subito)).rejects.toMatchObject({ code: 'TRANSFER_STALLED' })
        expect(letture).toBeLessThanOrEqual(25)
        expect(stati.at(-1)).toMatchObject({ stato: 'errore', codice: 'TRANSFER_STALLED' })
    })

    it('FRT-14 (revisione S4-3) il nativo dice OFFSET_MISMATCH durante lo scarico: si riparte dal suo `ricevuti`', async () => {
        const pc = pcFinto(); const { nativo, scarichi } = nativoFinto(file)
        const vero = nativo.accodaScarico
        let una = true
        nativo.accodaScarico = async (o) => {
            if (una && o.da > 0) {
                una = false
                // come il plugin Capacitor: il codice in `code`, i numeri in `data`
                throw Object.assign(new Error('OFFSET_MISMATCH'), { code: 'OFFSET_MISMATCH', data: { ricevuti: scarichi.get(o.scaricoId)!.length } })
            }
            return vero(o)
        }
        const riga = { fileId: 'M'.repeat(32), nome: 'x.pdf', dimensione: pc.sorgente.length, mime: 'application/pdf', immagine: false, origine: 'inviato' as const, versione: 'v'.repeat(32) }
        await scaricaFileDalPc(pc.cliente, nativo, { pcId: 'pc1', sessionId: 's1', riga }, () => {}, subito)
        expect(scarichi.get('M'.repeat(32))).toEqual([...pc.sorgente])
    })

    it('FRT-15 (revisione S4, Desktop 25/10) 25 cadute brevi, ognuna seguita da progresso: lo scarico arriva in fondo, le riprese si azzerano', async () => {
        const pari = new Set(Array.from({ length: 30 }, (_, i) => 2 * (i + 1)))
        const pc = pcFinto({ cadute: pari, lunghezza: 26 * 512 * 1024 }); const { nativo, scarichi } = nativoFinto(file)
        const riga = { fileId: 'N'.repeat(32), nome: 'grande.zip', dimensione: pc.sorgente.length, mime: 'application/zip', immagine: false, origine: 'inviato' as const, versione: 'v'.repeat(32) }
        let pause = 0
        await scaricaFileDalPc(pc.cliente, nativo, { pcId: 'pc1', sessionId: 's1', riga }, (s) => { if (s.stato === 'pausa') pause += 1 }, subito)
        expect(pause).toBeGreaterThan(20)
        expect(scarichi.get('N'.repeat(32))!.length).toBe(pc.sorgente.length)
    })

    it('FRT-16 (revisione S4) lo stesso per l’invio: tante cadute brevi con progresso non fermano il trasferimento', async () => {
        const ogniTre = new Set(Array.from({ length: 60 }, (_, i) => 3 * (i + 1)))
        const grande = new Uint8Array(24 * 512 * 1024)
        const pc = pcFinto({ cadute: ogniTre }); const { nativo } = nativoFinto(grande)
        let pause = 0
        await inviaFileAlPc(pc.cliente, nativo, { sessionId: 's1', uri: 'content://x' }, (s) => { if (s.stato === 'pausa') pause += 1 }, subito)
        expect(pause).toBeGreaterThan(20)
        expect(pc.ricevuti).toBe(grande.length)
    })

    it('FRT-17 ⛔ B9-3 (revisione del blocco 9): il PC è pieno ⇒ «attesa del turno» detta subito, poche attese, poi la bozza fallisce col motivo', async () => {
        const pc = pcFinto({ pieno: 3 }); const { nativo } = nativoFinto(file)
        const dormite: number[] = []
        const stati: string[] = []
        const r = await inviaFileAlPc(pc.cliente, nativo, { sessionId: 's1', uri: 'content://x' }, (s) => stati.push(s.stato), subito, async (ms) => { dormite.push(ms) })
        expect(r.percorso).toBe('allegati/fattura.pdf')
        expect(dormite).toEqual([1000, 2000, 4000])
        expect(stati[0]).toBe('attesa-turno')
        const pieno = pcFinto({ pieno: 30 }); const n2 = nativoFinto(file)
        const dormite2: number[] = []
        const stati2: string[] = []
        await expect(inviaFileAlPc(pieno.cliente, n2.nativo, { sessionId: 's1', uri: 'content://x' }, (s) => stati2.push(s.stato), subito, async (ms) => { dormite2.push(ms) }))
            .rejects.toMatchObject({ code: 'RATE_LIMITED' })
        expect(dormite2).toEqual([1000, 2000, 4000, 8000, 15000, 15000])
        expect(stati2.at(-1)).toBe('errore')
    })

    it('FRT-18 ⛔ B9-1: la risposta di `end` si perde dopo che il PC ha salvato ⇒ si richiede `end`, il file non si carica due volte', async () => {
        const pc = pcFinto({ perdiFine: 1 }); const { nativo } = nativoFinto(file)
        const r = await inviaFileAlPc(pc.cliente, nativo, { sessionId: 's1', uri: 'content://x' }, () => {}, subito)
        expect(r.percorso).toBe('allegati/fattura.pdf')
        expect(pc.salvati).toBe(1)
        const ops = pc.richieste.map((x) => x.op)
        expect(ops.filter((o) => o === 'file.upload.begin')).toHaveLength(1)
        expect(ops.filter((o) => o === 'file.upload.end')).toHaveLength(2)
    })

    it('FRT-19 ⛔ B9-1: `end` perso e PC riavviato ⇒ la ripresa dice «tutto ricevuto» e si rifà solo `end`, senza un begin da capo', async () => {
        const pc = pcFinto({ perdiFine: 1, riavvioDopoFine: true }); const { nativo } = nativoFinto(file)
        await inviaFileAlPc(pc.cliente, nativo, { sessionId: 's1', uri: 'content://x' }, () => {}, subito)
        expect(pc.salvati).toBe(1)
        const begin = pc.richieste.filter((x) => x.op === 'file.upload.begin')
        expect(begin).toHaveLength(2)
        expect(begin[1]!.args).toMatchObject({ riprendi: 't'.repeat(22) })
        // dopo la ripresa con tutti i byte nessun pezzo riparte
        const dopo = pc.richieste.slice(pc.richieste.indexOf(begin[1]!))
        expect(dopo.some((x) => x.op === 'file.upload.chunk')).toBe(false)
    })

    it('FRT-20 ⛔ B9-2: una bozza tolta ferma l’invio prima del pezzo dopo e di `end`', async () => {
        const grande = new Uint8Array(8 * 512 * 1024)
        const pc = pcFinto(); const { nativo } = nativoFinto(grande)
        const ferma = new AbortController()
        const invio = inviaFileAlPc(pc.cliente, nativo, { sessionId: 's1', uri: 'content://x', segnale: ferma.signal }, (s) => { if (s.stato === 'in-invio' && s.fatti > 0) ferma.abort() }, subito)
        await expect(invio).rejects.toMatchObject({ code: 'CANCELLED' })
        const ops = pc.richieste.map((x) => x.op)
        expect(ops).not.toContain('file.upload.end')
        expect(ops.filter((o) => o === 'file.upload.chunk').length).toBeLessThanOrEqual(4)
        // già fermata prima di partire: nemmeno il begin
        const pc2 = pcFinto(); const n2 = nativoFinto(file)
        const gia = new AbortController(); gia.abort()
        await expect(inviaFileAlPc(pc2.cliente, n2.nativo, { sessionId: 's1', uri: 'content://x', segnale: gia.signal }, () => {}, subito)).rejects.toMatchObject({ code: 'CANCELLED' })
        expect(pc2.richieste).toHaveLength(0)
    })

    it('FRT-12 nessuna stringa grande attraversa JS: ogni pezzo chiesto al nativo è di al più 512 KiB', async () => {
        const grande = new Uint8Array(5 * 1024 * 1024)
        const pc = pcFinto(); const { nativo, conta } = nativoFinto(grande)
        await inviaFileAlPc(pc.cliente, nativo, { sessionId: 's1', uri: 'content://x' }, () => {}, subito)
        expect(conta.pezzi).toBe(Math.ceil(grande.length / PEZZO))
        expect(conta.maxQuanti).toBe(PEZZO)
    })

    it('FRT-21 ⛔ B10-3 (revisione del blocco 10): il PC libera il trasferimento a metà ⇒ un pezzo dice TRANSFER_UNKNOWN e l’invio riparte da capo', async () => {
        const grande = new Uint8Array(8 * 512 * 1024)
        const pc = pcFinto({ liberaAlPezzo: 5 }); const { nativo } = nativoFinto(grande)
        const stati: string[] = []
        const r = await inviaFileAlPc(pc.cliente, nativo, { sessionId: 's1', uri: 'content://x' }, (s) => stati.push(s.stato), subito)
        expect(r.percorso).toBe('allegati/fattura.pdf')
        expect(stati).not.toContain('errore')
        expect(pc.richieste.filter((x) => x.op === 'file.upload.begin' && !x.args.riprendi)).toHaveLength(2)
        expect(pc.ricevuti).toBe(grande.length)
    })

    it('FRT-22 ⛔ B10-1: una bozza fermata a metà chiede al PC di chiudere subito il trasferimento (file.upload.abort), senza aspettarlo', async () => {
        const grande = new Uint8Array(8 * 512 * 1024)
        for (const vecchio of [false, true]) {
            const pc = pcFinto(); const { nativo } = nativoFinto(grande)
            const vero = pc.cliente.richiesta.bind(pc.cliente)
            const chiusi: unknown[] = []
            pc.cliente.richiesta = async (op: string, args: Record<string, unknown>) => {
                if (op === 'file.upload.abort') { chiusi.push(args); if (vecchio) throw errore('UNKNOWN_OPERATION', { stato: 403 }); return { ok: true } }
                return vero(op, args)
            }
            const ferma = new AbortController()
            await expect(inviaFileAlPc(pc.cliente, nativo, { sessionId: 's1', uri: 'content://x', segnale: ferma.signal }, (s) => { if (s.stato === 'in-invio' && s.fatti > 0) ferma.abort() }, subito))
                .rejects.toMatchObject({ code: 'CANCELLED' })
            await new Promise((r) => setTimeout(r, 0))
            expect(chiusi).toEqual([{ trasferimentoId: 't'.repeat(22) }])
        }
        // fermata prima di partire: nessun trasferimento da chiudere
        const pc2 = pcFinto(); const n2 = nativoFinto(file)
        const gia = new AbortController(); gia.abort()
        await expect(inviaFileAlPc(pc2.cliente, n2.nativo, { sessionId: 's1', uri: 'content://x', segnale: gia.signal }, () => {}, subito)).rejects.toMatchObject({ code: 'CANCELLED' })
        expect(pc2.richieste.some((x) => x.op === 'file.upload.abort')).toBe(false)
    })

    it('FRT-23 ⛔ B10-1: una bozza fermata mentre aspetta la rete chiude anche lei il trasferimento sul PC', async () => {
        const grande = new Uint8Array(8 * 512 * 1024)
        const pc = pcFinto({ cadute: new Set([2]) }); const { nativo } = nativoFinto(grande)
        const vero = pc.cliente.richiesta.bind(pc.cliente)
        const chiusi: unknown[] = []
        pc.cliente.richiesta = async (op: string, args: Record<string, unknown>) => {
            if (op === 'file.upload.abort') { chiusi.push(args); throw errore('DISCONNECTED') }
            return vero(op, args)
        }
        const ferma = new AbortController()
        await expect(inviaFileAlPc(pc.cliente, nativo, { sessionId: 's1', uri: 'content://x', segnale: ferma.signal }, () => {}, async () => { ferma.abort() }, subito))
            .rejects.toMatchObject({ code: 'CANCELLED' })
        await new Promise((r) => setTimeout(r, 0))
        expect(chiusi).toEqual([{ trasferimentoId: 't'.repeat(22) }])
    })
})
