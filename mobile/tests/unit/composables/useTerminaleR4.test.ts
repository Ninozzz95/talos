import { describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { flushPromises } from '@vue/test-utils'
import { useTerminaleR4, type ClienteTerminaleR4 } from '@/composables/useTerminaleR4'

/*
 * ⛔ K3-TERM T3 (ledger `LEDGER-K3-TERMINALE-2026-10-16.md`): le schede del Terminale di una sessione e il loro collegamento al ponte
 * nativo (`TalosR4Cliente.apriTerminale` e gli eventi `r4Term*`, T2). Risposte e frame veri di r4 @ 2161afb32 registrati sul Pad.
 */
const registrato = JSON.parse(readFileSync(resolve(__dirname, '..', '..', 'fixtures', 'r4', 'terminale-2161afb32.json'), 'utf8'))
const passo = (nome: string) => registrato.passi.find((p: { nome: string }) => p.nome === nome)
const UNO = '11111111-1111-4111-8111-111111111111'
const DUE = '22222222-2222-4222-8222-222222222222'
const SESSIONE = UNO

function clienteFinto(risposte: Record<string, Array<{ stato: number; risposta: unknown }>> = {}) {
    const ascoltatori = new Map<string, Set<(e: Record<string, unknown>) => void>>()
    const chiamate: Array<[string, Record<string, unknown>]> = []
    const cliente: ClienteTerminaleR4 = {
        richiesta: vi.fn(async (o) => {
            chiamate.push(['richiesta', o])
            const chiave = `${o.metodo} ${o.percorso}`
            const coda = risposte[chiave]
            const r = coda && coda.length > 1 ? coda.shift()! : coda?.[0]
            if (!r) return { stato: 404, corpo: JSON.stringify({ ok: false, error: { code: 'NOT_FOUND' } }) }
            return { stato: r.stato, corpo: JSON.stringify(r.risposta) }
        }),
        apriTerminale: vi.fn(async (o) => { chiamate.push(['apri', o]) }),
        scriviTerminale: vi.fn(async (o) => { chiamate.push(['scrivi', o]) }),
        ridimensionaTerminale: vi.fn(async (o) => { chiamate.push(['ridimensiona', o]) }),
        chiudiTerminale: vi.fn(async (o) => { chiamate.push(['chiudi', o]) }),
        addListener: vi.fn(async (nome: string, fn: (e: Record<string, unknown>) => void) => {
            if (!ascoltatori.has(nome)) ascoltatori.set(nome, new Set())
            ascoltatori.get(nome)!.add(fn)
            return { remove: async () => { ascoltatori.get(nome)!.delete(fn) } }
        }),
    }
    const emetti = (nome: string, e: Record<string, unknown>) => { for (const fn of ascoltatori.get(nome) ?? []) fn(e) }
    const quanti = () => [...ascoltatori.values()].reduce((s, v) => s + v.size, 0)
    return { cliente, chiamate, emetti, quanti }
}

const base = `/api/v1/sessions/${SESSIONE}/terminals`

describe('useTerminaleR4 (K3-TERM T3)', () => {
    it('UTR4-01 carica le schede vere; senza sessione non chiede niente', async () => {
        const f = clienteFinto({ [`GET ${base}`]: [passo('elenco-con-una-attiva')] })
        const t = useTerminaleR4({ sessioneId: () => SESSIONE, cliente: f.cliente })
        await t.carica()
        expect(t.schede.value.map((s) => [s.terminalId, s.origine, s.stato])).toEqual([[UNO, 'prima-scheda', 'attesa'], [DUE, 'rotta', 'attesa']])
        expect(t.attiva.value).toBe(UNO)
        const senza = clienteFinto()
        const t2 = useTerminaleR4({ sessioneId: () => null, cliente: senza.cliente })
        await t2.carica()
        expect(senza.chiamate).toEqual([])
        expect(t2.schede.value).toEqual([])
    })

    it('UTR4-02 «Nuovo» chiede a r4 una scheda (corpo vuoto), la rende attiva; al tetto non chiede e lo dice', async () => {
        const f = clienteFinto({
            [`GET ${base}`]: [passo('elenco-vuoto'), passo('elenco-con-una-attiva')],
            [`POST ${base}`]: [passo('crea-prima')],
        })
        const t = useTerminaleR4({ sessioneId: () => SESSIONE, cliente: f.cliente })
        await t.carica()
        expect(await t.nuova()).toBe(UNO)
        expect(f.chiamate).toContainEqual(['richiesta', { metodo: 'POST', percorso: base, corpo: '{}' }])
        expect(t.attiva.value).toBe(UNO)
        const pieno = clienteFinto({ [`GET ${base}`]: [{ stato: 200, risposta: { ok: true, data: { items: Array.from({ length: 8 }, (_, i) => ({ terminalId: `t-${i}`, origine: 'rotta', attiva: false })) } } }] })
        const t2 = useTerminaleR4({ sessioneId: () => SESSIONE, cliente: pieno.cliente })
        await t2.carica()
        expect(await t2.nuova()).toBeNull()
        expect(t2.errore.value).toBe('troppe')
        expect(pieno.chiamate.filter(([n, o]) => n === 'richiesta' && o.metodo === 'POST')).toEqual([])
    })

    it('UTR4-03 collega la scheda al ponte: agganciato azzera lo schermo poi arrivano i dati; ripreso e uscita cambiano lo stato', async () => {
        const f = clienteFinto({ [`GET ${base}`]: [passo('elenco-con-una-attiva')] })
        const t = useTerminaleR4({ sessioneId: () => SESSIONE, cliente: f.cliente })
        await t.carica()
        const scritto: string[] = []
        const azzera = vi.fn(() => scritto.splice(0))
        await t.collega(UNO, { scrivi: (s) => scritto.push(s), azzera })
        expect(f.chiamate).toContainEqual(['apri', { id: `term-${UNO}`, terminalId: UNO }])
        expect(t.schede.value[0].stato).toBe('connessione')
        f.emetti('r4TermControllo', { id: `term-${UNO}`, json: registrato.controlli[1].json })
        f.emetti('r4TermDati', { id: `term-${UNO}`, testo: ':/workspace $ ' })
        f.emetti('r4TermDati', { id: 'term-altro', testo: 'NON MIO' })
        expect(azzera).toHaveBeenCalledTimes(1)
        expect(scritto).toEqual([':/workspace $ '])
        expect(t.schede.value[0]).toMatchObject({ stato: 'connesso', ripreso: true, shell: 'posix-shell', comando: '/system/bin/sh' })
        f.emetti('r4TermControllo', { id: `term-${UNO}`, json: registrato.controlli[2].json })
        expect(t.schede.value[0]).toMatchObject({ stato: 'terminato', codiceUscita: 3 })
    })

    it('UTR4-04 scrive e ridimensiona sulla scheda attiva; una chiusura o un errore del ponte la segnano disconnessa; l\'avvio fallito resta', async () => {
        const f = clienteFinto({ [`GET ${base}`]: [passo('elenco-con-una-attiva')] })
        const t = useTerminaleR4({ sessioneId: () => SESSIONE, cliente: f.cliente })
        await t.carica()
        await t.collega(UNO, { scrivi: () => {}, azzera: () => {} })
        f.emetti('r4TermControllo', { id: `term-${UNO}`, json: registrato.controlli[0].json })
        await t.scrivi('ls\r')
        await t.ridimensiona(100, 30)
        expect(f.chiamate).toContainEqual(['scrivi', { id: `term-${UNO}`, testo: 'ls\r' }])
        expect(f.chiamate).toContainEqual(['ridimensiona', { id: `term-${UNO}`, cols: 100, rows: 30 }])
        f.emetti('r4TermChiuso', { id: `term-${UNO}`, codice: 1006, motivo: '' })
        expect(t.schede.value[0].stato).toBe('disconnesso')
        await t.collega(DUE, { scrivi: () => {}, azzera: () => {} })
        f.emetti('r4TermControllo', { id: `term-${DUE}`, json: registrato.erroreDalSorgente.json })
        f.emetti('r4TermChiuso', { id: `term-${DUE}`, codice: 1011, motivo: 'terminal start failed' })
        expect(t.schede.value[1]).toMatchObject({ stato: 'terminato', erroreAvvio: { reason: 'folder-missing' } })
    })

    it('UTR4-05 chiude una scheda (ponte e r4) e passa a quella accanto; smontando stacca tutto ma non chiude le shell', async () => {
        const f = clienteFinto({
            [`GET ${base}`]: [passo('elenco-con-una-attiva')],
            [`POST ${base}/${UNO}/close`]: [passo('chiudi')],
        })
        const t = useTerminaleR4({ sessioneId: () => SESSIONE, cliente: f.cliente })
        await t.carica()
        await t.collega(UNO, { scrivi: () => {}, azzera: () => {} })
        await flushPromises()
        expect(await t.chiudi(UNO)).toBe(true)
        expect(f.chiamate).toContainEqual(['chiudi', { id: `term-${UNO}` }])
        expect(f.chiamate).toContainEqual(['richiesta', { metodo: 'POST', percorso: `${base}/${UNO}/close`, corpo: '{}' }])
        expect(t.schede.value.map((s) => s.terminalId)).toEqual([DUE])
        expect(t.attiva.value).toBe(DUE)
        await t.collega(DUE, { scrivi: () => {}, azzera: () => {} })
        expect(f.quanti()).toBeGreaterThan(0)
        await t.distruggi()
        expect(f.chiamate.filter(([n]) => n === 'chiudi').map(([, o]) => o.id)).toEqual([`term-${UNO}`, `term-${DUE}`])
        expect(f.chiamate.filter(([n, o]) => n === 'richiesta' && String(o.percorso).endsWith('/close'))).toHaveLength(1)
        expect(f.quanti()).toBe(0)
    })
})
