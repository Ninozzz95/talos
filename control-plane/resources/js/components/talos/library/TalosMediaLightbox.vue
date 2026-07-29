<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'
import { ArrowLeft, ArrowRight, ExternalLink, Loader2, X } from '@lucide/vue'
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
} from '../../ui/dialog'
import Button from '../../ui/Button.vue'
import Tooltip from '../../ui/Tooltip.vue'
import { useTalosMediaObjectUrl } from '../../../composables/useTalosMediaObjectUrl'
import type { TalosLibraryItem } from '../../../lib/talosLibrary'

const props = defineProps<{
    open: boolean
    items: readonly TalosLibraryItem[]
    activeItemId: string | null
}>()

const emit = defineEmits<{
    'update:open': [value: boolean]
    'update:activeItemId': [value: string]
}>()

const closeButton = ref<HTMLButtonElement | null>(null)
const imageItems = computed(() => props.items.filter((item) => (
    item.kind === 'image' && item.contentUrl !== null
)))
const activeIndex = computed(() => {
    const index = imageItems.value.findIndex((item) => item.id === props.activeItemId)
    return index >= 0 ? index : 0
})
const activeItem = computed(() => imageItems.value[activeIndex.value] ?? null)
const {
    objectUrl,
    loading,
    error,
    load,
    dispose,
} = useTalosMediaObjectUrl()

watch(
    [() => props.open, () => activeItem.value?.contentUrl],
    ([open, contentUrl]) => {
        if (!open || !contentUrl) {
            dispose()
            return
        }
        void load(contentUrl)
    },
    { immediate: true },
)

function move(delta: number) {
    const total = imageItems.value.length
    if (total < 2) return
    const next = (activeIndex.value + delta + total) % total
    const item = imageItems.value[next]
    if (item) emit('update:activeItemId', item.id)
}

function handleOpenAutoFocus(event: Event) {
    event.preventDefault()
    void nextTick(() => closeButton.value?.focus())
}

function close() {
    emit('update:open', false)
}

onBeforeUnmount(dispose)
</script>

<template>
    <Dialog :open="open" @update:open="emit('update:open', $event)">
        <DialogContent
            :show-close="false"
            aria-modal="true"
            class="max-h-[94vh] max-w-6xl overflow-hidden border-[var(--talos-border)] bg-[var(--talos-panel)] p-0 text-[var(--talos-text)]"
            @open-auto-focus="handleOpenAutoFocus"
        >
            <DialogHeader class="border-b border-[var(--talos-border)] px-4 py-3 pr-16 text-left">
                <DialogTitle class="truncate text-base">
                    {{ activeItem?.title ?? 'Media preview' }}
                </DialogTitle>
                <DialogDescription class="text-xs text-[var(--talos-muted)]">
                    Authenticated Library preview · {{ activeIndex + 1 }} of {{ imageItems.length }}
                </DialogDescription>
            </DialogHeader>

            <button
                ref="closeButton"
                type="button"
                aria-label="Close media preview"
                class="talos-motion-control absolute right-3 top-2.5 z-10 inline-flex h-11 w-11 items-center justify-center rounded-md border border-transparent text-[var(--talos-muted)] hover:bg-[var(--talos-panel-soft)] hover:text-[var(--talos-text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--talos-ring)] lg:h-9 lg:w-9"
                @click="close"
            >
                <X class="h-4 w-4" />
            </button>

            <div class="relative flex min-h-[280px] items-center justify-center bg-black/85 sm:min-h-[520px]">
                <div v-if="loading" role="status" class="flex items-center gap-2 text-sm text-white/70">
                    <Loader2 class="h-5 w-5 animate-spin" />
                    Loading preview
                </div>
                <div
                    v-else-if="error"
                    role="alert"
                    class="mx-6 max-w-lg rounded-md border border-[var(--talos-danger-border)] bg-[var(--talos-danger-soft)] px-4 py-3 text-sm text-[var(--talos-danger)]"
                >
                    {{ error }}
                </div>
                <img
                    v-else-if="objectUrl && activeItem"
                    data-testid="talos-library-lightbox-image"
                    :src="objectUrl"
                    :alt="activeItem.title"
                    class="max-h-[72vh] max-w-full object-contain"
                >
                <p v-else class="text-sm text-white/70">No image preview is available.</p>

                <Tooltip v-if="imageItems.length > 1" content="Previous image">
                    <Button
                        type="button"
                        variant="secondary"
                        size="icon"
                        aria-label="Previous image"
                        class="absolute left-3 top-1/2 -translate-y-1/2"
                        @click="move(-1)"
                    >
                        <ArrowLeft class="h-4 w-4" />
                    </Button>
                </Tooltip>
                <Tooltip v-if="imageItems.length > 1" content="Next image">
                    <Button
                        type="button"
                        variant="secondary"
                        size="icon"
                        aria-label="Next image"
                        class="absolute right-3 top-1/2 -translate-y-1/2"
                        @click="move(1)"
                    >
                        <ArrowRight class="h-4 w-4" />
                    </Button>
                </Tooltip>
            </div>

            <div v-if="activeItem" class="flex flex-wrap items-center justify-between gap-2 border-t border-[var(--talos-border)] px-4 py-3 text-xs text-[var(--talos-muted)]">
                <span>{{ activeItem.origin }} · {{ activeItem.trustBoundary }} · {{ activeItem.chatCount }} chats</span>
                <a
                    v-if="activeItem.sourceUrl"
                    :href="activeItem.sourceUrl"
                    target="_blank"
                    rel="noopener noreferrer"
                    class="inline-flex min-h-9 items-center gap-2 rounded-md px-2 text-[var(--talos-text)] hover:bg-[var(--talos-panel-soft)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--talos-ring)]"
                >
                    <ExternalLink class="h-4 w-4" />
                    Open source
                </a>
            </div>
        </DialogContent>
    </Dialog>
</template>
