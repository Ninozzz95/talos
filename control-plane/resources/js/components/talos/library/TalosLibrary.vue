<script setup lang="ts">
import { computed, ref, toRef } from 'vue'
import { AlertCircle, Library, Loader2, RefreshCw } from '@lucide/vue'
import {
    AlertDialog,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from '../../ui/alert-dialog'
import Button from '../../ui/Button.vue'
import TalosGuideInfoButton from '../guide/TalosGuideInfoButton.vue'
import { useTalosLibrary } from '../../../composables/useTalosLibrary'
import type { TalosLibraryItem } from '../../../lib/talosLibrary'
import TalosLibraryFilters from './TalosLibraryFilters.vue'
import TalosLibraryItemCard from './TalosLibraryItem.vue'
import TalosMediaLightbox from './TalosMediaLightbox.vue'

const props = withDefaults(defineProps<{
    authenticated: boolean
    ownerKey: string | null
    guideId?: string
}>(), {
    guideId: 'library',
})

const emit = defineEmits<{
    attachFile: [fileId: string]
}>()

const library = useTalosLibrary({
    authenticated: toRef(props, 'authenticated'),
    ownerKey: toRef(props, 'ownerKey'),
})
const lightboxOpen = ref(false)
const lightboxItemId = ref<string | null>(null)
const pendingRemovalIds = ref<string[]>([])
const removalAttempted = ref(false)

const imageItems = computed(() => library.items.value.filter((item) => (
    item.kind === 'image' && item.contentUrl !== null
)))
const removeDialogOpen = computed(() => pendingRemovalIds.value.length > 0)
const removalLabel = computed(() => {
    if (pendingRemovalIds.value.length === 1) {
        return library.items.value.find((item) => item.id === pendingRemovalIds.value[0])?.title ?? 'this item'
    }

    return `${pendingRemovalIds.value.length} selected items`
})

function preview(item: TalosLibraryItem) {
    lightboxItemId.value = item.id
    lightboxOpen.value = true
}

function requestRemoveItem(item: TalosLibraryItem) {
    removalAttempted.value = false
    pendingRemovalIds.value = [item.id]
}

function toggleSelected(item: TalosLibraryItem) {
    library.toggleSelected(item.id)
}

function requestRemoveSelected() {
    removalAttempted.value = false
    pendingRemovalIds.value = [...library.selectedIds.value]
}

function closeRemoveDialog() {
    if (library.removing.value) return
    removalAttempted.value = false
    pendingRemovalIds.value = []
}

async function confirmRemove() {
    const ids = [...pendingRemovalIds.value]
    if (ids.length === 0) return
    removalAttempted.value = true
    await library.remove(ids)
    if (library.error.value === null) closeRemoveDialog()
}
</script>

<template>
    <section class="flex min-h-0 flex-1 flex-col bg-[var(--talos-surface-1)] text-[var(--talos-text)]" aria-labelledby="talos-library-title">
        <header class="flex flex-wrap items-start justify-between gap-3 border-b border-[var(--talos-border)] px-4 py-3">
            <div class="min-w-0">
                <div class="flex items-center gap-2 text-xs font-semibold uppercase text-[var(--talos-muted)]">
                    <Library class="h-4 w-4 text-[var(--talos-accent)]" />
                    Unified Library
                </div>
                <div class="mt-1 flex items-center gap-1.5">
                    <h2 id="talos-library-title" class="text-base font-semibold">Files, media, and sources</h2>
                    <TalosGuideInfoButton :guide-id="guideId" compact side="bottom" />
                </div>
            </div>
            <span class="rounded-md border border-[var(--talos-border)] bg-[var(--talos-panel-soft)] px-2 py-1 text-xs text-[var(--talos-muted)]">
                {{ library.items.value.length }} loaded
            </span>
        </header>

        <TalosLibraryFilters
            :kind="library.kind.value"
            :origin="library.origin.value"
            :search="library.search.value"
            :view-mode="library.viewMode.value"
            :selected-count="library.selectedIds.value.length"
            :removing="library.removing.value"
            :loading="library.loadState.value === 'loading'"
            @apply-filters="library.setFilters"
            @update:view-mode="library.setViewMode"
            @refresh="library.load"
            @request-remove="requestRemoveSelected"
        />

        <div class="min-h-0 flex-1 overflow-y-auto p-4">
            <div
                v-if="library.loadState.value === 'loading'"
                role="status"
                class="flex min-h-40 items-center justify-center gap-2 text-sm text-[var(--talos-muted)]"
            >
                <Loader2 class="h-5 w-5 animate-spin text-[var(--talos-accent)]" />
                Loading Library
            </div>

            <div
                v-else-if="library.loadState.value === 'error'"
                role="alert"
                class="mx-auto flex max-w-xl items-start gap-3 rounded-md border border-[var(--talos-danger-border)] bg-[var(--talos-danger-soft)] p-4 text-sm text-[var(--talos-danger)]"
            >
                <AlertCircle class="mt-0.5 h-4 w-4 shrink-0" />
                <div class="min-w-0 flex-1">
                    <p>{{ library.error.value }}</p>
                    <Button
                        data-testid="talos-library-retry"
                        type="button"
                        variant="outline"
                        size="sm"
                        class="mt-3"
                        @click="library.load"
                    >
                        <RefreshCw class="h-4 w-4" />
                        Retry
                    </Button>
                </div>
            </div>

            <div
                v-else-if="library.loadState.value === 'loaded' && library.items.value.length === 0"
                class="flex min-h-40 items-center justify-center rounded-md border border-dashed border-[var(--talos-border)] px-6 text-center text-sm text-[var(--talos-muted)]"
            >
                No Library items match this view.
            </div>

            <div
                v-else
                :class="library.viewMode.value === 'grid'
                    ? 'grid grid-cols-[repeat(auto-fill,minmax(min(100%,240px),1fr))] gap-3'
                    : 'divide-y divide-[var(--talos-border)]'"
            >
                <TalosLibraryItemCard
                    v-for="item in library.items.value"
                    :key="item.id"
                    :item="item"
                    :selected="library.selectedIds.value.includes(item.id)"
                    :view-mode="library.viewMode.value"
                    @toggle-selected="toggleSelected"
                    @preview="preview"
                    @attach="emit('attachFile', $event.sourceId)"
                    @request-remove="requestRemoveItem"
                />
            </div>

            <div
                v-if="library.loadState.value === 'loaded'
                    && library.error.value
                    && !removeDialogOpen"
                data-testid="talos-library-inline-error"
                role="alert"
                class="mx-auto mt-4 flex max-w-xl items-start gap-3 rounded-md border border-[var(--talos-danger-border)] bg-[var(--talos-danger-soft)] p-4 text-sm text-[var(--talos-danger)]"
            >
                <AlertCircle class="mt-0.5 h-4 w-4 shrink-0" />
                <div class="min-w-0 flex-1">
                    <p>{{ library.error.value }}</p>
                    <Button
                        data-testid="talos-library-inline-retry"
                        type="button"
                        variant="outline"
                        size="sm"
                        class="mt-3"
                        @click="library.load"
                    >
                        <RefreshCw class="h-4 w-4" />
                        Reload Library
                    </Button>
                </div>
            </div>

            <div v-if="library.nextCursor.value" class="flex justify-center pt-4">
                <Button
                    type="button"
                    variant="secondary"
                    :loading="library.loadingMore.value"
                    @click="library.loadMore"
                >
                    Load more
                </Button>
            </div>
        </div>

        <TalosMediaLightbox
            v-model:open="lightboxOpen"
            v-model:active-item-id="lightboxItemId"
            :items="imageItems"
        />

        <AlertDialog :open="removeDialogOpen" @update:open="(open) => { if (!open) closeRemoveDialog() }">
            <AlertDialogContent class="border-[var(--talos-border)] bg-[var(--talos-panel)] text-[var(--talos-text)]">
                <AlertDialogHeader>
                    <AlertDialogTitle>Remove from Library?</AlertDialogTitle>
                    <AlertDialogDescription class="text-[var(--talos-muted)]">
                        TALOS will hide {{ removalLabel }} from the unified Library. The original file, document, artifact, or Browser evidence remains in its source feature.
                    </AlertDialogDescription>
                </AlertDialogHeader>
                <div
                    v-if="removalAttempted && library.error.value"
                    data-testid="talos-library-removal-error"
                    role="alert"
                    class="flex items-start gap-2 rounded-md border border-[var(--talos-danger-border)] bg-[var(--talos-danger-soft)] p-3 text-sm text-[var(--talos-danger)]"
                >
                    <AlertCircle class="mt-0.5 h-4 w-4 shrink-0" />
                    <span>{{ library.error.value }}</span>
                </div>
                <AlertDialogFooter>
                    <AlertDialogCancel :disabled="library.removing.value" @click="closeRemoveDialog">Cancel</AlertDialogCancel>
                    <Button
                        data-testid="talos-library-confirm-remove"
                        type="button"
                        variant="destructive"
                        :loading="library.removing.value"
                        :disabled="library.removing.value"
                        @click="confirmRemove"
                    >
                        Remove from Library
                    </Button>
                </AlertDialogFooter>
            </AlertDialogContent>
        </AlertDialog>
    </section>
</template>
