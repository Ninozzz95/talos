import { describe, expect, it } from 'vitest'
import { VELO_DELLE_SCENE, velaLaScena } from '@/motion-v6/veloDelleScene'

/**
 * VELO-01..04 — Forge leggibile, variante B «Corridoio velato» (owner 28/10 notte sul bozzetto del Desktop; desktop dc4859dd6). Misurato
 * sul Pad il 28/10 col metodo a foto di riferimento: Forge acceso portava il testo principale a 3,76:1 (scuro) e 4,31:1 (chiaro), il
 * secondario a 1,77:1 e 1,58:1. La regola è la stessa del desktop, costanti comprese: scena al 70% e corridoio della chat tolto all'85%
 * con 80 px di sfumatura per lato.
 */
type Chiamata = [string, ...unknown[]]
function tela() {
    const chiamate: Chiamata[] = []
    const stato: Record<string, unknown> = {}
    const gradienti: Chiamata[][] = []
    const ctx = new Proxy({}, {
        get: (_t, k: string) => {
            if (k === 'createLinearGradient') return (...a: unknown[]) => { const g: Chiamata[] = [['createLinearGradient', ...a]]; gradienti.push(g); return { addColorStop: (...s: unknown[]) => g.push(['stop', ...s]) } }
            if (['save', 'restore', 'fillRect'].includes(k)) return (...a: unknown[]) => chiamate.push([k, ...a, { ...stato }])
            return stato[k]
        },
        set: (_t, k: string, v) => { stato[k] = v; chiamate.push([`set:${k}`, v]); return true },
    })
    return { ctx, chiamate, gradienti }
}

describe('VELO il velo delle scene', () => {
    it('VELO-01 le costanti sono quelle del desktop', () => {
        expect(VELO_DELLE_SCENE.forge).toEqual({ opacita: 0.7, corridoio: 0.85, morbido: 80 })
        expect(Object.keys(VELO_DELLE_SCENE)).toEqual(['forge'])
    })

    it('VELO-02 le altre scene non si toccano', () => {
        const { ctx, chiamate } = tela()
        velaLaScena(ctx as never, 'calm', 400, 800, [0, 400])
        expect(chiamate).toEqual([])
    })

    it('VELO-03 Forge: tutto al 70%, poi il corridoio all\'85% con 80 px di sfumatura fuori dai bordi della colonna', () => {
        const { ctx, chiamate, gradienti } = tela()
        velaLaScena(ctx as never, 'forge', 1000, 600, [300, 700])
        const riempimenti = chiamate.filter((c) => c[0] === 'fillRect')
        expect(riempimenti).toHaveLength(2)
        const [primo, secondo] = riempimenti as [Chiamata, Chiamata]
        expect(primo.slice(1, 5)).toEqual([0, 0, 1000, 600])
        expect(primo[5]).toMatchObject({ globalCompositeOperation: 'destination-out', globalAlpha: expect.closeTo(0.3, 9) })
        expect(secondo.slice(1, 5)).toEqual([220, 0, 560, 600])
        expect(secondo[5]).toMatchObject({ globalCompositeOperation: 'destination-out', globalAlpha: 0.85 })
        expect(gradienti[0]).toEqual([
            ['createLinearGradient', 220, 0, 780, 0],
            ['stop', 0, 'rgba(0,0,0,0)'], ['stop', 80 / 560, 'rgba(0,0,0,1)'], ['stop', 1 - 80 / 560, 'rgba(0,0,0,1)'], ['stop', 1, 'rgba(0,0,0,0)'],
        ])
        expect(chiamate[0]![0]).toBe('save')
        expect(chiamate.at(-1)![0]).toBe('restore')
    })

    it('VELO-04 senza colonna (anteprima del tema, schermate senza chat) resta solo il 70%', () => {
        const { ctx, chiamate } = tela()
        velaLaScena(ctx as never, 'forge', 1000, 600, null)
        expect(chiamate.filter((c) => c[0] === 'fillRect')).toHaveLength(1)
    })
})
