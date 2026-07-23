<script setup lang="ts">
/**
 * F3-T3 (owner #12, "Claude pattern") — dedicated chat-list page.
 * F5.1 (owner directive): row actions live in a TAP-AND-HOLD dropdown menu
 * (replaces the swipe tray — "vedo sia molto meglio"): Open, Rename,
 * Archive/Unarchive, Delete. Manual drag-reorder is deferred to an explicit
 * mode (the sort_index model stays).
 */
import { computed, nextTick, ref } from 'vue'
import { useRouter } from 'vue-router'
import { Archive, ArchiveRestore, Check, ChevronDown, MessageSquarePlus, MessageSquareText, Pencil, Search, Trash2, X } from '@lucide/vue'
import { Button } from '@/components/ui/button'
import TalosMobileConfirmDialog from '@/components/shell/TalosMobileConfirmDialog.vue'
import { useChatController } from '@/stores/chatController'
import { archivedChatSessions, orderChatSessions } from '@/lib/chatListGestures'
import { talosRelativeTime } from '@/lib/relativeTime'
import { talosLightImpact } from '@/services/haptics'

// F6 — embedded mode: the tablet split view mounts this screen as the
// persistent left panel. Selection then must NOT navigate (the chat already
// lives on the right); `activated` lets the shell dismiss an open station
// sheet instead.
const props = withDefaults(defineProps<{ embedded?: boolean }>(), { embedded: false })
const emit = defineEmits<{ activated: [] }>()

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
    if (props.embedded) emit('activated')
    else void router.push({ name: 'chat' })
}

async function newChat(): Promise<void> {
    void talosLightImpact()
    await controller.newSession()
    if (props.embedded) emit('activated')
    else void router.push({ name: 'chat' })
}

const renameTarget = ref<{ id: string; title: string } | null>(null)
const renameValue = ref('')
const renameInput = ref<HTMLInputElement | null>(null)
const deleteTarget = ref<{ id: string; title: string } | null>(null)

// F4-#22: session actions must never fail silently — the real error stays
// visible in the open dialog until the owner closes it.
const actionError = ref<string | null>(null)
// SF-6: one session action at a time.
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

async function archiveSession(session: { id: string; title: string }, value: boolean): Promise<void> {
    if (actionBusy.value) return
    actionBusy.value = true
    try {
        await controller.chat.setSessionArchived(session.id, value)
        actionError.value = null
        void talosLightImpact()
    } catch (error) {
        actionError.value = `The chat could not be ${value ? 'archived' : 'unarchived'}: ${actionErrorText(error)}`
    } finally {
        actionBusy.value = false
    }
}

// F5.1 — tap-and-hold context menu. Long-press (500ms without moving) opens
// the dropdown for that row; tap elsewhere / Escape closes it.
interface RowMenuState {
    session: { id: string; title: string; archived: boolean }
    top: number
    /** SF6-F2 (embedded): anchor the menu to the held row, not the viewport. */
    left: number | null
    width: number | null
}
const rowMenu = ref<RowMenuState | null>(null)
// The click that ends the long-press lands on the JUST-OPENED backdrop and
// would close the menu instantly — ignore dismissals in the first moment.
let menuOpenedAt = 0
const HOLD_MS = 500
const HOLD_SLOP_PX = 10
let holdTimer: ReturnType<typeof setTimeout> | null = null
let holdOrigin: { x: number; y: number } | null = null
let suppressNextClick = false

function clearHold(): void {
    if (holdTimer !== null) clearTimeout(holdTimer)
    holdTimer = null
    holdOrigin = null
}

function onRowPointerDown(session: { id: string; title: string }, isArchived: boolean, event: PointerEvent): void {
    clearHold()
    holdOrigin = { x: event.clientX, y: event.clientY }
    const anchor = (event.currentTarget as HTMLElement).getBoundingClientRect()
    holdTimer = setTimeout(() => {
        void talosLightImpact()
        suppressNextClick = true
        rowMenu.value = {
            session: { id: session.id, title: session.title, archived: isArchived },
            top: Math.min(anchor.bottom + 4, window.innerHeight - 260),
            left: props.embedded ? anchor.left + 8 : null,
            width: props.embedded ? Math.max(anchor.width - 16, 180) : null,
        }
        menuOpenedAt = Date.now()
        clearHold()
    }, HOLD_MS)
}

function onRowPointerMove(event: PointerEvent): void {
    if (!holdOrigin) return
    if (Math.abs(event.clientX - holdOrigin.x) > HOLD_SLOP_PX
        || Math.abs(event.clientY - holdOrigin.y) > HOLD_SLOP_PX) clearHold()
}

function onRowPointerEnd(): void {
    clearHold()
}

function onRowClickCapture(event: MouseEvent): void {
    // The click that ends the long-press is part of the gesture.
    if (suppressNextClick) {
        suppressNextClick = false
        event.preventDefault()
        event.stopPropagation()
    }
}

function closeRowMenu(): void {
    if (Date.now() - menuOpenedAt < 400) return
    rowMenu.value = null
}

function menuAction(action: 'open' | 'rename' | 'archive' | 'unarchive' | 'delete'): void {
    const target = rowMenu.value?.session
    // Menu actions always dismiss — the time guard only covers the backdrop.
    rowMenu.value = null
    if (!target) return
    if (action === 'open') void openSession(target.id)
    else if (action === 'rename') void openRename(target)
    else if (action === 'archive') void archiveSession(target, true)
    else if (action === 'unarchive') void archiveSession(target, false)
    else void openDelete(target)
}
</script>

<template>
    <!-- SF6-F1: min-h-full in embedded mode overflows the aside by the panel
         header height (single-class specificity tie — stylesheet order wins),
         clipping the last chat row behind the shell's overflow-hidden. -->
    <div class="flex flex-col" :class="props.embedded ? 'min-h-0' : 'min-h-full'" data-testid="talos-chats-screen">
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

        <p class="px-5 pt-2 text-[11px] text-[var(--talos-muted)]">Hold a chat for actions.</p>

        <p
            v-if="actionError && renameTarget === null && deleteTarget === null"
            role="alert"
            class="px-5 pt-2 text-xs leading-5 text-[var(--talos-danger,#dc5b5b)]"
        >{{ actionError }}</p>

        <p v-if="!filtered.length && !archived.length" class="px-5 py-6 text-sm text-[var(--talos-muted)]">
            {{ query ? 'No chats match your search.' : 'No chats yet — start one above.' }}
        </p>

        <div v-else class="mt-1 flex-1 overflow-y-auto pb-[max(1rem,env(safe-area-inset-bottom))]">
            <ul class="px-2">
                <li
                    v-for="session in filtered"
                    :key="session.id"
                    data-testid="talos-chats-row"
                    :data-active="controller.chat.activeSession.value?.id === session.id ? 'true' : 'false'"
                    class="rounded-lg"
                    :class="controller.chat.activeSession.value?.id === session.id ? 'bg-[var(--talos-active)]' : ''"
                    :style="{ touchAction: 'pan-y' }"
                    @pointerdown="onRowPointerDown(session, false, $event)"
                    @pointermove="onRowPointerMove($event)"
                    @pointerup="onRowPointerEnd()"
                    @pointercancel="onRowPointerEnd()"
                    @click.capture="onRowClickCapture($event)"
                    @contextmenu.prevent
                >
                    <button
                        type="button"
                        data-testid="talos-chats-open"
                        class="talos-pressable flex min-h-13 w-full min-w-0 flex-col items-start justify-center rounded-lg px-2 text-left"
                        @click="openSession(session.id)"
                    >
                        <span class="w-full truncate text-sm text-[var(--talos-text)]">{{ session.title || 'New chat' }}</span>
                        <span v-if="session.updated_at" class="text-[11px] text-[var(--talos-muted)]">{{ talosRelativeTime(session.updated_at) }}</span>
                    </button>
                </li>
            </ul>

            <!-- Archived chats: same hold gesture, quiet collapsible section -->
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
                        class="rounded-lg"
                        :style="{ touchAction: 'pan-y' }"
                        @pointerdown="onRowPointerDown(session, true, $event)"
                        @pointermove="onRowPointerMove($event)"
                        @pointerup="onRowPointerEnd()"
                        @pointercancel="onRowPointerEnd()"
                        @click.capture="onRowClickCapture($event)"
                        @contextmenu.prevent
                    >
                        <button
                            type="button"
                            data-testid="talos-chats-archived-open"
                            class="talos-pressable flex min-h-13 w-full min-w-0 flex-col items-start justify-center rounded-lg px-2 text-left"
                            @click="openSession(session.id)"
                        >
                            <span class="w-full truncate text-sm text-[var(--talos-muted)]">{{ session.title || 'New chat' }}</span>
                            <span v-if="session.updated_at" class="text-[11px] text-[var(--talos-muted)]">{{ talosRelativeTime(session.updated_at) }}</span>
                        </button>
                    </li>
                </ul>
            </section>
        </div>

        <!-- F5.1 — hold dropdown: one menu for the held row -->
        <Teleport to="body">
            <div v-if="rowMenu" class="fixed inset-0 z-[80]" @click="closeRowMenu" @keydown.escape="closeRowMenu">
                <div
                    data-testid="talos-chats-row-menu"
                    role="menu"
                    :aria-label="`Actions for ${rowMenu.session.title || 'New chat'}`"
                    class="absolute rounded-xl border border-[var(--talos-border)] bg-[var(--talos-card)] p-1 shadow-[0_8px_30px_rgba(0,0,0,0.16)]"
                    :class="rowMenu.left === null ? 'inset-x-6' : ''"
                    :style="rowMenu.left === null
                        ? { top: `${rowMenu.top}px` }
                        : { top: `${rowMenu.top}px`, left: `${rowMenu.left}px`, width: `${rowMenu.width}px` }"
                    @click.stop
                >
                    <button type="button" role="menuitem" class="talos-pressable flex min-h-11 w-full items-center gap-2 rounded-lg px-2 text-left text-sm text-[var(--talos-text)] hover:bg-[var(--talos-active)]" @click="menuAction('open')">
                        <MessageSquareText class="size-4 text-[var(--talos-accent)]" aria-hidden="true" /> Open
                    </button>
                    <button type="button" role="menuitem" class="talos-pressable flex min-h-11 w-full items-center gap-2 rounded-lg px-2 text-left text-sm text-[var(--talos-text)] hover:bg-[var(--talos-active)]" @click="menuAction('rename')">
                        <Pencil class="size-4 text-[var(--talos-accent)]" aria-hidden="true" /> Rename
                    </button>
                    <button
                        v-if="!rowMenu.session.archived"
                        type="button" role="menuitem"
                        class="talos-pressable flex min-h-11 w-full items-center gap-2 rounded-lg px-2 text-left text-sm text-[var(--talos-text)] hover:bg-[var(--talos-active)]"
                        @click="menuAction('archive')"
                    >
                        <Archive class="size-4 text-[var(--talos-accent)]" aria-hidden="true" /> Archive
                    </button>
                    <button
                        v-else
                        type="button" role="menuitem"
                        class="talos-pressable flex min-h-11 w-full items-center gap-2 rounded-lg px-2 text-left text-sm text-[var(--talos-text)] hover:bg-[var(--talos-active)]"
                        @click="menuAction('unarchive')"
                    >
                        <ArchiveRestore class="size-4 text-[var(--talos-accent)]" aria-hidden="true" /> Unarchive
                    </button>
                    <button type="button" role="menuitem" class="talos-pressable flex min-h-11 w-full items-center gap-2 rounded-lg px-2 text-left text-sm text-[var(--talos-danger,#dc5b5b)] hover:bg-[var(--talos-active)]" @click="menuAction('delete')">
                        <Trash2 class="size-4" aria-hidden="true" /> Delete
                    </button>
                </div>
            </div>
        </Teleport>

        <!-- F5.2: device-proven manual dialogs (reka-ui never rendered on
             the owner's WebView). -->
        <TalosMobileConfirmDialog
            v-if="renameTarget !== null"
            title="Rename chat"
            description="Choose a concise name for this conversation."
            @close="renameTarget = null"
        >
            <input
                ref="renameInput"
                v-model="renameValue"
                aria-label="Chat name"
                class="min-h-11 w-full rounded-md border border-[var(--talos-border)] bg-[var(--talos-input,var(--talos-background))] px-3 text-sm text-[var(--talos-text)] outline-none focus:border-[var(--talos-accent)]"
                @keydown.enter.prevent="submitRename"
            >
            <p v-if="actionError" role="alert" class="text-xs leading-5 text-[var(--talos-danger,#dc5b5b)]">{{ actionError }}</p>
            <template #footer>
                <Button type="button" variant="ghost" @click="renameTarget = null"><X class="size-4" aria-hidden="true" /> Cancel</Button>
                <Button type="button" :disabled="!renameValue.trim() || actionBusy" @click="submitRename">
                    <Check class="size-4" aria-hidden="true" /> Save
                </Button>
            </template>
        </TalosMobileConfirmDialog>

        <TalosMobileConfirmDialog
            v-if="deleteTarget !== null"
            title="Delete chat?"
            :description="`This permanently removes &quot;${deleteTarget?.title || 'New chat'}&quot; and its messages.`"
            @close="deleteTarget = null"
        >
            <p v-if="actionError" role="alert" class="text-xs leading-5 text-[var(--talos-danger,#dc5b5b)]">{{ actionError }}</p>
            <template #footer>
                <Button type="button" variant="ghost" @click="deleteTarget = null"><X class="size-4" aria-hidden="true" /> Cancel</Button>
                <Button type="button" variant="destructive" :disabled="actionBusy" @click="confirmDelete">
                    <Trash2 class="size-4" aria-hidden="true" /> Delete
                </Button>
            </template>
        </TalosMobileConfirmDialog>
    </div>
</template>
