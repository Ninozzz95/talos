/**
 * CALM-B-01..03 — owner 28/10/2026: la scena Calm «più visibile, ma calma», variante B «Respiro e luce» scelta sul bozzetto del Desktop
 * (https://claude.ai/artifact/THFWjVGpUkVc2kzUdRvKBa). Oggi a intensità 20 cambiava UN livello di colore in 4 s anche a chat vuota (misura
 * sul Pad, vc345): all'occhio era ferma. La tabella è una sola per le tre app (specifica del Desktop, 28/10): qui la stessa, costante per
 * costante, e la luce d'accento che attraversa lo schermo in 30 s. Poi (owner 28/10, misura del contrasto col telefono in orizzontale)
 * «B più leggera»: alone e luce 0,07, orizzonte 0,2/0,14, filamento 0,14, polvere 0,05+0,12, righe 0,07, anello 0,2 (Desktop 10e6f7adb).
 */
import { describe, expect, it } from 'vitest'
import type { SceneInput } from '../../sceneRegistry'
import { calmComplexScene } from './calm'
import { alpha } from './sceneTools'

const roles = ['background','surface','surface_muted','surface_elevated','text','text_muted','border','border_strong','accent','accent_text','secondary','success','warning','danger','info','focus'] as const
const palette = (base: string, accent: string) => Object.fromEntries(roles.map((role, index) => [role, index >= 8 ? accent : base])) as SceneInput['palette']['light']
const W = 1200, H = 800
const input: SceneInput = {
    colorMode: 'dark',
    palette: { light: palette('#f8fafc', '#2563eb'), dark: palette('#101820', '#d49a52') },
    viewport: { width: W, height: H, pixelRatio: 1 },
    seed: 137, logicalTimeMs: 0, deltaMs: 0,
    parameters: { speed: 100, intensity: 65, density: 100, depth: 50, trails: 35, contrast: 60, parallax: 20 },
    effectiveQuality: { tier: 'balanced', fpsCap: 30, dprCap: 1.25, densityScale: 1 },
}

/** Ogni riempimento e ogni tratto con l'alfa del momento; i gradienti radiali coi loro argomenti. */
function disegna(secondi: number) {
    const state = calmComplexScene.createState(input.seed)
    const { geometry } = calmComplexScene.prepare({ state, input, invalidations: ['seed', 'viewport', 'palette', 'parameters', 'quality'] })
    // a fotogrammi da 1/30 s, come il motore vero (`seconds()` taglia i salti lunghi)
    const passo = 1000 / 30
    for (let t = passo; t <= secondi * 1000 + 1e-6; t += passo) calmComplexScene.update({ state, geometry, input, logicalTimeMs: t, stepMs: passo })
    const segni: Array<{ tipo: 'fill' | 'stroke', alfa: number }> = []
    const radiali: number[][] = []
    const context = {
        globalAlpha: 1, lineWidth: 1, strokeStyle: '', fillStyle: '',
        save() {}, restore() {}, clearRect() {}, beginPath() {}, moveTo() {}, lineTo() {}, closePath() {}, arc() {}, bezierCurveTo() {},
        fill() { segni.push({ tipo: 'fill', alfa: this.globalAlpha }) },
        stroke() { segni.push({ tipo: 'stroke', alfa: this.globalAlpha }) },
        createRadialGradient: (...a: number[]) => { radiali.push(a); return { addColorStop() {} } },
    }
    calmComplexScene.draw({ context: context as never, state, geometry, input, logicalTimeMs: secondi * 1000, stepMs: 0 })
    return { segni, radiali, a: (base: number) => alpha(geometry, base) }
}

describe('CALM-B la scena Calm «Respiro e luce», come il desktop', () => {
    it('CALM-B-01 alone, luce, orizzonte, filamento, righe e anello con le alfa della tabella', () => {
        const { segni, a } = disegna(0)
        const alfe = segni.map((s) => Number(s.alfa.toFixed(5)))
        for (const base of [0.07, 0.2, 0.14, 0.2]) expect(alfe, `alpha(${base})`).toContain(Number(a(base).toFixed(5)))
        // l'ordine: alone, poi la luce (riempimenti), poi l'orizzonte (tratti)
        expect(segni.slice(0, 2).map((s) => s.tipo)).toEqual(['fill', 'fill'])
        expect(segni[0]!.alfa).toBeCloseTo(a(0.07), 6)
        expect(segni[1]!.alfa).toBeCloseTo(a(0.07), 6)
        expect(segni[2]).toEqual({ tipo: 'stroke', alfa: a(0.2) })
        expect(segni[3]).toEqual({ tipo: 'stroke', alfa: a(0.14) })
    })

    it('CALM-B-02 la luce d\'accento: raggio 0,32 del lato maggiore, da −20% a +120% in 30 s, poi ricomincia', () => {
        const luce = (s: number) => disegna(s).radiali[1]!
        expect(luce(0)[5]).toBeCloseTo(Math.max(W, H) * 0.32, 6)
        expect(luce(0)[0]).toBeCloseTo(W * -0.2, 6)
        expect(luce(15)[0]).toBeCloseTo(W * 0.5, 6)
        expect(luce(15)[1]).toBeCloseTo(H * (0.42 + Math.sin(0.5 * 2 * Math.PI) * 0.06), 6)
        // fase continua: a 31 s è appena ripartita da sinistra (non torna indietro da destra)
        expect(luce(31)[0]).toBeCloseTo(W * (-0.2 + (31 / 30 - 1) * 1.4), 3)
    })

    it('CALM-B-03 respira a occhio: in 4 s l\'alone cambia raggio ben più di oggi (±0,06, 0,31 rad/s)', () => {
        const r0 = disegna(0).radiali[0]![5]!, r4 = disegna(4).radiali[0]![5]!
        // oggi: ±0,018 a 0,07 rad/s ⇒ in 4 s ~0,5% del lato; ora ~6%
        expect(Math.abs(r4 - r0) / Math.max(W, H)).toBeGreaterThan(0.04)
    })
})
