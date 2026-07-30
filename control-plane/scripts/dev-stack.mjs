import { randomBytes } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { generateBrowserActionKeypair } from './browser-action-keypair.mjs'
import {
    acquireDevStackLease,
    assertBrowserWorkerCanStart,
    inspectBrowserWorkerOwnership,
    releaseDevStackLease,
} from './browser-worker-ownership.mjs'

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url))
const defaultWorkspaceRoot = path.resolve(scriptDirectory, '..', '..')

export function readGitCommonDirectory(
    workspaceRoot,
    {
        platform = process.platform,
        runGit = execFileSync,
    } = {},
) {
    try {
        const output = runGit(
            'git',
            ['rev-parse', '--git-common-dir'],
            {
                cwd: workspaceRoot,
                encoding: 'utf8',
                stdio: ['ignore', 'pipe', 'ignore'],
                windowsHide: true,
            },
        ).trim()
        const lines = output.split(/\r?\n/u)
        if (lines.length !== 1 || lines[0] === '') return null

        const paths = platform === 'win32' ? path.win32 : path.posix

        return paths.isAbsolute(lines[0])
            ? paths.normalize(lines[0])
            : paths.resolve(workspaceRoot, lines[0])
    } catch {
        return null
    }
}

function compatibleToolchainRoot(root, platform, fileExists, paths) {
    const suffix = platform === 'win32' ? '.cmd' : ''
    const phpRuntime = paths.join(
        root,
        '.tools',
        'php',
        platform === 'win32' ? 'php.exe' : 'bin/php',
    )

    return [
        paths.join(root, '.tools', 'bin', `php${suffix}`),
        paths.join(root, '.tools', 'bin', `npm${suffix}`),
        phpRuntime,
    ].every(fileExists)
}

function resolveToolchainRoot({
    workspaceRoot,
    platform,
    fileExists,
    readCommonDirectory,
}) {
    const paths = platform === 'win32' ? path.win32 : path.posix
    if (compatibleToolchainRoot(workspaceRoot, platform, fileExists, paths)) {
        return workspaceRoot
    }

    const gitCommonDirectory = readCommonDirectory(workspaceRoot)
    if (!gitCommonDirectory) return null

    const primaryRoot = paths.resolve(gitCommonDirectory, '..')

    return compatibleToolchainRoot(primaryRoot, platform, fileExists, paths)
        ? primaryRoot
        : null
}

function executable(toolchainRoot, name, platform, paths) {
    if (toolchainRoot) {
        const suffix = platform === 'win32' ? '.cmd' : ''

        return paths.join(toolchainRoot, '.tools', 'bin', `${name}${suffix}`)
    }

    return platform === 'win32' && name === 'npm' ? 'npm.cmd' : name
}

function quoted(value) {
    return `"${value}"`
}

export function createDevStackConfig({
    token = randomBytes(32).toString('hex'),
    artifactToken = randomBytes(32).toString('hex'),
    actionKeypair = generateBrowserActionKeypair(),
    inheritedEnv = process.env,
    platform = process.platform,
    workspaceRoot = defaultWorkspaceRoot,
    fileExists = existsSync,
    readGitCommonDirectory: readCommonDirectory = readGitCommonDirectory,
} = {}) {
    const paths = platform === 'win32' ? path.win32 : path.posix
    const toolchainRoot = resolveToolchainRoot({
        workspaceRoot,
        platform,
        fileExists,
        readCommonDirectory,
    })
    const php = quoted(executable(toolchainRoot, 'php', platform, paths))
    const npm = quoted(executable(toolchainRoot, 'npm', platform, paths))
    const phpRoot = toolchainRoot ? paths.join(toolchainRoot, '.tools', 'php') : null
    const localPhpRuntime = phpRoot
        ? paths.join(phpRoot, platform === 'win32' ? 'php.exe' : 'bin/php')
        : null
    const caBundle = phpRoot ? paths.join(phpRoot, 'extras', 'ssl', 'cacert.pem') : null
    const hasLocalPhpRuntime = localPhpRuntime !== null
    const hasLocalCaBundle = caBundle !== null && fileExists(caBundle)
    const artifactWorker = path.join(workspaceRoot, 'artifact-worker')
    const browserWorker = path.join(workspaceRoot, 'browser-worker')
    const validator = path.join(workspaceRoot, 'validator')
    const sanitizedInheritedEnv = { ...inheritedEnv }
    for (const name of [
        'TALOS_BROWSER_WORKER_TOKEN',
        'TALOS_BROWSER_ACTION_KEY_ID',
        'TALOS_BROWSER_ACTION_PRIVATE_KEY_B64',
        'TALOS_BROWSER_ACTION_PUBLIC_KEY_B64',
        'TALOS_ARTIFACT_WORKER_TOKEN',
        'ARTIFACT_WORKER_TOKEN',
    ]) {
        delete sanitizedInheritedEnv[name]
    }
    const artifactInheritedEnv = { ...sanitizedInheritedEnv }
    for (const name of Object.keys(artifactInheritedEnv)) {
        if (/(?:API_KEY|TOKEN|SECRET|PASSWORD|PRIVATE_KEY)/iu.test(name)) {
            delete artifactInheritedEnv[name]
        }
    }
    const sharedEnv = {
        ...sanitizedInheritedEnv,
        AVM_VALIDATOR_URL: 'http://127.0.0.1:3000',
        TALOS_VALIDATOR_HEALTH_URL: 'http://127.0.0.1:3000/health',
        TALOS_BROWSER_WORKER_URL: 'http://127.0.0.1:3100',
        TALOS_ARTIFACT_WORKER_URL: 'http://127.0.0.1:3200',
        PHP_BIN: hasLocalPhpRuntime && localPhpRuntime ? localPhpRuntime : 'php',
        ...(hasLocalCaBundle ? {
            TALOS_PHP_ROOT: phpRoot,
            CURL_CA_BUNDLE: caBundle,
            SSL_CERT_FILE: caBundle,
        } : {}),
    }
    const controlPlaneEnv = {
        ...sharedEnv,
        TALOS_BROWSER_WORKER_TOKEN: token,
        TALOS_BROWSER_ACTION_KEY_ID: actionKeypair.keyId,
        TALOS_BROWSER_ACTION_PRIVATE_KEY_B64: actionKeypair.privateKeyBase64,
        TALOS_ARTIFACT_WORKER_TOKEN: artifactToken,
    }
    const browserWorkerEnv = {
        ...sharedEnv,
        TALOS_BROWSER_WORKER_TOKEN: token,
        TALOS_BROWSER_ACTION_KEY_ID: actionKeypair.keyId,
        TALOS_BROWSER_ACTION_PUBLIC_KEY_B64: actionKeypair.publicKeyBase64,
    }

    return {
        workspaceRoot,
        sharedEnv,
        commands: [
            {
                name: 'validator',
                command: `${npm} --prefix ${quoted(validator)} run build && ${npm} --prefix ${quoted(validator)} run start`,
                env: {
                    ...sharedEnv,
                    HOST: '127.0.0.1',
                    PORT: '3000',
                },
            },
            {
                name: 'server',
                command: `${php} artisan serve --host=127.0.0.1 --port=8000`,
                env: controlPlaneEnv,
            },
            {
                name: 'queue',
                command: `${php} artisan queue:listen --tries=1 --timeout=0`,
                env: controlPlaneEnv,
            },
            {
                name: 'vite',
                command: `${npm} run dev -- --host 127.0.0.1 --port 5173`,
                env: sanitizedInheritedEnv,
            },
            {
                name: 'browser',
                command: `${npm} --prefix ${quoted(browserWorker)} run dev`,
                env: {
                    ...browserWorkerEnv,
                    HOST: '127.0.0.1',
                    PORT: '3100',
                },
            },
            {
                name: 'artifact',
                command: `${npm} --prefix ${quoted(artifactWorker)} run dev`,
                env: {
                    ...artifactInheritedEnv,
                    ARTIFACT_WORKER_HOST: '127.0.0.1',
                    ARTIFACT_WORKER_PORT: '3200',
                    ARTIFACT_WORKER_TOKEN: artifactToken,
                },
            },
        ],
    }
}

export async function runDevStack({
    config = createDevStackConfig(),
    inspectOwnership = inspectBrowserWorkerOwnership,
    assertCanStart = assertBrowserWorkerCanStart,
    acquireLease = acquireDevStackLease,
    releaseLease = releaseDevStackLease,
    runCommands,
} = {}) {
    const expectedUrl = config.sharedEnv.TALOS_BROWSER_WORKER_URL
    const ownership = await inspectOwnership({
        expectedUrl,
        workspaceRoot: config.workspaceRoot,
    })
    assertCanStart(ownership)
    const lease = acquireLease({
        expectedUrl,
        workspaceRoot: config.workspaceRoot,
    })

    try {
        const concurrentRunner = runCommands ?? (await import('concurrently')).default
        const { result } = concurrentRunner(config.commands, {
            prefix: 'name',
            prefixColors: ['#86efac', '#93c5fd', '#c4b5fd', '#fdba74', '#67e8f9', '#f9a8d4'],
            killOthersOn: ['failure'],
            cwd: path.resolve(scriptDirectory, '..'),
        })
        await result
    } finally {
        releaseLease(lease)
    }
}

async function main() {
    try {
        await runDevStack()
    } catch (error) {
        if (error instanceof Error && /TALOS_BROWSER_WORKER|Browser worker ownership/.test(error.message)) {
            process.stderr.write(`${error.message}\n`)
        }
        process.exitCode = 1
    }
}

const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : ''
if (invokedPath === fileURLToPath(import.meta.url)) {
    await main()
}
