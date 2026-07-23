<script setup lang="ts">
/**
 * F3-T3 (owner #12, "Claude pattern") — dedicated chat-list page. On mobile the
 * sidebar's Chats entry navigates here (the Claude-app ergonomic); on tablet
 * the sidebar keeps its inline list. One-up over the competitor pattern: local
 * instant search plus per-row rename/delete without hidden menus — everything
 * works offline because sessions live in the local store.
 */
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { Archive, ArchiveRestore, Check, ChevronDown, MessageSquarePlus, Pencil, Search, Trash2, X } from '@lucide/vue'
import { Button } from '@/components/ui/button'
import {
    Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import { useChatController } from '@/stores/chatController'
import {
    archivedChatSessions,
    createSwipeReveal,
    orderChatSessions,
    reorderIds,
    SWIPE_ACTIONS_WIDTH,
    type TalosSwipeReveal,
} from '@/lib/chatListGestures'
import { talosRelativeTime } from '@/lib/relativeTime'
import { talosLightImpact } from '@/services/haptics'
import type Sortable from 'sortablejs'

const router = useRouter()
const controller = useChatController()

const query = ref('')
const ordered = computed(() => orderChatSessions(controller.chat.sessions))
const filtered = computed(() => {
    const needle = query.value.trim().toLowerCase()
    if (!needle) return ordered.value
    return ordered.value.filter((session) => (session.title || 'New chat').toLowerCase().includes(needle))
})
const archived = computed(() => {
    const needle = query.value.trim().toLowerCase()
    const entries = archivedChatSessions(controller.chat.sessions)
    if (!needle) return entries
    return entries.filter((session) => (session.title || 'New chat').toLowerCase().includes(needle))
})
const showArchived = ref(false)

async function openSession(id: string): Promise<void> {
    void talosLightImpact()
    await controller.selectSession(id)
    void router.push({ name: 'chat' })
}

async function newChat(): Promise<void> {
    void talosLightImpact()
    await controller.newSession()
    void router.push({ name: 'chat' })
}

const renameTarget = ref<{ id: string; title: string } | null>(null)
const renameValue = ref('')
const renameInput = ref<HTMLInputElement | null>(null)
const deleteTarget = ref<{ id: string; title: string } | null>(null)

// F4-#22: session actions must never fail silently — the real error stays
// visible in the open dialog until the owner closes it.
const actionError = ref<string | null>(null)
// SF-6: one session action at a time — double-taps and overlapping tray
// actions must not race the single storage connection.
const actionBusy = ref(false)

function actionErrorText(error: unknown): string {
    return error instanceof Error && error.message ? error.message : String(error)
}

async function openRename(session: { id: string; title: string }): Promise<void> {
    actionError.value = null
    renameTarget.value = session
    renameValue.value = session.title
    await nextTick()
    renameInput.value?.select()
}

async function submitRename(): Promise<void> {
    const target = renameTarget.value
    const title = renameValue.value.trim()
    if (!target || !title || actionBusy.value) return
    actionBusy.value = true
    try {
        await controller.renameSession(target.id, title)
        renameTarget.value = null
        actionError.value = null
    } catch (error) {
        actionError.value = `The chat could not be renamed: ${actionErrorText(error)}`
    } finally {
        actionBusy.value = false
    }
}

function openDelete(session: { id: string; title: string }): void {
    actionError.value = null
    deleteTarget.value = session
}

async function confirmDelete(): Promise<void> {
    const target = deleteTarget.value
    if (!target || actionBusy.value) return
    actionBusy.value = true
    try {
        await controller.deleteSession(target.id)
        deleteTarget.value = null
        actionError.value = null
    } catch (error) {
        actionError.value = `The chat could not be deleted: ${actionErrorText(error)}`
    } finally {
        actionBusy.value = false
    }
}

// F4-#23 — swipe-to-reveal Archive/Delete on each row. One reveal state per
// session id; opening a row closes the others so only one tray shows.
const swipes = new Map<string, TalosSwipeReveal>()
function swipeFor(sessionId: string): TalosSwipeReveal {
    let swipe = swipes.get(sessionId)
    if (!swipe) {
        swipe = createSwipeReveal()
        swipes.set(sessionId, swipe)
    }
    return swipe
}

function closeOtherSwipes(sessionId: string): void {
    for (const [id, swipe] of swipes) {
        if (id !== sessionId) swipe.close()
    }
}

function onRowPointerDown(sessionId: string, event: PointerEvent): void {
    closeOtherSwipes(sessionId)
    swipeFor(sessionId).start(event.clientX, event.clientY)
}

function onRowPointerMove(sessionId: string, event: PointerEvent): void {
    const swipe = swipeFor(sessionId)
    if (!swipe.swiping.value) return
    swipe.move(event.clientX, event.clientY)
    if (swipe.offset.value !== 0 && event.currentTarget instanceof Element) {
        try {
            event.currentTarget.setPointerCapture?.(event.pointerId)
        } catch { /* jsdom/webview without pointer capture */ }
    }
}

function onRowPointerEnd(sessionId: string): void {
    swipeFor(sessionId).end()
}

// The click fired at the end of a swipe is part of the gesture, not a tap —
// swallow it or it would immediately toggle/close what the swipe just did.
function onRowClickCapture(sessionId: string, event: MouseEvent): void {
    if (swipeFor(sessionId).consumeGesture()) {
        event.preventDefault()
        event.stopPropagation()
    }
}

async function archiveSession(session: { id: string; title: string }, value: boolean): Promise<void> {
    if (actionBusy.value) return
    actionBusy.value = true
    try {
        await controller.chat.setSessionArchived(session.id, value)
        swipeFor(session.id).close()
        actionError.value = null
        void talosLightImpact()
    } catch (error) {
        actionError.value = `The chat could not be ${value ? 'archived' : 'unarchived'}: ${actionErrorText(error)}`
    } finally {
        actionBusy.value = false
    }
}

// F4-#23 — hold-to-move: SortableJS (upstream) with a hold delay; the drop
// order is persisted as sort_index for the whole visible list. Disabled while
// searching (a filtered reorder would scramble the real order).
const listRef = ref<HTMLElement | null>(null)
let sortable: Sortable | null = null

async function bindSortable(element: HTMLElement): Promise<void> {
    try {
        const { default: SortableCtor } = await import('sortablejs')
        if (listRef.value !== element) return
        sortable?.destroy()
        sortable = SortableCtor.create(element, {
            animation: 150,
            delay: 350,
            delayOnTouchOnly: false,
            touchStartThreshold: 6,
            disabled: query.value.trim().length > 0,
            onEnd: (event) => {
                const from = event.oldIndex ?? -1
                const to = event.newIndex ?? -1
                const ids = filtered.value.map((session) => session.id)
                if (from < 0 || to < 0 || from === to) return
                void controller.chat.setSessionOrder(reorderIds(ids, from, to)).then(() => {
                    void talosLightImpact()
                }).catch((error: unknown) => {
                    actionError.value = `The chats could not be reordered: ${actionErrorText(error)}`
                })
            },
        })
    } catch {
        // Drag stays unavailable (e.g. jsdom) — buttons still cover everything.
    }
}

// SF-9: the <ul> lives in a v-else branch — an empty search unmounts it and a
// later render creates a NEW element the old Sortable is not bound to.
watch(listRef, (element) => {
    if (element) void bindSortable(element)
    else { sortable?.destroy(); sortable = null }
}, { immediate: true })

watch(query, (value) => sortable?.option('disabled', value.trim().length > 0))
onBeforeUnmount(() => {
    sortable?.destroy()
    sortable = null
})
</script>

<template>
    <div class="flex min-h-full flex-col" data-testid="talos-chats-screen">
        <div class="flex items-center gap-2 px-4 pt-3">
            <div class="relative min-w-0 flex-1">
                <Search class="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-[var(--talos-muted)]" aria-hidden="true" />
                <input
                    v-model="query"
                    data-testid="talos-chats-search"
                    type="search"
                    aria-label="Search chats"
                    placeholder="Search chats"
                    class="min-h-11 w-full rounded-xl border border-[var(--talos-border)] bg-[var(--talos-panel)] pl-9 pr-3 text-sm text-[var(--talos-text)] outline-none focus-visible:ring-2 focus-visible:ring-[var(--talos-ring)]"
                >
            </div>
            <Button
                type="button"
                data-testid="talos-chats-new"
                aria-label="New chat"
                class="talos-pressable min-h-11 gap-2 rounded-xl bg-[var(--talos-accent,var(--primary))] px-3 text-sm text-[var(--talos-accent-contrast,var(--primary-foreground))]"
                @click="newChat"
            >
                <MessageSquarePlus class="size-4" aria-hidden="true" />
                New
            </Button>
        </div>

        <p
            v-if="actionError && renameTarget === null && deleteTarget === null"
            role="alert"
            class="px-5 pt-2 text-xs leading-5 text-[var(--talos-danger,#dc5b5b)]"
        >{{ actionError }}</p>

        <p v-if="!filtered.length && !archived.length" class="px-5 py-6 text-sm text-[var(--talos-muted)]">
            {{ query ? 'No chats match your search.' : 'No chats yet — start one above.' }}
        </p>

        <div v-else class="mt-2 flex-1 overflow-y-auto pb-[max(1rem,env(safe-area-inset-bottom))]">
            <ul ref="listRef" class="px-2">
                <li
                    v-for="session in filtered"
                    :key="session.id"
                    data-testid="talos-chats-row"
                    :data-active="controller.chat.activeSession.value?.id === session.id ? 'true' : 'false'"
                    class="relative overflow-hidden rounded-xl"
                    @click.capture="onRowClickCapture(session.id, $event)"
                >
                    <!-- swipe tray revealed behind the row content -->
                    <div class="absolute inset-y-0 right-0 flex items-stretch" :style="{ width: `${SWIPE_ACTIONS_WIDTH}px` }" aria-hidden="false">
                        <button
                            type="button"
                            :aria-label="`Archive chat ${session.title || 'New chat'}`"
                            :tabindex="swipeFor(session.id).open.value ? 0 : -1"
                            :aria-hidden="!swipeFor(session.id).open.value"
                            class="flex w-1/2 flex-col items-center justify-center gap-0.5 bg-[var(--talos-accent,var(--primary))] text-[11px] text-[var(--talos-accent-contrast,var(--primary-foreground))]"
                            @click="archiveSession(session, true)"
                        >
                            <Archive class="size-4" aria-hidden="true" />
                            Archive
                        </button>
                        <button
                            type="button"
                            :aria-label="`Delete chat ${session.title || 'New chat'}`"
                            :tabindex="swipeFor(session.id).open.value ? 0 : -1"
                            :aria-hidden="!swipeFor(session.id).open.value"
                            class="flex w-1/2 flex-col items-center justify-center gap-0.5 bg-[var(--talos-danger,#dc5b5b)] text-[11px] text-white"
                            @click="openDelete(session)"
                        >
                            <Trash2 class="size-4" aria-hidden="true" />
                            Delete
                        </button>
                    </div>
                    <div
                        class="relative flex items-center gap-1 rounded-xl px-1 bg-[var(--talos-window-bg,var(--talos-background))]"
                        :class="controller.chat.activeSession.value?.id === session.id ? 'bg-[var(--talos-active)]' : ''"
                        :style="{
                            transform: `translateX(${swipeFor(session.id).offset.value}px)`,
                            transition: swipeFor(session.id).swiping.value ? 'none' : 'transform 160ms ease',
                            touchAction: 'pan-y',
                        }"
                        @pointerdown="onRowPointerDown(session.id, $event)"
                        @pointermove="onRowPointerMove(session.id, $event)"
                        @pointerup="onRowPointerEnd(session.id)"
                        @pointercancel="onRowPointerEnd(session.id)"
                    >
                        <button
                            type="button"
                            data-testid="talos-chats-open"
                            class="talos-pressable flex min-h-13 min-w-0 flex-1 flex-col items-start justify-center rounded-xl px-2 text-left"
                            @click="swipeFor(session.id).open.value ? swipeFor(session.id).close() : openSession(session.id)"
                        >
                            <span class="w-full truncate text-sm text-[var(--talos-text)]">{{ session.title || 'New chat' }}</span>
                            <span v-if="session.updated_at" class="text-[11px] text-[var(--talos-muted)]">{{ talosRelativeTime(session.updated_at) }}</span>
                        </button>
                        <button
                            type="button"
                            :aria-label="`Rename ${session.title || 'New chat'}`"
                            class="talos-pressable flex min-h-11 min-w-11 items-center justify-center rounded-full text-[var(--talos-muted)]"
                            @click="openRename(session)"
                        >
                            <Pencil class="size-4" aria-hidden="true" />
                        </button>
                        <button
                            type="button"
                            :aria-label="`Delete ${session.title || 'New chat'}`"
                            class="talos-pressable flex min-h-11 min-w-11 items-center justify-center rounded-full text-[var(--talos-muted)]"
                            @click="openDelete(session)"
                        >
                            <Trash2 class="size-4" aria-hidden="true" />
                        </button>
                    </div>
                </li>
            </ul>

            <!-- F4-#23: archived chats live in a quiet collapsible section -->
            <section v-if="archived.length" class="mt-3 px-2">
                <button
                    type="button"
                    data-testid="talos-chats-archived-toggle"
                    :aria-expanded="showArchived"
                    class="talos-pressable flex min-h-11 w-full items-center gap-2 rounded-xl px-2 text-left text-xs font-semibold uppercase tracking-wide text-[var(--talos-muted)]"
                    @click="showArchived = !showArchived"
                >
                    <ChevronDown class="size-4 transition-transform" :class="showArchived ? '' : '-rotate-90'" aria-hidden="true" />
                    Archived ({{ archived.length }})
                </button>
                <ul v-if="showArchived">
                    <li
                        v-for="session in archived"
                        :key="session.id"
                        data-testid="talos-chats-archived-row"
                        class="flex items-center gap-1 rounded-xl px-1"
                    >
                        <button
                            type="button"
                            data-testid="talos-chats-archived-open"
                            class="talos-pressable flex min-h-13 min-w-0 flex-1 flex-col items-start justify-center rounded-xl px-2 text-left"
                            @click="openSession(session.id)"
                        >
                            <span class="w-full truncate text-sm text-[var(--talos-muted)]">{{ session.title || 'New chat' }}</span>
                            <span v-if="session.updated_at" class="text-[11px] text-[var(--talos-muted)]">{{ talosRelativeTime(session.updated_at) }}</span>
                        </button>
                        <button
                            type="button"
                            :aria-label="`Unarchive chat ${session.title || 'New chat'}`"
                            class="talos-pressable flex min-h-11 min-w-11 items-center justify-center rounded-full text-[var(--talos-muted)]"
                            @click="archiveSession(session, false)"
                        >
                            <ArchiveRestore class="size-4" aria-hidden="true" />
                        </button>
                        <button
                            type="button"
                            :aria-label="`Delete ${session.title || 'New chat'}`"
                            class="talos-pressable flex min-h-11 min-w-11 items-center justify-center rounded-full text-[var(--talos-muted)]"
                            @click="openDelete(session)"
                        >
                            <Trash2 class="size-4" aria-hidden="true" />
                        </button>
                    </li>
                </ul>
            </section>
        </div>

        <Dialog :open="renameTarget !== null" @update:open="(open) => { if (!open) renameTarget = null }">
            <DialogContent class="border-[var(--talos-border)] bg-[var(--talos-window-bg)] text-[var(--talos-text)]">
                <DialogHeader>
                    <DialogTitle>Rename chat</DialogTitle>
                    <DialogDescription class="text-[var(--talos-muted)]">Choose a concise name for this conversation.</DialogDescription>
                </DialogHeader>
                <input
                    ref="renameInput"
                    v-model="renameValue"
                    aria-label="Chat name"
                    class="min-h-11 w-full rounded-md border border-[var(--talos-border)] bg-[var(--talos-input,var(--talos-background))] px-3 text-sm text-[var(--talos-text)] outline-none focus:border-[var(--talos-accent)]"
                    @keydown.enter.prevent="submitRename"
                >
                <p v-if="actionError" role="alert" class="text-xs leading-5 text-[var(--talos-danger,#dc5b5b)]">{{ actionError }}</p>
                <DialogFooter>
                    <Button type="button" variant="ghost" @click="renameTarget = null"><X class="size-4" aria-hidden="true" /> Cancel</Button>
                    <Button type="button" :disabled="!renameValue.trim()" @click="submitRename">
                        <Check class="size-4" aria-hidden="true" /> Save
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>

        <Dialog :open="deleteTarget !== null" @update:open="(open) => { if (!open) deleteTarget = null }">
            <DialogContent class="border-[var(--talos-border)] bg-[var(--talos-window-bg)] text-[var(--talos-text)]">
                <DialogHeader>
                    <DialogTitle>Delete chat?</DialogTitle>
                    <DialogDescription class="text-[var(--talos-muted)]">
                        This permanently removes "{{ deleteTarget?.title || 'New chat' }}" and its messages.
                    </DialogDescription>
                </DialogHeader>
                <p v-if="actionError" role="alert" class="text-xs leading-5 text-[var(--talos-danger,#dc5b5b)]">{{ actionError }}</p>
                <DialogFooter>
                    <Button type="button" variant="ghost" @click="deleteTarget = null"><X class="size-4" aria-hidden="true" /> Cancel</Button>
                    <Button type="button" variant="destructive" @click="confirmDelete">
                        <Trash2 class="size-4" aria-hidden="true" /> Delete
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    </div>
</template>
