// Headless UI capture tool (owner visual-verification mandate, F1+).
// Serves the built `dist/` via `vite preview` and captures PNG screenshots with
// Playwright Chromium across viewports x color schemes x routes. The agent then
// OPENS and inspects every image (harmony check), it does not merely assert.
//
// Hang-proofing (AUD-006, owner mandate "mai piu"):
//   1. pre-kill: any orphan listener on the port is killed before starting
//      (a leftover `vite preview` once wedged this tool for ~35 minutes);
//   2. bounded navigation: goto uses `load` + a fixed settle wait — never
//      `networkidle`, which can wait forever on apps with retry loops;
//   3. watchdog: a hard process-level deadline kills the whole run (and the
//      preview tree) if ANY step stalls, so the tool can never hang a gate.
//
// Usage: node scripts/capture-ui.mjs --out test-results/ui-captures/00-before
//   [--routes /,/settings] [--viewports 390x844,360x640] [--schemes light,dark]
// Requires a fresh `npm run build` (the tool refuses to run without dist/).
import { execSync, spawn } from 'node:child_process'
import { existsSync, mkdirSync } from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { chromium } from '@playwright/test'

const args = process.argv.slice(2)
const opt = (name, fallback) => {
    const i = args.indexOf(`--${name}`)
    return i !== -1 && args[i + 1] ? args[i + 1] : fallback
}
const OUT = path.resolve(opt('out', 'test-results/ui-captures/adhoc'))
const ROUTES = opt('routes', '/,/settings').split(',')
const VIEWPORTS = opt('viewports', '390x844,360x640').split(',').map((v) => {
    const [w, h] = v.split('x').map(Number)
    return { width: w, height: h }
})
const SCHEMES = opt('schemes', 'light,dark').split(',')
const PORT = Number(opt('port', '4173'))
const WATCHDOG_MS = Number(opt('watchdog', '240000')) // hard ceiling for the whole run

if (!existsSync(path.resolve('dist/index.html'))) {
    console.error('dist/index.html missing - run `npm run build` first')
    process.exit(1)
}
mkdirSync(OUT, { recursive: true })

function killPortOrphan(port) {
    if (process.platform !== 'win32') return
    try {
        const lines = execSync('netstat -ano', { encoding: 'utf8' }).split('\n')
        const row = lines.find((line) => line.includes(`:${port}`) && line.includes('LISTENING'))
        const pid = row ? row.trim().split(' ').filter(Boolean).pop() : null
        if (pid && Number(pid) > 0) {
            execSync(`taskkill /PID ${pid} /T /F`, { stdio: 'ignore' })
            console.log(`pre-killed orphan listener pid ${pid} on :${port}`)
        }
    } catch { /* no orphan */ }
}

function killTree(pid) {
    if (!pid) return
    try {
        if (process.platform === 'win32') execSync(`taskkill /PID ${pid} /T /F`, { stdio: 'ignore' })
        else process.kill(pid, 'SIGKILL')
    } catch { /* already gone */ }
}

// 1) pre-kill orphans so --strictPort cannot wedge on a stale server.
killPortOrphan(PORT)

const preview = spawn(process.platform === 'win32' ? 'npx.cmd' : 'npx',
    ['vite', 'preview', '--port', String(PORT), '--strictPort'],
    { stdio: ['ignore', 'pipe', 'pipe'], shell: process.platform === 'win32' })

// 3) watchdog: the tool must NEVER hang a gate. Hard-exit + tree-kill on deadline.
const watchdog = setTimeout(() => {
    console.error(`watchdog: capture exceeded ${WATCHDOG_MS}ms - killing preview tree and exiting`)
    killTree(preview.pid)
    process.exit(2)
}, WATCHDOG_MS)
watchdog.unref?.()
for (const signal of ['SIGINT', 'SIGTERM']) {
    process.on(signal, () => { killTree(preview.pid); process.exit(3) })
}

const ready = new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('preview server start timeout')), 20000)
    preview.stdout.on('data', (chunk) => {
        if (String(chunk).includes(String(PORT))) { clearTimeout(timer); resolve() }
    })
    preview.on('exit', (code) => reject(new Error(`preview exited early (${code})`)))
})

let exitCode = 0
try {
    await ready
    const browser = await chromium.launch()
    const shots = []
    for (const scheme of SCHEMES) {
        for (const viewport of VIEWPORTS) {
            const context = await browser.newContext({ viewport, colorScheme: scheme })
            const page = await context.newPage()
            page.setDefaultTimeout(20000)
            page.setDefaultNavigationTimeout(30000)
            for (const route of ROUTES) {
                // 2) bounded navigation: 'load' + fixed settle, never 'networkidle'.
                await page.goto(`http://127.0.0.1:${PORT}${route}`, { waitUntil: 'load' })
                await page.waitForTimeout(3200) // boot overlay + theme settle
                const slug = route === '/' ? 'chat' : route.replaceAll('/', '_').replace(/^_/, '')
                const file = path.join(OUT, `${slug}-${viewport.width}x${viewport.height}-${scheme}.png`)
                await page.screenshot({ path: file, fullPage: false })
                shots.push(file)
                console.log('captured', path.relative(process.cwd(), file))
            }
            await context.close()
        }
    }
    await browser.close()
    console.log(JSON.stringify({ ok: true, count: shots.length, out: OUT }))
} catch (error) {
    console.error('capture failed:', error instanceof Error ? error.message : error)
    exitCode = 1
} finally {
    clearTimeout(watchdog)
    killTree(preview.pid)
}
process.exit(exitCode)
