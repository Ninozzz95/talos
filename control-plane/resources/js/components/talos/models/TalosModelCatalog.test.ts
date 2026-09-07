// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createApp, defineComponent, h, nextTick } from 'vue'
import TalosModelCatalog from './TalosModelCatalog.vue'
import { useTalosModelProfiles } from '../../../composables/useTalosModelProfiles'
import { talosFetch } from '../../../lib/api'
import type { TalosModelProfile } from '../../../lib/talosTypes'

vi.mock('../../../lib/api', () => ({ talosFetch: vi.fn() }))

const talosFetchMock = vi.mocked(talosFetch)
let app: ReturnType<typeof createApp> | undefined

function profile(overrides: Partial<TalosModelProfile> = {}): TalosModelProfile {
    return {
        id: 'profile-anthropic',
        provider: 'anthropic',
        model: 'claude-sonnet-4-6',
        display_name: 'Claude Sonnet',
        base_url: null,
        timeout_seconds: 60,
        status: 'healthy',
        capabilities: { vision: true, tools: true },
        probe_result: { ok: true },
        has_secret: true,
        effort_levels: ['low', 'medium', 'high'],
        supports_thinking: true,
        show_in_composer: true,
        created_at: '2026-07-20T00:00:00Z',
        updated_at: '2026-07-20T00:00:00Z',
        ...overrides,
    }
}

async function settle() {
    await nextTick()
    await new Promise((resolve) => setTimeout(resolve, 0))
    await nextTick()
}

function mountCatalog() {
    const shell = document.createElement('div')
    shell.className = 'talos-shell'
    const mountPoint = document.createElement('div')
    shell.append(mountPoint)
    document.body.append(shell)
    app = createApp(defineComponent({ setup: () => () => h(TalosModelCatalog) }))
    app.mount(mountPoint)
}

beforeEach(() => {
    talosFetchMock.mockReset()
    useTalosModelProfiles().modelProfiles.value = []
})

afterEach(() => {
    app?.unmount()
    app = undefined
    document.body.replaceChildren()
})

describe('TalosModelCatalog', () => {
    it('renders a card per profile with the effort ladder derived from effort_levels', async () => {
        talosFetchMock.mockResolvedValueOnce({ data: [
            profile(),
            profile({ id: 'profile-deepseek', provider: 'deepseek', model: 'deepseek-v4-flash', display_name: 'DeepSeek Flash', effort_levels: [], supports_thinking: false, status: 'untested', probe_result: null }),
        ] } as never)
        mountCatalog()
        await settle()

        const cards = [...document.querySelectorAll('[data-testid="talos-catalog-card"]')]
        expect(cards).toHaveLength(2)

        const claude = document.querySelector('[data-testid="talos-catalog-card"][data-profile-id="profile-anthropic"]')
        const claudeEffort = [...(claude?.querySelectorAll('[data-testid="talos-catalog-effort"]') ?? [])].map((pill) => pill.getAttribute('data-effort-level'))
        expect(claudeEffort).toEqual(['off', 'low', 'medium', 'high'])
        expect(claude?.querySelector('[data-testid="talos-catalog-compat"]')?.textContent).toContain('Chat ready')

        const flash = document.querySelector('[data-testid="talos-catalog-card"][data-profile-id="profile-deepseek"]')
        const flashEffort = [...(flash?.querySelectorAll('[data-testid="talos-catalog-effort"]') ?? [])].map((pill) => pill.getAttribute('data-effort-level'))
        expect(flashEffort).toEqual(['off'])
        expect(flash?.querySelector('[data-testid="talos-catalog-compat"]')?.textContent).toContain('Unverified')
    })

    it('toggles composer visibility through a PATCH and re-filters reactively without a reload', async () => {
        talosFetchMock.mockResolvedValueOnce({ data: [profile()] } as never)
        mountCatalog()
        await settle()

        const card = () => document.querySelector('[data-testid="talos-catalog-card"][data-profile-id="profile-anthropic"]')
        expect(card()?.getAttribute('data-visible')).toBe('true')

        talosFetchMock.mockResolvedValueOnce({ data: profile({ show_in_composer: false }) } as never)
        document.querySelector<HTMLButtonElement>('[data-testid="talos-catalog-visibility-toggle"]')?.click()
        await settle()

        const patchCall = talosFetchMock.mock.calls.find(([url, options]) => url === '/api/talos/model-profiles/profile-anthropic' && (options as { method?: string })?.method === 'PATCH')
        expect(patchCall).toBeTruthy()
        expect(JSON.parse((patchCall![1] as { body: string }).body)).toEqual({ show_in_composer: false })
        expect(card()?.getAttribute('data-visible')).toBe('false')
        // No collection reload: only the mount GET and the single PATCH.
        expect(talosFetchMock.mock.calls.filter(([url]) => url === '/api/talos/model-profiles').length).toBe(1)
    })

    it('filters the grid by provider rail and search', async () => {
        talosFetchMock.mockResolvedValueOnce({ data: [
            profile(),
            profile({ id: 'profile-deepseek', provider: 'deepseek', model: 'deepseek-v4-flash', display_name: 'DeepSeek Flash' }),
        ] } as never)
        mountCatalog()
        await settle()

        expect(document.querySelectorAll('[data-testid="talos-catalog-card"]')).toHaveLength(2)

        document.querySelector<HTMLButtonElement>('[data-testid="talos-catalog-provider"][data-provider="deepseek"]')?.click()
        await nextTick()
        const cards = [...document.querySelectorAll('[data-testid="talos-catalog-card"]')]
        expect(cards).toHaveLength(1)
        expect(cards[0].getAttribute('data-profile-id')).toBe('profile-deepseek')
    })
})
