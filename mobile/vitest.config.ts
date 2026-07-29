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
        environment: 'jsdom',
        include: ['tests/unit/**/*.test.ts', 'tests/integration/**/*.test.ts', 'src/**/*.test.ts'],
        setupFiles: ['./tests/setup/jsdomShims.ts'],
        // This suite includes real PDF generation and read-back. On high-core
        // hosts the default file-worker fan-out starves those tests past
        // Vitest's meaningful 5s timeout; four workers is the measured green
        // bound and retains both isolation and parallelism.
        maxWorkers: 4,
    },
})
