<script setup lang="ts">
import { Copy, Pencil, RefreshCcw, RotateCcw } from '@lucide/vue'
import Button from '../../ui/Button.vue'
import type { TalosMessage } from '../../../lib/talosTypes'

const props = withDefaults(defineProps<{
    message: TalosMessage
    canRetry?: boolean
    busy?: boolean
}>(), {
    canRetry: false,
    busy: false,
})

const emit = defineEmits<{
    copy: [message: TalosMessage]
    edit: [message: TalosMessage]
    resend: [message: TalosMessage]
    retry: [message: TalosMessage]
}>()
</script>

<template>
    <div class="flex flex-wrap gap-1.5" aria-label="Message actions">
        <Button type="button" variant="ghost" size="sm" aria-label="Copy message" @click="emit('copy', message)">
            <Copy class="h-3.5 w-3.5" />
            Copy
        </Button>
        <Button
            v-if="message.role === 'user'"
            type="button"
            variant="ghost"
            size="sm"
            aria-label="Reuse prompt"
            @click="emit('edit', message)"
        >
            <Pencil class="h-3.5 w-3.5" />
            Reuse
        </Button>
        <Button
            v-if="message.role === 'user'"
            type="button"
            variant="ghost"
            size="sm"
            aria-label="Resend message"
            :disabled="busy"
            @click="emit('resend', message)"
        >
            <RefreshCcw class="h-3.5 w-3.5" />
            Resend
        </Button>
        <Button
            v-if="message.role === 'assistant'"
            type="button"
            variant="ghost"
            size="sm"
            aria-label="Retry assistant response"
            :disabled="busy || !props.canRetry"
            @click="emit('retry', message)"
        >
            <RotateCcw class="h-3.5 w-3.5" />
            Retry
        </Button>
    </div>
</template>
