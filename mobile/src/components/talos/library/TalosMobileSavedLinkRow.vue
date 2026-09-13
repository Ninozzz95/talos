<script setup lang="ts">
/**
 * A saved link as a list row.
 *
 * The root is a `div` with `role="listitem"`, not an `li`: owner 2026-07-30
 * asked for files and links in ONE list, and a file row is not an `li` — an `li`
 * among divs, or a div inside a `ul`, is invalid either way. The role carries
 * the meaning to assistive tech, which is what the element was for.
 *
 * (The explanation lives here rather than above the root element because a
 * comment there makes this a multi-root component, and a fragment has no
 * attributes of its own — which is exactly how LINK-PARITY-01 caught it.)
 */
import { ExternalLink, Globe } from '@lucide/vue'
import type { TalosSavedLinkRow } from '@/lib/vaultLibrary'

withDefaults(defineProps<{
    row: TalosSavedLinkRow
    savedAtLabel: string
    copyTestId?: string
    browserTestId?: string
    /**
     * The site's own favicon, captured when the link was saved and read from
     * disk. Absent for anything saved before capture existed, for a dead site,
     * or for a phone that was offline — and absence must look deliberate, so
     * the Globe stays as the mark rather than a broken image.
     */
    faviconUrl?: string | null
}>(), {
    copyTestId: undefined,
    browserTestId: undefined,
    faviconUrl: null,
})

const emit = defineEmits<{
    openCopy: []
    openBrowser: []
}>()
</script>

<template>
    <div
        role="listitem"
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
            <img
                v-if="faviconUrl"
                data-testid="talos-library-link-favicon"
                :src="faviconUrl"
                alt=""
                class="size-4 shrink-0 rounded-sm object-contain"
            >
            <Globe v-else class="size-4 shrink-0 text-[var(--talos-accent)]" aria-hidden="true" />
            <span class="min-w-0 flex-1">
                <span class="line-clamp-2 text-sm font-medium text-[var(--talos-text)]">{{ row.title }}</span>
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
    </div>
</template>
