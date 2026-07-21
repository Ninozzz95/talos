<script setup lang="ts">
import { computed, provide, toRef, watch, type ComponentPublicInstance } from 'vue'
import { tooltipPortalTargetKey } from '../../ui/tooltip/portalTarget'
import TalosMobileToolSheet from '../window/TalosMobileToolSheet.vue'
import TalosMinimizedWindowChip from '../window/TalosMinimizedWindowChip.vue'
import TalosToolWindow from '../window/TalosToolWindow.vue'
import TalosWindowModuleSurface from '../window/TalosWindowModuleSurface.vue'
import TalosWindowSnapPreview from '../window/TalosWindowSnapPreview.vue'
import {
    TALOS_WINDOW_IDS,
    TALOS_WINDOW_DEFAULT_SIZES,
    TALOS_WINDOW_MIN_SIZES,
    TALOS_WINDOW_REGISTRY,
    isTalosWindowId,
    type TalosWindowId,
    type TalosWindowPosition,
    type TalosWindowSize,
} from '../../../lib/talosWindowRegistry'
import { useTalosWindowModules } from '../../../composables/useTalosWindowModules'
import { useTalosWindowInteractions } from '../../../composables/useTalosWindowInteractions'
import { useTalosWindowMotion } from '../../../composables/useTalosWindowMotion'
import { useTalosWindowPeek } from '../../../composables/useTalosWindowPeek'
import type { TalosWindowLaunchOrigin } from '../../../composables/useTalosWindowLaunchOrigins'
import type { TalosWindowModuleContext } from '../../../lib/talosWindowModuleContext'
import type { TalosContextSet, TalosMobileWindowPresentation, TalosModelProfile } from '../../../lib/talosTypes'
import type { TalosThemeCustomization, TalosThemeId } from '../../../lib/talosThemes'
import type { TalosMotionV6Preferences } from '../../../motion-v6/contracts'
import { TALOS_RIGHT_DOCK_WIDTH, type TalosWindowArea, type TalosWindowBounds } from '../../../lib/talosWindowManager'
import type { TalosWindowTileTarget } from '../../../lib/talosWindowTilePolicy'

const props = defineProps<{
    breakpoint: 'mobile' | 'tablet' | 'desktop'
    visibleWindowIds: TalosWindowId[]
    minimizedWindowIds: TalosWindowId[]
    dockedWindowIds: TalosWindowId[]
    fullscreenWindowIds: TalosWindowId[]
    activeWindowId: TalosWindowId | null
    windowPositions: Partial<Record<TalosWindowId, TalosWindowPosition>>
    windowSizes: Partial<Record<TalosWindowId, TalosWindowSize>>
    windowRestoreBounds: Partial<Record<TalosWindowId, TalosWindowBounds | null>>
    windowTileTargets: Partial<Record<TalosWindowId, TalosWindowTileTarget>>
    windowZIndexes: Partial<Record<TalosWindowId, number>>
    windowArea: TalosWindowArea
    windowMaximizeArea: TalosWindowArea
    windowFullscreenArea: TalosWindowArea
    windowLaunchOrigins: Partial<Record<TalosWindowId, TalosWindowLaunchOrigin>>
    windowLaunchRevisions: Partial<Record<TalosWindowId, number>>
    currentRailWidth: number
    runtimeRequestedTab: 'timeline' | 'dag' | 'replay' | 'recovery' | 'artifacts'
    runtimeRequestedTabRevision: number
    selectedBenchmarkGroupId: string | null
    selectedBenchmarkScenarioRef: string | null
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
    activeTalosSessionId: string | null
    theme: TalosThemeId
    motionPreferences: TalosMotionV6Preferences
    reducedMotion: boolean
    uiMotionDisabled: boolean
    mobileWindowPresentation: TalosMobileWindowPresentation
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
    setWindowBounds: [id: TalosWindowId, bounds: TalosWindowPosition & TalosWindowSize]
    resetWindowSize: [id: TalosWindowId]
    snapWindow: [id: TalosWindowId, side: 'left' | 'right']
    tileWindow: [
        id: TalosWindowId,
        target: Exclude<TalosWindowTileTarget, 'none'>,
        restoreBounds?: TalosWindowBounds,
    ]
    untileWindow: [id: TalosWindowId, bounds: TalosWindowBounds]
    saveWindowLayout: []
    openAuditLog: []
    contextSetCreated: [contextSet: TalosContextSet]
    benchmarkScenarioSelected: [scenarioRef: string]
    selectModel: [id: string]
    selectContext: [id: string]
    changeTheme: [theme: TalosThemeId, persist?: boolean]
    openModule: [id: string]
    settingsSaved: []
    themeCustomizationChanged: [settings?: { preferences?: Record<string, unknown> }]
    themeDraftChanged: [customization: TalosThemeCustomization | null]
    replayIntro: []
}>()

const {
    windowLoadStates,
    sectionTabsFor,
    activeSectionFor,
    setActiveWindowSection,
    requestWindowModule: loadWindowModule,
    windowModuleComponent,
    windowModuleErrorMessage,
} = useTalosWindowModules()

const {
    motionRoot,
    pendingMinimizeWindowIds,
    transitionStateFor,
    transitionOriginFor,
    requestWindowClose,
    retryWindowClose,
    windowActionFaultFor,
    requestWindowMinimize,
    requestWindowFullscreen,
    requestWindowTile,
    restoreMinimizedWindow,
} = useTalosWindowMotion({
    visibleWindowIds: toRef(props, 'visibleWindowIds'),
    minimizedWindowIds: toRef(props, 'minimizedWindowIds'),
    fullscreenWindowIds: toRef(props, 'fullscreenWindowIds'),
    windowLaunchOrigins: toRef(props, 'windowLaunchOrigins'),
    windowLaunchRevisions: toRef(props, 'windowLaunchRevisions'),
    currentRailWidth: () => props.currentRailWidth,
    breakpoint: toRef(props, 'breakpoint'),
    theme: toRef(props, 'theme'),
    motionPreferences: toRef(props, 'motionPreferences'),
    reducedMotion: toRef(props, 'reducedMotion'),
    uiMotionDisabled: toRef(props, 'uiMotionDisabled'),
    requestModule: requestWindowModule,
    closeWindow: (id) => emit('closeWindow', id),
    minimizeWindow: (id) => emit('minimizeWindow', id),
    fullscreenWindow: (id) => emit('fullscreenWindow', id),
    tileWindow: (id, target, restoreBounds) => emit('tileWindow', id, target, restoreBounds),
    restoreWindow: (id) => emit('restoreWindow', id),
})

const floatingWindowIds = computed(() => props.visibleWindowIds.filter((item) => !props.dockedWindowIds.includes(item)))
const dockedVisibleWindowIds = computed(() => props.visibleWindowIds.filter((item) => props.dockedWindowIds.includes(item)))
const hasDockedWindows = computed(() => dockedVisibleWindowIds.value.length > 0)
const { canPeek, isPeeked, togglePeek } = useTalosWindowPeek(toRef(props, 'visibleWindowIds'))
const minimizeDockWindowIds = computed(() => TALOS_WINDOW_IDS.filter((id) => (
    props.minimizedWindowIds.includes(id) || pendingMinimizeWindowIds.value.includes(id)
)))
const mobileWindowId = computed<TalosWindowId | null>(() => {
    if (props.activeWindowId && props.visibleWindowIds.includes(props.activeWindowId)) {
        return props.activeWindowId
    }

    return props.visibleWindowIds[0] ?? null
})
const tooltipPortalTarget = computed(() => props.breakpoint !== 'desktop' && mobileWindowId.value
    ? '#talos-mobile-tooltip-root'
    : '#talos-portal-root')
provide(tooltipPortalTargetKey, tooltipPortalTarget)

function isWindowId(value: string): value is TalosWindowId {
    return isTalosWindowId(value)
}

function requestWindowModule(id: TalosWindowId, retry = false) {
    const request = loadWindowModule(id, retry)
    void request.catch(() => undefined)
}

function moduleContextFor(id: TalosWindowId): TalosWindowModuleContext {
    return {
        id,
        activeSection: activeSectionFor(id),
        runtimeRequestedTab: props.runtimeRequestedTab,
        runtimeRequestedTabRevision: props.runtimeRequestedTabRevision,
        selectedBenchmarkGroupId: props.selectedBenchmarkGroupId,
        selectedBenchmarkScenarioRef: props.selectedBenchmarkScenarioRef,
        modelProfiles: props.modelProfiles,
        contextSets: props.contextSets,
        selectedModelProfileId: props.selectedModelProfileId,
        selectedContextSetId: props.selectedContextSetId,
        settingsRequestedTab: props.settingsRequestedTab,
        settingsRequestedTabRevision: props.settingsRequestedTabRevision,
        authenticated: props.authenticated,
        authUserName: props.authUserName,
        logoutUrl: props.logoutUrl,
        csrfToken: props.csrfToken,
        activeTalosSessionId: props.activeTalosSessionId,
        theme: props.theme,
        openWindow: (windowId) => emit('openWindow', windowId),
        openModule: (moduleId, sectionId) => {
            if (sectionId && isWindowId(moduleId)) setActiveWindowSection(moduleId, sectionId)
            emit('openModule', moduleId)
        },
        openAuditLog: () => emit('openAuditLog'),
        contextSetCreated: (contextSet) => emit('contextSetCreated', contextSet),
        benchmarkScenarioSelected: (scenarioRef) => emit('benchmarkScenarioSelected', scenarioRef),
        selectModel: (profileId) => emit('selectModel', profileId),
        selectContext: (contextSetId) => emit('selectContext', contextSetId),
        changeTheme: (theme, persist) => emit('changeTheme', theme, persist),
        settingsSaved: () => emit('settingsSaved'),
        themeCustomizationChanged: (settings) => emit('themeCustomizationChanged', settings),
        themeDraftChanged: (customization) => emit('themeDraftChanged', customization),
        replayIntro: () => emit('replayIntro'),
    }
}

function emitWindow(action: 'closeWindow' | 'minimizeWindow' | 'dockWindow' | 'fullscreenWindow' | 'focusWindow' | 'openWindow', id: string) {
    if (!isWindowId(id)) {
        return
    }

    if (action === 'closeWindow') {
        requestWindowClose(id)
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
    return {
        x: 16 + ((index % 4) * 24),
        y: 24 + ((index % 4) * 24),
    }
}

function floatingWindowPosition(id: TalosWindowId, index: number): TalosWindowPosition {
    return props.windowPositions[id] ?? defaultFloatingWindowPosition(index)
}

function floatingWindowSize(id: TalosWindowId): TalosWindowSize {
    return props.windowSizes[id] ?? TALOS_WINDOW_DEFAULT_SIZES[id]
}

function floatingWindowStyle(id: TalosWindowId, index: number) {
    const origin = transitionOriginFor(id)
    const position = floatingWindowPosition(id, index)
    const size = floatingWindowSize(id)
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
        '--talos-window-min-width': `${Math.min(minSize.width, size.width)}px`,
        '--talos-window-min-height': `${Math.min(minSize.height, size.height)}px`,
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

const {
    interactingWindowId,
    interactingWindowKind,
    previewTarget,
    previewBounds,
    bindWindowFrame,
    cancelWindowInteraction,
} = useTalosWindowInteractions({
    isDocked: (id) => props.dockedWindowIds.includes(id),
    isFullscreen: (id) => props.fullscreenWindowIds.includes(id),
    tileTargetFor: (id) => props.windowTileTargets[id] ?? 'none',
    boundsFor: (id) => ({
        ...floatingWindowPosition(id, Math.max(0, floatingWindowIds.value.indexOf(id))),
        ...floatingWindowSize(id),
    }),
    restoreBoundsFor: (id) => props.windowRestoreBounds[id] ?? null,
    stageRect: () => {
        const rect = motionRoot.value?.getBoundingClientRect()
        return rect ? { left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom } : null
    },
    tileAreas: () => ({
        tile: props.windowFullscreenArea,
        maximize: props.windowMaximizeArea,
        fullscreen: props.windowFullscreenArea,
    }),
    focus: (id) => emit('focusWindow', id),
    setBounds: (id, bounds) => emit('setWindowBounds', id, bounds),
    tile: (id, target, restoreBounds) => requestWindowTile(id, target, restoreBounds),
    untile: (id, bounds) => emit('untileWindow', id, bounds),
    saveLayout: () => emit('saveWindowLayout'),
})

function bindFloatingWindowFrame(id: TalosWindowId, element: Element | ComponentPublicInstance | null) {
    bindWindowFrame(id, element instanceof HTMLElement ? element : null)
}

function snapFloatingWindow(id: string, side: 'left' | 'right') {
    if (!isWindowId(id)) return
    requestWindowTile(
        id,
        side === 'left' ? 'left-half' : 'right-half',
        {
            ...floatingWindowPosition(id, Math.max(0, floatingWindowIds.value.indexOf(id))),
            ...floatingWindowSize(id),
        },
    )
}

function resetFloatingWindowSize(id: string) {
    if (!isWindowId(id)) {
        return
    }

    emit('resetWindowSize', id)
    emit('saveWindowLayout')
}

</script>

<template>
    <TalosMobileToolSheet
        v-if="breakpoint !== 'desktop' && mobileWindowId"
        :id="mobileWindowId"
        :key="mobileWindowId"
        :title="TALOS_WINDOW_REGISTRY[mobileWindowId].title"
        :description="TALOS_WINDOW_REGISTRY[mobileWindowId].description"
        :presentation="mobileWindowPresentation"
        :return-focus-labels="[TALOS_WINDOW_REGISTRY[mobileWindowId].title, 'Advanced']"
        :data-window-transition="transitionStateFor(mobileWindowId)"
        :data-window-motion-state="transitionStateFor(mobileWindowId)"
        :data-window-load-state="windowLoadStates[mobileWindowId].status"
        @close="emitWindow('closeWindow', $event)"
    >
        <TalosWindowModuleSurface
            :id="mobileWindowId"
            :title="TALOS_WINDOW_REGISTRY[mobileWindowId].title"
            :tabs="sectionTabsFor(mobileWindowId)"
            :active-section="activeSectionFor(mobileWindowId)"
            :load-state="windowLoadStates[mobileWindowId]"
            :module-component="windowModuleComponent(mobileWindowId)"
            :module-context="moduleContextFor(mobileWindowId)"
            :error-message="windowModuleErrorMessage(mobileWindowId)"
            @select-section="setActiveWindowSection(mobileWindowId, $event)"
            @retry="requestWindowModule(mobileWindowId, true)"
        />
    </TalosMobileToolSheet>

    <div v-if="breakpoint === 'desktop'" ref="motionRoot" data-testid="talos-desktop-window-stage" :data-window-interaction="interactingWindowKind ?? 'idle'" class="pointer-events-none absolute inset-0 z-50 hidden overflow-hidden xl:block">
        <div
            v-for="(id, index) in floatingWindowIds"
            :key="id"
            :ref="(element) => bindFloatingWindowFrame(id, element)"
            class="talos-floating-window pointer-events-auto"
            :class="fullscreenWindowIds.includes(id) ? 'talos-floating-window-fullscreen' : ''"
            :style="floatingWindowStyle(id, index)"
            :data-window-frame-id="id"
            :data-window-tile-target="windowTileTargets[id] ?? 'none'"
            :data-window-motion-state="transitionStateFor(id)"
            :data-window-origin-source="transitionOriginFor(id).source"
            :data-window-origin-x="String(transitionOriginFor(id).x)"
            :data-window-origin-y="String(transitionOriginFor(id).y)"
        >
            <TalosToolWindow
                :id="id"
                :title="TALOS_WINDOW_REGISTRY[id].title"
                :station-code="TALOS_WINDOW_REGISTRY[id].stationCode"
                :description="TALOS_WINDOW_REGISTRY[id].description"
                :active="activeWindowId === id"
                :width="floatingWindowSize(id).width"
                :height="floatingWindowSize(id).height"
                :interacting="interactingWindowId === id"
                :fullscreen="fullscreenWindowIds.includes(id)"
                :tile-target="windowTileTargets[id] ?? 'none'"
                :peek-available="canPeek(id)"
                :peeking="isPeeked(id)"
                class="h-full pointer-events-auto"
                :data-window-transition="transitionStateFor(id)"
                :data-window-motion-state="transitionStateFor(id)"
                :data-window-load-state="windowLoadStates[id].status"
                @close="emitWindow('closeWindow', $event)"
                @minimize="emitWindow('minimizeWindow', $event)"
                @dock="emitWindow('dockWindow', $event)"
                @fullscreen="emitWindow('fullscreenWindow', $event)"
                @focus="emitWindow('focusWindow', $event)"
                @reset-size="resetFloatingWindowSize"
                @snap="snapFloatingWindow"
                @peek="togglePeek"
                @cancel-interaction="cancelWindowInteraction"
            >
                <TalosWindowModuleSurface
                    :id="id"
                    :title="TALOS_WINDOW_REGISTRY[id].title"
                    :tabs="sectionTabsFor(id)"
                    :active-section="activeSectionFor(id)"
                    :load-state="windowLoadStates[id]"
                    :module-component="windowModuleComponent(id)"
                    :module-context="moduleContextFor(id)"
                    :error-message="windowModuleErrorMessage(id)"
                    @select-section="setActiveWindowSection(id, $event)"
                    @retry="requestWindowModule(id, true)"
                />
            </TalosToolWindow>
        </div>
        <TalosWindowSnapPreview :target="previewTarget" :bounds="previewBounds" />
    </div>

    <aside
        v-if="breakpoint === 'desktop' && hasDockedWindows"
        data-testid="talos-right-dock"
        class="talos-right-dock pointer-events-none absolute inset-y-14 right-0 z-30 hidden flex-col gap-3 overflow-y-auto border-l border-[var(--talos-border)] bg-[var(--talos-sidebar)]/92 p-3 backdrop-blur xl:flex"
        :style="{ width: `${TALOS_RIGHT_DOCK_WIDTH}px` }"
    >
        <TalosToolWindow
            v-for="id in dockedVisibleWindowIds"
            :id="id"
            :key="`dock-${id}`"
            :title="TALOS_WINDOW_REGISTRY[id].title"
                :station-code="TALOS_WINDOW_REGISTRY[id].stationCode"
            :description="TALOS_WINDOW_REGISTRY[id].description"
            :active="activeWindowId === id"
            docked
            :peek-available="canPeek(id)"
            :peeking="isPeeked(id)"
            class="pointer-events-auto"
            :data-window-transition="transitionStateFor(id)"
            :data-window-motion-state="transitionStateFor(id)"
            :data-window-load-state="windowLoadStates[id].status"
            @close="emitWindow('closeWindow', $event)"
            @minimize="emitWindow('minimizeWindow', $event)"
            @dock="emitWindow('dockWindow', $event)"
            @focus="emitWindow('focusWindow', $event)"
            @peek="togglePeek"
        >
            <TalosWindowModuleSurface
                :id="id"
                :title="TALOS_WINDOW_REGISTRY[id].title"
                :tabs="sectionTabsFor(id)"
                :active-section="activeSectionFor(id)"
                :load-state="windowLoadStates[id]"
                :module-component="windowModuleComponent(id)"
                :module-context="moduleContextFor(id)"
                :error-message="windowModuleErrorMessage(id)"
                @select-section="setActiveWindowSection(id, $event)"
                @retry="requestWindowModule(id, true)"
            />
        </TalosToolWindow>
    </aside>

    <div v-if="breakpoint === 'desktop' && minimizeDockWindowIds.length" data-testid="talos-minimized-window-dock" class="absolute bottom-[calc(var(--talos-composer-height,168px)+1.5rem)] left-6 z-40 hidden flex-wrap gap-2 xl:flex" aria-label="Minimized windows">
        <template v-for="id in minimizeDockWindowIds" :key="`min-${id}`">
            <TalosMinimizedWindowChip
                v-if="minimizedWindowIds.includes(id)"
                :id="id"
                :title="TALOS_WINDOW_REGISTRY[id].title"
                :close-fault="windowActionFaultFor(id)"
                @restore="restoreMinimizedWindow(id, $event)"
                @close="requestWindowClose(id)"
                @retry-close="retryWindowClose(id)"
            />
            <button
                v-else
                type="button"
                disabled
                aria-hidden="true"
                tabindex="-1"
                class="invisible pointer-events-none rounded-md border border-[var(--talos-border)] bg-[var(--talos-card)] px-3 py-2 text-xs font-medium text-[var(--talos-text)] shadow"
                :data-testid="`talos-minimize-target-${id}`"
            >
                {{ TALOS_WINDOW_REGISTRY[id].title }}
            </button>
        </template>
    </div>
</template>
