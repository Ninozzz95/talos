import { beforeEach, describe, expect, it, vi } from 'vitest'
import { talosFetch } from '../lib/api'
import { useTalosTools } from './useTalosTools'

vi.mock('../lib/api', async (importOriginal) => ({
    ...await importOriginal<typeof import('../lib/api')>(),
    talosFetch: vi.fn(),
}))

const talosFetchMock = vi.mocked(talosFetch)

describe('useTalosTools concurrent state', () => {
    beforeEach(() => {
        talosFetchMock.mockReset()
    })

    it('stays loading until connectors, tools, and planning context all settle', async () => {
        const releases = new Map<string, (value: { data: unknown }) => void>()
        talosFetchMock.mockImplementation((url) => new Promise((resolve) => {
            releases.set(String(url), resolve as (value: { data: unknown }) => void)
        }) as never)
        const registry = useTalosTools()

        const refresh = registry.refreshToolRegistry()
        expect(registry.loadingToolRegistry.value).toBe(true)

        releases.get('/api/talos/connectors')?.({ data: [] })
        await Promise.resolve()
        expect(registry.loadingToolRegistry.value).toBe(true)

        releases.get('/api/talos/tools?include_disabled=1')?.({ data: [] })
        await Promise.resolve()
        expect(registry.loadingToolRegistry.value).toBe(true)

        releases.get('/api/talos/tools/planning-context')?.({ data: { tools: [], excluded_tools: [] } })
        await refresh
        expect(registry.loadingToolRegistry.value).toBe(false)
    })
})
