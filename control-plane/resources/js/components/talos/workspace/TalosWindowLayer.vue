<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import Card from '../../ui/Card.vue'
import Input from '../../ui/Input.vue'
import TalosToolWindow from '../window/TalosToolWindow.vue'
import TalosWindowSectionTabs from '../window/TalosWindowSectionTabs.vue'
import TalosBenchmarkWorkbench from '../benchmarks/TalosBenchmarkWorkbench.vue'
import TalosCookbook from '../cookbook/TalosCookbook.vue'
import TalosModelCenter from '../models/TalosModelCenter.vue'
import TalosContextVault from '../context/TalosContextVault.vue'
import TalosRunTimeline from '../runs/TalosRunTimeline.vue'
import TalosToolRegistry from '../tools/TalosToolRegistry.vue'
import TalosMemoryManager from '../memory/TalosMemoryManager.vue'
import TalosSkillRegistry from '../memory/TalosSkillRegistry.vue'
import TalosSkillAudit from '../memory/TalosSkillAudit.vue'
import TalosResearchWorkbench from '../research/TalosResearchWorkbench.vue'
import TalosDocuments from '../documents/TalosDocuments.vue'
import TalosArtifactGallery from '../documents/TalosArtifactGallery.vue'
import TalosNotes from '../productivity/TalosNotes.vue'
import TalosTasks from '../productivity/TalosTasks.vue'
import TalosCalendar from '../productivity/TalosCalendar.vue'
import TalosEmailTriage from '../email/TalosEmailTriage.vue'
import TalosDoctorPanel from '../admin/TalosDoctorPanel.vue'
import TalosAuditLog from '../admin/TalosAuditLog.vue'
import TalosPolicyPanel from '../admin/TalosPolicyPanel.vue'
import TalosBackupPanel from '../admin/TalosBackupPanel.vue'
import TalosShellPolicyPanel from '../admin/TalosShellPolicyPanel.vue'
import TalosSettingsCenter from '../settings/TalosSettingsCenter.vue'
import TalosThemeEngine from '../settings/TalosThemeEngine.vue'
import {
    TALOS_WINDOW_DEFAULT_SIZES,
    TALOS_WINDOW_MIN_SIZES,
    type TalosWindowId,
    type TalosWindowPosition,
    type TalosWindowSize,
} from '../../../composables/useTalosWindows'
import { useTalosMemorySkills } from '../../../composables/useTalosMemorySkills'
import type { TalosContextSet, TalosModelProfile } from '../../../lib/talosTypes'
import type { TalosThemeCustomization, TalosThemeId } from '../../../lib/talosThemes'

type WindowResizeEdge = 'top' | 'right' | 'bottom' | 'left' | 'top-right' | 'bottom-right' | 'bottom-left' | 'top-left'
type TalosWindowTransitionState = 'idle' | 'opening' | 'restoring' | 'minimizing' | 'expanding'
type TalosWindowSectionTab = {
    id: string
    label: string
    description?: string
}
type TalosWindowLaunchOrigin = {
    x: number
    y: number
    source: 'sidebar' | 'command' | 'dock' | 'default'
}

const props = defineProps<{
    visibleWindowIds: TalosWindowId[]
    minimizedWindowIds: TalosWindowId[]
    dockedWindowIds: TalosWindowId[]
    fullscreenWindowIds: TalosWindowId[]
    activeWindowId: TalosWindowId | null
    windowPositions: Partial<Record<TalosWindowId, TalosWindowPosition>>
    windowSizes: Partial<Record<TalosWindowId, TalosWindowSize>>
    windowZIndexes: Partial<Record<TalosWindowId, number>>
    windowLaunchOrigins: Partial<Record<TalosWindowId, TalosWindowLaunchOrigin>>
    windowLaunchRevisions: Partial<Record<TalosWindowId, number>>
    currentRailWidth: number
    runtimeRequestedTab: 'timeline' | 'dag' | 'replay' | 'recovery' | 'artifacts'
    runtimeRequestedTabRevision: number
    selectedBenchmarkGroupId: string | null
    selectedBenchmarkScenarioPath: string | null
    modelProfiles: TalosModelProfile[]
    contextSets: TalosContextSet[]
    selectedModelProfileId: string
    selectedContextSetId: string
    settingsRequestedTab: 'models' | 'account'
    settingsRequestedTabRevision: number
    authenticated: boolean
    authUserName: string
    logoutUrl: string
    csrfToken: string
    theme: TalosThemeId
    uiMotionDisabled: boolean
    requestedWindowSections?: Partial<Record<TalosWindowId, string>>
    requestedWindowSectionRevision?: number
}>()

const emit = defineEmits<{
    closeWindow: [id: TalosWindowId]
    minimizeWindow: [id: TalosWindowId]
    dockWindow: [id: TalosWindowId]
    fullscreenWindow: [id: TalosWindowId]
    focusWindow: [id: TalosWindowId]
    openWindow: [id: TalosWindowId]
    restoreWindow: [id: TalosWindowId]
    setWindowPosition: [id: TalosWindowId, position: TalosWindowPosition]
    setWindowSize: [id: TalosWindowId, size: TalosWindowSize]
    resetWindowSize: [id: TalosWindowId]
    saveWindowLayout: []
    openAuditLog: []
    contextSetCreated: [contextSet: TalosContextSet]
    benchmarkScenarioSelected: [scenarioPath: string]
    selectModel: [id: string]
    selectContext: [id: string]
    changeTheme: [theme: TalosThemeId, persist?: boolean]
    openModule: [id: string]
    settingsSaved: []
    themeCustomizationChanged: [settings?: { preferences?: Record<string, unknown> }]
    themeDraftChanged: [customization: TalosThemeCustomization | null]
}>()

const windowCopy: Record<TalosWindowId, { title: string; description: string }> = {
    runtime: { title: 'Runtime', description: 'Runs, replay and recovery evidence.' },
    search: { title: 'Knowledge', description: 'Persisted files, context sets and generated documents.' },
    brain: { title: 'Brain', description: 'Memory, skills and planning context.' },
    calendar: { title: 'Calendar', description: 'Calendar drafts, no external write without confirmation.' },
    compare: { title: 'Compare', description: 'AVM ON/OFF benchmark workbench.' },
    model_lab: { title: 'Model Lab', description: 'Cookbook previews, provider profiles and probes.' },
    research: { title: 'Deep Research', description: 'Research reports, sources and claims.' },
    gallery: { title: 'Artifacts', description: 'Run artifacts and previews with provenance.' },
    library: { title: 'Library', description: 'Files, context sets and generated documents.' },
    notes: { title: 'Notes', description: 'Untrusted notes, never silently injected.' },
    tasks: { title: 'Tasks', description: 'Persisted tasks and workflow follow-up.' },
    settings: { title: 'Settings', description: 'Workspace setup and safe configuration.' },
    theme: { title: 'Theme', description: 'Appearance controls for this workspace.' },
    doctor: { title: 'Doctor', description: 'Readiness, policy, audit and backup controls.' },
    tools: { title: 'Tools', description: 'Connectors and tool registry.' },
}

const windowSectionTabs: Partial<Record<TalosWindowId, TalosWindowSectionTab[]>> = {
    search: [
        { id: 'context', label: 'Context Vault', description: 'Files and bounded context sets.' },
        { id: 'documents', label: 'Documents', description: 'Generated documents and exports.' },
    ],
    brain: [
        { id: 'memory', label: 'Memory', description: 'Approved and scoped memories.' },
        { id: 'skills', label: 'Skills', description: 'Approved skills available to planning.' },
        { id: 'skill_audit', label: 'Skill Audit', description: 'Skill selection evidence.' },
    ],
    model_lab: [
        { id: 'cookbook', label: 'Cookbook', description: 'Local model cookbook and dependency readiness.' },
        { id: 'models', label: 'Models', description: 'Server-side provider profiles and probes.' },
    ],
    library: [
        { id: 'context', label: 'Context Vault', description: 'Files and bounded context sets.' },
        { id: 'documents', label: 'Documents', description: 'Generated documents and exports.' },
    ],
    tasks: [
        { id: 'tasks', label: 'Tasks', description: 'Persisted tasks and workflow follow-up.' },
        { id: 'email', label: 'Email', description: 'Read-only triage and draft review.' },
    ],
    doctor: [
        { id: 'doctor', label: 'Doctor', description: 'Readiness diagnostics.' },
        { id: 'policy', label: 'Policy', description: 'Capability boundary and enterprise gates.' },
        { id: 'shell', label: 'Shell', description: 'Shell execution policy.' },
        { id: 'backup', label: 'Backup', description: 'Manifest and dry-run restore checks.' },
        { id: 'audit', label: 'Audit', description: 'Redacted security and policy events.' },
    ],
}

const defaultWindowSections: Partial<Record<TalosWindowId, string>> = {
    model_lab: 'models',
}

const adminToken = ref('')
const interactingWindowId = ref<TalosWindowId | null>(null)
const windowTransitionStates = ref<Partial<Record<TalosWindowId, TalosWindowTransitionState>>>({})
const windowTransitionOrigins = ref<Partial<Record<TalosWindowId, TalosWindowLaunchOrigin>>>({})
const activeWindowSections = ref<Partial<Record<TalosWindowId, string>>>({})
let stopWindowDragListeners: (() => void) | null = null
let stopWindowResizeListeners: (() => void) | null = null
const transitionTimers = new Map<TalosWindowId, number>()
const pendingRestoreWindowIds = ref<TalosWindowId[]>([])
const pendingRestoreOrigins = ref<Partial<Record<TalosWindowId, TalosWindowLaunchOrigin>>>({})
const WINDOW_TRANSITION_MS = 260
const WINDOW_MINIMIZE_TRANSITION_MS = 500
const {
    skills: brainSkills,
    skillPlanningContext: brainSkillPlanningContext,
    loadSkills: loadBrainSkills,
    loadSkillPlanningContext: loadBrainSkillPlanningContext,
} = useTalosMemorySkills()
const activeBrainSkill = computed(() => brainSkills.value[0] ?? null)
let brainSkillsRequested = false

const floatingWindowIds = computed(() => props.visibleWindowIds.filter((item) => !props.dockedWindowIds.includes(item)))
const dockedVisibleWindowIds = computed(() => props.visibleWindowIds.filter((item) => props.dockedWindowIds.includes(item)))
const hasDockedWindows = computed(() => dockedVisibleWindowIds.value.length > 0)

function isWindowId(value: string): value is TalosWindowId {
    return Object.prototype.hasOwnProperty.call(TALOS_WINDOW_DEFAULT_SIZES, value)
}

function sectionTabsFor(id: TalosWindowId) {
    return windowSectionTabs[id] ?? []
}

function isWindowSectionId(id: TalosWindowId, sectionId: string) {
    return sectionTabsFor(id).some((tab) => tab.id === sectionId)
}

function activeSectionFor(id: TalosWindowId) {
    const tabs = sectionTabsFor(id)
    const activeSection = activeWindowSections.value[id]
        ?? defaultWindowSections[id]
        ?? tabs[0]?.id
        ?? ''

    return isWindowSectionId(id, activeSection) ? activeSection : (tabs[0]?.id ?? '')
}

function setActiveWindowSection(id: TalosWindowId, sectionId: string) {
    if (!isWindowSectionId(id, sectionId)) {
        return
    }

    activeWindowSections.value = {
        ...activeWindowSections.value,
        [id]: sectionId,
    }
}

function ensureBrainSkillsLoaded() {
    if (brainSkillsRequested) {
        return
    }

    brainSkillsRequested = true
    void Promise.allSettled([
        loadBrainSkills(true),
        loadBrainSkillPlanningContext(),
    ])
}

function defaultWindowOrigin(source: TalosWindowLaunchOrigin['source'] = 'default'): TalosWindowLaunchOrigin {
    return {
        x: -Math.round(Math.max(72, props.currentRailWidth * 0.45)),
        y: typeof window === 'undefined' ? 140 : Math.round(window.innerHeight * 0.42),
        source,
    }
}

function originFromElement(target: EventTarget | null, source: TalosWindowLaunchOrigin['source']): TalosWindowLaunchOrigin {
    if (target instanceof HTMLElement) {
        const rect = target.getBoundingClientRect()

        return {
            x: Math.round(rect.left + (rect.width / 2) - props.currentRailWidth),
            y: Math.round(rect.top + (rect.height / 2)),
            source,
        }
    }

    return defaultWindowOrigin(source)
}

function minimizeDockOrigin(): TalosWindowLaunchOrigin {
    return {
        x: 32,
        y: typeof window === 'undefined' ? 620 : Math.round(window.innerHeight - 112),
        source: 'dock',
    }
}

function clearTransitionTimer(id: TalosWindowId) {
    const timer = transitionTimers.get(id)
    if (timer !== undefined) {
        window.clearTimeout(timer)
        transitionTimers.delete(id)
    }
}

function transitionDurationFor(state: TalosWindowTransitionState) {
    if (props.uiMotionDisabled || state === 'idle') {
        return 0
    }

    return state === 'minimizing' ? WINDOW_MINIMIZE_TRANSITION_MS : WINDOW_TRANSITION_MS
}

function setWindowTransition(id: TalosWindowId, state: TalosWindowTransitionState, origin?: TalosWindowLaunchOrigin, onComplete?: () => void) {
    clearTransitionTimer(id)
    if (origin) {
        windowTransitionOrigins.value = {
            ...windowTransitionOrigins.value,
            [id]: origin,
        }
    }
    windowTransitionStates.value = {
        ...windowTransitionStates.value,
        [id]: state,
    }

    const duration = transitionDurationFor(state)
    if (duration === 0) {
        windowTransitionStates.value = {
            ...windowTransitionStates.value,
            [id]: 'idle',
        }
        onComplete?.()
        return
    }

    const timer = window.setTimeout(() => {
        if (windowTransitionStates.value[id] === state) {
            windowTransitionStates.value = {
                ...windowTransitionStates.value,
                [id]: 'idle',
            }
        }
        transitionTimers.delete(id)
        onComplete?.()
    }, duration)
    transitionTimers.set(id, timer)
}

function transitionStateFor(id: TalosWindowId): TalosWindowTransitionState {
    return windowTransitionStates.value[id] ?? 'idle'
}

function transitionOriginFor(id: TalosWindowId): TalosWindowLaunchOrigin {
    return windowTransitionOrigins.value[id]
        ?? props.windowLaunchOrigins[id]
        ?? defaultWindowOrigin('default')
}

function emitWindow(action: 'closeWindow' | 'minimizeWindow' | 'dockWindow' | 'fullscreenWindow' | 'focusWindow' | 'openWindow', id: string) {
    if (!isWindowId(id)) {
        return
    }

    if (action === 'closeWindow') {
        emit('closeWindow', id)
    } else if (action === 'minimizeWindow') {
        requestWindowMinimize(id)
    } else if (action === 'dockWindow') {
        emit('dockWindow', id)
    } else if (action === 'fullscreenWindow') {
        requestWindowFullscreen(id)
    } else if (action === 'focusWindow') {
        emit('focusWindow', id)
    } else {
        emit('openWindow', id)
    }
}

function requestWindowMinimize(id: TalosWindowId) {
    setWindowTransition(id, 'minimizing', minimizeDockOrigin(), () => {
        emit('minimizeWindow', id)
    })
}

function requestWindowFullscreen(id: TalosWindowId) {
    emit('fullscreenWindow', id)
    setWindowTransition(id, 'expanding', transitionOriginFor(id))
}

function restoreMinimizedWindow(id: TalosWindowId, event: MouseEvent) {
    const origin = originFromElement(event.currentTarget, 'dock')
    pendingRestoreWindowIds.value = [...pendingRestoreWindowIds.value.filter((item) => item !== id), id]
    pendingRestoreOrigins.value = {
        ...pendingRestoreOrigins.value,
        [id]: origin,
    }
    emit('restoreWindow', id)
}

watch(
    () => props.visibleWindowIds,
    (nextIds, previousIds = []) => {
        for (const id of nextIds) {
            if (previousIds.includes(id)) {
                continue
            }

            const restoreOrigin = pendingRestoreOrigins.value[id]
            if (pendingRestoreWindowIds.value.includes(id) && restoreOrigin) {
                setWindowTransition(id, 'restoring', restoreOrigin)
                pendingRestoreWindowIds.value = pendingRestoreWindowIds.value.filter((item) => item !== id)
                const nextOrigins = { ...pendingRestoreOrigins.value }
                delete nextOrigins[id]
                pendingRestoreOrigins.value = nextOrigins
                continue
            }

            setWindowTransition(id, 'opening', props.windowLaunchOrigins[id] ?? defaultWindowOrigin('sidebar'))
        }
    },
    { flush: 'pre' },
)

watch(
    () => props.visibleWindowIds.includes('brain'),
    (visible) => {
        if (visible) {
            ensureBrainSkillsLoaded()
        }
    },
    { immediate: true },
)

watch(
    () => props.windowLaunchRevisions,
    (nextRevisions, previousRevisions = {}) => {
        for (const [id, revision] of Object.entries(nextRevisions)) {
            if (!isWindowId(id) || previousRevisions[id] === revision) {
                continue
            }

            if (!props.visibleWindowIds.includes(id) || props.minimizedWindowIds.includes(id)) {
                continue
            }

            setWindowTransition(id, 'opening', props.windowLaunchOrigins[id] ?? defaultWindowOrigin('sidebar'))
        }
    },
    { flush: 'post' },
)

watch(
    () => props.requestedWindowSectionRevision,
    () => {
        for (const [id, sectionId] of Object.entries(props.requestedWindowSections ?? {})) {
            if (isWindowId(id) && typeof sectionId === 'string') {
                setActiveWindowSection(id, sectionId)
            }
        }
    },
    { flush: 'pre' },
)

function defaultFloatingWindowPosition(index: number): TalosWindowPosition {
    const viewportWidth = typeof window === 'undefined' ? 1280 : window.innerWidth
    const viewportHeight = typeof window === 'undefined' ? 720 : window.innerHeight
    const maxX = Math.max(16, viewportWidth - props.currentRailWidth - 780)
    const maxY = Math.max(72, viewportHeight - 430)

    return {
        x: Math.min(220 + (index * 28), maxX),
        y: Math.min(30 + (index * 28), maxY),
    }
}

function composerBoundaryY() {
    const composer = typeof document === 'undefined'
        ? null
        : document.querySelector('.talos-chat-composer-shell')?.getBoundingClientRect()

    return composer ? composer.top - 12 : null
}

function clampFloatingWindowSize(id: TalosWindowId, size: TalosWindowSize, position: TalosWindowPosition): TalosWindowSize {
    const viewportWidth = typeof window === 'undefined' ? 1280 : window.innerWidth
    const viewportHeight = typeof window === 'undefined' ? 720 : window.innerHeight
    const minSize = TALOS_WINDOW_MIN_SIZES[id]
    const composerTop = composerBoundaryY()
    const maxWidth = Math.max(minSize.width, viewportWidth - props.currentRailWidth - position.x - 32)
    const maxHeightFromViewport = viewportHeight - position.y - 160
    const maxHeightFromComposer = composerTop === null ? maxHeightFromViewport : composerTop - position.y - 56
    const maxHeight = Math.max(minSize.height, Math.min(maxHeightFromViewport, maxHeightFromComposer))

    return {
        width: Math.round(Math.min(Math.max(size.width, minSize.width), maxWidth)),
        height: Math.round(Math.min(Math.max(size.height, minSize.height), maxHeight)),
    }
}

function clampFloatingWindowPosition(position: TalosWindowPosition, size?: TalosWindowSize): TalosWindowPosition {
    const viewportWidth = typeof window === 'undefined' ? 1280 : window.innerWidth
    const viewportHeight = typeof window === 'undefined' ? 720 : window.innerHeight
    const windowSize = size ?? { width: 380, height: 250 }
    const composerTop = composerBoundaryY()
    const maxX = Math.max(16, viewportWidth - props.currentRailWidth - windowSize.width - 24)
    const maxYFromViewport = viewportHeight - windowSize.height - 92
    const maxYFromComposer = composerTop === null ? maxYFromViewport : composerTop - windowSize.height - 16
    const maxY = Math.max(24, Math.min(maxYFromViewport, maxYFromComposer))

    return {
        x: Math.min(Math.max(16, position.x), maxX),
        y: Math.min(Math.max(24, position.y), maxY),
    }
}

function floatingWindowPosition(id: TalosWindowId, index: number): TalosWindowPosition {
    const position = props.windowPositions[id] ?? defaultFloatingWindowPosition(index)
    const size = clampFloatingWindowSize(
        id,
        props.windowSizes[id] ?? TALOS_WINDOW_DEFAULT_SIZES[id],
        position,
    )

    return clampFloatingWindowPosition(position, size)
}

function floatingWindowSize(id: TalosWindowId, index: number): TalosWindowSize {
    const position = floatingWindowPosition(id, index)

    return clampFloatingWindowSize(id, props.windowSizes[id] ?? TALOS_WINDOW_DEFAULT_SIZES[id], position)
}

function floatingWindowStyle(id: TalosWindowId, index: number) {
    const origin = transitionOriginFor(id)
    if (props.fullscreenWindowIds.includes(id)) {
        return {
            '--talos-window-origin-x': `${origin.x}px`,
            '--talos-window-origin-y': `${origin.y}px`,
            zIndex: String(60 + (props.windowZIndexes[id] ?? index)),
        }
    }

    const position = floatingWindowPosition(id, index)
    const size = floatingWindowSize(id, index)
    const minSize = TALOS_WINDOW_MIN_SIZES[id]
    const launchDx = Math.round(origin.x - position.x)
    const launchDy = Math.round(origin.y - position.y)
    const launchMidDx = Math.round(launchDx * 0.55)
    const launchMidDy = Math.round(launchDy * 0.55)

    const style = {
        '--talos-window-x': `${position.x}px`,
        '--talos-window-y': `${position.y}px`,
        '--talos-window-width': `${size.width}px`,
        '--talos-window-height': `${size.height}px`,
        '--talos-window-min-width': `${minSize.width}px`,
        '--talos-window-min-height': `${minSize.height}px`,
        '--talos-window-origin-x': `${origin.x}px`,
        '--talos-window-origin-y': `${origin.y}px`,
        '--talos-window-launch-dx': `${launchDx}px`,
        '--talos-window-launch-dy': `${launchDy}px`,
        '--talos-window-launch-mid-dx': `${launchMidDx}px`,
        '--talos-window-launch-mid-dy': `${launchMidDy}px`,
        zIndex: String(50 + (props.windowZIndexes[id] ?? index)),
    }

    return style
}

function stopWindowDrag() {
    if (stopWindowDragListeners) {
        stopWindowDragListeners()
        stopWindowDragListeners = null
    }
}

function stopWindowResize() {
    if (stopWindowResizeListeners) {
        stopWindowResizeListeners()
        stopWindowResizeListeners = null
    }
}

function startWindowDrag(id: string, event: PointerEvent) {
    if (!isWindowId(id) || event.button !== 0 || props.dockedWindowIds.includes(id) || props.fullscreenWindowIds.includes(id)) {
        return
    }

    event.preventDefault()
    emit('focusWindow', id)

    const index = Math.max(0, floatingWindowIds.value.indexOf(id))
    const initialPosition = floatingWindowPosition(id, index)
    const currentSize = floatingWindowSize(id, index)
    const startX = event.clientX
    const startY = event.clientY

    stopWindowDrag()
    stopWindowResize()
    interactingWindowId.value = id
    document.body.style.userSelect = 'none'

    const handleMove = (moveEvent: PointerEvent) => {
        emit('setWindowPosition', id, clampFloatingWindowPosition({
            x: initialPosition.x + (moveEvent.clientX - startX),
            y: initialPosition.y + (moveEvent.clientY - startY),
        }, currentSize))
    }
    const stop = () => {
        window.removeEventListener('pointermove', handleMove)
        window.removeEventListener('pointerup', stop)
        window.removeEventListener('pointercancel', stop)
        document.body.style.userSelect = ''
        interactingWindowId.value = null
        emit('saveWindowLayout')
    }

    window.addEventListener('pointermove', handleMove)
    window.addEventListener('pointerup', stop)
    window.addEventListener('pointercancel', stop)
    stopWindowDragListeners = stop
}

function startWindowResize(id: string, edge: WindowResizeEdge, event: PointerEvent) {
    if (!isWindowId(id) || event.button !== 0 || props.dockedWindowIds.includes(id) || props.fullscreenWindowIds.includes(id)) {
        return
    }

    event.preventDefault()
    emit('focusWindow', id)

    const index = Math.max(0, floatingWindowIds.value.indexOf(id))
    const initialPosition = floatingWindowPosition(id, index)
    const initialSize = floatingWindowSize(id, index)
    const startX = event.clientX
    const startY = event.clientY

    stopWindowResize()
    stopWindowDrag()
    interactingWindowId.value = id
    document.body.style.userSelect = 'none'

    const handleMove = (moveEvent: PointerEvent) => {
        const deltaX = moveEvent.clientX - startX
        const deltaY = moveEvent.clientY - startY
        const nextPosition = { ...initialPosition }
        const nextSize = { ...initialSize }

        if (edge.includes('right')) {
            nextSize.width = initialSize.width + deltaX
        }

        if (edge.includes('left')) {
            nextSize.width = initialSize.width - deltaX
            nextPosition.x = initialPosition.x + deltaX
        }

        if (edge.includes('bottom')) {
            nextSize.height = initialSize.height + deltaY
        }

        if (edge.includes('top')) {
            nextSize.height = initialSize.height - deltaY
            nextPosition.y = initialPosition.y + deltaY
        }

        const clampedPosition = clampFloatingWindowPosition(nextPosition, nextSize)
        const clampedSize = clampFloatingWindowSize(id, nextSize, clampedPosition)

        emit('setWindowPosition', id, clampedPosition)
        emit('setWindowSize', id, clampedSize)
    }

    const stop = () => {
        window.removeEventListener('pointermove', handleMove)
        window.removeEventListener('pointerup', stop)
        window.removeEventListener('pointercancel', stop)
        document.body.style.userSelect = ''
        interactingWindowId.value = null
        emit('saveWindowLayout')
    }

    window.addEventListener('pointermove', handleMove)
    window.addEventListener('pointerup', stop)
    window.addEventListener('pointercancel', stop)
    stopWindowResizeListeners = stop
}

function resetFloatingWindowSize(id: string) {
    if (!isWindowId(id)) {
        return
    }

    emit('resetWindowSize', id)
    emit('saveWindowLayout')
}

onBeforeUnmount(() => {
    stopWindowDrag()
    stopWindowResize()
    for (const timer of transitionTimers.values()) {
        window.clearTimeout(timer)
    }
    transitionTimers.clear()
})
</script>

<template>
    <div class="pointer-events-none absolute inset-x-3 bottom-32 top-24 z-50 flex flex-col gap-3 overflow-y-auto pb-3 lg:inset-x-0 lg:bottom-32 lg:top-14 lg:block lg:overflow-hidden lg:pb-0">
        <TalosToolWindow
            v-for="(id, index) in floatingWindowIds"
            :id="id"
            :key="id"
            :title="windowCopy[id].title"
            :description="windowCopy[id].description"
            :active="activeWindowId === id"
            :width="floatingWindowSize(id, index).width"
            :height="floatingWindowSize(id, index).height"
            :interacting="interactingWindowId === id"
            :fullscreen="fullscreenWindowIds.includes(id)"
            class="talos-floating-window pointer-events-auto"
            :class="[
                fullscreenWindowIds.includes(id) ? 'talos-floating-window-fullscreen' : '',
                `talos-window-transition-${transitionStateFor(id)}`,
            ]"
            :style="floatingWindowStyle(id, index)"
            :data-window-transition="transitionStateFor(id)"
            :data-window-origin-source="transitionOriginFor(id).source"
            :data-window-origin-x="String(transitionOriginFor(id).x)"
            :data-window-origin-y="String(transitionOriginFor(id).y)"
            @close="emitWindow('closeWindow', $event)"
            @minimize="emitWindow('minimizeWindow', $event)"
            @dock="emitWindow('dockWindow', $event)"
            @fullscreen="emitWindow('fullscreenWindow', $event)"
            @focus="emitWindow('focusWindow', $event)"
            @drag-start="startWindowDrag"
            @resize-start="startWindowResize"
            @reset-size="resetFloatingWindowSize"
        >
            <template v-if="id === 'runtime'">
                <TalosRunTimeline
                    :requested-tab="runtimeRequestedTab"
                    :requested-tab-revision="runtimeRequestedTabRevision"
                    @open-audit-log="emit('openAuditLog')"
                />
            </template>
            <template v-else-if="id === 'search'">
                <TalosWindowSectionTabs
                    :window-id="id"
                    :tabs="sectionTabsFor(id)"
                    :active-tab="activeSectionFor(id)"
                    @select="setActiveWindowSection(id, $event)"
                />
                <section
                    v-show="activeSectionFor(id) === 'context'"
                    :id="`talos-window-section-panel-${id}-context`"
                    :aria-labelledby="`talos-window-section-tab-${id}-context`"
                    role="tabpanel"
                    data-testid="talos-window-section-search-context"
                >
                    <TalosContextVault
                        @context-set-created="emit('contextSetCreated', $event)"
                        @benchmark-scenario-selected="emit('benchmarkScenarioSelected', $event)"
                    />
                </section>
                <section
                    v-show="activeSectionFor(id) === 'documents'"
                    :id="`talos-window-section-panel-${id}-documents`"
                    :aria-labelledby="`talos-window-section-tab-${id}-documents`"
                    role="tabpanel"
                    data-testid="talos-window-section-search-documents"
                >
                    <TalosDocuments />
                </section>
            </template>
            <template v-else-if="id === 'brain'">
                <TalosWindowSectionTabs
                    :window-id="id"
                    :tabs="sectionTabsFor(id)"
                    :active-tab="activeSectionFor(id)"
                    @select="setActiveWindowSection(id, $event)"
                />
                <section
                    v-show="activeSectionFor(id) === 'memory'"
                    :id="`talos-window-section-panel-${id}-memory`"
                    :aria-labelledby="`talos-window-section-tab-${id}-memory`"
                    role="tabpanel"
                    data-testid="talos-window-section-brain-memory"
                >
                    <TalosMemoryManager />
                </section>
                <section
                    v-show="activeSectionFor(id) === 'skills'"
                    :id="`talos-window-section-panel-${id}-skills`"
                    :aria-labelledby="`talos-window-section-tab-${id}-skills`"
                    role="tabpanel"
                    data-testid="talos-window-section-brain-skills"
                >
                    <TalosSkillRegistry
                        :skills="brainSkills"
                        :planning-context="brainSkillPlanningContext"
                    />
                </section>
                <section
                    v-show="activeSectionFor(id) === 'skill_audit'"
                    :id="`talos-window-section-panel-${id}-skill_audit`"
                    :aria-labelledby="`talos-window-section-tab-${id}-skill_audit`"
                    role="tabpanel"
                    data-testid="talos-window-section-brain-skill-audit"
                >
                    <TalosSkillAudit
                        :skill="activeBrainSkill"
                        :planning-enabled="activeBrainSkill ? brainSkillPlanningContext?.skills.some((skill) => skill.name === activeBrainSkill.name) ?? false : false"
                        :exclusion-reason="null"
                    />
                </section>
            </template>
            <template v-else-if="id === 'calendar'">
                <TalosCalendar />
            </template>
            <template v-else-if="id === 'compare'">
                <TalosBenchmarkWorkbench
                    compare-endpoint="/api/benchmarks/compare"
                    groups-endpoint="/api/talos/benchmark-groups"
                    export-endpoint="/api/talos/benchmark-groups/{id}/export"
                    :default-runs="1"
                    :initial-benchmark-group-id="selectedBenchmarkGroupId"
                    :initial-scenario-path="selectedBenchmarkScenarioPath"
                />
            </template>
            <template v-else-if="id === 'model_lab'">
                <TalosWindowSectionTabs
                    :window-id="id"
                    :tabs="sectionTabsFor(id)"
                    :active-tab="activeSectionFor(id)"
                    @select="setActiveWindowSection(id, $event)"
                />
                <section
                    v-show="activeSectionFor(id) === 'cookbook'"
                    :id="`talos-window-section-panel-${id}-cookbook`"
                    :aria-labelledby="`talos-window-section-tab-${id}-cookbook`"
                    role="tabpanel"
                    data-testid="talos-window-section-model_lab-cookbook"
                >
                    <TalosCookbook />
                </section>
                <section
                    v-show="activeSectionFor(id) === 'models'"
                    :id="`talos-window-section-panel-${id}-models`"
                    :aria-labelledby="`talos-window-section-tab-${id}-models`"
                    role="tabpanel"
                    data-testid="talos-window-section-model_lab-models"
                >
                    <TalosModelCenter />
                </section>
            </template>
            <template v-else-if="id === 'research'">
                <TalosResearchWorkbench @open-library="emit('openWindow', 'library')" />
            </template>
            <template v-else-if="id === 'gallery'">
                <TalosArtifactGallery />
            </template>
            <template v-else-if="id === 'library'">
                <TalosWindowSectionTabs
                    :window-id="id"
                    :tabs="sectionTabsFor(id)"
                    :active-tab="activeSectionFor(id)"
                    @select="setActiveWindowSection(id, $event)"
                />
                <section
                    v-show="activeSectionFor(id) === 'context'"
                    :id="`talos-window-section-panel-${id}-context`"
                    :aria-labelledby="`talos-window-section-tab-${id}-context`"
                    role="tabpanel"
                    data-testid="talos-window-section-library-context"
                >
                    <TalosContextVault
                        @context-set-created="emit('contextSetCreated', $event)"
                        @benchmark-scenario-selected="emit('benchmarkScenarioSelected', $event)"
                    />
                </section>
                <section
                    v-show="activeSectionFor(id) === 'documents'"
                    :id="`talos-window-section-panel-${id}-documents`"
                    :aria-labelledby="`talos-window-section-tab-${id}-documents`"
                    role="tabpanel"
                    data-testid="talos-window-section-library-documents"
                >
                    <TalosDocuments />
                </section>
            </template>
            <template v-else-if="id === 'notes'">
                <TalosNotes />
            </template>
            <template v-else-if="id === 'tasks'">
                <TalosWindowSectionTabs
                    :window-id="id"
                    :tabs="sectionTabsFor(id)"
                    :active-tab="activeSectionFor(id)"
                    @select="setActiveWindowSection(id, $event)"
                />
                <section
                    v-show="activeSectionFor(id) === 'tasks'"
                    :id="`talos-window-section-panel-${id}-tasks`"
                    :aria-labelledby="`talos-window-section-tab-${id}-tasks`"
                    role="tabpanel"
                    data-testid="talos-window-section-tasks-tasks"
                >
                    <TalosTasks />
                </section>
                <section
                    v-show="activeSectionFor(id) === 'email'"
                    :id="`talos-window-section-panel-${id}-email`"
                    :aria-labelledby="`talos-window-section-tab-${id}-email`"
                    role="tabpanel"
                    data-testid="talos-window-section-tasks-email"
                >
                    <section data-testid="talos-productivity-section-email-triage" tabindex="-1" class="outline-none">
                        <TalosEmailTriage />
                    </section>
                </section>
            </template>
            <template v-else-if="id === 'tools'">
                <TalosToolRegistry />
            </template>
            <template v-else-if="id === 'settings'">
                <TalosSettingsCenter
                    :model-profiles="modelProfiles"
                    :context-sets="contextSets"
                    :selected-model-profile-id="selectedModelProfileId"
                    :selected-context-set-id="selectedContextSetId"
                    :focused-tab="settingsRequestedTab"
                    :focused-tab-revision="settingsRequestedTabRevision"
                    :authenticated="authenticated"
                    :auth-user-name="authUserName"
                    :logout-url="logoutUrl"
                    :csrf-token="csrfToken"
                    @select-model="emit('selectModel', $event)"
                    @select-context="emit('selectContext', $event)"
                    @change-theme="(nextTheme, persist) => emit('changeTheme', nextTheme, persist)"
                    @open-module="emit('openModule', $event)"
                    @saved="emit('settingsSaved')"
                />
            </template>
            <template v-else-if="id === 'theme'">
                <TalosThemeEngine
                    :theme="theme"
                    @change-theme="(nextTheme, persist) => emit('changeTheme', nextTheme, persist)"
                    @theme-customization-changed="emit('themeCustomizationChanged', $event)"
                    @theme-draft-changed="emit('themeDraftChanged', $event)"
                />
            </template>
            <template v-else-if="id === 'doctor'">
                <Card>
                    <div class="text-xs font-semibold uppercase text-[var(--talos-muted)]">Admin token</div>
                    <Input
                        v-model="adminToken"
                        type="password"
                        class="mt-2"
                        placeholder="X-Talos-Api-Token"
                        aria-label="TALOS admin API token"
                    />
                </Card>
                <TalosWindowSectionTabs
                    class="mt-3"
                    :window-id="id"
                    :tabs="sectionTabsFor(id)"
                    :active-tab="activeSectionFor(id)"
                    @select="setActiveWindowSection(id, $event)"
                />
                <section
                    v-show="activeSectionFor(id) === 'doctor'"
                    :id="`talos-window-section-panel-${id}-doctor`"
                    :aria-labelledby="`talos-window-section-tab-${id}-doctor`"
                    role="tabpanel"
                    data-testid="talos-window-section-doctor-doctor"
                >
                    <section data-testid="talos-admin-section-doctor" tabindex="-1" class="outline-none">
                        <TalosDoctorPanel :token="adminToken" />
                    </section>
                </section>
                <section
                    v-show="activeSectionFor(id) === 'policy'"
                    :id="`talos-window-section-panel-${id}-policy`"
                    :aria-labelledby="`talos-window-section-tab-${id}-policy`"
                    role="tabpanel"
                    data-testid="talos-window-section-doctor-policy"
                >
                    <section data-testid="talos-admin-section-policy" tabindex="-1" class="outline-none">
                        <TalosPolicyPanel :token="adminToken" />
                    </section>
                </section>
                <section
                    v-show="activeSectionFor(id) === 'shell'"
                    :id="`talos-window-section-panel-${id}-shell`"
                    :aria-labelledby="`talos-window-section-tab-${id}-shell`"
                    role="tabpanel"
                    data-testid="talos-window-section-doctor-shell"
                >
                    <section data-testid="talos-admin-section-shell" tabindex="-1" class="outline-none">
                        <TalosShellPolicyPanel :token="adminToken" />
                    </section>
                </section>
                <section
                    v-show="activeSectionFor(id) === 'backup'"
                    :id="`talos-window-section-panel-${id}-backup`"
                    :aria-labelledby="`talos-window-section-tab-${id}-backup`"
                    role="tabpanel"
                    data-testid="talos-window-section-doctor-backup"
                >
                    <section data-testid="talos-admin-section-backup" tabindex="-1" class="outline-none">
                        <TalosBackupPanel :token="adminToken" />
                    </section>
                </section>
                <section
                    v-show="activeSectionFor(id) === 'audit'"
                    :id="`talos-window-section-panel-${id}-audit`"
                    :aria-labelledby="`talos-window-section-tab-${id}-audit`"
                    role="tabpanel"
                    data-testid="talos-window-section-doctor-audit"
                >
                    <section data-testid="talos-admin-section-audit" tabindex="-1" class="outline-none">
                        <TalosAuditLog :token="adminToken" />
                    </section>
                </section>
            </template>
        </TalosToolWindow>
    </div>

    <aside v-if="hasDockedWindows" data-testid="talos-right-dock" class="pointer-events-none absolute inset-y-14 right-0 z-30 hidden w-[420px] flex-col gap-3 overflow-y-auto border-l border-[var(--talos-border)] bg-[var(--talos-sidebar)]/92 p-3 backdrop-blur lg:flex">
        <TalosToolWindow
            v-for="id in dockedVisibleWindowIds"
            :id="id"
            :key="`dock-${id}`"
            :title="windowCopy[id].title"
            :description="windowCopy[id].description"
            :active="activeWindowId === id"
            docked
            class="pointer-events-auto"
            @close="emitWindow('closeWindow', $event)"
            @minimize="emitWindow('minimizeWindow', $event)"
            @dock="emitWindow('dockWindow', $event)"
            @focus="emitWindow('focusWindow', $event)"
            @drag-start="startWindowDrag"
        >
            <TalosNotes v-if="id === 'notes'" />
            <TalosTasks v-else-if="id === 'tasks'" />
            <TalosDoctorPanel v-else-if="id === 'doctor'" :token="adminToken" />
            <div v-else class="text-sm text-[var(--talos-muted)]">
                Docked mode is optimized for Notes, Tasks and Doctor. Undock to inspect this module in full width.
            </div>
        </TalosToolWindow>
    </aside>

    <div v-if="minimizedWindowIds.length" data-testid="talos-minimized-window-dock" class="absolute bottom-28 left-4 z-40 flex flex-wrap gap-2 lg:left-6" aria-label="Minimized windows">
        <button
            v-for="id in minimizedWindowIds"
            :key="`min-${id}`"
            type="button"
            class="rounded-md border border-[var(--talos-border)] bg-[var(--talos-card)] px-3 py-2 text-xs font-medium text-[var(--talos-text)] shadow"
            :aria-label="`Restore ${windowCopy[id].title}`"
            :data-testid="`talos-restore-window-${id}`"
            @click="restoreMinimizedWindow(id, $event)"
        >
            {{ windowCopy[id].title }}
        </button>
    </div>
</template>
