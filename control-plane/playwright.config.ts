import { defineConfig, devices } from '@playwright/test'
import { createTalosPlaywrightWebServer } from './tests/e2e/helpers/talosPlaywrightServer'

const baseURL = process.env.TALOS_E2E_BASE_URL ?? 'http://127.0.0.1:8014'
const reuseExistingServer = process.env.TALOS_E2E_REUSE_SERVER === '1'
const useViteDevServer = process.env.TALOS_E2E_USE_VITE === '1'

const laravelServer = createTalosPlaywrightWebServer(baseURL, reuseExistingServer)

const viteServer = {
    command: 'npm run dev -- --host 127.0.0.1 --port 5173',
    url: 'http://127.0.0.1:5173/resources/js/app.js',
    reuseExistingServer,
    timeout: 120_000,
}

export default defineConfig({
    testDir: './tests/e2e',
    testIgnore: 'talosMotionV6CrossBrowser.e2e.spec.ts',
    timeout: 60_000,
    expect: {
        timeout: 8_000,
    },
    fullyParallel: false,
    workers: 1,
    reporter: [
        ['list'],
        ['html', { open: 'never', outputFolder: 'storage/playwright-report' }],
    ],
    use: {
        baseURL,
        permissions: ['clipboard-read', 'clipboard-write'],
        trace: 'retain-on-failure',
        screenshot: 'only-on-failure',
        video: 'retain-on-failure',
    },
    webServer: process.env.TALOS_E2E_BASE_URL
        ? undefined
        : useViteDevServer
            ? [laravelServer, viteServer]
            : laravelServer,
    projects: [
        {
            name: 'chromium',
            use: { ...devices['Desktop Chrome'] },
        },
        {
            name: 'mobile-chrome',
            use: { ...devices['Pixel 7'] },
        },
    ],
})
