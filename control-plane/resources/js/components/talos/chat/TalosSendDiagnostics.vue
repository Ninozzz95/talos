<script setup lang="ts">
import { computed, ref } from 'vue'
import { Check, Copy } from '@lucide/vue'
import type {
    TalosSendDiagnostic,
    TalosStreamingChatState,
} from '../../../composables/useTalosStreamingChat'
import Button from '../../ui/Button.vue'
import Tooltip from '../../ui/Tooltip.vue'

const props = withDefaults(defineProps<{
    diagnostic?: TalosSendDiagnostic | null
    usage?: TalosStreamingChatState['usage']
}>(), {
    diagnostic: null,
    usage: null,
})

const copyStatus = ref('')
const safeReport = computed(() => {
    if (!props.diagnostic) return null

    return {
        attempts: props.diagnostic.attempts,
        code: props.diagnostic.code,
        last_sequence: props.diagnostic.last_sequence,
        phase: props.diagnostic.phase,
        reconciled: props.diagnostic.reconciled,
        retryable: props.diagnostic.retryable,
        run_id: props.diagnostic.run_id,
        ...(props.diagnostic.http_status === undefined
            ? {}
            : { http_status: props.diagnostic.http_status }),
    }
})

function metric(value: number | null): string {
    return value === null ? 'Unavailable' : String(value)
}

async function copyReport() {
    if (!safeReport.value) return

    try {
        await navigator.clipboard.writeText(JSON.stringify(safeReport.value, null, 2))
        copyStatus.value = 'Copied'
    } catch {
        copyStatus.value = 'Copy failed'
    }
}
</script>

<template>
    <details
        v-if="diagnostic || usage"
        class="mt-3 border-l-2 border-[var(--talos-border-strong)] pl-3 text-xs text-[var(--talos-muted)]"
    >
        <summary class="cursor-pointer select-none font-medium text-[var(--talos-text)]">
            Response details
        </summary>
        <div v-if="diagnostic" class="mt-2 flex min-w-0 items-start justify-between gap-3">
            <dl class="grid min-w-0 grid-cols-[auto_1fr] gap-x-3 gap-y-1">
                <dt>Code</dt>
                <dd class="min-w-0 truncate font-mono text-[var(--talos-text)]">{{ diagnostic.code }}</dd>
                <dt>Run</dt>
                <dd class="min-w-0 truncate font-mono">{{ diagnostic.run_id ?? 'Not assigned' }}</dd>
                <dt>Sequence</dt>
                <dd class="font-mono">{{ diagnostic.last_sequence }}</dd>
                <dt>Recovery</dt>
                <dd>{{ diagnostic.retryable ? 'Retry is safe' : 'Review required' }}</dd>
            </dl>
            <Tooltip content="Copy send details">
                <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    data-testid="talos-copy-send-diagnostics"
                    aria-label="Copy send details"
                    @click="copyReport"
                >
                    <Check v-if="copyStatus === 'Copied'" class="h-4 w-4" />
                    <Copy v-else class="h-4 w-4" />
                </Button>
            </Tooltip>
        </div>
        <dl
            v-if="usage"
            data-testid="talos-cache-usage"
            class="mt-2 grid min-w-0 grid-cols-[auto_1fr] gap-x-3 gap-y-1"
        >
            <dt>Cache reads</dt>
            <dd class="font-mono text-[var(--talos-text)]">{{ metric(usage.cache_read_tokens) }}</dd>
            <dt>Cache writes</dt>
            <dd class="font-mono text-[var(--talos-text)]">{{ metric(usage.cache_write_tokens) }}</dd>
            <dt>Cache misses</dt>
            <dd class="font-mono text-[var(--talos-text)]">{{ metric(usage.cache_miss_tokens) }}</dd>
            <template v-if="usage.cache_write_5m_tokens !== null || usage.cache_write_1h_tokens !== null">
                <dt>Writes 5m</dt>
                <dd class="font-mono text-[var(--talos-text)]">{{ metric(usage.cache_write_5m_tokens) }}</dd>
                <dt>Writes 1h</dt>
                <dd class="font-mono text-[var(--talos-text)]">{{ metric(usage.cache_write_1h_tokens) }}</dd>
            </template>
        </dl>
        <span v-if="copyStatus" role="status" class="mt-2 block">{{ copyStatus }}</span>
    </details>
</template>
