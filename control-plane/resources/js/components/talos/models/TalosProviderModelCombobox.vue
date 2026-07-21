<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { Check, ChevronsUpDown, Loader2, RefreshCw, SlidersHorizontal } from '@lucide/vue'
import {
    Combobox,
    ComboboxAnchor,
    ComboboxEmpty,
    ComboboxGroup,
    ComboboxInput,
    ComboboxItem,
    ComboboxList,
    ComboboxTrigger,
} from '../../ui/combobox'
import type { TalosProviderModelCatalogItem } from '../../../lib/talosTypes'

const props = withDefaults(defineProps<{
    models: TalosProviderModelCatalogItem[]
    modelValue: string
    loading?: boolean
    error?: string | null
    allowManualId?: boolean
}>(), {
    loading: false,
    error: null,
    allowManualId: false,
})

const emit = defineEmits<{
    'update:modelValue': [value: string]
    refresh: []
}>()

const open = ref(false)
const query = ref('')
const manualMode = ref(false)
const manualId = ref('')

const selectedModel = computed(() => props.models.find((model) => model.id === props.modelValue) ?? null)
const triggerLabel = computed(() => {
    if (selectedModel.value) return selectedModel.value.display_name
    if (props.modelValue.trim()) return props.modelValue
    return 'Select a model'
})

const filteredModels = computed(() => {
    const needle = query.value.trim().toLowerCase()
    if (!needle) return props.models

    return props.models.filter((model) => (
        model.id.toLowerCase().includes(needle)
        || model.display_name.toLowerCase().includes(needle)
        || (model.canonical_slug?.toLowerCase().includes(needle) ?? false)
    ))
})

function isUnsupported(model: TalosProviderModelCatalogItem) {
    return model.chat_compatibility === 'unsupported'
}

function compatibilityLabel(model: TalosProviderModelCatalogItem) {
    if (model.chat_compatibility === 'unsupported') return 'Not a chat model'
    if (model.chat_compatibility === 'unknown') return 'Unverified — probe decides'
    return 'Chat ready'
}

function onSelect(value: unknown) {
    if (typeof value !== 'string') return
    const model = props.models.find((entry) => entry.id === value)
    if (model && isUnsupported(model)) return
    emit('update:modelValue', value)
    open.value = false
}

function onSearchInput(event: Event) {
    query.value = (event.target as HTMLInputElement).value
}

function toggleManualMode() {
    manualMode.value = !manualMode.value
    if (manualMode.value) {
        manualId.value = props.modelValue
    }
}

function commitManualId() {
    const value = manualId.value.trim()
    if (!value) return
    emit('update:modelValue', value)
    manualMode.value = false
}

watch(() => props.modelValue, (value) => {
    if (!manualMode.value) manualId.value = value
})
</script>

<template>
    <div class="space-y-2" data-testid="talos-provider-model-combobox">
        <Combobox
            :model-value="modelValue"
            :open="open"
            ignore-filter
            :disabled="loading"
            @update:model-value="onSelect"
            @update:open="open = $event"
        >
            <ComboboxAnchor as-child>
                <ComboboxTrigger as-child>
                    <button
                        type="button"
                        data-testid="talos-model-combobox-trigger"
                        class="flex h-10 w-full items-center justify-between gap-2 rounded-md border border-[var(--talos-border)] bg-[var(--talos-panel)] px-3 text-left text-sm text-[var(--talos-text)] outline-none focus:border-[var(--talos-accent)] disabled:cursor-not-allowed disabled:opacity-60"
                        :disabled="loading"
                        aria-label="Choose a provider model"
                    >
                        <span class="min-w-0 truncate" :class="selectedModel ? '' : 'text-[var(--talos-muted)]'">{{ triggerLabel }}</span>
                        <Loader2 v-if="loading" class="h-4 w-4 shrink-0 animate-spin text-[var(--talos-muted)]" />
                        <ChevronsUpDown v-else class="h-4 w-4 shrink-0 text-[var(--talos-muted)]" />
                    </button>
                </ComboboxTrigger>
            </ComboboxAnchor>

            <ComboboxList
                data-testid="talos-model-combobox-list"
                class="max-h-[288px] w-[var(--reka-combobox-trigger-width)] min-w-[16rem] overflow-y-auto border-[var(--talos-border)] bg-[var(--talos-card)] p-1 text-[var(--talos-text)]"
            >
                <div class="flex items-center gap-2 border-b border-[var(--talos-border)] px-2 pb-2">
                    <ComboboxInput
                        class="h-8 flex-1 border-0 bg-transparent px-1 text-sm text-[var(--talos-text)] outline-none placeholder:text-[var(--talos-muted)]"
                        placeholder="Search every provider model"
                        aria-label="Search models"
                        @input="onSearchInput"
                    />
                </div>

                <ComboboxEmpty class="px-2 py-3 text-sm text-[var(--talos-muted)]">
                    No provider model matches this search.
                </ComboboxEmpty>

                <ComboboxGroup>
                    <ComboboxItem
                        v-for="model in filteredModels"
                        :key="model.id"
                        :value="model.id"
                        :disabled="isUnsupported(model)"
                        data-testid="talos-model-option"
                        :data-model-id="model.id"
                        :data-chat-compatibility="model.chat_compatibility"
                    >
                        <span class="flex min-w-0 flex-col">
                            <span class="truncate font-medium">{{ model.display_name }}</span>
                            <span class="truncate font-mono text-[11px] text-[var(--talos-muted)]">{{ model.id }} · {{ compatibilityLabel(model) }}</span>
                        </span>
                        <Check v-if="model.id === modelValue" class="h-4 w-4 shrink-0 text-[var(--talos-accent)]" />
                    </ComboboxItem>
                </ComboboxGroup>
            </ComboboxList>
        </Combobox>

        <div v-if="error" class="flex items-start justify-between gap-2 rounded-md border border-[var(--talos-warning-border)] bg-[var(--talos-warning-soft)] px-3 py-2 text-xs text-[var(--talos-text)]">
            <span class="min-w-0">{{ error }}</span>
            <button
                type="button"
                data-testid="talos-model-catalog-refresh"
                class="inline-flex shrink-0 items-center gap-1 font-semibold text-[var(--talos-accent)]"
                @click="emit('refresh')"
            >
                <RefreshCw class="h-3.5 w-3.5" />
                Retry
            </button>
        </div>

        <div v-if="allowManualId" class="space-y-2">
            <button
                type="button"
                data-testid="talos-model-manual-toggle"
                class="inline-flex items-center gap-1 text-xs font-semibold text-[var(--talos-muted)] hover:text-[var(--talos-text)]"
                @click="toggleManualMode"
            >
                <SlidersHorizontal class="h-3.5 w-3.5" />
                {{ manualMode ? 'Hide advanced model ID' : 'Advanced: enter a model ID manually' }}
            </button>

            <div v-if="manualMode" class="flex items-center gap-2">
                <input
                    v-model="manualId"
                    type="text"
                    aria-label="Enter model ID"
                    data-testid="talos-model-manual-input"
                    class="h-9 flex-1 rounded-md border border-[var(--talos-border)] bg-[var(--talos-panel)] px-3 text-sm text-[var(--talos-text)] outline-none focus:border-[var(--talos-accent)]"
                    placeholder="provider/model-id"
                    @keydown.enter.prevent="commitManualId"
                >
                <button
                    type="button"
                    data-testid="talos-model-manual-apply"
                    class="inline-flex h-9 items-center gap-1 rounded-md border border-[var(--talos-accent-border)] px-3 text-sm font-semibold text-[var(--talos-accent)] disabled:opacity-50"
                    :disabled="!manualId.trim()"
                    @click="commitManualId"
                >
                    Use ID
                </button>
            </div>
            <p class="text-[11px] leading-5 text-[var(--talos-muted)]">
                A manual ID still requires a successful Save + Verify before chat can use it.
            </p>
        </div>
    </div>
</template>
