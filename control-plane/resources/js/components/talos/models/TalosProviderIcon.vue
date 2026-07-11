<script setup lang="ts">
import { computed } from 'vue'
import { CircleHelp } from '@lucide/vue'
import { cn } from '../../../lib/utils'
import { talosProviderById, type TalosProviderId } from '../../../lib/talosProviders'

const props = defineProps<{
    provider: TalosProviderId | string
}>()

const provider = computed(() => talosProviderById(props.provider))
const classes = computed(() => cn(
    'inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md border text-xs font-semibold',
    provider.value.tone === 'green' && 'border-[var(--talos-success-border)] bg-[var(--talos-success-soft)] text-[var(--talos-success)]',
    provider.value.tone === 'blue' && 'border-[var(--talos-accent-border)] bg-[var(--talos-accent-soft)] text-[var(--talos-accent-text)]',
    provider.value.tone === 'purple' && 'border-[var(--talos-secondary)] bg-[var(--talos-secondary)]/10 text-[var(--talos-secondary)]',
    provider.value.tone === 'amber' && 'border-[var(--talos-warning-border)] bg-[var(--talos-warning-soft)] text-[var(--talos-warning)]',
    provider.value.tone === 'cyan' && 'border-[var(--talos-accent-border)] bg-[var(--talos-accent-soft)] text-[var(--talos-accent-text)]',
    provider.value.tone === 'neutral' && 'border-[var(--talos-border-strong)] bg-[var(--talos-panel-soft)] text-[var(--talos-muted)]',
))
</script>

<template>
    <span :class="classes" :title="provider.label" role="img" :aria-label="provider.label">
        <img
            v-if="provider.logo"
            :src="provider.logo"
            :alt="provider.logoAlt"
            aria-hidden="true"
            class="aspect-square h-5 w-5 rounded-sm bg-white p-0.5 object-contain"
        >
        <CircleHelp v-else data-provider-fallback aria-hidden="true" class="h-5 w-5" />
        <span class="sr-only">{{ provider.label }}</span>
    </span>
</template>
