<script setup lang="ts">
import {
    ExternalLink,
    Eye,
    FileText,
    Image,
    Link2,
    MessageSquarePlus,
    Trash2,
} from '@lucide/vue'
import Badge from '../../ui/Badge.vue'
import Button from '../../ui/Button.vue'
import Tooltip from '../../ui/Tooltip.vue'
import type { TalosLibraryItem } from '../../../lib/talosLibrary'
import type { TalosLibraryViewMode } from '../../../composables/useTalosLibrary'

const props = defineProps<{
    item: TalosLibraryItem
    selected: boolean
    viewMode: TalosLibraryViewMode
}>()

const emit = defineEmits<{
    toggleSelected: [item: TalosLibraryItem]
    preview: [item: TalosLibraryItem]
    attach: [item: TalosLibraryItem]
    requestRemove: [item: TalosLibraryItem]
}>()

const originLabels = {
    uploaded: 'Uploaded',
    generated: 'Generated',
    browser: 'Browser',
    search: 'Search',
} as const

function formatDate(value: string): string {
    return new Intl.DateTimeFormat([], {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
    }).format(new Date(value))
}

function formatBytes(value: number | null): string | null {
    if (value === null) return null
    if (value < 1024) return `${value} B`
    if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`
    return `${(value / (1024 * 1024)).toFixed(1)} MB`
}
</script>

<template>
    <article
        :data-library-view="viewMode"
        :data-library-item-id="item.id"
        class="group min-w-0 border border-[var(--talos-border)] bg-[var(--talos-panel-soft)] p-3 text-[var(--talos-text)] transition-colors hover:border-[var(--talos-border-strong)]"
        :class="[
            viewMode === 'grid' ? 'rounded-md' : 'flex items-start gap-3 border-x-0 border-t-0',
            selected ? 'ring-2 ring-[var(--talos-ring)]' : '',
        ]"
    >
        <label class="flex h-11 w-11 shrink-0 cursor-pointer items-center justify-center">
            <span class="sr-only">Select {{ item.title }}</span>
            <input
                type="checkbox"
                :aria-label="`Select ${item.title}`"
                :checked="selected"
                class="h-4 w-4 rounded border-[var(--talos-border-strong)] accent-[var(--talos-accent)]"
                @change="emit('toggleSelected', item)"
            >
        </label>

        <div class="min-w-0 flex-1">
            <div class="flex items-start gap-3">
                <div class="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-[var(--talos-border)] bg-[var(--talos-panel)] text-[var(--talos-accent)]">
                    <Image v-if="item.kind === 'image'" class="h-4 w-4" />
                    <Link2 v-else-if="item.kind === 'link'" class="h-4 w-4" />
                    <FileText v-else class="h-4 w-4" />
                </div>
                <div class="min-w-0 flex-1">
                    <h3 class="truncate text-sm font-semibold">{{ item.title }}</h3>
                    <p class="mt-1 truncate text-xs text-[var(--talos-muted)]">
                        {{ formatDate(item.occurredAt) }}
                        <template v-if="formatBytes(item.byteSize)"> · {{ formatBytes(item.byteSize) }}</template>
                    </p>
                </div>
            </div>

            <div class="mt-3 flex flex-wrap items-center gap-1.5">
                <Badge tone="neutral">{{ originLabels[item.origin] }}</Badge>
                <Badge tone="neutral">{{ item.kind }}</Badge>
                <Badge tone="neutral">{{ item.trustBoundary }}</Badge>
                <span class="text-xs text-[var(--talos-muted)]">
                    {{ item.chatCount }} {{ item.chatCount === 1 ? 'chat' : 'chats' }}
                </span>
            </div>

            <div class="mt-3 flex flex-wrap items-center gap-1">
                <Tooltip v-if="item.kind === 'image' && item.contentUrl" :content="`Preview ${item.title}`">
                    <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        :aria-label="`Preview ${item.title}`"
                        @click="emit('preview', item)"
                    >
                        <Eye class="h-4 w-4" />
                    </Button>
                </Tooltip>
                <Tooltip v-if="item.canAttach" :content="`Use ${item.title} in chat`">
                    <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        :aria-label="`Use ${item.title} in chat`"
                        @click="emit('attach', item)"
                    >
                        <MessageSquarePlus class="h-4 w-4" />
                    </Button>
                </Tooltip>
                <Tooltip v-if="item.sourceUrl" content="Open original source">
                    <a
                        :href="item.sourceUrl"
                        target="_blank"
                        rel="noopener noreferrer"
                        :aria-label="`Open source for ${item.title}`"
                        class="talos-motion-control inline-flex h-11 w-11 items-center justify-center rounded-md border border-transparent text-[var(--talos-muted)] hover:bg-[var(--talos-panel)] hover:text-[var(--talos-text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--talos-ring)] lg:h-9 lg:w-9"
                    >
                        <ExternalLink class="h-4 w-4" />
                    </a>
                </Tooltip>
                <Tooltip :content="`Remove ${item.title} from Library`">
                    <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        :aria-label="`Remove ${item.title} from Library`"
                        @click="emit('requestRemove', item)"
                    >
                        <Trash2 class="h-4 w-4" />
                    </Button>
                </Tooltip>
            </div>
        </div>
    </article>
</template>
