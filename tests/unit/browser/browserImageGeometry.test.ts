import { describe, expect, it } from 'vitest'
import {
    clampBrowserImagePan,
    mapBrowserImagePointer,
    resolveBrowserImageRect,
} from '@/lib/browser/browserImageGeometry'

describe('browser image geometry', () => {
    it('fits an image with object-contain geometry and applies bounded zoom', () => {
        expect(resolveBrowserImageRect(
            { left: 10, top: 20, width: 400, height: 300 },
            1280,
            800,
            { zoom: 2 },
        )).toEqual({ left: -190, top: -80, width: 800, height: 500, scale: 0.625 })
    })

    it('maps a painted pixel to normalized source coordinates and rejects letterboxing', () => {
        expect(mapBrowserImagePointer(
            { left: 0, top: 0, width: 400, height: 400 },
            800,
            400,
            { clientX: 200, clientY: 200 },
        )).toMatchObject({ normalizedX: 0.5, normalizedY: 0.5, sourceX: 400, sourceY: 200 })
        expect(mapBrowserImagePointer(
            { left: 0, top: 0, width: 400, height: 400 },
            800,
            400,
            { clientX: 200, clientY: 20 },
        )).toBeNull()
    })

    it('clamps pan to the painted overflow', () => {
        expect(clampBrowserImagePan(
            { left: 0, top: 0, width: 400, height: 300 },
            800,
            600,
            { zoom: 2, panX: 999, panY: -999 },
        )).toEqual({ panX: 200, panY: -150 })
    })

    it('fails closed for invalid dimensions and pointers', () => {
        expect(resolveBrowserImageRect({ left: 0, top: 0, width: 0, height: 100 }, 10, 10)).toBeNull()
        expect(mapBrowserImagePointer(
            { left: 0, top: 0, width: 100, height: 100 },
            10,
            10,
            { clientX: Number.NaN, clientY: 1 },
        )).toBeNull()
    })
})
