import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { afterAll, describe, expect, it } from 'vitest'

const MOBILE_ROOT = path.resolve(__dirname, '..', '..', '..')
const REAL_MAIN = path.join(MOBILE_ROOT, 'android', 'app', 'src', 'main')
const TOOL = path.join(MOBILE_ROOT, 'tools', 'android-assets', 'generate.mjs')
const LAUNCHER = path.join(MOBILE_ROOT, 'tools', 'git-bash-launcher', 'launch.mjs')
const BASH_CANDIDATES = ['C:/Program Files/Git/bin/bash.exe', 'C:/Program Files/Git/usr/bin/bash.exe']
const roots: string[] = []

function sha256(file: string): string {
    return createHash('sha256').update(fs.readFileSync(file)).digest('hex')
}
function hashTree(root: string): Record<string, string> {
    const map: Record<string, string> = {}
    const walk = (dir: string) => {
        for (const entry of fs.readdirSync(dir)) {
            const full = path.join(dir, entry)
            if (fs.lstatSync(full).isDirectory()) walk(full)
            else map[path.relative(root, full).replaceAll('\\', '/')] = sha256(full)
        }
    }
    walk(root)
    return map
}
function setupWorkspace(): { root: string; res: string } {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'talos-s80-'))
    roots.push(root)
    const main = path.join(root, 'android', 'app', 'src', 'main')
    fs.mkdirSync(main, { recursive: true })
    fs.cpSync(path.join(REAL_MAIN, 'res'), path.join(main, 'res'), { recursive: true })
    fs.copyFileSync(path.join(REAL_MAIN, 'AndroidManifest.xml'), path.join(main, 'AndroidManifest.xml'))
    fs.writeFileSync(path.join(main, 'res', 'values', 'plugin_owned.xml'), '<resources><string name="s">u</string></resources>')
    return { root, res: path.join(main, 'res') }
}

afterAll(() => {
    for (const r of roots) { try { fs.rmSync(r, { recursive: true, force: true }) } catch { /* pty handle race */ } }
})

describe('git bash launcher conformance', () => {
    it('git bash launcher bypasses winpty and renders cancelled result after ctrl c', async () => {
        const bashPath = BASH_CANDIDATES.find((c) => fs.existsSync(c))
        expect(bashPath, 'git-bash present').toBeTruthy()
        const { runGitBashSigintJourney, extractCancelledJson } = await import(pathToFileURL(LAUNCHER).href)

        const { root, res } = setupWorkspace()
        const before = hashTree(res)

        const journey = await runGitBashSigintJourney({ bashPath, nodePath: process.execPath, toolPath: TOOL, testRoot: root, timeoutMs: 70000 })
        // Ctrl+C was sent from the parent after the machine-readable fence marker.
        expect(journey.sentCtrlC).toBe(true)
        // The tool exited nonzero through the ConPTY (winpty would have hidden it).
        expect(journey.exitCode).not.toBe(0)
        // The canonical CANCELLED JSON was actually delivered and is parseable.
        const json = extractCancelledJson(journey.raw) ?? extractCancelledJson(journey.screen)
        expect(json, 'a terminal JSON was rendered').toBeTruthy()
        expect(json.status).toBe('error')
        expect(json.step).toBe('signal')
        expect(json.code).toBe('CANCELLED')
        // The live tree was cancelled before activation: byte-for-byte unchanged.
        expect(hashTree(res)).toEqual(before)
        // No transaction residue survives the cancellation.
        const main = path.join(root, 'android', 'app', 'src', 'main')
        const state = path.join(root, '.android-assets-state')
        expect(fs.existsSync(path.join(main, 'res.backup'))).toBe(false)
        expect(fs.existsSync(path.join(main, 'res.staged'))).toBe(false)
        expect(fs.existsSync(path.join(state, 'txn', 'manifest.json'))).toBe(false)
    }, 90000)

    it('the launcher uses only the isolated lane-local node-pty and xterm packages', () => {
        const pkg = JSON.parse(fs.readFileSync(path.join(MOBILE_ROOT, 'tools', 'git-bash-launcher', 'package.json'), 'utf8'))
        expect(pkg.devDependencies['node-pty']).toBe('1.2.0-beta.13')
        expect(pkg.devDependencies['@xterm/headless']).toBe('6.1.0-beta.285')
        // never a mobile/package.json dependency
        const mobilePkg = JSON.parse(fs.readFileSync(path.join(MOBILE_ROOT, 'package.json'), 'utf8'))
        expect(mobilePkg.dependencies?.['node-pty']).toBeUndefined()
        expect(mobilePkg.devDependencies?.['node-pty']).toBeUndefined()
        // resolves to the lane-local install, not a VS Code copy
        const binding = path.join(MOBILE_ROOT, 'tools', 'git-bash-launcher', 'node_modules', 'node-pty')
        expect(fs.existsSync(binding)).toBe(true)
        // avoid an unused import lint on execFileSync in some configs
        void execFileSync
    })
})
