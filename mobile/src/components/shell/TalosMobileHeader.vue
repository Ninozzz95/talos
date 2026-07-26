<script setup lang="ts">
import { Menu } from '@lucide/vue'
import { Button } from '@/components/ui/button'
import TalosMobileChatOptionsMenu from '@/components/shell/TalosMobileChatOptionsMenu.vue'

// F1-T3 (D5): app-level header — hamburger opens the full-width sidebar,
// centered session title. RIGHT = the 3-dot chat options (owner 2026-07-24:
// "i 3 puntini anche nell'header versione non immersive") — the SAME menu the
// immersive chrome uses, so both shells behave identically.
defineProps<{
    title: string
    creatingSession: boolean
    /** F6 — tablet split view: the panel owns the hamburger, hide ours. */
    hideMenu?: boolean
    /** False before a chat exists; the title then opens nothing, so it is inert. */
    canOpenMedia?: boolean
}>()

const emit = defineEmits<{
    openMenu: []
    newChat: []
    rename: [title: string]
    delete: []
    export: []
    /** Owner 2026-07-26: this chat's media gallery. */
    media: []
}>()
</script>

<template>
    <!-- F3-T1 owner: 56px was still too short on device — 96px breathes. -->
    <!-- Owner 2026-07-24: a SOFT fade under the header, not a hard border (like
         Claude). A very-low downward shadow dissolves into the content. -->
    <header
        data-testid="talos-mobile-header"
        class="relative z-10 flex h-[calc(3.75rem+env(safe-area-inset-top))] shrink-0 items-center gap-2 bg-[var(--talos-header)]/92 px-3 pt-[env(safe-area-inset-top)] shadow-[0_8px_16px_-14px_rgba(0,0,0,0.55)] backdrop-blur"
    >
        <Button
            v-if="!hideMenu"
            type="button"
            size="icon-lg"
            class="min-h-11 min-w-11"
            variant="ghost"
            aria-label="Open menu"
            @click="emit('openMenu')"
        >
            <Menu aria-hidden="true" />
        </Button>
        <span v-else class="min-w-11" aria-hidden="true" />

        <!-- Owner 2026-07-26: the title opens this chat's media, the way a
             messaging app opens chat info. It is a button now, not a <p>: an
             invisible tap target on a paragraph is not an affordance, and the
             same action lives in the ⋮ menu for anyone who never tries it. -->
        <div class="min-w-0 flex-1 text-center">
            <button
                v-if="canOpenMedia"
                type="button"
                data-testid="talos-mobile-header-title"
                aria-haspopup="dialog"
                :aria-label="`Media in ${title.trim() || 'this chat'}`"
                class="talos-pressable talos-title min-h-11 max-w-full truncate rounded-lg px-2 text-md font-semibold leading-tight text-[var(--talos-text)]"
                @click="emit('media')"
            >
                {{ title.trim() || 'New chat' }}
            </button>
            <p
                v-else
                data-testid="talos-mobile-header-title"
                class="talos-title truncate text-md font-semibold leading-tight text-[var(--talos-text)]"
            >{{ title.trim() || 'New chat' }}</p>
        </div>

        <!-- 3-dot chat options (shared with the immersive chrome). New chat
             lives inside it, so the tablet-panel case just hides the whole
             menu (the panel owns those actions). -->
        <TalosMobileChatOptionsMenu
            v-if="!hideMenu"
            :active-title="title"
            :busy="creatingSession"
            @new-chat="emit('newChat')"
            @rename="emit('rename', $event)"
            @delete="emit('delete')"
            :can-open-media="canOpenMedia"
            @export="emit('export')"
            @media="emit('media')"
        />
        <span v-else class="min-w-11" aria-hidden="true" />
    </header>
</template>
