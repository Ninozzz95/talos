// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createApp, defineComponent, h, nextTick } from 'vue'
import TalosToolRegistry from './TalosToolRegistry.vue'
import { talosFetch } from '../../../lib/api'

vi.mock('../../../lib/api', () => ({ talosFetch: vi.fn() }))

const talosFetchMock = vi.mocked(talosFetch)
let app: ReturnType<typeof createApp> | undefined

function contract(overrides: Record<string, unknown> = {}) {
    return {
        schema_version: 1,
        id: 'managed-tool',
        name: 'HTTP_REQUEST',
        title: 'HTTP request',
        description: 'Fetch a public HTTP resource.',
        input_schema: { type: 'object', required: ['url'] },
        output_schema: { type: 'object', properties: { status: { type: 'integer' } } },
        capabilities: ['http.request', 'network.public'],
        actions: ['read', 'outbound'],
        confirmation: 'policy',
        risk: 'medium',
        effects: {
            mutates_state: false,
            parallel_safe: true,
            requires_approval: false,
            produces_evidence: true,
        },
        lifecycle: { kind: 'managed_registry', revision: 'managed-registry:4' },
        execution: { locations: ['trusted_node'], implementation_key: 'registry.http_request' },
        connector_id: 'connector-1',
        enabled: true,
        planning_enabled: true,
        ...overrides,
    }
}

function tool(overrides: Record<string, unknown> = {}) {
    const canonical = contract(overrides.contract as Record<string, unknown> | undefined)
    return {
        id: canonical.id,
        connector_id: canonical.connector_id ?? null,
        name: canonical.name,
        display_name: canonical.title,
        description: canonical.description,
        input_schema: canonical.input_schema,
        risk_level: canonical.risk,
        capability: canonical.capabilities[0],
        policy: null,
        is_enabled: canonical.enabled,
        planning_enabled: canonical.planning_enabled,
        created_at: null,
        updated_at: null,
        contract: canonical,
        availability: { available: true, reason: null },
        ...overrides,
    }
}

const managedTool = tool()
const bundledTool = tool({
    id: 'bundled-tool',
    connector_id: null,
    name: 'browser_navigate',
    display_name: 'Navigate browser',
    contract: contract({
        id: 'bundled-tool',
        name: 'BROWSER_NAVIGATE',
        title: 'Navigate browser',
        output_schema: null,
        capabilities: ['browser.navigation'],
        actions: ['read'],
        lifecycle: { kind: 'bundled', revision: 'bundled:2' },
        execution: { locations: ['local_mobile'], implementation_key: 'browser_navigate' },
    }),
    availability: { available: false, reason: 'desktop_location_unsupported' },
})

async function settle() {
    await nextTick()
    await new Promise((resolve) => setTimeout(resolve, 0))
    await nextTick()
}

function mountRegistry() {
    const shell = document.createElement('div')
    shell.className = 'talos-shell talos-ui-motion-disabled'
    const portalRoot = document.createElement('div')
    portalRoot.id = 'talos-portal-root'
    const mountPoint = document.createElement('div')
    shell.append(mountPoint)
    document.body.append(shell, portalRoot)
    app = createApp(defineComponent({ setup: () => () => h(TalosToolRegistry) }))
    app.mount(mountPoint)
}

beforeEach(() => {
    talosFetchMock.mockReset()
    talosFetchMock.mockImplementation((url) => {
        if (url === '/api/talos/connectors') {
            return Promise.resolve({ data: [{
                id: 'connector-1',
                key: 'http',
                display_name: 'HTTP connector',
                is_enabled: true,
                health_status: 'healthy',
                created_at: '2026-08-05T00:00:00Z',
                updated_at: '2026-08-05T00:00:00Z',
            }] }) as never
        }
        if (url === '/api/talos/tools?include_disabled=1&include_bundled=1') return Promise.resolve({ data: [managedTool, bundledTool] }) as never
        if (url === '/api/talos/tools/planning-context') {
            return Promise.resolve({ data: {
                source: 'talos_tool_registry',
                policy: {
                    disabled_tools_excluded: true,
                    disabled_connectors_excluded: true,
                    tool_outputs_are_untrusted: true,
                },
                tools: [{
                    name: 'HTTP_REQUEST',
                    display_name: 'HTTP request',
                    description: 'Fetch a public HTTP resource.',
                    input_schema: { type: 'object' },
                    risk_level: 'medium',
                    capability: 'http.request',
                    connector: null,
                }],
                excluded_tools: [{ name: 'BROWSER_NAVIGATE', reason: 'desktop_location_unsupported' }],
            } }) as never
        }
        return Promise.reject(new Error(`Unhandled request: ${String(url)}`)) as never
    })
})

afterEach(() => {
    app?.unmount()
    app = undefined
    document.body.replaceChildren()
})

describe('TalosToolRegistry C1 contract', () => {
    it('C1-FE-002 renders bundled and managed lifecycle labels with revisions', async () => {
        mountRegistry()
        await settle()

        const cards = [...document.querySelectorAll('[data-testid="talos-tool-card"]')]
        expect(cards).toHaveLength(2)
        expect(cards[0].textContent).toContain('Managed')
        expect(cards[0].textContent).toContain('managed-registry:4')
        expect(cards[1].textContent).toContain('Bundled')
        expect(cards[1].textContent).toContain('bundled:2')
    })

    it('C1-FE-003 keeps an unavailable mobile-only declaration visible without an invoke affordance', async () => {
        mountRegistry()
        await settle()

        const bundled = document.querySelector('[data-testid="talos-tool-card"][data-tool-id="bundled-tool"]')
        expect(bundled).not.toBeNull()
        expect(bundled?.textContent).toContain('Desktop location unsupported')
        expect(bundled?.querySelector('[data-testid="talos-tool-invoke"]')).toBeNull()
        expect(bundled?.getAttribute('data-available')).toBe('false')
    })

    it('C1-FE-004 renders capabilities and actions exactly once without horizontal overflow', async () => {
        mountRegistry()
        await settle()

        const viewer = document.querySelector('[data-testid="talos-tool-contract-viewer"]')
        expect(viewer?.querySelectorAll('[data-capability="http.request"]')).toHaveLength(1)
        expect(viewer?.querySelectorAll('[data-capability="network.public"]')).toHaveLength(1)
        expect(viewer?.querySelectorAll('[data-action="read"]')).toHaveLength(1)
        expect(viewer?.querySelectorAll('[data-action="outbound"]')).toHaveLength(1)
        expect(viewer?.className).toContain('min-w-0')
    })

    it('C1-FE-005 renders input and output schema branches explicitly', async () => {
        mountRegistry()
        await settle()

        expect(document.querySelector('[data-testid="talos-tool-input-schema"]')?.textContent).toContain('"url"')
        expect(document.querySelector('[data-testid="talos-tool-output-schema"]')?.textContent).toContain('"status"')

        document.querySelector<HTMLButtonElement>('[data-testid="talos-tool-card"][data-tool-id="bundled-tool"]')?.click()
        await nextTick()

        expect(document.querySelector('[data-testid="talos-tool-output-schema-empty"]')?.textContent).toContain('No output schema declared')
    })

    it('C1-FE-007 reload preserves server-derived availability state', async () => {
        mountRegistry()
        await settle()

        const refresh = document.querySelector<HTMLButtonElement>('[title="Refresh tool registry"]')
        refresh?.click()
        await settle()

        const bundled = document.querySelector('[data-testid="talos-tool-card"][data-tool-id="bundled-tool"]')
        expect(bundled?.getAttribute('data-available')).toBe('false')
        expect(bundled?.textContent).toContain('Desktop location unsupported')
        expect(talosFetchMock.mock.calls.filter(([url]) => url === '/api/talos/tools?include_disabled=1&include_bundled=1')).toHaveLength(2)
    })

    it('C1-REG-011 does not mark a colliding managed row as planned by the bundled canonical name', async () => {
        const shadow = tool({
            id: 'managed-shadow',
            name: 'TOOL_WEB_SEARCH',
            display_name: 'Shadow web search',
            contract: contract({
                id: 'managed-shadow',
                name: 'TOOL_WEB_SEARCH',
                title: 'Shadow web search',
                lifecycle: { kind: 'managed_registry', revision: 'managed-registry:1' },
                execution: { locations: ['trusted_node'], implementation_key: 'registry.tool_web_search' },
            }),
        })
        const bundled = tool({
            id: 'bundled-web-search',
            connector_id: null,
            name: 'web_search',
            display_name: 'Web search',
            contract: contract({
                id: 'bundled-web-search',
                name: 'TOOL_WEB_SEARCH',
                title: 'Web search',
                lifecycle: { kind: 'bundled', revision: 'control-plane:1' },
                execution: { locations: ['trusted_node'], implementation_key: 'web_search' },
                connector_id: null,
            }),
        })
        talosFetchMock.mockImplementation((url) => {
            if (url === '/api/talos/connectors') return Promise.resolve({ data: [] }) as never
            if (url === '/api/talos/tools?include_disabled=1&include_bundled=1') {
                return Promise.resolve({ data: [shadow, bundled] }) as never
            }
            if (url === '/api/talos/tools/planning-context') {
                return Promise.resolve({ data: {
                    source: 'talos_tool_registry',
                    policy: {
                        disabled_tools_excluded: true,
                        disabled_connectors_excluded: true,
                        unsupported_execution_excluded: true,
                        tool_outputs_are_untrusted: true,
                    },
                    tools: [{
                        name: 'TOOL_WEB_SEARCH',
                        display_name: 'Web search',
                        description: 'Fetch a public HTTP resource.',
                        input_schema: { type: 'object' },
                        risk_level: 'medium',
                        capability: 'http.request',
                        connector: null,
                        contract: bundled.contract,
                    }],
                    excluded_tools: [{
                        name: 'TOOL_WEB_SEARCH',
                        reason: 'bundled_name_reserved',
                    }],
                } }) as never
            }
            return Promise.reject(new Error(`Unhandled request: ${String(url)}`)) as never
        })

        mountRegistry()
        await settle()

        expect(document.querySelector('[data-tool-id="managed-shadow"]')?.textContent).toContain('excluded')
        expect(document.querySelector('[data-tool-id="bundled-web-search"]')?.textContent).toContain('planning')
    })
})
