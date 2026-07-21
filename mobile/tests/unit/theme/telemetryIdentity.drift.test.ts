import { describe, expect, it } from 'vitest'
import { parseTalosMobileDesignTokens } from '@talos-mobile/design-tokens'
import bundled from '@/theme/telemetry.identity.json'
// Vite resolves the desktop source's extensionless import graph, so the drift
// test compares the bundled artifact against a fresh desktop export.
import {
    TALOS_THEME_IDENTITIES_V6,
    exportTalosThemeIdentity,
} from '../../../../control-plane/resources/js/motion-v6/themeIdentity'

describe('telemetry identity drift', () => {
    it('bundled identity equals the exported desktop telemetry identity', () => {
        const desktop = TALOS_THEME_IDENTITIES_V6.find((identity) => identity.id === 'telemetry')
        expect(desktop, 'desktop telemetry identity present').toBeTruthy()
        const exported = exportTalosThemeIdentity(desktop!)
        expect(bundled).toEqual(exported)
    })

    it('bundled identity is canonical for the mobile contract', () => {
        const parsed = parseTalosMobileDesignTokens(bundled)
        expect(parsed.id).toBe('telemetry')
        expect(parsed.assets.poster.path).toBe('/talos/backgrounds/telemetry-poster.webp')
        expect(parsed.schema_version).toBe(1)
    })
})
