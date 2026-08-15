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
import TalosRowActions, { type TalosRowAction } from '@/components/talos/ui/TalosRowActions.vue'
import { useTalosI18n } from '@/i18n'
import { Check, CheckSquare, ChevronDown, LoaderCircle, MessageSquarePlus, Search, Trash2, X } from '@lucide/vue'
import { Button } from '@/components/ui/button'
import TalosMobileConfirmDialog from '@/components/shell/TalosMobileConfirmDialog.vue'
import TalosMobileDeleteChatDialog from '@/components/shell/TalosMobileDeleteChatDialog.vue'
import { useTalosBulkSelection } from '@/composables/useTalosBulkSelection'
import {
    planTalosSessionCleanupFor,
    talosCleanupCount,
    type TalosSessionCleanupPlan,
} from '@/lib/chat/sessionCleanup'
import TalosMobileNewChatFab from '@/components/shell/TalosMobileNewChatFab.vue'
import { useChatController } from '@/stores/chatController'
import { talosDaIntitolare } from '@/stores/chat'
import { archivedChatSessions, orderChatSessions } from '@/lib/chatListGestures'
import { talosRelativeTime } from '@/lib/relativeTime'
import { talosLightImpact } from '@/services/haptics'
import { TALOS_DANGER_ACTION_CLASS } from '@/lib/dangerAction'

// F6 — embedded mode: the tablet split view mounts this screen as the
// persistent left panel. Selection then must NOT navigate (the chat already
// lives on the right); `activated` lets the shell dismiss an open station
// sheet instead.
const props = withDefaults(defineProps<{ embedded?: boolean }>(), { embedded: false })
const emit = defineEmits<{ activated: [] }>()

const router = useRouter()
const { t } = useTalosI18n()
const controller = useChatController()

const query = ref('')
const ordered = computed(() => orderChatSessions(controller.chat.history))
const filtered = computed(() => {
    const needle = query.value.trim().toLowerCase()
    if (!needle) return ordered.value
    return ordered.value.filter((session) => sessionTitle(session).toLocaleLowerCase().includes(needle))
})
const archived = computed(() => {
    const needle = query.value.trim().toLowerCase()
    const entries = archivedChatSessions(controller.chat.history)
    if (!needle) return entries
    return entries.filter((session) => sessionTitle(session).toLocaleLowerCase().includes(needle))
})
const showArchived = ref(false)
const relativeTimeLabels = computed(() => ({
    justNow: t('chat.justNow'),
    minutesAgo: (count: number) => t('chat.minutesAgo', { count }),
    hoursAgo: (count: number) => t('chat.hoursAgo', { count }),
    daysAgo: (count: number) => t('chat.daysAgo', { count }),
}))
/**
 * ⛔ Il gettone «non ancora intitolata» si TRADUCE qui, non si salva tradotto.
 *
 * Prima bastava `|| t('chat.newChat')`, perché il titolo tradotto stava già nel
 * database — ed è proprio ciò che impediva alla prima domanda di dare il nome
 * alla chat, lasciandone ventiquattro tutte uguali. Ora il database porta un
 * gettone stabile e la parola nasce qui.
 */
function sessionTitle(session: { title: string }): string {
    return talosDaIntitolare(session.title) ? t('chat.newChat') : session.title
}
function updatedAt(value: string): string {
    return talosRelativeTime(value, new Date(), relativeTimeLabels.value)
}
function cleanupDescription(plan: TalosSessionCleanupPlan): string {
    const parts: string[] = []
    if (plan.documents.length) {
        parts.push(t(plan.documents.length === 1 ? 'chat.cleanupDocumentOne' : 'chat.cleanupDocumentMany', {
            count: plan.documents.length,
        }))
    }
    if (plan.sources.length) {
        parts.push(t(plan.sources.length === 1 ? 'chat.cleanupSavedPageOne' : 'chat.cleanupSavedPageMany', {
            count: plan.sources.length,
        }))
    }
    return parts.length === 2 ? t('chat.cleanupJoin', { first: parts[0], second: parts[1] }) : parts[0] ?? ''
}
function bulkDeleteDescription(): string {
    const count = bulk.count.value
    return t(count === 1 ? 'chats.bulkDeleteDescriptionOne' : 'chats.bulkDeleteDescriptionMany', { count })
}

async function openSession(id: string): Promise<void> {
    if (actionBusy.value) return
    void talosLightImpact()
    actionBusy.value = true
    try {
        // R2-7: through the lifecycle facade — draft flush + attachment
        // revocation happen exactly like a switch from the chat itself.
        // R2-SF-M3: the facade PROPAGATES — surface a failure, never a
        // silent no-op tap.
        await controller.sessionLifecycle.selectSession(id)
        actionError.value = null
        if (props.embedded) emit('activated')
        else void router.push({ name: 'chat' })
    } catch (error) {
        actionError.value = t('chats.openFailed', { detail: actionErrorText(error) })
    } finally {
        actionBusy.value = false
    }
}

async function newChat(): Promise<void> {
    if (actionBusy.value) return
    void talosLightImpact()
    actionBusy.value = true
    try {
        await controller.sessionLifecycle.newSession()
        actionError.value = null
        if (props.embedded) emit('activated')
        else void router.push({ name: 'chat' })
    } catch (error) {
        actionError.value = t('chats.startFailed', { detail: actionErrorText(error) })
    } finally {
        actionBusy.value = false
    }
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
        await controller.sessionLifecycle.renameSession(target.id, title)
        renameTarget.value = null
        actionError.value = null
    } catch (error) {
        actionError.value = t('chats.renameFailed', { detail: actionErrorText(error) })
    } finally {
        actionBusy.value = false
    }
}

function openDelete(session: { id: string; title: string }): void {
    actionError.value = null
    deleteTarget.value = session
}

async function confirmDelete(choice: { deleteMedia: boolean }): Promise<void> {
    const target = deleteTarget.value
    if (!target || actionBusy.value) return
    actionBusy.value = true
    try {
        // Files FIRST: if that half fails the chat is still there and the user
        // can try again, whereas deleting the chat first and then failing leaves
        // orphans nobody can find their way back to.
        if (choice.deleteMedia) {
            const failed = await controller.deleteSessionMedia(target.id)
            if (failed.length) {
                actionError.value = t(failed.length === 1 ? 'chats.filesRemoveFailedOne' : 'chats.filesRemoveFailedMany', {
                    count: failed.length,
                })
            }
        }
        await controller.sessionLifecycle.deleteSession(target.id)
        deleteTarget.value = null
    } catch (error) {
        actionError.value = t('chats.deleteFailed', { detail: actionErrorText(error) })
    } finally {
        actionBusy.value = false
    }
}

/**
 * Mass selection (owner 2026-07-26: "un pulsante per selezionare massivamente
 * media e chat per eliminazione"). Same mode as the Library, so "N selected"
 * means the same thing on both screens.
 */
/** What the chat being deleted would take from the Library. */
const deletePlan = computed(() => (
    deleteTarget.value
        ? controller.planSessionCleanup(deleteTarget.value.id)
        : { documents: [], sources: [] }
))

const bulk = useTalosBulkSelection()
const bulkDeleteOpen = ref(false)
const bulkDeleteMedia = ref(false)

const selectableIds = computed(() => [
    ...filtered.value.map((session) => session.id),
    ...archived.value.map((session) => session.id),
])

/**
 * What the whole selection would take from the Library, in ONE pass.
 *
 * Per-chat planning re-scanned the entire vault for every selected row — 50
 * chats against 500 files is 25,000 comparisons, redone on every vault change.
 */
const bulkPlan = computed<TalosSessionCleanupPlan>(() => {
    const wanted = new Set(bulk.ids.value)
    return planTalosSessionCleanupFor(controller.attachments.vaultFiles, wanted)
})

function tapSession(sessionId: string): void {
    // In selection mode a tap PICKS. Opening a chat from here would be a
    // different action wearing the same gesture.
    if (bulk.active.value) bulk.toggle(sessionId)
    else openSession(sessionId)
}

async function confirmBulkDelete(): Promise<void> {
    if (actionBusy.value || bulk.count.value === 0) return
    actionBusy.value = true
    actionError.value = null
    const ids = bulk.ids.value
    const stubborn: string[] = []
    let strandedFiles = 0
    try {
        // The files of ALL the selected chats go in ONE vault operation: a call
        // per chat would re-read the whole Library twenty times over, which is
        // the very thing the bulk delete exists to avoid.
        if (bulkDeleteMedia.value) {
            const plan = bulkPlan.value
            const fileIds = [...plan.documents, ...plan.sources].map((entry) => entry.id)
            strandedFiles = (await controller.attachments.deleteVaultFiles(fileIds)).length
        }
        for (const id of ids) {
            try {
                await controller.sessionLifecycle.deleteSession(id)
            } catch {
                // One chat that refuses must not strand the rest of the batch.
                stubborn.push(id)
            }
        }
        // Both halves are reported. Dropping the file failures on the floor left
        // the user believing a deletion that never happened.
        const problems: string[] = []
        if (stubborn.length) {
            problems.push(t(stubborn.length === 1 ? 'chats.chatsDeleteFailedOne' : 'chats.chatsDeleteFailedMany', {
                count: stubborn.length,
            }))
        }
        if (strandedFiles) {
            problems.push(t(strandedFiles === 1 ? 'chats.filesRemoveFailedShortOne' : 'chats.filesRemoveFailedShortMany', {
                count: strandedFiles,
            }))
        }
        actionError.value = problems.length ? `${problems.join(', ')}.` : null
        bulkDeleteOpen.value = false
        bulkDeleteMedia.value = false
        // Whatever survived stays selected; the rest must not linger as a count
        // of rows the user can no longer see.
        bulk.reconcile(controller.chat.history.map((session) => session.id))
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
        actionError.value = t(value ? 'chats.archiveFailed' : 'chats.unarchiveFailed', {
            detail: actionErrorText(error),
        })
    } finally {
        actionBusy.value = false
    }
}

// Tieni-premuto: 500 ms senza muovere il dito. Accende la SELEZIONE — il menu
// di riga sta sotto il ⋮, che e' visibile e non va scoperto.
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

function onRowPointerDown(session: { id: string; title: string }, _isArchived: boolean, event: PointerEvent): void {
    // In selection mode the row menu is a second, contradictory way to act on a
    // row: "Open" navigates away mid-selection, and its single Delete never
    // reconciled the selection, leaving a count that referred to a chat that no
    // longer existed.
    // Un gesto nuovo azzera la soppressione del precedente: la bandiera alzata
    // dal tieni-premuto aspetta un click che a volte non arriva mai, e senza
    // questa riga se lo mangia il tocco dopo. Misurato sulla Ricerca, che ha
    // lo stesso schema — qui il menu che si apre lo nascondeva.
    suppressNextClick = false
    if (bulk.active.value) return
    clearHold()
    holdOrigin = { x: event.clientX, y: event.clientY }
    holdTimer = setTimeout(() => {
        void talosLightImpact()
        suppressNextClick = true
        /*
         * Il gesto accende la SELEZIONE, non un secondo menu.
         *
         * La ricerca sulle azioni di riga (2026-08-03) dice che ⋮ e' la via
         * primaria per agire su UNA e il tieni-premuto e' la selezione. Qui era
         * l'inverso — il gesto apriva il menu e la selezione stava dietro un
         * bottone in intestazione — quindi le due liste della stessa app
         * rispondevano in modo opposto allo stesso dito.
         *
         * La riga tenuta parte gia' spuntata: il dito era li' sopra, e un
         * secondo tocco per riprenderla sarebbe un passo per niente.
         */
        bulk.enter(session.id)
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

/**
 * Le voci di una riga, nella forma condivisa con la Ricerca.
 *
 * Una funzione sola per chat attive e archiviate: sono la stessa cosa con un
 * verbo diverso, e due elenchi scritti a mano divergono al primo cambiamento.
 */
function menuFor(session: { archived: boolean }): TalosRowAction[] {
    return [
        { id: 'open', label: t('common.open'), testId: 'talos-chats-action-open' },
        { id: 'rename', label: t('common.rename'), testId: 'talos-chats-action-rename' },
        session.archived
            ? { id: 'unarchive', label: t('chats.unarchive'), testId: 'talos-chats-action-unarchive' }
            : { id: 'archive', label: t('chats.archive'), testId: 'talos-chats-action-archive' },
        { id: 'select', label: t('common.select'), testId: 'talos-chats-select' },
        { id: 'delete', label: t('common.delete'), danger: true, testId: 'talos-chats-action-delete' },
    ]
}

function act(
    target: { id: string; title: string; archived: boolean },
    action: string,
): void {
    if (action === 'open') void openSession(target.id)
    else if (action === 'rename') void openRename(target)
    else if (action === 'archive') void archiveSession(target, true)
    else if (action === 'unarchive') void archiveSession(target, false)
    // Entering from a held row selects THAT row: the user was already pressing
    // it, and a second tap to pick it back up would be a step for nothing.
    else if (action === 'select') bulk.enter(target.id)
    else void openDelete(target)
}
</script>

<template>
    <!-- SF6-F1: min-h-full in embedded mode overflows the aside by the panel
         header height (single-class specificity tie — stylesheet order wins),
         clipping the last chat row behind the shell's overflow-hidden. -->
    <div class="relative flex flex-col" :class="props.embedded ? 'min-h-0' : 'min-h-full'" data-testid="talos-chats-screen">
        <div class="flex items-center gap-2 px-4 pt-3">
            <div class="relative min-w-0 flex-1">
                <Search class="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-[var(--talos-muted)]" aria-hidden="true" />
                <input
                    v-model="query"
                    data-testid="talos-chats-search"
                    type="search"
                    :aria-label="t('chats.search')"
                    :placeholder="t('chats.search')"
                    class="min-h-touch w-full rounded-xl border border-[var(--talos-border)] bg-[var(--talos-panel)] pl-9 pr-3 text-sm text-[var(--talos-text)] outline-none focus-visible:ring-2 focus-visible:ring-[var(--talos-ring)]"
                >
            </div>
            <!-- Owner 2026-07-27, asked twice: entering selection only by
                 holding a row meant nobody found it. Top right of the header,
                 where a select control is looked for, and hidden while the mode
                 is on because the bar below already owns the exit. -->
            <Button
                v-if="!bulk.active.value && (filtered.length || archived.length)"
                type="button"
                size="icon"
                variant="ghost"
                data-testid="talos-chats-select-header"
                :aria-label="t('chats.selectChats')"
                class="min-h-touch min-w-touch shrink-0 rounded-xl"
                @click="bulk.enter()"
            >
                <CheckSquare class="size-5" aria-hidden="true" />
            </Button>

            <!-- Embedded (tablet panel): compact inline New keeps the narrow
                 panel tidy. Full-page uses the floating FAB (owner Claude-style). -->
            <Button
                v-if="props.embedded"
                type="button"
                data-testid="talos-chats-new"
                :aria-label="t('chat.newChat')"
                class="talos-pressable min-h-touch gap-2 rounded-xl bg-[var(--talos-accent,var(--primary))] px-3 text-sm text-[var(--talos-accent-contrast,var(--primary-foreground))]"
                @click="newChat"
            >
                <MessageSquarePlus class="size-4" aria-hidden="true" />
                {{ t('chats.newShort') }}
            </Button>
        </div>

        <!-- Selection bar: replaces the hint while the mode is on, so the screen
             has ONE meaning at a time. -->
        <div
            v-if="bulk.active.value"
            data-testid="talos-chats-selection-bar"
            class="mx-5 mt-2 flex items-center gap-1 rounded-full border border-[var(--talos-border)] bg-[var(--talos-panel)] py-1 pl-1 pr-2"
        >
            <Button type="button" size="icon" variant="ghost" class="min-h-touch min-w-touch rounded-full" :aria-label="t('chats.cancelSelection')" @click="bulk.exit()"><X class="size-4" aria-hidden="true" /></Button>
            <span class="text-sm font-medium">{{ bulk.count.value === 1 ? t('chats.selectedOne') : t('chats.selected', { count: bulk.count.value }) }}</span>
            <Button type="button" variant="ghost" size="sm" class="ml-auto" @click="bulk.selectAll(selectableIds)">
                {{ bulk.allSelected(selectableIds) ? t('common.none') : t('library.all') }}
            </Button>
            <Button
                type="button"
                size="icon"
                variant="ghost"
                class="min-h-touch min-w-touch rounded-full text-[var(--talos-danger,#dc5b5b)]"
                data-testid="talos-chats-bulk-delete"
                :aria-label="t('chats.deleteSelected')"
                :disabled="bulk.count.value === 0 || actionBusy"
                @click="bulkDeleteOpen = true"
            ><Trash2 class="size-4" aria-hidden="true" /></Button>
        </div>
        <p v-else class="px-5 pt-2 text-2xs text-[var(--talos-muted)]">{{ t('chats.holdForActions') }}</p>

        <p
            v-if="actionError && renameTarget === null && deleteTarget === null"
            role="alert"
            class="px-5 pt-2 text-xs leading-5 text-[var(--talos-danger,#dc5b5b)]"
        >{{ actionError }}</p>

        <p v-if="!filtered.length && !archived.length" class="px-5 py-6 text-sm text-[var(--talos-muted)]">
            {{ query ? t('chats.noMatches') : t('chats.noChats') }}
        </p>

        <div v-else class="mt-1 flex-1 overflow-y-auto pb-[max(1rem,env(safe-area-inset-bottom))]">
            <ul class="px-2">
                <li
                    v-for="session in filtered"
                    :key="session.id"
                    data-testid="talos-chats-row"
                    :data-active="controller.chat.activeSession.value?.id === session.id ? 'true' : 'false'"
                    class="relative talos-holdable rounded-lg"
                    :class="controller.chat.activeSession.value?.id === session.id ? 'bg-[var(--talos-active)]' : ''"
                    :style="{ touchAction: 'pan-y' }"
                    @pointerdown="onRowPointerDown(session, false, $event)"
                    @pointermove="onRowPointerMove($event)"
                    @pointerup="onRowPointerEnd()"
                    @pointercancel="onRowPointerEnd()"
                    @click.capture="onRowClickCapture($event)"
                    @contextmenu.prevent
                >
                    <!-- ⋮ e' la via primaria: il tieni-premuto ora
                         seleziona, come nella Ricerca. Sta fuori dal
                         bottone che apre la chat, perche' due aree di
                         tocco annidate se ne mangiano una. -->
                    <div v-if="!bulk.active.value" class="absolute right-1 top-1 z-10">
                        <TalosRowActions
                            :test-id="`talos-chats-menu-${session.id}`"
                            :label="t('chats.actionsFor', { title: sessionTitle(session) })"
                            :items="menuFor({ archived: false })"
                            @select="(action) => act({ id: session.id, title: sessionTitle(session), archived: false }, action)"
                        />
                    </div>
                    <button
                        type="button"
                        data-testid="talos-chats-open"
                        class="talos-pressable flex min-h-13 w-full min-w-0 items-center gap-2 rounded-lg px-2 text-left"
                        :aria-pressed="bulk.active.value ? bulk.isSelected(session.id) : undefined"
                        @click="tapSession(session.id)"
                    >
                        <span v-if="bulk.active.value" class="flex size-5 shrink-0 items-center justify-center rounded-full border-2" :class="bulk.isSelected(session.id) ? 'border-[var(--talos-accent)] bg-[var(--talos-accent)] text-[var(--talos-accent-contrast,#000)]' : 'border-[var(--talos-border)]'" aria-hidden="true">
                            <Check v-if="bulk.isSelected(session.id)" class="size-3.5" />
                        </span>
                        <span class="flex min-w-0 flex-1 flex-col items-start">
                        <span class="w-full truncate text-sm text-[var(--talos-text)]">{{ sessionTitle(session) }}</span>
                        <span v-if="session.updated_at" class="text-2xs text-[var(--talos-muted)]">{{ updatedAt(session.updated_at) }}</span>
                        </span>
                    </button>
                </li>
            </ul>

            <!-- Archived chats: same hold gesture, quiet collapsible section -->
            <section v-if="archived.length" class="mt-3 px-2">
                <button
                    type="button"
                    data-testid="talos-chats-archived-toggle"
                    :aria-expanded="showArchived"
                    class="talos-pressable flex min-h-touch w-full items-center gap-2 rounded-xl px-2 text-left text-xs font-semibold uppercase tracking-wide text-[var(--talos-muted)]"
                    @click="showArchived = !showArchived"
                >
                    <ChevronDown class="size-4 transition-transform" :class="showArchived ? '' : '-rotate-90'" aria-hidden="true" />
                    {{ t('chats.archivedCount', { count: archived.length }) }}
                </button>
                <ul v-if="showArchived">
                    <li
                        v-for="session in archived"
                        :key="session.id"
                        data-testid="talos-chats-archived-row"
                        class="relative talos-holdable rounded-lg"
                        :style="{ touchAction: 'pan-y' }"
                        @pointerdown="onRowPointerDown(session, true, $event)"
                        @pointermove="onRowPointerMove($event)"
                        @pointerup="onRowPointerEnd()"
                        @pointercancel="onRowPointerEnd()"
                        @click.capture="onRowClickCapture($event)"
                        @contextmenu.prevent
                    >
                    <!-- ⋮ e' la via primaria: il tieni-premuto ora
                         seleziona, come nella Ricerca. Sta fuori dal
                         bottone che apre la chat, perche' due aree di
                         tocco annidate se ne mangiano una. -->
                    <div v-if="!bulk.active.value" class="absolute right-1 top-1 z-10">
                        <TalosRowActions
                            :test-id="`talos-chats-menu-${session.id}`"
                            :label="t('chats.actionsFor', { title: sessionTitle(session) })"
                            :items="menuFor({ archived: true })"
                            @select="(action) => act({ id: session.id, title: sessionTitle(session), archived: true }, action)"
                        />
                    </div>
                        <button
                            type="button"
                            data-testid="talos-chats-archived-open"
                            class="talos-pressable flex min-h-13 w-full min-w-0 items-center gap-2 rounded-lg px-2 text-left"
                            :aria-pressed="bulk.active.value ? bulk.isSelected(session.id) : undefined"
                            @click="tapSession(session.id)"
                        >
                            <span v-if="bulk.active.value" class="flex size-5 shrink-0 items-center justify-center rounded-full border-2" :class="bulk.isSelected(session.id) ? 'border-[var(--talos-accent)] bg-[var(--talos-accent)] text-[var(--talos-accent-contrast,#000)]' : 'border-[var(--talos-border)]'" aria-hidden="true">
                                <Check v-if="bulk.isSelected(session.id)" class="size-3.5" />
                            </span>
                            <span class="flex min-w-0 flex-1 flex-col items-start">
                            <span class="w-full truncate text-sm text-[var(--talos-muted)]">{{ sessionTitle(session) }}</span>
                            <span v-if="session.updated_at" class="text-2xs text-[var(--talos-muted)]">{{ updatedAt(session.updated_at) }}</span>
                            </span>
                        </button>
                    </li>
                </ul>
            </section>
        </div>

        <!-- Owner 2026-07-24 (Claude-style): floating New chat FAB, bottom-right
             thumb zone, on the full page only (the tablet panel keeps its
             inline New button). -->
        <div
            v-if="!props.embedded"
            class="sticky bottom-0 z-20 mt-auto flex justify-end bg-gradient-to-t from-[var(--talos-background)] via-[var(--talos-background)]/85 to-transparent px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-6"
        >
            <TalosMobileNewChatFab @click="newChat" />
        </div>

        <!-- F5.1 — hold dropdown: one menu for the held row -->
        

        <!-- F5.2: device-proven manual dialogs (reka-ui never rendered on
             the owner's WebView). -->
        <TalosMobileConfirmDialog
            v-if="renameTarget !== null"
            :title="t('chats.renameTitle')"
            :description="t('chat.renameDescription')"
            @close="renameTarget = null"
        >
            <input
                ref="renameInput"
                v-model="renameValue"
                :aria-label="t('chat.chatName')"
                class="min-h-touch w-full rounded-md border border-[var(--talos-border)] bg-[var(--talos-input,var(--talos-background))] px-3 text-sm text-[var(--talos-text)] outline-none focus:border-[var(--talos-accent)]"
                @keydown.enter.prevent="submitRename"
            >
            <p v-if="actionError" role="alert" class="text-xs leading-5 text-[var(--talos-danger,#dc5b5b)]">{{ actionError }}</p>
            <template #footer>
                <Button type="button" variant="ghost" @click="renameTarget = null"><X class="size-4" aria-hidden="true" /> {{ t('common.cancel') }}</Button>
                <Button type="button" :disabled="!renameValue.trim() || actionBusy" @click="submitRename">
                    <Check class="size-4" aria-hidden="true" /> {{ t('common.save') }}
                </Button>
            </template>
        </TalosMobileConfirmDialog>

        <TalosMobileDeleteChatDialog
            v-if="deleteTarget !== null"
            :title="deleteTarget?.title ?? ''"
            :plan="deletePlan"
            :busy="actionBusy"
            @close="deleteTarget = null"
            @confirm="confirmDelete"
        />

        <TalosMobileConfirmDialog
            v-if="bulkDeleteOpen"
            :title="t('chats.bulkDeleteTitle')"
            :description="bulkDeleteDescription()"
            @close="actionBusy ? undefined : bulkDeleteOpen = false"
        >
            <label
                v-if="talosCleanupCount(bulkPlan) > 0"
                class="talos-pressable flex min-h-touch items-start gap-3 rounded-lg px-1 py-2 text-left"
                :class="actionBusy ? 'pointer-events-none opacity-60' : ''"
                data-testid="talos-chats-bulk-media"
            >
                <input v-model="bulkDeleteMedia" type="checkbox" class="mt-0.5 size-4 shrink-0 accent-[var(--talos-danger,#dc5b5b)]" :disabled="actionBusy">
                <span class="text-sm leading-5">
                    {{ t('chats.bulkDeleteFiles') }}
                    <span class="block text-xs text-[var(--talos-muted)]">{{ cleanupDescription(bulkPlan) }} {{ t('chats.inLibrary') }}</span>
                </span>
            </label>
            <template #footer>
                <Button type="button" variant="ghost" :disabled="actionBusy" @click="bulkDeleteOpen = false"><X class="size-4" aria-hidden="true" /> {{ t('common.cancel') }}</Button>
                <Button type="button" variant="destructive" :class="TALOS_DANGER_ACTION_CLASS" data-testid="talos-chats-bulk-delete-confirm" :disabled="actionBusy" @click="confirmBulkDelete">
                    <LoaderCircle v-if="actionBusy" class="size-4 motion-safe:animate-spin" aria-hidden="true" />
                    <Trash2 v-else class="size-4" aria-hidden="true" />
                    {{ actionBusy ? t('chat.deleting') : t('common.delete') }}
                </Button>
            </template>
        </TalosMobileConfirmDialog>
    </div>
</template>
