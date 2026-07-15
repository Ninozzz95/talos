import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const moduleCollections = [
    './tools/TalosToolRegistry.vue',
    './productivity/TalosNotes.vue',
    './productivity/TalosTasks.vue',
    './email/TalosEmailTriage.vue',
    './documents/TalosDocuments.vue',
    './documents/TalosArtifactGallery.vue',
    './integrations/TalosGoogleIntegration.vue',
    './admin/TalosAuditLog.vue',
] as const

describe('TALOS module collection state ownership', () => {
    it.each(moduleCollections)('%s distinguishes failure or idle from a verified empty result', (relativePath) => {
        const source = readFileSync(new URL(relativePath, import.meta.url), 'utf8')
        expect(source).toContain('resolveTalosCollectionState')
        expect(source).toContain("=== 'empty'")
    })

    it('imports the Vue ref primitive used by the Google account request state', () => {
        const source = readFileSync(new URL('./integrations/TalosGoogleIntegration.vue', import.meta.url), 'utf8')
        expect(source).toMatch(/import\s*\{[^}]*\bref\b[^}]*}\s*from\s*'vue'/s)
    })
})
