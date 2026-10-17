// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import type { TalosR4ClientePonte } from '@/lib/harness/r4/clienteR4'
import { riassuntoSenzaChiedereR4 } from '@/lib/harness/r4/permessiR4'
import { testoPianoR4 } from '@/lib/harness/r4/pianoR4'
import { talosCurrentLocale } from '@/i18n'

/**
 * ⛔ K3 piano (ledger `LEDGER-K3-PIANO-2026-10-17.md`; owner 17/10 «Carta + modo Normale/Piano», «Nel piede del compositore»). Il
 * flusso è quello VERO di r4 @ 701c6c0d2 col fornitore finto: correzione sulla rev. 1, sì «chiedendo conferma» sulla 2,
 * `request_plan_mode`, una proposta chiusa dallo Stop (rev. 3), «conversazione pulita» sulla 4. Le parole sono quelle del golden
 * calcolato dal codice vero del desktop (`piano-golden-701c6c0d2.json`).
 */
process.env.TZ = 'UTC'
const FIXTURE = resolve(__dirname, '..', '..', 'fixtures', 'r4')
const sse = readFileSync(resolve(FIXTURE, 'r4-701c6c0d2-piano-vivo.sse'), 'utf8')
const golden = JSON.parse(readFileSync(resolve(FIXTURE, 'piano-golden-701c6c0d2.json'), 'utf8'))
const blocchi = sse.split(/\n\n/u).filter((b) => b.includes('data:'))
const dati = (b: string) => JSON.parse(b.split('\n').find((r) => r.startsWith('data:'))!.slice(5)) as Record<string, any>
const SESSIONE = golden.origine.sessione as string
const fino = (quando: (d: Record<string, any>) => boolean, n = 1) => {
    let visti = 0
    return blocchi.slice(0, blocchi.findIndex((b) => quando(dati(b)) && ++visti === n) + 1)
}
const piano = (status: string, revision: number) => (d: Record<string, any>) => d.name === 'talos.plan' && d.value.status === status && d.value.revision === revision
const proposta1 = dati(blocchi.find((b) => piano('proposed', 1)(dati(b)))!).value

const stato = vi.hoisted(() => ({
    ascoltatori: {} as Record<string, ((d: Record<string, unknown>) => void)[]>,
    flussi: [] as { id: string; percorso: string }[],
    richieste: [] as { metodo: string; percorso: string; corpo?: string }[],
    rispondi: null as null | ((r: { metodo: string; percorso: string; corpo?: string }) => Promise<{ stato: number; corpo: string }> | { stato: number; corpo: string } | null),
    push: [] as unknown[],
    sessione: '',
}))
vi.mock('vue-router', async () => {
    const { reactive } = await import('vue')
    const rotta = reactive({ params: { id: '' } as Record<string, string> })
    return { useRoute: () => { rotta.params.id = stato.sessione; return rotta }, useRouter: () => ({ push: (x: unknown) => { stato.push.push(x) }, replace: vi.fn() }) }
})
vi.mock('@/lib/harness/terminalePonte', () => ({ talosR4Pronto: async () => ({ disponibile: true, acceso: true, porta: 4178, cartella: '/data/w' }) }))
vi.mock('@/lib/harness/r4/clienteR4', () => ({
    talosClienteR4: (): TalosR4ClientePonte => ({
        richiesta: async (r) => {
            stato.richieste.push(r)
            const scelta = await stato.rispondi?.(r)
            if (scelta) return scelta
            if (r.metodo === 'GET' && r.percorso === '/api/v1/sessions') {
                return { stato: 200, corpo: JSON.stringify({ ok: true, data: { items: [{ sessionId: stato.sessione, nome: 'Piano', permessi: 'Workspace write', permessiPerAttrezzo: {}, modalitaOperativa: 'normale' }] } }) }
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
const carte = (w: W) => w.findAll('[data-testid="talos-codice-r4-piano"]')
const carta = (w: W) => carte(w).at(-1)!
const decisioni = () => stato.richieste.filter((r) => r.percorso.endsWith('/plan-decision')).map((r) => JSON.parse(r.corpo!))
const impostazioni = () => stato.richieste.filter((r) => r.percorso.endsWith('/settings')).map((r) => JSON.parse(r.corpo!))
// la lingua dell'app nella prova: le parole sono quelle del golden e del dizionario r4 in quella lingua
const L = () => (/^it(?:-|$)/iu.test(talosCurrentLocale()) ? 'it' : 'en')
const T = (k: string, v?: Record<string, unknown>) => testoPianoR4(k, L(), v)
const carteNellaLingua = () => golden.carte[L()]

beforeEach(() => {
    stato.sessione = SESSIONE
    Element.prototype.scrollIntoView = vi.fn()
})
afterEach(() => {
    document.body.innerHTML = ''
    stato.ascoltatori = {}
    stato.flussi = []
    stato.richieste = []
    stato.rispondi = null
    stato.push = []
    sessionStorage.clear()
})

describe('il piano nel Codice su r4 (K3 piano)', () => {
    it('CPI-01 la carta proposta: le parole del desktop, quattro scelte, la quarta apre la correzione e Annulla la chiude', async () => {
        const w = await schermata()
        await consegna(fino(piano('proposed', 1)))
        expect(carte(w)).toHaveLength(1)
        const c = carta(w)
        const vista = carteNellaLingua().proposte[0]
        expect(c.get('[data-parte="titolo"]').text()).toBe(vista.titolo)
        expect(c.get('[data-parte="stato"]').text()).toBe(vista.stato)
        expect(c.get('[data-parte="corpo"]').attributes('aria-label')).toBe(vista.corpoLabel)
        expect(c.get('[data-parte="corpo"]').text()).toContain('Piano per slugify')
        expect(c.get('[data-parte="scelte"]').attributes('aria-label')).toBe(vista.gruppoLabel)
        expect(c.get('[data-parte="domanda"]').text()).toBe(vista.domanda)
        const scelte = c.findAll('[data-decisione]')
        expect(scelte.map((s) => ({ decisione: s.attributes('data-decisione'), testo: s.text() })))
            .toEqual(vista.scelte.map((s: { decisione: string; titolo: string; descrizione: string }) => ({ decisione: s.decisione, testo: `${s.titolo}${s.descrizione}` })))
        const quarta = c.get('[data-decisione="continua-a-pianificare"]')
        expect(quarta.attributes('aria-expanded')).toBe('false')
        await quarta.trigger('click')
        await asciuga()
        expect(quarta.attributes('aria-expanded')).toBe('true')
        const campo = c.get('textarea')
        expect(campo.attributes('maxlength')).toBe('4000')
        expect(campo.attributes('placeholder')).toBe(vista.correzione.segnaposto)
        expect(document.activeElement).toBe(campo.element)
        expect(c.findAll('[data-parte="correzione"] button').map((b) => b.text())).toEqual(vista.correzione.pulsanti)
        await c.get('[data-azione="annulla"]').trigger('click')
        await asciuga()
        expect(c.find('textarea').exists()).toBe(false)
        expect(document.activeElement).toBe(quarta.element)
    })

    it('CPI-02 un tocco manda la scelta e spegne le scelte; un rifiuto le riaccende con la frase del desktop; un secondo tocco in volo non parte', async () => {
        let lascia: (v: { stato: number; corpo: string }) => void = () => {}
        stato.rispondi = (r) => (r.percorso.endsWith('/plan-decision') ? new Promise((ok) => { lascia = ok }) : null)
        const w = await schermata()
        await consegna(fino(piano('proposed', 1)))
        const c = carta(w)
        await c.get('[data-decisione="procedi-con-conferma"]').trigger('click')
        await asciuga()
        expect(decisioni()).toEqual([{ requestId: proposta1.requestId, decisione: 'procedi-con-conferma', hash: proposta1.hash }])
        expect(c.get('[data-parte="scelte"]').attributes('aria-busy')).toBe('true')
        expect(c.findAll('[data-decisione]').every((b) => b.attributes('disabled') !== undefined)).toBe(true)
        await c.get('[data-decisione="procedi-accetta-modifiche"]').trigger('click')
        await asciuga()
        expect(decisioni()).toHaveLength(1)
        const stale = golden.buste[0]
        lascia({ stato: stale.stato, corpo: JSON.stringify({ ok: false, error: stale.error }) })
        await asciuga()
        expect(c.get('[role="alert"]').text()).toBe(golden.errori[L()][0].frase)
        expect(c.findAll('[data-decisione]').every((b) => b.attributes('disabled') === undefined)).toBe(true)
        expect(w.find('[data-testid="talos-codice-r4-errore"]').exists()).toBe(false)
    })

    it('CPI-03 la correzione manda il testo ripulito, con la scelta «continua a pianificare»', async () => {
        const w = await schermata()
        await consegna(fino(piano('proposed', 1)))
        const c = carta(w)
        await c.get('[data-decisione="continua-a-pianificare"]').trigger('click')
        await asciuga()
        await c.get('textarea').setValue('   Aggiungi i test prima di scrivere il file  ')
        await c.get('[data-azione="invia-correzione"]').trigger('click')
        await asciuga()
        expect(decisioni()).toEqual([{ requestId: proposta1.requestId, decisione: 'continua-a-pianificare', hash: proposta1.hash, feedback: 'Aggiungi i test prima di scrivere il file' }])
    })

    it('CPI-04 una carta sola, aggiornata sul posto; alla fine la ricevuta di «conversazione pulita» apre la conversazione nuova', async () => {
        const w = await schermata()
        await consegna(blocchi)
        expect(carte(w)).toHaveLength(1)
        const c = carta(w)
        const finale = carteNellaLingua().ricevute.find((r: { evento: number }) => golden.fatti[r.evento].decisione === 'conversazione-pulita' && golden.fatti[r.evento].revision === 4)
        expect(c.get('[data-parte="titolo"]').text()).toBe(finale.titolo)
        expect(c.get('[data-parte="stato"]').text()).toBe(finale.stato)
        expect(c.get('[data-parte="ricevuta"]').attributes('role')).toBe('status')
        expect(c.get('[data-parte="frase"]').text()).toBe(finale.frase)
        expect(c.get('[data-parte="meta"]').text()).toBe(finale.meta)
        expect(c.findAll('[data-decisione]')).toHaveLength(0)
        await c.get('[data-azione="apri-nuova"]').trigger('click')
        const nuova = golden.fatti[golden.fatti.findIndex((f: { nuovaSessionId?: string } | null) => f?.nuovaSessionId)].nuovaSessionId
        expect(stato.push).toEqual([{ name: 'codice-r4', params: { id: nuova } }])
    })

    it('CPI-05 la pillola dice ciò che passa senza chiedere, col tono del rischio, e apre il foglio', async () => {
        const w = await schermata()
        await consegna(fino((d) => d.type === 'RunFinished'))
        const pillola = w.get('[data-testid="talos-codice-r4-permesso"]')
        const atteso = riassuntoSenzaChiedereR4('Workspace write', {}, { modalitaOperativa: 'normale' }, L())
        expect(pillola.text()).toBe(atteso.testo)
        expect(pillola.attributes('data-tono')).toBe('warning')
        expect(pillola.attributes('aria-label')).toContain(atteso.testo)
        await pillola.trigger('click')
        await asciuga()
        expect(w.find('[data-testid="talos-codice-r4-modo-foglio"]').exists()).toBe(true)
    })

    it('CPI-06 il foglio: Piano e livello vanno a r4; durante un giro il modo è spento con la frase del desktop; un rifiuto si legge', async () => {
        const w = await schermata()
        await consegna(fino((d) => d.type === 'RunFinished'))
        await w.get('[data-testid="talos-codice-r4-permesso"]').trigger('click')
        await asciuga()
        const foglio = () => w.get('[data-testid="talos-codice-r4-modo-foglio"]')
        expect(foglio().get('[data-modo="normale"]').attributes('aria-checked')).toBe('true')
        expect(foglio().findAll('[data-livello]').map((r) => r.attributes('data-livello'))).toEqual(['Read only', 'Workspace write', 'On request', 'Full access'])
        await foglio().get('[data-modo="piano"]').trigger('click')
        await asciuga()
        expect(impostazioni()).toEqual([{ modalitaOperativa: 'piano' }])
        expect(foglio().get('[data-modo="piano"]').attributes('aria-checked')).toBe('true')
        expect(foglio().get('[data-parte="esito"]').text()).toBe(T('app.permissions.workModeUpdated'))
        expect(w.get('[data-testid="talos-codice-r4-permesso"]').text()).toBe(riassuntoSenzaChiedereR4('Workspace write', {}, { modalitaOperativa: 'piano' }, L()).testo)
        await foglio().get('[data-livello="Full access"]').trigger('click')
        await asciuga()
        expect(impostazioni().at(-1)).toEqual({ permessi: 'Full access' })
        stato.rispondi = (r) => (r.percorso.endsWith('/settings') ? { stato: 409, corpo: JSON.stringify({ ok: false, error: { code: 'SESSION_NOT_READY', message: 'Session not ready for this action' } }) } : null)
        await foglio().get('[data-livello="Read only"]').trigger('click')
        await asciuga()
        expect(foglio().get('[role="alert"]').text()).toContain(T('app.permissions.choiceNotApplied'))
        expect(foglio().get('[data-livello="Full access"]').attributes('aria-checked')).toBe('true')
        // un giro in corso: il modo non si tocca
        await consegna([blocchi.find((b) => dati(b).type === 'RunStarted')!])
        expect(foglio().get('[data-modo="normale"]').attributes('disabled')).toBeDefined()
        expect(foglio().get('[data-parte="modo-durante-il-giro"]').text()).toBe(T('app.permissions.modeChangeHint'))
    })

    it('CPI-07 la fascia del Piano chiesto e l\'avviso della revisione: testi del desktop, «Vai al piano» porta alla carta, la chiusura toglie l\'avviso', async () => {
        const w = await schermata()
        await consegna(fino(piano('proposed', 2)))
        const avviso = w.get('[data-testid="talos-codice-r4-avviso-piano"]')
        expect(avviso.get('[data-parte="testo"]').text()).toBe(T('app.plan.updated', { n: 2 }))
        await avviso.get('[data-azione="vai"]').trigger('click')
        await asciuga()
        expect(Element.prototype.scrollIntoView).toHaveBeenCalled()
        expect(document.activeElement).toBe(carta(w).element)
        expect(w.find('[data-testid="talos-codice-r4-avviso-piano"]').exists()).toBe(false)
        await consegna(fino(piano('proposed', 2)).slice(-1).map((b) => b.replace('"revision":2', '"revision":3')))
        await w.get('[data-testid="talos-codice-r4-avviso-piano"] [data-azione="chiudi"]').trigger('click')
        await asciuga()
        expect(w.find('[data-testid="talos-codice-r4-avviso-piano"]').exists()).toBe(false)

        w.unmount()
        const w2 = await schermata()
        const richiesto = (d: Record<string, any>) => d.name === 'talos.impostazioni-sessione' && d.value.motivo === 'piano-richiesto-dal-modello'
        await consegna(fino(richiesto))
        const fascia = w2.get('[data-testid="talos-codice-r4-fascia-piano"]')
        expect(fascia.text()).toContain(T('app.plan.activeNextTurn'))
        expect(fascia.text()).toContain(T('modello.chat.theNextMessageWill'))
        const dopo = blocchi.slice(fino(richiesto).length)
        await consegna([dopo.find((b) => dati(b).type === 'RunStarted')!])
        expect(w2.find('[data-testid="talos-codice-r4-fascia-piano"]').exists()).toBe(false)
    })

    /** Le misure dello scorrimento che jsdom non ha (come SCR4-19): altezza, vista, posizione; e gli osservatori di misura. */
    async function conMisure() {
        const osservatori: { richiamo: () => void; elementi: Element[] }[] = []
        vi.stubGlobal('ResizeObserver', class {
            elementi: Element[] = []
            constructor(public richiamo: () => void) { osservatori.push(this) }
            observe(e: Element) { this.elementi.push(e) }
            unobserve() {}
            disconnect() { this.elementi = [] }
        })
        const w = await schermata()
        const el = w.get('[data-testid="talos-codice-r4-scorrimento"]').element as HTMLElement
        const misura = { alto: 2400, vista: 800 }
        let top = 0
        Object.defineProperty(el, 'scrollHeight', { configurable: true, get: () => misura.alto })
        Object.defineProperty(el, 'clientHeight', { configurable: true, get: () => misura.vista })
        Object.defineProperty(el, 'scrollTop', { configurable: true, get: () => top, set: (v: number) => { top = Math.max(0, Math.min(v, misura.alto - misura.vista)) } })
        // come nel browser: prima lo scorrimento in fondo manda il suo evento, poi il dito sale
        const scorriColDito = async (v: number) => { el.dispatchEvent(new Event('scroll')); await asciuga(); el.dispatchEvent(new Event('touchstart')); top = v; el.dispatchEvent(new Event('scroll')); el.dispatchEvent(new Event('touchend')); await asciuga() }
        const crescita = async (alto: number) => { misura.alto = alto; for (const o of osservatori) if (o.elementi.length) o.richiamo(); await asciuga() }
        return { w, misura, top: () => top, scorriColDito, crescita }
    }

    it('CPI-08 una scelta mandata dalla carta riporta in fondo, come un messaggio mandato dal compositore (Pad 17/10)', async () => {
        const { w, misura, top, scorriColDito, crescita } = await conMisure()
        await consegna(fino(piano('proposed', 1)))
        await crescita(2400)
        await scorriColDito(300) // la tastiera del campo della correzione, o il dito: staccati
        expect(w.find('[data-testid="talos-codice-r4-in-fondo"]').exists()).toBe(true)
        await carta(w).get('[data-decisione="procedi-con-conferma"]').trigger('click')
        await asciuga()
        expect(decisioni()).toHaveLength(1)
        expect(top()).toBe(misura.alto - misura.vista)
        expect(w.find('[data-testid="talos-codice-r4-in-fondo"]').exists()).toBe(false)
        vi.unstubAllGlobals()
    })

    it('CPI-09 staccati poco sopra il fondo, la carta che cresce sul posto accende la pillola «torna in fondo» (Pad 17/10)', async () => {
        const { w, misura, scorriColDito, crescita } = await conMisure()
        await consegna(fino(piano('proposed', 1)))
        await crescita(2400)
        await scorriColDito(misura.alto - misura.vista - 60) // un poco sopra il fondo: staccati, ma ancora senza pillola
        expect(w.find('[data-testid="talos-codice-r4-in-fondo"]').exists()).toBe(false)
        await crescita(3200) // la revisione nuova allunga la carta, nessuno scorre
        expect(w.find('[data-testid="talos-codice-r4-in-fondo"]').exists()).toBe(true)
        vi.unstubAllGlobals()
    })
})
