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
    const loadingToolRegistry = ref(false)
    const toolRegistryError = ref<string | null>(null)

    const planningToolNames = computed(() => new Set(
        planningContext.value?.tools.map((tool) => tool.name) ?? [],
    ))

    async function loadConnectors(includeTools = false) {
        loadingToolRegistry.value = true
        toolRegistryError.value = null

        try {
            const query = includeTools ? '?include_tools=1' : ''
            const response = await talosFetch<ApiEnvelope<TalosConnector[]>>(`/api/talos/connectors${query}`)
            connectors.value = response.data
            return response.data
        } catch (error) {
            toolRegistryError.value = error instanceof Error ? error.message : 'TALOS could not load connectors.'
            throw error
        } finally {
            loadingToolRegistry.value = false
        }
    }

    async function loadTools(includeDisabled = true) {
        loadingToolRegistry.value = true
        toolRegistryError.value = null

        try {
            const query = includeDisabled ? '?include_disabled=1' : ''
            const response = await talosFetch<ApiEnvelope<TalosTool[]>>(`/api/talos/tools${query}`)
            tools.value = response.data
            return response.data
        } catch (error) {
            toolRegistryError.value = error instanceof Error ? error.message : 'TALOS could not load tools.'
            throw error
        } finally {
            loadingToolRegistry.value = false
        }
    }

    async function loadPlanningContext() {
        loadingToolRegistry.value = true
        toolRegistryError.value = null

        try {
            const response = await talosFetch<ApiEnvelope<TalosToolPlanningContext>>('/api/talos/tools/planning-context')
            planningContext.value = response.data
            return response.data
        } catch (error) {
            toolRegistryError.value = error instanceof Error ? error.message : 'TALOS could not load tool planning context.'
            throw error
        } finally {
            loadingToolRegistry.value = false
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
