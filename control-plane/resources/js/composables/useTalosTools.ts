import { computed, ref } from 'vue'
import { talosFetch } from '../lib/api'
import type { TalosConnector, TalosTool, TalosToolPlanningContext } from '../lib/talosTypes'

type ApiEnvelope<T> = {
    data: T
}

export function useTalosTools() {
    const connectors = ref<TalosConnector[]>([])
    const tools = ref<TalosTool[]>([])
    const planningContext = ref<TalosToolPlanningContext | null>(null)
    const pendingToolRegistryRequests = ref(0)
    const loadingToolRegistry = computed(() => pendingToolRegistryRequests.value > 0)
    const toolRegistryError = ref<string | null>(null)

    const planningToolNames = computed(() => new Set(
        planningContext.value?.tools.map((tool) => tool.name) ?? [],
    ))

    async function trackToolRegistryRequest<T>(request: () => Promise<T>) {
        pendingToolRegistryRequests.value += 1
        try {
            return await request()
        } finally {
            pendingToolRegistryRequests.value = Math.max(0, pendingToolRegistryRequests.value - 1)
        }
    }

    async function loadConnectors(includeTools = false) {
        toolRegistryError.value = null

        try {
            return await trackToolRegistryRequest(async () => {
                const query = includeTools ? '?include_tools=1' : ''
                const response = await talosFetch<ApiEnvelope<TalosConnector[]>>(`/api/talos/connectors${query}`)
                connectors.value = response.data
                return response.data
            })
        } catch (error) {
            toolRegistryError.value = error instanceof Error ? error.message : 'TALOS could not load connectors.'
            throw error
        }
    }

    async function loadTools(includeDisabled = true) {
        toolRegistryError.value = null

        try {
            return await trackToolRegistryRequest(async () => {
                const query = includeDisabled ? '?include_disabled=1' : ''
                const response = await talosFetch<ApiEnvelope<TalosTool[]>>(`/api/talos/tools${query}`)
                tools.value = response.data
                return response.data
            })
        } catch (error) {
            toolRegistryError.value = error instanceof Error ? error.message : 'TALOS could not load tools.'
            throw error
        }
    }

    async function loadPlanningContext() {
        toolRegistryError.value = null

        try {
            return await trackToolRegistryRequest(async () => {
                const response = await talosFetch<ApiEnvelope<TalosToolPlanningContext>>('/api/talos/tools/planning-context')
                planningContext.value = response.data
                return response.data
            })
        } catch (error) {
            toolRegistryError.value = error instanceof Error ? error.message : 'TALOS could not load tool planning context.'
            throw error
        }
    }

    async function refreshToolRegistry() {
        const [loadedConnectors, loadedTools, loadedContext] = await Promise.all([
            loadConnectors(),
            loadTools(true),
            loadPlanningContext(),
        ])

        return {
            connectors: loadedConnectors,
            tools: loadedTools,
            planningContext: loadedContext,
        }
    }

    return {
        connectors,
        tools,
        planningContext,
        planningToolNames,
        loadingToolRegistry,
        toolRegistryError,
        loadConnectors,
        loadTools,
        loadPlanningContext,
        refreshToolRegistry,
    }
}
