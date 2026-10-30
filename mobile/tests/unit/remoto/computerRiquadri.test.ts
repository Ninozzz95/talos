// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import type { PluginComputer } from '@/lib/remoto/computerRemoti'

/**
 * Mockup remoto approvato dall'owner il 23/10, tavola 1 (`MOCKUP-COMPUTER-E-SESSIONI-REMOTE-2026-10-23-v2.html`): un riquadro per
 * PC, il più recente in alto. A prima vista solo «In linea» o «Non in linea · visto …»; i numeri delle sessioni appena letti; di un
 * PC spento gli ultimi, in grigio, con l'ora della lettura (Desktop (3) 24/10); ⋯ con «Impostazioni» e «Dimentica»; il codice breve
 * solo quando due PC hanno lo stesso nome; «Apri le sessioni nel Codice» porta al Codice già filtrato su quel PC.
 */
vi.setConfig({ testTimeout: 30_000 })
const push = vi.fn()
let plugin: PluginComputer
let computer: Array<{ pcId: string, nome: string | null, relay: string | null, accoppiatoAlle: number }> = []
const spenti = new Set<string>()
/** PC che ha tolto il dispositivo: al collegamento risponde NOT_PAIRED (o REVOKED). */
const tolti = new Map<string, string>()
const sessioniDi: Record<string, unknown[]> = {}

vi.mock('vue-router', () => ({ useRouter: () => ({ push, replace: vi.fn(), back: vi.fn() }), useRoute: () => ({ params: {}, query: {} }) }))
vi.mock('@/i18n', () => ({
    useTalosI18n: () => ({
        t: (key: string, p?: Record<string, unknown>) => (p ? `${key}${JSON.stringify(p).replace(/\//gu, '&#x2F;')}` : key),
        tTesto: (key: string, p?: Record<string, unknown>) => (p ? `${key}${JSON.stringify(p)}` : key),
        locale: { value: 'it' },
    }),
}))
vi.mock('@/lib/remoto/pluginRemoto', () => ({ pluginRemoto: () => plugin }))
const avvisi: Array<{ title: string }> = []
vi.mock('@/stores/notificationCentre', () => ({ talosNotify: (e: { title: string }) => { avvisi.push(e) } }))

function pluginFinto(): PluginComputer {
    const ascolti = new Map<string, Set<(e: never) => void>>()
    const emetti = (evento: string, e: unknown) => { for (const cb of ascolti.get(evento) ?? []) (cb as (x: unknown) => void)(e) }
    const canali = new Map<string, string>()
    let n = 0
    return {
        accoppia: vi.fn(async () => ({ canale: 'c1', telefonoId: 't' })),
        concludiAccoppiamento: vi.fn(async () => {}),
        collega: vi.fn(async ({ pcId }: { pcId: string }) => {
            if (spenti.has(pcId)) throw Object.assign(new Error('x'), { code: 'UNREACHABLE' })
            if (tolti.has(pcId)) throw Object.assign(new Error('x'), { code: tolti.get(pcId) })
            const canale = `c-${pcId}-${++n}`
            canali.set(canale, pcId)
            return { canale }
        }),
        invia: vi.fn(async ({ canale, json }: { canale: string, json: string }) => {
            const m = JSON.parse(json)
            if (m.t === 'ping') queueMicrotask(() => emetti('remoto-messaggio', { canale, json: JSON.stringify({ v: 1, t: 'pong', s: m.s }) }))
            if (m.t !== 'req') return
            const data = m.op === 'sessions.list' ? { items: sessioniDi[canali.get(canale)!] ?? [] } : { dimenticato: true }
            queueMicrotask(() => emetti('remoto-messaggio', { canale, json: JSON.stringify({ v: 1, t: 'res', n: m.n, ok: true, data }) }))
        }),
        chiudi: vi.fn(async () => {}),
        percorso: vi.fn(async () => ({ tipo: 'diretto', rttMs: 61 })),
        elenco: vi.fn(async () => ({ computer })),
        dimentica: vi.fn(async ({ pcId }: { pcId: string }) => { computer = computer.filter((c) => c.pcId !== pcId); return { dimenticato: true } }),
        nomeDelTelefono: vi.fn(async () => ({ nome: 'Pad' })),
        scansiona: vi.fn(async () => ({ testo: '' })),
        addListener: vi.fn(async (evento: string, cb: (e: never) => void) => {
            if (!ascolti.has(evento)) ascolti.set(evento, new Set())
            ascolti.get(evento)!.add(cb)
            return { remove: async () => { ascolti.get(evento)!.delete(cb) } }
        }) as PluginComputer['addListener'],
    }
}

async function monta() {
    const { default: ComputerScreen } = await import('@/screens/ComputerScreen.vue')
    const vista = mount(ComputerScreen, { attachTo: document.body })
    await vi.waitFor(() => { if (vista.find('[data-computer-stato="leggo"]').exists()) throw new Error('ancora in lettura') })
    await flushPromises()
    return vista
}

const riquadro = (v: Awaited<ReturnType<typeof monta>>, pcId: string) => v.get(`[data-testid="talos-computer-card"][data-pc-id="${pcId}"]`)

beforeEach(() => {
    vi.clearAllMocks()
    vi.resetModules()
    localStorage.clear()
    spenti.clear()
    tolti.clear()
    for (const k of Object.keys(sessioniDi)) delete sessioniDi[k]
    document.body.innerHTML = ''
    avvisi.length = 0
    computer = []
    plugin = pluginFinto()
})

describe('Computer, tavola 1: un riquadro per PC', () => {
    it('COMP-UI-01 PC in linea: «In linea», i numeri letti, e «Apri le sessioni nel Codice» col filtro su quel PC', async () => {
        computer = [{ pcId: '31ab0001', nome: 'UFFICIO', relay: null, accoppiatoAlle: 1 }]
        sessioniDi['31ab0001'] = [
            { sessionId: 's1', nome: 'Correggi il report', avviataAlle: '2026-10-24T10:00:00.000Z', conclusa: false },
            { sessionId: 's2', nome: 'Migrazione', avviataAlle: '2026-10-24T09:00:00.000Z', conclusa: false, inAttesaApprovazione: true },
            { sessionId: 's3', nome: 'Piano', avviataAlle: '2026-10-23T09:00:00.000Z', conclusa: true },
        ]
        const v = await monta()
        const r = riquadro(v, '31ab0001')
        expect(r.text()).toContain('UFFICIO')
        expect(r.get('[data-testid="talos-computer-card-status"]').text()).toContain('computer.online')
        const numeri = r.get('[data-testid="talos-computer-card-counts"]')
        expect(numeri.text()).toContain('computer.sessionsCount{"count":3}')
        expect(numeri.text()).toContain('computer.runningCount{"count":1}')
        expect(numeri.text()).toContain('computer.waitingCount{"count":1}')
        expect(numeri.attributes('data-vecchi')).toBeUndefined()
        // percorso e millisecondi stanno nelle Impostazioni, non a prima vista
        expect(r.text()).not.toContain('61')
        await r.get('[data-testid="talos-computer-open-codice"]').trigger('click')
        expect(push).toHaveBeenCalledWith({ name: 'harness', query: { dove: '31ab0001' } })
    })

    it('COMP-UI-02 PC spento: «Non in linea · visto …» e gli ultimi numeri in grigio con l\'ora della lettura', async () => {
        computer = [{ pcId: 'aa000001', nome: 'PORTATILE', relay: null, accoppiatoAlle: 1 }]
        sessioniDi.aa000001 = [{ sessionId: 's1', nome: 'x', avviataAlle: '2026-10-23T09:00:00.000Z', conclusa: true }]
        let v = await monta()
        expect(riquadro(v, 'aa000001').get('[data-testid="talos-computer-card-status"]').text()).toContain('computer.online')
        v.unmount()
        vi.resetModules()
        spenti.add('aa000001')
        v = await monta()
        const r = riquadro(v, 'aa000001')
        expect(r.get('[data-testid="talos-computer-card-status"]').text()).toContain('computer.offlineSeen')
        const numeri = r.get('[data-testid="talos-computer-card-counts"]')
        expect(numeri.attributes('data-vecchi')).toBe('true')
        expect(numeri.text()).toContain('computer.sessionsCount{"count":1}')
        expect(numeri.text()).toContain('computer.countsAt')
    })

    /*
     * ⛔ Owner 27/10/2026 (via Desktop): un PC che ha tolto questo dispositivo lo dice. Il telefono lo sa solo al collegamento dopo
     * (NOT_PAIRED o REVOKED: alla revoca non c'è un canale aperto): «Tolto dal computer», sotto la frase `notPaired`, e l'azione
     * principale è «Dimentica»; «Apri le sessioni nel Codice» non c'è. Spento o irraggiungibile resta «Non in linea».
     */
    it('COMP-UI-08 PC che ha tolto il dispositivo: «Tolto dal computer», la frase e «Dimentica»; ⛔ spento resta «Non in linea»', async () => {
        computer = [
            { pcId: 'cc000001', nome: 'UFFICIO', relay: null, accoppiatoAlle: 2 },
            { pcId: 'cc000002', nome: 'CASA', relay: null, accoppiatoAlle: 1 },
            { pcId: 'cc000003', nome: 'STUDIO', relay: null, accoppiatoAlle: 3 },
        ]
        tolti.set('cc000001', 'NOT_PAIRED')
        tolti.set('cc000003', 'REVOKED')
        spenti.add('cc000002')
        const v = await monta()
        for (const pcId of ['cc000001', 'cc000003']) {
            const r = riquadro(v, pcId)
            expect(r.attributes('data-computer-stato')).toBe('tolto')
            expect(r.get('[data-testid="talos-computer-card-status"]').text()).toContain('computer.removed')
            expect(r.get('[data-testid="talos-computer-removed-body"]').text()).toBe('computer.errors.notPaired')
            expect(r.find('[data-testid="talos-computer-open-codice"]').exists()).toBe(false)
            expect(r.get('[data-testid="talos-computer-forget-main"]').text()).toContain('computer.forgetConfirm')
        }
        // «Dimentica» apre la stessa conferma del ⋯
        await riquadro(v, 'cc000001').get('[data-testid="talos-computer-forget-main"]').trigger('click')
        await flushPromises()
        expect(document.querySelector('[data-testid="talos-computer-forget-confirm"]')).not.toBeNull()
        // ⛔ verso contrario: spento è «Non in linea», con «Apri le sessioni nel Codice»
        const spento = riquadro(v, 'cc000002')
        expect(spento.attributes('data-computer-stato')).toBe('nonInLinea')
        expect(spento.get('[data-testid="talos-computer-card-status"]').text()).toContain('computer.offline')
        expect(spento.find('[data-testid="talos-computer-forget-main"]').exists()).toBe(false)
        expect(spento.find('[data-testid="talos-computer-open-codice"]').exists()).toBe(true)
    })

    /*
     * Revisione del Desktop, 27/10/2026 (b): per un PC che ha GIÀ tolto il dispositivo «non potrà più comandarlo» è vero ma ridondante.
     * La conferma dice solo «Lo togli anche da questo dispositivo»; per gli altri PC resta la frase di prima.
     */
    it('COMP-UI-09 «Dimentica» di un PC che ha tolto il dispositivo: la frase sua; ⛔ un PC spento tiene quella di prima', async () => {
        computer = [
            { pcId: 'cc000001', nome: 'UFFICIO', relay: null, accoppiatoAlle: 2 },
            { pcId: 'cc000002', nome: 'CASA', relay: null, accoppiatoAlle: 1 },
        ]
        tolti.set('cc000001', 'REVOKED')
        spenti.add('cc000002')
        const v = await monta()
        const testoDellaConferma = () => document.body.querySelector<HTMLElement>('[data-testid="talos-computer-forget-confirm"]')
            ?.closest<HTMLElement>('[role="dialog"],[role="alertdialog"]')?.textContent ?? ''
        await riquadro(v, 'cc000001').get('[data-testid="talos-computer-forget-main"]').trigger('click')
        await flushPromises()
        expect(testoDellaConferma()).toContain('computer.forgetRemovedBody')
        expect(testoDellaConferma()).not.toContain('computer.forgetBody')
        document.body.querySelector<HTMLElement>('[data-testid="talos-computer-forget-cancel"]')!.click()
        await flushPromises()
        await riquadro(v, 'cc000002').get('[data-testid="talos-computer-actions-cc000002"]').trigger('click')
        await flushPromises()
        document.body.querySelector<HTMLElement>('[data-testid="talos-computer-action-forget"]')!.click()
        await flushPromises()
        expect(testoDellaConferma()).toContain('computer.forgetBody')
        expect(testoDellaConferma()).not.toContain('computer.forgetRemovedBody')
    }, 40_000)

    it('COMP-UI-03 PC mai visto e spento: solo «Non in linea», nessun numero inventato', async () => {
        computer = [{ pcId: 'bb000001', nome: 'CASA', relay: null, accoppiatoAlle: 1 }]
        spenti.add('bb000001')
        const v = await monta()
        const r = riquadro(v, 'bb000001')
        expect(r.get('[data-testid="talos-computer-card-status"]').text()).toContain('computer.offline')
        expect(r.get('[data-testid="talos-computer-card-status"]').text()).not.toContain('computer.offlineSeen')
        expect(r.find('[data-testid="talos-computer-card-counts"]').exists()).toBe(false)
    })

    it('COMP-UI-04 due PC con lo stesso nome mostrano il codice breve, gli altri no', async () => {
        computer = [
            { pcId: '31ab0001', nome: 'UFFICIO', relay: null, accoppiatoAlle: 2 },
            { pcId: '77cd0001', nome: 'UFFICIO', relay: null, accoppiatoAlle: 1 },
            { pcId: 'aa000001', nome: 'PORTATILE', relay: null, accoppiatoAlle: 3 },
        ]
        const v = await monta()
        expect(riquadro(v, '31ab0001').text()).toContain('UFFICIO · 31ab')
        expect(riquadro(v, '77cd0001').text()).toContain('UFFICIO · 77cd')
        expect(riquadro(v, 'aa000001').text()).not.toContain('· aa00')
    })

    it('COMP-UI-05 il più recente in alto: prima l\'ultimo visto, poi l\'ultimo collegato; l\'ordine non salta mentre si legge', async () => {
        computer = [
            { pcId: 'aa000001', nome: 'A', relay: null, accoppiatoAlle: 3 },
            { pcId: 'bb000001', nome: 'B', relay: null, accoppiatoAlle: 1 },
            { pcId: 'cc000001', nome: 'C', relay: null, accoppiatoAlle: 2 },
        ]
        const { ricordaVisto } = await import('@/lib/remoto/ricordiDelPc')
        ricordaVisto('bb000001', 5)
        // C risponde adesso, ma all'apertura era «mai visto»: non sale, resta dopo A, che è stato collegato più di recente
        spenti.add('aa000001')
        const v = await monta()
        const ordine = v.findAll('[data-testid="talos-computer-card"]').map((c) => c.attributes('data-pc-id'))
        expect(ordine).toEqual(['bb000001', 'aa000001', 'cc000001'])
    })

    it('COMP-UI-06 ⋯ «Impostazioni» apre le Impostazioni del PC; anche il nome le apre', async () => {
        computer = [{ pcId: '31ab0001', nome: 'UFFICIO', relay: null, accoppiatoAlle: 1 }]
        const v = await monta()
        const r = riquadro(v, '31ab0001')
        await r.get('[data-testid="talos-computer-card-name"]').trigger('click')
        expect(push).toHaveBeenLastCalledWith({ name: 'computer-item', params: { pcId: '31ab0001' } })
        await r.get('[data-testid="talos-computer-actions-31ab0001"]').trigger('click')
        await flushPromises()
        const voce = document.body.querySelector<HTMLElement>('[data-testid="talos-computer-action-settings"]')
        expect(voce).not.toBeNull()
        voce!.click()
        await flushPromises()
        expect(push).toHaveBeenLastCalledWith({ name: 'computer-item', params: { pcId: '31ab0001' } })
    })

    it('COMP-UI-07 ⋯ «Dimentica» chiede conferma, poi il PC sparisce e i suoi ricordi con lui', async () => {
        computer = [{ pcId: '31ab0001', nome: 'UFFICIO', relay: null, accoppiatoAlle: 1 }]
        // la sua domanda dei doppi, già fatta una volta, se ne va con lui (revisione del blocco 4, S4)
        localStorage.setItem('talos.remoto.doppi.v1', JSON.stringify(['31ab0001', 'b8510001']))
        const v = await monta()
        expect(localStorage.getItem('talos.remoto.ricordi.v1')).toContain('31ab0001')
        await riquadro(v, '31ab0001').get('[data-testid="talos-computer-actions-31ab0001"]').trigger('click')
        await flushPromises()
        document.body.querySelector<HTMLElement>('[data-testid="talos-computer-action-forget"]')!.click()
        await flushPromises()
        expect(plugin.dimentica).not.toHaveBeenCalled()
        const conferma = document.body.querySelector<HTMLElement>('[data-testid="talos-computer-forget-confirm"]')
        expect(conferma).not.toBeNull()
        conferma!.click()
        await vi.waitFor(() => { if (!(plugin.dimentica as ReturnType<typeof vi.fn>).mock.calls.length) throw new Error('non ancora') })
        await flushPromises()
        expect(v.find('[data-testid="talos-computer-card"]').exists()).toBe(false)
        expect(localStorage.getItem('talos.remoto.ricordi.v1') ?? '').not.toContain('31ab0001')
        expect(JSON.parse(localStorage.getItem('talos.remoto.doppi.v1') ?? '[]')).toEqual(['b8510001'])
    })

    /* D-MOCK-8 (vc181, foto 172): due voci «DESKTOP-ESEMPIO» dimenticate a PC spento davano due notifiche identiche. Il titolo dice
       QUALE PC: nome e codice breve, sempre, perché la notifica resta anche quando la voce è già uscita dall'elenco. */
    it('DIM-NOT-01 ⋯ «Dimentica» a PC spento: la notifica nomina il PC col codice breve, anche senza un doppio in elenco', async () => {
        computer = [
            { pcId: '65fe0001', nome: 'UFFICIO', relay: null, accoppiatoAlle: 2 },
            { pcId: 'b8510001', nome: 'CASA', relay: null, accoppiatoAlle: 1 },
        ]
        spenti.add('65fe0001')
        const v = await monta()
        await riquadro(v, '65fe0001').get('[data-testid="talos-computer-actions-65fe0001"]').trigger('click')
        await flushPromises()
        document.body.querySelector<HTMLElement>('[data-testid="talos-computer-action-forget"]')!.click()
        await flushPromises()
        document.body.querySelector<HTMLElement>('[data-testid="talos-computer-forget-confirm"]')!.click()
        await vi.waitFor(() => { if (!avvisi.length) throw new Error('nessun avviso') }, { timeout: 15_000 })
        expect(avvisi.map((a) => a.title)).toEqual(['computer.forgetOffline{"name":"UFFICIO · 65fe"}'])
    }, 40_000)

    /* Fetta C, risposta 1 del Desktop (3) 24/10: la stessa domanda UNA volta anche qui, quando accanto a un PC in linea ci sono voci
       spente col suo nome e il suo ponte. Le spente si dimenticano solo sul dispositivo (risposta 2: niente `pc.forget`). */
    it('DOPPI-UI-04 voci spente accanto al PC in linea con lo stesso nome: proposta una volta, «Sì» le dimentica solo qui', async () => {
        computer = [
            { pcId: 'b8510001', nome: 'UFFICIO', relay: null, accoppiatoAlle: 3 },
            { pcId: '31ab0001', nome: 'UFFICIO', relay: null, accoppiatoAlle: 1 },
            { pcId: '65fe0001', nome: 'UFFICIO', relay: null, accoppiatoAlle: 2 },
        ]
        spenti.add('31ab0001')
        spenti.add('65fe0001')
        // una voce che aveva già proposto una volta: dimenticata solo qui, la sua domanda se ne va con lei (revisione del blocco 4, S4)
        localStorage.setItem('talos.remoto.doppi.v1', JSON.stringify(['31ab0001']))
        const v = await monta()
        const proposta = v.get('[data-testid="talos-computer-old-entries"]')
        expect(proposta.text()).toContain('computer.oldEntriesTitle{"count":2,"name":"UFFICIO"}')
        const colleghiPrima = (plugin.collega as ReturnType<typeof vi.fn>).mock.calls.length
        await proposta.get('[data-testid="talos-computer-old-entries-yes"]').trigger('click')
        await vi.waitFor(() => { if ((plugin.dimentica as ReturnType<typeof vi.fn>).mock.calls.length < 2) throw new Error('non ancora') })
        // solo sul dispositivo: nessuna voce si bussa col `pc.forget`. Revisione del blocco 4, M-1: al «Sì» ogni voce si rilegge
        // (`riepilogo`), quindi i collegamenti nuovi ci sono e non si contano più; si guarda lo scopo vero della riga
        const richieste = (plugin.invia as ReturnType<typeof vi.fn>).mock.calls.map((c) => JSON.parse(c[0].json)).filter((m) => m.t === 'req')
        expect(richieste.map((m) => m.op)).not.toContain('pc.forget')
        // ⛔ e nessun tentativo di bussare: a voce spenta il `collega` fallisce prima, e un `pc.forget` non arriverebbe mai a `invia`.
        // Al «Sì» ogni voce spenta si collega UNA volta, per il ricontrollo; una seconda sarebbe il `pc.forget` di `dimentica`
        const colleghiDopo = (plugin.collega as ReturnType<typeof vi.fn>).mock.calls.slice(colleghiPrima).map((c) => c[0].pcId)
        expect(colleghiDopo.filter((id) => id === '31ab0001')).toHaveLength(1)
        expect(colleghiDopo.filter((id) => id === '65fe0001')).toHaveLength(1)
        await flushPromises()
        expect(v.find('[data-testid="talos-computer-old-entries"]').exists()).toBe(false)
        expect(v.findAll('[data-testid="talos-computer-card"]').map((c) => c.attributes('data-pc-id'))).toEqual(['b8510001'])
        expect(JSON.parse(localStorage.getItem('talos.remoto.doppi.v1') ?? '[]')).toEqual(['b8510001'])
    })

    it('DOPPI-UI-05 ⛔ verso contrario: «No» e la domanda non torna; voci col nome uguale ma IN LINEA non si propongono', async () => {
        computer = [
            { pcId: 'b8510001', nome: 'UFFICIO', relay: null, accoppiatoAlle: 3 },
            { pcId: '31ab0001', nome: 'UFFICIO', relay: null, accoppiatoAlle: 1 },
        ]
        // due PC vivi col nome uguale (il desktop e la CLI sullo stesso PC): nessuna proposta
        let v = await monta()
        expect(v.find('[data-testid="talos-computer-old-entries"]').exists()).toBe(false)
        v.unmount()
        vi.resetModules()
        spenti.add('31ab0001')
        v = await monta()
        await v.get('[data-testid="talos-computer-old-entries-no"]').trigger('click')
        await flushPromises()
        expect(plugin.dimentica).not.toHaveBeenCalled()
        expect(v.find('[data-testid="talos-computer-old-entries"]').exists()).toBe(false)
        v.unmount()
        vi.resetModules()
        v = await monta()
        expect(v.find('[data-testid="talos-computer-old-entries"]').exists()).toBe(false)
    })
})
