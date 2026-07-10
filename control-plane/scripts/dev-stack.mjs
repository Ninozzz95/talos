import { randomBytes } from 'node:crypto'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import concurrently from 'concurrently'

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url))
const defaultWorkspaceRoot = path.resolve(scriptDirectory, '..', '..')

function executable(workspaceRoot, name, platform) {
    const suffix = platform === 'win32' ? '.cmd' : ''
    return path.join(workspaceRoot, '.tools', 'bin', `${name}${suffix}`)
}

function quoted(value) {
    return `"${value}"`
}

export function createDevStackConfig({
    token = randomBytes(32).toString('hex'),
    inheritedEnv = process.env,
    platform = process.platform,
    workspaceRoot = defaultWorkspaceRoot,
} = {}) {
    const php = quoted(executable(workspaceRoot, 'php', platform))
    const npm = quoted(executable(workspaceRoot, 'npm', platform))
    const browserWorker = path.join(workspaceRoot, 'browser-worker')
    const sharedEnv = {
        ...inheritedEnv,
        TALOS_BROWSER_WORKER_URL: 'http://127.0.0.1:3100',
        TALOS_BROWSER_WORKER_TOKEN: token,
    }

    return {
        sharedEnv,
        commands: [
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

async function main() {
    const config = createDevStackConfig()
    const { result } = concurrently(config.commands, {
        prefix: 'name',
        prefixColors: ['#93c5fd', '#c4b5fd', '#fdba74', '#67e8f9'],
        killOthersOn: ['failure'],
        cwd: path.resolve(scriptDirectory, '..'),
    })

    try {
        await result
    } catch {
        process.exitCode = 1
    }
}

const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : ''
if (invokedPath === fileURLToPath(import.meta.url)) {
    await main()
}
