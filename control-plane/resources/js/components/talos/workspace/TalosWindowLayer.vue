<script setup lang="ts">
import { computed, toRef, watch } from 'vue'
import TalosMobileToolSheet from '../window/TalosMobileToolSheet.vue'
import TalosToolWindow from '../window/TalosToolWindow.vue'
import TalosWindowErrorState from '../window/TalosWindowErrorState.vue'
import TalosWindowLoadingState from '../window/TalosWindowLoadingState.vue'
import TalosWindowSectionTabs from '../window/TalosWindowSectionTabs.vue'
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
import type { TalosWindowLaunchOrigin } from '../../../composables/useTalosWindowLaunchOrigins'
import type { TalosWindowModuleContext } from '../../../lib/talosWindowModuleContext'
import type { TalosContextSet, TalosModelProfile } from '../../../lib/talosTypes'
import type { TalosThemeCustomization, TalosThemeId } from '../../../lib/talosThemes'

const props = defineProps<{
    breakpoint: 'mobile' | 'tablet' | 'desktop'
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
    setWindowBounds: [id: TalosWindowId, bounds: TalosWindowPosition & TalosWindowSize]
    resetWindowSize: [id: TalosWindowId]
    snapWindow: [id: TalosWindowId, side: 'left' | 'right']
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
    handleWindowAnimationEnd,
    requestWindowMinimize,
    requestWindowFullscreen,
    restoreMinimizedWindow,
} = useTalosWindowMotion({
    visibleWindowIds: toRef(props, 'visibleWindowIds'),
    minimizedWindowIds: toRef(props, 'minimizedWindowIds'),
    windowLaunchOrigins: toRef(props, 'windowLaunchOrigins'),
    windowLaunchRevisions: toRef(props, 'windowLaunchRevisions'),
    currentRailWidth: () => props.currentRailWidth,
    uiMotionDisabled: toRef(props, 'uiMotionDisabled'),
    requestModule: requestWindowModule,
    minimizeWindow: (id) => emit('minimizeWindow', id),
    fullscreenWindow: (id) => emit('fullscreenWindow', id),
    restoreWindow: (id) => emit('restoreWindow', id),
})

const floatingWindowIds = computed(() => props.visibleWindowIds.filter((item) => !props.dockedWindowIds.includes(item)))
const dockedVisibleWindowIds = computed(() => props.visibleWindowIds.filter((item) => props.dockedWindowIds.includes(item)))
const hasDockedWindows = computed(() => dockedVisibleWindowIds.value.length > 0)
const minimizeDockWindowIds = computed(() => TALOS_WINDOW_IDS.filter((id) => (
    props.minimizedWindowIds.includes(id) || pendingMinimizeWindowIds.value.includes(id)
)))
const mobileWindowId = computed<TalosWindowId | null>(() => {
    if (props.activeWindowId && props.visibleWindowIds.includes(props.activeWindowId)) {
        return props.activeWindowId
    }

    return props.visibleWindowIds[0] ?? null
})

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
    }
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
    startWindowDrag,
    startWindowResize,
    cancelWindowInteraction,
} = useTalosWindowInteractions({
    isDocked: (id) => props.dockedWindowIds.includes(id),
    isFullscreen: (id) => props.fullscreenWindowIds.includes(id),
    positionFor: (id) => floatingWindowPosition(id, Math.max(0, floatingWindowIds.value.indexOf(id))),
    sizeFor: (id) => floatingWindowSize(id),
    focus: (id) => emit('focusWindow', id),
    setPosition: (id, position) => emit('setWindowPosition', id, position),
    setBounds: (id, bounds) => emit('setWindowBounds', id, bounds),
    saveLayout: () => emit('saveWindowLayout'),
})

function snapFloatingWindow(id: string, side: 'left' | 'right') {
    if (isWindowId(id)) emit('snapWindow', id, side)
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
        @close="emitWindow('closeWindow', $event)"
    >
        <TalosWindowSectionTabs
            v-if="sectionTabsFor(mobileWindowId).length"
            :window-id="mobileWindowId"
            :tabs="sectionTabsFor(mobileWindowId)"
            :active-tab="activeSectionFor(mobileWindowId)"
            @select="setActiveWindowSection(mobileWindowId, $event)"
        />
        <component
            :is="windowModuleComponent(mobileWindowId)"
            v-if="windowLoadStates[mobileWindowId].status === 'success' && windowModuleComponent(mobileWindowId)"
            :context="moduleContextFor(mobileWindowId)"
        />
        <TalosWindowErrorState
            v-else-if="windowLoadStates[mobileWindowId].status === 'error'"
            :title="TALOS_WINDOW_REGISTRY[mobileWindowId].title"
            :message="windowModuleErrorMessage(mobileWindowId)"
            @retry="requestWindowModule(mobileWindowId, true)"
        />
        <TalosWindowLoadingState v-else :title="TALOS_WINDOW_REGISTRY[mobileWindowId].title" />
    </TalosMobileToolSheet>

    <div v-if="breakpoint === 'desktop'" ref="motionRoot" data-testid="talos-desktop-window-stage" class="pointer-events-none absolute inset-x-0 bottom-[calc(var(--talos-composer-height,168px)+3rem)] top-14 z-50 hidden overflow-hidden xl:block">
        <TalosToolWindow
            v-for="(id, index) in floatingWindowIds"
            :id="id"
            :key="id"
            :title="TALOS_WINDOW_REGISTRY[id].title"
            :description="TALOS_WINDOW_REGISTRY[id].description"
            :active="activeWindowId === id"
            :width="floatingWindowSize(id).width"
            :height="floatingWindowSize(id).height"
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
            @animationend="handleWindowAnimationEnd(id, $event)"
            @close="emitWindow('closeWindow', $event)"
            @minimize="emitWindow('minimizeWindow', $event)"
            @dock="emitWindow('dockWindow', $event)"
            @fullscreen="emitWindow('fullscreenWindow', $event)"
            @focus="emitWindow('focusWindow', $event)"
            @drag-start="startWindowDrag"
            @resize-start="startWindowResize"
            @reset-size="resetFloatingWindowSize"
            @snap="snapFloatingWindow"
            @cancel-interaction="cancelWindowInteraction"
        >
            <TalosWindowSectionTabs
                v-if="sectionTabsFor(id).length"
                :window-id="id"
                :tabs="sectionTabsFor(id)"
                :active-tab="activeSectionFor(id)"
                @select="setActiveWindowSection(id, $event)"
            />
            <component
                :is="windowModuleComponent(id)"
                v-if="windowLoadStates[id].status === 'success' && windowModuleComponent(id)"
                :context="moduleContextFor(id)"
            />
            <TalosWindowErrorState
                v-else-if="windowLoadStates[id].status === 'error'"
                :title="TALOS_WINDOW_REGISTRY[id].title"
                :message="windowModuleErrorMessage(id)"
                @retry="requestWindowModule(id, true)"
            />
            <TalosWindowLoadingState
                v-else
                :title="TALOS_WINDOW_REGISTRY[id].title"
            />
        </TalosToolWindow>
    </div>

    <aside v-if="breakpoint === 'desktop' && hasDockedWindows" data-testid="talos-right-dock" class="pointer-events-none absolute inset-y-14 right-0 z-30 hidden w-[420px] flex-col gap-3 overflow-y-auto border-l border-[var(--talos-border)] bg-[var(--talos-sidebar)]/92 p-3 backdrop-blur xl:flex">
        <TalosToolWindow
            v-for="id in dockedVisibleWindowIds"
            :id="id"
            :key="`dock-${id}`"
            :title="TALOS_WINDOW_REGISTRY[id].title"
            :description="TALOS_WINDOW_REGISTRY[id].description"
            :active="activeWindowId === id"
            docked
            class="pointer-events-auto"
            @close="emitWindow('closeWindow', $event)"
            @minimize="emitWindow('minimizeWindow', $event)"
            @dock="emitWindow('dockWindow', $event)"
            @focus="emitWindow('focusWindow', $event)"
            @drag-start="startWindowDrag"
        >
            <TalosWindowSectionTabs
                v-if="sectionTabsFor(id).length"
                :window-id="id"
                :tabs="sectionTabsFor(id)"
                :active-tab="activeSectionFor(id)"
                @select="setActiveWindowSection(id, $event)"
            />
            <component
                :is="windowModuleComponent(id)"
                v-if="windowLoadStates[id].status === 'success' && windowModuleComponent(id)"
                :context="moduleContextFor(id)"
            />
            <TalosWindowErrorState
                v-else-if="windowLoadStates[id].status === 'error'"
                :title="TALOS_WINDOW_REGISTRY[id].title"
                :message="windowModuleErrorMessage(id)"
                @retry="requestWindowModule(id, true)"
            />
            <TalosWindowLoadingState v-else :title="TALOS_WINDOW_REGISTRY[id].title" />
        </TalosToolWindow>
    </aside>

    <div v-if="breakpoint === 'desktop' && minimizeDockWindowIds.length" data-testid="talos-minimized-window-dock" class="absolute bottom-[calc(var(--talos-composer-height,168px)+1.5rem)] left-6 z-40 hidden flex-wrap gap-2 xl:flex" aria-label="Minimized windows">
        <template v-for="id in minimizeDockWindowIds" :key="`min-${id}`">
            <button
                v-if="minimizedWindowIds.includes(id)"
                type="button"
                class="rounded-md border border-[var(--talos-border)] bg-[var(--talos-card)] px-3 py-2 text-xs font-medium text-[var(--talos-text)] shadow"
                :aria-label="`Restore ${TALOS_WINDOW_REGISTRY[id].title}`"
                :data-testid="`talos-restore-window-${id}`"
                @click="restoreMinimizedWindow(id, $event)"
            >
                {{ TALOS_WINDOW_REGISTRY[id].title }}
            </button>
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
