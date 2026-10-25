<script setup lang="ts">
import { AlertTriangle, CirclePause, FileText, Image, LoaderCircle, X } from '@lucide/vue'
import { Button } from '@/components/ui/button'
import { useTalosI18n } from '@/i18n'
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

/**
 * La riga dei permessi dice quelli VERI della bozza (Pad 16/10, K3-C Allegati A2): le immagini del Codice su r4 le legge il modello
 * e non si caricano da nessuna parte. La chat ha sempre tutti e due, nell'ordine di sempre.
 */
const PERMESSI = [['model.read', 'chat.attachmentModelRead'], ['browser.upload', 'chat.attachmentBrowserUpload']] as const
function capabilities(item: TalosMobileAttachmentDraft, t: (key: string) => string): string {
    return [formatBytes(item.sizeBytes), ...PERMESSI.filter(([p]) => item.permissions.includes(p)).map(([, k]) => t(k))].join(' · ')
}

const { locale } = useTalosI18n()

/** R5.13 F3, mockup approvato il 25/10: «7,4 di 18,2 MB», l'unità una volta sola quando è la stessa; i decimali della lingua. */
function progressParts(sent: number, total: number): { sent: string; total: string } {
    const scale = (v: number): [number, string] => (v < 1024 ? [v, 'B'] : v < 1024 * 1024 ? [Math.round(v / 1024), 'KB'] : [v / (1024 * 1024), 'MB'])
    const number = new Intl.NumberFormat(locale.value, { maximumFractionDigits: 1 })
    const [s, su] = scale(sent)
    const [t, tu] = scale(total)
    return { sent: su === tu ? number.format(s) : `${number.format(s)} ${su}`, total: `${number.format(t)} ${tu}` }
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
                <CirclePause
                    v-if="item.status === 'ingesting' && item.progress?.phase === 'paused'"
                    class="size-4 shrink-0 text-[var(--talos-muted)]"
                    aria-hidden="true"
                />
                <LoaderCircle
                    v-else-if="item.status === 'ingesting'"
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
                    <p :class="[item.progress ? 'line-clamp-2 break-words' : 'truncate', 'text-3xs text-[var(--talos-muted)]']">
                        <template v-if="item.status === 'ingesting' && item.progress">{{ item.progress.phase === 'waiting' ? $t('computer.fileWaiting') : $t(item.progress.phase === 'paused' ? 'chat.pausedSending' : 'chat.sendingToComputer', progressParts(item.progress.sent, item.progress.total)) }}</template>
                        <template v-else-if="item.status === 'ingesting'">{{ $t('chat.addingFile') }}</template>
                        <template v-else-if="item.status === 'failed'">{{ $t('chat.addFileFailed') }}</template>
                        <template v-else>{{ capabilities(item, $t) }}</template>
                    </p>
                    <!-- D-F3-1 (dal Pad, 25/10): il perché si legge intero (due righe), mai tagliato a metà frase -->
                    <p v-if="item.error" class="line-clamp-2 break-words text-3xs text-[var(--talos-danger,var(--destructive))]">
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
