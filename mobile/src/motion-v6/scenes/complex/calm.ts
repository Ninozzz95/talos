import {
    TAU, alpha, defineScene, makePaletteGeometry, primitiveCount, rngFor, seconds,
    strokeLine, type CanvasContext, type ScenePaletteGeometry,
} from './sceneTools'

type CalmState = { seed: number; time: number; breath: number; drift: number }
type Dust = Readonly<{ x: number; y: number; size: number; phase: number }>
type CalmGeometry = ScenePaletteGeometry & Readonly<{ dust: readonly Dust[]; horizon: number; filamentY: number }>

export const calmComplexScene = defineScene<CalmState, CalmGeometry>({
    id: 'calm',
    createState: (seed) => ({ seed, time: 0, breath: 0, drift: 0 }),
    prepare: ({ state, input }) => {
        const base = makePaletteGeometry('calm', state.seed, input)
        const rng = rngFor('calm', state.seed, 1409)
        const dust = Object.freeze(Array.from({ length: base.mobile ? 9 : input.effectiveQuality.tier === 'high' ? 22 : 15 }, () => Object.freeze({
            x: base.width * (0.08 + rng() * 0.84), y: base.height * (0.15 + rng() * 0.7), size: 0.4 + rng() * 1.1, phase: rng() * TAU,
        })))
        return Object.freeze({ geometry: Object.freeze({ ...base, dust, horizon: base.height * 0.68, filamentY: base.height * 0.38 }), primitiveCount: primitiveCount(input, 72, 96, 124) })
    },
    update: ({ state, input, stepMs }) => {
        const dt = seconds(stepMs) * input.parameters.speed / 100
        state.time += dt; state.breath += dt * 0.07; state.drift += dt * 0.025
    },
    draw: ({ context: rawContext, state, geometry }) => {
        const context = rawContext as CanvasContext
        context.save(); context.clearRect(0, 0, geometry.width, geometry.height)

        // Negative space is the composition. Only one broad field breathes.
        const cx = geometry.width * (0.5 + Math.sin(state.drift) * 0.015), cy = geometry.height * (0.5 + Math.cos(state.drift * 0.7) * 0.012)
        const radius = Math.max(geometry.width, geometry.height) * (0.42 + Math.sin(state.breath) * 0.018)
        const glow = context.createRadialGradient(cx, cy, 0, cx, cy, radius)
        glow.addColorStop(0, geometry.surface); glow.addColorStop(0.46, geometry.accent); glow.addColorStop(1, 'transparent')
        context.fillStyle = glow; context.globalAlpha = alpha(geometry, 0.018)
        context.beginPath(); context.arc(cx, cy, radius, 0, TAU); context.fill()

        // A single horizon carries most of the motion language.
        const horizon = geometry.horizon + Math.sin(state.breath * 1.3) * geometry.height * 0.012
        context.strokeStyle = geometry.border; context.lineWidth = 0.65; context.globalAlpha = alpha(geometry, 0.16)
        strokeLine(context, geometry.width * 0.12, horizon, geometry.width * 0.88, horizon)
        context.strokeStyle = geometry.accent; context.globalAlpha = alpha(geometry, 0.16)
        strokeLine(context, geometry.width * 0.42, horizon, geometry.width * 0.58, horizon)

        // One bronze filament bends with a slower period than the horizon.
        const fy = geometry.filamentY + Math.sin(state.time * 0.031) * geometry.height * 0.018
        context.strokeStyle = geometry.accent; context.lineWidth = 0.75; context.globalAlpha = alpha(geometry, 0.11)
        context.beginPath(); context.moveTo(geometry.width * 0.22, fy)
        context.bezierCurveTo(geometry.width * 0.39, fy - geometry.height * 0.025, geometry.width * 0.61, fy + geometry.height * 0.025, geometry.width * 0.78, fy); context.stroke()

        // Bronze dust is almost static: enough life to stop the field feeling dead.
        context.fillStyle = geometry.accent
        geometry.dust.forEach((dust, index) => {
            const flicker = 0.5 + 0.5 * Math.sin(state.time * (0.07 + index * 0.002) + dust.phase)
            context.globalAlpha = alpha(geometry, 0.018 + flicker * 0.035)
            context.beginPath(); context.arc(dust.x, dust.y, dust.size * 0.55, 0, TAU); context.fill()
        })

        // Four nearly invisible hairlines create material depth without becoming a grid.
        context.strokeStyle = geometry.border; context.lineWidth = 0.45; context.globalAlpha = alpha(geometry, 0.035)
        for (let hair = 0; hair < 4; hair += 1) {
            const y = geometry.height * (0.2 + hair * 0.17) + Math.sin(state.time * 0.017 + hair) * 1.5
            strokeLine(context, geometry.width * (0.18 + hair * 0.015), y, geometry.width * (0.82 - hair * 0.015), y)
        }

        // Tiny signature ring; no dashboard, no particle system, no ornamental grid.
        context.strokeStyle = geometry.secondary; context.lineWidth = 0.7; context.globalAlpha = alpha(geometry, 0.12)
        context.beginPath(); context.arc(geometry.width * 0.82, geometry.height * 0.22, 8 + Math.sin(state.breath * 0.9) * 1.2, 0, TAU); context.stroke()
        context.restore()
    },
})
