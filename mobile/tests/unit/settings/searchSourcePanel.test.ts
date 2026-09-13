// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'

const settings = vi.hoisted(() => ({
    state: {
        search: { source: null as string | null, endpoint: null as string | null },
        tone: { preset: 'balanced' },
        ai_defaults: {
            utility_model_mode: 'same_as_chat',
            research_model_mode: 'same_as_chat',
            vision_enabled: true,
        },
        shell: { library_context_enabled: true, library_autosave_generated: true },
        tools: { read: 'allow', write: 'ask', outbound: 'deny' },
    },
    setSearchPreferences: vi.fn(async (patch: Record<string, unknown>) => {
        Object.assign(settings.state.search, patch)
    }),
    // R-03: DDG-PANEL-01 is the first test in this file to reach a source
    // with neither a missing key nor a missing endpoint, so it is the first
    // to reach this call — it was never mocked before because nothing here
    // exercised that branch of the readiness computed.
    effectiveToolPermissions: vi.fn(() => ({ read: 'allow', write: 'allow', outbound: 'allow' })),
    setToolPermissions: vi.fn(async () => {}),
    setAiDefaults: vi.fn(async () => {}),
    setShell: vi.fn(async () => {}),
    setTone: vi.fn(async () => {}),
}))
vi.mock('@/stores/settings', () => ({ useSettingsStore: () => settings }))
vi.mock('@/services/secureKeyStore', () => ({
    hasProviderKey: vi.fn(async () => false),
    setProviderKey: vi.fn(async () => {}),
    clearProviderKey: vi.fn(async () => {}),
}))
const browser = vi.hoisted(() => ({
    openTalosLinkOnce: vi.fn(async () => true),
}))
vi.mock('@/services/inAppBrowserService', () => browser)

import TalosMobileSearchSourcePanel from '@/components/talos/settings/TalosMobileSearchSourcePanel.vue'
import TalosMobileSettingsAiDefaultsPanel from '@/components/talos/settings/TalosMobileSettingsAiDefaultsPanel.vue'

/**
 * F1 — the screen that decides whether web search exists at all (D3).
 *
 * The last test in this file exists because of a defect that shipped: `Images`
 * was used in the chat options menu without being imported, and NOTHING caught
 * it — `vue-tsc` has no `strictTemplates`, there is no ESLint, and no test
 * mounted the component. A component Vue cannot resolve renders as an unknown
 * element and only complains to the console. So the console is what gets
 * asserted.
 */
let warnings: string[] = []
let warn: ReturnType<typeof vi.spyOn>

beforeEach(() => {
    settings.state.search.source = null
    settings.state.search.endpoint = null
    vi.clearAllMocks()
    browser.openTalosLinkOnce.mockResolvedValue(true)
    warnings = []
    warn = vi.spyOn(console, 'warn').mockImplementation((...args: unknown[]) => {
        warnings.push(args.map(String).join(' '))
    })
})

afterEach(() => {
    warn.mockRestore()
})

describe('search source panel', () => {
    it('offers every source, in the decided order', () => {
        const wrapper = mount(TalosMobileSearchSourcePanel)
        // R-03: DuckDuckGo is the fifth, keyless source.
        for (const id of ['tavily', 'brave', 'searxng', 'custom', 'duckduckgo']) {
            expect(wrapper.find(`[data-testid="talos-search-source-${id}"]`).exists()).toBe(true)
        }
    })

    it('DDG-PANEL-01 DuckDuckGo asks for neither a key nor an endpoint, and reads as ready', () => {
        settings.state.search.source = 'duckduckgo'
        const wrapper = mount(TalosMobileSearchSourcePanel)
        expect(wrapper.find('[data-testid="talos-search-key"]').exists()).toBe(false)
        expect(wrapper.find('[data-testid="talos-search-endpoint"]').exists()).toBe(false)
        expect(wrapper.get('[data-testid="talos-search-readiness"]').text()).toMatch(/ready/i)
    })

    it('says out loud that nothing is offered to the model until a source is chosen', () => {
        const wrapper = mount(TalosMobileSearchSourcePanel)
        // D3 made visible: the model receives no schemas, so it cannot promise
        // a search it will not run — and the user should know why.
        expect(wrapper.get('[data-testid="talos-search-readiness"]').text())
            .toMatch(/No source chosen/i)
    })

    it('records the choice when a source is tapped', async () => {
        const wrapper = mount(TalosMobileSearchSourcePanel)
        await wrapper.get('[data-testid="talos-search-source-tavily"]').trigger('click')
        expect(settings.setSearchPreferences).toHaveBeenCalledWith({ source: 'tavily' })
    })

    it('asks for a key only where a key is needed', () => {
        settings.state.search.source = 'tavily'
        const wrapper = mount(TalosMobileSearchSourcePanel)
        expect(wrapper.find('[data-testid="talos-search-key"]').exists()).toBe(true)
        // Tavily is hosted: asking for an instance address would be a field that
        // means nothing, which is the same class of lie as a dead toggle.
        expect(wrapper.find('[data-testid="talos-search-endpoint"]').exists()).toBe(false)
    })

    it('TAVILY-LINK-01 shows the account/key action only for Tavily', async () => {
        settings.state.search.source = 'tavily'
        const wrapper = mount(TalosMobileSearchSourcePanel)
        expect(wrapper.get('[data-testid="talos-tavily-api-key-link"]').text())
            .toMatch(/Get a Tavily API key/i)

        wrapper.unmount()
        settings.state.search.source = 'brave'
        const braveWrapper = mount(TalosMobileSearchSourcePanel)
        expect(braveWrapper.find('[data-testid="talos-tavily-api-key-link"]').exists()).toBe(false)
    })

    it('TAVILY-LINK-02 opens only the exact official platform in the system browser', async () => {
        settings.state.search.source = 'tavily'
        const wrapper = mount(TalosMobileSearchSourcePanel)

        await wrapper.get('[data-testid="talos-tavily-api-key-link"]').trigger('click')
        await flushPromises()

        expect(browser.openTalosLinkOnce).toHaveBeenCalledOnce()
        expect(browser.openTalosLinkOnce).toHaveBeenCalledWith(
            'https://app.tavily.com/',
            'system_browser',
        )
    })

    it('TAVILY-LINK-03 reports a failed open without touching settings or secure keys', async () => {
        browser.openTalosLinkOnce.mockResolvedValueOnce(false)
        settings.state.search.source = 'tavily'
        const wrapper = mount(TalosMobileSearchSourcePanel)

        await wrapper.get('[data-testid="talos-tavily-api-key-link"]').trigger('click')
        await flushPromises()

        expect(wrapper.get('[role="status"]').text()).toMatch(/could not open Tavily/i)
        expect(settings.setSearchPreferences).not.toHaveBeenCalled()
        const secure = await import('@/services/secureKeyStore')
        expect(secure.setProviderKey).not.toHaveBeenCalled()
        expect(secure.clearProviderKey).not.toHaveBeenCalled()
    })

    it('asks for the instance address for SearXNG, and no key', () => {
        settings.state.search.source = 'searxng'
        const wrapper = mount(TalosMobileSearchSourcePanel)
        expect(wrapper.find('[data-testid="talos-search-endpoint"]').exists()).toBe(true)
        expect(wrapper.find('[data-testid="talos-search-key"]').exists()).toBe(false)
    })

    it('a chosen source with no key still reports web search as OFF', () => {
        settings.state.search.source = 'tavily'
        const wrapper = mount(TalosMobileSearchSourcePanel)
        // Half-configured must never read as ready: the model would be offered
        // a tool that fails on first use.
        expect(wrapper.get('[data-testid="talos-search-readiness"]').text())
            .toMatch(/key is still needed/i)
    })

    it('shows Brave current billing controls and its blocking retention constraint', () => {
        // Rechecked against Brave's current official FAQ on 2026-07-28:
        // spending limits now exist, while API data retention is prohibited
        // without a separate agreement.
        const text = mount(TalosMobileSearchSourcePanel).text()
        expect(text).toMatch(/credit card/i)
        expect(text).toMatch(/spending limit/i)
        expect(text).toMatch(/does not allow TALOS to save search results/i)
        expect(text).toMatch(/web_read|open/i)
        expect(text).not.toMatch(/no spending cap/i)
    })

    it('mounts inside the AI panel with every component resolved', () => {
        mount(TalosMobileSettingsAiDefaultsPanel, {
            global: { stubs: { TalosThemedSelect: true, teleport: true } },
        })
        const unresolved = warnings.filter((entry) => entry.includes('Failed to resolve component'))
        expect(unresolved, unresolved.join('\n')).toEqual([])
    })
})
