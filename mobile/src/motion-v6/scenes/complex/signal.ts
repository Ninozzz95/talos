import {
    TAU, alpha, defineScene, hash01, makePaletteGeometry, primitiveCount, qCount,
    rngFor, seconds, strokeLine, type CanvasContext, type ScenePaletteGeometry,
} from './sceneTools'

type SignalState = { seed: number; time: number; sync: number; burst: number }
type Channel = Readonly<{ y: number; frequency: number; amplitude: number; phase: number; jitter: number; colorRole: number }>
type Dropout = Readonly<{ x: number; width: number; y: number; height: number; phase: number }>
type SignalGeometry = ScenePaletteGeometry & Readonly<{ channels: readonly Channel[]; dropouts: readonly Dropout[]; radarX: number; radarY: number; radarR: number }>

export const signalComplexScene = defineScene<SignalState, SignalGeometry>({
    id: 'signal',
    createState: (seed) => ({ seed, time: 0, sync: 0, burst: 0 }),
    prepare: ({ state, input }) => {
        const base = makePaletteGeometry('signal', state.seed, input)
        const rng = rngFor('signal', state.seed, 907)
        const channelCount = qCount(base, 3, 4, 5)
        const channels = Object.freeze(Array.from({ length: channelCount }, (_, index) => Object.freeze({
            y: base.height * (0.19 + index * 0.14), frequency: 1.7 + rng() * 3.7,
            amplitude: base.height * (0.018 + rng() * 0.04), phase: rng() * TAU,
            jitter: 0.2 + rng() * 0.8, colorRole: index % 3,
        })))
        const dropouts = Object.freeze(Array.from({ length: qCount(base, 4, 6, 9) }, () => Object.freeze({
            x: rng() * base.width, width: base.width * (0.025 + rng() * 0.1), y: rng() * base.height,
            height: 2 + rng() * 18, phase: rng() * TAU,
        })))
        return Object.freeze({
            geometry: Object.freeze({ ...base, channels, dropouts, radarX: base.width * 0.78, radarY: base.height * 0.73, radarR: Math.min(base.width, base.height) * 0.14 }),
            primitiveCount: primitiveCount(input, 180, 260, 350),
        })
    },
    update: ({ state, input, stepMs }) => {
        const dt = seconds(stepMs) * input.parameters.speed / 100
        state.time += dt; state.sync = (state.sync + dt * 0.31) % 1; state.burst += dt * 0.9
    },
    draw: ({ context: rawContext, state, geometry }) => {
        const context = rawContext as CanvasContext
        context.save(); context.clearRect(0, 0, geometry.width, geometry.height)

        // Timebase rules: read as instrumentation, but sparse enough to leave the channel traces dominant.
        context.strokeStyle = geometry.border; context.lineWidth = 0.55; context.globalAlpha = alpha(geometry, 0.09)
        const divisions = geometry.mobile ? 8 : 12
        for (let d = 0; d <= divisions; d += 1) {
            const x = geometry.width * (0.05 + 0.9 * d / divisions)
            strokeLine(context, x, geometry.height * 0.08, x, geometry.height * 0.62)
        }

        // Each channel has a different carrier and independent corruption.
        geometry.channels.forEach((channel, cIndex) => {
            const color = channel.colorRole === 0 ? geometry.accent : channel.colorRole === 1 ? geometry.secondary : geometry.info
            context.strokeStyle = color; context.lineWidth = 1 + cIndex * 0.3; context.globalAlpha = alpha(geometry, 0.35 - cIndex * 0.035)
            context.beginPath(); context.moveTo(geometry.width * 0.04, channel.y)
            const steps = geometry.mobile ? 42 : geometry.quality === 'high' ? 110 : 72
            for (let step = 1; step <= steps; step += 1) {
                const u = step / steps
                const x = geometry.width * (0.04 + 0.92 * u)
                const carrier = Math.sin((u * TAU * channel.frequency) + state.time * 1.9 + channel.phase)
                const envelope = 0.34 + 0.66 * Math.sin(Math.PI * u)
                const modulation = Math.sin((u * TAU * (channel.frequency * 0.37 + 0.7)) - state.time * 0.7) * 0.35
                const noise = (hash01(step, cIndex, Math.floor(state.burst * 3)) - 0.5) * channel.jitter
                const spike = hash01(step * 13, cIndex, geometry.seed) > 0.965 ? (step % 2 === 0 ? 2.6 : -2.6) : 0
                const y = channel.y + channel.amplitude * envelope * (carrier + modulation + noise * 0.45 + spike)
                context.lineTo(x, y)
            }
            context.stroke()
        })

        // Broadcast dropouts are short-lived rectangular scars and sync jumps.
        geometry.dropouts.forEach((drop, index) => {
            const live = 0.5 + 0.5 * Math.sin(state.time * (0.7 + index * 0.09) + drop.phase)
            context.fillStyle = index % 2 === 0 ? geometry.background : geometry.surface
            context.globalAlpha = alpha(geometry, 0.035 + live * 0.09)
            context.fillRect(drop.x, drop.y, drop.width, drop.height * live)
            if (live > 0.72) {
                context.strokeStyle = geometry.secondary; context.globalAlpha = alpha(geometry, 0.18)
                strokeLine(context, drop.x - 8, drop.y, drop.x + drop.width + 8, drop.y)
            }
        })

        // Radar is a separate acquisition mode, visually balancing the oscilloscope channels.
        context.strokeStyle = geometry.border; context.lineWidth = 0.7; context.globalAlpha = alpha(geometry, 0.16)
        for (let ring = 1; ring <= 4; ring += 1) {
            context.beginPath(); context.arc(geometry.radarX, geometry.radarY, geometry.radarR * ring / 4, 0, TAU); context.stroke()
        }
        strokeLine(context, geometry.radarX - geometry.radarR, geometry.radarY, geometry.radarX + geometry.radarR, geometry.radarY)
        strokeLine(context, geometry.radarX, geometry.radarY - geometry.radarR, geometry.radarX, geometry.radarY + geometry.radarR)
        const sweep = state.time * 0.78
        context.strokeStyle = geometry.accent; context.lineWidth = 1.6; context.globalAlpha = alpha(geometry, 0.55)
        strokeLine(context, geometry.radarX, geometry.radarY, geometry.radarX + Math.cos(sweep) * geometry.radarR, geometry.radarY + Math.sin(sweep) * geometry.radarR)
        for (let blip = 0; blip < 4; blip += 1) {
            const angle = hash01(blip, geometry.seed) * TAU, radius = geometry.radarR * (0.2 + hash01(blip, 9, geometry.seed) * 0.72)
            const intensity = 0.5 + 0.5 * Math.sin(state.time * 2 + blip)
            context.fillStyle = geometry.secondary; context.globalAlpha = alpha(geometry, 0.16 + intensity * 0.32)
            context.beginPath(); context.arc(geometry.radarX + Math.cos(angle) * radius, geometry.radarY + Math.sin(angle) * radius, 1.5 + intensity * 1.4, 0, TAU); context.fill()
        }

        // Sync needle travels across the signal stack.
        const syncX = geometry.width * (0.04 + 0.92 * state.sync)
        context.strokeStyle = geometry.focus; context.globalAlpha = alpha(geometry, 0.22); context.lineWidth = 0.9
        strokeLine(context, syncX, geometry.height * 0.08, syncX, geometry.height * 0.62)
        context.restore()
    },
})
