import { defineConfig, devices } from '@playwright/test'
import baseConfig from './playwright.config'

export default defineConfig({
    ...baseConfig,
    projects: [
        {
            name: 'chromium-dictation-driver',
            grep: /dictation driver/,
            use: {
                ...devices['Desktop Chrome'],
                permissions: ['clipboard-read', 'clipboard-write', 'microphone'],
                launchOptions: {
                    args: [
                        '--use-fake-device-for-media-stream',
                        '--use-fake-ui-for-media-stream',
                    ],
                },
            },
        },
        {
            name: 'chromium-dictation-denied',
            grep: /dictation permission denial is visible and retryable/,
            use: {
                ...devices['Desktop Chrome'],
                permissions: ['clipboard-read', 'clipboard-write'],
                launchOptions: {
                    args: [
                        '--use-fake-device-for-media-stream',
                        '--deny-permission-prompts',
                    ],
                },
            },
        },
    ],
})
