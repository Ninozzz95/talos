import {
    TAU, alpha, defineScene, fract, makePaletteGeometry, primitiveCount, qCount, rngFor,
    seconds, strokeLine, type CanvasContext, type ScenePaletteGeometry,
} from './sceneTools'

type TelemetryState = { seed: number; time: number; acquisition: number; sweep: number }
type Gauge = Readonly<{ x: number; y: number; radius: number; minAngle: number; maxAngle: number; phase: number; value: number }>
type Strip = Readonly<{ y: number; amplitude: number; frequency: number; phase: number }>
type TelemetryGeometry = ScenePaletteGeometry & Readonly<{ gauges: readonly Gauge[]; strips: readonly Strip[]; rulerY: number }>

export const telemetryComplexScene = defineScene<TelemetryState, TelemetryGeometry>({
    id: 'telemetry',
    createState: (seed) => ({ seed, time: 0, acquisition: 0, sweep: 0 }),
    prepare: ({ state, input }) => {
        const base = makePaletteGeometry('telemetry', state.seed, input)
        const rng = rngFor('telemetry', state.seed, 1301)
        const gauges = Object.freeze(Array.from({ length: qCount(base, 2, 3, 4) }, (_, index) => Object.freeze({
            x: base.width * (0.18 + index * 0.2), y: base.height * 0.28, radius: Math.min(base.width, base.height) * (0.055 + rng() * 0.035),
            minAngle: Math.PI * 0.72, maxAngle: Math.PI * 2.28, phase: rng() * TAU, value: 0.2 + rng() * 0.7,
        })))
        const strips = Object.freeze(Array.from({ length: qCount(base, 2, 3, 4) }, (_, index) => Object.freeze({
            y: base.height * (0.56 + index * 0.1), amplitude: base.height * (0.012 + rng() * 0.02),
            frequency: 1.4 + rng() * 3.2, phase: rng() * TAU,
        })))
        return Object.freeze({ geometry: Object.freeze({ ...base, gauges, strips, rulerY: base.height * 0.82 }), primitiveCount: primitiveCount(input, 210, 310, 395) })
    },
    update: ({ state, input, stepMs }) => {
        const dt = seconds(stepMs) * input.parameters.speed / 100
        state.time += dt; state.acquisition = (state.acquisition + dt * 0.095) % 1; state.sweep += dt * 0.28
    },
    draw: ({ context: rawContext, state, geometry }) => {
        const context = rawContext as CanvasContext
        context.save(); context.clearRect(0, 0, geometry.width, geometry.height)

        // Instrument header: calibrated segments and datum line, like a physical rack.
        context.strokeStyle = geometry.accent; context.lineWidth = 0.8; context.globalAlpha = alpha(geometry, 0.26)
        strokeLine(context, geometry.width * 0.05, geometry.height * 0.09, geometry.width * 0.95, geometry.height * 0.09)
        for (let cell = 0; cell < 10; cell += 1) {
            const x = geometry.width * (0.055 + cell * 0.087)
            context.fillStyle = cell % 3 === 0 ? geometry.secondary : geometry.border
            context.globalAlpha = alpha(geometry, cell % 3 === 0 ? 0.28 : 0.13)
            context.fillRect(x, geometry.height * 0.115, geometry.width * 0.055, 2 + (cell % 2) * 2)
        }

        // Instrument gauges occupy the top deck.
        geometry.gauges.forEach((gauge, index) => {
            context.strokeStyle = geometry.border; context.lineWidth = 0.8; context.globalAlpha = alpha(geometry, 0.3)
            context.beginPath(); context.arc(gauge.x, gauge.y, gauge.radius, gauge.minAngle, gauge.maxAngle); context.stroke()
            const ticks = 14
            for (let tick = 0; tick <= ticks; tick += 1) {
                const angle = gauge.minAngle + (gauge.maxAngle - gauge.minAngle) * tick / ticks
                const long = tick % 4 === 0
                const r0 = gauge.radius * (long ? 0.78 : 0.86), r1 = gauge.radius
                context.globalAlpha = alpha(geometry, long ? 0.28 : 0.13)
                strokeLine(context, gauge.x + Math.cos(angle) * r0, gauge.y + Math.sin(angle) * r0, gauge.x + Math.cos(angle) * r1, gauge.y + Math.sin(angle) * r1)
            }
            const value = 0.5 + 0.5 * Math.sin(state.time * (0.35 + index * 0.12) + gauge.phase) * 0.32 + (gauge.value - 0.5) * 0.68
            const angle = gauge.minAngle + (gauge.maxAngle - gauge.minAngle) * Math.max(0.04, Math.min(0.96, value))
            context.strokeStyle = index % 2 === 0 ? geometry.accent : geometry.secondary; context.lineWidth = 1.5; context.globalAlpha = alpha(geometry, 0.54)
            strokeLine(context, gauge.x, gauge.y, gauge.x + Math.cos(angle) * gauge.radius * 0.72, gauge.y + Math.sin(angle) * gauge.radius * 0.72)
            context.fillStyle = geometry.focus; context.beginPath(); context.arc(gauge.x, gauge.y, 2.2, 0, TAU); context.fill()
        })

        // Acquisition strips behave like chart recorders, not abstract waves.
        geometry.strips.forEach((strip, stripIndex) => {
            context.strokeStyle = stripIndex % 2 === 0 ? geometry.accent : geometry.secondary
            context.lineWidth = 0.9; context.globalAlpha = alpha(geometry, 0.4)
            context.beginPath(); context.moveTo(geometry.width * 0.05, strip.y)
            const samples = geometry.mobile ? 38 : geometry.quality === 'high' ? 92 : 64
            for (let sample = 1; sample <= samples; sample += 1) {
                const u = sample / samples, x = geometry.width * (0.05 + 0.9 * u)
                const pulse = Math.sin((u * strip.frequency + state.time * 0.11) * TAU + strip.phase)
                const stepPulse = Math.sin((u * 9 + stripIndex) * Math.PI) > 0.92 ? 1.9 : 0
                const y = strip.y + strip.amplitude * (pulse * 0.65 + stepPulse)
                context.lineTo(x, y)
            }
            context.stroke()
            context.strokeStyle = geometry.border; context.globalAlpha = alpha(geometry, 0.1)
            strokeLine(context, geometry.width * 0.05, strip.y, geometry.width * 0.95, strip.y)
        })

        // Precision ruler with major/minor marks.
        context.strokeStyle = geometry.border; context.lineWidth = 0.65; context.globalAlpha = alpha(geometry, 0.32)
        strokeLine(context, geometry.width * 0.05, geometry.rulerY, geometry.width * 0.95, geometry.rulerY)
        const ticks = geometry.mobile ? 30 : 54
        for (let tick = 0; tick <= ticks; tick += 1) {
            const x = geometry.width * (0.05 + 0.9 * tick / ticks), major = tick % 5 === 0
            strokeLine(context, x, geometry.rulerY, x, geometry.rulerY - (major ? 13 : 6))
        }

        // Acquisition cursor is intentionally thin and exact.
        const cursorX = geometry.width * (0.05 + 0.9 * state.acquisition)
        context.strokeStyle = geometry.accent; context.lineWidth = 1; context.globalAlpha = alpha(geometry, 0.44)
        strokeLine(context, cursorX, geometry.height * 0.48, cursorX, geometry.rulerY + 5)
        context.fillStyle = geometry.accent; context.fillRect(cursorX - 2, geometry.rulerY + 7, 4, 4)

        // Small status cadence marks at far right.
        for (let mark = 0; mark < 5; mark += 1) {
            const on = fract(state.sweep + mark * 0.17) < 0.45
            context.fillStyle = on ? geometry.success : geometry.border; context.globalAlpha = alpha(geometry, on ? 0.42 : 0.08)
            context.fillRect(geometry.width * 0.91, geometry.height * (0.12 + mark * 0.055), geometry.width * 0.035, 2)
        }
        context.restore()
    },
})
