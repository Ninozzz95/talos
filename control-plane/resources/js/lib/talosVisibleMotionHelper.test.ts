import { describe, expect, it } from 'vitest'
import { PNG } from 'pngjs'
import {
    cropPngToRegion,
    hasTransformAndOpacityKeyframes,
    rgbaDifferenceRatio,
    type PaintedScreenshotBounds,
} from '../../../tests/e2e/helpers/talosVisibleMotion'

function screenshot(width: number, height: number, paint: (png: PNG) => void): Buffer {
    const png = new PNG({ width, height })
    paint(png)
    return PNG.sync.write(png)
}

describe('TALOS painted-motion evidence helper', () => {
    it('computes differences inside a fixed target-bound region instead of the whole surface', () => {
        const surface: PaintedScreenshotBounds = { x: 0, y: 0, width: 4, height: 2 }
        const target: PaintedScreenshotBounds = { x: 1, y: 0, width: 2, height: 2 }
        const before = screenshot(4, 2, (png) => {
            for (let offset = 0; offset < png.data.length; offset += 4) png.data[offset] = 20
        })
        const after = screenshot(4, 2, (png) => {
            for (let offset = 0; offset < png.data.length; offset += 4) png.data[offset] = 20
            png.data[0] = 240
            png.data[12] = 240
        })

        const beforeTarget = cropPngToRegion(before, surface, target)
        const afterTarget = cropPngToRegion(after, surface, target)

        expect(rgbaDifferenceRatio(before, after)).toBeGreaterThan(0)
        expect(rgbaDifferenceRatio(beforeTarget, afterTarget)).toBe(0)
    })

    it('requires transform and opacity on every sampled animation keyframe', () => {
        expect(hasTransformAndOpacityKeyframes([
            { transform: 'translate3d(0px, 0px, 0) scale(1)', opacity: 0 },
            { transform: 'none', opacity: 1 },
        ])).toBe(true)
        expect(hasTransformAndOpacityKeyframes([
            { transform: 'none' },
            { transform: 'none' },
        ])).toBe(false)
        expect(hasTransformAndOpacityKeyframes([
            { opacity: 0 },
            { opacity: 1 },
        ])).toBe(false)
    })
})
