import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { appendFileSync, cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { RIFERIMENTO, guardia, leggiRiferimento } from './guardia-nucleo-pc.mjs'

/**
 * ⛔ Riga 28: l'uscita del telefono si ferma se il suo nucleo non ha gli stessi byte del PC uscito (impronte, non commit).
 * Rossa con un nucleo diverso (un file cambiato in una COPIA) e con un riferimento finto; verde sulla testa.
 */
const DEPOSITO = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')
const ELENCO = JSON.parse(readFileSync(join(DEPOSITO, 'harness-ui/scripts/cancello/nucleo-condiviso.json'), 'utf8'))
const commit = leggiRiferimento(readFileSync(RIFERIMENTO, 'utf8')).commit
const presente = spawnSync('git', ['-C', DEPOSITO, 'cat-file', '-e', `${commit}^{commit}`]).status === 0
const senzaPc = presente ? false : `il commit del PC uscito ${commit.slice(0, 9)} non è in questo deposito (checkout corto?)`

function copiaDelNucleo(t) {
    const radice = mkdtempSync(join(tmpdir(), 'nucleo-telefono-'))
    t.after(() => rmSync(radice, { recursive: true, force: true }))
    for (const p of [...ELENCO.cartelle, ...ELENCO.file]) {
        mkdirSync(dirname(join(radice, p)), { recursive: true })
        cpSync(join(DEPOSITO, p), join(radice, p), { recursive: true, filter: (s) => !s.split(/[\\/]/u).includes('node_modules') })
    }
    return radice
}

describe('guardia del nucleo del PC uscito (riga 28)', () => {
    it('GN-01 il riferimento è uno solo, versionato, col commit intero del PC 0.2.5', () => {
        assert.equal(commit, 'ee2d44803049b608620b7117f139b258849c1aff')
        assert.throws(() => leggiRiferimento(JSON.stringify({ schema: 'talos.nucleo-del-pc-uscito.v1', commit: '4cc08aa10' })), /commit/u)
    })

    it('GN-02 verde: la testa ha il nucleo del PC uscito', { skip: senzaPc }, () => {
        const e = guardia()
        assert.equal(e.codice, 0, e.testo)
        assert.match(e.testo, /0 diversi · 0 assenti/u)
    })

    it('GN-03 rossa: un file del nucleo cambiato in una copia ferma l\'uscita', { skip: senzaPc }, (t) => {
        const copia = copiaDelNucleo(t)
        assert.equal(guardia({ telefono: copia }).codice, 0, 'la copia intatta deve passare, altrimenti la prova non prova niente')
        appendFileSync(join(copia, 'harness-ui/server.mjs'), '\n// un byte in più\n')
        const e = guardia({ telefono: copia })
        assert.equal(e.codice, 1, e.testo)
        assert.match(e.testo, /DIVERSO {2}harness-ui\/server\.mjs/u)
    })

    it('GN-04 rossa: un riferimento finto o rotto ferma l\'uscita', (t) => {
        const cartella = mkdtempSync(join(tmpdir(), 'riferimento-pc-'))
        t.after(() => rmSync(cartella, { recursive: true, force: true }))
        const finto = join(cartella, 'finto.json')
        writeFileSync(finto, JSON.stringify({ schema: 'talos.nucleo-del-pc-uscito.v1', commit: '0'.repeat(40) }))
        assert.equal(guardia({ riferimento: finto }).codice, 2)
        writeFileSync(finto, '{"commit": "4cc08aa10"}')
        assert.match(guardia({ riferimento: finto }).testo, /riferimento non valido/u)
    })
})
