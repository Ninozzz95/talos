<script setup lang="ts">
/**
 * Il chip di un file sotto il messaggio della PERSONA (chat e Codice). PIGRO come la bolla-immagine: arriva col primo messaggio che
 * ha un file, mai nel pezzo d'avvio (tetto di `scripts/verify-initial-chunk.mjs`).
 *
 * ⛔ Owner 26/10/2026: «dalla chat il file ordini dal pad si deve poter aprire se ci clicco sopra, come qualunque altro file sia su
 * mobile che su desktop». Un file che si sa dove sta è un pulsante: nel Codice per percorso (`apriPercorso`, solo dentro la cartella
 * della sessione: la lista lo rimanda alla schermata, che apre l'anteprima della scheda File), nella chat dal vault (il foglio
 * d'anteprima). Gli altri restano etichette: si tirerebbe a indovinare dove sta il file.
 */
import { computed, ref } from 'vue'
import { FileText } from '@lucide/vue'
import type { TalosMobileMessageAttachmentView } from './mobileChatTypes'
import TalosMobileAttachmentPreviewSheet from './TalosMobileAttachmentPreviewSheet.vue'
import { costoDelFileR4 } from '@/lib/harness/r4/costoFileR4'
import { useTalosI18n } from '@/i18n'

const props = defineProps<{
    attachment: TalosMobileMessageAttachmentView
    apriPercorso?: (percorso: string) => string | null
}>()
const emit = defineEmits<{ apriAllegato: [percorso: string] }>()
const { t, locale } = useTalosI18n()
const anteprima = ref(false)

const apertura = computed<{ percorso: string } | { vault: true } | null>(() => {
    const a = props.attachment
    if (a.percorso !== undefined) {
        const percorso = props.apriPercorso?.(a.percorso) ?? null
        return percorso === null ? null : { percorso }
    }
    return a.vault_file_id ? { vault: true } : null
})

function apri(): void {
    const scelta = apertura.value
    if (scelta && 'percorso' in scelta) emit('apriAllegato', scelta.percorso)
    else if (scelta) anteprima.value = true
}

function formatBytes(value: number): string {
    if (value < 1024) return `${value} B`
    if (value < 1024 * 1024) return `${Math.round(value / 1024)} KB`
    const megabytes = value / (1024 * 1024)
    return `${Number.isInteger(megabytes) ? megabytes : megabytes.toFixed(1)} MB`
}
</script>

<template>
    <!-- L'elemento della lista fa da contenitore: un pulsante con role="listitem" non sarebbe più un pulsante. -->
    <span role="listitem" class="inline-flex max-w-full">
        <component
            :is="apertura ? 'button' : 'span'"
            :type="apertura ? 'button' : undefined"
            :aria-label="apertura ? t('chat.openAttachment', { name: attachment.display_name }) : undefined"
            :data-message-attachment-id="attachment.id"
            :title="attachment.percorso ?? attachment.media_type"
            class="inline-flex max-w-full items-center gap-1.5 rounded-md border border-current/25 bg-black/5 px-2 py-1 text-2xs leading-4"
            :class="apertura ? 'talos-pressable min-h-touch' : ''"
            @click="apri"
        >
            <FileText class="size-3.5 shrink-0" aria-hidden="true" />
            <span class="max-w-[180px] truncate">{{ attachment.display_name }}</span>
            <!-- K3-C Allegati A3: un file del Codice su r4 non ha un peso; il costo solo se il testo è partito -->
            <span v-if="attachment.percorso === undefined" class="shrink-0 opacity-75">{{ formatBytes(attachment.size_bytes) }}</span>
            <span v-else-if="attachment.caratteri" class="shrink-0 opacity-75">{{ costoDelFileR4(attachment.caratteri, locale) }}</span>
            <span v-if="attachment.grant_status === 'revoked'" class="shrink-0">{{ t('chat.accessRevoked') }}</span>
        </component>
        <TalosMobileAttachmentPreviewSheet v-if="anteprima" :attachment="attachment" @close="anteprima = false" />
    </span>
</template>
