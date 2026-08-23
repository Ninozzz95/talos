import {
    TAU, alpha, defineScene, linearGradient, makePaletteGeometry, primitiveCount, qCount,
    rngFor, seconds, strokeLine, type CanvasContext, type ScenePaletteGeometry,
} from './sceneTools'

type GlacierState = { seed: number; time: number; strain: number; refraction: number }
type Fissure = Readonly<{ x: number; y: number; length: number; angle: number; branches: readonly number[]; phase: number }>
type Facet = Readonly<{ cx: number; cy: number; radius: number; sides: number; tilt: number; phase: number }>
type GlacierGeometry = ScenePaletteGeometry & Readonly<{ fissures: readonly Fissure[]; facets: readonly Facet[]; flowAngle: number }>

export const glacierComplexScene = defineScene<GlacierState, GlacierGeometry>({
    id: 'glacier',
    createState: (seed) => ({ seed, time: 0, strain: 0, refraction: 0 }),
    prepare: ({ state, input }) => {
        const base = makePaletteGeometry('glacier', state.seed, input)
        const rng = rngFor('glacier', state.seed, 521)
        const flowAngle = -0.42 + rng() * 0.84
        const fissures = Object.freeze(Array.from({ length: qCount(base, 5, 8, 11) }, () => Object.freeze({
            x: base.width * (0.08 + rng() * 0.84), y: base.height * (0.1 + rng() * 0.78),
            length: base.height * (0.12 + rng() * 0.26), angle: flowAngle + Math.PI / 2 + (rng() - 0.5) * 0.55,
            branches: Object.freeze(Array.from({ length: 2 + Math.floor(rng() * 3) }, () => (rng() - 0.5) * 0.85)),
            phase: rng() * TAU,
        })))
        const facets = Object.freeze(Array.from({ length: qCount(base, 7, 11, 16) }, (_, index) => Object.freeze({
            cx: base.width * (0.08 + rng() * 0.84), cy: base.height * (0.08 + rng() * 0.84),
            radius: 24 + rng() * (base.mobile ? 55 : 92), sides: 3 + (index % 3), tilt: rng() * TAU, phase: rng() * TAU,
        })))
        return Object.freeze({ geometry: Object.freeze({ ...base, fissures, facets, flowAngle }), primitiveCount: primitiveCount(input, 180, 270, 360) })
    },
    update: ({ state, input, stepMs }) => {
        const dt = seconds(stepMs) * input.parameters.speed / 100
        state.time += dt; state.strain += dt * 0.075; state.refraction += dt * 0.11
    },
    draw: ({ context: rawContext, state, geometry }) => {
        const context = rawContext as CanvasContext
        context.save(); context.clearRect(0, 0, geometry.width, geometry.height)

        // Large translucent ice facets; their motion is refractive, not orbital.
        geometry.facets.forEach((facet, index) => {
            const shimmer = Math.sin(state.refraction + facet.phase) * 0.035
            const points = Array.from({ length: facet.sides }, (_, side) => {
                const angle = facet.tilt + side / facet.sides * TAU
                const stretch = side % 2 === 0 ? 1.15 : 0.78
                return {
                    x: facet.cx + Math.cos(angle) * facet.radius * stretch + Math.cos(geometry.flowAngle) * shimmer * facet.radius,
                    y: facet.cy + Math.sin(angle) * facet.radius + Math.sin(geometry.flowAngle) * shimmer * facet.radius,
                }
            })
            context.beginPath(); context.moveTo(points[0].x, points[0].y)
            points.slice(1).forEach((point) => context.lineTo(point.x, point.y)); context.closePath()
            context.fillStyle = index % 3 === 0 ? geometry.surface : linearGradient(context, geometry, facet.cx - facet.radius, facet.cy, facet.cx + facet.radius, facet.cy, [geometry.info, geometry.accent])
            context.strokeStyle = index % 2 === 0 ? geometry.accent : geometry.border
            context.globalAlpha = alpha(geometry, 0.035 + (index % 4) * 0.017); context.lineWidth = 0.75
            context.fill(); context.stroke()
        })

        // Strain field lines establish the glacier's directional force.
        context.strokeStyle = geometry.border; context.lineWidth = 0.6; context.globalAlpha = alpha(geometry, 0.09)
        for (let lane = -4; lane <= 4; lane += 1) {
            const nx = Math.cos(geometry.flowAngle + Math.PI / 2), ny = Math.sin(geometry.flowAngle + Math.PI / 2)
            const ox = nx * lane * geometry.width * 0.09, oy = ny * lane * geometry.height * 0.09
            const cx = geometry.width * 0.5 + ox, cy = geometry.height * 0.5 + oy
            const dx = Math.cos(geometry.flowAngle) * geometry.width * 0.65, dy = Math.sin(geometry.flowAngle) * geometry.width * 0.65
            strokeLine(context, cx - dx, cy - dy, cx + dx, cy + dy)
        }

        // Crevasses open across the dominant flow. Branches emerge from local strain.
        geometry.fissures.forEach((fissure, index) => {
            const opening = 0.65 + 0.35 * Math.sin(state.strain + fissure.phase)
            const segments = 7
            let px = fissure.x, py = fissure.y
            context.strokeStyle = index % 3 === 0 ? geometry.secondary : geometry.accent
            context.lineWidth = 1 + opening * 1.1; context.globalAlpha = alpha(geometry, 0.38 + opening * 0.15)
            context.shadowBlur = 5; context.shadowColor = geometry.accent
            context.beginPath(); context.moveTo(px, py)
            for (let segment = 1; segment <= segments; segment += 1) {
                const jitter = Math.sin(segment * 2.17 + fissure.phase) * fissure.length * 0.035
                px = fissure.x + Math.cos(fissure.angle) * fissure.length * segment / segments + Math.cos(fissure.angle + Math.PI / 2) * jitter
                py = fissure.y + Math.sin(fissure.angle) * fissure.length * segment / segments + Math.sin(fissure.angle + Math.PI / 2) * jitter
                context.lineTo(px, py)
            }
            context.stroke(); context.shadowBlur = 0
            fissure.branches.forEach((branch, branchIndex) => {
                const t = 0.28 + branchIndex * 0.17
                const bx = fissure.x + Math.cos(fissure.angle) * fissure.length * t
                const by = fissure.y + Math.sin(fissure.angle) * fissure.length * t
                const ba = fissure.angle + branch
                context.globalAlpha = alpha(geometry, 0.18 + opening * 0.08); context.lineWidth = 0.7
                strokeLine(context, bx, by, bx + Math.cos(ba) * fissure.length * 0.24, by + Math.sin(ba) * fissure.length * 0.24)
            })
        })

        context.restore()
    },
})
