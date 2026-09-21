<script setup lang="ts">
import { ExternalLink, Globe } from '@lucide/vue'
import type { TalosSavedLinkRow } from '@/lib/vaultLibrary'

/**
 * A saved link as a grid tile.
 *
 * Owner 2026-07-30: links were rendered in a branch of their own, so the
 * grid/list switch — which lives in the file branch — never reached them, and
 * choosing "grid" while looking at links did nothing at all.
 *
 * It is a separate component from the file tile on purpose. A file tile carries
 * multi-select, an actions menu, a context-state pill and a generated badge, and
 * a link has no meaning for any of them; one template serving both would be made
 * of `v-if` and would be harder to read than two, not easier. What the two DO
 * share — the grouping by chat — is shared, in `libraryGrouping.ts`.
 *
 * The mark is the Globe for now. The captured favicon replaces it once the
 * capture is wired to the save path: the bytes are fetched once when the link is
 * saved and read from disk here, so showing a real favicon costs no request at
 * display time.
 */
withDefaults(defineProps<{
    row: TalosSavedLinkRow
    savedAtLabel: string
    /** Captured at save time; absent means the Globe, which is not a failure. */
    faviconUrl?: string | null
}>(), { faviconUrl: null })

const emit = defineEmits<{
    openCopy: []
    openBrowser: []
}>()
</script>

<template>
    <div
        :data-testid="`talos-library-link-tile-${row.fileId}`"
        data-talos-saved-link-tile
        role="listitem"
        class="relative flex aspect-square flex-col overflow-hidden rounded-2xl border border-[var(--talos-border)] bg-[var(--talos-panel)]"
    >
        <button
            type="button"
            class="talos-pressable flex min-w-0 flex-1 flex-col items-start gap-2 p-3 text-left"
            :aria-label="`Open the saved copy of ${row.title}`"
            @click="emit('openCopy')"
        >
            <img
                v-if="faviconUrl"
                data-testid="talos-library-link-favicon"
                :src="faviconUrl"
                alt=""
                class="size-6 shrink-0 rounded object-contain"
            >
            <Globe v-else class="size-6 shrink-0 text-[var(--talos-accent)]" aria-hidden="true" />
            <span class="line-clamp-3 text-sm font-medium text-[var(--talos-text)]">{{ row.title }}</span>
            <span class="mt-auto flex w-full min-w-0 flex-col text-2xs text-[var(--talos-muted)]">
                <span class="truncate">{{ row.host }}</span>
                <span class="truncate">{{ savedAtLabel }}</span>
            </span>
        </button>
        <button
            type="button"
            data-testid="talos-library-link-open"
            class="talos-pressable absolute bottom-1 right-1 flex min-h-touch min-w-touch items-center justify-center rounded-full bg-black/10 text-[var(--talos-text)]"
            :aria-label="`Open ${row.host} in the browser`"
            @click="emit('openBrowser')"
        >
            <ExternalLink class="size-4" aria-hidden="true" />
        </button>
    </div>
</template>
