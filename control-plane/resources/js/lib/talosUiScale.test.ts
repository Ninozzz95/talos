import { describe, expect, it } from 'vitest'
import {
    TALOS_LEGACY_MESSAGE_SCALE,
    TALOS_MESSAGE_SCALE_CONSTRAINT,
    TALOS_UI_SCALE_CONSTRAINT,
    canonicalizeTalosMessageScale,
    canonicalizeTalosUiScale,
    isTalosMessageScale,
    isTalosUiScale,
    resolveTalosMessageScale,
    stepTalosMessageScale,
    stepTalosUiScale,
    talosScalePercentLabel,
} from './talosUiScale'

describe('TALOS numeric UI scale contract', () => {
    it('freezes the approved interface and message ranges', () => {
        expect(TALOS_UI_SCALE_CONSTRAINT).toEqual({ min: 0.8, max: 1.3, step: 0.05, default: 1 })
        expect(TALOS_MESSAGE_SCALE_CONSTRAINT).toEqual({ min: 0.75, max: 1.4, step: 0.05, default: 1 })
        expect(Object.isFrozen(TALOS_UI_SCALE_CONSTRAINT)).toBe(true)
        expect(Object.isFrozen(TALOS_MESSAGE_SCALE_CONSTRAINT)).toBe(true)
    })

    it('accepts only finite in-range values aligned to the canonical step', () => {
        expect([0.8, 0.85, 1, 1.25, 1.3].every(isTalosUiScale)).toBe(true)
        expect([0.75, 0.8, 1, 1.35, 1.4].every(isTalosMessageScale)).toBe(true)

        for (const value of [NaN, Infinity, -Infinity, '1', null, 0.79, 1.31, 0.875, 1.125]) {
            expect(isTalosUiScale(value), `ui ${String(value)}`).toBe(false)
        }
        for (const value of [NaN, Infinity, -Infinity, '1', null, 0.74, 1.41, 0.875, 1.125]) {
            expect(isTalosMessageScale(value), `message ${String(value)}`).toBe(false)
        }
    })

    it('snaps arbitrary finite values and clamps them to the canonical range', () => {
        expect(canonicalizeTalosUiScale(0.7)).toBe(0.8)
        expect(canonicalizeTalosUiScale(1.126)).toBe(1.15)
        expect(canonicalizeTalosUiScale(2)).toBe(1.3)
        expect(canonicalizeTalosUiScale('1.2')).toBe(1)

        expect(canonicalizeTalosMessageScale(0.7)).toBe(0.75)
        expect(canonicalizeTalosMessageScale(0.875)).toBe(0.9)
        expect(canonicalizeTalosMessageScale(1.126)).toBe(1.15)
        expect(canonicalizeTalosMessageScale(2)).toBe(1.4)
        expect(canonicalizeTalosMessageScale('1.2')).toBe(1)
    })

    it('maps legacy labels for reads while canonical values remain authoritative', () => {
        expect(TALOS_LEGACY_MESSAGE_SCALE).toEqual({
            compact: 0.875,
            balanced: 1,
            expanded: 1.15,
        })
        expect(resolveTalosMessageScale(undefined, 'compact')).toBe(0.875)
        expect(resolveTalosMessageScale(undefined, 'balanced')).toBe(1)
        expect(resolveTalosMessageScale(undefined, 'expanded')).toBe(1.15)
        expect(resolveTalosMessageScale(1.2, 'compact')).toBe(1.2)
        expect(resolveTalosMessageScale(0.875, 'expanded')).toBe(1)
        expect(resolveTalosMessageScale(undefined, 'wide')).toBe(1)
    })

    it('steps from a canonicalized baseline and stops at each bound', () => {
        expect(stepTalosUiScale(1, -1)).toBe(0.95)
        expect(stepTalosUiScale(0.8, -1)).toBe(0.8)
        expect(stepTalosUiScale(1.3, 1)).toBe(1.3)
        expect(stepTalosMessageScale(0.875, -1)).toBe(0.85)
        expect(stepTalosMessageScale(0.875, 1)).toBe(0.95)
        expect(stepTalosMessageScale(0.75, -1)).toBe(0.75)
        expect(stepTalosMessageScale(1.4, 1)).toBe(1.4)
    })

    it('formats precise percentage readouts without enum labels', () => {
        expect(talosScalePercentLabel(1)).toBe('100%')
        expect(talosScalePercentLabel(0.875)).toBe('87.5%')
        expect(talosScalePercentLabel(1.15)).toBe('115%')
    })
})
