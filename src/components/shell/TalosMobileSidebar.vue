<script setup lang="ts">
import { computed, defineAsyncComponent, nextTick, onBeforeUnmount, onMounted, ref } from 'vue'
import { useTalosI18n } from '@/i18n'
import {
    BookMarked, BookOpen, Check, CheckSquare, FlaskConical, StickyNote, Stethoscope, FileArchive, MessageSquareText,
    Pencil, Trash2, Wrench, X,
} from '@lucide/vue'
import { Button } from '@/components/ui/button'
import TalosMobileConfirmDialog from '@/components/shell/TalosMobileConfirmDialog.vue'
import TalosMobileDeleteChatDialog from '@/components/shell/TalosMobileDeleteChatDialog.vue'
import { type TalosSessionCleanupPlan } from '@/lib/chat/sessionCleanup'
import TalosMobileSpeedDial from '@/components/shell/TalosMobileSpeedDial.vue'
import TalosAccountAvatar from '@/components/talos/TalosAccountAvatar.vue'
import { useTalosAccountStore } from '@/stores/account'
import {
    Drawer, DrawerContent, DrawerDescription, DrawerHeader, DrawerTitle,
} from '@/components/ui/drawer'
import type { TalosLocalChatSession } from '@/repositories/chatRepository'
import type { TalosMobileRouteName } from '@/lib/mobileRoutes'
import { talosHarnessUiAvailable } from '@/services/harnessUi'

const TalosMobileNotificationBell = defineAsyncComponent(
    () => import('@/components/shell/TalosMobileNotificationBell.vue'),
)
const TalosMobileDownloadCenterTrigger = defineAsyncComponent(
    () => import('@/components/shell/TalosMobileDownloadCenterTrigger.vue'),
)

// F1-T3 (D5/D6): the full-width hamburger sidebar — the Claude chat-first
// pattern: [New chat] -> Recents (sessions, rename/delete parity with the
// session drawer it supersedes) -> Tools -> Settings pinned at the bottom.
const props = defineProps<{
    open: boolean
    sessions: readonly TalosLocalChatSession[]
    activeSessionId: string | null
    busy: boolean
    creatingSession: boolean
    /**
     * What a given chat would take from the Library, asked for when the delete
     * confirmation opens. A function rather than a map: the sidebar lists every
     * conversation, and pre-computing a plan for all of them to show one is work
     * nobody asked for.
     */
    cleanupPlanFor?: (sessionId: string) => TalosSessionCleanupPlan
}>()

const emit = defineEmits<{
    'update:open': [open: boolean]
    newChat: []
    select: [sessionId: string]
    rename: [sessionId: string, title: string]
    delete: [sessionId: string, choice: { deleteMedia: boolean }]
    navigate: [route: TalosMobileRouteName]
    openSettings: []
}>()

const account = useTalosAccountStore()
const { t } = useTalosI18n()
// Harness UI (24/8): same gate as HarnessSessionScreen.vue and the removed
// Settings link — evaluated once per mount, same as every other native
// (Capacitor.isPluginAvailable) read in this app.
const harnessAvailable = talosHarnessUiAvailable()

const TOOL_DEFINITIONS: Array<{ key: string; route: TalosMobileRouteName; icon: unknown }> = [
    { key: 'navigation.memory', route: 'memory', icon: BookMarked },
    { key: 'navigation.tasks', route: 'tasks', icon: CheckSquare },
    { key: 'navigation.notes', route: 'notes', icon: StickyNote },
    { key: 'navigation.doctor', route: 'doctor', icon: Stethoscope },
    { key: 'navigation.research', route: 'research', icon: BookOpen },
    { key: 'navigation.library', route: 'context', icon: FileArchive },
]
// Appended, not baked into TOOL_DEFINITIONS: the six above are the F2-RED-20
// parity set (see TalosMobileSidebar.test.ts) and stay untouched. Harness is
// debug-only — invisible in a release build, where `harnessAvailable` is
// false by construction (the native plugin does not compile into release).
const HARNESS_TOOL_DEFINITION: { key: string; route: TalosMobileRouteName; icon: unknown } = {
    key: 'navigation.harness', route: 'harness', icon: FlaskConical,
}
// Tool Forge (27/8): stessa ricetta di Harness sopra — accodata, non dentro
// TOOL_DEFINITIONS, così il test a sei voci di F2-RED-20 resta intatto. A
// differenza di Harness non è debug-only: non c'è un plugin nativo da
// verificare, quindi compare sempre.
const TOOL_FORGE_TOOL_DEFINITION: { key: string; route: TalosMobileRouteName; icon: unknown } = {
    key: 'navigation.toolForge', route: 'toolforge', icon: Wrench,
}
const tools = computed(() => {
    const base = TOOL_DEFINITIONS.map(tool => ({ ...tool, label: t(tool.key) }))
    const withHarness = harnessAvailable ? [...base, { ...HARNESS_TOOL_DEFINITION, label: t(HARNESS_TOOL_DEFINITION.key) }] : base
    return [...withHarness, { ...TOOL_FORGE_TOOL_DEFINITION, label: t(TOOL_FORGE_TOOL_DEFINITION.key) }]
})

const renameTarget = ref<TalosLocalChatSession | null>(null)
const renameValue = ref('')
const renameInput = ref<HTMLInputElement | null>(null)
const deleteTarget = ref<TalosLocalChatSession | null>(null)
const restoreSidebarFocusOnClose = ref(true)
const sidebarSwipeStart = ref<{ x: number; y: number } | null>(null)
const sidebarSwipeClosed = ref(false)
let sidebarSwipeDistance = 0
let sidebarSwipeCloseTimer: ReturnType<typeof setTimeout> | null = null

function sidebarDrawerElement(): HTMLElement | null {
    return document.querySelector<HTMLElement>('[data-testid="talos-mobile-sidebar"]')
}

function setSidebarSwipeTransform(distance: number, animated: boolean): void {
    const drawer = sidebarDrawerElement()
    if (!drawer) return
    drawer.style.transition = animated
        ? 'transform var(--talos-motion-duration-control) var(--talos-motion-ease)'
        : 'none'
    const offset = Math.max(0, distance)
    drawer.style.transform = `translate3d(${offset === 0 ? 0 : -offset}px, 0, 0)`
}

function startSidebarSwipe(clientX: number, clientY: number): void {
    if (sidebarSwipeCloseTimer !== null) clearTimeout(sidebarSwipeCloseTimer)
    sidebarSwipeCloseTimer = null
    sidebarSwipeStart.value = { x: clientX, y: clientY }
    sidebarSwipeClosed.value = false
    sidebarSwipeDistance = 0
    setSidebarSwipeTransform(0, false)
}

function updateSidebarSwipe(clientX: number, clientY: number): void {
    const start = sidebarSwipeStart.value
    if (!start || sidebarSwipeClosed.value) return
    const dx = start.x - clientX
    const dy = Math.abs(start.y - clientY)
    if (dx <= 0 || dx <= dy) return
    const drawer = sidebarDrawerElement()
    const maxDistance = drawer?.getBoundingClientRect().width || window.innerWidth
    sidebarSwipeDistance = Math.min(dx, maxDistance)
    setSidebarSwipeTransform(sidebarSwipeDistance, false)
}

function finishSidebarSwipe(clientX: number, clientY: number): void {
    updateSidebarSwipe(clientX, clientY)
    const shouldClose = sidebarSwipeDistance > 80
    sidebarSwipeStart.value = null
    if (shouldClose) {
        sidebarSwipeClosed.value = true
        emit('update:open', false)
        sidebarSwipeCloseTimer = setTimeout(() => {
            sidebarSwipeCloseTimer = null
            if (props.open) emit('update:open', false)
        }, 180)
        return
    }
    setSidebarSwipeTransform(0, true)
    sidebarSwipeDistance = 0
}

function onSidebarPointerDown(event: PointerEvent): void {
    startSidebarSwipe(event.clientX, event.clientY)
}

function onSidebarPointerUp(event: PointerEvent): void {
    finishSidebarSwipe(event.clientX, event.clientY)
}

function onSidebarPointerMove(event: PointerEvent): void {
    updateSidebarSwipe(event.clientX, event.clientY)
}

function onSidebarTouchStart(event: TouchEvent): void {
    const touch = event.touches[0]
    if (touch) {
        startSidebarSwipe(touch.clientX, touch.clientY)
    }
}

function onSidebarTouchEnd(event: TouchEvent): void {
    const touch = event.changedTouches[0]
    if (touch) finishSidebarSwipe(touch.clientX, touch.clientY)
}

function onSidebarTouchMove(event: TouchEvent): void {
    const touch = event.touches[0]
    if (touch) updateSidebarSwipe(touch.clientX, touch.clientY)
}

function onDocumentPointerDown(event: PointerEvent): void {
    if (props.open) onSidebarPointerDown(event)
}

function onDocumentPointerMove(event: PointerEvent): void {
    if (props.open) onSidebarPointerMove(event)
}

function onDocumentPointerUp(event: PointerEvent): void {
    if (props.open) onSidebarPointerUp(event)
}

function onDocumentTouchStart(event: TouchEvent): void {
    if (props.open) onSidebarTouchStart(event)
}

function onDocumentTouchMove(event: TouchEvent): void {
    if (props.open) onSidebarTouchMove(event)
}

function onDocumentTouchEnd(event: TouchEvent): void {
    if (props.open) onSidebarTouchEnd(event)
}

onMounted(() => {
    document.addEventListener('pointerdown', onDocumentPointerDown, true)
    document.addEventListener('pointermove', onDocumentPointerMove, true)
    document.addEventListener('pointerup', onDocumentPointerUp, true)
    document.addEventListener('touchstart', onDocumentTouchStart, true)
    document.addEventListener('touchmove', onDocumentTouchMove, true)
    document.addEventListener('touchend', onDocumentTouchEnd, true)
})

onBeforeUnmount(() => {
    if (sidebarSwipeCloseTimer !== null) clearTimeout(sidebarSwipeCloseTimer)
    document.removeEventListener('pointerdown', onDocumentPointerDown, true)
    document.removeEventListener('pointermove', onDocumentPointerMove, true)
    document.removeEventListener('pointerup', onDocumentPointerUp, true)
    document.removeEventListener('touchstart', onDocumentTouchStart, true)
    document.removeEventListener('touchmove', onDocumentTouchMove, true)
    document.removeEventListener('touchend', onDocumentTouchEnd, true)
})

function onSidebarPointerCancel(): void {
    // Android WebView cancels the pointer stream when a scroll surface
    // takes over; keep the shared start point so the continuing touchmove
    // stream can still complete the horizontal close gesture.
}

function suppressSidebarFocusRestore(): void {
    restoreSidebarFocusOnClose.value = false
}

function onSidebarCloseAutoFocus(event: Event): void {
    if (!restoreSidebarFocusOnClose.value) event.preventDefault()
    restoreSidebarFocusOnClose.value = true
}

function sessionTitle(session: TalosLocalChatSession): string {
    return session.title || t('chat.untitledChat')
}

async function openRename(session: TalosLocalChatSession): Promise<void> {
    // R1-SF-B2: the vaul drawer is modal (body pointer-events none + focus
    // trap) — a teleported dialog over it gets its taps stolen and its input
    // can never hold focus. Close the drawer FIRST; the dialog lives outside
    // the Drawer subtree so it survives the close.
    suppressSidebarFocusRestore()
    emit('update:open', false)
    renameTarget.value = session
    renameValue.value = session.title
    await nextTick()
    renameInput.value?.select()
}

function submitRename(): void {
    const target = renameTarget.value
    const title = renameValue.value.trim()
    if (!target || !title || props.busy) return
    emit('rename', target.id, title)
    renameTarget.value = null
    renameValue.value = ''
}

function openDelete(session: TalosLocalChatSession): void {
    // R1-SF-B2: same drawer-modality rule as openRename.
    suppressSidebarFocusRestore()
    emit('update:open', false)
    deleteTarget.value = session
}

function confirmDelete(choice: { deleteMedia: boolean }): void {
    if (!deleteTarget.value) return
    // The dialog keeps itself up and spinning until `busy` falls back — it
    // closes by emitting, so the target is cleared there and not here.
    emit('delete', deleteTarget.value.id, choice)
}

/**
 * What the chat under the cursor would take from the Library.
 *
 * Owner 2026-07-26: deleting a chat left its documents behind. The sidebar can
 * delete ANY chat, not just the open one, so the plan is asked for per target.
 */
const deletePlan = computed<TalosSessionCleanupPlan>(() => (
    deleteTarget.value && props.cleanupPlanFor
        ? props.cleanupPlanFor(deleteTarget.value.id)
        : { documents: [], sources: [] }
))
</script>

<template>
    <Teleport to="body">
        <div
            v-if="props.open"
            data-slot="drawer-overlay"
            aria-hidden="true"
            class="pointer-events-none fixed inset-0 z-[var(--talos-z-global-navigation)] bg-black/10 supports-backdrop-filter:backdrop-blur-xs"
        ></div>
    </Teleport>
    <Drawer
        :open="props.open"
        direction="left"
        :dismissible="false"
        :modal="false"
        @update:open="emit('update:open', $event)"
    >
        <!-- F3-T1 (owner #5): the vendored DrawerContent forces w-3/4 +
             sm:max-w-sm via direction variants that outrank plain w-full —
             override with the SAME variants so full-width really applies. -->
        <DrawerContent
            data-testid="talos-mobile-sidebar"
            class="!z-[var(--talos-z-global-navigation)] h-[100dvh] w-full max-w-none rounded-none border-0 bg-[var(--talos-sidebar)] text-[var(--talos-text)] data-[vaul-drawer-direction=left]:w-full data-[vaul-drawer-direction=left]:max-w-none data-[vaul-drawer-direction=left]:rounded-none data-[vaul-drawer-direction=left]:border-0 data-[vaul-drawer-direction=left]:sm:max-w-none md:!w-[380px] md:!max-w-[380px] md:!border-r md:border-[var(--talos-border)]"
            overlay-class="!z-[var(--talos-z-global-navigation)]"
            @close-auto-focus="onSidebarCloseAutoFocus"
        >
            <div
                data-testid="talos-sidebar-swipe-surface"
                class="flex h-full min-h-0 flex-col"
                @pointerdown.capture="onSidebarPointerDown"
                @pointermove.capture="onSidebarPointerMove"
                @pointerup.capture="onSidebarPointerUp"
                @pointercancel.capture="onSidebarPointerCancel"
                @touchstart.capture="onSidebarTouchStart"
                @touchmove.capture="onSidebarTouchMove"
                @touchend.capture="onSidebarTouchEnd"
                @touchcancel.capture="onSidebarPointerCancel"
            >
            <DrawerHeader class="flex-row items-center gap-3 border-b border-[var(--talos-border)] px-4 pb-3 pt-[max(1rem,env(safe-area-inset-top))] text-left">
                <div class="min-w-0 flex-1">
                    <DrawerTitle class="talos-orbitron-brand text-base tracking-[0.2em] text-[var(--talos-text)]">TALOS</DrawerTitle>
                    <DrawerDescription class="text-xs text-[var(--talos-muted)]">{{ $t('shell.sidebarDescription') }}</DrawerDescription>
                </div>
                <TalosMobileNotificationBell />
            <TalosMobileDownloadCenterTrigger />
                <Button type="button" size="icon-lg" variant="ghost" class="min-h-touch min-w-touch" :aria-label="$t('navigation.closeMenu')" @click="emit('update:open', false)">
                    <X aria-hidden="true" />
                </Button>
            </DrawerHeader>

            <div data-testid="talos-sidebar-scroll-surface" class="flex min-h-0 flex-1 touch-pan-y flex-col overflow-y-auto overscroll-contain">
                <!-- F3-T3 (owner #12, Claude pattern): on phones the Chats entry
                     opens the dedicated list page; tablets keep the inline list.
                     Owner 2026-07-24: the single "New chat" affordance is the
                     bottom FAB (matching the reference screenshot) — no
                     duplicate outline button up here. -->
                <!-- Owner 2026-07-25: the Chats entry is styled exactly like the
                     Tools rows (one visual language), and the huge flex-1 spacer
                     that pushed Tools to the bottom is gone — the sections now sit
                     together and the footer is pinned with mt-auto. -->
                <nav :aria-label="$t('navigation.chats')" class="px-3 py-3 md:hidden">
                    <p class="px-1 pb-1 text-2xs font-semibold uppercase tracking-wide text-[var(--talos-muted)]">{{ $t('navigation.chats') }}</p>
                    <button
                        type="button"
                        data-testid="talos-sidebar-chats-entry"
                        class="talos-pressable flex min-h-touch w-full items-center gap-2 rounded-md px-2 text-left text-sm text-[var(--talos-text)] hover:bg-[var(--talos-active)]"
                        @click="emit('navigate', 'chats')"
                    >
                        <MessageSquareText class="size-4 text-[var(--talos-accent)]" aria-hidden="true" />
                        <span class="min-w-0 flex-1 truncate">{{ $t('shell.allChats') }}</span>
                        <span class="text-xs text-[var(--talos-muted)]">{{ props.sessions.length }}</span>
                    </button>
                </nav>

                <nav
                    data-testid="talos-sidebar-recents"
                    :aria-label="$t('shell.recentChats')"
                    class="hidden min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 py-3 md:block"
                >
                    <p class="px-1 pb-1 text-2xs font-semibold uppercase tracking-wide text-[var(--talos-muted)]">{{ $t('shell.recents') }}</p>
                    <p class="px-1 pb-2 text-xs text-[var(--talos-muted)]">
                        {{ props.sessions.length === 1
                            ? $t('shell.conversationCountOne')
                            : $t('shell.conversationCountMany', { count: props.sessions.length }) }}
                    </p>
                    <p v-if="!props.sessions.length" class="px-1 py-2 text-sm text-[var(--talos-muted)]">{{ $t('shell.noChats') }}</p>
                    <ul v-else class="space-y-0.5" :aria-label="$t('shell.chatHistory')">
                        <li v-for="session in props.sessions" :key="session.id" class="group flex items-center gap-1">
                            <button
                                type="button"
                                :aria-label="$t('chat.openNamed', { title: sessionTitle(session) })"
                                :aria-current="session.id === props.activeSessionId ? 'page' : undefined"
                                class="talos-pressable min-h-touch min-w-0 flex-1 truncate rounded-md px-2 text-left text-sm"
                                :class="session.id === props.activeSessionId
                                    ? 'bg-[var(--talos-active)] text-[var(--talos-text)]'
                                    : 'text-[var(--talos-text)] hover:bg-[var(--talos-active)]'"
                                @click="emit('select', session.id)"
                            >
                                {{ sessionTitle(session) }}
                            </button>
                            <Button type="button" size="icon" variant="ghost" :aria-label="$t('chat.renameNamed', { title: sessionTitle(session) })" @click="openRename(session)">
                                <Pencil class="size-3.5" aria-hidden="true" />
                            </Button>
                            <Button type="button" size="icon" variant="ghost" :aria-label="$t('chat.deleteNamed', { title: sessionTitle(session) })" @click="openDelete(session)">
                                <Trash2 class="size-3.5" aria-hidden="true" />
                            </Button>
                        </li>
                    </ul>
                </nav>

                <nav
                    data-testid="talos-sidebar-tools"
                    :aria-label="$t('shell.tools')"
                    class="px-3 pb-3 md:border-t md:border-[var(--talos-border)] md:pt-3"
                >
                    <p class="px-1 pb-1 text-2xs font-semibold uppercase tracking-wide text-[var(--talos-muted)]">{{ $t('shell.tools') }}</p>
                    <ul class="space-y-0.5">
                        <li v-for="tool in tools" :key="tool.route">
                            <button
                                type="button"
                                :aria-label="$t('shell.openItem', { item: tool.label })"
                                class="talos-pressable flex min-h-touch w-full items-center gap-2 rounded-md px-2 text-left text-sm text-[var(--talos-text)] hover:bg-[var(--talos-active)]"
                                @click="suppressSidebarFocusRestore(); emit('navigate', tool.route)"
                            >
                                <component :is="tool.icon" class="size-4 text-[var(--talos-accent)]" aria-hidden="true" />
                                {{ tool.label }}
                            </button>
                        </li>
                    </ul>
                </nav>

                <!-- Owner 2026-07-24 (Claude-style): bottom bar — account avatar
                     on the left, floating New chat pill on the right. -->
                <div
                    data-testid="talos-sidebar-settings"
                    class="mt-auto flex items-center justify-between gap-3 border-t border-[var(--talos-border)] px-3 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]"
                >
                    <button
                        type="button"
                        :aria-label="$t('shell.openSettings')"
                        class="talos-pressable flex min-h-touch items-center gap-2 rounded-full pr-3 text-left text-sm text-[var(--talos-text)] hover:bg-[var(--talos-active)]"
                        @click="suppressSidebarFocusRestore(); emit('openSettings')"
                    >
                        <TalosAccountAvatar size="sm" />
                        <span class="max-w-[120px] truncate text-[var(--talos-muted)]">{{ account.state.display_name || $t('navigation.account') }}</span>
                    </button>
                    <!-- Il ventaglio al posto del tasto singolo.

                         Owner 2026-08-06: la sidebar sapeva cominciare UNA cosa,
                         e per ogni altra bisognava andare nella sua stazione a
                         cercarne il FAB — cinque gesti diversi per cinque cose
                         che sono lo stesso gesto.

                         La chat resta la voce piu' vicina al pollice, cosi' chi
                         premeva qui per aprire una chat continua a farlo con un
                         tocco in piu' e nessuna ricerca. -->
                    <!-- La sidebar si chiude appena qualcosa comincia: quello che
                         si è chiesto sta per aprirsi sotto, e restare aperti lo
                         coprirebbe. -->
                    <TalosMobileSpeedDial
                        :creating-chat="props.creatingSession"
                        @started="emit('update:open', false)"
                        @chat="emit('newChat')"
                    />
                </div>
            </div>
            </div>
        </DrawerContent>
    </Drawer>

    <!-- R1-1 + R1-SF-B2: device-proven confirm surfaces, OUTSIDE the Drawer
         subtree — the drawer closes when they open (its modality would steal
         their taps and focus), and they must survive that unmount. -->
    <TalosMobileConfirmDialog
        v-if="renameTarget !== null"
        :title="$t('chat.renameChat')"
        :description="$t('chat.renameDescription')"
        @close="renameTarget = null"
    >
        <input
            ref="renameInput"
            v-model="renameValue"
            :aria-label="$t('chat.chatName')"
            class="min-h-touch w-full rounded-md border border-[var(--talos-border)] bg-[var(--talos-input,var(--talos-background))] px-3 text-sm text-[var(--talos-text)] outline-none focus:border-[var(--talos-accent)]"
            @keydown.enter.prevent="submitRename"
        >
        <template #footer>
            <Button type="button" variant="ghost" @click="renameTarget = null"><X class="size-4" aria-hidden="true" /> {{ $t('common.cancel') }}</Button>
            <Button type="button" data-testid="talos-session-rename-submit" :disabled="!renameValue.trim() || props.busy" @click="submitRename">
                <Check class="size-4" aria-hidden="true" /> {{ $t('common.save') }}
            </Button>
        </template>
    </TalosMobileConfirmDialog>

    <TalosMobileDeleteChatDialog
        v-if="deleteTarget !== null"
        :title="deleteTarget ? sessionTitle(deleteTarget) : ''"
        :plan="deletePlan"
        :busy="props.busy"
        @close="deleteTarget = null"
        @confirm="confirmDelete"
    />
</template>
