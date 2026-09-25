<script setup lang="ts">
/**
 * The one checkbox.
 *
 * CASELLA-TEMA (owner 2026-09-25, «Casella a tema nuova»): eleven native checkbox
 * inputs in seven files were painted by Android, in its own
 * colour and outside the palette — the same defect the Library's native
 * `<select>` had on 2026-09-13. This adopts Reka UI's CheckboxRoot (2.10.1,
 * already pinned here: `button role="checkbox"`, `aria-checked`, Space toggles,
 * a hidden input only when it sits inside a form), the same way
 * TalosThemedSwitch adopted SwitchRoot.
 *
 * Checkbox, not switch: every caller is a choice confirmed by a later action
 * (Delete, Save, Create, Continue) or a list filter. Settings that take effect
 * at once use TalosThemedSwitch.
 *
 * The mark is the one the app already draws for tasks and notes
 * (TalosMobileTaskCheck, TalosMobileNoteChecklist): 1.5px strong border, filled
 * with the accent and a check when on. `tone="danger"`, for choices that widen
 * a deletion, wears the destructive button's three tokens (danger-soft fill,
 * danger-border, danger check): `--talos-danger` is a TEXT colour in some themes
 * (#fee2e2 in «calm», measured on the Pad 2026-09-25) and as a fill it read as a
 * white box. The caller keeps the whole row in
 * a `<label>`: the row stays the touch target, and the label text is the
 * accessible name.
 */
import { Check } from '@lucide/vue'
import { CheckboxIndicator, CheckboxRoot } from 'reka-ui'

const props = withDefaults(defineProps<{
    modelValue: boolean
    disabled?: boolean
    tone?: 'accent' | 'danger'
}>(), {
    disabled: false,
    tone: 'accent',
})

defineEmits<{ 'update:modelValue': [value: boolean] }>()
</script>

<template>
    <CheckboxRoot
        :model-value="props.modelValue"
        :disabled="props.disabled"
        :data-tono="props.tone === 'danger' ? 'pericolo' : 'accento'"
        class="talos-calm-marker grid size-5 shrink-0 place-items-center rounded-[calc(var(--talos-radius-control)/2)] border-[1.5px] border-[var(--talos-border-strong)] text-[var(--talos-accent-text)] outline-none focus-visible:ring-2 focus-visible:ring-[var(--talos-ring)] disabled:cursor-not-allowed disabled:opacity-50"
        :class="props.tone === 'danger'
            ? 'data-[state=checked]:border-[var(--talos-danger-border)] data-[state=checked]:bg-[var(--talos-danger-soft)] data-[state=checked]:text-[var(--talos-danger)]'
            : 'data-[state=checked]:border-[var(--talos-accent)] data-[state=checked]:bg-[var(--talos-accent)]'"
        @update:model-value="$emit('update:modelValue', $event === true)"
    >
        <CheckboxIndicator class="grid place-items-center">
            <Check class="size-4" :stroke-width="2.5" aria-hidden="true" />
        </CheckboxIndicator>
    </CheckboxRoot>
</template>
