import { resolveBrowserImageRect } from './talosBrowserImageGeometry'

export function livePointerCoordinate(raw: string | undefined, fallback: number, label = 'Live browser coordinate') {
    const normalized = raw?.trim()
    if (!normalized) return fallback
    const value = Number(normalized)
    if (!Number.isFinite(value) || value < 0 || value > 1) {
        throw new Error(`${label} must be a normalized coordinate.`)
    }
    return value
}

export function browserFramePoint(
    container: { left: number; top: number; width: number; height: number },
    image: { width: number; height: number },
    normalizedX: number,
    normalizedY: number,
) {
    if (![normalizedX, normalizedY].every((value) => Number.isFinite(value) && value >= 0 && value <= 1)) {
        throw new Error('Browser frame point must be normalized.')
    }
    const painted = resolveBrowserImageRect(container, image.width, image.height)
    if (!painted) throw new Error('Browser frame has no painted object-contained surface.')

    return {
        x: (painted.left - container.left) + (painted.width * normalizedX),
        y: (painted.top - container.top) + (painted.height * normalizedY),
    }
}
