import path from 'node:path'
import { defineConfig } from 'vitest/config'
import vue from '@vitejs/plugin-vue'

export default defineConfig({
    plugins: [vue()],
    resolve: {
        alias: {
            '@': path.resolve(__dirname, './src'),
        },
    },
    test: {
        /**
         * A DOM is built per test FILE, and it was the largest single cost in
         * the gate: ~1.9s each, paid by 310 files of which about 90 mount
         * anything. Node is the default now and a file that needs a browser
         * says so in its own first line (`@vitest-environment jsdom`), which is
         * both faster and more honest — you can see what a test needs by
         * looking at it.
         */
        environment: 'node',
        include: ['tests/unit/**/*.test.ts', 'tests/integration/**/*.test.ts', 'src/**/*.test.ts'],
        setupFiles: ['./tests/setup/jsdomShims.ts'],
        // This suite includes real PDF generation and read-back. On high-core
        // hosts the default file-worker fan-out starves those tests past
        // Vitest's meaningful 5s timeout; four workers is the measured green
        // bound and retains both isolation and parallelism.
        maxWorkers: 4,
    },
})
