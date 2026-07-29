<script setup lang="ts">
import { computed } from 'vue'
import { RotateCcw } from '@lucide/vue'
import { talosScalePercentLabel } from '../../../lib/talosUiScale'
import Button from '../../ui/Button.vue'

const props = defineProps<{
    controlId: string
    label: string
    description?: string
    modelValue: number
    min: number
    max: number
    step: number
    defaultValue: number
    disabled?: boolean
}>()

const emit = defineEmits<{
    'update:modelValue': [value: number]
}>()

const descriptionId = computed(() => `${props.controlId}-description`)
const numberInputId = computed(() => `${props.controlId}-number`)
const rangeInputId = computed(() => `${props.controlId}-range`)
const statusId = computed(() => `${props.controlId}-status`)
const percentage = computed(() => talosScalePercentLabel(props.modelValue))

function normalize(value: number): number {
    const bounded = Math.min(props.max, Math.max(props.min, value))
    return Number((Math.round(bounded / props.step) * props.step).toFixed(6))
}

function updateFromEvent(event: Event): void {
    const input = event.currentTarget as HTMLInputElement
    const value = Number(input.value)
    if (!Number.isFinite(value)) {
        input.value = String(props.modelValue)
        return
    }
    emit('update:modelValue', normalize(value))
}
</script>

<template>
    <section
        class="space-y-3 rounded-md border border-[var(--talos-border)] bg-[var(--talos-panel-soft)] p-3"
        :aria-labelledby="`${controlId}-label`"
        :aria-describedby="description ? descriptionId : undefined"
    >
        <div class="flex items-start justify-between gap-3">
            <div class="min-w-0">
                <h5 :id="`${controlId}-label`" class="text-sm font-semibold text-[var(--talos-text)]">{{ label }}</h5>
                <p v-if="description" :id="descriptionId" class="mt-1 text-xs leading-5 text-[var(--talos-muted)]">{{ description }}</p>
            </div>
            <output
                :id="statusId"
                :for="`${rangeInputId} ${numberInputId}`"
                class="shrink-0 font-mono text-xs font-semibold tabular-nums text-[var(--talos-text)]"
            >
                {{ percentage }}
            </output>
        </div>

        <div class="grid grid-cols-[minmax(0,1fr)_5.5rem_2.75rem] items-center gap-2">
            <input
                :id="rangeInputId"
                type="range"
                class="min-w-0 accent-[var(--talos-accent)]"
                :aria-label="label"
                :aria-describedby="`${description ? descriptionId : ''} ${statusId}`.trim()"
                :min="min"
                :max="max"
                :step="step"
                :value="modelValue"
                :disabled="disabled"
                @input="updateFromEvent"
            >
            <input
                :id="numberInputId"
                type="number"
                inputmode="decimal"
                class="h-10 w-full rounded-md border border-[var(--talos-border)] bg-[var(--talos-input)] px-2 text-right font-mono text-sm tabular-nums text-[var(--talos-text)] outline-none focus-visible:ring-2 focus-visible:ring-[var(--talos-ring)] disabled:cursor-not-allowed disabled:opacity-50"
                :aria-label="`${label} value`"
                :aria-describedby="statusId"
                :min="min"
                :max="max"
                :step="step"
                :value="modelValue"
                :disabled="disabled"
                @change="updateFromEvent"
            >
            <Button
                type="button"
                size="icon"
                variant="ghost"
                :aria-label="`Reset ${label}`"
                :title="disabled ? `${label} is locked by workspace policy.` : `Reset ${label}`"
                :disabled="disabled"
                @click="emit('update:modelValue', defaultValue)"
            >
                <RotateCcw class="h-4 w-4" aria-hidden="true" />
            </Button>
        </div>
    </section>
</template>
