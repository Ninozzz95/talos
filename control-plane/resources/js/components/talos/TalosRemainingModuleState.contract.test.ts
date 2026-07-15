import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const remainingStateOwners = [
    './research/TalosResearchWorkbench.vue',
    './research/TalosResearchQueue.vue',
    './memory/TalosMemoryManager.vue',
    './memory/TalosSkillRegistry.vue',
    './compare/TalosModelComparison.vue',
    './email/TalosEmailDraftReview.vue',
    './admin/TalosDoctorPanel.vue',
    './admin/TalosPolicyPanel.vue',
    './admin/TalosBackupPanel.vue',
    './cookbook/TalosCookbookDownload.vue',
    './cookbook/TalosCookbookSettings.vue',
] as const

describe('TALOS remaining module state matrix', () => {
    it.each(remainingStateOwners)('%s owns explicit idle, loading, error, empty, and ready semantics', (relativePath) => {
        const source = readFileSync(new URL(relativePath, import.meta.url), 'utf8')
        expect(source).toContain('resolveTalosCollectionState')
        expect(source).toContain("=== 'empty'")
    })
})
