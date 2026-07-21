<script setup lang="ts">
import { MessageSquare, MessageSquarePlus, BookOpen, Activity, FileArchive, Settings } from '@lucide/vue'
import type { TalosMobileRouteName } from '@/lib/mobileRoutes'

// Mirror of the desktop TalosMobileRail (workspace/TalosMobileRail.vue): a
// horizontally-scrolling icon strip that replaces the bottom-nav. New Chat + a
// Chat-focus action + one icon per station; stations open over the chat base.
defineProps<{ activeRoute: TalosMobileRouteName; creatingSession?: boolean }>()
const emit = defineEmits<{ navigate: [name: TalosMobileRouteName]; newChat: [] }>()

const stations: Array<{ name: TalosMobileRouteName; label: string; icon: unknown }> = [
    { name: 'research', label: 'Research', icon: BookOpen },
    { name: 'runs', label: 'Cockpit', icon: Activity },
    { name: 'context', label: 'Library', icon: FileArchive },
    { name: 'settings', label: 'Settings', icon: Settings },
]
</script>

<template>
    <nav
        data-testid="talos-mobile-rail"
        aria-label="TALOS workspace rail"
        class="talos-mobile-rail relative z-10 border-b border-[var(--talos-border)] bg-[var(--talos-sidebar)]/82"
    >
        <span class="pointer-events-none absolute inset-y-0 left-0 z-10 w-5 bg-gradient-to-r from-[var(--talos-sidebar)] to-transparent" aria-hidden="true"></span>
        <div class="flex gap-2 overflow-x-auto px-3 py-2 pt-[max(0.5rem,env(safe-area-inset-top))]">
            <button
                type="button"
                class="inline-flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-md bg-[var(--talos-accent)] text-[var(--talos-accent-text)] disabled:opacity-60"
                :disabled="creatingSession"
                aria-label="New Chat"
                title="New Chat"
                @click="emit('newChat')"
            >
                <MessageSquarePlus class="h-4 w-4" aria-hidden="true" />
            </button>
            <button
                type="button"
                class="inline-flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-md"
                :class="activeRoute === 'chat' ? 'text-[var(--talos-accent)]' : 'text-[var(--talos-muted)]'"
                :aria-pressed="activeRoute === 'chat'"
                aria-label="Chat"
                title="Chat"
                @click="emit('navigate', 'chat')"
            >
                <MessageSquare class="h-4 w-4" aria-hidden="true" />
            </button>
            <button
                v-for="station in stations"
                :key="station.name"
                type="button"
                data-mobile-rail-item
                class="inline-flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-md"
                :class="activeRoute === station.name ? 'text-[var(--talos-accent)]' : 'text-[var(--talos-muted)]'"
                :aria-pressed="activeRoute === station.name"
                :aria-label="station.label"
                :title="station.label"
                @click="emit('navigate', station.name)"
            >
                <component :is="station.icon" class="h-4 w-4" aria-hidden="true" />
            </button>
        </div>
        <span class="pointer-events-none absolute inset-y-0 right-0 z-10 w-5 bg-gradient-to-l from-[var(--talos-sidebar)] to-transparent" aria-hidden="true"></span>
    </nav>
</template>
