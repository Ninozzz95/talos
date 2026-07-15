import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const collectionOwners = [
    './benchmarks/TalosBenchmarkWorkbench.vue',
    './productivity/TalosCalendar.vue',
    './context/TalosFileStatusList.vue',
    './context/TalosContextVault.vue',
    './runs/TalosRunTimeline.vue',
    './runs/TalosNodeGraph.vue',
    './models/TalosModelCenter.vue',
    './cookbook/TalosCookbookLaunch.vue',
    './cookbook/TalosCookbookDependencies.vue',
] as const

describe('TALOS high-impact module state matrix', () => {
    it.each(collectionOwners)('%s renders verified collection states instead of length-derived false empties', (relativePath) => {
        const source = readFileSync(new URL(relativePath, import.meta.url), 'utf8')
        expect(source).toContain('resolveTalosCollectionState')
        expect(source).toContain("=== 'empty'")
    })
})
