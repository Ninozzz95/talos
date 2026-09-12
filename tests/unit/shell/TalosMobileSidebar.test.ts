// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { Capacitor } from '@capacitor/core'
import type { TalosLocalChatSession } from '@/repositories/chatRepository'
import TalosMobileSidebar from '@/components/shell/TalosMobileSidebar.vue'
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

afterEach(() => {
    document.body.innerHTML = ''
})

function mountSidebar(props: Record<string, unknown> = {}) {
    return mount(TalosMobileSidebar, {
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
