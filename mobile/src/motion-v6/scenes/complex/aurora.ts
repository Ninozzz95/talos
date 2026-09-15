import {
    TAU, alpha, defineScene, fbm2, makePaletteGeometry, mix, primitiveCount, qCount,
    rngFor, seconds, type CanvasContext, type ScenePaletteGeometry,
} from './sceneTools'

type AuroraState = { seed: number; time: number; magnetic: number }
type Curtain = Readonly<{ anchor: number; width: number; reach: number; phase: number; curl: number; brightness: number }>
type Star = Readonly<{ x: number; y: number; size: number; phase: number }>
type AuroraGeometry = ScenePaletteGeometry & Readonly<{ curtains: readonly Curtain[]; stars: readonly Star[]; horizon: number }>

export const auroraComplexScene = defineScene<AuroraState, AuroraGeometry>({
    id: 'aurora',
    createState: (seed) => ({ seed, time: 0, magnetic: 0 }),
    prepare: ({ state, input }) => {
        const base = makePaletteGeometry('aurora', state.seed, input)
        const rng = rngFor('aurora', state.seed, 419)
        const curtains = Object.freeze(Array.from({ length: qCount(base, 5, 7, 10) }, (_, index) => Object.freeze({
            anchor: base.width * (0.05 + 0.9 * index / Math.max(1, qCount(base, 5, 7, 10) - 1)),
            width: base.width * (0.055 + rng() * 0.07),
            reach: base.height * (0.42 + rng() * 0.33),
            phase: rng() * TAU,
            curl: (rng() - 0.5) * base.width * 0.12,
            brightness: 0.5 + rng() * 0.5,
        })))
        const stars = Object.freeze(Array.from({ length: qCount(base, 16, 28, 44) }, () => Object.freeze({
            x: rng() * base.width, y: rng() * base.height * 0.58, size: 0.5 + rng() * 1.4, phase: rng() * TAU,
        })))
        return Object.freeze({ geometry: Object.freeze({ ...base, curtains, stars, horizon: base.height * 0.72 }), primitiveCount: primitiveCount(input, 170, 255, 350) })
    },
    update: ({ state, input, stepMs }) => {
        const dt = seconds(stepMs) * input.parameters.speed / 100
        state.time += dt; state.magnetic += dt * 0.14
    },
    draw: ({ context: rawContext, state, geometry }) => {
        const context = rawContext as CanvasContext
        context.save(); context.clearRect(0, 0, geometry.width, geometry.height)
        context.globalCompositeOperation = 'lighter'

        // Sparse stars establish depth without becoming a particle field theme.
        context.fillStyle = geometry.focus
        geometry.stars.forEach((star, index) => {
            context.globalAlpha = alpha(geometry, 0.05 + 0.08 * (0.5 + 0.5 * Math.sin(state.time * 0.3 + star.phase)))
            context.fillRect(star.x, star.y, star.size, star.size)
            if (index % 9 === 0) context.fillRect(star.x - star.size * 2, star.y, star.size * 5, 0.45)
        })

        // Curtains are built from many vertical rays sharing a magnetic fold.
        geometry.curtains.forEach((curtain, curtainIndex) => {
            const rayCount = geometry.mobile ? 8 : geometry.quality === 'high' ? 18 : 13
            for (let ray = 0; ray < rayCount; ray += 1) {
                const u = ray / Math.max(1, rayCount - 1)
                const centered = u - 0.5
                const fold = Math.sin(state.magnetic * 1.8 + curtain.phase + centered * 4.5) * curtain.width * 0.36
                const xTop = curtain.anchor + centered * curtain.width + fold
                const xBottom = xTop + curtain.curl * Math.sin(state.magnetic + curtain.phase + u * 2.6)
                const yTop = geometry.height * (0.05 + 0.04 * Math.sin(curtain.phase + u * 2))
                const yBottom = Math.min(geometry.horizon, yTop + curtain.reach * (0.82 + 0.18 * Math.sin(state.time * 0.17 + ray)))
                const noiseWarp = (fbm2(u * 2.4, state.time * 0.03 + curtainIndex, geometry.seed, 3) - 0.5) * curtain.width * 0.55
                const gradient = context.createLinearGradient(xTop, yTop, xBottom, yBottom)
                gradient.addColorStop(0, 'transparent')
                gradient.addColorStop(0.16, ray % 3 === 0 ? geometry.secondary : geometry.accent)
                gradient.addColorStop(0.5, ray % 4 === 0 ? geometry.focus : geometry.accent)
                gradient.addColorStop(1, 'transparent')
                context.strokeStyle = gradient
                context.lineWidth = mix(0.55, 2.6, curtain.brightness * (1 - Math.abs(centered)))
                context.globalAlpha = alpha(geometry, 0.08 + curtain.brightness * 0.1)
                context.shadowBlur = 6 + geometry.parameters.trails * 0.08; context.shadowColor = geometry.accent
                context.beginPath(); context.moveTo(xTop + noiseWarp * 0.2, yTop)
                context.bezierCurveTo(
                    xTop + fold * 0.4 + noiseWarp, yTop + curtain.reach * 0.28,
                    xBottom - fold * 0.2 - noiseWarp * 0.4, yTop + curtain.reach * 0.72,
                    xBottom, yBottom,
                )
                context.stroke()
            }
        })

        // Low horizon glow: quiet and wide, not another ribbon.
        context.globalCompositeOperation = 'source-over'; context.shadowBlur = 0
        const horizon = context.createLinearGradient(0, geometry.horizon - 60, 0, geometry.horizon + 35)
        horizon.addColorStop(0, 'transparent'); horizon.addColorStop(0.55, geometry.secondary); horizon.addColorStop(1, 'transparent')
        context.fillStyle = horizon; context.globalAlpha = alpha(geometry, 0.035)
        context.fillRect(0, geometry.horizon - 60, geometry.width, 95)
        context.restore()
    },
})
