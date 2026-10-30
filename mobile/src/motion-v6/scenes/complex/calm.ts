import {
    TAU, alpha, defineScene, makePaletteGeometry, primitiveCount, rngFor, seconds,
    strokeLine, type CanvasContext, type ScenePaletteGeometry,
} from './sceneTools'

/*
 * Owner 28/10/2026: «più visibile, ma calma», variante B «Respiro e luce» scelta sul bozzetto del Desktop. Prima a intensità 20 la scena
 * cambiava UN livello di colore in 4 s (misura sul Pad, vc345): all'occhio era ferma. La tabella è UNA per le tre app (specifica del
 * Desktop, 28/10; fra parentesi i valori di prima): alone 0,16 (0,018), respiro ±0,06 a 0,31 rad/s (±0,018 a 0,07), deriva 0,06 (0,025),
 * orizzonte 0,42/0,5 (0,16/0,16), filamento 0,4 (0,11) con onda ±0,035 a 0,09 (±0,018 a 0,031), polvere 0,07+0,28 ×0,8 (0,018+0,035
 * ×0,55), righe 0,1 (0,035), anello 0,35 (0,12); sfarfallio e ondina delle righe accelerati di k = 0,31/0,07. In più la luce d'accento
 * che attraversa lo schermo in 30 s.
 * Poi «B più leggera» (owner 28/10, dopo la misura del contrasto col telefono in orizzontale: secondario 4,09:1 in chiaro), costanti del
 * Desktop 10e6f7adb (fra parentesi la B piena): alone e luce 0,07 (0,16), orizzonte 0,2/0,14 (0,42/0,5), filamento 0,14 (0,4), polvere
 * 0,05+0,12 (0,07+0,28), righe 0,07 (0,1), anello 0,2 (0,35); respiro, deriva, k, forma e percorso della luce invariati.
 */
const K = 0.31 / 0.07

type CalmState = { seed: number; time: number; breath: number; drift: number; luce: number }
type Dust = Readonly<{ x: number; y: number; size: number; phase: number }>
type CalmGeometry = ScenePaletteGeometry & Readonly<{ dust: readonly Dust[]; horizon: number; filamentY: number }>

export const calmComplexScene = defineScene<CalmState, CalmGeometry>({
    id: 'calm',
    createState: (seed) => ({ seed, time: 0, breath: 0, drift: 0, luce: 0 }),
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
        state.time += dt; state.breath += dt * 0.31; state.drift += dt * 0.06; state.luce += dt / 30
    },
    draw: ({ context: rawContext, state, geometry }) => {
        const context = rawContext as CanvasContext
        context.save(); context.clearRect(0, 0, geometry.width, geometry.height)

        // Negative space is the composition. Only one broad field breathes.
        const cx = geometry.width * (0.5 + Math.sin(state.drift) * 0.015), cy = geometry.height * (0.5 + Math.cos(state.drift * 0.7) * 0.012)
        const radius = Math.max(geometry.width, geometry.height) * (0.42 + Math.sin(state.breath) * 0.06)
        const glow = context.createRadialGradient(cx, cy, 0, cx, cy, radius)
        glow.addColorStop(0, geometry.surface); glow.addColorStop(0.46, geometry.accent); glow.addColorStop(1, 'transparent')
        context.fillStyle = glow; context.globalAlpha = alpha(geometry, 0.07)
        context.beginPath(); context.arc(cx, cy, radius, 0, TAU); context.fill()

        // B «Respiro e luce»: una luce d'accento da −20% a +120% in 30 s, fase continua (a fine corsa ricomincia, non torna indietro).
        const fase = state.luce - Math.floor(state.luce)
        const lx = geometry.width * (-0.2 + fase * 1.4), ly = geometry.height * (0.42 + Math.sin(state.luce * TAU) * 0.06)
        const lr = Math.max(geometry.width, geometry.height) * 0.32
        const luce = context.createRadialGradient(lx, ly, 0, lx, ly, lr)
        luce.addColorStop(0, geometry.accent); luce.addColorStop(1, 'transparent')
        context.fillStyle = luce; context.globalAlpha = alpha(geometry, 0.07)
        context.beginPath(); context.arc(lx, ly, lr, 0, TAU); context.fill()

        // A single horizon carries most of the motion language.
        const horizon = geometry.horizon + Math.sin(state.breath * 1.3) * geometry.height * 0.012
        context.strokeStyle = geometry.border; context.lineWidth = 0.65; context.globalAlpha = alpha(geometry, 0.2)
        strokeLine(context, geometry.width * 0.12, horizon, geometry.width * 0.88, horizon)
        context.strokeStyle = geometry.accent; context.globalAlpha = alpha(geometry, 0.14)
        strokeLine(context, geometry.width * 0.42, horizon, geometry.width * 0.58, horizon)

        // One bronze filament bends with a slower period than the horizon.
        const fy = geometry.filamentY + Math.sin(state.time * 0.09) * geometry.height * 0.035
        context.strokeStyle = geometry.accent; context.lineWidth = 0.75; context.globalAlpha = alpha(geometry, 0.14)
        context.beginPath(); context.moveTo(geometry.width * 0.22, fy)
        context.bezierCurveTo(geometry.width * 0.39, fy - geometry.height * 0.025, geometry.width * 0.61, fy + geometry.height * 0.025, geometry.width * 0.78, fy); context.stroke()

        // Bronze dust is almost static: enough life to stop the field feeling dead.
        context.fillStyle = geometry.accent
        geometry.dust.forEach((dust, index) => {
            const flicker = 0.5 + 0.5 * Math.sin(state.time * (0.07 + index * 0.002) * K + dust.phase)
            context.globalAlpha = alpha(geometry, 0.05 + flicker * 0.12)
            context.beginPath(); context.arc(dust.x, dust.y, dust.size * 0.8, 0, TAU); context.fill()
        })

        // Four nearly invisible hairlines create material depth without becoming a grid.
        context.strokeStyle = geometry.border; context.lineWidth = 0.45; context.globalAlpha = alpha(geometry, 0.07)
        for (let hair = 0; hair < 4; hair += 1) {
            const y = geometry.height * (0.2 + hair * 0.17) + Math.sin(state.time * 0.017 * K + hair) * 1.5
            strokeLine(context, geometry.width * (0.18 + hair * 0.015), y, geometry.width * (0.82 - hair * 0.015), y)
        }

        // Tiny signature ring; no dashboard, no particle system, no ornamental grid.
        context.strokeStyle = geometry.secondary; context.lineWidth = 0.7; context.globalAlpha = alpha(geometry, 0.2)
        context.beginPath(); context.arc(geometry.width * 0.82, geometry.height * 0.22, 8 + Math.sin(state.breath * 0.9) * 1.2, 0, TAU); context.stroke()
        context.restore()
    },
})
