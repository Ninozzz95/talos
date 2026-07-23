import { describe, expect, it } from 'vitest'
import {
    BROWSER_SCROLL_MAX_DELTA,
    browserScrollStep,
    normalizeBrowserWheelDelta,
} from './talosBrowserWheel'

describe('STAGE2A-001 browser wheel normalization', () => {
    it('normalizes pixel line and page wheel deltas and clamps the worker contract', () => {
        expect(normalizeBrowserWheelDelta({ deltaY: 125.4, deltaMode: 0 }, 800)).toBe(125)
        expect(normalizeBrowserWheelDelta({ deltaY: 3, deltaMode: 1 }, 800)).toBe(120)
        expect(normalizeBrowserWheelDelta({ deltaY: -1, deltaMode: 2 }, 800)).toBe(-800)
        expect(normalizeBrowserWheelDelta({ deltaY: 99, deltaMode: 2 }, 800)).toBe(BROWSER_SCROLL_MAX_DELTA)
        expect(normalizeBrowserWheelDelta({ deltaY: Number.NaN, deltaMode: 0 }, 800)).toBe(0)
        expect(normalizeBrowserWheelDelta({ deltaY: 1, deltaMode: 3 }, 800)).toBe(0)
        expect(normalizeBrowserWheelDelta({ deltaY: 1, deltaMode: 2 }, 0)).toBe(0)
    })

    it('builds one bounded eighty-percent viewport step for explicit controls', () => {
        expect(browserScrollStep(600, 'down')).toBe(480)
        expect(browserScrollStep(600, 'up')).toBe(-480)
        expect(browserScrollStep(50_000, 'down')).toBe(BROWSER_SCROLL_MAX_DELTA)
        expect(browserScrollStep(0, 'down')).toBe(0)
    })
})
