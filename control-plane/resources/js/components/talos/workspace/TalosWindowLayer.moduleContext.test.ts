import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const layerSource = readFileSync(new URL('./TalosWindowLayer.vue', import.meta.url), 'utf8')
const contextSource = readFileSync(new URL('../../../lib/talosWindowModuleContext.ts', import.meta.url), 'utf8')

describe('TalosWindowLayer module context intro replay contract', () => {
    it('declares replayIntro on the module context type', () => {
        expect(contextSource).toContain('replayIntro: () => void')
    })

    it('bridges the module context replayIntro callback to a layer emit', () => {
        expect(layerSource).toContain("replayIntro: () => emit('replayIntro')")
        expect(layerSource).toMatch(/replayIntro: \[\]/)
    })
})
