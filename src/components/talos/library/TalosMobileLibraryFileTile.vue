<script setup lang="ts">
import { Check, Sparkles } from '@lucide/vue'
import TalosMobileLibraryFileGlyph from '@/components/talos/library/TalosMobileLibraryFileGlyph.vue'
import TalosRowActions, { type TalosRowAction } from '@/components/talos/ui/TalosRowActions.vue'
import type { TalosLocalVaultFile } from '@/repositories/chatRepository'

/**
 * A vault file as a grid tile.
 *
 * Lifted out of `ContextScreen.vue` where it was written inline, while its list
 * sibling had been a component all along. That asymmetry is why the owner's
 * request — files and links in ONE grid, grouped by chat — could not be done:
 * a mixed loop needs a tile it can call, not forty lines of template that only
 * exist inside one `v-for`.
 *
 * Everything it needs is passed in. It decides nothing about selection,
 * filtering or context policy; it renders a file and reports taps.
 */
defineProps<{
    file: TalosLocalVaultFile
    thumbnailUrl: string | null
    isImage: boolean
    /** Selection mode is on: the tile shows a checkbox instead of its menu. */
    selecting: boolean
    selected: boolean
    generated: boolean
    contextLabel: string
    actionsLabel: string
    /** Whatever the actions menu accepts; this tile only forwards it. */
    actions: readonly TalosRowAction[]
    tapLabel: string
}>()

const emit = defineEmits<{
    tap: []
    action: [action: string, checked?: boolean]
}>()
</script>

<template>
    <div
        role="listitem"
        :data-vault-file-id="file.id"
        class="relative aspect-square overflow-hidden rounded-2xl border border-[var(--talos-border)] bg-[var(--talos-panel)]"
    >
        <button
            type="button"
            class="talos-pressable absolute inset-0 flex flex-col text-left"
            :aria-label="tapLabel"
            :aria-pressed="selecting ? selected : undefined"
            @click="emit('tap')"
        >
            <TalosMobileLibraryFileGlyph
                v-if="isImage"
                :file="file"
                :thumbnail-url="thumbnailUrl"
                variant="grid"
            />
            <template v-else>
                <span class="line-clamp-3 px-3 pt-3 text-sm font-medium text-[var(--talos-text)]">{{ file.display_name }}</span>
                <span class="mt-auto size-16 p-3">
                    <TalosMobileLibraryFileGlyph :file="file" variant="grid" />
                </span>
            </template>
        </button>
        <span
            v-if="selecting"
            class="pointer-events-none absolute right-1.5 top-1.5 flex size-6 items-center justify-center rounded-full border-2"
            :class="selected ? 'border-[var(--talos-accent)] bg-[var(--talos-accent)] text-[var(--talos-on-accent,#000)]' : 'border-white/80 bg-black/35'"
        >
            <Check v-if="selected" class="size-4" aria-hidden="true" />
        </span>
        <span v-if="selected" class="pointer-events-none absolute inset-0 rounded-2xl ring-2 ring-inset ring-[var(--talos-accent)]" aria-hidden="true" />
        <span
            v-if="generated"
            class="pointer-events-none absolute left-1.5 top-1.5 inline-flex items-center gap-1 rounded-full bg-black/55 px-1.5 py-0.5 text-3xs font-medium text-white"
        >
            <Sparkles class="size-3" aria-hidden="true" /> {{ $t('library.generatedShort') }}
        </span>
        <div
            v-if="!selecting"
            class="absolute bottom-1 right-1 z-[2] [&_[data-talos-library-actions-trigger]]:bg-black/60 [&_[data-talos-library-actions-trigger]]:text-white"
        >
            <TalosRowActions
                :label="actionsLabel"
                :test-id="`talos-library-actions-${file.id}`"
                :items="actions"
                @select="(action, checked) => emit('action', action, checked)"
            />
        </div>
        <span
            :data-testid="`talos-library-context-state-${file.id}`"
            class="pointer-events-none absolute bottom-1 left-1 z-[2] max-w-[calc(100%-3.5rem)] truncate rounded-full bg-black/60 px-2 py-1 text-3xs font-medium text-white"
        >
            {{ contextLabel }}
        </span>
    </div>
</template>
