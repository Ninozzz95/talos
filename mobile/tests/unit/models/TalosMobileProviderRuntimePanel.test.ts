// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { reactive, ref } from 'vue'
import { flushPromises, mount } from '@vue/test-utils'

const state = vi.hoisted(() => ({ controller: null as unknown, piano: { collegato: false, email: null as string | null, pianoAbilitato: false } }))
// N15: il pannello chiede lo stato del piano ChatGPT per dirlo nell'intestazione di OpenAI.
vi.mock('@/services/chatgptAccesso', () => ({
    talosChatgpt: () => ({ stato: async () => ({ ...state.piano, scadeAlle: null, accessoInCorso: false, consumi: 'https://chatgpt.com/settings/usage' }) }),
}))
vi.mock('@/stores/chatController', () => ({ useChatController: () => state.controller }))
vi.mock('@/services/openRouterLogin', () => ({
    talosLoginWithOpenRouter: vi.fn().mockResolvedValue({ ok: false, reason: 'exchange' }),
    talosRiprendiAccessoOpenRouter: vi.fn().mockResolvedValue(null),
}))

import TalosMobileProviderRuntimePanel from '@/components/talos/models/TalosMobileProviderRuntimePanel.vue'
import TalosMobileChatgptAccesso from '@/components/talos/models/TalosMobileChatgptAccesso.vue'

function controller() {
    return {
        catalogs: reactive(Object.fromEntries(['openai', 'deepseek', 'anthropic', 'gemini', 'openrouter', 'ollama'].map((provider) => [provider, {
            status: provider === 'anthropic' ? 'ready' : 'idle',
            models: provider === 'anthropic' ? [{ id: 'claude-live' }] : [],
            error: null,
            updatedAt: null,
            configured: provider === 'anthropic',
        }]))),
        endpoints: reactive({
            openai: 'https://models.example.test/v1',
            deepseek: null,
            anthropic: null,
            gemini: null,
            openrouter: null,
            ollama: null,
        }),
        modelLabPreferences: ref({
            schema_version: 1,
            manual_models: [],
            model_overrides: {},
            provider_runtime: { openai: { timeout_seconds: 45 } },
            probe_results: {},
        }),
        secrets: reactive({ openai: true, deepseek: false, anthropic: true, gemini: false, openrouter: false, ollama: false }),
        saveKey: vi.fn().mockResolvedValue(undefined),
        removeKey: vi.fn().mockResolvedValue(undefined),
        saveEndpoint: vi.fn().mockResolvedValue(undefined),
        removeEndpoint: vi.fn().mockResolvedValue(undefined),
        setProviderTimeout: vi.fn().mockResolvedValue(undefined),
        refreshProvider: vi.fn().mockResolvedValue(null),
        refreshSecrets: vi.fn().mockResolvedValue(undefined),
    }
}

beforeEach(() => { state.controller = controller(); state.piano = { collegato: false, email: null, pianoAbilitato: false } })

describe('TalosMobileProviderRuntimePanel', () => {
    /**
     * ⛔ PANEL-N15-01 — VISTO sul Pad il 13/10/2026: con «Piano ChatGPT» dentro il pannello, l'intestazione di OpenAI diceva
     * solo «Non configurato» (che parla della chiave API). Nel mockup approvato la riga dice tutte e due le cose:
     * «Piano ChatGPT: collegato · Chiave API: nessuna». Owner 13/10: le incoerenze dell'interfaccia si curano da soli.
     */
    it('PANEL-N15-01: l intestazione di OpenAI dice lo stato del piano E quello della chiave; gli altri fornitori restano com erano', async () => {
        const senza = controller()
        senza.secrets.openai = false
        state.controller = senza
        const prima = mount(TalosMobileProviderRuntimePanel)
        await flushPromises()
        expect(prima.get('[data-testid="talos-openai-access-line"]').text()).toBe('ChatGPT plan: not connected · API key: none')
        expect(prima.find('[data-provider="anthropic"] [data-testid="talos-openai-access-line"]').exists()).toBe(false)

        state.piano = { collegato: true, email: 'x@y.z', pianoAbilitato: true }
        state.controller = controller()
        const dopo = mount(TalosMobileProviderRuntimePanel)
        await flushPromises()
        expect(dopo.get('[data-testid="talos-openai-access-line"]').text()).toBe('ChatGPT plan: connected · API key: saved')
    })

    /**
     * PANEL-N15-02 (13/10/2026): collegato o scollegato il piano, la chat deve saperlo subito — le «chiavi» si rileggono
     * (per il piano la chiave è l'account collegato) e l'elenco dei modelli dell'account si rilegge. Solo quando il riquadro
     * dice di essere cambiato: aprire la scheda dei fornitori non fa una chiamata a OpenAI.
     */
    it('PANEL-N15-02: quando il piano cambia, il controller rilegge le chiavi e i modelli del piano; all apertura no', async () => {
        const target = controller()
        state.controller = target
        const wrapper = mount(TalosMobileProviderRuntimePanel)
        await flushPromises()
        expect(target.refreshProvider).not.toHaveBeenCalledWith('chatgpt')
        await wrapper.get('[data-provider="openai"] button[aria-expanded]').trigger('click')
        await vi.waitFor(() => expect(wrapper.find('[data-testid="talos-chatgpt-plan"]').exists()).toBe(true))
        // per componente, non per selettore: il riquadro ha anche il foglio del benvenuto, quindi non ha un solo nodo radice
        wrapper.findComponent(TalosMobileChatgptAccesso).vm.$emit('cambiato')
        await flushPromises()
        expect(target.refreshSecrets).toHaveBeenCalledTimes(1)
        expect(target.refreshProvider).toHaveBeenCalledWith('chatgpt')
    })

    /**
     * ⛔ PANEL-N15-03 — trovato dalla CI della release v0.1.41 (17/10/2026, PR #66, `mobile-model-lab-parity.e2e.spec.ts:148`): la
     * riga del piano di PANEL-N15-01 aveva PRESO IL POSTO della riga del catalogo. Per OpenAI, e solo per OpenAI, l'intestazione
     * non diceva più quanti modelli ci sono, né «Discovering models...», né «Discovery failed» con l'endpoint giù. Owner 17/10:
     * «Tutte e due le righe»: la riga del piano resta e sotto torna quella del catalogo, come per gli altri fornitori.
     */
    it('PANEL-N15-03: l intestazione di OpenAI tiene la riga del piano E quella del catalogo (pronto, in ricerca, fallito)', async () => {
        const c = controller()
        c.catalogs.openai.status = 'ready'
        c.catalogs.openai.models = [{ id: 'custom-chat' }]
        state.controller = c
        const wrapper = mount(TalosMobileProviderRuntimePanel)
        await flushPromises()
        const testata = () => wrapper.get('[data-provider="openai"] button[aria-expanded]').text()
        expect(wrapper.get('[data-testid="talos-openai-access-line"]').text()).toBe('ChatGPT plan: not connected · API key: saved')
        expect(testata()).toContain('1 model available')
        c.catalogs.openai.status = 'loading'
        await flushPromises()
        expect(testata()).toContain('Discovering models...')
        c.catalogs.openai.status = 'error'
        await flushPromises()
        expect(testata()).toContain('Discovery failed')
        expect(testata()).toContain('ChatGPT plan: not connected · API key: saved')
        // a riposo, sotto la riga del piano, «Not configured» ripeterebbe soltanto «API key: none»
        c.catalogs.openai.status = 'idle'
        await flushPromises()
        expect(testata()).not.toContain('Not configured')
        expect(wrapper.get('[data-provider="deepseek"] button[aria-expanded]').text()).toContain('Not configured')
    })

    it('renders all six provider runtimes and keeps credentials masked', () => {
        const wrapper = mount(TalosMobileProviderRuntimePanel)
        expect(wrapper.findAll('[data-provider-runtime]')).toHaveLength(6)
        expect(wrapper.get('[aria-label="Anthropic API key"]').attributes('type')).toBe('password')
        expect(wrapper.text()).toContain('1 model available')
        expect(wrapper.html()).not.toContain('sentinel-secret')
    })

    it('saves a key, custom OpenAI-compatible endpoint, and native timeout without reload', async () => {
        const target = controller()
        state.controller = target
        const wrapper = mount(TalosMobileProviderRuntimePanel)

        await wrapper.get('[aria-label="DeepSeek API key"]').setValue('sk-deepseek')
        await wrapper.get('[aria-label="Save DeepSeek key"]').trigger('click')
        await wrapper.get('[aria-label="OpenAI custom endpoint"]').setValue('https://gateway.example.test/v1')
        await wrapper.get('[aria-label="OpenAI timeout seconds"]').setValue('42')
        await wrapper.get('[aria-label="Save OpenAI runtime options"]').trigger('click')

        expect(target.saveKey).toHaveBeenCalledWith('deepseek', 'sk-deepseek')
        expect(target.saveEndpoint).toHaveBeenCalledWith('openai', 'https://gateway.example.test/v1')
        expect(target.setProviderTimeout).toHaveBeenCalledWith('openai', 42)
    })

    it('resets a remote custom endpoint and retries discovery through explicit controls', async () => {
        const target = controller()
        state.controller = target
        const wrapper = mount(TalosMobileProviderRuntimePanel)

        await wrapper.get('[aria-label="Reset OpenAI endpoint"]').trigger('click')
        await wrapper.get('[aria-label="Refresh Anthropic models"]').trigger('click')

        expect(target.removeEndpoint).toHaveBeenCalledWith('openai')
        expect(target.refreshProvider).toHaveBeenCalledWith('anthropic')
    })

    it('DEBT-MOBILE-009 RED: a stale OAuth error is not shown once OpenRouter has a saved key', async () => {
        const { talosRiprendiAccessoOpenRouter } = await import('@/services/openRouterLogin')
        vi.mocked(talosRiprendiAccessoOpenRouter).mockResolvedValue({ ok: false, reason: 'exchange' })
        const target = controller()
        target.secrets.openrouter = true
        target.catalogs.openrouter.configured = true
        target.catalogs.openrouter.status = 'ready'
        target.catalogs.openrouter.models = [{ id: 'openrouter-live' }]
        state.controller = target
        const wrapper = mount(TalosMobileProviderRuntimePanel, { attachTo: document.body })
        await wrapper.get('[data-provider="openrouter"] button[aria-controls="provider-openrouter-body"]').trigger('click')
        await wrapper.get('[data-testid="talos-provider-oauth-openrouter"]').trigger('click')
        await flushPromises()
        expect(wrapper.find('[role="alert"]').exists()).toBe(false)
        wrapper.unmount()
    })
})

// Owner 2026-07-24 — providers are collapsible accordions, DEFAULT COLLAPSED
// to declutter; the header shows status, tap expands to configure.
describe('collapsible provider accordions', () => {
    it('renders every provider collapsed by default', async () => {
        const wrapper = mount(TalosMobileProviderRuntimePanel, { attachTo: document.body })
        await flushPromises()
        for (const id of ['openai', 'deepseek', 'openrouter']) {
            const header = wrapper.get(`[data-provider="${id}"] button[aria-controls="provider-${id}-body"]`)
            expect(header.attributes('aria-expanded')).toBe('false')
        }
        wrapper.unmount()
    })

    it('toggles a provider open and closed on header tap', async () => {
        const wrapper = mount(TalosMobileProviderRuntimePanel, { attachTo: document.body })
        await flushPromises()
        const header = wrapper.get('[data-provider="openrouter"] button[aria-controls="provider-openrouter-body"]')
        expect(header.attributes('aria-expanded')).toBe('false')
        await header.trigger('click')
        expect(header.attributes('aria-expanded')).toBe('true')
        await header.trigger('click')
        expect(header.attributes('aria-expanded')).toBe('false')
        wrapper.unmount()
    })
})
