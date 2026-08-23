import {
    TAU, alpha, clamp, defineScene, fract, hash01, makePaletteGeometry, primitiveCount,
    qCount, rngFor, seconds, strokeLine, type CanvasContext, type ScenePaletteGeometry,
} from './sceneTools'

type TerminalState = { seed: number; time: number; mutation: number; blackout: number }
type Stream = Readonly<{
    x: number; speed: number; offset: number; length: number; phase: number; bend: number; cadence: number; glyphSeed: number
}>
type Scar = Readonly<{ y: number; width: number; phase: number }>
type TerminalGeometry = ScenePaletteGeometry & Readonly<{ streams: readonly Stream[]; scars: readonly Scar[]; cell: number; rows: number }>

// Matrix is the cultural starting point; the V3 language is deliberately more
// calligraphic, less uniform and closer to a decaying phosphor manuscript.
const GLYPHS = 'ｱｲｳｴｵｶｷｸｹｺｻｼｽｾｿﾀﾁﾂﾃﾄﾅﾆﾇﾈﾉﾊﾋﾌﾍﾎﾏﾐﾑﾒﾓﾔﾕﾖﾗﾘﾙﾚﾛﾜ0123456789ZXCVBNM∆◇┼⌁⌗<>:;*+'

function proceduralGlyph(context: CanvasContext, x: number, y: number, size: number, code: number, slant: number): void {
    const unit = Math.max(0.8, size * 0.075), h = size * 0.34
    context.save(); context.translate(x, y); context.rotate(slant)
    const bits = ((Math.imul(code, 1103515245) + 12345) >>> 0)
    if (bits & 1) context.fillRect(-size * 0.24, -h, unit, h * 1.75)
    if (bits & 2) context.fillRect(size * 0.13, -h * 0.86, unit, h * 1.55)
    if (bits & 4) context.fillRect(-size * 0.22, -h * 0.08, size * 0.42, unit)
    if (bits & 8) context.fillRect(-size * 0.16, -h * 0.72, size * 0.31, unit)
    if (bits & 16) context.fillRect(-size * 0.1, h * 0.5, size * 0.26, unit)
    if (bits & 32) {
        context.beginPath(); context.moveTo(-size * 0.2, h * 0.45); context.lineTo(size * 0.2, -h * 0.65); context.stroke()
    }
    context.restore()
}

export const terminalComplexScene = defineScene<TerminalState, TerminalGeometry>({
    id: 'terminal',
    createState: (seed) => ({ seed, time: 0, mutation: 0, blackout: 0 }),
    prepare: ({ state, input }) => {
        const base = makePaletteGeometry('terminal', state.seed, input)
        const rng = rngFor('terminal', state.seed, 313)
        const count = qCount(base, 14, 21, 29)
        const cell = clamp(base.width / count, 12, base.mobile ? 23 : 29)
        const rows = Math.ceil(base.height / cell) + 3
        const streams = Object.freeze(Array.from({ length: count }, (_, index) => Object.freeze({
            x: (index + 0.5) * base.width / count + (rng() - 0.5) * cell * 0.4,
            speed: 3 + rng() * 9,
            offset: rng() * rows,
            length: Math.round(5 + rng() * 14),
            phase: rng() * TAU,
            bend: (rng() - 0.5) * cell * 1.5,
            cadence: 0.45 + rng() * 1.6,
            glyphSeed: Math.floor(rng() * 1_000_000),
        })))
        const scars = Object.freeze(Array.from({ length: qCount(base, 2, 3, 5) }, () => Object.freeze({ y: rng() * base.height, width: 0.18 + rng() * 0.6, phase: rng() * TAU })))
        return Object.freeze({ geometry: Object.freeze({ ...base, streams, scars, cell, rows }), primitiveCount: primitiveCount(input, 300, 365, 398) })
    },
    update: ({ state, input, stepMs }) => {
        const dt = seconds(stepMs) * input.parameters.speed / 100
        state.time += dt; state.mutation = (state.mutation + dt * 6.8) % 100_000; state.blackout = (state.blackout + dt * 0.11) % 1
    },
    draw: ({ context: rawContext, state, geometry }) => {
        const context = rawContext as CanvasContext
        context.save(); context.clearRect(0, 0, geometry.width, geometry.height)
        context.lineCap = 'square'

        // Sparse CRT substrate.
        context.strokeStyle = geometry.accent; context.lineWidth = 0.35; context.globalAlpha = alpha(geometry, 0.025)
        const scanStep = Math.max(5, geometry.cell * 0.42)
        for (let y = 0; y < geometry.height; y += scanStep) strokeLine(context, 0, y, geometry.width, y)

        const frame = Math.floor(state.mutation)
        const canText = typeof context.fillText === 'function'
        if (canText) {
            context.font = `${Math.floor(geometry.cell * 0.72)}px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace`
            context.textAlign = 'center'; context.textBaseline = 'middle'
        }

        geometry.streams.forEach((stream, streamIndex) => {
            // Individual cadence gives each stream its own stop/restart behaviour.
            const cadenceStep = Math.floor(state.time * stream.cadence + stream.phase) % 13
            const speedScale = cadenceStep === 0 ? 0.05 : cadenceStep === 1 ? 0.28 : cadenceStep === 8 ? 1.7 : 1
            const head = fract((stream.offset + state.time * stream.speed * speedScale) / geometry.rows) * geometry.rows
            const tail = Math.max(5, Math.round(stream.length * (0.7 + geometry.parameters.trails / 150)))

            for (let trail = 0; trail < tail; trail += 1) {
                let row = Math.floor(head - trail); while (row < 0) row += geometry.rows; row %= geometry.rows
                const y = row * geometry.cell - geometry.cell * 0.2
                const decay = 1 - trail / tail
                const bend = Math.sin((y / Math.max(1, geometry.height)) * 4.2 + state.time * 0.55 + stream.phase) * stream.bend * (0.2 + decay * 0.8)
                const x = stream.x + bend
                const gap = hash01(streamIndex * 31 + row, frame >> 2, geometry.seed)
                if (gap < 0.1 && trail > 1) continue
                const glyphIndex = Math.floor(hash01(stream.glyphSeed + row, frame >> (trail === 0 ? 1 : 3), trail) * GLYPHS.length)
                const glyph = GLYPHS[glyphIndex] ?? '0'
                const flash = trail === 0
                const fresh = trail < 3
                context.globalAlpha = alpha(geometry, flash ? 0.92 : 0.05 + decay * decay * (fresh ? 0.58 : 0.4))
                context.fillStyle = flash ? geometry.focus : fresh ? geometry.secondary : geometry.accent
                context.strokeStyle = context.fillStyle
                context.shadowBlur = flash ? 13 : fresh ? 4 : 0; context.shadowColor = geometry.accent

                // Only some cells use font glyphs; others are procedural marks, which breaks the literal Matrix copy.
                const useText = canText && hash01(streamIndex, row, geometry.seed) > 0.36
                if (useText) context.fillText?.(glyph, x, y)
                else proceduralGlyph(context, x, y, geometry.cell * 0.76, glyph.charCodeAt(0) + frame + trail * 17, (hash01(row, streamIndex) - 0.5) * 0.18)

                // Occasional horizontal ligature links turn rain into calligraphy.
                if (fresh && streamIndex % 5 === 2 && trail === 2) {
                    context.globalAlpha = alpha(geometry, 0.16)
                    strokeLine(context, x - geometry.cell * 0.32, y + geometry.cell * 0.16, x + geometry.cell * 0.42, y - geometry.cell * 0.08)
                }
            }
        })

        // Broadcast scars periodically erase/veil bands of the rain.
        geometry.scars.forEach((scar, index) => {
            const pulse = 0.5 + 0.5 * Math.sin(state.time * (0.7 + index * 0.17) + scar.phase)
            const x = geometry.width * (0.5 - scar.width / 2)
            context.fillStyle = geometry.background; context.globalAlpha = alpha(geometry, 0.025 + pulse * 0.055)
            context.fillRect(x, scar.y, geometry.width * scar.width, 2 + pulse * 9)
            context.strokeStyle = index % 2 === 0 ? geometry.secondary : geometry.accent
            context.globalAlpha = alpha(geometry, 0.08 + pulse * 0.12)
            strokeLine(context, x, scar.y, x + geometry.width * scar.width, scar.y)
        })

        // Slow phosphor bloom, offset from the rain direction.
        const bloomY = fract(state.time * 0.027 + 0.17) * geometry.height
        const glow = context.createRadialGradient(geometry.width * 0.44, bloomY, 0, geometry.width * 0.44, bloomY, geometry.width * 0.35)
        glow.addColorStop(0, geometry.accent); glow.addColorStop(0.28, geometry.secondary); glow.addColorStop(1, 'transparent')
        context.fillStyle = glow; context.globalAlpha = alpha(geometry, 0.018)
        context.beginPath(); context.arc(geometry.width * 0.44, bloomY, geometry.width * 0.34, 0, TAU); context.fill()
        context.restore()
    },
})
