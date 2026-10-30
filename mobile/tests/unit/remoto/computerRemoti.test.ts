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

    /*
     * ⛔ D-0147-NAV-1 (Pad, 27/10/2026, vc303, accoppiato a un PC col QR senza `relay=`): `JSObject.put("relay", null)` di Android TOGLIE
     * la chiave, quindi la voce arrivava senza `relay` (undefined, non null) e `ponteDi` faceva `undefined.trim()`: la sezione Computer
     * e il Codice restavano vuoti. Al confine col nativo ogni voce prende la sua forma: `relay` e `nome` sono testo o null, mai assenti.
     */
    it('RCM-01b una voce del nativo senza `relay` né `nome` (chiavi tolte da Android) diventa relay null e nome null', async () => {
        const f = pluginFinto()
        f.plugin.elenco = vi.fn(async () => ({ computer: [{ pcId: 'pc-due', accoppiatoAlle: 1_760_000_000_000 } as never] }))
        const c = creaComputerRemoti(f.plugin)
        await c.aggiorna()
        expect(c.elenco.value).toEqual([{ pcId: 'pc-due', nome: null, relay: null, accoppiatoAlle: 1_760_000_000_000 }])
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

    /* Revisione del blocco 3 (S3), owner 24/10 «Sì, uguali alle locali»: rinomina ed elimina una sessione del PC dalla lista del Codice. */
    it('RCM-13 rinomina ed elimina sul ponte (session.rename, session.delete); il canale si chiude; un rifiuto del PC risale col suo codice', async () => {
        const f = pluginFinto()
        const richieste: Array<{ op: string, args: unknown }> = []
        f.plugin.invia = vi.fn(async ({ canale, json }) => {
            const m = JSON.parse(json)
            f.inviati.push({ canale, m })
            if (m.t !== 'req') return
            richieste.push({ op: m.op, args: m.args })
            const risposta = m.args?.sessionId === 'negata'
                ? { v: 1, t: 'res', n: m.n, ok: false, code: 'CONSENT_REQUIRED', message: 'The computer must allow this device to write in this folder.',
                    reason: 'consent-required', params: { cartellaId: 'c-1', nome: 'talos' } }
                : { v: 1, t: 'res', n: m.n, ok: true, data: {} }
            queueMicrotask(() => f.emetti('remoto-messaggio', { canale, json: JSON.stringify(risposta) }))
        })
        const c = creaComputerRemoti(f.plugin)
        await c.rinominaSessione('pc-uno', 's1', 'Sito nuovo')
        await c.eliminaSessione('pc-uno', 's1')
        expect(richieste).toEqual([
            { op: 'session.rename', args: { sessionId: 's1', corpo: { nome: 'Sito nuovo' } } },
            { op: 'session.delete', args: { sessionId: 's1', corpo: {} } },
        ])
        expect((f.plugin.chiudi as ReturnType<typeof vi.fn>).mock.calls.filter(([a]) => a.canale === 'c2')).toHaveLength(2)
        // D-MOCK-11: il rifiuto porta la cartella da chiedere fino alla lista («Chiedi al PC»)
        await expect(c.eliminaSessione('pc-uno', 'negata')).rejects.toMatchObject({ code: 'CONSENT_REQUIRED', params: { cartellaId: 'c-1', nome: 'talos' } })
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
        // D-MOCK-12: una forma sola; un PC vecchio dà l'allowlist, che vale come consentita (contratto, parte 1, punto 1)
        expect(esito).toEqual({ ok: true, cartelle: [{ id: 'r4-remoto', nome: 'r4 remoto', dettaglio: null, usataAlle: null, consentita: true, bloccata: false }] })
        expect(f.inviati.some((x) => x.m.op === 'projects.list')).toBe(true)
        expect(f.plugin.chiudi).toHaveBeenCalledWith({ canale: 'c2' })

        const g = pluginFinto()
        g.plugin.collega = vi.fn(async () => { throw Object.assign(new Error('x'), { code: 'NOT_PAIRED' }) })
        await expect(creaComputerRemoti(g.plugin).cartelle('pc-uno')).resolves.toEqual({ ok: false, code: 'NOT_PAIRED' })
    })

    /** Un PC finto che risponde a `op` con `data` (o col rifiuto `{code, params}`); le altre richieste con `{}`. */
    function pcCheRisponde(risposte: Record<string, (args: Record<string, unknown>) => { data?: unknown, code?: string, params?: unknown }>) {
        const f = pluginFinto()
        f.plugin.invia = vi.fn(async ({ canale, json }) => {
            const m = JSON.parse(json)
            f.inviati.push({ canale, m })
            if (m.t !== 'req') return
            const r = risposte[m.op]?.(m.args) ?? { data: {} }
            const res = r.code ? { v: 1, t: 'res', n: m.n, ok: false, code: r.code, message: r.code, ...(r.params ? { params: r.params } : {}) }
                : { v: 1, t: 'res', n: m.n, ok: true, data: r.data }
            queueMicrotask(() => f.emetti('remoto-messaggio', { canale, json: JSON.stringify(res) }))
        })
        return f
    }

    it('CART-R512-01 D-MOCK-12: un PC r5-12 manda `cartellaId`, `consentita`, `usataAlle`, `dettaglio`: il dispositivo li vede tutti', async () => {
        const f = pcCheRisponde({ 'projects.list': () => ({ data: { items: [
            { cartellaId: 'Ab3_x-9QkLmN0pQrStUvWxYz12345678', nome: 'talos', dettaglio: 'progetti', usataAlle: '2026-10-24T09:00:00.000Z', consentita: true },
            { cartellaId: 'Zz9_y-8PjKlM1oPqRsTuVwXy87654321', nome: 'talos', dettaglio: 'vecchi', usataAlle: '2026-10-20T09:00:00.000Z', consentita: false },
            { cartellaId: 'Qq1_w-7OiJkL2nOpQrStUvWx11223344', nome: 'note', usataAlle: '2026-10-19T09:00:00.000Z', consentita: false },
        ] } }) })
        await expect(creaComputerRemoti(f.plugin).cartelle('pc-uno')).resolves.toEqual({ ok: true, cartelle: [
            { id: 'Ab3_x-9QkLmN0pQrStUvWxYz12345678', nome: 'talos', dettaglio: 'progetti', usataAlle: '2026-10-24T09:00:00.000Z', consentita: true, bloccata: false },
            { id: 'Zz9_y-8PjKlM1oPqRsTuVwXy87654321', nome: 'talos', dettaglio: 'vecchi', usataAlle: '2026-10-20T09:00:00.000Z', consentita: false, bloccata: false },
            { id: 'Qq1_w-7OiJkL2nOpQrStUvWx11223344', nome: 'note', dettaglio: null, usataAlle: '2026-10-19T09:00:00.000Z', consentita: false, bloccata: false },
        ] })
    })

    it('CART-R512-02 un id fuori dalla regola del PC non passa, né come `cartellaId` né come `id`; `consentita` non vera resta falsa', async () => {
        const f = pcCheRisponde({ 'projects.list': () => ({ data: { items: [
            { cartellaId: '../su', nome: 'x', consentita: true },
            { cartellaId: 'ok-1', nome: 'buona', consentita: 'sì', dettaglio: 7, usataAlle: 12 },
            { id: '..', nome: 'punti' },
            { cartellaId: 'ok-2', nome: '   ' },
        ] } }) })
        await expect(creaComputerRemoti(f.plugin).cartelle('pc-uno')).resolves.toEqual({ ok: true, cartelle: [
            { id: 'ok-1', nome: 'buona', dettaglio: null, usataAlle: null, consentita: false, bloccata: false },
        ] })
    })

    /*
     * Cartelle bloccate (owner 27/10/2026, contratto del Desktop rev.1): una cartella tolta a questo dispositivo ma ancora raggiungibile da
     * un'altra consentita diventa BLOCCATA, e il divieto vince. `projects.list` la manda con `consentita: false, bloccata: true`.
     */
    it('CART-BLOC-01 una riga `bloccata: true` arriva bloccata e mai consentita (il divieto vince); un PC più vecchio non blocca niente', async () => {
        const f = pcCheRisponde({ 'projects.list': () => ({ data: { items: [
            { cartellaId: 'blocco-1', nome: 'Documenti', dettaglio: 'Utenti', consentita: false, bloccata: true },
            { cartellaId: 'blocco-2', nome: 'storta', consentita: true, bloccata: true },
            { cartellaId: 'libera-1', nome: 'Utenti', consentita: true, bloccata: 'sì' },
            { id: 'vecchia-1', nome: 'allowlist' },
        ] } }) })
        await expect(creaComputerRemoti(f.plugin).cartelle('pc-uno')).resolves.toEqual({ ok: true, cartelle: [
            { id: 'blocco-1', nome: 'Documenti', dettaglio: 'Utenti', usataAlle: null, consentita: false, bloccata: true },
            { id: 'blocco-2', nome: 'storta', dettaglio: null, usataAlle: null, consentita: false, bloccata: true },
            { id: 'libera-1', nome: 'Utenti', dettaglio: null, usataAlle: null, consentita: true, bloccata: false },
            { id: 'vecchia-1', nome: 'allowlist', dettaglio: null, usataAlle: null, consentita: true, bloccata: false },
        ] })
    })

    it('CONS-DISP-05 «Chiedi al PC» da una riga del PC: `consent.request`, l\'attesa, poi l\'esito; il canale si chiude sempre', async () => {
        let attese = 0
        const f = pcCheRisponde({
            'consent.request': (a) => ({ data: { stato: 'attesa-consenso', richiestaId: `rq-${String(a.cartellaId)}-0001`, scadeAlle: '2026-10-24T10:02:00.000Z', attesaMs: 120_000 } }),
            'consent.wait': () => ({ data: ++attese < 2 ? { stato: 'attesa' } : { esito: 'consentita' } }),
        })
        const viste: unknown[] = []
        const esito = await creaComputerRemoti(f.plugin, { ora: () => 1_000 }).chiediConsensoAlPc('pc-uno', 'cart-1', { inAttesa: (a) => viste.push(a) })
        expect(esito).toEqual({ esito: 'consentita', sessionId: null })
        expect(viste).toEqual([{ richiestaId: 'rq-cart-1-0001', scadeAlle: 121_000 }])
        expect(f.inviati.filter((x) => x.m.t === 'req').map((x) => [x.m.op, x.m.args])).toEqual([
            ['consent.request', { cartellaId: 'cart-1' }], ['consent.wait', { richiestaId: 'rq-cart-1-0001' }], ['consent.wait', { richiestaId: 'rq-cart-1-0001' }],
        ])
        expect(f.plugin.chiudi).toHaveBeenCalled()

        const g = pcCheRisponde({ 'consent.request': () => ({ code: 'RATE_LIMITED' }) })
        await expect(creaComputerRemoti(g.plugin).chiediConsensoAlPc('pc-uno', 'cart-1')).resolves.toEqual({ esito: 'errore', code: 'RATE_LIMITED' })
        expect(g.plugin.chiudi).toHaveBeenCalled()
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
        // revisione del blocco 10, F-R1: il lucchetto dei consensi del PC (503) non è un guasto del collegamento
        expect(fraseErroreRemoto('REMOTE_STORE_BUSY')).toBe('computer.errors.busy')
    })
})
