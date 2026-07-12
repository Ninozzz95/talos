import { defineConfig, devices } from '@playwright/test'
import { createTalosPlaywrightWebServer } from './tests/e2e/helpers/talosPlaywrightServer'

const baseURL = process.env.TALOS_E2E_BASE_URL ?? 'http://127.0.0.1:8014'
const reuseExistingServer = process.env.TALOS_E2E_REUSE_SERVER === '1'

export default defineConfig({
    testDir: './tests/e2e',
    testMatch: 'talosMotionV6CrossBrowser.e2e.spec.ts',
    timeout: 90_000,
    expect: { timeout: 10_000 },
    reporter: [['list']],
    use: {
        baseURL,
        trace: 'retain-on-failure',
        screenshot: 'only-on-failure',
        video: 'retain-on-failure',
    },
    webServer: process.env.TALOS_E2E_BASE_URL ? undefined : createTalosPlaywrightWebServer(baseURL, reuseExistingServer),
    projects: [
        { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
        { name: 'firefox', use: { ...devices['Desktop Firefox'] } },
        { name: 'webkit', use: { ...devices['Desktop Safari'] } },
    ],
})
