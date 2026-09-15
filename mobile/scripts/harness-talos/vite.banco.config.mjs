/*
 * Il bundle del kernel per il banco: Node, non browser.
 *
 * ⛔ `ssr: true` non e' un dettaglio di configurazione: senza, Vite tratta
 * `node:fs` come una dipendenza da risolvere per il browser e il build muore.
 * Con, la lascia esterna - che e' esattamente cio' che serve, perche' qui
 * `node:fs` c'e' davvero.
 */
import { defineConfig } from 'vite'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const qui = path.dirname(fileURLToPath(import.meta.url))
const mobile = path.resolve(qui, '..', '..')

export default defineConfig({
    resolve: { alias: { '@': path.resolve(mobile, 'src') } },
    build: {
        ssr: true,
        outDir: path.resolve(qui, 'dist'),
        emptyOutDir: true,
        target: 'node22',
        lib: {
            entry: path.resolve(qui, 'kernelPerIlBanco.ts'),
            formats: ['es'],
            fileName: () => 'kernelPerIlBanco.mjs',
        },
        rollupOptions: {
            // ⛔ `typescript` resta ESTERNO: il catalogo dei simboli lo carica a
            // richiesta, e includerlo qui gonfierebbe il bundle di megabyte per
            // una cosa che in Node c'e' gia'.
            external: [/^node:/, 'typescript'],
        },
    },
})
