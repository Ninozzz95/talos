// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
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

describe('PICK-SCROLL-01 il foglio del modello ha uno scorrimento solo', () => {
    it('i suoi elenchi (modelli ed esecutore) non trattengono il dito', () => {
        const w = monta({ showExecutorModel: true, executorModelProfiles: [] })
        const elenchi = w.findAll('[role="listbox"]')
        expect(elenchi.length).toBe(2)
        for (const elenco of elenchi) expect(elenco.classes()).not.toContain('overscroll-contain')
        w.unmount()
    })
})

/*
 * FOGLIO-01..06 — il foglio «Modello e ragionamento» del mockup approvato (owner 27-28/10/2026, versioni 6 e 7): schede dei
 * fornitori, elenco del selettore vero, PIEDE fisso in una riga col ragionamento, altezza fissa (non salta cambiando scheda).
 */
describe('FOGLIO il foglio «Modello e ragionamento»', () => {
    const luna = {
        id: 'chatgpt:gpt-6-luna', provider: 'chatgpt', model: 'gpt-6-luna', display_name: 'GPT-6-Luna', status: 'healthy', has_secret: true,
        effort_levels: ['off', 'low', 'medium', 'high'], supports_thinking: true, show_in_composer: true, capabilities: null, probe_ok: true,
    }
    const conModello = (extra: Record<string, unknown> = {}) => monta({ modelProfiles: [luna], selectedModelProfileId: luna.id, selectedEffort: 'high', ...extra })

    it('FOGLIO-01 il titolo è «Modello e ragionamento»', () => {
        const w = conModello()
        expect(w.get('[data-testid="talos-model-drawer"]').text()).toContain('Model & reasoning')
        w.unmount()
    })

    it('FOGLIO-02 l\'elenco principale ha le schede dei fornitori; quello dell\'esecutore no', () => {
        const w = conModello({ showExecutorModel: true, executorModelProfiles: [luna] })
        expect(w.findAll('[role="tablist"]')).toHaveLength(1)
        expect(w.get('[data-testid="talos-executor-model-section"]').find('[role="tablist"]').exists()).toBe(false)
        w.unmount()
    })

    /*
     * ⛔ Riscritto il 28/10/2026 (owner, foto dal telefono: «un altro errore, guarda sotto»). Il piede stava DENTRO la parte che scorre,
     * attaccato in fondo con `position: sticky`: sul telefono l'aggancio si fermava prima del bordo e sotto il piede si vedeva passare la
     * lista dei modelli. Ora il piede è una fascia del foglio, FUORI dalla parte che scorre: sotto non passa niente.
     */
    it('FOGLIO-03 il piede del ragionamento è una fascia fissa del foglio, fuori dalla parte che scorre, dopo l\'elenco', () => {
        const w = conModello({ showExecutorModel: true, executorModelProfiles: [luna] })
        const piede = w.get('[data-testid="talos-model-sheet-foot"]')
        expect(piede.find('[data-testid="talos-mobile-effort-picker"]').exists()).toBe(true)
        const corpo = w.get('[data-talos-sheet-body]').element
        expect(corpo.contains(piede.element)).toBe(false)
        // l'esecutore resta nella parte che scorre, sopra il piede
        expect(corpo.contains(w.get('[data-testid="talos-executor-model-section"]').element)).toBe(true)
        const foglio = w.get('[data-testid="talos-model-drawer"]').element
        expect(foglio.lastElementChild?.contains(piede.element)).toBe(true)
        expect(corpo.compareDocumentPosition(piede.element) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
        w.unmount()
    })

    // ⛔ La riga toccata restava evidenziata (owner, stessa foto: «GPT-6-Luna» col fondo acceso e la spunta su un altro modello): sui
    // touch `:hover` resta sull'ultimo elemento toccato. L'evidenza al passaggio vale solo dove c'è un puntatore vero.
    it('FOGLIO-07 il passaggio del mouse evidenzia una riga solo dove c\'è un puntatore vero, mai dopo un tocco', () => {
        const sorgente = readFileSync(resolve(__dirname, '../../../src/components/chat/TalosMobileComposerModelPicker.vue'), 'utf8')
        const stile = sorgente.slice(sorgente.indexOf('<style'))
        const i = stile.indexOf('.talos-mobile-model-option:not(:disabled):hover')
        expect(i).toBeGreaterThan(-1)
        expect(stile.lastIndexOf('@media (hover: hover) and (pointer: fine)', i)).toBeGreaterThan(-1)
        // la riga scelta resta evidenziata sempre, ma in una regola sua
        expect(stile).toContain('.talos-mobile-model-option[data-selected="true"] {')
    })

    it('FOGLIO-04 il foglio ha l\'altezza fissa: non salta da una scheda all\'altra', () => {
        const w = conModello()
        expect((w.get('[data-testid="talos-model-drawer"]').element as HTMLElement).style.height).toBe('85dvh')
        w.unmount()
    })

    it('FOGLIO-05 il livello scelto nel piede arriva a chi monta il foglio', async () => {
        const w = conModello()
        await w.get('[data-testid="talos-mobile-effort-slider-thumb"]').trigger('keydown', { key: 'Home' })
        expect(w.emitted('selectEffort')?.at(-1)).toEqual(['off'])
        w.unmount()
    })

    it('FOGLIO-06 la vecchia sezione del ragionamento sotto l\'elenco non c\'è più: tutto sta nel piede', () => {
        const w = conModello({ showThinking: true, reasoningNote: 'x', showReasoningSwitch: true })
        expect(w.find('[data-testid="talos-model-sheet-reasoning"]').exists()).toBe(false)
        w.unmount()
    })
})
