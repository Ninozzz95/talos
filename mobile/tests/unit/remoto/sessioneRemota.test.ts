import { beforeEach, describe, expect, it, vi } from 'vitest'
import { apriPonteRemoto } from '@/lib/remoto/sessioneRemota'
import type { PluginComputer } from '@/lib/remoto/computerRemoti'

// Revisione del blocco 4, condizione del Desktop: il trasporto vero, con un `smonta` che a comando rifiuta (quello vero oggi non lo
// fa, `trasportoNativo.ts:27`; la prova tiene `chiudi` sicuro anche se un giorno cambiasse).
const guasto = vi.hoisted(() => ({ smonta: false }))
vi.mock('@/lib/remoto/trasportoNativo', async (importOriginal) => {
    const vero = await importOriginal<typeof import('@/lib/remoto/trasportoNativo')>()
    return {
        trasportoNativo: async (...a: Parameters<typeof vero.trasportoNativo>) => {
            const t = await vero.trasportoNativo(...a)
            return { ...t, smonta: async () => { await t.smonta(); if (guasto.smonta) throw new Error('smonta guasto') } }
        },
    }
})
beforeEach(() => { guasto.smonta = false })

/**
 * ⛔ CLIENT DEL CONTROLLO REMOTO, fetta R-M4: aprire il ponte r4 verso un PC accoppiato (canale di lavoro, cliente, ponte) e chiuderlo.
 * Il ponte è quello di `ponteRemotoR4.ts`; qui il cablaggio col plugin vero, nessuna rotta inventata.
 */
function pluginFinto() {
    const ascolti = new Map<string, Set<(e: never) => void>>()
    const emetti = (evento: string, e: unknown) => { for (const cb of ascolti.get(evento) ?? []) (cb as (x: unknown) => void)(e) }
    const inviati: Array<Record<string, unknown>> = []
    const plugin: PluginComputer = {
        accoppia: vi.fn(async () => ({ canale: 'c1', telefonoId: 't' })),
        concludiAccoppiamento: vi.fn(async () => {}),
        collega: vi.fn(async () => ({ canale: 'c9' })),
        invia: vi.fn(async ({ canale, json }) => {
            const m = JSON.parse(json)
            inviati.push(m)
            if (m.t === 'req') queueMicrotask(() => emetti('remoto-messaggio', { canale, json: JSON.stringify({ v: 1, t: 'res', n: m.n, ok: true, data: { items: [] } }) }))
        }),
        chiudi: vi.fn(async () => {}),
        percorso: vi.fn(async () => ({ tipo: 'diretto', rttMs: 5 })),
        elenco: vi.fn(async () => ({ computer: [] })),
        dimentica: vi.fn(async () => ({ dimenticato: true })),
        nomeDelTelefono: vi.fn(async () => ({ nome: 'Pad' })),
        scansiona: vi.fn(async () => ({ testo: '' })),
        addListener: vi.fn(async (evento: string, cb: (e: never) => void) => {
            if (!ascolti.has(evento)) ascolti.set(evento, new Set())
            ascolti.get(evento)!.add(cb)
            return { remove: async () => { ascolti.get(evento)!.delete(cb) } }
        }) as PluginComputer['addListener'],
    }
    return { plugin, inviati, emetti, ascolti }
}

describe('la sessione remota', () => {
    it('SRM-01 apre il canale di lavoro e il ponte: una richiesta del Codice diventa un req del filo', async () => {
        const f = pluginFinto()
        const { ponte } = await apriPonteRemoto(f.plugin, 'pc-uno')
        expect(f.plugin.collega).toHaveBeenCalledWith({ pcId: 'pc-uno' })
        const r = await ponte.richiesta({ metodo: 'GET', percorso: '/api/v1/sessions' })
        expect(JSON.parse(r.corpo)).toEqual({ ok: true, data: { items: [] } })
        expect(f.inviati.at(-1)).toMatchObject({ v: 1, t: 'req', op: 'sessions.list', args: {} })
    })

    it('SRM-02 la caduta del canale chiude i flussi del ponte; «chiudi» chiude il canale e toglie gli ascolti', async () => {
        const f = pluginFinto()
        const { ponte, chiudi } = await apriPonteRemoto(f.plugin, 'pc-uno')
        const errori: unknown[] = []
        await ponte.addListener('r4Errore', (d) => errori.push(d))
        await ponte.apriFlusso({ id: 'f1', percorso: '/api/v1/sessions/s1/events?after=0' })
        f.emetti('remoto-chiuso', { canale: 'c9', motivo: 'DISCONNECTED' })
        expect(errori).toEqual([{ id: 'f1', motivo: 'DISCONNECTED' }])
        await chiudi()
        expect(f.plugin.chiudi).toHaveBeenCalledWith({ canale: 'c9' })
        expect([...f.ascolti.values()].every((s) => s.size === 0)).toBe(true)
    })

    it('SRM-04 RA-01 (revisione 21/10): il canale cade ⇒ la richiesta dopo lo riapre (un collega nuovo) e va a buon fine', async () => {
        const f = pluginFinto()
        const { ponte } = await apriPonteRemoto(f.plugin, 'pc-uno')
        f.emetti('remoto-chiuso', { canale: 'c9', motivo: 'DISCONNECTED' })
        f.plugin.collega = vi.fn(async () => ({ canale: 'c10' }))
        const r = await ponte.richiesta({ metodo: 'GET', percorso: '/api/v1/sessions' })
        expect(r.stato).toBe(200)
        expect(f.plugin.collega).toHaveBeenCalledWith({ pcId: 'pc-uno' })
        // il flusso riparte sul canale nuovo
        await ponte.apriFlusso({ id: 'f2', percorso: '/api/v1/sessions/s1/events?after=7' })
        expect(f.inviati.at(-1)).toMatchObject({ t: 'req', op: 'session.events', args: { sessionId: 's1', after: 7 } })
    })

    it('SRM-05 RA-05 (revisione 21/10): se il trasporto non si monta dopo «collega», il canale si chiude; dopo «chiudi» niente si riapre', async () => {
        const f = pluginFinto()
        const addListener = f.plugin.addListener
        f.plugin.addListener = vi.fn(async () => { throw new Error('ascolto non montato') }) as PluginComputer['addListener']
        await expect(apriPonteRemoto(f.plugin, 'pc-uno')).rejects.toThrow()
        expect(f.plugin.chiudi).toHaveBeenCalledWith({ canale: 'c9' })
        f.plugin.addListener = addListener
        const g = pluginFinto()
        const { ponte, chiudi } = await apriPonteRemoto(g.plugin, 'pc-uno')
        await chiudi()
        const r = await ponte.richiesta({ metodo: 'GET', percorso: '/api/v1/sessions' })
        expect(r.stato).toBe(503)
        expect(g.plugin.collega).toHaveBeenCalledTimes(1)
    })

    it('SRM-06 RA-01: due richieste insieme dopo la caduta riaprono UN solo canale (un\'apertura alla volta)', async () => {
        const f = pluginFinto()
        const { ponte } = await apriPonteRemoto(f.plugin, 'pc-uno')
        f.emetti('remoto-chiuso', { canale: 'c9', motivo: 'DISCONNECTED' })
        f.plugin.collega = vi.fn(async () => ({ canale: 'c10' }))
        const [r1, r2] = await Promise.all([
            ponte.richiesta({ metodo: 'GET', percorso: '/api/v1/sessions' }),
            ponte.richiesta({ metodo: 'GET', percorso: '/api/v1/sessions' }),
        ])
        expect([r1.stato, r2.stato]).toEqual([200, 200])
        expect(f.plugin.collega).toHaveBeenCalledTimes(1)
    })

    it('SRM-03 un PC che non si raggiunge: un secondo tentativo, poi il rifiuto col codice', async () => {
        const f = pluginFinto()
        f.plugin.collega = vi.fn(async () => { throw Object.assign(new Error('x'), { code: 'CONNECT_FAILED' }) })
        await expect(apriPonteRemoto(f.plugin, 'pc-uno')).rejects.toMatchObject({ code: 'CONNECT_FAILED' })
        expect(f.plugin.collega).toHaveBeenCalledTimes(2)
    })

    /*
     * ⛔ Revisione del blocco 4, condizione del Desktop prima del commit: `riepilogo` → `sessioni` cattura ogni errore, tranne il suo
     * `finally` (`aperto.chiudi()`). Se `smonta` rifiutava, `chiudi` rifiutava, e il `Promise.all` del «Sì» dei PC doppi si fermava:
     * nessuna voce dimenticata, nessun messaggio. `chiudi` non lancia mai, e il canale si chiude lo stesso.
     */
    it('SESS-CHIUDI-01 `smonta` che rifiuta: «chiudi» si risolve e il canale si chiude lo stesso', async () => {
        const f = pluginFinto()
        const { chiudi } = await apriPonteRemoto(f.plugin, 'pc-uno')
        guasto.smonta = true
        await expect(chiudi()).resolves.toBeUndefined()
        expect(f.plugin.chiudi).toHaveBeenCalledWith({ canale: 'c9' })
    })

    it('SESS-CHIUDI-02 lo smontaggio di un canale CADUTO che rifiuta non fa rifiutare «chiudi»', async () => {
        const f = pluginFinto()
        const { chiudi } = await apriPonteRemoto(f.plugin, 'pc-uno')
        guasto.smonta = true
        f.emetti('remoto-chiuso', { canale: 'c9', motivo: 'DISCONNECTED' })
        await expect(chiudi()).resolves.toBeUndefined()
        expect(f.plugin.chiudi).toHaveBeenCalledWith({ canale: 'c9' })
    })

    /*
     * Revisione del blocco 4 (J2, voce 7): il ramo «chiuso mentre si apriva» (`sessioneRemota.ts` ~53) aspettava `smonta()` senza
     * protezione; se rifiutava, `plugin.chiudi({ canale })` non partiva e il canale appena aperto restava acceso nel nativo.
     */
    it('SESS-CHIUDI-03 «chiudi» durante una riapertura e `smonta` che rifiuta: il canale nuovo si chiude lo stesso, e la richiesta dice DISCONNECTED', async () => {
        const f = pluginFinto()
        const { ponte, chiudi } = await apriPonteRemoto(f.plugin, 'pc-uno')
        f.emetti('remoto-chiuso', { canale: 'c9', motivo: 'DISCONNECTED' })
        let collegato: (v: { canale: string }) => void = () => {}
        f.plugin.collega = vi.fn(() => new Promise<{ canale: string }>((ok) => { collegato = ok }))
        // il ponte non lancia: un guasto del filo torna come busta d'errore con il suo codice (`ponteRemotoR4.ts`, 503 per DISCONNECTED)
        const richiesta = ponte.richiesta({ metodo: 'GET', percorso: '/api/v1/sessions' })
        await vi.waitFor(() => { if (!(f.plugin.collega as ReturnType<typeof vi.fn>).mock.calls.length) throw new Error('non ancora') })
        await chiudi()
        guasto.smonta = true
        collegato({ canale: 'c10' })
        const esito = await richiesta
        expect(f.plugin.chiudi).toHaveBeenCalledWith({ canale: 'c10' })
        expect(esito.stato).toBe(503)
        expect(JSON.parse(esito.corpo)).toMatchObject({ ok: false, error: { code: 'DISCONNECTED' } })
    })
})
