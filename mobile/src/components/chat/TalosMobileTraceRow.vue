<script setup lang="ts">
import { ChevronRight } from '@lucide/vue'

/**
 * The muted one-line trace affordance.
 *
 * Owner 2026-07-26, with a screenshot of the Claude Android app: the reasoning
 * section must be "un semplice testo in grigio o colore primario sbiadito" that
 * opens a drawer on tap — no card, no border, no filled panel. In that same
 * screenshot the tool-activity line is rendered IDENTICALLY (icon, truncated
 * label, chevron), which is why this is a component and not markup living
 * inside the reasoning block: two surfaces that must look the same should not
 * be two pieces of markup that happen to agree today.
 *
 * Deliberately NOT a disclosure widget: no `aria-expanded`, because nothing
 * expands in place. It advertises `aria-haspopup="dialog"`, which is what
 * actually happens.
 *
 * The label truncates to one line. A reasoning trace or a search query is
 * arbitrarily long, and a row that wraps to four lines is the visual weight the
 * owner asked to remove.
 */
withDefaults(defineProps<{
    label: string
    /** Right-aligned, secondary: word count, duration, result count. */
    detail?: string
    testid?: string
    /** Dims and animates while the underlying work is still running. */
    live?: boolean
    /**
     * False renders the same line WITHOUT a chevron and without dialog
     * semantics. A chevron that opens nothing is a promise the row cannot keep
     * — used for the running-tool line, which has no detail worth a drawer
     * until the audit trail is surfaced (debt T8).
     */
    interactive?: boolean
}>(), { interactive: true })

defineEmits<{ open: [] }>()
</script>

<template>
    <component
        :is="interactive ? 'button' : 'span'"
        :type="interactive ? 'button' : undefined"
        :data-testid="testid"
        :aria-haspopup="interactive ? 'dialog' : undefined"
        class="group flex min-h-touch w-full items-center gap-2 rounded-lg pr-1 text-left text-[var(--talos-muted)] transition-colors duration-150"
        :class="interactive ? 'talos-pressable hover:text-[var(--talos-text)]' : ''"
        v-on="interactive ? { click: () => $emit('open') } : {}"
    >
        <span
            class="flex size-4 shrink-0 items-center justify-center"
            :class="live ? 'talos-trace-live' : ''"
            aria-hidden="true"
        >
            <slot name="icon">
                <span class="size-1.5 rounded-full bg-current opacity-70" />
            </slot>
        </span>
        <span class="min-w-0 flex-1 truncate text-xs">{{ label }}</span>
        <span v-if="detail" class="shrink-0 text-2xs opacity-70">{{ detail }}</span>
        <ChevronRight v-if="interactive" class="size-3.5 shrink-0 opacity-70" aria-hidden="true" />
    </component>
</template>
