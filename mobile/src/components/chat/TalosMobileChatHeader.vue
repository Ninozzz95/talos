<script setup lang="ts">
import { History, MessageSquarePlus } from '@lucide/vue'
import { Button } from '@/components/ui/button'

const props = defineProps<{
    title: string
    sessionCount: number
    creatingSession: boolean
}>()

const emit = defineEmits<{
    openHistory: []
    newChat: []
}>()
</script>

<template>
    <header
        data-testid="talos-mobile-chat-header"
        class="flex h-12 shrink-0 items-center gap-2 border-b border-[var(--talos-border)] bg-[var(--talos-header)]/92 px-2"
    >
        <Button
            type="button"
            size="icon-lg"
            variant="ghost"
            aria-label="Open chat history"
            :title="`Chat history (${props.sessionCount})`"
            @click="emit('openHistory')"
        >
            <History aria-hidden="true" />
        </Button>

        <div class="min-w-0 flex-1 text-center">
            <p
                data-testid="talos-mobile-chat-title"
                class="truncate text-sm font-semibold text-[var(--talos-text)]"
            >
                {{ props.title.trim() || 'New chat' }}
            </p>
        </div>

        <Button
            type="button"
            size="icon-lg"
            aria-label="New Chat"
            title="New Chat"
            :disabled="props.creatingSession"
            @click="emit('newChat')"
        >
            <MessageSquarePlus aria-hidden="true" />
        </Button>
    </header>
</template>
