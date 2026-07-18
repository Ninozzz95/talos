<script setup lang="ts">
import { computed, defineAsyncComponent } from 'vue'
import { BarChart3, Copy, Loader2, Pencil, RefreshCcw, RotateCcw, ShieldCheck } from '@lucide/vue'
import Button from '../../ui/Button.vue'
import Tooltip from '../../ui/Tooltip.vue'
const TalosMessageOverflowMenu = defineAsyncComponent(() => import('./TalosMessageOverflowMenu.vue'))
import type { TalosMessage } from '../../../lib/talosTypes'

const props = withDefaults(defineProps<{
    message: TalosMessage
    canRetry?: boolean
    busy?: boolean
    hasEvidence?: boolean
    evidenceOpen?: boolean
    hasBenchmark?: boolean
    benchmarking?: boolean
}>(), {
    canRetry: false,
    busy: false,
    hasEvidence: false,
    evidenceOpen: false,
    hasBenchmark: false,
    benchmarking: false,
})

const emit = defineEmits<{
    copy: [message: TalosMessage]
    edit: [message: TalosMessage]
    resend: [message: TalosMessage]
    retry: [message: TalosMessage]
    toggleEvidence: [message: TalosMessage]
    benchmark: [message: TalosMessage]
}>()

const hasSecondaryCapabilities = computed(() => props.message.role === 'user'
    || (props.message.role === 'assistant' && (props.hasEvidence || props.hasBenchmark)))
</script>

<template>
    <div class="relative flex min-h-11 flex-wrap items-center gap-1" aria-label="Message actions">
        <Tooltip content="Copy message">
            <template #default>
                <Button data-primary-action type="button" variant="ghost" size="icon" aria-label="Copy message" @click="emit('copy', message)">
                    <Copy class="h-3.5 w-3.5" />
                </Button>
            </template>
        </Tooltip>
        <Tooltip v-if="message.role === 'user'" content="Resend message">
            <template #default>
                <Button data-primary-action type="button" variant="ghost" size="icon" aria-label="Resend message" :disabled="busy" @click="emit('resend', message)">
                    <RefreshCcw class="h-3.5 w-3.5" />
                </Button>
            </template>
        </Tooltip>
        <Tooltip v-if="message.role === 'assistant'" content="Retry response">
            <template #default>
                <Button data-primary-action type="button" variant="ghost" size="icon" aria-label="Retry assistant response" :disabled="busy || !props.canRetry" @click="emit('retry', message)">
                    <RotateCcw class="h-3.5 w-3.5" />
                </Button>
            </template>
        </Tooltip>
        <TalosMessageOverflowMenu
            v-if="hasSecondaryCapabilities"
            :message="message"
            :has-evidence="hasEvidence"
            :evidence-open="evidenceOpen"
            :has-benchmark="hasBenchmark"
            :benchmarking="benchmarking"
            @edit="emit('edit', $event)"
            @toggle-evidence="emit('toggleEvidence', $event)"
            @benchmark="emit('benchmark', $event)"
        />
        <div class="hidden items-center gap-1 lg:flex" data-secondary-inline>
            <Tooltip v-if="message.role === 'user'" content="Reuse prompt">
                <template #default>
                    <Button type="button" variant="ghost" size="icon" aria-label="Reuse prompt" @click="emit('edit', message)">
                        <Pencil class="h-3.5 w-3.5" />
                    </Button>
                </template>
            </Tooltip>
            <Tooltip v-if="message.role === 'assistant' && hasEvidence" :content="evidenceOpen ? 'Close evidence' : 'Open evidence'">
                <template #default>
                    <Button type="button" variant="ghost" size="icon" :aria-label="evidenceOpen ? 'Close evidence' : 'Open evidence'" :aria-expanded="evidenceOpen" @click="emit('toggleEvidence', message)">
                        <ShieldCheck class="h-3.5 w-3.5" />
                    </Button>
                </template>
            </Tooltip>
            <Tooltip v-if="message.role === 'assistant' && hasBenchmark" content="Compare AVM ON/OFF">
                <template #default>
                    <Button type="button" variant="ghost" size="icon" aria-label="Compare AVM ON/OFF" :loading="benchmarking" @click="emit('benchmark', message)">
                        <Loader2 v-if="benchmarking" class="h-3.5 w-3.5 animate-spin" />
                        <BarChart3 v-else class="h-3.5 w-3.5" />
                    </Button>
                </template>
            </Tooltip>
        </div>
    </div>
</template>
