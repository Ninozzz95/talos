import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const PROGUARD = resolve(__dirname, '../../../android/app/proguard-rules.pro')

/**
 * ⛔⛔ D-REM-R8 (telefono dell'owner, ai.talos 0.1.44, 23/10/2026): l'app si chiudeva all'accoppiamento col PC con
 * `UnsatisfiedLinkError: Can't obtain peer field ID for class com.sun.jna.Pointer`. R8 rinominava i campi di JNA che la
 * sua parte nativa cerca per nome. Regole dalla FAQ di JNA («JNA on Android») e dalle librerie UniFFI (Breez, Glean).
 */
describe('il controllo remoto (iroh via JNA) sopravvive a R8', () => {
    it('R8-IROH-01 JNA e i binding UniFFI di iroh restano interi', () => {
        const regole = readFileSync(PROGUARD, 'utf8')
        expect(regole).toContain('-keep class com.sun.jna.** { *; }')
        expect(regole).toContain('-keep class * implements com.sun.jna.** { *; }')
        expect(regole).toContain('-keep class computer.iroh.** { *; }')
        expect(regole).toContain('-dontwarn java.awt.*')
    })
})
