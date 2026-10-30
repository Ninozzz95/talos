// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import type { TalosR4ClientePonte } from '@/lib/harness/r4/clienteR4'
import { talosCurrentLocale } from '@/i18n'
import { testoAutomazioniR4 } from '@/lib/harness/r4/automazioniR4'

/**
 * ⛔ K3 automazioni, fornitori e Coordinazione (ledger `LEDGER-K3-AUTOMAZIONI-FORNITORI-COORDINAZIONE-2026-10-17.md`). Il flusso è quello
 * VERO di r4 @ 701c6c0d2 col fornitore finto (`registra-golden-r4.mjs … automazioni`): tre «crea» (semplice, oltre la chat, istruzioni
 * sospette), modifica, riprendi, esegui ora, due «escludi» e un «riammetti». Le parole sono quelle del golden calcolato dal desktop.
 */
process.env.TZ = 'UTC'
const FIXTURE = resolve(__dirname, '..', '..', 'fixtures', 'r4')
const sse = readFileSync(resolve(FIXTURE, 'r4-701c6c0d2-automazioni-vivo.sse'), 'utf8')
const golden = JSON.parse(readFileSync(resolve(FIXTURE, 'automazioni-golden-701c6c0d2.json'), 'utf8'))
const blocchi = sse.split(/\n\n/u).filter((b) => b.includes('data:'))
const dati = (b: string) => JSON.parse(b.split('\n').find((r) => r.startsWith('data:'))!.slice(5)) as Record<string, any>
/** I blocchi fino alla n-esima richiesta d'approvazione compresa. */
const finoAllaCarta = (n: number) => {
    let viste = 0
    return blocchi.slice(0, blocchi.findIndex((b) => dati(b).type === 'ApprovalRequested' && ++viste === n) + 1)
}
const richiesta = (n: number) => dati(finoAllaCarta(n).at(-1)!)

const stato = vi.hoisted(() => ({
    ascoltatori: {} as Record<string, ((d: Record<string, unknown>) => void)[]>,
    flussi: [] as { id: string; percorso: string }[],
    richieste: [] as { metodo: string; percorso: string; corpo?: string }[],
    rispondi: null as null | ((r: { metodo: string; percorso: string; corpo?: string }) => { stato: number; corpo: string } | null),
    sessione: 's1',
    voci: null as null | Record<string, unknown>[],
}))
vi.mock('vue-router', async () => {
    const { reactive } = await import('vue')
    const rotta = reactive({ params: { id: '' } as Record<string, string> })
    return { useRoute: () => { rotta.params.id = stato.sessione; return rotta }, useRouter: () => ({ push: vi.fn(), replace: vi.fn() }) }
})
vi.mock('@/lib/harness/terminalePonte', () => ({ talosR4Pronto: async () => ({ disponibile: true, acceso: true, porta: 4178, cartella: '/data/w' }) }))
vi.mock('@/lib/harness/r4/clienteR4', () => ({
    talosClienteR4: (): TalosR4ClientePonte => ({
        richiesta: async (r) => {
            stato.richieste.push(r)
            const scelta = stato.rispondi?.(r)
            if (scelta) return scelta
            if (r.metodo === 'GET' && r.percorso === '/api/v1/sessions') {
                const voci = stato.voci ?? [{ sessionId: stato.sessione, nome: 'Prova', permessi: 'Workspace write', permessiPerAttrezzo: {}, modalitaOperativa: 'normale' }]
                return { stato: 200, corpo: JSON.stringify({ ok: true, data: { items: voci } }) }
            }
            return { stato: 200, corpo: '{"ok":true,"data":{"ok":true}}' }
        },
        apriFlusso: async (f) => { stato.flussi.push(f) },
        chiudiFlusso: async () => undefined,
        apriTerminale: async () => undefined,
        scriviTerminale: async () => undefined,
        ridimensionaTerminale: async () => undefined,
        chiudiTerminale: async () => undefined,
        addListener: async (evento, a) => {
            ;(stato.ascoltatori[evento] ??= []).push(a)
            return { remove: async () => { stato.ascoltatori[evento] = (stato.ascoltatori[evento] ?? []).filter((x) => x !== a) } }
        },
    }),
}))
vi.mock('@/stores/settings', () => ({
    useSettingsStore: () => ({
        state: {
            chat_layout: { message_style: 'sections', bubble_scale: 'large' },
            shell: { debug_diagnostics: false, streaming_animation: 'fade', composer_shape: 'calm', composer_plus: 'dropdown' },
            voice: { dictation_language: 'auto' },
        },
    }),
}))
vi.mock('@/composables/useTalosMobileDictation', async () => {
    const { ref } = await import('vue')
    return { useTalosMobileDictation: () => ({ visible: ref(true), status: ref('idle'), level: ref(0), error: ref(''), errorCode: ref(null), toggle: vi.fn(), cancel: vi.fn(), finisci: vi.fn() }) }
})

import CodiceR4Screen from '@/screens/CodiceR4Screen.vue'
import { useTalosI18n } from '@/i18n'

async function asciuga() { for (let i = 0; i < 4; i++) { await flushPromises(); await vi.dynamicImportSettled() } }
async function schermata() {
    const w = mount(CodiceR4Screen, { attachTo: document.body, global: { stubs: { teleport: true } } })
    await asciuga()
    return w
}
async function consegna(blocchiDaDare: string[]) {
    const id = stato.flussi.at(-1)!.id
    for (const a of stato.ascoltatori.r4Pezzo ?? []) a({ id, testo: `${blocchiDaDare.join('\n\n')}\n\n` })
    await asciuga()
}
type W = ReturnType<typeof mount>
const carte = (w: W) => w.findAll('[data-testid="talos-codice-r4-carta-automazione"]')
const L = () => (/^it(?:-|$)/iu.test(talosCurrentLocale()) ? 'it' : 'en')
const T = (k: string) => testoAutomazioniR4(k, L())
/** L'indice dell'azione n-esima del flusso nel golden (le azioni vere stanno in testa, nello stesso ordine). */
const vistaDellaCarta = (n: number) => golden.carte[L()][n - 1]
/** Il blocco come lo legge la persona: righe chiave-valore, testi, riquadri d'avviso. */
const bloccoA = (c: ReturnType<W['find']>) => c.findAll('[data-blocco]').map((n) => {
    const tipo = n.attributes('data-blocco')
    if (tipo === 'avvisi') return { tipo, di: n.attributes('data-di'), ruolo: n.attributes('role') ?? null, titolo: n.get('[data-parte=titolo]').text(), righe: n.findAll('li').map((li) => ({ testo: li.text(), avviso: li.attributes('data-avviso') ?? null })) }
    if (tipo === 'riga') return { tipo, k: n.get('[data-parte=k]').text(), v: n.get('[data-parte=v]').text() }
    return { tipo, k: n.get('[data-parte=k]').text(), testo: n.get('[data-parte=testo]').text() }
})
const approvazioni = () => stato.richieste.filter((r) => r.percorso.endsWith('/approve')).map((r) => JSON.parse(r.corpo!))
const impostazioni = () => stato.richieste.filter((r) => r.percorso.endsWith('/settings')).map((r) => JSON.parse(r.corpo!))

beforeEach(() => { stato.sessione = 's1'; stato.voci = null })
afterEach(() => {
    document.body.innerHTML = ''
    stato.ascoltatori = {}
    stato.flussi = []
    stato.richieste = []
    stato.rispondi = null
})

describe('le carte delle automazioni e dei fornitori nel Codice su r4', () => {
    it('CAU-01 «crea»: la bozza in parole e la riga del telefono; Annulla · Approva, niente Modifica; Annulla manda il no', async () => {
        const w = await schermata()
        await consegna(finoAllaCarta(1))
        expect(w.findAll('[data-testid="talos-approvazione"]')).toHaveLength(0)
        const c = carte(w)[0]
        const vista = vistaDellaCarta(1)
        expect(c.get('[data-parte=badge]').text()).toBe(vista.testi.badge)
        expect(c.get('[data-parte=bersaglio]').text()).toBe(vista.testi.bersaglio)
        expect(c.get('[data-parte=perche]').text()).toBe(vista.testi.perche)
        expect(c.get('[data-parte=motivo]').text()).toBe(vista.testi.motivo)
        expect(bloccoA(c)).toEqual(vista.blocco)
        const { t } = useTalosI18n()
        expect(c.get('[data-parte=telefono]').text()).toBe(t('harness.r4AutomationPhoneNote'))
        expect(c.findAll('[data-scelta]').map((b) => [b.attributes('data-scelta'), b.text()])).toEqual([['nega', T('sezioni.automations.v2.card.cancel')], ['unaVolta', T('sezioni.automations.v2.card.approve')]])
        await c.get('[data-scelta=nega]').trigger('click')
        await asciuga()
        expect(approvazioni()).toEqual([{ requestId: richiesta(1).requestId, approvato: false }])
    })

    it('CAU-02 ciò che va oltre la chat e le istruzioni sospette (riquadro d\'allarme), con le parole del desktop', async () => {
        const w = await schermata()
        await consegna(finoAllaCarta(3))
        for (const n of [2, 3]) expect(bloccoA(carte(w)[n - 1]), `carta ${n}`).toEqual(vistaDellaCarta(n).blocco)
        expect(carte(w)[2].get('[data-blocco=avvisi][data-di=minacce]').attributes('role')).toBe('alert')
    })

    it('CAU-03 modifica (prima → dopo), riprendi ed esegui ora; la riga del telefono non c\'è per «esegui ora»', async () => {
        const w = await schermata()
        await consegna(finoAllaCarta(6))
        for (const n of [4, 5, 6]) {
            const c = carte(w)[n - 1]
            expect(c.get('[data-parte=perche]').text(), `carta ${n}`).toBe(vistaDellaCarta(n).testi.perche)
            expect(bloccoA(c), `carta ${n}`).toEqual(vistaDellaCarta(n).blocco)
        }
        expect(carte(w)[3].find('[data-parte=telefono]').exists()).toBe(true)
        expect(carte(w)[4].find('[data-parte=telefono]').exists()).toBe(true)
        expect(carte(w)[5].find('[data-parte=telefono]').exists()).toBe(false)
    })

    it('CAU-04 i fornitori: Adesso / Dopo, la nota di ogni modello, niente riga del telefono', async () => {
        const w = await schermata()
        await consegna(finoAllaCarta(9))
        for (const n of [7, 9]) {
            const c = carte(w)[n - 1]
            const vista = vistaDellaCarta(n)
            expect(c.get('[data-parte=badge]').text(), `carta ${n}`).toBe(vista.testi.badge)
            expect(c.get('[data-parte=perche]').text(), `carta ${n}`).toBe(vista.testi.perche)
            expect(bloccoA(c), `carta ${n}`).toEqual(vista.blocco)
            expect(c.find('[data-parte=nota]').exists() ? c.get('[data-parte=nota]').text() : '', `carta ${n}`).toBe(vista.testi.nota)
            expect(c.find('[data-parte=telefono]').exists()).toBe(false)
        }
    })

    it('CAU-05 Approva manda il sì; l\'esito lo scrive r4 (ApprovalResolved) e i pulsanti spariscono', async () => {
        const w = await schermata()
        await consegna(finoAllaCarta(1))
        await carte(w)[0].get('[data-scelta=unaVolta]').trigger('click')
        await asciuga()
        expect(approvazioni()).toEqual([{ requestId: richiesta(1).requestId, approvato: true }])
        const dopo = blocchi.slice(finoAllaCarta(1).length)
        await consegna(dopo.slice(0, dopo.findIndex((b) => dati(b).type === 'ApprovalResolved') + 1))
        const c = carte(w)[0]
        expect(c.findAll('[data-scelta]')).toHaveLength(0)
        expect(c.get('[data-parte=esito]').text()).toBeTruthy()
    })
})

describe('la Coordinazione nel foglio «Quanto può fare TALOS qui»', () => {
    const apriFoglio = async (w: W) => {
        // owner 27/10/2026, forma unica: compatto a riposo, lo scudo del permesso c'è col fuoco (FORMA-01, NUOVO)
        await w.get('[data-testid="talos-composer-prompt"]').trigger('focus')
        await w.get('[data-testid="talos-codice-r4-permesso"]').trigger('click')
        await asciuga()
        return () => w.get('[data-testid="talos-codice-r4-modo-foglio"] [data-testid="talos-codice-r4-coordinazione"]')
    }
    it('CAU-06 accenderla manda l\'unione su `delega_sottotask` e il foglio lo dice; spegnerla manda «chiedi»', async () => {
        const w = await schermata()
        await consegna(blocchi.slice(0, blocchi.findIndex((b) => dati(b).type === 'RunFinished') + 1))
        const riga = await apriFoglio(w)
        expect(riga().attributes('role')).toBe('switch')
        expect(riga().attributes('aria-checked')).toBe('false')
        expect(riga().text()).toContain(T('app.sheets.permissions.coordinationTitle'))
        await riga().trigger('click')
        await asciuga()
        expect(impostazioni()).toEqual([{ unisciPermessiPerAttrezzo: { delega_sottotask: 'sempre' } }])
        expect(riga().attributes('aria-checked')).toBe('true')
        expect(w.get('[data-testid="talos-codice-r4-modo-foglio"] [data-parte=esito]').text()).toBe(T('app.permissions.coordinationOn'))
        await riga().trigger('click')
        await asciuga()
        expect(impostazioni().at(-1)).toEqual({ unisciPermessiPerAttrezzo: { delega_sottotask: 'chiedi' } })
        expect(riga().attributes('aria-checked')).toBe('false')
    })

    it('CAU-07 in un agente delegato decide la conversazione principale: l\'interruttore dice lo stato e non si tocca', async () => {
        stato.sessione = 'figlia'
        stato.voci = [
            { sessionId: 'figlia', padreId: 'madre', nome: null, taskDelega: 'Conta', permessi: 'Workspace write', permessiPerAttrezzo: {} },
            { sessionId: 'madre', nome: 'Madre', permessi: 'Workspace write', permessiPerAttrezzo: { delega_sottotask: 'sempre' } },
        ]
        const w = await schermata()
        await consegna(blocchi.slice(0, blocchi.findIndex((b) => dati(b).type === 'RunFinished') + 1))
        const riga = await apriFoglio(w)
        expect(riga().attributes('aria-checked')).toBe('true')
        expect(riga().attributes('disabled')).toBeDefined()
        expect(riga().text()).toContain(T('app.sheets.permissions.coordinationInDelegation'))
        await riga().trigger('click')
        await asciuga()
        expect(impostazioni()).toEqual([])
    })

    it('CAU-08 senza conversazione: spenta, ferma, e la riga dice quando si accende', async () => {
        stato.sessione = ''
        const w = await schermata()
        const riga = await apriFoglio(w)
        expect(riga().attributes('aria-checked')).toBe('false')
        expect(riga().attributes('disabled')).toBeDefined()
        expect(riga().text()).toContain(T('app.sheets.permissions.coordinationNoSession'))
    })
})
