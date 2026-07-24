<script setup lang="ts">
import { defineAsyncComponent } from 'vue'
import { Copy, RefreshCcw, RotateCcw, Square, Volume2 } from '@lucide/vue'
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
}>()

// Owner 2026-07-24: speak the assistant reply aloud (device TTS). One at a
// time; the button toggles to Stop while this message is speaking.
const speech = useTalosSpeech()
function toggleSpeak(): void {
    void speech.toggle(props.message.id, props.message.content)
}
</script>

<template>
    <div class="flex min-h-11 items-center gap-0.5" aria-label="Message actions">
        <Button type="button" variant="ghost" size="icon" class="min-h-11 min-w-11" aria-label="Copy message" title="Copy message" @click="emit('copy', message)">
            <Copy class="size-3.5" aria-hidden="true" />
        </Button>
        <Button v-if="message.role === 'user'" type="button" variant="ghost" size="icon" class="min-h-11 min-w-11" aria-label="Resend message" title="Resend message" :disabled="busy" @click="emit('resend', message)">
            <RefreshCcw class="size-3.5" aria-hidden="true" />
        </Button>
        <Button
            v-if="message.role === 'assistant' && speech.supported"
            type="button"
            variant="ghost"
            size="icon"
            class="min-h-11 min-w-11"
            :aria-label="speech.speakingId.value === message.id ? 'Stop speaking' : 'Speak message'"
            :title="speech.speakingId.value === message.id ? 'Stop' : 'Speak'"
            :aria-pressed="speech.speakingId.value === message.id"
            @click="toggleSpeak"
        >
            <Square v-if="speech.speakingId.value === message.id" class="size-3.5" fill="currentColor" aria-hidden="true" />
            <Volume2 v-else class="size-3.5" aria-hidden="true" />
        </Button>
        <Button v-if="message.role === 'assistant'" type="button" variant="ghost" size="icon" class="min-h-11 min-w-11" aria-label="Retry assistant response" title="Retry response" :disabled="busy || !canRetry" @click="emit('retry', message)">
            <RotateCcw class="size-3.5" aria-hidden="true" />
        </Button>
        <TalosMobileMessageOverflowMenu v-if="message.role === 'user'" :message="message" @reuse="emit('reuse', $event)" />
    </div>
</template>
