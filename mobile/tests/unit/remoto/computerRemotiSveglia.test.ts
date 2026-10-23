import { describe, expect, it, vi } from 'vitest'
import { creaComputerRemoti, type PluginComputer } from '@/lib/remoto/computerRemoti'

/**
 * ⛔ R-M5a (ledger `LEDGER-CLIENT-REMOTO-MOBILE-2026-10-20.md`, 21/10/2026): le notifiche da un computer accoppiato, lato TypeScript.
 * Owner R-M5 Q3 «Dopo l'accoppiamento, con Prova la notifica». Contratto del PC (r4 7ce93ce7e + 368df4e6e): `device.wake
 * {sveglia: {endpoint, keys:{p256dh, auth}} | null}` → `{sveglia: bool}` sul canale di lavoro; `device.wake.test` → `{esito:
 * inviata | senza-iscrizione | dimenticata | fallita | troppo-presto, attendiMs?}`.
 */
const ISCRIZIONE = { endpoint: 'https://fcm.googleapis.com/fcm/send/abc', keys: { p256dh: 'BBBB', auth: 'AAAA' } }

function pluginFinto(risposte: Record<string, unknown> = {}, { spento = false } = {}) {
    const ascolti = new Map<string, Set<(e: never) => void>>()
    const richieste: Array<{ op: string, args: unknown }> = []
    const ordine: string[] = []
    const emetti = (evento: string, e: unknown) => { for (const cb of ascolti.get(evento) ?? []) (cb as (x: unknown) => void)(e) }
    const plugin: PluginComputer = {
        accoppia: vi.fn(), concludiAccoppiamento: vi.fn(),
        collega: vi.fn(async () => {
            if (spento) throw Object.assign(new Error('x'), { code: 'CONNECT_FAILED' })
            return { canale: 'c2' }
        }),
        invia: vi.fn(async ({ canale, json }) => {
            const m = JSON.parse(json)
            if (m.t === 'ping') queueMicrotask(() => emetti('remoto-messaggio', { canale, json: JSON.stringify({ v: 1, t: 'pong', s: m.s }) }))
            if (m.t !== 'req') return
            richieste.push({ op: m.op, args: m.args }); ordine.push(m.op)
            const r = risposte[m.op]
            const res = r && typeof r === 'object' && 'codice' in (r as object)
                ? { v: 1, t: 'res', n: m.n, ok: false, code: (r as { codice: string }).codice }
                : { v: 1, t: 'res', n: m.n, ok: true, data: r ?? {} }
            queueMicrotask(() => emetti('remoto-messaggio', { canale, json: JSON.stringify(res) }))
        }),
        chiudi: vi.fn(async () => {}),
        percorso: vi.fn(async () => ({ tipo: 'diretto', rttMs: 11 })),
        elenco: vi.fn(async () => ({ computer: [] })),
        dimentica: vi.fn(async () => ({ dimenticato: true })),
        nomeDelTelefono: vi.fn(async () => ({ nome: 'Pad' })),
        scansiona: vi.fn(),
        svegliaStato: vi.fn(async () => ({ accesa: true, iscrizione: true, daMandare: false, errore: null, google: true, vapid: true, consentite: true })),
        svegliaAttiva: vi.fn(async () => { ordine.push('svegliaAttiva'); return { iscrizione: ISCRIZIONE } }),
        svegliaMandata: vi.fn(async () => { ordine.push('svegliaMandata') }),
        svegliaDisattiva: vi.fn(async () => { ordine.push('svegliaDisattiva') }),
        svegliaProva: vi.fn(async (o: { annulla?: boolean }) => { ordine.push(o.annulla ? 'svegliaProva:annulla' : 'svegliaProva') }),
        svegliaRimanda: vi.fn(async (o: { forza?: boolean }) => { ordine.push(o.forza ? 'svegliaRimanda:forza' : 'svegliaRimanda') }),
        addListener: vi.fn(async (evento: string, cb: (e: never) => void) => {
            if (!ascolti.has(evento)) ascolti.set(evento, new Set())
            ascolti.get(evento)!.add(cb)
            return { remove: async () => { ascolti.get(evento)!.delete(cb) } }
        }) as PluginComputer['addListener'],
    }
    return { plugin, richieste, ordine }
}

describe('le notifiche da un computer (R-M5a)', () => {
    it('SVG-01 attiva: permesso ⇒ registrazione nativa ⇒ l\'iscrizione al PC con device.wake ⇒ segnata come mandata', async () => {
        const f = pluginFinto({ 'device.wake': { sveglia: true } })
        const permesso = vi.fn(async () => 'granted')
        const c = creaComputerRemoti(f.plugin, { permessoNotifiche: permesso })
        expect(await c.attivaNotifiche('pc-uno')).toEqual({ ok: true, alPc: true })
        expect(permesso).toHaveBeenCalledOnce()
        expect(f.richieste).toEqual([{ op: 'device.wake', args: { sveglia: ISCRIZIONE } }])
        expect(f.plugin.svegliaMandata).toHaveBeenCalledWith({ pcId: 'pc-uno', endpoint: ISCRIZIONE.endpoint })
        expect(f.ordine).toEqual(['svegliaAttiva', 'device.wake', 'svegliaMandata'])
    })

    it('SVG-02 senza permesso delle notifiche non si registra niente', async () => {
        const f = pluginFinto()
        const c = creaComputerRemoti(f.plugin, { permessoNotifiche: async () => 'denied' })
        expect(await c.attivaNotifiche('pc-uno')).toEqual({ ok: false, code: 'NOTIFICATIONS_DENIED' })
        expect(f.plugin.svegliaAttiva).not.toHaveBeenCalled()
        expect(f.richieste).toEqual([])
    })

    it('SVG-03 a PC spento la sveglia resta accesa e l\'iscrizione da mandare (la manda il lavoro nativo); un rifiuto nativo passa col suo codice', async () => {
        const f = pluginFinto({}, { spento: true })
        const c = creaComputerRemoti(f.plugin, { permessoNotifiche: async () => 'granted' })
        expect(await c.attivaNotifiche('pc-uno')).toEqual({ ok: true, alPc: false })
        expect(f.plugin.svegliaMandata).not.toHaveBeenCalled()
        expect(f.plugin.svegliaDisattiva).not.toHaveBeenCalled()

        const g = pluginFinto()
        ;(g.plugin.svegliaAttiva as ReturnType<typeof vi.fn>).mockRejectedValueOnce(Object.assign(new Error('x'), { code: 'WAKE_UNAVAILABLE' }))
        const d = creaComputerRemoti(g.plugin, { permessoNotifiche: async () => 'granted' })
        expect(await d.attivaNotifiche('pc-uno')).toEqual({ ok: false, code: 'WAKE_UNAVAILABLE' })
    })

    it('SVG-04 «Prova la notifica»: il telefono la aspetta PRIMA di chiederla, e l\'esito del PC passa solo se è uno dei suoi', async () => {
        const f = pluginFinto({ 'device.wake.test': { esito: 'troppo-presto', attendiMs: 4200 } })
        const c = creaComputerRemoti(f.plugin)
        expect(await c.provaNotifica('pc-uno')).toEqual({ esito: 'troppo-presto', attendiMs: 4200 })
        expect(f.ordine).toEqual(['svegliaProva', 'device.wake.test', 'svegliaProva:annulla'])

        const g = pluginFinto({ 'device.wake.test': { esito: 'boh' } })
        expect(await creaComputerRemoti(g.plugin).provaNotifica('pc-uno')).toEqual({ esito: 'fallita' })
        const h = pluginFinto({}, { spento: true })
        expect(await creaComputerRemoti(h.plugin).provaNotifica('pc-uno')).toEqual({ esito: 'non-raggiunto', code: 'CONNECT_FAILED' })
    })

    it('SVG-05 spegni: il PC dimentica l\'iscrizione (sveglia null), poi il telefono la toglie comunque, anche a PC spento', async () => {
        const f = pluginFinto({ 'device.wake': { sveglia: false } })
        expect(await creaComputerRemoti(f.plugin).disattivaNotifiche('pc-uno')).toEqual({ avvisato: true })
        expect(f.richieste).toEqual([{ op: 'device.wake', args: { sveglia: null } }])
        expect(f.ordine).toEqual(['device.wake', 'svegliaDisattiva'])
        const g = pluginFinto({}, { spento: true })
        expect(await creaComputerRemoti(g.plugin).disattivaNotifiche('pc-uno')).toEqual({ avvisato: false })
        expect(g.plugin.svegliaDisattiva).toHaveBeenCalledWith({ pcId: 'pc-uno' })
    })

    it('SVG-06 lo stato: accese solo con la sveglia accesa E un\'iscrizione; senza Play services non disponibili; un guasto è «spente»', async () => {
        const f = pluginFinto()
        const c = creaComputerRemoti(f.plugin)
        expect(await c.notifiche('pc-uno')).toEqual({ accese: true, disponibili: true, errore: null, daMandare: false, vapid: true, consentite: true })
        ;(f.plugin.svegliaStato as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ accesa: true, iscrizione: false, daMandare: true, errore: 'NETWORK', google: false, vapid: false, consentite: false })
        expect(await c.notifiche('pc-uno')).toEqual({ accese: false, disponibili: false, errore: 'NETWORK', daMandare: true, vapid: false, consentite: false })
        // revisione R-M5a (20): un guasto del plugin non è «mancano i servizi Google»
        ;(f.plugin.svegliaStato as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error('x'))
        expect(await c.notifiche('pc-uno')).toEqual({ accese: false, disponibili: true, errore: 'STATE_UNAVAILABLE', daMandare: false, vapid: true, consentite: true })
    })

    it('SVG-07 dopo la prova: inviata lascia il segno; senza iscrizione la rimanda; dimenticata spegne la sveglia del telefono', async () => {
        const a = pluginFinto({ 'device.wake.test': { esito: 'inviata' } })
        await creaComputerRemoti(a.plugin).provaNotifica('pc-uno')
        expect(a.ordine).toEqual(['svegliaProva', 'device.wake.test'])
        const b = pluginFinto({ 'device.wake.test': { esito: 'senza-iscrizione' } })
        await creaComputerRemoti(b.plugin).provaNotifica('pc-uno')
        expect(b.ordine).toEqual(['svegliaProva', 'device.wake.test', 'svegliaProva:annulla', 'svegliaRimanda:forza'])
        const c = pluginFinto({ 'device.wake.test': { esito: 'dimenticata' } })
        await creaComputerRemoti(c.plugin).provaNotifica('pc-uno')
        expect(c.ordine).toEqual(['svegliaProva', 'device.wake.test', 'svegliaProva:annulla', 'svegliaDisattiva'])
        const d = pluginFinto({}, { spento: true })
        await creaComputerRemoti(d.plugin).provaNotifica('pc-uno')
        expect(d.ordine).toEqual(['svegliaProva', 'svegliaProva:annulla'])
    })

    it('SVG-08 il PC in linea fa partire subito un’iscrizione rimasta da mandare', async () => {
        const f = pluginFinto()
        expect((await creaComputerRemoti(f.plugin).controlla('pc-uno')).inLinea).toBe(true)
        expect(f.plugin.svegliaRimanda).toHaveBeenCalledWith({ pcId: 'pc-uno' })
        const g = pluginFinto({}, { spento: true })
        expect((await creaComputerRemoti(g.plugin).controlla('pc-uno')).inLinea).toBe(false)
        expect(g.plugin.svegliaRimanda).not.toHaveBeenCalled()
    })
})
