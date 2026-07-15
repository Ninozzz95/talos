import { closeSync, mkdirSync, openSync } from 'node:fs'
import { dirname, resolve } from 'node:path'

export function createTalosPlaywrightWebServer(baseURL: string, reuseExistingServer: boolean) {
    const databasePath = resolve('storage/framework/testing/talos-playwright.sqlite')
    const hotFilePath = resolve('storage/framework/testing/talos-playwright.hot')
    mkdirSync(dirname(databasePath), { recursive: true })
    closeSync(openSync(databasePath, 'a'))

    return {
        command: '..\\.tools\\php\\php.exe artisan migrate:fresh --force && ..\\.tools\\php\\php.exe artisan db:seed --class=TalosE2ESeeder --force && ..\\.tools\\php\\php.exe -S 127.0.0.1:8014 -t public tests/e2e/php-router.php',
        url: baseURL,
        reuseExistingServer,
        timeout: 120_000,
        env: {
            APP_ENV: 'testing',
            DB_CONNECTION: 'sqlite',
            DB_DATABASE: databasePath,
            CACHE_STORE: 'array',
            QUEUE_CONNECTION: 'sync',
            SESSION_DRIVER: 'file',
            VITE_HOT_FILE: hotFilePath,
            TALOS_BROWSER_CLIENT_DRIVER: process.env.TALOS_E2E_REAL_BROWSER === '1' ? 'http' : 'fake',
            TALOS_DEV_BROWSER_EVIDENCE: process.env.TALOS_E2E_DEV_BROWSER_EVIDENCE === '1' ? 'true' : 'false',
        },
    }
}
