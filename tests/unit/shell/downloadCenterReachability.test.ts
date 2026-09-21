import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const surfaces = [
    'TalosMobileHeader.vue',
    'TalosMobileImmersiveChrome.vue',
    'TalosMobileSidebar.vue',
    'TalosTabletSidebar.vue',
    'TalosMobileToolSheet.vue',
] as const

describe('Download Center reachability', () => {
    it('C45-RED-03 mounts the same lazy trigger in all five mobile chrome surfaces', () => {
        for (const file of surfaces) {
            const source = readFileSync(resolve(process.cwd(), 'src/components/shell', file), 'utf8')
            expect(source, file).toContain(
                "import('@/components/shell/TalosMobileDownloadCenterTrigger.vue')",
            )
            expect(source, file).toContain('<TalosMobileDownloadCenterTrigger')
            expect(source, file).not.toContain(
                "import TalosMobileDownloadCenterTrigger from '@/components/shell/TalosMobileDownloadCenterTrigger.vue'",
            )
        }
    })
})
