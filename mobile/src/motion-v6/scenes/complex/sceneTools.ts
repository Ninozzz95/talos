import type { TalosMotionSceneId } from '../../contracts'
import type { SceneInput } from '../../sceneRegistry'
import type { ComplexSceneDefinition } from '../../renderers/complexRenderer'

export type ComplexGlyphKind = 'line'|'rect'|'filled'|'cross'|'diamond'|'polyline'|'band'|'chevron'|'frame'|'steps'|'pulse'|'bracket'
export type ComplexGlyph = Readonly<{ kind: ComplexGlyphKind; x: number; y: number; width: number; height: number; phase?: number }>
export type ComplexSceneState = { seed: number; phase: number; drift: number }
export type PreparedGlyph = Readonly<ComplexGlyph & { x: number; y: number; width: number; height: number }>
export type ComplexPoint = Readonly<{ x: number; y: number; weight: number; phase: number }>
export type ComplexSceneGeometry = Readonly<{
    id: TalosMotionSceneId
    width: number
    height: number
    mobile: boolean
    accent: string
    secondary: string
    border: string
    surface: string
    focus: string
    info: string
    success: string
    danger: string
    parameters: Readonly<SceneInput['parameters']>
    glyphs: readonly PreparedGlyph[]
    points: readonly ComplexPoint[]
}>

type GradientLike = { addColorStop: (offset: number, color: string) => void }
type CanvasContext = {
    clearRect: (x: number, y: number, width: number, height: number) => void
    beginPath: () => void
    moveTo: (x: number, y: number) => void
    lineTo: (x: number, y: number) => void
    quadraticCurveTo: (cpx: number, cpy: number, x: number, y: number) => void
    bezierCurveTo: (cp1x: number, cp1y: number, cp2x: number, cp2y: number, x: number, y: number) => void
    closePath: () => void
    arc: (x: number, y: number, radius: number, startAngle: number, endAngle: number) => void
    stroke: () => void
    fill: () => void
    fillRect: (x: number, y: number, width: number, height: number) => void
    strokeRect: (x: number, y: number, width: number, height: number) => void
    save: () => void
    restore: () => void
    translate: (x: number, y: number) => void
    rotate: (angle: number) => void
    setLineDash: (segments: number[]) => void
    createLinearGradient: (x0: number, y0: number, x1: number, y1: number) => GradientLike
    createRadialGradient: (x0: number, y0: number, r0: number, x1: number, y1: number, r1: number) => GradientLike
    globalAlpha: number
    lineWidth: number
    strokeStyle: string | GradientLike
    fillStyle: string | GradientLike
    shadowBlur: number
    shadowColor: string
}

const TAU = Math.PI * 2
const SHAPE_COST: Record<ComplexGlyphKind, number> = {
    line: 1, rect: 1, filled: 1, cross: 2, diamond: 4, polyline: 3,
    band: 1, chevron: 2, frame: 1, steps: 3, pulse: 4, bracket: 3,
}

function random(seed: number): () => number {
    let value = seed >>> 0
    return () => {
        value += 0x6d2b79f5
        let result = value
        result = Math.imul(result ^ (result >>> 15), result | 1)
        result ^= result + Math.imul(result ^ (result >>> 7), result | 61)
        return ((result ^ (result >>> 14)) >>> 0) / 4_294_967_296
    }
}

function sceneHash(id: TalosMotionSceneId): number {
    let hash = 0x811c9dc5
    for (const character of id) {
        hash ^= character.charCodeAt(0)
        hash = Math.imul(hash, 0x01000193)
    }
    return hash >>> 0
}

function opacity(geometry: ComplexSceneGeometry, base: number): number {
    return Math.min(0.92, Math.max(0.025, base * (0.5 + (geometry.parameters.intensity / 160))))
}

function gradient(
    context: CanvasContext,
    geometry: ComplexSceneGeometry,
    vertical = false,
): GradientLike {
    const result = context.createLinearGradient(0, 0, vertical ? 0 : geometry.width, vertical ? geometry.height : 0)
    result.addColorStop(0, 'transparent')
    result.addColorStop(0.42, geometry.accent)
    result.addColorStop(0.72, geometry.secondary)
    result.addColorStop(1, 'transparent')
    return result
}

function radialGradient(
    context: CanvasContext,
    geometry: ComplexSceneGeometry,
    x: number,
    y: number,
    radius: number,
): GradientLike {
    const result = context.createRadialGradient(x, y, 0, x, y, radius)
    result.addColorStop(0, geometry.accent)
    result.addColorStop(0.42, geometry.secondary)
    result.addColorStop(1, 'transparent')
    return result
}

function movingPoint(point: ComplexPoint, geometry: ComplexSceneGeometry, phase: number): ComplexPoint {
    const parallax = geometry.parameters.parallax / 100
    const depth = geometry.parameters.depth / 100
    const wave = Math.sin(phase + point.phase)
    return {
        ...point,
        x: point.x + (wave * parallax * (8 + (point.weight * 9))),
        y: point.y + (Math.cos((phase * 0.72) + point.phase) * depth * 7),
    }
}

function strokeLine(
    context: CanvasContext,
    fromX: number,
    fromY: number,
    toX: number,
    toY: number,
): void {
    context.beginPath()
    context.moveTo(fromX, fromY)
    context.lineTo(toX, toY)
    context.stroke()
}

function drawStructuredFoundation(context: CanvasContext, geometry: ComplexSceneGeometry, phase: number): void {
    context.globalAlpha = opacity(geometry, 0.08)
    context.strokeStyle = geometry.border
    context.lineWidth = 0.5 + (geometry.parameters.contrast / 180)
    context.setLineDash([])
    const rows = geometry.mobile ? 11 : 15
    const columns = geometry.mobile ? 7 : 11
    for (let row = 1; row <= rows; row += 1) {
        const y = (geometry.height * row) / (rows + 1) + (Math.sin(phase + row) * 1.5)
        strokeLine(context, geometry.width * 0.05, y, geometry.width * 0.95, y)
    }
    for (let column = 1; column <= columns; column += 1) {
        const x = (geometry.width * column) / (columns + 1)
        strokeLine(context, x, geometry.height * 0.08, x, geometry.height * 0.92)
    }
}

function drawOrganicFoundation(context: CanvasContext, geometry: ComplexSceneGeometry, phase: number): void {
    context.globalAlpha = opacity(geometry, 0.09)
    context.strokeStyle = gradient(context, geometry)
    context.lineWidth = 0.65 + (geometry.parameters.depth / 110)
    context.setLineDash(geometry.parameters.trails > 45 ? [5, 8] : [])
    const limit = Math.min(22, geometry.points.length)
    for (let index = 0; index < limit; index += 1) {
        const from = movingPoint(geometry.points[index], geometry, phase)
        const to = movingPoint(geometry.points[(index + 5) % geometry.points.length], geometry, phase)
        const bend = Math.sin(phase + from.phase) * geometry.height * 0.08
        context.beginPath()
        context.moveTo(from.x, from.y)
        context.quadraticCurveTo((from.x + to.x) / 2, ((from.y + to.y) / 2) + bend, to.x, to.y)
        context.stroke()
    }
}

function drawGeometricFoundation(context: CanvasContext, geometry: ComplexSceneGeometry, phase: number): void {
    context.globalAlpha = opacity(geometry, 0.075)
    context.strokeStyle = geometry.border
    context.fillStyle = geometry.surface
    context.lineWidth = 0.7 + (geometry.parameters.contrast / 160)
    context.setLineDash([])
    const limit = Math.min(18, geometry.points.length - 2)
    for (let index = 0; index < limit; index += 1) {
        const first = movingPoint(geometry.points[index], geometry, phase)
        const second = movingPoint(geometry.points[index + 1], geometry, phase)
        const third = movingPoint(geometry.points[index + 2], geometry, phase)
        context.beginPath()
        context.moveTo(first.x, first.y)
        context.lineTo(second.x, second.y)
        context.lineTo(third.x, third.y)
        context.closePath()
        if (index % 3 === 0) context.fill()
        context.stroke()
    }
}

function drawFoundation(context: CanvasContext, geometry: ComplexSceneGeometry, phase: number): void {
    context.globalAlpha = opacity(geometry, 0.055)
    context.fillStyle = gradient(context, geometry, true)
    context.fillRect(0, 0, geometry.width, geometry.height)
    if (['paper', 'terminal', 'claudius', 'basicus'].includes(geometry.id)) {
        drawStructuredFoundation(context, geometry, phase)
    } else if (['aurora', 'ember', 'atlas', 'signal', 'violet'].includes(geometry.id)) {
        drawOrganicFoundation(context, geometry, phase)
    } else {
        drawGeometricFoundation(context, geometry, phase)
    }
}

function drawForge(context: CanvasContext, geometry: ComplexSceneGeometry, phase: number): void {
    const nodes = geometry.points.slice(0, geometry.mobile ? 10 : 14).sort((left, right) => left.x - right.x)
    context.strokeStyle = gradient(context, geometry)
    context.lineWidth = 1 + (geometry.parameters.depth / 70)
    context.globalAlpha = opacity(geometry, 0.36)
    context.setLineDash(geometry.parameters.trails > 50 ? [7, 5] : [])
    for (let index = 0; index < nodes.length - 1; index += 1) {
        const from = movingPoint(nodes[index], geometry, phase)
        const to = movingPoint(nodes[Math.min(nodes.length - 1, index + 1 + (index % 3 === 0 ? 1 : 0))], geometry, phase)
        context.beginPath()
        context.moveTo(from.x, from.y)
        context.bezierCurveTo(from.x + ((to.x - from.x) * 0.35), from.y, to.x - ((to.x - from.x) * 0.25), to.y, to.x, to.y)
        context.stroke()
    }
    context.setLineDash([])
    context.shadowBlur = 8 + (geometry.parameters.trails / 4)
    context.shadowColor = geometry.accent
    for (let index = 0; index < nodes.length; index += 1) {
        const node = movingPoint(nodes[index], geometry, phase)
        const radius = 2.5 + (node.weight * 3)
        context.fillStyle = index % 4 === 0 ? geometry.secondary : geometry.accent
        context.beginPath()
        context.moveTo(node.x, node.y - radius)
        context.lineTo(node.x + radius, node.y)
        context.lineTo(node.x, node.y + radius)
        context.lineTo(node.x - radius, node.y)
        context.closePath()
        context.fill()
    }
    const progress = (Math.sin(phase) + 1) / 2
    const pulseX = geometry.width * (0.12 + (progress * 0.74))
    const pulseY = geometry.height * (0.52 + (Math.sin(phase * 1.7) * 0.08))
    context.fillStyle = radialGradient(context, geometry, pulseX, pulseY, 32)
    context.globalAlpha = opacity(geometry, 0.5)
    context.beginPath()
    context.arc(pulseX, pulseY, 18 + (geometry.parameters.intensity / 12), 0, TAU)
    context.fill()
}

function drawPaper(context: CanvasContext, geometry: ComplexSceneGeometry, phase: number): void {
    const marginX = geometry.width * (geometry.mobile ? 0.16 : 0.19)
    context.setLineDash([])
    context.strokeStyle = geometry.secondary
    context.globalAlpha = opacity(geometry, 0.28)
    context.lineWidth = 1.2
    strokeLine(context, marginX, geometry.height * 0.08, marginX, geometry.height * 0.92)
    context.strokeStyle = geometry.border
    context.lineWidth = 0.75
    for (let row = 0; row < 16; row += 1) {
        const y = geometry.height * (0.12 + (row * 0.047))
        const width = geometry.width * (0.42 + (((row * 37) % 43) / 100))
        strokeLine(context, marginX + 16, y, Math.min(geometry.width * 0.9, marginX + 16 + width), y)
    }
    context.strokeStyle = geometry.accent
    context.globalAlpha = opacity(geometry, 0.4)
    context.lineWidth = 1.4
    context.setLineDash([3, 5])
    for (let mark = 0; mark < 5; mark += 1) {
        const y = geometry.height * (0.18 + (mark * 0.145))
        context.beginPath()
        context.moveTo(marginX - 12, y - 8)
        context.lineTo(marginX - 4, y)
        context.lineTo(marginX - 12, y + 8)
        context.stroke()
    }
    const sweepY = geometry.height * ((phase / TAU) % 1)
    context.fillStyle = gradient(context, geometry)
    context.globalAlpha = opacity(geometry, 0.12)
    context.fillRect(marginX, sweepY, geometry.width * 0.7, 28)
}

function drawTerminal(context: CanvasContext, geometry: ComplexSceneGeometry, phase: number): void {
    context.setLineDash([])
    context.strokeStyle = geometry.accent
    context.lineWidth = 0.6
    context.globalAlpha = opacity(geometry, 0.1)
    const scanRows = geometry.mobile ? 22 : 30
    for (let row = 0; row < scanRows; row += 1) {
        const y = (geometry.height * row) / scanRows
        strokeLine(context, 0, y, geometry.width, y)
    }
    context.globalAlpha = opacity(geometry, 0.34)
    context.fillStyle = geometry.accent
    const columns = geometry.mobile ? 8 : 13
    for (let column = 0; column < columns; column += 1) {
        const x = geometry.width * (0.08 + (column / (columns + 2)))
        const offset = ((phase * 31) + (column * 47)) % geometry.height
        for (let segment = 0; segment < 5; segment += 1) {
            const y = (offset + (segment * 31)) % geometry.height
            context.fillRect(x, y, 1 + (column % 2), 4 + ((column + segment) % 10))
        }
    }
    context.fillStyle = gradient(context, geometry, true)
    context.globalAlpha = opacity(geometry, 0.2)
    const scanY = (geometry.height * ((phase / TAU) % 1)) - 24
    context.fillRect(0, scanY, geometry.width, 48)
    context.fillStyle = geometry.secondary
    context.globalAlpha = opacity(geometry, 0.6)
    const cursorX = geometry.width * (0.18 + (((Math.sin(phase) + 1) / 2) * 0.5))
    context.fillRect(cursorX, geometry.height * 0.71, 2, 16)
}

function drawAurora(context: CanvasContext, geometry: ComplexSceneGeometry, phase: number): void {
    context.setLineDash([])
    context.shadowBlur = 12 + (geometry.parameters.trails / 3)
    context.shadowColor = geometry.accent
    const ribbons = geometry.mobile ? 4 : 6
    for (let ribbon = 0; ribbon < ribbons; ribbon += 1) {
        const offset = ribbon * geometry.height * 0.1
        const wave = Math.sin(phase + (ribbon * 0.8)) * geometry.height * 0.08
        context.beginPath()
        context.moveTo(-geometry.width * 0.08, geometry.height * 0.22 + offset)
        context.bezierCurveTo(
            geometry.width * 0.24, geometry.height * 0.05 + offset + wave,
            geometry.width * 0.56, geometry.height * 0.55 + offset - wave,
            geometry.width * 1.08, geometry.height * 0.18 + offset,
        )
        context.strokeStyle = ribbon % 2 === 0 ? gradient(context, geometry) : geometry.secondary
        context.lineWidth = 1.2 + (ribbon * 0.7) + (geometry.parameters.depth / 80)
        context.globalAlpha = opacity(geometry, 0.12 + (ribbon * 0.02))
        context.stroke()
    }
    context.fillStyle = geometry.focus
    context.globalAlpha = opacity(geometry, 0.42)
    for (const point of geometry.points.slice(0, 12)) {
        const active = movingPoint(point, geometry, phase)
        context.beginPath()
        context.arc(active.x, active.y, 1.4 + (active.weight * 2), 0, TAU)
        context.fill()
    }
}

// F1 calm refactor: glacier quiet language + breathing horizon, giving calm its
// own rendered-operation grammar while staying the quietest complex scene.
// F3-T1 (owner #6): the original 1% horizon drift read as static on device —
// the horizon now visibly breathes and a soft veil drifts above it, still calm.
function drawCalm(context: CanvasContext, geometry: ComplexSceneGeometry, phase: number): void {
    drawGlacier(context, geometry, phase)
    const y = geometry.height * (0.68 + 0.035 * Math.sin(phase * 0.35))
    context.beginPath()
    context.moveTo(geometry.width * 0.12, y)
    context.lineTo(geometry.width * 0.88, y)
    context.stroke()
    const veilY = geometry.height * (0.3 + 0.06 * Math.sin(phase * 0.22 + 1.7))
    context.globalAlpha = opacity(geometry, 0.09)
    context.fillStyle = geometry.accent
    context.fillRect(geometry.width * 0.1, veilY, geometry.width * 0.8, geometry.height * 0.045)
}

function drawGlacier(context: CanvasContext, geometry: ComplexSceneGeometry, phase: number): void {
    const points = geometry.points.slice(0, geometry.mobile ? 16 : 24).map((point) => movingPoint(point, geometry, phase * 0.35))
    context.setLineDash([])
    context.lineWidth = 0.8 + (geometry.parameters.contrast / 130)
    context.strokeStyle = geometry.accent
    context.fillStyle = gradient(context, geometry, true)
    for (let index = 0; index < points.length - 2; index += 2) {
        context.globalAlpha = opacity(geometry, 0.07 + ((index % 5) * 0.018))
        context.beginPath()
        context.moveTo(points[index].x, points[index].y)
        context.lineTo(points[index + 1].x, points[index + 1].y)
        context.lineTo(points[index + 2].x, points[index + 2].y)
        context.closePath()
        context.fill()
        context.globalAlpha = opacity(geometry, 0.28)
        context.stroke()
    }
    const cutX = geometry.width * (0.5 + (Math.sin(phase * 0.4) * 0.08))
    context.strokeStyle = geometry.secondary
    context.globalAlpha = opacity(geometry, 0.55)
    context.lineWidth = 1.4
    context.setLineDash([2, 9])
    strokeLine(context, cutX, geometry.height * 0.07, cutX, geometry.height * 0.93)
}

function drawEmber(context: CanvasContext, geometry: ComplexSceneGeometry, phase: number): void {
    context.setLineDash([])
    context.shadowBlur = 10 + (geometry.parameters.trails / 2)
    context.shadowColor = geometry.danger
    const waves = geometry.mobile ? 5 : 8
    for (let wave = 0; wave < waves; wave += 1) {
        const y = geometry.height * (0.25 + (wave * 0.085))
        const amplitude = geometry.height * (0.018 + (wave * 0.004))
        context.beginPath()
        context.moveTo(0, y)
        for (let step = 1; step <= 12; step += 1) {
            const x = (geometry.width * step) / 12
            context.lineTo(x, y + (Math.sin(phase + (step * 0.65) + wave) * amplitude))
        }
        context.strokeStyle = wave % 2 === 0 ? geometry.danger : geometry.accent
        context.lineWidth = 0.8 + (wave * 0.2)
        context.globalAlpha = opacity(geometry, 0.13 + (wave * 0.015))
        context.stroke()
    }
    context.fillStyle = geometry.secondary
    context.globalAlpha = opacity(geometry, 0.48)
    for (const point of geometry.points.slice(0, 18)) {
        const rise = ((point.y - ((phase / TAU) * geometry.height * point.weight)) + geometry.height) % geometry.height
        context.fillRect(point.x, rise, 1.2 + (point.weight * 2), 3 + (point.weight * 5))
    }
    const centerX = geometry.width * 0.82
    const centerY = geometry.height * 0.23
    context.strokeStyle = geometry.success
    context.lineWidth = 2
    context.globalAlpha = opacity(geometry, 0.5)
    context.beginPath()
    context.arc(centerX, centerY, 18, -Math.PI / 2, -Math.PI / 2 + (((Math.sin(phase * 0.5) + 1) / 2) * TAU))
    context.stroke()
}

function drawAtlas(context: CanvasContext, geometry: ComplexSceneGeometry, phase: number): void {
    context.setLineDash([])
    context.strokeStyle = geometry.border
    context.lineWidth = 0.7
    const contours = geometry.mobile ? 7 : 10
    for (let contour = 0; contour < contours; contour += 1) {
        const baseY = geometry.height * (0.12 + (contour * 0.075))
        context.beginPath()
        context.moveTo(0, baseY)
        for (let step = 1; step <= 16; step += 1) {
            const x = (geometry.width * step) / 16
            const y = baseY + (Math.sin((step * 0.62) + phase + contour) * (8 + contour))
            context.lineTo(x, y)
        }
        context.globalAlpha = opacity(geometry, 0.12 + (contour * 0.008))
        context.stroke()
    }
    const route = geometry.points.slice(0, geometry.mobile ? 7 : 10).sort((left, right) => left.x - right.x)
    context.strokeStyle = gradient(context, geometry)
    context.lineWidth = 1.8
    context.globalAlpha = opacity(geometry, 0.52)
    context.setLineDash([8, 6])
    context.beginPath()
    route.forEach((point, index) => {
        const active = movingPoint(point, geometry, phase)
        if (index === 0) context.moveTo(active.x, active.y)
        else context.lineTo(active.x, active.y)
    })
    context.stroke()
    context.setLineDash([])
    context.fillStyle = geometry.accent
    for (const point of route) {
        const active = movingPoint(point, geometry, phase)
        context.beginPath()
        context.arc(active.x, active.y, 2.5 + (point.weight * 2.5), 0, TAU)
        context.fill()
    }
}

function drawNoir(context: CanvasContext, geometry: ComplexSceneGeometry, phase: number): void {
    const centerX = geometry.width * 0.58
    const centerY = geometry.height * 0.46
    const radius = Math.min(geometry.width, geometry.height) * 0.28
    context.save()
    context.translate(centerX, centerY)
    context.rotate(phase * 0.08)
    context.fillStyle = geometry.surface
    context.strokeStyle = geometry.accent
    context.lineWidth = 1
    for (let blade = 0; blade < 8; blade += 1) {
        const angle = (blade / 8) * TAU
        context.globalAlpha = opacity(geometry, 0.13 + ((blade % 2) * 0.05))
        context.beginPath()
        context.moveTo(Math.cos(angle) * radius * 0.32, Math.sin(angle) * radius * 0.32)
        context.lineTo(Math.cos(angle - 0.42) * radius, Math.sin(angle - 0.42) * radius)
        context.lineTo(Math.cos(angle + 0.22) * radius, Math.sin(angle + 0.22) * radius)
        context.closePath()
        context.fill()
        context.stroke()
    }
    context.restore()
    context.fillStyle = gradient(context, geometry)
    context.globalAlpha = opacity(geometry, 0.12)
    context.save()
    context.translate(geometry.width * 0.45, geometry.height * 0.45)
    context.rotate(-0.18 + (Math.sin(phase) * 0.03))
    context.fillRect(-geometry.width * 0.55, -22, geometry.width * 1.1, 44)
    context.restore()
    context.strokeStyle = geometry.secondary
    context.globalAlpha = opacity(geometry, 0.34)
    context.setLineDash([2, 7])
    context.strokeRect(geometry.width * 0.08, geometry.height * 0.1, geometry.width * 0.84, geometry.height * 0.8)
}

function drawSignal(context: CanvasContext, geometry: ComplexSceneGeometry, phase: number): void {
    context.setLineDash([])
    const waveColors = [geometry.accent, geometry.secondary, geometry.info]
    for (let wave = 0; wave < 3; wave += 1) {
        const centerY = geometry.height * (0.28 + (wave * 0.2))
        context.beginPath()
        context.moveTo(0, centerY)
        for (let step = 1; step <= 32; step += 1) {
            const x = (geometry.width * step) / 32
            const envelope = 0.35 + (Math.sin((step / 32) * Math.PI) * 0.65)
            const y = centerY + (Math.sin((step * (0.5 + (wave * 0.14))) + phase + wave) * geometry.height * 0.055 * envelope)
            context.lineTo(x, y)
        }
        context.strokeStyle = waveColors[wave]
        context.lineWidth = 1 + (wave * 0.45)
        context.globalAlpha = opacity(geometry, 0.34 - (wave * 0.05))
        context.stroke()
    }
    const radarX = geometry.width * 0.78
    const radarY = geometry.height * 0.28
    const radarRadius = Math.min(geometry.width, geometry.height) * 0.13
    context.strokeStyle = geometry.accent
    context.globalAlpha = opacity(geometry, 0.28)
    for (let ring = 1; ring <= 3; ring += 1) {
        context.beginPath()
        context.arc(radarX, radarY, (radarRadius * ring) / 3, 0, TAU)
        context.stroke()
    }
    context.strokeStyle = gradient(context, geometry)
    context.lineWidth = 2
    const sweep = phase * 0.7
    strokeLine(context, radarX, radarY, radarX + (Math.cos(sweep) * radarRadius), radarY + (Math.sin(sweep) * radarRadius))
}

function drawViolet(context: CanvasContext, geometry: ComplexSceneGeometry, phase: number): void {
    const points = geometry.points.slice(0, geometry.mobile ? 15 : 24).map((point) => movingPoint(point, geometry, phase))
    context.setLineDash([])
    context.strokeStyle = gradient(context, geometry)
    context.lineWidth = 0.9 + (geometry.parameters.depth / 120)
    context.globalAlpha = opacity(geometry, 0.25)
    for (let index = 0; index < points.length; index += 1) {
        const from = points[index]
        const to = points[(index + 7) % points.length]
        context.beginPath()
        context.moveTo(from.x, from.y)
        context.quadraticCurveTo(
            geometry.width * (0.5 + (Math.sin(phase + index) * 0.1)),
            geometry.height * (0.5 + (Math.cos(phase + index) * 0.12)),
            to.x,
            to.y,
        )
        context.stroke()
    }
    for (let index = 0; index < points.length; index += 1) {
        const point = points[index]
        context.fillStyle = index % 3 === 0 ? geometry.secondary : geometry.accent
        context.globalAlpha = opacity(geometry, 0.36 + ((index % 4) * 0.04))
        context.beginPath()
        context.arc(point.x, point.y, 2 + (geometry.points[index].weight * 4), 0, TAU)
        context.fill()
        if (index % 5 === 0) {
            context.strokeStyle = geometry.focus
            context.beginPath()
            context.arc(point.x, point.y, 8 + (Math.sin(phase + index) * 2), 0, TAU)
            context.stroke()
        }
    }
}

function drawClaudius(context: CanvasContext, geometry: ComplexSceneGeometry, phase: number): void {
    context.setLineDash([])
    context.strokeStyle = geometry.border
    context.lineWidth = 0.8
    context.globalAlpha = opacity(geometry, 0.24)
    const columns = geometry.mobile ? 1 : 2
    for (let column = 0; column < columns; column += 1) {
        const left = geometry.width * (columns === 1 ? 0.14 : 0.1 + (column * 0.46))
        const width = geometry.width * (columns === 1 ? 0.72 : 0.36)
        context.strokeRect(left, geometry.height * 0.1, width, geometry.height * 0.78)
        for (let line = 0; line < 13; line += 1) {
            const y = geometry.height * (0.16 + (line * 0.05))
            const lineWidth = width * (0.45 + (((line * 29) % 47) / 100))
            strokeLine(context, left + 14, y, left + 14 + lineWidth, y)
        }
    }
    context.strokeStyle = geometry.accent
    context.lineWidth = 1.5
    context.globalAlpha = opacity(geometry, 0.5)
    context.setLineDash([4, 4])
    for (let mark = 0; mark < 6; mark += 1) {
        const x = geometry.width * (columns === 1 ? 0.1 : mark % 2 === 0 ? 0.07 : 0.91)
        const y = geometry.height * (0.18 + (mark * 0.105))
        context.beginPath()
        context.moveTo(x + (mark % 2 === 0 ? 9 : -9), y - 7)
        context.lineTo(x, y)
        context.lineTo(x + (mark % 2 === 0 ? 9 : -9), y + 7)
        context.stroke()
    }
    const sweepX = geometry.width * (0.1 + (((Math.sin(phase * 0.45) + 1) / 2) * 0.8))
    context.fillStyle = gradient(context, geometry, true)
    context.globalAlpha = opacity(geometry, 0.08)
    context.fillRect(sweepX - 18, geometry.height * 0.08, 36, geometry.height * 0.82)
}

function drawBasicus(context: CanvasContext, geometry: ComplexSceneGeometry, phase: number): void {
    const columns = geometry.mobile ? 3 : 5
    const rows = geometry.mobile ? 5 : 4
    const gap = geometry.mobile ? 10 : 16
    const tileWidth = (geometry.width - (gap * (columns + 1))) / columns
    const tileHeight = (geometry.height * 0.66 - (gap * (rows + 1))) / rows
    context.setLineDash([])
    for (let row = 0; row < rows; row += 1) {
        for (let column = 0; column < columns; column += 1) {
            const index = (row * columns) + column
            const lift = Math.sin(phase + (index * 0.6)) * (geometry.parameters.depth / 18)
            const x = gap + (column * (tileWidth + gap))
            const y = geometry.height * 0.14 + gap + (row * (tileHeight + gap)) + lift
            context.fillStyle = index % 3 === 0 ? geometry.surface : gradient(context, geometry)
            context.strokeStyle = index % 4 === 0 ? geometry.accent : geometry.border
            context.globalAlpha = opacity(geometry, 0.12 + ((index % 4) * 0.035))
            context.shadowBlur = 4 + Math.max(0, lift)
            context.shadowColor = geometry.accent
            context.fillRect(x, y, tileWidth, tileHeight)
            context.strokeRect(x, y, tileWidth, tileHeight)
            if (column < columns - 1) {
                context.globalAlpha = opacity(geometry, 0.24)
                strokeLine(context, x + tileWidth, y + (tileHeight / 2), x + tileWidth + gap, y + (tileHeight / 2))
            }
        }
    }
    const rippleX = geometry.width * 0.72
    const rippleY = geometry.height * 0.84
    context.strokeStyle = geometry.secondary
    context.globalAlpha = opacity(geometry, 0.36)
    for (let ring = 1; ring <= 3; ring += 1) {
        context.beginPath()
        context.arc(rippleX, rippleY, 8 + (ring * 10) + (Math.sin(phase) * 3), 0, TAU)
        context.stroke()
    }
}

function drawTelemetry(context: CanvasContext, geometry: ComplexSceneGeometry, phase: number): void {
    context.setLineDash([])
    const rulerRows = geometry.mobile ? 2 : 3
    for (let row = 0; row < rulerRows; row += 1) {
        const baseY = geometry.height * (0.22 + (row * 0.26))
        context.strokeStyle = row === 0 ? geometry.accent : geometry.secondary
        context.lineWidth = 1
        context.globalAlpha = opacity(geometry, 0.3 - (row * 0.05))
        strokeLine(context, geometry.width * 0.04, baseY, geometry.width * 0.96, baseY)
        const tickCount = geometry.mobile ? 18 : 30
        for (let tick = 0; tick <= tickCount; tick += 1) {
            const x = geometry.width * (0.04 + (0.92 * tick) / tickCount)
            const tall = tick % 5 === 0
            const sway = Math.sin(phase + (tick * 0.35) + row) * geometry.height * 0.004
            const tickHeight = (tall ? geometry.height * 0.028 : geometry.height * 0.013) + sway
            strokeLine(context, x, baseY, x, baseY - tickHeight)
        }
    }
    context.strokeStyle = gradient(context, geometry)
    context.lineWidth = 1.4
    context.globalAlpha = opacity(geometry, 0.4)
    const traceY = geometry.height * 0.55
    context.beginPath()
    context.moveTo(geometry.width * 0.04, traceY)
    const steps = geometry.mobile ? 20 : 36
    for (let step = 1; step <= steps; step += 1) {
        const x = geometry.width * (0.04 + (0.92 * step) / steps)
        const carrier = Math.sin((step * 0.42) + phase) * geometry.height * 0.045
        const burst = Math.sin((step * 1.7) + (phase * 1.6)) * geometry.height * 0.012
        context.lineTo(x, traceY + carrier + burst)
    }
    context.stroke()
    const nodeCount = geometry.mobile ? 3 : 5
    context.fillStyle = geometry.accent
    for (let node = 0; node < nodeCount; node += 1) {
        const x = geometry.width * (0.12 + (node * 0.19))
        const y = traceY + (Math.sin((node * 2.1) + phase) * geometry.height * 0.05)
        context.globalAlpha = opacity(geometry, 0.5)
        context.beginPath()
        context.arc(x, y, 1.6 + ((node % 2) * 0.8), 0, TAU)
        context.fill()
    }
}

const DRAWERS: Readonly<Record<TalosMotionSceneId, (context: CanvasContext, geometry: ComplexSceneGeometry, phase: number) => void>> = Object.freeze({
    forge: drawForge,
    paper: drawPaper,
    terminal: drawTerminal,
    aurora: drawAurora,
    glacier: drawGlacier,
    calm: drawCalm,
    ember: drawEmber,
    atlas: drawAtlas,
    noir: drawNoir,
    signal: drawSignal,
    violet: drawViolet,
    claudius: drawClaudius,
    basicus: drawBasicus,
    telemetry: drawTelemetry,
})

export function createComplexDefinition(
    id: TalosMotionSceneId,
    sourceGlyphs: readonly ComplexGlyph[],
): ComplexSceneDefinition<ComplexSceneState, ComplexSceneGeometry> {
    return Object.freeze({
        id,
        createState: (seed: number): ComplexSceneState => {
            const seeded = random(seed ^ sceneHash(id))
            return { seed, phase: seeded() * TAU, drift: 0.42 + (seeded() * 0.44) }
        },
        prepare: ({ state, input }): { geometry: ComplexSceneGeometry; primitiveCount: number } => {
            const seeded = random(state.seed ^ sceneHash(id))
            const active = input.palette[input.colorMode]
            const mobile = input.viewport.width < 600
            const tierTarget = input.effectiveQuality.tier === 'high' ? 56 : input.effectiveQuality.tier === 'balanced' ? 38 : 24
            const densityFactor = 0.72 + ((input.parameters.density / 100) * 0.28 * input.effectiveQuality.densityScale)
            const pointCount = Math.max(24, Math.round(tierTarget * densityFactor))
            const points = Object.freeze(Array.from({ length: pointCount }, () => Object.freeze({
                x: seeded() * input.viewport.width,
                y: seeded() * input.viewport.height,
                weight: 0.25 + (seeded() * 0.75),
                phase: seeded() * TAU,
            })))
            const glyphs = Object.freeze(sourceGlyphs.map((glyph) => Object.freeze({
                ...glyph,
                x: (glyph.x / 100) * input.viewport.width,
                y: (glyph.y / 100) * input.viewport.height,
                width: Math.max(1, (glyph.width / 100) * input.viewport.width),
                height: Math.max(1, (glyph.height / 100) * input.viewport.height),
            })))
            const parameters = Object.freeze({ ...input.parameters })
            const geometry = Object.freeze({
                id,
                width: input.viewport.width,
                height: input.viewport.height,
                mobile,
                accent: active.accent,
                secondary: active.secondary,
                border: active.border_strong,
                surface: active.surface_elevated,
                focus: active.focus,
                info: active.info,
                success: active.success,
                danger: active.danger,
                parameters,
                glyphs,
                points,
            })
            const primitiveCount = 24
                + (points.length * 3)
                + glyphs.reduce((total, glyph) => total + SHAPE_COST[glyph.kind], 0)
            return Object.freeze({ geometry, primitiveCount })
        },
        update: ({ state, input, stepMs }): void => {
            state.phase = (state.phase + ((stepMs / 1_000) * (input.parameters.speed / 100) * state.drift)) % TAU
        },
        draw: ({ context: rawContext, state, geometry }): void => {
            const context = rawContext as CanvasContext
            context.save()
            context.clearRect(0, 0, geometry.width, geometry.height)
            context.shadowBlur = 0
            context.shadowColor = 'transparent'
            drawFoundation(context, geometry, state.phase)
            DRAWERS[id](context, geometry, state.phase)
            context.restore()
        },
    })
}
