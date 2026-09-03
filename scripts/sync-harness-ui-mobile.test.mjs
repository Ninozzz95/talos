import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { sincronizzaHarnessUiMobile } from './sync-harness-ui-mobile.mjs'

/**
 * ⭐⭐⭐ 30/8 — chiude il debito dichiarato in
 * LEDGER-MOBILE-PAREGGIO-DESKTOP-CODICE.md ("nessuno script di sync
 * automatico... ogni cherry-pick era finito nel sorgente ma MAI nella
 * copia imbarcata"). Radice finta in una cartella temporanea — mai
 * toccare il vero `mobile/android/` da un test.
 */
function radiceFinta(t) {
    const radice = mkdtempSync(join(tmpdir(), 'sync-harness-ui-mobile-'))
    t.after(() => rmSync(radice, { recursive: true, force: true }))
    mkdirSync(join(radice, 'public', 'harness-ui'), { recursive: true })
    writeFileSync(join(radice, 'public', 'harness-ui', 'app.js'), 'contenuto app.js v1')
    mkdirSync(join(radice, 'scripts', 'harness-talos'), { recursive: true })
    writeFileSync(join(radice, 'scripts', 'harness-talos', 'talosHarness.mjs'), 'contenuto kernel v1')
    return radice
}

function creaCartellaAndroid(radice) {
    mkdirSync(join(radice, 'android', 'app', 'src', 'debug', 'assets', 'talos-harness-ui', 'mobile-public'), { recursive: true })
    mkdirSync(join(radice, 'android', 'app', 'src', 'debug', 'assets', 'talos-harness-ui', 'kernel'), { recursive: true })
}

describe('sincronizzaHarnessUiMobile', () => {
    it('copia bundle client e kernel quando la cartella android/ esiste e sono diversi', (t) => {
        const radice = radiceFinta(t)
        creaCartellaAndroid(radice)
        const righe = []
        const { ok, righe: esiti } = sincronizzaHarnessUiMobile(radice, (r) => righe.push(r))

        assert.equal(ok, true)
        assert.deepEqual(esiti.map((e) => e.esito), ['copiato', 'copiato'])
        assert.equal(
            readFileSync(join(radice, 'android', 'app', 'src', 'debug', 'assets', 'talos-harness-ui', 'mobile-public', 'app.js'), 'utf8'),
            'contenuto app.js v1',
        )
        assert.equal(
            readFileSync(join(radice, 'android', 'app', 'src', 'debug', 'assets', 'talos-harness-ui', 'kernel', 'talosHarness.mjs'), 'utf8'),
            'contenuto kernel v1',
        )
    })

    it('⭐ il kernel già allineato risulta "invariato" — un file, confrontato byte a byte', (t) => {
        const radice = radiceFinta(t)
        creaCartellaAndroid(radice)
        sincronizzaHarnessUiMobile(radice) // prima passata: copia
        const { righe } = sincronizzaHarnessUiMobile(radice) // seconda: nulla è cambiato

        const kernel = righe.find((r) => r.nome === 'kernel talosHarness.mjs')
        assert.equal(kernel.esito, 'invariato')
    })

    it('⭐ una modifica al kernel dopo la prima sync torna "copiato" alla sync successiva', (t) => {
        const radice = radiceFinta(t)
        creaCartellaAndroid(radice)
        sincronizzaHarnessUiMobile(radice)
        writeFileSync(join(radice, 'scripts', 'harness-talos', 'talosHarness.mjs'), 'contenuto kernel v2 — modificato')

        const { righe } = sincronizzaHarnessUiMobile(radice)
        const kernel = righe.find((r) => r.nome === 'kernel talosHarness.mjs')
        assert.equal(kernel.esito, 'copiato')
        assert.equal(
            readFileSync(join(radice, 'android', 'app', 'src', 'debug', 'assets', 'talos-harness-ui', 'kernel', 'talosHarness.mjs'), 'utf8'),
            'contenuto kernel v2 — modificato',
        )
    })

    it('⛔ AL CONTRARIO — nessuna cartella android/: salta onestamente, mai un errore fatale (checkout solo-web)', (t) => {
        const radice = radiceFinta(t) // NIENTE creaCartellaAndroid()
        const { ok, righe } = sincronizzaHarnessUiMobile(radice)

        assert.equal(ok, true) // saltare non è un fallimento
        assert.deepEqual(righe.map((r) => r.esito), ['saltato', 'saltato'])
    })

    it('⛔ AL CONTRARIO — sorgente assente: ok:false, mai un crash silenzioso', (t) => {
        const radice = mkdtempSync(join(tmpdir(), 'sync-harness-ui-mobile-vuota-'))
        t.after(() => rmSync(radice, { recursive: true, force: true }))
        creaCartellaAndroid(radice) // la destinazione c'è, l'origine no

        const { ok, righe } = sincronizzaHarnessUiMobile(radice)
        assert.equal(ok, false)
        assert.deepEqual(righe.map((r) => r.esito), ['sorgente-assente', 'sorgente-assente'])
    })
})
