import {
    computed,
    getCurrentInstance,
    getCurrentScope,
    onBeforeUnmount,
    onScopeDispose,
    ref,
    toValue,
    watch,
    type MaybeRefOrGetter,
} from 'vue'
import {
    resolveTalosMotion,
    resolveTalosMotionIntent,
    type TalosMotionIntent,
    type TalosMotionOptions,
} from '../lib/talosMotion'

type TalosMotionRoot = HTMLElement | null

export type UseTalosMotionOptions = {
    themeMotion?: MaybeRefOrGetter<unknown>
    themeMotionDisabled?: MaybeRefOrGetter<boolean>
    uiAnimationProfile?: MaybeRefOrGetter<unknown>
    uiMotionDisabled?: MaybeRefOrGetter<boolean>
    prefersReducedMotion?: MaybeRefOrGetter<boolean>
    durationScale?: MaybeRefOrGetter<unknown>
    root?: MaybeRefOrGetter<TalosMotionRoot>
}

function lowPowerPreference(): boolean {
    if (typeof navigator === 'undefined') {
        return false
    }

    const connection = (navigator as Navigator & {
        connection?: { saveData?: boolean; effectiveType?: string }
    }).connection

    return connection?.saveData === true || connection?.effectiveType === 'slow-2g' || connection?.effectiveType === '2g'
}

export function useTalosMotion(options: UseTalosMotionOptions = {}) {
    const mediaReducedMotion = ref(false)
    const lowPower = ref(lowPowerPreference())
    const documentHidden = ref(typeof document !== 'undefined' && document.hidden)
    let reducedMotionQuery: MediaQueryList | null = null
    let connection: { addEventListener?: (type: string, listener: EventListener) => void; removeEventListener?: (type: string, listener: EventListener) => void } | null = null

    const prefersReducedMotion = computed(() => mediaReducedMotion.value
        || (options.prefersReducedMotion !== undefined && toValue(options.prefersReducedMotion) === true))
    const configuredMotion = computed(() => resolveTalosMotion({
        themeMotion: toValue(options.themeMotion),
        themeMotionDisabled: toValue(options.themeMotionDisabled),
        uiAnimationProfile: toValue(options.uiAnimationProfile),
        uiMotionDisabled: toValue(options.uiMotionDisabled),
        prefersReducedMotion: prefersReducedMotion.value,
        durationScale: toValue(options.durationScale),
    }))
    const motionPaused = computed(() => lowPower.value || documentHidden.value)
    const resolvedMotion = computed(() => ({
        ...configuredMotion.value,
        backgroundMotionEnabled: configuredMotion.value.backgroundMotionEnabled && !motionPaused.value,
        uiMotionEnabled: configuredMotion.value.uiMotionEnabled && !motionPaused.value,
    }))
    const uiMotionEnabled = computed(() => resolvedMotion.value.uiMotionEnabled)
    const backgroundMotionEnabled = computed(() => resolvedMotion.value.backgroundMotionEnabled)

    function durationFor(intent: TalosMotionIntent) {
        return computed(() => resolveTalosMotionIntent(intent, resolvedMotion.value).duration)
    }

    function styleFor(intent: TalosMotionIntent) {
        return computed(() => {
            const resolution = resolveTalosMotionIntent(intent, resolvedMotion.value)

            return {
                '--talos-motion-duration': `${resolution.duration}ms`,
                '--talos-motion-exit-duration': `${resolution.exitDuration}ms`,
                '--talos-motion-easing': resolution.easing,
                '--talos-motion-transition': resolution.transition,
            }
        })
    }

    function updateReducedMotion(event: MediaQueryListEvent) {
        mediaReducedMotion.value = event.matches
    }

    function updateLowPower() {
        lowPower.value = lowPowerPreference()
    }

    function updateVisibility() {
        documentHidden.value = document.hidden
    }

    function syncRoot(root: TalosMotionRoot) {
        const shell = root?.closest('.talos-shell')
        shell?.classList.toggle('talos-low-power-motion', lowPower.value)
        shell?.classList.toggle('talos-motion-paused', motionPaused.value)
    }

    function startSignals() {
        if (typeof window !== 'undefined' && window.matchMedia) {
            reducedMotionQuery = window.matchMedia('(prefers-reduced-motion: reduce)')
            mediaReducedMotion.value = reducedMotionQuery.matches
            reducedMotionQuery.addEventListener('change', updateReducedMotion)
        }

        if (typeof navigator !== 'undefined') {
            connection = (navigator as Navigator & { connection?: typeof connection }).connection ?? null
            connection?.addEventListener?.('change', updateLowPower)
        }

        if (typeof document !== 'undefined') {
            documentHidden.value = document.hidden
            document.addEventListener('visibilitychange', updateVisibility)
        }

        syncRoot(toValue(options.root) ?? null)
    }

    function stopSignals() {
        reducedMotionQuery?.removeEventListener('change', updateReducedMotion)
        connection?.removeEventListener?.('change', updateLowPower)
        if (typeof document !== 'undefined') {
            document.removeEventListener('visibilitychange', updateVisibility)
        }
        reducedMotionQuery = null
        connection = null
        const root = toValue(options.root)
        root?.closest('.talos-shell')?.classList.remove('talos-low-power-motion')
        root?.closest('.talos-shell')?.classList.remove('talos-motion-paused')
    }

    startSignals()
    const stopRootWatch = watch([() => toValue(options.root), lowPower, documentHidden], ([root]) => syncRoot(root ?? null), { immediate: true })
    if (getCurrentInstance()) {
        onBeforeUnmount(() => {
            stopRootWatch()
            stopSignals()
        })
    } else if (getCurrentScope()) {
        onScopeDispose(() => {
            stopRootWatch()
            stopSignals()
        })
    }

    return {
        prefersReducedMotion,
        lowPower,
        documentHidden,
        motionPaused,
        configuredMotion,
        resolvedMotion,
        uiMotionEnabled,
        backgroundMotionEnabled,
        durationFor,
        styleFor,
    }
}

export type { TalosMotionOptions }
