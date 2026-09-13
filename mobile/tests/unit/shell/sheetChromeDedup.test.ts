// @vitest-environment jsdom

import { describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { h } from 'vue'
import TalosMobileScreen from '@/components/shell/TalosMobileScreen.vue'
import TalosMobileToolSheet from '@/components/shell/TalosMobileToolSheet.vue'
import TalosMobileSettingsCenter from '@/components/talos/settings/TalosMobileSettingsCenter.vue'

// F3-T3 (owner #10 + SF-critic #10): ONE title per surface. Screens presented
// inside the tool sheet drop their own duplicate header; standalone screens
// keep it. The settings category pane no longer repeats a second heading.
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
vi.mock('@/components/shell/TalosMobileNotificationBell.vue', () => ({
    __esModule: true,
    default: { name: 'TalosMobileNotificationBell', render: () => null },
}))
vi.mock('@/components/shell/TalosMobileDownloadCenterTrigger.vue', () => ({
    __esModule: true,
    default: { name: 'TalosMobileDownloadCenterTrigger', render: () => null },
}))

describe('sheet chrome dedup (F3-T3)', () => {
    it('hides the screen header inside the tool sheet (sheet already titles it)', () => {
        const wrapper = mount(TalosMobileToolSheet, {
            props: { title: 'Settings' },
            slots: { default: () => h(TalosMobileScreen, { title: 'Settings Center', eyebrow: 'Protected preferences' }) },
        })
        expect(wrapper.find('[data-testid="mobile-screen-title"]').exists()).toBe(false)
        expect(wrapper.find('[data-testid="mobile-screen-eyebrow"]').exists()).toBe(false)
    })

    it('keeps the screen header when standalone', () => {
        const wrapper = mount(TalosMobileScreen, { props: { title: 'Deep Research V3' } })
        expect(wrapper.get('[data-testid="mobile-screen-title"]').text()).toBe('Deep Research V3')
    })

    it('the settings category pane carries no duplicate heading block', () => {
        const wrapper = mount(TalosMobileSettingsCenter)
        expect(wrapper.text()).not.toContain('Settings categories')
        expect(wrapper.text()).not.toContain('Local preferences and capability readiness.')
    })
})
