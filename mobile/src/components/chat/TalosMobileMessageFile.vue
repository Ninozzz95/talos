<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { ChevronRight, FileText } from '@lucide/vue'
import DOMPurify from 'dompurify'
import type { TalosMobileMessageAttachmentView } from './mobileChatTypes'
import TalosMobileMessageContent from './TalosMobileMessageContent.vue'
import TalosMobileComposerSheet from './TalosMobileComposerSheet.vue'
import { useChatController } from '@/stores/chatController'

const props = defineProps<{ attachment: TalosMobileMessageAttachmentView }>()
const controller = useChatController()
const text = ref<string | null>(null)
const html = ref<string | null>(null)
const loading = ref(true)
const opened = ref(false)
const format = computed(() => props.attachment.display_name.split('.').at(-1)?.toUpperCase() || props.attachment.media_type)
const size = computed(() => props.attachment.size_bytes < 1024 ? `${props.attachment.size_bytes} B`
    : props.attachment.size_bytes < 1048576 ? `${Math.round(props.attachment.size_bytes / 1024)} KB`
    : `${Number((props.attachment.size_bytes / 1048576).toFixed(1))} MB`)
let revision = 0
watch(() => props.attachment.vault_file_id, async (id) => {
    const current = ++revision
    text.value = null
    html.value = null
    loading.value = true
    opened.value = false
    try {
        if (props.attachment.media_type === 'text/html') {
            const bytes = await controller.attachments.previewBytes(id)
            if (current !== revision || !bytes) return
            // Anteprima locale: niente script, risorse remote o navigazione nel documento prodotto.
            const safe = DOMPurify.sanitize(new TextDecoder().decode(bytes), {
                FORBID_TAGS: ['script', 'iframe', 'object', 'embed', 'form', 'meta', 'link', 'base'],
                FORBID_ATTR: ['href', 'src', 'srcset', 'action', 'formaction', 'poster', 'xlink:href'],
            })
            html.value = `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'">${safe}`
        } else {
            const value = await controller.attachments.hydrateText(id)
            if (current === revision) text.value = value
        }
    } catch {
        // Il titolo e l'accesso all'anteprima restano; l'errore viene dichiarato nel foglio.
    } finally {
        if (current === revision) loading.value = false
    }
}, { immediate: true })
onBeforeUnmount(() => { revision += 1 })
</script>

<template>
    <div role="listitem" class="w-full min-w-0" data-testid="talos-message-file">
        <button type="button" class="chat-attachment rich-attachment" data-testid="talos-message-file-open"
            :title="attachment.media_type" :aria-label="`${$t('chat.openAttachmentPreview')} · ${attachment.display_name}`" @click="opened = true">
            <span class="attachment-art" aria-hidden="true" data-testid="talos-message-file-art">
                <iframe v-if="html" :srcdoc="html" sandbox="" tabindex="-1" title="" class="pointer-events-none h-full w-full" />
                <span v-else-if="text" class="attachment-excerpt">{{ text.slice(0, 420) }}</span>
                <FileText v-else class="size-10" />
            </span>
            <span class="min-w-0 flex-1">
                <strong class="block break-words">{{ attachment.display_name }}</strong>
                <small class="block text-[var(--talos-muted)]">{{ $t('chat.openAttachmentPreview') }} · {{ format }} · {{ size }}</small>
                <small v-if="attachment.grant_status === 'revoked'" class="block">{{ $t('chat.accessRevoked') }}</small>
            </span>
            <ChevronRight class="size-4 shrink-0" aria-hidden="true" />
        </button>
        <TalosMobileComposerSheet v-if="opened" :title="attachment.display_name" testid="talos-message-file-preview" @close="opened = false">
            <p v-if="loading" role="status">{{ $t('library.opening') }}</p>
            <iframe v-else-if="html" :srcdoc="html" sandbox="" :title="attachment.display_name" data-testid="talos-message-file-html" class="h-[60dvh] w-full rounded-lg bg-white" />
            <TalosMobileMessageContent v-else-if="text !== null && attachment.media_type === 'text/markdown'" :content="text" />
            <pre v-else-if="text !== null" data-testid="talos-message-file-text" class="whitespace-pre-wrap break-words text-xs leading-6">{{ text }}</pre>
            <p v-else role="status" data-testid="talos-message-file-unavailable">{{ $t('chat.attachmentPreviewUnavailable') }}</p>
        </TalosMobileComposerSheet>
    </div>
</template>

<style scoped>
.rich-attachment { display: flex; width: 100%; align-items: center; gap: var(--talos-space-card); padding: var(--talos-space-card); text-align: left; border: 1px solid var(--talos-border); border-radius: var(--talos-radius-card); background: var(--talos-panel); font-size: var(--text-xs); }
.attachment-art { display: grid; place-items: center; flex: none; width: 6.5rem; height: 5.5rem; overflow: hidden; border-radius: var(--talos-radius-control); background: var(--talos-secondary); color: var(--talos-muted); }
.attachment-excerpt { height: 100%; padding: .6rem; /* nella scala, mai assoluto (talosFontScale) */ font-size: calc(var(--text-3xs) * 0.85); line-height: 1.5; overflow: hidden; overflow-wrap: anywhere; }
@media (max-width: 360px) { .attachment-art { width: 4.5rem; } }
</style>
