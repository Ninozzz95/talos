// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import type { TalosR4ClientePonte } from '@/lib/harness/r4/clienteR4'

/**
 * ⛔ K3-TERM T3+T4 (ledger `LEDGER-K3-TERMINALE-2026-10-16.md`). Owner 16/10: scrittura diretta + barra dei tasti su una riga, più
 * schede come il desktop; «Chat · Terminale» in basso quando il Codice è stretto (≤ 780 px), schede in testata quando è largo.
 * xterm è un finto con la stessa API usata (in jsdom non c'è un canvas); il ponte nativo è finto, le risposte sono quelle vere di r4.
 */
const registrato = JSON.parse(readFileSync(resolve(__dirname, '..', '..', 'fixtures', 'r4', 'terminale-2161afb32.json'), 'utf8'))
const passo = (nome: string) => registrato.passi.find((p: { nome: string }) => p.nome === nome)
const UNO = '11111111-1111-4111-8111-111111111111'
const DUE = '22222222-2222-4222-8222-222222222222'

const stato = vi.hoisted(() => ({
    ascoltatori: {} as Record<string, ((d: Record<string, unknown>) => void)[]>,
    chiamate: [] as Array<[string, Record<string, unknown>]>,
    // J3: il codice con cui il ponte rifiuta la PROSSIMA apertura (poi torna a riuscire)
    guastoApri: null as string | null,
    risposte: {} as Record<string, Array<{ stato: number; risposta: unknown }>>,
    terminali: [] as Array<{ scritto: string; azzerato: number; dati: ((s: string) => void) | null; aperto: boolean; distrutto: boolean; modes: { applicationCursorKeysMode: boolean } }>,
}))
vi.mock('vue-router', async () => {
    const { reactive } = await import('vue')
    const rotta = reactive({ params: { id: 's1' } as Record<string, string> })
    return { useRoute: () => rotta, useRouter: () => ({ push: vi.fn(), replace: vi.fn() }) }
})
vi.mock('@/lib/harness/terminalePonte', () => ({ talosR4Pronto: async () => ({ disponibile: true, acceso: true, porta: 4178, cartella: '/data/w' }) }))
vi.mock('@/lib/harness/r4/clienteR4', () => ({
    talosClienteR4: (): TalosR4ClientePonte => ({
        richiesta: async (o) => {
            stato.chiamate.push(['richiesta', o])
            const coda = stato.risposte[`${o.metodo} ${o.percorso}`]
            const r = coda && coda.length > 1 ? coda.shift()! : coda?.[0]
            return r ? { stato: r.stato, corpo: JSON.stringify(r.risposta) } : { stato: 200, corpo: '{"ok":true,"data":{}}' }
        },
        apriFlusso: async () => undefined,
        chiudiFlusso: async () => undefined,
        apriTerminale: async (o) => {
            stato.chiamate.push(['apri', o])
            if (stato.guastoApri) { const code = stato.guastoApri; stato.guastoApri = null; throw Object.assign(new Error(code), { code }) }
        },
        scriviTerminale: async (o) => { stato.chiamate.push(['scrivi', o]) },
        ridimensionaTerminale: async (o) => { stato.chiamate.push(['ridimensiona', o]) },
        chiudiTerminale: async (o) => { stato.chiamate.push(['chiudi', o]) },
        addListener: async (evento, a) => {
            ;(stato.ascoltatori[evento] ??= []).push(a)
            return { remove: async () => { stato.ascoltatori[evento] = (stato.ascoltatori[evento] ?? []).filter((x) => x !== a) } }
        },
    }),
}))
vi.mock('@xterm/xterm', () => ({
    Terminal: class {
        cols = 80
        rows = 24
        options: Record<string, unknown> = {}
        modes = { applicationCursorKeysMode: false }
        voce: (typeof stato.terminali)[number]
        constructor() {
            this.voce = { scritto: '', azzerato: 0, dati: null, aperto: false, distrutto: false, modes: this.modes }
            stato.terminali.push(this.voce)
        }
        open() { this.voce.aperto = true }
        write(s: string) { this.voce.scritto += s }
        writeln(s: string) { this.voce.scritto += `${s}\r\n` }
        reset() { this.voce.azzerato += 1; this.voce.scritto = '' }
        onData(cb: (s: string) => void) { this.voce.dati = cb; return { dispose: () => { this.voce.dati = null } } }
        input(s: string) { this.voce.dati?.(s) }
        focus() {}
        loadAddon() {}
        dispose() { this.voce.distrutto = true }
    },
}))
vi.mock('@xterm/addon-fit', () => ({ FitAddon: class { fit() {} proposeDimensions() { return { cols: 80, rows: 24 } } } }))
vi.mock('@xterm/xterm/css/xterm.css', () => ({}))
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

const BASE = '/api/v1/sessions/s1/terminals'
const osservatori: { richiamo: () => void; elementi: Element[] }[] = []

async function asciuga() {
    for (let i = 0; i < 3; i++) { await flushPromises(); await vi.dynamicImportSettled() }
    await flushPromises()
}

async function schermata(larghezza = 654) {
    const w = mount(CodiceR4Screen, { attachTo: document.body, global: { stubs: { teleport: true } } })
    await asciuga()
    const riga = w.get('[data-testid="talos-codice-r4-riga"]').element as HTMLElement
    let l = larghezza
    riga.getBoundingClientRect = () => ({ width: l, height: 800, top: 0, left: 0, right: l, bottom: 800, x: 0, y: 0, toJSON: () => ({}) }) as DOMRect
    const misura = async (n: number) => {
        l = n
        for (const o of osservatori) if (o.elementi.includes(riga)) o.richiamo()
        await asciuga()
    }
    await misura(larghezza)
    return { w, misura }
}
function emetti(evento: string, d: Record<string, unknown>) { for (const a of stato.ascoltatori[evento] ?? []) a(d) }
async function apriTerminale(w: ReturnType<typeof mount>) {
    await w.get('[data-testid="talos-codice-r4-vista-terminale"]').trigger('click')
    await asciuga()
}
const chiamate = (nome: string) => stato.chiamate.filter(([n]) => n === nome).map(([, o]) => o)

beforeEach(() => {
    vi.stubGlobal('ResizeObserver', class {
        elementi: Element[] = []
        constructor(public richiamo: () => void) { osservatori.push(this) }
        observe(e: Element) { this.elementi.push(e) }
        unobserve() {}
        disconnect() { this.elementi = [] }
    })
    stato.risposte = {
        [`GET ${BASE}`]: [passo('elenco-con-una-attiva')],
        [`POST ${BASE}/${UNO}/close`]: [passo('chiudi')],
    }
})
afterEach(() => {
    vi.unstubAllGlobals()
    document.body.innerHTML = ''
    osservatori.length = 0
    stato.ascoltatori = {}
    stato.chiamate = []
    stato.terminali = []
})

describe('il Terminale del Codice su r4 (K3-TERM T3+T4)', () => {
    it('TERM-01 «Chat · Terminale»: in basso col Codice stretto (fino a 780), nella testata da 781; la Chat è la vista di partenza', async () => {
        const { w, misura } = await schermata(654)
        const viste = () => w.find('[data-testid="talos-codice-r4-viste"]')
        expect(viste().attributes('data-forma')).toBe('barra')
        expect(w.find('[data-testid="talos-codice-r4-header"] [data-testid="talos-codice-r4-viste"]').exists()).toBe(false)
        expect(viste().get('[data-testid="talos-codice-r4-vista-chat"]').attributes('aria-selected')).toBe('true')
        expect(viste().text()).toContain('Chat')
        expect(viste().text()).toContain('Terminal')
        await misura(780)
        expect(viste().attributes('data-forma')).toBe('barra')
        await misura(781)
        expect(w.get('[data-testid="talos-codice-r4-header"] [data-testid="talos-codice-r4-viste"]').attributes('data-forma')).toBe('schede')
        expect(w.findAll('[data-testid="talos-codice-r4-viste"]')).toHaveLength(1)
        w.unmount()
    })

    it('TERM-02 il Terminale prende il posto di conversazione e compositore; carica le schede di r4 e collega la prima', async () => {
        const { w } = await schermata()
        expect(chiamate('richiesta').some((o) => o.percorso === BASE)).toBe(false)
        await apriTerminale(w)
        expect(w.get('[data-testid="talos-codice-r4-scorrimento"]').isVisible()).toBe(false)
        expect(w.get('[data-testid="talos-codice-r4-dock"]').isVisible()).toBe(false)
        expect(w.get('[data-testid="talos-codice-r4-terminale"]').isVisible()).toBe(true)
        expect(w.get('[data-testid="talos-codice-r4-vista-terminale"]').attributes('aria-selected')).toBe('true')
        expect(chiamate('richiesta')).toContainEqual({ metodo: 'GET', percorso: BASE })
        expect(chiamate('apri')).toEqual([{ id: `term-${UNO}`, terminalId: UNO }])
        expect(stato.terminali[0].aperto).toBe(true)
        emetti('r4TermControllo', { id: `term-${UNO}`, json: registrato.controlli[1].json })
        emetti('r4TermDati', { id: `term-${UNO}`, testo: ':/workspace $ ' })
        await asciuga()
        expect(stato.terminali[0].azzerato).toBe(1)
        expect(stato.terminali[0].scritto).toBe(':/workspace $ ')
        const schede = w.findAll('[data-testid="talos-codice-r4-terminale-scheda"]')
        expect(schede.map((s) => s.attributes('aria-selected'))).toEqual(['true', 'false'])
        expect(schede[0].text()).toContain('you · sh')
        expect(w.get('[data-testid="talos-codice-r4-terminale-piede"]').text()).toContain('shell resumed')
        w.unmount()
    })

    it('TERM-03 la barra dei tasti: Esc e frecce (anche in modo applicazione); Ctrl a scatto + c dà ^C e si rilascia', async () => {
        const { w } = await schermata()
        await apriTerminale(w)
        emetti('r4TermControllo', { id: `term-${UNO}`, json: registrato.controlli[0].json })
        await asciuga()
        const tasto = (id: string) => w.get(`[data-testid="talos-codice-r4-tasto-${id}"]`)
        expect(w.findAll('[data-testid^="talos-codice-r4-tasto-"]').map((t) => t.attributes('data-testid')!.replace('talos-codice-r4-tasto-', '')))
            .toEqual(['esc', 'tab', 'ctrl', 'alt', 'sinistra', 'giu', 'su', 'destra', 'pipe', 'tilde', 'barra', 'meno'])
        expect(tasto('sinistra').attributes('aria-label')).toBe('Left arrow')
        await tasto('esc').trigger('click')
        await tasto('su').trigger('click')
        stato.terminali[0].modes.applicationCursorKeysMode = true
        await tasto('su').trigger('click')
        await tasto('ctrl').trigger('click')
        expect(tasto('ctrl').attributes('aria-pressed')).toBe('true')
        stato.terminali[0].dati!('c')
        await asciuga()
        expect(tasto('ctrl').attributes('aria-pressed')).toBe('false')
        stato.terminali[0].dati!('ls\r')
        await asciuga()
        expect(chiamate('scrivi').map((o) => o.testo)).toEqual(['\x1b', '\x1b[A', '\x1bOA', '\x03', 'ls\r'])
        w.unmount()
    })

    it('TERM-04 «+» apre una scheda nuova su r4 e la collega; × la chiude su r4 e passa a quella accanto', async () => {
        stato.risposte[`GET ${BASE}`] = [passo('elenco-vuoto'), passo('elenco-con-una-attiva')]
        stato.risposte[`POST ${BASE}`] = [passo('crea-prima')]
        const { w } = await schermata()
        await apriTerminale(w)
        // nessuna scheda: l'invito del desktop e il bottone «New»
        expect(w.get('[data-testid="talos-codice-r4-terminale-vuoto"]').text()).toContain('No tab open')
        await w.get('[data-testid="talos-codice-r4-terminale-nuova"]').trigger('click')
        await asciuga()
        expect(chiamate('richiesta')).toContainEqual({ metodo: 'POST', percorso: BASE, corpo: '{}' })
        expect(chiamate('apri')).toEqual([{ id: `term-${UNO}`, terminalId: UNO }])
        await w.get(`[data-testid="talos-codice-r4-terminale-chiudi-${UNO}"]`).trigger('click')
        await asciuga()
        expect(chiamate('chiudi')).toContainEqual({ id: `term-${UNO}` })
        expect(chiamate('richiesta')).toContainEqual({ metodo: 'POST', percorso: `${BASE}/${UNO}/close`, corpo: '{}' })
        expect(w.findAll('[data-testid="talos-codice-r4-terminale-scheda"]')).toHaveLength(1)
        expect(chiamate('apri').at(-1)).toEqual({ id: `term-${DUE}`, terminalId: DUE })
        w.unmount()
    })

    it('TERM-05 shell uscita e avvio fallito si leggono nel terminale e nel piede, nelle parole del desktop', async () => {
        const { w } = await schermata()
        await apriTerminale(w)
        emetti('r4TermControllo', { id: `term-${UNO}`, json: registrato.controlli[0].json })
        emetti('r4TermControllo', { id: `term-${UNO}`, json: registrato.controlli[2].json })
        await asciuga()
        expect(stato.terminali[0].scritto).toContain('[shell closed, code 3]')
        expect(w.get('[data-testid="talos-codice-r4-terminale-piede"]').text()).toContain('shell closed')
        emetti('r4TermControllo', { id: `term-${UNO}`, json: registrato.erroreDalSorgente.json })
        await asciuga()
        expect(w.get('[data-testid="talos-codice-r4-terminale-piede"]').text()).toContain('The terminal could not start: the folder "/data/data/ai.talos.dev/files/codice/sparita" does not exist.')
        w.unmount()
    })

    it('TERM-06 tornando alla Chat la shell resta collegata; rientrando non si ricollega da capo', async () => {
        const { w } = await schermata()
        await apriTerminale(w)
        emetti('r4TermControllo', { id: `term-${UNO}`, json: registrato.controlli[0].json })
        await w.get('[data-testid="talos-codice-r4-vista-chat"]').trigger('click')
        await asciuga()
        expect(w.get('[data-testid="talos-codice-r4-scorrimento"]').isVisible()).toBe(true)
        expect(w.get('[data-testid="talos-codice-r4-terminale"]').isVisible()).toBe(false)
        await apriTerminale(w)
        expect(chiamate('apri')).toHaveLength(1)
        expect(chiamate('chiudi')).toEqual([])
        w.unmount()
    })

    it('TERM-07 se il ponte cade la scheda è disconnessa e «Reconnect» la ricollega', async () => {
        const { w } = await schermata()
        await apriTerminale(w)
        emetti('r4TermControllo', { id: `term-${UNO}`, json: registrato.controlli[0].json })
        emetti('r4TermChiuso', { id: `term-${UNO}`, codice: 1006, motivo: '' })
        await asciuga()
        expect(w.get('[data-testid="talos-codice-r4-terminale-piede"]').text()).toContain('disconnected')
        await w.get('[data-testid="talos-codice-r4-terminale-ricollega"]').trigger('click')
        await asciuga()
        expect(chiamate('apri')).toHaveLength(2)
        w.unmount()
    })

    it('TERM-08 lasciando il Codice ci si stacca dal ponte senza chiudere le shell su r4', async () => {
        const { w } = await schermata()
        await apriTerminale(w)
        emetti('r4TermControllo', { id: `term-${UNO}`, json: registrato.controlli[0].json })
        w.unmount()
        await asciuga()
        expect(chiamate('chiudi')).toEqual([{ id: `term-${UNO}` }])
        expect(chiamate('richiesta').some((o) => String(o.percorso).endsWith('/close'))).toBe(false)
        expect(stato.terminali[0].distrutto).toBe(true)
    })

    /*
     * J3 (24/10/2026; il Desktop ha dato l'OK): `useTerminaleR4().errore` non si vedeva da nessuna parte — un «+» rifiutato da r4 o un
     * ponte che non si apre lasciavano il Terminale muto. Ora il piede lo dice, con la frase del codice e la stessa forma della riga
     * d'errore del compositore (`talos-codice-r4-errore`).
     */
    it('TERM-09 «+» rifiutato da r4: la riga d’errore lo dice anche senza schede, con la forma della riga del compositore', async () => {
        stato.risposte[`GET ${BASE}`] = [passo('elenco-vuoto')]
        stato.risposte[`POST ${BASE}`] = [{ stato: 409, risposta: { ok: false, error: { code: 'TERMINAL_LIMIT_REACHED', message: 'limit' } } }]
        const { w } = await schermata()
        await apriTerminale(w)
        expect(w.find('[data-testid="talos-codice-r4-terminale-errore"]').exists()).toBe(false)
        await w.get('[data-testid="talos-codice-r4-terminale-nuova"]').trigger('click')
        await asciuga()
        const riga = w.get('[data-testid="talos-codice-r4-terminale-errore"]')
        expect(riga.text()).toBe('Tab not opened')
        expect(riga.attributes('role')).toBe('alert')
        expect(riga.attributes('data-codice')).toBe('TERMINAL_LIMIT_REACHED')
        expect(riga.classes()).toEqual(expect.arrayContaining(['rounded-md', 'border', 'p-3', 'text-sm', 'text-[var(--talos-danger)]']))
        w.unmount()
    })

    it('TERM-10 il ponte non si apre: la riga dice di ricollegare; «Ricollega» riuscito la toglie', async () => {
        stato.guastoApri = 'TALOS_R4_IRRAGGIUNGIBILE'
        const { w } = await schermata()
        await apriTerminale(w)
        expect(w.get('[data-testid="talos-codice-r4-terminale-errore"]').text()).toBe('The terminal is not connected: tap “Reconnect”.')
        await w.get('[data-testid="talos-codice-r4-terminale-ricollega"]').trigger('click')
        await asciuga()
        expect(chiamate('apri')).toHaveLength(2)
        expect(w.find('[data-testid="talos-codice-r4-terminale-errore"]').exists()).toBe(false)
        w.unmount()
    })
})
