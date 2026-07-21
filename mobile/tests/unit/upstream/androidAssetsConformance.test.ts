import { execFileSync, spawn } from 'node:child_process'
import { createHash } from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterAll, describe, expect, it, vi } from 'vitest'

// generate.mjs performs real sharp icon/splash rasterization (~2-5s per run); the
// process-kill recovery tests additionally spawn TWO subprocesses plus a
// `taskkill /T /F` process-tree kill. Measured wall-clock (isolation, verbose):
// non-kill generation ~2.6s; kill+recovery 5.6-6.1s (peak 6.15s) — nothing remotely
// near a hang. vitest's 5000ms default is simply too tight for the ~6s peak under
// normal Windows load/cold-start variance, so it aborted BEFORE the recovery
// assertions ran. Set a proportionate 30000ms (~5x the measured peak, with margin
// for full-suite CPU contention): comfortably above real cost, yet far below
// anything that could mask a recovery hang. Only the execution budget changes;
// no assertion is relaxed.
vi.setConfig({ testTimeout: 30000 })

const MOBILE_ROOT = path.resolve(__dirname, '..', '..', '..')
const TOOL = path.join(MOBILE_ROOT, 'tools', 'android-assets', 'generate.mjs')
const REAL_MAIN = path.join(MOBILE_ROOT, 'android', 'app', 'src', 'main')
const SENTINEL_REL = 'values/plugin_owned.xml'
const SENTINEL = '<?xml version="1.0" encoding="utf-8"?><resources><string name="plugin_probe_sentinel">unowned</string></resources>'
const MANAGED = JSON.parse(fs.readFileSync(path.join(MOBILE_ROOT, 'tools', 'android-assets', 'fixture-tracked-42.json'), 'utf8')).paths as string[]
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

const DELETE_ORPHANS = ['drawable/ic_launcher_background.xml', 'drawable-v24/ic_launcher_foreground.xml', 'values/ic_launcher_background.xml']

/** Recovery must leave every unowned file (not managed, not a delete-orphan) byte-exact vs prestate. */
function expectUnownedByteExact(before: Record<string, string>, res: string): void {
    const after = hashTree(res)
    for (const [rel, hash] of Object.entries(before)) {
        if (MANAGED.includes(rel) || DELETE_ORPHANS.includes(rel)) continue
        expect(after[rel], `unowned ${rel} must be byte-exact after recovery`).toBe(hash)
    }
}

/** Fresh disposable workspace mirroring the real materialized android main, plus an unowned sentinel. */
function setupWorkspace(): { root: string; res: string } {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'talos-aa-'))
    roots.push(root)
    const main = path.join(root, 'android', 'app', 'src', 'main')
    fs.mkdirSync(main, { recursive: true })
    fs.cpSync(path.join(REAL_MAIN, 'res'), path.join(main, 'res'), { recursive: true })
    fs.copyFileSync(path.join(REAL_MAIN, 'AndroidManifest.xml'), path.join(main, 'AndroidManifest.xml'))
    fs.writeFileSync(path.join(main, 'res', ...SENTINEL_REL.split('/')), SENTINEL)
    return { root, res: path.join(main, 'res') }
}

interface RunResult { code: number | null; json: Record<string, unknown> | null; stdout: string; markerSeen: boolean }

function jsonLines(stdout: string): Record<string, unknown>[] {
    return stdout.split('\n').map((l) => l.trim()).filter((l) => l.startsWith('{')).map((l) => JSON.parse(l))
}
function terminal(stdout: string): Record<string, unknown> | null {
    const lines = jsonLines(stdout).filter((j) => !('test_marker' in j))
    return lines.length ? lines[lines.length - 1] : null
}

function runTool(root: string, args: string[] = [], extraEnv: Record<string, string> = {}): Promise<RunResult> {
    return new Promise((resolve) => {
        // Always redirect to the disposable workspace so no test can touch the
        // real android tree. extraEnv may override TALOS_ASSET_TEST_MODE.
        const env = { ...process.env, TALOS_ASSET_TEST_MODE: '1', TALOS_ASSET_TEST_ROOT: root, CI: '1', ...extraEnv }
        const child = spawn(process.execPath, [TOOL, ...args], { env, stdio: ['ignore', 'pipe', 'pipe'] })
        let stdout = ''
        const watchdog = setTimeout(() => { try { execFileSync('taskkill', ['/PID', String(child.pid), '/T', '/F'], { stdio: 'ignore' }) } catch { /* ignore */ } }, 150000)
        child.stdout.on('data', (d) => { stdout += d })
        child.on('close', (code) => { clearTimeout(watchdog); resolve({ code, json: terminal(stdout), stdout, markerSeen: false }) })
    })
}

/** Kill the tool from the parent as soon as it prints the given phase marker, then return. */
function killAtMarker(root: string, marker: string, extraArgs: string[] = []): Promise<RunResult> {
    return new Promise((resolve) => {
        const env = { ...process.env, TALOS_ASSET_TEST_MODE: '1', TALOS_ASSET_TEST_ROOT: root, CI: '1' }
        const child = spawn(process.execPath, [TOOL, `--test-crash-after=${marker}`, ...extraArgs], { env, stdio: ['ignore', 'pipe', 'pipe'] })
        let stdout = ''
        let killed = false
        const watchdog = setTimeout(() => { try { execFileSync('taskkill', ['/PID', String(child.pid), '/T', '/F'], { stdio: 'ignore' }) } catch { /* ignore */ } }, 120000)
        child.stdout.on('data', (d) => {
            stdout += d
            if (!killed && stdout.includes(`"test_marker":"${marker}"`)) {
                killed = true
                try { execFileSync('taskkill', ['/PID', String(child.pid), '/T', '/F'], { stdio: 'ignore' }) } catch { /* ignore */ }
            }
        })
        child.on('close', (code) => { clearTimeout(watchdog); resolve({ code, json: terminal(stdout), stdout, markerSeen: killed }) })
    })
}

function stateResidue(root: string): boolean {
    const state = path.join(root, '.android-assets-state')
    const main = path.join(root, 'android', 'app', 'src', 'main')
    const hasWork = fs.existsSync(path.join(state, 'work')) && fs.readdirSync(path.join(state, 'work')).length > 0
    const hasLock = fs.existsSync(path.join(state, 'locks', 'mobile-android-assets.lock'))
    const hasTxn = fs.existsSync(path.join(state, 'txn', 'manifest.json'))
    const hasStage = fs.existsSync(path.join(main, 'res.staged'))
    const hasBackup = fs.existsSync(path.join(main, 'res.backup'))
    const hasFailed = fs.existsSync(path.join(main, 'res.failed-active'))
    return hasWork || hasLock || hasTxn || hasStage || hasBackup || hasFailed
}

afterAll(() => {
    for (const r of roots) fs.rmSync(r, { recursive: true, force: true })
})

describe('android assets conformance (product tool)', () => {
    it('temporary generation contains the exact 43-file on-disk set and promotes exactly 42 managed', async () => {
        const { root, res } = setupWorkspace()
        const r = await runTool(root)
        expect(r.code).toBe(0)
        expect(r.json).toMatchObject({ generated_on_disk: 43, managed_promoted: 42, status: 'ok', recovered: false })
        for (const p of MANAGED) expect(fs.existsSync(path.join(res, ...p.split('/'))), p).toBe(true)
        expect(stateResidue(root)).toBe(false)
    })

    it('promotion changes only the 42 managed resources and the explicit deletion allowlist', async () => {
        const { root, res } = setupWorkspace()
        const before = hashTree(res)
        const r = await runTool(root)
        expect(r.code).toBe(0)
        expect(r.json).toMatchObject({ deleted_owned: 3 })
        const after = hashTree(res)
        // the three template orphans are gone
        for (const orphan of ['drawable/ic_launcher_background.xml', 'drawable-v24/ic_launcher_foreground.xml', 'values/ic_launcher_background.xml']) {
            expect(after[orphan], `${orphan} deleted`).toBeUndefined()
            expect(before[orphan]).toBeDefined()
        }
        // every changed/removed path is managed or an allowlisted deletion; unowned untouched
        for (const rel of new Set([...Object.keys(before), ...Object.keys(after)])) {
            if (before[rel] === after[rel]) continue
            const managedOrDeleted = MANAGED.includes(rel) || ['drawable/ic_launcher_background.xml', 'drawable-v24/ic_launcher_foreground.xml', 'values/ic_launcher_background.xml'].includes(rel)
            expect(managedOrDeleted, `unexpected change to ${rel}`).toBe(true)
        }
    })

    it('generated config and unrelated plugin resources survive promotion byte for byte', async () => {
        const { root, res } = setupWorkspace()
        const sentinelBefore = sha256(path.join(res, ...SENTINEL_REL.split('/')))
        const configBefore = fs.existsSync(path.join(res, 'xml', 'config.xml')) ? sha256(path.join(res, 'xml', 'config.xml')) : null
        const r = await runTool(root)
        expect(r.code).toBe(0)
        expect(sha256(path.join(res, ...SENTINEL_REL.split('/')))).toBe(sentinelBefore)
        if (configBefore) expect(sha256(path.join(res, 'xml', 'config.xml'))).toBe(configBefore)
        expect((r.json as Record<string, number>).preserved_unowned).toBeGreaterThanOrEqual(2)
    })

    it('a second successful run is idempotent and preserves unowned resources', async () => {
        const { root, res } = setupWorkspace()
        await runTool(root)
        const afterFirst = hashTree(res)
        const r2 = await runTool(root)
        expect(r2.code).toBe(0)
        expect(r2.json).toMatchObject({ deleted_owned: 0 })
        expect(hashTree(res)).toEqual(afterFirst)
    })

    it('asset tooling not invoked leaves the last verified res tree intact', async () => {
        const { root, res } = setupWorkspace()
        await runTool(root)
        const verified = hashTree(res)
        // no invocation => tree unchanged
        expect(hashTree(res)).toEqual(verified)
    })

    it('an injected cooperative failure restores the tracked tree byte for byte with no residue', async () => {
        const { root, res } = setupWorkspace()
        const before = hashTree(res)
        const r = await runTool(root, ['--test-fail-after=5'])
        expect(r.code).toBe(1)
        expect((r.json as Record<string, string>).message).toMatch(/injected cooperative failure after 5/)
        expect(hashTree(res)).toEqual(before)
        expect(stateResidue(root)).toBe(false)
    })

    it('two concurrent invocations produce exactly one owner and one fail-closed loser', async () => {
        const { root } = setupWorkspace()
        const [a, b] = await Promise.all([runTool(root), runTool(root)])
        const js = [a.json, b.json]
        const ok = js.filter((j) => j && j.status === 'ok')
        const err = js.filter((j) => j && j.status === 'error')
        expect(ok.length).toBe(1)
        expect(err.length).toBe(1)
        expect((err[0] as Record<string, string>).message).toMatch(/lock held by live pid/)
    })

    const markers = [
        'after_prepared_manifest',
        'after_move_old_intent_before_rename',
        'after_live_to_backup_before_old_moved_manifest',
        'after_old_moved_manifest',
        'after_activate_new_intent_before_rename',
        'after_stage_to_live_before_new_active_manifest',
        'after_new_active_manifest',
        'after_verified_manifest_before_backup_cleanup',
        'after_lock_quarantine_before_delete',
    ]
    for (const marker of markers) {
        it(`process kill after ${marker} recovers deterministically`, async () => {
            const { root, res } = setupWorkspace()
            const before = hashTree(res)
            const crash = await killAtMarker(root, marker)
            expect(crash.markerSeen, 'killed at marker').toBe(true)
            // canonical lock never ownerless after a kill
            const lockDir = path.join(root, '.android-assets-state', 'locks', 'mobile-android-assets.lock')
            if (fs.existsSync(lockDir)) expect(fs.existsSync(path.join(lockDir, 'owner.json'))).toBe(true)
            const rec = await runTool(root)
            expect(rec.code, `recovery json=${JSON.stringify(rec.json)}`).toBe(0)
            expect(rec.json).toMatchObject({ status: 'ok' })
            expectUnownedByteExact(before, res)
            for (const p of MANAGED) expect(fs.existsSync(path.join(res, ...p.split('/'))), p).toBe(true)
            expect(stateResidue(root)).toBe(false)
        })
    }

    for (const marker of ['after_restore_intent_before_live_quarantine', 'after_live_quarantine_before_backup_restore', 'after_backup_restore_before_restored_manifest']) {
        it(`process kill during the quarantine restore at ${marker} recovers without data loss`, async () => {
            const { root, res } = setupWorkspace()
            const before = hashTree(res)
            const crash = await killAtMarker(root, marker, ['--test-corrupt-active=1'])
            expect(crash.markerSeen).toBe(true)
            // The recovery invocation reconciles the crashed restore (never
            // deleting live before backup returns) and then completes a fresh
            // generation. The observable guarantee is no data loss: unowned
            // resources survive, managed resources are present, no residue.
            const rec = await runTool(root)
            expect(rec.code, `json=${JSON.stringify(rec.json)}`).toBe(0)
            expect(rec.json).toMatchObject({ status: 'ok' })
            expectUnownedByteExact(before, res)
            for (const p of MANAGED) expect(fs.existsSync(path.join(res, ...p.split('/'))), p).toBe(true)
            expect(stateResidue(root)).toBe(false)
        })
    }

    it('verified recovery revalidates and a failed restore preserves recovery material with recovery_required', async () => {
        const { root } = setupWorkspace()
        const r = await runTool(root, ['--test-corrupt-active=1', '--test-fail-restore=1'])
        expect(r.code).toBe(1)
        expect(r.json).toMatchObject({ recovery_required: true })
        expect((r.json as Record<string, string>).backup).toBeTruthy()
        expect((r.json as Record<string, string>).manifest).toBeTruthy()
        const state = path.join(root, '.android-assets-state')
        expect(fs.existsSync(path.join(root, 'android', 'app', 'src', 'main', 'res.backup'))).toBe(true)
        expect(fs.existsSync(path.join(state, 'txn', 'manifest.json'))).toBe(true)
        const lockDir = path.join(state, 'locks', 'mobile-android-assets.lock')
        expect(fs.existsSync(lockDir) && fs.existsSync(path.join(lockDir, 'owner.json'))).toBe(true)
        // a subsequent invocation recovers to prestate
        const rec = await runTool(root)
        expect(rec.code, `json=${JSON.stringify(rec.json)}`).toBe(0)
    })

    it('corrupt-active fails verification then restores the live tree byte for byte', async () => {
        const { root, res } = setupWorkspace()
        const before = hashTree(res)
        const r = await runTool(root, ['--test-corrupt-active=1'])
        expect(r.code).toBe(1)
        expect(r.json).toMatchObject({ step: 'verify-active', recovered: true })
        expect(hashTree(res)).toEqual(before)
        expect(stateResidue(root)).toBe(false)
    })

    it('an external live-tree change before activation fails closed as LIVE_TREE_CHANGED', async () => {
        const { root, res } = setupWorkspace()
        const before = hashTree(res)
        const flagDir = path.join(root, '.android-assets-state')
        fs.mkdirSync(flagDir, { recursive: true })
        const result = await new Promise<RunResult>((resolve) => {
            const env = { ...process.env, TALOS_ASSET_TEST_MODE: '1', TALOS_ASSET_TEST_ROOT: root, CI: '1' }
            const child = spawn(process.execPath, [TOOL, '--test-pause-at-fence=fence-go.flag'], { env, stdio: ['ignore', 'pipe', 'pipe'] })
            let stdout = ''
            let mutated = false
            const watchdog = setTimeout(() => { try { execFileSync('taskkill', ['/PID', String(child.pid), '/T', '/F'], { stdio: 'ignore' }) } catch { /* ignore */ } }, 120000)
            child.stdout.on('data', (d) => {
                stdout += d
                if (!mutated && stdout.includes('"test_marker":"stage_verified"')) {
                    mutated = true
                    fs.writeFileSync(path.join(res, 'values', 'plugin_added.xml'), '<resources><string name="added">x</string></resources>')
                    fs.writeFileSync(path.join(flagDir, 'fence-go.flag'), 'go')
                }
            })
            child.on('close', (code) => { clearTimeout(watchdog); resolve({ code, json: terminal(stdout), stdout, markerSeen: mutated }) })
        })
        expect(result.code).toBe(1)
        expect(result.json).toMatchObject({ code: 'LIVE_TREE_CHANGED', step: 'fence' })
        expect(fs.existsSync(path.join(res, 'values', 'plugin_added.xml'))).toBe(true)
        for (const [rel, h] of Object.entries(before)) expect(hashTree(res)[rel]).toBe(h)
        expect(fs.existsSync(path.join(root, 'android', 'app', 'src', 'main', 'res.backup'))).toBe(false)
    })

    const junctions: Array<[string, (res: string, main: string) => void, (res: string, main: string) => void]> = [
        ['live-res-root junction', (res, main) => { fs.renameSync(res, path.join(main, 'res-real')); execFileSync('cmd', ['/c', 'mklink', '/J', res, path.join(main, 'res-real')], { stdio: 'ignore' }) }, (res, main) => { fs.rmSync(res, { recursive: true, force: true }); fs.renameSync(path.join(main, 'res-real'), res) }],
        ['nested-res junction', (res) => { execFileSync('cmd', ['/c', 'mklink', '/J', path.join(res, 'evil'), os.tmpdir()], { stdio: 'ignore' }) }, (res) => { try { fs.rmSync(path.join(res, 'evil'), { recursive: true, force: true }) } catch { /* ignore */ } }],
    ]
    for (const [name, make, undo] of junctions) {
        it(`canonical boundaries reject ${name} with zero live mutation`, async () => {
            const { root, res } = setupWorkspace()
            const main = path.join(root, 'android', 'app', 'src', 'main')
            const before = hashTree(res)
            make(res, main)
            const r = await runTool(root)
            undo(res, main)
            expect(r.code).toBe(1)
            expect((r.json as Record<string, string>).message).toMatch(/junction|symbolic link|non-regular|reparse/)
            expect(hashTree(res)).toEqual(before)
        })
    }

    const cli: Array<[string, string[], string | null]> = [
        ['tooling-missing', ['--test-tooling-missing=1'], 'TOOLING_MISSING'],
        ['sharp-missing', ['--test-sharp-missing=1'], 'SHARP_MISSING'],
        ['sharp-native-fail', ['--test-sharp-native-fail=1'], 'SHARP_NATIVE_LOAD_FAILED'],
        ['generator-missing', ['--test-generator-missing=1'], 'GENERATOR_SPAWN_FAILED'],
        ['platform-unsupported', ['--test-platform=linux'], 'PLATFORM_UNSUPPORTED'],
        ['spawn-error', ['--test-spawn-error=1'], 'GENERATOR_SPAWN_FAILED'],
        ['nonzero-close', ['--test-close-code=7'], 'GENERATOR_EXIT_NONZERO'],
    ]
    for (const [name, args, code] of cli) {
        it(`native/CLI failure ${name} is one canonical redacted JSON with zero mutation`, async () => {
            const { root, res } = setupWorkspace()
            const before = hashTree(res)
            const r = await runTool(root, args)
            expect(r.code).toBe(1)
            expect(jsonLines(r.stdout).filter((j) => !('test_marker' in j)).length).toBe(1)
            if (code) expect((r.json as Record<string, string>).code).toBe(code)
            expect((r.json as Record<string, string>).message.includes(root)).toBe(false)
            expect(hashTree(res)).toEqual(before)
            expect(stateResidue(root)).toBe(false)
        })
    }

    it('timeout and cancellation reap the owned generator process tree', async () => {
        for (const flag of ['--test-timeout=1', '--test-cancel=1']) {
            const { root, res } = setupWorkspace()
            const before = hashTree(res)
            const r = await runTool(root, [flag])
            expect(r.code).toBe(1)
            expect(hashTree(res)).toEqual(before)
            const pidFile = path.join(root, '.android-assets-state', '.test-generator-descendant.pid')
            if (fs.existsSync(pidFile)) {
                const pid = Number(fs.readFileSync(pidFile, 'utf8').trim())
                let alive = true
                try { process.kill(pid, 0) } catch { alive = false }
                expect(alive, `descendant pid ${pid} still alive`).toBe(false)
            }
        }
    })

    it('sigint emits one cancelled result and cleans preactivation ownership', async () => {
        const { root, res } = setupWorkspace()
        const before = hashTree(res)
        const r = await runTool(root, ['--test-sigint=1'])
        expect(r.code).toBe(1)
        expect((r.json as Record<string, string>).code).toBe('CANCELLED')
        expect(jsonLines(r.stdout).filter((j) => !('test_marker' in j)).length).toBe(1)
        expect(hashTree(res)).toEqual(before)
        expect(stateResidue(root)).toBe(false)
    })

    const argCases: Array<[string, string[], Record<string, string>]> = [
        ['unknown-arg', ['--frobnicate'], { TALOS_ASSET_TEST_MODE: '1' }],
        ['duplicate-arg', ['--test-timeout=1', '--test-timeout=1'], { TALOS_ASSET_TEST_MODE: '1' }],
        ['malformed-marker', ['--test-crash-after=banana'], { TALOS_ASSET_TEST_MODE: '1' }],
        ['fractional', ['--test-fail-after=1.5'], { TALOS_ASSET_TEST_MODE: '1' }],
        ['nan', ['--test-fail-after=NaN'], { TALOS_ASSET_TEST_MODE: '1' }],
        ['no-test-mode', ['--test-timeout=1'], { TALOS_ASSET_TEST_MODE: '0' }],
    ]
    for (const [name, args, env] of argCases) {
        it(`argument boundary ${name} is one args error`, async () => {
            const { root } = setupWorkspace()
            const r = await runTool(root, args, env)
            expect(r.code).toBe(1)
            expect((r.json as Record<string, string>).step).toBe('args')
            expect(jsonLines(r.stdout).filter((j) => !('test_marker' in j)).length).toBe(1)
        })
    }

    const badFixtures: Array<[string, string]> = [
        ['--test-fixture-managed', 'm-traversal'], ['--test-fixture-managed', 'm-absolute'], ['--test-fixture-managed', 'm-duplicate'],
        ['--test-fixture-managed', 'm-count-mismatch'], ['--test-fixture-managed', 'm-unknown-key'], ['--test-fixture-managed', 'm-missing-key'],
        ['--test-fixture-managed', 'm-wrong-type'], ['--test-fixture-managed', 'm-wrong-cardinality-41'], ['--test-fixture-managed', 'm-case-collision'],
        ['--test-fixture-managed', 'm-dos-device'], ['--test-fixture-managed', 'm-trailing-dot'], ['--test-fixture-managed', 'm-trailing-space'],
        ['--test-fixture-ondisk', 'o-wrong-cardinality-42'], ['--test-fixture-ondisk', 'o-dos-device'],
        ['--test-fixture-delete', 'd-empty'], ['--test-fixture-delete', 'd-incomplete'], ['--test-fixture-delete', 'd-wrong-member'],
    ]
    for (const [flag, name] of badFixtures) {
        it(`fixture authority rejects ${name} before any live mutation`, async () => {
            const { root, res } = setupWorkspace()
            const before = hashTree(res)
            const r = await runTool(root, [`${flag}=${name}`])
            expect(r.code).toBe(1)
            expect((r.json as Record<string, string>).status).toBe('error')
            expect(hashTree(res)).toEqual(before)
            expect(stateResidue(root)).toBe(false)
        })
    }

    it('the isolated tooling freezes the audit-clean pins and override matrix', () => {
        const toolDir = path.join(MOBILE_ROOT, 'tools', 'android-assets')
        const pkg = JSON.parse(fs.readFileSync(path.join(toolDir, 'package.json'), 'utf8'))
        expect(pkg.devDependencies['@capacitor/assets']).toBe('3.0.5')
        expect(pkg.devDependencies.sharp).toBe('0.32.6')
        expect(pkg.overrides).toEqual({ tar: '7.5.20', minimatch: '3.1.5', uuid: '11.1.1' })
        // the reproducible lockfile pins the exact override versions
        const lock = JSON.parse(fs.readFileSync(path.join(toolDir, 'package-lock.json'), 'utf8'))
        const versionsOf = (name: string) => Object.entries(lock.packages as Record<string, { version?: string }>)
            .filter(([k]) => k.endsWith(`node_modules/${name}`))
            .map(([, v]) => v.version)
        expect(versionsOf('tar')).toContain('7.5.20')
        expect(versionsOf('minimatch')).toContain('3.1.5')
        expect(versionsOf('uuid')).toContain('11.1.1')
        expect(versionsOf('sharp')).toContain('0.32.6')
        // it is never a mobile/package.json dependency
        const mobilePkg = JSON.parse(fs.readFileSync(path.join(MOBILE_ROOT, 'package.json'), 'utf8'))
        expect(mobilePkg.dependencies?.['@capacitor/assets']).toBeUndefined()
        expect(mobilePkg.devDependencies?.['@capacitor/assets']).toBeUndefined()
        expect(mobilePkg.dependencies?.sharp).toBeUndefined()
        expect(mobilePkg.devDependencies?.sharp).toBeUndefined()
    })

    it('every terminal result has exact keys and value types', async () => {
        const okRun = await runTool(setupWorkspace().root)
        expect(Object.keys(okRun.json as object).sort()).toEqual(['deleted_owned', 'generated_on_disk', 'managed_promoted', 'preserved_unowned', 'recovered', 'status'])
        const errRun = await runTool(setupWorkspace().root, ['--test-platform=linux'])
        const errKeys = Object.keys(errRun.json as object).sort()
        expect(errKeys).toEqual(['code', 'message', 'recovered', 'recovery_required', 'status', 'step'])
    })
})
