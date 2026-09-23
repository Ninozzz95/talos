// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const root = process.cwd()
const hotfix = readFileSync(resolve(root, 'src/css/talos-native-fling-hotfix.css'), 'utf8')
const main = readFileSync(resolve(root, 'src/main.ts'), 'utf8')

describe('v0.1.37 native fling hotfix', () => {
    it('ships the override from the mobile entrypoint', () => {
        expect(main).toContain("import '@/css/talos-native-fling-hotfix.css'")
    })

    it('disconnects station chrome from scroll timelines', () => {
        expect(hotfix).toMatch(/timeline-scope:\s*none\s*!important/)
        expect(hotfix).toMatch(/scroll-timeline:\s*none\s*!important/)
        expect(hotfix).toMatch(/animation-timeline:\s*none\s*!important/)
    })

    it('keeps the compact overlay bar out while the fling hotfix is active', () => {
        expect(hotfix).toMatch(/\.talos-sheet-bar\s*\{[^}]*opacity:\s*0\s*!important;[^}]*visibility:\s*hidden\s*!important;/s)
    })
})
