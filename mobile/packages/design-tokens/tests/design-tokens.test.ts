import { describe, it } from 'node:test'
import assert from 'node:assert/strict'

import {
    TALOS_COMPONENT_RADIUS_SCALE,
    TALOS_LAYOUT_DENSITY_SCALE,
    TALOS_THEME_IDENTITY_PALETTE_ROLES,
    TalosDesignTokenError,
    parseTalosMobileDesignTokens,
    talosLayoutTokensFor,
} from '../src/index.ts'

function palette(seed: string) {
    return Object.fromEntries(
        TALOS_THEME_IDENTITY_PALETTE_ROLES.map((role, index) => [
            role,
            `#${seed}${index.toString(16).padStart(2, '0')}`,
        ]),
    )
}

function canonicalIdentity() {
    return {
        schema_version: 1,
        id: 'telemetry',
        semantic_palette: {
            light: palette('aabb'),
            dark: palette('1122'),
        },
        typography: {
            ui: {
                family: 'Instrument Sans',
                fallback_families: ['ui-sans-serif', 'system-ui', 'sans-serif'],
                provenance: 'local',
            },
            display: {
                family: 'Orbitron',
                fallback_families: ['ui-sans-serif', 'system-ui', 'sans-serif'],
                provenance: 'local',
            },
            mono: {
                family: 'JetBrains Mono',
                fallback_families: ['ui-monospace', 'monospace'],
                provenance: 'local',
            },
            fallback_metadata: {
                strategy: 'ordered',
                system_ui: 'ui-sans-serif, system-ui, sans-serif',
                system_mono: 'ui-monospace, monospace',
            },
        },
        density: 'compact',
        radius: 'balanced',
        assets: {
            poster: {
                id: 'telemetry-poster',
                path: '/talos/backgrounds/telemetry-poster.webp',
                provenance: 'local',
            },
        },
        motion_intents: {
            ambient: 'telemetry.ambient',
            surface_enter: 'telemetry.surface-enter',
            surface_exit: 'telemetry.surface-exit',
            attention: 'telemetry.attention',
            confirmation: 'telemetry.confirmation',
        },
        accessibility: {
            defaults: {
                reduced_motion: 'respect',
                min_text_contrast_ratio: 4.5,
                min_non_text_contrast_ratio: 3,
                focus_indicator: 'visible',
                status_communication: 'text-and-color',
            },
        },
    }
}

describe('talos mobile design tokens', () => {
    it('derives every Model Lab layout value from density and radius without shrinking touch targets', () => {
        assert.deepEqual(Object.keys(TALOS_LAYOUT_DENSITY_SCALE), ['compact', 'comfortable', 'spacious'])
        assert.deepEqual(Object.keys(TALOS_COMPONENT_RADIUS_SCALE), ['sharp', 'balanced', 'soft'])

        const compact = talosLayoutTokensFor('compact', 'sharp')
        const spacious = talosLayoutTokensFor('spacious', 'soft')
        assert.equal(compact.touchTarget, '3rem')
        assert.equal(spacious.touchTarget, '3rem')
        assert.notEqual(compact.page, spacious.page)
        assert.notEqual(compact.card, spacious.card)
        assert.notEqual(compact.radiusCard, spacious.radiusCard)
        assert.notEqual(compact.radiusControl, spacious.radiusControl)
    })

    it('accepts the canonical desktop theme identity shape', () => {
        const canonical = canonicalIdentity()
        assert.deepEqual(parseTalosMobileDesignTokens(canonical), canonical)
    })

    it('rejects flattened or incomplete mobile-only identity vocabularies', () => {
        assert.throws(
            () => parseTalosMobileDesignTokens({
                schema_version: 1,
                identity: { preset_id: 'telemetry' },
                palette: { accent: '#6ad4d4' },
                typography: {},
                spacing: {},
                radius: {},
                motion: {},
            }),
            (error) => error instanceof TalosDesignTokenError && error.code === 'unknown_field',
        )
    })

    it('rejects unknown nested identity keys and noncanonical palette values', () => {
        const unknownRole = canonicalIdentity()
        Object.assign(unknownRole.semantic_palette.light, { execute_hook: '#aabb00' })
        assert.throws(
            () => parseTalosMobileDesignTokens(unknownRole),
            (error) => error instanceof TalosDesignTokenError && error.code === 'unknown_field',
        )

        const invalidColor = canonicalIdentity()
        invalidColor.semantic_palette.dark.accent = 'javascript:alert(1)'
        assert.throws(
            () => parseTalosMobileDesignTokens(invalidColor),
            (error) => error instanceof TalosDesignTokenError && error.code === 'invalid_shape',
        )

        const missingRole = canonicalIdentity()
        Reflect.deleteProperty(missingRole.semantic_palette.light, 'focus')
        assert.throws(
            () => parseTalosMobileDesignTokens(missingRole),
            (error) => error instanceof TalosDesignTokenError && error.code === 'invalid_shape',
        )
    })

    it('requires asset provenance accessibility defaults and motion intent names', () => {
        const remotePoster = canonicalIdentity()
        remotePoster.assets.poster.provenance = 'remote'
        assert.throws(() => parseTalosMobileDesignTokens(remotePoster), TalosDesignTokenError)

        const missingAccessibility = canonicalIdentity()
        Reflect.deleteProperty(missingAccessibility.accessibility.defaults, 'focus_indicator')
        assert.throws(() => parseTalosMobileDesignTokens(missingAccessibility), TalosDesignTokenError)

        const rendererIntent = canonicalIdentity()
        Object.assign(rendererIntent.motion_intents, { renderer_fps: '60' })
        assert.throws(
            () => parseTalosMobileDesignTokens(rendererIntent),
            (error) => error instanceof TalosDesignTokenError && error.code === 'desktop_renderer_field',
        )

        const rendererValue = canonicalIdentity()
        rendererValue.motion_intents.ambient = 'canvas.renderer.loop'
        assert.throws(
            () => parseTalosMobileDesignTokens(rendererValue),
            (error) => error instanceof TalosDesignTokenError && error.code === 'invalid_shape',
        )
    })

    it('rejects whitespace-only typography metadata to match the contracts non-empty discipline', () => {
        const blankFamily = canonicalIdentity()
        blankFamily.typography.ui.family = '   '
        assert.throws(
            () => parseTalosMobileDesignTokens(blankFamily),
            (error) => error instanceof TalosDesignTokenError && error.code === 'invalid_shape',
        )

        const blankSystemUi = canonicalIdentity()
        blankSystemUi.typography.fallback_metadata.system_ui = '   '
        assert.throws(
            () => parseTalosMobileDesignTokens(blankSystemUi),
            (error) => error instanceof TalosDesignTokenError && error.code === 'invalid_shape',
        )

        const blankFallback = canonicalIdentity()
        blankFallback.typography.ui.fallback_families = ['   ', 'system-ui']
        assert.throws(
            () => parseTalosMobileDesignTokens(blankFallback),
            (error) => error instanceof TalosDesignTokenError && error.code === 'invalid_shape',
        )

        // A real family with internal spacing is still accepted.
        const spaced = canonicalIdentity()
        spaced.typography.ui.family = 'Instrument Sans'
        assert.equal(parseTalosMobileDesignTokens(spaced).typography.ui.family, 'Instrument Sans')
    })
})
