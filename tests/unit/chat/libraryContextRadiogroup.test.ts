// @vitest-environment jsdom

import { beforeEach, describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import TalosMobileLibraryContextSheet from '@/components/chat/TalosMobileLibraryContextSheet.vue'

/**
 * Fase 5, coerenza: una scelta fra TRE non si disegna con due interruttori.
 *
 * Erano due bottoni con `aria-pressed`: un lettore di schermo diceva «pulsante,
 * non premuto» due volte e mai «automatico, 1 di 3». E guardandoli, su
 * «automatico» sembravano semplicemente due comandi spenti — lo stato corrente
 * non era da nessuna parte se non in una riga di testo accanto.
 */
function sheet(override: Record<string, unknown> | null = null) {
    return mount(TalosMobileLibraryContextSheet, {
        props: {
            effectiveEnabled: true,
            effectiveMode: 'all',
            files: [{ id: 'f1', display_name: 'brief.txt', media_type: 'text/plain' }],
            override,
        } as never,
        attachTo: document.body,
        global: { stubs: { TalosMobileLibraryFileGlyph: true } },
    })
}

describe('il contesto per file, come scelta a tre', () => {
    beforeEach(() => { document.body.innerHTML = '' })

    it('è un radiogroup, non una coppia di aria-pressed', () => {
        const wrapper = sheet()
        const gruppi = [...document.querySelectorAll('[role="radiogroup"]')]
        expect(gruppi.length).toBeGreaterThan(1)
        // Nessun aria-pressed sui comandi del file: quella grammatica dice
        // «premuto», non «uno di tre».
        expect(document.querySelector('[data-testid="talos-library-turn-include-f1"]')!.getAttribute('aria-pressed'))
            .toBeNull()
    })

    it('«automatico» è VISIBILE come stato corrente, non come assenza', () => {
        // È il difetto vero: prima, su automatico, entrambi i comandi erano
        // spenti e la scelta in corso non si vedeva.
        const wrapper = sheet()
        const auto = document.querySelector('[data-testid="talos-library-turn-auto-f1"]')!
        expect(auto.getAttribute('aria-checked')).toBe('true')
    })

    it('conserva i test-id dei due comandi che sostituisce', () => {
        // La grammatica cambia, i selettori puntati su quei comandi no —
        // altrimenti l'adozione si legge come una regressione.
        const wrapper = sheet()
        expect(document.querySelector('[data-testid="talos-library-turn-include-f1"]')).not.toBeNull()
        expect(document.querySelector('[data-testid="talos-library-turn-exclude-f1"]')).not.toBeNull()
    })

    it('sceglierne uno mette giù gli altri due', async () => {
        const wrapper = sheet({ included_file_ids: ['f1'], excluded_file_ids: [] })
        const stato = (id: string) => document.querySelector(`[data-testid="talos-library-turn-${id}-f1"]`)!.getAttribute('aria-checked')
        expect(stato('include')).toBe('true')
        expect(stato('auto')).toBe('false')
        expect(stato('exclude')).toBe('false')
    })
})
