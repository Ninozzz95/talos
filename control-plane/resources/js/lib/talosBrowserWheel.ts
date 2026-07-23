export const BROWSER_SCROLL_MAX_DELTA = 10_000
export const BROWSER_SCROLL_LINE_PIXELS = 40

type BrowserWheelInput = {
    deltaY: number
    deltaMode: number
}

function boundedPixelDelta(value: number) {
    if (!Number.isFinite(value)) return 0
    return Math.max(-BROWSER_SCROLL_MAX_DELTA, Math.min(BROWSER_SCROLL_MAX_DELTA, Math.round(value)))
}

export function normalizeBrowserWheelDelta(input: BrowserWheelInput, viewportHeight: number) {
    if (!Number.isFinite(input.deltaY) || !Number.isFinite(viewportHeight) || viewportHeight <= 0) return 0

    const pixels = input.deltaMode === 0
        ? input.deltaY
        : input.deltaMode === 1
            ? input.deltaY * BROWSER_SCROLL_LINE_PIXELS
            : input.deltaMode === 2
                ? input.deltaY * viewportHeight
                : 0

    return boundedPixelDelta(pixels)
}

export function browserScrollStep(viewportHeight: number, direction: 'up' | 'down') {
    if (!Number.isFinite(viewportHeight) || viewportHeight <= 0) return 0
    return boundedPixelDelta(viewportHeight * 0.8 * (direction === 'up' ? -1 : 1))
}
