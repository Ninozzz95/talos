import { existsSync, readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const layerSource = readFileSync(new URL('../workspace/TalosWindowLayer.vue', import.meta.url), 'utf8')
const surfaceUrl = new URL('./TalosWindowModuleSurface.vue', import.meta.url)
const surfaceSource = existsSync(surfaceUrl) ? readFileSync(surfaceUrl, 'utf8') : ''

describe('Talos window module surface ownership', () => {
    it('renders mobile, floating, and docked module state through one shared surface', () => {
        expect(layerSource.match(/<TalosWindowModuleSurface/g)).toHaveLength(3)
        expect(layerSource).not.toContain('<TalosWindowSectionTabs')
        expect(layerSource).not.toContain('<TalosWindowLoadingState')
        expect(layerSource).not.toContain('<TalosWindowErrorState')
        expect(layerSource).not.toContain('<component')

        expect(surfaceSource.match(/<TalosWindowSectionTabs/g)).toHaveLength(1)
        expect(surfaceSource.match(/<TalosWindowLoadingState/g)).toHaveLength(1)
        expect(surfaceSource.match(/<TalosWindowErrorState/g)).toHaveLength(1)
        expect(surfaceSource.match(/<component/g)).toHaveLength(1)
        expect(surfaceSource).toContain("loadState.status === 'success'")
        expect(surfaceSource).toContain("loadState.status === 'error'")
    })
})
