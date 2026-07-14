import type { TalosWindowId } from './talosWindowRegistry'
import type { TalosWindowTileTarget } from './talosWindowTilePolicy'
import type { TalosWindowBreakpoint } from './talosWindowManager'

export type TalosWindowReflow = {
    mode: 'none' | 'left' | 'right' | 'both'
    reserveLeft: boolean
    reserveRight: boolean
    leftWidth: number
    rightWidth: number
    collapseRail: boolean
}

type TalosWindowReflowSize = Readonly<{ width: number; height: number }>

function widestVisibleTile(
    visibleWindowIds: readonly TalosWindowId[],
    tileTargets: Partial<Record<TalosWindowId, TalosWindowTileTarget>>,
    windowSizes: Partial<Record<TalosWindowId, TalosWindowReflowSize>>,
    target: 'left-half' | 'right-half',
) {
    return visibleWindowIds.reduce((widest, id) => {
        if (tileTargets[id] !== target) return widest
        const width = windowSizes[id]?.width
        return typeof width === 'number' && Number.isFinite(width) ? Math.max(widest, width) : widest
    }, 0)
}

export function resolveTalosWindowReflow(
    visibleWindowIds: readonly TalosWindowId[],
    tileTargets: Partial<Record<TalosWindowId, TalosWindowTileTarget>>,
    breakpoint: TalosWindowBreakpoint,
    windowSizes: Partial<Record<TalosWindowId, TalosWindowReflowSize>> = {},
): TalosWindowReflow {
    if (breakpoint !== 'desktop') {
        return { mode: 'none', reserveLeft: false, reserveRight: false, leftWidth: 0, rightWidth: 0, collapseRail: false }
    }

    const reserveLeft = visibleWindowIds.some((id) => tileTargets[id] === 'left-half')
    const reserveRight = visibleWindowIds.some((id) => tileTargets[id] === 'right-half')
    const mode = reserveLeft && reserveRight ? 'both' : reserveLeft ? 'left' : reserveRight ? 'right' : 'none'
    const leftWidth = reserveLeft ? widestVisibleTile(visibleWindowIds, tileTargets, windowSizes, 'left-half') : 0
    const rightWidth = reserveRight ? widestVisibleTile(visibleWindowIds, tileTargets, windowSizes, 'right-half') : 0

    return { mode, reserveLeft, reserveRight, leftWidth, rightWidth, collapseRail: reserveLeft }
}
