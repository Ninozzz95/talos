<script setup lang="ts">
import { computed } from 'vue'
import { Code2, LockKeyhole, Route, ShieldAlert } from '@lucide/vue'
import Badge from '../../ui/Badge.vue'
import type { TalosTool } from '../../../lib/talosTypes'

type BadgeTone = 'success' | 'danger' | 'warning' | 'neutral'

const props = defineProps<{
    tool: TalosTool | null
    planningEnabled: boolean
}>()

const inputSchemaText = computed(() => {
    if (!props.tool) {
        return ''
    }

    return JSON.stringify(props.tool.input_schema, null, 2)
})

const outputSchemaText = computed(() => props.tool?.contract.output_schema
    ? JSON.stringify(props.tool.contract.output_schema, null, 2)
    : '')

const requiredFields = computed(() => {
    const required = props.tool?.input_schema?.required

    return Array.isArray(required)
        ? required.filter((field): field is string => typeof field === 'string')
        : []
})

function riskTone(risk: string): BadgeTone {
    if (risk === 'critical' || risk === 'high') {
        return 'danger'
    }

    if (risk === 'medium') {
        return 'warning'
    }

    return 'success'
}

function availabilityLabel() {
    if (!props.tool || props.tool.availability.available) return 'Available'

    return {
        tool_disabled: 'Tool disabled',
        planning_disabled: 'Planning disabled',
        desktop_location_unsupported: 'Desktop location unsupported',
        connector_disabled: 'Connector disabled',
        connector_unhealthy: 'Connector unhealthy',
    }[props.tool.availability.reason ?? ''] ?? 'Unavailable'
}
</script>

<template>
    <div v-if="tool" data-testid="talos-tool-contract-viewer" class="min-w-0 space-y-4">
        <div class="min-w-0 rounded-md border border-[var(--talos-border)] bg-[var(--talos-panel-soft)] p-4">
            <div class="flex items-start justify-between gap-3">
                <div class="min-w-0">
                    <div class="text-sm font-semibold text-[var(--talos-text)]">{{ tool.display_name }}</div>
                    <div class="mt-1 truncate font-mono text-xs text-[var(--talos-muted)]">{{ tool.name }}</div>
                    <div v-if="tool.contract.name !== tool.name" class="mt-1 break-all font-mono text-[10px] text-[var(--talos-muted)]">
                        Canonical: {{ tool.contract.name }}
                    </div>
                </div>
                <Badge :tone="planningEnabled ? 'success' : 'neutral'">
                    {{ planningEnabled ? 'planning' : 'excluded' }}
                </Badge>
            </div>
            <p v-if="tool.description" class="mt-3 text-sm leading-6 text-[var(--talos-muted)]">
                {{ tool.description }}
            </p>
            <div class="mt-3 flex flex-wrap gap-2">
                <Badge :tone="riskTone(tool.risk_level)">
                    <ShieldAlert class="h-3.5 w-3.5" />
                    {{ tool.risk_level }}
                </Badge>
                <Badge :tone="tool.is_enabled ? 'success' : 'danger'">
                    <LockKeyhole class="h-3.5 w-3.5" />
                    {{ tool.is_enabled ? 'enabled' : 'disabled' }}
                </Badge>
                <Badge :tone="tool.availability.available ? 'success' : 'warning'">{{ availabilityLabel() }}</Badge>
            </div>
        </div>

        <div class="min-w-0 rounded-md border border-[var(--talos-border)] bg-[var(--talos-panel-soft)] p-4">
            <div class="grid min-w-0 gap-4 sm:grid-cols-2">
                <div class="min-w-0">
                    <div class="text-[10px] font-semibold uppercase text-[var(--talos-muted)]">Lifecycle</div>
                    <div class="mt-2 flex min-w-0 flex-wrap items-center gap-2">
                        <Badge tone="neutral">{{ tool.contract.lifecycle.kind === 'bundled' ? 'Bundled' : 'Managed' }}</Badge>
                        <span class="min-w-0 break-all font-mono text-xs text-[var(--talos-text)]">{{ tool.contract.lifecycle.revision }}</span>
                    </div>
                </div>
                <div class="min-w-0">
                    <div class="flex items-center gap-1.5 text-[10px] font-semibold uppercase text-[var(--talos-muted)]">
                        <Route class="h-3.5 w-3.5" /> Execution
                    </div>
                    <div class="mt-2 flex min-w-0 flex-wrap gap-2">
                        <Badge v-for="location in tool.contract.execution.locations" :key="location" tone="neutral">{{ location }}</Badge>
                    </div>
                </div>
                <div class="min-w-0">
                    <div class="text-[10px] font-semibold uppercase text-[var(--talos-muted)]">Capabilities</div>
                    <div class="mt-2 flex min-w-0 flex-wrap gap-2">
                        <Badge
                            v-for="capability in tool.contract.capabilities"
                            :key="capability"
                            :data-capability="capability"
                            tone="neutral"
                            class="max-w-full break-all"
                        >{{ capability }}</Badge>
                    </div>
                </div>
                <div class="min-w-0">
                    <div class="text-[10px] font-semibold uppercase text-[var(--talos-muted)]">Actions</div>
                    <div class="mt-2 flex min-w-0 flex-wrap gap-2">
                        <Badge
                            v-for="action in tool.contract.actions"
                            :key="action"
                            :data-action="action"
                            tone="neutral"
                        >{{ action }}</Badge>
                        <Badge :tone="tool.contract.confirmation === 'always' ? 'warning' : 'neutral'">
                            confirmation: {{ tool.contract.confirmation ?? 'policy' }}
                        </Badge>
                    </div>
                </div>
            </div>
        </div>

        <div class="min-w-0 rounded-md border border-[var(--talos-border)] bg-[var(--talos-panel-soft)] p-4">
            <div class="flex items-center gap-2 text-sm font-semibold text-[var(--talos-text)]">
                <Code2 class="h-4 w-4 text-[var(--talos-muted)]" />
                input_schema
            </div>
            <div class="mt-3 flex flex-wrap gap-2">
                <Badge v-for="field in requiredFields" :key="field" tone="warning">{{ field }} required</Badge>
                <Badge v-if="requiredFields.length === 0" tone="neutral">no required fields</Badge>
            </div>
            <pre data-testid="talos-tool-input-schema" class="mt-3 max-h-72 max-w-full overflow-auto whitespace-pre-wrap break-all rounded-md border border-[var(--talos-border)] bg-[var(--talos-panel)] p-3 text-xs leading-5 text-[var(--talos-text)]">{{ inputSchemaText }}</pre>
        </div>

        <div class="min-w-0 rounded-md border border-[var(--talos-border)] bg-[var(--talos-panel-soft)] p-4">
            <div class="flex items-center gap-2 text-sm font-semibold text-[var(--talos-text)]">
                <Code2 class="h-4 w-4 text-[var(--talos-muted)]" />
                output_schema
            </div>
            <pre
                v-if="tool.contract.output_schema"
                data-testid="talos-tool-output-schema"
                class="mt-3 max-h-72 max-w-full overflow-auto whitespace-pre-wrap break-all rounded-md border border-[var(--talos-border)] bg-[var(--talos-panel)] p-3 text-xs leading-5 text-[var(--talos-text)]"
            >{{ outputSchemaText }}</pre>
            <div
                v-else
                data-testid="talos-tool-output-schema-empty"
                class="mt-3 rounded-md border border-[var(--talos-border)] bg-[var(--talos-panel)] p-3 text-xs leading-5 text-[var(--talos-muted)]"
            >No output schema declared.</div>
        </div>
    </div>

    <div v-else class="rounded-md border border-[var(--talos-border)] bg-[var(--talos-panel-soft)] p-4 text-sm leading-6 text-[var(--talos-muted)]">
        Select a registered tool to inspect its server-provided schema, risk, capability, and planning availability.
    </div>
</template>
