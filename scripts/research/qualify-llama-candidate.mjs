/**
 * P2-5 — corsia di candidati llama.cpp controllata. Blocco 1: checkout
 * isolato del candidato + classificazione della patch TALOS.
 *
 * ⛔⛔ Perché un worktree, non un checkout in-place. Il pin di produzione
 * (`third_party/llama.cpp`) porta la patch `0001-opencl-abort-callback.patch`
 * applicata come modifica NON committata (`git status --short` la mostra
 * `M`, non pulita — verificato prima di scrivere: è così da quando la cura
 * dell'abort è arrivata). Un checkout in-place del candidato sovrascriverebbe
 * quella modifica per l'intera sessione di lavoro, per ogni altro script che
 * si aspetta il pin corrente lì. Un `git worktree add --detach` nel
 * repository DEL SUBMODULE (che ha la propria `.git`, indipendente
 * dall'outer TALOS) costruisce un secondo checkout, stessi oggetti condivisi,
 * zero rischio per l'albero principale — confermato via ricerca web che è la
 * via raccomandata per isolare un commit specifico, non un'invenzione.
 *
 * ⛔⛔ Perché QUATTRO stati, non due. `git apply --check` da solo risponde
 * solo "si applica pulita" o "no" — non basta a distinguere "il candidato ha
 * già la stessa cura" (non serve applicarla) da "il candidato è cambiato
 * abbastanza che serve riportarla a mano" (conflitto). La classificazione
 * qui usa gli strumenti che git offre DAVVERO, non ne inventa uno nuovo:
 *
 *   not-needed        `git apply --check --reverse` riesce — la patch è
 *                      GIÀ nel sorgente del candidato (upstream l'ha presa,
 *                      o un fix equivalente esiste già lì).
 *   applied-clean      `git apply --check` (contesto pieno) riesce.
 *   applied-with-fuzz  fallisce a contesto pieno, riesce con `-C1` (contesto
 *                      ridotto a una riga — l'equivalente reale del "fuzz"
 *                      di `patch(1)`, non un'approssimazione).
 *   conflict           fallisce anche a `-C1` — serve un umano.
 *
 * Sui primi due stati (o `applied-with-fuzz`) la patch viene applicata
 * DAVVERO nel worktree, cosicché il blocco 2 (build) trovi un sorgente
 * pronto. Su `conflict` il worktree resta esattamente come il checkout
 * grezzo — nessun blocco successivo deve costruire su un sorgente a metà
 * patchato.
 *
 * ⛔ SOLO RICERCA. Non tocca `third_party/llama.cpp` (il pin di produzione),
 * non aggiorna il submodule da solo (§18.6 del piano sorgente) — costruisce
 * un checkout PARALLELO sotto `.tmp-research/`, deliberatamente fuori
 * dall'indice git (stessa cartella già usata dalle campagne di misura).
 *
 * ## Uso
 *
 *     node scripts/research/qualify-llama-candidate.mjs <ref>
 *     node scripts/research/qualify-llama-candidate.mjs <ref> --dispose
 *
 * `<ref>` è uno SHA o un ref risolvibile nel repository del submodule
 * (branch/tag remoti compresi — se non è già locale, lo script fa un
 * `git fetch origin <ref>` prima di arrendersi). `--dispose` rimuove il
 * worktree a fine corsa (`git worktree remove`) invece di lasciarlo per il
 * blocco successivo (build) — utile per un giro di sola classificazione.
 *
 * Stampa un JSON su stdout, una riga, per essere pipeable/leggibile da uno
 * script chiamante (blocco 2).
 */

import { execFileSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const QUI = dirname(fileURLToPath(import.meta.url))
const SUBMODULE_DIR = resolve(QUI, '../../third_party/llama.cpp')
const PATCH_PATH = resolve(QUI, '../../third_party/patches/0001-opencl-abort-callback.patch')
const WORKTREE_ROOT = resolve(QUI, '../../.tmp-research/llama-candidates')

function git(args, opts = {}) {
    return execFileSync('git', args, {
        cwd: SUBMODULE_DIR,
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
        ...opts,
    })
}

/** Non lancia: un `git apply --check` che fallisce è un ESITO, non un guasto dello script. */
function gitApplyCheckOk(worktreePath, args) {
    try {
        execFileSync('git', ['-C', worktreePath, 'apply', '--check', ...args, PATCH_PATH], {
            encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'],
        })
        return { ok: true, detail: '' }
    } catch (errore) {
        return { ok: false, detail: (errore.stderr ?? String(errore)).toString().trim() }
    }
}

/**
 * ⛔⛔ MISURATO scrivendo questo blocco, non presunto: `git fetch origin
 * <ref>` accetta un nome di ref remoto o uno SHA COMPLETO (40 caratteri) —
 * GitHub fetcha per davvero un oggetto raggiungibile per SHA pieno (provato:
 * `7584430716ee229751771ed0d6bbcb780d105eeb` ha funzionato). Uno SHA
 * ABBREVIATO (`a14dba6`, la forma che questo stesso piano usa ovunque) NON
 * è un input valido per `fetch` — non è un ref, e non può essere espanso
 * localmente perché l'oggetto non c'è ancora: `fatal: couldn't find remote
 * ref a14dba6`, un messaggio che non dice perché. Questa funzione lo
 * intercetta e lo spiega, invece di lasciarlo passare grezzo.
 */
function resolveCandidateSha(ref) {
    try {
        return git(['rev-parse', '--verify', `${ref}^{commit}`]).trim()
    } catch {
        // Non ancora locale — un ref remoto non ancora tirato non è un errore
        // dell'utente, è la norma quando si insegue un HEAD upstream fresco.
        try {
            git(['fetch', '--quiet', 'origin', ref])
        } catch (fetchFallito) {
            if (/^[0-9a-f]{4,39}$/i.test(ref)) {
                throw new Error(`"${ref}" sembra uno SHA abbreviato ma non è ancora locale — `
                    + `un fetch per SHA richiede quello COMPLETO (40 caratteri). Prendilo con `
                    + `\`git ls-remote origin <branch>\` o dalla pagina del commit su GitHub.`)
            }
            throw fetchFallito
        }
        return git(['rev-parse', '--verify', 'FETCH_HEAD^{commit}']).trim()
    }
}

function worktreeGiaRegistrato(worktreePath) {
    const elenco = git(['worktree', 'list', '--porcelain'])
    return elenco.split('\n\n').some((blocco) => blocco.startsWith(`worktree ${worktreePath.replace(/\\/g, '/')}`)
        || blocco.startsWith(`worktree ${worktreePath}`))
}

function assicuraWorktree(sha) {
    const worktreePath = resolve(WORKTREE_ROOT, sha.slice(0, 12))
    if (existsSync(worktreePath) && worktreeGiaRegistrato(worktreePath)) {
        return { worktreePath, creato: false }
    }
    if (existsSync(worktreePath)) {
        throw new Error(`${worktreePath} esiste ma non è un worktree registrato — `
            + `probabilmente un residuo di un giro interrotto. Rimuovilo a mano prima di riprovare.`)
    }
    git(['worktree', 'add', '--detach', worktreePath, sha])
    return { worktreePath, creato: true }
}

function classificaEApplica(worktreePath) {
    const reverse = gitApplyCheckOk(worktreePath, ['--reverse'])
    if (reverse.ok) {
        return { patchOutcome: 'not-needed', appliedNow: false, detail: '' }
    }

    const pieno = gitApplyCheckOk(worktreePath, [])
    if (pieno.ok) {
        execFileSync('git', ['-C', worktreePath, 'apply', PATCH_PATH], { encoding: 'utf8' })
        return { patchOutcome: 'applied-clean', appliedNow: true, detail: '' }
    }

    const fuzz = gitApplyCheckOk(worktreePath, ['-C1'])
    if (fuzz.ok) {
        execFileSync('git', ['-C', worktreePath, 'apply', '-C1', PATCH_PATH], { encoding: 'utf8' })
        return { patchOutcome: 'applied-with-fuzz', appliedNow: true, detail: '' }
    }

    return { patchOutcome: 'conflict', appliedNow: false, detail: pieno.detail }
}

function main() {
    const argv = process.argv.slice(2)
    const dispose = argv.includes('--dispose')
    const ref = argv.find((a) => !a.startsWith('--'))
    if (!ref) {
        console.error('uso: node qualify-llama-candidate.mjs <ref> [--dispose]')
        process.exit(2)
    }

    const resolvedSha = resolveCandidateSha(ref)
    const { worktreePath, creato } = assicuraWorktree(resolvedSha)
    const classificazione = classificaEApplica(worktreePath)

    const risultato = {
        candidateRef: ref,
        resolvedSha,
        worktreePath,
        worktreeCreatoOra: creato,
        ...classificazione,
    }

    if (dispose) {
        git(['worktree', 'remove', '--force', worktreePath])
        risultato.worktreeRimosso = true
    }

    console.log(JSON.stringify(risultato))
    if (risultato.patchOutcome === 'conflict') process.exitCode = 1
}

/*
 * ⛔ `resolveCandidateSha`/`assicuraWorktree` lanciano attraverso
 * `execFileSync`, che su un fallimento produce lo stack trace grezzo di
 * Node — utile a chi legge questo file, inutile a chi lo chiama in coda
 * (blocco 2) o da terminale: `fatal: couldn't find remote ref X` sepolto
 * sotto dieci righe di frame. Un solo messaggio pulito su stderr, exit 1.
 */
try {
    main()
} catch (errore) {
    const dettaglio = errore?.stderr ? errore.stderr.toString().trim() : (errore?.message ?? String(errore))
    console.error(`qualify-llama-candidate: ${dettaglio}`)
    process.exit(1)
}
