<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { RefreshCw, Wrench } from '@lucide/vue'
import Button from '../../ui/Button.vue'
import Badge from '../../ui/Badge.vue'
import Surface from '../../ui/Surface.vue'
import TalosGuideInfoButton from '../guide/TalosGuideInfoButton.vue'
import TalosConnectorHealth from './TalosConnectorHealth.vue'
import TalosToolSchemaViewer from './TalosToolSchemaViewer.vue'
import { useTalosTools } from '../../../composables/useTalosTools'
import { resolveTalosCollectionState } from '../../../lib/talosCollectionState'
import type { TalosConnector, TalosTool } from '../../../lib/talosTypes'

const {
    connectors,
    tools,
    planningContext,
    planningToolIds,
    legacyPlanningToolNames,
    loadingToolRegistry,
    toolRegistryError,
    refreshToolRegistry,
} = useTalosTools()

const selectedConnectorId = ref<string | null>(null)
const selectedToolId = ref<string | null>(null)
const showExcluded = ref(true)
const registryRequested = ref(false)

const selectedConnector = computed(() => connectors.value.find((connector) => connector.id === selectedConnectorId.value) ?? null)
const visibleTools = computed(() => {
    return tools.value.filter((tool) => {
        if (selectedConnectorId.value && tool.connector_id !== selectedConnectorId.value) {
            return false
        }

        if (!showExcluded.value && !isPlanningTool(tool)) {
            return false
        }

        return true
    })
})
const selectedTool = computed(() => visibleTools.value.find((tool) => tool.id === selectedToolId.value) ?? visibleTools.value[0] ?? null)
const planningCount = computed(() => planningContext.value?.tools.length ?? 0)
const excludedCount = computed(() => tools.value.filter((tool) => !isPlanningTool(tool)).length)
const registryState = computed(() => resolveTalosCollectionState({
    itemCount: connectors.value.length + tools.value.length,
    loading: loadingToolRegistry.value,
    error: toolRegistryError.value,
    requested: registryRequested.value,
}))

function selectConnector(connector: TalosConnector) {
    selectedConnectorId.value = selectedConnectorId.value === connector.id ? null : connector.id
    selectedToolId.value = null
}

function selectTool(tool: TalosTool) {
    selectedToolId.value = tool.id
}

async function refresh() {
    registryRequested.value = true
    await refreshToolRegistry()

    if (!selectedToolId.value && visibleTools.value.length > 0) {
        selectedToolId.value = visibleTools.value[0].id
    }
}

function isPlanningTool(tool: TalosTool) {
    return planningToolIds.value.has(tool.id)
        || legacyPlanningToolNames.value.has(tool.contract.name)
}

function lifecycleLabel(tool: TalosTool) {
    return tool.contract.lifecycle.kind === 'bundled' ? 'Bundled' : 'Managed'
}

function availabilityLabel(tool: TalosTool) {
    if (tool.availability.available) return 'Available'

    return {
        tool_disabled: 'Tool disabled',
        planning_disabled: 'Planning disabled',
        desktop_location_unsupported: 'Desktop location unsupported',
        connector_disabled: 'Connector disabled',
        connector_unhealthy: 'Connector unhealthy',
    }[tool.availability.reason ?? ''] ?? 'Unavailable'
}

watch(visibleTools, (next) => {
    if (selectedToolId.value && next.some((tool) => tool.id === selectedToolId.value)) {
        return
    }

    selectedToolId.value = next[0]?.id ?? null
})

onMounted(() => {
    refresh().catch(() => {})
})
</script>

<template>
    <Surface>
        <div class="border-b border-[var(--talos-border)] p-4">
            <div class="flex items-start justify-between gap-3">
                <div>
                    <div class="flex items-center gap-1.5">
                        <Wrench class="h-4 w-4 text-[var(--talos-muted)]" />
                        <h3 class="text-base font-semibold text-[var(--talos-text)]">Tool Registry</h3>
                        <TalosGuideInfoButton guide-id="rail.tools" compact side="bottom" />
                    </div>
                    <p class="mt-1 text-xs leading-5 text-[var(--talos-muted)]">
                        Server-side connectors and AVM tools available to planning.
                    </p>
                </div>
                <Button size="icon" variant="ghost" :disabled="loadingToolRegistry" title="Refresh tool registry" @click="refresh">
                    <RefreshCw class="h-4 w-4" :class="{ 'animate-spin': loadingToolRegistry }" />
                </Button>
            </div>
            <div v-if="registryState === 'ready' || registryState === 'empty'" class="mt-3 flex flex-wrap gap-2">
                <Badge tone="neutral">{{ connectors.length }} connectors</Badge>
                <Badge tone="success">{{ planningCount }} planning tools</Badge>
                <Badge :tone="excludedCount > 0 ? 'warning' : 'neutral'">{{ excludedCount }} excluded</Badge>
            </div>
        </div>

        <div class="space-y-4 p-4">
            <div v-if="toolRegistryError" class="rounded-md border border-[var(--talos-danger-border)] bg-[var(--talos-danger-soft)] p-3 text-sm leading-6 text-[var(--talos-text)]">
                {{ toolRegistryError }}
            </div>

            <div v-if="registryState === 'loading'" role="status" class="flex items-center gap-2 rounded-md border border-[var(--talos-border)] bg-[var(--talos-panel-soft)] p-3 text-sm text-[var(--talos-muted)]">
                <RefreshCw class="h-4 w-4 animate-spin text-[var(--talos-accent)]" />
                Loading tool registry
            </div>

            <div v-if="registryState === 'empty'" class="rounded-md border border-[var(--talos-border)] bg-[var(--talos-panel-soft)] p-4 text-sm leading-6 text-[var(--talos-muted)]">
                No connectors or tools are registered in the control plane.
            </div>

            <div v-if="registryState === 'ready'" class="flex items-center justify-between gap-3">
                <div class="text-xs font-semibold uppercase text-[var(--talos-muted)]">connectors</div>
                <label class="flex items-center gap-2 text-xs text-[var(--talos-muted)]">
                    <input v-model="showExcluded" type="checkbox" class="h-4 w-4 rounded border-[var(--talos-border)] bg-[var(--talos-panel)]">
                    show excluded
                </label>
            </div>

            <TalosConnectorHealth
                v-if="registryState === 'ready'"
                :connectors="connectors"
                :selected-connector-id="selectedConnectorId"
                @select="selectConnector"
            />

            <div v-if="registryState === 'ready' && !connectors.length" class="rounded-md border border-[var(--talos-border)] bg-[var(--talos-panel-soft)] p-4 text-sm leading-6 text-[var(--talos-muted)]">
                No connectors are registered in the control plane.
            </div>

            <div v-if="registryState === 'ready'" class="min-w-0 rounded-md border border-[var(--talos-border)] bg-[var(--talos-panel-soft)] p-3">
                <div class="mb-3 flex items-center justify-between gap-3">
                    <div>
                        <div class="text-sm font-semibold text-[var(--talos-text)]">Tools</div>
                        <div class="mt-1 text-xs text-[var(--talos-muted)]">{{ selectedConnector?.display_name ?? 'All connectors' }}</div>
                    </div>
                    <Badge tone="neutral">{{ visibleTools.length }} visible</Badge>
                </div>
                <div class="max-h-52 space-y-2 overflow-auto pr-1">
                    <button
                        v-for="tool in visibleTools"
                        :key="tool.id"
                        data-testid="talos-tool-card"
                        :data-tool-id="tool.id"
                        :data-available="String(tool.availability.available)"
                        type="button"
                        class="min-w-0 w-full rounded-md border px-3 py-2 text-left transition"
                        :class="selectedTool?.id === tool.id
                            ? 'border-[var(--talos-accent)] bg-[var(--talos-active)]'
                            : 'border-[var(--talos-border)] bg-[var(--talos-panel)] hover:border-[var(--talos-border-strong)]'"
                        @click="selectTool(tool)"
                    >
                        <div class="flex items-center justify-between gap-3">
                            <span class="min-w-0 truncate font-mono text-xs text-[var(--talos-text)]">{{ tool.name }}</span>
                            <Badge :tone="isPlanningTool(tool) ? 'success' : 'neutral'">
                                {{ isPlanningTool(tool) ? 'planning' : 'excluded' }}
                            </Badge>
                        </div>
                        <div class="mt-1 truncate text-xs text-[var(--talos-muted)]">{{ tool.display_name }}</div>
                        <div class="mt-2 flex min-w-0 flex-wrap items-center gap-1.5">
                            <Badge tone="neutral">{{ lifecycleLabel(tool) }}</Badge>
                            <span class="min-w-0 break-all font-mono text-[10px] text-[var(--talos-muted)]">{{ tool.contract.lifecycle.revision }}</span>
                            <Badge :tone="tool.availability.available ? 'success' : 'warning'">{{ availabilityLabel(tool) }}</Badge>
                        </div>
                    </button>
                     <div v-if="registryState === 'ready' && !visibleTools.length" class="rounded-md border border-[var(--talos-border)] bg-[var(--talos-panel)] p-3 text-sm leading-6 text-[var(--talos-muted)]">
                        No tools match the current registry filter.
                    </div>
                </div>
            </div>

            <TalosToolSchemaViewer
                v-if="registryState === 'ready'"
                :tool="selectedTool"
                :planning-enabled="selectedTool ? isPlanningTool(selectedTool) : false"
            />
        </div>
    </Surface>
</template>
