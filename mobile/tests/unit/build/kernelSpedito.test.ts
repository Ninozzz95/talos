import { describe, expect, it } from 'vitest'
import { existsSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'

/**
 * ⭐ KERNEL-SPEDITO (owner 25/09/2026, «prove sul kernel spedito»; dossier
 * `.claude/ricerche/2026-09-25-release-mobile-v0138-10x4.md`, domanda 6).
 *
 * I test del server del Codice girano sulla copia del kernel DENTRO l'APK (alias in `vitest.config.ts`), perché è
 * tracciata col suo pacchetto compilato: la CI e il job di release provano prima della build, su un clone pulito. Questo
 * test tiene quella copia uguale al sorgente: se si cambia `scripts/harness-talos/talosHarness.mjs` senza rifare la build
 * (che la sincronizza), è rosso invece di provare un kernel vecchio.
 */

const MOBILE = resolve(__dirname, '..', '..', '..')
const SORGENTE = join(MOBILE, 'scripts', 'harness-talos')
const SPEDITO = join(MOBILE, 'android', 'app', 'src', 'main', 'assets', 'talos-harness-ui', 'kernel')

describe('KERNEL-SPEDITO: il kernel che si prova è quello che si spedisce', () => {
    it('KERNEL-SPEDITO-01: il kernel spedito coincide col sorgente, byte per byte', () => {
        expect(readFileSync(join(SPEDITO, 'talosHarness.mjs')).equals(readFileSync(join(SORGENTE, 'talosHarness.mjs'))),
            'kernel cambiato senza sincronizzarlo: `npm run build` lo imbarca').toBe(true)
    })

    it('KERNEL-SPEDITO-02: il pacchetto compilato del kernel spedito è nel repository', () => {
        expect(existsSync(join(SPEDITO, 'dist', 'kernelPerIlBanco.js'))).toBe(true)
    })

    it('KERNEL-SPEDITO-03: dove c’è il pacchetto compilato di sviluppo, è uguale a quello spedito', () => {
        const sviluppo = join(SORGENTE, 'dist', 'kernelPerIlBanco.js')
        if (!existsSync(sviluppo)) return
        expect(readFileSync(sviluppo).equals(readFileSync(join(SPEDITO, 'dist', 'kernelPerIlBanco.js')))).toBe(true)
    })

    it('KERNEL-SPEDITO-04: vitest.config.ts manda i test del Codice al kernel spedito', () => {
        const configurazione = readFileSync(join(MOBILE, 'vitest.config.ts'), 'utf8')
        expect(configurazione).toContain("'./android/app/src/main/assets/talos-harness-ui/kernel/talosHarness.mjs'")
    })
})
