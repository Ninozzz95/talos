// @vitest-environment jsdom

import { describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import TalosMobileToolSheet from '@/components/shell/TalosMobileToolSheet.vue'

/**
 * Owner 2026-08-04, provato sul telefono: «il pulsante indietro in alto a
 * sinistra fa chiudere tutto».
 *
 * La gesture di sistema risaliva la catena, quel pulsante no: due comandi per
 * lo stesso gesto con due destinazioni diverse. Aperta una nota, chiudeva la
 * stazione intera — due passi buttati invece di uno.
 */
function sheet(props: Record<string, unknown> = {}) {
    return mount(TalosMobileToolSheet, {
        props: { title: 'Note', ...props },
        global: { stubs: { Teleport: true } },
    })
}

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
    default: { name: 'TalosMobileNotificationBell', render: () => null },
}))
vi.mock('@/components/shell/TalosMobileDownloadCenterTrigger.vue', () => ({
    default: { name: 'TalosMobileDownloadCenterTrigger', render: () => null },
}))

describe('il pulsante indietro in alto', () => {
    it('da una pagina di dettaglio risale di UN passo, non chiude tutto', async () => {
        const suGiu = vi.fn()
        const wrapper = sheet({ parentBack: suGiu, parentTitle: 'Note' })
        const bottone = wrapper.get('[data-testid="talos-sheet-back"]')

        await bottone.trigger('click')
        expect(suGiu).toHaveBeenCalledTimes(1)
        // E NON ha chiuso: chiudere da qui butta via due passi invece di uno.
        expect(wrapper.emitted('close')).toBeUndefined()
    })

    it('dice DOVE va, invece di farlo indovinare', () => {
        // Un pulsante che si chiama «torna alla chat» e va da un'altra parte è
        // peggio di uno che non c'è.
        const dentro = sheet({ parentBack: () => {}, parentTitle: 'Note' })
        expect(dentro.get('[data-testid="talos-sheet-back"]').attributes('aria-label'))
            .toContain('Note')

        const cima = sheet()
        expect(cima.get('[data-testid="talos-sheet-back"]').attributes('aria-label'))
            .toMatch(/chat/i)
    })

    it('dalla cima di una stazione chiude, come prima', async () => {
        // Chi non è dentro niente non deve accorgersi che questa strada esiste.
        const wrapper = sheet()
        await wrapper.get('[data-testid="talos-sheet-back"]').trigger('click')
        expect(wrapper.emitted('close')).toHaveLength(1)
    })
})
