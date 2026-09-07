<script setup lang="ts">
import { computed, defineAsyncComponent, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import {
    Activity,
    BarChart3,
    BookOpen,
    Globe2,
    Brain,
    CalendarDays,
    CheckSquare,
    ChevronDown,
    ChevronLeft,
    ChevronRight,
    FileArchive,
    Folder,
    FlaskConical,
    Image,
    ListTodo,
    MessageSquarePlus,
    Moon,
    NotebookPen,
    Palette,
    Search,
    Settings,
    Stethoscope,
    Sun,
    Wrench,
    X,
} from '@lucide/vue'
import Button from '../../ui/Button.vue'
import Chip from '../../ui/Chip.vue'
import TalosAdvancedRailGroup, { type TalosAdvancedRailItem } from './TalosAdvancedRailGroup.vue'
import TalosSessionEditDialog from './TalosSessionEditDialog.vue'

const TalosSessionRowMenu = defineAsyncComponent(() => import('./TalosSessionRowMenu.vue'))
import { sessionChatState } from '../../../composables/useTalosSessions'
import { talosThemeIsLight, type TalosThemeId } from '../../../lib/talosThemes'
import type { TalosSession } from '../../../lib/talosTypes'

type RailItem = {
    id: string
    label: string
    code: string
    description: string
    icon: unknown
    disabledReason?: string
}

const emit = defineEmits<{
    open: [id: string, event?: PointerEvent]
    moveItem: [id: string, delta: number]
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
    { id: 'runtime', label: 'Cockpit', code: 'RUN', description: 'Runs, replay and recovery.', icon: Activity },
    { id: 'calendar', label: 'Calendar', code: 'CAL', description: 'Calendar drafts.', icon: CalendarDays },
    { id: 'compare', label: 'Benchmarks', code: 'BNC', description: 'AVM ON/OFF benchmark evidence.', icon: BarChart3 },
    { id: 'model_lab', label: 'Model Lab', code: 'LAB', description: 'Cookbook previews, provider profiles and probes.', icon: FlaskConical },
    { id: 'research', label: 'Research', code: 'RES', description: 'Research reports and claims.', icon: BookOpen },
    { id: 'gallery', label: 'Artifacts', code: 'ART', description: 'Run artifacts and previews.', icon: Image },
    { id: 'library', label: 'Library', code: 'LIB', description: 'Documents and file context.', icon: FileArchive },
    { id: 'browse', label: 'Browse', code: 'BRW', description: 'Read-only browser evidence.', icon: Globe2 },
]

const advancedItems: TalosAdvancedRailItem[] = [
    { id: 'tasks', label: 'Tasks', description: 'Persisted task queue.', icon: ListTodo },
    { id: 'notes', label: 'Notes', description: 'Untrusted notes with provenance.', icon: NotebookPen },
    { id: 'search', label: 'Vault', description: 'Persisted files, context sets and generated documents.', icon: Search },
    { id: 'brain', label: 'Memory', description: 'Memory and approved skills.', icon: Brain },
    { id: 'tools', label: 'Tools', description: 'Connector and tool registry.', icon: Wrench },
    { id: 'doctor', label: 'Doctor', description: 'Control-plane readiness.', icon: Stethoscope },
]

const systemItems: RailItem[] = [
    { id: 'settings', label: 'Settings', code: 'SET', description: 'Workspace setup and appearance.', icon: Settings },
    { id: 'theme', label: 'Theme', code: 'THM', description: 'Local theme switcher.', icon: Palette },
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
    itemOrder?: string[]
    developmentMode?: boolean
}>()

const effectiveCollapsed = computed(() => props.mobileOpen ? false : Boolean(props.collapsed))
const railStyle = computed(() => ({
    width: `${effectiveCollapsed.value ? 64 : props.width}px`,
    maxWidth: props.mobileOpen ? '88vw' : undefined,
}))
const railElement = ref<HTMLElement | null>(null)
const editDialogOpen = ref(false)
const editDialogMode = ref<'rename' | 'move'>('rename')
const editDialogSession = ref<TalosSession | null>(null)
const collapsedGroups = ref<Record<string, boolean>>({})
const collapsedAdvancedOpen = ref(false)
const lightThemeActive = computed(() => talosThemeIsLight(props.theme))
let returnFocusTarget: HTMLElement | null = null
let backgroundIsolation: { element: HTMLElement; ariaHidden: string | null; hadInert: boolean } | null = null
let desktopMediaQuery: MediaQueryList | null = null
const orderedPrimaryItems = computed(() => {
    if (!props.itemOrder?.length) return primaryItems
    const byId = new Map(primaryItems.map((item) => [item.id, item]))
    const ordered: RailItem[] = []
    for (const id of props.itemOrder) {
        const item = byId.get(id)
        if (item) {
            ordered.push(item)
            byId.delete(id)
        }
    }
    return [...ordered, ...byId.values()]
})

function handleItemReorderKeydown(event: KeyboardEvent, id: string) {
    if (!event.altKey || (event.key !== 'ArrowUp' && event.key !== 'ArrowDown')) return
    event.preventDefault()
    emit('moveItem', id, event.key === 'ArrowUp' ? -1 : 1)
}

const visiblePrimaryItems = computed(() => orderedPrimaryItems.value.filter((item) => {
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

function toggleGroup(groupId: string) {
    collapsedGroups.value = {
        ...collapsedGroups.value,
        [groupId]: groupOpen(groupId),
    }
}

function handleGlobalKeyDown(event: KeyboardEvent) {
    if (!props.mobileOpen) {
        return
    }

    if (event.key === 'Escape') {
        event.preventDefault()
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
    )).filter((element) => isVisibleFocusTarget(element))
}

function isVisibleFocusTarget(element: HTMLElement | null): element is HTMLElement {
    if (!element?.isConnected || element.hasAttribute('disabled') || element.closest('[hidden]')) return false

    const style = window.getComputedStyle(element)
    if (style.display === 'none' || style.visibility === 'hidden') return false

    const browserHasLayout = document.documentElement.getClientRects().length > 0
    return !browserHasLayout || element.getClientRects().length > 0
}

function isolateMobileNavigationBackground() {
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

function restoreMobileNavigationBackground() {
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
        isolateMobileNavigationBackground()
        railElement.value?.querySelector<HTMLElement>('[aria-label="Close navigation menu"]')?.focus()
        return
    }

    restoreMobileNavigationBackground()
    await nextTick()
    if (isVisibleFocusTarget(returnFocusTarget)) {
        returnFocusTarget.focus()
    } else {
        const fallback = Array.from(document.querySelectorAll<HTMLElement>(
            'button[aria-label="Open navigation menu"], button[aria-label="Collapse sidebar"], button[aria-label="Expand sidebar"]',
        )).find(isVisibleFocusTarget)
        fallback?.focus()
    }
    returnFocusTarget = null
})

function handleViewportChange() {
    if (!desktopMediaQuery && window.innerWidth >= 1024 && props.mobileOpen) emit('closeMobile')
}

function handleDesktopBreakpointChange(event: MediaQueryListEvent | MediaQueryList) {
    if (event.matches && props.mobileOpen) emit('closeMobile')
}

onMounted(() => {
    document.addEventListener('keydown', handleGlobalKeyDown)
    window.addEventListener('scroll', handleViewportChange, true)
    window.addEventListener('resize', handleViewportChange)
    if (typeof window.matchMedia === 'function') {
        desktopMediaQuery = window.matchMedia('(min-width: 1024px)')
        desktopMediaQuery.addEventListener('change', handleDesktopBreakpointChange)
        handleDesktopBreakpointChange(desktopMediaQuery)
    }
})

onBeforeUnmount(() => {
    restoreMobileNavigationBackground()
    document.removeEventListener('keydown', handleGlobalKeyDown)
    window.removeEventListener('scroll', handleViewportChange, true)
    window.removeEventListener('resize', handleViewportChange)
    desktopMediaQuery?.removeEventListener('change', handleDesktopBreakpointChange)
    desktopMediaQuery = null
})

function openSessionEdit(session: TalosSession, mode: 'rename' | 'move') {
    editDialogSession.value = session
    editDialogMode.value = mode
    editDialogOpen.value = true
}

function submitSessionEdit(value: string) {
    const session = editDialogSession.value
    if (!session) return
    if (editDialogMode.value === 'rename') emit('renameSession', session, value)
    else emit('moveSessionToFolder', session, value)
}

function deleteWithConfirmation(session: TalosSession) {
    emit('deleteSession', session)
}

function selectChatSession(session: TalosSession) {
    emit('selectSession', session)
    if (props.mobileOpen) emit('closeMobile')
}

async function openRailItem(id: string, event?: PointerEvent) {
    if (props.mobileOpen) {
        const navigationLauncher = returnFocusTarget
        returnFocusTarget = null
        emit('closeMobile')
        await nextTick()
        if (navigationLauncher?.isConnected) navigationLauncher.focus()
    }

    emit('open', id, event)
}

function toggleAdvancedGroup() {
    if (effectiveCollapsed.value) {
        collapsedAdvancedOpen.value = !collapsedAdvancedOpen.value
        return
    }

    emit('toggleAdvanced')
}

function openAdvancedItem(id: string, event?: PointerEvent) {
    collapsedAdvancedOpen.value = false
    openRailItem(id, event)
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
        :aria-labelledby="mobileOpen ? 'talos-mobile-navigation-title' : undefined"
        :tabindex="mobileOpen ? -1 : undefined"
        data-testid="talos-mobile-history-dialog"
        aria-label="TALOS workspace rail"
    >
        <h2 v-if="mobileOpen" id="talos-mobile-navigation-title" class="sr-only">TALOS navigation</h2>
        <div class="flex items-center gap-2 px-1" :class="effectiveCollapsed ? 'justify-center' : 'justify-between'">
            <div v-if="!effectiveCollapsed && visibility.brand_name !== false" data-testid="talos-rail-brand" class="flex min-w-0 flex-1 items-center gap-2">
                <span data-testid="talos-rail-brand-logo" class="talos-short-logo talos-short-logo-compact talos-rail-brand-logo" aria-hidden="true">
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
                :aria-label="mobileOpen ? 'Close navigation menu' : effectiveCollapsed ? 'Expand sidebar' : 'Collapse sidebar'"
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
                                <TalosSessionRowMenu
                                    :session="session"
                                    :inline-portal="mobileOpen"
                                    @rename="openSessionEdit($event, 'rename')"
                                    @favorite="emit('favoriteSession', $event)"
                                    @toggle-selected="emit('toggleSessionSelected', $event)"
                                    @copy="emit('copySession', $event)"
                                    @move="openSessionEdit($event, 'move')"
                                    @archive="emit('archiveSession', $event)"
                                    @delete="deleteWithConfirmation($event)"
                                />
                            </div>
                        </div>
                    </div>
                </div>
            </div>
            <p v-else class="px-1 text-xs leading-5 text-[var(--talos-muted)]">No chats yet.</p>
        </section>

        <TalosSessionEditDialog
            v-model:open="editDialogOpen"
            :mode="editDialogMode"
            :session="editDialogSession"
            @submit="submitSessionEdit"
        />

        <nav class="mt-3 min-h-0 flex-1 space-y-0.5 overflow-y-auto pr-1" aria-label="TALOS modules">
            <div
                v-for="item in visiblePrimaryItems"
                :key="item.id"
                class="flex min-w-0 items-center"
                :class="effectiveCollapsed ? 'justify-center gap-0' : 'gap-1'"
            >
                <button
                    type="button"
                    class="group flex min-w-0 flex-1 cursor-pointer items-center rounded-md border text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--talos-ring)] disabled:cursor-not-allowed disabled:opacity-60"
                    :class="[
                        effectiveCollapsed ? 'justify-center px-0 py-2' : 'gap-2.5 px-2 py-2',
                        activeIds.includes(item.id)
                            ? 'border-[var(--talos-accent-border)] bg-[var(--talos-accent-soft)] text-[var(--talos-text)]'
                            : 'border-transparent text-[var(--talos-muted)] hover:border-[var(--talos-border)] hover:bg-[var(--talos-panel-soft)] hover:text-[var(--talos-text)]',
                    ]"
                    :aria-pressed="activeIds.includes(item.id)"
                    :aria-label="item.label"
                    :title="item.disabledReason || item.description"
                    :disabled="Boolean(item.disabledReason)"
                    @click="openRailItem(item.id, $event)"
                    @keydown="handleItemReorderKeydown($event, item.id)"
                >
                    <span
                        v-if="!effectiveCollapsed && activeIds.includes(item.id)"
                        class="talos-rule-ticks shrink-0"
                        aria-hidden="true"
                    ><i class="talos-rule-tick"></i><i class="talos-rule-tick"></i><i class="talos-rule-tick"></i></span>
                    <component :is="item.icon" class="h-4 w-4 shrink-0" />
                    <span v-if="!effectiveCollapsed" class="flex min-w-0 flex-1 items-center justify-between gap-2">
                        <span class="talos-type-label block truncate">{{ item.label }}</span>
                        <Chip v-if="developmentMode" :code="item.code" aria-hidden="true" class="shrink-0" />
                        <span class="sr-only">{{ item.description }}</span>
                    </span>
                </button>
            </div>
            <TalosAdvancedRailGroup
                v-if="visibleAdvancedItems.length"
                :items="visibleAdvancedItems"
                :active-ids="activeIds"
                :collapsed="effectiveCollapsed"
                :expanded="effectiveCollapsed ? collapsedAdvancedOpen : Boolean(advancedExpanded || activeAdvanced)"
                :presentation="effectiveCollapsed ? 'popover' : 'inline'"
                side="right"
                align="start"
                id="talos-advanced-items-desktop"
                @toggle="toggleAdvancedGroup"
                @open="openAdvancedItem"
            />
        </nav>

        <div class="mt-2 border-t border-[var(--talos-border)] pt-2">
            <div class="space-y-0.5">
                <div
                    v-for="item in visibleSystemItems"
                    :key="item.id"
                    class="flex min-w-0 items-center"
                    :class="effectiveCollapsed ? 'justify-center gap-0' : 'gap-1'"
                >
                    <button
                        type="button"
                        class="flex min-w-0 flex-1 cursor-pointer items-center rounded-md border border-transparent text-left text-[13px] text-[var(--talos-muted)] transition hover:border-[var(--talos-border)] hover:bg-[var(--talos-panel-soft)] hover:text-[var(--talos-text)] hover:shadow-[inset_2px_0_0_var(--talos-accent)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--talos-ring)]"
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
            </div>

            <button
                v-if="visibility.theme !== false"
                type="button"
                class="mt-1 flex min-w-0 cursor-pointer items-center rounded-md border border-transparent text-[var(--talos-muted)] transition hover:border-[var(--talos-border)] hover:bg-[var(--talos-panel-soft)] hover:text-[var(--talos-text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--talos-ring)]"
                :class="effectiveCollapsed ? 'w-full justify-center px-0 py-2' : 'gap-2.5 px-2 py-2'"
                aria-label="Toggle theme"
                title="Switch between light and dark"
                @click="emit('toggleTheme')"
            >
                <Moon v-if="lightThemeActive" class="h-4 w-4 shrink-0" />
                <Sun v-else class="h-4 w-4 shrink-0" />
                <span v-if="!effectiveCollapsed" class="talos-type-label truncate">Light / Dark</span>
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
