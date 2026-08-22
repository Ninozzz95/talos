// @vitest-environment jsdom

import { beforeEach, describe, expect, it } from 'vitest'
import { parseTalosMobileDesignTokens } from '@talos-mobile/design-tokens'
import {
    applyTalosMobileDesignTokens,
    bootstrapTelemetryIdentity,
    TALOS_SHADCN_VARIABLE_MAP,
} from '@/theme/applyDesignTokens'
import identity from '@/theme/telemetry.identity.json'

let target: HTMLElement

beforeEach(() => {
    target = document.createElement('div')
})

describe('applyTalosMobileDesignTokens', () => {
    it('canonical telemetry identity parses and applies the semantic variables', () => {
        const result = bootstrapTelemetryIdentity(identity, 'light', target)
        expect(result.applied).toBe(true)
        expect(target.getAttribute('data-talos-theme')).toBe('telemetry')
        expect(target.style.getPropertyValue('--background')).toBe('#f1f8fa')
        expect(target.style.getPropertyValue('--primary')).toBe('#6ad4d4')
        expect(target.style.getPropertyValue('--talos-font-mono')).toContain('JetBrains Mono')
        expect(target.style.getPropertyValue('--radius')).toBe('0rem')
        expect(target.style.getPropertyValue('--talos-density-scale')).toBe('1')
        expect(target.style.getPropertyValue('--talos-space-page')).not.toBe('')
        expect(target.style.getPropertyValue('--talos-space-section')).not.toBe('')
        expect(target.style.getPropertyValue('--talos-space-card')).not.toBe('')
        expect(target.style.getPropertyValue('--talos-space-control')).not.toBe('')
        expect(target.style.getPropertyValue('--talos-space-inline')).not.toBe('')
        expect(target.style.getPropertyValue('--talos-icon-size')).not.toBe('')
        expect(target.style.getPropertyValue('--talos-touch-target')).toBe('3rem')
        expect(target.style.getPropertyValue('--talos-radius-card')).not.toBe('')
        expect(target.style.getPropertyValue('--talos-radius-control')).not.toBe('')
        // motion intents are deferred: exposed as data attributes, never animated.
        expect(target.getAttribute('data-talos-motion-ambient')).toBe('telemetry.ambient')
    })

    it('changes layout tokens with density and radius but keeps the 48dp floor', () => {
        const compactSharp = parseTalosMobileDesignTokens({ ...identity, density: 'compact', radius: 'sharp' })
        const spaciousSoft = parseTalosMobileDesignTokens({ ...identity, density: 'spacious', radius: 'soft' })

        applyTalosMobileDesignTokens(compactSharp, 'light', target)
        const first = {
            page: target.style.getPropertyValue('--talos-space-page'),
            card: target.style.getPropertyValue('--talos-space-card'),
            radius: target.style.getPropertyValue('--talos-radius-card'),
            touch: target.style.getPropertyValue('--talos-touch-target'),
        }
        applyTalosMobileDesignTokens(spaciousSoft, 'dark', target)

        expect(target.style.getPropertyValue('--talos-space-page')).not.toBe(first.page)
        expect(target.style.getPropertyValue('--talos-space-card')).not.toBe(first.card)
        expect(target.style.getPropertyValue('--talos-radius-card')).not.toBe(first.radius)
        expect(first.touch).toBe('3rem')
        expect(target.style.getPropertyValue('--talos-touch-target')).toBe('3rem')
    })

    it('forced light and forced dark map the exact palette roles', () => {
        const tokens = parseTalosMobileDesignTokens(identity)

        applyTalosMobileDesignTokens(tokens, 'light', target)
        expect(target.style.getPropertyValue('--background')).toBe('#f1f8fa')
        expect(target.style.getPropertyValue('--foreground')).toBe('#111827')
        expect(target.classList.contains('dark')).toBe(false)

        applyTalosMobileDesignTokens(tokens, 'dark', target)
        expect(target.style.getPropertyValue('--background')).toBe('#0b0f11')
        expect(target.style.getPropertyValue('--foreground')).toBe('#edf2f7')
        expect(target.classList.contains('dark')).toBe(true)
    })

    it('every palette role writes at least one shadcn variable', () => {
        const tokens = parseTalosMobileDesignTokens(identity)
        applyTalosMobileDesignTokens(tokens, 'light', target)
        for (const vars of Object.values(TALOS_SHADCN_VARIABLE_MAP)) {
            for (const cssVar of vars) {
                expect(target.style.getPropertyValue(cssVar), cssVar).not.toBe('')
            }
        }
    })

    it('identity payloads with unknown fields are rejected closed', () => {
        const poisoned = { ...(identity as Record<string, unknown>), rogue_field: true }
        const result = bootstrapTelemetryIdentity(poisoned, 'light', target)
        expect(result.applied).toBe(false)
        if (!result.applied) {
            expect((result.error as { code?: string }).code).toBe('unknown_field')
        }
        // fail-closed: nothing was written to the target.
        expect(target.getAttribute('data-talos-theme')).toBeNull()
        expect(target.style.getPropertyValue('--background')).toBe('')
    })
})
