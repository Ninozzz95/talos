import { describe, expect, it, vi } from 'vitest'
import { apriPonteRemoto } from '@/lib/remoto/sessioneRemota'
import type { PluginComputer } from '@/lib/remoto/computerRemoti'

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
})
