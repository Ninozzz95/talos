import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { assertPluginClasses, CLASSI_RICHIESTE } from './verify-release-plugin-classes.mjs'

/**
 * ⛔⛔⛔ 3/9 — la metà DINAMICA del cancello "Codice spedisce in release".
 * Prova solo `assertPluginClasses` (pura, byte finti) — `estraiDex` vuole
 * un APK vero e si esercita nel pre-flight di release, non qui.
 */
function dexFinto(descrittoriPresenti) {
    // Un dex vero è binario; qui basta che i descrittori cercati compaiano
    // (o no) come sottostringhe — esattamente ciò che la funzione controlla.
    const rumore = Buffer.from('\x00dex\n039\x00rumore binario non testuale qui in mezzo\x00\x01\x02', 'latin1')
    return Buffer.concat([rumore, Buffer.from(descrittoriPresenti.join('\n'), 'latin1'), rumore])
}

describe('assertPluginClasses', () => {
    it('⭐ entrambi i descrittori presenti: PASS', () => {
        const dex = dexFinto(['Lai/talos/harness/TalosHarnessUiPlugin;', 'Lai/talos/terminal/TalosTerminalPlugin;'])
        const { verdict, issues } = assertPluginClasses(dex, CLASSI_RICHIESTE)
        assert.equal(verdict, 'PASS')
        assert.deepEqual(issues, [])
    })

    it('⛔ AL CONTRARIO — un descrittore assente (classe rinominata da R8): FAIL, nomina quale', () => {
        const dex = dexFinto(['Lai/talos/harness/TalosHarnessUiPlugin;']) // il terminale manca
        const { verdict, issues } = assertPluginClasses(dex, CLASSI_RICHIESTE)
        assert.equal(verdict, 'FAIL')
        assert.equal(issues.length, 1)
        assert.match(issues[0], /TalosTerminalPlugin/)
    })

    it('⛔ AL CONTRARIO — solo la stringa PUNTATA di Class.forName sopravvive (il caso reale della rottura): FAIL comunque', () => {
        // Il caso che questo cancello esiste per prendere: R8 rinomina la
        // classe, ma la stringa costante del call site Class.forName("ai.
        // talos.harness.TalosHarnessUiPlugin") resta byte-per-byte intatta
        // — punti, non barre. Un controllo che cercasse QUELLA stringa
        // direbbe "PASS" su una build rotta. Questo cerca il descrittore
        // con le barre, che R8 avrebbe cancellato insieme al nome vero.
        const dex = dexFinto(['ai.talos.harness.TalosHarnessUiPlugin', 'ai.talos.terminal.TalosTerminalPlugin'])
        const { verdict, issues } = assertPluginClasses(dex, CLASSI_RICHIESTE)
        assert.equal(verdict, 'FAIL')
        assert.equal(issues.length, 2)
    })

    it('⛔ AL CONTRARIO — dex completamente vuoto: FAIL su entrambe', () => {
        const { verdict, issues } = assertPluginClasses(Buffer.alloc(0), CLASSI_RICHIESTE)
        assert.equal(verdict, 'FAIL')
        assert.equal(issues.length, CLASSI_RICHIESTE.length)
    })
})
