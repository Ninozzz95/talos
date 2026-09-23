// @vitest-environment jsdom

import { describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import TalosMobileToolSheet from '@/components/shell/TalosMobileToolSheet.vue'
import { defineComponent, h, nextTick } from 'vue'
import { useTalosSheetTitle } from '@/lib/sheetTitle'

/*
 * Le due icone della barra sono componenti ASINCRONI, e questi casi non le
 * riguardano: montandole per davvero, il loro grafo di moduli continua a
 * caricarsi mentre il caso e' gia' finito, e Vitest lo segnala come rifiuto non
 * gestito («after the environment was torn down»).
 *
 * Si sostituisce il MODULO e non il componente: in `<script setup>` i componenti
 * sono riferimenti diretti e non nomi, quindi `global.stubs` non li intercetta —
 * provato, e infatti non funzionava.
 *
 * E sono asincroni per una ragione misurata: renderle sincrone per far tacere
 * una prova costa **60 KB** nel grafo d'avvio, che ha meno di 3 KB di margine.
 */
/*
 * ⛔ `__esModule: true` NON è cerimonia — è la riga che mancava.
 *
 * `defineAsyncComponent` riceve il MODULO risolto e, se non sa che è un
 * modulo ES, non scarta l'involucro: va a chiedergli `__isTeleport`, e la
 * guardia di Vitest alza «No "__isTeleport" export is defined». Erano SEI
 * delle ventuno rejection del compito #57, da questo file solo — con zero
 * test falliti, quindi invisibili se non si legge il testo dell'errore.
 */
vi.mock('@/components/shell/TalosMobileNotificationBell.vue', () => ({
    __esModule: true,
    default: { name: 'TalosMobileNotificationBell', render: () => null },
}))
vi.mock('@/components/shell/TalosMobileDownloadCenterTrigger.vue', () => ({
    __esModule: true,
    default: { name: 'TalosMobileDownloadCenterTrigger', render: () => null },
}))

describe('TalosMobileToolSheet (station sheet over chat)', () => {
    /**
     * U-7 (owner 11/09/2026): sulla RADICE di una stazione niente freccia —
     * icona + titolo e il ☰ del telefono (`talos-sheet-menu`, apre la
     * sidebar); la freccia resta solo dentro (pagina figlia, sotto-vista) o
     * quando il guscio la chiede (`rootBack`: tablet senza sidebar).
     */
    it('renders a labelled modal dialog with the phone menu button, no back arrow on a station root, and slot body', () => {
        const w = mount(TalosMobileToolSheet, {
            props: { title: 'Runtime cockpit' },
            slots: { default: '<p data-testid="sheet-content">runs</p>' },
        })
        const dialog = w.get('[data-testid="talos-mobile-tool-sheet"]')
        expect(dialog.attributes('role')).toBe('dialog')
        expect(dialog.attributes('aria-modal')).toBe('true')
        expect(dialog.attributes('aria-label')).toBe('Runtime cockpit')
        expect(w.find('[aria-label="Back to chat"]').exists()).toBe(false)
        expect(w.find('[data-testid="talos-sheet-menu"]').exists()).toBe(true)
        // SF-critic F3 #7: fullscreen keeps ONE honest dismissal (the system
        // Back); the X exists only in the drawer presentation.
        expect(w.find('[aria-label="Close Runtime cockpit"]').exists()).toBe(false)
        expect(w.get('[data-testid="sheet-content"]').text()).toBe('runs')
        expect(w.text()).toContain('Runtime cockpit')
    })

    it('emits openMenu from the phone menu button, close from X in drawer presentation, and close from the root back arrow when the shell asks for it', async () => {
        const w = mount(TalosMobileToolSheet, { props: { title: 'Library', presentation: 'drawer' } })
        await w.get('[data-testid="talos-sheet-menu"]').trigger('click')
        expect(w.emitted('openMenu')).toHaveLength(1)
        await w.get('[aria-label="Close Library"]').trigger('click')
        expect(w.emitted('close')).toHaveLength(1)

        // Tablet dentro Impostazioni: niente sidebar, niente ☰ — la freccia torna.
        const t = mount(TalosMobileToolSheet, { props: { title: 'Library', hideMenu: true, rootBack: true } })
        expect(t.find('[data-testid="talos-sheet-menu"]').exists()).toBe(false)
        await t.get('[aria-label="Back to chat"]').trigger('click')
        expect(t.emitted('close')).toHaveLength(1)

        // Tablet con la sidebar fissa: ne' ☰ ne' freccia — si torna dalla sidebar.
        const s = mount(TalosMobileToolSheet, { props: { title: 'Library', hideMenu: true } })
        expect(s.find('[data-testid="talos-sheet-menu"]').exists()).toBe(false)
        expect(s.find('[data-testid="talos-sheet-back"]').exists()).toBe(false)
    })

    it('emits close when the backdrop is clicked', async () => {
        const w = mount(TalosMobileToolSheet, { props: { title: 'Library' } })
        await w.get('[data-testid="talos-mobile-sheet-backdrop"]').trigger('click')
        expect(w.emitted('close')).toHaveLength(1)
    })

    it('HARNESS-OUTER-SCROLL-01 locks the station body when the embedded surface owns scrolling', () => {
        const w = mount(TalosMobileToolSheet, {
            props: { title: 'Harness', lockBodyScroll: true } as never,
            slots: { default: '<div>embedded harness</div>' },
        })
        const body = w.get('[data-testid="talos-mobile-sheet-body"]')
        expect(body.classes()).toContain('overflow-hidden')
        expect(body.classes()).not.toContain('overflow-y-auto')
    })

    it('HARNESS-OUTER-SCROLL-01 keeps ordinary station bodies scrollable', () => {
        const w = mount(TalosMobileToolSheet, { props: { title: 'Library' } })
        const body = w.get('[data-testid="talos-mobile-sheet-body"]')
        expect(body.classes()).toContain('overflow-y-auto')
        expect(body.classes()).not.toContain('overflow-hidden')
    })

    it('CODE-MODAL-NO-HORIZONTAL-PAN-01 clips the surface without making it a hidden scroll container', () => {
        const w = mount(TalosMobileToolSheet, {
            props: { title: 'Code', lockBodyScroll: true, hideChrome: true } as never,
        })
        const surface = w.get('[data-testid="talos-mobile-tool-sheet"]')

        expect(surface.classes()).toContain('overflow-clip')
        expect(surface.classes()).not.toContain('overflow-hidden')
    })

    it('CODE-SESSION-FIRST-HEADER-01 starts Codice from the session topbar without duplicate sheet chrome', () => {
        const w = mount(TalosMobileToolSheet, {
            props: { title: 'Code', lockBodyScroll: true, hideChrome: true } as never,
            slots: { default: '<div data-testid="session-topbar">Refactor auth flow</div>' },
        })

        const dialog = w.get('[data-testid="talos-mobile-tool-sheet"]')
        expect(dialog.attributes('aria-label')).toBe('Code')
        expect(w.find('.talos-mobile-tool-sheet-header').exists()).toBe(false)
        expect(w.find('[data-testid="talos-sheet-back"]').exists()).toBe(false)
        expect(w.get('[data-testid="talos-mobile-sheet-body"]').classes())
            .toContain('talos-mobile-tool-sheet-body-chromeless')
        expect(w.get('[data-testid="session-topbar"]').text()).toBe('Refactor auth flow')
    })

    /**
     * Owner 2026-09-13/14: la barra fissa se ne va. Resta il tondo del menu, e una barra col
     * titolo che compare solo scorrendo. ⛔ Il verso contrario: nessuna barra fissa.
     */
    it('CODE-OTHER-STATIONS-CHROME-01 niente barra fissa: tondo del menu e barra che si ripiega col titolo', () => {
        const w = mount(TalosMobileToolSheet, { props: { title: 'Library' } })

        expect(w.find('.talos-mobile-tool-sheet-header').exists()).toBe(false)
        expect(w.get('[data-testid="talos-sheet-bar"]').text()).toContain('Library')
        expect(w.get('[data-testid="talos-sheet-menu"]').classes()).toContain('rounded-full')
        // il contenuto scende sotto la riga dei tondi solo perche' qui un tondo c'e'
        expect(w.get('[data-testid="talos-mobile-sheet-body"]').attributes('data-under-controls')).toBe('true')
    })

    /**
     * ⛔ Misurato sul Pad il 14/09: nella Libreria scorre un figlio (`mobile-screen-body`), non il
     * corpo del foglio. La barra deve seguire CHI SCORRE. jsdom non ha la linea di scorrimento
     * del CSS, quindi qui gira il ripiego: marca lo scorritore e accende la barra oltre 48 px.
     */
    it('segue lo scorritore VERO (un figlio), lo marca, e ignora chi non scorre in verticale', async () => {
        const w = mount(TalosMobileToolSheet, { attachTo: document.body, props: { title: 'Library' }, slots: { default: '<div data-testid="figlio" style="overflow-y:auto"><p>contenuto</p></div><div data-testid="schede"></div>' } })
        const figlio = w.get('[data-testid="figlio"]').element as HTMLElement
        const schede = w.get('[data-testid="schede"]').element as HTMLElement
        Object.defineProperty(figlio, 'scrollHeight', { configurable: true, value: 3000 })
        Object.defineProperty(figlio, 'clientHeight', { configurable: true, value: 800 })
        // ⛔ Il verso contrario: una riga che non scorre in verticale non diventa lo scorritore.
        Object.defineProperty(schede, 'scrollHeight', { configurable: true, value: 48 })
        Object.defineProperty(schede, 'clientHeight', { configurable: true, value: 48 })
        schede.dispatchEvent(new Event('scroll'))
        expect(schede.hasAttribute('data-talos-sheet-scroller')).toBe(false)
        figlio.scrollTop = 20
        figlio.dispatchEvent(new Event('scroll'))
        await nextTick()
        expect(figlio.hasAttribute('data-talos-sheet-scroller')).toBe(true)
        expect(w.get('[data-testid="talos-mobile-tool-sheet"]').attributes('data-scrolled')).toBe('false')
        figlio.scrollTop = 120
        figlio.dispatchEvent(new Event('scroll'))
        await nextTick()
        expect(w.get('[data-testid="talos-mobile-tool-sheet"]').attributes('data-scrolled')).toBe('true')
        w.unmount()
    })

    /**
     * ⛔ Pad, 14/09: la Libreria entra in selezione, 80 schede diventano 1, lo scorritore non
     * scorre più — e la barra restava ripiegata a scorrimento 0. Il contenuto che si accorcia
     * non lancia `scroll`: il foglio lo deve OSSERVARE, e tornare a riposo.
     */
    it('torna a riposo quando lo scorritore non ha più niente da scorrere', async () => {
        const originale = globalThis.ResizeObserver
        const avvisi: Array<() => void> = []
        globalThis.ResizeObserver = class { constructor(cb: () => void) { avvisi.push(cb) } observe() {} unobserve() {} disconnect() {} } as unknown as typeof ResizeObserver
        try {
            const w = mount(TalosMobileToolSheet, { attachTo: document.body, props: { title: 'Library' }, slots: { default: '<div data-testid="figlio" style="overflow-y:auto"><p>contenuto</p></div>' } })
            const figlio = w.get('[data-testid="figlio"]').element as HTMLElement
            const foglio = () => w.get('[data-testid="talos-mobile-tool-sheet"]')
            Object.defineProperty(figlio, 'scrollHeight', { configurable: true, value: 3000 })
            Object.defineProperty(figlio, 'clientHeight', { configurable: true, value: 800 })
            figlio.scrollTop = 120
            figlio.dispatchEvent(new Event('scroll'))
            await nextTick()
            expect(foglio().attributes('data-scrolled')).toBe('true')
            expect(foglio().attributes('data-scroll-rest')).toBe('false')
            expect(avvisi).toHaveLength(1)

            // Il contenuto si accorcia: nessuno scorrimento, solo un cambio di misura.
            Object.defineProperty(figlio, 'scrollHeight', { configurable: true, value: 800 })
            avvisi[0]!()
            await nextTick()
            expect(foglio().attributes('data-scroll-rest')).toBe('true')
            expect(foglio().attributes('data-scrolled')).toBe('false')

            // ⛔ Il verso contrario: torna lungo e si scorre, la barra torna a seguire il dito.
            Object.defineProperty(figlio, 'scrollHeight', { configurable: true, value: 3000 })
            figlio.dispatchEvent(new Event('scroll'))
            await nextTick()
            expect(foglio().attributes('data-scroll-rest')).toBe('false')
            w.unmount()
        } finally {
            globalThis.ResizeObserver = originale
        }
    })

    it('la barra dice il titolo della PAGINA aperta, non il nome della stazione; senza tondi il contenuto non scende', async () => {
        const Pagina = defineComponent({
            setup() { useTalosSheetTitle(() => 'Nota di prova'); return () => h('h1', { 'data-talos-sheet-title': '' }, 'Nota di prova') },
        })
        const w = mount(TalosMobileToolSheet, { props: { title: 'Notes', hideMenu: true }, slots: { default: () => h(Pagina) } })
        // La pagina registra il titolo nel suo `watchEffect`: la barra si aggiorna al tick dopo.
        await nextTick()
        expect(w.get('[data-testid="talos-sheet-bar"]').text()).toBe('Nota di prova')
        expect(w.get('[data-testid="talos-mobile-sheet-body"]').attributes('data-under-controls')).toBe('false')
    })

    it('CODE-BG-CONTINUITY-01 lets only an explicitly scene-backed station reveal the shared background', () => {
        const code = mount(TalosMobileToolSheet, {
            props: { title: 'Code', hideChrome: true, sceneBackground: true } as never,
        })
        const ordinary = mount(TalosMobileToolSheet, { props: { title: 'Library' } })

        expect(code.get('[data-testid="talos-mobile-tool-sheet"]')
            .attributes('data-scene-background')).toBe('true')
        expect(code.get('[data-testid="talos-mobile-tool-sheet"]').classes())
            .toContain('talos-mobile-tool-sheet-scene')
        expect(code.get('[data-testid="talos-mobile-sheet-backdrop"]').classes())
            .toContain('talos-mobile-tool-sheet-backdrop-scene')
        expect(ordinary.get('[data-testid="talos-mobile-tool-sheet"]')
            .attributes('data-scene-background')).toBe('false')
        expect(ordinary.get('[data-testid="talos-mobile-tool-sheet"]').classes())
            .not.toContain('talos-mobile-tool-sheet-scene')
        expect(ordinary.get('[data-testid="talos-mobile-sheet-backdrop"]').classes())
            .not.toContain('talos-mobile-tool-sheet-backdrop-scene')
    })

    it('CODE-MOTION-TOKENS-01 drives sheet and backdrop entry from canonical motion variables', () => {
        const source = readFileSync(resolve(process.cwd(), 'src', 'components', 'shell', 'TalosMobileToolSheet.vue'), 'utf8')

        expect(source).toContain('--talos-motion-duration-surface-enter')
        expect(source).toContain('--talos-motion-duration-surface-exit')
        expect(source).toContain('--talos-motion-ease')
        expect(source).not.toContain('duration-250')
    })
})

// F3-T2 (owner #4/#8): the sheet honours the presentation preference —
// fullscreen covers the viewport; drawer keeps ONE consistent tall height.
describe('presentation modes (F3-T2)', () => {
    it('fullscreen covers the whole viewport with no rounded drawer chrome', () => {
        const wrapper = mount(TalosMobileToolSheet, {
            props: { title: 'Settings', presentation: 'fullscreen' },
        })
        const sheet = wrapper.get('[data-testid="talos-mobile-tool-sheet"]')
        expect(sheet.classes()).toContain('h-[100dvh]')
        expect(sheet.classes()).not.toContain('rounded-t-2xl')
        expect(sheet.attributes('data-presentation')).toBe('fullscreen')
    })

    it('drawer keeps a FIXED tall height so every station drawer matches', () => {
        const wrapper = mount(TalosMobileToolSheet, {
            props: { title: 'Settings', presentation: 'drawer' },
        })
        const sheet = wrapper.get('[data-testid="talos-mobile-tool-sheet"]')
        expect(sheet.classes()).toContain('h-[88dvh]')
        expect(sheet.attributes('data-presentation')).toBe('drawer')
    })

    it('defaults to fullscreen when no presentation is passed', () => {
        const wrapper = mount(TalosMobileToolSheet, { props: { title: 'Settings' } })
        expect(wrapper.get('[data-testid="talos-mobile-tool-sheet"]').attributes('data-presentation')).toBe('fullscreen')
    })

    it('HARNESS-PHONE-NAV-WIDE-SHORT-01 keeps exactly one shell back control in an ordinary short fullscreen', () => {
        const wrapper = mount(TalosMobileToolSheet, {
            props: { title: 'Harness', presentation: 'fullscreen', lockBodyScroll: true } as never,
        })

        // U-7: on a station ROOT the one shell control is the phone menu
        // button, and there is no back arrow to double it.
        expect(wrapper.findAll('[data-testid="talos-sheet-menu"]')).toHaveLength(1)
        expect(wrapper.findAll('[data-testid="talos-sheet-back"]')).toHaveLength(0)
        // Owner 2026-09-13/14: niente barra fissa. I comandi stanno nel contenitore dei tondi, ed e'
        // QUELLO che la tastiera in orizzontale fa cedere (prima era la barra `header`).
        expect(wrapper.find('[data-testid="talos-mobile-tool-sheet"] header').exists()).toBe(false)
        expect(wrapper.get('[data-testid="talos-sheet-chrome"]').classes()).toContain('talos-sheet-chrome')
        const source = readFileSync(resolve(process.cwd(), 'src', 'components', 'shell', 'TalosMobileToolSheet.vue'), 'utf8')
        expect(source).toContain('body.keyboard-open .talos-sheet-chrome')
        expect(source).toContain('padding-top: env(safe-area-inset-top)')
    })
})
