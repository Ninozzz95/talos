import { describe, expect, it } from 'vitest'
import { clampBrowserImagePan, mapBrowserImagePointer, resolveBrowserImageRect } from './talosBrowserImageGeometry'

describe('TALOS browser image geometry', () => {
    it('maps an object-contained landscape screenshot and rejects vertical letterbox space', () => {
        const container = { left: 100, top: 50, width: 400, height: 400 }
        const painted = resolveBrowserImageRect(container, 800, 400)

        expect(painted).toEqual({ left: 100, top: 150, width: 400, height: 200, scale: 0.5 })
        expect(mapBrowserImagePointer(container, 800, 400, { clientX: 300, clientY: 250 })).toMatchObject({
            normalizedX: 0.5,
            normalizedY: 0.5,
            sourceX: 400,
            sourceY: 200,
        })
        expect(mapBrowserImagePointer(container, 800, 400, { clientX: 300, clientY: 149.99 })).toBeNull()
        expect(mapBrowserImagePointer(container, 800, 400, { clientX: 300, clientY: 350.01 })).toBeNull()
    })

    it('maps portrait screenshots and rejects horizontal letterbox space', () => {
        const container = { left: 20, top: 30, width: 600, height: 300 }
        const painted = resolveBrowserImageRect(container, 400, 800)

        expect(painted).toEqual({ left: 245, top: 30, width: 150, height: 300, scale: 0.375 })
        expect(mapBrowserImagePointer(container, 400, 800, { clientX: 320, clientY: 180 })).toMatchObject({
            normalizedX: 0.5,
            normalizedY: 0.5,
        })
        expect(mapBrowserImagePointer(container, 400, 800, { clientX: 244, clientY: 180 })).toBeNull()
    })

    it('accounts for zoom and pan without depending on device pixel ratio', () => {
        const container = { left: 0, top: 0, width: 800, height: 600 }
        const options = { zoom: 2, panX: 200, panY: 150 }
        const painted = resolveBrowserImageRect(container, 800, 600, options)

        expect(painted).toEqual({ left: -200, top: -150, width: 1600, height: 1200, scale: 2 })
        expect(mapBrowserImagePointer(container, 800, 600, { clientX: 600, clientY: 450 }, options)).toMatchObject({
            normalizedX: 0.5,
            normalizedY: 0.5,
            sourceX: 400,
            sourceY: 300,
        })
    })

    it('keeps the bottom-right edge inside the Playwright viewport', () => {
        const result = mapBrowserImagePointer(
            { left: 10, top: 10, width: 800, height: 600 },
            800,
            600,
            { clientX: 810, clientY: 610 },
        )

        expect(result).toMatchObject({ normalizedX: 1, normalizedY: 1, sourceX: 800, sourceY: 600 })
    })

    it('fails closed for invalid geometry and non-finite pointer values', () => {
        expect(resolveBrowserImageRect({ left: 0, top: 0, width: 0, height: 100 }, 800, 600)).toBeNull()
        expect(resolveBrowserImageRect({ left: 0, top: 0, width: 100, height: 100 }, 0, 600)).toBeNull()
        expect(mapBrowserImagePointer(
            { left: 0, top: 0, width: 100, height: 100 },
            100,
            100,
            { clientX: Number.NaN, clientY: 50 },
        )).toBeNull()
    })

    it('clamps extreme pan so zoomed pixels remain reachable in landscape and portrait stages', () => {
        expect(clampBrowserImagePan(
            { left: 0, top: 0, width: 800, height: 600 },
            800,
            600,
            { zoom: 2, panX: 50_000, panY: -50_000 },
        )).toEqual({ panX: 400, panY: -300 })

        expect(clampBrowserImagePan(
            { left: 0, top: 0, width: 600, height: 600 },
            300,
            600,
            { zoom: 3, panX: -50_000, panY: 50_000 },
        )).toEqual({ panX: -150, panY: 600 })
    })

    it('fails closed to a neutral pan when geometry is invalid', () => {
        expect(clampBrowserImagePan(
            { left: 0, top: 0, width: 0, height: 600 },
            800,
            600,
            { zoom: 2, panX: 100, panY: 100 },
        )).toEqual({ panX: 0, panY: 0 })
    })
})
