// TALOS Mobile M1 - Android asset generation tool.
// Canonical command (no arguments):
//   node mobile/tools/android-assets/generate.mjs
// Topology-aware, process-crash recoverable transaction over the tracked
// android res tree. Native deps (sharp, @capacitor/assets) load only after
// argument/platform validation, inside the controlled boundary. Exactly one
// terminal JSON line. Test-only flags require TALOS_ASSET_TEST_MODE=1 and, for
// an isolated workspace, TALOS_ASSET_TEST_ROOT; both fail closed in production.
import { spawn } from 'node:child_process'
import { createHash } from 'node:crypto'
import fs from 'node:fs'
import fsp from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const MOBILE_ROOT = path.resolve(HERE, '..', '..')
const TOOLING_DEFAULT = HERE
const ASSETS_SRC = path.join(MOBILE_ROOT, 'assets')
const STOCK_CHECKSUMS = path.join(HERE, 'stock-res-checksums.txt')

const TEST_MODE = process.env.TALOS_ASSET_TEST_MODE === '1'
const TEST_ROOT = TEST_MODE && process.env.TALOS_ASSET_TEST_ROOT ? path.resolve(process.env.TALOS_ASSET_TEST_ROOT) : null
// Everything derives from a single containment root: the mobile package in
// production, or an isolated disposable workspace in test mode.
const WORKSPACE_ROOT = TEST_ROOT ?? MOBILE_ROOT
const ANDROID_MAIN = path.join(WORKSPACE_ROOT, 'android', 'app', 'src', 'main')
const LIVE_RES = path.join(ANDROID_MAIN, 'res')
const RES_PARENT = ANDROID_MAIN
const STAGE_DIR = path.join(ANDROID_MAIN, 'res.staged')
const BACKUP_DIR = path.join(ANDROID_MAIN, 'res.backup')
const FAILED_ACTIVE_DIR = path.join(ANDROID_MAIN, 'res.failed-active')
const STATE_DIR = path.join(WORKSPACE_ROOT, '.android-assets-state')
const WORK_PARENT = path.join(STATE_DIR, 'work')
const LOCK_PARENT = path.join(STATE_DIR, 'locks')
const LOCK_DIR = path.join(LOCK_PARENT, 'mobile-android-assets.lock')
const OWNER_FILE = path.join(LOCK_DIR, 'owner.json')
const TXN_DIR = path.join(STATE_DIR, 'txn')
const MANIFEST_FILE = path.join(TXN_DIR, 'manifest.json')
const TEST_DESCENDANT_PID_FILE = path.join(STATE_DIR, '.test-generator-descendant.pid')
const MANIFEST_SRC = path.join(ANDROID_MAIN, 'AndroidManifest.xml')

const DENSITIES = { mdpi: 48, hdpi: 72, xhdpi: 96, xxhdpi: 144, xxxhdpi: 192 }
const WORK_ORPHANS = [
    'drawable/ic_launcher_background.xml',
    'drawable-v24/ic_launcher_foreground.xml',
    'values/ic_launcher_background.xml',
]
const FROZEN_DELETE_SET = [...WORK_ORPHANS].sort()
// #14 calm brand assets introduced qualified values dirs (values-night)
// alongside the already-qualified drawable/mipmap namespaces.
const NAMESPACE_RE = /^(values(-[a-z0-9-]+)?|layout|xml|drawable(-[a-z0-9-]+)?|mipmap(-[a-z0-9-]+)?)\/[A-Za-z0-9_.-]+$/
const DOS_DEVICE_RE = /^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])(\..*)?$/i
const PHASES = ['prepared', 'move_old_intent', 'old_moved', 'activate_new_intent', 'new_active', 'verify_intent', 'verified', 'restore_intent', 'old_quarantined', 'restored']
const CRASH_MARKERS = [
    'after_prepared_manifest',
    'after_move_old_intent_before_rename',
    'after_live_to_backup_before_old_moved_manifest',
    'after_old_moved_manifest',
    'after_activate_new_intent_before_rename',
    'after_stage_to_live_before_new_active_manifest',
    'after_new_active_manifest',
    'after_restore_intent_before_live_quarantine',
    'after_live_quarantine_before_backup_restore',
    'after_backup_restore_before_restored_manifest',
    'after_verified_manifest_before_backup_cleanup',
    'after_lock_quarantine_before_delete',
]
const GENERATOR_TIMEOUT_MS = 120000

let terminalEmitted = false
let lockHeld = false
let keepLockOnExit = false
let ownTxid = null
let cancellationSignal = null
let cancelActiveChild = null
const owned = { workRoot: null, stageCreated: false, manifestWritten: false, firstRenameDone: false, txnFresh: false }

function cancellationError() {
    const error = new Error(`cancellation requested by ${cancellationSignal ?? 'operator'}`)
    error.step = 'signal'
    error.code2 = 'CANCELLED'
    error.cancelled = true
    return error
}

function throwIfCancelled() {
    if (cancellationSignal !== null) throw cancellationError()
}

process.on('SIGINT', () => {
    if (cancellationSignal !== null) return
    cancellationSignal = 'SIGINT'
    cancelActiveChild?.('cancellation requested by SIGINT')
})

function emit(json, code) {
    if (terminalEmitted) return
    fs.writeSync(process.stdout.fd, `${JSON.stringify(json)}\n`)
    terminalEmitted = true
    process.exitCode = code
}

function redact(text) {
    return String(text).replaceAll(WORKSPACE_ROOT, '<workspace>').replaceAll(HERE, '<tool>').slice(0, 2048)
}

function fail(step, message, extra = {}) {
    emit({
        status: 'error',
        step,
        code: extra.code ?? null,
        recovered: extra.recovered ?? false,
        recovery_required: extra.recovery_required ?? false,
        message: redact(message),
        ...extra.fields,
    }, 1)
}

function sha256(file) {
    return createHash('sha256').update(fs.readFileSync(file)).digest('hex')
}

function pidAlive(pid) {
    try { process.kill(pid, 0); return true } catch (e) { return e.code === 'EPERM' }
}

// ---------- argument validation (no I/O) ----------
const KNOWN_FLAGS = new Set([
    '--test-crash-after', '--test-fail-restore', '--test-corrupt-active',
    '--test-fixture-ondisk', '--test-fixture-managed', '--test-fixture-delete',
    '--test-spawn-error', '--test-timeout', '--test-cancel', '--test-fail-after',
    '--test-pause-at-fence', '--test-tooling-missing', '--test-sharp-missing',
    '--test-sharp-native-fail', '--test-generator-missing', '--test-platform',
    '--test-sigint', '--test-close-code', '--test-pause-after-verified',
])
const testOpts = {}
{
    const seen = new Set()
    for (const raw of process.argv.slice(2)) {
        const eq = raw.indexOf('=')
        const key = eq === -1 ? raw : raw.slice(0, eq)
        const value = eq === -1 ? '' : raw.slice(eq + 1)
        if (!KNOWN_FLAGS.has(key)) { fail('args', `unknown argument: ${raw}`); break }
        if (seen.has(key)) { fail('args', `duplicate argument: ${key}`); break }
        if (!TEST_MODE) { fail('args', `test-only argument ${key} requires TALOS_ASSET_TEST_MODE=1`); break }
        seen.add(key)
        if (key === '--test-crash-after' && !CRASH_MARKERS.includes(value)) { fail('args', `malformed ${key}: ${value}`); break }
        if (key === '--test-fail-after' && !/^[1-9][0-9]*$/.test(value)) { fail('args', `malformed ${key}: must be a positive integer, got "${value}"`); break }
        if (key === '--test-close-code' && (!/^[1-9][0-9]*$/.test(value) || Number(value) > 255)) { fail('args', `malformed ${key}: must be an integer from 1 to 255, got "${value}"`); break }
        if (key.startsWith('--test-fixture-') && !/^[a-z0-9-]+$/.test(value)) { fail('args', `malformed ${key}: ${value}`); break }
        if (key === '--test-platform' && !/^[a-z0-9]+$/.test(value)) { fail('args', `malformed ${key}: ${value}`); break }
        if ((key === '--test-pause-at-fence' || key === '--test-pause-after-verified') && value === '') { fail('args', `malformed ${key}: needs a flag-file name`); break }
        if (['--test-fail-restore', '--test-corrupt-active', '--test-spawn-error', '--test-timeout', '--test-cancel', '--test-tooling-missing', '--test-sharp-missing', '--test-sharp-native-fail', '--test-generator-missing', '--test-sigint'].includes(key) && value !== '1') { fail('args', `malformed ${key}: expected =1`); break }
        testOpts[key.slice(7)] = value === '' ? '1' : value
    }
}
{
    const platform = testOpts.platform ?? process.platform
    const arch = testOpts.platform ? 'x64' : process.arch
    if (!terminalEmitted && !(platform === 'win32' && arch === 'x64')) {
        fail('preflight', `unsupported platform ${platform}/${arch}; M1 asset generation is scoped to win32/x64 (Linux portability gate open)`, { code: 'PLATFORM_UNSUPPORTED' })
    }
}

// ---------- deferred native/tooling loading (inside controlled boundary) ----------
let sharp = null
let generatorBin = null
async function loadTooling() {
    const toolingDir = testOpts['tooling-missing'] === '1' ? path.join(HERE, 'no-such-tooling') : TOOLING_DEFAULT
    if (!fs.existsSync(path.join(toolingDir, 'node_modules'))) {
        const e = new Error(`isolated tooling node_modules not found under: ${toolingDir}`)
        e.step = 'load-tooling'; e.code2 = 'TOOLING_MISSING'; throw e
    }
    const { createRequire } = await import('node:module')
    const req = createRequire(path.join(toolingDir, 'package.json'))
    try {
        if (testOpts['sharp-missing'] === '1') req('sharp-does-not-exist')
        else if (testOpts['sharp-native-fail'] === '1') req(path.join(HERE, 'bad-native.cjs'))
        else sharp = req('sharp')
    } catch (e) {
        const wrapped = new Error(`sharp load failed: ${e.message}`)
        wrapped.step = 'load-tooling'
        wrapped.code2 = e.code === 'MODULE_NOT_FOUND' ? 'SHARP_MISSING' : 'SHARP_NATIVE_LOAD_FAILED'
        throw wrapped
    }
    generatorBin = testOpts['generator-missing'] === '1'
        ? path.join(HERE, 'no-such-generator.exe')
        : path.join(toolingDir, 'node_modules', '@capacitor', 'assets', 'bin', 'capacitor-assets')
    if (testOpts['generator-missing'] !== '1' && !fs.existsSync(generatorBin)) {
        const e = new Error(`generator binary not found: ${generatorBin}`)
        e.step = 'load-tooling'; e.code2 = 'GENERATOR_MISSING'; throw e
    }
}

// ---------- strict fixture parsing (exact counts, roles, windows identity) ----------
function parseFixture(file, role, expectedCount) {
    const label = `${role} fixture ${path.basename(file)}`
    const stats = fs.lstatSync(file)
    if (stats.isSymbolicLink() || !stats.isFile()) throw new Error(`${label}: fixture entry must be a regular file`)
    const raw = fs.readFileSync(file, 'utf8')
    let json
    try { json = JSON.parse(raw) } catch (e) { throw new Error(`${label}: invalid JSON: ${e.message}`) }
    const keys = Object.keys(json).sort()
    if (JSON.stringify(keys) !== JSON.stringify(['count', 'description', 'paths', 'schema_version'])) {
        throw new Error(`${label}: unknown or missing keys [${keys}]`)
    }
    if (json.schema_version !== 1) throw new Error(`${label}: unsupported schema_version`)
    if (typeof json.description !== 'string') throw new Error(`${label}: description must be a string`)
    if (typeof json.count !== 'number' || !Number.isInteger(json.count)) throw new Error(`${label}: count must be an integer`)
    if (!Array.isArray(json.paths)) throw new Error(`${label}: paths must be an array`)
    if (json.count !== json.paths.length) throw new Error(`${label}: count ${json.count} !== paths.length ${json.paths.length}`)
    if (json.count !== expectedCount) throw new Error(`${label}: exact cardinality violated: expected ${expectedCount}, got ${json.count}`)
    const seen = new Set()
    const seenFolded = new Set()
    let prev = ''
    for (const p of json.paths) {
        if (typeof p !== 'string' || p.length === 0) throw new Error(`${label}: empty or non-string path`)
        if (/[\u0000-\u001f\u007f]/.test(p)) throw new Error(`${label}: NUL or control character in path`)
        if (p.includes('\\')) throw new Error(`${label}: backslash in path ${p}`)
        if (p.startsWith('/') || /^[A-Za-z]:/.test(p)) throw new Error(`${label}: absolute/drive/UNC path ${p}`)
        const segments = p.split('/')
        if (segments.some((s) => s === '' || s === '.' || s === '..')) throw new Error(`${label}: traversal segment in ${p}`)
        for (const s of segments) {
            if (s.endsWith('.') || s.endsWith(' ')) throw new Error(`${label}: segment ending in dot or space: "${s}" in ${p}`)
            if (DOS_DEVICE_RE.test(s)) throw new Error(`${label}: DOS device name segment "${s}" in ${p}`)
        }
        if (path.posix.normalize(p) !== p) throw new Error(`${label}: non-normalized path ${p}`)
        if (!NAMESPACE_RE.test(p)) throw new Error(`${label}: path outside approved namespaces: ${p}`)
        if (seen.has(p)) throw new Error(`${label}: duplicate path ${p}`)
        const folded = p.toLowerCase()
        if (seenFolded.has(folded)) throw new Error(`${label}: case-insensitive collision on ${p}`)
        if (p < prev) throw new Error(`${label}: paths not sorted at ${p}`)
        seen.add(p); seenFolded.add(folded); prev = p
    }
    return json.paths
}

// ---------- boundary checks (containment root = WORKSPACE_ROOT) ----------
async function assertContained(target, label) {
    const rel = path.relative(WORKSPACE_ROOT, target)
    if (rel.startsWith('..') || path.isAbsolute(rel)) throw new Error(`${label}: ${target} is outside the workspace root`)
    let current = WORKSPACE_ROOT
    for (const segment of rel.split(path.sep)) {
        current = path.join(current, segment)
        let stats
        try { stats = await fsp.lstat(current) } catch { return }
        if (stats.isSymbolicLink()) throw new Error(`${label}: symbolic link or junction at ${current}`)
        if (!stats.isDirectory() && !stats.isFile()) throw new Error(`${label}: non-regular entry at ${current}`)
    }
    const realRoot = await fsp.realpath(WORKSPACE_ROOT)
    let realTarget
    try { realTarget = await fsp.realpath(target) } catch { return }
    const crel = path.relative(realRoot, realTarget)
    if (crel.startsWith('..') || path.isAbsolute(crel)) throw new Error(`${label}: canonical path escapes workspace root`)
}

async function assertDirectoryRoot(target, label, required = false) {
    let stats
    try { stats = await fsp.lstat(target) } catch (error) {
        if (error.code === 'ENOENT' && !required) return
        throw error
    }
    if (stats.isSymbolicLink() || !stats.isDirectory()) {
        throw new Error(`${label}: expected a directory root, found a non-regular or reparse entry at ${target}`)
    }
}

async function guardedWalk(root, onFile) {
    async function walk(dir) {
        for (const entry of await fsp.readdir(dir)) {
            const full = path.join(dir, entry)
            const stats = await fsp.lstat(full)
            if (stats.isSymbolicLink()) throw new Error(`symbolic link or junction rejected: ${full}`)
            if (stats.isDirectory()) await walk(full)
            else if (stats.isFile()) await onFile(full, path.relative(root, full).replaceAll('\\', '/'))
            else throw new Error(`non-regular file rejected: ${full}`)
        }
    }
    await walk(root)
}

async function listFiles(root) {
    const out = []
    await guardedWalk(root, async (_f, rel) => { out.push(rel) })
    return out.sort()
}

async function hashTree(root) {
    const map = {}
    await guardedWalk(root, async (full, rel) => { map[rel] = sha256(full) })
    return map
}

async function guardedCopyTree(srcRoot, dstRoot) {
    await guardedWalk(srcRoot, async (full, rel) => {
        const dest = path.join(dstRoot, ...rel.split('/'))
        await fsp.mkdir(path.dirname(dest), { recursive: true })
        await fsp.copyFile(full, dest)
    })
}

// Assemble a minimal Capacitor android project for the generator. The res base
// is the tracked/config projection of the live tree only (never unowned extras
// such as plugin or future resources), so the generated on-disk set is exactly
// the frozen 43 regardless of what else lives in the tracked tree.
async function assembleGenerationProject(workRoot, baseAllowSet) {
    const workMain = path.join(workRoot, 'android', 'app', 'src', 'main')
    const workRes = path.join(workMain, 'res')
    await fsp.mkdir(workRes, { recursive: true })
    await guardedWalk(LIVE_RES, async (full, rel) => {
        if (!baseAllowSet.has(rel)) return
        const dest = path.join(workRes, ...rel.split('/'))
        await fsp.mkdir(path.dirname(dest), { recursive: true })
        await fsp.copyFile(full, dest)
    })
    await fsp.copyFile(MANIFEST_SRC, path.join(workMain, 'AndroidManifest.xml'))
    const workAssets = path.join(workRoot, 'assets')
    await fsp.mkdir(workAssets, { recursive: true })
    for (const svg of ['icon-foreground.svg', 'icon-background.svg', 'splash.svg']) {
        await fsp.copyFile(path.join(ASSETS_SRC, svg), path.join(workAssets, svg))
    }
    await fsp.writeFile(path.join(workRoot, 'capacitor.config.json'), JSON.stringify({ appId: 'ai.talos', appName: 'TALOS', webDir: 'www' }, null, 2))
    await fsp.mkdir(path.join(workRoot, 'www'), { recursive: true })
    await fsp.writeFile(path.join(workRoot, 'www', 'index.html'), '<!doctype html><title>a</title>')
}

// ---------- durable manifest (process-crash recoverable; dir sync best effort) ----------
const REL = (abs) => path.relative(WORKSPACE_ROOT, abs).replaceAll('\\', '/')
async function writeManifestPhase(manifest, phase) {
    manifest.phase = phase
    await fsp.mkdir(TXN_DIR, { recursive: true })
    const tmp = `${MANIFEST_FILE}.${process.pid}.tmp`
    const handle = await fsp.open(tmp, 'w')
    await handle.writeFile(JSON.stringify(manifest, null, 2))
    await handle.sync()
    await handle.close()
    await fsp.rename(tmp, MANIFEST_FILE)
    try {
        const dirHandle = await fsp.open(TXN_DIR, 'r')
        await dirHandle.sync().catch(() => {})
        await dirHandle.close()
    } catch { /* directory sync unsupported: claim stays process-crash recoverable */ }
    owned.manifestWritten = true
}

function assertManifestResourcePath(rel, label) {
    if (typeof rel !== 'string' || rel.length === 0) throw new Error(`manifest: ${label} contains an empty or non-string path`)
    if (/[\u0000-\u001f\u007f]/.test(rel) || rel.includes('\\') || rel.startsWith('/') || /^[A-Za-z]:/.test(rel)) throw new Error(`manifest: unsafe path in ${label}: ${rel}`)
    const segments = rel.split('/')
    if (segments.some((segment) => segment === '' || segment === '.' || segment === '..')) throw new Error(`manifest: traversal path in ${label}: ${rel}`)
    if (segments.some((segment) => segment.endsWith('.') || segment.endsWith(' ') || DOS_DEVICE_RE.test(segment))) throw new Error(`manifest: Windows-unsafe path in ${label}: ${rel}`)
    if (path.posix.normalize(rel) !== rel || !NAMESPACE_RE.test(rel)) throw new Error(`manifest: path outside approved namespaces in ${label}: ${rel}`)
}

function parseManifestStrict(raw, authority) {
    let json
    try { json = JSON.parse(raw) } catch (e) { throw new Error(`manifest: invalid JSON: ${e.message}`) }
    const expected = ['backup_rel', 'created_at', 'delete_list', 'expected_managed', 'failed_active_rel', 'live_rel', 'phase', 'prestate_full', 'prestate_unowned', 'schema_version', 'stage_rel', 'txid']
    const keys = Object.keys(json).sort()
    if (JSON.stringify(keys) !== JSON.stringify(expected)) throw new Error(`manifest: unknown or missing keys [${keys}]`)
    if (json.schema_version !== 1) throw new Error('manifest: unsupported schema_version')
    if (!PHASES.includes(json.phase)) throw new Error(`manifest: invalid phase ${json.phase}`)
    if (typeof json.txid !== 'string' || !/^txn-[0-9]+-[a-z0-9]+$/.test(json.txid)) throw new Error('manifest: invalid txid')
    if (typeof json.created_at !== 'string' || Number.isNaN(Date.parse(json.created_at)) || new Date(json.created_at).toISOString() !== json.created_at) throw new Error('manifest: invalid created_at')
    const fixed = { live_rel: REL(LIVE_RES), stage_rel: REL(STAGE_DIR), backup_rel: REL(BACKUP_DIR), failed_active_rel: REL(FAILED_ACTIVE_DIR) }
    for (const [k, v] of Object.entries(fixed)) {
        if (json[k] !== v) throw new Error(`manifest: ${k} must be the canonical fixed path "${v}", got "${json[k]}"`)
    }
    for (const mapKey of ['expected_managed', 'prestate_unowned', 'prestate_full']) {
        const m = json[mapKey]
        if (typeof m !== 'object' || m === null || Array.isArray(m)) throw new Error(`manifest: ${mapKey} must be an object`)
        for (const [rel, h] of Object.entries(m)) {
            assertManifestResourcePath(rel, mapKey)
            if (!/^[0-9a-f]{64}$/.test(h)) throw new Error(`manifest: ${mapKey}.${rel} is not a sha256`)
        }
    }
    if (!Array.isArray(json.delete_list)) throw new Error('manifest: delete_list must be an array')
    for (const rel of json.delete_list) assertManifestResourcePath(rel, 'delete_list')
    if (new Set(json.delete_list).size !== json.delete_list.length) throw new Error('manifest: delete_list contains duplicates')
    if (JSON.stringify([...json.delete_list].sort()) !== JSON.stringify(json.delete_list)) throw new Error('manifest: delete_list must be sorted')
    const managedKeys = Object.keys(json.expected_managed).sort()
    if (JSON.stringify(managedKeys) !== JSON.stringify([...authority.trackedPaths].sort())) throw new Error('manifest: expected_managed keys do not equal the frozen managed fixture')
    const expectedDeletes = authority.deletePaths.filter((rel) => rel in json.prestate_full)
    if (JSON.stringify(json.delete_list) !== JSON.stringify(expectedDeletes)) throw new Error('manifest: delete_list does not equal the frozen deletions present in prestate_full')
    const expectedUnownedKeys = Object.keys(json.prestate_full).filter((rel) => !authority.trackedSet.has(rel) && !json.delete_list.includes(rel)).sort()
    const unownedKeys = Object.keys(json.prestate_unowned).sort()
    if (JSON.stringify(unownedKeys) !== JSON.stringify(expectedUnownedKeys)) throw new Error('manifest: prestate_unowned keys do not match prestate_full minus managed/deleted paths')
    for (const rel of Object.keys(json.prestate_unowned)) {
        if (managedKeys.includes(rel)) throw new Error(`manifest: prestate_unowned overlaps managed: ${rel}`)
        if (json.prestate_unowned[rel] !== json.prestate_full[rel]) throw new Error(`manifest: prestate_unowned hash differs from prestate_full for ${rel}`)
    }
    return json
}

async function crashPointReached(marker) {
    if (testOpts['crash-after'] === marker) {
        console.log(JSON.stringify({ test_marker: marker }))
        setInterval(() => {}, 1000)
        await new Promise(() => {})
    }
}

// ---------- lock: atomic acquire AND atomic release/stale quarantine ----------
async function quarantineLockDir(dir) {
    const quarantine = `${dir}.quarantine-${process.pid}-${Date.now().toString(36)}`
    await fsp.rename(dir, quarantine)
    await crashPointReached('after_lock_quarantine_before_delete')
    await fsp.rm(quarantine, { recursive: true, force: true })
}

async function cleanupDeadQuarantines() {
    let entries = []
    try { entries = await fsp.readdir(LOCK_PARENT) } catch { return }
    for (const entry of entries) {
        if (!entry.startsWith('mobile-android-assets.lock.quarantine-')) continue
        const qdir = path.join(LOCK_PARENT, entry)
        let owner = null
        try { owner = JSON.parse(await fsp.readFile(path.join(qdir, 'owner.json'), 'utf8')) } catch { owner = null }
        if (owner && typeof owner.pid === 'number' && typeof owner.host === 'string'
            && owner.host === os.hostname() && !pidAlive(owner.pid)) {
            await fsp.rm(qdir, { recursive: true, force: true })
        }
    }
}

async function acquireLock() {
    await fsp.mkdir(LOCK_PARENT, { recursive: true })
    await assertContained(LOCK_PARENT, 'lock parent')
    await cleanupDeadQuarantines()
    ownTxid = `txn-${process.pid}-${Math.random().toString(36).slice(2, 8)}`
    for (let attempt = 0; attempt < 2; attempt += 1) {
        const tmpLock = await fsp.mkdtemp(path.join(LOCK_PARENT, '.acquiring-'))
        const owner = { pid: process.pid, host: os.hostname(), started_at: new Date().toISOString(), txid: ownTxid }
        const handle = await fsp.open(path.join(tmpLock, 'owner.json'), 'w')
        await handle.writeFile(JSON.stringify(owner, null, 2))
        await handle.sync()
        await handle.close()
        try {
            await fsp.rename(tmpLock, LOCK_DIR)
            lockHeld = true
            return
        } catch (e) {
            await fsp.rm(tmpLock, { recursive: true, force: true })
            if (!['EEXIST', 'EPERM', 'ENOTEMPTY', 'EACCES'].includes(e.code)) throw e
            let existing = null
            try { existing = JSON.parse(await fsp.readFile(OWNER_FILE, 'utf8')) } catch { existing = null }
            if (existing === null) throw new Error('lock dir exists without readable owner metadata; failing closed (manual inspection required)')
            if (typeof existing.pid !== 'number' || typeof existing.host !== 'string' || typeof existing.txid !== 'string') {
                throw new Error('lock owner metadata is malformed; failing closed (manual inspection required)')
            }
            if (existing.host === os.hostname() && pidAlive(existing.pid)) {
                throw new Error(`lock held by live pid ${existing.pid} on this host; failing closed before any mutation`)
            }
            if (existing.host !== os.hostname()) throw new Error(`lock held by another host (${existing.host}); failing closed`)
            await quarantineLockDir(LOCK_DIR)
        }
    }
    throw new Error('unable to acquire lock after stale recovery')
}

async function releaseLock() {
    if (!lockHeld || keepLockOnExit) return
    let owner = null
    try { owner = JSON.parse(await fsp.readFile(OWNER_FILE, 'utf8')) } catch { owner = null }
    if (!owner || owner.pid !== process.pid || owner.host !== os.hostname() || owner.txid !== ownTxid) {
        lockHeld = false
        throw new Error('lock owner mismatch at release; leaving lock untouched (manual inspection required)')
    }
    await quarantineLockDir(LOCK_DIR)
    lockHeld = false
}

// ---------- verification ----------
function verifyProjection(actualMap, expectedManaged, prestateUnowned, deleteList) {
    for (const [rel, hash] of Object.entries(expectedManaged)) {
        if (actualMap[rel] !== hash) throw new Error(`managed file mismatch or missing: ${rel}`)
    }
    for (const [rel, hash] of Object.entries(prestateUnowned)) {
        if (actualMap[rel] !== hash) throw new Error(`unowned file changed or missing: ${rel}`)
    }
    for (const rel of deleteList) {
        if (rel in actualMap) throw new Error(`allowlisted deletion still present: ${rel}`)
    }
    for (const rel of Object.keys(actualMap)) {
        if (!(rel in expectedManaged) && !(rel in prestateUnowned)) throw new Error(`unexpected path in live tree: ${rel}`)
    }
}

function mapsEqual(a, b) {
    const ka = Object.keys(a).sort()
    const kb = Object.keys(b).sort()
    if (JSON.stringify(ka) !== JSON.stringify(kb)) return false
    return ka.every((k) => a[k] === b[k])
}

const ALLOWED_PHASE_TOPOLOGIES = Object.freeze({
    prepared: new Set(['1100']),
    move_old_intent: new Set(['1100', '0110']),
    old_moved: new Set(['0110']),
    activate_new_intent: new Set(['0110', '1010']),
    new_active: new Set(['1010']),
    verify_intent: new Set(['1010']),
    verified: new Set(['1010', '1000']),
    restore_intent: new Set(['1010', '0011']),
    old_quarantined: new Set(['0011', '1001']),
    restored: new Set(['1001', '1000']),
})

function topologyKey({ live, stage, backup, failed }) {
    return [live, stage, backup, failed].map((value) => value ? '1' : '0').join('')
}

function assertAllowedPhaseTopology(phase, topology) {
    const key = topologyKey(topology)
    if (!ALLOWED_PHASE_TOPOLOGIES[phase]?.has(key)) {
        throw new Error(`phase=${phase} has ambiguous topology live=${topology.live} stage=${topology.stage} backup=${topology.backup} failed-active=${topology.failed}; failing closed, recovery material preserved`)
    }
}

async function verifyLiveBeforeVerifiedCleanup(manifest) {
    try {
        const activeMap = await hashTree(LIVE_RES)
        verifyProjection(activeMap, manifest.expected_managed, manifest.prestate_unowned, manifest.delete_list)
    } catch (cause) {
        const error = new Error(`phase=verified live no longer matches the verified projection: ${cause.message}; failing closed, backup and manifest preserved`)
        error.step = 'verify-active'
        error.code2 = 'VERIFIED_LIVE_CHANGED'
        error.recoveryRequired = true
        throw error
    }
}

// ---------- restore via quarantine (never delete live before backup is back) ----------
async function runRestoreSequence(manifest) {
    await crashPointReached('after_restore_intent_before_live_quarantine')
    throwIfCancelled()
    if (fs.existsSync(LIVE_RES)) {
        if (testOpts['fail-restore'] === '1') throw new Error('injected restore failure before live quarantine (test mode)')
        await fsp.rename(LIVE_RES, FAILED_ACTIVE_DIR)
    }
    await crashPointReached('after_live_quarantine_before_backup_restore')
    throwIfCancelled()
    await writeManifestPhase(manifest, 'old_quarantined')
    if (fs.existsSync(BACKUP_DIR)) {
        await fsp.rename(BACKUP_DIR, LIVE_RES)
    }
    await crashPointReached('after_backup_restore_before_restored_manifest')
    throwIfCancelled()
    await writeManifestPhase(manifest, 'restored')
    const restoredMap = await hashTree(LIVE_RES)
    if (!mapsEqual(restoredMap, manifest.prestate_full)) {
        throw new Error('restored live tree does not match prestate hashes')
    }
    if (fs.existsSync(FAILED_ACTIVE_DIR)) await fsp.rm(FAILED_ACTIVE_DIR, { recursive: true, force: true })
    await fsp.rm(MANIFEST_FILE, { force: true })
}

function recoveryRequired(step, message, code = null) {
    keepLockOnExit = true
    fail(step, message, {
        code,
        recovery_required: true,
        fields: {
            backup: fs.existsSync(BACKUP_DIR) ? REL(BACKUP_DIR) : null,
            failed_active: fs.existsSync(FAILED_ACTIVE_DIR) ? REL(FAILED_ACTIVE_DIR) : null,
            manifest: fs.existsSync(MANIFEST_FILE) ? REL(MANIFEST_FILE) : null,
        },
    })
}

// ---------- topology-aware reconciliation ----------
async function reconcile(authority) {
    const L = fs.existsSync(LIVE_RES)
    const S = fs.existsSync(STAGE_DIR)
    const B = fs.existsSync(BACKUP_DIR)
    const F = fs.existsSync(FAILED_ACTIVE_DIR)
    if (!fs.existsSync(MANIFEST_FILE)) {
        if (B || F) throw new Error(`topology without manifest is ambiguous (backup=${B}, failed-active=${F}); failing closed, recovery material preserved`)
        if (S) await fsp.rm(STAGE_DIR, { recursive: true, force: true })
        return false
    }
    const manifest = parseManifestStrict(await fsp.readFile(MANIFEST_FILE, 'utf8'), authority)
    const phase = manifest.phase
    assertAllowedPhaseTopology(phase, { live: L, stage: S, backup: B, failed: F })

    async function completeActivationFrom(startPhase) {
        let current = startPhase
        if (current === 'old_moved' || current === 'move_old_intent') {
            await writeManifestPhase(manifest, 'activate_new_intent')
            await crashPointReached('after_activate_new_intent_before_rename')
            if (fs.existsSync(STAGE_DIR) && !fs.existsSync(LIVE_RES)) await fsp.rename(STAGE_DIR, LIVE_RES)
            await crashPointReached('after_stage_to_live_before_new_active_manifest')
            await writeManifestPhase(manifest, 'new_active')
            await crashPointReached('after_new_active_manifest')
            current = 'new_active'
        }
        if (current === 'activate_new_intent') {
            if (fs.existsSync(STAGE_DIR) && !fs.existsSync(LIVE_RES)) await fsp.rename(STAGE_DIR, LIVE_RES)
            else if (!fs.existsSync(LIVE_RES)) throw new Error('activate_new_intent with no stage and no live; ambiguous topology, failing closed')
            await writeManifestPhase(manifest, 'new_active')
            current = 'new_active'
        }
        if (current === 'new_active' || current === 'verify_intent') {
            await writeManifestPhase(manifest, 'verify_intent')
            let ok = true
            let reason = ''
            try {
                const activeMap = await hashTree(LIVE_RES)
                verifyProjection(activeMap, manifest.expected_managed, manifest.prestate_unowned, manifest.delete_list)
            } catch (e) { ok = false; reason = e.message }
            if (ok) {
                await writeManifestPhase(manifest, 'verified')
                await crashPointReached('after_verified_manifest_before_backup_cleanup')
                throwIfCancelled()
                await verifyLiveBeforeVerifiedCleanup(manifest)
                if (fs.existsSync(BACKUP_DIR)) await fsp.rm(BACKUP_DIR, { recursive: true, force: true })
                await fsp.rm(MANIFEST_FILE, { force: true })
                return { recovered: true }
            }
            await writeManifestPhase(manifest, 'restore_intent')
            await runRestoreSequence(manifest)
            return { recovered: true, restoredBecause: reason }
        }
        if (current === 'verified') {
            await verifyLiveBeforeVerifiedCleanup(manifest)
            if (fs.existsSync(BACKUP_DIR)) await fsp.rm(BACKUP_DIR, { recursive: true, force: true })
            if (fs.existsSync(STAGE_DIR)) await fsp.rm(STAGE_DIR, { recursive: true, force: true })
            await fsp.rm(MANIFEST_FILE, { force: true })
            return { recovered: true }
        }
        throw new Error(`unhandled completion from phase ${current}`)
    }

    switch (phase) {
        case 'prepared': {
            if (S) await fsp.rm(STAGE_DIR, { recursive: true, force: true })
            await fsp.rm(MANIFEST_FILE, { force: true })
            return true
        }
        case 'move_old_intent': {
            if (L && !B) {
                if (S) await fsp.rm(STAGE_DIR, { recursive: true, force: true })
                await fsp.rm(MANIFEST_FILE, { force: true })
                return true
            }
            if (!L && B && S) {
                await writeManifestPhase(manifest, 'old_moved')
                await completeActivationFrom('old_moved')
                return true
            }
            throw new Error('phase=move_old_intent reached an unhandled allowed topology; failing closed')
        }
        case 'old_moved': {
            if (!L && B && S) { await completeActivationFrom('old_moved'); return true }
            throw new Error('phase=old_moved reached an unhandled allowed topology; failing closed')
        }
        case 'activate_new_intent': {
            if ((S && !L) || (!S && L)) { await completeActivationFrom('activate_new_intent'); return true }
            throw new Error('phase=activate_new_intent reached an unhandled allowed topology; failing closed')
        }
        case 'new_active':
        case 'verify_intent': {
            await completeActivationFrom('new_active')
            return true
        }
        case 'verified': {
            await completeActivationFrom('verified')
            return true
        }
        case 'restore_intent': {
            await runRestoreSequence(manifest)
            return true
        }
        case 'old_quarantined': {
            if (B && !L) {
                await fsp.rename(BACKUP_DIR, LIVE_RES)
                await writeManifestPhase(manifest, 'restored')
            } else if (!B && L) {
                await writeManifestPhase(manifest, 'restored')
            }
            const restoredMap = await hashTree(LIVE_RES)
            if (!mapsEqual(restoredMap, manifest.prestate_full)) throw new Error('restored live tree does not match prestate hashes; failing closed')
            if (fs.existsSync(FAILED_ACTIVE_DIR)) await fsp.rm(FAILED_ACTIVE_DIR, { recursive: true, force: true })
            await fsp.rm(MANIFEST_FILE, { force: true })
            return true
        }
        case 'restored': {
            const restoredMap = await hashTree(LIVE_RES)
            if (!mapsEqual(restoredMap, manifest.prestate_full)) throw new Error('restored live tree does not match prestate hashes; failing closed')
            if (fs.existsSync(FAILED_ACTIVE_DIR)) await fsp.rm(FAILED_ACTIVE_DIR, { recursive: true, force: true })
            await fsp.rm(MANIFEST_FILE, { force: true })
            return true
        }
        default:
            throw new Error(`unknown phase ${phase}`)
    }
}

// ---------- generator child ----------
function terminateOwnedProcessTree(child) {
    if (child.exitCode !== null || child.signalCode !== null) return Promise.resolve()
    return new Promise((resolve, reject) => {
        if (process.platform !== 'win32') {
            const sent = child.kill('SIGKILL')
            if (!sent && child.exitCode === null && child.signalCode === null) reject(new Error(`failed to signal owned child pid ${child.pid}`))
            else resolve()
            return
        }
        let stderr = ''
        const killer = spawn('taskkill', ['/PID', String(child.pid), '/T', '/F'], { windowsHide: true, stdio: ['ignore', 'ignore', 'pipe'] })
        killer.stderr.on('data', (chunk) => { if (stderr.length < 1024) stderr += chunk.toString() })
        killer.once('error', (error) => reject(new Error(`taskkill failed to start for pid ${child.pid}: ${error.message}`)))
        killer.once('close', (code) => {
            if (code === 0 || child.exitCode !== null || child.signalCode !== null) resolve()
            else reject(new Error(`taskkill /T /F failed for pid ${child.pid} with code ${code}: ${stderr}`))
        })
    })
}

function runGenerator(cwd) {
    const command = testOpts['spawn-error'] === '1' ? path.join(HERE, 'no-such-executable.exe') : (testOpts['generator-missing'] === '1' ? generatorBin : process.execPath)
    const treeFixture = testOpts.timeout === '1' || testOpts.cancel === '1'
    const treeScript = `const {spawn}=require('node:child_process');const fs=require('node:fs');const c=spawn(process.execPath,['-e','setInterval(()=>{},1000)'],{stdio:'ignore'});fs.writeFileSync(${JSON.stringify(TEST_DESCENDANT_PID_FILE)},String(c.pid));setInterval(()=>{},1000)`
    const args = treeFixture
        ? ['-e', treeScript]
        : testOpts['close-code'] ? ['-e', `process.exit(${Number(testOpts['close-code'])})`]
            : (testOpts['spawn-error'] === '1' || testOpts['generator-missing'] === '1') ? ['generate'] : [generatorBin, 'generate', '--android', '--assetPath', 'assets']
    return new Promise((resolve, reject) => {
        let stderrBuf = ''
        let settled = false
        let killReason = null
        let terminationError = null
        let terminationPromise = null
        const child = spawn(command, args, { cwd, env: { ...process.env, CI: '1' }, stdio: ['ignore', 'ignore', 'pipe'] })
        child.stderr.on('data', (chunk) => { if (stderrBuf.length < 2048) stderrBuf += chunk.toString() })
        const timeoutMs = testOpts.timeout === '1' ? 2000 : GENERATOR_TIMEOUT_MS
        const requestTermination = (reason) => {
            if (killReason !== null) return
            killReason = reason
            terminationPromise = terminateOwnedProcessTree(child).catch((error) => { terminationError = error; child.kill('SIGKILL') })
        }
        cancelActiveChild = requestTermination
        const timer = setTimeout(() => requestTermination(`timeout after ${timeoutMs}ms`), timeoutMs)
        if (testOpts.cancel === '1') setTimeout(() => requestTermination('cancellation requested'), 300)
        child.on('error', (e) => {
            if (!settled) {
                settled = true
                cancelActiveChild = null
                clearTimeout(timer)
                const err = new Error(`generator spawn error: ${e.code ?? ''} ${e.message}`)
                err.code2 = 'GENERATOR_SPAWN_FAILED'
                reject(err)
            }
        })
        child.on('close', (code, signal) => {
            if (settled) return
            settled = true
            cancelActiveChild = null
            clearTimeout(timer)
            void (async () => {
                if (terminationPromise !== null) await terminationPromise
                if (terminationError !== null) {
                    const error = new Error(`owned generator process tree termination failed: ${terminationError.message}`)
                    error.code2 = 'PROCESS_TREE_TERMINATION_FAILED'
                    reject(error)
                } else if (cancellationSignal !== null) reject(cancellationError())
                else if (killReason !== null) {
                    const error = new Error(`generator killed (${killReason}); child closed with signal ${signal}`)
                    error.code2 = killReason.startsWith('timeout') ? 'GENERATOR_TIMEOUT' : 'CANCELLED'
                    reject(error)
                }
                else if (code === 0) resolve()
                else {
                    const error = new Error(`generator closed with code ${code} signal ${signal}; stderr: ${stderrBuf}`)
                    error.code2 = 'GENERATOR_EXIT_NONZERO'
                    reject(error)
                }
            })()
        })
    })
}

function circleMask(size) {
    return Buffer.from(`<svg width="${size}" height="${size}" xmlns="http://www.w3.org/2000/svg"><circle cx="${size / 2}" cy="${size / 2}" r="${size / 2}" fill="#fff"/></svg>`)
}

async function waitForFlag(marker, flagName) {
    console.log(JSON.stringify({ test_marker: marker }))
    const flagFile = path.join(STATE_DIR, flagName)
    for (let i = 0; i < 300; i += 1) {
        throwIfCancelled()
        if (fs.existsSync(flagFile)) return
        await new Promise((r) => setTimeout(r, 100))
    }
    throw new Error(`flag file never appeared (harness timeout): ${flagName}`)
}

// ---------- main ----------
async function main() {
    if (terminalEmitted) return
    await loadTooling()
    throwIfCancelled()

    const fixtureDir = HERE
    const onDiskFile = testOpts['fixture-ondisk'] ? path.join(fixtureDir, 'bad-fixtures', `${testOpts['fixture-ondisk']}.json`) : path.join(fixtureDir, 'fixture-on-disk-43.json')
    const managedFile = testOpts['fixture-managed'] ? path.join(fixtureDir, 'bad-fixtures', `${testOpts['fixture-managed']}.json`) : path.join(fixtureDir, 'fixture-tracked-42.json')
    const deleteFile = testOpts['fixture-delete'] ? path.join(fixtureDir, 'bad-fixtures', `${testOpts['fixture-delete']}.json`) : path.join(fixtureDir, 'delete-allowlist.json')
    const onDiskPaths = parseFixture(onDiskFile, 'on-disk', 43)
    const trackedPaths = parseFixture(managedFile, 'managed', 42)
    const deletePaths = parseFixture(deleteFile, 'delete-allowlist', 3)
    const onDiskSet = new Set(onDiskPaths)
    const trackedSet = new Set(trackedPaths)
    for (const p of trackedPaths) if (!onDiskSet.has(p)) throw new Error(`tracked path absent from on-disk fixture: ${p}`)
    const diff = onDiskPaths.filter((p) => !trackedSet.has(p))
    if (diff.length !== 1 || diff[0] !== 'xml/config.xml') throw new Error(`on-disk minus managed must be exactly xml/config.xml, got [${diff}]`)
    if (JSON.stringify([...deletePaths].sort()) !== JSON.stringify(FROZEN_DELETE_SET)) {
        throw new Error(`delete-allowlist must equal exactly the frozen orphan set [${FROZEN_DELETE_SET}], got [${deletePaths}]`)
    }
    for (const p of deletePaths) if (trackedSet.has(p)) throw new Error(`delete-allowlist entry overlaps managed set: ${p}`)

    for (const [root, label, required] of [[LIVE_RES, 'live res root', false], [RES_PARENT, 'res parent', true], [WORK_PARENT, 'work parent', false], [LOCK_PARENT, 'lock parent', false], [TXN_DIR, 'txn dir', false], [STAGE_DIR, 'stage root', false], [BACKUP_DIR, 'backup root', false], [FAILED_ACTIVE_DIR, 'failed-active root', false]]) {
        await assertContained(root, label)
        await assertDirectoryRoot(root, label, required)
    }

    await fsp.mkdir(STATE_DIR, { recursive: true })
    await acquireLock()
    throwIfCancelled()
    if (fs.existsSync(WORK_PARENT)) {
        for (const entry of await fsp.readdir(WORK_PARENT)) {
            await fsp.rm(path.join(WORK_PARENT, entry), { recursive: true, force: true })
        }
    }
    let recovered = false
    try {
        recovered = await reconcile({ trackedPaths, trackedSet, deletePaths })
    } catch (reconcileError) {
        recoveryRequired(reconcileError.step ?? 'reconcile', reconcileError.message, reconcileError.code2 ?? null)
        return
    }
    throwIfCancelled()
    await assertDirectoryRoot(LIVE_RES, 'live res root (post-reconcile)', true)

    const stockHashes = new Map()
    for (const line of fs.readFileSync(STOCK_CHECKSUMS, 'utf8').split('\n')) {
        const m = line.match(/^([0-9a-f]{64})\s+android\/app\/src\/main\/res\/(.+)$/)
        if (m) stockHashes.set(m[2].trim(), m[1])
    }

    await fsp.mkdir(WORK_PARENT, { recursive: true })
    owned.workRoot = await fsp.mkdtemp(path.join(WORK_PARENT, 'gen-'))
    const generationBaseAllow = new Set([...onDiskPaths, ...FROZEN_DELETE_SET])
    await assembleGenerationProject(owned.workRoot, generationBaseAllow)
    const workRes = path.join(owned.workRoot, 'android', 'app', 'src', 'main', 'res')
    const sourceColorsHash = sha256(path.join(LIVE_RES, 'values', 'colors.xml'))
    await runGenerator(owned.workRoot)
    throwIfCancelled()
    for (const [density, size] of Object.entries(DENSITIES)) {
        const dir = path.join(workRes, `mipmap-${density}`)
        const flat = await sharp(path.join(dir, 'ic_launcher_background.png')).resize(size, size)
            .composite([{ input: await sharp(path.join(dir, 'ic_launcher_foreground.png')).resize(size, size).png().toBuffer() }]).png().toBuffer()
        await sharp(flat).png().toFile(path.join(dir, 'ic_launcher.png'))
        await sharp(flat).composite([{ input: circleMask(size), blend: 'dest-in' }]).png().toFile(path.join(dir, 'ic_launcher_round.png'))
    }
    for (const orphan of WORK_ORPHANS) {
        const file = path.join(workRes, orphan)
        if (fs.existsSync(file)) await fsp.unlink(file)
    }
    const workList = await listFiles(workRes)
    if (JSON.stringify(workList) !== JSON.stringify(onDiskPaths)) {
        throw new Error(`on-disk set mismatch: missing=[${onDiskPaths.filter((f) => !workList.includes(f))}] extra=[${workList.filter((f) => !onDiskSet.has(f))}]`)
    }
    if (sha256(path.join(workRes, 'values', 'colors.xml')) !== sourceColorsHash) throw new Error('values/colors.xml did not survive generation unchanged')
    for (const [density, size] of Object.entries(DENSITIES)) {
        for (const name of ['ic_launcher.png', 'ic_launcher_round.png']) {
            const meta = await sharp(path.join(workRes, `mipmap-${density}`, name)).metadata()
            if (meta.width !== size || meta.height !== size) throw new Error(`${density}/${name} wrong dimensions`)
        }
    }
    for (const rel of workList) {
        const stock = stockHashes.get(rel)
        if (stock && rel.endsWith('.png') && sha256(path.join(workRes, rel)) === stock) throw new Error(`stock hash still present: ${rel}`)
    }

    const prestateFull = await hashTree(LIVE_RES)
    const expectedManaged = {}
    for (const rel of trackedPaths) expectedManaged[rel] = sha256(path.join(workRes, ...rel.split('/')))
    const deleteApplied = deletePaths.filter((rel) => rel in prestateFull)
    const prestateUnowned = {}
    for (const [rel, hash] of Object.entries(prestateFull)) {
        if (!trackedSet.has(rel) && !deletePaths.includes(rel)) prestateUnowned[rel] = hash
    }

    if (fs.existsSync(STAGE_DIR)) await fsp.rm(STAGE_DIR, { recursive: true, force: true })
    await guardedCopyTree(LIVE_RES, STAGE_DIR)
    owned.stageCreated = true
    let overlayCount = 0
    for (const rel of trackedPaths) {
        const dest = path.join(STAGE_DIR, ...rel.split('/'))
        await fsp.mkdir(path.dirname(dest), { recursive: true })
        await fsp.copyFile(path.join(workRes, ...rel.split('/')), dest)
        overlayCount += 1
        if (testOpts['fail-after'] && overlayCount >= Number(testOpts['fail-after'])) {
            throw new Error(`injected cooperative failure after ${overlayCount} staged copies (live tree untouched)`)
        }
    }
    for (const rel of deleteApplied) await fsp.rm(path.join(STAGE_DIR, ...rel.split('/')), { force: true })
    const stageMap = await hashTree(STAGE_DIR)
    verifyProjection(stageMap, expectedManaged, prestateUnowned, deleteApplied)

    if (testOpts.sigint === '1') process.emit('SIGINT')
    if (testOpts['pause-at-fence']) await waitForFlag('stage_verified', testOpts['pause-at-fence'])
    throwIfCancelled()

    owned.txnFresh = true
    const manifest = {
        schema_version: 1,
        txid: ownTxid,
        phase: 'prepared',
        created_at: new Date().toISOString(),
        live_rel: REL(LIVE_RES),
        stage_rel: REL(STAGE_DIR),
        backup_rel: REL(BACKUP_DIR),
        failed_active_rel: REL(FAILED_ACTIVE_DIR),
        delete_list: deleteApplied,
        expected_managed: expectedManaged,
        prestate_unowned: prestateUnowned,
        prestate_full: prestateFull,
    }
    await writeManifestPhase(manifest, 'prepared')
    await crashPointReached('after_prepared_manifest')

    const fenceMap = await hashTree(LIVE_RES)
    if (!mapsEqual(fenceMap, prestateFull)) {
        await fsp.rm(STAGE_DIR, { recursive: true, force: true })
        await fsp.rm(MANIFEST_FILE, { force: true })
        await fsp.rm(owned.workRoot, { recursive: true, force: true })
        const e = new Error('live tree changed by an external writer between staging and activation; failing closed without any rename')
        e.step = 'fence'; e.code2 = 'LIVE_TREE_CHANGED'; e.cleanupDone = true
        throw e
    }
    throwIfCancelled()

    await assertContained(RES_PARENT, 'res parent (pre-activation)')
    await assertContained(STAGE_DIR, 'stage root (pre-activation)')
    await assertContained(LIVE_RES, 'live res root (pre-activation)')
    if (fs.existsSync(BACKUP_DIR)) throw new Error('backup path already occupied; refusing activation')
    if (fs.existsSync(FAILED_ACTIVE_DIR)) throw new Error('failed-active path already occupied; refusing activation')

    await writeManifestPhase(manifest, 'move_old_intent')
    owned.firstRenameDone = true
    await crashPointReached('after_move_old_intent_before_rename')
    throwIfCancelled()
    await fsp.rename(LIVE_RES, BACKUP_DIR)
    await crashPointReached('after_live_to_backup_before_old_moved_manifest')
    throwIfCancelled()
    await writeManifestPhase(manifest, 'old_moved')
    await crashPointReached('after_old_moved_manifest')
    throwIfCancelled()

    await writeManifestPhase(manifest, 'activate_new_intent')
    await crashPointReached('after_activate_new_intent_before_rename')
    throwIfCancelled()
    await fsp.rename(STAGE_DIR, LIVE_RES)
    await crashPointReached('after_stage_to_live_before_new_active_manifest')
    throwIfCancelled()
    await writeManifestPhase(manifest, 'new_active')
    await crashPointReached('after_new_active_manifest')
    throwIfCancelled()

    if (testOpts['corrupt-active'] === '1') {
        await fsp.writeFile(path.join(LIVE_RES, 'values', 'colors.xml'), '<corrupted/>')
    }

    await writeManifestPhase(manifest, 'verify_intent')
    let verifyError = null
    try {
        const activeMap = await hashTree(LIVE_RES)
        verifyProjection(activeMap, expectedManaged, prestateUnowned, deleteApplied)
    } catch (e) { verifyError = e }

    if (verifyError === null) {
        await writeManifestPhase(manifest, 'verified')
        await crashPointReached('after_verified_manifest_before_backup_cleanup')
        if (testOpts['pause-after-verified']) await waitForFlag('verified_persisted', testOpts['pause-after-verified'])
        throwIfCancelled()
        await verifyLiveBeforeVerifiedCleanup(manifest)
        await fsp.rm(BACKUP_DIR, { recursive: true, force: true })
        await fsp.rm(MANIFEST_FILE, { force: true })
        await fsp.rm(owned.workRoot, { recursive: true, force: true })
        await releaseLock()
        emit({ generated_on_disk: workList.length, managed_promoted: trackedPaths.length, preserved_unowned: Object.keys(prestateUnowned).length, deleted_owned: deleteApplied.length, recovered, status: 'ok' }, 0)
        return
    }

    try {
        await writeManifestPhase(manifest, 'restore_intent')
        await runRestoreSequence(manifest)
        await fsp.rm(owned.workRoot, { recursive: true, force: true })
        fail('verify-active', `active verification failed and backup was restored: ${verifyError.message}`, { recovered: true })
        await releaseLock()
    } catch (restoreError) {
        recoveryRequired(restoreError.step ?? 'restore', `restore failed: ${restoreError.message}`, restoreError.code2 ?? null)
    }
}

main().catch(async (error) => {
    try {
        if (!owned.firstRenameDone && error.cleanupDone !== true) {
            if (owned.stageCreated && fs.existsSync(STAGE_DIR)) await fsp.rm(STAGE_DIR, { recursive: true, force: true })
            if (owned.txnFresh && owned.manifestWritten && fs.existsSync(MANIFEST_FILE)) await fsp.rm(MANIFEST_FILE, { force: true })
            if (owned.workRoot && fs.existsSync(owned.workRoot)) await fsp.rm(owned.workRoot, { recursive: true, force: true })
        }
    } catch (cleanupError) {
        fail(error.step ?? 'pipeline', `${error.message}; ADDITIONALLY cleanup failed: ${cleanupError.message}`, { code: error.code2 ?? 'CLEANUP_FAILED' })
        return
    }
    if (error.cancelled) fail('signal', error.message, { code: 'CANCELLED' })
    else fail(error.step ?? 'pipeline', error.message, { code: error.code2 ?? null })
}).finally(async () => {
    try { await releaseLock() } catch (e) {
        if (!terminalEmitted) fail('lock-release', e.message, { code: 'LOCK_RELEASE_FAILED' })
    }
})
