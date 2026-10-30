/**
 * PAGINE-16K-01/02 — owner 28/10/2026 (foto dal OnePlus 13, Android 17, vc348): «Questa app non è compatibile con dimensioni pagina di
 * 16 kB. Controllo allineamento ELF non riuscito». Misurato sull'APK: 89 librerie su 90 allineate a 16 kB, una no:
 * `libtalos_pocket_sentencepiece.so` (LOAD a 0x1000), perché il modulo `pocket-tts-runtime` si compilava con l'NDK r27 mentre l'app usa
 * r29. Da r28 l'NDK allinea a 16 kB da solo (developer.android.com/guide/practices/page-sizes, aggiornata il 16/10/2026); Play blocca gli
 * aggiornamenti non allineati dal 01/02/2027. Regola: UN NDK solo per tutti i moduli (owner 10/09, «allineare l'NDK»), mai sotto r28.
 */
import { describe, expect, it } from 'vitest'
import { readFileSync, readdirSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'

const android = resolve(__dirname, '../../../android')
const versione = (file: string): string | null => /ndkVersion\s*=?\s*['"]([\d.]+)['"]/u.exec(readFileSync(file, 'utf8'))?.[1] ?? null

describe('PAGINE-16K le librerie native allineate a 16 kB', () => {
    const app = versione(resolve(android, 'app/build.gradle'))

    it('PAGINE-16K-01 l\'app usa un NDK r28 o successivo (allineamento a 16 kB di serie)', () => {
        expect(app).not.toBeNull()
        expect(Number(app!.split('.')[0])).toBeGreaterThanOrEqual(28)
    })

    it('PAGINE-16K-02 ogni modulo con codice nativo usa lo STESSO NDK dell\'app', () => {
        const moduli = readdirSync(android, { withFileTypes: true })
            .filter((d) => d.isDirectory() && existsSync(resolve(android, d.name, 'build.gradle')))
            .map((d) => ({ nome: d.name, ndk: versione(resolve(android, d.name, 'build.gradle')) }))
            .filter((m) => m.ndk !== null)
        expect(moduli.map((m) => m.nome)).toContain('pocket-tts-runtime')
        for (const m of moduli) expect(m.ndk, m.nome).toBe(app)
    })
})
