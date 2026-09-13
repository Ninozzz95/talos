// TALOS Git Bash launcher adapter.
// Drives the android-assets generate.mjs through an interactive Git Bash
// session inside a hidden ConPTY, using ONLY the official npm node-pty and
// @xterm/headless packages (never VS Code copies). ConPTY plus a direct
// node.exe invocation bypasses the Git-for-Windows winpty alias, so the tool's
// final terminal bytes (its canonical JSON) are actually delivered and can be
// rendered from the emulated screen. Never opens or controls a VS Code window.
import { createRequire } from 'node:module'
import path from 'node:path'

const require = createRequire(import.meta.url)
const pty = require('node-pty')
const xterm = require('@xterm/headless')
const Terminal = xterm.Terminal ?? xterm.default?.Terminal ?? xterm.default

function toUnixPath(p) {
    return p.replace(/\\/g, '/').replace(/^([A-Za-z]):/, (_m, d) => `/${d.toLowerCase()}`)
}

function renderScreen(term) {
    const buf = term.buffer.active
    const lines = []
    for (let i = 0; i < buf.length; i += 1) {
        const line = buf.getLine(i)
        if (line) lines.push(line.translateToString(true))
    }
    return lines.join('\n')
}

/**
 * Run a Ctrl+C cancellation journey: launch the tool paused at its fence
 * marker, send Ctrl+C through the ConPTY, and return the raw stream, the
 * rendered visible screen, and the shell exit code.
 */
export function runGitBashSigintJourney({ bashPath, nodePath, toolPath, testRoot, timeoutMs = 60000 }) {
    return new Promise((resolve, reject) => {
        const term = new Terminal({ cols: 220, rows: 60, allowProposedApi: true })
        const nodeUnix = toUnixPath(nodePath)
        const toolUnix = toUnixPath(toolPath)
        const rootUnix = toUnixPath(testRoot)
        // `exec` replaces bash with node.exe so node is the ConPTY foreground
        // process: Ctrl+C reaches it directly (bypassing the winpty alias).
        // The tool pauses at a never-appearing fence flag until we cancel it.
        const command = `TALOS_ASSET_TEST_MODE=1 TALOS_ASSET_TEST_ROOT='${rootUnix}' CI=1 exec "${nodeUnix}" "${toolUnix}" --test-pause-at-fence=never-appears.flag`
        const child = pty.spawn(bashPath, ['--norc', '-c', command], {
            name: 'xterm-color',
            cols: 220,
            rows: 60,
            cwd: testRoot,
            env: { ...process.env },
            useConpty: true,
        })
        let raw = ''
        let sentCtrlC = false
        let done = false
        const finish = (fn) => {
            if (done) return
            done = true
            clearTimeout(timer)
            fn()
        }
        const timer = setTimeout(() => { try { child.kill() } catch { /* gone */ } finish(() => reject(new Error(`git-bash journey timeout; raw so far:\n${raw.slice(-400)}`))) }, timeoutMs)
        child.onData((data) => {
            raw += data
            term.write(data)
            if (!sentCtrlC && raw.includes('"test_marker":"stage_verified"')) {
                sentCtrlC = true
                setTimeout(() => { try { child.write('\x03') } catch { /* gone */ } }, 150)
            }
        })
        child.onExit(({ exitCode, signal }) => {
            setTimeout(() => finish(() => {
                resolve({ raw, screen: renderScreen(term), exitCode, signal, sentCtrlC })
            }), 100)
        })
        // safety: if the marker never arrives, still cancel after a grace period
        setTimeout(() => { if (!sentCtrlC) { try { child.write('\x03') } catch { /* gone */ } } }, timeoutMs - 5000)
    })
}

export function extractCancelledJson(text) {
    // The tool prints exactly one terminal JSON line; find the last JSON object
    // that carries a status field in the rendered/raw text.
    const candidates = text.split(/\r?\n/).map((l) => l.trim()).filter((l) => l.startsWith('{') && l.includes('"status"'))
    for (let i = candidates.length - 1; i >= 0; i -= 1) {
        try { return JSON.parse(candidates[i]) } catch { /* keep scanning */ }
    }
    return null
}

export const DEFAULT_BASH_PATH = 'C:/Program Files/Git/bin/bash.exe'
export function resolveToolPath() {
    return path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), '..', 'android-assets', 'generate.mjs')
}
