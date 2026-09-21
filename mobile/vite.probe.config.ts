import path from 'node:path'
import { defineConfig } from 'vite'

/**
 * The semantic probe builds SEPARATELY from the app on purpose.
 *
 * `scripts/verify-initial-chunk.mjs` requires the app manifest to contain
 * exactly one entry — a second Vite input would trip that gate, and weakening a
 * size gate to fit a measurement is exactly the kind of trade this project
 * refuses. Output lands in `dist/probe/`, which Capacitor copies into the APK,
 * so the probe is reachable at `/probe/index.html` and the app bundle is
 * untouched.
 */
export default defineConfig({
    root: path.resolve(__dirname, 'probe'),
    base: './',
    resolve: {
        alias: {
            '@': path.resolve(__dirname, './src'),
        },
    },
    build: {
        outDir: path.resolve(__dirname, 'dist/probe'),
        emptyOutDir: true,
        target: 'es2022',
    },
})
