// @vitest-environment jsdom
/**
 * SCHEDE-01..07 — i fornitori come schede a pillola nel foglio «Modello e ragionamento» (owner 27/10/2026: «Bisogna anche
 * organizzare più provider con Tab pill a scorrimento»; mockup approvato, versione 6 e 7). Le schede stanno nel selettore stesso,
 * accese da `schede`: la barra (TalosBarraRoot) che usa lo stesso selettore resta coi gruppi di oggi.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { flushPromises } from '@vue/test-utils'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { mount, type VueWrapper } from '@vue/test-utils'
import TalosMobileComposerModelPicker from '@/components/chat/TalosMobileComposerModelPicker.vue'
import type { TalosMobileModelProfileView, TalosMobileRoutingProfileView } from '@/components/chat/mobileChatTypes'

let wrapper: VueWrapper | null = null
afterEach(() => { wrapper?.unmount(); wrapper = null; document.body.innerHTML = '' })

const profilo = (provider: string, model: string, nome: string): TalosMobileModelProfileView => ({
    id: `${provider}:${model}`, provider, model, display_name: nome, status: 'healthy', has_secret: true,
    effort_levels: ['low', 'medium', 'high'], supports_thinking: true, show_in_composer: true, capabilities: null, probe_ok: true,
})
const PROFILI = [
    profilo('chatgpt', 'gpt-6-luna', 'GPT-6-Luna'), profilo('chatgpt', 'gpt-6.1-sol', 'GPT-6.1-Sol'),
    profilo('anthropic', 'claude-opus-5-5', 'Claude Opus 5.5'),
    profilo('local', 'lfm2.5', 'LFM2.5-2.6B'), profilo('local', 'qwen3.5', 'Qwen3.5-4B'),
]
const ROTTA: TalosMobileRoutingProfileView = { id: 'rotta-equilibrata', name: 'Equilibrata', status: 'enabled', lane_count: 2 }

function monta(extra: Record<string, unknown> = {}) {
    wrapper = mount(TalosMobileComposerModelPicker, {
        attachTo: document.body,
        props: { modelProfiles: PROFILI, routingProfiles: [], selectedModelProfileId: 'anthropic:claude-opus-5-5', selectedRoutingProfileId: null, schede: true, ...extra },
    })
    return wrapper
}
const schede = (w: VueWrapper) => w.findAll('[role="tab"]')
const modelliVisibili = (w: VueWrapper) => w.findAll('[data-testid="talos-mobile-model-option"]').filter((b) => b.isVisible()).map((b) => b.text())

describe('SCHEDE i fornitori come schede a pillola', () => {
    it('SCHEDE-01 una scheda per fornitore, nell\'ordine dei gruppi, col numero di modelli; niente intestazioni di gruppo', () => {
        const w = monta()
        expect(w.find('[role="tablist"]').exists()).toBe(true)
        expect(schede(w).map((s) => s.attributes('data-scheda'))).toEqual(['chatgpt', 'anthropic', 'local'])
        expect(schede(w)[0]!.text()).toContain('2')
        expect(w.find('[data-testid^="talos-model-group-"]').exists()).toBe(false)
        // «Modelli» resta solo per chi ascolta lo schermo: il gruppo lo usa come nome
        expect(w.get('#talos-mobile-model-picker-models').classes()).toContain('sr-only')
    })

    it('SCHEDE-02 si apre sulla scheda del modello scelto e mostra solo i suoi modelli', () => {
        const w = monta()
        expect(w.get('[data-scheda="anthropic"]').attributes('aria-selected')).toBe('true')
        expect(modelliVisibili(w).join(' ')).toContain('Claude Opus 5.5')
        expect(modelliVisibili(w).join(' ')).not.toContain('GPT-6-Luna')
    })

    it('SCHEDE-03 toccando un\'altra scheda si vedono i suoi modelli; un puntino segna la scheda del modello scelto', async () => {
        const w = monta()
        await w.get('[data-scheda="local"]').trigger('click')
        expect(w.get('[data-scheda="local"]').attributes('aria-selected')).toBe('true')
        expect(modelliVisibili(w)).toHaveLength(2)
        expect(w.get('[data-scheda="anthropic"]').find('[data-testid="talos-provider-tab-chosen"]').exists()).toBe(true)
        expect(w.get('[data-scheda="local"]').find('[data-testid="talos-provider-tab-chosen"]').exists()).toBe(false)
    })

    it('SCHEDE-04 con le rotte c\'è la scheda «Automatico», prima; con una rotta scelta il foglio si apre lì', () => {
        const w = monta({ routingProfiles: [ROTTA], selectedRoutingProfileId: 'rotta-equilibrata' })
        expect(schede(w)[0]!.attributes('data-scheda')).toBe('__rotte')
        expect(w.get('[data-scheda="__rotte"]').attributes('aria-selected')).toBe('true')
        expect(w.find('[data-testid="talos-mobile-model-route-option"]').exists()).toBe(true)
        expect(modelliVisibili(w)).toHaveLength(0)
    })

    it('SCHEDE-05 frecce destra e sinistra passano da una scheda all\'altra (APG Tabs)', async () => {
        const w = monta()
        await w.get('[data-scheda="anthropic"]').trigger('keydown', { key: 'ArrowRight' })
        expect(w.get('[data-scheda="local"]').attributes('aria-selected')).toBe('true')
        await w.get('[data-scheda="local"]').trigger('keydown', { key: 'ArrowLeft' })
        expect(w.get('[data-scheda="anthropic"]').attributes('aria-selected')).toBe('true')
    })

    it('SCHEDE-06 cercando, le schede spariscono e si cerca in tutti i fornitori', async () => {
        const molti = [...PROFILI, profilo('openrouter', 'a', 'Alfa'), profilo('openrouter', 'b', 'Beta')]
        const w = monta({ modelProfiles: molti })
        await w.get('[data-testid="talos-model-search"]').setValue('5')
        expect(w.find('[role="tablist"]').exists()).toBe(false)
        const trovati = modelliVisibili(w).join(' ')
        expect(trovati).toContain('Claude Opus 5.5')
        expect(trovati).toContain('LFM2.5-2.6B')
    })

    it('SCHEDE-08 (APG Tabs, revisione del Desktop) ogni scheda controlla il pannello, e il pannello lo nomina la scheda attiva', async () => {
        const w = monta()
        const pannello = w.get('[role="tabpanel"]')
        expect(pannello.attributes('id')).toBe('talos-provider-tabpanel')
        for (const s of schede(w)) {
            expect(s.attributes('aria-controls')).toBe('talos-provider-tabpanel')
            expect(s.attributes('id')).toBe(`talos-provider-tab-${s.attributes('data-scheda')}`)
        }
        expect(pannello.attributes('aria-labelledby')).toBe('talos-provider-tab-anthropic')
        expect(pannello.find('[role="listbox"]').exists()).toBe(true)
        await w.get('[data-scheda="local"]').trigger('click')
        expect(w.get('[role="tabpanel"]').attributes('aria-labelledby')).toBe('talos-provider-tab-local')
    })

    it('SCHEDE-07 senza `schede` (la barra) tutto come oggi: gruppi con intestazione, nessuna scheda', () => {
        const w = monta({ schede: false })
        expect(w.find('[role="tablist"]').exists()).toBe(false)
        expect(w.find('[data-testid="talos-model-group-anthropic"]').exists()).toBe(true)
        expect(w.get('#talos-mobile-model-picker-models').classes()).not.toContain('sr-only')
        expect(w.find('[role="tabpanel"]').exists()).toBe(false)
    })

    /*
     * ⛔ D4 (Pad 28/10/2026, tablet verticale): aprendo il foglio la striscia CENTRAVA la scheda attiva («Sul dispositivo», l'ultima),
     * e «ChatGPT», la prima, restava tagliata a sinistra senza icona anche se tutte e tre quasi ci stavano. Ora scorre solo quanto
     * basta (inline nearest), con un margine che lascia vedere che la striscia continua.
     */
    it('SCHEDE-08 la scheda attiva si scorre in vista il minimo, con un margine; prima e ultima', async () => {
        const chiamate: ScrollIntoViewOptions[] = []
        const spia = vi.spyOn(Element.prototype, 'scrollIntoView').mockImplementation(function (o?: boolean | ScrollIntoViewOptions) { chiamate.push(o as ScrollIntoViewOptions) })
        try {
            monta({ selectedModelProfileId: 'local:qwen3.5' })
            await flushPromises()
            expect(chiamate.length).toBeGreaterThan(0)
            for (const o of chiamate) expect(o.inline).toBe('nearest')
            wrapper?.unmount()
            chiamate.length = 0
            monta({ selectedModelProfileId: 'chatgpt:gpt-6-luna' })
            await flushPromises()
            for (const o of chiamate) expect(o.inline).toBe('nearest')
        } finally { spia.mockRestore() }
        const css = readFileSync(resolve(__dirname, '../../../src/components/chat/TalosMobileProviderTabs.vue'), 'utf8')
        expect(css).toContain('scroll-padding-inline: 2rem;')
    })
})

/**
 * SELETTORE-01/02 — owner 28/10/2026: «quando apro il selettore modelli non vedo selezionato e centrato il modello in uso». Regola
 * comune col desktop: la riga in uso al CENTRO della lista che scorre, senza muovere la pagina; la riga si vede a colpo d'occhio.
 */
describe('SELETTORE il modello in uso, segnato e al centro', () => {
    it('SELETTORE-01 all\'apertura la riga in uso va al centro della lista che scorre; la pagina resta ferma', async () => {
        // un elenco lungo dentro un contenitore che scorre (come il corpo del foglio): 40 modelli, quello in uso al 30°
        const tanti = Array.from({ length: 40 }, (_, i) => profilo('openrouter', `m-${i}`, `Modello ${i}`))
        const contenitore = document.createElement('div')
        contenitore.style.overflowY = 'auto'
        document.body.appendChild(contenitore)
        Object.defineProperty(contenitore, 'scrollHeight', { value: 2400, configurable: true })
        Object.defineProperty(contenitore, 'clientHeight', { value: 400, configurable: true })
        contenitore.getBoundingClientRect = () => ({ top: 100, height: 400, bottom: 500, left: 0, right: 0, width: 0, x: 0, y: 100, toJSON: () => ({}) })
        const paginaPrima = document.documentElement.scrollTop
        wrapper = mount(TalosMobileComposerModelPicker, {
            attachTo: contenitore,
            props: { modelProfiles: tanti, routingProfiles: [], selectedModelProfileId: 'openrouter:m-30', selectedRoutingProfileId: null, schede: true },
        })
        const riga = wrapper.get('[data-model-profile-id="openrouter:m-30"]').element as HTMLElement
        // la riga sta a 1800 px dall'alto della lista: centro della riga 1824, centro della lista 300
        riga.getBoundingClientRect = () => ({ top: 1900, height: 48, bottom: 1948, left: 0, right: 0, width: 0, x: 0, y: 1900, toJSON: () => ({}) })
        await flushPromises()
        await new Promise((ok) => setTimeout(ok, 40))
        expect(contenitore.scrollTop).toBe(1900 + 24 - (100 + 200))
        expect(document.documentElement.scrollTop).toBe(paginaPrima)
    })

    /*
     * SELETTORE-03 — difetto misurato sul Pad (vc345, 28/10): il foglio si apre CRESCENDO; la lista misura 277 px quando la si centra
     * e 636 px un attimo dopo, e la riga resta 179 px sopra il centro ((277 − 636) / 2). Si ricentra a ogni cambio di misura
     * dell'apertura, ma mai contro la persona: appena tocca la lista, la lista è sua.
     */
    it('SELETTORE-03 se la lista cresce durante l\'apertura si ricentra; dopo un tocco della persona no', async () => {
        const osservate: Array<() => void> = []
        vi.stubGlobal('ResizeObserver', class { constructor(private cb: () => void) {} observe() { osservate.push(this.cb) } disconnect() { osservate.length = 0 } unobserve() {} })
        const tanti = Array.from({ length: 40 }, (_, i) => profilo('openrouter', `m-${i}`, `Modello ${i}`))
        const contenitore = document.createElement('div')
        contenitore.style.overflowY = 'auto'
        document.body.appendChild(contenitore)
        Object.defineProperty(contenitore, 'scrollHeight', { value: 2400, configurable: true })
        Object.defineProperty(contenitore, 'clientHeight', { value: 400, configurable: true })
        let altezza = 400
        contenitore.getBoundingClientRect = () => ({ top: 100, height: altezza, bottom: 100 + altezza, left: 0, right: 0, width: 0, x: 0, y: 100, toJSON: () => ({}) })
        wrapper = mount(TalosMobileComposerModelPicker, {
            attachTo: contenitore,
            props: { modelProfiles: tanti, routingProfiles: [], selectedModelProfileId: 'openrouter:m-30', selectedRoutingProfileId: null, schede: true },
        })
        const riga = wrapper.get('[data-model-profile-id="openrouter:m-30"]').element as HTMLElement
        // la riga segue lo scorrimento, come nel browser: 1900 px dall'alto senza scorrere
        riga.getBoundingClientRect = () => ({ top: 1900 - contenitore.scrollTop, height: 48, bottom: 1948 - contenitore.scrollTop, left: 0, right: 0, width: 0, x: 0, y: 0, toJSON: () => ({}) })
        await flushPromises()
        await new Promise((ok) => setTimeout(ok, 40))
        expect(contenitore.scrollTop).toBe(1624)
        // il foglio finisce di aprirsi: la lista passa da 400 a 800 px, centro da 300 a 500
        altezza = 800
        osservate.forEach((cb) => cb())
        expect(contenitore.scrollTop).toBe(1424)
        // la persona tocca la lista: un'altra crescita non la sposta più
        contenitore.dispatchEvent(new Event('pointerdown'))
        altezza = 600
        osservate.forEach((cb) => cb())
        expect(contenitore.scrollTop).toBe(1424)
        vi.unstubAllGlobals()
    })

    /*
     * SELETTORE-04 — misurato sul Pad (vc346, telefono orizzontale, 28/10): nel gruppo ChatGPT la riga del piano arriva DOPO (è pigra) e
     * spinge giù i modelli di 57 px; la lista non cambia misura, il contenuto sì. Si osserva anche il selettore, non solo la lista.
     */
    it('SELETTORE-04 se il contenuto sopra la riga cresce durante l\'apertura (riga pigra del piano) si ricentra', async () => {
        const osservati: Element[] = []
        const richiami: Array<() => void> = []
        vi.stubGlobal('ResizeObserver', class { constructor(private cb: () => void) { richiami.push(cb) } observe(el: Element) { osservati.push(el) } disconnect() { richiami.length = 0 } unobserve() {} })
        const tanti = Array.from({ length: 40 }, (_, i) => profilo('openrouter', `m-${i}`, `Modello ${i}`))
        const contenitore = document.createElement('div')
        contenitore.style.overflowY = 'auto'
        document.body.appendChild(contenitore)
        Object.defineProperty(contenitore, 'scrollHeight', { value: 2400, configurable: true })
        Object.defineProperty(contenitore, 'clientHeight', { value: 400, configurable: true })
        contenitore.getBoundingClientRect = () => ({ top: 100, height: 400, bottom: 500, left: 0, right: 0, width: 0, x: 0, y: 100, toJSON: () => ({}) })
        wrapper = mount(TalosMobileComposerModelPicker, {
            attachTo: contenitore,
            props: { modelProfiles: tanti, routingProfiles: [], selectedModelProfileId: 'openrouter:m-30', selectedRoutingProfileId: null, schede: true },
        })
        let spinta = 0
        const riga = wrapper.get('[data-model-profile-id="openrouter:m-30"]').element as HTMLElement
        riga.getBoundingClientRect = () => ({ top: 1900 + spinta - contenitore.scrollTop, height: 48, bottom: 1948 + spinta - contenitore.scrollTop, left: 0, right: 0, width: 0, x: 0, y: 0, toJSON: () => ({}) })
        await flushPromises()
        await new Promise((ok) => setTimeout(ok, 40))
        expect(contenitore.scrollTop).toBe(1624)
        expect(osservati).toContain(wrapper.element)
        // arriva la riga del piano sopra: tutto scende di 57 px
        spinta = 57
        richiami.forEach((cb) => cb())
        expect(contenitore.scrollTop).toBe(1681)
        vi.unstubAllGlobals()
    })

    it('SELETTORE-02 la riga in uso è segnata e ha lo stile dell\'accento; nessun\'altra', () => {
        const w = monta()
        const segnate = w.findAll('[data-testid="talos-mobile-model-option"][aria-selected="true"]')
        expect(segnate.map((r) => r.attributes('data-model-profile-id'))).toEqual(['anthropic:claude-opus-5-5'])
        expect(segnate[0]!.attributes('data-selected')).toBe('true')
        const sorgente = readFileSync(resolve(__dirname, '../../../src/components/chat/TalosMobileComposerModelPicker.vue'), 'utf8')
        expect(sorgente).toMatch(/\[data-selected="true"\] \{\s*background: var\(--talos-accent-soft/u)
    })
})
