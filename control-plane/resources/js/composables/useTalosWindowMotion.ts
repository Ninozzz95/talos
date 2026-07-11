import {
    getCurrentScope,
    nextTick,
    onScopeDispose,
    ref,
    watch,
    type Readonly,
    type Ref,
} from 'vue'
import {
    createTalosRevisionedCompletionScheduler,
    resolveTalosWindowTransitionDuration,
    talosWindowTransitionDurationVariable,
    type TalosWindowTransitionState,
} from '../lib/talosMotion'
import type { TalosWindowId } from '../lib/talosWindowRegistry'
import type { TalosWindowLaunchOrigin } from './useTalosWindowLaunchOrigins'
import { useTalosMotion } from './useTalosMotion'

type WindowMap<T> = Partial<Record<TalosWindowId, T>>

type UseTalosWindowMotionOptions = {
    visibleWindowIds: Readonly<Ref<TalosWindowId[]>>
    minimizedWindowIds?: Readonly<Ref<TalosWindowId[]>>
    windowLaunchOrigins: Readonly<Ref<WindowMap<TalosWindowLaunchOrigin>>>
    windowLaunchRevisions: Readonly<Ref<WindowMap<number>>>
    currentRailWidth: () => number
    uiMotionDisabled: Readonly<Ref<boolean>>
    requestModule: (id: TalosWindowId) => void
    minimizeWindow: (id: TalosWindowId) => void
    fullscreenWindow: (id: TalosWindowId) => void
    restoreWindow: (id: TalosWindowId) => void
}

const WINDOW_TRANSITION_ANIMATION_NAMES: Record<Exclude<TalosWindowTransitionState, 'idle'>, string[]> = {
    opening: ['talos-window-open-from-sidebar'],
    restoring: ['talos-window-restore-from-dock'],
    minimizing: ['talos-window-minimize-to-dock', 'talos-window-minimize-to-dock-fullscreen'],
    expanding: ['talos-window-expand', 'talos-window-expand-fullscreen'],
}

export function useTalosWindowMotion(options: UseTalosWindowMotionOptions) {
    const windowTransitionStates = ref<WindowMap<TalosWindowTransitionState>>({})
    const windowTransitionOrigins = ref<WindowMap<TalosWindowLaunchOrigin>>({})
    const pendingRestoreWindowIds = ref<TalosWindowId[]>([])
    const pendingRestoreOrigins = ref<WindowMap<TalosWindowLaunchOrigin>>({})
    const pendingMinimizeWindowIds = ref<TalosWindowId[]>([])
    const consumedLaunchRevisions: WindowMap<number> = {}
    const motionRoot = ref<HTMLElement | null>(null)
    const transitionCompletions = createTalosRevisionedCompletionScheduler<TalosWindowId>()
    const talosMotion = useTalosMotion({
        uiMotionDisabled: options.uiMotionDisabled,
        root: motionRoot,
    })

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

    function computedWindowDuration(state: TalosWindowTransitionState) {
        if (state === 'idle' || typeof window === 'undefined') {
            return null
        }

        const shell = motionRoot.value?.closest('.talos-shell') ?? motionRoot.value
        if (!shell) {
            return null
        }

        const property = talosWindowTransitionDurationVariable(state)
        return property ? window.getComputedStyle(shell).getPropertyValue(property) : null
    }

    function transitionDurationFor(state: TalosWindowTransitionState) {
        return resolveTalosWindowTransitionDuration(
            state,
            talosMotion.resolvedMotion.value,
            computedWindowDuration(state),
        )
    }

    function completeWindowTransition(
        id: TalosWindowId,
        state: TalosWindowTransitionState,
        revision: number,
        onComplete?: () => void,
    ) {
        if (!transitionCompletions.isCurrent(id, revision)) {
            return
        }

        if (windowTransitionStates.value[id] === state) {
            windowTransitionStates.value = {
                ...windowTransitionStates.value,
                [id]: 'idle',
            }
        }

        onComplete?.()
    }

    function scheduleWindowTransitionFallback(
        id: TalosWindowId,
        state: TalosWindowTransitionState,
        revision: number,
        onComplete?: () => void,
    ) {
        const duration = transitionDurationFor(state)
        if (duration <= 0 || typeof window === 'undefined') {
            completeWindowTransition(id, state, revision, onComplete)
            return
        }

        window.requestAnimationFrame(() => window.requestAnimationFrame(() => {
            if (!transitionCompletions.isCurrent(id, revision)) {
                return
            }

            transitionCompletions.schedule(
                id,
                revision,
                duration,
                () => completeWindowTransition(id, state, revision, onComplete),
            )
        }))
    }

    function setWindowTransition(
        id: TalosWindowId,
        state: TalosWindowTransitionState,
        origin?: TalosWindowLaunchOrigin,
        onComplete?: () => void,
    ) {
        const revision = transitionCompletions.begin(id)
        if (origin) {
            windowTransitionOrigins.value = { ...windowTransitionOrigins.value, [id]: origin }
        }
        windowTransitionStates.value = { ...windowTransitionStates.value, [id]: state }

        void nextTick(() => {
            if (transitionCompletions.isCurrent(id, revision)) {
                scheduleWindowTransitionFallback(id, state, revision, onComplete)
            }
        })
    }

    function transitionStateFor(id: TalosWindowId): TalosWindowTransitionState {
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

    function freshLaunchOrigin(id: TalosWindowId, fallbackSource: TalosWindowLaunchOrigin['source']) {
        const revision = options.windowLaunchRevisions.value[id] ?? 0
        const origin = options.windowLaunchOrigins.value[id]
        if (origin && revision > (consumedLaunchRevisions[id] ?? 0)) {
            consumedLaunchRevisions[id] = revision
            return origin
        }

        return defaultWindowOrigin(fallbackSource)
    }

    function handleWindowAnimationEnd(id: TalosWindowId, event: AnimationEvent) {
        if (event.target !== event.currentTarget) return
        const state = transitionStateFor(id)
        if (state === 'idle' || !WINDOW_TRANSITION_ANIMATION_NAMES[state].includes(event.animationName)) return
        transitionCompletions.finish(id)
    }

    function requestWindowMinimize(id: TalosWindowId) {
        if (pendingMinimizeWindowIds.value.includes(id)) return
        pendingMinimizeWindowIds.value = [...pendingMinimizeWindowIds.value, id]

        void nextTick(() => {
            const target = document.querySelector<HTMLElement>(`[data-testid="talos-minimize-target-${id}"]`)
            const origin = target ? originFromElement(target, 'dock') : minimizeDockOrigin()
            setWindowTransition(id, 'minimizing', origin, () => {
                pendingMinimizeWindowIds.value = pendingMinimizeWindowIds.value.filter((item) => item !== id)
                options.minimizeWindow(id)
            })
        })
    }

    function requestWindowFullscreen(id: TalosWindowId) {
        options.fullscreenWindow(id)
        setWindowTransition(id, 'expanding', rawTransitionOriginFor(id))
    }

    function restoreMinimizedWindow(id: TalosWindowId, event: MouseEvent) {
        const origin = originFromElement(event.currentTarget, 'dock')
        pendingRestoreWindowIds.value = [...pendingRestoreWindowIds.value.filter((item) => item !== id), id]
        pendingRestoreOrigins.value = { ...pendingRestoreOrigins.value, [id]: origin }
        options.restoreWindow(id)
    }

    watch(
        options.visibleWindowIds,
        (nextIds, previousIds = []) => {
            for (const id of nextIds) {
                options.requestModule(id)
                if (previousIds.includes(id)) continue

                const restoreOrigin = pendingRestoreOrigins.value[id]
                if (pendingRestoreWindowIds.value.includes(id) && restoreOrigin) {
                    setWindowTransition(id, 'restoring', restoreOrigin)
                    pendingRestoreWindowIds.value = pendingRestoreWindowIds.value.filter((item) => item !== id)
                    const nextOrigins = { ...pendingRestoreOrigins.value }
                    delete nextOrigins[id]
                    pendingRestoreOrigins.value = nextOrigins
                    continue
                }

                setWindowTransition(id, 'opening', freshLaunchOrigin(id, 'sidebar'))
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
                if (!options.visibleWindowIds.value.includes(id) || options.minimizedWindowIds?.value.includes(id)) continue
                consumedLaunchRevisions[id] = typeof revision === 'number' ? revision : 0
                setWindowTransition(id, 'opening', options.windowLaunchOrigins.value[id] ?? defaultWindowOrigin('sidebar'))
            }
        },
        { flush: 'post' },
    )

    watch(
        [talosMotion.motionPaused, talosMotion.uiMotionEnabled],
        ([paused, enabled]) => {
            if (paused || !enabled) transitionCompletions.finishAll()
        },
        { flush: 'sync' },
    )

    if (getCurrentScope()) {
        onScopeDispose(() => transitionCompletions.cancelAll())
    }

    return {
        motionRoot,
        pendingMinimizeWindowIds,
        transitionStateFor,
        transitionOriginFor,
        handleWindowAnimationEnd,
        requestWindowMinimize,
        requestWindowFullscreen,
        restoreMinimizedWindow,
    }
}
