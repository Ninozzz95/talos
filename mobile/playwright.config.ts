import { defineConfig } from '@playwright/test'

export default defineConfig({
    testDir: 'tests/e2e',
    timeout: 60000,
    use: {
        baseURL: 'http://127.0.0.1:4173',
        viewport: { width: 375, height: 812 },
        // F2-T6: pre-seed the versioned intro as seen so existing journeys are
        // not intercepted by the first-run modal. Intro/onboarding journeys
        // override this with an EMPTY storageState to exercise the real flow.
        storageState: {
            cookies: [],
            origins: [{
                origin: 'http://127.0.0.1:4173',
                localStorage: [{
                    name: 'CapacitorStorage.talos.mobile.settings',
                    value: JSON.stringify({
                        onboarding: { intro_version: 1, intro_outcome: 'completed', setup_dismissed: true },
                    }),
                }],
            }],
        },
    },
    webServer: {
        command: 'npm run preview -- --host 127.0.0.1 --port 4173 --strictPort',
        url: 'http://127.0.0.1:4173',
        reuseExistingServer: true,
        timeout: 60000,
    },
})
