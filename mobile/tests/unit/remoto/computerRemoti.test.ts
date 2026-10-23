import { describe, expect, it, vi } from 'vitest'
import { creaComputerRemoti, type PluginComputer } from '@/lib/remoto/computerRemoti'
import { trasportoNativo } from '@/lib/remoto/trasportoNativo'
import { fraseErroreRemoto } from '@/lib/remoto/frasiRemoto'
import { codiceDiAccoppiamento } from '@/lib/remoto/filoRemoto'

/**
 * ⛔ CLIENT DEL CONTROLLO REMOTO, fetta R-M3 (ledger `LEDGER-CLIENT-REMOTO-MOBILE-2026-10-20.md`, «R-M3 — ledger esatto»): lo stato
 * della sezione «Computer» (owner 20/10: il nome del mockup v5), sopra il plugin nativo `TalosRemoto`.
 */
const GETTONE = 'AAAAAAAAAAAAAAAAAAAAAA'
const QR = `talos-remote:1?pc=pc-uno&t=${GETTONE}&exp=2000000000`
const attesa = () => new Promise((r) => setTimeout(r, 0))

function pluginFinto() {
    const ascolti = new Map<string, Set<(e: never) => void>>()
    const inviati: Array<{ canale: string, m: Record<string, unknown> }> = []
    const emetti = (evento: string, e: unknown) => { for (const cb of ascolti.get(evento) ?? []) (cb as (x: unknown) => void)(e) }
    const plugin: PluginComputer = {
        accoppia: vi.fn(async () => ({ canale: 'c1', telefonoId: 'tel-uno' })),
        concludiAccoppiamento: vi.fn(async () => {}),
        collega: vi.fn(async () => ({ canale: 'c2' })),
        invia: vi.fn(async ({ canale, json }) => {
            const m = JSON.parse(json)
            inviati.push({ canale, m })
            if (m.t === 'ping') queueMicrotask(() => emetti('remoto-messaggio', { canale, json: JSON.stringify({ v: 1, t: 'pong', s: m.s }) }))
            // il PC finto risponde a ogni richiesta (per `pc.forget`: `{dimenticato:true}`, come `index.mjs`)
            if (m.t === 'req') queueMicrotask(() => emetti('remoto-messaggio', { canale, json: JSON.stringify({ v: 1, t: 'res', n: m.n, ok: true, data: { dimenticato: true } }) }))
        }),
        chiudi: vi.fn(async () => {}),
        percorso: vi.fn(async () => ({ tipo: 'diretto', rttMs: 11 })),
        elenco: vi.fn(async () => ({ computer: [{ pcId: 'pc-uno', nome: 'Studio', relay: null, accoppiatoAlle: 1_760_000_000_000 }] })),
        dimentica: vi.fn(async () => ({ dimenticato: true })),
        nomeDelTelefono: vi.fn(async () => ({ nome: 'Pad di Nino' })),
        scansiona: vi.fn(async () => ({ testo: QR })),
        addListener: vi.fn(async (evento: string, cb: (e: never) => void) => {
            if (!ascolti.has(evento)) ascolti.set(evento, new Set())
            ascolti.get(evento)!.add(cb)
            return { remove: async () => { ascolti.get(evento)!.delete(cb) } }
        }) as PluginComputer['addListener'],
    }
    return { plugin, inviati, emetti, ascolti }
}

describe('la sezione «Computer»', () => {
    it('RCM-01 elenco dal plugin, senza chiavi; aggiorna rilegge', async () => {
        const f = pluginFinto()
        const c = creaComputerRemoti(f.plugin)
        await c.aggiorna()
        expect(c.elenco.value).toEqual([{ pcId: 'pc-uno', nome: 'Studio', relay: null, accoppiatoAlle: 1_760_000_000_000 }])
    })

    it('RCM-02 accoppia: collego → conferma (col codice e il nome del telefono nel saluto) → fatto, e l\'elenco si rilegge', async () => {
        const f = pluginFinto()
        const c = creaComputerRemoti(f.plugin, { ora: () => 1_900_000_000_000 })
        const fine = c.accoppia(QR)
        expect(c.fase.value.tipo).toBe('collego')
        await attesa(); await attesa(); await attesa()
        expect(f.inviati[0].m).toMatchObject({ t: 'pair.hello', nome: 'Pad di Nino', piattaforma: 'android' })
        const codice = await codiceDiAccoppiamento('pc-uno', 'tel-uno', GETTONE)
        f.emetti('remoto-messaggio', { canale: 'c1', json: JSON.stringify({ v: 1, t: 'pair.code', codice, pc: { id: 'pc-uno', nome: 'Studio' } }) })
        await attesa()
        expect(c.fase.value).toEqual({ tipo: 'conferma', codice, pc: { id: 'pc-uno', nome: 'Studio' } })
        f.emetti('remoto-messaggio', { canale: 'c1', json: JSON.stringify({ v: 1, t: 'pair.ok', pc: { nome: 'Studio', programma: 'TALOS desktop' } }) })
        await fine
        expect(c.fase.value).toMatchObject({ tipo: 'fatto', pc: { pcId: 'pc-uno', nome: 'Studio' } })
        expect(f.plugin.elenco).toHaveBeenCalled()
    })

    it('RCM-03 un rifiuto diventa la fase d\'errore col suo codice; «Annulla» torna a inattivo senza errore', async () => {
        const f = pluginFinto()
        const c = creaComputerRemoti(f.plugin, { ora: () => 1_900_000_000_000 })
        const fine = c.accoppia(QR)
        await attesa(); await attesa(); await attesa()
        f.emetti('remoto-messaggio', { canale: 'c1', json: JSON.stringify({ v: 1, t: 'error', code: 'PAIR_REJECTED' }) })
        await fine
        expect(c.fase.value).toEqual({ tipo: 'errore', code: 'PAIR_REJECTED' })

        const g = pluginFinto()
        const d = creaComputerRemoti(g.plugin, { ora: () => 1_900_000_000_000 })
        const altro = d.accoppia(QR)
        await attesa(); await attesa(); await attesa()
        await d.annulla()
        await altro
        expect(d.fase.value).toEqual({ tipo: 'inattivo' })
    })

    it('RCM-04 controlla: collega, ping, percorso, chiude ⇒ in linea, diretto, ms', async () => {
        const f = pluginFinto()
        const c = creaComputerRemoti(f.plugin)
        await expect(c.controlla('pc-uno')).resolves.toEqual({ inLinea: true, percorso: 'diretto', rttMs: 11 })
        expect(f.inviati.some((x) => x.canale === 'c2' && x.m.t === 'ping')).toBe(true)
        expect(f.plugin.chiudi).toHaveBeenCalledWith({ canale: 'c2' })
    })

    it('RCM-05 controlla quando il PC non risponde ⇒ non in linea col codice (mai un\'eccezione a schermo)', async () => {
        const f = pluginFinto()
        f.plugin.collega = vi.fn(async () => { throw Object.assign(new Error('x'), { code: 'CONNECT_FAILED' }) })
        const c = creaComputerRemoti(f.plugin)
        await expect(c.controlla('pc-uno')).resolves.toEqual({ inLinea: false, code: 'CONNECT_FAILED' })
    })

    it('RCM-07 un PC che non risponde al ping: entro il tetto «non in linea», e il canale si chiude', async () => {
        vi.useFakeTimers()
        try {
            const f = pluginFinto()
            f.plugin.invia = vi.fn(async () => {}) // nessun pong
            const c = creaComputerRemoti(f.plugin)
            const esito = c.controlla('pc-uno')
            await vi.advanceTimersByTimeAsync(10_000)
            await expect(esito).resolves.toEqual({ inLinea: false, code: 'DISCONNECTED' })
            expect(f.plugin.chiudi).toHaveBeenCalledWith({ canale: 'c2' })
        } finally {
            vi.useRealTimers()
        }
    })

    /**
     * ⛔ Dal Pad, 20/10/2026: il primo controllo dopo l'accoppiamento ha detto «non si raggiunge» dopo ~20 s, e il tentativo
     * successivo è riuscito in 0,7 s (relay n0). Intermittente, non riprodotto: un fallimento di rete si ritenta UNA volta.
     */
    it('RCM-08 un collegamento fallito per rete si ritenta una volta; un rifiuto del PC no', async () => {
        const f = pluginFinto()
        let volte = 0
        f.plugin.collega = vi.fn(async () => {
            volte += 1
            if (volte === 1) throw Object.assign(new Error('x'), { code: 'CONNECT_FAILED' })
            return { canale: 'c2' }
        })
        const c = creaComputerRemoti(f.plugin)
        await expect(c.controlla('pc-uno')).resolves.toEqual({ inLinea: true, percorso: 'diretto', rttMs: 11 })
        expect(f.plugin.collega).toHaveBeenCalledTimes(2)

        const g = pluginFinto()
        g.plugin.collega = vi.fn(async () => { throw Object.assign(new Error('x'), { code: 'NOT_PAIRED' }) })
        const d = creaComputerRemoti(g.plugin)
        await expect(d.controlla('pc-uno')).resolves.toEqual({ inLinea: false, code: 'NOT_PAIRED' })
        expect(g.plugin.collega).toHaveBeenCalledTimes(1)
    })

    /**
     * Mockup v5 / contratto §12: «Dimentica» cancella dal telefono le chiavi di quel PC, e il PC lo segna «revocato dal telefono»
     * (`index.mjs` di r4 `aeab15222`: `pc.forget` sul canale di lavoro ⇒ `{dimenticato:true}`, poi il PC chiude). Il PC prima, se
     * risponde; le chiavi si cancellano comunque. Dal Pad, 20/10/2026: prima il PC non ne sapeva niente.
     */
    it('RCM-09 dimentica: avvisa il PC con pc.forget, poi cancella; a PC spento cancella lo stesso e lo dice', async () => {
        const f = pluginFinto()
        f.plugin.invia = vi.fn(async ({ canale, json }) => {
            const m = JSON.parse(json)
            f.inviati.push({ canale, m })
            if (m.t === 'req' && m.op === 'pc.forget') {
                queueMicrotask(() => f.emetti('remoto-messaggio', { canale, json: JSON.stringify({ v: 1, t: 'res', n: m.n, ok: true, data: { dimenticato: true } }) }))
            }
        })
        const c = creaComputerRemoti(f.plugin)
        await expect(c.dimentica('pc-uno')).resolves.toEqual({ avvisato: true })
        expect(f.inviati.some((x) => x.m.op === 'pc.forget')).toBe(true)
        expect(f.plugin.dimentica).toHaveBeenCalledWith({ pcId: 'pc-uno' })

        const g = pluginFinto()
        g.plugin.collega = vi.fn(async () => { throw Object.assign(new Error('x'), { code: 'CONNECT_FAILED' }) })
        const d = creaComputerRemoti(g.plugin)
        await expect(d.dimentica('pc-uno')).resolves.toEqual({ avvisato: false })
        expect(g.plugin.dimentica).toHaveBeenCalledWith({ pcId: 'pc-uno' })
    })

    it('RCM-12 D-RM4-10 (Pad, 21/10): a PC spento «Dimentica» non aspetta i due collegamenti da 30 s: entro il tetto cancella e lo dice', async () => {
        vi.useFakeTimers()
        try {
            const f = pluginFinto()
            f.plugin.collega = vi.fn(() => new Promise<never>(() => undefined)) // il PC spento: il nativo non risponde per 30 s
            const c = creaComputerRemoti(f.plugin)
            const esito = c.dimentica('pc-uno')
            await vi.advanceTimersByTimeAsync(10_000)
            await expect(esito).resolves.toEqual({ avvisato: false })
            expect(f.plugin.dimentica).toHaveBeenCalledWith({ pcId: 'pc-uno' })
        } finally {
            vi.useRealTimers()
        }
    })

    it('RCM-10 le sessioni del PC: sessions.list sul ponte, righe del Codice; il canale si chiude; un guasto torna col codice', async () => {
        const f = pluginFinto()
        f.plugin.invia = vi.fn(async ({ canale, json }) => {
            const m = JSON.parse(json)
            f.inviati.push({ canale, m })
            if (m.t === 'req' && m.op === 'sessions.list') {
                const data = { items: [{ sessionId: 's1', nome: 'Sito', avviataAlle: '2026-10-20T18:00:00.000Z' }] } // la forma vera di r4 (`elencoSessioniR4.ts`)
                queueMicrotask(() => f.emetti('remoto-messaggio', { canale, json: JSON.stringify({ v: 1, t: 'res', n: m.n, ok: true, data }) }))
            }
        })
        const c = creaComputerRemoti(f.plugin)
        const esito = await c.sessioni('pc-uno')
        expect(esito.ok).toBe(true)
        expect(esito.ok && esito.righe.map((r) => [r.id, r.title])).toEqual([['s1', 'Sito']])
        expect(f.plugin.chiudi).toHaveBeenCalledWith({ canale: 'c2' })

        const g = pluginFinto()
        g.plugin.collega = vi.fn(async () => { throw Object.assign(new Error('x'), { code: 'NOT_PAIRED' }) })
        await expect(creaComputerRemoti(g.plugin).sessioni('pc-uno')).resolves.toEqual({ ok: false, code: 'NOT_PAIRED' })
    })

    it('RCM-11 R-M4 Q2: le cartelle ammesse del PC (projects.list), solo id e nome validi; il canale si chiude; un guasto torna col codice', async () => {
        const f = pluginFinto()
        f.plugin.invia = vi.fn(async ({ canale, json }) => {
            const m = JSON.parse(json)
            f.inviati.push({ canale, m })
            if (m.t === 'req' && m.op === 'projects.list') {
                // la forma vera di r4 (`custom-task.mjs:84`): id e nome; una voce storta non arriva alla schermata
                const data = { items: [{ id: 'r4-remoto', nome: 'r4 remoto' }, { id: '../su', nome: 'x' }, { id: 'senza-nome' }] }
                queueMicrotask(() => f.emetti('remoto-messaggio', { canale, json: JSON.stringify({ v: 1, t: 'res', n: m.n, ok: true, data }) }))
            }
        })
        const esito = await creaComputerRemoti(f.plugin).cartelle('pc-uno')
        expect(esito).toEqual({ ok: true, cartelle: [{ id: 'r4-remoto', nome: 'r4 remoto' }] })
        expect(f.inviati.some((x) => x.m.op === 'projects.list')).toBe(true)
        expect(f.plugin.chiudi).toHaveBeenCalledWith({ canale: 'c2' })

        const g = pluginFinto()
        g.plugin.collega = vi.fn(async () => { throw Object.assign(new Error('x'), { code: 'NOT_PAIRED' }) })
        await expect(creaComputerRemoti(g.plugin).cartelle('pc-uno')).resolves.toEqual({ ok: false, code: 'NOT_PAIRED' })
    })

    it('RCM-06 dimentica: plugin, poi l\'elenco si rilegge', async () => {
        const f = pluginFinto()
        const c = creaComputerRemoti(f.plugin)
        await c.dimentica('pc-uno')
        expect(f.plugin.dimentica).toHaveBeenCalledWith({ pcId: 'pc-uno' })
        expect(f.plugin.elenco).toHaveBeenCalled()
    })
})

describe('il trasporto sopra il canale nativo', () => {
    it('TNA-01 invia JSON sul suo canale; riceve solo i messaggi e la chiusura del suo canale', async () => {
        const f = pluginFinto()
        const t = await trasportoNativo(f.plugin, 'c2')
        const visti: unknown[] = []
        const chiusi: string[] = []
        t.onMessaggio((m) => visti.push(m))
        t.onChiuso((motivo) => chiusi.push(motivo))
        await t.invia({ v: 1, t: 'req', n: 'abcdefgh', op: 'x', args: {} })
        expect(f.inviati.at(-1)).toEqual({ canale: 'c2', m: { v: 1, t: 'req', n: 'abcdefgh', op: 'x', args: {} } })
        f.emetti('remoto-messaggio', { canale: 'altro', json: '{"v":1,"t":"evt"}' })
        f.emetti('remoto-messaggio', { canale: 'c2', json: '{"v":1,"t":"evt"}' })
        f.emetti('remoto-messaggio', { canale: 'c2', json: 'non json' })
        f.emetti('remoto-chiuso', { canale: 'altro', motivo: 'ENDED' })
        f.emetti('remoto-chiuso', { canale: 'c2', motivo: 'REVOKED' })
        // il PC finto risponde anche alla richiesta inviata qui sopra: si guardano gli eventi
        expect(visti.filter((m) => (m as { t?: string }).t === 'evt')).toEqual([{ v: 1, t: 'evt' }])
        expect(chiusi).toEqual(['REVOKED'])
        await t.smonta()
        expect([...f.ascolti.values()].every((s) => s.size === 0)).toBe(true)
    })
})

describe('le frasi degli errori del controllo remoto', () => {
    it('FRR-01 ogni codice ha la sua frase; Annulla non ne ha; uno sconosciuto ha quella generica', () => {
        for (const code of ['PAIR_REJECTED', 'PAIR_EXPIRED', 'PAIR_TOKEN_INVALID', 'PAIR_LOCKED', 'CODE_MISMATCH', 'REVOKED', 'NOT_PAIRED',
            'CONNECT_FAILED', 'DISCONNECTED', 'BAD_MESSAGE', 'SCANNER_UNAVAILABLE']) {
            expect(fraseErroreRemoto(code), code).toMatch(/^computer\.errors\.[a-zA-Z]+$/u)
        }
        expect(new Set(['PAIR_REJECTED', 'PAIR_EXPIRED', 'CODE_MISMATCH'].map(fraseErroreRemoto)).size).toBe(3)
        expect(fraseErroreRemoto('CANCELLED')).toBeNull()
        expect(fraseErroreRemoto('QUALCOSA')).toBe('computer.errors.generic')
    })
})
