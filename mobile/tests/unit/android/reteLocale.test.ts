/**
 * RETE-LOCALE-01/02 (ASS-144, owner 28/10/2026, OnePlus 13 Android 17: «Non riesco a farlo neanche dalla notifica»; poi, concesso il
 * permesso a mano: «funziona era quello il problema»). Il manifest dichiarava `ACCESS_LOCAL_NETWORK` dal 30/07 (329c2c3a1, per Ollama)
 * credendolo inerte prima di Android 17. Con targetSdk 36 su Android 17 la dichiarazione lo rende un permesso runtime MAI chiesto:
 * `granted=false`, appops `ignore`, e NsdManager non consegna l'annuncio d'accoppiamento del ponte.
 *
 * Fonte (developer.android.com/privacy-and-security/local-network-permission, aggiornata il 02/10/2026): «If your app targets SDK 36 or
 * lower, local network access is implicitly granted using the INTERNET permission. For these lower target SDKs, don't add
 * ACCESS_LOCAL_NETWORK to your manifest or request it at runtime.» Da targetSdk 37 invece va dichiarato E chiesto.
 */
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const android = resolve(__dirname, '../../../android')
const targetSdk = Number(/targetSdkVersion\s*=\s*(\d+)/u.exec(readFileSync(resolve(android, 'variables.gradle'), 'utf8'))?.[1])
const manifest = readFileSync(resolve(android, 'app/src/main/AndroidManifest.xml'), 'utf8')
const dichiarato = /<uses-permission\s+android:name="android\.permission\.ACCESS_LOCAL_NETWORK"/u.test(manifest)

describe('RETE-LOCALE il permesso della rete locale segue il targetSdk, come dice la fonte', () => {
    it('RETE-LOCALE-01 con targetSdk sotto 37 il manifest NON dichiara ACCESS_LOCAL_NETWORK (concesso implicitamente via INTERNET)', () => {
        expect(Number.isFinite(targetSdk)).toBe(true)
        if (targetSdk < 37) {
            expect(dichiarato).toBe(false)
            expect(manifest).toMatch(/<uses-permission\s+android:name="android\.permission\.INTERNET"/u)
        }
    })

    it('RETE-LOCALE-02 il giorno che si sale a 37: dichiarato E chiesto a runtime prima di NsdManager', () => {
        if (targetSdk >= 37) {
            expect(dichiarato).toBe(true)
            const nativo = readFileSync(resolve(android, 'app/src/main/java/ai/talos/agent/TalosPrivilegePlugin.kt'), 'utf8')
            expect(nativo).toMatch(/ACCESS_LOCAL_NETWORK/u)
        } else {
            expect(targetSdk).toBeLessThan(37)
        }
    })
})
