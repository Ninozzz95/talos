import {
    TAU, alpha, defineScene, makePaletteGeometry, primitiveCount, rngFor, seconds,
    type CanvasContext, type ScenePaletteGeometry,
} from './sceneTools'

type BasicusState = { seed: number; time: number; elevation: number; ripple: number }
type Module = Readonly<{ x: number; y: number; w: number; h: number; depth: number; phase: number; kind: number }>
type BasicusGeometry = ScenePaletteGeometry & Readonly<{ modules: readonly Module[]; rippleX: number; rippleY: number }>

export const basicusComplexScene = defineScene<BasicusState, BasicusGeometry>({
    id: 'basicus',
    createState: (seed) => ({ seed, time: 0, elevation: 0, ripple: 0 }),
    prepare: ({ state, input }) => {
        const base = makePaletteGeometry('basicus', state.seed, input)
        const rng = rngFor('basicus', state.seed, 1201)
        const columns = base.mobile ? 3 : 5, rows = base.mobile ? 5 : 4
        const gap = base.width * (base.mobile ? 0.025 : 0.018)
        const cellW = (base.width * 0.82 - gap * (columns - 1)) / columns
        const cellH = (base.height * 0.58 - gap * (rows - 1)) / rows
        const modules: Module[] = []
        for (let row = 0; row < rows; row += 1) for (let column = 0; column < columns; column += 1) {
            const index = row * columns + column
            modules.push(Object.freeze({
                x: base.width * 0.09 + column * (cellW + gap), y: base.height * 0.14 + row * (cellH + gap),
                w: cellW, h: cellH, depth: 0.25 + rng() * 0.75, phase: rng() * TAU, kind: index % 4,
            }))
        }
        return Object.freeze({ geometry: Object.freeze({ ...base, modules: Object.freeze(modules), rippleX: base.width * 0.76, rippleY: base.height * 0.83 }), primitiveCount: primitiveCount(input, 130, 200, 280) })
    },
    update: ({ state, input, stepMs }) => {
        const dt = seconds(stepMs) * input.parameters.speed / 100
        state.time += dt; state.elevation += dt * 0.28; state.ripple = (state.ripple + dt * 0.17) % 1
    },
    draw: ({ context: rawContext, state, geometry }) => {
        const context = rawContext as CanvasContext
        context.save(); context.clearRect(0, 0, geometry.width, geometry.height)

        // Material supergraphics: modules behave like a spatial system, not generic cards.
        geometry.modules.forEach((module) => {
            const lift = Math.sin(state.elevation + module.phase) * 4 * module.depth
            const scale = 1 + Math.sin(state.time * 0.12 + module.phase) * 0.015 * module.depth
            const w = module.w * scale, h = module.h * scale, x = module.x - (w - module.w) / 2, y = module.y + lift - (h - module.h) / 2
            context.shadowBlur = 4 + module.depth * 10; context.shadowColor = geometry.border
            context.fillStyle = module.kind === 0 ? geometry.surface : module.kind === 1 ? geometry.accent : module.kind === 2 ? geometry.secondary : geometry.background
            context.globalAlpha = alpha(geometry, module.kind === 0 || module.kind === 3 ? 0.11 : 0.055 + module.depth * 0.05)
            context.fillRect(x, y, w, h); context.shadowBlur = 0
            context.strokeStyle = module.kind === 1 ? geometry.accent : geometry.border; context.lineWidth = module.kind === 1 ? 1.2 : 0.7
            context.globalAlpha = alpha(geometry, 0.16 + module.depth * 0.08); context.strokeRect(x, y, w, h)

            // Each module contains a different familiar system affordance.
            context.globalAlpha = alpha(geometry, 0.2); context.strokeStyle = module.kind % 2 === 0 ? geometry.secondary : geometry.accent
            if (module.kind === 0) {
                const bars = 3
                for (let bar = 0; bar < bars; bar += 1) context.fillRect(x + w * 0.14, y + h * (0.25 + bar * 0.2), w * (0.35 + 0.12 * bar), 1)
            } else if (module.kind === 1) {
                context.beginPath(); context.arc(x + w * 0.5, y + h * 0.5, Math.min(w, h) * 0.2, 0, TAU * (0.55 + module.depth * 0.35)); context.stroke()
            } else if (module.kind === 2) {
                context.fillRect(x + w * 0.18, y + h * 0.62, w * 0.16, -h * 0.28)
                context.fillRect(x + w * 0.42, y + h * 0.62, w * 0.16, -h * 0.42)
                context.fillRect(x + w * 0.66, y + h * 0.62, w * 0.16, -h * 0.2)
            } else {
                context.beginPath(); context.moveTo(x + w * 0.2, y + h * 0.62); context.lineTo(x + w * 0.46, y + h * 0.34); context.lineTo(x + w * 0.8, y + h * 0.55); context.stroke()
            }
        })

        // A large touch ripple crosses module boundaries, making the field feel tactile.
        context.strokeStyle = geometry.secondary; context.lineWidth = 1; context.globalAlpha = alpha(geometry, 0.22)
        for (let ring = 0; ring < 4; ring += 1) {
            const progress = (state.ripple + ring * 0.21) % 1
            const radius = progress * Math.min(geometry.width, geometry.height) * 0.22
            context.globalAlpha = alpha(geometry, (1 - progress) * 0.2)
            context.beginPath(); context.arc(geometry.rippleX, geometry.rippleY, radius, 0, TAU); context.stroke()
        }
        context.restore()
    },
})
