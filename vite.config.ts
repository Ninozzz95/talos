import { execSync } from 'node:child_process'

import path from 'node:path'

import { defineConfig } from 'vite'

import vue from '@vitejs/plugin-vue'

import tailwindcss from '@tailwindcss/vite'



// Deep-debug build stamp (owner: "dobbiamo debuggare esattamente quello che

// succede, non andare alla cieca") — a git SHA + build time baked at compile

// time so the Doctor tells us EXACTLY which APK is running. Never fails the

// build if git is unavailable.

function talosBuildId(): string {

    let sha = 'nogit'

    try { sha = execSync('git rev-parse --short HEAD', { encoding: 'utf8' }).trim() } catch { /* keep */ }

    return `${sha} @ ${new Date().toISOString()}`

}



// https://vite.dev/config/

export default defineConfig({

    define: {

        __TALOS_BUILD_ID__: JSON.stringify(talosBuildId()),

        // Vue's three production flags, which were never set — so the build was
        // shipping support for things this app does not do.
        //
        // Checked before switching them off rather than assumed: of 115 `.vue`
        // components, 106 use `<script setup>`, ZERO declare `export default {}`,
        // and no `defineComponent` call carries `data`/`methods`/`computed`/
        // `watch`. The Options API is not used anywhere, so compiling support
        // for it into the entry chunk is weight for a feature nobody calls.
        //
        // Without these defined, the flags stay `true` in the bundled runtime
        // and the dead branches survive tree-shaking, because a bundler cannot
        // drop a branch on a value it has not been told.
        __VUE_OPTIONS_API__: false,

        __VUE_PROD_DEVTOOLS__: false,

        __VUE_PROD_HYDRATION_MISMATCH_DETAILS__: false,

    },

    plugins: [

        vue(),

        tailwindcss(),

        // Product review 2026-07-25: @fontsource ships .woff next to .woff2 and

        // both end up in the APK. The Android System WebView is Chromium, which

        // has supported WOFF2 since Chrome 36 — the .woff fallbacks can never be

        // selected, so they were ~213KB of dead weight in the bundle and on disk.

        {

            name: 'talos-drop-legacy-woff',

            enforce: 'post' as const,

            generateBundle(_options: unknown, bundle: Record<string, unknown>) {

                // Product review 2026-07-26 (defect #3, P2): deleting the files

                // was only half the job — the CSS was emitted BEFORE this hook

                // and still carried 17 `url(...woff) format("woff")` fallbacks

                // pointing at files no longer in the package. Harmless while

                // woff2 wins, but it is a lie inside a shipped artifact and a

                // 404 for any engine that reaches for the fallback.

                for (const [fileName, asset] of Object.entries(bundle)) {

                    if (!fileName.endsWith('.css')) continue

                    const chunk = asset as { source?: unknown }

                    if (typeof chunk.source !== 'string') continue

                    chunk.source = chunk.source.replace(
                        /,?\s*url\((?:[^)]*\.woff|data:font\/woff;[^)]*)\)\s*format\(["']woff["']\)/g,
                        '',
                    )

                }

                for (const fileName of Object.keys(bundle)) {

                    if (fileName.endsWith('.woff')) delete bundle[fileName]

                }

            },

        },

    ],

    worker: {

        format: 'es',

    },

    build: {

        manifest: true,

    },

    resolve: {

        alias: {

            '@': path.resolve(__dirname, './src'),

        },

    },

})
