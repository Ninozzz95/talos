import {
    TAU, alpha, defineScene, hash01, makePaletteGeometry, primitiveCount, qCount, rngFor,
    seconds, type CanvasContext, type ScenePaletteGeometry,
} from './sceneTools'

type VioletState = { seed: number; time: number; phaseA: number; phaseB: number }
type SeedNode = Readonly<{ a: number; b: number; radius: number; weight: number; phase: number }>
type VioletGeometry = ScenePaletteGeometry & Readonly<{ nodes: readonly SeedNode[]; cx: number; cy: number; scaleX: number; scaleY: number; lobes: number }>

export const violetComplexScene = defineScene<VioletState, VioletGeometry>({
    id: 'violet',
    createState: (seed) => ({ seed, time: 0, phaseA: 0, phaseB: 0 }),
    prepare: ({ state, input }) => {
        const base = makePaletteGeometry('violet', state.seed, input)
        const rng = rngFor('violet', state.seed, 1009)
        const nodes = Object.freeze(Array.from({ length: qCount(base, 8, 13, 20) }, (_, index) => Object.freeze({
            a: 1.1 + rng() * 2.7, b: 1.4 + rng() * 3.4, radius: 0.18 + rng() * 0.78,
            weight: 0.3 + rng() * 0.7, phase: rng() * TAU + index * 0.17,
        })))
        return Object.freeze({
            geometry: Object.freeze({ ...base, nodes, cx: base.width * 0.5, cy: base.height * 0.5, scaleX: base.width * 0.37, scaleY: base.height * 0.34, lobes: 3 + Math.floor(rng() * 4) }),
            primitiveCount: primitiveCount(input, 160, 240, 330),
        })
    },
    update: ({ state, input, stepMs }) => {
        const dt = seconds(stepMs) * input.parameters.speed / 100
        state.time += dt; state.phaseA += dt * 0.12; state.phaseB -= dt * 0.073
    },
    draw: ({ context: rawContext, state, geometry }) => {
        const context = rawContext as CanvasContext
        context.save(); context.clearRect(0, 0, geometry.width, geometry.height)
        context.globalCompositeOperation = 'lighter'

        // One continuous parametric manifold is the dominant silhouette.
        const samples = geometry.mobile ? 80 : geometry.quality === 'high' ? 220 : 150
        context.beginPath()
        for (let sample = 0; sample <= samples; sample += 1) {
            const t = sample / samples * TAU
            const radial = 0.72 + 0.15 * Math.sin(geometry.lobes * t + state.phaseB * 3) + 0.08 * Math.cos((geometry.lobes + 2) * t - state.phaseA * 5)
            const x = geometry.cx + Math.sin(t * 2.03 + state.phaseA) * geometry.scaleX * radial + Math.sin(t * 5.2) * geometry.scaleX * 0.06
            const y = geometry.cy + Math.sin(t * 3.01 + state.phaseB) * geometry.scaleY * radial + Math.cos(t * 4.1) * geometry.scaleY * 0.05
            if (sample === 0) context.moveTo(x, y); else context.lineTo(x, y)
        }
        context.strokeStyle = geometry.accent; context.lineWidth = 1.25; context.globalAlpha = alpha(geometry, 0.34)
        context.shadowBlur = 10; context.shadowColor = geometry.accent; context.stroke(); context.shadowBlur = 0

        // Secondary orbit is deliberately incommensurate; slow interference instead of particle noise.
        context.beginPath()
        for (let sample = 0; sample <= Math.round(samples * 0.72); sample += 1) {
            const t = sample / Math.max(1, Math.round(samples * 0.72)) * TAU
            const x = geometry.cx + Math.cos(t * 3.17 - state.phaseB) * geometry.scaleX * 0.56 + Math.sin(t * 7.1) * geometry.scaleX * 0.08
            const y = geometry.cy + Math.sin(t * 2.11 + state.phaseA) * geometry.scaleY * 0.6
            if (sample === 0) context.moveTo(x, y); else context.lineTo(x, y)
        }
        context.strokeStyle = geometry.secondary; context.lineWidth = 0.9; context.globalAlpha = alpha(geometry, 0.24); context.stroke()

        // Seed nodes attach to the manifold and form sparse research annotations.
        geometry.nodes.forEach((node, index) => {
            const t = node.phase + state.phaseA * node.a + state.phaseB * node.b
            const x = geometry.cx + Math.sin(t * 2.03) * geometry.scaleX * node.radius
            const y = geometry.cy + Math.sin(t * 3.01 + node.phase * 0.3) * geometry.scaleY * node.radius
            const pulse = 0.5 + 0.5 * Math.sin(state.time * (0.35 + node.weight * 0.4) + node.phase)
            context.fillStyle = index % 3 === 0 ? geometry.secondary : geometry.accent
            context.globalAlpha = alpha(geometry, 0.15 + pulse * 0.28)
            context.beginPath(); context.arc(x, y, 1.5 + node.weight * 3.2, 0, TAU); context.fill()
            if (index % 4 === 0) {
                context.strokeStyle = geometry.focus; context.lineWidth = 0.7; context.globalAlpha = alpha(geometry, 0.15)
                context.beginPath(); context.arc(x, y, 7 + node.weight * 9 + pulse * 2, 0, TAU); context.stroke()
            }
        })

        // A few chord connections imply hypothesis links.
        context.strokeStyle = geometry.info; context.lineWidth = 0.55; context.globalAlpha = alpha(geometry, 0.11)
        const links = Math.min(7, geometry.nodes.length - 1)
        for (let link = 0; link < links; link += 1) {
            const a = geometry.nodes[link], b = geometry.nodes[(link * 3 + 5) % geometry.nodes.length]
            const ta = a.phase + state.phaseA * a.a, tb = b.phase + state.phaseB * b.b
            const ax = geometry.cx + Math.sin(ta * 2.03) * geometry.scaleX * a.radius, ay = geometry.cy + Math.sin(ta * 3.01) * geometry.scaleY * a.radius
            const bx = geometry.cx + Math.sin(tb * 2.03) * geometry.scaleX * b.radius, by = geometry.cy + Math.sin(tb * 3.01) * geometry.scaleY * b.radius
            context.beginPath(); context.moveTo(ax, ay)
            context.quadraticCurveTo(geometry.cx + (hash01(link, geometry.seed) - 0.5) * geometry.scaleX * 0.3, geometry.cy + (hash01(link, 7, geometry.seed) - 0.5) * geometry.scaleY * 0.3, bx, by); context.stroke()
        }
        context.restore()
    },
})
