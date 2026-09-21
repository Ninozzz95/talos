import {
    TAU, alpha, defineScene, fract, hash01, makePaletteGeometry, primitiveCount, qCount,
    radialGradient, rngFor, seconds, type CanvasContext, type ScenePaletteGeometry,
} from './sceneTools'

type EmberState = { seed: number; time: number; buoyancy: number; alarm: number }
type Plume = Readonly<{ x: number; base: number; width: number; height: number; phase: number; lean: number; heat: number }>
type Spark = Readonly<{ x: number; y: number; speed: number; drift: number; size: number; phase: number }>
type EmberGeometry = ScenePaletteGeometry & Readonly<{ plumes: readonly Plume[]; sparks: readonly Spark[]; alarmX: number; alarmY: number }>

export const emberComplexScene = defineScene<EmberState, EmberGeometry>({
    id: 'ember',
    createState: (seed) => ({ seed, time: 0, buoyancy: 0, alarm: 0 }),
    prepare: ({ state, input }) => {
        const base = makePaletteGeometry('ember', state.seed, input)
        const rng = rngFor('ember', state.seed, 617)
        const plumes = Object.freeze(Array.from({ length: qCount(base, 4, 6, 9) }, (_, index) => Object.freeze({
            x: base.width * (0.1 + 0.8 * (index + 0.5) / qCount(base, 4, 6, 9)),
            base: base.height * (0.78 + rng() * 0.13), width: base.width * (0.04 + rng() * 0.08),
            height: base.height * (0.28 + rng() * 0.46), phase: rng() * TAU, lean: (rng() - 0.5) * base.width * 0.12, heat: rng(),
        })))
        const sparks = Object.freeze(Array.from({ length: qCount(base, 22, 36, 54) }, () => Object.freeze({
            x: rng() * base.width, y: rng() * base.height, speed: 0.25 + rng() * 1.2,
            drift: (rng() - 0.5) * 34, size: 0.8 + rng() * 2.4, phase: rng() * TAU,
        })))
        return Object.freeze({ geometry: Object.freeze({ ...base, plumes, sparks, alarmX: base.width * 0.82, alarmY: base.height * 0.2 }), primitiveCount: primitiveCount(input, 190, 285, 380) })
    },
    update: ({ state, input, stepMs }) => {
        const dt = seconds(stepMs) * input.parameters.speed / 100
        state.time += dt; state.buoyancy += dt * 0.22; state.alarm = (state.alarm + dt * 0.28) % 1
    },
    draw: ({ context: rawContext, state, geometry }) => {
        const context = rawContext as CanvasContext
        context.save(); context.clearRect(0, 0, geometry.width, geometry.height)
        context.globalCompositeOperation = 'lighter'

        // Fire is treated as buoyant transport: vertical bodies that curl while rising.
        geometry.plumes.forEach((plume) => {
            const layers = geometry.mobile ? 3 : geometry.quality === 'high' ? 6 : 4
            for (let layer = 0; layer < layers; layer += 1) {
                const spread = layer / Math.max(1, layers - 1) - 0.5
                const rise = Math.sin(state.buoyancy * (1.3 + plume.heat) + plume.phase + layer) * plume.width * 0.25
                const x0 = plume.x + spread * plume.width
                const y0 = plume.base
                const x1 = plume.x + plume.lean + spread * plume.width * 0.55 + rise
                const y1 = plume.base - plume.height
                const gradient = context.createLinearGradient(x0, y0, x1, y1)
                gradient.addColorStop(0, geometry.warning); gradient.addColorStop(0.34, geometry.danger)
                gradient.addColorStop(0.72, geometry.accent); gradient.addColorStop(1, 'transparent')
                context.strokeStyle = gradient; context.lineWidth = 1.2 + layer * 1.15
                context.globalAlpha = alpha(geometry, 0.075 + plume.heat * 0.075)
                context.shadowBlur = 8 + layer * 2; context.shadowColor = geometry.danger
                context.beginPath(); context.moveTo(x0, y0)
                context.bezierCurveTo(
                    x0 - plume.lean * 0.2 + Math.sin(state.time * 0.7 + plume.phase) * plume.width, plume.base - plume.height * 0.28,
                    x1 + Math.cos(state.time * 0.43 + plume.phase + layer) * plume.width * 0.8, plume.base - plume.height * 0.72,
                    x1, y1,
                ); context.stroke()
            }
        })

        // Embers are advected upward with independent lifetimes.
        context.shadowBlur = 4; context.shadowColor = geometry.warning
        geometry.sparks.forEach((spark, index) => {
            const life = fract(spark.phase / TAU + state.time * 0.055 * spark.speed)
            const y = geometry.height - life * geometry.height * 1.08
            const x = spark.x + Math.sin(state.time * spark.speed + spark.phase) * spark.drift + Math.sin(life * TAU * 1.7) * 8
            const hot = hash01(index, Math.floor(state.time * 3), geometry.seed) > 0.72
            context.fillStyle = hot ? geometry.focus : index % 3 === 0 ? geometry.warning : geometry.danger
            context.globalAlpha = alpha(geometry, (1 - life) * 0.42 + 0.08)
            context.fillRect(x, y, spark.size * (hot ? 1.6 : 1), spark.size * (2 + spark.speed))
        })

        // Heat-lens: broad halos bend perception without a waveform motif.
        context.shadowBlur = 0
        geometry.plumes.slice(0, 3).forEach((plume, index) => {
            const y = plume.base - plume.height * (0.32 + 0.16 * Math.sin(state.time * 0.18 + index))
            context.fillStyle = radialGradient(context, plume.x, y, plume.width * 2.8, geometry.warning, geometry.danger)
            context.globalAlpha = alpha(geometry, 0.022)
            context.beginPath(); context.arc(plume.x, y, plume.width * 2.6, 0, TAU); context.fill()
        })

        // Incident beacon is geometric and calm enough to remain readable.
        const alarmPhase = state.alarm * TAU
        context.strokeStyle = geometry.warning; context.lineWidth = 1.4; context.globalAlpha = alpha(geometry, 0.36)
        for (let ring = 0; ring < 3; ring += 1) {
            const radius = 12 + ring * 13 + Math.sin(alarmPhase + ring) * 2
            context.beginPath(); context.arc(geometry.alarmX, geometry.alarmY, radius, -Math.PI / 2, -Math.PI / 2 + TAU * (0.45 + 0.5 * state.alarm)); context.stroke()
        }
        context.restore()
    },
})
