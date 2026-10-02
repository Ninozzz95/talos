#!/usr/bin/env node
/**
 * Applica le patch locali di `third_party/patches` sopra il pin di llama.cpp, e si ferma se una non entra.
 *
 * ⛔⛔ Perché esiste (01/10/2026): la patch 0001 (Stop su GPU 1,4 s → 32 ms) si applicava A MANO. Dopo un
 * aggiornamento del pin non si applicava più e il motore spedito l'aveva persa senza che nessuno se ne accorgesse.
 * Ora la chiama la build Android prima di configurare CMake (`build.gradle`, task `applicaPatchLlama`): una patch
 * già presente si salta, una nuova si applica, una che non entra ferma la build col suo nome.
 *
 * Il submodule ha come `origin` llama.cpp vero: non c'è un fork TALOS su cui fare commit, quindi le patch restano
 * diff sopra il pin (`third_party/patches/README.md`), come fa llama.rn (`scripts/sync-vendor.sh`, `patch -p1`).
 *
 * Uso: node scripts/apply-llama-patches.mjs [--check]
 */
import { execFileSync } from 'node:child_process'
import { mkdtempSync, readdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

function gitApply(repo, patch, ...opzioni) {
    try {
        execFileSync('git', ['apply', ...opzioni, ...patch], { cwd: repo, stdio: ['ignore', 'pipe', 'pipe'] })
        return true
    } catch {
        return false
    }
}

/**
 * Lo stato di UNA patch o di una CATENA (in ordine): `applicata`, `da-applicare`, `non-si-applica`.
 *
 * ⛔ Misurato il 01/10/2026: `git apply p1 p2` NON concatena due patch sullo stesso file — confronta entrambe con
 * l'originale. La 0002 tocca righe che la 0001 ha già cambiato: si verifica solo dopo averla applicata. Quindi:
 * la catena è applicata se l'ULTIMA si toglie al contrario (in una catena lineare succede solo se ci sono tutte);
 * è da applicare se la PRIMA entra nel pin.
 */
export function statoPatch(repo, patch) {
    const catena = Array.isArray(patch) ? patch : [patch]
    if (gitApply(repo, [catena[catena.length - 1]], '--reverse', '--check')) return 'applicata'
    if (gitApply(repo, [catena[0]], '--check')) return 'da-applicare'
    return 'non-si-applica'
}

/** Applica una alla volta, in ordine di nome, le patch della cartella; lancia alla prima che non entra, col suo nome. */
export function applicaPatch(repo, cartellaPatch, { soloControllo = false } = {}) {
    const nomi = readdirSync(cartellaPatch).filter((nome) => nome.endsWith('.patch')).sort()
    if (nomi.length === 0) return { applicate: [], giaPresenti: [] }
    const percorsi = nomi.map((nome) => path.join(cartellaPatch, nome))
    if (statoPatch(repo, percorsi) === 'applicata') return { applicate: [], giaPresenti: nomi }
    // Solo controllo: la catena si prova su un clone usa-e-getta, il checkout vero non si tocca.
    const dove = soloControllo ? cloneUsaEGetta(repo) : repo
    for (let i = 0; i < nomi.length; i += 1) {
        if (!gitApply(dove, [percorsi[i]], '--check') || !gitApply(dove, [percorsi[i]])) {
            throw new Error(`TALOS_LLAMA_PATCH_NON_SI_APPLICA: ${nomi[i]} — va rifatta sul pin attuale ` +
                '(third_party/patches/README.md, «Rifare una patch»). Se il submodule è a metà: ' +
                'git -C mobile/third_party/llama.cpp checkout -- .')
        }
    }
    if (soloControllo) rmSync(path.dirname(dove), { recursive: true, force: true })
    return { applicate: nomi, giaPresenti: [] }
}

function cloneUsaEGetta(repo) {
    const radice = mkdtempSync(path.join(tmpdir(), 'talos-llama-patch-'))
    const clone = path.join(radice, 'llama.cpp')
    execFileSync('git', ['clone', '-q', '--shared', '--no-checkout', repo, clone], { stdio: ['ignore', 'pipe', 'pipe'] })
    const head = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: repo, encoding: 'utf8' }).trim()
    execFileSync('git', ['checkout', '-q', head], { cwd: clone, stdio: ['ignore', 'pipe', 'pipe'] })
    return clone
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    const qui = path.dirname(fileURLToPath(import.meta.url))
    const repo = path.join(qui, '..', 'third_party', 'llama.cpp')
    const cartella = path.join(qui, '..', 'third_party', 'patches')
    try {
        const esito = applicaPatch(repo, cartella, { soloControllo: process.argv.includes('--check') })
        for (const nome of esito.giaPresenti) console.log(`✓ già applicata: ${nome}`)
        const verbo = process.argv.includes('--check') ? 'entra (provata su un clone)' : 'applicata'
        for (const nome of esito.applicate) console.log(`✓ ${verbo}: ${nome}`)
    } catch (errore) {
        console.error(errore instanceof Error ? errore.message : String(errore))
        process.exit(1)
    }
}
