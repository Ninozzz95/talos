import { describe, expect, it } from 'vitest'
import { anteprimaDalPc, PEZZO_REMOTO } from '@/lib/remoto/fileRemoti'

/*
 * ⛔ Owner 26/10/2026: «dalla chat il file ordini dal pad si deve poter aprire se ci clicco sopra». In una sessione del PC il chip si
 * apre senza rotte nuove (revisione del Desktop 26/10): `file.list` dà gli allegati della conversazione (`origine: 'allegato'`, il nome
 * è l'ultimo segmento del percorso del chip, unico in `allegati/` perché il PC aggiunge -2, -3…), `file.read` li legge in sola lettura
 * a pezzi di al più 512 KiB (contratto Parte 2). Nessun percorso parte dal dispositivo.
 */
const ID = (c: string) => c.repeat(32)
const riga = (nome: string, extra: Record<string, unknown> = {}) => ({
    fileId: ID('a'), nome, dimensione: 58, mime: 'text/csv', immagine: false, origine: 'allegato', versione: ID('b'), ...extra,
})
const CSV = 'id,articolo,pezzi\n1,viti M4,40\n2,dadi M4,40\n3,rondelle,80\n'

function pcFinto(items: unknown[], contenuto: Uint8Array = new TextEncoder().encode(CSV), guasto?: string) {
    const richieste: Array<{ op: string; args: Record<string, unknown> }> = []
    return {
        richieste,
        cliente: {
            async richiesta(op: string, args: Record<string, unknown>) {
                richieste.push({ op, args })
                if (op === 'file.list') return { items }
                if (op === 'file.read') {
                    if (guasto) throw Object.assign(new Error(guasto), { code: guasto })
                    const da = args.da as number; const q = args.quanti as number
                    const parte = contenuto.subarray(da, Math.min(contenuto.length, da + q))
                    return { dati: Buffer.from(parte).toString('base64url'), fine: da + parte.length >= contenuto.length }
                }
                throw Object.assign(new Error('nope'), { code: 'OPERATION_FAILED' })
            },
        },
    }
}

describe('anteprimaDalPc', () => {
    it('ALL-APRI-M08 il file allegato si trova per nome fra gli allegati e si legge in sola lettura, senza percorso', async () => {
        const pc = pcFinto([riga('ordini-dal-pad.csv', { fileId: ID('c') }), riga('ordini-dal-pad-2.csv', { dimensione: CSV.length }), riga('ordini-dal-pad-2.csv', { origine: 'modello', fileId: ID('d') })])
        expect(await anteprimaDalPc(pc.cliente, 's1', 'ordini-dal-pad-2.csv')).toEqual({ esito: 'testo', testo: CSV, mime: 'text/csv' })
        const lettura = pc.richieste.find((r) => r.op === 'file.read')!
        expect(lettura.args).toEqual({ sessionId: 's1', fileId: ID('a'), versione: ID('b'), da: 0, quanti: CSV.length })
        expect(pc.richieste.map((r) => r.op)).toEqual(['file.list', 'file.read'])
        expect(JSON.stringify(pc.richieste)).not.toContain('allegati/')
    })

    it('ALL-APRI-M09 nessun allegato con quel nome, o il PC dice che non c\'è più: «assente», mai un tocco muto', async () => {
        const vuoto = pcFinto([riga('altro.csv')])
        expect(await anteprimaDalPc(vuoto.cliente, 's1', 'ordini.csv')).toEqual({ esito: 'assente' })
        expect(vuoto.richieste.map((r) => r.op)).toEqual(['file.list'])
        const sparito = pcFinto([riga('ordini.csv')], undefined, 'FILE_GONE')
        expect(await anteprimaDalPc(sparito.cliente, 's1', 'ordini.csv')).toEqual({ esito: 'assente' })
    })

    it('ALL-APRI-M10 troppo grande, un\'immagine o byte che non sono testo: «non mostrabile», e il grande non si legge nemmeno', async () => {
        const grande = pcFinto([riga('dati.csv', { dimensione: PEZZO_REMOTO + 1 })])
        expect(await anteprimaDalPc(grande.cliente, 's1', 'dati.csv')).toEqual({ esito: 'non-mostrabile' })
        expect(grande.richieste.map((r) => r.op)).toEqual(['file.list'])
        const immagine = pcFinto([riga('foto.png', { immagine: true, mime: 'image/png' })])
        expect(await anteprimaDalPc(immagine.cliente, 's1', 'foto.png')).toEqual({ esito: 'non-mostrabile' })
        const binario = pcFinto([riga('dati.bin', { dimensione: 4, mime: 'application/octet-stream' })], Uint8Array.from([0x50, 0x4b, 0x00, 0x03]))
        expect(await anteprimaDalPc(binario.cliente, 's1', 'dati.bin')).toEqual({ esito: 'non-mostrabile' })
    })

    it('ALL-APRI-M11 due allegati con lo stesso nome: non si tira a indovinare quale', async () => {
        const doppio = pcFinto([riga('x.csv'), riga('x.csv', { fileId: ID('e') })])
        expect(await anteprimaDalPc(doppio.cliente, 's1', 'x.csv')).toEqual({ esito: 'ambiguo' })
        expect(doppio.richieste.map((r) => r.op)).toEqual(['file.list'])
    })
})
