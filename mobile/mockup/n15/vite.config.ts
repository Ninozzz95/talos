import path from 'node:path'
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import tailwindcss from '@tailwindcss/vite'

/**
 * N15 — mockup da approvare (owner 11/10/2026: «prima la misura sul Pad, poi il MOCKUP da approvare: niente codice di N15 prima del
 * suo sì sul mockup»). Fuori dalla build dell'app: monta i pezzi veri del prodotto (compositore, foglio, pulsanti, tema) con dati
 * finti, per le foto. Nessun file di `src/` cambia.
 */
export default defineConfig({
    root: __dirname,
    define: {
        __TALOS_BUILD_ID__: JSON.stringify('mockup-n15'),
        __VUE_OPTIONS_API__: false,
        __VUE_PROD_DEVTOOLS__: false,
        __VUE_PROD_HYDRATION_MISMATCH_DETAILS__: false,
    },
    plugins: [vue(), tailwindcss()],
    resolve: { alias: { '@': path.resolve(__dirname, '../../src') } },
    server: { port: 4179, strictPort: true, host: '127.0.0.1' },
})
