import { createHash } from 'node:crypto'
import { spawn } from 'node:child_process'
import {
    createReadStream,
    createWriteStream,
    existsSync,
} from 'node:fs'
import {
    mkdir,
    mkdtemp,
    readFile,
    rm,
    stat,
    statfs,
    writeFile,
} from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { createServer } from 'node:net'
import {
    basename,
    dirname,
    isAbsolute,
    join,
    resolve,
} from 'node:path'
import { pipeline } from 'node:stream/promises'
import { fileURLToPath, pathToFileURL } from 'node:url'

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url))
const MOBILE_ROOT = resolve(SCRIPT_DIR, '..')
const MANIFEST_PATH = resolve(MOBILE_ROOT, 'tests/fixtures/local-model-compatibility.json')
const EVIDENCE_DIR = resolve(MOBILE_ROOT, 'docs/superpowers/evidence/model-lab/corrective')
const REPORT_PATH = resolve(EVIDENCE_DIR, 'local-model-compatibility-report.json')
const HOST_RESERVE_BYTES = 1024 ** 3
const DEVICE_RESERVE_BYTES = 1024 ** 3
const CDP_PORT = 9222
const INSTRUMENTATION = 'ai.talos.dev.test/androidx.test.runner.AndroidJUnitRunner'
const DEVICE_TEST = 'ai.talos.TalosLlamaEngineDeviceTest#appliesEmbeddedTemplateAndGeneratesAVisibleReply'
const DEVICE_CLEANUP_TEST = 'ai.talos.TalosLlamaEngineDeviceTest#cleansCompatibilityCampaignFiles'
const SCREENSHOTS = Object.freeze({
    C1: 'local-compat-smollm2-chat.png',
    C2: 'local-chat-qwen-recovered.png',
    C3: 'local-compat-lfm2-chat.png',
    C4: 'local-compat-granite4-chat.png',
    C5: 'local-compat-phi3-chat.png',
    C6: 'local-compat-llama32-chat.png',
    C7: 'local-compat-gemma3-chat.png',
})

const FORBIDDEN_REPLY_MARKERS = Object.freeze([
    'TALOS_MEMORY_CONTEXT',
    'TALOS_mem_present',
    'MEMORY 1',
    'USER_TASK',
    'The underlying language model serving',
    'When asked who you are',
    "The user's selected tone preset",
    'Attached images are user-provided content',
])

function invariant(condition, message) {
    if (!condition) throw new Error(message)
}

/**
 * Il modello ha fatto quello che gli era stato chiesto?
 *
 * OSSERVAZIONE, non cancello. C6 ha caricato, generato in italiano e reso in
 * chat senza crash, poi ha risposto «Scopri l'intero futuro.» ignorando la
 * richiesta di includere `TALOS`. Chiamarlo FAIL significava dire «TALOS non e'
 * compatibile con Llama 3.2», che e' falso: il runtime aveva funzionato in ogni
 * suo strato.
 *
 * Sono due domande diverse e meritano due risposte diverse. La stessa cosa era
 * gia' emersa su C2 e C4, ma era finita in prosa nel ledger invece che nel
 * verdetto.
 */
export function compatibilityInstructionMarker(reply) {
    return String(reply ?? '').includes('TALOS')
}

/**
 * Le sole cose che possono ancora far fallire un caso sulla risposta.
 *
 * Vuoto: il modello non ha prodotto niente, quindi non c'e' compatibilita' da
 * dichiarare. Eco di contesto: memorie dell'owner o prompt di sistema nel
 * testo — `18O` — che e' privacy e non qualita'.
 *
 * Il marker `TALOS` **e' stato tolto da qui** (2026-08-05). Non riapre `18L`,
 * il falso PASS: quella regressione e' impedita dal confine DOM in
 * `exerciseRealChat`, che legge solo `talos-mobile-message-content` e mai il
 * footer. Il marker la copriva per coincidenza, non per costruzione.
 */
export function validateCompatibilityReply(caseId, reply) {
    const normalized = String(reply ?? '').trim()
    invariant(normalized.length > 0,
        `TALOS_LOCAL_COMPATIBILITY_EMPTY_REPLY:${caseId}`)
    const foldedReply = normalized.toLocaleLowerCase('en-US')
    const echoedMarker = FORBIDDEN_REPLY_MARKERS.find((marker) =>
        foldedReply.includes(marker.toLocaleLowerCase('en-US')))
    invariant(!echoedMarker,
        `TALOS_LOCAL_COMPATIBILITY_CONTEXT_ECHO:${caseId}:${echoedMarker}`)
    return normalized
}

/** Oltre questo, una risposta non aggiunge diagnosi: aggiunge peso al report. */
const DIAGNOSTIC_REPLY_LIMIT = 1000

/**
 * Cosa scrivere nel report quando un caso fallisce.
 *
 * C6 e' fallito sul marker e il report ha conservato soltanto `status: FAIL`.
 * La frase che aveva causato il fallimento era stata letta e poi buttata, quindi
 * capire il perche' costava un ciclo intero sul dispositivo per rileggerla.
 *
 * L'eccezione che conta: quando il fallimento **e' proprio** un eco di
 * contesto, quel testo e' cio' che non deve entrare in un artefatto. Li' si
 * registra la causa e si redige il contenuto — la stessa scelta fatta a mano
 * per il PNG di C3, resa automatica cosi' non dipende piu' da chi guarda.
 */
export function compatibilityFailureDiagnostic(caseId, reply, error) {
    const reason = String(error?.message ?? error ?? 'UNKNOWN')
    if (reason.includes('TALOS_LOCAL_COMPATIBILITY_CONTEXT_ECHO')) {
        return { reason, observedReply: '[REDACTED_CONTEXT_ECHO]' }
    }
    const text = String(reply ?? '').trim()
    // Il troncamento si DICHIARA: uno silenzioso si legge come la risposta
    // intera, ed e' il modo piu' facile di diagnosticare la cosa sbagliata.
    const observedReply = text.length > DIAGNOSTIC_REPLY_LIMIT
        ? `${text.slice(0, DIAGNOSTIC_REPLY_LIMIT)}… [troncata a ${DIAGNOSTIC_REPLY_LIMIT} caratteri]`
        : text
    return { reason, observedReply }
}

function slash(value) {
    return String(value).replaceAll('\\', '/')
}

export function resolveSelectedCases(manifest, requestedIds) {
    const requested = new Set(requestedIds.map((value) => String(value).trim().toUpperCase()).filter(Boolean))
    if (!requested.size) return [...manifest.cases]
    const known = new Set(manifest.cases.map((entry) => entry.id))
    for (const id of requested) invariant(known.has(id), `Unknown compatibility case: ${id}`)
    return manifest.cases.filter((entry) => requested.has(entry.id))
}

export function assertSafeCampaignRelativePath(manifest, relativePath) {
    const candidate = slash(relativePath)
    invariant(candidate === relativePath, `Backslashes are not allowed in campaign paths: ${relativePath}`)
    invariant(!isAbsolute(candidate) && !candidate.startsWith('/'), `Absolute campaign path refused: ${relativePath}`)
    invariant(!candidate.split('/').includes('..'), `Campaign path traversal refused: ${relativePath}`)
    invariant(!candidate.includes(':') && !candidate.includes('\0'), `Malformed campaign path refused: ${relativePath}`)

    if (candidate === manifest.target.nativeRelativePath) return candidate
    const allowed = new Set(manifest.cases.map((entry) =>
        `${manifest.target.uiRelativeRoot}/${entry.id}/talos-compat.gguf`))
    invariant(allowed.has(candidate), `Campaign path is outside the allowlist: ${relativePath}`)
    return candidate
}

function validateManifest(manifest) {
    invariant(manifest?.schemaVersion === 1, 'Compatibility manifest schema must be 1')
    invariant(manifest?.maxConcurrency === 1, 'Compatibility campaign must have maxConcurrency=1')
    invariant(manifest?.target?.packageId === 'ai.talos.dev', 'Compatibility package must be ai.talos.dev')
    assertSafeCampaignRelativePath(manifest, manifest.target.nativeRelativePath)
    invariant(Array.isArray(manifest.cases) && manifest.cases.length > 0, 'Compatibility manifest has no cases')

    const ids = new Set()
    for (const entry of manifest.cases) {
        invariant(!ids.has(entry.id), `Duplicate compatibility case: ${entry.id}`)
        ids.add(entry.id)
        invariant(/^[A-Z][0-9]+$/.test(entry.id), `Invalid compatibility case id: ${entry.id}`)
        invariant(/^[0-9a-f]{40}$/.test(entry.revision), `Mutable or invalid revision for ${entry.id}`)
        invariant(/^[0-9a-f]{64}$/.test(entry.sha256), `Invalid SHA-256 for ${entry.id}`)
        invariant(Number.isSafeInteger(entry.bytes) && entry.bytes > 0, `Invalid byte count for ${entry.id}`)
        invariant(/^[^/\\]+\.gguf$/i.test(entry.file), `Unsafe GGUF filename for ${entry.id}`)
        invariant(typeof entry.prompt === 'string' && entry.prompt.trim().length > 0,
            `Compatibility prompt is required for ${entry.id}`)
        assertSafeCampaignRelativePath(
            manifest,
            `${manifest.target.uiRelativeRoot}/${entry.id}/talos-compat.gguf`,
        )
    }
}

function parseArguments(argv) {
    const options = {
        adb: process.env.ADB_PATH || '',
        serial: process.env.TALOS_DEVICE_SERIAL || '',
        cases: [],
        nativeOnly: false,
        cleanupOnly: false,
        uiTimeoutMs: 12 * 60 * 1000,
    }
    for (let index = 0; index < argv.length; index += 1) {
        const argument = argv[index]
        if (argument === '--adb') options.adb = argv[++index] || ''
        else if (argument === '--serial') options.serial = argv[++index] || ''
        else if (argument === '--cases') options.cases.push(...(argv[++index] || '').split(','))
        else if (argument === '--native-only') options.nativeOnly = true
        else if (argument === '--cleanup-only') options.cleanupOnly = true
        else if (argument === '--ui-timeout-ms') options.uiTimeoutMs = Number(argv[++index])
        else if (argument === '--help') options.help = true
        else throw new Error(`Unknown argument: ${argument}`)
    }
    invariant(Number.isFinite(options.uiTimeoutMs) && options.uiTimeoutMs >= 60_000,
        '--ui-timeout-ms must be at least 60000')
    return options
}

function defaultAdbPath() {
    const sdkRoot = process.env.ANDROID_HOME || process.env.ANDROID_SDK_ROOT
    if (sdkRoot) return join(sdkRoot, 'platform-tools', process.platform === 'win32' ? 'adb.exe' : 'adb')
    if (process.platform === 'win32' && process.env.LOCALAPPDATA) {
        return join(process.env.LOCALAPPDATA, 'Android', 'Sdk', 'platform-tools', 'adb.exe')
    }
    return 'adb'
}

function command(executable, args, { inputFile, binaryStdoutFile, timeoutMs = 120_000 } = {}) {
    return new Promise((resolveCommand, rejectCommand) => {
        const child = spawn(executable, args, {
            cwd: MOBILE_ROOT,
            windowsHide: true,
            stdio: ['pipe', 'pipe', 'pipe'],
        })
        const stdout = []
        const stderr = []
        let outputStream = null
        let timedOut = false
        let timer = null

        if (binaryStdoutFile) {
            outputStream = createWriteStream(binaryStdoutFile, { flags: 'wx' })
            child.stdout.pipe(outputStream)
        } else {
            child.stdout.on('data', (chunk) => stdout.push(chunk))
        }
        child.stderr.on('data', (chunk) => stderr.push(chunk))

        if (inputFile) {
            const source = createReadStream(inputFile)
            source.on('error', (error) => child.stdin.destroy(error))
            source.pipe(child.stdin)
        } else {
            child.stdin.end()
        }

        if (timeoutMs > 0) {
            timer = setTimeout(() => {
                timedOut = true
                child.kill()
            }, timeoutMs)
        }

        child.on('error', rejectCommand)
        child.on('close', (code) => {
            if (timer) clearTimeout(timer)
            const finish = () => {
                const result = {
                    code: code ?? -1,
                    stdout: Buffer.concat(stdout).toString('utf8').trim(),
                    stderr: Buffer.concat(stderr).toString('utf8').trim(),
                }
                if (timedOut) {
                    rejectCommand(new Error(`Command timed out: ${basename(executable)} ${args.join(' ')}`))
                } else if (result.code !== 0) {
                    rejectCommand(new Error([
                        `Command failed (${result.code}): ${basename(executable)} ${args.join(' ')}`,
                        result.stdout,
                        result.stderr,
                    ].filter(Boolean).join('\n')))
                } else {
                    resolveCommand(result)
                }
            }
            if (outputStream && !outputStream.closed) outputStream.once('close', finish)
            else finish()
        })
    })
}

async function adb(context, args, options) {
    return command(context.adb, ['-s', context.serial, ...args], options)
}

async function discoverSerial(adbPath, requested) {
    if (requested) return requested
    const result = await command(adbPath, ['devices'], { timeoutMs: 20_000 })
    const devices = result.stdout.split(/\r?\n/)
        .slice(1)
        .map((line) => line.trim().split(/\s+/))
        .filter((parts) => parts[1] === 'device')
        .map((parts) => parts[0])
    invariant(devices.length === 1,
        `Expected exactly one attached device; found ${devices.length}. Pass --serial explicitly.`)
    return devices[0]
}

async function discoverExternalFilesRoot(context) {
    const packageId = context.manifest.target.packageId
    const identity = await adb(context, ['shell', 'run-as', packageId, 'id'])
    invariant(/uid=\d+\(u\d+_a\d+\)/.test(identity.stdout),
        `run-as did not assume the app UID: ${identity.stdout || identity.stderr}`)

    const result = await adb(context, [
        'shell', 'readlink', '-f',
        `/sdcard/Android/data/${packageId}/files`,
    ])
    const root = slash(result.stdout.trim())
    invariant(root.endsWith(`/Android/data/${packageId}/files`),
        `Unexpected app external-files root: ${root}`)
    invariant(!root.includes('\n') && root.startsWith('/storage/'),
        `Unsafe app external-files root: ${root}`)
    return root
}

function absoluteDevicePath(context, relativePath) {
    const safe = assertSafeCampaignRelativePath(context.manifest, relativePath)
    const absolute = `${context.externalFilesRoot}/${safe}`
    invariant(absolute.startsWith(`${context.externalFilesRoot}/`), `Device path escaped campaign root: ${absolute}`)
    return absolute
}

async function cleanupCampaign(context) {
    for (const entry of context.manifest.cases) {
        await runDeviceTest(context, DEVICE_CLEANUP_TEST, {
            talosCaseId: entry.id,
        }, 120_000)
    }
}

async function deviceFreeBytes(context) {
    const result = await adb(context, ['shell', 'df', '-k', context.externalFilesRoot])
    const lines = result.stdout.split(/\r?\n/).map((line) => line.trim()).filter(Boolean)
    invariant(lines.length >= 2, `Could not parse device free space: ${result.stdout}`)
    const fields = lines.at(-1).split(/\s+/)
    const availableKiB = Number(fields.at(-3))
    invariant(Number.isFinite(availableKiB), `Could not parse device available KiB: ${lines.at(-1)}`)
    return availableKiB * 1024
}

async function ensureFreeSpace(context, entry, tempRoot) {
    const host = await statfs(tempRoot)
    const hostFree = Number(host.bavail) * Number(host.bsize)
    invariant(hostFree >= entry.bytes + HOST_RESERVE_BYTES,
        `Host disk is short of space for ${entry.id}; need model plus 1 GiB reserve`)
    const deviceFree = await deviceFreeBytes(context)
    invariant(deviceFree >= entry.bytes + DEVICE_RESERVE_BYTES,
        `Device disk is short of space for ${entry.id}; need model plus 1 GiB reserve`)
    return { hostFree, deviceFree }
}

function huggingFaceUrl(entry) {
    const repository = entry.repository.split('/').map(encodeURIComponent).join('/')
    const file = entry.file.split('/').map(encodeURIComponent).join('/')
    return `https://huggingface.co/${repository}/resolve/${entry.revision}/${file}?download=true`
}

async function download(entry, destination) {
    if (entry.gated && !process.env.HF_TOKEN) return { skipped: true, reason: 'HF_TOKEN_MISSING' }
    const headers = { 'user-agent': 'TALOS-local-compatibility/1.0' }
    if (process.env.HF_TOKEN) headers.authorization = `Bearer ${process.env.HF_TOKEN}`

    const response = await fetch(huggingFaceUrl(entry), {
        headers,
        redirect: 'follow',
        signal: AbortSignal.timeout(2 * 60 * 60 * 1000),
    })
    if (entry.gated && (response.status === 401 || response.status === 403)) {
        return { skipped: true, reason: `HF_GATED_${response.status}` }
    }
    invariant(response.ok && response.body,
        `Hugging Face download failed for ${entry.id}: HTTP ${response.status}`)

    let received = 0
    let lastNotice = Date.now()
    const progress = new TransformStream({
        transform(chunk, controller) {
            received += chunk.byteLength
            if (Date.now() - lastNotice >= 5000) {
                const percent = Math.min(100, (received / entry.bytes) * 100).toFixed(1)
                process.stdout.write(`[${entry.id}] download ${percent}% (${received}/${entry.bytes})\n`)
                lastNotice = Date.now()
            }
            controller.enqueue(chunk)
        },
    })
    await pipeline(
        response.body.pipeThrough(progress),
        createWriteStream(destination, { flags: 'wx' }),
    )
    return { skipped: false, received }
}

async function sha256(file) {
    const hash = createHash('sha256')
    for await (const chunk of createReadStream(file)) hash.update(chunk)
    return hash.digest('hex')
}

async function verifyHostFixture(entry, file) {
    const details = await stat(file)
    invariant(details.size === entry.bytes,
        `Byte mismatch for ${entry.id}: expected ${entry.bytes}, got ${details.size}`)
    const digest = await sha256(file)
    invariant(digest === entry.sha256,
        `SHA-256 mismatch for ${entry.id}: expected ${entry.sha256}, got ${digest}`)
}

async function runDeviceTest(context, testMethod, parameters = {}, timeoutMs = 30 * 60 * 1000) {
    const argumentsList = [
        'shell', 'am', 'instrument', '-w', '-r',
        '-e', 'class', `"${testMethod}"`,
    ]
    for (const [key, value] of Object.entries(parameters)) {
        argumentsList.push('-e', key, String(value))
    }
    argumentsList.push(INSTRUMENTATION)
    const result = await adb(context, argumentsList, { timeoutMs })
    invariant(/OK \(1 test\)/.test(result.stdout),
        `Instrumentation did not report one passing test for ${testMethod}:\n${result.stdout}\n${result.stderr}`)
    return result
}

async function openFixtureServer(file) {
    let accepted = false
    let activeSocket = null
    let bytesSent = 0
    let resolveTransfer
    let rejectTransfer
    const transferred = new Promise((resolveDone, rejectDone) => {
        resolveTransfer = resolveDone
        rejectTransfer = rejectDone
    })
    const server = createServer((socket) => {
        if (accepted) {
            socket.destroy()
            return
        }
        accepted = true
        activeSocket = socket
        const source = createReadStream(file)
        source.on('data', (chunk) => { bytesSent += chunk.length })
        pipeline(source, socket).then(resolveTransfer, rejectTransfer)
    })
    await new Promise((resolveListen, rejectListen) => {
        server.once('error', rejectListen)
        server.listen(0, '127.0.0.1', () => {
            server.off('error', rejectListen)
            resolveListen()
        })
    })
    const address = server.address()
    invariant(address && typeof address === 'object', 'Fixture server has no TCP address')
    return {
        port: address.port,
        transferred,
        bytesSent: () => bytesSent,
        close: async () => {
            if (activeSocket && !activeSocket.destroyed) activeSocket.destroy()
            await new Promise((resolveClose) => server.close(() => resolveClose()))
        },
    }
}

async function runInstrumentationWithStream(context, entry, file) {
    const absolutePath = absoluteDevicePath(context, context.manifest.target.nativeRelativePath)
    const fixtureServer = await openFixtureServer(file)
    const port = fixtureServer.port
    const startedAt = Date.now()
    await adb(context, ['reverse', `tcp:${port}`, `tcp:${port}`])
    process.stdout.write(`[stage] reverse tcp:${port}; target process writes the only device copy\n`)
    try {
        const test = runDeviceTest(context, DEVICE_TEST, {
            talosModelPath: absolutePath,
            talosExpectedBytes: entry.bytes,
            talosExpectedSha256: entry.sha256,
            talosCaseId: entry.id,
            talosHostPort: port,
            talosProjectToUi: !context.options.nativeOnly,
        })
        const [result] = await Promise.all([test, fixtureServer.transferred])
        invariant(fixtureServer.bytesSent() === entry.bytes,
            `Host stream byte mismatch for ${entry.id}: ${fixtureServer.bytesSent()}/${entry.bytes}`)
        return {
            durationMs: Date.now() - startedAt,
            streamedBytes: fixtureServer.bytesSent(),
            reversePort: port,
            output: result.stdout.split(/\r?\n/).filter((line) =>
                /TalosLlamaDeviceTest|OK \(1 test\)|INSTRUMENTATION_CODE/.test(line)),
        }
    } finally {
        await adb(context, ['reverse', '--remove', `tcp:${port}`]).catch(() => null)
        await fixtureServer.close().catch(() => null)
    }
}

async function waitForWebView(context) {
    await adb(context, ['shell', 'am', 'force-stop', context.manifest.target.packageId])
    await adb(context, [
        'shell', 'am', 'start', '-W', '-n',
        `${context.manifest.target.packageId}/ai.talos.MainActivity`,
    ])

    let pid = ''
    const deadline = Date.now() + 30_000
    while (Date.now() < deadline && !pid) {
        const result = await adb(context, [
            'shell', 'pidof', context.manifest.target.packageId,
        ]).catch(() => ({ stdout: '' }))
        pid = result.stdout.trim().split(/\s+/)[0] || ''
        if (!pid) await new Promise((resolveWait) => setTimeout(resolveWait, 500))
    }
    invariant(/^\d+$/.test(pid), `Could not find ${context.manifest.target.packageId} PID`)
    await adb(context, [
        'forward', `tcp:${CDP_PORT}`, `localabstract:webview_devtools_remote_${pid}`,
    ])

    const cdpDeadline = Date.now() + 30_000
    while (Date.now() < cdpDeadline) {
        try {
            const response = await fetch(`http://127.0.0.1:${CDP_PORT}/json/version`)
            if (response.ok) return pid
        } catch {
            // WebView debugging socket appears after the first page commits.
        }
        await new Promise((resolveWait) => setTimeout(resolveWait, 500))
    }
    throw new Error(`WebView CDP did not become ready for PID ${pid}`)
}

async function exerciseRealChat(context, entry) {
    const pid = await waitForWebView(context)
    const { chromium } = await import('@playwright/test')
    const browser = await chromium.connectOverCDP(`http://127.0.0.1:${CDP_PORT}`)
    try {
        const browserContext = browser.contexts()[0]
        invariant(browserContext, 'CDP exposed no browser context')
        let page = browserContext.pages()[0]
        if (!page) page = await browserContext.newPage()

        if (new URL(page.url()).pathname !== '/') {
            await page.evaluate(() => window.location.assign('/'))
        }
        let newChat = page.locator('[data-testid="talos-chats-new"]')
        if (!(await newChat.isVisible())) {
            await page.evaluate(() => window.location.assign('/chats'))
            newChat = page.locator('[data-testid="talos-chats-new"]')
            await newChat.waitFor({ state: 'visible', timeout: 30_000 })
        }
        const messageList = page.locator('[data-testid="talos-mobile-message-list"]')
        const previousThread = await messageList.isVisible() ? await messageList.innerText() : ''
        await newChat.click()
        if (previousThread.trim()) {
            await page.waitForFunction((before) => {
                const current = document.querySelector('[data-testid="talos-mobile-message-list"]')
                return current instanceof HTMLElement && current.innerText !== before
            }, previousThread, { timeout: 30_000 })
        }

        // Compatibility probes need the real chat/backend boundary but never
        // owner memories. TALOS temporary chats already provide that least-
        // privilege contract, so prove the visible mode before composing.
        const temporaryToggle = page.getByTestId('talos-make-temporary')
        const temporaryBadge = page.getByTestId('talos-temporary-chat-badge')
        if (!(await temporaryBadge.isVisible())) {
            await temporaryToggle.waitFor({ state: 'visible', timeout: 30_000 })
            invariant(await temporaryToggle.count() === 1,
                `Expected one temporary-chat control for ${entry.id}`)
            await temporaryToggle.click()
        }
        await temporaryBadge.waitFor({ state: 'visible', timeout: 30_000 })
        invariant(await temporaryBadge.count() === 1,
            `Temporary-chat mode did not settle for ${entry.id}`)
        await temporaryToggle.waitFor({ state: 'detached', timeout: 10_000 })

        const composer = page.locator('[data-testid="talos-mobile-composer"]')
        await composer.waitFor({ state: 'visible', timeout: 60_000 })
        const textarea = composer.locator('textarea')
        const prompt = entry.prompt
        await textarea.fill(prompt)

        const modelTrigger = composer.getByRole('button', {
            name: /^(Choose model profile|Scegli profilo modello)(?::|$)/,
        })
        await modelTrigger.waitFor({ state: 'visible', timeout: 10_000 })
        invariant(await modelTrigger.count() === 1,
            `Expected one semantic model trigger for ${entry.id}`)
        await modelTrigger.click()
        const drawer = page.locator('[data-testid="talos-model-drawer"]')
        await drawer.waitFor({ state: 'visible', timeout: 30_000 })
        const refresh = drawer.locator('.talos-mobile-model-picker footer button').first()
        await refresh.click()

        const localGroup = drawer.locator('[data-testid="talos-model-group-local"]')
        await localGroup.waitFor({ state: 'visible', timeout: 60_000 })
        if (await localGroup.getAttribute('aria-expanded') !== 'true') await localGroup.click()
        const modelOption = drawer.locator('[data-testid="talos-mobile-model-option"]')
            .filter({ hasText: 'talos-compat.gguf' })
        await modelOption.waitFor({ state: 'visible', timeout: 30_000 })
        invariant(await modelOption.count() === 1,
            `Expected one UI compatibility model for ${entry.id}; found ${await modelOption.count()}`)
        const modelProfileId = await modelOption.getAttribute('data-model-profile-id')
        await modelOption.click()
        await drawer.locator('header button').click()
        await drawer.waitFor({ state: 'detached', timeout: 10_000 })

        // Model discovery/selection may re-render the empty new-chat scope.
        // Re-apply the campaign prompt and prove the morphing right action is
        // Send, never Dictation, before clicking it.
        await textarea.fill(prompt)
        invariant(await textarea.inputValue() === prompt,
            `Composer draft was not ready to send for ${entry.id}`)

        const assistantBefore = await page.locator('article[data-message-kind="assistant"]').count()
        const systemBefore = await page.locator('article[data-message-kind="system"]').count()
        const send = composer.getByRole('button', {
            name: /^(Send message|Invia messaggio)$/,
        })
        await send.waitFor({ state: 'visible', timeout: 10_000 })
        invariant(await send.count() === 1,
            `Expected one semantic Send button for ${entry.id}`)
        invariant(!(await send.isDisabled()), `Send button remained disabled for ${entry.id}`)
        await send.click()

        await page.waitForFunction(
            ({ assistantBefore: expectedAssistant, systemBefore: expectedSystem }) => {
                const assistants = document.querySelectorAll('article[data-message-kind="assistant"]').length
                const systems = document.querySelectorAll('article[data-message-kind="system"]').length
                const streaming = document.querySelector('[data-testid="talos-mobile-streaming"], [data-testid="talos-mobile-typing"]')
                return (!streaming && assistants > expectedAssistant) || systems > expectedSystem
            },
            { assistantBefore, systemBefore },
            { timeout: context.options.uiTimeoutMs },
        )

        const systemAfter = await page.locator('article[data-message-kind="system"]').count()
        invariant(systemAfter === systemBefore,
            `Real chat produced a system error for ${entry.id}`)
        const assistants = page.locator('article[data-message-kind="assistant"]')
        invariant(await assistants.count() > assistantBefore,
            `Real chat produced no assistant message for ${entry.id}`)
        invariant(await page.getByTestId('talos-used-memories').count() === 0,
            `Temporary compatibility chat disclosed owner memories for ${entry.id}`)
        const lastAssistant = assistants.last()
        const replyContent = lastAssistant.getByTestId('talos-mobile-message-content')
        invariant(await replyContent.count() === 1,
            `Expected one model content boundary for ${entry.id}`)
        /*
         * La risposta grezza si legge PRIMA di validarla, e viaggia con
         * l'errore: se la validazione fallisce, il report deve poter dire cosa
         * era stato risposto. Prima veniva letta e persa, e la diagnosi
         * costava un ciclo intero sul dispositivo per rileggere la stessa
         * frase.
         */
        const rawReply = await replyContent.innerText()
        let modelReply
        try {
            modelReply = validateCompatibilityReply(entry.id, rawReply)
        } catch (error) {
            error.observedReply = compatibilityFailureDiagnostic(entry.id, rawReply, error).observedReply
            throw error
        }
        await lastAssistant.scrollIntoViewIfNeeded()
        await textarea.evaluate((element) => element.blur())
        await page.waitForTimeout(500)

        // Preserve the context actually held by the native engine before CDP
        // closes and campaign cleanup removes the one device fixture. The
        // existing chatPrompt boundary reports it directly; retain only the
        // integer, never the synthetic prompt returned by that call.
        const nativeContextProbe = await page.evaluate(async () => {
            const plugin = globalThis.Capacitor?.Plugins?.TalosLlama
            if (!plugin?.chatPrompt) return null
            return plugin.chatPrompt({
                turns: [{ role: 'user', content: 'TALOS_CONTEXT_PROBE' }],
            })
        })
        const nativeContextTokens = Number(nativeContextProbe?.contextTokens)
        invariant(Number.isInteger(nativeContextTokens) && nativeContextTokens > 0,
            `Native context was not measurable for ${entry.id}`)

        const screenshotName = SCREENSHOTS[entry.id]
        invariant(screenshotName, `No screenshot name registered for ${entry.id}`)
        const screenshotPath = resolve(EVIDENCE_DIR, screenshotName)
        if (existsSync(screenshotPath)) await rm(screenshotPath)
        await adb(context, ['exec-out', 'screencap', '-p'], {
            binaryStdoutFile: screenshotPath,
            timeoutMs: 60_000,
        })
        const screenshot = await stat(screenshotPath)
        invariant(screenshot.size > 100_000, `ADB screenshot is unexpectedly small for ${entry.id}`)

        return {
            pid,
            prompt,
            reply: modelReply.slice(0, 500),
            /*
             * Obbedienza all'istruzione, separata dalla compatibilita' runtime.
             * `false` non e' un fallimento del caso: e' un fatto sul MODELLO, e
             * su modelli da 350M-1B capita spesso. Registrarlo qui e' cio' che
             * evita di doverlo raccontare a mano nel ledger, come e' successo
             * per C2 e C4.
             */
            instructionMarker: compatibilityInstructionMarker(modelReply) ? 'met' : 'unmet',
            screenshot: screenshotName,
            screenshotBytes: screenshot.size,
            modelProfileId,
            contextTokens: nativeContextTokens,
        }
    } finally {
        await browser.close().catch(() => null)
    }
}

async function readReport() {
    try {
        return JSON.parse(await readFile(REPORT_PATH, 'utf8'))
    } catch {
        return { schemaVersion: 1, cases: [] }
    }
}

async function recordResult(context, result) {
    const report = await readReport()
    const cases = Array.isArray(report.cases) ? report.cases : []
    const nextCases = context.manifest.cases
        .map((entry) => result.id === entry.id
            ? result
            : cases.find((existing) => existing.id === entry.id))
        .filter(Boolean)
    const output = {
        schemaVersion: 1,
        generatedAt: new Date().toISOString(),
        device: {
            serial: context.serial,
            packageId: context.manifest.target.packageId,
            externalFilesRoot: context.externalFilesRoot,
        },
        maxConcurrency: context.manifest.maxConcurrency,
        cases: nextCases,
    }
    await writeFile(REPORT_PATH, `${JSON.stringify(output, null, 2)}\n`, 'utf8')
}

async function runCase(context, entry) {
    const startedAt = new Date().toISOString()
    const tempRoot = await mkdtemp(join(tmpdir(), `talos-local-compat-${entry.id.toLowerCase()}-`))
    const hostFile = resolve(tempRoot, entry.file)
    let result = null
    try {
        process.stdout.write(`\n[${entry.id}] ${entry.repository}@${entry.revision}/${entry.file}\n`)
        const capacity = await ensureFreeSpace(context, entry, tempRoot)
        const downloaded = await download(entry, hostFile)
        if (downloaded.skipped) {
            result = {
                id: entry.id,
                status: 'SKIPPED_GATED',
                reason: downloaded.reason,
                startedAt,
                finishedAt: new Date().toISOString(),
            }
            await recordResult(context, result)
            process.stdout.write(`[${entry.id}] SKIPPED_GATED (${downloaded.reason})\n`)
            return result
        }

        await verifyHostFixture(entry, hostFile)
        const native = await runInstrumentationWithStream(context, entry, hostFile)
        let ui = null
        if (!context.options.nativeOnly) {
            ui = await exerciseRealChat(context, entry)
        }
        result = {
            id: entry.id,
            status: 'PASS',
            repository: entry.repository,
            revision: entry.revision,
            file: entry.file,
            bytes: entry.bytes,
            sha256: entry.sha256,
            family: entry.family,
            license: entry.license,
            capacity,
            native,
            ui,
            startedAt,
            finishedAt: new Date().toISOString(),
        }
        await recordResult(context, result)
        process.stdout.write(`[${entry.id}] PASS\n`)
        return result
    } catch (error) {
        result = {
            id: entry.id,
            status: 'FAIL',
            error: error instanceof Error ? error.message : String(error),
            // Identificare il caso senza aprire il manifest: un FAIL nel report
            // deve bastare a se stesso.
            repository: entry.repository,
            file: entry.file,
            prompt: entry.prompt,
            // Presente solo quando il fallimento e' avvenuto DOPO che il
            // modello aveva risposto, e gia' redatto se il contenuto era il
            // problema.
            ...(error?.observedReply === undefined ? {} : { observedReply: error.observedReply }),
            startedAt,
            finishedAt: new Date().toISOString(),
        }
        await recordResult(context, result).catch(() => null)
        throw error
    } finally {
        await cleanupCampaign(context)
        await rm(tempRoot, { recursive: true, force: true })
    }
}

async function main() {
    const options = parseArguments(process.argv.slice(2))
    if (options.help) {
        process.stdout.write([
            'Usage: node scripts/run-local-model-compatibility.mjs [options]',
            '  --serial SERIAL       attached Android device (auto only when exactly one)',
            '  --adb PATH            adb executable',
            '  --cases C1,C2         selected cases; manifest order is preserved',
            '  --native-only         skip chat/UI screenshot (diagnostic only)',
            '  --cleanup-only        remove only allowlisted campaign files and exit',
            '  --ui-timeout-ms N     real-chat timeout, minimum 60000',
            '',
        ].join('\n'))
        return
    }

    const manifest = JSON.parse(await readFile(MANIFEST_PATH, 'utf8'))
    validateManifest(manifest)
    const adbPath = options.adb || defaultAdbPath()
    invariant(adbPath === 'adb' || existsSync(adbPath), `adb executable not found: ${adbPath}`)
    const serial = await discoverSerial(adbPath, options.serial)
    await mkdir(EVIDENCE_DIR, { recursive: true })
    const context = { adb: adbPath, serial, manifest, options, externalFilesRoot: '' }
    context.externalFilesRoot = await discoverExternalFilesRoot(context)

    await cleanupCampaign(context)
    if (options.cleanupOnly) {
        process.stdout.write('Compatibility campaign namespaces are clean.\n')
        return
    }

    const selected = resolveSelectedCases(manifest, options.cases)
    for (const entry of selected) await runCase(context, entry)
}

const invokedPath = process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href : ''
if (invokedPath === import.meta.url) {
    main().catch((error) => {
        process.stderr.write(`${error instanceof Error ? error.stack || error.message : String(error)}\n`)
        process.exitCode = 1
    })
}
