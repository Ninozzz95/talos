<script setup lang="ts">
/**
 * A saved link as a list row.
 *
 * The root is a `div` with `role="listitem"`, not an `li`: owner 2026-07-30
 * asked for files and links in ONE list, and a file row is not an `li` — an `li`
 * among divs, or a div inside a `ul`, is invalid either way. The role carries
 * the meaning to assistive tech, which is what the element was for.
 *
 * Two shapes, chosen by whoever mounts it. With `actions` (the Library, owner
 * 14/09/2026) the page in the browser is one entry of the ⋯ menu, next to
 * attach, save and delete — the same menu a file has. Without them (a chat's
 * media panel) the browser keeps its own button, as before.
 *
 * (The explanation lives here rather than above the root element because a
 * comment there makes this a multi-root component, and a fragment has no
 * attributes of its own — which is exactly how LINK-PARITY-01 caught it.)
 */
import { ExternalLink, Globe } from '@lucide/vue'
import TalosRowActions, { type TalosRowAction } from '@/components/talos/ui/TalosRowActions.vue'
import type { TalosSavedLinkRow } from '@/lib/vaultLibrary'

withDefaults(defineProps<{
    row: TalosSavedLinkRow
    /** The date beside the host. The Library passes none (owner 14/09/2026). */
    savedAtLabel?: string | null
    copyTestId?: string
    browserTestId?: string
    /**
     * The site's own favicon, captured when the link was saved and read from
     * disk. Absent for anything saved before capture existed, for a dead site,
     * or for a phone that was offline — and absence must look deliberate, so
     * the Globe stays as the mark rather than a broken image.
     */
    faviconUrl?: string | null
    /** The chat it came from, when the Library is grouped by chat. */
    originLabel?: string | null
    /** Given, the row has a ⋯ menu instead of its own browser button. */
    actions?: readonly TalosRowAction[] | null
    actionsLabel?: string
}>(), {
    savedAtLabel: null,
    copyTestId: undefined,
    browserTestId: undefined,
    faviconUrl: null,
    originLabel: null,
    actions: null,
    actionsLabel: '',
})

const emit = defineEmits<{
    openCopy: []
    openBrowser: []
    action: [action: string]
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
            :aria-label="$t('library.openSavedCopyOf', { title: row.title })"
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
                <span class="mt-0.5 flex min-w-0 items-center gap-1.5 text-2xs text-[var(--talos-muted)]">
                    <span class="truncate">{{ row.host }}</span>
                    <template v-if="savedAtLabel">
                        <span aria-hidden="true">·</span>
                        <span class="shrink-0">{{ savedAtLabel }}</span>
                    </template>
                    <template v-if="originLabel">
                        <span aria-hidden="true">·</span>
                        <span class="truncate">{{ originLabel }}</span>
                    </template>
                </span>
            </span>
        </button>
        <TalosRowActions
            v-if="actions"
            :label="actionsLabel"
            :test-id="`talos-library-link-actions-${row.fileId}`"
            :items="actions"
            @select="(action) => emit('action', action)"
        />
        <button
            v-else
            type="button"
            :data-testid="browserTestId"
            class="talos-pressable flex min-h-12 min-w-12 shrink-0 items-center justify-center rounded-full text-[var(--talos-text)]"
            :aria-label="$t('library.openHostInBrowser', { host: row.host })"
            @click="emit('openBrowser')"
        >
            <ExternalLink class="size-4" aria-hidden="true" />
        </button>
    </div>
</template>
