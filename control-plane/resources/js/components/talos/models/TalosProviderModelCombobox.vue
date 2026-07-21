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
const inputPlaceholder = computed(() => {
    if (selectedModel.value) return selectedModel.value.display_name
    if (props.modelValue.trim()) return props.modelValue
    return 'Search or select a model'
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
            open-on-focus
            :disabled="loading"
            @update:model-value="onSelect"
            @update:open="open = $event"
        >
            <!--
                reka Combobox is a typeahead primitive: the search input lives in
                the always-mounted anchor (not the open-gated portal), so focusing
                it opens the list reliably in a real browser. A separate chevron
                trigger toggles the list for pointer users.
            -->
            <ComboboxAnchor class="flex h-10 w-full items-center gap-1 rounded-md border border-[var(--talos-border)] bg-[var(--talos-panel)] px-2 focus-within:border-[var(--talos-accent)]">
                <ComboboxInput
                    class="h-full min-w-0 flex-1 border-0 bg-transparent px-1 text-sm text-[var(--talos-text)] outline-none placeholder:text-[var(--talos-muted)] disabled:cursor-not-allowed disabled:opacity-60"
                    :placeholder="inputPlaceholder"
                    aria-label="Search models"
                    data-testid="talos-model-combobox-input"
                    :disabled="loading"
                    @input="onSearchInput"
                    @focus="open = true"
                />
                <ComboboxTrigger as-child>
                    <button
                        type="button"
                        data-testid="talos-model-combobox-trigger"
                        class="grid h-8 w-8 shrink-0 place-items-center rounded-md text-[var(--talos-muted)] outline-none hover:bg-[var(--talos-active)] focus-visible:ring-2 focus-visible:ring-[var(--talos-accent)] disabled:cursor-not-allowed disabled:opacity-60"
                        :disabled="loading"
                        aria-label="Choose a provider model"
                    >
                        <Loader2 v-if="loading" class="h-4 w-4 animate-spin" />
                        <ChevronsUpDown v-else class="h-4 w-4" />
                    </button>
                </ComboboxTrigger>
            </ComboboxAnchor>

            <ComboboxList
                data-testid="talos-model-combobox-list"
                class="z-[80] max-h-[288px] w-[var(--reka-combobox-trigger-width)] min-w-[16rem] overflow-y-auto border-[var(--talos-border)] bg-[var(--talos-card)] p-1 text-[var(--talos-text)]"
            >
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

        <p v-if="selectedModel" class="truncate text-[11px] text-[var(--talos-muted)]" data-testid="talos-model-combobox-selected">
            Selected: <span class="font-medium text-[var(--talos-text)]">{{ selectedModel.display_name }}</span>
            <span class="font-mono"> · {{ selectedModel.id }}</span>
        </p>

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
