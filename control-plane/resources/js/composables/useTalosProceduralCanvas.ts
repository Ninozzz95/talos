import { onBeforeUnmount, onMounted, watch, type Ref } from 'vue'
import type { TalosBackgroundEffect, TalosThemeMotionMode } from '../lib/talosThemes'

function cssVariable(element: HTMLElement, name: string, fallback: string) {
    return window.getComputedStyle(element).getPropertyValue(name).trim() || fallback
}

function motionScale(mode: TalosThemeMotionMode) {
    if (mode === 'cinematic') {
        return 1.55
    }

    if (mode === 'subtle') {
        return 0.62
    }

    return 1
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
    const gap = Math.max(26, 42 / scale)
    ctx.save()
    ctx.globalAlpha = 0.08 * scale
    ctx.strokeStyle = accent
    ctx.lineWidth = 1
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
    const lanes = Math.floor(8 * scale)
    ctx.save()
    ctx.lineWidth = Math.max(1, scale)
    for (let index = 0; index < lanes; index += 1) {
        const x = (width / (lanes + 1)) * (index + 1)
        const y = ((time * (0.09 + index * 0.007) * scale) + index * 80) % (height + 180) - 90
        const gradient = ctx.createLinearGradient(x, y - 90, x, y + 90)
        gradient.addColorStop(0, 'transparent')
        gradient.addColorStop(0.45, index % 2 === 0 ? accent : secondary)
        gradient.addColorStop(1, 'transparent')
        ctx.globalAlpha = 0.22 * scale
        ctx.strokeStyle = gradient
        ctx.beginPath()
        ctx.moveTo(x, y - 90)
        ctx.lineTo(x, y + 90)
        ctx.stroke()
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
    ]
    ctx.save()
    ctx.lineWidth = 2 * scale
    ctx.globalAlpha = 0.24 * scale
    ctx.strokeStyle = accent
    for (let index = 0; index < nodes.length - 1; index += 1) {
        ctx.beginPath()
        ctx.moveTo(nodes[index][0] * width, nodes[index][1] * height)
        ctx.lineTo(nodes[index + 1][0] * width, nodes[index + 1][1] * height)
        ctx.stroke()
    }
    const pulse = (Math.sin(time * 0.004 * scale) + 1) / 2
    for (const [x, y] of nodes) {
        ctx.beginPath()
        ctx.globalAlpha = 0.42 * scale
        ctx.fillStyle = secondary
        ctx.arc(x * width, y * height, (4 + pulse * 5) * scale, 0, Math.PI * 2)
        ctx.fill()
    }
    ctx.restore()
}

function drawSignalMesh(ctx: CanvasRenderingContext2D, width: number, height: number, accent: string, secondary: string, scale: number, time: number) {
    const points = 14
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
    ctx.lineWidth = 1
    ctx.strokeStyle = accent
    ctx.fillStyle = secondary
    coords.forEach(([x, y], index) => {
        for (let next = index + 1; next < coords.length; next += 1) {
            const [nx, ny] = coords[next]
            const distance = Math.hypot(nx - x, ny - y)
            if (distance < 190 * scale) {
                ctx.globalAlpha = Math.max(0.04, (1 - distance / (190 * scale)) * 0.22 * scale)
                ctx.beginPath()
                ctx.moveTo(x, y)
                ctx.lineTo(nx, ny)
                ctx.stroke()
            }
        }
        ctx.globalAlpha = 0.32 * scale
        ctx.beginPath()
        ctx.arc(x, y, 2.5 * scale, 0, Math.PI * 2)
        ctx.fill()
    })
    ctx.restore()
}

function drawKahnGrid(ctx: CanvasRenderingContext2D, width: number, height: number, accent: string, scale: number, time: number) {
    const lanes = 6
    ctx.save()
    ctx.lineWidth = 2
    for (let lane = 0; lane < lanes; lane += 1) {
        const y = (height / (lanes + 1)) * (lane + 1)
        const offset = (time * 0.035 * scale + lane * 80) % width
        ctx.globalAlpha = 0.12 * scale
        ctx.strokeStyle = accent
        ctx.beginPath()
        ctx.moveTo(0, y)
        ctx.lineTo(width, y)
        ctx.stroke()
        ctx.globalAlpha = 0.34 * scale
        ctx.fillStyle = accent
        ctx.fillRect(offset - 44, y - 3, 88, 6)
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
        context.globalAlpha = 0.04 * scale
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
