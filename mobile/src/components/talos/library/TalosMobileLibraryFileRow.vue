<script setup lang="ts">
import { Check } from '@lucide/vue'
import TalosMobileLibraryFileGlyph from '@/components/talos/library/TalosMobileLibraryFileGlyph.vue'
import type { TalosLocalVaultFile } from '@/repositories/chatRepository'

withDefaults(defineProps<{
    file: TalosLocalVaultFile
    thumbnailUrl?: string | null
    selectionMode?: boolean
    selected?: boolean
    openLabel: string
    openTestId?: string
    testId?: string
}>(), {
    thumbnailUrl: null,
    selectionMode: false,
    selected: false,
    openTestId: undefined,
    testId: undefined,
})

const emit = defineEmits<{ open: [] }>()
</script>

<template>
    <div
        role="listitem"
        data-talos-library-row
        :data-testid="testId"
        class="flex min-w-0 items-center gap-3 rounded-xl px-1 py-2"
    >
        <span
            v-if="selectionMode"
            class="flex size-6 shrink-0 items-center justify-center rounded-full border-2"
            :class="selected
                ? 'border-[var(--talos-accent)] bg-[var(--talos-accent)] text-[var(--talos-on-accent,#000)]'
                : 'border-[var(--talos-border)]'"
            aria-hidden="true"
        >
            <Check v-if="selected" class="size-4" />
        </span>

        <button
            type="button"
            data-talos-library-thumbnail
            :data-testid="openTestId"
            class="talos-pressable flex size-12 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-[var(--talos-border)] bg-[var(--talos-panel)]"
            :aria-label="openLabel"
            :aria-pressed="selectionMode ? selected : undefined"
            @click="emit('open')"
        >
            <TalosMobileLibraryFileGlyph
                :file="file"
                :thumbnail-url="thumbnailUrl"
            />
        </button>

        <div class="min-w-0 flex-1">
            <button
                type="button"
                data-talos-library-name-button
                class="block min-h-12 w-full min-w-0 text-left"
                :aria-label="openLabel"
                :aria-pressed="selectionMode ? selected : undefined"
                @click="emit('open')"
            >
                <span
                    data-talos-library-name
                    class="line-clamp-2 text-sm font-medium text-[var(--talos-text)]"
                >{{ file.display_name }}</span>
                <span
                    v-if="$slots.meta"
                    class="mt-0.5 flex min-w-0 items-center gap-1.5 text-xs text-[var(--talos-muted)]"
                ><slot name="meta" /></span>
            </button>
            <slot name="details" />
        </div>

        <div v-if="$slots.actions" class="flex shrink-0 items-center">
            <slot name="actions" />
        </div>
    </div>
</template>
