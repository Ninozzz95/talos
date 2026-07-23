<script setup lang="ts">
import { Menu, MessageSquarePlus } from '@lucide/vue'
import { Button } from '@/components/ui/button'

// F1-T3 (D5): app-level header — hamburger opens the full-width sidebar,
// centered session title, New Chat on the right. Replaces the top icon rail
// and the chat-local header in one calm bar.
const props = defineProps<{
    title: string
    creatingSession: boolean
}>()

const emit = defineEmits<{
    openMenu: []
    newChat: []
}>()
</script>

<template>
    <!-- F3-T1 owner: 56px was still too short on device — 96px breathes. -->
    <header
        data-testid="talos-mobile-header"
        class="relative z-10 flex h-[calc(3.75rem+env(safe-area-inset-top))] shrink-0 items-center gap-2 border-b border-[var(--talos-border)] bg-[var(--talos-header)]/92 px-3 pt-[env(safe-area-inset-top)] backdrop-blur"
    >
        <Button
            type="button"
            size="icon-lg"
            class="min-h-11 min-w-11"
            variant="ghost"
            aria-label="Open menu"
            @click="emit('openMenu')"
        >
            <Menu aria-hidden="true" />
        </Button>

        <div class="min-w-0 flex-1 text-center">
            <p
                data-testid="talos-mobile-header-title"
                class="truncate text-base font-semibold leading-tight text-[var(--talos-text)]"
            >
                {{ props.title.trim() || 'New chat' }}
            </p>
        </div>

        <Button
            type="button"
            size="icon-lg"
            class="min-h-11 min-w-11"
            variant="ghost"
            aria-label="New Chat"
            :disabled="props.creatingSession"
            @click="emit('newChat')"
        >
            <MessageSquarePlus aria-hidden="true" />
        </Button>
    </header>
</template>
