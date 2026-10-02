import { describe, expect, it } from 'vitest'
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { resolve } from 'node:path'

/*
 * ⭐⭐ La release firmata dalla CI porta l'NPU Qualcomm (owner 01/10 «NPU nella release adesso»; owner 02/10 «File segreto della
 * CI», dopo la riga PKLA 8.2 del registro di conformità: «nessun file dell'SDK nel repository; i binari solo dentro l'APK»).
 *
 * Il difetto che questa prova custodisce: il workflow di release NON passava `-PtalosHexagonDir`, quindi l'APK firmato dalla CI
 * sarebbe uscito SENZA NPU, senza che nessun cancello se ne accorgesse (i binari erano solo in una cartella di lavoro locale).
 * Qui: i binari NON stanno nel repo, c'è il file cifrato con le impronte; il workflow lo decifra, passa la cartella a Gradle, e
 * controlla l'APK firmato; se il segreto manca la release SI FERMA.
 *
 * Il workflow sta nella radice del repo (condiviso con le altre lane): in una cartella con solo `mobile/` la prova salta da sola.
 */
const radiceMobile = process.cwd()
const workflow = resolve(radiceMobile, '..', '.github', 'workflows', 'release.yml')
const haIlWorkflow = existsSync(workflow)

function cartelleDi(radice: string): string[] {
    return readdirSync(radice, { withFileTypes: true }).flatMap((voce) =>
        voce.isDirectory() && voce.name !== 'node_modules' && voce.name !== 'build' && voce.name !== '.git'
            ? [resolve(radice, voce.name), ...cartelleDi(resolve(radice, voce.name))]
            : [])
}

describe('NPU-REL — la release firmata dalla CI porta l\'NPU, senza binari nel repository', () => {
    it('NPU-REL-01 nel repo c\'è il file CIFRATO e le 5 impronte, e nessun binario dell\'NPU in chiaro', () => {
        const cifrato = resolve(radiceMobile, 'android', 'npu-hexagon.tar.gz.gpg')
        const impronte = resolve(radiceMobile, 'android', 'npu-hexagon.sha256')
        expect(existsSync(cifrato), 'android/npu-hexagon.tar.gz.gpg').toBe(true)
        // OpenPGP: un pacchetto cifrato simmetricamente (tag 3 = SKESK) e nessun testo in chiaro riconoscibile come ELF.
        const testa = readFileSync(cifrato).subarray(0, 4)
        expect(testa.toString('latin1')).not.toContain('ELF')
        const righe = readFileSync(impronte, 'utf8').trim().split('\n')
        expect(righe.map((riga) => riga.split(/\s+\*?/)[1]).sort()).toEqual([
            'libggml-hexagon.so', 'libggml-htp-v73.so', 'libggml-htp-v75.so', 'libggml-htp-v79.so', 'libggml-htp-v81.so',
        ])
        for (const riga of righe) expect(riga.split(/\s+/)[0]).toMatch(/^[0-9a-f]{64}$/)
        // PKLA 8.2: nessuna `.so` dell'NPU tracciata in giro per android/ (le build di prova usano cartelle fuori dal repo).
        for (const cartella of cartelleDi(resolve(radiceMobile, 'android'))) {
            for (const nome of readdirSync(cartella)) {
                expect(nome, `${cartella}/${nome}`).not.toMatch(/^libggml-(hexagon|htp-v\d+)\.so$|^libtalos-npu-hexagon\.so$/)
            }
        }
    })

    it.skipIf(!haIlWorkflow)('NPU-REL-02 il workflow decifra, passa la cartella a Gradle e controlla l\'APK firmato', () => {
        const testo = readFileSync(workflow, 'utf8')
        expect(testo).toContain('secrets.TALOS_NPU_PASSPHRASE')
        expect(testo).toContain('android/npu-hexagon.tar.gz.gpg')
        expect(testo).toContain('sha256sum -c')
        expect(testo).toMatch(/-PtalosHexagonDir=\$\{\{ steps\.npu\.outputs\.dir \}\}/)
        expect(testo).toMatch(/verify-npu-unmodified\.mjs/)
        // Ordine: prima si decifra, poi si costruisce, poi si controlla l'APK.
        const decifra = testo.indexOf('id: npu')
        const costruisce = testo.indexOf("name: costruisci l'APK firmato")
        const controlla = testo.indexOf('verify-npu-unmodified.mjs')
        expect(decifra).toBeGreaterThan(0)
        expect(costruisce).toBeGreaterThan(decifra)
        expect(controlla).toBeGreaterThan(costruisce)
    })

    it.skipIf(!haIlWorkflow)('NPU-REL-03 senza il segreto la release SI FERMA, mai un APK senza NPU in silenzio', () => {
        const testo = readFileSync(workflow, 'utf8')
        const passo = testo.slice(testo.indexOf('id: npu'), testo.indexOf("name: costruisci l'APK firmato"))
        expect(passo).toMatch(/if \[ -z "\$NPU_PASSPHRASE" \]; then[\s\S]*exit 1/)
        expect(passo).toContain('::error::')
        // La passphrase non resta sul disco del runner dopo l'uso.
        expect(passo).toContain('rm -f "$RUNNER_TEMP/npu-passphrase"')
    })
})
