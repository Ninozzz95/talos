import {
    TAU, alpha, defineScene, drawDiamond, hash01, linearGradient, makePaletteGeometry,
    primitiveCount, qCount, radialGradient, rngFor, seconds, strokeLine,
    type CanvasContext, type ScenePaletteGeometry,
} from './sceneTools'

type ForgeState = { seed: number; time: number; cycle: number; impulse: number }
type ForgeNode = Readonly<{ x: number; y: number; rank: number; heat: number; size: number }>
type ForgeEdge = Readonly<{ from: number; to: number; bow: number; lane: number }>
type ForgeGear = Readonly<{ x: number; y: number; radius: number; teeth: number; direction: number; phase: number }>
type ForgeGeometry = ScenePaletteGeometry & Readonly<{
    nodes: readonly ForgeNode[]
    edges: readonly ForgeEdge[]
    gears: readonly ForgeGear[]
    rails: readonly number[]
}>

export const forgeComplexScene = defineScene<ForgeState, ForgeGeometry>({
    id: 'forge',
    createState: (seed) => ({ seed, time: 0, cycle: 0, impulse: 0 }),
    prepare: ({ state, input }) => {
        const base = makePaletteGeometry('forge', state.seed, input)
        const rng = rngFor('forge', state.seed, 101)
        const rankCount = qCount(base, 4, 5, 6)
        const nodes: ForgeNode[] = []
        for (let rank = 0; rank < rankCount; rank += 1) {
            const inRank = rank === 0 || rank === rankCount - 1 ? 2 : Math.round(2 + rng() * 2)
            for (let local = 0; local < inRank; local += 1) {
                nodes.push(Object.freeze({
                    x: base.width * (0.1 + 0.8 * rank / Math.max(1, rankCount - 1)) + (rng() - 0.5) * base.width * 0.035,
                    y: base.height * (0.18 + 0.64 * (local + 1) / (inRank + 1)) + (rng() - 0.5) * base.height * 0.05,
                    rank,
                    heat: rng(),
                    size: 4 + rng() * 7,
                }))
            }
        }
        const edges: ForgeEdge[] = []
        for (let index = 0; index < nodes.length; index += 1) {
            const from = nodes[index]
            const candidates = nodes.map((node, i) => ({ node, i })).filter(({ node }) => node.rank === from.rank + 1)
            candidates.slice(0, 1 + (index % 2)).forEach(({ i }, lane) => edges.push(Object.freeze({
                from: index,
                to: i,
                bow: (rng() - 0.5) * base.height * 0.16,
                lane,
            })))
        }
        const gears = Object.freeze(Array.from({ length: qCount(base, 2, 3, 4) }, (_, index) => Object.freeze({
            x: base.width * (0.16 + index * 0.24 + rng() * 0.08),
            y: base.height * (0.78 - (index % 2) * 0.46),
            radius: 18 + rng() * 28,
            teeth: 8 + Math.round(rng() * 7),
            direction: index % 2 === 0 ? 1 : -1,
            phase: rng() * TAU,
        })))
        const rails = Object.freeze(Array.from({ length: qCount(base, 3, 5, 7) }, (_, i) => base.height * (0.13 + 0.74 * (i + 1) / (qCount(base, 3, 5, 7) + 1))))
        return Object.freeze({
            geometry: Object.freeze({ ...base, nodes: Object.freeze(nodes), edges: Object.freeze(edges), gears, rails }),
            primitiveCount: primitiveCount(input, 230, 310, 390),
        })
    },
    update: ({ state, input, stepMs }) => {
        const dt = seconds(stepMs) * input.parameters.speed / 100
        state.time += dt
        state.cycle = (state.cycle + dt * 0.22) % 1
        state.impulse = (state.impulse + dt * 0.84) % 1
    },
    draw: ({ context: rawContext, state, geometry }) => {
        const context = rawContext as CanvasContext
        context.save(); context.clearRect(0, 0, geometry.width, geometry.height)
        context.lineJoin = 'bevel'; context.lineCap = 'square'

        // Engraved machine rails: static structure, micro-vibration only.
        context.strokeStyle = geometry.border; context.lineWidth = 0.7; context.globalAlpha = alpha(geometry, 0.14)
        for (let i = 0; i < geometry.rails.length; i += 1) {
            const y = geometry.rails[i] + Math.sin(state.time * 2.1 + i) * 0.65
            strokeLine(context, geometry.width * 0.04, y, geometry.width * 0.96, y)
            for (let notch = 0; notch < 14; notch += 1) {
                const x = geometry.width * (0.06 + 0.88 * notch / 13)
                strokeLine(context, x, y - 3 - (notch % 3), x, y + 3 + (notch % 3))
            }
        }

        // Central forging press gives the scene a single industrial silhouette.
        const pressX = geometry.width * 0.5, pressTop = geometry.height * 0.12, pressBottom = geometry.height * 0.88
        const pressW = geometry.width * 0.12
        context.strokeStyle = geometry.border; context.lineWidth = 1.1; context.globalAlpha = alpha(geometry, 0.22)
        strokeLine(context, pressX - pressW, pressTop, pressX - pressW, pressBottom)
        strokeLine(context, pressX + pressW, pressTop, pressX + pressW, pressBottom)
        strokeLine(context, pressX - pressW, pressTop, pressX + pressW, pressTop)
        strokeLine(context, pressX - pressW * 1.25, pressBottom, pressX + pressW * 1.25, pressBottom)
        const ramY = geometry.height * (0.26 + 0.24 * (0.5 + 0.5 * Math.sin(state.time * 0.46)))
        context.fillStyle = geometry.accent; context.globalAlpha = alpha(geometry, 0.16)
        context.fillRect(pressX - pressW * 0.32, pressTop, pressW * 0.64, ramY - pressTop)
        context.fillStyle = geometry.warning; context.globalAlpha = alpha(geometry, 0.34)
        context.fillRect(pressX - pressW * 0.52, ramY, pressW * 1.04, 4)
        context.strokeStyle = geometry.secondary; context.globalAlpha = alpha(geometry, 0.16)
        for (let rib = 0; rib < 5; rib += 1) {
            const x = pressX - pressW * 0.8 + rib * pressW * 0.4
            strokeLine(context, x, pressTop + 10, x, ramY - 8)
        }

        // Mechanical gears read as machinery rather than decorative circles.
        for (const gear of geometry.gears) {
            const rotation = gear.phase + state.time * 0.18 * gear.direction
            context.save(); context.translate(gear.x, gear.y); context.rotate(rotation)
            context.strokeStyle = geometry.border; context.fillStyle = geometry.surface
            context.lineWidth = 1; context.globalAlpha = alpha(geometry, 0.18)
            context.beginPath(); context.arc(0, 0, gear.radius * 0.68, 0, TAU); context.fill(); context.stroke()
            for (let tooth = 0; tooth < gear.teeth; tooth += 1) {
                const angle = tooth / gear.teeth * TAU
                const x0 = Math.cos(angle) * gear.radius * 0.72, y0 = Math.sin(angle) * gear.radius * 0.72
                const x1 = Math.cos(angle) * gear.radius, y1 = Math.sin(angle) * gear.radius
                context.lineWidth = tooth % 2 === 0 ? 2.2 : 1
                strokeLine(context, x0, y0, x1, y1)
            }
            context.strokeStyle = geometry.accent; context.globalAlpha = alpha(geometry, 0.42); context.lineWidth = 1.3
            context.beginPath(); context.arc(0, 0, gear.radius * 0.18, 0, TAU); context.stroke()
            context.restore()
        }

        // Directed execution graph with moving molten impulse.
        const pulseEdge = Math.floor(state.cycle * Math.max(1, geometry.edges.length))
        geometry.edges.forEach((edge, index) => {
            const from = geometry.nodes[edge.from], to = geometry.nodes[edge.to]
            const hot = index === pulseEdge || index === (pulseEdge + 1) % Math.max(1, geometry.edges.length)
            context.beginPath(); context.moveTo(from.x, from.y)
            context.bezierCurveTo(from.x + (to.x - from.x) * 0.34, from.y + edge.bow, to.x - (to.x - from.x) * 0.2, to.y - edge.bow * 0.45, to.x, to.y)
            context.strokeStyle = hot ? linearGradient(context, geometry, from.x, from.y, to.x, to.y, [geometry.warning, geometry.accent, geometry.secondary]) : geometry.border
            context.globalAlpha = alpha(geometry, hot ? 0.74 : 0.2); context.lineWidth = hot ? 2.3 : 0.9
            context.shadowBlur = hot ? 12 : 0; context.shadowColor = geometry.accent; context.stroke()
        })

        geometry.nodes.forEach((node, index) => {
            const beat = 0.5 + 0.5 * Math.sin(state.time * 1.8 + index * 0.7)
            const active = Math.abs(state.cycle - node.rank / Math.max(1, geometry.nodes.length)) < 0.11
            context.fillStyle = active ? geometry.warning : node.heat > 0.58 ? geometry.accent : geometry.secondary
            context.strokeStyle = geometry.border; context.globalAlpha = alpha(geometry, 0.45 + beat * 0.18)
            context.shadowBlur = active ? 14 : 4; context.shadowColor = geometry.accent
            drawDiamond(context, node.x, node.y, node.size * (0.8 + beat * 0.22)); context.fill(); context.stroke()
            context.shadowBlur = 0
        })

        // A welding flash travels independently of the DAG pulse.
        const weldX = geometry.width * (0.09 + 0.82 * state.impulse)
        const weldY = geometry.height * (0.46 + Math.sin(state.time * 1.7) * 0.08)
        context.fillStyle = radialGradient(context, weldX, weldY, 48, geometry.focus, geometry.warning)
        context.globalAlpha = alpha(geometry, 0.35); context.beginPath(); context.arc(weldX, weldY, 34, 0, TAU); context.fill()
        context.strokeStyle = geometry.warning; context.globalAlpha = alpha(geometry, 0.38)
        for (let spark = 0; spark < 7; spark += 1) {
            const angle = hash01(spark, Math.floor(state.time * 4), geometry.seed) * TAU
            const len = 8 + hash01(spark, geometry.seed, 9) * 26
            strokeLine(context, weldX, weldY, weldX + Math.cos(angle) * len, weldY + Math.sin(angle) * len)
        }
        context.restore()
    },
})
