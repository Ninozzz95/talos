<script setup lang="ts">
import { Activity, CircleSlash, ShieldCheck, WifiOff } from '@lucide/vue'
import Badge from '../../ui/Badge.vue'
import type { TalosConnector } from '../../../lib/talosTypes'

type BadgeTone = 'success' | 'danger' | 'warning' | 'neutral'

defineProps<{
    connectors: TalosConnector[]
    selectedConnectorId?: string | null
}>()

const emit = defineEmits<{
    select: [connector: TalosConnector]
}>()

function healthTone(connector: TalosConnector): BadgeTone {
    if (!connector.is_enabled || connector.health_status === 'offline') {
        return 'danger'
    }

    if (connector.health_status === 'healthy') {
        return 'success'
    }

    if (connector.health_status === 'degraded') {
        return 'warning'
    }

    return 'neutral'
}

function healthIcon(connector: TalosConnector) {
    if (!connector.is_enabled) {
        return CircleSlash
    }

    if (connector.health_status === 'healthy') {
        return ShieldCheck
    }

    if (connector.health_status === 'offline') {
        return WifiOff
    }

    return Activity
}

function capabilityCount(connector: TalosConnector) {
    const capabilities = connector.capabilities

    if (Array.isArray(capabilities)) {
        return capabilities.length
    }

    if (capabilities && typeof capabilities === 'object') {
        return Object.keys(capabilities).length
    }

    return 0
}
</script>

<template>
    <div class="space-y-2">
        <button
            v-for="connector in connectors"
            :key="connector.id"
            type="button"
            class="w-full rounded-md border px-3 py-3 text-left transition"
            :class="connector.id === selectedConnectorId
                ? 'border-[var(--talos-accent)] bg-[var(--talos-active)]'
                : 'border-[var(--talos-border)] bg-[var(--talos-panel-soft)] hover:border-[var(--talos-border-strong)]'"
            @click="emit('select', connector)"
        >
            <div class="flex items-start justify-between gap-3">
                <div class="min-w-0">
                    <div class="flex items-center gap-2">
                        <component :is="healthIcon(connector)" class="h-4 w-4 text-[var(--talos-muted)]" />
                        <span class="truncate text-sm font-semibold text-[var(--talos-text)]">{{ connector.display_name }}</span>
                    </div>
                    <div class="mt-1 truncate font-mono text-xs text-[var(--talos-muted)]">{{ connector.key }}</div>
                </div>
                <Badge :tone="healthTone(connector)">
                    {{ connector.is_enabled ? connector.health_status : 'disabled' }}
                </Badge>
            </div>
            <div class="mt-3 flex flex-wrap gap-2">
                <Badge tone="neutral">{{ connector.tools_count ?? 0 }} tools</Badge>
                <Badge tone="neutral">{{ capabilityCount(connector) }} capabilities</Badge>
            </div>
        </button>
    </div>
</template>
