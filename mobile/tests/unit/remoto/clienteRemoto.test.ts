import { describe, expect, it, vi } from 'vitest'
import { creaClienteRemoto, type TrasportoRemoto } from '@/lib/remoto/clienteRemoto'

/**
 * ⛔ CLIENT DEL CONTROLLO REMOTO, fetta R-M1 (ledger `LEDGER-CLIENT-REMOTO-MOBILE-2026-10-20.md`): il canale di lavoro
 * (`talos-remote/1`) visto dal telefono. Forme del PC: `servizio.mjs` (req/res/ping/pong/evt/error) e `operazioni.mjs`
 * (`session.events` con `sub` scelto dal telefono, al più 8; `session.unsubscribe`) @ aeab15222.
 */
function trasportoFinto() {
    const inviati: Record<string, unknown>[] = []
    let ricevi: (m: unknown) => void = () => {}
    let chiuso: (motivo: string) => void = () => {}
    const t: TrasportoRemoto = {
        invia: async (m) => { inviati.push(m) },
        onMessaggio: (cb) => { ricevi = cb; return () => { ricevi = () => {} } },
        onChiuso: (cb) => { chiuso = cb; return () => { chiuso = () => {} } },
    }
    return { t, inviati, arriva: (m: unknown) => ricevi(m), chiudi: (motivo = 'rete') => chiuso(motivo) }
}
const attesa = () => new Promise((r) => setTimeout(r, 0))

describe('il canale di lavoro, lato telefono', () => {
    it('CLI-R-01 una richiesta: req con n valido, la risposta col suo n la risolve', async () => {
        const f = trasportoFinto()
        const c = creaClienteRemoto(f.t)
        const p = c.richiesta('sessions.list', {})
        await attesa()
        const req = f.inviati[0] as { t: string; n: string; op: string; args: unknown }
        expect(req).toMatchObject({ t: 'req', op: 'sessions.list', args: {} })
        expect(req.n).toMatch(/^[A-Za-z0-9_-]{8,64}$/u)
        f.arriva({ v: 1, t: 'res', n: 'altro-numero', ok: true, data: 'no' })
        f.arriva({ v: 1, t: 'res', n: req.n, ok: true, data: { items: [1] } })
        await expect(p).resolves.toEqual({ items: [1] })
    })

    it('CLI-R-02 un rifiuto del PC (res ok:false o error col suo n) arriva col codice', async () => {
        const f = trasportoFinto()
        const c = creaClienteRemoto(f.t)
        const p1 = c.richiesta('session.stop', { sessionId: 's' })
        const p2 = c.richiesta('session.send', { sessionId: 's', corpo: { messaggio: 'ciao' } })
        await attesa()
        const [a, b] = f.inviati as { n: string }[]
        f.arriva({ v: 1, t: 'res', n: a.n, ok: false, code: 'NOT_ALLOWED_REMOTELY', message: 'no' })
        f.arriva({ v: 1, t: 'error', code: 'RATE_LIMITED', retryAfterMs: 500, n: b.n })
        await expect(p1).rejects.toMatchObject({ code: 'NOT_ALLOWED_REMOTELY', n: a.n })
        await expect(p2).rejects.toMatchObject({ code: 'RATE_LIMITED', retryAfterMs: 500, n: b.n })
    })

    it('CLI-R-12 D-RM4-5 (Pad, 20/10): il motivo e i parametri del rifiuto del PC arrivano, ma solo in forma stretta (vengono da fuori)', async () => {
        const f = trasportoFinto()
        const c = creaClienteRemoto(f.t)
        const p1 = c.richiesta('session.start', { corpo: {} })
        const p2 = c.richiesta('session.start', { corpo: {} })
        await attesa()
        const [a, b] = f.inviati as { n: string }[]
        f.arriva({ v: 1, t: 'res', n: a.n, ok: false, code: 'CONFIG_INVALID', message: 'Invalid configuration', reason: 'provider-key-missing-named', params: { provider: 'OpenRouter' } })
        // un motivo che non è una parola corta, o parametri che non sono testo breve, non passano
        f.arriva({ v: 1, t: 'res', n: b.n, ok: false, code: 'CONFIG_INVALID', message: 'x', reason: '<b>Clicca</b>', params: { provider: { annidato: 1 }, lungo: 'z'.repeat(400), lista: ['a'], ok: 'Gemini', limite: 32, attivo: true } })
        await expect(p1).rejects.toMatchObject({ code: 'CONFIG_INVALID', reason: 'provider-key-missing-named', params: { provider: 'OpenRouter' } })
        const e2 = await p2.catch((e: unknown) => e) as { reason?: unknown, params?: unknown }
        expect(e2.reason).toBeUndefined()
        // come il PC (r4 3141738b1: al più 10 valori semplici, testo/numero/sì-no): numeri e sì-no diventano testo per la frase
        expect(e2.params).toEqual({ ok: 'Gemini', limite: '32', attivo: 'true' })
    })

    it('CLI-R-12b FRASI-UNICHE (27/10/2026): la frase precisa per la persona (`explanation`) arriva; vuota o più lunga di 240 no', async () => {
        const f = trasportoFinto()
        const c = creaClienteRemoto(f.t)
        const [p1, p2, p3] = [0, 1, 2].map(() => c.richiesta('session.settings', { corpo: {} }).catch((e: unknown) => e as { explanation?: unknown }))
        await attesa()
        const [a, b, d] = f.inviati as { n: string }[]
        const precisa = 'The working mode is changed between turns, not while the model is working'
        f.arriva({ v: 1, t: 'res', n: a.n, ok: false, code: 'SESSION_NOT_READY', message: 'Session not ready for this action', reason: 'mode-change-while-running', explanation: precisa })
        f.arriva({ v: 1, t: 'res', n: b.n, ok: false, code: 'SESSION_NOT_READY', message: 'x', explanation: 'z'.repeat(241) })
        f.arriva({ v: 1, t: 'res', n: d.n, ok: false, code: 'SESSION_NOT_READY', message: 'x', explanation: '   ' })
        expect((await p1).explanation).toBe(precisa)
        expect((await p2).explanation).toBeUndefined()
        expect((await p3).explanation).toBeUndefined()
    })

    it('CLI-R-13 RA-14 (revisione 21/10): un codice che non è un identificatore diventa OPERATION_FAILED; il motivo come la regola del PC', async () => {
        const f = trasportoFinto()
        const c = creaClienteRemoto(f.t)
        const p1 = c.richiesta('sessions.list', {})
        const p2 = c.richiesta('sessions.list', {})
        const p3 = c.richiesta('sessions.list', {})
        await attesa()
        const [a, b, d] = f.inviati as { n: string }[]
        f.arriva({ v: 1, t: 'error', code: 'constructor', n: d.n })
        f.arriva({ v: 1, t: 'res', n: a.n, ok: false, code: '__proto__', message: 'x' })
        // il PC ammette `[A-Za-z0-9_.:-]{1,80}` per il motivo (r4 3141738b1): maiuscole, punti e due punti passano
        f.arriva({ v: 1, t: 'res', n: b.n, ok: false, code: 'CONFIG_INVALID', message: 'x', reason: 'Provider.key:missing' })
        await expect(p1).rejects.toMatchObject({ code: 'OPERATION_FAILED' })
        await expect(p2).rejects.toMatchObject({ code: 'CONFIG_INVALID', reason: 'Provider.key:missing' })
        await expect(p3).rejects.toMatchObject({ code: 'BAD_MESSAGE' })
    })

    it('CLI-R-14 RA-04 (revisione 21/10): lo stato HTTP del rifiuto del PC arriva, solo se è un intero fra 400 e 599', async () => {
        const f = trasportoFinto()
        const c = creaClienteRemoto(f.t)
        const p1 = c.richiesta('session.answer', { sessionId: 's', corpo: {} })
        const p2 = c.richiesta('session.answer', { sessionId: 's', corpo: {} })
        await attesa()
        const [a, b] = f.inviati as { n: string }[]
        f.arriva({ v: 1, t: 'res', n: a.n, ok: false, code: 'QUESTION_NOT_PENDING', message: 'x', stato: 409 })
        f.arriva({ v: 1, t: 'res', n: b.n, ok: false, code: 'X', message: 'x', stato: 200 })
        await expect(p1).rejects.toMatchObject({ code: 'QUESTION_NOT_PENDING', stato: 409 })
        expect(((await p2.catch((e: unknown) => e)) as { stato?: unknown }).stato).toBeUndefined()
    })

    it('CLI-R-03 «Riprova»: lo stesso n esce di nuovo tale e quale (idempotenza del PC, 10 minuti)', async () => {
        const f = trasportoFinto()
        const c = creaClienteRemoto(f.t)
        const p = c.richiesta('session.approve', { sessionId: 's', corpo: { id: 'x' } }, { n: 'riprova-12345' })
        await attesa()
        expect((f.inviati[0] as { n: string }).n).toBe('riprova-12345')
        f.arriva({ v: 1, t: 'res', n: 'riprova-12345', ok: true, data: { ok: true } })
        await expect(p).resolves.toEqual({ ok: true })
        expect(() => c.richiesta('x', {}, { n: 'corto' })).toThrow()
    })

    it('CLI-R-04 la connessione cade: le richieste in volo si rifiutano con DISCONNECTED e il loro n, per riprovarle', async () => {
        const f = trasportoFinto()
        const c = creaClienteRemoto(f.t)
        const p = c.richiesta('session.send', { sessionId: 's', corpo: { messaggio: 'ciao' } })
        await attesa()
        const n = (f.inviati[0] as { n: string }).n
        f.chiudi('rete')
        await expect(p).rejects.toMatchObject({ code: 'DISCONNECTED', n })
    })

    it('CLI-R-05 un errore senza n (REVOKED, NOT_PAIRED) chiude il cliente e rifiuta tutto col suo codice', async () => {
        const f = trasportoFinto()
        const visti: string[] = []
        const c = creaClienteRemoto(f.t, { onErroreDelCanale: (code) => visti.push(code) })
        const p = c.richiesta('sessions.list', {})
        await attesa()
        f.arriva({ v: 1, t: 'error', code: 'REVOKED' })
        await expect(p).rejects.toMatchObject({ code: 'REVOKED' })
        expect(visti).toEqual(['REVOKED'])
    })

    it('CLI-R-06 iscrizione agli eventi: sub scelto qui, gli evt di quel sub arrivano in ordine, disiscrivi manda session.unsubscribe', async () => {
        const f = trasportoFinto()
        const c = creaClienteRemoto(f.t)
        const eventi: unknown[] = []
        const p = c.iscrivi('sess-1', 12, (e) => eventi.push(e))
        await attesa()
        const req = f.inviati[0] as { n: string; op: string; args: { sessionId: string; after: number; sub: string } }
        expect(req.op).toBe('session.events')
        expect(req.args).toMatchObject({ sessionId: 'sess-1', after: 12 })
        expect(req.args.sub).toMatch(/^[A-Za-z0-9_-]{1,32}$/u)
        f.arriva({ v: 1, t: 'res', n: req.n, ok: true, data: { sub: req.args.sub, after: 12 } })
        const iscrizione = await p
        f.arriva({ v: 1, t: 'evt', sub: req.args.sub, data: { type: 'RunStarted' } })
        f.arriva({ v: 1, t: 'evt', sub: 'di-un-altro', data: { type: 'X' } })
        f.arriva({ v: 1, t: 'evt', sub: req.args.sub, data: { type: 'RunFinished' } })
        expect(eventi).toEqual([{ type: 'RunStarted' }, { type: 'RunFinished' }])
        const fine = iscrizione.disiscrivi()
        await attesa()
        const u = f.inviati[1] as { n: string; op: string; args: unknown }
        expect(u).toMatchObject({ op: 'session.unsubscribe', args: { sub: req.args.sub } })
        f.arriva({ v: 1, t: 'res', n: u.n, ok: true, data: { chiusa: true } })
        await fine
        f.arriva({ v: 1, t: 'evt', sub: req.args.sub, data: { type: 'Dopo' } })
        expect(eventi).toHaveLength(2)
    })

    it('CLI-R-07 al più 8 iscrizioni per connessione, come il PC', async () => {
        const f = trasportoFinto()
        const c = creaClienteRemoto(f.t)
        for (let i = 0; i < 8; i++) void c.iscrivi(`s${i}`, 0, () => {}).catch(() => {})
        await expect(c.iscrivi('s9', 0, () => {})).rejects.toMatchObject({ code: 'RATE_LIMITED' })
    })

    it('CLI-R-08 ping: il pong col suo s misura il tempo d\'andata e ritorno', async () => {
        const f = trasportoFinto()
        const ora = vi.fn().mockReturnValueOnce(1000).mockReturnValueOnce(1042)
        const c = creaClienteRemoto(f.t, { ora })
        const p = c.ping()
        await attesa()
        const ping = f.inviati[0] as { t: string; s: string }
        expect(ping.t).toBe('ping')
        f.arriva({ v: 1, t: 'pong', s: ping.s })
        await expect(p).resolves.toBe(42)
    })

    it('CLI-R-10 una risposta senza ok:true non è un successo: si rifiuta con OPERATION_FAILED', async () => {
        const f = trasportoFinto()
        const c = creaClienteRemoto(f.t)
        const p = c.richiesta('sessions.list', {})
        await attesa()
        const n = (f.inviati[0] as { n: string }).n
        f.arriva({ v: 1, t: 'res', n, data: { items: [] } })
        await expect(p).rejects.toMatchObject({ code: 'OPERATION_FAILED', n })
    })

    it('CLI-R-11 disiscriversi due volte manda UN solo session.unsubscribe', async () => {
        const f = trasportoFinto()
        const c = creaClienteRemoto(f.t)
        const p = c.iscrivi('sess-1', 0, () => {})
        await attesa()
        const req = f.inviati[0] as { n: string; args: { sub: string } }
        f.arriva({ v: 1, t: 'res', n: req.n, ok: true, data: { sub: req.args.sub } })
        const iscrizione = await p
        void iscrizione.disiscrivi()
        void iscrizione.disiscrivi()
        await attesa()
        expect(f.inviati.filter((m) => (m as { op?: string }).op === 'session.unsubscribe')).toHaveLength(1)
    })

    it('CLI-R-09 un messaggio storto dal PC non rompe il cliente (si scarta)', async () => {
        const f = trasportoFinto()
        const c = creaClienteRemoto(f.t)
        const p = c.richiesta('sessions.list', {})
        await attesa()
        const n = (f.inviati[0] as { n: string }).n
        for (const storto of [null, 'x', { t: 'res' }, { v: 2, t: 'res', n }]) f.arriva(storto)
        f.arriva({ v: 1, t: 'res', n, ok: true, data: 1 })
        await expect(p).resolves.toBe(1)
    })
})
