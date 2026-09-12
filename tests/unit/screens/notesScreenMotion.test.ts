// @vitest-environment jsdom

/**
 * U-14 — il movimento del mockup «Talos Calm Finale» nella stazione Note.
 *
 * ⛔ COSA PROVANO QUESTE RIGHE, E COSA NO.
 * jsdom non anima niente: non c'è compositore, `getComputedStyle` non risolve i
 * `calc()`, e una `transition` dichiarata non produce fotogrammi. Quindi qui
 * NON si prova che il movimento si veda — quello si guarda sul Pad, a
 * fotografie scattate DURANTE.
 *
 * Si prova la cosa che jsdom sa dire, ed è quella che si rompe in silenzio: che
 * ogni animazione sia **AGGANCIATA AL MOTORE** invece che scritta a mano. Un
 * numero di millisecondi cablato nel template funziona benissimo a schermo e
 * ignora del tutto le preferenze dell'utente — è il difetto che la linguetta
 * della scheda aveva davvero (`duration-150`), e nessun test se n'era accorto
 * perché tutti guardavano il risultato e non la provenienza.
 *
 * Percio' le asserzioni sono di questa forma:
 *   - l'elemento porta l'ATTRIBUTO D'INTENTO giusto (il motore fa il resto);
 *   - il ritardo è un `calc()` su un token, MAI un numero;
 *   - il filo porta il marcatore che lo rende animabile;
 *   - le liste dichiarano le classi di FLIP e di uscita;
 *   - e oltre il tetto l'intento SPARISCE (il verso contrario).
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import NotesScreen from '@/screens/NotesScreen.vue'
import { TALOS_ENTRATA_MASSIMA } from '@/composables/useTalosCalmMotion'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import type { TalosLocalNote } from '@/repositories/chatRepository'

const shell = { notes_view: 'list' as 'grid' | 'list' }
const setShell = vi.fn(async (patch: Partial<typeof shell>) => { Object.assign(shell, patch) })

vi.mock('@/stores/settings', () => ({
    useSettingsStore: () => ({ state: { shell }, setShell }),
}))

function nota(id: string, title: string): TalosLocalNote {
    return {
        id,
        title,
        content: 'testo',
        trust_level: 'untrusted',
        content_origin: 'user-direct',
        pinned: false,
        created_at: '2026-08-01T10:00:00.000Z',
        updated_at: '2026-08-01T10:00:00.000Z',
    }
}

let notes: TalosLocalNote[] = []

/**
 * Una lista che risponde QUANDO VOGLIAMO NOI.
 *
 * Serve per guardare il primo fotogramma: con una `async` che risolve subito,
 * `flushPromises()` porta la schermata gia' allo stato finale e il lampo — che
 * e' proprio il difetto da provare — non si vedrebbe mai.
 */
let sbloccaLista: ((righe: TalosLocalNote[]) => void) | null = null
let listaDifferita = false

vi.mock('@/stores/chatController', () => ({
    useChatController: () => ({
        notes: {
            list: vi.fn(() => (listaDifferita
                ? new Promise<TalosLocalNote[]>((resolve) => { sbloccaLista = resolve })
                : Promise.resolve(notes))),
            create: vi.fn(),
            update: vi.fn(),
            remove: vi.fn(),
        },
    }),
}))

vi.mock('vue-router', () => ({
    useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn() }),
    useRoute: () => ({ name: 'notes', params: {} }),
}))

vi.mock('@/i18n', () => ({
    useTalosI18n: () => ({ t: (key: string) => key, locale: { value: 'it' } }),
}))

vi.mock('@/stores/notificationCentre', () => ({ talosNotify: vi.fn() }))

/**
 * ⛔ `TransitionGroup: false`, e non e' un dettaglio.
 *
 * Vue Test Utils SOSTITUISCE `<Transition>` e `<TransitionGroup>` con degli
 * stub, di serie. Comodo quasi sempre — e qui sarebbe esattamente il modo di
 * scrivere un test che non prova niente: lo stub accetta qualunque `move-class`
 * gli si passi, anche una che non esiste, e la promuove a superata. Con lo stub
 * spento si rende il componente vero, e le classi di FLIP si vedono dove
 * finiscono davvero.
 */
async function schermata() {
    const wrapper = mount(NotesScreen, {
        global: { stubs: { TransitionGroup: false, Transition: false } },
    })
    await flushPromises()
    return wrapper
}

beforeEach(() => {
    vi.clearAllMocks()
    shell.notes_view = 'list'
    listaDifferita = false
    sbloccaLista = null
    notes = [nota('n1', 'Prima'), nota('n2', 'Seconda'), nota('n3', 'Terza')]
})

describe('U-14 · NOTE-MOTION — l\'entrata di una riga passa dal motore', () => {
    it('NOTE-MOTION-01 ogni riga dichiara l\'intento `message-insert`', async () => {
        const wrapper = await schermata()
        const righe = wrapper.findAll('[data-testid="talos-note-row"]')
        expect(righe.length).toBe(3)
        for (const riga of righe) {
            expect(riga.attributes('data-talos-motion-intent')).toBe('message-insert')
        }
    })

    it('NOTE-MOTION-02 anche le SCHEDE, non solo le righe', async () => {
        shell.notes_view = 'grid'
        const wrapper = await schermata()
        const schede = wrapper.findAll('[data-talos-note-tile]')
        expect(schede.length).toBe(3)
        for (const scheda of schede) {
            expect(scheda.attributes('data-talos-motion-intent')).toBe('message-insert')
        }
    })

    it('NOTE-MOTION-03 il ritardo è un calc() sul token, MAI un numero di millisecondi', async () => {
        // È l'asserzione che difende la regola: un `80ms` scritto qui
        // funzionerebbe a schermo e resterebbe identico con «Movimento
        // interfaccia» spento. Il `calc()` sul token invece si annulla da sé.
        const wrapper = await schermata()
        const righe = wrapper.findAll('[data-testid="talos-note-row"]')
        expect(righe[0]!.attributes('style')).toContain('var(--talos-motion-stagger, 0ms)')
        expect(righe[0]!.attributes('style')).toContain('* 0')
        expect(righe[2]!.attributes('style')).toContain('* 2')
        for (const riga of righe) {
            expect(riga.attributes('style')).not.toMatch(/animation-delay:\s*\d+m?s/)
        }
    })

    it('NOTE-MOTION-04 AL CONTRARIO: oltre il tetto l\'intento SPARISCE', async () => {
        // `Personality.after` del mockup smette dopo la sedicesima scheda. Una
        // lista di duecento note che entrano tutte insieme non è
        // un'animazione, è un carico di lavoro.
        notes = Array.from({ length: TALOS_ENTRATA_MASSIMA + 4 }, (_, i) => nota(`n${i}`, `Nota ${i}`))
        const wrapper = await schermata()
        const righe = wrapper.findAll('[data-testid="talos-note-row"]')
        expect(righe.length).toBe(TALOS_ENTRATA_MASSIMA + 4)
        expect(righe[TALOS_ENTRATA_MASSIMA - 1]!.attributes('data-talos-motion-intent')).toBe('message-insert')
        expect(righe[TALOS_ENTRATA_MASSIMA]!.attributes('data-talos-motion-intent')).toBeUndefined()
        expect(righe.at(-1)!.attributes('data-talos-motion-intent')).toBeUndefined()
    })
})

describe('U-14 · NOTE-FLIP — le schede si riordinano invece di saltare', () => {
    it('NOTE-FLIP-01 le due viste dichiarano la classe di FLIP e quella d\'uscita', async () => {
        // Le classi sono il contratto col `<TransitionGroup>`: la geometria la
        // calcola Vue, ma solo se qualcuno dichiara COSA transita.
        const wrapper = await schermata()
        const lista = wrapper.get('[data-testid="talos-notes-list"]')
        expect(lista.exists()).toBe(true)

        // Il `tag="div"` tiene il contenitore com'era: testid e classi di
        // layout restano dov'erano, e ogni prova esistente che conta le righe
        // continua a trovarle.
        expect(lista.element.tagName).toBe('DIV')
        expect(lista.findAll('[data-testid="talos-note-row"]').length).toBe(3)

        // Le classi di FLIP e di uscita sono il contratto col TransitionGroup:
        // senza, il riordino torna a essere uno scatto e nessuno se ne accorge.
        const sorgente = readFileSync(resolve(process.cwd(), 'src', 'screens', 'NotesScreen.vue'), 'utf8')
        expect(sorgente).toContain('move-class="talos-calm-move"')
        expect(sorgente).toContain('leave-active-class="talos-calm-leave-active"')
        expect(sorgente).toContain('leave-to-class="talos-calm-leave-to"')
        // ⛔ e nessuna durata scritta a mano nel template della stazione
        expect(sorgente).not.toMatch(/duration-\[?\d+ms/)
    })

    it('NOTE-FLIP-02 il contenitore a schede conserva testid, ruolo e griglia', async () => {
        shell.notes_view = 'grid'
        const wrapper = await schermata()
        const griglia = wrapper.get('[data-testid="talos-notes-grid"]')
        expect(griglia.attributes('role')).toBe('list')
        expect(griglia.classes().join(' ')).toContain('grid')
        expect(griglia.findAll('[data-talos-note-tile]').length).toBe(3)
    })
})

describe('U-14 · NOTE-INDICATOR — il filo scivola invece di sparire', () => {
    it('NOTE-INDICATOR-01 il filo del filtro attivo porta il marcatore', async () => {
        const wrapper = await schermata()
        const filo = wrapper.get('[data-testid="talos-notes-filters"] [data-talos-indicator]')
        expect(filo.classes()).toContain('talos-calm-indicator')
    })

    it('NOTE-INDICATOR-02 ce n\'è UNO SOLO per gruppo, e segue la voce attiva', async () => {
        // Due fili nello stesso gruppo vorrebbero dire due voci attive: il
        // composable ne animerebbe uno a caso, e a schermo si vedrebbe il
        // filtro sbagliato accendersi.
        const wrapper = await schermata()
        expect(wrapper.findAll('[data-testid="talos-notes-filters"] [data-talos-indicator]')).toHaveLength(1)

        await wrapper.get('[data-testid="talos-notes-filter-pinned"]').trigger('click')
        await flushPromises()
        const fili = wrapper.findAll('[data-testid="talos-notes-filters"] [data-talos-indicator]')
        expect(fili).toHaveLength(1)
        // e sta dentro la voce che è appena diventata attiva
        expect(
            wrapper.get('[data-testid="talos-notes-filter-pinned"]').find('[data-talos-indicator]').exists(),
        ).toBe(true)
    })

    it('NOTE-INDICATOR-03 anche il selettore di vista ha il suo filo', async () => {
        // Due strisce vicine: se una scivolasse e l'altra no, si leggerebbero
        // come due grammatiche diverse nella stessa schermata.
        const wrapper = await schermata()
        const attivo = wrapper.get('[data-testid="talos-notes-view-list"]')
        expect(attivo.find('[data-talos-indicator]').exists()).toBe(true)
        expect(wrapper.get('[data-testid="talos-notes-view-grid"]').find('[data-talos-indicator]').exists()).toBe(false)
    })
})

describe('U-14 · NOTE-TOUCH — il riscontro al tocco', () => {
    it('NOTE-TOUCH-01 il corpo della riga ha la pressione da RIGA, non da bottone', async () => {
        // Mockup: `.row-main,.p-card-main,.p-list-main` rientrano a 0,992;
        // tutto il resto a 0,965. Una riga larga quanto lo schermo che cede
        // come un bottone piccolo si legge come un errore di disegno.
        const wrapper = await schermata()
        const corpo = wrapper.get('[data-testid="talos-note-row"] [data-testid="talos-note-open"]')
        expect(corpo.classes()).toContain('talos-pressable-row')
        expect(corpo.classes()).toContain('talos-wave-host')
    })

    it('NOTE-TOUCH-02 filtri e selettore di vista ospitano l\'onda', async () => {
        const wrapper = await schermata()
        expect(wrapper.get('[data-testid="talos-notes-filter-all"]').classes()).toContain('talos-wave-host')
        expect(wrapper.get('[data-testid="talos-notes-view-grid"]').classes()).toContain('talos-wave-host')
    })

    it('NOTE-TOUCH-03 un tocco su un filtro NON lascia residui nel DOM', async () => {
        // jsdom non anima, quindi `animationend` non arriva mai da solo: se il
        // cerchio non fosse tolto anche per altra via resterebbe li'. Qui si
        // prova che il tocco non rompe la riga e che il cerchio se ne va
        // quando l'animazione lo dichiara finita.
        const wrapper = await schermata()
        const filtro = wrapper.get('[data-testid="talos-notes-filter-all"]')
        const evento = new Event('pointerdown', { bubbles: true })
        Object.assign(evento, { isPrimary: true, button: 0, clientX: 10, clientY: 10 })
        filtro.element.dispatchEvent(evento)
        const cerchio = filtro.element.querySelector('.talos-touch-wave')
        if (cerchio) {
            cerchio.dispatchEvent(new Event('animationend'))
            expect(filtro.element.querySelector('.talos-touch-wave')).toBeNull()
        }
        expect(wrapper.findAll('[data-testid="talos-note-row"]')).toHaveLength(3)
    })
})

describe('U-14 · NOTE-EMPTY — il disegno dello stato vuoto si traccia', () => {
    it('NOTE-EMPTY-01 i tratti del foglio disegnato sono marcati per animarsi', async () => {
        notes = []
        const wrapper = await schermata()
        const svg = wrapper.get('[data-testid="talos-notes-empty"] svg')
        expect(svg.classes()).toContain('talos-calm-line-art')
        expect(svg.findAll('[data-talos-draw]').length).toBe(3)
    })
})


describe("U-14 · NOTE-CARICAMENTO — lo stato vuoto non lampeggia piu'", () => {
    /**
     * ⛔ VISTO SUL PAD il 12/09/2026: entrando in Note con TRE note salvate, il
     * primo fotogramma mostrava «0 appunti», «Un posto per la prossima idea» e
     * il pulsante per crearne una. Poi arrivavano le note.
     *
     * Non e' un difetto di movimento: e' una premessa sbagliata. `entries`
     * parte da un array vuoto, e `shown.length === 0` veniva letto come «non ce
     * n'e' nessuna» — mentre prima della risposta la verita' e' **«non lo so
     * ancora»**. Sono TRE stati, non due.
     *
     * Uno schermo che afferma «non ce ne sono» mentre ce ne sono tre non e' un
     * difetto estetico: e' una risposta sbagliata a una domanda appena fatta.
     */
    async function schermataInAttesa() {
        listaDifferita = true
        const wrapper = mount(NotesScreen, {
            global: { stubs: { TransitionGroup: false, Transition: false } },
        })
        await flushPromises()
        return wrapper
    }

    it("NOTE-CARICAMENTO-01 prima della risposta NON dice ne' vuoto ne' quante", async () => {
        const wrapper = await schermataInAttesa()
        expect(wrapper.find('[data-testid="talos-notes-empty"]').exists()).toBe(false)
        expect(wrapper.find('[data-testid="talos-notes-no-matches"]').exists()).toBe(false)
        // il conteggio tace: «0 appunti» sarebbe una bugia, non un'attesa
        expect(wrapper.get('[data-testid="talos-notes-count"]').text()).toBe('')
        // ma cio' che si puo' gia' usare resta li': la ricerca e i filtri
        expect(wrapper.find('[data-testid="talos-notes-search"]').exists()).toBe(true)
        expect(wrapper.find('[data-testid="talos-notes-new"]').exists()).toBe(true)
    })

    it('NOTE-CARICAMENTO-02 AL DRITTO: la lista arriva PIENA e lo stato vuoto non compare MAI', async () => {
        const wrapper = await schermataInAttesa()
        expect(wrapper.find('[data-testid="talos-notes-empty"]').exists()).toBe(false)
        sbloccaLista?.(notes)
        await flushPromises()
        expect(wrapper.findAll('[data-testid="talos-note-row"]')).toHaveLength(3)
        expect(wrapper.find('[data-testid="talos-notes-empty"]').exists()).toBe(false)
        expect(wrapper.get('[data-testid="talos-notes-count"]').text()).not.toBe('')
    })

    it('NOTE-CARICAMENTO-03 AL CONTRARIO: la lista arriva VUOTA e lo stato vuoto compare', async () => {
        // Il rimedio non deve nascondere lo stato vuoto quando serve davvero:
        // una pagina che non dice niente nemmeno a lista vuota si legge come un
        // guasto, ed e' il motivo per cui quel disegno esiste.
        const wrapper = await schermataInAttesa()
        sbloccaLista?.([])
        await flushPromises()
        expect(wrapper.find('[data-testid="talos-notes-empty"]').exists()).toBe(true)
        expect(wrapper.find('[data-testid="talos-notes-empty-new"]').exists()).toBe(true)
    })

    it('NOTE-CARICAMENTO-04 i due stati vuoti restano DUE: filtro che nasconde vs niente', async () => {
        const wrapper = await schermataInAttesa()
        sbloccaLista?.(notes)
        await flushPromises()
        await wrapper.get('[data-testid="talos-notes-filter-pinned"]').trigger('click')
        await flushPromises()
        // nessuna e' in evidenza: e' il filtro a nasconderle, e si puo' annullare
        expect(wrapper.find('[data-testid="talos-notes-no-matches"]').exists()).toBe(true)
        expect(wrapper.find('[data-testid="talos-notes-empty"]').exists()).toBe(false)
        expect(wrapper.find('[data-testid="talos-notes-clear-filters"]').exists()).toBe(true)
    })
})
