<script setup lang="ts">
/**
 * The one filter: choose exactly one of these, without leaving the view.
 *
 * The third and last of the three grammars the navigation research settled on —
 * tabs, navigation, filter. Five places in the app were drawing it the same
 * wrong way: a `role="group"` holding buttons that each carry `aria-pressed`.
 * That is a row of independent toggles, and it is not what any of them are.
 *
 * What it costs to get wrong is specific, not theoretical:
 *   - a screen reader says "button, pressed" — never "1 of 4", never "selected",
 *     and nothing at all about the other options existing;
 *   - `aria-pressed` on several buttons at once is a legal state, so nothing
 *     tells assistive tech that choosing one un-chooses the rest;
 *   - every option is its own tab stop, so a keyboard user walks through eight
 *     effort levels to reach the control after them. The APG gives a radiogroup
 *     ONE stop and moves inside it with the arrows.
 *
 * The grammar lives here and the look does not: `optionClass` is a function of
 * the selected state, and an `option` slot lets the stacked cards keep their
 * check mark and their note while the chips stay chips. Same split as the tab
 * strip — the screen owns appearance, never semantics.
 */
import { computed, ref } from 'vue'

export type TalosFilterOption = {
    /** Stable id. This is what gets stored and compared, never the label. */
    value: string
    /** Visible text. Ignored when the caller renders its own option body. */
    label?: string
    /**
     * Spoken name, when the visible one is an abbreviation. A radio without an
     * accessible name is an unlabelled control, which is worse than a long one.
     */
    ariaLabel?: string
    disabled?: boolean
    /**
     * The primitive owns the button, so it has to carry whatever hook the
     * button already had — otherwise adopting it silently breaks every test and
     * end-to-end selector pointed at the thing it replaced.
     */
    testId?: string
}

const props = withDefaults(defineProps<{
    modelValue: string
    options: readonly TalosFilterOption[]
    /**
     * Names the group, and required — a radiogroup with no name is a control a
     * screen reader can only describe as "radio group".
     *
     * Called `groupLabel` and not `ariaLabel` on purpose: `aria-label` is a
     * native attribute name, so a template writing `:aria-label` hands it to
     * the element as an attribute and the type checker cannot see the required
     * prop arriving. Renaming it is what keeps "required" enforceable.
     */
    groupLabel: string
    /** Layout for the group — direction, gaps, scrolling. */
    groupClass?: string
    /** Appearance per option, decided by whether it is the chosen one. */
    optionClass?: (selected: boolean) => string
}>(), {
    groupClass: 'flex flex-wrap gap-1.5',
    optionClass: () => '',
})

const emit = defineEmits<{ 'update:modelValue': [value: string] }>()

const group = ref<HTMLElement | null>(null)

const selectable = computed(() => props.options.filter((option) => option.disabled !== true))

/**
 * Which option holds the group's single tab stop.
 *
 * The chosen one, normally. When the stored value is not on offer — a filter
 * whose options changed under it — the first selectable option takes the stop,
 * because a radiogroup where nothing is reachable by Tab is a control a
 * keyboard cannot enter at all.
 */
const tabStop = computed(() => {
    const chosen = selectable.value.find((option) => option.value === props.modelValue)
    return chosen?.value ?? selectable.value[0]?.value ?? null
})

function choose(option: TalosFilterOption): void {
    if (option.disabled === true) return
    if (option.value === props.modelValue) return
    emit('update:modelValue', option.value)
}

function focusValue(value: string): void {
    group.value?.querySelector<HTMLElement>(`[data-talos-filter-option="${value}"]`)?.focus()
}

/**
 * Arrows move AND choose, which is the radiogroup pattern rather than the tab
 * one: the panel behind a tab may be expensive, but a filter has already been
 * paid for by the time you can see it.
 */
function onKeydown(event: KeyboardEvent, option: TalosFilterOption): void {
    const order = selectable.value
    const index = order.findIndex((entry) => entry.value === option.value)
    if (index === -1) return

    let target: number
    switch (event.key) {
        case 'ArrowRight':
        case 'ArrowDown': target = (index + 1) % order.length; break
        case 'ArrowLeft':
        case 'ArrowUp': target = (index - 1 + order.length) % order.length; break
        case 'Home': target = 0; break
        case 'End': target = order.length - 1; break
        default: return
    }
    event.preventDefault()
    const next = order[target]
    if (!next) return
    choose(next)
    focusValue(next.value)
}
</script>

<template>
    <div ref="group" role="radiogroup" :aria-label="groupLabel" :class="groupClass">
        <button
            v-for="option in options"
            :key="option.value"
            type="button"
            role="radio"
            :data-talos-filter-option="option.value"
            :data-testid="option.testId"
            :aria-checked="option.value === modelValue"
            :aria-label="option.ariaLabel"
            :disabled="option.disabled === true"
            :tabindex="option.value === tabStop ? 0 : -1"
            :class="optionClass(option.value === modelValue)"
            @click="choose(option)"
            @keydown="onKeydown($event, option)"
        >
            <slot name="option" :option="option" :selected="option.value === modelValue">
                {{ option.label }}
            </slot>
        </button>
    </div>
</template>
