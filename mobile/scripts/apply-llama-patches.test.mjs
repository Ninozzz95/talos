import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, writeFileSync, readFileSync, mkdirSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { statoPatch, applicaPatch } from './apply-llama-patches.mjs'

/*
 * ⛔⛔ La patch 0001 (Stop su GPU 1,4 s → 32 ms) si applicava A MANO: dopo un aggiornamento del pin non si
 * applicava più, nessuno se n'è accorto, e il motore spedito l'aveva persa (scoperto il 01/10/2026). Da qui in
 * poi la build le applica da sola e si ferma se una non entra: una patch non può più sparire in silenzio.
 */

function git(cwd, ...args) {
    return execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })
}

function repoConPatch() {
    const radice = mkdtempSync(path.join(tmpdir(), 'talos-patch-'))
    const repo = path.join(radice, 'motore')
    const patches = path.join(radice, 'patches')
    mkdirSync(repo); mkdirSync(patches)
    git(repo, 'init', '-q')
    git(repo, 'config', 'user.email', 'prova@talos.invalid')
    git(repo, 'config', 'user.name', 'prova')
    writeFileSync(path.join(repo, 'motore.c'), 'int a = 1;\nint b = 2;\n')
    git(repo, 'add', '.')
    git(repo, 'commit', '-q', '-m', 'pin')
    writeFileSync(path.join(repo, 'motore.c'), 'int a = 1;\nint b = 3;\n')
    writeFileSync(path.join(patches, '0001-prova.patch'), git(repo, 'diff'))
    git(repo, 'checkout', '-q', '.')
    return { repo, patches }
}

describe('patch di llama.cpp — applicate dalla build, mai a mano', () => {
    it('PATCH-01 una patch nuova risulta «da applicare», poi «applicata»', () => {
        const { repo, patches } = repoConPatch()
        const patch = path.join(patches, '0001-prova.patch')
        assert.equal(statoPatch(repo, patch), 'da-applicare')
        const esito = applicaPatch(repo, patches)
        assert.deepEqual(esito, { applicate: ['0001-prova.patch'], giaPresenti: [] })
        assert.equal(statoPatch(repo, patch), 'applicata')
        assert.match(readFileSync(path.join(repo, 'motore.c'), 'utf8'), /int b = 3;/)
    })

    it('PATCH-02 rilanciata non fa niente (idempotente)', () => {
        const { repo, patches } = repoConPatch()
        applicaPatch(repo, patches)
        assert.deepEqual(applicaPatch(repo, patches), { applicate: [], giaPresenti: ['0001-prova.patch'] })
    })

    it('PATCH-03 una patch che non entra FERMA la build, col suo nome', () => {
        const { repo, patches } = repoConPatch()
        writeFileSync(path.join(repo, 'motore.c'), 'int a = 9;\nint b = 9;\n')
        git(repo, 'commit', '-q', '-am', 'pin nuovo')
        assert.equal(statoPatch(repo, path.join(patches, '0001-prova.patch')), 'non-si-applica')
        assert.throws(() => applicaPatch(repo, patches), /TALOS_LLAMA_PATCH_NON_SI_APPLICA: 0001-prova\.patch/)
    })

    it('PATCH-04 le patch vere entrano nel pin vero, in ordine (o ci sono già tutte)', () => {
        const qui = path.dirname(fileURLToPath(import.meta.url))
        const repo = path.join(qui, '..', 'third_party', 'llama.cpp')
        const patches = path.join(qui, '..', 'third_party', 'patches')
        if (!existsSync(path.join(repo, 'ggml'))) return // submodule non inizializzato: lo dice la build
        for (const nome of ['0001-opencl-abort-callback.patch', '0002-opencl-lazy-moe-gdn-ssm.patch',
            '0003-opencl-lazy-weight-formats.patch', '0004-opencl-cache-lazy-fa-programs.patch']) {
            assert.ok(existsSync(path.join(patches, nome)), `manca ${nome}`)
        }
        // la catena intera, su un clone usa-e-getta: il checkout vero non si tocca
        assert.doesNotThrow(() => applicaPatch(repo, patches, { soloControllo: true }))
    })

    it('PATCH-06 la build Android le applica PRIMA di configurare CMake, e si ferma se non entrano', () => {
        const qui = path.dirname(fileURLToPath(import.meta.url))
        const gradle = readFileSync(path.join(qui, '..', 'android', 'app', 'build.gradle'), 'utf8')
        assert.match(gradle, /tasks\.register\('applicaPatchLlama'\)/)
        assert.match(gradle, /apply-llama-patches\.mjs/)
        const aggancio = gradle.slice(gradle.indexOf("it.name.startsWith('configureCMakeRelease')"))
        assert.match(aggancio.slice(0, 300), /dependsOn[^\n]*'applicaPatchLlama'/)
    })

    it('PATCH-05 una patch che dipende dalla precedente si applica dopo di lei, e poi risultano applicate', () => {
        const { repo, patches } = repoConPatch()
        git(repo, 'apply', path.join(patches, '0001-prova.patch'))
        git(repo, 'commit', '-q', '-am', 'dopo la 0001')
        writeFileSync(path.join(repo, 'motore.c'), 'int a = 1;\nint b = 4;\n')
        writeFileSync(path.join(patches, '0002-prova.patch'), git(repo, 'diff'))
        git(repo, 'checkout', '-q', '.')
        git(repo, 'reset', '-q', '--hard', 'HEAD~1')
        // la 0002 da sola non entra nel pin: solo dopo la 0001
        assert.equal(statoPatch(repo, path.join(patches, '0002-prova.patch')), 'non-si-applica')
        assert.deepEqual(applicaPatch(repo, patches), { applicate: ['0001-prova.patch', '0002-prova.patch'], giaPresenti: [] })
        assert.match(readFileSync(path.join(repo, 'motore.c'), 'utf8'), /int b = 4;/)
        assert.deepEqual(applicaPatch(repo, patches), { applicate: [], giaPresenti: ['0001-prova.patch', '0002-prova.patch'] })
    })
})
