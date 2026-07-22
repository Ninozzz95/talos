<script setup lang="ts">
import { defineAsyncComponent } from 'vue'
import { Copy, RefreshCcw, RotateCcw } from '@lucide/vue'
import { Button } from '@/components/ui/button'
import type { TalosMobileMessageView } from '@/components/chat/mobileChatTypes'

const TalosMobileMessageOverflowMenu = defineAsyncComponent(
    () => import('@/components/chat/TalosMobileMessageOverflowMenu.vue'),
)

withDefaults(defineProps<{ message: TalosMobileMessageView; canRetry?: boolean; busy?: boolean }>(), {
    canRetry: false,
    busy: false,
})
const emit = defineEmits<{
    copy: [message: TalosMobileMessageView]
    reuse: [message: TalosMobileMessageView]
    resend: [message: TalosMobileMessageView]
    retry: [message: TalosMobileMessageView]
}>()
</script>

<template>
    <div class="flex min-h-11 items-center gap-0.5" aria-label="Message actions">
        <Button type="button" variant="ghost" size="icon" class="min-h-11 min-w-11" aria-label="Copy message" title="Copy message" @click="emit('copy', message)">
            <Copy class="size-3.5" aria-hidden="true" />
        </Button>
        <Button v-if="message.role === 'user'" type="button" variant="ghost" size="icon" class="min-h-11 min-w-11" aria-label="Resend message" title="Resend message" :disabled="busy" @click="emit('resend', message)">
            <RefreshCcw class="size-3.5" aria-hidden="true" />
        </Button>
        <Button v-if="message.role === 'assistant'" type="button" variant="ghost" size="icon" class="min-h-11 min-w-11" aria-label="Retry assistant response" title="Retry response" :disabled="busy || !canRetry" @click="emit('retry', message)">
            <RotateCcw class="size-3.5" aria-hidden="true" />
        </Button>
        <TalosMobileMessageOverflowMenu v-if="message.role === 'user'" :message="message" @reuse="emit('reuse', $event)" />
    </div>
</template>
