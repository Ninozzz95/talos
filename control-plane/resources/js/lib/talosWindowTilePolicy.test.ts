import { describe, expect, it } from 'vitest'
import {
    resolveTalosWindowTileBounds,
    resolveTalosWindowTileTarget,
    type TalosWindowTileTarget,
} from './talosWindowTilePolicy'

const stage = { left: 240, top: 0, right: 1440, bottom: 900 }

describe('TALOS pure window tile policy', () => {
    it.each([
        [{ x: 600, y: 0 }, 'fullscreen-workspace'],
        [{ x: 600, y: 6 }, 'fullscreen-workspace'],
        [{ x: 600, y: 18 }, 'fullscreen-workspace'],
        [{ x: 600, y: 890 }, 'bottom-half'],
        [{ x: 244, y: 400 }, 'left-half'],
        [{ x: 1436, y: 400 }, 'right-half'],
        [{ x: 800, y: 400 }, 'none'],
    ] satisfies Array<[{ x: number; y: number }, TalosWindowTileTarget]>)('resolves pointer %o to %s', (pointer, expected) => {
        expect(resolveTalosWindowTileTarget({ pointer, stage })).toBe(expected)
    })

    it('gives the top zones deterministic precedence at corners', () => {
        expect(resolveTalosWindowTileTarget({ pointer: { x: 241, y: 0 }, stage })).toBe('fullscreen-workspace')
        expect(resolveTalosWindowTileTarget({ pointer: { x: 241, y: 7 }, stage })).toBe('fullscreen-workspace')
        expect(resolveTalosWindowTileTarget({ pointer: { x: 241, y: 20 }, stage })).toBe('fullscreen-workspace')
    })

    it('keeps the full top-edge approach on one fullscreen target', () => {
        for (const y of [24, 18, 8, 1, 0]) {
            expect(resolveTalosWindowTileTarget({
                pointer: { x: 720, y },
                stage,
                previousTarget: 'fullscreen-workspace',
            })).toBe('fullscreen-workspace')
        }
    })

    it('uses hysteresis only when the pointer has not entered another target', () => {
        expect(resolveTalosWindowTileTarget({
            pointer: { x: stage.left + 32, y: 400 },
            stage,
            previousTarget: 'left-half',
        })).toBe('left-half')
        expect(resolveTalosWindowTileTarget({
            pointer: { x: stage.left + 32, y: stage.bottom - 2 },
            stage,
            previousTarget: 'left-half',
        })).toBe('bottom-half')
    })

    it('fails closed for malformed geometry', () => {
        expect(resolveTalosWindowTileTarget({ pointer: { x: Number.NaN, y: 4 }, stage })).toBe('none')
        expect(resolveTalosWindowTileTarget({ pointer: { x: 10, y: 10 }, stage: { ...stage, right: stage.left } })).toBe('none')
    })

    it('maps each target to finite named workspace bounds', () => {
        const areas = {
            tile: { left: 240, top: 56, right: 1440, bottom: 720 },
            maximize: { left: 240, top: 56, right: 1440, bottom: 900 },
            fullscreen: { left: 0, top: 0, right: 1440, bottom: 900 },
        }

        expect(resolveTalosWindowTileBounds('left-half', areas)).toEqual({ x: 240, y: 56, width: 600, height: 664 })
        expect(resolveTalosWindowTileBounds('right-half', areas)).toEqual({ x: 840, y: 56, width: 600, height: 664 })
        expect(resolveTalosWindowTileBounds('top-half', areas)).toEqual({ x: 240, y: 56, width: 1200, height: 332 })
        expect(resolveTalosWindowTileBounds('bottom-half', areas)).toEqual({ x: 240, y: 388, width: 1200, height: 332 })
        expect(resolveTalosWindowTileBounds('maximize-workspace', areas)).toEqual({ x: 240, y: 56, width: 1200, height: 844 })
        expect(resolveTalosWindowTileBounds('fullscreen-workspace', areas)).toEqual({ x: 0, y: 0, width: 1440, height: 900 })
        expect(resolveTalosWindowTileBounds('none', areas)).toBeNull()
    })
})
