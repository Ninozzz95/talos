<script setup lang="ts">
import { computed } from 'vue'
import {
    Braces,
    File,
    FileArchive,
    FileBadge,
    FileCode,
    FileImage,
    FileSpreadsheet,
    FileText,
    FileType,
    Presentation,
} from '@lucide/vue'
import { talosLibraryFilePresentation } from '@/lib/libraryFilePresentation'
import type { TalosLocalVaultFile } from '@/repositories/chatRepository'

const props = withDefaults(defineProps<{
    file: TalosLocalVaultFile
    thumbnailUrl?: string | null
    variant?: 'row' | 'grid'
}>(), {
    thumbnailUrl: null,
    variant: 'row',
})

const presentation = computed(() => talosLibraryFilePresentation(
    props.file.display_name,
    props.file.media_type,
))
const hasThumbnail = computed(() => Boolean(props.thumbnailUrl))
const icon = computed(() => ({
    image: FileImage,
    pdf: FileBadge,
    word: FileType,
    spreadsheet: FileSpreadsheet,
    presentation: Presentation,
    code: FileCode,
    data: Braces,
    archive: FileArchive,
    text: FileText,
    file: File,
})[presentation.value.iconKind])
</script>

<template>
    <span
        data-talos-library-file-glyph
        aria-hidden="true"
        class="relative flex size-full min-h-0 min-w-0 flex-col items-center justify-center overflow-hidden"
    >
        <img
            v-if="hasThumbnail"
            :src="thumbnailUrl!"
            alt=""
            class="size-full object-cover"
        >
        <span
            :data-talos-library-icon-kind="presentation.iconKind"
            :class="hasThumbnail ? 'contents' : 'flex items-center justify-center text-[var(--talos-accent)]'"
        >
            <component
                :is="icon"
                v-if="!hasThumbnail"
                :class="variant === 'grid' ? 'size-7' : 'size-5'"
            />
        </span>
        <span
            data-talos-library-extension
            class="max-w-full truncate font-mono text-3xs font-semibold tracking-wide"
            :class="hasThumbnail
                ? 'absolute inset-x-0 bottom-0 bg-black/70 px-0.5 py-px text-center leading-3 text-white'
                : 'mt-0.5 px-0.5 leading-none text-[var(--talos-muted)]'"
        >{{ presentation.extension }}</span>
    </span>
</template>
