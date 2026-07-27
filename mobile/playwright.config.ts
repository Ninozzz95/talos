import { defineConfig } from '@playwright/test'

export default defineConfig({
    testDir: 'tests/e2e',
    timeout: 60000,
    workers: process.env.CI ? 1 : 4,
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
                        // Owner #15 flipped the defaults (immersive+drawer):
                        // existing journeys exercise the classic shell, seeded
                        // as an explicit post-migration choice; fresh-default
                        // journeys override with an empty storage.
                        defaults_v3: true,
                        presentation_v2: true,
                        shell: { immersive_header: false, composer_drawer: false },
                        // N1: returning user — intro AND the account wizard are
                        // already resolved so existing journeys aren't intercepted.
                        onboarding: { intro_version: 1, intro_outcome: 'completed', setup_dismissed: true, wizard_version: 1, wizard_outcome: 'completed' },
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
