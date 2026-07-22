import { execFileSync } from 'node:child_process'
import { closeSync, existsSync, mkdirSync, openSync, rmSync } from 'node:fs'
import { posix, win32 } from 'node:path'

const TALOS_E2E_APP_KEY = `base64:${Buffer.alloc(32, 'talos-e2e').toString('base64')}`
const UNSUPPORTED_PHP_SHELL_CHARACTERS = /["'\r\n`$%!?&|<>^;]/u

function assertSafePhpBin(phpBin: string): string {
    if (UNSUPPORTED_PHP_SHELL_CHARACTERS.test(phpBin)) {
        throw new Error('PHP runtime path contains unsupported shell characters.')
    }

    return phpBin
}

function readGitCommonDirectory(controlPlaneDirectory: string): string | null {
    try {
        const commonDirectory = execFileSync(
            'git',
            ['rev-parse', '--path-format=absolute', '--git-common-dir'],
            {
                cwd: controlPlaneDirectory,
                encoding: 'utf8',
                stdio: ['ignore', 'pipe', 'ignore'],
                windowsHide: true,
            },
        ).trim()

        return commonDirectory === '' ? null : commonDirectory
    } catch {
        return null
    }
}

export function resolveTalosPlaywrightPhpBin(options: {
    configuredPhp?: string
    platform?: NodeJS.Platform
    controlPlaneDirectory?: string
    pathExists?: (candidate: string) => boolean
    readGitCommonDirectory?: (controlPlaneDirectory: string) => string | null
} = {}): string {
    const configuredPhp = (options.configuredPhp ?? process.env.TALOS_E2E_PHP_BIN)?.trim()
    if (configuredPhp) {
        return assertSafePhpBin(configuredPhp)
    }

    const platform = options.platform ?? process.platform
    if (platform !== 'win32') {
        return assertSafePhpBin('php')
    }

    const paths = platform === 'win32' ? win32 : posix
    const controlPlaneDirectory = options.controlPlaneDirectory ?? process.cwd()
    const pathExists = options.pathExists ?? existsSync
    const localPhp = paths.resolve(controlPlaneDirectory, '..', '.tools', 'bin', 'php.cmd')
    if (pathExists(localPhp)) {
        return assertSafePhpBin(localPhp)
    }

    const commonDirectoryReader = options.readGitCommonDirectory ?? readGitCommonDirectory
    const gitCommonDirectory = commonDirectoryReader(controlPlaneDirectory)
    if (gitCommonDirectory) {
        const primaryPhp = paths.resolve(gitCommonDirectory, '..', '.tools', 'bin', 'php.cmd')
        if (pathExists(primaryPhp)) {
            return assertSafePhpBin(primaryPhp)
        }
    }

    throw new Error('Unable to locate the repository PHP runtime. Set TALOS_E2E_PHP_BIN or provision .tools/bin/php.cmd.')
}

export function createTalosPlaywrightWebServer(baseURL: string, reuseExistingServer: boolean) {
    const paths = process.platform === 'win32' ? win32 : posix
    const databasePath = paths.resolve('storage/framework/testing/talos-playwright.sqlite')
    const configCachePath = paths.resolve('storage/framework/testing/talos-playwright-config.php')
    const hotFilePath = paths.resolve('storage/framework/testing/talos-playwright.hot')
    mkdirSync(paths.dirname(databasePath), { recursive: true })
    closeSync(openSync(databasePath, 'a'))
    rmSync(configCachePath, { force: true })
    const phpBin = resolveTalosPlaywrightPhpBin()
    const php = `"${phpBin}"`
    const configuredAppKey = process.env.APP_KEY?.trim()

    return {
        command: `${php} artisan migrate:fresh --force && ${php} artisan db:seed --class=TalosE2ESeeder --force && ${php} -d opcache.enable=0 -S 127.0.0.1:8014 -t public tests/e2e/php-router.php`,
        url: baseURL,
        reuseExistingServer,
        timeout: 120_000,
        env: {
            APP_URL: baseURL,
            APP_KEY: configuredAppKey || TALOS_E2E_APP_KEY,
            APP_CONFIG_CACHE: configCachePath,
            APP_ENV: 'testing',
            DB_CONNECTION: 'sqlite',
            DB_DATABASE: databasePath,
            CACHE_STORE: 'array',
            QUEUE_CONNECTION: 'sync',
            SESSION_DRIVER: 'file',
            VITE_HOT_FILE: hotFilePath,
            TALOS_BROWSER_CLIENT_DRIVER: process.env.TALOS_E2E_REAL_BROWSER === '1' ? 'http' : 'fake',
            TALOS_BROWSER_ACTION_PRIVATE_KEY_B64: process.env.TALOS_BROWSER_ACTION_PRIVATE_KEY_B64 ?? '',
            TALOS_BROWSER_ACTION_PUBLIC_KEY_B64: '',
            TALOS_BROWSER_ACTION_KEY_ID: process.env.TALOS_BROWSER_ACTION_KEY_ID ?? '',
            TALOS_DEV_BROWSER_EVIDENCE: process.env.TALOS_E2E_DEV_BROWSER_EVIDENCE === '1' ? 'true' : 'false',
        },
    }
}
