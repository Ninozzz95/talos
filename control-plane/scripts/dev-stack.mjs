import { randomBytes } from 'node:crypto'
import { existsSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import concurrently from 'concurrently'
import {
    acquireDevStackLease,
    assertBrowserWorkerCanStart,
    inspectBrowserWorkerOwnership,
    releaseDevStackLease,
} from './browser-worker-ownership.mjs'

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url))
const defaultWorkspaceRoot = path.resolve(scriptDirectory, '..', '..')

function executable(workspaceRoot, name, platform, fileExists) {
    const suffix = platform === 'win32' ? '.cmd' : ''
    const localExecutable = path.join(workspaceRoot, '.tools', 'bin', `${name}${suffix}`)
    if (fileExists(localExecutable)) return localExecutable

    return platform === 'win32' && name === 'npm' ? 'npm.cmd' : name
}

function quoted(value) {
    return `"${value}"`
}

export function createDevStackConfig({
    token = randomBytes(32).toString('hex'),
    inheritedEnv = process.env,
    platform = process.platform,
    workspaceRoot = defaultWorkspaceRoot,
    fileExists = existsSync,
} = {}) {
    const php = quoted(executable(workspaceRoot, 'php', platform, fileExists))
    const npm = quoted(executable(workspaceRoot, 'npm', platform, fileExists))
    const phpRoot = path.join(workspaceRoot, '.tools', 'php')
    const localPhpRuntime = path.join(phpRoot, platform === 'win32' ? 'php.exe' : 'bin/php')
    const caBundle = path.join(phpRoot, 'extras', 'ssl', 'cacert.pem')
    const hasLocalPhpRuntime = fileExists(localPhpRuntime)
    const hasLocalCaBundle = hasLocalPhpRuntime && fileExists(caBundle)
    const browserWorker = path.join(workspaceRoot, 'browser-worker')
    const validator = path.join(workspaceRoot, 'validator')
    const sharedEnv = {
        ...inheritedEnv,
        AVM_VALIDATOR_URL: 'http://127.0.0.1:3000',
        TALOS_VALIDATOR_HEALTH_URL: 'http://127.0.0.1:3000/health',
        TALOS_BROWSER_WORKER_URL: 'http://127.0.0.1:3100',
        TALOS_BROWSER_WORKER_TOKEN: token,
        PHP_BIN: hasLocalPhpRuntime ? localPhpRuntime : 'php',
        ...(hasLocalCaBundle ? {
            TALOS_PHP_ROOT: phpRoot,
            CURL_CA_BUNDLE: caBundle,
            SSL_CERT_FILE: caBundle,
        } : {}),
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
                env: sharedEnv,
            },
            {
                name: 'queue',
                command: `${php} artisan queue:listen --tries=1 --timeout=0`,
                env: sharedEnv,
            },
            {
                name: 'vite',
                command: `${npm} run dev -- --host 127.0.0.1 --port 5173`,
                env: inheritedEnv,
            },
            {
                name: 'browser',
                command: `${npm} --prefix ${quoted(browserWorker)} run dev`,
                env: {
                    ...sharedEnv,
                    HOST: '127.0.0.1',
                    PORT: '3100',
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
    runCommands = concurrently,
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
        const { result } = runCommands(config.commands, {
            prefix: 'name',
            prefixColors: ['#86efac', '#93c5fd', '#c4b5fd', '#fdba74', '#67e8f9'],
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
