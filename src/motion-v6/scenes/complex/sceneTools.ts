import type { TalosMotionSceneId } from '../../contracts'
import type { SceneInput } from '../../sceneRegistry'
import type { ComplexSceneDefinition } from '../../renderers/complexRenderer'

/**
 * TALOS V3 shared substrate.
 *
 * This file contains ONLY deterministic math, quality scaling and tiny Canvas2D
 * primitives. It deliberately contains no theme composition, no scene grammar
 * and no reusable "art recipe". Every theme owns state, prepared topology,
 * temporal law and draw order in its own module.
 */

export type GradientLike = { addColorStop: (offset: number, color: string) => void }

export type CanvasContext = {
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
    fillText?: (text: string, x: number, y: number) => void
    globalAlpha: number
    lineWidth: number
    strokeStyle: string | GradientLike
    fillStyle: string | GradientLike
    shadowBlur: number
    shadowColor: string
    font?: string
    textAlign?: string
    textBaseline?: string
    globalCompositeOperation?: string
    lineCap?: string
    lineJoin?: string
}

export type ScenePaletteGeometry = Readonly<{
    id: TalosMotionSceneId
    width: number
    height: number
    mobile: boolean
    accent: string
    secondary: string
    border: string
    surface: string
    background: string
    focus: string
    info: string
    success: string
    warning: string
    danger: string
    parameters: Readonly<SceneInput['parameters']>
    quality: SceneInput['effectiveQuality']['tier']
    densityScale: number
    seed: number
}>

export type Point = Readonly<{ x: number; y: number }>
export const TAU = Math.PI * 2
export const PHI = (1 + Math.sqrt(5)) / 2
export const GOLDEN_ANGLE = TAU * (1 - 1 / PHI)

export function clamp(value: number, minimum: number, maximum: number): number {
    return Math.max(minimum, Math.min(maximum, value))
}

export function mix(a: number, b: number, t: number): number {
    return a + (b - a) * t
}

export function invLerp(a: number, b: number, value: number): number {
    return clamp((value - a) / Math.max(1e-9, b - a), 0, 1)
}

export function smoothstep(a: number, b: number, value: number): number {
    const t = invLerp(a, b, value)
    return t * t * (3 - 2 * t)
}

export function smootherstep(a: number, b: number, value: number): number {
    const t = invLerp(a, b, value)
    return t * t * t * (t * (t * 6 - 15) + 10)
}

export function fract(value: number): number {
    return value - Math.floor(value)
}

export function wrap(value: number, maximum: number): number {
    const result = value % maximum
    return result < 0 ? result + maximum : result
}

export function sceneHash(id: TalosMotionSceneId): number {
    let hash = 0x811c9dc5
    for (const character of id) {
        hash ^= character.charCodeAt(0)
        hash = Math.imul(hash, 0x01000193)
    }
    return hash >>> 0
}

export function random(seed: number): () => number {
    let value = seed >>> 0
    return () => {
        value += 0x6d2b79f5
        let result = value
        result = Math.imul(result ^ (result >>> 15), result | 1)
        result ^= result + Math.imul(result ^ (result >>> 7), result | 61)
        return ((result ^ (result >>> 14)) >>> 0) / 4_294_967_296
    }
}

export function rngFor(id: TalosMotionSceneId, seed: number, salt = 0): () => number {
    return random((seed ^ sceneHash(id) ^ Math.imul(salt + 1, 0x9e3779b9)) >>> 0)
}

export function hash01(a: number, b: number, c = 0): number {
    let value = (Math.imul(a | 0, 0x45d9f3b) ^ Math.imul(b | 0, 0x119de1f3) ^ Math.imul(c | 0, 0x344b1d)) >>> 0
    value = Math.imul(value ^ (value >>> 16), 0x45d9f3b)
    value = Math.imul(value ^ (value >>> 16), 0x45d9f3b)
    return ((value ^ (value >>> 16)) >>> 0) / 4_294_967_296
}

export function noise1(value: number, seed = 0): number {
    const i = Math.floor(value)
    const f = fract(value)
    const a = hash01(i, seed)
    const b = hash01(i + 1, seed)
    return mix(a, b, f * f * (3 - 2 * f))
}

export function noise2(x: number, y: number, seed = 0): number {
    const ix = Math.floor(x), iy = Math.floor(y)
    const fx = fract(x), fy = fract(y)
    const sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy)
    const a = mix(hash01(ix, iy, seed), hash01(ix + 1, iy, seed), sx)
    const b = mix(hash01(ix, iy + 1, seed), hash01(ix + 1, iy + 1, seed), sx)
    return mix(a, b, sy)
}

export function fbm2(x: number, y: number, seed = 0, octaves = 4): number {
    let sum = 0, amplitude = 0.5, frequency = 1, total = 0
    for (let octave = 0; octave < octaves; octave += 1) {
        sum += noise2(x * frequency, y * frequency, seed + octave * 101) * amplitude
        total += amplitude
        frequency *= 2.03
        amplitude *= 0.5
    }
    return total > 0 ? sum / total : 0
}

export function makePaletteGeometry(id: TalosMotionSceneId, stateSeed: number, input: SceneInput): ScenePaletteGeometry {
    const active = input.palette[input.colorMode]
    return Object.freeze({
        id,
        width: input.viewport.width,
        height: input.viewport.height,
        mobile: input.viewport.width < 600,
        accent: active.accent,
        secondary: active.secondary,
        border: active.border_strong,
        surface: active.surface_elevated,
        background: active.background,
        focus: active.focus,
        info: active.info,
        success: active.success,
        warning: active.warning,
        danger: active.danger,
        parameters: Object.freeze({ ...input.parameters }),
        quality: input.effectiveQuality.tier,
        densityScale: input.effectiveQuality.densityScale,
        seed: stateSeed,
    })
}

export function alpha(geometry: ScenePaletteGeometry, base: number): number {
    const intensity = 0.32 + geometry.parameters.intensity / 100 * 0.8
    const contrast = 0.7 + geometry.parameters.contrast / 100 * 0.46
    return clamp(base * intensity * contrast, 0.006, 0.94)
}

export function qCount(geometry: ScenePaletteGeometry, low: number, balanced: number, high: number): number {
    const base = geometry.quality === 'high' ? high : geometry.quality === 'low' ? low : balanced
    const mobile = geometry.mobile ? 0.78 : 1
    const density = clamp(geometry.densityScale * (0.72 + geometry.parameters.density / 360), 0.48, 1.38)
    return Math.max(2, Math.round(base * mobile * density))
}

export function primitiveCount(input: SceneInput, low: number, balanced: number, high: number): number {
    return input.effectiveQuality.tier === 'high' ? high : input.effectiveQuality.tier === 'low' ? low : balanced
}

export function seconds(stepMs: number): number {
    return clamp(stepMs / 1000, 0, 0.05)
}

export function linearGradient(
    context: CanvasContext,
    geometry: ScenePaletteGeometry,
    x0: number,
    y0: number,
    x1: number,
    y1: number,
    colors: readonly string[] = [geometry.accent, geometry.secondary],
): GradientLike {
    const gradient = context.createLinearGradient(x0, y0, x1, y1)
    gradient.addColorStop(0, 'transparent')
    colors.forEach((color, index) => gradient.addColorStop((index + 1) / (colors.length + 1), color))
    gradient.addColorStop(1, 'transparent')
    return gradient
}

export function radialGradient(context: CanvasContext, x: number, y: number, radius: number, inner: string, middle: string): GradientLike {
    const gradient = context.createRadialGradient(x, y, 0, x, y, radius)
    gradient.addColorStop(0, inner)
    gradient.addColorStop(0.38, middle)
    gradient.addColorStop(1, 'transparent')
    return gradient
}

export function strokeLine(context: CanvasContext, x0: number, y0: number, x1: number, y1: number): void {
    context.beginPath(); context.moveTo(x0, y0); context.lineTo(x1, y1); context.stroke()
}

export function polyline(context: CanvasContext, points: readonly Point[], close = false): void {
    if (points.length === 0) return
    context.beginPath(); context.moveTo(points[0].x, points[0].y)
    for (let index = 1; index < points.length; index += 1) context.lineTo(points[index].x, points[index].y)
    if (close) context.closePath()
}

export function polygon(context: CanvasContext, points: readonly Point[]): void {
    polyline(context, points, true)
}

export function drawDiamond(context: CanvasContext, x: number, y: number, radius: number): void {
    context.beginPath(); context.moveTo(x, y - radius); context.lineTo(x + radius, y)
    context.lineTo(x, y + radius); context.lineTo(x - radius, y); context.closePath()
}

export function ringPoints(cx: number, cy: number, radius: number, count: number, phase = 0, warp = 0): Point[] {
    return Array.from({ length: count }, (_, index) => {
        const angle = phase + (index / count) * TAU
        const r = radius * (1 + warp * Math.sin(angle * 3 + phase * 0.7))
        return { x: cx + Math.cos(angle) * r, y: cy + Math.sin(angle) * r }
    })
}

export function defineScene<State, Geometry>(definition: ComplexSceneDefinition<State, Geometry>): ComplexSceneDefinition<State, Geometry> {
    return Object.freeze(definition)
}
