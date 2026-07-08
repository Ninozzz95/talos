<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { RefreshCw, Wrench } from '@lucide/vue'
import Button from '../../ui/Button.vue'
import Badge from '../../ui/Badge.vue'
import Surface from '../../ui/Surface.vue'
import TalosConnectorHealth from './TalosConnectorHealth.vue'
import TalosToolSchemaViewer from './TalosToolSchemaViewer.vue'
import { useTalosTools } from '../../../composables/useTalosTools'
import type { TalosConnector, TalosTool } from '../../../lib/talosTypes'

const {
    connectors,
    tools,
    planningContext,
    planningToolNames,
    loadingToolRegistry,
    toolRegistryError,
    refreshToolRegistry,
} = useTalosTools()

const selectedConnectorId = ref<string | null>(null)
const selectedToolId = ref<string | null>(null)
const showExcluded = ref(true)

const selectedConnector = computed(() => connectors.value.find((connector) => connector.id === selectedConnectorId.value) ?? null)
const visibleTools = computed(() => {
    return tools.value.filter((tool) => {
        if (selectedConnectorId.value && tool.connector_id !== selectedConnectorId.value) {
            return false
        }

        if (!showExcluded.value && !planningToolNames.value.has(tool.name)) {
            return false
        }

        return true
    })
})
const selectedTool = computed(() => visibleTools.value.find((tool) => tool.id === selectedToolId.value) ?? visibleTools.value[0] ?? null)
const planningCount = computed(() => planningContext.value?.tools.length ?? 0)
const excludedCount = computed(() => Math.max(0, tools.value.length - planningCount.value))

function selectConnector(connector: TalosConnector) {
    selectedConnectorId.value = connector.id
    selectedToolId.value = null
}

function selectTool(tool: TalosTool) {
    selectedToolId.value = tool.id
}

async function refresh() {
    await refreshToolRegistry()

    if (!selectedConnectorId.value && connectors.value.length > 0) {
        selectedConnectorId.value = connectors.value[0].id
    }

    if (!selectedToolId.value && visibleTools.value.length > 0) {
        selectedToolId.value = visibleTools.value[0].id
    }
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
                    <div class="flex items-center gap-2">
                        <Wrench class="h-4 w-4 text-[var(--talos-muted)]" />
                        <h3 class="text-base font-semibold text-[var(--talos-text)]">Tool Registry</h3>
                    </div>
                    <p class="mt-1 text-xs leading-5 text-[var(--talos-muted)]">
                        Server-side connectors and AVM tools available to planning.
                    </p>
                </div>
                <Button size="icon" variant="ghost" :disabled="loadingToolRegistry" title="Refresh tool registry" @click="refresh">
                    <RefreshCw class="h-4 w-4" :class="{ 'animate-spin': loadingToolRegistry }" />
                </Button>
            </div>
            <div class="mt-3 flex flex-wrap gap-2">
                <Badge tone="neutral">{{ connectors.length }} connectors</Badge>
                <Badge tone="success">{{ planningCount }} planning tools</Badge>
                <Badge :tone="excludedCount > 0 ? 'warning' : 'neutral'">{{ excludedCount }} excluded</Badge>
            </div>
        </div>

        <div class="space-y-4 p-4">
            <div v-if="toolRegistryError" class="rounded-md border border-[var(--talos-danger-border)] bg-[var(--talos-danger-soft)] p-3 text-sm leading-6 text-[var(--talos-text)]">
                {{ toolRegistryError }}
            </div>

            <div class="flex items-center justify-between gap-3">
                <div class="text-xs font-semibold uppercase text-[var(--talos-muted)]">connectors</div>
                <label class="flex items-center gap-2 text-xs text-[var(--talos-muted)]">
                    <input v-model="showExcluded" type="checkbox" class="h-4 w-4 rounded border-[var(--talos-border)] bg-[var(--talos-panel)]">
                    show excluded
                </label>
            </div>

            <TalosConnectorHealth
                :connectors="connectors"
                :selected-connector-id="selectedConnectorId"
                @select="selectConnector"
            />

            <div v-if="!connectors.length && !loadingToolRegistry" class="rounded-md border border-[var(--talos-border)] bg-[var(--talos-panel-soft)] p-4 text-sm leading-6 text-[var(--talos-muted)]">
                No connectors are registered in the control plane.
            </div>

            <div class="rounded-md border border-[var(--talos-border)] bg-[var(--talos-panel-soft)] p-3">
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
                        type="button"
                        class="w-full rounded-md border px-3 py-2 text-left transition"
                        :class="selectedTool?.id === tool.id
                            ? 'border-[var(--talos-accent)] bg-[var(--talos-active)]'
                            : 'border-[var(--talos-border)] bg-[var(--talos-panel)] hover:border-[var(--talos-border-strong)]'"
                        @click="selectTool(tool)"
                    >
                        <div class="flex items-center justify-between gap-3">
                            <span class="truncate font-mono text-xs text-[var(--talos-text)]">{{ tool.name }}</span>
                            <Badge :tone="planningToolNames.has(tool.name) ? 'success' : 'neutral'">
                                {{ planningToolNames.has(tool.name) ? 'planning' : 'excluded' }}
                            </Badge>
                        </div>
                        <div class="mt-1 truncate text-xs text-[var(--talos-muted)]">{{ tool.display_name }}</div>
                    </button>
                    <div v-if="!visibleTools.length" class="rounded-md border border-[var(--talos-border)] bg-[var(--talos-panel)] p-3 text-sm leading-6 text-[var(--talos-muted)]">
                        No tools match the current registry filter.
                    </div>
                </div>
            </div>

            <TalosToolSchemaViewer
                :tool="selectedTool"
                :planning-enabled="selectedTool ? planningToolNames.has(selectedTool.name) : false"
            />
        </div>
    </Surface>
</template>
