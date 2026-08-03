<script setup lang="ts">
/**
 * The one switch.
 *
 * Before this, the app drew an on/off control in three different ways across
 * twenty-six places — a hidden checkbox with a styled div, a native checkbox
 * tinted with accent-color, and a hand-rolled button — plus a tail of booleans
 * wearing aria-pressed. `reka-ui` has shipped SwitchRoot/SwitchThumb in this
 * repository the whole time and nobody imported them; this component adopts
 * them, the same way TalosThemedSelect adopted SelectRoot.
 *
 * Three rules from the 2026-08-02 research are built in rather than left to
 * each caller (see docs/superpowers/research/2026-08-02-ricerca-interruttori-
 * e-gerarchia-impostazioni.md):
 *
 * 1. A switch, not a checkbox, because the effect starts immediately. Material
 *    is explicit — the effects of a switch begin without needing to save — and
 *    no preference in TALOS sits behind a Save button.
 * 2. The accessible name must NOT change with the state (APG). So the label is
 *    the thing being switched, never "On"/"Off": the state is already announced
 *    through aria-checked, and a name that flips reads as a different control
 *    every time it is touched.
 * 3. It stays controlled. The parent owns the value and is free to reject a
 *    change — persistence can fail — so this component never flips itself and
 *    only reports the intent.
 *
 * The visual is lifted from the best of the three old implementations, the one
 * in the agent tools panel, with the single defect that review found closed:
 * under forced-colors the coloured track disappeared and the control became
 * invisible, so the thumb now carries a border that survives colour removal.
 */
import { SwitchRoot, SwitchThumb } from 'reka-ui'

withDefaults(defineProps<{
    modelValue: boolean
    /** The thing being switched — never its state. */
    ariaLabel?: string
    disabled?: boolean
    /**
     * The hook the replaced control already carried.
     *
     * Same reason as `TalosFilterOption.testId`: the primitive owns the button,
     * so adopting it has to preserve whatever selector was pointed at the
     * hand-rolled switch it replaces — otherwise the adoption silently breaks
     * every test and end-to-end selector aimed at the old thing, and the
     * coherence work reads as a regression.
     */
    testId?: string
}>(), {
    ariaLabel: undefined,
    disabled: false,
    testId: 'talos-themed-switch',
})

defineEmits<{ 'update:modelValue': [value: boolean] }>()
</script>

<template>
    <SwitchRoot
        :data-testid="testId"
        :model-value="modelValue"
        :disabled="disabled"
        :aria-label="ariaLabel"
        class="relative inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full border border-[var(--talos-border)] bg-[var(--talos-input)] transition-colors outline-none data-[state=checked]:border-[var(--talos-accent)] data-[state=checked]:bg-[var(--talos-accent)] focus-visible:ring-2 focus-visible:ring-[var(--talos-ring)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--talos-panel)] disabled:cursor-not-allowed disabled:opacity-50 forced-colors:border-[ButtonBorder]"
        @update:model-value="$emit('update:modelValue', $event)"
    >
        <!-- The thumb keeps a border of its own so the control still reads as
             on or off when forced-colors strips the track's fill. -->
        <SwitchThumb
            class="pointer-events-none block size-5 translate-x-0.5 rounded-full border border-transparent bg-[var(--talos-card)] shadow-sm transition-transform data-[state=checked]:translate-x-5 forced-colors:border-[ButtonText] forced-colors:bg-[ButtonText] forced-colors:data-[state=checked]:bg-[Highlight]"
        />
    </SwitchRoot>
</template>
