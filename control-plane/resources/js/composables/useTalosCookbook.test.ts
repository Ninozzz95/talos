import { beforeEach, describe, expect, it, vi } from 'vitest'
import { talosFetch } from '../lib/api'
import { useTalosCookbook } from './useTalosCookbook'

vi.mock('../lib/api', async (importOriginal) => ({
    ...await importOriginal<typeof import('../lib/api')>(),
    talosFetch: vi.fn(),
}))

const talosFetchMock = vi.mocked(talosFetch)

describe('useTalosCookbook concurrent state', () => {
    beforeEach(() => {
        talosFetchMock.mockReset()
    })

    it('stays loading until overview, dependency, and policy requests all settle', async () => {
        const releases = new Map<string, (value: { data: unknown }) => void>()
        talosFetchMock.mockImplementation((url) => new Promise((resolve) => {
            releases.set(String(url), resolve as (value: { data: unknown }) => void)
        }) as never)
        const cookbook = useTalosCookbook()

        const overview = cookbook.loadOverview()
        const dependencies = cookbook.loadDependencies()
        const policy = cookbook.loadCookbookPolicy()
        expect(cookbook.loading.value).toBe(true)

        releases.get('/api/talos/cookbook/overview')?.({
            data: { profile: null, runtimes: [], models: [] },
        })
        await overview
        expect(cookbook.loading.value).toBe(true)

        releases.get('/api/talos/cookbook/dependencies')?.({
            data: { dependencies: [], runtimes: [], policy: {} },
        })
        await dependencies
        expect(cookbook.loading.value).toBe(true)

        releases.get('/api/talos/cookbook/policy')?.({ data: {} })
        await policy
        expect(cookbook.loading.value).toBe(false)
    })
})
