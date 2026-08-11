<script setup lang="ts">
import { defineAsyncComponent } from 'vue'
import { Copy, Library, RefreshCcw, RotateCcw, Square, Volume2 } from '@lucide/vue'
import { Button } from '@/components/ui/button'
import type { TalosMobileMessageView } from '@/components/chat/mobileChatTypes'
import { useTalosSpeech } from '@/composables/useTalosSpeech'

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

const speech = useTalosSpeech()
function toggleSpeak(): void {
    void speech.toggle(props.message.id, props.message.content)
}

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
            ⛔ IL COMANDO DELLA LETTURA STA QUI, accanto a «copia», SEMPRE.

            Owner 2026-08-10: «l'icona sound deve stare accanto alle altre come
            quella copia eccetera a prescindere». L'avevo spostato all'inizio
            della risposta e tolto da qui: sbagliato due volte — un comando che
            si sposta si perde, e sopra il testo ci va un SEGNALINO, che si
            guarda e non si preme.

            ⛔ Quel segnalino NON è più su questa risposta: l'11 agosto l'owner
            ha visto che era il MICROFONO, cioè il simbolo di chi ascolta messo
            addosso a TALOS che parla. Adesso sta sul messaggio DETTATO dalla
            persona (`talos-message-dictated`), e qui non c'è più niente: il
            pulsante dell'audio diventa già «Interrompi» mentre legge, e un
            secondo segno per lo stesso stato è rumore.

            ⛔ E niente `speech.supported` nel `v-if`: su Android quella
            condizione e' SEMPRE falsa (la WebView non ha `speechSynthesis`,
            misurato), e l'icona non compariva su nessun messaggio.
        -->
        <Button
            v-if="message.role === 'assistant'"
            type="button"
            variant="ghost"
            size="icon"
            class="min-h-touch min-w-touch"
            :aria-label="speech.speakingId.value === message.id ? $t('chat.stopSpeaking') : $t('chat.speakMessage')"
            :title="speech.speakingId.value === message.id ? $t('common.stop') : $t('chat.speak')"
            :aria-pressed="speech.speakingId.value === message.id"
            @click="toggleSpeak"
        >
            <Square v-if="speech.speakingId.value === message.id" class="size-3.5" fill="currentColor" aria-hidden="true" />
            <Volume2 v-else class="size-3.5" aria-hidden="true" />
        </Button>
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
