<script setup lang="ts">
import { ExternalLink, Globe } from '@lucide/vue'
import type { TalosSavedLinkRow } from '@/lib/vaultLibrary'

withDefaults(defineProps<{
    row: TalosSavedLinkRow
    savedAtLabel: string
    copyTestId?: string
    browserTestId?: string
}>(), {
    copyTestId: undefined,
    browserTestId: undefined,
})

const emit = defineEmits<{
    openCopy: []
    openBrowser: []
}>()
</script>

<template>
    <li
        data-talos-saved-link-row
        class="flex min-w-0 items-center gap-1 rounded-2xl border border-[var(--talos-border)] bg-[var(--talos-panel)] pr-1"
    >
        <button
            type="button"
            :data-testid="copyTestId"
            class="talos-pressable flex min-h-14 min-w-0 flex-1 items-center gap-3 rounded-2xl px-3 text-left"
            :aria-label="`Open the saved copy of ${row.title}`"
            @click="emit('openCopy')"
        >
            <Globe class="size-4 shrink-0 text-[var(--talos-accent)]" aria-hidden="true" />
            <span class="min-w-0 flex-1">
                <span class="line-clamp-2 block text-sm font-medium text-[var(--talos-text)]">{{ row.title }}</span>
                <span class="mt-0.5 flex items-center gap-1.5 text-2xs text-[var(--talos-muted)]">
                    <span class="truncate">{{ row.host }}</span>
                    <span aria-hidden="true">·</span>
                    <span class="shrink-0">{{ savedAtLabel }}</span>
                </span>
            </span>
        </button>
        <button
            type="button"
            :data-testid="browserTestId"
            class="talos-pressable flex min-h-12 min-w-12 shrink-0 items-center justify-center rounded-full text-[var(--talos-text)]"
            :aria-label="`Open ${row.host} in the browser`"
            @click="emit('openBrowser')"
        >
            <ExternalLink class="size-4" aria-hidden="true" />
        </button>
    </li>
</template>
