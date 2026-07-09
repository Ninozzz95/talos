<script setup lang="ts">
import { computed } from 'vue'
import { Bot, BrainCircuit, Gem, Network, Route, Sparkles } from '@lucide/vue'
import { cn } from '../../../lib/utils'
import { talosProviderById, type TalosProviderId } from '../../../lib/talosProviders'

const props = defineProps<{
    provider: TalosProviderId | string
}>()

const provider = computed(() => talosProviderById(props.provider))
const icon = computed(() => ({
    openai: Sparkles,
    deepseek: BrainCircuit,
    anthropic: Bot,
    gemini: Gem,
    openrouter: Route,
    ollama: Network,
}[provider.value.id]))

const classes = computed(() => cn(
    'inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md border text-xs font-semibold',
    provider.value.tone === 'green' && 'border-emerald-400/30 bg-emerald-400/10 text-emerald-200',
    provider.value.tone === 'blue' && 'border-sky-400/30 bg-sky-400/10 text-sky-200',
    provider.value.tone === 'purple' && 'border-violet-400/30 bg-violet-400/10 text-violet-200',
    provider.value.tone === 'amber' && 'border-amber-400/30 bg-amber-400/10 text-amber-200',
    provider.value.tone === 'cyan' && 'border-cyan-400/30 bg-cyan-400/10 text-cyan-200',
    provider.value.tone === 'neutral' && 'border-[var(--talos-border-strong)] bg-[var(--talos-panel-soft)] text-[var(--talos-muted)]',
))
</script>

<template>
    <span :class="classes" :title="provider.label">
        <component :is="icon" class="h-4 w-4" />
        <span class="sr-only">{{ provider.label }}</span>
    </span>
</template>
