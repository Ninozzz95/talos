// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import type { TalosR4ClientePonte } from '@/lib/harness/r4/clienteR4'

/**
 * ⛔ K3-B2 (ledger `LEDGER-K3-CODICE-COME-LA-CHAT-2026-10-15.md`, punto 6). Owner 15/10: «Voglio che il codice sia allineato a come
 * funziona l'interfaccia chat, le risposte e la formattazione … una volta per tutte». Il Codice su r4 non ha pezzi suoi per la
 * conversazione: la stessa lista della chat con le stesse impostazioni, la stessa colonna, lo stesso markdown.
 */

const FIXTURE = resolve(__dirname, '..', '..', 'fixtures', 'r4')
const vivo = readFileSync(resolve(FIXTURE, 'r4-99ffa3d38-vivo.sse'), 'utf8').replace(/\n*$/u, '\n\n')

const stato = vi.hoisted(() => ({
    params: {} as Record<string, string>,
    replace: vi.fn(),
    pronto: { disponibile: true, acceso: true, porta: 4178, cartella: '/data/w' } as Record<string, unknown> | null,
    ascoltatori: {} as Record<string, ((d: Record<string, unknown>) => void)[]>,
    flussi: [] as { id: string; percorso: string }[],
    rispondi: null as null | ((r: { metodo: string; percorso: string }) => { stato: number; corpo: string } | null),
}))
// La rotta è reattiva come quella vera: SCR4-11 cambia il parametro e la schermata deve seguirlo.
const rotta = vi.hoisted(() => ({ corrente: null as null | { params: Record<string, string> } }))
vi.mock('vue-router', async () => {
    const { reactive } = await import('vue')
    rotta.corrente = reactive({ params: {} as Record<string, string> })
    return {
        useRoute: () => {
            rotta.corrente!.params = stato.params
            return rotta.corrente
        },
        useRouter: () => ({ push: vi.fn(), replace: stato.replace }),
    }
})
vi.mock('@/lib/harness/terminalePonte', () => ({ talosR4Pronto: async () => stato.pronto }))
vi.mock('@/lib/harness/r4/clienteR4', () => ({
    talosClienteR4: (): TalosR4ClientePonte => ({
        richiesta: async (r) => stato.rispondi?.(r) ?? ({ stato: 200, corpo: '{"ok":true,"data":{}}' }),
        apriFlusso: async (f) => { stato.flussi.push(f) },
        chiudiFlusso: async () => undefined,
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
// La dettatura vera chiede il microfono al telefono: qui conta solo che la schermata la passi al compositore come la chat.
vi.mock('@/composables/useTalosMobileDictation', async () => {
    const { ref } = await import('vue')
    return {
        useTalosMobileDictation: () => ({
            visible: ref(true), status: ref('idle'), level: ref(0), error: ref(''), errorCode: ref(null),
            toggle: vi.fn(), cancel: vi.fn(), finisci: vi.fn(),
        }),
    }
})

import CodiceR4Screen from '@/screens/CodiceR4Screen.vue'
import TalosMobileMessageList from '@/components/chat/TalosMobileMessageList.vue'
import { TALOS_CLASSE_COLONNA_CHAT } from '@/lib/chat/colonnaChat'

async function schermata() {
    const w = mount(CodiceR4Screen, { attachTo: document.body, global: { stubs: { teleport: true } } })
    await flushPromises()
    await vi.dynamicImportSettled()
    await flushPromises()
    return w
}
function consegna(testo: string): void {
    const id = stato.flussi.at(-1)!.id
    for (const a of stato.ascoltatori.r4Pezzo ?? []) a({ id, testo })
}

afterEach(() => {
    document.body.innerHTML = ''
    stato.params = {}
    stato.flussi = []
    stato.ascoltatori = {}
    stato.pronto = { disponibile: true, acceso: true, porta: 4178, cartella: '/data/w' }
    stato.replace.mockClear()
    stato.rispondi = null
})

describe('il Codice su r4 coi pezzi della chat (K3-B2)', () => {
    it('SCR4-01 la stessa lista della chat, con le stesse impostazioni della chat e solo le azioni che r4 regge', async () => {
        stato.params = { id: 's1' }
        const w = await schermata()
        expect(stato.flussi[0].percorso).toBe('/api/v1/sessions/s1/events')
        consegna(vivo)
        await flushPromises()
        await vi.dynamicImportSettled()
        await flushPromises()
        const lista = w.findComponent(TalosMobileMessageList)
        expect(lista.exists()).toBe(true)
        expect(lista.props('messageStyle')).toBe('sections')
        expect(lista.props('textScale')).toBe('large')
        expect(lista.props('azioni')).toEqual(['riutilizza', 'condividi'])
        expect(lista.props('messages')).toHaveLength(4)
        // la colonna della chat: la lista la porta con sé
        expect(lista.classes()).toEqual(expect.arrayContaining(['mx-auto', 'w-full', 'max-w-[820px]', 'px-3']))
        w.unmount()
    })

    it('SCR4-02 la risposta si legge col markdown della chat: titolo, codice in riga, grassetto, blocco di codice', async () => {
        stato.params = { id: 's1' }
        const w = await schermata()
        consegna(vivo)
        await flushPromises()
        await vi.dynamicImportSettled()
        await flushPromises()
        await vi.waitFor(() => expect(w.find('h2').exists()).toBe(true))
        expect(w.find('h2').text()).toContain('Cosa dice la nota')
        expect(w.findAll('code').some((c) => c.text() === 'slugify')).toBe(true)
        expect(w.findAll('strong').some((s) => s.text() === 'entro venerdì')).toBe(true)
        expect(w.find('pre').text()).toContain('export const slugify')
        // niente backtick letterali: era il difetto visto nel Codice di oggi (censimento del 15/10)
        expect(w.text()).not.toContain('`slugify`')
        w.unmount()
    })

    it('SCR4-03 senza r4 (web, build senza archivio, avvio fallito) lo dice e torna al Codice di oggi', async () => {
        stato.pronto = null
        const w = await schermata()
        expect(w.find('[data-testid="talos-codice-r4-assente"]').exists()).toBe(true)
        // K4-E (owner 17/10 «il vecchio come ripiego»): si torna al Codice vecchio DICENDOLO, e con `ripiego=1`, così la voce
        // «Codice» non rimanda di nuovo qui (niente giro a vuoto fra le due schermate)
        expect(stato.replace).toHaveBeenCalledWith({ name: 'harness', query: { ripiego: '1' } })
        const { useTalosMobileToasts } = await import('@/stores/toasts')
        expect(useTalosMobileToasts().items.value.map((t) => t.message)).toContain('The new Code did not start on this device: the classic Code opens instead.')
        w.unmount()
    })

    /*
     * Difetti visti sul Pad il 15/10 (foto in tre viste), ora prove permanenti:
     * SCR4-05 il microfono c'era ma la dettatura no («La dettatura non è disponibile qui.»), e il compositore non aveva la
     * forma della chat; SCR4-06 sul telefono il compositore stava 68 px sopra il fondo (regola del Codice di oggi) e sotto si
     * vedeva scorrere il testo; SCR4-07 la cornice del foglio era nascosta (titolo e Indietro assenti, la prima bolla sotto
     * la barra di stato) perché la rotta stava fra quelle che bloccano lo scorrimento del corpo.
     */
    it('SCR4-05 il compositore ha la dettatura e la forma della chat', async () => {
        stato.params = { id: 's1' }
        const w = await schermata()
        const { default: TalosMobileComposer } = await import('@/components/chat/TalosMobileComposer.vue')
        const { talosComposerFlags } = await import('@/lib/composerStyle')
        const compositore = w.findComponent(TalosMobileComposer)
        const forma = talosComposerFlags('calm', 'dropdown')
        expect(compositore.props('dictationSupported')).toBe(true)
        expect(compositore.props('immersiveComposer')).toBe(forma.immersiveComposer)
        expect(compositore.props('drawerMode')).toBe(forma.drawerMode)
        expect(compositore.props('plusDropdown')).toBe(forma.plusDropdown)
        w.unmount()
    })

    it('SCR4-06 il compositore sta nel contenitore della chat, a filo del fondo', async () => {
        stato.params = { id: 's1' }
        const w = await schermata()
        const dock = w.get('[data-testid="talos-codice-r4-dock"]')
        // respiro e larghezza del compositore della chat; lo sfondo no (SCR4-08)
        expect(dock.find('.talos-docked-composer').exists()).toBe(true)
        const sorgente = readFileSync(resolve(__dirname, '..', '..', '..', 'src', 'screens', 'CodiceR4Screen.vue'), 'utf8')
        expect(sorgente).not.toMatch(/bottom:\s*68px/u)
        w.unmount()
    })

    // K3-C1: la cornice del foglio si nasconde di proposito, perché l'header (← e titolo) è della schermata; il difetto del
    // 15/10 era restare senza ← e senza titolo, e quello resta vietato.
    it('SCR4-07 la schermata ha sempre ← e il titolo, nel suo header', async () => {
        stato.params = { id: 's1' }
        const w = await schermata()
        expect(w.find('[data-testid="talos-codice-r4-indietro"]').exists()).toBe(true)
        expect(w.find('[data-testid="talos-codice-r4-titolo"]').exists()).toBe(true)
        w.unmount()
    })

    /*
     * SCR4-08 (Pad, 15/10, foto ispezionata dopo il richiamo dell'owner): dietro il compositore c'era una fascia di un altro
     * colore (30-31-34 contro 27-28-32 della conversazione) che tagliava di netto la bolla ambra: il contenitore della chat
     * dipinge `--talos-background`, il foglio della stazione `--talos-window-bg`. Owner 15/10: «quel color band deve andare
     * via, deve essere trasparente, la chat si deve vedere passare dietro la banda». Ha uno sfondo solo il compositore.
     */
    it('SCR4-08 dietro il compositore nessuna fascia: il contenitore è trasparente e la conversazione ci passa dietro', async () => {
        const sorgente = readFileSync(resolve(__dirname, '..', '..', '..', 'src', 'screens', 'CodiceR4Screen.vue'), 'utf8')
        const stile = sorgente.slice(sorgente.indexOf('<style scoped>'))
        expect(stile).toMatch(/\.talos-codice-r4-dock\s*\{[^}]*background:\s*transparent/u)
        // la sfumatura leggera è quella della chat (sfumaturaCompositore.test.ts), partendo dal foglio della stazione
        expect(stile).toMatch(/--talos-sfumatura-compositore:\s*var\(--talos-window-bg\)/u)
        stato.params = { id: 's1' }
        const w = await schermata()
        expect(w.get('[data-testid="talos-codice-r4-dock"]').classes()).not.toContain('talos-composer-dock')
        w.unmount()
    })

    /*
     * SCR4-10 (Pad, 15/10, K3-C1): nascosta la cornice del foglio, il foglio diventa trasparente
     * (`talos-mobile-tool-sheet-scene`) e dietro il Codice si vedeva la chat, le due conversazioni sovrapposte. Il Codice di oggi
     * ha lo sfondo nella sua pagina; la schermata nuova se lo dà da sé, lo stesso del foglio.
     */
    it('SCR4-10 la schermata ha uno sfondo suo, quello del foglio: la chat dietro non traspare', async () => {
        stato.params = { id: 's1' }
        const w = await schermata()
        expect(w.get('[data-testid="talos-codice-r4-screen"]').classes()).toContain('bg-[var(--talos-window-bg)]')
        w.unmount()
    })

    // K3-C2: una delega toccata nell'albero porta a /codice-r4/<id>; la schermata riapre su quella sessione.
    it('SCR4-11 cambiando la sessione nella rotta, la schermata chiude il flusso vecchio e apre quello nuovo', async () => {
        stato.params = { id: 's1' }
        const w = await schermata()
        expect(stato.flussi.map((f) => f.percorso)).toEqual(['/api/v1/sessions/s1/events'])
        rotta.corrente!.params = { id: 'f1' }
        await flushPromises()
        await flushPromises()
        expect(stato.flussi.map((f) => f.percorso)).toEqual(['/api/v1/sessions/s1/events', '/api/v1/sessions/f1/events'])
        w.unmount()
    })

    // K3-C3a: «Nuova sessione» dalla tavolozza porta alla rotta senza id; la schermata riapre vuota, senza flusso.
    it('SCR4-12 togliendo la sessione dalla rotta la schermata riparte vuota', async () => {
        stato.params = { id: 's1' }
        const w = await schermata()
        rotta.corrente!.params = {}
        await flushPromises()
        await flushPromises()
        expect(stato.flussi).toHaveLength(1)
        expect(w.find('[data-testid="talos-codice-r4-vuoto"]').exists()).toBe(true)
        w.unmount()
    })

    /**
     * ⛔ K3-C3a2 (owner 15/10: «Riga di stato come la chat»). Il RunError vero della copia vista sul Pad: niente bolla vuota con
     * «Copia» e «Leggi», ma la scheda d'errore della chat (`TalosMobileStatusMessage`) con la frase di r4 e il codice.
     */
    it("SCR4-13 un giro fallito mostra la scheda d'errore della chat col motivo, non una bolla vuota", async () => {
        stato.params = { id: 's1' }
        const w = await schermata()
        const evento = (dati: Record<string, unknown>) => `data: ${JSON.stringify(dati)}

`
        consegna(evento({ type: 'RunStarted', runId: 'g1', input: { consegna: 'Leggi NOTA.md' }, timestamp: 1792045692189, _sequenza: 1 })
            + evento({ type: 'RunError', code: 'PROVIDER_OUTCOME_UNKNOWN', classe: 'rete', messageChiave: 'server.providerOutcome.interrupted',
                message: 'The provider response was interrupted and the outcome of the request is uncertain. Resume explicitly when you want to continue: a new request may incur another cost.',
                timestamp: 1792045692406, _sequenza: 2 }))
        await flushPromises()
        await vi.dynamicImportSettled()
        await flushPromises()
        await vi.waitFor(() => expect(w.find('[data-testid="talos-mobile-controlled-fault"]').exists()).toBe(true))
        const scheda = w.get('[data-testid="talos-mobile-controlled-fault"]')
        expect(scheda.attributes('data-fault-layer')).toBe('network')
        expect(scheda.attributes('data-fault-code')).toBe('PROVIDER_OUTCOME_UNKNOWN')
        expect(w.get('[data-testid="talos-mobile-fault-message"]').text()).toContain('The provider response was interrupted')
        expect(w.findComponent(TalosMobileMessageList).props('messages').map((m: { role: string }) => m.role)).toEqual(['user', 'system'])
        w.unmount()
    })

    /*
     * K3-C3b-1 (owner 15/10: «Foglio sul telefono, colonna sul tablet») e K3-PAN840 (owner 15/10 sera: «Foglio se il Codice è
     * stretto»). Misurato sul Pad in verticale: finestra 914 px, ma il Codice ne ha 654 (la barra laterale); con la colonna di 352 px il
     * campo del compositore scendeva a 109 px («Scrivi a»). La forma si decide dallo spazio VERO del Codice (la riga di conversazione e
     * colonna), non dalla finestra: colonna da 840 px (Android, canonical layouts: il pannello di supporto accanto da «expanded»).
     */
    it('SCR4-14 ▤ apre il foglio se il Codice è stretto (telefono, o tablet in verticale con la barra), la colonna da 840 px; segue la larghezza', async () => {
        const osservatori: { richiamo: () => void; elementi: Element[] }[] = []
        vi.stubGlobal('ResizeObserver', class {
            elementi: Element[] = []
            constructor(public richiamo: () => void) { osservatori.push(this) }
            observe(e: Element) { this.elementi.push(e) }
            unobserve() {}
            disconnect() { this.elementi = [] }
        })
        // la finestra dice «tablet» anche quando il Codice è stretto: non deve più contare
        vi.stubGlobal('matchMedia', (q: string) => ({ matches: q.includes('min-width: 640px'), media: q, addEventListener: () => undefined, removeEventListener: () => undefined }))
        try {
            stato.params = { id: 's1' }
            const w = await schermata()
            const riga = w.get('[data-testid="talos-codice-r4-riga"]').element as HTMLElement
            let larghezza = 654
            riga.getBoundingClientRect = () => ({ width: larghezza, height: 800, top: 0, left: 0, right: larghezza, bottom: 800, x: 0, y: 0, toJSON: () => ({}) }) as DOMRect
            const cambia = async (n: number) => {
                larghezza = n
                for (const o of osservatori) if (o.elementi.includes(riga)) o.richiamo()
                await flushPromises()
            }
            await cambia(654)
            const pannello = w.get('[data-testid="talos-codice-r4-pannello"]')
            await pannello.trigger('click')
            await flushPromises()
            expect(document.body.querySelector('[data-testid="talos-codice-r4-pannello-foglio"] [data-testid="talos-codice-r4-pannello-contenuto"]')).not.toBeNull()
            expect(w.find('[data-testid="talos-codice-r4-colonna"]').exists()).toBe(false)
            // il tablet ruota in orizzontale: il Codice ha 1.032 px, il pannello aperto diventa la colonna
            await cambia(1032)
            const colonna = w.get('[data-testid="talos-codice-r4-colonna"]')
            expect(colonna.find('[data-testid="talos-codice-r4-pannello-contenuto"]').exists()).toBe(true)
            expect(document.body.querySelector('[data-testid="talos-codice-r4-pannello-foglio"]')).toBeNull()
            expect(pannello.attributes('aria-expanded')).toBe('true')
            // al confine: 839 è stretto, 840 è largo
            await cambia(839)
            expect(w.find('[data-testid="talos-codice-r4-colonna"]').exists()).toBe(false)
            await cambia(840)
            expect(w.find('[data-testid="talos-codice-r4-colonna"]').exists()).toBe(true)
            await pannello.trigger('click')
            await flushPromises()
            expect(w.find('[data-testid="talos-codice-r4-colonna"]').exists()).toBe(false)
            w.unmount()
        } finally {
            vi.unstubAllGlobals()
            document.body.innerHTML = ''
        }
    })

    it('SCR4-04 chat e Codice usano la stessa costante di colonna', () => {
        const chat = readFileSync(resolve(__dirname, '..', '..', '..', 'src', 'screens', 'ChatScreen.vue'), 'utf8')
        const codice = readFileSync(resolve(__dirname, '..', '..', '..', 'src', 'screens', 'CodiceR4Screen.vue'), 'utf8')
        expect(TALOS_CLASSE_COLONNA_CHAT).toBe('mx-auto w-full max-w-[820px] px-3')
        expect(chat).toContain(':class="TALOS_CLASSE_COLONNA_CHAT"')
        expect(codice).toContain(':class="TALOS_CLASSE_COLONNA_CHAT"')
        expect(chat).not.toMatch(/class="mx-auto w-full max-w-\[820px\] px-3"/u)
    })
})

/*
 * ⛔ K3-SCR (ledger K3), misurato sul Pad il 15/10 fotogramma per fotogramma: il Codice scorreva in fondo all'arrivo dei messaggi
 * (504 su 1330), poi il markdown si componeva in differita (2442 px) e l'ancoraggio del browser lo lasciava a 723, a metà. La chat
 * resta in fondo (bordo vivo + ResizeObserver): il Codice deve fare lo stesso, e non tirare giù chi è salito col dito.
 */
describe('il Codice si apre in fondo come la chat (K3-SCR)', () => {
    it('SCR4-15 il contenuto che cresce dopo il disegno lo riporta in fondo; chi è salito col dito resta dov\'è', async () => {
        const osservatori: { richiamo: () => void; elementi: Element[] }[] = []
        vi.stubGlobal('ResizeObserver', class {
            elementi: Element[] = []
            constructor(public richiamo: () => void) { osservatori.push(this) }
            observe(e: Element) { this.elementi.push(e) }
            unobserve() {}
            disconnect() { this.elementi = [] }
        })
        stato.params = { id: 's1' }
        const w = await schermata()
        const el = w.get('[data-testid="talos-codice-r4-scorrimento"]').element as HTMLElement
        const misura = { alto: 826, vista: 826 }
        Object.defineProperty(el, 'scrollHeight', { configurable: true, get: () => misura.alto })
        Object.defineProperty(el, 'clientHeight', { configurable: true, get: () => misura.vista })
        let top = 0
        Object.defineProperty(el, 'scrollTop', { configurable: true, get: () => top, set: (v: number) => { top = Math.max(0, Math.min(v, misura.alto - misura.vista)) } })
        const scorri = async (v: number) => { top = v; el.dispatchEvent(new Event('scroll')); await flushPromises() }
        const crescita = async (alto: number) => {
            misura.alto = alto
            for (const o of osservatori) if (o.elementi.length) o.richiamo()
            await flushPromises()
        }
        misura.alto = 1330
        consegna(vivo)
        await flushPromises()
        await vi.dynamicImportSettled()
        await flushPromises()
        expect(top).toBe(504)
        // il markdown si compone dopo: l'ancoraggio porta lo scorrimento a 723 e il browser manda il suo evento
        misura.alto = 2442
        await scorri(723)
        await crescita(2442)
        expect(top).toBe(2442 - 826)
        // chi sale col dito si stacca: la crescita non lo tira giù
        el.dispatchEvent(new Event('touchstart'))
        await scorri(300)
        el.dispatchEvent(new Event('touchend'))
        await crescita(2600)
        expect(top).toBe(300)
        // torna in fondo da sé: si riattacca
        await scorri(2600 - 826)
        await crescita(2800)
        expect(top).toBe(2800 - 826)
        w.unmount()
        vi.unstubAllGlobals()
    })

    /*
     * ⛔ K3-C Accoda, misurato sul Pad il 16/10 (`coda-foto/orizzontale-in-pausa.png`): dopo «Indirizza ora» la striscia sparisce, il
     * dock si accorcia, lo spazio sotto la conversazione pure, e il browser abbassa da sé lo scorrimento. Il bordo vivo lo leggeva
     * come il dito che sale e si staccava: la carta dello Stop arrivata dopo restava dietro la striscia. La chat
     * (`ChatScreen.vue`, `heightObserver`) al cambio del compositore torna in fondo se ci si era: anche il Codice.
     */
    it('SCR4-16 il dock che si accorcia (la striscia della coda che sparisce, la tastiera che si chiude) non stacca il bordo vivo', async () => {
        const osservatori: { richiamo: () => void; elementi: Element[] }[] = []
        vi.stubGlobal('ResizeObserver', class {
            elementi: Element[] = []
            constructor(public richiamo: () => void) { osservatori.push(this) }
            observe(e: Element) { this.elementi.push(e) }
            unobserve() {}
            disconnect() { this.elementi = [] }
        })
        stato.params = { id: 's1' }
        const w = await schermata()
        const el = w.get('[data-testid="talos-codice-r4-scorrimento"]').element as HTMLElement
        const dock = w.get('[data-testid="talos-codice-r4-dock"]').element
        const misura = { alto: 2442, vista: 826 }
        Object.defineProperty(el, 'scrollHeight', { configurable: true, get: () => misura.alto })
        Object.defineProperty(el, 'clientHeight', { configurable: true, get: () => misura.vista })
        let top = 0
        Object.defineProperty(el, 'scrollTop', { configurable: true, get: () => top, set: (v: number) => { top = Math.max(0, Math.min(v, misura.alto - misura.vista)) } })
        consegna(vivo)
        await flushPromises()
        await vi.dynamicImportSettled()
        await flushPromises()
        expect(top).toBe(2442 - 826)
        el.dispatchEvent(new Event('scroll')) // come nel browser: anche lo scorrimento in fondo manda il suo evento
        await flushPromises()
        // la striscia sparisce: il dock si accorcia (il suo osservatore per primo), lo spazio in fondo cala di 152 px e il browser
        // porta lo scorrimento al nuovo massimo, poi manda il suo evento
        misura.alto = 2442 - 152
        for (const o of osservatori) if (o.elementi.includes(dock)) o.richiamo()
        top = Math.min(top, misura.alto - misura.vista)
        el.dispatchEvent(new Event('scroll'))
        await flushPromises()
        // arriva la carta dopo: si resta in fondo
        misura.alto = 2600
        for (const o of osservatori) if (o.elementi.length && !o.elementi.includes(dock)) o.richiamo()
        await flushPromises()
        expect(top).toBe(2600 - 826)
        w.unmount()
        vi.unstubAllGlobals()
    })

    /*
     * ⛔ Owner 17/10 («quando invio una domanda la risposta passa sotto il composer e scorre sotto … come fa la chat»), misurato sul
     * Pad lo stesso giorno: chi era salito a rileggere e poi mandava una domanda restava fermo a 2506 per tutto il giro, e la parte
     * nascosta sotto il compositore cresceva da 784 a 1133 px. La chat all'invio riaggancia il bordo vivo e torna in fondo
     * (`ChatScreen.vue`, «Owner 2026-07-25: sending your own message always snaps to the bottom», `rejoinLiveEdge`), e da staccati
     * mostra la pillola «torna in fondo» (F5-#28). Il Codice né l'una né l'altra.
     */
    it('SCR4-19 mandare una domanda riporta in fondo e segue la risposta; da staccati c\'è la pillola per tornare in fondo', async () => {
        const osservatori: { richiamo: () => void; elementi: Element[] }[] = []
        vi.stubGlobal('ResizeObserver', class {
            elementi: Element[] = []
            constructor(public richiamo: () => void) { osservatori.push(this) }
            observe(e: Element) { this.elementi.push(e) }
            unobserve() {}
            disconnect() { this.elementi = [] }
        })
        stato.params = { id: 's1' }
        const w = await schermata()
        const el = w.get('[data-testid="talos-codice-r4-scorrimento"]').element as HTMLElement
        const misura = { alto: 2442, vista: 826 }
        Object.defineProperty(el, 'scrollHeight', { configurable: true, get: () => misura.alto })
        Object.defineProperty(el, 'clientHeight', { configurable: true, get: () => misura.vista })
        let top = 0
        Object.defineProperty(el, 'scrollTop', { configurable: true, get: () => top, set: (v: number) => { top = Math.max(0, Math.min(v, misura.alto - misura.vista)) } })
        const scorri = async (v: number) => { top = v; el.dispatchEvent(new Event('scroll')); await flushPromises() }
        const crescita = async (alto: number) => {
            misura.alto = alto
            for (const o of osservatori) if (o.elementi.length) o.richiamo()
            await flushPromises()
        }
        consegna(vivo)
        await flushPromises()
        await vi.dynamicImportSettled()
        await flushPromises()
        expect(top).toBe(2442 - 826)
        el.dispatchEvent(new Event('scroll')) // come nel browser: anche lo scorrimento in fondo manda il suo evento
        await flushPromises()
        expect(w.find('[data-testid="talos-codice-r4-in-fondo"]').exists()).toBe(false)
        // sale a rileggere col dito: staccato, e la pillola compare
        el.dispatchEvent(new Event('touchstart'))
        await scorri(900)
        el.dispatchEvent(new Event('touchend'))
        await flushPromises()
        expect(w.find('[data-testid="talos-codice-r4-in-fondo"]').exists()).toBe(true)
        // manda una domanda: si torna in fondo, la pillola sparisce, e la risposta che cresce si segue
        await w.get('[data-testid="talos-composer-prompt"]').setValue('Riassumi la nota in una riga')
        const { default: TalosMobileComposer } = await import('@/components/chat/TalosMobileComposer.vue')
        w.findComponent(TalosMobileComposer).vm.$emit('send')
        await flushPromises()
        expect(top).toBe(2442 - 826)
        expect(w.find('[data-testid="talos-codice-r4-in-fondo"]').exists()).toBe(false)
        await crescita(3100)
        expect(top).toBe(3100 - 826)
        // la pillola riporta in fondo anche da sola
        el.dispatchEvent(new Event('touchstart'))
        await scorri(400)
        el.dispatchEvent(new Event('touchend'))
        await flushPromises()
        await w.get('[data-testid="talos-codice-r4-in-fondo"]').trigger('click')
        await flushPromises()
        expect(top).toBe(3100 - 826)
        await crescita(3300)
        expect(top).toBe(3300 - 826)
        // anche accodare è mandare il proprio messaggio: si torna in fondo
        el.dispatchEvent(new Event('touchstart'))
        await scorri(200)
        el.dispatchEvent(new Event('touchend'))
        await flushPromises()
        w.findComponent(TalosMobileComposer).vm.$emit('queue', 'E poi i test')
        await flushPromises()
        expect(top).toBe(3300 - 826)
        w.unmount()
        vi.unstubAllGlobals()
    })
})

/*
 * ⛔ K3-C Allegati A1 (ledger `LEDGER-K3-ALLEGATI-2026-10-16.md`): «Allega alla chat» dal pannello ▤ arriva nel campo come il desktop
 * (`allegaFileAllaChat`, `legacy/app.js:20218`): `@percorso ` in fondo, il fuoco al campo, l'avviso; sul telefono il foglio si chiude.
 */
describe('«Allega alla chat» dal pannello (K3-C Allegati A1)', () => {
    it('SCR4-17 i percorsi vanno nel campo come @percorso, il foglio si chiude, l\'avviso lo dice e il campo ha il fuoco', async () => {
        stato.params = { id: 's1' }
        const w = await schermata()
        const { useTalosMobileToasts } = await import('@/stores/toasts')
        const toasts = useTalosMobileToasts()
        for (const t of [...toasts.items.value]) toasts.dismiss(t.id)
        await w.get('[data-testid="talos-composer-prompt"]').setValue('Guarda @sr')
        await w.get('[data-testid="talos-codice-r4-pannello"]').trigger('click')
        await flushPromises()
        const { default: TalosCodiceR4Pannello } = await import('@/components/codice/TalosCodiceR4Pannello.vue')
        w.getComponent(TalosCodiceR4Pannello).vm.$emit('allega', ['src/app.mjs', 'NOTA.md'])
        await flushPromises()
        const campo = w.get('[data-testid="talos-composer-prompt"]').element as HTMLTextAreaElement
        expect(campo.value).toBe('Guarda @src/app.mjs @NOTA.md ')
        expect(document.body.querySelector('[data-testid="talos-codice-r4-pannello-foglio"]')).toBeNull()
        expect(toasts.items.value.map((t) => t.message)).toEqual(['Attached to chat · src/app.mjs, NOTA.md'])
        expect(document.activeElement).toBe(campo)
        w.unmount()
    })
})

/*
 * ⛔ Pad 16/10 (durante K3-C Allegati A1): ruotando il tablet la colonna ▤ diventa il foglio (e il contrario), e il pannello rinasceva
 * sulla scheda «Contesto»: la scheda scelta, le cartelle aperte e i file scelti si perdevano. La memoria del pannello la tiene la
 * schermata, una per sessione, e la passa a tutti e due.
 */
describe('il pannello ▤ resta com\'era quando il Codice cambia larghezza', () => {
    it('SCR4-18 scheda File, cartella aperta e file scelto passano dalla colonna al foglio', async () => {
        const osservatori: { richiamo: () => void; elementi: Element[] }[] = []
        vi.stubGlobal('ResizeObserver', class {
            elementi: Element[] = []
            constructor(public richiamo: () => void) { osservatori.push(this) }
            observe(e: Element) { this.elementi.push(e) }
            unobserve() {}
            disconnect() { this.elementi = [] }
        })
        const voci: Record<string, { nome: string; cartella: boolean }[]> = { '': [{ nome: 'src', cartella: true }, { nome: 'NOTA.md', cartella: false }], src: [{ nome: 'app.mjs', cartella: false }] }
        stato.rispondi = (r) => {
            const m = /\/tree\?percorso=(.*)$/u.exec(r.percorso)
            return m ? { stato: 200, corpo: JSON.stringify({ ok: true, data: { voci: voci[decodeURIComponent(m[1])] ?? [] } }) } : null
        }
        try {
            stato.params = { id: 's1' }
            const w = await schermata()
            const riga = w.get('[data-testid="talos-codice-r4-riga"]').element as HTMLElement
            let larghezza = 1032
            riga.getBoundingClientRect = () => ({ width: larghezza, height: 800, top: 0, left: 0, right: larghezza, bottom: 800, x: 0, y: 0, toJSON: () => ({}) }) as DOMRect
            const cambia = async (n: number) => {
                larghezza = n
                for (const o of osservatori) if (o.elementi.includes(riga)) o.richiamo()
                await flushPromises()
            }
            await cambia(1032)
            await w.get('[data-testid="talos-codice-r4-pannello"]').trigger('click')
            await flushPromises()
            const colonna = w.get('[data-testid="talos-codice-r4-colonna"]')
            await colonna.get('[data-scheda="file"]').trigger('click')
            await flushPromises()
            await colonna.get('[data-percorso="src"]').trigger('click')
            await flushPromises()
            await colonna.get('[data-testid="talos-codice-r4-file-scegli-NOTA.md"]').trigger('click')
            await flushPromises()
            // il tablet ruota: il Codice si stringe e il pannello diventa il foglio
            await cambia(654)
            const foglio = document.body.querySelector('[data-testid="talos-codice-r4-pannello-foglio"]')!
            expect(foglio.querySelector('[data-scheda="file"]')!.getAttribute('aria-selected')).toBe('true')
            expect(foglio.querySelector('[data-percorso="src"]')!.getAttribute('aria-expanded')).toBe('true')
            expect(foglio.querySelector('[data-percorso="src/app.mjs"]')).not.toBeNull()
            expect(foglio.querySelector('[data-testid="talos-codice-r4-file-scegli-NOTA.md"]')!.getAttribute('aria-checked')).toBe('true')
            expect(foglio.querySelector('[data-testid="talos-codice-r4-file-selezione"]')).not.toBeNull()
            // un'altra sessione ha la sua memoria: il pannello riparte da «Contesto», niente di scelto
            rotta.corrente!.params = { id: 'f1' }
            await flushPromises()
            await flushPromises()
            const dopo = document.body.querySelector('[data-testid="talos-codice-r4-pannello-foglio"]')
            expect(dopo?.querySelector('[data-scheda="contesto"]')?.getAttribute('aria-selected') ?? 'chiuso').not.toBe('false')
            expect(document.body.querySelector('[data-testid="talos-codice-r4-file-selezione"]')).toBeNull()
            w.unmount()
        } finally {
            vi.unstubAllGlobals()
            document.body.innerHTML = ''
        }
    })
})
