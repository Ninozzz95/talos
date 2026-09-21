import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * Il file che `npx cap sync android` genera dentro l'app.
 *
 * ⛔ NON È TRACCIATO DA GIT — `android/.gitignore:108` lo esclude, perché è un
 * prodotto della sincronizzazione, non una sorgente. Quindi in un repository
 * appena clonato NON C'È: né nella copia pubblicata, né sul computer di chi
 * scarica il progetto e lancia i test prima di aver fatto un `cap sync`.
 *
 * MISURATO il 2026-08-16: questo test falliva su `ubuntu-latest` per questo, e
 * sarebbe fallito identico a qualunque persona avesse clonato e lanciato
 * `npm run test:unit` — che è precisamente ciò che il README invita a fare.
 */
const SINCRONIZZATO = resolve(process.cwd(), 'android/app/src/main/assets/capacitor.config.json')

describe('C45-RED-18J Capacitor bridge logging policy', () => {
    /*
     * La sorgente si controlla SEMPRE: è la cosa che una persona può cambiare,
     * ed è da lì che il valore sincronizzato discende.
     */
    it('disables payload logging in the source config', () => {
        const config = readFileSync(resolve(process.cwd(), 'capacitor.config.ts'), 'utf8')
        const packageJson = JSON.parse(readFileSync(resolve(process.cwd(), 'package.json'), 'utf8')) as {
            dependencies: Record<string, string>
        }

        expect(packageJson.dependencies['@capacitor/android']).toBe('8.4.2')
        expect(config).toContain("loggingBehavior: 'none'")
    })

    /*
     * ⛔ E l'ASSET SINCRONIZZATO si controlla dove esiste, perché è quello che
     * finisce davvero dentro l'APK: una sorgente giusta e una sincronizzazione
     * vecchia darebbero un'app che registra i payload del ponte lo stesso.
     *
     * ⇒ Dove c'è, morde come prima. Dove non c'è, dichiara di non applicarsi
     * invece di far sembrare rotto un repository che è soltanto appena stato
     * clonato.
     */
    it.skipIf(!existsSync(SINCRONIZZATO))('disables payload logging in the synced Android asset', () => {
        const generated = JSON.parse(readFileSync(SINCRONIZZATO, 'utf8')) as { loggingBehavior?: string }
        expect(generated.loggingBehavior).toBe('none')
    })
})
