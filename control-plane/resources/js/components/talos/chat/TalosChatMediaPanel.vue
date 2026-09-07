<script setup lang="ts">
import { computed, ref, toRef, watch } from 'vue'
import {
    ExternalLink,
    Eye,
    FileText,
    Images,
    Link2,
    Loader2,
    RefreshCw,
} from '@lucide/vue'
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
} from '../../ui/dialog'
import Badge from '../../ui/Badge.vue'
import Button from '../../ui/Button.vue'
import Tabs from '../../ui/Tabs.vue'
import { useTalosLibrary } from '../../../composables/useTalosLibrary'
import type { TalosLibraryItem } from '../../../lib/talosLibrary'
import TalosMediaLightbox from '../library/TalosMediaLightbox.vue'

type MediaFilter = 'all' | 'images' | 'files' | 'sources'

const props = defineProps<{
    open: boolean
    authenticated: boolean
    ownerKey: string | null
    sessionId: string | null
}>()

const emit = defineEmits<{
    'update:open': [value: boolean]
}>()

const media = useTalosLibrary({
    authenticated: toRef(props, 'authenticated'),
    ownerKey: toRef(props, 'ownerKey'),
    autoLoadLibrary: false,
})
const activeFilter = ref<MediaFilter>('all')
const lightboxOpen = ref(false)
const lightboxItemId = ref<string | null>(null)
const filterTabs = [
    { id: 'all', label: 'All' },
    { id: 'images', label: 'Images' },
    { id: 'files', label: 'Files' },
    { id: 'sources', label: 'Sources' },
] as const
const visibleItems = computed(() => media.sessionMedia.value.filter((item) => {
    if (activeFilter.value === 'images') return item.kind === 'image'
    if (activeFilter.value === 'files') return item.kind === 'file'
    if (activeFilter.value === 'sources') return item.kind === 'link'
    return true
}))
const imageItems = computed(() => media.sessionMedia.value.filter((item) => (
    item.kind === 'image' && item.contentUrl !== null
)))

watch(
    [
        () => props.open,
        () => props.sessionId,
        () => props.authenticated,
        () => props.ownerKey,
    ],
    ([open]) => {
        if (!open) {
            void media.loadSessionMedia(null)
            lightboxOpen.value = false
            return
        }
        void media.loadSessionMedia(props.sessionId)
    },
    { immediate: true },
)

function preview(item: TalosLibraryItem) {
    lightboxItemId.value = item.id
    lightboxOpen.value = true
}

function retry() {
    void media.loadSessionMedia(props.sessionId)
}

function close() {
    emit('update:open', false)
}
</script>

<template>
    <Dialog :open="open" @update:open="emit('update:open', $event)">
        <DialogContent
            aria-modal="true"
            class="flex max-h-[90vh] max-w-4xl flex-col overflow-hidden border-[var(--talos-border)] bg-[var(--talos-panel)] text-[var(--talos-text)]"
        >
            <DialogHeader>
                <DialogTitle class="flex items-center gap-2">
                    <Images class="h-4 w-4 text-[var(--talos-accent)]" />
                    Chat media
                </DialogTitle>
                <DialogDescription class="text-[var(--talos-muted)]">
                    Files, images, and sources linked to the active chat. Access remains scoped to your account.
                </DialogDescription>
            </DialogHeader>

            <Tabs
                v-model="activeFilter"
                :items="filterTabs"
                label="Chat media filters"
                tab-id-prefix="talos-chat-media-tab"
                panel-id-prefix="talos-chat-media-panel"
            />

            <div
                :id="`talos-chat-media-panel-${activeFilter}`"
                role="tabpanel"
                :aria-labelledby="`talos-chat-media-tab-${activeFilter}`"
                class="min-h-0 flex-1 overflow-y-auto"
            >
                <div
                    v-if="media.sessionMediaLoadState.value === 'loading'"
                    role="status"
                    class="flex min-h-40 items-center justify-center gap-2 text-sm text-[var(--talos-muted)]"
                >
                    <Loader2 class="h-5 w-5 animate-spin text-[var(--talos-accent)]" />
                    Loading chat media
                </div>

                <div
                    v-else-if="media.sessionMediaLoadState.value === 'error'"
                    role="alert"
                    class="rounded-md border border-[var(--talos-danger-border)] bg-[var(--talos-danger-soft)] p-4 text-sm text-[var(--talos-danger)]"
                >
                    <p>{{ media.sessionMediaError.value }}</p>
                    <Button
                        data-testid="talos-chat-media-retry"
                        type="button"
                        variant="outline"
                        size="sm"
                        class="mt-3"
                        @click="retry"
                    >
                        <RefreshCw class="h-4 w-4" />
                        Retry
                    </Button>
                </div>

                <div
                    v-else-if="visibleItems.length === 0"
                    class="rounded-md border border-dashed border-[var(--talos-border)] p-6 text-center text-sm text-[var(--talos-muted)]"
                >
                    This chat has no Library media yet.
                </div>

                <ul v-else class="grid gap-2 sm:grid-cols-2" aria-label="Media in this chat">
                    <li
                        v-for="item in visibleItems"
                        :key="item.id"
                        class="min-w-0 rounded-md border border-[var(--talos-border)] bg-[var(--talos-panel-soft)] p-3"
                    >
                        <div class="flex min-w-0 items-start gap-3">
                            <div class="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-[var(--talos-border)] bg-[var(--talos-panel)] text-[var(--talos-accent)]">
                                <Images v-if="item.kind === 'image'" class="h-4 w-4" aria-hidden="true" />
                                <Link2 v-else-if="item.kind === 'link'" class="h-4 w-4" aria-hidden="true" />
                                <FileText v-else class="h-4 w-4" aria-hidden="true" />
                            </div>
                            <div class="min-w-0 flex-1">
                                <p class="truncate text-sm font-semibold">{{ item.title }}</p>
                                <div class="mt-1 flex flex-wrap items-center gap-1">
                                    <Badge tone="neutral">{{ item.origin }}</Badge>
                                    <Badge tone="neutral">{{ item.trustBoundary }}</Badge>
                                </div>
                            </div>
                        </div>

                        <div class="mt-3 flex items-center gap-1">
                            <Button
                                v-if="item.kind === 'image' && item.contentUrl"
                                type="button"
                                variant="ghost"
                                size="sm"
                                :aria-label="`Preview ${item.title}`"
                                @click="preview(item)"
                            >
                                <Eye class="h-4 w-4" />
                                Preview
                            </Button>
                            <a
                                v-if="item.sourceUrl"
                                :href="item.sourceUrl"
                                target="_blank"
                                rel="noopener noreferrer"
                                class="talos-motion-control inline-flex min-h-11 items-center gap-2 rounded-md px-3 text-xs font-medium text-[var(--talos-text)] hover:bg-[var(--talos-panel)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--talos-ring)] lg:min-h-8"
                            >
                                <ExternalLink class="h-4 w-4" />
                                Open source
                            </a>
                        </div>
                    </li>
                </ul>
            </div>

            <div class="flex justify-end border-t border-[var(--talos-border)] pt-3">
                <Button
                    type="button"
                    variant="outline"
                    aria-label="Close chat media"
                    @click="close"
                >
                    Close
                </Button>
            </div>
        </DialogContent>
    </Dialog>

    <TalosMediaLightbox
        v-model:open="lightboxOpen"
        v-model:active-item-id="lightboxItemId"
        :items="imageItems"
    />
</template>
