import { onBeforeUnmount, onMounted, watch, type Ref } from 'vue'
import type { TalosBackgroundEffect, TalosThemeMotionMode } from '../lib/talosThemes'

function cssVariable(element: HTMLElement, name: string, fallback: string) {
    return window.getComputedStyle(element).getPropertyValue(name).trim() || fallback
}

function motionScale(mode: TalosThemeMotionMode) {
    if (mode === 'cinematic') {
        return 1.7
    }

    if (mode === 'subtle') {
        return 0.72
    }

    return 1
}

function boundedAlpha(value: number) {
    return Math.min(0.92, Math.max(0.04, value))
}

function resizeCanvas(canvas: HTMLCanvasElement) {
    const rect = canvas.getBoundingClientRect()
    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    const width = Math.max(1, Math.floor(rect.width * dpr))
    const height = Math.max(1, Math.floor(rect.height * dpr))

    if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width
        canvas.height = height
    }

    return { width, height, dpr }
}

function drawGrid(ctx: CanvasRenderingContext2D, width: number, height: number, accent: string, scale: number, time: number) {
    const gap = Math.max(20, 32 / scale)
    ctx.save()
    ctx.globalAlpha = boundedAlpha(0.2 * scale)
    ctx.strokeStyle = accent
    ctx.lineWidth = Math.max(1.2, 1.45 * scale)
    const offset = (time * 0.018 * scale) % gap
    for (let x = -gap; x < width + gap; x += gap) {
        ctx.beginPath()
        ctx.moveTo(x + offset, 0)
        ctx.lineTo(x + offset, height)
        ctx.stroke()
    }
    for (let y = -gap; y < height + gap; y += gap) {
        ctx.beginPath()
        ctx.moveTo(0, y + offset)
        ctx.lineTo(width, y + offset)
        ctx.stroke()
    }
    ctx.restore()
}

function drawTraceRain(ctx: CanvasRenderingContext2D, width: number, height: number, accent: string, secondary: string, scale: number, time: number) {
    const lanes = Math.max(14, Math.floor(20 * scale))
    ctx.save()
    ctx.lineCap = 'round'
    ctx.globalCompositeOperation = 'lighter'
    for (let index = 0; index < lanes; index += 1) {
        const x = (width / (lanes + 1)) * (index + 1)
        const y = ((time * (0.105 + index * 0.008) * scale) + index * 84) % (height + 260) - 130
        const color = index % 2 === 0 ? accent : secondary

        ctx.shadowBlur = 18 * scale
        ctx.shadowColor = color
        ctx.globalAlpha = boundedAlpha(0.18 * scale)
        ctx.lineWidth = Math.max(7, 7.5 * scale)
        ctx.strokeStyle = color
        ctx.beginPath()
        ctx.moveTo(x, y - 132)
        ctx.lineTo(x, y + 132)
        ctx.stroke()

        ctx.globalAlpha = boundedAlpha(0.74 * scale)
        ctx.lineWidth = Math.max(2.4, 2.2 * scale)
        ctx.strokeStyle = color
        ctx.beginPath()
        ctx.moveTo(x, y - 130)
        ctx.lineTo(x, y + 130)
        ctx.stroke()

        ctx.globalAlpha = boundedAlpha(0.86 * scale)
        ctx.lineWidth = Math.max(1, scale)
        ctx.strokeStyle = '#f7fff8'
        ctx.beginPath()
        ctx.moveTo(x, y - 22)
        ctx.lineTo(x, y + 22)
        ctx.stroke()

        ctx.globalAlpha = boundedAlpha(0.88 * scale)
        ctx.fillStyle = '#f7fff8'
        ctx.beginPath()
        ctx.arc(x, y, Math.max(2, 2.8 * scale), 0, Math.PI * 2)
        ctx.fill()
    }
    ctx.restore()
}

function drawDagFlow(ctx: CanvasRenderingContext2D, width: number, height: number, accent: string, secondary: string, scale: number, time: number) {
    const nodes = [
        [0.18, 0.32],
        [0.42, 0.24],
        [0.58, 0.48],
        [0.78, 0.36],
        [0.68, 0.68],
        [0.34, 0.62],
        [0.84, 0.72],
    ]
    const edges = [
        [0, 1],
        [1, 2],
        [2, 3],
        [2, 4],
        [0, 5],
        [5, 4],
        [4, 6],
        [3, 6],
        [1, 5],
    ]
    ctx.save()
    ctx.lineCap = 'round'
    ctx.lineWidth = Math.max(3.4, 3.8 * scale)
    ctx.shadowBlur = 16 * scale
    ctx.shadowColor = accent
    ctx.strokeStyle = accent
    for (const [from, to] of edges) {
        ctx.globalAlpha = boundedAlpha(0.3 * scale)
        ctx.lineWidth = Math.max(6, 6.4 * scale)
        ctx.beginPath()
        ctx.moveTo(nodes[from][0] * width, nodes[from][1] * height)
        ctx.lineTo(nodes[to][0] * width, nodes[to][1] * height)
        ctx.stroke()

        ctx.globalAlpha = boundedAlpha(0.62 * scale)
        ctx.lineWidth = Math.max(3.4, 3.8 * scale)
        ctx.beginPath()
        ctx.moveTo(nodes[from][0] * width, nodes[from][1] * height)
        ctx.lineTo(nodes[to][0] * width, nodes[to][1] * height)
        ctx.stroke()
    }
    const pulse = (Math.sin(time * 0.004 * scale) + 1) / 2
    for (const [x, y] of nodes) {
        ctx.beginPath()
        ctx.globalAlpha = boundedAlpha(0.78 * scale)
        ctx.shadowBlur = 20 * scale
        ctx.shadowColor = secondary
        ctx.fillStyle = secondary
        ctx.arc(x * width, y * height, (5.5 + pulse * 6) * scale, 0, Math.PI * 2)
        ctx.fill()
    }
    ctx.restore()
}

function drawSignalMesh(ctx: CanvasRenderingContext2D, width: number, height: number, accent: string, secondary: string, scale: number, time: number) {
    const points = 24
    const coords = Array.from({ length: points }, (_, index) => {
        const angle = index * 1.618
        const x = width * (0.18 + ((Math.sin(angle) + 1) * 0.32))
        const y = height * (0.18 + ((Math.cos(angle * 1.7) + 1) * 0.32))
        return [
            x + Math.sin(time * 0.0015 * scale + index) * 18 * scale,
            y + Math.cos(time * 0.0012 * scale + index) * 14 * scale,
        ]
    })

    ctx.save()
    ctx.globalCompositeOperation = 'lighter'
    ctx.lineWidth = Math.max(1.8, 2.1 * scale)
    ctx.lineCap = 'round'
    ctx.shadowBlur = 14 * scale
    ctx.shadowColor = accent
    ctx.strokeStyle = accent
    ctx.fillStyle = secondary
    coords.forEach(([x, y], index) => {
        for (let next = index + 1; next < coords.length; next += 1) {
            const [nx, ny] = coords[next]
            const distance = Math.hypot(nx - x, ny - y)
            if (distance < 320 * scale) {
                ctx.globalAlpha = boundedAlpha((1 - distance / (320 * scale)) * 0.68 * scale)
                ctx.beginPath()
                ctx.moveTo(x, y)
                ctx.lineTo(nx, ny)
                ctx.stroke()
            }
        }
        ctx.globalAlpha = boundedAlpha(0.82 * scale)
        ctx.shadowBlur = 18 * scale
        ctx.shadowColor = secondary
        ctx.beginPath()
        ctx.arc(x, y, Math.max(4, 4.8 * scale), 0, Math.PI * 2)
        ctx.fill()
    })
    ctx.restore()
}

function drawKahnGrid(ctx: CanvasRenderingContext2D, width: number, height: number, accent: string, scale: number, time: number) {
    const lanes = 9
    ctx.save()
    ctx.lineCap = 'round'
    ctx.lineWidth = Math.max(2.8, 3 * scale)
    ctx.shadowBlur = 16 * scale
    ctx.shadowColor = accent
    for (let lane = 0; lane < lanes; lane += 1) {
        const y = (height / (lanes + 1)) * (lane + 1)
        const offset = (time * 0.035 * scale + lane * 80) % width
        ctx.globalAlpha = boundedAlpha(0.28 * scale)
        ctx.strokeStyle = accent
        ctx.beginPath()
        ctx.moveTo(0, y)
        ctx.lineTo(width, y)
        ctx.stroke()
        ctx.globalAlpha = boundedAlpha(0.72 * scale)
        ctx.fillStyle = accent
        ctx.fillRect(offset - 68, y - 6, 136, 12)
    }
    ctx.restore()
}

export function useTalosProceduralCanvas(
    canvas: Ref<HTMLCanvasElement | null>,
    effect: Ref<TalosBackgroundEffect>,
    motion: Ref<TalosThemeMotionMode>,
    reducedMotion: Ref<boolean>,
) {
    let frame = 0

    function stop() {
        if (frame) {
            window.cancelAnimationFrame(frame)
            frame = 0
        }
    }

    function draw(time = 0) {
        const element = canvas.value
        if (!element || effect.value === 'none' || motion.value === 'off' || reducedMotion.value) {
            stop()
            return
        }

        const context = element.getContext('2d')
        if (!context) {
            stop()
            return
        }

        const { width, height } = resizeCanvas(element)
        const scale = motionScale(motion.value)
        const accent = cssVariable(element, '--talos-accent', '#c98b32')
        const secondary = cssVariable(element, '--talos-node', '#6ad4d4')

        context.clearRect(0, 0, width, height)
        context.save()
        context.globalAlpha = boundedAlpha(0.055 * scale)
        context.fillStyle = accent
        context.fillRect(0, 0, width, height)
        context.restore()

        drawGrid(context, width, height, accent, scale, time)

        if (effect.value === 'trace-rain') {
            drawTraceRain(context, width, height, accent, secondary, scale, time)
        } else if (effect.value === 'dag-flow') {
            drawDagFlow(context, width, height, accent, secondary, scale, time)
        } else if (effect.value === 'kahn-grid') {
            drawKahnGrid(context, width, height, accent, scale, time)
        } else if (effect.value === 'signal-mesh') {
            drawSignalMesh(context, width, height, accent, secondary, scale, time)
        }

        frame = window.requestAnimationFrame(draw)
    }

    function restart() {
        stop()
        frame = window.requestAnimationFrame(draw)
    }

    onMounted(() => {
        restart()
        window.addEventListener('resize', restart)
    })

    onBeforeUnmount(() => {
        stop()
        window.removeEventListener('resize', restart)
    })

    watch([effect, motion, reducedMotion], restart)

    return {
        restart,
        stop,
    }
}
