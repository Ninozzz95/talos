import {
    TAU, alpha, defineScene, makePaletteGeometry, primitiveCount, qCount, rngFor, seconds,
    strokeLine, type CanvasContext, type ScenePaletteGeometry,
} from './sceneTools'

type ClaudiusState = { seed: number; time: number; thought: number; proof: number }
type Block = Readonly<{ x: number; y: number; width: number; lines: number; lead: number; voice: number }>
type Thread = Readonly<{ fromY: number; toY: number; side: -1 | 1; phase: number; weight: number }>
type ClaudiusGeometry = ScenePaletteGeometry & Readonly<{ blocks: readonly Block[]; threads: readonly Thread[]; columnX: number; columnW: number }>

export const claudiusComplexScene = defineScene<ClaudiusState, ClaudiusGeometry>({
    id: 'claudius',
    createState: (seed) => ({ seed, time: 0, thought: 0, proof: 0 }),
    prepare: ({ state, input }) => {
        const base = makePaletteGeometry('claudius', state.seed, input)
        const rng = rngFor('claudius', state.seed, 1103)
        const columnW = base.width * (base.mobile ? 0.74 : 0.56), columnX = (base.width - columnW) * 0.5
        const blocks = Object.freeze(Array.from({ length: qCount(base, 5, 7, 9) }, (_, index) => Object.freeze({
            x: columnX + columnW * (0.02 + rng() * 0.04), y: base.height * (0.1 + index * 0.095 + rng() * 0.015),
            width: columnW * (0.58 + rng() * 0.36), lines: 2 + Math.floor(rng() * 4), lead: 7 + rng() * 3,
            voice: rng(),
        })))
        const threads = Object.freeze(Array.from({ length: qCount(base, 4, 6, 8) }, (_, index) => Object.freeze({
            fromY: base.height * (0.15 + index * 0.1), toY: base.height * (0.23 + index * 0.1 + rng() * 0.08),
            side: index % 2 === 0 ? -1 as const : 1 as const, phase: rng() * TAU, weight: 0.45 + rng() * 0.55,
        })))
        return Object.freeze({ geometry: Object.freeze({ ...base, blocks, threads, columnX, columnW }), primitiveCount: primitiveCount(input, 145, 210, 290) })
    },
    update: ({ state, input, stepMs }) => {
        const dt = seconds(stepMs) * input.parameters.speed / 100
        state.time += dt; state.thought += dt * 0.075; state.proof = (state.proof + dt * 0.04) % 1
    },
    draw: ({ context: rawContext, state, geometry }) => {
        const context = rawContext as CanvasContext
        context.save(); context.clearRect(0, 0, geometry.width, geometry.height)

        // Warm manuscript column with a soft edge, not a generic document rectangle.
        context.fillStyle = geometry.surface; context.globalAlpha = alpha(geometry, 0.13)
        context.fillRect(geometry.columnX - geometry.columnW * 0.08, geometry.height * 0.055, geometry.columnW * 1.16, geometry.height * 0.88)
        context.strokeStyle = geometry.border; context.lineWidth = 0.65; context.globalAlpha = alpha(geometry, 0.14)
        strokeLine(context, geometry.columnX, geometry.height * 0.07, geometry.columnX, geometry.height * 0.92)

        // Two oversized proofreader brackets anchor the composition like marginal quotations.
        context.strokeStyle = geometry.accent; context.lineWidth = 1.25; context.globalAlpha = alpha(geometry, 0.28)
        const qx = geometry.columnX - geometry.columnW * 0.08, qy = geometry.height * 0.16
        context.beginPath(); context.arc(qx, qy, 12, Math.PI * 0.55, Math.PI * 1.45); context.stroke()
        context.beginPath(); context.arc(qx + 18, qy + 2, 8, Math.PI * 0.55, Math.PI * 1.45); context.stroke()
        const rx = geometry.columnX + geometry.columnW * 1.08, ry = geometry.height * 0.76
        context.beginPath(); context.arc(rx, ry, 12, -Math.PI * 0.45, Math.PI * 0.45); context.stroke()
        context.beginPath(); context.arc(rx - 18, ry - 2, 8, -Math.PI * 0.45, Math.PI * 0.45); context.stroke()

        // Paragraph masses are irregular and serif-like in cadence.
        geometry.blocks.forEach((block, blockIndex) => {
            const emphasis = 0.5 + 0.5 * Math.sin(state.thought + block.voice * TAU)
            for (let line = 0; line < block.lines; line += 1) {
                const width = block.width * (line === block.lines - 1 ? 0.55 + block.voice * 0.24 : 0.9 + Math.sin(blockIndex + line) * 0.04)
                const y = block.y + line * block.lead
                context.fillStyle = block.voice > 0.7 && line === 0 ? geometry.accent : geometry.border
                context.globalAlpha = alpha(geometry, 0.22 + emphasis * 0.11)
                context.fillRect(block.x, y, width, line === 0 && block.voice > 0.72 ? 2.1 : 1.1)
            }
            if (block.voice > 0.78) {
                context.strokeStyle = geometry.secondary; context.globalAlpha = alpha(geometry, 0.22)
                context.beginPath(); context.arc(block.x - 9, block.y + 4, 3.5, Math.PI * 0.6, Math.PI * 1.4); context.stroke()
            }
        })

        // Marginal thought threads make Claudius conversational rather than merely editorial.
        geometry.threads.forEach((thread, index) => {
            const sideX = thread.side < 0 ? geometry.columnX - geometry.columnW * 0.13 : geometry.columnX + geometry.columnW * 1.13
            const inwardX = thread.side < 0 ? geometry.columnX + geometry.columnW * 0.04 : geometry.columnX + geometry.columnW * 0.96
            const sway = Math.sin(state.time * 0.18 + thread.phase) * geometry.columnW * 0.018
            context.strokeStyle = index % 2 === 0 ? geometry.accent : geometry.secondary; context.lineWidth = 0.8 + thread.weight * 0.5
            context.globalAlpha = alpha(geometry, 0.18 + thread.weight * 0.14)
            context.beginPath(); context.moveTo(sideX, thread.fromY)
            context.bezierCurveTo(sideX + sway, (thread.fromY + thread.toY) * 0.48, inwardX - sway, (thread.fromY + thread.toY) * 0.58, inwardX, thread.toY); context.stroke()
            context.beginPath(); context.arc(sideX, thread.fromY, 2 + thread.weight * 2.2, 0, TAU); context.stroke()
        })

        // Proof-reader sweep is a small clay cursor, not a full scanner.
        const proofY = geometry.height * (0.1 + state.proof * 0.78)
        context.strokeStyle = geometry.accent; context.lineWidth = 1.4; context.globalAlpha = alpha(geometry, 0.32)
        const x0 = geometry.columnX + geometry.columnW * 0.83
        strokeLine(context, x0, proofY - 5, x0 + 7, proofY); strokeLine(context, x0 + 7, proofY, x0, proofY + 5)

        // Footer/folio gives the page a distinctive quiet ending.
        context.strokeStyle = geometry.border; context.lineWidth = 0.55; context.globalAlpha = alpha(geometry, 0.12)
        strokeLine(context, geometry.columnX + geometry.columnW * 0.36, geometry.height * 0.89, geometry.columnX + geometry.columnW * 0.64, geometry.height * 0.89)
        context.restore()
    },
})
