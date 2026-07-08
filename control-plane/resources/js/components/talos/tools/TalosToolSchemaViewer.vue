<script setup lang="ts">
import { computed } from 'vue'
import { Code2, LockKeyhole, ShieldAlert } from '@lucide/vue'
import Badge from '../../ui/Badge.vue'
import type { TalosTool } from '../../../lib/talosTypes'

type BadgeTone = 'success' | 'danger' | 'warning' | 'neutral'

const props = defineProps<{
    tool: TalosTool | null
    planningEnabled: boolean
}>()

const schemaText = computed(() => {
    if (!props.tool) {
        return ''
    }

    return JSON.stringify(props.tool.input_schema, null, 2)
})

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
</script>

<template>
    <div v-if="tool" class="space-y-4">
        <div class="rounded-md border border-[var(--talos-border)] bg-[var(--talos-panel-soft)] p-4">
            <div class="flex items-start justify-between gap-3">
                <div class="min-w-0">
                    <div class="text-sm font-semibold text-[var(--talos-text)]">{{ tool.display_name }}</div>
                    <div class="mt-1 truncate font-mono text-xs text-[var(--talos-muted)]">{{ tool.name }}</div>
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
                <Badge tone="neutral">{{ tool.capability ?? 'no capability' }}</Badge>
            </div>
        </div>

        <div class="rounded-md border border-[var(--talos-border)] bg-[var(--talos-panel-soft)] p-4">
            <div class="flex items-center gap-2 text-sm font-semibold text-[var(--talos-text)]">
                <Code2 class="h-4 w-4 text-[var(--talos-muted)]" />
                input_schema
            </div>
            <div class="mt-3 flex flex-wrap gap-2">
                <Badge v-for="field in requiredFields" :key="field" tone="warning">{{ field }} required</Badge>
                <Badge v-if="requiredFields.length === 0" tone="neutral">no required fields</Badge>
            </div>
            <pre class="mt-3 max-h-72 overflow-auto rounded-md border border-[var(--talos-border)] bg-[var(--talos-panel)] p-3 text-xs leading-5 text-[var(--talos-text)]">{{ schemaText }}</pre>
        </div>
    </div>

    <div v-else class="rounded-md border border-[var(--talos-border)] bg-[var(--talos-panel-soft)] p-4 text-sm leading-6 text-[var(--talos-muted)]">
        Select a registered tool to inspect its server-provided schema, risk, capability, and planning availability.
    </div>
</template>
