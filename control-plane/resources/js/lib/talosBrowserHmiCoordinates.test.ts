import { describe, expect, it } from 'vitest'
import { browserFramePoint, livePointerCoordinate } from './talosBrowserHmiCoordinates'

describe('browser HMI live coordinate harness', () => {
    it('treats empty environment input as absent instead of normalized zero', () => {
        expect(livePointerCoordinate(undefined, 0.6173)).toBe(0.6173)
        expect(livePointerCoordinate('', 0.6173)).toBe(0.6173)
        expect(livePointerCoordinate('   ', 0.6173)).toBe(0.6173)
        expect(livePointerCoordinate('0', 0.6173)).toBe(0)
    })

    it('targets the painted object-contained frame rather than its letterboxed stage', () => {
        const point = browserFramePoint(
            { left: 100, top: 50, width: 400, height: 400 },
            { width: 800, height: 400 },
            0.25,
            0.75,
        )

        expect(point.x).toBeCloseTo(100)
        expect(point.y).toBeCloseTo(250)
    })
})
