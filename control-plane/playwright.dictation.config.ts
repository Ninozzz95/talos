import { defineConfig, devices } from '@playwright/test'
import baseConfig from './playwright.config'

export default defineConfig({
    ...baseConfig,
    grep: /dictation driver records browser audio/,
    projects: [
        {
            name: 'chromium-dictation-driver',
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
    ],
})
