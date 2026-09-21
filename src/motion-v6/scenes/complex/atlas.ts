import {
    TAU, alpha, defineScene, fbm2, makePaletteGeometry, mix, primitiveCount, qCount,
    rngFor, seconds, strokeLine, type CanvasContext, type ScenePaletteGeometry,
} from './sceneTools'

type AtlasState = { seed: number; time: number; survey: number; route: number }
type Peak = Readonly<{ x: number; y: number; radius: number; elevation: number; phase: number }>
type Waypoint = Readonly<{ x: number; y: number; rank: number }>
type AtlasGeometry = ScenePaletteGeometry & Readonly<{ peaks: readonly Peak[]; route: readonly Waypoint[]; meridians: number; parallels: number }>

export const atlasComplexScene = defineScene<AtlasState, AtlasGeometry>({
    id: 'atlas',
    createState: (seed) => ({ seed, time: 0, survey: 0, route: 0 }),
    prepare: ({ state, input }) => {
        const base = makePaletteGeometry('atlas', state.seed, input)
        const rng = rngFor('atlas', state.seed, 719)
        const peaks = Object.freeze(Array.from({ length: qCount(base, 3, 4, 6) }, () => Object.freeze({
            x: base.width * (0.12 + rng() * 0.76), y: base.height * (0.14 + rng() * 0.7),
            radius: Math.min(base.width, base.height) * (0.08 + rng() * 0.16), elevation: 0.4 + rng() * 0.6, phase: rng() * TAU,
        })))
        const route = Object.freeze(Array.from({ length: qCount(base, 5, 7, 9) }, (_, rank) => Object.freeze({
            x: base.width * (0.08 + 0.84 * rank / Math.max(1, qCount(base, 5, 7, 9) - 1)),
            y: base.height * (0.18 + rng() * 0.64), rank,
        })))
        return Object.freeze({ geometry: Object.freeze({ ...base, peaks, route, meridians: qCount(base, 5, 8, 11), parallels: qCount(base, 4, 7, 9) }), primitiveCount: primitiveCount(input, 220, 320, 395) })
    },
    update: ({ state, input, stepMs }) => {
        const dt = seconds(stepMs) * input.parameters.speed / 100
        state.time += dt; state.survey += dt * 0.045; state.route = (state.route + dt * 0.09) % 1
    },
    draw: ({ context: rawContext, state, geometry }) => {
        const context = rawContext as CanvasContext
        context.save(); context.clearRect(0, 0, geometry.width, geometry.height)

        // Curved survey grid, intentionally map-like instead of a Cartesian UI grid.
        context.strokeStyle = geometry.border; context.lineWidth = 0.55; context.globalAlpha = alpha(geometry, 0.11)
        for (let m = 0; m < geometry.meridians; m += 1) {
            const x = geometry.width * (m + 1) / (geometry.meridians + 1)
            context.beginPath(); context.moveTo(x, geometry.height * 0.05)
            context.bezierCurveTo(x - geometry.width * 0.025, geometry.height * 0.3, x + geometry.width * 0.025, geometry.height * 0.68, x, geometry.height * 0.95); context.stroke()
        }
        for (let p = 0; p < geometry.parallels; p += 1) {
            const y = geometry.height * (p + 1) / (geometry.parallels + 1)
            context.beginPath(); context.moveTo(geometry.width * 0.04, y)
            context.quadraticCurveTo(geometry.width * 0.5, y + Math.sin(p) * geometry.height * 0.025, geometry.width * 0.96, y); context.stroke()
        }

        // Elevation contours: each peak owns nested irregular level sets.
        geometry.peaks.forEach((peak, peakIndex) => {
            const levels = geometry.mobile ? 5 : geometry.quality === 'high' ? 10 : 7
            for (let level = 1; level <= levels; level += 1) {
                const radius = peak.radius * level / levels
                const points = 28
                context.beginPath()
                for (let point = 0; point <= points; point += 1) {
                    const angle = point / points * TAU
                    const terrain = 0.82 + (fbm2(Math.cos(angle) * 1.8 + peakIndex * 2, Math.sin(angle) * 1.8 + level * 0.31, geometry.seed, 3) - 0.5) * 0.42
                    const breathe = 1 + Math.sin(state.survey + peak.phase + level * 0.6) * 0.008
                    const x = peak.x + Math.cos(angle) * radius * terrain * breathe
                    const y = peak.y + Math.sin(angle) * radius * terrain * 0.72 * breathe
                    if (point === 0) context.moveTo(x, y); else context.lineTo(x, y)
                }
                context.closePath(); context.strokeStyle = level === levels ? geometry.accent : level % 3 === 0 ? geometry.secondary : geometry.border
                context.lineWidth = level === levels ? 1.25 : level % 3 === 0 ? 0.9 : 0.6; context.globalAlpha = alpha(geometry, 0.14 + peak.elevation * 0.12); context.stroke()
            }
        })

        // Survey frame and coordinate ticks make the terrain feel measured rather than decorative.
        context.strokeStyle = geometry.border; context.lineWidth = 0.8; context.globalAlpha = alpha(geometry, 0.18)
        context.strokeRect(geometry.width * 0.055, geometry.height * 0.065, geometry.width * 0.89, geometry.height * 0.87)
        for (let tick = 0; tick < 12; tick += 1) {
            const x = geometry.width * (0.08 + tick * 0.075)
            strokeLine(context, x, geometry.height * 0.065, x, geometry.height * (tick % 3 === 0 ? 0.083 : 0.075))
        }

        // Strategic route: copper/emerald path with a moving decision packet.
        context.strokeStyle = linearGradientFallback(context, geometry); context.lineWidth = 1.35; context.globalAlpha = alpha(geometry, 0.4)
        context.setLineDash([7, 6]); context.beginPath()
        geometry.route.forEach((point, index) => {
            if (index === 0) context.moveTo(point.x, point.y)
            else {
                const prev = geometry.route[index - 1]
                context.quadraticCurveTo((prev.x + point.x) * 0.5, Math.min(prev.y, point.y) - geometry.height * 0.04, point.x, point.y)
            }
        }); context.stroke(); context.setLineDash([])
        geometry.route.forEach((point, index) => {
            context.fillStyle = index % 2 === 0 ? geometry.accent : geometry.secondary; context.globalAlpha = alpha(geometry, 0.46)
            context.beginPath(); context.arc(point.x, point.y, 2.5 + (index % 3), 0, TAU); context.fill()
        })
        const routeIndex = state.route * Math.max(1, geometry.route.length - 1)
        const i = Math.min(geometry.route.length - 2, Math.floor(routeIndex)), t = routeIndex - i
        const a = geometry.route[i], b = geometry.route[i + 1]
        const packetX = mix(a.x, b.x, t), packetY = mix(a.y, b.y, t) - Math.sin(t * Math.PI) * geometry.height * 0.04
        context.fillStyle = geometry.focus; context.shadowBlur = 10; context.shadowColor = geometry.accent; context.globalAlpha = alpha(geometry, 0.72)
        context.beginPath(); context.arc(packetX, packetY, 3.5, 0, TAU); context.fill(); context.shadowBlur = 0

        // Survey crosshair sweeps very slowly across the territory.
        const sx = geometry.width * (0.1 + 0.8 * ((Math.sin(state.time * 0.08) + 1) / 2))
        context.strokeStyle = geometry.secondary; context.globalAlpha = alpha(geometry, 0.15); context.lineWidth = 0.8
        strokeLine(context, sx, geometry.height * 0.07, sx, geometry.height * 0.93)
        context.restore()
    },
})

function linearGradientFallback(context: CanvasContext, geometry: ScenePaletteGeometry) {
    const gradient = context.createLinearGradient(geometry.width * 0.08, 0, geometry.width * 0.92, 0)
    gradient.addColorStop(0, geometry.accent); gradient.addColorStop(0.52, geometry.secondary); gradient.addColorStop(1, geometry.accent)
    return gradient
}
