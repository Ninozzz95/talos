<script setup lang="ts">
import { computed, onUpdated, ref } from 'vue'

/**
 * F4-#25 — OTP-style segmented PIN input. One REAL input (numeric, sr-safe,
 * autocomplete one-time-code) drives purely visual digit boxes: taps focus the
 * input, digits fill the boxes as masked dots, and `complete` fires exactly
 * when `length` digits are present. Verification flows that must accept
 * shorter legacy PINs render an explicit Confirm button beside this input
 * (see the app-lock verify step) instead of relying on `complete`.
 */
const props = withDefaults(defineProps<{
    modelValue: string
    length?: number
    label: string
    testid: string
    autofocus?: boolean
}>(), {
    length: 6,
    autofocus: false,
})

const emit = defineEmits<{
    'update:modelValue': [value: string]
    complete: [value: string]
}>()

const field = ref<HTMLInputElement | null>(null)
const focused = ref(false)
const digits = computed(() => props.modelValue.split(''))

function onInput(event: Event): void {
    const raw = (event.target as HTMLInputElement).value
    const value = raw.replace(/\D/g, '').slice(0, props.length)
    if (field.value) field.value.value = value
    emit('update:modelValue', value)
    if (value.length === props.length) emit('complete', value)
}

// A same-tick parent reset (mismatch → '') is invisible to diff-based
// patching — `clear()` is the explicit reset the parent calls instead.
function clear(): void {
    if (field.value) field.value.value = ''
    emit('update:modelValue', '')
}

onUpdated(() => {
    if (field.value && field.value.value !== props.modelValue) {
        field.value.value = props.modelValue
    }
})

function focusField(): void {
    field.value?.focus()
}

defineExpose({ focus: focusField, clear })
</script>

<template>
    <div class="relative" @click="focusField">
        <input
            ref="field"
            :value="modelValue"
            :data-testid="testid"
            :aria-label="label"
            type="password"
            inputmode="numeric"
            autocomplete="one-time-code"
            :autofocus="autofocus"
            class="absolute inset-0 z-10 h-full w-full cursor-pointer opacity-0"
            @input="onInput"
            @focus="focused = true"
            @blur="focused = false"
        >
        <div class="flex justify-center gap-2" aria-hidden="true">
            <span
                v-for="index in length"
                :key="index"
                class="flex size-11 items-center justify-center rounded-xl border text-lg font-semibold transition-colors"
                :class="[
                    digits[index - 1] !== undefined
                        ? 'border-[var(--talos-accent,var(--primary))] bg-[var(--talos-panel)] text-[var(--talos-text)]'
                        : 'border-[var(--talos-border)] bg-[var(--talos-panel)]/60 text-transparent',
                    focused && index - 1 === Math.min(digits.length, length - 1)
                        ? 'ring-2 ring-[var(--talos-ring)]'
                        : '',
                ]"
            >{{ digits[index - 1] !== undefined ? '•' : '0' }}</span>
        </div>
    </div>
</template>
