<script setup lang="ts">
import { computed } from 'vue'
import { CircleAlert, Info, ShieldAlert } from '@lucide/vue'
import type { TalosMessage } from '../../../lib/talosTypes'
import { talosControlledFault, type TalosControlledFaultLayer } from '../../../lib/talosMessageState'
import Badge from '../../ui/Badge.vue'

const props = defineProps<{ message: TalosMessage }>()
const fault = computed(() => talosControlledFault(props.message))

const titles: Record<TalosControlledFaultLayer, string> = {
    validator: 'Validation fault',
    policy: 'Policy denial',
    provider: 'Provider failure',
    network: 'Network failure',
    worker: 'Worker failure',
    system: 'Execution failure',
}

const title = computed(() => fault.value ? titles[fault.value.layer] : 'System notice')
const providerLabel = computed(() => {
    if (!fault.value?.provider && !fault.value?.model) return null
    return [fault.value.provider, fault.value.model].filter(Boolean).join(' / ')
})
</script>

<template>
    <section
        v-if="fault"
        role="alert"
        aria-live="assertive"
        data-testid="talos-controlled-fault"
        :data-fault-layer="fault.layer"
        :data-fault-code="fault.code"
        class="min-w-0 max-w-full rounded-md border border-[var(--talos-danger-border)] bg-[var(--talos-danger-soft)] p-3 text-[var(--talos-text)]"
    >
        <div class="flex min-w-0 items-start gap-2.5">
            <ShieldAlert v-if="fault.layer === 'policy'" class="mt-0.5 h-4 w-4 shrink-0 text-[var(--talos-danger)]" />
            <CircleAlert v-else class="mt-0.5 h-4 w-4 shrink-0 text-[var(--talos-danger)]" />
            <div class="min-w-0 flex-1">
                <div class="flex flex-wrap items-center gap-2">
                    <strong class="text-sm font-semibold">{{ title }}</strong>
                    <Badge tone="danger">{{ fault.code }}</Badge>
                </div>
                <p class="mt-2 break-words text-sm leading-6 [overflow-wrap:anywhere]">{{ fault.message }}</p>
                <div v-if="fault.nextAction" class="mt-3 border-t border-[var(--talos-danger-border)] pt-2">
                    <div class="text-[11px] font-semibold uppercase text-[var(--talos-danger)]">Next action</div>
                    <p class="mt-1 break-words text-xs leading-5 [overflow-wrap:anywhere]">{{ fault.nextAction }}</p>
                </div>
                <div class="mt-3 flex flex-wrap items-center gap-2 text-[11px] text-[var(--talos-muted)]">
                    <span v-if="providerLabel">{{ providerLabel }}</span>
                    <span v-if="fault.status">HTTP {{ fault.status }}</span>
                    <Badge v-if="fault.retryable !== null" :tone="fault.retryable ? 'warning' : 'neutral'">
                        {{ fault.retryable ? 'Retry available' : 'Manual action required' }}
                    </Badge>
                </div>
            </div>
        </div>
    </section>

    <div
        v-else
        role="status"
        aria-live="polite"
        class="flex min-w-0 items-start gap-2 rounded-md border border-[var(--talos-border)] bg-[var(--talos-panel-soft)] p-3 text-sm text-[var(--talos-text)]"
    >
        <Info class="mt-0.5 h-4 w-4 shrink-0 text-[var(--talos-accent)]" />
        <p class="min-w-0 break-words leading-6 [overflow-wrap:anywhere]">{{ message.content }}</p>
    </div>
</template>
