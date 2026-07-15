import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';
import laravel from 'laravel-vite-plugin';
import tailwindcss from '@tailwindcss/vite';
import vue from '@vitejs/plugin-vue';

export default defineConfig({
    build: {
        rolldownOptions: {
            output: {
                codeSplitting: {
                    groups: [
                        {
                            name: 'markdown-runtime',
                            test: /node_modules[\\/](?:dompurify|markdown-it|linkify-it|mdurl|uc\.micro|entities)[\\/]/,
                            priority: 20,
                        },
                    ],
                },
            },
        },
    },
    resolve: {
        alias: {
            '@': fileURLToPath(new URL('./resources/js', import.meta.url)),
            'lucide-vue-next': '@lucide/vue',
        },
    },
    test: {
        include: ['resources/js/**/*.test.{ts,js}'],
        exclude: ['tests/e2e/**', 'scripts/**', 'node_modules/**'],
    },
    plugins: [
        vue(),
        laravel({
            input: ['resources/css/app.css', 'resources/js/app.js'],
            refresh: true,
        }),
        tailwindcss(),
    ],
    server: {
        watch: {
            ignored: ['**/storage/framework/views/**'],
        },
    },
});
