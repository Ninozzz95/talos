import { describe, expect, it } from 'vitest'
import { createDefaultTalosMotionV6Preferences } from '../defaults'
import { talosInteractionMotionStyleV6 } from './style'

describe('talosInteractionMotionStyleV6', () => {
    it('applies the canonical 50 percent duration scale to runtime motion tokens', () => {
        const defaults = createDefaultTalosMotionV6Preferences()
        const defaultStyle = talosInteractionMotionStyleV6({
            themeId: 'forge',
            preferences: defaults,
            reducedMotion: false,
            paused: false,
        })
        const explicitFullScale = createDefaultTalosMotionV6Preferences()
        explicitFullScale.interface.duration_scale = 100
        const fullScaleStyle = talosInteractionMotionStyleV6({
            themeId: 'forge',
            preferences: explicitFullScale,
            reducedMotion: false,
            paused: false,
        })

        const milliseconds = (value: string) => Number(value.replace('ms', ''))
        expect(defaults.interface.duration_scale).toBe(50)
        expect(milliseconds(defaultStyle['--talos-motion-duration-window-open']))
            .toBeLessThan(milliseconds(fullScaleStyle['--talos-motion-duration-window-open']))
        expect(milliseconds(defaultStyle['--talos-motion-duration-window-close']))
            .toBeLessThan(milliseconds(fullScaleStyle['--talos-motion-duration-window-close']))
        expect(milliseconds(defaultStyle['--talos-motion-duration-menu']))
            .toBeLessThan(milliseconds(fullScaleStyle['--talos-motion-duration-menu']))
    })

    it('projects the selected V6 profile into the shared product motion tokens', () => {
        const preferences = createDefaultTalosMotionV6Preferences()
        preferences.interface.duration_scale = 150
        preferences.interface.intensity = 80
        const style = talosInteractionMotionStyleV6({
            themeId: 'signal',
            preferences,
            reducedMotion: false,
            paused: false,
        })

        expect(style['--talos-motion-duration-window-open']).toBe('521ms')
        expect(style['--talos-motion-duration-window-close']).toMatch(/^\d+ms$/)
        expect(style['--talos-motion-duration-menu']).toBe('176ms')
        expect(style['--talos-motion-duration-message-insert']).toBe('188ms')
        expect(style['--talos-motion-intensity']).toBe('0.8')
        expect(style['--talos-motion-ease']).toContain('cubic-bezier')
        expect(style['--talos-motion-ease-exit']).toContain('cubic-bezier')
        expect(style['--talos-motion-ease-exit']).not.toBe(style['--talos-motion-ease'])
    })

    it('sets disabled categories and paused runtime to immediate final-state tokens', () => {
        const preferences = createDefaultTalosMotionV6Preferences()
        preferences.interface.categories.surfaces = false
        const active = talosInteractionMotionStyleV6({
            themeId: 'forge',
            preferences,
            reducedMotion: false,
            paused: false,
        })
        expect(active['--talos-motion-duration-menu']).toBe('0ms')
        expect(active['--talos-motion-duration-message-insert']).toBe('80ms')

        const paused = talosInteractionMotionStyleV6({
            themeId: 'forge',
            preferences,
            reducedMotion: false,
            paused: true,
        })
        expect(paused['--talos-motion-duration-window-open']).toBe('0ms')
        expect(paused['--talos-motion-duration-message-insert']).toBe('0ms')
        expect(paused['--talos-motion-intensity']).toBe('0')
    })

    it('preserves a distinct V6 surface and feedback grammar for each preset profile', () => {
        const preferences = createDefaultTalosMotionV6Preferences()
        const paper = talosInteractionMotionStyleV6({ themeId: 'paper', preferences, reducedMotion: false, paused: false })
        const aurora = talosInteractionMotionStyleV6({ themeId: 'aurora', preferences, reducedMotion: false, paused: false })

        expect(paper).toMatchObject({
            '--talos-motion-open-style': 'soft-fade',
            '--talos-motion-surface-style': 'fade',
            '--talos-motion-feedback-style': 'none',
            '--talos-motion-hover-style': 'underline',
        })
        expect(aurora).toMatchObject({
            '--talos-motion-open-style': 'depth',
            '--talos-motion-surface-style': 'scale-fade',
            '--talos-motion-feedback-style': 'pulse',
            '--talos-motion-hover-style': 'node-glow',
        })

        const calm = talosInteractionMotionStyleV6({ themeId: 'calm', preferences, reducedMotion: false, paused: false })
        expect(calm).toMatchObject({
            '--talos-motion-open-style': 'soft-fade',
            '--talos-motion-surface-style': 'fade',
            '--talos-motion-feedback-style': 'pulse',
            '--talos-motion-hover-style': 'lift',
        })
    })
})
