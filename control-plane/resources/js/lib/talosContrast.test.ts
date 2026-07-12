import { describe, expect, it } from 'vitest'
import {
    TALOS_COLOR_RESOLUTION_MAX_DEPTH,
    talosCanonicalOpaqueColor,
} from './talosContrast'

function nestedMix(depth: number): string {
    let color = '#ffffff'
    for (let index = 0; index < depth; index += 1) {
        color = `color-mix(in srgb, ${color} 100%, #000000 0%)`
    }
    return color
}

describe('TALOS authoritative opaque color projection', () => {
    it('canonicalizes opaque emitted colors through the shared parser', () => {
        expect(talosCanonicalOpaqueColor('#ABCDEF')).toBe('#abcdef')
        expect(talosCanonicalOpaqueColor('white')).toBe('#ffffff')
        expect(talosCanonicalOpaqueColor('color-mix(in srgb, #ff0000 70%, #0000ff 30%)')).toBe('#b3004d')
    })

    it.each([
        'color-mix(in srgb, white 40%, black 40%)',
        'color-mix(in srgb, #ff0000 20%, #0000ff 30%)',
    ])('rejects explicitly underweighted non-opaque color %s', (value) => {
        expect(() => talosCanonicalOpaqueColor(value)).toThrow(/opaque/i)
    })

    it('resolves nested color-mix expressions without a second parser', () => {
        expect(talosCanonicalOpaqueColor(
            'color-mix(in srgb, color-mix(in srgb, #ff0000 50%, #000000) 50%, #0000ff)',
        )).toBe('#400080')
    })

    it('accepts the documented recursion boundary and rejects the next level', () => {
        expect(TALOS_COLOR_RESOLUTION_MAX_DEPTH).toBe(16)
        expect(talosCanonicalOpaqueColor(nestedMix(TALOS_COLOR_RESOLUTION_MAX_DEPTH))).toBe('#ffffff')
        expect(() => talosCanonicalOpaqueColor(nestedMix(TALOS_COLOR_RESOLUTION_MAX_DEPTH + 1))).toThrow(/opaque/i)
    })
})
