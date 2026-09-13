import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { verificaCodiceInMain, PERCORSI_RICHIESTI_IN_MAIN } from './verify-codice-ships-in-release.mjs'

/**
 * ⛔⛔⛔ 3/9 — chiude il debito che ha lasciato uscire la v0.1.24 con Codice
 * assente dalla build di rilascio: nessun test controllava DOVE, nel
 * source set, vivessero questi file. Radice finta in una cartella
 * temporanea — mai toccare il vero `mobile/android/` da un test.
 */
function creaFile(radice, relativo) {
    const pieno = join(radice, relativo)
    if (relativo.endsWith('.kt')) {
        mkdirSync(join(pieno, '..'), { recursive: true })
        writeFileSync(pieno, '// finto, basta che esista')
    }
    else {
        mkdirSync(pieno, { recursive: true })
    }
}

function radiceConTuttoInMain(t) {
    const radice = mkdtempSync(join(tmpdir(), 'verify-codice-ships-in-release-'))
    t.after(() => rmSync(radice, { recursive: true, force: true }))
    for (const relativo of PERCORSI_RICHIESTI_IN_MAIN) creaFile(join(radice, 'main'), relativo)
    return radice
}

describe('verificaCodiceInMain', () => {
    it('⭐ tutto in main/: ok, zero segnalazioni', (t) => {
        const radice = radiceConTuttoInMain(t)
        const { ok, issues } = verificaCodiceInMain(radice)
        assert.equal(ok, true)
        assert.deepEqual(issues, [])
    })

    it('⛔ AL CONTRARIO — un file tornato sotto debug/ invece che main/: FALLISCE, e lo dice chiaro', (t) => {
        const radice = mkdtempSync(join(tmpdir(), 'verify-codice-ships-in-release-regresso-'))
        t.after(() => rmSync(radice, { recursive: true, force: true }))
        // Tutto tranne UNO, che finisce sotto debug/ — esattamente il difetto
        // della v0.1.24 (l'intero bundle ci viveva dal 24/8).
        const [ripristinato, ...resto] = PERCORSI_RICHIESTI_IN_MAIN
        for (const relativo of resto) creaFile(join(radice, 'main'), relativo)
        creaFile(join(radice, 'debug'), ripristinato)

        const { ok, issues } = verificaCodiceInMain(radice)
        assert.equal(ok, false)
        assert.ok(issues.some((i) => i.includes(ripristinato) && i.includes('manca in main/')))
        assert.ok(issues.some((i) => i.includes(ripristinato) && i.includes('debug/')))
    })

    it('⛔ AL CONTRARIO — assente ovunque (non solo fuori posto): FALLISCE lo stesso, messaggio diverso', (t) => {
        const radice = mkdtempSync(join(tmpdir(), 'verify-codice-ships-in-release-assente-'))
        t.after(() => rmSync(radice, { recursive: true, force: true }))
        // Nessun creaFile per niente: cartella vuota.
        mkdirSync(join(radice, 'main'), { recursive: true })

        const { ok, issues } = verificaCodiceInMain(radice)
        assert.equal(ok, false)
        assert.equal(issues.length, PERCORSI_RICHIESTI_IN_MAIN.length)
        assert.ok(issues.every((i) => i.includes('assente ovunque')))
    })

    it('una copia dimenticata sotto debug/ OLTRE a quella (corretta) in main/ è comunque segnalata', (t) => {
        const radice = radiceConTuttoInMain(t)
        // Una seconda copia, dimenticata, sotto debug/ — non rompe la build
        // di rilascio (Gradle legge main/), ma è il segnale di un merge a
        // metà: il cancello lo dice comunque, non tace solo perché main/ è ok.
        creaFile(join(radice, 'debug'), PERCORSI_RICHIESTI_IN_MAIN[0])

        const { ok, issues } = verificaCodiceInMain(radice)
        assert.equal(ok, false)
        assert.ok(issues.some((i) => i.includes('presente ANCHE sotto debug/')))
    })
})
