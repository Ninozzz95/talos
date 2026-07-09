<script setup lang="ts">
import { computed, onBeforeUnmount, ref } from 'vue'
import Card from '../../ui/Card.vue'
import Input from '../../ui/Input.vue'
import TalosToolWindow from '../window/TalosToolWindow.vue'
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
import TalosSettingsCenter from '../settings/TalosSettingsCenter.vue'
import TalosThemeEngine from '../settings/TalosThemeEngine.vue'
import {
    TALOS_WINDOW_DEFAULT_SIZES,
    TALOS_WINDOW_MIN_SIZES,
    type TalosWindowId,
    type TalosWindowPosition,
    type TalosWindowSize,
} from '../../../composables/useTalosWindows'
import type { TalosContextSet, TalosModelProfile } from '../../../lib/talosTypes'
import type { TalosThemeCustomization, TalosThemeId } from '../../../lib/talosThemes'

type WindowResizeEdge = 'top' | 'right' | 'bottom' | 'left' | 'top-right' | 'bottom-right' | 'bottom-left' | 'top-left'

const props = defineProps<{
    visibleWindowIds: TalosWindowId[]
    minimizedWindowIds: TalosWindowId[]
    dockedWindowIds: TalosWindowId[]
    fullscreenWindowIds: TalosWindowId[]
    activeWindowId: TalosWindowId | null
    windowPositions: Partial<Record<TalosWindowId, TalosWindowPosition>>
    windowSizes: Partial<Record<TalosWindowId, TalosWindowSize>>
    windowZIndexes: Partial<Record<TalosWindowId, number>>
    currentRailWidth: number
    runtimeRequestedTab: 'timeline' | 'dag' | 'replay' | 'recovery' | 'artifacts'
    runtimeRequestedTabRevision: number
    selectedBenchmarkGroupId: string | null
    selectedBenchmarkScenarioPath: string | null
    modelProfiles: TalosModelProfile[]
    contextSets: TalosContextSet[]
    selectedModelProfileId: string
    selectedContextSetId: string
    authenticated: boolean
    authUserName: string
    logoutUrl: string
    csrfToken: string
    theme: TalosThemeId
}>()

const emit = defineEmits<{
    closeWindow: [id: TalosWindowId]
    minimizeWindow: [id: TalosWindowId]
    dockWindow: [id: TalosWindowId]
    fullscreenWindow: [id: TalosWindowId]
    focusWindow: [id: TalosWindowId]
    openWindow: [id: TalosWindowId]
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

const adminToken = ref('')
const interactingWindowId = ref<TalosWindowId | null>(null)
let stopWindowDragListeners: (() => void) | null = null
let stopWindowResizeListeners: (() => void) | null = null

const floatingWindowIds = computed(() => props.visibleWindowIds.filter((item) => !props.dockedWindowIds.includes(item)))
const dockedVisibleWindowIds = computed(() => props.visibleWindowIds.filter((item) => props.dockedWindowIds.includes(item)))
const hasDockedWindows = computed(() => dockedVisibleWindowIds.value.length > 0)

function isWindowId(value: string): value is TalosWindowId {
    return Object.prototype.hasOwnProperty.call(TALOS_WINDOW_DEFAULT_SIZES, value)
}

function emitWindow(action: 'closeWindow' | 'minimizeWindow' | 'dockWindow' | 'fullscreenWindow' | 'focusWindow' | 'openWindow', id: string) {
    if (!isWindowId(id)) {
        return
    }

    if (action === 'closeWindow') {
        emit('closeWindow', id)
    } else if (action === 'minimizeWindow') {
        emit('minimizeWindow', id)
    } else if (action === 'dockWindow') {
        emit('dockWindow', id)
    } else if (action === 'fullscreenWindow') {
        emit('fullscreenWindow', id)
    } else if (action === 'focusWindow') {
        emit('focusWindow', id)
    } else {
        emit('openWindow', id)
    }
}

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
    return props.windowPositions[id] ?? defaultFloatingWindowPosition(index)
}

function floatingWindowSize(id: TalosWindowId, index: number): TalosWindowSize {
    const position = floatingWindowPosition(id, index)

    return clampFloatingWindowSize(id, props.windowSizes[id] ?? TALOS_WINDOW_DEFAULT_SIZES[id], position)
}

function floatingWindowStyle(id: TalosWindowId, index: number) {
    if (props.fullscreenWindowIds.includes(id)) {
        return {
            zIndex: String(60 + (props.windowZIndexes[id] ?? index)),
        }
    }

    const position = floatingWindowPosition(id, index)
    const size = floatingWindowSize(id, index)
    const minSize = TALOS_WINDOW_MIN_SIZES[id]

    return {
        '--talos-window-x': `${position.x}px`,
        '--talos-window-y': `${position.y}px`,
        '--talos-window-width': `${size.width}px`,
        '--talos-window-height': `${size.height}px`,
        '--talos-window-min-width': `${minSize.width}px`,
        '--talos-window-min-height': `${minSize.height}px`,
        zIndex: String(50 + (props.windowZIndexes[id] ?? index)),
    }
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
            :class="fullscreenWindowIds.includes(id) ? 'talos-floating-window-fullscreen' : ''"
            :style="floatingWindowStyle(id, index)"
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
                <TalosContextVault
                    @context-set-created="emit('contextSetCreated', $event)"
                    @benchmark-scenario-selected="emit('benchmarkScenarioSelected', $event)"
                />
                <TalosDocuments class="mt-3" />
            </template>
            <template v-else-if="id === 'brain'">
                <TalosMemoryManager />
                <TalosSkillRegistry class="mt-3" />
                <TalosSkillAudit class="mt-3" />
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
                <TalosCookbook />
                <TalosModelCenter class="mt-3" />
            </template>
            <template v-else-if="id === 'research'">
                <TalosResearchWorkbench @open-library="emit('openWindow', 'library')" />
            </template>
            <template v-else-if="id === 'gallery'">
                <TalosArtifactGallery />
            </template>
            <template v-else-if="id === 'library'">
                <TalosContextVault
                    @context-set-created="emit('contextSetCreated', $event)"
                    @benchmark-scenario-selected="emit('benchmarkScenarioSelected', $event)"
                />
                <TalosDocuments class="mt-3" />
            </template>
            <template v-else-if="id === 'notes'">
                <TalosNotes />
            </template>
            <template v-else-if="id === 'tasks'">
                <TalosTasks />
                <section data-testid="talos-productivity-section-email-triage" tabindex="-1" class="mt-3 outline-none">
                    <TalosEmailTriage />
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
                <section data-testid="talos-admin-section-doctor" tabindex="-1" class="mt-3 outline-none">
                    <TalosDoctorPanel :token="adminToken" />
                </section>
                <section data-testid="talos-admin-section-policy" tabindex="-1" class="mt-3 outline-none">
                    <TalosPolicyPanel :token="adminToken" />
                </section>
                <section data-testid="talos-admin-section-backup" tabindex="-1" class="mt-3 outline-none">
                    <TalosBackupPanel :token="adminToken" />
                </section>
                <section data-testid="talos-admin-section-audit" tabindex="-1" class="mt-3 outline-none">
                    <TalosAuditLog :token="adminToken" />
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
            @click="emit('openWindow', id)"
        >
            {{ windowCopy[id].title }}
        </button>
    </div>
</template>
