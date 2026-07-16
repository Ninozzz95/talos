<script setup lang="ts">
import { ArrowUpRight, Globe2 } from '@lucide/vue'
import { Button } from '../../ui/button'
import type { TalosBrowserClarificationChoice } from '../../../lib/talosTypes'

defineProps<{
    choices: TalosBrowserClarificationChoice[]
}>()

const emit = defineEmits<{
    select: [prompt: string]
}>()

function selectChoice(choice: TalosBrowserClarificationChoice) {
    emit('select', `Open and inspect ${choice.url}`)
}
</script>

<template>
    <div
        data-testid="talos-browser-clarification-choices"
        class="mt-3 grid min-w-0 gap-2"
        aria-label="Browser destinations"
    >
        <Button
            v-for="choice in choices"
            :key="`${choice.index}-${choice.url}`"
            type="button"
            variant="outline"
            class="group h-auto min-h-11 w-full min-w-0 justify-start overflow-hidden border-[var(--talos-border)] bg-[var(--talos-panel-soft)] px-3 py-2 text-left text-[var(--talos-text)] hover:border-[var(--talos-accent)] hover:bg-[var(--talos-panel)] focus-visible:ring-[var(--talos-ring)]"
            :aria-label="`Use destination ${choice.label}`"
            :title="choice.url"
            @click="selectChoice(choice)"
        >
            <Globe2 class="h-4 w-4 shrink-0 text-[var(--talos-accent)]" aria-hidden="true" />
            <span class="min-w-0 flex-1 truncate text-sm font-medium">{{ choice.label }}</span>
            <ArrowUpRight class="h-4 w-4 shrink-0 text-[var(--talos-muted)] transition-colors group-hover:text-[var(--talos-accent)]" aria-hidden="true" />
        </Button>
    </div>
</template>
