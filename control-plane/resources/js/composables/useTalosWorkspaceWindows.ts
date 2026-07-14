import { computed, getCurrentScope, onScopeDispose, ref, type Readonly, type Ref } from 'vue'
import type { TalosWindowId } from '../lib/talosWindowRegistry'
import { useTalosWindowLaunchOrigins } from './useTalosWindowLaunchOrigins'
import { useTalosWindowManager } from './useTalosWindowManager'

export function useTalosWorkspaceWindows(options: {
    initialOpen: TalosWindowId[]
    currentRailWidth: Readonly<Ref<number>>
    composerHeight: Readonly<Ref<number>>
}) {
    const viewportWidth = ref(typeof window === 'undefined' ? 1440 : window.innerWidth)
    const viewportHeight = ref(typeof window === 'undefined' ? 900 : window.innerHeight)
    const breakpoint = computed(() => (
        viewportWidth.value < 1024 ? 'mobile' : viewportWidth.value < 1280 ? 'tablet' : 'desktop'
    ))
    const area = computed(() => {
        const sheet = breakpoint.value !== 'desktop'
        const left = 0
        const top = sheet ? 96 : 0
        const desktopTop = 56
        const resolvedTop = sheet ? top : desktopTop
        const composerExclusion = sheet ? 20 : 48
        return {
            left,
            top: resolvedTop,
            right: Math.max(left + 1, sheet ? viewportWidth.value : viewportWidth.value - options.currentRailWidth.value),
            bottom: Math.max(resolvedTop + 1, viewportHeight.value - (options.composerHeight.value || 168) - composerExclusion),
        }
    })
    const tileArea = computed(() => breakpoint.value === 'desktop'
        ? {
            left: 0,
            top: 0,
            right: Math.max(1, viewportWidth.value - options.currentRailWidth.value),
            bottom: Math.max(1, viewportHeight.value),
        }
        : area.value)
    const maximizeArea = computed(() => breakpoint.value === 'desktop'
        ? {
            left: 0,
            top: 0,
            right: Math.max(1, viewportWidth.value - options.currentRailWidth.value),
            bottom: Math.max(1, viewportHeight.value),
        }
        : area.value)
    const fullscreenArea = computed(() => breakpoint.value === 'desktop'
        ? {
            left: 0,
            top: 0,
            right: Math.max(1, viewportWidth.value - options.currentRailWidth.value),
            bottom: Math.max(1, viewportHeight.value),
        }
        : area.value)
    const manager = useTalosWindowManager(options.initialOpen, { area, tileArea, maximizeArea, fullscreenArea, breakpoint })
    const launchOrigins = useTalosWindowLaunchOrigins(options.currentRailWidth, manager.openWindow)

    if (typeof window !== 'undefined') {
        const syncViewport = () => {
            viewportWidth.value = window.innerWidth
            viewportHeight.value = window.innerHeight
        }
        let densityQuery: MediaQueryList | null = null
        const handleDensityChange = () => {
            syncViewport()
            bindDensityQuery()
        }
        const bindDensityQuery = () => {
            if (densityQuery) {
                if (typeof densityQuery.removeEventListener === 'function') densityQuery.removeEventListener('change', handleDensityChange)
                else densityQuery.removeListener?.(handleDensityChange)
            }
            densityQuery = typeof window.matchMedia === 'function'
                ? window.matchMedia(`(resolution: ${window.devicePixelRatio || 1}dppx)`)
                : null
            if (typeof densityQuery?.addEventListener === 'function') densityQuery.addEventListener('change', handleDensityChange)
            else densityQuery?.addListener?.(handleDensityChange)
        }
        window.addEventListener('resize', syncViewport)
        window.addEventListener('orientationchange', syncViewport)
        window.visualViewport?.addEventListener('resize', syncViewport)
        bindDensityQuery()
        if (getCurrentScope()) onScopeDispose(() => {
            window.removeEventListener('resize', syncViewport)
            window.removeEventListener('orientationchange', syncViewport)
            window.visualViewport?.removeEventListener('resize', syncViewport)
            if (typeof densityQuery?.removeEventListener === 'function') densityQuery.removeEventListener('change', handleDensityChange)
            else densityQuery?.removeListener?.(handleDensityChange)
        })
    }

    return {
        ...manager,
        ...launchOrigins,
        breakpoint,
        area,
        tileArea,
        maximizeArea,
        fullscreenArea,
    }
}
