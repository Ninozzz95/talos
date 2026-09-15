<script setup lang="ts">
import { Check, FileWarning } from '@lucide/vue'
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
            <!--
                ⛔ IL SEGNO CHE UN FILE NON C'È PIÙ.

                ## Il fatto, contato sul Pad il 2026-08-08

                La Libreria elencava quattro immagini e sul disco ce n'erano
                tre. `button_a.png` aveva la riga e nessun file, e la riga era
                identica alle altre. Se n'è accorto uno strumento che ci è
                inciampato — cioè nel momento peggiore, mentre la persona
                chiedeva di usarlo.

                ## Perché va detto QUI

                Una riga che non si può aprire è un file che la persona **crede
                di avere**. Finché l'elenco non lo dice, quella convinzione dura
                fino al giorno in cui il file le serve davvero — ed è il giorno
                sbagliato per scoprirlo. La riconciliazione marca la riga; qui
                si vede.

                Resta nell'elenco e resta toccabile: la persona può volerla
                cancellare, o ricordarsi da dove veniva. Sparire sarebbe una
                seconda perdita silenziosa dopo la prima.
            -->
            <p
                v-if="file.status === 'failed'"
                data-testid="talos-library-file-missing"
                class="mt-0.5 flex min-w-0 items-center gap-1.5 text-xs text-[var(--talos-danger)]"
            >
                <FileWarning class="size-3.5 shrink-0" aria-hidden="true" />
                <span class="min-w-0 truncate">{{ $t('library.fileMissing') }}</span>
            </p>
            <slot name="details" />
        </div>

        <div v-if="$slots.actions" class="flex shrink-0 items-center">
            <slot name="actions" />
        </div>
    </div>
</template>
