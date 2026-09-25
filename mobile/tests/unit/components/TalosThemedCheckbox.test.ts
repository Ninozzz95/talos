// @vitest-environment jsdom

import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import { defineComponent, ref } from 'vue'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import TalosThemedCheckbox from '@/components/talos/ui/TalosThemedCheckbox.vue'

/**
 * ⭐ CASELLA-TEMA (owner 25/09/2026, «Casella a tema nuova»; dossier `.claude/ricerche/2026-09-25-punto-6-decisioni-10x4.md`).
 *
 * Undici `<input type="checkbox">` nativi in sette file: sul telefono li disegna Android, col suo colore, fuori dalla
 * palette (stesso difetto del `<select>` della Libreria, 13/09). La casella a tema sta su `CheckboxRoot` di Reka UI
 * (2.10.1, già nel progetto: `button role="checkbox"`, `aria-checked`, Spazio) col segno che l'app usa già per Attività e
 * Note.
 */

function inRiga(iniziale = false, extra: Record<string, unknown> = {}) {
    return defineComponent({
        components: { TalosThemedCheckbox },
        setup() {
            const valore = ref(iniziale)
            return { valore, extra }
        },
        template: `<label data-testid="riga"><TalosThemedCheckbox v-model="valore" data-testid="casella" v-bind="extra" /><span data-testid="testo">Includi le chiavi</span></label><output data-testid="valore">{{ valore }}</output>`,
    })
}

describe('CASELLA-TEMA: la casella a tema', () => {
    it('CASELLA-01: è una casella accessibile, non un input nativo', () => {
        const wrapper = mount(inRiga())
        const casella = wrapper.get('[data-testid="casella"]')
        expect(casella.element.tagName).toBe('BUTTON')
        expect(casella.attributes('role')).toBe('checkbox')
        expect(casella.attributes('aria-checked')).toBe('false')
        expect(wrapper.find('input[type="checkbox"]:not([aria-hidden="true"])').exists()).toBe(false)
    })

    it('CASELLA-02: un tocco sulla casella la spunta e aggiorna il v-model; un altro la toglie', async () => {
        const wrapper = mount(inRiga())
        await wrapper.get('[data-testid="casella"]').trigger('click')
        expect(wrapper.get('[data-testid="valore"]').text()).toBe('true')
        expect(wrapper.get('[data-testid="casella"]').attributes('aria-checked')).toBe('true')
        await wrapper.get('[data-testid="casella"]').trigger('click')
        expect(wrapper.get('[data-testid="valore"]').text()).toBe('false')
    })

    it('CASELLA-03: un tocco sul testo della riga la spunta (la riga resta il bersaglio del dito)', async () => {
        const wrapper = mount(inRiga(), { attachTo: document.body })
        ;(wrapper.get('[data-testid="testo"]').element as HTMLElement).click()
        await wrapper.vm.$nextTick()
        expect(wrapper.get('[data-testid="valore"]').text()).toBe('true')
        wrapper.unmount()
    })

    it('CASELLA-04: spenta non cambia', async () => {
        const wrapper = mount(inRiga(false, { disabled: true }))
        await wrapper.get('[data-testid="casella"]').trigger('click')
        expect(wrapper.get('[data-testid="valore"]').text()).toBe('false')
        expect(wrapper.get('[data-testid="casella"]').attributes('disabled')).toBeDefined()
    })

    it('CASELLA-05: i colori vengono dai token della palette; «danger» per le cancellazioni', () => {
        const normale = mount(inRiga(true)).get('[data-testid="casella"]')
        expect(normale.classes().join(' ')).toContain('var(--talos-border-strong)')
        expect(normale.attributes('data-tono')).toBe('accento')
        const pericolo = mount(inRiga(true, { tone: 'danger' })).get('[data-testid="casella"]')
        expect(pericolo.attributes('data-tono')).toBe('pericolo')
        // CASELLA-REG-01 (Pad 25/09): `--talos-danger` è un colore di TESTO in «calm» (#fee2e2): come riempimento era una
        // casella bianca. Spuntata porta i tre token del pulsante distruttivo.
        const classi = pericolo.classes().join(' ')
        expect(classi).toContain('data-[state=checked]:bg-[var(--talos-danger-soft)]')
        expect(classi).toContain('data-[state=checked]:border-[var(--talos-danger-border)]')
        expect(classi).not.toContain('bg-[var(--talos-danger)]')
    })
})

describe('CASELLA-TEMA: niente caselle native nei componenti', () => {
    it('NATIVI-01: nessun <input type="checkbox"> nei .vue di src/', () => {
        const trovati: string[] = []
        const visita = (cartella: string) => {
            for (const voce of readdirSync(cartella)) {
                const percorso = join(cartella, voce)
                if (statSync(percorso).isDirectory()) visita(percorso)
                else if (voce.endsWith('.vue') && /type="checkbox"/.test(readFileSync(percorso, 'utf8'))) trovati.push(percorso)
            }
        }
        visita(join(process.cwd(), 'src'))
        expect(trovati).toEqual([])
    })
})
