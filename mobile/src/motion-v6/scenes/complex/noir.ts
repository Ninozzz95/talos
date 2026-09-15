import {
    TAU, alpha, defineScene, makePaletteGeometry, primitiveCount, qCount, rngFor, seconds,
    strokeLine, type CanvasContext, type ScenePaletteGeometry,
} from './sceneTools'

type NoirState = { seed: number; time: number; iris: number; shutter: number }
type Blind = Readonly<{ y: number; height: number; tilt: number; phase: number }>
type Blade = Readonly<{ phase: number; length: number; width: number }>
type NoirGeometry = ScenePaletteGeometry & Readonly<{ blinds: readonly Blind[]; blades: readonly Blade[]; cx: number; cy: number; radius: number }>

export const noirComplexScene = defineScene<NoirState, NoirGeometry>({
    id: 'noir',
    createState: (seed) => ({ seed, time: 0, iris: 0, shutter: 0 }),
    prepare: ({ state, input }) => {
        const base = makePaletteGeometry('noir', state.seed, input)
        const rng = rngFor('noir', state.seed, 811)
        const blinds = Object.freeze(Array.from({ length: qCount(base, 9, 13, 18) }, (_, index) => Object.freeze({
            y: base.height * index / qCount(base, 9, 13, 18), height: base.height / qCount(base, 9, 13, 18) * (0.55 + rng() * 0.5),
            tilt: (rng() - 0.5) * 0.08, phase: rng() * TAU,
        })))
        const bladeCount = qCount(base, 6, 8, 10)
        const blades = Object.freeze(Array.from({ length: bladeCount }, (_, index) => Object.freeze({ phase: index / bladeCount * TAU, length: 0.92 + rng() * 0.12, width: 0.42 + rng() * 0.16 })))
        return Object.freeze({ geometry: Object.freeze({ ...base, blinds, blades, cx: base.width * 0.64, cy: base.height * 0.46, radius: Math.min(base.width, base.height) * 0.26 }), primitiveCount: primitiveCount(input, 130, 190, 270) })
    },
    update: ({ state, input, stepMs }) => {
        const dt = seconds(stepMs) * input.parameters.speed / 100
        state.time += dt; state.iris += dt * 0.075; state.shutter += dt * 0.14
    },
    draw: ({ context: rawContext, state, geometry }) => {
        const context = rawContext as CanvasContext
        context.save(); context.clearRect(0, 0, geometry.width, geometry.height)

        // Venetian bands create moving hard light, not a generic dark gradient.
        geometry.blinds.forEach((blind, index) => {
            const offset = Math.sin(state.shutter + blind.phase) * geometry.height * 0.012
            context.save(); context.translate(geometry.width * 0.5, blind.y + offset); context.rotate(blind.tilt + Math.sin(state.time * 0.11 + blind.phase) * 0.01)
            context.fillStyle = index % 5 === 0 ? geometry.secondary : geometry.surface
            context.globalAlpha = alpha(geometry, index % 5 === 0 ? 0.055 : 0.13)
            context.fillRect(-geometry.width * 0.58, -blind.height / 2, geometry.width * 1.16, blind.height)
            context.restore()
        })

        // Rotating aperture: photographic, sharp, recognisable silhouette.
        context.save(); context.translate(geometry.cx, geometry.cy); context.rotate(state.iris)
        geometry.blades.forEach((blade, index) => {
            const angle = blade.phase
            context.save(); context.rotate(angle)
            context.beginPath(); context.moveTo(geometry.radius * 0.16, -geometry.radius * 0.08)
            context.lineTo(geometry.radius * blade.length, -geometry.radius * blade.width)
            context.lineTo(geometry.radius * blade.length * 0.82, geometry.radius * blade.width * 0.55)
            context.lineTo(geometry.radius * 0.2, geometry.radius * 0.12); context.closePath()
            context.fillStyle = index % 2 === 0 ? geometry.surface : geometry.background
            context.strokeStyle = geometry.accent; context.lineWidth = 0.8
            context.globalAlpha = alpha(geometry, 0.19 + (index % 2) * 0.05); context.fill(); context.stroke(); context.restore()
        })
        const aperture = geometry.radius * (0.18 + 0.035 * Math.sin(state.time * 0.4))
        context.strokeStyle = geometry.focus; context.globalAlpha = alpha(geometry, 0.52); context.lineWidth = 1.25
        context.beginPath(); context.arc(0, 0, aperture, 0, TAU); context.stroke(); context.restore()

        // Op-art interference field on the opposite side.
        context.strokeStyle = geometry.accent; context.lineWidth = 0.75
        const lines = geometry.mobile ? 12 : geometry.quality === 'high' ? 28 : 20
        for (let line = 0; line < lines; line += 1) {
            const x = geometry.width * (0.08 + line / Math.max(1, lines - 1) * 0.34)
            context.globalAlpha = alpha(geometry, 0.12 + (line % 3) * 0.018)
            context.beginPath(); context.moveTo(x, geometry.height * 0.12)
            const bend = Math.sin(state.time * 0.2 + line * 0.42) * geometry.width * 0.018
            context.bezierCurveTo(x + bend, geometry.height * 0.35, x - bend, geometry.height * 0.68, x, geometry.height * 0.88); context.stroke()
        }

        // One diagnostic red/secondary slash: minimal accent, maximum identity.
        context.strokeStyle = geometry.secondary; context.lineWidth = 1.8; context.globalAlpha = alpha(geometry, 0.5)
        const slash = Math.sin(state.time * 0.17) * geometry.width * 0.025
        strokeLine(context, geometry.width * 0.09 + slash, geometry.height * 0.8, geometry.width * 0.42 + slash, geometry.height * 0.2)
        context.restore()
    },
})
