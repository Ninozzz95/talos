// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'

import { useAllegatiR4 } from '@/composables/useAllegatiR4'
import type { TalosR4ClientePonte } from '@/lib/harness/r4/clienteR4'
import type { StatoFileRemoto } from '@/lib/remoto/fileRemoti'
import testiAllegati from '@/lib/harness/r4/testi/app-allegati-r4.json'

/**
 * ⛔ R5.13 F3 (ledger `LEDGER-SCAMBIO-FILE-R5-13-CODICE-DISPOSITIVO-2026-10-25.md`; mockup approvato dall'owner il 25/10): la bozza
 * del Codice quando la sessione è sul PC. Il file va alla sessione aperta, il vassoio dice «Invio al PC» e «In pausa», e in una
 * conversazione non ancora partita il file si ferma con la frase della finestra (`attachments.fileNoConversation`).
 */
const en = testiAllegati.en as Record<string, string>
type Allega = NonNullable<TalosR4ClientePonte['allegaFile']>

function bozza(allegaFile: Allega, sessione?: () => string | null, extra: { richiesta?: TalosR4ClientePonte['richiesta'], suConsenso?: (g: unknown) => void, galleria?: unknown[] } = {}) {
    const ponte = { allegaFile, richiesta: extra.richiesta ?? (async () => ({ stato: 500, corpo: '' })) } as unknown as TalosR4ClientePonte
    return useAllegatiR4({
        cliente: () => ponte,
        fotocamera: () => ({ pickPhotos: async () => extra.galleria ?? [], takePhoto: async () => [] }) as never,
        selettoreFile: () => ({ pickFiles: async () => [{ name: 'fattura.pdf', declaredMediaType: 'application/pdf', sizeBytes: 900_000, source: { kind: 'native-uri', uri: 'content://doc/1' } }] }) as never,
        consenso: () => 'allow',
        ricordaSempre: () => undefined,
        fornitore: () => ({ id: null, nome: 'PC' }),
        lingua: () => 'en',
        t: (k) => k,
        ...(sessione ? { sessione } : {}),
        ...(extra.suConsenso ? { suConsenso: extra.suConsenso } : {}),
    })
}

describe('R5.13 F3 — la bozza del Codice con la sessione sul PC', () => {
    it('ARB-01 il file va alla sessione del PC; il vassoio segue l’invio e la pausa; alla fine è pronto senza percorso assoluto', async () => {
        const chiamate: Parameters<Allega>[0][] = []
        const visti: unknown[] = []
        let a: ReturnType<typeof bozza>
        const allega: Allega = async (o) => {
            chiamate.push(o)
            const passo = (s: StatoFileRemoto) => { o.onStato?.(s); visti.push(JSON.parse(JSON.stringify(a.vassoio[0]?.progress ?? null))) }
            passo({ stato: 'in-invio', fatti: 524_288, totale: 900_000 })
            passo({ stato: 'pausa', fatti: 524_288, totale: 900_000 })
            passo({ stato: 'sul-pc', fatti: 900_000, totale: 900_000 })
            return { tipo: 'file', nome: 'fattura.pdf', percorso: 'allegati/fattura.pdf', bytes: 900_000 }
        }
        a = bozza(allega, () => 'sessione-pc-1')
        await a.scegli('file')
        expect(chiamate[0]).toMatchObject({ uri: 'content://doc/1', nome: 'fattura.pdf', sessionId: 'sessione-pc-1' })
        expect(visti).toEqual([
            { phase: 'sending', sent: 524_288, total: 900_000 },
            { phase: 'paused', sent: 524_288, total: 900_000 },
            { phase: 'sending', sent: 900_000, total: 900_000 },
        ])
        expect(a.vassoio[0]).toMatchObject({ status: 'authorized', displayName: 'fattura.pdf', sizeBytes: 900_000, progress: null })
        expect(a.pronte().voci).toEqual([{ tipo: 'file', nome: 'fattura.pdf', percorso: 'allegati/fattura.pdf' }])
    })

    it('ARB-02 in una conversazione non ancora partita il file si ferma con la frase della finestra', async () => {
        const allega: Allega = async () => { throw Object.assign(new Error('x'), { code: 'FILE_NO_CONVERSATION' }) }
        const a = bozza(allega, () => null)
        await a.scegli('file')
        expect(a.vassoio[0]).toMatchObject({ status: 'failed', error: `${en['attachments.fileFailed']} · ${en['attachments.fileNoConversation']}` })
    })

    it('ARB-03 in locale nulla cambia: niente sessione né stato al nativo, e la ricevuta senza `assoluto` resta un errore', async () => {
        const chiamate: Parameters<Allega>[0][] = []
        const a = bozza(async (o) => { chiamate.push(o); return { tipo: 'file', nome: 'fattura.pdf', percorso: 'allegati/fattura.pdf', bytes: 900_000 } })
        await a.scegli('file')
        expect(Object.keys(chiamate[0]!).sort()).toEqual(['nome', 'testo', 'uri'])
        expect(a.vassoio[0]).toMatchObject({ status: 'failed' })
    })

    it('ARB-04 il messaggio non parte finché un file è in viaggio verso il PC; lo dice con le parole della finestra', async () => {
        let finisci: () => void = () => {}
        const allega: Allega = (o) => new Promise((ok) => {
            o.onStato?.({ stato: 'pausa', fatti: 0, totale: 900_000 })
            finisci = () => ok({ tipo: 'file', nome: 'fattura.pdf', percorso: 'allegati/fattura.pdf', bytes: 900_000 })
        })
        const a = bozza(allega, () => 'sessione-pc-1')
        const scelta = a.scegli('file')
        await new Promise((r) => setTimeout(r, 0))
        expect(await a.puoPartire()).toBe(false)
        expect(a.errore.value).toBe(`${en['attachments.loading']} · ${en['attachments.loadingBody']}`)
        finisci()
        await scelta
        expect(a.errore.value).toBeNull()
        expect(await a.puoPartire()).toBe(true)
        expect(a.pronte().voci).toEqual([{ tipo: 'file', nome: 'fattura.pdf', percorso: 'allegati/fattura.pdf' }])
    })

    it('ARB-05 anche in locale (come la finestra) un file ancora in copia ferma l’invio, poi parte col file', async () => {
        let finisci: () => void = () => {}
        const allega: Allega = () => new Promise((ok) => {
            finisci = () => ok({ tipo: 'file', nome: 'fattura.pdf', percorso: 'allegati/fattura.pdf', bytes: 900_000, assoluto: '/data/w/allegati/fattura.pdf' })
        })
        const a = bozza(allega)
        const scelta = a.scegli('file')
        await new Promise((r) => setTimeout(r, 0))
        expect(await a.puoPartire()).toBe(false)
        expect(a.errore.value).toBe(`${en['attachments.loading']} · ${en['attachments.loadingBody']}`)
        finisci()
        await scelta
        expect(await a.puoPartire()).toBe(true)
        expect(a.pronte().voci).toEqual([{ tipo: 'file', nome: 'fattura.pdf', percorso: 'allegati/fattura.pdf', assoluto: '/data/w/allegati/fattura.pdf' }])
    })

    it('ARB-06 ⛔ D-F3-1 (dal Pad, 25/10): il PC vuole il consenso della cartella ⇒ la frase, la riga «Chiedi al PC», e su «Consentita» il file riparte da sé', async () => {
        let volte = 0
        const consensi: unknown[] = []
        const allega: Allega = async () => {
            volte += 1
            if (volte === 1) throw Object.assign(new Error('The computer must allow this device to write in this folder.'), { code: 'CONSENT_REQUIRED', reason: 'consent-required', params: { cartellaId: 'c-1', nome: 'talos' } })
            return { tipo: 'file', nome: 'fattura.pdf', percorso: 'allegati/fattura.pdf', bytes: 900_000 }
        }
        const a = bozza(allega, () => 'sessione-pc-1', { suConsenso: (g) => consensi.push(g) })
        await a.scegli('file')
        expect(a.vassoio[0]).toMatchObject({ status: 'failed', error: `${en['attachments.fileFailed']} · computer.fileNeedsConsent` })
        expect(consensi).toEqual([expect.objectContaining({ code: 'CONSENT_REQUIRED', params: { cartellaId: 'c-1', nome: 'talos' } })])
        await a.riprovaDopoConsenso()
        expect(volte).toBe(2)
        expect(a.vassoio[0]).toMatchObject({ status: 'authorized', error: null })
        expect(a.pronte().voci).toEqual([{ tipo: 'file', nome: 'fattura.pdf', percorso: 'allegati/fattura.pdf' }])
        // un secondo «Consentita» non rimanda niente
        await a.riprovaDopoConsenso()
        expect(volte).toBe(2)
    })

    it('ARB-07 ⛔ D-F3-1: mai un codice grezzo nel vassoio — ogni guasto ha la sua frase o quella generica', async () => {
        const casi: Array<[Record<string, unknown>, string]> = [
            [{ code: 'TRANSFER_STALLED' }, 'chat.attachmentErrors.generic'],
            [{ code: 'CHECKSUM_MISMATCH' }, 'chat.attachmentErrors.generic'],
            [{ code: 'DISCONNECTED' }, 'computer.errors.disconnected'],
            [{ code: 'RATE_LIMITED' }, 'computer.fileBusy'],
            [{ code: 'BAD_MESSAGE', reason: 'images-unavailable' }, 'computer.imagesUnavailable'],
            // B9-4: un guasto senza codice che non è una frase dell'app (un TypeError) non entra grezzo nel vassoio
            [{ name: 'TypeError' }, 'chat.attachmentErrors.generic'],
            [{ code: 'NOT_AVAILABLE_REMOTELY' }, 'computer.onlyFromPc'],
            [{ code: 'FILE_TOO_LARGE' }, en['attachments.fileTooLargeBody']!],
            [{ code: 'FILE_NO_CONVERSATION' }, en['attachments.fileNoConversation']!],
            // blocco 8 del Desktop: un'immagine vuota ha il suo motivo
            // B10-6: la stessa parola del PC («vuota»), non «non riesco a leggere»
            [{ code: 'BAD_MESSAGE', reason: 'image-empty' }, 'computer.imageEmpty'],
        ]
        for (const [guasto, frase] of casi) {
            const a = bozza(async () => { throw Object.assign(new Error(String(guasto.code)), guasto) }, () => 'sessione-pc-1')
            await a.scegli('file')
            expect(a.vassoio[0]?.error, String(guasto.code)).toBe(`${en['attachments.fileFailed']} · ${frase}`)
            expect(a.vassoio[0]?.error).not.toMatch(/[A-Z]{3,}_[A-Z]/u)
        }
    })

    it('ARB-08 ⛔ D-F3-1: un’immagine rifiutata dal PC (image-invalid) dice il formato, non il codice né la frase inglese del PC', async () => {
        const richiesta: TalosR4ClientePonte['richiesta'] = async () => ({ stato: 415, corpo: JSON.stringify({ ok: false, error: { code: 'BAD_MESSAGE', message: 'Only PNG, JPEG or WebP images.', reason: 'image-invalid' } }) })
        const foto = { name: 'x.png', declaredMediaType: 'image/png', sizeBytes: 4, source: { kind: 'web-blob', blob: new Blob([new Uint8Array([0x89, 0x50, 0x4e, 0x47])], { type: 'image/png' }) } }
        const a = bozza(async () => { throw new Error('no') }, () => 'sessione-pc-1', { richiesta, galleria: [foto] })
        await a.scegli('galleria')
        expect(a.vassoio[0]).toMatchObject({ status: 'failed', error: `${en['attachments.imageFailed']} · ${en['attachments.imageFormatBody']}` })
    })

    it('ARB-09 ⛔ B9-2: togliere la bozza o svuotare il vassoio ferma il suo invio', async () => {
        const segnali: AbortSignal[] = []
        const allega: Allega = (o) => new Promise((_ok, ko) => {
            const s = (o as { segnale?: AbortSignal }).segnale!
            segnali.push(s)
            s.addEventListener('abort', () => ko(Object.assign(new Error('CANCELLED'), { code: 'CANCELLED' })))
        })
        const a = bozza(allega, () => 'sessione-pc-1')
        const scelta = a.scegli('file')
        await new Promise((r) => setTimeout(r, 0))
        expect(segnali).toHaveLength(1)
        a.togli(a.vassoio[0]!.id)
        expect(segnali[0]!.aborted).toBe(true)
        await scelta
        expect(a.vassoio).toHaveLength(0)
        const b = bozza(allega, () => 'sessione-pc-1')
        const scelta2 = b.scegli('file')
        await new Promise((r) => setTimeout(r, 0))
        b.svuota()
        expect(segnali[1]!.aborted).toBe(true)
        await scelta2
    })

    it('ARB-11 ⛔ B9-3: mentre il PC è pieno il vassoio lo dice (fase «waiting»)', async () => {
        const visti: unknown[] = []
        let a: ReturnType<typeof bozza>
        const allega: Allega = async (o) => {
            o.onStato?.({ stato: 'attesa-turno' })
            visti.push(JSON.parse(JSON.stringify(a.vassoio[0]?.progress ?? null)))
            return { tipo: 'file', nome: 'fattura.pdf', percorso: 'allegati/fattura.pdf', bytes: 900_000 }
        }
        a = bozza(allega, () => 'sessione-pc-1')
        await a.scegli('file')
        expect(visti).toEqual([{ phase: 'waiting', sent: 0, total: 900_000 }])
    })

    it('ARB-12 ⛔ B10-2: un’immagine tolta mentre si leggono i suoi byte non parte', async () => {
        let leggi: () => void = () => {}
        const lettura = new Promise<void>((r) => { leggi = r })
        const chiamate: unknown[] = []
        const richiesta: TalosR4ClientePonte['richiesta'] = async (o) => { chiamate.push(o); return { stato: 200, corpo: JSON.stringify({ ok: true, data: { id: 'a'.repeat(64), mimeType: 'image/png', byte: 4 } }) } }
        const blob = new Blob([new Uint8Array([0x89, 0x50, 0x4e, 0x47])], { type: 'image/png' })
        const lento = Object.assign(blob, { arrayBuffer: async () => { await lettura; return new Uint8Array([0x89, 0x50, 0x4e, 0x47]).buffer } })
        const OrigFR = globalThis.FileReader
        class LettoreLento { result: string | null = null; onload: (() => void) | null = null; onerror: (() => void) | null = null
            readAsDataURL() { void lettura.then(() => { this.result = 'data:image/png;base64,iVBORw=='; this.onload?.() }) } }
        ;(globalThis as { FileReader: unknown }).FileReader = LettoreLento
        try {
            const foto = { name: 'x.png', declaredMediaType: 'image/png', sizeBytes: 4, source: { kind: 'web-blob', blob: lento } }
            const a = bozza(async () => { throw new Error('no') }, () => 'sessione-pc-1', { richiesta, galleria: [foto] })
            const scelta = a.scegli('galleria')
            await new Promise((r) => setTimeout(r, 0))
            a.togli(a.vassoio[0]!.id)
            leggi()
            await scelta
            expect(chiamate).toHaveLength(0)
        } finally {
            ;(globalThis as { FileReader: unknown }).FileReader = OrigFR
        }
    })

    it('ARB-13 ⛔ B10-5: un’immagine che fallisce dopo una pausa non resta «in pausa»', async () => {
        const richiesta: TalosR4ClientePonte['richiesta'] = async (o) => {
            o.onStato?.({ stato: 'pausa', fatti: 0, totale: 4 })
            return { stato: 503, corpo: JSON.stringify({ ok: false, error: { code: 'NOT_PAIRED', message: 'NOT_PAIRED' } }) }
        }
        const foto = { name: 'x.png', declaredMediaType: 'image/png', sizeBytes: 4, source: { kind: 'web-blob', blob: new Blob([new Uint8Array([0x89, 0x50, 0x4e, 0x47])], { type: 'image/png' }) } }
        const a = bozza(async () => { throw new Error('no') }, () => 'sessione-pc-1', { richiesta, galleria: [foto] })
        await a.scegli('galleria')
        expect(a.vassoio[0]).toMatchObject({ status: 'failed', progress: null })
    })
})
