import {
    getCurrentScope,
    nextTick,
    onScopeDispose,
    ref,
    watch,
    type Readonly,
    type Ref,
} from 'vue'
import type { TalosMotionV6Preferences } from '../motion-v6/contracts'
import {
    createDomInteractionMotionPlatform,
    createInteractionMotionController,
} from '../motion-v6/interaction/controller'
import { getTalosInteractionProfileV6 } from '../motion-v6/interaction/profiles'
import {
    createDefaultInteractionProfile,
    resolveTalosInteractionMotion,
    type TalosInteractionMotionPlan,
} from '../motion-v6/interaction/resolver'
import type { TalosInteractionIntent } from '../motion-v6/interaction/intents'
import {
    createTalosWindowFlipPlan,
    createTalosWindowPointPlan,
    type TalosWindowMotionPoint,
    type TalosWindowMotionRect,
} from '../motion-v6/interaction/windowGeometry'
import type { TalosThemeId } from '../lib/talosThemes'
import type { TalosWindowId } from '../lib/talosWindowRegistry'
import type { TalosWindowLaunchOrigin } from './useTalosWindowLaunchOrigins'

type WindowMap<T> = Partial<Record<TalosWindowId, T>>

export type TalosWindowLifecycleState =
    | 'idle'
    | 'opening'
    | 'closing'
    | 'minimizing'
    | 'restoring'
    | 'maximizing'
    | 'unmaximizing'

type UseTalosWindowMotionOptions = {
    visibleWindowIds: Readonly<Ref<TalosWindowId[]>>
    minimizedWindowIds: Readonly<Ref<TalosWindowId[]>>
    fullscreenWindowIds: Readonly<Ref<TalosWindowId[]>>
    windowLaunchOrigins: Readonly<Ref<WindowMap<TalosWindowLaunchOrigin>>>
    windowLaunchRevisions: Readonly<Ref<WindowMap<number>>>
    currentRailWidth: () => number
    breakpoint: Readonly<Ref<'mobile' | 'tablet' | 'desktop'>>
    theme: Readonly<Ref<TalosThemeId>>
    motionPreferences: Readonly<Ref<TalosMotionV6Preferences>>
    reducedMotion: Readonly<Ref<boolean>>
    uiMotionDisabled: Readonly<Ref<boolean>>
    requestModule: (id: TalosWindowId) => void
    closeWindow: (id: TalosWindowId) => void
    minimizeWindow: (id: TalosWindowId) => void
    fullscreenWindow: (id: TalosWindowId) => void
    restoreWindow: (id: TalosWindowId) => void
}

function rectOf(target: HTMLElement): TalosWindowMotionRect {
    const rect = target.getBoundingClientRect()
    return {
        left: rect.left,
        top: rect.top,
        width: rect.width,
        height: rect.height,
    }
}

export function useTalosWindowMotion(options: UseTalosWindowMotionOptions) {
    const windowTransitionStates = ref<WindowMap<TalosWindowLifecycleState>>({})
    const windowTransitionOrigins = ref<WindowMap<TalosWindowLaunchOrigin>>({})
    const pendingRestoreWindowIds = ref<TalosWindowId[]>([])
    const pendingRestoreOrigins = ref<WindowMap<TalosWindowLaunchOrigin>>({})
    const pendingMinimizeWindowIds = ref<TalosWindowId[]>([])
    const consumedLaunchRevisions: WindowMap<number> = {}
    const lifecycleRevisions: WindowMap<number> = {}
    const pendingSemanticCompletions: WindowMap<() => void> = {}
    const motionRoot = ref<HTMLElement | null>(null)
    const controller = createInteractionMotionController(createDomInteractionMotionPlatform())

    function transitionKey(id: TalosWindowId): string {
        return `window:${id}`
    }

    function targetFor(id: TalosWindowId): HTMLElement | null {
        if (typeof document === 'undefined') return null
        return document.querySelector<HTMLElement>(`[data-window-id="${id}"]`)
    }

    function defaultWindowOrigin(source: TalosWindowLaunchOrigin['source'] = 'default'): TalosWindowLaunchOrigin {
        return {
            x: -Math.round(Math.max(72, options.currentRailWidth() * 0.45)),
            y: typeof window === 'undefined' ? 140 : Math.round(window.innerHeight * 0.42),
            source,
        }
    }

    function originFromElement(target: EventTarget | null, source: TalosWindowLaunchOrigin['source']): TalosWindowLaunchOrigin {
        if (target instanceof HTMLElement) {
            const rect = target.getBoundingClientRect()
            return {
                x: Math.round(rect.left + (rect.width / 2) - options.currentRailWidth()),
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

    function transitionStateFor(id: TalosWindowId): TalosWindowLifecycleState {
        return windowTransitionStates.value[id] ?? 'idle'
    }

    function rawTransitionOriginFor(id: TalosWindowId): TalosWindowLaunchOrigin {
        return windowTransitionOrigins.value[id]
            ?? options.windowLaunchOrigins.value[id]
            ?? defaultWindowOrigin('default')
    }

    function transitionOriginFor(id: TalosWindowId): TalosWindowLaunchOrigin {
        const origin = rawTransitionOriginFor(id)
        const stageTop = motionRoot.value?.getBoundingClientRect().top ?? 56
        return { ...origin, y: Math.round(origin.y - stageTop) }
    }

    function viewportPointFor(origin: TalosWindowLaunchOrigin): TalosWindowMotionPoint {
        const stage = motionRoot.value?.getBoundingClientRect()
        return {
            x: Math.round((stage?.left ?? 0) + origin.x),
            y: Math.round(origin.y),
        }
    }

    function freshLaunchOrigin(id: TalosWindowId, fallbackSource: TalosWindowLaunchOrigin['source']) {
        const revision = options.windowLaunchRevisions.value[id] ?? 0
        const origin = options.windowLaunchOrigins.value[id]
        if (origin && revision > (consumedLaunchRevisions[id] ?? 0)) {
            consumedLaunchRevisions[id] = revision
            return origin
        }
        return defaultWindowOrigin(fallbackSource)
    }

    function resolvePlan(intent: TalosInteractionIntent): TalosInteractionMotionPlan {
        const preferences = options.motionPreferences.value
        return resolveTalosInteractionMotion({
            intent,
            profile: getTalosInteractionProfileV6(options.theme.value) ?? createDefaultInteractionProfile(),
            interfaceEnabled: preferences.interface_enabled && !options.uiMotionDisabled.value,
            reducedMotion: options.reducedMotion.value,
            preferences: preferences.interface,
        })
    }

    function focusEntryTarget(target: HTMLElement | null) {
        if (!target) return
        if (options.breakpoint.value === 'desktop') {
            target.focus({ preventScroll: true })
            return
        }
        const primaryAction = target.querySelector<HTMLElement>(
            'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
        )
        const focusTarget = primaryAction ?? target
        focusTarget.focus({ preventScroll: true })
    }

    function clearPendingMinimize(id: TalosWindowId) {
        pendingMinimizeWindowIds.value = pendingMinimizeWindowIds.value.filter((candidate) => candidate !== id)
    }

    function beginTransition(
        id: TalosWindowId,
        state: TalosWindowLifecycleState,
        origin?: TalosWindowLaunchOrigin,
    ): number {
        controller.cancel(transitionKey(id))
        lifecycleRevisions[id] = (lifecycleRevisions[id] ?? 0) + 1
        delete pendingSemanticCompletions[id]
        if (state !== 'minimizing') clearPendingMinimize(id)
        if (origin) windowTransitionOrigins.value = { ...windowTransitionOrigins.value, [id]: origin }
        windowTransitionStates.value = { ...windowTransitionStates.value, [id]: state }
        return lifecycleRevisions[id]!
    }

    function isCurrent(id: TalosWindowId, revision: number): boolean {
        return lifecycleRevisions[id] === revision
    }

    function completeTransition(id: TalosWindowId, revision: number, semanticCompletion?: () => void) {
        if (!isCurrent(id, revision)) return
        delete pendingSemanticCompletions[id]
        windowTransitionStates.value = { ...windowTransitionStates.value, [id]: 'idle' }
        semanticCompletion?.()
    }

    function runTransition(
        id: TalosWindowId,
        revision: number,
        target: HTMLElement | null,
        plan: TalosInteractionMotionPlan,
        semanticCompletion?: () => void,
        preserveFocus = true,
    ) {
        if (!isCurrent(id, revision)) return
        if (semanticCompletion) pendingSemanticCompletions[id] = semanticCompletion
        if (!target) {
            completeTransition(id, revision, semanticCompletion)
            return
        }
        controller.run(transitionKey(id), target, plan, {
            preserveFocus,
            onComplete: () => completeTransition(id, revision, semanticCompletion),
        })
    }

    async function runEntryTransition(
        id: TalosWindowId,
        state: 'opening' | 'restoring',
        intent: 'window-open' | 'window-restore',
        origin: TalosWindowLaunchOrigin,
    ) {
        const revision = beginTransition(id, state, origin)
        await nextTick()
        if (!isCurrent(id, revision)) return
        const target = targetFor(id)
        const base = resolvePlan(intent)
        const plan = target && options.breakpoint.value === 'desktop'
            ? createTalosWindowPointPlan(base, {
                direction: 'enter',
                target: rectOf(target),
                point: viewportPointFor(origin),
            })
            : base
        runTransition(id, revision, target, plan, () => focusEntryTarget(target), false)
    }

    function requestWindowClose(id: TalosWindowId) {
        const revision = beginTransition(id, 'closing', rawTransitionOriginFor(id))
        const target = targetFor(id)
        const base = resolvePlan('window-close')
        const plan = target && options.breakpoint.value === 'desktop'
            ? createTalosWindowPointPlan(base, {
                direction: 'exit',
                target: rectOf(target),
                point: viewportPointFor(rawTransitionOriginFor(id)),
            })
            : base
        runTransition(id, revision, target, plan, () => options.closeWindow(id), false)
    }

    async function requestWindowMinimize(id: TalosWindowId) {
        if (pendingMinimizeWindowIds.value.includes(id)) return
        const revision = beginTransition(id, 'minimizing')
        pendingMinimizeWindowIds.value = [...pendingMinimizeWindowIds.value, id]
        await nextTick()
        if (!isCurrent(id, revision)) return
        const target = targetFor(id)
        const dockTarget = typeof document === 'undefined'
            ? null
            : document.querySelector<HTMLElement>(`[data-testid="talos-minimize-target-${id}"]`)
        const origin = dockTarget ? originFromElement(dockTarget, 'dock') : minimizeDockOrigin()
        windowTransitionOrigins.value = { ...windowTransitionOrigins.value, [id]: origin }
        const base = resolvePlan('window-minimize')
        const plan = target && options.breakpoint.value === 'desktop'
            ? createTalosWindowPointPlan(base, {
                direction: 'exit',
                target: rectOf(target),
                point: viewportPointFor(origin),
            })
            : base
        runTransition(id, revision, target, plan, () => {
            clearPendingMinimize(id)
            options.minimizeWindow(id)
        }, false)
    }

    async function requestWindowFullscreen(id: TalosWindowId) {
        const wasFullscreen = options.fullscreenWindowIds.value.includes(id)
        const revision = beginTransition(id, wasFullscreen ? 'unmaximizing' : 'maximizing')
        const target = targetFor(id)
        const before = target ? rectOf(target) : null
        options.fullscreenWindow(id)
        await nextTick()
        if (!isCurrent(id, revision)) return
        const updatedTarget = targetFor(id)
        if (!before || !updatedTarget) {
            completeTransition(id, revision)
            return
        }
        const plan = createTalosWindowFlipPlan(resolvePlan('window-open'), {
            before,
            after: rectOf(updatedTarget),
        })
        runTransition(id, revision, updatedTarget, plan)
    }

    function restoreMinimizedWindow(id: TalosWindowId, event: MouseEvent) {
        const origin = originFromElement(event.currentTarget, 'dock')
        pendingRestoreWindowIds.value = [...pendingRestoreWindowIds.value.filter((candidate) => candidate !== id), id]
        pendingRestoreOrigins.value = { ...pendingRestoreOrigins.value, [id]: origin }
        options.restoreWindow(id)
    }

    function flushPendingTransitions() {
        for (const [rawId, completion] of Object.entries(pendingSemanticCompletions)) {
            const id = rawId as TalosWindowId
            controller.cancel(transitionKey(id))
            lifecycleRevisions[id] = (lifecycleRevisions[id] ?? 0) + 1
            delete pendingSemanticCompletions[id]
            clearPendingMinimize(id)
            windowTransitionStates.value = { ...windowTransitionStates.value, [id]: 'idle' }
            completion?.()
        }
    }

    watch(
        options.visibleWindowIds,
        (nextIds, previousIds = []) => {
            for (const id of nextIds) {
                options.requestModule(id)
                if (previousIds.includes(id)) continue
                const restoreOrigin = pendingRestoreOrigins.value[id]
                if (pendingRestoreWindowIds.value.includes(id) && restoreOrigin) {
                    void runEntryTransition(id, 'restoring', 'window-restore', restoreOrigin)
                    pendingRestoreWindowIds.value = pendingRestoreWindowIds.value.filter((candidate) => candidate !== id)
                    const nextOrigins = { ...pendingRestoreOrigins.value }
                    delete nextOrigins[id]
                    pendingRestoreOrigins.value = nextOrigins
                    continue
                }
                void runEntryTransition(id, 'opening', 'window-open', freshLaunchOrigin(id, 'sidebar'))
            }
        },
        { flush: 'pre', immediate: true },
    )

    watch(
        options.windowLaunchRevisions,
        (nextRevisions, previousRevisions = {}) => {
            for (const [rawId, revision] of Object.entries(nextRevisions)) {
                const id = rawId as TalosWindowId
                if (previousRevisions[id] === revision) continue
                if (!options.visibleWindowIds.value.includes(id) || options.minimizedWindowIds.value.includes(id)) continue
                consumedLaunchRevisions[id] = typeof revision === 'number' ? revision : 0
                void runEntryTransition(
                    id,
                    'opening',
                    'window-open',
                    options.windowLaunchOrigins.value[id] ?? defaultWindowOrigin('sidebar'),
                )
            }
        },
        { flush: 'post' },
    )

    watch(
        [options.uiMotionDisabled, options.reducedMotion, () => options.motionPreferences.value.interface_enabled,
            () => options.motionPreferences.value.interface.profile,
            () => options.motionPreferences.value.interface.categories.windows],
        ([disabled, reduced, enabled, profile, windowsEnabled]) => {
            if (disabled || reduced || !enabled || profile === 'off' || !windowsEnabled) flushPendingTransitions()
        },
        { flush: 'sync' },
    )

    if (getCurrentScope()) {
        onScopeDispose(() => controller.dispose())
    }

    return {
        motionRoot,
        pendingMinimizeWindowIds,
        transitionStateFor,
        transitionOriginFor,
        requestWindowClose,
        requestWindowMinimize,
        requestWindowFullscreen,
        restoreMinimizedWindow,
    }
}
