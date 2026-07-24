<script setup lang="ts">
import { Menu } from '@lucide/vue'
import { Button } from '@/components/ui/button'
import TalosMobileChatOptionsMenu from '@/components/shell/TalosMobileChatOptionsMenu.vue'

// F2-T3.6 (owner, ChatGPT-style): immersive shell chrome — no solid header bar;
// floating circular pills over a light top fade for scroll continuity. LEFT =
// hamburger (sidebar). RIGHT = 3-dot chat options (New / Rename / Export /
// Delete) — shared with the classic header via TalosMobileChatOptionsMenu.
defineProps<{
    activeTitle: string
    busy: boolean
    /** F6 — tablet split view: the panel owns the hamburger, hide ours. */
    hideMenu?: boolean
}>()

const emit = defineEmits<{
    openMenu: []
    newChat: []
    rename: [title: string]
    delete: []
    export: []
}>()
</script>

<template>
    <div data-testid="talos-mobile-immersive-chrome" class="pointer-events-none absolute inset-x-0 top-0 z-20">
        <!-- light fade for scroll continuity under the floating pills -->
        <div
            aria-hidden="true"
            class="absolute inset-x-0 top-0 h-[calc(4rem+env(safe-area-inset-top))] bg-gradient-to-b from-[var(--talos-background)] via-[var(--talos-background)]/70 to-transparent"
        />
        <div class="relative flex items-start justify-between px-3 pt-[max(0.5rem,env(safe-area-inset-top))]">
            <Button
                v-if="!hideMenu"
                type="button"
                size="icon-lg"
                variant="ghost"
                aria-label="Open menu"
                class="talos-pressable pointer-events-auto min-h-11 min-w-11 rounded-full border border-[var(--talos-border)]/60 bg-[var(--talos-card)]/85 backdrop-blur"
                @click="emit('openMenu')"
            >
                <Menu aria-hidden="true" />
            </Button>
            <span v-else aria-hidden="true" />

            <TalosMobileChatOptionsMenu
                :active-title="activeTitle"
                :busy="busy"
                pill
                @new-chat="emit('newChat')"
                @rename="emit('rename', $event)"
                @delete="emit('delete')"
                @export="emit('export')"
            />
        </div>
    </div>
</template>
