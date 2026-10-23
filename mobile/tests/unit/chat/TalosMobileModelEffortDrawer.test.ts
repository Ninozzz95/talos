// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import TalosMobileModelEffortDrawer from '@/components/chat/TalosMobileModelEffortDrawer.vue'

/**
 * ⛔ D-RM4-3 (Pad 20/10/2026): il foglio «Modello e ragionamento» passa al selettore se offrire il Laboratorio modelli (falso solo nel
 * Codice di un PC). Un booleano assente Vue lo legge `false`: senza il valore di serie, chi monta il foglio senza dirlo — la chat —
 * perderebbe il Laboratorio in silenzio.
 */
function monta(extra: Record<string, unknown> = {}) {
    return mount(TalosMobileModelEffortDrawer, {
        attachTo: document.body,
        global: { stubs: { teleport: true } },
        props: {
            modelProfiles: [], routingProfiles: [], selectedModelProfileId: null, selectedRoutingProfileId: null,
            selectedEffort: 'medium', thinking: false, supportsThinking: false, effortLevels: [], ...extra,
        },
    })
}

describe('il foglio del modello e il Laboratorio modelli', () => {
    it('MED-01 senza dirlo il Laboratorio si offre; con showModelLab falso no, e «Aggiorna» resta', () => {
        const w = monta()
        expect(w.find('[aria-label="Open Model Lab"]').exists()).toBe(true)
        w.unmount()
        const v = monta({ showModelLab: false })
        expect(v.find('[aria-label="Open Model Lab"]').exists()).toBe(false)
        expect(v.find('[aria-label="Refresh model catalog"]').exists()).toBe(true)
        v.unmount()
    })
})
