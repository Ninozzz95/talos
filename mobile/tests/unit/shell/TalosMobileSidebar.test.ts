// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest'
import { config, flushPromises, mount } from '@vue/test-utils'
import { Capacitor } from '@capacitor/core'
import type { TalosLocalChatSession } from '@/repositories/chatRepository'
import TalosMobileSidebar from '@/components/shell/TalosMobileSidebar.vue'
import { TALOS_IT_MESSAGES } from '@/i18n/locales/it'
import { createMemoryHistory, createRouter } from 'vue-router'

// Il ventaglio in fondo alla sidebar naviga, quindi la sidebar ora vive dentro
// un router. Basta la rotta jolly: qui non si preme nessuna voce che navighi —
// le destinazioni hanno il loro test in `talosSpeedDial.test.ts`.
const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/:pathMatch(.*)*', name: 'qualsiasi', component: { template: '<div />' } }],
})

// F1-T3 — full-width hamburger sidebar (D5/D6), chat-first Claude pattern:
// [New chat] -> Recents (sessions) -> Tools -> Settings pinned bottom.
const sessions: TalosLocalChatSession[] = [
    {
        id: 'chat-2', title: 'Release review', surface: 'chat', mode: 'verified_execution',
        persistence_mode: 'persistent', active_model_profile_id: null, metadata: {},
        created_at: '2026-07-22T10:01:00.000Z', updated_at: '2026-07-22T10:03:00.000Z',
    },
    {
        id: 'chat-1', title: 'Architecture notes', surface: 'chat', mode: 'verified_execution',
        persistence_mode: 'persistent', active_model_profile_id: null, metadata: {},
        created_at: '2026-07-22T10:00:00.000Z', updated_at: '2026-07-22T10:02:00.000Z',
    },
]

/**
 * ⛔ jsdom non implementa `showModal()`/`close()` del `<dialog>` nativo (U-1: la
 * sidebar e' un dialog come nel mockup). Lo stub tiene solo l'attributo `open`:
 * il top layer e il backdrop si verificano sul Pad, non qui.
 */
const proto = HTMLDialogElement.prototype as unknown as { showModal?: () => void, close?: () => void }
if (typeof proto.showModal !== 'function') proto.showModal = function (this: HTMLDialogElement) { this.setAttribute('open', '') }
if (typeof proto.close !== 'function') proto.close = function (this: HTMLDialogElement) { this.removeAttribute('open') }

const montate: Array<{ unmount(): void }> = []
afterEach(() => {
    // Smontare, non solo svuotare: la sidebar tiene un listener di cattura sul
    // document (il click inghiottito dopo la pressione lunga) che altrimenti
    // sopravvive alla prova e ne sporca la successiva.
    for (const w of montate.splice(0)) w.unmount()
    document.body.innerHTML = ''
})

function mountSidebar(props: Record<string, unknown> = {}) {
    const w = mount(TalosMobileSidebar, {
        attachTo: document.body,
        global: { plugins: [router] },
        props: {
            open: true,
            sessions,
            activeSessionId: 'chat-2',
            busy: false,
            creatingSession: false,
            ...props,
        },
    })
    montate.push(w)
    return w
}

describe('TalosMobileSidebar (F1-T3)', () => {
    it('GLOBAL-SIDEBAR-SHORT-LANDSCAPE-01 keeps every navigation row reachable in a short viewport', async () => {
        mountSidebar()
        await flushPromises()
        const tools = document.querySelector('[data-testid="talos-sidebar-tools"]') as HTMLElement
        const navigationFlow = tools.parentElement as HTMLElement
        expect(navigationFlow.className).toContain('overflow-y-auto')
        expect(navigationFlow.className).toContain('overscroll-contain')
    })

    /**
     * GLOBAL-SIDEBAR-ABOVE-HARNESS-01, riscritto per U-1: il cassetto e' un
     * `<dialog>` modale, quindi lo sfondo e' il suo `::backdrop` nel top layer
     * — non esiste piu' un overlay separato che possa restare sotto o sopra le
     * superfici della stazione. Resta da provare che il dialog porti il livello
     * della navigazione globale e che nessun overlay di libreria sia rimasto.
     */
    it('GLOBAL-SIDEBAR-ABOVE-HARNESS-01 raises the drawer above station surfaces, with no stray overlay', async () => {
        mountSidebar()
        await flushPromises()
        const sidebar = document.querySelector('dialog[data-testid="talos-mobile-sidebar"]') as HTMLElement
        expect(sidebar.className).toContain('var(--talos-z-global-navigation)')
        expect(document.querySelector('[data-slot="drawer-overlay"]')).toBeNull()
    })

    /**
     * DEBT-MOBILE-008, riscritto per U-1: il gesto e' NOSTRO (il composable del
     * mockup) e non c'e' piu' una libreria di cassetti in mezzo. Se domani
     * qualcuno rimettesse `vaul`, il suo drag concorrerebbe col nostro e questo
     * test cadrebbe.
     */
    it('DEBT-MOBILE-008: nessuna libreria di cassetti concorre col gesto esplicito', async () => {
        mountSidebar()
        await flushPromises()
        expect(document.querySelector('[data-vaul-drawer]')).toBeNull()
        expect(document.querySelector('[data-slot="drawer-content"]')).toBeNull()
        expect(document.querySelector('dialog[data-testid="talos-mobile-sidebar"]')).toBeTruthy()
    })

    it('DEBT-MOBILE-008: the sidebar body keeps vertical scroll and horizontal drag', async () => {
        mountSidebar({ busy: true })
        await flushPromises()
        expect(document.querySelector('[data-testid="talos-sidebar-scroll-surface"]')?.className)
            .toContain('touch-pan-y')
    })

    it('DEBT-MOBILE-008B RED: the drawer follows the finger before release', async () => {
        const wrapper = mountSidebar({ busy: true })
        await flushPromises()
        const content = document.querySelector('[data-testid="talos-sidebar-swipe-surface"]') as HTMLElement
        const drawer = document.querySelector('[data-testid="talos-mobile-sidebar"]') as HTMLElement
        const touch = (type: string, clientX: number): Event => {
            const event = new Event(type, { bubbles: true })
            Object.defineProperties(event, {
                touches: { value: type === 'touchstart' || type === 'touchmove' ? [{ clientX, clientY: 400 }] : [] },
                changedTouches: { value: type === 'touchend' ? [{ clientX, clientY: 400 }] : [] },
            })
            return event
        }
        content.dispatchEvent(touch('touchstart', 900))
        content.dispatchEvent(touch('touchmove', 700))
        await flushPromises()
        expect(drawer.style.transform).toContain('translate3d(-200px')
        expect(wrapper.emitted('update:open') ?? []).not.toContainEqual([false])
        content.dispatchEvent(touch('touchend', 700))
        await flushPromises()
        expect(wrapper.emitted('update:open')).toContainEqual([false])
    })

    it('DEBT-MOBILE-008B RED: a short drag returns the drawer to its resting position', async () => {
        const wrapper = mountSidebar({ busy: true })
        await flushPromises()
        const content = document.querySelector('[data-testid="talos-sidebar-swipe-surface"]') as HTMLElement
        const drawer = document.querySelector('[data-testid="talos-mobile-sidebar"]') as HTMLElement
        /**
         * ⛔ Il tempo e' dichiarato, non preso dall'orologio: il contratto del
         * mockup fa contare la VELOCITA' degli ultimi 90 ms (`x + vx·160`), e
         * tre eventi sintetici sparati nello stesso millisecondo sono un colpo
         * di frusta a 2.600 px/s — che CHIUDE, per progetto (REL-02). Qui il
         * dito va piano: 40 px in 200 ms, poi si ferma, e il cassetto torna.
         * Senza i timeStamp questo test cadeva quando la macchina era lenta
         * e passava quando era veloce (visto 3 volte su 9 l'11/09).
         */
        const touch = (type: string, clientX: number, at: number): Event => {
            const event = new Event(type, { bubbles: true })
            Object.defineProperties(event, {
                timeStamp: { value: at },
                touches: { value: type === 'touchstart' || type === 'touchmove' ? [{ clientX, clientY: 400 }] : [] },
                changedTouches: { value: type === 'touchend' ? [{ clientX, clientY: 400 }] : [] },
            })
            return event
        }
        content.dispatchEvent(touch('touchstart', 900, 1000))
        content.dispatchEvent(touch('touchmove', 880, 1100))
        content.dispatchEvent(touch('touchmove', 860, 1200))
        content.dispatchEvent(touch('touchend', 860, 1260))
        await flushPromises()
        expect(drawer.style.transform).toMatch(/^$|translate3d\(0px/)
        // La molla del mockup, non una transition CSS: in jsdom manca matchMedia,
        // quindi «riduzione movimento» e l'arrivo e' immediato — a riposo il
        // transform si azzera (geometria identica all'originale).
        expect(wrapper.emitted('update:open') ?? []).not.toContainEqual([false])
    })

    it('DEBT-MOBILE-008 RED: pointercancel from the scroll surface does not discard the touch swipe', async () => {
        const wrapper = mountSidebar({ busy: true })
        await flushPromises()
        const content = document.querySelector('[data-testid="talos-sidebar-swipe-surface"]') as HTMLElement
        const event = (type: string, clientX: number): Event => {
            const result = new Event(type, { bubbles: true })
            Object.defineProperties(result, {
                touches: { value: type === 'touchstart' || type === 'touchmove' ? [{ clientX, clientY: 400 }] : [] },
                changedTouches: { value: type === 'touchend' ? [{ clientX, clientY: 400 }] : [] },
            })
            return result
        }
        content.dispatchEvent(event('pointerdown', 900))
        content.dispatchEvent(event('touchstart', 900))
        content.dispatchEvent(event('pointercancel', 900))
        content.dispatchEvent(event('touchmove', 100))
        content.dispatchEvent(event('touchend', 100))
        await flushPromises()
        expect(wrapper.emitted('update:open')).toContainEqual([false])
    })

    /**
     * U-1 (11/09/2026): la struttura e' quella del mockup «Talos Calm Finale»,
     * `renderNav` — marchio con «+» e chiudi · cerca · le SEZIONI · «Recenti»
     * col conteggio · Doctor e Impostazioni fissi · il piede con l'account.
     * L'ordine chat-first di prima (Recenti sopra le sezioni) era una scelta
     * nostra; l'owner ha scelto il disegno approvato cosi' com'e'.
     */
    it('opens as a native dialog with the mockup section order: sections, then Recents, then the foot', async () => {
        mountSidebar()
        await flushPromises()
        const sidebar = document.querySelector('[data-testid="talos-mobile-sidebar"]') as HTMLDialogElement
        expect(sidebar).toBeTruthy()
        expect(sidebar.tagName).toBe('DIALOG')
        expect(sidebar.hasAttribute('open')).toBe(true)
        const html = sidebar.innerHTML
        const fab = html.indexOf('data-testid="talos-speed-dial-trigger"')
        const tools = html.indexOf('data-testid="talos-sidebar-tools"')
        const recents = html.indexOf('data-testid="talos-sidebar-recents"')
        const settings = html.indexOf('data-testid="talos-sidebar-settings"')
        expect(html.indexOf('data-testid="talos-sidebar-new-chat"')).toBe(-1)
        expect(fab).toBeGreaterThanOrEqual(0)
        expect(tools).toBeGreaterThan(fab)      // il «+» sta nel marchio, in alto
        expect(recents).toBeGreaterThan(tools)  // le sezioni prima dei Recenti
        expect(settings).toBeGreaterThan(recents)
    })

    it('lists the sessions in Recents and forwards select', async () => {
        const wrapper = mountSidebar()
        await flushPromises()
        const row = document.querySelector('[aria-label="Open chat Architecture notes"]') as HTMLElement
        expect(row).toBeTruthy()
        row.click()
        await flushPromises()
        expect(wrapper.emitted('select')).toEqual([['chat-1']])
    })

    it('F2-RED-20 keeps Model Lab under Settings instead of duplicating it in primary navigation', async () => {
        const wrapper = mountSidebar()
        await flushPromises()
        /*
         * ⛔ «Cockpit» era qui, ed e' stato TOLTO il 2026-08-09 su decisione
         * dell'owner: la voce si apriva solo per dire «non disponibile in questa
         * build», cioe' un comando morto vestito da funzione, in due tocchi
         * dalla chat.
         *
         * ⭐ Quel posto non resta vuoto per caso: ci entrera' **Codice**, la
         * fase agentica B. Finche' non c'e', la navigazione primaria ha SEI
         * voci — Memoria, Attivita', Note, Diagnostica, Ricerca approfondita,
         * Libreria — e questo test difende il fatto che non se ne intrufoli una
         * settima prima del tempo.
         */
        for (const label of ['Research', 'Library']) {
            expect(document.querySelector(`[data-testid="talos-mobile-sidebar"] [aria-label="Open ${label}"]`), label).toBeTruthy()
        }
        expect(document.querySelector('[data-testid="talos-mobile-sidebar"] [aria-label="Open Model Lab"]')).toBeNull()
        ;(document.querySelector('[aria-label="Open Research"]') as HTMLElement).click()
        ;(document.querySelector('[aria-label="Open Settings"]') as HTMLElement).click()
        await flushPromises()
        expect(wrapper.emitted('navigate')).toEqual([['research']])
        expect(wrapper.emitted('openModelLab')).toBeUndefined()
        expect(wrapper.emitted('openSettings')).toHaveLength(1)
        // B17 (12/09): Account apre la SUA scheda, non le Impostazioni generiche.
        ;(document.querySelector('[data-testid="talos-mobile-sidebar"] [aria-label="Account"]') as HTMLElement).click()
        await flushPromises()
        expect(wrapper.emitted('openAccount')).toHaveLength(1)
        expect(wrapper.emitted('openSettings')).toHaveLength(1)
    })

    /**
     * MOTION-SIDEBAR-FOCUS-01, riscritto sul `<dialog>` nativo: chiudere dal
     * pulsante riporta il fuoco a chi ha aperto; chiudere NAVIGANDO no, perche'
     * il fuoco e' gia' passato alla destinazione e riportarlo indietro lo
     * ruberebbe.
     */
    it('MOTION-SIDEBAR-FOCUS-01 restores focus to the opener on dismissal, not on navigation', async () => {
        const opener = document.createElement('button')
        opener.textContent = 'menu'
        document.body.append(opener)
        opener.focus()
        const dismissal = mountSidebar({ open: false })
        await dismissal.setProps({ open: true })
        await flushPromises()
        ;(document.querySelector('[aria-label="Close menu"]') as HTMLElement).click()
        await flushPromises()
        await dismissal.setProps({ open: false })
        await flushPromises()
        expect(document.activeElement).toBe(opener)
        dismissal.unmount()

        opener.focus()
        const navigation = mountSidebar({ open: false })
        await navigation.setProps({ open: true })
        await flushPromises()
        const altrove = document.createElement('input')
        document.body.append(altrove)
        ;(document.querySelector('[aria-label="Open Settings"]') as HTMLElement).click()
        altrove.focus() // la destinazione ha preso il fuoco
        await navigation.setProps({ open: false })
        await flushPromises()
        expect(document.activeElement).toBe(altrove)
    })

    /**
     * La chat nasce ancora QUI, non dentro il ventaglio: il ventaglio la chiede
     * e chi possiede il controller la crea, con il suo stato di attesa. Se un
     * giorno il ventaglio chiamasse il controller da sé, questo test resterebbe
     * verde mentre la sidebar smetterebbe di sapere che è successo — perciò
     * l'asserzione sta sull'evento che ESCE, non sul click.
     */
    it('emits newChat from the speed dial and closes via update:open', async () => {
        const wrapper = mountSidebar()
        await flushPromises()
        ;(document.querySelector('[data-testid="talos-speed-dial-trigger"]') as HTMLElement).click()
        await flushPromises()
        ;(document.querySelector('[data-testid="talos-speed-dial-chat"]') as HTMLElement).click()
        await flushPromises()
        expect(wrapper.emitted('newChat')).toHaveLength(1)
        // E la sidebar si è chiusa da sola: `started` porta a `update:open` false.
        expect(wrapper.emitted('update:open')?.at(-1)).toEqual([false])
        const close = document.querySelector('[aria-label="Close menu"]') as HTMLElement
        expect(close).toBeTruthy()
        close.click()
        await flushPromises()
        expect(wrapper.emitted('update:open')?.at(-1)).toEqual([false])
    })

    /**
     * U-5 (owner 11/09): sul tablet la stessa sidebar e' FISSA — nessun
     * `<dialog>`, nessun «chiudi», nessun teletrasporto in body: sta nella
     * colonna sinistra della vista divisa, come `aside#sidebar` del mockup
     * sopra 860 px. Le voci e i contratti sono gli stessi del cassetto.
     */
    it('U-5: fixed renders the same panel in line, without dialog or close button', async () => {
        const wrapper = mountSidebar({ fixed: true, open: false })
        await flushPromises()
        const root = wrapper.find('[data-testid="talos-mobile-sidebar"]')
        expect(root.exists()).toBe(true)
        expect(root.element.tagName).toBe('DIV')
        expect(root.attributes('data-fixed')).toBe('true')
        expect(root.classes()).toContain('sidebar-fixed')
        expect(document.querySelector('dialog[data-testid="talos-mobile-sidebar"]')).toBeNull()
        expect(document.querySelector('[aria-label="Close menu"]')).toBeNull()
        // Stesse voci, stesso contratto: la chat si sceglie e l'evento esce.
        expect(document.querySelector('[data-testid="talos-sidebar-chats-entry"]')).toBeTruthy()
        ;(document.querySelector('[aria-label="Open chat Architecture notes"]') as HTMLElement).click()
        expect(wrapper.emitted('select')).toEqual([['chat-1']])
    })

    it('completes the rename dialog flow and emits rename (session-drawer parity)', async () => {
        const wrapper = mountSidebar()
        await flushPromises()
        // U-1: le azioni di una chat stanno nel menu di riga, non in due bottoni affiancati.
        ;(document.querySelector('[data-testid="talos-sidebar-chat-menu-chat-2"]') as HTMLElement).click()
        await flushPromises()
        ;(document.querySelector('[data-testid="talos-sidebar-chat-rename"]') as HTMLElement).click()
        await flushPromises()
        const input = document.querySelector('[aria-label="Chat name"]') as HTMLInputElement
        expect(input).toBeTruthy()
        input.value = 'Release retro'
        input.dispatchEvent(new Event('input'))
        await flushPromises()
        ;(document.querySelector('[data-testid="talos-session-rename-submit"]') as HTMLElement).click()
        await flushPromises()
        expect(wrapper.emitted('rename')).toEqual([['chat-2', 'Release retro']])
    })

    it('B08 (12/09): il menu di una recente ha Apri e Archivia, e li emette', async () => {
        const wrapper = mountSidebar()
        await flushPromises()
        ;(document.querySelector('[data-testid="talos-sidebar-chat-menu-chat-2"]') as HTMLElement).click()
        await flushPromises()
        const voci = [...document.querySelectorAll('[role="menuitem"]')].map((v) => v.textContent?.trim())
        expect(voci).toEqual(['Open', 'Rename', 'Archive', 'Delete'])
        ;(document.querySelector('[data-testid="talos-sidebar-chat-archive"]') as HTMLElement).click()
        await flushPromises()
        expect(wrapper.emitted('archive')).toEqual([['chat-2']])
        ;(document.querySelector('[data-testid="talos-sidebar-chat-menu-chat-2"]') as HTMLElement).click()
        await flushPromises()
        ;(document.querySelector('[data-testid="talos-sidebar-chat-open"]') as HTMLElement).click()
        await flushPromises()
        expect(wrapper.emitted('select')).toEqual([['chat-2']])
    })

    it('completes the delete confirmation flow and emits delete (session-drawer parity)', async () => {
        const wrapper = mountSidebar()
        await flushPromises()
        ;(document.querySelector('[data-testid="talos-sidebar-chat-menu-chat-2"]') as HTMLElement).click()
        await flushPromises()
        ;(document.querySelector('[data-testid="talos-sidebar-chat-delete"]') as HTMLElement).click()
        await flushPromises()
        ;(document.querySelector('[data-testid="talos-session-delete-confirm"]') as HTMLElement).click()
        await flushPromises()
        // The choice rides along: the chat, and whether its Library files go too.
        expect(wrapper.emitted('delete')).toEqual([['chat-2', { deleteMedia: false }]])
    })
})

/**
 * Harness UI (24/8) — debug-only entry, appended to TOOL_DEFINITIONS rather
 * than baked in, so the six-entry F2-RED-20 test above stays exactly as it
 * was (it never mocks Capacitor, so `talosHarnessUiAvailable()` resolves to
 * the real, unavailable-in-jsdom answer there — matching a release build).
 */
describe('TalosMobileSidebar — Fase 1 Calm (12/09): Strumenti, Dispositivi, pressione lunga sulle recenti', () => {
    const attendi = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

    it('rimette la voce Strumenti (Tool Forge) fra le sezioni: sparita nel refactor, era in 95db4c4f', async () => {
        const wrapper = mountSidebar()
        await flushPromises()
        const voce = document.querySelector('[data-testid="talos-mobile-sidebar"] [aria-label="Open Tool Forge"]') as HTMLElement
        expect(voce).toBeTruthy()
        voce.click()
        await flushPromises()
        expect(wrapper.emitted('navigate')).toEqual([['toolforge']])
    })

    it('prevede «Dispositivi» ma la tiene spenta finche\' la stazione non esiste', async () => {
        mountSidebar()
        await flushPromises()
        expect(document.querySelector('[data-testid="talos-sidebar-devices-entry"]')).toBeNull()
        expect(document.querySelector('[aria-label="Open Devices"]')).toBeNull()
    })

    function pointer(type: string, target: Element, extra: Record<string, unknown> = {}): void {
        target.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true, clientX: 40, clientY: 40, button: 0, ...extra }) as PointerEvent)
    }

    it('una pressione lunga (430 ms, fermo) apre lo stesso menu dei tre puntini e inghiotte il click che segue', async () => {
        const wrapper = mountSidebar()
        await flushPromises()
        const row = document.querySelector('[aria-label="Open chat Release review"]') as HTMLElement
        pointer('pointerdown', row)
        await attendi(PRESSIONE_LUNGA_MS - 150)
        expect(document.querySelector('[data-testid="talos-row-actions-menu"]')).toBeNull()
        await attendi(200)
        await flushPromises()
        expect(document.querySelector('[data-testid="talos-row-actions-menu"]')).toBeTruthy()
        expect(document.querySelector('[data-testid="talos-sidebar-chat-rename"]')).toBeTruthy()
        // il rilascio del dito produce un click sulla riga: non deve aprire la chat
        pointer('pointerup', row)
        row.click()
        await flushPromises()
        expect(wrapper.emitted('select')).toBeUndefined()
    })

    it('una pressione breve o mossa NON apre il menu: il tocco resta un tocco', async () => {
        const wrapper = mountSidebar()
        await flushPromises()
        const row = document.querySelector('[aria-label="Open chat Release review"]') as HTMLElement
        pointer('pointerdown', row)
        await attendi(150)
        pointer('pointerup', row)
        await attendi(PRESSIONE_LUNGA_MS)
        expect(document.querySelector('[data-testid="talos-row-actions-menu"]')).toBeNull()
        pointer('pointerdown', row)
        pointer('pointermove', row, { clientX: 40 + PRESSIONE_TOLLERANZA_PX + 1 })
        await attendi(PRESSIONE_LUNGA_MS + 50)
        expect(document.querySelector('[data-testid="talos-row-actions-menu"]')).toBeNull()
        row.click()
        await flushPromises()
        expect(wrapper.emitted('select')).toEqual([['chat-2']])
    })

    it('PVOICE-REG-05 dopo la pressione lunga un click FUORI dalla riga premuta passa (solo quello della riga e\' inghiottito)', async () => {
        const wrapper = mountSidebar()
        await flushPromises()
        const row = document.querySelector('[aria-label="Open chat Release review"]') as HTMLElement
        pointer('pointerdown', row)
        await attendi(PRESSIONE_LUNGA_MS + 50)
        await flushPromises()
        expect(document.querySelector('[data-testid="talos-row-actions-menu"]')).toBeTruthy()
        // un controllo qualunque fuori dalla riga, entro i 650 ms: deve rispondere
        ;(document.querySelector('[aria-label="Open Research"]') as HTMLElement).click()
        await flushPromises()
        expect(wrapper.emitted('navigate')).toEqual([['research']])
        // il click residuo sulla riga premuta resta bloccato
        row.click()
        await flushPromises()
        expect(wrapper.emitted('select')).toBeUndefined()
    })

    it('il tasto destro apre subito il menu della riga', async () => {
        mountSidebar()
        await flushPromises()
        const line = document.querySelector('[data-chat-id="chat-1"]') as HTMLElement
        const evento = new MouseEvent('contextmenu', { bubbles: true, cancelable: true })
        line.dispatchEvent(evento)
        await flushPromises()
        expect(evento.defaultPrevented).toBe(true)
        expect(document.querySelector('[data-testid="talos-row-actions-menu"]')).toBeTruthy()
    })
})

const PRESSIONE_LUNGA_MS = 430
const PRESSIONE_TOLLERANZA_PX = 7

describe('TalosMobileSidebar — Harness UI debug-only entry (24/8)', () => {
    afterEach(() => { vi.restoreAllMocks() })

    it('stays absent when the native plugin is unavailable, same as a release build', async () => {
        mountSidebar()
        await flushPromises()
        expect(document.querySelector('[data-testid="talos-mobile-sidebar"] [aria-label="Open Code"]')).toBeNull()
    })

    it('appears and navigates when the native plugin is available (debug build)', async () => {
        vi.spyOn(Capacitor, 'isPluginAvailable').mockReturnValue(true)
        const wrapper = mountSidebar()
        await flushPromises()
        const row = document.querySelector('[data-testid="talos-mobile-sidebar"] [aria-label="Open Code"]') as HTMLElement
        expect(row).toBeTruthy()
        expect(row.textContent).not.toMatch(/Harness/i)
        row.click()
        await flushPromises()
        expect(wrapper.emitted('navigate')).toEqual([['harness']])
    })
})

/**
 * Owner 2026-09-13, foto del Pad: una chat nuova con una bozza entrava in cronologia
 * come «New chat» — il gettone inglese salvato nel database — dentro un'interfaccia
 * italiana. In INGLESE il test non morderebbe (la traduzione e il gettone coincidono):
 * per questo si prova in italiano.
 */
describe('TalosMobileSidebar — chat con bozza in cronologia', () => {
    const i18n = config.global.plugins[0] as unknown as {
        global: { locale: { value: string }, setLocaleMessage(locale: string, messages: typeof TALOS_IT_MESSAGES): void }
    }
    afterEach(() => { i18n.global.locale.value = 'en' })

    it('il titolo segnaposto si legge «Nuova chat» e porta la pastiglia «Bozza»; un titolo vero resta com\'e\'', async () => {
        i18n.global.setLocaleMessage('it', TALOS_IT_MESSAGES)
        i18n.global.locale.value = 'it'
        const base = sessions[0]!
        const wrapper = mountSidebar({
            sessions: [
                { ...base, id: 'bozza', title: 'New chat', has_messages: false, has_draft: true, updated_at: '2026-09-13T21:00:00.000Z' },
                { ...base, id: 'vera', title: 'Release review', has_messages: true, has_draft: false },
            ],
        })
        await flushPromises()
        const riga = (id: string) => document.body.querySelector<HTMLElement>('[data-chat-id="' + id + '"]')!
        expect(riga('bozza').querySelector('.recent-title')?.textContent).toBe('Nuova chat')
        expect(riga('bozza').querySelector('[data-testid="talos-chat-draft-marker"]')?.textContent).toBe('Bozza')
        // ⛔ Il verso contrario: una chat con messaggi non porta la pastiglia, e il suo titolo non si tocca.
        expect(riga('vera').querySelector('.recent-title')?.textContent).toBe('Release review')
        expect(riga('vera').querySelector('[data-testid="talos-chat-draft-marker"]')).toBeNull()
        wrapper.unmount()
    })
})
