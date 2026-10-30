import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { colonnaRelativa } from '@/composables/useColonnaDellaChat'

/** VELO-06/07: la colonna in coordinate dello sfondo, e lo sfondo mobile che vela la scena con quella colonna. */
describe('VELO la colonna della chat', () => {
    it('VELO-06 la colonna è relativa allo sfondo; senza lista o larga meno di un pixel non c\'è corridoio', () => {
        expect(colonnaRelativa({ left: 415, right: 1990, width: 1575 }, { left: 0, right: 2000, width: 2000 })).toEqual([415, 1990])
        expect(colonnaRelativa({ left: 120, right: 520, width: 400 }, { left: 20, right: 620, width: 600 })).toEqual([100, 500])
        expect(colonnaRelativa(null, { left: 0, right: 10, width: 10 })).toBeNull()
        expect(colonnaRelativa({ left: 5, right: 5.5, width: 0.5 }, { left: 0, right: 10, width: 10 })).toBeNull()
    })

    it('VELO-07 lo sfondo del mobile passa il velo al renderer, con la colonna misurata', () => {
        const s = readFileSync(resolve(__dirname, '../../../src/components/talos/workspace/TalosMobileBackground.vue'), 'utf8')
        expect(s).toMatch(/afterDraw: \(\{ context, sceneId, width, height \}\) => velaLaScena\(context as never, sceneId, width, height, colonna\.value\)/u)
        expect(s).toMatch(/useColonnaDellaChat\(\)/u)
    })
})
