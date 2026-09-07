import { defineConfig, devices } from '@playwright/test'
import { existsSync, rmSync } from 'node:fs'
import { resolve } from 'node:path'
import { resolveTalosPlaywrightPhpBin } from './tests/e2e/helpers/talosPlaywrightServer'

function requiredEnvironment(name: string): string {
    const value = process.env[name]?.trim()
    if (!value) {
        throw new Error(`${name} is required for the opt-in TALOS real-provider gate.`)
    }

    return value
}

if (requiredEnvironment('TALOS_REAL_PROVIDER_E2E') !== '1') {
    throw new Error('TALOS_REAL_PROVIDER_E2E must equal 1 for the opt-in real-provider gate.')
}

const appKey = requiredEnvironment('TALOS_REAL_PROVIDER_APP_KEY')
const databasePath = resolve(requiredEnvironment('TALOS_REAL_PROVIDER_DB'))
requiredEnvironment('TALOS_REAL_PROVIDER_EMAIL')
requiredEnvironment('TALOS_REAL_PROVIDER_PASSWORD')
requiredEnvironment('TALOS_REAL_PROVIDER_PROFILE_ID')

const primaryDatabasePath = resolve('database/database.sqlite')
if (databasePath === primaryDatabasePath) {
    throw new Error('The real-provider gate refuses to use the primary TALOS database.')
}
if (!existsSync(databasePath)) {
    throw new Error('The isolated real-provider database does not exist.')
}

const baseURL = process.env.TALOS_REAL_PROVIDER_BASE_URL?.trim()
    || 'http://127.0.0.1:8024'
const serverUrl = new URL(baseURL)
if (serverUrl.protocol !== 'http:'
    || serverUrl.hostname !== '127.0.0.1'
    || !serverUrl.port
    || serverUrl.pathname !== '/') {
    throw new Error('TALOS_REAL_PROVIDER_BASE_URL must be a loopback HTTP origin with an explicit port.')
}

const configCachePath = resolve('storage/framework/testing/talos-real-provider-config.php')
const hotFilePath = resolve('storage/framework/testing/talos-real-provider.hot')
rmSync(configCachePath, { force: true })
rmSync(hotFilePath, { force: true })

const phpBin = resolveTalosPlaywrightPhpBin()

export default defineConfig({
    testDir: './tests/e2e/real',
    testMatch: 'talosStreamingChat.real-provider.e2e.spec.ts',
    timeout: 180_000,
    expect: {
        timeout: 15_000,
    },
    fullyParallel: false,
    workers: 1,
    reporter: [
        ['list'],
        ['html', {
            open: 'never',
            outputFolder: 'storage/playwright-real-provider-report',
        }],
    ],
    use: {
        baseURL,
        permissions: ['clipboard-read', 'clipboard-write'],
        trace: 'retain-on-failure',
        screenshot: 'only-on-failure',
        video: 'retain-on-failure',
    },
    webServer: {
        command: `"${phpBin}" -d opcache.enable=0 -S 127.0.0.1:${serverUrl.port} -t public tests/e2e/php-router.php`,
        url: baseURL,
        reuseExistingServer: false,
        timeout: 120_000,
        env: {
            APP_URL: baseURL,
            APP_KEY: appKey,
            APP_CONFIG_CACHE: configCachePath,
            APP_ENV: 'testing',
            APP_DEBUG: 'false',
            AUTH_ENABLED: 'true',
            LOCALHOST_BYPASS: 'false',
            SECURE_COOKIES: 'false',
            DB_CONNECTION: 'sqlite',
            DB_DATABASE: databasePath,
            CACHE_STORE: 'array',
            QUEUE_CONNECTION: 'sync',
            SESSION_DRIVER: 'file',
            VITE_HOT_FILE: hotFilePath,
            TALOS_BROWSER_CLIENT_DRIVER: 'fake',
        },
    },
    projects: [{
        name: 'real-provider-chromium',
        use: { ...devices['Desktop Chrome'] },
    }],
})
