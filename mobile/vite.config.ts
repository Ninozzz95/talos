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
    },
    plugins: [vue(), tailwindcss()],
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
