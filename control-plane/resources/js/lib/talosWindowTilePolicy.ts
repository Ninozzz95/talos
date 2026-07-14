export type TalosWindowTileTarget =
    | 'none'
    | 'left-half'
    | 'right-half'
    | 'top-half'
    | 'bottom-half'
    | 'maximize-workspace'
    | 'fullscreen-workspace'

export type TalosWindowPoint = { x: number; y: number }
export type TalosWindowRect = { left: number; top: number; right: number; bottom: number }
export type TalosWindowTileBounds = { x: number; y: number; width: number; height: number }

export type TalosWindowTileAreas = {
    tile: TalosWindowRect
    maximize: TalosWindowRect
    fullscreen: TalosWindowRect
}

const TILE_EDGE_PX = 24
const RELEASE_HYSTERESIS_PX = 12

function finite(value: number) {
    return Number.isFinite(value)
}

function validRect(rect: TalosWindowRect) {
    return finite(rect.left)
        && finite(rect.top)
        && finite(rect.right)
        && finite(rect.bottom)
        && rect.right > rect.left
        && rect.bottom > rect.top
}

function rawTarget(pointer: TalosWindowPoint, stage: TalosWindowRect): TalosWindowTileTarget {
    const topDistance = pointer.y - stage.top
    const bottomDistance = stage.bottom - pointer.y
    const leftDistance = pointer.x - stage.left
    const rightDistance = stage.right - pointer.x

    if (topDistance <= TILE_EDGE_PX) return 'fullscreen-workspace'
    if (bottomDistance <= TILE_EDGE_PX) return 'bottom-half'
    if (leftDistance <= TILE_EDGE_PX) return 'left-half'
    if (rightDistance <= TILE_EDGE_PX) return 'right-half'
    return 'none'
}

function remainsInsideReleaseBand(target: TalosWindowTileTarget, pointer: TalosWindowPoint, stage: TalosWindowRect) {
    const tileRelease = TILE_EDGE_PX + RELEASE_HYSTERESIS_PX
    if (target === 'left-half') return pointer.x - stage.left <= tileRelease
    if (target === 'right-half') return stage.right - pointer.x <= tileRelease
    if (target === 'top-half') return pointer.y - stage.top <= tileRelease
    if (target === 'bottom-half') return stage.bottom - pointer.y <= tileRelease
    if (target === 'maximize-workspace') return pointer.y - stage.top <= tileRelease
    if (target === 'fullscreen-workspace') return pointer.y - stage.top <= tileRelease
    return false
}

export function resolveTalosWindowTileTarget(input: {
    pointer: TalosWindowPoint
    stage: TalosWindowRect
    previousTarget?: TalosWindowTileTarget
}): TalosWindowTileTarget {
    if (!finite(input.pointer.x) || !finite(input.pointer.y) || !validRect(input.stage)) return 'none'
    if (
        input.pointer.x < input.stage.left
        || input.pointer.x > input.stage.right
        || input.pointer.y < input.stage.top
        || input.pointer.y > input.stage.bottom
    ) return 'none'

    const next = rawTarget(input.pointer, input.stage)
    if (next !== 'none') return next
    const previous = input.previousTarget ?? 'none'
    return remainsInsideReleaseBand(previous, input.pointer, input.stage) ? previous : 'none'
}

function bounds(rect: TalosWindowRect): TalosWindowTileBounds | null {
    if (!validRect(rect)) return null
    return {
        x: Math.round(rect.left),
        y: Math.round(rect.top),
        width: Math.round(rect.right - rect.left),
        height: Math.round(rect.bottom - rect.top),
    }
}

export function resolveTalosWindowTileBounds(
    target: TalosWindowTileTarget,
    areas: TalosWindowTileAreas,
): TalosWindowTileBounds | null {
    if (target === 'none') return null
    if (target === 'maximize-workspace') return bounds(areas.maximize)
    if (target === 'fullscreen-workspace') return bounds(areas.fullscreen)
    if (!validRect(areas.tile)) return null

    const width = areas.tile.right - areas.tile.left
    const height = areas.tile.bottom - areas.tile.top
    const middleX = areas.tile.left + (width / 2)
    const middleY = areas.tile.top + (height / 2)
    if (target === 'left-half') return bounds({ ...areas.tile, right: middleX })
    if (target === 'right-half') return bounds({ ...areas.tile, left: middleX })
    if (target === 'top-half') return bounds({ ...areas.tile, bottom: middleY })
    return bounds({ ...areas.tile, top: middleY })
}
