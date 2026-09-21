// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { Capacitor } from '@capacitor/core'
import type { TalosLocalChatSession } from '@/repositories/chatRepository'
import TalosMobileSidebar from '@/components/shell/TalosMobileSidebar.vue'
import { Drawer, DrawerContent } from '@/components/ui/drawer'
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

    it('GLOBAL-SIDEBAR-ABOVE-HARNESS-01 raises both the drawer and its overlay above station surfaces', async () => {
        mountSidebar()
        await flushPromises()
        const sidebar = document.querySelector('[data-testid="talos-mobile-sidebar"]') as HTMLElement
        const overlay = document.querySelector('[data-slot="drawer-overlay"]') as HTMLElement
        expect(sidebar.className).toContain('var(--talos-z-global-navigation)')
        expect(overlay.className).toContain('var(--talos-z-global-navigation)')
        expect(overlay.className).toContain('pointer-events-none')
    })

    it('DEBT-MOBILE-008: Vaul does not compete with the explicit sidebar gesture', async () => {
        const wrapper = mountSidebar({ busy: true })
        await flushPromises()
        expect(wrapper.findComponent(Drawer).props('dismissible')).toBe(false)
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
        expect(wrapper.emitted('update:open')).not.toContainEqual([false])
        content.dispatchEvent(touch('touchend', 700))
        await flushPromises()
        expect(wrapper.emitted('update:open')).toContainEqual([false])
    })

    it('DEBT-MOBILE-008B RED: a short drag returns the drawer to its resting position', async () => {
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
        content.dispatchEvent(touch('touchmove', 860))
        content.dispatchEvent(touch('touchend', 860))
        await flushPromises()
        expect(drawer.style.transform).toContain('translate3d(0px')
        expect(drawer.style.transition).toContain('var(--talos-motion-duration-control')
        expect(wrapper.emitted('update:open')).not.toContainEqual([false])
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

    it('opens as a full-width dialog with the chat-first section order', async () => {
        // Owner 2026-07-24: the single New-chat affordance is the bottom FAB
        // (inside the settings bar) — no duplicate outline button up top.
        // Owner 2026-08-06: quel FAB è diventato un ventaglio, e resta comunque
        // uno solo — la posizione è la stessa, cambia cosa sa cominciare.
        mountSidebar()
        await flushPromises()
        const sidebar = document.querySelector('[data-testid="talos-mobile-sidebar"]') as HTMLElement
        expect(sidebar).toBeTruthy()
        const html = sidebar.innerHTML
        const recents = html.indexOf('data-testid="talos-sidebar-recents"')
        const tools = html.indexOf('data-testid="talos-sidebar-tools"')
        const settings = html.indexOf('data-testid="talos-sidebar-settings"')
        const fab = html.indexOf('data-testid="talos-speed-dial-trigger"')
        expect(html.indexOf('data-testid="talos-sidebar-new-chat"')).toBe(-1)
        expect(recents).toBeGreaterThanOrEqual(0)
        expect(tools).toBeGreaterThan(recents)
        expect(settings).toBeGreaterThan(tools)
        expect(fab).toBeGreaterThan(settings) // the FAB lives in the bottom settings bar
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

    it('MOTION-SIDEBAR-FOCUS-01 suppresses close autofocus only when navigation transfers focus', async () => {
        const navigationWrapper = mountSidebar()
        await flushPromises()
        ;(document.querySelector('[aria-label="Open Settings"]') as HTMLElement).click()
        const navigationClose = new Event('closeAutoFocus', { cancelable: true })
        navigationWrapper.findComponent(DrawerContent).vm.$emit('closeAutoFocus', navigationClose)
        expect(navigationClose.defaultPrevented).toBe(true)
        navigationWrapper.unmount()

        const dismissalWrapper = mountSidebar()
        await flushPromises()
        ;(document.querySelector('[aria-label="Close menu"]') as HTMLElement).click()
        const dismissalClose = new Event('closeAutoFocus', { cancelable: true })
        dismissalWrapper.findComponent(DrawerContent).vm.$emit('closeAutoFocus', dismissalClose)
        expect(dismissalClose.defaultPrevented).toBe(false)
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

    it('completes the rename dialog flow and emits rename (session-drawer parity)', async () => {
        const wrapper = mountSidebar()
        await flushPromises()
        ;(document.querySelector('[aria-label="Rename Release review"]') as HTMLElement).click()
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
        ;(document.querySelector('[aria-label="Delete Release review"]') as HTMLElement).click()
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
