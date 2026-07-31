import { defineConfig } from '@playwright/test'

const SEEDED_SETTINGS = {
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
                // Returning user: unified setup is already resolved.
                onboarding: { intro_version: 2, intro_outcome: 'completed', setup_dismissed: true },
            }),
        }],
    }],
}

export default defineConfig({
    testDir: 'tests/e2e',
    timeout: 60000,
    /**
     * Four workers, measured: 10.4 minutes serial became 2.6.
     *
     * Eight was tried first and was WORSE — 2.8 minutes and a flake — because
     * this box has many slow cores and each Chromium is heavy. Four is where the
     * curve flattens here; more is not free.
     */
    workers: 4,
    /**
     * Playwright's 5s assertion default is a guess about how fast a machine is,
     * and on a loaded 2.1GHz box under four workers it is the wrong guess: one
     * test failed waiting for a reply that was still on its way. Ten seconds
     * still fails a broken app — it just stops failing a busy one. The per-test
     * 60s budget is unchanged, so nothing can hang here unnoticed.
     */
    expect: { timeout: 10_000 },
    use: {
        baseURL: 'http://127.0.0.1:4173',
        viewport: { width: 375, height: 812 },
        /**
         * Owner 2026-07-31: «quasi 10 minuti per e2e».
         *
         * The boot logo holds for 1500ms and dissolves over 500 more, on EVERY
         * `goto('/')` — and there are sixty of them. Two minutes of the ten were
         * spent watching an animation that only five tests are about. Under
         * reduced motion the same overlay holds 450ms, which is the app's own
         * behaviour rather than a test-only shortcut.
         *
         * The specs that exist to check motion set `no-preference` explicitly,
         * so what they assert is what a person with animations on would see.
         */
        reducedMotion: 'reduce',
        // F2-T6: pre-seed the versioned intro as seen so existing journeys are
        // not intercepted by the first-run modal. Intro/onboarding journeys
        // override this with an EMPTY storageState to exercise the real flow.
        storageState: SEEDED_SETTINGS,
    },
    /**
     * `setup` runs first and produces the configured-provider state; everything
     * else depends on it. Specs that need a provider name the file explicitly —
     * see provider.setup.ts for why it is opt-in rather than the default.
     */
    projects: [
        { name: 'setup', testMatch: /.*\.setup\.ts/ },
        { name: 'phone', testIgnore: /.*\.setup\.ts/, dependencies: ['setup'] },
    ],
    webServer: {
        command: 'npm run preview -- --host 127.0.0.1 --port 4173 --strictPort',
        url: 'http://127.0.0.1:4173',
        reuseExistingServer: true,
        timeout: 60000,
    },
})
