import {
    TAU, alpha, defineScene, makePaletteGeometry, primitiveCount, qCount, radialGradient,
    rngFor, seconds, strokeLine, type CanvasContext, type ScenePaletteGeometry,
} from './sceneTools'

type PaperState = { seed: number; time: number; reading: number; breath: number }
type Paragraph = Readonly<{ x: number; y: number; width: number; lines: number; rhythm: number; emphasis: number }>
type MarginNote = Readonly<{ side: -1 | 1; y: number; length: number; curl: number; phase: number }>
type Fiber = Readonly<{ x: number; y: number; length: number; angle: number; alpha: number }>
type PaperGeometry = ScenePaletteGeometry & Readonly<{
    pageX: number; pageY: number; pageW: number; pageH: number
    paragraphs: readonly Paragraph[]; notes: readonly MarginNote[]; fibers: readonly Fiber[]
}>

export const paperComplexScene = defineScene<PaperState, PaperGeometry>({
    id: 'paper',
    createState: (seed) => ({ seed, time: 0, reading: 0, breath: 0 }),
    prepare: ({ state, input }) => {
        const base = makePaletteGeometry('paper', state.seed, input)
        const rng = rngFor('paper', state.seed, 211)
        const pageW = base.width * (base.mobile ? 0.84 : 0.68), pageH = base.height * 0.84
        const pageX = (base.width - pageW) * 0.5, pageY = base.height * 0.075
        const paragraphs = Object.freeze(Array.from({ length: qCount(base, 4, 6, 8) }, (_, index) => Object.freeze({
            x: pageX + pageW * (0.13 + (index % 2) * 0.03),
            y: pageY + pageH * (0.12 + index * 0.105),
            width: pageW * (0.55 + rng() * 0.22),
            lines: 3 + Math.floor(rng() * 4),
            rhythm: 0.72 + rng() * 0.25,
            emphasis: rng(),
        })))
        const notes = Object.freeze(Array.from({ length: qCount(base, 3, 4, 6) }, (_, index) => Object.freeze({
            side: index % 2 === 0 ? -1 as const : 1 as const,
            y: pageY + pageH * (0.18 + index * 0.13 + rng() * 0.035),
            length: pageW * (0.055 + rng() * 0.055),
            curl: (rng() - 0.5) * 22,
            phase: rng() * TAU,
        })))
        const fibers = Object.freeze(Array.from({ length: qCount(base, 36, 58, 80) }, () => Object.freeze({
            x: pageX + rng() * pageW, y: pageY + rng() * pageH,
            length: 4 + rng() * 16, angle: (rng() - 0.5) * 0.6, alpha: 0.02 + rng() * 0.04,
        })))
        return Object.freeze({ geometry: Object.freeze({ ...base, pageX, pageY, pageW, pageH, paragraphs, notes, fibers }), primitiveCount: primitiveCount(input, 150, 220, 310) })
    },
    update: ({ state, input, stepMs }) => {
        const dt = seconds(stepMs) * input.parameters.speed / 100
        state.time += dt; state.reading = (state.reading + dt * 0.055) % 1; state.breath += dt * 0.18
    },
    draw: ({ context: rawContext, state, geometry }) => {
        const context = rawContext as CanvasContext
        context.save(); context.clearRect(0, 0, geometry.width, geometry.height)

        // One authoritative sheet floating over the UI, not a generic grid.
        const lift = Math.sin(state.breath) * 1.5
        context.fillStyle = geometry.surface; context.globalAlpha = alpha(geometry, 0.12)
        context.shadowBlur = 20; context.shadowColor = geometry.border
        context.fillRect(geometry.pageX, geometry.pageY + lift, geometry.pageW, geometry.pageH)
        context.shadowBlur = 0
        context.strokeStyle = geometry.border; context.lineWidth = 0.8; context.globalAlpha = alpha(geometry, 0.26)
        context.strokeRect(geometry.pageX, geometry.pageY + lift, geometry.pageW, geometry.pageH)

        // Asymmetric editorial landmarks: a Swiss rule, a quiet color block and crop geometry.
        context.fillStyle = geometry.accent; context.globalAlpha = alpha(geometry, 0.16)
        context.fillRect(geometry.pageX + geometry.pageW * 0.08, geometry.pageY + geometry.pageH * 0.09, 3, geometry.pageH * 0.22)
        context.fillStyle = geometry.secondary; context.globalAlpha = alpha(geometry, 0.06)
        context.fillRect(geometry.pageX + geometry.pageW * 0.68, geometry.pageY + geometry.pageH * 0.1, geometry.pageW * 0.18, geometry.pageH * 0.09)
        context.strokeStyle = geometry.accent; context.lineWidth = 1; context.globalAlpha = alpha(geometry, 0.24)
        const regX = geometry.pageX + geometry.pageW * 0.82, regY = geometry.pageY + geometry.pageH * 0.17
        context.beginPath(); context.arc(regX, regY, 14, 0, TAU); context.stroke()
        strokeLine(context, regX - 21, regY, regX + 21, regY); strokeLine(context, regX, regY - 21, regX, regY + 21)
        context.strokeStyle = geometry.border; context.globalAlpha = alpha(geometry, 0.11)
        context.beginPath(); context.moveTo(geometry.pageX + geometry.pageW * 0.72, geometry.pageY + geometry.pageH * 0.88)
        context.quadraticCurveTo(geometry.pageX + geometry.pageW * 0.82, geometry.pageY + geometry.pageH * 0.81, geometry.pageX + geometry.pageW * 0.9, geometry.pageY + geometry.pageH * 0.9); context.stroke()

        // Paper fibres: short directional strokes, deliberately non-animated.
        context.strokeStyle = geometry.border; context.lineWidth = 0.5
        for (const fiber of geometry.fibers) {
            context.globalAlpha = alpha(geometry, fiber.alpha)
            strokeLine(context, fiber.x, fiber.y + lift, fiber.x + Math.cos(fiber.angle) * fiber.length, fiber.y + lift + Math.sin(fiber.angle) * fiber.length)
        }

        // Editorial baseline and folio marks.
        const textLeft = geometry.pageX + geometry.pageW * 0.12
        context.strokeStyle = geometry.secondary; context.globalAlpha = alpha(geometry, 0.28); context.lineWidth = 1
        strokeLine(context, textLeft - 14, geometry.pageY + geometry.pageH * 0.08, textLeft - 14, geometry.pageY + geometry.pageH * 0.91)
        for (let tick = 0; tick < 18; tick += 1) {
            const y = geometry.pageY + geometry.pageH * (0.1 + tick * 0.044)
            context.globalAlpha = alpha(geometry, tick % 4 === 0 ? 0.18 : 0.07)
            strokeLine(context, textLeft, y, geometry.pageX + geometry.pageW * 0.9, y)
        }

        // Paragraphs are typographic masses with changing reading emphasis.
        geometry.paragraphs.forEach((paragraph, pIndex) => {
            const active = Math.abs(state.reading - pIndex / Math.max(1, geometry.paragraphs.length)) < 0.08
            for (let line = 0; line < paragraph.lines; line += 1) {
                const y = paragraph.y + lift + line * 8.5
                const width = paragraph.width * (line === paragraph.lines - 1 ? 0.58 + paragraph.emphasis * 0.25 : 0.93 + Math.sin(line + pIndex) * 0.04)
                context.fillStyle = active && line === 0 ? geometry.accent : geometry.border
                context.globalAlpha = alpha(geometry, active ? 0.5 : 0.24)
                context.fillRect(paragraph.x, y, width * paragraph.rhythm, line === 0 && paragraph.emphasis > 0.65 ? 2.4 : 1.15)
            }
        })

        // Hand-edited marginalia: curved gestures, not UI chevrons.
        context.strokeStyle = geometry.accent; context.lineWidth = 1.2
        geometry.notes.forEach((note, index) => {
            const x = note.side < 0 ? geometry.pageX + geometry.pageW * 0.055 : geometry.pageX + geometry.pageW * 0.945
            const inward = note.side < 0 ? 1 : -1
            const sway = Math.sin(state.time * 0.22 + note.phase) * 2
            context.globalAlpha = alpha(geometry, 0.32 + (index % 2) * 0.08)
            context.beginPath(); context.moveTo(x, note.y + sway)
            context.quadraticCurveTo(x + inward * note.length * 0.48, note.y - 7 + note.curl * 0.25, x + inward * note.length, note.y + 2 + note.curl * 0.08)
            context.stroke()
            context.beginPath(); context.arc(x + inward * note.length * 1.08, note.y + 2, 2.2 + index % 2, 0, TAU); context.stroke()
        })

        // A slow translucent reading veil replaces the old obvious scanner.
        const sweepY = geometry.pageY + geometry.pageH * (0.11 + state.reading * 0.78)
        context.fillStyle = radialGradient(context, geometry.pageX + geometry.pageW * 0.52, sweepY, geometry.pageW * 0.34, geometry.accent, geometry.secondary)
        context.globalAlpha = alpha(geometry, 0.025)
        context.beginPath(); context.arc(geometry.pageX + geometry.pageW * 0.52, sweepY, geometry.pageW * 0.31, 0, TAU); context.fill()

        // Signature editorial registration marks.
        context.strokeStyle = geometry.accent; context.globalAlpha = alpha(geometry, 0.36); context.lineWidth = 1
        const r = 8, cx = geometry.pageX + geometry.pageW * 0.86, cy = geometry.pageY + geometry.pageH * 0.095
        strokeLine(context, cx - r, cy, cx + r, cy); strokeLine(context, cx, cy - r, cx, cy + r)
        context.beginPath(); context.arc(cx, cy, 3.2, 0, TAU); context.stroke()
        context.restore()
    },
})
