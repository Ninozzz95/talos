<script setup lang="ts">
import { computed } from 'vue'
import { Check, ChevronDown } from '@lucide/vue'
import {
    SelectContent,
    SelectIcon,
    SelectItem,
    SelectItemIndicator,
    SelectItemText,
    SelectPortal,
    SelectRoot,
    SelectTrigger,
    SelectViewport,
} from 'reka-ui'

export type TalosThemedSelectItem = { value: string; label: string; disabled?: boolean }

const props = withDefaults(defineProps<{
    modelValue: string
    items: TalosThemedSelectItem[]
    disabled?: boolean
    ariaLabel?: string
    placeholder?: string
    contentClass?: string
    noneLabel?: string
}>(), {
    disabled: false,
    ariaLabel: undefined,
    placeholder: 'Select an option',
    contentClass: '',
    noneLabel: undefined,
})

const emit = defineEmits<{
    'update:modelValue': [value: string]
}>()

// reka SelectItem forbids an empty-string value, so an optional "none" choice is
// carried by an internal sentinel and mapped back to '' at the component boundary.
const NONE_VALUE = '__talos_none__'
const hasNone = computed(() => props.noneLabel !== undefined)

// A themed, portalled listbox (reka Select) — the option list renders through
// --talos-* tokens instead of the OS' white native <select> popup on dark themes,
// and the portal keeps it from being clipped by scrollable panels.
const internalValue = computed(() => (hasNone.value && props.modelValue === '' ? NONE_VALUE : props.modelValue))
const selectedLabel = computed(() => {
    if (hasNone.value && props.modelValue === '') return props.noneLabel ?? ''
    return props.items.find((item) => item.value === props.modelValue)?.label ?? ''
})

function onUpdate(value: unknown) {
    if (typeof value !== 'string') return
    emit('update:modelValue', value === NONE_VALUE ? '' : value)
}

const ITEM_CLASS = 'relative flex w-full cursor-pointer select-none items-center gap-2 rounded-md py-1.5 pl-2 pr-8 text-sm text-[var(--talos-text)] outline-none transition-colors data-[highlighted]:bg-[var(--talos-active)] data-[disabled]:cursor-not-allowed data-[disabled]:opacity-50'
</script>

<template>
    <div class="w-full">
    <SelectRoot
        :model-value="internalValue"
        :disabled="disabled"
        @update:model-value="onUpdate"
    >
        <SelectTrigger
            data-testid="talos-themed-select-trigger"
            :aria-label="ariaLabel"
            class="flex h-9 w-full items-center justify-between gap-2 rounded-md border border-[var(--talos-border)] bg-[var(--talos-panel)] px-3 text-left text-sm text-[var(--talos-text)] outline-none transition-colors focus-visible:border-[var(--talos-accent)] focus-visible:ring-2 focus-visible:ring-[var(--talos-ring-soft)] disabled:cursor-not-allowed disabled:opacity-50"
        >
            <span class="min-w-0 truncate" :class="selectedLabel ? '' : 'text-[var(--talos-muted)]'">
                {{ selectedLabel || placeholder }}
            </span>
            <SelectIcon as-child>
                <ChevronDown class="h-4 w-4 shrink-0 text-[var(--talos-muted)]" />
            </SelectIcon>
        </SelectTrigger>

        <SelectPortal>
            <SelectContent
                data-testid="talos-themed-select-content"
                position="popper"
                :side-offset="6"
                :class="['z-[90] max-h-[288px] min-w-[var(--reka-select-trigger-width)] overflow-hidden rounded-md border border-[var(--talos-border)] bg-[var(--talos-card)] text-[var(--talos-text)] talos-elev-2', contentClass]"
            >
                <SelectViewport class="p-1">
                    <SelectItem
                        v-if="hasNone"
                        :value="NONE_VALUE"
                        data-testid="talos-themed-select-item"
                        :data-value="NONE_VALUE"
                        :class="ITEM_CLASS"
                    >
                        <SelectItemText>{{ noneLabel }}</SelectItemText>
                        <SelectItemIndicator class="absolute right-2 inline-flex items-center">
                            <Check class="h-4 w-4 text-[var(--talos-accent)]" />
                        </SelectItemIndicator>
                    </SelectItem>
                    <SelectItem
                        v-for="item in items"
                        :key="item.value"
                        :value="item.value"
                        :disabled="item.disabled"
                        data-testid="talos-themed-select-item"
                        :data-value="item.value"
                        :class="ITEM_CLASS"
                    >
                        <SelectItemText>{{ item.label }}</SelectItemText>
                        <SelectItemIndicator class="absolute right-2 inline-flex items-center">
                            <Check class="h-4 w-4 text-[var(--talos-accent)]" />
                        </SelectItemIndicator>
                    </SelectItem>
                </SelectViewport>
            </SelectContent>
        </SelectPortal>
    </SelectRoot>
    </div>
</template>
