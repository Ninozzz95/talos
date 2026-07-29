<script setup lang="ts">
import { computed } from 'vue'
import { useTalosI18n } from '@/i18n'
import { CircleAlert, Info, ShieldAlert } from '@lucide/vue'
import type { TalosMobileMessageView } from '@/components/chat/mobileChatTypes'
import { talosMobileControlledFault, type TalosMobileControlledFaultLayer } from '@/lib/talosMessageState'

const props = defineProps<{ message: TalosMobileMessageView }>()
const { t } = useTalosI18n()
const fault = computed(() => talosMobileControlledFault(props.message))
const titleKeys: Record<TalosMobileControlledFaultLayer, string> = {
    validator: 'chat.validationFault', policy: 'chat.policyDenial', provider: 'chat.providerFailure',
    network: 'chat.networkFailure', worker: 'chat.workerFailure', system: 'chat.executionFailure',
}
const title = computed(() => t(fault.value ? titleKeys[fault.value.layer] : 'chat.systemNotice'))
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
        data-testid="talos-mobile-controlled-fault"
        :data-fault-layer="fault.layer"
        :data-fault-code="fault.code"
        class="min-w-0 max-w-full rounded-md border border-[var(--talos-danger-border)] bg-[var(--talos-danger-soft)] p-3 text-[var(--talos-text)]"
    >
        <div class="flex min-w-0 items-start gap-2.5">
            <ShieldAlert v-if="fault.layer === 'policy'" class="mt-0.5 size-4 shrink-0 text-[var(--talos-danger)]" aria-hidden="true" />
            <CircleAlert v-else class="mt-0.5 size-4 shrink-0 text-[var(--talos-danger)]" aria-hidden="true" />
            <div class="min-w-0 flex-1">
                <div class="flex flex-wrap items-center gap-2">
                    <strong class="text-sm font-semibold">{{ title }}</strong>
                    <span class="rounded border border-[var(--talos-danger-border)] px-1.5 py-0.5 font-mono text-3xs text-[var(--talos-danger)]">{{ fault.code }}</span>
                </div>
                <p class="mt-2 break-words text-sm leading-6 [overflow-wrap:anywhere]">{{ fault.message }}</p>
                <div v-if="fault.nextAction" class="mt-3 border-t border-[var(--talos-danger-border)] pt-2">
                    <div class="text-2xs font-semibold uppercase text-[var(--talos-danger)]">{{ $t('chat.nextAction') }}</div>
                    <p class="mt-1 break-words text-xs leading-5 [overflow-wrap:anywhere]">{{ fault.nextAction }}</p>
                </div>
                <div class="mt-3 flex flex-wrap items-center gap-2 text-2xs text-[var(--talos-muted)]">
                    <span v-if="providerLabel">{{ providerLabel }}</span>
                    <span v-if="fault.status">HTTP {{ fault.status }}</span>
                    <span v-if="fault.retryable !== null" class="rounded border border-[var(--talos-border)] px-1.5 py-0.5">
                        {{ fault.retryable ? $t('chat.retryAvailable') : $t('chat.manualActionRequired') }}
                    </span>
                </div>
            </div>
        </div>
    </section>
    <div v-else role="status" aria-live="polite" class="mx-auto flex min-w-0 max-w-full items-center justify-center gap-1.5 px-3 py-1 text-center text-xs text-[var(--talos-muted)]">
        <Info class="size-3.5 shrink-0" aria-hidden="true" />
        <p class="min-w-0 break-words [overflow-wrap:anywhere]">{{ message.content }}</p>
    </div>
</template>
