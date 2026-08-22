<script setup lang="ts">
import { defineAsyncComponent } from 'vue'
import { Menu } from '@lucide/vue'
import { Button } from '@/components/ui/button'
/*
 * L'elenco delle chat arriva quando la barra si mostra, non all'avvio.
 *
 * MISURATO 2026-08-04: importato staticamente qui finiva nel grafo d'avvio con
 * **16.416 byte** — e la barra laterale esiste solo sul tablet, dove compare
 * comunque dopo il montaggio. Su un telefono quei byte si pagavano senza che
 * nessuno li vedesse mai.
 */
const ChatsScreen = defineAsyncComponent(() => import('@/screens/ChatsScreen.vue'))
const TalosMobileNotificationBell = defineAsyncComponent(
    () => import('@/components/shell/TalosMobileNotificationBell.vue'),
)
const TalosMobileDownloadCenterTrigger = defineAsyncComponent(
    () => import('@/components/shell/TalosMobileDownloadCenterTrigger.vue'),
)

/**
 * F6 — persistent tablet chat panel (Claude split-view pattern, owner's
 * screenshot): the full ChatsScreen (search + New chat + ordered list with the
 * hold dropdown + archived section) embedded as the left rail, with the brand
 * header and the hamburger for tools/settings. The width is driven by the
 * shell (drag divider + persisted setting).
 */
defineProps<{ width: number }>()

const emit = defineEmits<{
    activated: []
    openMenu: []
}>()
</script>

<template>
    <!-- SF6-F6: honor a left cutout/notch in landscape via safe-area-left. -->
    <aside
        data-testid="talos-tablet-sidebar"
        :aria-label="$t('accessibility.chatsPanel')"
        class="relative z-20 flex min-h-0 shrink-0 flex-col border-r border-transparent bg-[var(--talos-sidebar)]/60 pl-[env(safe-area-inset-left)] backdrop-blur-sm"
        :style="{ width: `${width}px` }"
    >
        <div class="flex items-center gap-2 px-4 pb-1 pt-[max(0.75rem,env(safe-area-inset-top))]">
            <Button
                type="button"
                size="icon-lg"
                variant="ghost"
                data-testid="talos-tablet-menu"
                class="min-h-touch min-w-touch"
                :aria-label="$t('navigation.openMenu')"
                @click="emit('openMenu')"
            >
                <Menu aria-hidden="true" />
            </Button>
            <span class="talos-orbitron-brand text-sm tracking-[0.2em] text-[var(--talos-text)]">TALOS</span>
            <div class="ml-auto"><TalosMobileNotificationBell />
            <TalosMobileDownloadCenterTrigger /></div>
        </div>
        <ChatsScreen embedded class="min-h-0 flex-1" @activated="emit('activated')" />
    </aside>
</template>
