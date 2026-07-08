import { defineConfig, devices } from '@playwright/test'

const baseURL = process.env.TALOS_E2E_BASE_URL ?? 'http://127.0.0.1:8014'

export default defineConfig({
    testDir: './tests/e2e',
    timeout: 30_000,
    expect: {
        timeout: 8_000,
    },
    fullyParallel: false,
    reporter: [
        ['list'],
        ['html', { open: 'never', outputFolder: 'storage/playwright-report' }],
    ],
    use: {
        baseURL,
        trace: 'retain-on-failure',
        screenshot: 'only-on-failure',
        video: 'retain-on-failure',
    },
    webServer: process.env.TALOS_E2E_BASE_URL
        ? undefined
        : {
            command: 'npx concurrently -k -s first -n laravel,vite "..\\.tools\\php\\php.exe artisan serve --host=127.0.0.1 --port=8014" "npm run dev -- --host 127.0.0.1 --port 5173"',
            url: baseURL,
            reuseExistingServer: !process.env.CI,
            timeout: 120_000,
        },
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
