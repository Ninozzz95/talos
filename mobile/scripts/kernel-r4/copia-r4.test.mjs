import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { MANIFESTO_SCHEMA, PERCORSI_R4, PERCORSI_SOLO_PROVE, copiaR4 } from './copia-r4.mjs'

/**
 * ⛔ K0 (piano `PIANO-KERNEL-R4-NEL-MOBILE-2026-10-11.md`, ripresa del 14/10): server e kernel di r4 si prendono dal COMMIT
 * fissato, mai dall'albero di lavoro del desktop (che ha modifiche non committate e resta in sola lettura). Il manifesto
 * dice commit, impronta e misura di ogni file: è ciò che rende la misura di K0 ripetibile sul pin nuovo.
 */

function git(radice, ...argomenti) {
    return execFileSync('git', ['-C', radice, ...argomenti], { encoding: 'utf8' }).trim()
}

function scrivi(radice, percorso, testo) {
    const pieno = join(radice, percorso)
    mkdirSync(join(pieno, '..'), { recursive: true })
    writeFileSync(pieno, testo)
}

function repoDiProva() {
    const radice = mkdtempSync(join(tmpdir(), 'r4-prova-'))
    git(radice, 'init', '-q')
    git(radice, 'config', 'user.email', 'prova@example.invalid')
    git(radice, 'config', 'user.name', 'prova')
    git(radice, 'config', 'core.autocrlf', 'false')
    scrivi(radice, 'harness-ui/server.mjs', 'export const server = 1\n')
    scrivi(radice, 'harness-ui/package.json', '{"name":"talos-harness-ui-backend"}\n')
    scrivi(radice, 'harness-ui/package-lock.json', '{"lockfileVersion":3}\n')
    scrivi(radice, 'harness-ui/src/kernel/talosHarness.mjs', 'export const kernel = 1\n')
    scrivi(radice, 'harness-ui/tests/kernel.test.mjs', 'export {}\n')
    scrivi(radice, 'context-engine/package.json', '{"name":"context-engine"}\n')
    scrivi(radice, 'context-engine/src/index.mjs', 'export const ce = 1\n')
    scrivi(radice, 'docs/assistenza/README.md', '# Assistenza\n')
    scrivi(radice, 'docs/interno.md', 'non va copiato\n')
    scrivi(radice, 'harness-ui/frontend/app.js', 'non va copiato\n')
    git(radice, 'add', '-A')
    git(radice, 'commit', '-q', '-m', 'base')
    const commit = git(radice, 'rev-parse', 'HEAD')
    // L'albero di lavoro sporco, come quello del desktop: non deve entrare nella copia.
    scrivi(radice, 'harness-ui/server.mjs', 'export const server = 2 // non committato\n')
    scrivi(radice, 'harness-ui/src/nuovo-non-committato.mjs', 'x\n')
    return { radice, commit }
}

const impronta = (b) => createHash('sha256').update(b).digest('hex')

describe('copiaR4 (K0)', () => {
    it('K0-COPIA-01 copia dal commit i percorsi del server, del kernel e delle prove; il manifesto corrisponde ai byte', () => {
        const { radice, commit } = repoDiProva()
        const uscita = mkdtempSync(join(tmpdir(), 'r4-vendor-'))
        try {
            const manifesto = copiaR4({ radiceR4: radice, commit, destinazione: uscita })
            assert.equal(manifesto.schema, MANIFESTO_SCHEMA)
            assert.equal(manifesto.commit, commit)
            const percorsi = manifesto.file.map((f) => f.percorso).sort()
            assert.deepEqual(percorsi, [
                'context-engine/package.json', 'context-engine/src/index.mjs', 'docs/assistenza/README.md',
                'harness-ui/package-lock.json', 'harness-ui/package.json', 'harness-ui/server.mjs',
                'harness-ui/src/kernel/talosHarness.mjs', 'harness-ui/tests/kernel.test.mjs',
            ])
            assert.equal(manifesto.conteggio, 8)
            for (const f of manifesto.file) {
                const byte = readFileSync(join(uscita, f.percorso))
                assert.equal(f.sha256, impronta(byte), f.percorso)
                assert.equal(f.byte, byte.length, f.percorso)
            }
            assert.equal(readFileSync(join(uscita, 'harness-ui/server.mjs'), 'utf8'), 'export const server = 1\n')
            assert.deepEqual(JSON.parse(readFileSync(join(uscita, 'manifesto-r4.json'), 'utf8')), manifesto)
        } finally {
            rmSync(radice, { recursive: true, force: true })
            rmSync(uscita, { recursive: true, force: true })
        }
    })

    it('K0-COPIA-02 i percorsi copiati sono solo quelli del piano (niente frontend)', () => {
        assert.deepEqual(PERCORSI_R4, [
            'harness-ui/server.mjs', 'harness-ui/package.json', 'harness-ui/package-lock.json', 'harness-ui/src',
            'harness-ui/tests', 'context-engine/package.json', 'context-engine/src', 'docs/assistenza',
        ])
    })

    // K0 sul Pad, 14/10: senza il corpus le tre prove FASE3-HELP di `http-routes-assistenza` rispondevano 500. Il server lo
    // legge per percorso (`harness-ui/src/assistenza.mjs:5`, `new URL('../../docs/assistenza/', …)`): fa parte del prodotto.
    it('K0-COPIA-05 il corpus dell’assistenza viaggia col server, alla stessa distanza da harness-ui/src', () => {
        const { radice, commit } = repoDiProva()
        const uscita = mkdtempSync(join(tmpdir(), 'r4-vendor-'))
        try {
            copiaR4({ radiceR4: radice, commit, destinazione: uscita })
            assert.equal(readFileSync(join(uscita, 'harness-ui', 'src', '..', '..', 'docs', 'assistenza', 'README.md'), 'utf8'), '# Assistenza\n')
            assert.throws(() => readFileSync(join(uscita, 'docs', 'interno.md')), /ENOENT/)
        } finally {
            rmSync(radice, { recursive: true, force: true })
            rmSync(uscita, { recursive: true, force: true })
        }
    })

    it('K0-COPIA-04 per le prove si possono aggiungere percorsi (frontend, script…), che il pacchetto dell’app non prende', () => {
        const { radice, commit } = repoDiProva()
        const uscita = mkdtempSync(join(tmpdir(), 'r4-vendor-'))
        try {
            const manifesto = copiaR4({ radiceR4: radice, commit, destinazione: uscita, percorsi: [...PERCORSI_R4, 'harness-ui/frontend'] })
            assert.ok(manifesto.file.some((f) => f.percorso === 'harness-ui/frontend/app.js'))
            assert.ok(PERCORSI_SOLO_PROVE.includes('harness-ui/frontend'))
            assert.ok(PERCORSI_SOLO_PROVE.every((p) => !PERCORSI_R4.includes(p)))
        } finally {
            rmSync(radice, { recursive: true, force: true })
            rmSync(uscita, { recursive: true, force: true })
        }
    })

    it('K0-COPIA-03 un commit che non esiste è un errore che lo dice, e la destinazione resta vuota', () => {
        const { radice } = repoDiProva()
        const uscita = mkdtempSync(join(tmpdir(), 'r4-vendor-'))
        try {
            assert.throws(() => copiaR4({ radiceR4: radice, commit: 'deadbeef', destinazione: uscita }), /deadbeef/)
            assert.deepEqual(execFileSync('node', ['-e', `console.log(require('fs').readdirSync(${JSON.stringify(uscita)}).length)`], { encoding: 'utf8' }).trim(), '0')
        } finally {
            rmSync(radice, { recursive: true, force: true })
            rmSync(uscita, { recursive: true, force: true })
        }
    })
})
