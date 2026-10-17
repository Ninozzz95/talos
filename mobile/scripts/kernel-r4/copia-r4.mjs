#!/usr/bin/env node
/**
 * ⛔ K0 — server e kernel del desktop r4, copiati per la prova sul Pad (piano `PIANO-KERNEL-R4-NEL-MOBILE-2026-10-11.md`).
 *
 * Owner 11/10: «strada (a), STESSO server e kernel del desktop r4 … il desktop resta in sola lettura». Si copia dal COMMIT
 * fissato, mai dall'albero di lavoro: quello del desktop ha modifiche non committate (14/10: 67 file) e la misura deve dire
 * esattamente quale codice ha girato. Il manifesto porta commit, impronta e misura di ogni file.
 *
 * Uso: node scripts/kernel-r4/copia-r4.mjs --r4 <checkout r4> --commit <sha> --uscita <cartella>
 */
import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs'
import { dirname, join, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

export const MANIFESTO_SCHEMA = 'talos.mobile.kernel-r4.v1'
export const NOME_MANIFESTO = 'manifesto-r4.json'

/**
 * Solo il lato server di r4 e le sue prove: il frontend del desktop non entra (K3 è una scelta a parte). `docs/assistenza` sì:
 * il server lo legge per percorso (`harness-ui/src/assistenza.mjs:5`) per rispondere alle domande d'aiuto.
 */
export const PERCORSI_R4 = [
    'harness-ui/server.mjs',
    'harness-ui/package.json',
    'harness-ui/package-lock.json',
    'harness-ui/src',
    'harness-ui/tests',
    'context-engine/package.json',
    'context-engine/src',
    'docs/assistenza',
]

/**
 * Solo per far girare le prove di r4 sul Pad (K0): molte leggono il frontend, gli script o il pubblico del desktop. Il
 * pacchetto dell'app non li prende; misurarle senza questi file direbbe «rosso» per un file mancante, non per Android.
 */
export const PERCORSI_SOLO_PROVE = [
    'harness-ui/frontend',
    'harness-ui/scripts',
    'harness-ui/public',
    'harness-ui/desktop',
    'harness-ui/labs',
]

const A_CAPO = 0x0a

function elenca(cartella) {
    const trovati = []
    for (const nome of readdirSync(cartella)) {
        const pieno = join(cartella, nome)
        if (statSync(pieno).isDirectory()) trovati.push(...elenca(pieno))
        else trovati.push(pieno)
    }
    return trovati
}

/** `git ls-tree -r -z`: «<modo> <tipo> <id>TAB<percorso>», una voce per ogni NUL. */
function vociDelCommit(radiceR4, commit, percorsi) {
    const grezzo = execFileSync('git', ['-C', radiceR4, 'ls-tree', '-r', '-z', commit, '--', ...percorsi], {
        encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'],
    })
    return grezzo.split(String.fromCharCode(0)).filter(Boolean).map((riga) => {
        const tab = riga.indexOf(String.fromCharCode(9))
        const [, tipo, id] = riga.slice(0, tab).split(' ')
        return { tipo, id, percorso: riga.slice(tab + 1) }
    }).filter((voce) => voce.tipo === 'blob')
}

export function copiaR4({ radiceR4, commit, destinazione, percorsi = PERCORSI_R4 }) {
    let completo
    try {
        completo = execFileSync('git', ['-C', radiceR4, 'rev-parse', '--verify', `${commit}^{commit}`], {
            encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'],
        }).trim()
    } catch {
        throw new Error(`copiaR4: il commit ${commit} non esiste in ${radiceR4}`)
    }
    // I byte esatti dei blob del commit, con un solo processo: `ls-tree` dà percorsi e id, `cat-file --batch` il contenuto
    // («<id> blob <misura>», a capo, i byte, a capo). Niente `tar`: su Windows quello di Git Bash legge «C:…» come un host.
    const voci = vociDelCommit(radiceR4, completo, percorsi)
    const uscita = execFileSync('git', ['-C', radiceR4, 'cat-file', '--batch'], {
        input: voci.map((voce) => voce.id).join(String.fromCharCode(A_CAPO)) + String.fromCharCode(A_CAPO),
        maxBuffer: 1024 * 1024 * 1024,
        stdio: ['pipe', 'pipe', 'pipe'],
    })
    mkdirSync(destinazione, { recursive: true })
    let posizione = 0
    for (const voce of voci) {
        const fineTesta = uscita.indexOf(A_CAPO, posizione)
        const [id, , misura] = uscita.subarray(posizione, fineTesta).toString('utf8').split(' ')
        if (id !== voce.id) throw new Error(`copiaR4: lettura fuori sequenza su ${voce.percorso}`)
        const inizio = fineTesta + 1
        const fine = inizio + Number(misura)
        const pieno = join(destinazione, ...voce.percorso.split('/'))
        mkdirSync(dirname(pieno), { recursive: true })
        writeFileSync(pieno, uscita.subarray(inizio, fine))
        posizione = fine + 1
    }

    const file = elenca(destinazione)
        .map((pieno) => relative(destinazione, pieno).split(sep).join('/'))
        .filter((percorso) => percorso !== NOME_MANIFESTO)
        .sort()
        .map((percorso) => {
            const byte = readFileSync(join(destinazione, percorso))
            return { percorso, sha256: createHash('sha256').update(byte).digest('hex'), byte: byte.length }
        })
    const manifesto = { schema: MANIFESTO_SCHEMA, commit: completo, conteggio: file.length, file }
    writeFileSync(join(destinazione, NOME_MANIFESTO), `${JSON.stringify(manifesto, null, 2)}\n`)
    return manifesto
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    const valore = (nome) => {
        const i = process.argv.indexOf(nome)
        return i > 0 ? process.argv[i + 1] : undefined
    }
    const radiceR4 = valore('--r4')
    const commit = valore('--commit')
    const destinazione = valore('--uscita')
    const conProve = process.argv.includes('--con-prove')
    if (!radiceR4 || !commit || !destinazione) {
        console.error('uso: node scripts/kernel-r4/copia-r4.mjs --r4 <checkout r4> --commit <sha> --uscita <cartella>')
        process.exit(2)
    }
    const manifesto = copiaR4({
        radiceR4, commit, destinazione: resolve(destinazione),
        percorsi: conProve ? [...PERCORSI_R4, ...PERCORSI_SOLO_PROVE] : PERCORSI_R4,
    })
    console.log(`✓ copia-r4: ${manifesto.conteggio} file dal commit ${manifesto.commit}`)
}
