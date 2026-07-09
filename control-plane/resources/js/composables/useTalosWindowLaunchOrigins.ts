import { ref, type ComputedRef } from 'vue'
import type { TalosWindowId } from './useTalosWindows'

export type TalosWindowLaunchOrigin = {
    x: number
    y: number
    source: 'sidebar' | 'command' | 'dock' | 'default'
}

export function useTalosWindowLaunchOrigins(
    currentRailWidth: ComputedRef<number>,
    openWindow: (id: TalosWindowId) => void,
) {
    const windowLaunchOrigins = ref<Partial<Record<TalosWindowId, TalosWindowLaunchOrigin>>>({})
    const windowLaunchRevisions = ref<Partial<Record<TalosWindowId, number>>>({})

    function launchOriginFromEvent(
        event?: MouseEvent | PointerEvent,
        source: TalosWindowLaunchOrigin['source'] = 'default',
    ): TalosWindowLaunchOrigin {
        const target = event?.currentTarget instanceof HTMLElement ? event.currentTarget : null
        const rect = target?.getBoundingClientRect()
        if (rect) {
            return {
                x: Math.round(rect.left + (rect.width / 2) - currentRailWidth.value),
                y: Math.round(rect.top + (rect.height / 2)),
                source,
            }
        }

        return {
            x: -Math.round(Math.max(72, currentRailWidth.value * 0.45)),
            y: typeof window === 'undefined' ? 120 : Math.round(window.innerHeight * 0.42),
            source,
        }
    }

    function setWindowLaunchOrigin(id: TalosWindowId, origin: TalosWindowLaunchOrigin) {
        windowLaunchOrigins.value = {
            ...windowLaunchOrigins.value,
            [id]: origin,
        }
        windowLaunchRevisions.value = {
            ...windowLaunchRevisions.value,
            [id]: (windowLaunchRevisions.value[id] ?? 0) + 1,
        }
    }

    function openWindowFromSource(
        id: TalosWindowId,
        event?: MouseEvent | PointerEvent,
        source: TalosWindowLaunchOrigin['source'] = 'default',
    ) {
        setWindowLaunchOrigin(id, launchOriginFromEvent(event, source))
        openWindow(id)
    }

    return {
        windowLaunchOrigins,
        windowLaunchRevisions,
        launchOriginFromEvent,
        setWindowLaunchOrigin,
        openWindowFromSource,
    }
}
