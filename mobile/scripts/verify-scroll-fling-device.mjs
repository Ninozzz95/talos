#!/usr/bin/env node
/**
 * v0.1.37 — real-device Android fling gate.
 *
 * The gesture is produced by adb, not JavaScript. CDP is read-only here: it
 * locates the scrollport and samples scrollTop after ACTION_UP. A pass means the
 * page keeps moving after the finger has already been released.
 *
 * Usage, with TALOS already open on a long station page:
 *
 *   npm run test:scroll-fling:device
 *   TALOS_SCROLL_SELECTOR='[data-testid="talos-chat-scroll"]' npm run test:scroll-fling:device
 *
 * Environment:
 *   TALOS_PACKAGE             default ai.talos.dev
 *   TALOS_CDP_PORT            default 9334
 *   TALOS_SCROLL_SELECTOR     default [data-testid="mobile-screen-body"]
 *   TALOS_FLING_DURATION_MS   default 120
 *   TALOS_FLING_MIN_TAIL_PX   default 24 CSS px
 */
import { execFileSync } from 'node:child_process'
import { trovaAdb } from './device.mjs'

const ADB = trovaAdb()
const PACKAGE = process.env.TALOS_PACKAGE ?? 'ai.talos.dev'
const PORT = Number(process.env.TALOS_CDP_PORT ?? 9334)
const SELECTOR = process.env.TALOS_SCROLL_SELECTOR ?? '[data-testid="mobile-screen-body"]'
const DURATION_MS = Number(process.env.TALOS_FLING_DURATION_MS ?? 120)
const MIN_TAIL_PX = Number(process.env.TALOS_FLING_MIN_TAIL_PX ?? 24)

function adb(...args) {
    return execFileSync(ADB, args, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })
}

function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms))
}

function openBridge() {
    const pid = adb('shell', 'pidof', PACKAGE).trim()
    if (!pid) throw new Error(`${PACKAGE} non è in esecuzione sul dispositivo.`)
    adb('forward', `tcp:${PORT}`, `localabstract:webview_devtools_remote_${pid}`)
}

async function pageSocketUrl() {
    const response = await fetch(`http://127.0.0.1:${PORT}/json`)
    if (!response.ok) throw new Error(`CDP HTTP ${response.status}`)
    const pages = await response.json()
    const page = pages.find((entry) => entry.type === 'page')
    if (!page?.webSocketDebuggerUrl) throw new Error('Il WebView non espone una pagina CDP.')
    return page.webSocketDebuggerUrl
}

async function evaluate(expression) {
    openBridge()
    const url = await pageSocketUrl()
    const socket = new WebSocket(url)
    return new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
            socket.close()
            reject(new Error('Il WebView non ha risposto entro 10 secondi.'))
        }, 10_000)
        socket.addEventListener('open', () => {
            socket.send(JSON.stringify({
                id: 1,
                method: 'Runtime.evaluate',
                params: { expression, returnByValue: true, awaitPromise: true },
            }))
        })
        socket.addEventListener('message', (event) => {
            const data = JSON.parse(String(event.data))
            if (data.id !== 1) return
            clearTimeout(timeout)
            socket.close()
            if (data.result?.exceptionDetails) {
                reject(new Error(data.result.exceptionDetails.text ?? 'errore CDP'))
                return
            }
            resolve(data.result?.result?.value)
        })
        socket.addEventListener('error', (error) => {
            clearTimeout(timeout)
            reject(new Error(`CDP non raggiungibile: ${error.message ?? error}`))
        })
    })
}

const selectorJson = JSON.stringify(SELECTOR)

async function metrics() {
    return evaluate(`(() => {
        const el = document.querySelector(${selectorJson})
        if (!(el instanceof HTMLElement)) return { error: 'selector-not-found' }
        const r = el.getBoundingClientRect()
        const dpr = window.devicePixelRatio || 1
        return {
            scrollTop: el.scrollTop,
            scrollHeight: el.scrollHeight,
            clientHeight: el.clientHeight,
            x: Math.round((r.left + r.width / 2) * dpr),
            yTop: Math.round((r.top + Math.min(r.height * 0.28, r.height - 24)) * dpr),
            yBottom: Math.round((r.bottom - Math.min(r.height * 0.22, r.height - 24)) * dpr),
        }
    })()`)
}

async function setStartPosition() {
    return evaluate(`(() => {
        const el = document.querySelector(${selectorJson})
        if (!(el instanceof HTMLElement)) return null
        const max = Math.max(0, el.scrollHeight - el.clientHeight)
        if (max <= 0) return { max, scrollTop: el.scrollTop }
        el.scrollTop = Math.min(max * 0.25, Math.max(48, max - el.clientHeight * 2))
        return { max, scrollTop: el.scrollTop }
    })()`)
}

function number(value, label) {
    const n = Number(value)
    if (!Number.isFinite(n)) throw new Error(`${label} non è un numero valido: ${value}`)
    return n
}

async function main() {
    const positioned = await setStartPosition()
    if (!positioned) throw new Error(`Nessun elemento per ${SELECTOR}`)
    if (number(positioned.max, 'scrollMax') < 200) {
        throw new Error(`Lo scroller ${SELECTOR} non è abbastanza lungo per una prova di fling.`)
    }
    await sleep(120)

    const before = await metrics()
    if (before?.error) throw new Error(`Nessun elemento per ${SELECTOR}`)
    if (number(before.scrollHeight, 'scrollHeight') <= number(before.clientHeight, 'clientHeight') + 1) {
        throw new Error(`Lo scroller ${SELECTOR} non ha overflow verticale.`)
    }

    const x = number(before.x, 'x')
    const fromY = number(before.yBottom, 'yBottom')
    const toY = number(before.yTop, 'yTop')
    if (fromY <= toY) throw new Error('Geometria del gesto non valida.')

    // This blocks until ACTION_UP: every sample below is post-release.
    adb('shell', 'input', 'touchscreen', 'swipe', String(x), String(fromY), String(x), String(toY), String(DURATION_MS))

    const samples = []
    for (const delay of [0, 80, 160, 300, 500]) {
        if (delay > 0) await sleep(delay - (samples.at(-1)?.delay ?? 0))
        const now = await metrics()
        samples.push({ delay, scrollTop: number(now.scrollTop, 'scrollTop') })
    }

    const releaseTop = samples[0].scrollTop
    const tail = Math.abs(samples.at(-1).scrollTop - releaseTop)
    const movingIntervals = samples.slice(1).filter((sample, index) => (
        Math.abs(sample.scrollTop - samples[index].scrollTop) >= 2
    )).length

    console.log(JSON.stringify({ selector: SELECTOR, durationMs: DURATION_MS, before: before.scrollTop, samples, tailPx: tail }, null, 2))

    if (tail < MIN_TAIL_PX || movingIntervals < 2) {
        throw new Error(
            `FLING FAIL: dopo ACTION_UP lo scroll ha percorso solo ${tail.toFixed(1)}px `
            + `(${movingIntervals} intervalli in movimento; minimo ${MIN_TAIL_PX}px e 2 intervalli).`,
        )
    }

    console.log(`FLING PASS: coda inerziale ${tail.toFixed(1)}px dopo il rilascio.`)
}

main().catch((error) => {
    console.error(error instanceof Error ? error.message : error)
    process.exitCode = 1
})
