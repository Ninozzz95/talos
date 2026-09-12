<script setup lang="ts">
import { EllipsisVertical, Pencil, RefreshCcw } from '@lucide/vue'
import { DropdownMenuContent, DropdownMenuItem, DropdownMenuPortal, DropdownMenuRoot, DropdownMenuTrigger } from 'reka-ui'
import { Button } from '@/components/ui/button'
import type { TalosMobileMessageView } from '@/components/chat/mobileChatTypes'

defineProps<{ message: TalosMobileMessageView; busy?: boolean; canRetry?: boolean }>()
const emit = defineEmits<{
    reuse: [message: TalosMobileMessageView]
    resend: [message: TalosMobileMessageView]
    copy: [message: TalosMobileMessageView]
    retry: [message: TalosMobileMessageView]
    saveToLibrary: [message: TalosMobileMessageView]
}>()
</script>

<template>
    <DropdownMenuRoot :modal="false">
        <DropdownMenuTrigger as-child>
            <Button type="button" variant="ghost" size="icon" data-message-overflow-trigger data-testid="talos-message-overflow" class="min-h-touch min-w-touch" :aria-label="$t('chat.moreMessageActions')" :title="$t('chat.moreMessageActions')">
                <EllipsisVertical class="size-4" aria-hidden="true" />
            </Button>
        </DropdownMenuTrigger>
        <DropdownMenuPortal>
            <DropdownMenuContent align="end" :side-offset="6" :aria-label="$t('chat.moreMessageActions')" class="z-[120] min-w-48 rounded-md border border-[var(--talos-border)] bg-[var(--talos-panel)] p-1 text-[var(--talos-text)] shadow-lg outline-none">
                <DropdownMenuItem v-if="message.role === 'user'" data-testid="talos-message-resend" :disabled="busy" :aria-label="$t('chat.resendMessage')" class="flex min-h-touch items-center gap-2 rounded px-3 text-sm outline-none data-[highlighted]:bg-[var(--talos-panel-soft)] data-[disabled]:opacity-50" @select="emit('resend', message)">
                    <RefreshCcw class="size-4" aria-hidden="true" />{{ $t('chat.resendMessage') }}
                </DropdownMenuItem>
                <DropdownMenuItem v-if="message.role === 'user'" data-testid="talos-message-reuse" :aria-label="$t('chat.reusePrompt')" class="flex min-h-touch cursor-default select-none items-center gap-2 rounded px-3 text-sm outline-none data-[highlighted]:bg-[var(--talos-panel-soft)]" @select="emit('reuse', message)">
                    <Pencil class="size-4" aria-hidden="true" />
                    {{ $t('chat.reusePrompt') }}
                </DropdownMenuItem>
                <template v-if="message.role !== 'user'">
                    <DropdownMenuItem class="min-h-touch rounded px-3 py-2 text-sm outline-none data-[highlighted]:bg-[var(--talos-panel-soft)]" @select="emit('copy', message)">{{ $t('chat.copyMessage') }}</DropdownMenuItem>
                    <DropdownMenuItem :disabled="busy || !canRetry" class="min-h-touch rounded px-3 py-2 text-sm outline-none data-[highlighted]:bg-[var(--talos-panel-soft)] data-[disabled]:opacity-50" @select="emit('retry', message)">{{ $t('chat.retryResponse') }}</DropdownMenuItem>
                    <DropdownMenuItem class="min-h-touch rounded px-3 py-2 text-sm outline-none data-[highlighted]:bg-[var(--talos-panel-soft)]" @select="emit('saveToLibrary', message)">{{ $t('chat.saveToLibrary') }}</DropdownMenuItem>
                </template>
            </DropdownMenuContent>
        </DropdownMenuPortal>
    </DropdownMenuRoot>
</template>
