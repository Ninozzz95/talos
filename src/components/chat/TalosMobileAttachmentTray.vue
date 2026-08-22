<script setup lang="ts">
import { AlertTriangle, FileText, Image, LoaderCircle, X } from '@lucide/vue'
import { Button } from '@/components/ui/button'
import type { TalosMobileAttachmentDraft } from '@/composables/useTalosMobileAttachments'

defineProps<{
    items: readonly TalosMobileAttachmentDraft[]
    busy: boolean
    error: string | null
}>()

const emit = defineEmits<{
    remove: [itemId: string]
    dismissError: []
}>()

function formatBytes(value: number): string {
    if (value < 1024) return `${value} B`
    if (value < 1024 * 1024) return `${Math.round(value / 1024)} KB`
    const megabytes = value / (1024 * 1024)
    return `${Number.isInteger(megabytes) ? megabytes : megabytes.toFixed(1)} MB`
}

function isImage(mediaType: string): boolean {
    return mediaType.startsWith('image/')
}
</script>

<template>
    <section
        v-if="items.length || busy || error"
        class="space-y-2 border-b border-[var(--talos-border)] px-3 py-2"
        :aria-label="$t('chat.messageAttachments')"
        data-testid="talos-mobile-attachment-tray"
    >
        <div
            v-if="error"
            role="alert"
            class="flex items-center gap-2 rounded-md border border-[var(--talos-danger-border,var(--destructive))] bg-[var(--talos-danger-soft,transparent)] px-2 py-1.5 text-xs text-[var(--talos-danger,var(--destructive))]"
        >
            <AlertTriangle class="size-4 shrink-0" aria-hidden="true" />
            <span class="min-w-0 flex-1">{{ error }}</span>
            <Button
                type="button"
                size="icon"
                variant="ghost"
                class="min-h-touch min-w-touch shrink-0"
                :aria-label="$t('chat.dismissAttachmentError')"
                @click="emit('dismissError')"
            >
                <X class="size-4" aria-hidden="true" />
            </Button>
        </div>

        <div class="flex gap-2 overflow-x-auto overscroll-x-contain pb-1" role="list">
            <article
                v-for="item in items"
                :key="item.id"
                :data-attachment-id="item.id"
                :data-attachment-status="item.status"
                role="listitem"
                class="flex min-w-[240px] max-w-[300px] items-center gap-2 rounded-md border border-[var(--talos-border)] bg-[var(--talos-panel)] px-2 py-1.5"
            >
                <LoaderCircle
                    v-if="item.status === 'ingesting'"
                    class="size-4 shrink-0 motion-safe:animate-spin text-[var(--talos-accent)]"
                    aria-hidden="true"
                />
                <Image
                    v-else-if="isImage(item.mediaType)"
                    class="size-4 shrink-0 text-[var(--talos-accent)]"
                    aria-hidden="true"
                />
                <FileText v-else class="size-4 shrink-0 text-[var(--talos-accent)]" aria-hidden="true" />

                <div class="min-w-0 flex-1">
                    <p class="truncate text-xs font-medium text-[var(--talos-text)]">{{ item.displayName }}</p>
                    <p class="truncate text-3xs text-[var(--talos-muted)]">
                        <template v-if="item.status === 'ingesting'">{{ $t('chat.addingFile') }}</template>
                        <template v-else-if="item.status === 'failed'">{{ $t('chat.addFileFailed') }}</template>
                        <template v-else>{{ $t('chat.attachmentCapabilities', { size: formatBytes(item.sizeBytes) }) }}</template>
                    </p>
                    <p v-if="item.error" class="truncate text-3xs text-[var(--talos-danger,var(--destructive))]">
                        {{ item.error }}
                    </p>
                </div>

                <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    class="min-h-touch min-w-touch shrink-0"
                    :aria-label="$t('chat.removeAttachment', { name: item.displayName })"
                    @click="emit('remove', item.id)"
                >
                    <X class="size-4" aria-hidden="true" />
                </Button>
            </article>
        </div>

        <span v-if="busy" role="status" aria-live="polite" class="sr-only">{{ $t('chat.addingFiles') }}</span>
    </section>
</template>
