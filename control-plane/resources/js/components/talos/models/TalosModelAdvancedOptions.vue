<script setup lang="ts">
import { computed } from 'vue'
import Badge from '../../ui/Badge.vue'
import Switch from '../../ui/Switch.vue'
import type { TalosProviderDefinition } from '../../../lib/talosProviders'

const props = defineProps<{
    provider: TalosProviderDefinition
    displayName: string
    model: string
    baseUrl: string
    timeoutSeconds: number
    capabilities: Record<string, boolean>
    disabled?: boolean
}>()

const emit = defineEmits<{
    'update:displayName': [value: string]
    'update:model': [value: string]
    'update:baseUrl': [value: string]
    'update:timeoutSeconds': [value: number]
    'update:capabilities': [value: Record<string, boolean>]
}>()

const capabilityRows = computed(() => [
    ['json', 'JSON mode'],
    ['tools', 'Tool calls'],
    ['vision', 'Vision'],
    ['embeddings', 'Embeddings'],
    ['remote', 'Remote'],
    ['local', 'Local'],
] as const)

function setCapability(key: string, value: boolean) {
    emit('update:capabilities', {
        ...props.capabilities,
        [key]: value,
    })
}
</script>

<template>
    <div class="space-y-3 rounded-md border border-[var(--talos-border)] bg-[var(--talos-panel)] p-3">
        <div class="flex flex-wrap items-center justify-between gap-2">
            <div>
                <h5 class="text-sm font-semibold text-[var(--talos-text)]">Advanced options</h5>
                <p class="mt-1 text-xs leading-5 text-[var(--talos-muted)]">
                    Override defaults only when the provider adapter or endpoint requires it.
                </p>
            </div>
            <Badge tone="neutral">{{ provider.label }}</Badge>
        </div>

        <div class="grid gap-2 md:grid-cols-2">
            <label class="space-y-1">
                <span class="text-[11px] font-semibold uppercase text-[var(--talos-muted)]">Display name</span>
                <input
                    :value="displayName"
                    type="text"
                    class="h-9 w-full rounded-md border border-[var(--talos-border)] bg-[var(--talos-panel-soft)] px-3 text-sm text-[var(--talos-text)] outline-none placeholder:text-[var(--talos-muted)] focus:border-[var(--talos-accent)]"
                    :placeholder="provider.label"
                    :disabled="disabled"
                    @input="emit('update:displayName', ($event.target as HTMLInputElement).value)"
                >
            </label>
            <label class="space-y-1">
                <span class="text-[11px] font-semibold uppercase text-[var(--talos-muted)]">Model name</span>
                <input
                    :value="model"
                    type="text"
                    class="h-9 w-full rounded-md border border-[var(--talos-border)] bg-[var(--talos-panel-soft)] px-3 text-sm text-[var(--talos-text)] outline-none placeholder:text-[var(--talos-muted)] focus:border-[var(--talos-accent)]"
                    :placeholder="provider.defaultModel"
                    :disabled="disabled"
                    @input="emit('update:model', ($event.target as HTMLInputElement).value)"
                >
            </label>
        </div>

        <label class="block space-y-1">
            <span class="text-[11px] font-semibold uppercase text-[var(--talos-muted)]">Base URL</span>
            <input
                :value="baseUrl"
                type="url"
                class="h-9 w-full rounded-md border border-[var(--talos-border)] bg-[var(--talos-panel-soft)] px-3 text-sm text-[var(--talos-text)] outline-none placeholder:text-[var(--talos-muted)] focus:border-[var(--talos-accent)]"
                :placeholder="provider.defaultBaseUrl"
                :disabled="disabled"
                @input="emit('update:baseUrl', ($event.target as HTMLInputElement).value)"
            >
        </label>

        <label class="block space-y-1">
            <span class="text-[11px] font-semibold uppercase text-[var(--talos-muted)]">Timeout seconds</span>
            <input
                :value="timeoutSeconds"
                type="number"
                min="5"
                max="300"
                step="1"
                class="h-9 w-full rounded-md border border-[var(--talos-border)] bg-[var(--talos-panel-soft)] px-3 text-sm text-[var(--talos-text)] outline-none placeholder:text-[var(--talos-muted)] focus:border-[var(--talos-accent)]"
                :placeholder="String(provider.defaultTimeoutSeconds)"
                :disabled="disabled"
                @input="emit('update:timeoutSeconds', Number(($event.target as HTMLInputElement).value) || provider.defaultTimeoutSeconds)"
            >
        </label>

        <div class="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            <label
                v-for="[key, label] in capabilityRows"
                :key="key"
                class="flex items-center justify-between gap-3 rounded-md border border-[var(--talos-border)] bg-[var(--talos-panel-soft)] px-3 py-2 text-xs text-[var(--talos-muted)]"
            >
                <span>{{ label }}</span>
                <Switch
                    :model-value="Boolean(capabilities[key])"
                    :aria-label="`${label} capability`"
                    :disabled="disabled"
                    @update:model-value="setCapability(key, $event)"
                />
            </label>
        </div>
    </div>
</template>
