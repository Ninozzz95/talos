<script setup lang="ts">
import { defineAsyncComponent } from 'vue'
import { Copy, Library, RefreshCcw, RotateCcw } from '@lucide/vue'
import { Button } from '@/components/ui/button'
import type { TalosMobileMessageView } from '@/components/chat/mobileChatTypes'

const TalosMobileMessageOverflowMenu = defineAsyncComponent(
    () => import('@/components/chat/TalosMobileMessageOverflowMenu.vue'),
)

const props = withDefaults(defineProps<{ message: TalosMobileMessageView; canRetry?: boolean; busy?: boolean }>(), {
    canRetry: false,
    busy: false,
})
const emit = defineEmits<{
    copy: [message: TalosMobileMessageView]
    reuse: [message: TalosMobileMessageView]
    resend: [message: TalosMobileMessageView]
    retry: [message: TalosMobileMessageView]
    saveToLibrary: [message: TalosMobileMessageView]
}>()

// Owner 2026-07-24: speak the assistant reply aloud (device TTS). One at a
// time; the button toggles to Stop while this message is speaking.
</script>

<template>
    <div class="flex min-h-touch items-center gap-0.5" :aria-label="$t('chat.messageActions')">
        <Button type="button" variant="ghost" size="icon" class="min-h-touch min-w-touch" :aria-label="$t('chat.copyMessage')" :title="$t('chat.copyMessage')" @click="emit('copy', message)">
            <Copy class="size-3.5" aria-hidden="true" />
        </Button>
        <Button v-if="message.role === 'user'" type="button" variant="ghost" size="icon" class="min-h-touch min-w-touch" :aria-label="$t('chat.resendMessage')" :title="$t('chat.resendMessage')" :disabled="busy" @click="emit('resend', message)">
            <RefreshCcw class="size-3.5" aria-hidden="true" />
        </Button>
        <!--
            ⛔ LA LETTURA NON STA PIU' QUI: e' passata all'INIZIO della risposta
            (`talos-message-speak` in TalosMobileMessageList).

            Owner 2026-08-10: «invece del chip badge lettura ad alta voce,
            semplicemente un'icona all'inizio della risposta». La ragione d'uso
            regge da sola: si decide di ascoltare PRIMA di leggere. Un comando in
            fondo si trova quando la risposta e' gia' stata letta con gli occhi,
            cioe' quando non serve piu'.

            ⛔ E qui non ne resta una copia: due comandi per la stessa cosa sono
            due stati da tenere allineati, e prima o poi ne resta uno acceso.
        -->
        <Button v-if="message.role === 'assistant'" type="button" variant="ghost" size="icon" class="min-h-touch min-w-touch" :aria-label="$t('chat.retryAssistant')" :title="$t('chat.retryResponse')" :disabled="busy || !canRetry" @click="emit('retry', message)">
            <RotateCcw class="size-3.5" aria-hidden="true" />
        </Button>
        <!-- Owner 2026-07-25: the chat can't hand out download links; instead save
             the generated reply straight into the Library (origin='generated'). -->
        <Button v-if="message.role === 'assistant'" type="button" variant="ghost" size="icon" class="min-h-touch min-w-touch" :aria-label="$t('chat.saveToLibrary')" :title="$t('chat.saveToLibrary')" @click="emit('saveToLibrary', message)">
            <Library class="size-3.5" aria-hidden="true" />
        </Button>
        <TalosMobileMessageOverflowMenu v-if="message.role === 'user'" :message="message" @reuse="emit('reuse', $event)" />
    </div>
</template>
