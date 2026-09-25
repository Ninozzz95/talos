// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import TalosRowActions from '@/components/talos/ui/TalosRowActions.vue'
import {
    handleTalosOverlayBack,
    talosOverlayBackActive,
    __resetTalosOverlayBackForTests,
} from '@/composables/useTalosOverlayBack'

/**
 * The visible path to a row's actions.
 *
 * Built 2026-08-03 after the research found the app had this backwards: Android
 * Design puts an overflow control inside the list item, and every Google app it
 * checked spends tap-and-hold on selection. The decisive part was not taste —
 * inside a WebView there is no public way to give one DOM row an Android
 * accessibility action, so a real button is the only path TalkBack can reach.
 */
const ITEMS = [
    { id: 'open', label: 'Apri', testId: 'act-open' },
    { id: 'rename', label: 'Rinomina', testId: 'act-rename' },
    { id: 'pause', label: 'Metti in pausa', testId: 'act-pause' },
    { id: 'delete', label: 'Elimina', danger: true, testId: 'act-delete' },
]

function open(items = ITEMS) {
    return mount(TalosRowActions, {
        props: { label: 'Altre azioni per Quando è uscito il primo iPhone', items },
        attachTo: document.body,
    })
}

function menu() {
    return document.querySelector('[data-testid="talos-row-actions-menu"]')
}

function entries(): HTMLElement[] {
    return [...document.querySelectorAll<HTMLElement>('[role="menuitem"]')]
}

beforeEach(() => {
    document.body.innerHTML = ''
    __resetTalosOverlayBackForTests()
})

describe('the row actions button', () => {
    it('announces itself by the ROW, not as one of twenty buttons called More', async () => {
        // Twenty identical "More" buttons are twenty identical stops for anyone
        // moving by voice or by swipe.
        const wrapper = open()
        const button = wrapper.get('button')

        expect(button.attributes('aria-label')).toBe('Altre azioni per Quando è uscito il primo iPhone')
        expect(button.attributes('aria-haspopup')).toBe('menu')
        expect(button.attributes('aria-expanded')).toBe('false')
        expect(button.attributes('aria-controls')).toBeUndefined()

        await button.trigger('click')
        expect(button.attributes('aria-expanded')).toBe('true')
        // The control it points at has to be the panel that actually appeared.
        expect(button.attributes('aria-controls')).toBe(menu()?.id)
    })

    it('is a real button with a touch target, not a decorated span', async () => {
        const wrapper = open()
        const button = wrapper.get('button')
        expect(button.element.tagName).toBe('BUTTON')
        // 44px each way — the class, because jsdom has no layout to measure.
        // 48 dp: la soglia Android. Il menu della Libreria, assorbito qui, la
        // rispettava mentre questo no — unificare ha preso il valore migliore.
        expect(button.classes()).toContain('size-12')
    })

    it('moves the focus into the menu when it opens', async () => {
        // Leaving the focus on the trigger behind an open panel is how someone
        // ends up driving a menu they were never told had opened.
        const wrapper = open()
        await wrapper.get('button').trigger('click')
        await wrapper.vm.$nextTick()

        expect(document.activeElement).toBe(entries()[0])
        expect(entries()[0]!.getAttribute('tabindex')).toBe('0')
        // One tab stop for the whole menu: the others are reached with arrows.
        expect(entries()[1]!.getAttribute('tabindex')).toBe('-1')
    })

    it('walks with the arrows, wraps, and jumps with Home and End', async () => {
        const wrapper = open()
        await wrapper.get('button').trigger('click')
        await wrapper.vm.$nextTick()
        const panel = menu()!

        panel.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true }))
        await wrapper.vm.$nextTick()
        // Up from the first wraps to the last, rather than stopping dead.
        expect(document.activeElement).toBe(entries()[3])

        panel.dispatchEvent(new KeyboardEvent('keydown', { key: 'Home', bubbles: true }))
        await wrapper.vm.$nextTick()
        expect(document.activeElement).toBe(entries()[0])

        panel.dispatchEvent(new KeyboardEvent('keydown', { key: 'End', bubbles: true }))
        await wrapper.vm.$nextTick()
        expect(document.activeElement).toBe(entries()[3])
    })

    it('finds an entry by its first letter', async () => {
        const wrapper = open()
        await wrapper.get('button').trigger('click')
        await wrapper.vm.$nextTick()

        menu()!.dispatchEvent(new KeyboardEvent('keydown', { key: 'r', bubbles: true }))
        await wrapper.vm.$nextTick()
        expect(document.activeElement).toBe(entries()[1])
    })

    it('closes on Escape and gives the focus back to the button that opened it', async () => {
        const wrapper = open()
        const button = wrapper.get('button')
        await button.trigger('click')
        await wrapper.vm.$nextTick()

        menu()!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
        await wrapper.vm.$nextTick()

        expect(menu()).toBeNull()
        expect(document.activeElement).toBe(button.element)
    })

    it('chooses without leaving the menu hanging over what comes next', async () => {
        // A menu still open over a confirmation dialog steals the focus the
        // dialog is trying to take.
        const wrapper = open()
        await wrapper.get('button').trigger('click')
        await wrapper.vm.$nextTick()

        entries()[1]!.click()
        await wrapper.vm.$nextTick()

        expect(wrapper.emitted('select')?.[0]).toEqual(['rename'])
        expect(menu()).toBeNull()
    })

    it('does not hand the focus back to a row that is about to disappear', async () => {
        // After Delete the trigger may not exist a moment later; the caller
        // decides where the focus goes next.
        const wrapper = open()
        const button = wrapper.get('button')
        await button.trigger('click')
        await wrapper.vm.$nextTick()

        entries()[3]!.click()
        await wrapper.vm.$nextTick()

        expect(wrapper.emitted('select')?.[0]).toEqual(['delete'])
        expect(document.activeElement).not.toBe(button.element)
    })

    it('sets the destructive entry apart without making colour the only signal', async () => {
        const wrapper = open()
        await wrapper.get('button').trigger('click')
        await wrapper.vm.$nextTick()

        // Still a menuitem, still named in words. The rule above it is the
        // separation; the colour only reinforces it.
        expect(entries()[3]!.getAttribute('role')).toBe('menuitem')
        expect(entries()[3]!.textContent?.trim()).toBe('Elimina')
        expect(menu()!.querySelectorAll('[aria-hidden="true"]')).toHaveLength(1)

        /**
         * And it sits on the surface its colour was designed for.
         * `talosContrast.ts` states the contract: `--talos-danger` is only
         * guaranteed legible ON `--talos-danger-soft`. Used as bare text over
         * the neutral menu it resolved to #fee2e2 on the tablet — near white,
         * saying nothing.
         */
        expect(entries()[3]!.className).toContain('bg-[var(--talos-danger-soft)]')
        expect(entries()[3]!.className).toContain('text-[var(--talos-danger)]')
    })

    it('offers only the actions that apply, never a list of dead entries', async () => {
        // Which actions exist is a fact about the thing. A menu of disabled
        // entries makes the reader work out why they are disabled.
        const wrapper = open([{ id: 'resume', label: 'Riprendi' }])
        await wrapper.get('button').trigger('click')
        await wrapper.vm.$nextTick()

        expect(entries()).toHaveLength(1)
        expect(entries()[0]!.textContent?.trim()).toBe('Riprendi')
    })

    it('a tap outside closes it without reaching the row underneath', async () => {
        const wrapper = open()
        await wrapper.get('button').trigger('click')
        await wrapper.vm.$nextTick()

        const scrim = document.querySelector<HTMLElement>('[data-testid="talos-row-actions-scrim"]')!
        scrim.click()
        await wrapper.vm.$nextTick()

        expect(menu()).toBeNull()
    })

    it('F2-RED-18 paints a teleported menu above dialogs but below the lock screen', async () => {
        const wrapper = open()
        await wrapper.get('button').trigger('click')
        await wrapper.vm.$nextTick()

        const scrim = document.querySelector<HTMLElement>('[data-testid="talos-row-actions-scrim"]')!
        // TALOS dialog/viewer = 95, select = 100, lock screen = 120.
        expect(scrim.classList).toContain('z-[110]')
        expect(scrim.classList).not.toContain('z-[90]')
    })

    it('is what System Back closes first, and only while it is open', async () => {
        /**
         * Found on the tablet: with a layer open, Back walked past it to the
         * station rule and threw the person out to the chat with the main menu
         * open. `isActive` matters here specifically — one of these is mounted
         * per ROW, so a list of ten would otherwise put ten always-open entries
         * on the stack and the first Back anywhere would close a menu nobody
         * had opened.
         */
        const wrapper = open()
        expect(talosOverlayBackActive()).toBe(false)

        await wrapper.get('button').trigger('click')
        await wrapper.vm.$nextTick()
        expect(talosOverlayBackActive()).toBe(true)

        expect(handleTalosOverlayBack()).toBe(true)
        await wrapper.vm.$nextTick()
        expect(menu()).toBeNull()
        expect(talosOverlayBackActive()).toBe(false)
    })
})

/**
 * ⛔ Pad, 14/09, 360 px (foto dell'owner dal telefono): il ⋯ della scheda di SINISTRA aveva il bordo destro a
 * 167 e il pannello, largo 176 e ancorato a destra, finiva col bordo sinistro a −9. jsdom non misura niente:
 * le misure sono quelle del Pad, finte qui.
 */
describe('tiene il pannello dentro lo schermo', () => {
    const larghezzaOriginale = window.innerWidth
    const altezzaOriginale = window.innerHeight
    afterEach(() => {
        Object.defineProperty(window, 'innerWidth', { configurable: true, value: larghezzaOriginale })
        Object.defineProperty(window, 'innerHeight', { configurable: true, value: altezzaOriginale })
        vi.restoreAllMocks()
    })

    function misure(bordoDestroPulsante: number, top = 400) {
        Object.defineProperty(window, 'innerWidth', { configurable: true, value: 360 })
        vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function (this: Element) {
            const rett = (left: number, width: number, top: number, height: number) => ({ left, width, top, height, right: left + width, bottom: top + height, x: left, y: top, toJSON: () => ({}) }) as DOMRect
            if (this.getAttribute('data-testid') === 'talos-row-actions-menu') return rett(0, 172, 0, 200)
            if (this.tagName === 'BUTTON' && this.getAttribute('aria-haspopup') === 'menu') return rett(bordoDestroPulsante - 44, 44, top, 48)
            return rett(0, 0, 0, 0)
        })
        // The entrance scales the painted rectangle; the final layout is wider.
        vi.spyOn(HTMLElement.prototype, 'offsetWidth', 'get').mockImplementation(function (this: HTMLElement) {
            return this.getAttribute('data-testid') === 'talos-row-actions-menu' ? 176 : 0
        })
    }

    it('MENU-BOUNDS-03 keeps the final menu inside the viewport while its entrance is scaled', async () => {
        misure(167)
        const wrapper = open()
        await wrapper.get('button').trigger('click')
        await wrapper.vm.$nextTick()
        const destra = parseFloat((menu() as HTMLElement).style.right)
        // 360 − destra − 176 = bordo sinistro: almeno i 6 px di margine, mai sotto zero.
        expect(360 - destra - 176).toBeGreaterThanOrEqual(6)
    })

    it('MENU-BOUNDS-04 flips using the measured height when real rows exceed the estimate', async () => {
        misure(167, 540)
        Object.defineProperty(window, 'innerHeight', { configurable: true, value: 800 })
        vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockReturnValue(211)
        const wrapper = open()
        await wrapper.get('button').trigger('click')
        await wrapper.vm.$nextTick()
        const top = parseFloat((menu() as HTMLElement).style.top)
        expect(top + 211).toBeLessThanOrEqual(794)
        expect(top + 211).toBeLessThanOrEqual(540 - 6)
    })

    it('MENU-BOUNDS-05 makes intrinsic menu width independent of the anchor position', async () => {
        misure(167)
        const wrapper = open()
        await wrapper.get('button').trigger('click')
        await wrapper.vm.$nextTick()
        // CSS width:auto shrinks to available space, then grows again after the
        // horizontal shift. max-content keeps the measured width valid.
        expect(menu()!.classList.contains('w-max')).toBe(true)
        expect(menu()!.classList.contains('overflow-y-auto')).toBe(true)
    })

    it('al contrario: col ⋯ vicino al bordo destro il pannello resta ancorato al pulsante', async () => {
        misure(340)
        const wrapper = open()
        await wrapper.get('button').trigger('click')
        await wrapper.vm.$nextTick()
        expect(parseFloat((menu() as HTMLElement).style.right)).toBe(20)
    })
})

/**
 * ⛔ Pad, 24/09/2026 (prova B3 della coda, tocco vero): aperto il ⋯ con la tastiera su, il fuoco entra nel menu
 * (APG), la tastiera si chiude, la finestra si allunga e il ⋯ scende di ~660 px — ma il pannello restava dov'era il
 * pulsante PRIMA, a metà conversazione. Come `autoUpdate` di Floating UI (https://floating-ui.com/docs/autoUpdate,
 * letto il 24/09/2026): mentre è aperto si riposiziona quando la finestra cambia, e gli ascoltatori si tolgono alla
 * chiusura («only while the floating element is open»).
 */
describe('segue il suo pulsante quando la finestra cambia', () => {
    const altezzaOriginale = window.innerHeight
    afterEach(() => {
        Object.defineProperty(window, 'innerHeight', { configurable: true, value: altezzaOriginale })
        vi.restoreAllMocks()
    })

    function pulsanteA(posizione: { top: number }) {
        vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function (this: Element) {
            const rett = (left: number, width: number, top: number, height: number) => ({ left, width, top, height, right: left + width, bottom: top + height, x: left, y: top, toJSON: () => ({}) }) as DOMRect
            if (this.tagName === 'BUTTON' && this.getAttribute('aria-haspopup') === 'menu') return rett(300, 44, posizione.top, 48)
            return rett(0, 0, 0, 0)
        })
        vi.spyOn(HTMLElement.prototype, 'offsetWidth', 'get').mockImplementation(function (this: HTMLElement) {
            return this.getAttribute('data-testid') === 'talos-row-actions-menu' ? 176 : 0
        })
    }

    it('MENU-BOUNDS-07 la tastiera si chiude col menu aperto: il pannello resta attaccato al suo ⋯', async () => {
        Object.defineProperty(window, 'innerHeight', { configurable: true, value: 900 })
        const posizione = { top: 400 }
        pulsanteA(posizione)
        const wrapper = open()
        await wrapper.get('button').trigger('click')
        await wrapper.vm.$nextTick()
        expect(parseFloat((menu() as HTMLElement).style.top)).toBe(400 + 48 + 6)
        // La tastiera si chiude: la finestra si allunga e il ⋯ scende.
        Object.defineProperty(window, 'innerHeight', { configurable: true, value: 1400 })
        posizione.top = 1060
        window.dispatchEvent(new Event('resize'))
        await wrapper.vm.$nextTick()
        expect(parseFloat((menu() as HTMLElement).style.top)).toBe(1060 + 48 + 6)
        wrapper.unmount()
    })

    it('MENU-BOUNDS-08 al contrario: a menu chiuso nessun ascoltatore resta attaccato alla finestra', async () => {
        const aggiunti: string[] = []
        const tolti: string[] = []
        const add = window.addEventListener.bind(window)
        const remove = window.removeEventListener.bind(window)
        vi.spyOn(window, 'addEventListener').mockImplementation((tipo: string, ...resto: unknown[]) => { aggiunti.push(tipo); return (add as (...a: unknown[]) => void)(tipo, ...resto) })
        vi.spyOn(window, 'removeEventListener').mockImplementation((tipo: string, ...resto: unknown[]) => { tolti.push(tipo); return (remove as (...a: unknown[]) => void)(tipo, ...resto) })
        const wrapper = open()
        await wrapper.get('button').trigger('click')
        await wrapper.vm.$nextTick()
        expect(aggiunti).toContain('resize')
        await wrapper.get('button').trigger('click')
        await wrapper.vm.$nextTick()
        for (const tipo of ['resize', 'scroll']) {
            expect(tolti.filter((t) => t === tipo).length, tipo).toBe(aggiunti.filter((t) => t === tipo).length)
        }
        wrapper.unmount()
    })
})
