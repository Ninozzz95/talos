import { beforeEach, describe, expect, it, vi } from 'vitest'
import { talosFetch } from '../lib/api'
import { useTalosTools } from './useTalosTools'

vi.mock('../lib/api', async (importOriginal) => ({
    ...await importOriginal<typeof import('../lib/api')>(),
    talosFetch: vi.fn(),
}))

const talosFetchMock = vi.mocked(talosFetch)

function toolResponse(overrides: Record<string, unknown> = {}) {
    return {
        id: 'tool-managed',
        connector_id: 'connector-1',
        name: 'HTTP_REQUEST',
        display_name: 'HTTP request',
        description: 'Fetch a public HTTP resource.',
        input_schema: { type: 'object', required: ['url'] },
        risk_level: 'medium',
        capability: 'http.request',
        policy: null,
        is_enabled: true,
        planning_enabled: true,
        connector: null,
        created_at: '2026-08-05T00:00:00Z',
        updated_at: '2026-08-05T00:00:00Z',
        contract: {
            schema_version: 1,
            id: 'tool-managed',
            name: 'HTTP_REQUEST',
            title: 'HTTP request',
            description: 'Fetch a public HTTP resource.',
            input_schema: { type: 'object', required: ['url'] },
            output_schema: null,
            capabilities: ['http.request'],
            actions: ['read', 'outbound'],
            confirmation: 'policy',
            risk: 'medium',
            effects: {
                mutates_state: false,
                parallel_safe: true,
                requires_approval: false,
                produces_evidence: true,
            },
            lifecycle: { kind: 'managed_registry', revision: 'managed-registry:1' },
            execution: { locations: ['trusted_node'], implementation_key: 'registry.http_request' },
            connector_id: 'connector-1',
            enabled: true,
            planning_enabled: true,
        },
        availability: { available: true, reason: null },
        ...overrides,
    }
}

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

        const toolsRequest = [...releases.entries()].find(([url]) => url.startsWith('/api/talos/tools?'))
        toolsRequest?.[1]({ data: [] })
        await Promise.resolve()
        expect(registry.loadingToolRegistry.value).toBe(true)

        releases.get('/api/talos/tools/planning-context')?.({ data: {
            source: 'talos_tool_registry',
            policy: {
                disabled_tools_excluded: true,
                disabled_connectors_excluded: true,
                tool_outputs_are_untrusted: true,
            },
            tools: [],
            excluded_tools: [],
        } })
        await refresh
        expect(registry.loadingToolRegistry.value).toBe(false)
        expect(toolsRequest?.[0]).toBe('/api/talos/tools?include_disabled=1&include_bundled=1')
    })

    it('C1-FE-001 rejects unknown schema versions and missing nested effects', async () => {
        const registry = useTalosTools()
        const invalidVersion = toolResponse({
            contract: { ...toolResponse().contract as Record<string, unknown>, schema_version: 2 },
        })
        talosFetchMock.mockResolvedValueOnce({ data: [invalidVersion] } as never)

        await expect(registry.loadTools()).rejects.toThrow('invalid Tool Registry response')
        expect(registry.tools.value).toEqual([])
        expect(registry.toolRegistryError.value).toContain('invalid Tool Registry response')

        const missingEffects = toolResponse({
            contract: Object.fromEntries(Object.entries(toolResponse().contract as Record<string, unknown>)
                .filter(([key]) => key !== 'effects')),
        })
        talosFetchMock.mockResolvedValueOnce({ data: [missingEffects] } as never)

        await expect(registry.loadTools()).rejects.toThrow('invalid Tool Registry response')
        expect(registry.tools.value).toEqual([])
    })

    it('rejects duplicate actions, unknown locations, and contradictory availability', async () => {
        const registry = useTalosTools()
        const baseContract = toolResponse().contract as Record<string, unknown>
        const invalidResponses = [
            toolResponse({ contract: { ...baseContract, actions: ['read', 'read'] } }),
            toolResponse({ contract: { ...baseContract, execution: { locations: ['browser_extension'], implementation_key: 'registry.http_request' } } }),
            toolResponse({ availability: { available: true, reason: 'connector_unhealthy' } }),
        ]

        for (const invalid of invalidResponses) {
            talosFetchMock.mockResolvedValueOnce({ data: [invalid] } as never)
            await expect(registry.loadTools()).rejects.toThrow('invalid Tool Registry response')
        }
    })

    it('rejects malformed planning arrays instead of accepting partial state', async () => {
        const registry = useTalosTools()
        talosFetchMock.mockResolvedValueOnce({ data: {
            source: 'talos_tool_registry',
            policy: {
                disabled_tools_excluded: true,
                disabled_connectors_excluded: true,
                tool_outputs_are_untrusted: true,
            },
            tools: [],
            excluded_tools: { name: 'HTTP_REQUEST', reason: 'tool_disabled' },
        } } as never)

        await expect(registry.loadPlanningContext()).rejects.toThrow('invalid Tool Registry response')
        expect(registry.planningContext.value).toBeNull()
    })

    it('normalizes a legacy planning context without excluded_tools to an empty list', async () => {
        const registry = useTalosTools()
        talosFetchMock.mockResolvedValueOnce({ data: {
            source: 'talos_tool_registry',
            policy: {
                disabled_tools_excluded: true,
                disabled_connectors_excluded: true,
                tool_outputs_are_untrusted: true,
            },
            tools: [],
        } } as never)

        const context = await registry.loadPlanningContext()

        expect(context.excluded_tools).toEqual([])
    })

    it('C1-FE-006 preserves legacy top-level fields while exposing the canonical contract', async () => {
        const registry = useTalosTools()
        talosFetchMock.mockResolvedValueOnce({ data: [toolResponse()] } as never)

        const loaded = await registry.loadTools()

        expect(talosFetchMock).toHaveBeenCalledWith('/api/talos/tools?include_disabled=1&include_bundled=1')
        expect(loaded[0]).toMatchObject({
            name: 'HTTP_REQUEST',
            display_name: 'HTTP request',
            risk_level: 'medium',
            capability: 'http.request',
            is_enabled: true,
            planning_enabled: true,
        })
        expect(loaded[0].contract.lifecycle.kind).toBe('managed_registry')
    })
})
