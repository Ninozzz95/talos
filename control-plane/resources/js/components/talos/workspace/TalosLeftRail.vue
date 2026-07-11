<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import {
    Activity,
    Archive,
    BarChart3,
    BookOpen,
    Globe2,
    Brain,
    CalendarDays,
    CheckSquare,
    ChevronDown,
    ChevronLeft,
    ChevronRight,
    Copy,
    FileArchive,
    Folder,
    FolderInput,
    FlaskConical,
    Image,
    ListTodo,
    MessageSquarePlus,
    Moon,
    MoreHorizontal,
    NotebookPen,
    Palette,
    Pencil,
    Search,
    Settings,
    Square,
    Star,
    Stethoscope,
    Sun,
    Trash2,
    Wrench,
    X,
} from '@lucide/vue'
import Button from '../../ui/Button.vue'
import TalosAdvancedRailGroup, { type TalosAdvancedRailItem } from './TalosAdvancedRailGroup.vue'
import { sessionChatState } from '../../../composables/useTalosSessions'
import { talosThemeIsLight, type TalosThemeId } from '../../../lib/talosThemes'
import type { TalosSession } from '../../../lib/talosTypes'

type RailItem = {
    id: string
    label: string
    description: string
    icon: unknown
    disabledReason?: string
}

const emit = defineEmits<{
    open: [id: string, event?: PointerEvent]
    newChat: []
    selectSession: [session: TalosSession]
    toggleTheme: []
    collapse: []
    expand: []
    resizeStart: [event: PointerEvent]
    renameSession: [session: TalosSession, title: string]
    favoriteSession: [session: TalosSession]
    toggleSessionSelected: [session: TalosSession]
    archiveSession: [session: TalosSession]
    moveSessionToFolder: [session: TalosSession, folder: string]
    deleteSession: [session: TalosSession]
    copySession: [session: TalosSession]
    toggleAdvanced: []
    closeMobile: []
}>()

const primaryItems: RailItem[] = [
    { id: 'runtime', label: 'Runtime', description: 'Runs, replay and recovery.', icon: Activity },
    { id: 'calendar', label: 'Calendar', description: 'Calendar drafts.', icon: CalendarDays },
    { id: 'compare', label: 'Compare', description: 'AVM ON/OFF benchmark evidence.', icon: BarChart3 },
    { id: 'model_lab', label: 'Model Lab', description: 'Cookbook previews, provider profiles and probes.', icon: FlaskConical },
    { id: 'research', label: 'Deep Research', description: 'Research reports and claims.', icon: BookOpen },
    { id: 'gallery', label: 'Artifacts', description: 'Run artifacts and previews.', icon: Image },
    { id: 'library', label: 'Library', description: 'Documents and file context.', icon: FileArchive },
    { id: 'browse', label: 'Browse', description: 'Read-only browser evidence.', icon: Globe2 },
]

const advancedItems: TalosAdvancedRailItem[] = [
    { id: 'tasks', label: 'Tasks', description: 'Persisted task queue.', icon: ListTodo },
    { id: 'notes', label: 'Notes', description: 'Untrusted notes with provenance.', icon: NotebookPen },
    { id: 'search', label: 'Knowledge', description: 'Persisted files, context sets and generated documents.', icon: Search },
    { id: 'brain', label: 'Brain', description: 'Memory and approved skills.', icon: Brain },
    { id: 'tools', label: 'Tools', description: 'Connector and tool registry.', icon: Wrench },
    { id: 'doctor', label: 'Doctor', description: 'Control-plane readiness.', icon: Stethoscope },
]

const systemItems: RailItem[] = [
    { id: 'settings', label: 'Settings', description: 'Workspace setup and appearance.', icon: Settings },
    { id: 'theme', label: 'Theme', description: 'Local theme switcher.', icon: Palette },
]

const props = defineProps<{
    activeIds: string[]
    theme: TalosThemeId
    creatingSession?: boolean
    collapsed?: boolean
    width: number
    visibility: Record<string, boolean>
    sessions: TalosSession[]
    activeSessionId?: string | null
    advancedExpanded?: boolean
    mobileOpen?: boolean
}>()

const effectiveCollapsed = computed(() => props.mobileOpen ? false : Boolean(props.collapsed))
const railStyle = computed(() => ({
    width: `${effectiveCollapsed.value ? 64 : props.width}px`,
    maxWidth: props.mobileOpen ? '88vw' : undefined,
}))
const openMenuRowKey = ref<string | null>(null)
const openMenuSession = ref<TalosSession | null>(null)
const menuElement = ref<HTMLElement | null>(null)
const railElement = ref<HTMLElement | null>(null)
const menuPosition = ref({ left: 8, top: 8 })
const menuThemeStyle = ref<Record<string, string>>({})
const renamingRowKey = ref<string | null>(null)
const movingRowKey = ref<string | null>(null)
const renameValue = ref('')
const folderValue = ref('')
const collapsedGroups = ref<Record<string, boolean>>({})
const lightThemeActive = computed(() => talosThemeIsLight(props.theme))
let returnFocusTarget: HTMLElement | null = null
let backgroundIsolation: { element: HTMLElement; ariaHidden: string | null; hadInert: boolean } | null = null
const visiblePrimaryItems = computed(() => primaryItems.filter((item) => {
    if (item.id === 'search') {
        return props.visibility.search !== false || props.visibility.library !== false
    }
    if (item.id === 'model_lab') {
        return props.visibility.models !== false || props.visibility.cookbook !== false
    }
    if (item.id === 'research') {
        return props.visibility.deep_research !== false
    }
    if (item.id === 'gallery') {
        return props.visibility.gallery !== false
    }
    if (item.id === 'library') {
        return props.visibility.library !== false
    }

    return props.visibility[item.id] !== false
}))
const visibleSystemItems = computed(() => systemItems.filter((item) => {
    if (item.id === 'settings') {
        return props.visibility.settings_button !== false
    }

    return props.visibility[item.id] !== false
}))
const visibleAdvancedItems = computed(() => advancedItems.filter((item) => {
    if (item.id === 'search') return props.visibility.search !== false || props.visibility.library !== false
    return props.visibility[item.id] !== false
}))
const activeAdvanced = computed(() => visibleAdvancedItems.value.some((item) => props.activeIds.includes(item.id)))

const chatSessions = computed(() => props.sessions.filter((session) => session.persistence_mode !== 'temporary'))
const visibleSessions = computed(() => chatSessions.value.slice(0, 24))
const sessionGroups = computed(() => {
    const favorites = visibleSessions.value.filter((session) => sessionChatState(session).favorite && !sessionChatState(session).archived)
    const archived = visibleSessions.value.filter((session) => sessionChatState(session).archived)
    const folders = new Map<string, TalosSession[]>()

    for (const session of visibleSessions.value) {
        const state = sessionChatState(session)
        if (state.archived || !state.folder) {
            continue
        }

        folders.set(state.folder, [...(folders.get(state.folder) ?? []), session])
    }

    const recent = visibleSessions.value.filter((session) => {
        const state = sessionChatState(session)

        return !state.archived && !state.favorite && !state.folder
    })
    const groups: Array<{ id: string; label: string; sessions: TalosSession[] }> = []

    if (favorites.length > 0) {
        groups.push({ id: 'favorites', label: 'Favorites', sessions: favorites })
    }

    for (const [folder, sessions] of [...folders.entries()].sort(([left], [right]) => left.localeCompare(right))) {
        groups.push({ id: `folder-${folder}`, label: folder, sessions })
    }

    if (recent.length > 0) {
        groups.push({ id: 'recent', label: 'Recent', sessions: recent })
    }

    if (archived.length > 0) {
        groups.push({ id: 'archived', label: 'Archived', sessions: archived })
    }

    return groups
})

function sessionTimestamp(session: TalosSession) {
    const value = Date.parse(session.updated_at || session.created_at)
    if (!Number.isFinite(value)) {
        return ''
    }

    return new Intl.DateTimeFormat(undefined, {
        month: 'short',
        day: 'numeric',
    }).format(value)
}

function groupTestId(groupId: string) {
    if (groupId === 'favorites') {
        return 'talos-session-folder-favorites'
    }
    if (groupId === 'archived') {
        return 'talos-session-folder-archived'
    }
    if (groupId.startsWith('folder-')) {
        return `talos-session-folder-${groupId.slice(7).replace(/[^A-Za-z0-9_-]/g, '-')}`
    }

    return 'talos-session-folder-recent'
}

function groupOpen(groupId: string) {
    return collapsedGroups.value[groupId] !== true
}

function sessionRowKey(groupId: string, sessionId: string) {
    return `${groupId}:${sessionId}`
}

function toggleGroup(groupId: string) {
    collapsedGroups.value = {
        ...collapsedGroups.value,
        [groupId]: groupOpen(groupId),
    }
}

async function positionSessionMenu(trigger: HTMLElement) {
    const viewportPadding = 8
    const gap = 4
    const triggerRect = trigger.getBoundingClientRect()
    const triggerStyle = window.getComputedStyle(trigger)
    const menuWidth = 192
    menuThemeStyle.value = {
        '--talos-card': triggerStyle.getPropertyValue('--talos-card').trim(),
        '--talos-border': triggerStyle.getPropertyValue('--talos-border').trim(),
        '--talos-text': triggerStyle.getPropertyValue('--talos-text').trim(),
        '--talos-muted': triggerStyle.getPropertyValue('--talos-muted').trim(),
        '--talos-accent': triggerStyle.getPropertyValue('--talos-accent').trim(),
        '--talos-panel-soft': triggerStyle.getPropertyValue('--talos-panel-soft').trim(),
        '--talos-ring': triggerStyle.getPropertyValue('--talos-ring').trim(),
        '--talos-font-ui': triggerStyle.getPropertyValue('--talos-font-ui').trim(),
    }
    const left = Math.min(
        Math.max(viewportPadding, triggerRect.right - menuWidth),
        window.innerWidth - menuWidth - viewportPadding,
    )

    menuPosition.value = {
        left,
        top: Math.min(triggerRect.bottom + gap, window.innerHeight - viewportPadding),
    }
    await nextTick()

    const menuHeight = menuElement.value?.getBoundingClientRect().height ?? 0
    const preferredTop = triggerRect.bottom + gap
    const flippedTop = triggerRect.top - menuHeight - gap
    menuPosition.value = {
        left,
        top: preferredTop + menuHeight <= window.innerHeight - viewportPadding
            ? preferredTop
            : Math.max(viewportPadding, flippedTop),
    }
}

async function toggleSessionMenu(rowKey: string, session: TalosSession, event: MouseEvent) {
    if (openMenuRowKey.value === rowKey) {
        closeSessionMenu()
        return
    }

    openMenuRowKey.value = rowKey
    openMenuSession.value = session
    renamingRowKey.value = null
    movingRowKey.value = null
    await positionSessionMenu(event.currentTarget as HTMLElement)
    menuElement.value?.querySelector<HTMLElement>('[role="menuitem"]')?.focus()
}

function closeSessionMenu() {
    openMenuRowKey.value = null
    openMenuSession.value = null
}

const sessionMenuStyle = computed(() => ({
    ...menuThemeStyle.value,
    left: `${menuPosition.value.left}px`,
    top: `${menuPosition.value.top}px`,
    fontFamily: 'var(--talos-font-ui)',
}))

function handleGlobalPointerDown(event: PointerEvent) {
    const target = event.target as HTMLElement | null
    if (!target || menuElement.value?.contains(target) || target.closest('[data-talos-session-menu-trigger="true"]')) {
        return
    }
    closeSessionMenu()
}

function handleGlobalKeyDown(event: KeyboardEvent) {
    if (!props.mobileOpen) {
        if (event.key === 'Escape') closeSessionMenu()
        return
    }

    if (event.key === 'Escape') {
        event.preventDefault()
        closeSessionMenu()
        emit('closeMobile')
        return
    }

    if (event.key !== 'Tab') return

    const focusable = focusableElements()
    if (!focusable.length) {
        event.preventDefault()
        railElement.value?.focus()
        return
    }

    const first = focusable[0]
    const last = focusable[focusable.length - 1]
    if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
    } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
    }
}

function focusableElements() {
    if (!railElement.value) return []

    return Array.from(railElement.value.querySelectorAll<HTMLElement>(
        'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
    )).filter((element) => !element.hasAttribute('hidden') && element.getAttribute('aria-hidden') !== 'true')
}

function isolateMobileHistoryBackground() {
    const background = document.querySelector<HTMLElement>('.talos-chat-scroll-root')
    if (!background || backgroundIsolation) return

    backgroundIsolation = {
        element: background,
        ariaHidden: background.getAttribute('aria-hidden'),
        hadInert: background.hasAttribute('inert'),
    }
    background.setAttribute('inert', '')
    background.setAttribute('aria-hidden', 'true')
}

function restoreMobileHistoryBackground() {
    if (!backgroundIsolation) return

    const { element, ariaHidden, hadInert } = backgroundIsolation
    if (!hadInert) element.removeAttribute('inert')
    if (ariaHidden === null) element.removeAttribute('aria-hidden')
    else element.setAttribute('aria-hidden', ariaHidden)
    backgroundIsolation = null
}

watch(() => props.mobileOpen, async (open) => {
    if (open) {
        returnFocusTarget = document.activeElement instanceof HTMLElement ? document.activeElement : null
        await nextTick()
        isolateMobileHistoryBackground()
        railElement.value?.querySelector<HTMLElement>('[aria-label="Close chat history"]')?.focus()
        return
    }

    restoreMobileHistoryBackground()
    await nextTick()
    if (returnFocusTarget?.isConnected) returnFocusTarget.focus()
    returnFocusTarget = null
})

function handleViewportChange() {
    closeSessionMenu()
}

onMounted(() => {
    document.addEventListener('pointerdown', handleGlobalPointerDown)
    document.addEventListener('keydown', handleGlobalKeyDown)
    window.addEventListener('scroll', handleViewportChange, true)
    window.addEventListener('resize', handleViewportChange)
})

onBeforeUnmount(() => {
    restoreMobileHistoryBackground()
    document.removeEventListener('pointerdown', handleGlobalPointerDown)
    document.removeEventListener('keydown', handleGlobalKeyDown)
    window.removeEventListener('scroll', handleViewportChange, true)
    window.removeEventListener('resize', handleViewportChange)
})

function startRename(session: TalosSession, rowKey: string) {
    renameValue.value = session.title || 'Untitled chat'
    renamingRowKey.value = rowKey
    movingRowKey.value = null
    closeSessionMenu()
}

function submitRename(session: TalosSession) {
    emit('renameSession', session, renameValue.value)
    renamingRowKey.value = null
}

function startMove(session: TalosSession, rowKey: string) {
    folderValue.value = sessionChatState(session).folder
    movingRowKey.value = rowKey
    renamingRowKey.value = null
    closeSessionMenu()
}

function submitMove(session: TalosSession) {
    emit('moveSessionToFolder', session, folderValue.value)
    movingRowKey.value = null
}

function deleteWithConfirmation(session: TalosSession) {
    closeSessionMenu()
    emit('deleteSession', session)
}

function selectChatSession(session: TalosSession) {
    emit('selectSession', session)
    if (props.mobileOpen) emit('closeMobile')
}

function openRailItem(id: string, event?: PointerEvent) {
    emit('open', id, event)
    if (props.mobileOpen) emit('closeMobile')
}

function startNewChat() {
    emit('newChat')
    if (props.mobileOpen) emit('closeMobile')
}
</script>

<template>
    <div
        v-if="mobileOpen"
        class="fixed inset-0 z-[65] bg-black/45 backdrop-blur-[1px] lg:hidden"
        aria-hidden="true"
        @click="emit('closeMobile')"
    ></div>
    <aside
        ref="railElement"
        class="talos-left-rail h-[100dvh] shrink-0 border-r border-[var(--talos-border)] bg-[var(--talos-sidebar)] py-2 lg:relative lg:z-30 lg:flex lg:h-screen lg:flex-col"
        :class="[mobileOpen ? 'fixed inset-y-0 left-0 z-[70] flex flex-col shadow-2xl' : 'hidden', effectiveCollapsed ? 'px-2' : 'px-2.5']"
        :style="railStyle"
        :data-sidebar-state="effectiveCollapsed ? 'collapsed' : 'expanded'"
        :role="mobileOpen ? 'dialog' : undefined"
        :aria-modal="mobileOpen ? 'true' : undefined"
        :aria-labelledby="mobileOpen ? 'talos-mobile-history-title' : undefined"
        :tabindex="mobileOpen ? -1 : undefined"
        data-testid="talos-mobile-history-dialog"
        aria-label="TALOS workspace rail"
    >
        <h2 v-if="mobileOpen" id="talos-mobile-history-title" class="sr-only">Chat history</h2>
        <div class="flex items-center gap-2 px-1" :class="effectiveCollapsed ? 'justify-center' : 'justify-between'">
            <div v-if="!effectiveCollapsed && visibility.brand_name !== false" data-testid="talos-rail-brand" class="flex min-w-0 flex-1 items-center gap-2">
                <span data-testid="talos-rail-brand-logo" class="talos-short-logo talos-short-logo-compact" aria-hidden="true">
                    <span class="talos-short-logo-mark"></span>
                </span>
                <div data-testid="talos-rail-brand-copy" class="min-w-0">
                    <div class="text-xs font-semibold uppercase text-[var(--talos-muted)]">AVM</div>
                    <div class="talos-orbitron-brand truncate text-base font-semibold leading-5 text-[var(--talos-text)]">TALOS</div>
                </div>
            </div>
            <button
                type="button"
                class="inline-flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-md border border-[var(--talos-border)] bg-[var(--talos-panel)] text-[var(--talos-muted)] transition hover:border-[var(--talos-accent-border)] hover:bg-[var(--talos-panel-soft)] hover:text-[var(--talos-text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--talos-ring)]"
                :aria-label="mobileOpen ? 'Close chat history' : effectiveCollapsed ? 'Expand sidebar' : 'Collapse sidebar'"
                @click="mobileOpen ? emit('closeMobile') : effectiveCollapsed ? emit('expand') : emit('collapse')"
            >
                <X v-if="mobileOpen" class="h-4 w-4" />
                <ChevronRight v-else-if="effectiveCollapsed" class="h-4 w-4" />
                <ChevronLeft v-else class="h-4 w-4" />
            </button>
        </div>

        <Button
            v-if="visibility.new_chat !== false"
            class="mt-3 w-full"
            :class="effectiveCollapsed ? 'cursor-pointer justify-center px-0' : 'cursor-pointer justify-start'"
            size="sm"
            :disabled="creatingSession"
            aria-label="New Chat"
            @click="startNewChat"
        >
            <MessageSquarePlus class="h-4 w-4" />
            <span v-if="!effectiveCollapsed">New Chat</span>
        </Button>

        <section
            v-if="!effectiveCollapsed && visibility.chats !== false"
            data-testid="talos-session-history"
            class="mt-3 border-t border-[var(--talos-border)] pt-3"
            aria-label="Chat history"
        >
            <div class="mb-2 flex items-center justify-between gap-2 px-1">
                <span class="text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--talos-muted)]">Chats</span>
                <span class="text-[10px] font-medium text-[var(--talos-muted)]">{{ visibleSessions.length }}</span>
            </div>
            <div v-if="sessionGroups.length" class="max-h-56 space-y-2 overflow-y-auto pr-1">
                <div
                    v-for="group in sessionGroups"
                    :key="group.id"
                    :data-testid="groupTestId(group.id)"
                    class="space-y-0.5"
                >
                    <button
                        type="button"
                        class="flex w-full cursor-pointer items-center justify-between rounded-md px-1 py-1 text-left text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--talos-muted)] transition hover:bg-[var(--talos-panel-soft)] hover:text-[var(--talos-text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--talos-ring)]"
                        :aria-expanded="groupOpen(group.id)"
                        @click="toggleGroup(group.id)"
                    >
                        <span class="flex min-w-0 items-center gap-1.5">
                            <Folder v-if="group.id.startsWith('folder-')" class="h-3.5 w-3.5 text-[var(--talos-accent)]" />
                            <ChevronDown class="h-3.5 w-3.5 transition" :class="groupOpen(group.id) ? '' : '-rotate-90'" />
                            <span class="truncate">{{ group.label }}</span>
                        </span>
                        <span>{{ group.sessions.length }}</span>
                    </button>
                    <div v-if="groupOpen(group.id)" class="space-y-0.5">
                        <div
                            v-for="session in group.sessions"
                            :key="`${group.id}-${session.id}`"
                            class="relative rounded-md"
                        >
                            <div
                                class="group flex items-center gap-1 rounded-md border transition"
                                :class="activeSessionId === session.id ? 'border-[var(--talos-accent-border)] bg-[var(--talos-accent-soft)] text-[var(--talos-text)]' : 'border-transparent text-[var(--talos-muted)] hover:border-[var(--talos-border)] hover:bg-[var(--talos-panel-soft)] hover:text-[var(--talos-text)]'"
                            >
                                <button
                                    type="button"
                                    class="flex min-w-0 flex-1 cursor-pointer items-center justify-between gap-2 px-2 py-1.5 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--talos-ring)]"
                                    :aria-current="activeSessionId === session.id ? 'page' : undefined"
                                    :aria-label="`Open chat ${session.title || 'Untitled chat'}`"
                                    @click="selectChatSession(session)"
                                >
                                    <span class="min-w-0">
                                        <span class="flex min-w-0 items-center gap-1">
                                            <CheckSquare v-if="sessionChatState(session).selected" class="h-3.5 w-3.5 shrink-0 text-[var(--talos-accent)]" />
                                            <span class="block truncate text-[12px] font-medium">{{ session.title || 'Untitled chat' }}</span>
                                        </span>
                                        <span class="block truncate text-[10px] text-[var(--talos-muted)]">
                                            {{ sessionChatState(session).archived ? 'Archived' : (sessionChatState(session).folder || 'Persistent') }}
                                        </span>
                                    </span>
                                    <span class="shrink-0 text-[10px] text-[var(--talos-muted)]">{{ sessionTimestamp(session) }}</span>
                                </button>
                                <button
                                    type="button"
                                    data-talos-session-menu-trigger="true"
                                    class="mr-1 inline-flex h-7 w-7 shrink-0 cursor-pointer items-center justify-center rounded-md text-[var(--talos-muted)] opacity-80 transition hover:bg-[var(--talos-panel)] hover:text-[var(--talos-text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--talos-ring)] group-hover:opacity-100"
                                    :aria-label="`Chat actions for ${session.title || 'Untitled chat'}`"
                                    aria-haspopup="menu"
                                    :aria-expanded="openMenuRowKey === sessionRowKey(group.id, session.id)"
                                    @click.stop="toggleSessionMenu(sessionRowKey(group.id, session.id), session, $event)"
                                >
                                    <MoreHorizontal class="h-4 w-4" />
                                </button>
                            </div>
                            <form
                                v-if="renamingRowKey === sessionRowKey(group.id, session.id)"
                                class="mt-1 rounded-md border border-[var(--talos-border)] bg-[var(--talos-panel)] p-2"
                                @submit.prevent="submitRename(session)"
                            >
                                <label class="sr-only" :for="`rename-chat-${session.id}`">Rename chat</label>
                                <input
                                    :id="`rename-chat-${session.id}`"
                                    v-model="renameValue"
                                    aria-label="Rename chat"
                                    class="h-8 w-full rounded-md border border-[var(--talos-border)] bg-[var(--talos-input)] px-2 text-xs text-[var(--talos-text)] outline-none focus:border-[var(--talos-accent)]"
                                />
                                <div class="mt-2 flex justify-end gap-1">
                                    <button type="button" class="rounded px-2 py-1 text-[11px] text-[var(--talos-muted)] hover:bg-[var(--talos-panel-soft)]" @click="renamingRowKey = null">Cancel</button>
                                    <button type="submit" class="rounded bg-[var(--talos-accent)] px-2 py-1 text-[11px] font-semibold text-[var(--talos-accent-text)]">Save name</button>
                                </div>
                            </form>
                            <form
                                v-if="movingRowKey === sessionRowKey(group.id, session.id)"
                                class="mt-1 rounded-md border border-[var(--talos-border)] bg-[var(--talos-panel)] p-2"
                                @submit.prevent="submitMove(session)"
                            >
                                <label class="sr-only" :for="`folder-chat-${session.id}`">Folder name</label>
                                <input
                                    :id="`folder-chat-${session.id}`"
                                    v-model="folderValue"
                                    aria-label="Folder name"
                                    placeholder="Folder name"
                                    class="h-8 w-full rounded-md border border-[var(--talos-border)] bg-[var(--talos-input)] px-2 text-xs text-[var(--talos-text)] outline-none focus:border-[var(--talos-accent)]"
                                />
                                <div class="mt-2 flex justify-end gap-1">
                                    <button type="button" class="rounded px-2 py-1 text-[11px] text-[var(--talos-muted)] hover:bg-[var(--talos-panel-soft)]" @click="movingRowKey = null">Cancel</button>
                                    <button type="submit" class="rounded bg-[var(--talos-accent)] px-2 py-1 text-[11px] font-semibold text-[var(--talos-accent-text)]">Move chat</button>
                                </div>
                            </form>
                        </div>
                    </div>
                </div>
            </div>
            <p v-else class="px-1 text-xs leading-5 text-[var(--talos-muted)]">No chats yet.</p>
        </section>

        <Teleport to="body">
            <div
                v-if="openMenuRowKey && openMenuSession"
                ref="menuElement"
                role="menu"
                aria-label="Chat actions"
                :style="sessionMenuStyle"
                class="fixed z-[90] max-h-[calc(100dvh-1rem)] w-48 overflow-y-auto rounded-md border border-[var(--talos-border)] bg-[var(--talos-card)] p-1 text-[12px] text-[var(--talos-text)] shadow-xl"
            >
                <button type="button" role="menuitem" class="flex w-full cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-left hover:bg-[var(--talos-panel-soft)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--talos-ring)]" @click="startRename(openMenuSession, openMenuRowKey)">
                    <Pencil class="h-3.5 w-3.5 text-[var(--talos-accent)]" /> Rename
                </button>
                <button type="button" role="menuitem" class="flex w-full cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-left hover:bg-[var(--talos-panel-soft)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--talos-ring)]" @click="emit('favoriteSession', openMenuSession); closeSessionMenu()">
                    <Star class="h-3.5 w-3.5 text-[var(--talos-accent)]" /> {{ sessionChatState(openMenuSession).favorite ? 'Unfavorite' : 'Favorite' }}
                </button>
                <button type="button" role="menuitem" class="flex w-full cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-left hover:bg-[var(--talos-panel-soft)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--talos-ring)]" @click="emit('toggleSessionSelected', openMenuSession); closeSessionMenu()">
                    <component :is="sessionChatState(openMenuSession).selected ? CheckSquare : Square" class="h-3.5 w-3.5 text-[var(--talos-accent)]" /> Select
                </button>
                <button type="button" role="menuitem" class="flex w-full cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-left hover:bg-[var(--talos-panel-soft)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--talos-ring)]" @click="emit('copySession', openMenuSession); closeSessionMenu()">
                    <Copy class="h-3.5 w-3.5 text-[var(--talos-accent)]" /> Copy Chat
                </button>
                <button type="button" role="menuitem" class="flex w-full cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-left hover:bg-[var(--talos-panel-soft)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--talos-ring)]" @click="startMove(openMenuSession, openMenuRowKey)">
                    <FolderInput class="h-3.5 w-3.5 text-[var(--talos-accent)]" /> Move to folder
                </button>
                <button type="button" role="menuitem" class="flex w-full cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-left hover:bg-[var(--talos-panel-soft)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--talos-ring)]" @click="emit('archiveSession', openMenuSession); closeSessionMenu()">
                    <Archive class="h-3.5 w-3.5 text-[var(--talos-accent)]" /> Archive
                </button>
                <button type="button" role="menuitem" class="flex w-full cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-left text-[var(--talos-danger)] hover:bg-[var(--talos-danger-soft)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--talos-danger)]" @click="deleteWithConfirmation(openMenuSession)">
                    <Trash2 class="h-3.5 w-3.5" /> Delete
                </button>
            </div>
        </Teleport>

        <nav class="mt-3 min-h-0 flex-1 space-y-0.5 overflow-y-auto pr-1" aria-label="TALOS modules">
            <button
                v-for="item in visiblePrimaryItems"
                :key="item.id"
                type="button"
                class="group flex w-full cursor-pointer items-center rounded-md border text-left transition hover:shadow-[inset_2px_0_0_var(--talos-accent)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--talos-ring)] disabled:cursor-not-allowed disabled:opacity-60"
                :class="[
                    effectiveCollapsed ? 'justify-center px-0 py-2' : 'gap-2.5 px-2 py-1.5',
                    activeIds.includes(item.id)
                        ? 'border-[var(--talos-accent-border)] bg-[var(--talos-accent-soft)] text-[var(--talos-text)]'
                        : 'border-transparent text-[var(--talos-muted)] hover:border-[var(--talos-border)] hover:bg-[var(--talos-panel-soft)] hover:text-[var(--talos-text)]',
                ]"
                :aria-pressed="activeIds.includes(item.id)"
                :aria-label="item.label"
                :title="item.disabledReason || item.description"
                :disabled="Boolean(item.disabledReason)"
                @click="openRailItem(item.id, $event)"
            >
                <component :is="item.icon" class="h-4 w-4 shrink-0 text-[var(--talos-accent)]" />
                <span v-if="!effectiveCollapsed" class="min-w-0">
                    <span class="block truncate text-[13px] font-medium">{{ item.label }}</span>
                    <span class="sr-only">{{ item.description }}</span>
                </span>
            </button>
            <TalosAdvancedRailGroup
                v-if="visibleAdvancedItems.length"
                :items="visibleAdvancedItems"
                :active-ids="activeIds"
                :collapsed="effectiveCollapsed"
                :expanded="Boolean(advancedExpanded || activeAdvanced)"
                id="talos-advanced-items-desktop"
                @toggle="emit('toggleAdvanced')"
                @open="openRailItem"
            />
        </nav>

        <div class="mt-2 border-t border-[var(--talos-border)] pt-2">
            <div class="space-y-0.5">
                <button
                    v-for="item in visibleSystemItems"
                    :key="item.id"
                    type="button"
                    class="flex w-full cursor-pointer items-center rounded-md border border-transparent text-left text-[13px] text-[var(--talos-muted)] transition hover:border-[var(--talos-border)] hover:bg-[var(--talos-panel-soft)] hover:text-[var(--talos-text)] hover:shadow-[inset_2px_0_0_var(--talos-accent)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--talos-ring)]"
                    :class="effectiveCollapsed ? 'justify-center px-0 py-2' : 'gap-2.5 px-2 py-1.5'"
                    :aria-pressed="activeIds.includes(item.id)"
                    :aria-label="item.label"
                    :title="item.description"
                    @click="openRailItem(item.id, $event)"
                >
                    <component :is="item.icon" class="h-4 w-4 shrink-0 text-[var(--talos-accent)]" />
                    <span v-if="!effectiveCollapsed" class="truncate">{{ item.label }}</span>
                </button>
            </div>

            <button
                v-if="visibility.theme !== false"
                type="button"
                class="mt-2 flex w-full cursor-pointer items-center rounded-md border border-[var(--talos-border)] bg-[var(--talos-panel)] py-2 text-[13px] text-[var(--talos-text)] transition hover:border-[var(--talos-accent)] hover:bg-[var(--talos-panel-soft)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--talos-ring)]"
                :class="effectiveCollapsed ? 'justify-center px-0' : 'justify-between px-2.5'"
                aria-label="Toggle theme"
                @click="emit('toggleTheme')"
            >
                <span v-if="!effectiveCollapsed">Theme</span>
                <Moon v-if="lightThemeActive" class="h-4 w-4" />
                <Sun v-else class="h-4 w-4" />
            </button>
        </div>
        <button
            v-if="!effectiveCollapsed"
            type="button"
            class="absolute -right-1 top-0 hidden h-full w-2 cursor-col-resize rounded-full border-0 bg-transparent outline-none transition hover:bg-[var(--talos-accent)]/30 focus-visible:bg-[var(--talos-accent)]/30 lg:block"
            aria-label="Resize sidebar"
            @pointerdown.prevent="emit('resizeStart', $event)"
        ></button>
    </aside>
</template>
