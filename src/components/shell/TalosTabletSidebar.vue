<script setup lang="ts">
import { computed, defineAsyncComponent } from 'vue'
import { useTalosI18n } from '@/i18n'
import { ChevronLeft, ChevronRight, Menu } from '@lucide/vue'
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
// F6 sidebar refactor (24/8): stesso ragionamento — tablet-only E Harness-only
// (dietro il cancello debug-only), l'ultimo dei tre da pagare.
const HarnessScreen = defineAsyncComponent(() => import('@/screens/HarnessScreen.vue'))
const TalosMobileNotificationBell = defineAsyncComponent(
    () => import('@/components/shell/TalosMobileNotificationBell.vue'),
)
const TalosMobileDownloadCenterTrigger = defineAsyncComponent(
    () => import('@/components/shell/TalosMobileDownloadCenterTrigger.vue'),
)

/**
 * F6 — persistent tablet rail (Claude split-view pattern, owner's screenshot).
 * Brand header (hamburger + wordmark + notifications) stays fixed; the BODY
 * is now contestuale — owner 24/8, dopo un giro tecnico sull'app Claude vera:
 * un solo slot di sidebar, mai due affiancate, il cui contenuto cambia con la
 * stazione attiva (in Claude: Chat ↔ "Codice" mostra Dispositivi/sessioni
 * reali nello STESSO pannello, mai accanto). `variant` arriva da App.vue
 * (talosMobileStationOf(activeRoute) — la stessa funzione che decide già
 * tabletChatRailVisible/isStation), non da una lettura di rotta locale: la
 * domanda "che stazione è questa" ha già UNA risposta nel codice, e va
 * fatta lì, non duplicata qui. The width is driven by the shell (drag
 * divider + persisted setting).
 */
const props = withDefaults(defineProps<{
    width: number
    variant?: 'chat' | 'harness'
    collapsed?: boolean
}>(), {
    variant: 'chat',
    collapsed: false,
})

const emit = defineEmits<{
    activated: []
    openMenu: []
    toggleCollapsed: []
}>()

const { t } = useTalosI18n()
// L'etichetta d'accessibilità deve dire cosa c'è DAVVERO nel pannello — un
// lettore di schermo che annuncia "pannello chat" su un elenco di sessioni di
// coding sarebbe lo stesso difetto (dichiarare il contrario di ciò che si
// vede) già trovato e corretto altrove in questa sessione, qui sull'etichetta
// invece che sullo screenshot.
const panelLabel = computed(() => (
    props.variant === 'harness' ? t('accessibility.harnessPanel') : t('accessibility.chatsPanel')
))
const harnessCollapsed = computed(() => props.variant === 'harness' && props.collapsed)
</script>

<template>
    <!-- SF6-F6: honor a left cutout/notch in landscape via safe-area-left. -->
    <aside
        data-testid="talos-tablet-sidebar"
        :data-talos-tablet-sidebar-variant="variant"
        :data-talos-tablet-sidebar-collapsed="String(harnessCollapsed)"
        :aria-label="panelLabel"
        class="relative z-20 flex min-h-0 shrink-0 flex-col border-r border-transparent bg-[var(--talos-sidebar)]/60 pl-[env(safe-area-inset-left)] backdrop-blur-sm"
        :style="{ width: `${width}px` }"
    >
        <div
            class="flex items-center pb-1 pt-[max(0.75rem,env(safe-area-inset-top))]"
            :class="harnessCollapsed ? 'flex-col gap-1 px-2' : 'gap-2 px-4'"
        >
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
            <Button
                v-if="variant === 'harness'"
                type="button"
                size="icon-lg"
                variant="ghost"
                data-testid="talos-tablet-harness-toggle"
                class="min-h-touch min-w-touch"
                :aria-label="$t(harnessCollapsed ? 'accessibility.expandHarnessSessions' : 'accessibility.collapseHarnessSessions')"
                :aria-expanded="String(!harnessCollapsed)"
                @click="emit('toggleCollapsed')"
            >
                <ChevronRight v-if="harnessCollapsed" aria-hidden="true" />
                <ChevronLeft v-else aria-hidden="true" />
            </Button>
            <span v-if="!harnessCollapsed" class="talos-orbitron-brand text-sm tracking-[0.2em] text-[var(--talos-text)]">TALOS</span>
            <div v-if="!harnessCollapsed" class="ml-auto"><TalosMobileNotificationBell />
            <TalosMobileDownloadCenterTrigger /></div>
        </div>
        <HarnessScreen v-if="variant === 'harness' && !harnessCollapsed" embedded class="min-h-0 flex-1" />
        <ChatsScreen v-else-if="variant === 'chat'" embedded class="min-h-0 flex-1" @activated="emit('activated')" />
    </aside>
</template>
