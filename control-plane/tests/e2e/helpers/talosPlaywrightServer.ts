import { closeSync, mkdirSync, openSync, rmSync } from 'node:fs'
import { dirname, resolve } from 'node:path'

export function createTalosPlaywrightWebServer(baseURL: string, reuseExistingServer: boolean) {
    const databasePath = resolve('storage/framework/testing/talos-playwright.sqlite')
    const configCachePath = resolve('storage/framework/testing/talos-playwright-config.php')
    const hotFilePath = resolve('storage/framework/testing/talos-playwright.hot')
    mkdirSync(dirname(databasePath), { recursive: true })
    closeSync(openSync(databasePath, 'a'))
    rmSync(configCachePath, { force: true })
    const configuredPhp = process.env.TALOS_E2E_PHP_BIN?.trim()
    const phpBin = configuredPhp && configuredPhp !== ''
        ? configuredPhp
        : process.platform === 'win32'
            ? '..\\.tools\\bin\\php.cmd'
            : 'php'
    if (/["\r\n]/u.test(phpBin)) {
        throw new Error('TALOS_E2E_PHP_BIN contains unsupported shell characters.')
    }
    const php = `"${phpBin}"`

    return {
        command: `${php} artisan migrate:fresh --force && ${php} artisan db:seed --class=TalosE2ESeeder --force && ${php} -d opcache.enable=0 -S 127.0.0.1:8014 -t public tests/e2e/php-router.php`,
        url: baseURL,
        reuseExistingServer,
        timeout: 120_000,
        env: {
            APP_URL: baseURL,
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
