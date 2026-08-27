// @vitest-environment jsdom

import { describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import TalosMobileToolSheet from '@/components/shell/TalosMobileToolSheet.vue'

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
    it('renders a labelled modal dialog with back-to-chat, close, and slot body', () => {
        const w = mount(TalosMobileToolSheet, {
            props: { title: 'Runtime cockpit' },
            slots: { default: '<p data-testid="sheet-content">runs</p>' },
        })
        const dialog = w.get('[data-testid="talos-mobile-tool-sheet"]')
        expect(dialog.attributes('role')).toBe('dialog')
        expect(dialog.attributes('aria-modal')).toBe('true')
        expect(dialog.attributes('aria-label')).toBe('Runtime cockpit')
        expect(w.find('[aria-label="Back to chat"]').exists()).toBe(true)
        // SF-critic F3 #7: fullscreen keeps ONE honest dismissal (Back);
        // the X exists only in the drawer presentation.
        expect(w.find('[aria-label="Close Runtime cockpit"]').exists()).toBe(false)
        expect(w.get('[data-testid="sheet-content"]').text()).toBe('runs')
        expect(w.text()).toContain('Runtime cockpit')
    })

    it('emits close from back-to-chat, and from X in drawer presentation', async () => {
        const w = mount(TalosMobileToolSheet, { props: { title: 'Library', presentation: 'drawer' } })
        await w.get('[aria-label="Back to chat"]').trigger('click')
        await w.get('[aria-label="Close Library"]').trigger('click')
        expect(w.emitted('close')).toHaveLength(2)
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

    it('CODE-OTHER-STATIONS-CHROME-01 keeps the established header on every ordinary station', () => {
        const w = mount(TalosMobileToolSheet, { props: { title: 'Library' } })

        expect(w.get('.talos-mobile-tool-sheet-header').text()).toContain('Library')
        expect(w.get('[data-testid="talos-sheet-back"]').exists()).toBe(true)
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

        expect(wrapper.findAll('[data-testid="talos-sheet-back"]')).toHaveLength(1)
        expect(wrapper.get('[data-testid="talos-mobile-tool-sheet"] header').classes()).toContain('talos-mobile-tool-sheet-header')
        const source = readFileSync(resolve(process.cwd(), 'src', 'components', 'shell', 'TalosMobileToolSheet.vue'), 'utf8')
        expect(source).toContain('body.keyboard-open .talos-mobile-tool-sheet-header')
        expect(source).toContain('padding-top: env(safe-area-inset-top)')
    })
})
