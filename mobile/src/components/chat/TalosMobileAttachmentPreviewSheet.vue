<script setup lang="ts">
/**
 * ⛔ Owner 26/10/2026: «dalla chat il file ordini dal pad si deve poter aprire se ci clicco sopra, come qualunque altro file». L'anteprima
 * di un file che la PERSONA ha allegato: lo stesso foglio e le stesse regole dell'anteprima degli allegati dell'assistente
 * (`TalosMobileMessageFile.vue`: testo, markdown, HTML ripulito e senza script; altrimenti «anteprima non disponibile»). Il testo si
 * legge solo quando la persona apre il foglio, non per ogni chip disegnato.
 *
 * Due fonti: il vault del dispositivo (la chat), oppure `carica` per una sessione del PC (`ponte.anteprimaFile`: `file.list` +
 * `file.read`, in sola lettura). Dal PC un file che non c'è più o che non si può mostrare lo dice, ognuno col suo perché.
 */
import { onBeforeUnmount, onMounted, ref } from 'vue'
import DOMPurify from 'dompurify'
import type { TalosMobileMessageAttachmentView } from './mobileChatTypes'
import TalosMobileMessageContent from './TalosMobileMessageContent.vue'
import TalosMobileComposerSheet from './TalosMobileComposerSheet.vue'
import { useChatController } from '@/stores/chatController'
import type { AnteprimaDalPc } from '@/lib/remoto/fileRemoti'

const props = defineProps<{ attachment: TalosMobileMessageAttachmentView; carica?: () => Promise<AnteprimaDalPc> }>()
const emit = defineEmits<{ close: [] }>()
const controller = props.carica ? null : useChatController()
const text = ref<string | null>(null)
const html = ref<string | null>(null)
const loading = ref(true)
/** Solo dal PC: perché il testo non c'è. */
const dalPc = ref<'assente' | 'non-mostrabile' | null>(null)
let chiuso = false

async function dalVault(): Promise<void> {
    const id = props.attachment.vault_file_id
    if (props.attachment.media_type === 'text/html') {
        const bytes = await controller!.attachments.previewBytes(id)
        if (chiuso || !bytes) return
        const safe = DOMPurify.sanitize(new TextDecoder().decode(bytes), {
            FORBID_TAGS: ['script', 'iframe', 'object', 'embed', 'form', 'meta', 'link', 'base'],
            FORBID_ATTR: ['href', 'src', 'srcset', 'action', 'formaction', 'poster', 'xlink:href'],
        })
        html.value = `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'">${safe}`
    } else {
        const value = await controller!.attachments.hydrateText(id)
        if (!chiuso) text.value = value
    }
}

async function dalComputer(carica: () => Promise<AnteprimaDalPc>): Promise<void> {
    try {
        const esito = await carica()
        if (chiuso) return
        if (esito.esito === 'testo') text.value = esito.testo
        else dalPc.value = esito.esito === 'assente' ? 'assente' : 'non-mostrabile'
    } catch {
        // un guasto del canale (PC spento, rete): non si mostra, e lo si dice
        if (!chiuso) dalPc.value = 'non-mostrabile'
    }
}

onMounted(async () => {
    try {
        await (props.carica ? dalComputer(props.carica) : dalVault())
    } catch {
        // il foglio lo dice: «anteprima non disponibile»
    } finally {
        if (!chiuso) loading.value = false
    }
})
onBeforeUnmount(() => { chiuso = true })
</script>

<template>
    <TalosMobileComposerSheet :title="attachment.display_name" testid="talos-message-attachment-preview" @close="emit('close')">
        <p v-if="loading" role="status">{{ $t('library.opening') }}</p>
        <iframe v-else-if="html" :srcdoc="html" sandbox="" :title="attachment.display_name" data-testid="talos-message-attachment-preview-html" class="h-[60dvh] w-full rounded-lg bg-white" />
        <TalosMobileMessageContent v-else-if="text !== null && attachment.media_type === 'text/markdown'" :content="text" />
        <pre v-else-if="text !== null" data-testid="talos-message-attachment-preview-text" class="whitespace-pre-wrap break-words text-xs leading-6">{{ text }}</pre>
        <p v-else-if="dalPc === 'assente'" role="status" data-testid="talos-message-attachment-preview-gone">{{ $t('chat.remoteFileGone') }}</p>
        <p v-else-if="dalPc" role="status" data-testid="talos-message-attachment-preview-unavailable">{{ $t('chat.remotePreviewUnavailable') }}</p>
        <p v-else role="status" data-testid="talos-message-attachment-preview-unavailable">{{ $t('chat.attachmentPreviewUnavailable') }}</p>
    </TalosMobileComposerSheet>
</template>
