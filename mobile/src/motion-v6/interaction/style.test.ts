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

    it('MOTION-PRODUCT-01 publishes independently gated composer and tab-change tokens', () => {
        const activePreferences = createDefaultTalosMotionV6Preferences()
        const active = talosInteractionMotionStyleV6({
            themeId: 'forge',
            preferences: activePreferences,
            reducedMotion: false,
            paused: false,
        })
        expect(active['--talos-motion-duration-composer-expand']).toMatch(/^[1-9]\d*ms$/)
        expect(active['--talos-motion-duration-composer-collapse']).toMatch(/^[1-9]\d*ms$/)
        expect(active['--talos-motion-duration-tab-change']).toMatch(/^[1-9]\d*ms$/)
        expect(active['--talos-motion-ease-composer-expand']).toContain('cubic-bezier')
        expect(active['--talos-motion-ease-composer-collapse']).toContain('cubic-bezier')
        expect(active['--talos-motion-ease-tab-change']).toContain('cubic-bezier')
        expect(active['--talos-motion-tab-change-transform']).toContain('translate3d')
        expect(Number(active['--talos-motion-tab-change-opacity'])).toBeLessThan(1)

        /**
         * A tab change is a VIEW SWAP, and it has to be tuned like one.
         *
         * Owner 2026-08-02, on a OnePlus 13: "non c'è un'animazione, c'è solo
         * uno scatto di un frame". Measured on the device it was 69ms and
         * 1.04px, because the spec said 150ms and 4px — hover numbers, while a
         * window gets 18px and a sidebar 20. These are floors on the values
         * AFTER the default preferences have damped them — which is the number
         * a person actually sees, and the only one worth defending. The old
         * spec produced 75ms and 2.6px here, so both of these bite.
         */
        expect(Number.parseInt(active['--talos-motion-duration-tab-change'] ?? '', 10))
            .toBeGreaterThanOrEqual(100)
        expect(Math.abs(Number.parseFloat(active['--talos-motion-tab-change-x'] ?? '')))
            .toBeGreaterThanOrEqual(8)

        const composerOffPreferences = createDefaultTalosMotionV6Preferences()
        composerOffPreferences.interface.categories.composer = false
        const composerOff = talosInteractionMotionStyleV6({
            themeId: 'forge',
            preferences: composerOffPreferences,
            reducedMotion: false,
            paused: false,
        })
        expect(composerOff['--talos-motion-duration-composer-expand']).toBe('0ms')
        expect(composerOff['--talos-motion-duration-composer-collapse']).toBe('0ms')
        expect(composerOff['--talos-motion-duration-tab-change']).not.toBe('0ms')

        const navigationOffPreferences = createDefaultTalosMotionV6Preferences()
        navigationOffPreferences.interface.categories.navigation = false
        const navigationOff = talosInteractionMotionStyleV6({
            themeId: 'forge',
            preferences: navigationOffPreferences,
            reducedMotion: false,
            paused: false,
        })
        expect(navigationOff['--talos-motion-duration-tab-change']).toBe('0ms')
        expect(navigationOff['--talos-motion-duration-composer-expand']).not.toBe('0ms')
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
    })
})
