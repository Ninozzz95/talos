import type { SceneInput } from '../../sceneRegistry'
import type { SimpleSceneDefinition, SimpleSceneLayer } from '../../renderers/simpleRenderer'
import type { TalosMotionSceneId } from '../../contracts'

export type SimpleGlyph = Readonly<{
    role: string
    x: number
    y: number
    width: number
    height: number
    motionX: number
    motionY: number
    rotation?: number
    depth?: number
    opacity?: number
    phase?: number
}>

const AMBIENT_GLYPHS: Readonly<Record<TalosMotionSceneId, readonly SimpleGlyph[]>> = Object.freeze({
    forge: Object.freeze([
        { role: 'forge-field', x: 3, y: 8, width: 91, height: 76, motionX: 2, motionY: 1, depth: 2, opacity: 0.24, phase: 11 },
        { role: 'forge-flow', x: 7, y: 43, width: 79, height: 18, motionX: 8, motionY: -3, opacity: 0.3, phase: 13 },
        { role: 'forge-depth-plane', x: 39, y: 7, width: 48, height: 68, motionX: -3, motionY: 4, rotation: -8, opacity: 0.2, phase: 17 },
    ]),
    paper: Object.freeze([
        { role: 'paper-sheet-field', x: 7, y: 7, width: 84, height: 78, motionX: 1, motionY: 2, opacity: 0.3, phase: 11 },
        { role: 'paper-baseline-grid', x: 14, y: 12, width: 74, height: 68, motionX: 0, motionY: 3, opacity: 0.2, phase: 13 },
        { role: 'paper-review-sweep', x: 19, y: 16, width: 62, height: 58, motionX: 5, motionY: 0, opacity: 0.16, phase: 17 },
    ]),
    terminal: Object.freeze([
        { role: 'terminal-matrix-field', x: 4, y: 8, width: 91, height: 78, motionX: 0, motionY: 4, opacity: 0.24, phase: 11 },
        { role: 'terminal-column-stream', x: 9, y: 12, width: 76, height: 64, motionX: 3, motionY: 8, opacity: 0.2, phase: 13 },
        { role: 'terminal-glass-sweep', x: 6, y: 14, width: 86, height: 48, motionX: -2, motionY: 11, opacity: 0.18, phase: 17 },
    ]),
    aurora: Object.freeze([
        { role: 'aurora-field', x: 3, y: 11, width: 93, height: 72, motionX: 7, motionY: -4, rotation: -6, opacity: 0.26, phase: 11 },
        { role: 'aurora-ribbon', x: 8, y: 23, width: 84, height: 44, motionX: -9, motionY: 5, rotation: 7, opacity: 0.3, phase: 13 },
        { role: 'aurora-constellation', x: 17, y: 10, width: 68, height: 64, motionX: 3, motionY: 4, opacity: 0.2, phase: 17 },
    ]),
    telemetry: Object.freeze([
        { role: 'telemetry-field', x: 4, y: 10, width: 92, height: 74, motionX: 4, motionY: -2, opacity: 0.24, phase: 11 },
        { role: 'telemetry-band', x: 9, y: 30, width: 80, height: 26, motionX: -6, motionY: 3, rotation: -2, opacity: 0.26, phase: 13 },
        { role: 'telemetry-grid', x: 20, y: 14, width: 64, height: 58, motionX: 3, motionY: 4, opacity: 0.18, phase: 17 },
    ]),
    glacier: Object.freeze([
        { role: 'glacier-facet-field', x: 5, y: 8, width: 89, height: 78, motionX: -3, motionY: 2, opacity: 0.25, phase: 11 },
        { role: 'glacier-refraction', x: 12, y: 12, width: 71, height: 62, motionX: 5, motionY: -3, rotation: 4, opacity: 0.22, phase: 13 },
        { role: 'glacier-depth-grid', x: 29, y: 10, width: 61, height: 68, motionX: -2, motionY: 5, opacity: 0.18, phase: 17 },
    ]),
    // F1 calm refactor: quietest ambient in the library — two slow drifting
    // fields, low opacity, reusing glacier's shipped CSS roles.
    calm: Object.freeze([
        { role: 'glacier-facet-field', x: 8, y: 14, width: 82, height: 66, motionX: -1, motionY: 1, opacity: 0.14, phase: 19 },
        { role: 'glacier-refraction', x: 18, y: 22, width: 60, height: 48, motionX: 2, motionY: -1, rotation: 2, opacity: 0.12, phase: 23 },
        { role: 'glacier-depth-grid', x: 30, y: 30, width: 44, height: 36, motionX: -1, motionY: 2, opacity: 0.1, phase: 29 },
    ]),
    ember: Object.freeze([
        { role: 'ember-heat-field', x: 4, y: 12, width: 92, height: 73, motionX: 5, motionY: -5, opacity: 0.24, phase: 11 },
        { role: 'ember-recovery-wave', x: 8, y: 31, width: 82, height: 39, motionX: -8, motionY: 3, opacity: 0.3, phase: 13 },
        { role: 'ember-spark-lattice', x: 15, y: 8, width: 68, height: 69, motionX: 3, motionY: -9, opacity: 0.18, phase: 17 },
    ]),
    atlas: Object.freeze([
        { role: 'atlas-contour-field', x: 3, y: 8, width: 93, height: 78, motionX: 4, motionY: 2, opacity: 0.24, phase: 11 },
        { role: 'atlas-route-field', x: 9, y: 18, width: 82, height: 53, motionX: -7, motionY: 4, rotation: -3, opacity: 0.28, phase: 13 },
        { role: 'atlas-coordinate-field', x: 18, y: 10, width: 66, height: 67, motionX: 2, motionY: -3, opacity: 0.18, phase: 17 },
    ]),
    noir: Object.freeze([
        { role: 'noir-aperture-field', x: 9, y: 7, width: 82, height: 78, motionX: 2, motionY: 2, rotation: 2, opacity: 0.28, phase: 11 },
        { role: 'noir-light-slice', x: 5, y: 14, width: 88, height: 55, motionX: -7, motionY: 3, rotation: -9, opacity: 0.24, phase: 13 },
        { role: 'noir-frame-grid', x: 13, y: 12, width: 73, height: 65, motionX: 1, motionY: -2, opacity: 0.18, phase: 17 },
    ]),
    signal: Object.freeze([
        { role: 'signal-grid-field', x: 4, y: 9, width: 91, height: 76, motionX: 3, motionY: 0, opacity: 0.22, phase: 11 },
        { role: 'signal-wave-field', x: 7, y: 24, width: 86, height: 45, motionX: -10, motionY: 3, opacity: 0.32, phase: 13 },
        { role: 'signal-radar-field', x: 39, y: 11, width: 49, height: 67, motionX: 2, motionY: -2, rotation: 11, opacity: 0.2, phase: 17 },
    ]),
    violet: Object.freeze([
        { role: 'violet-network-field', x: 4, y: 8, width: 91, height: 77, motionX: 5, motionY: -3, opacity: 0.23, phase: 11 },
        { role: 'violet-semantic-field', x: 11, y: 16, width: 78, height: 57, motionX: -6, motionY: 4, rotation: 5, opacity: 0.3, phase: 13 },
        { role: 'violet-cluster-field', x: 23, y: 9, width: 62, height: 67, motionX: 3, motionY: 3, opacity: 0.2, phase: 17 },
    ]),
    claudius: Object.freeze([
        { role: 'claudius-manuscript-field', x: 7, y: 7, width: 85, height: 78, motionX: 1, motionY: 2, opacity: 0.26, phase: 11 },
        { role: 'claudius-column-field', x: 17, y: 11, width: 69, height: 68, motionX: -2, motionY: 3, opacity: 0.22, phase: 13 },
        { role: 'claudius-revision-sweep', x: 11, y: 19, width: 76, height: 52, motionX: 6, motionY: -2, opacity: 0.18, phase: 17 },
    ]),
    basicus: Object.freeze([
        { role: 'basicus-material-field', x: 4, y: 8, width: 91, height: 77, motionX: 3, motionY: 2, opacity: 0.22, phase: 11 },
        { role: 'basicus-component-field', x: 11, y: 14, width: 79, height: 59, motionX: -4, motionY: 3, opacity: 0.28, phase: 13 },
        { role: 'basicus-elevation-field', x: 24, y: 9, width: 62, height: 68, motionX: 2, motionY: -3, opacity: 0.2, phase: 17 },
    ]),
})

const bounded = (value: number, min: number, max: number): number => Math.min(max, Math.max(min, value))
const decimal = (value: number): string => String(Number(value.toFixed(3)))

function transform(glyph: SimpleGlyph, input: SceneInput, direction: -1 | 0 | 1): string {
    const mobile = input.viewport.width < 600
    const parallax = input.parameters.parallax / 100
    const depth = 1 + (((glyph.depth ?? 0) * input.parameters.depth) / 10_000)
    const x = ((glyph.motionX * direction * parallax) + (mobile ? -2 : 0)) * (mobile ? 0.65 : 1)
    const y = glyph.motionY * direction * parallax * (mobile ? 0.75 : 1)
    const rotation = (glyph.rotation ?? 0) + (direction * (glyph.phase ?? 0) * 0.25)
    return `translate3d(${decimal(x)}px, ${decimal(y)}px, 0) scale(${decimal(depth)}) rotate(${decimal(rotation)}deg)`
}

export function createSimpleDefinition(id: TalosMotionSceneId, glyphs: readonly SimpleGlyph[]): SimpleSceneDefinition {
    return Object.freeze({
        id,
        resolve: (input: SceneInput): readonly SimpleSceneLayer[] => {
            const active = input.palette[input.colorMode]
            const mobile = input.viewport.width < 600
            const intensity = input.parameters.intensity / 100
            const density = input.parameters.density / 100
            const duration = Math.round((8_000 * 100) / input.parameters.speed)
            const composition = [...AMBIENT_GLYPHS[id], ...glyphs]
            return Object.freeze(composition.map((glyph, index) => {
                const phase = glyph.phase ?? index + 1
                const contrast = 0.75 + (input.parameters.contrast / 400)
                const ambientBoost = index < AMBIENT_GLYPHS[id].length ? 1.55 : 1
                const opacity = bounded((glyph.opacity ?? 0.72) * ambientBoost * (0.45 + (intensity * 0.55)) * (0.6 + (density * 0.4)) * contrast, 0.08, 1)
                const x = mobile ? bounded(glyph.x * 0.82, 3, 88) : glyph.x
                const width = mobile ? bounded(glyph.width * 0.82, 2, 88) : glyph.width
                const variables = Object.freeze({
                    '--talos-v6-x': `${decimal(x)}%`,
                    '--talos-v6-y': `${decimal(glyph.y)}%`,
                    '--talos-v6-w': `${decimal(width)}%`,
                    '--talos-v6-h': `${decimal(glyph.height)}%`,
                    '--talos-v6-accent': active.accent,
                    '--talos-v6-secondary': active.secondary,
                    '--talos-v6-border': active.border_strong,
                    '--talos-v6-surface': active.surface_elevated,
                    '--talos-v6-speed': String(input.parameters.speed),
                    '--talos-v6-intensity': String(input.parameters.intensity),
                    '--talos-v6-density': String(input.parameters.density),
                    '--talos-v6-depth': String(input.parameters.depth),
                    '--talos-v6-trails': `${decimal(input.parameters.trails / 5)}px`,
                    '--talos-v6-contrast': String(input.parameters.contrast),
                    '--talos-v6-parallax': String(input.parameters.parallax),
                })
                return Object.freeze({
                    id: `${id}-${index + 1}`,
                    role: glyph.role,
                    style: Object.freeze({ transform: transform(glyph, input, 0), opacity, variables }),
                    motion: Object.freeze({
                        keyframes: Object.freeze([
                            Object.freeze({ transform: transform(glyph, input, -1), opacity: bounded(opacity * 0.62, 0.05, 1) }),
                            Object.freeze({ transform: transform(glyph, input, 1), opacity }),
                        ]),
                        durationMs: bounded(duration + (phase * 137), 1_200, 30_000),
                        easing: index % 2 === 0 ? 'ease-in-out' : 'cubic-bezier(0.2, 0.8, 0.2, 1)',
                        iterations: Infinity,
                    }),
                })
            }))
        },
    })
}
