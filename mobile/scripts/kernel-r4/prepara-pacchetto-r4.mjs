#!/usr/bin/env node
/**
 * ⛔ K1 — il pacchetto del server r4 per l'APK (ledger `LEDGER-K1-PACCHETTO-R4-2026-10-14.md`).
 *
 * Owner 14/10: «Sorgente com'è». Le cartelle restano quelle del desktop (r4 avvia per percorso worker, adattatori e kernel di
 * serie: un bundle li sposterebbe), con le sole dipendenze di produzione per linux-arm64. Fuori:
 *   - le prove di r4 (servono solo a K0/K4, dalla copia `--con-prove`);
 *   - di node-pty tutto tranne la parte JS (`NODE_PTY_TIENI`): al suo posto il `pty.node` per Android, compilato qui dal suo
 *     `src/unix/pty.cc` (K3-TERM T1, owner 16/10 «node-pty ufficiale», `scripts/r4-mobile/compila-pty-android.mjs`); e node-addon-api, che serve
 *     solo per compilarlo;
 *   - sqlite-vec: sul Pad rifiuta la piattaforma `android`, e il context-engine si degrada pulito (ricerca lessicale sì,
 *     vettoriale `CTX_VECTOR_UNAVAILABLE`, `context-engine/src/node/sqlite-worker.mjs:18-26` e `:592`);
 *   - le `node_modules/.bin` (lanciatori dell'host, inutili sul telefono).
 * Dentro, di TypeScript (una devDependency di r4), i soli `lib.*.d.ts`: il cancello semantico del kernel li legge per percorso
 * (`talosHarness.mjs:8788`) e senza di loro gira senza i tipi base, in silenzio. Si prendono da un `npm ci` completo, così
 * l'integrità resta quella del lockfile.
 *
 * Uso: node scripts/kernel-r4/prepara-pacchetto-r4.mjs --vendor <copia di copia-r4.mjs> --uscita <cartella nuova>
 */
import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { MANIFESTO_SCHEMA, NOME_MANIFESTO } from './copia-r4.mjs'
import { compilaPtyAndroidVero } from '../r4-mobile/compila-pty-android.mjs'

export const PACCHETTO_SCHEMA = 'talos.mobile.kernel-r4-pacchetto.v1'
export const NOME_MANIFESTO_PACCHETTO = 'manifesto-pacchetto-r4.json'
export const NOME_LICENZE = 'THIRD_PARTY_LICENSES.txt'

/** Percorsi tolti dal pacchetto; quelli che finiscono con `-*` valgono per ogni nome con quel prefisso. */
export const FUORI_DAL_PACCHETTO = [
    'harness-ui/tests',
    'harness-ui/node_modules/node-addon-api',
    'context-engine/node_modules/sqlite-vec',
    'context-engine/node_modules/sqlite-vec-*',
]

/** Di node-pty restano la parte JS e la licenza; `prebuilds/android-arm64/pty.node` lo aggiunge la compilazione. */
export const NODE_PTY_TIENI = Object.freeze(['lib', 'package.json', 'LICENSE'])
const PTY_ANDROID = ['prebuilds', 'android-arm64', 'pty.node']

const COMUNI_NPM = ['--os=linux', '--cpu=arm64', '--ignore-scripts', '--no-audit', '--no-fund']
const FILE_DI_LICENZA = /^(?:licen[sc]e|copying)(?:[.-].*)?$/iu

function npmVero(argomenti, cartella) {
    // npm su Windows è un `.cmd`: senza shell `execFileSync` non lo trova. Gli argomenti sono fissi, senza spazi.
    execFileSync('npm', argomenti, { cwd: cartella, stdio: 'inherit', shell: process.platform === 'win32' })
}

function leggiManifestoCopia(vendor) {
    const percorso = join(vendor, NOME_MANIFESTO)
    let manifesto
    try {
        manifesto = JSON.parse(readFileSync(percorso, 'utf8'))
    } catch {
        throw new Error(`preparaPacchettoR4: ${NOME_MANIFESTO} mancante o illeggibile in ${vendor} (va fatta prima con copia-r4.mjs)`)
    }
    if (manifesto?.schema !== MANIFESTO_SCHEMA || typeof manifesto.commit !== 'string') {
        throw new Error(`preparaPacchettoR4: ${NOME_MANIFESTO} in ${vendor} non è un manifesto ${MANIFESTO_SCHEMA}`)
    }
    return manifesto
}

/** I file sotto `cartella`, in percorsi con la barra; i collegamenti simbolici non si seguono. */
function elenca(cartella, base = cartella) {
    const trovati = []
    for (const voce of readdirSync(cartella, { withFileTypes: true })) {
        const pieno = join(cartella, voce.name)
        if (voce.isDirectory()) trovati.push(...elenca(pieno, base))
        else if (voce.isFile()) trovati.push(relative(base, pieno).split(sep).join('/'))
    }
    return trovati
}

function togli(uscita, percorso) {
    const pezzi = percorso.split('/')
    const ultimo = pezzi.pop()
    const genitore = join(uscita, ...pezzi)
    if (!existsSync(genitore)) return
    const nomi = ultimo.endsWith('-*')
        ? readdirSync(genitore).filter((nome) => nome.startsWith(ultimo.slice(0, -1)))
        : [ultimo]
    for (const nome of nomi) rmSync(join(genitore, nome), { recursive: true, force: true })
}

function togliCartelleBin(cartella) {
    for (const voce of readdirSync(cartella, { withFileTypes: true })) {
        if (!voce.isDirectory()) continue
        const pieno = join(cartella, voce.name)
        if (voce.name === '.bin' && cartella.endsWith('node_modules')) rmSync(pieno, { recursive: true, force: true })
        else togliCartelleBin(pieno)
    }
}

/** I pacchetti installati sotto un `node_modules` (anche con scope e annidati), come cartelle che hanno un package.json. */
function pacchettiIn(nodeModules) {
    if (!existsSync(nodeModules)) return []
    const trovati = []
    for (const nome of readdirSync(nodeModules)) {
        if (nome.startsWith('.')) continue
        const cartelle = nome.startsWith('@')
            ? readdirSync(join(nodeModules, nome)).map((sotto) => join(nodeModules, nome, sotto))
            : [join(nodeModules, nome)]
        for (const cartella of cartelle) {
            if (existsSync(join(cartella, 'package.json'))) trovati.push(cartella)
            trovati.push(...pacchettiIn(join(cartella, 'node_modules')))
        }
    }
    return trovati
}

function licenzaDichiarata(pkg) {
    if (typeof pkg.license === 'string' && pkg.license.trim()) return pkg.license.trim()
    if (typeof pkg.license?.type === 'string') return pkg.license.type
    if (Array.isArray(pkg.licenses) && pkg.licenses.length) return pkg.licenses.map((l) => l?.type ?? l).join(' OR ')
    return null
}

function scriviLicenze(uscita) {
    const blocchi = []
    const visti = new Set()
    for (const radice of ['harness-ui', 'context-engine']) {
        for (const cartella of pacchettiIn(join(uscita, radice, 'node_modules'))) {
            const pkg = JSON.parse(readFileSync(join(cartella, 'package.json'), 'utf8'))
            const chi = `${pkg.name}@${pkg.version}`
            if (visti.has(chi)) continue
            visti.add(chi)
            const file = readdirSync(cartella).find((nome) => FILE_DI_LICENZA.test(nome))
            const testo = file ? readFileSync(join(cartella, file), 'utf8').trim() : null
            // Senza campo `license` (es. png-js@1.1.0, dipendenza di pdfkit) vale la prima riga del file di licenza; senza
            // nessuno dei due il pacchetto non entra: una licenza non nota non si spedisce.
            const dichiarata = licenzaDichiarata(pkg)
            const dalFile = testo?.split('\n')[0].trim()
            if (!dichiarata && !dalFile) throw new Error(`preparaPacchettoR4: ${chi} non dichiara una licenza (${relative(uscita, cartella)})`)
            const licenza = dichiarata ?? `${dalFile} (from the ${file} file; package.json declares none)`
            blocchi.push(`${chi} — ${licenza}\n\n${testo ?? '(no licence file in the package)'}\n`)
        }
    }
    blocchi.sort()
    const separatore = `\n${'='.repeat(78)}\n\n`
    writeFileSync(join(uscita, NOME_LICENZE), `Third-party packages in the TALOS mobile r4 server package\n\n${blocchi.join(separatore)}`)
}

/** node-pty ridotto: via tutto ciò che non è in `NODE_PTY_TIENI`, tranne il `pty.node` per Android appena compilato. */
function riduciNodePty(nodePty) {
    for (const nome of readdirSync(nodePty)) {
        if (NODE_PTY_TIENI.includes(nome) || nome === PTY_ANDROID[0]) continue
        rmSync(join(nodePty, nome), { recursive: true, force: true })
    }
    const prebuilds = join(nodePty, PTY_ANDROID[0])
    for (const nome of readdirSync(prebuilds)) if (nome !== PTY_ANDROID[1]) rmSync(join(prebuilds, nome), { recursive: true, force: true })
}

export async function preparaPacchettoR4({ vendor, uscita, npmFn = npmVero, compilaPtyFn = compilaPtyAndroidVero }) {
    const copia = leggiManifestoCopia(vendor)
    if (existsSync(uscita)) throw new Error(`preparaPacchettoR4: ${uscita} esiste già: il pacchetto si fa in una cartella nuova`)

    mkdirSync(uscita, { recursive: true })
    cpSync(vendor, uscita, {
        recursive: true,
        filter: (sorgente) => {
            const percorso = relative(vendor, sorgente).split(sep).join('/')
            return percorso !== NOME_MANIFESTO && !percorso.split('/').includes('node_modules') && percorso !== 'harness-ui/tests'
                && !percorso.startsWith('harness-ui/tests/')
        },
    })

    npmFn(['ci', '--omit=dev', ...COMUNI_NPM], join(uscita, 'harness-ui'))
    npmFn(['install', '--omit=dev', '--no-package-lock', ...COMUNI_NPM], join(uscita, 'context-engine'))

    // I `lib.*.d.ts` dal `npm ci` COMPLETO dello stesso lockfile, fuori dal pacchetto.
    const completo = mkdtempSync(join(tmpdir(), 'r4-typescript-'))
    try {
        for (const nome of ['package.json', 'package-lock.json']) cpSync(join(uscita, 'harness-ui', nome), join(completo, nome))
        npmFn(['ci', ...COMUNI_NPM], completo)
        const libDa = join(completo, 'node_modules', 'typescript', 'lib')
        const libA = join(uscita, 'harness-ui', 'node_modules', 'typescript', 'lib')
        mkdirSync(libA, { recursive: true })
        for (const nome of readdirSync(libDa).filter((n) => /^lib\..+\.d\.ts$/u.test(n))) cpSync(join(libDa, nome), join(libA, nome))
        for (const nome of ['package.json', ...readdirSync(join(libDa, '..')).filter((n) => FILE_DI_LICENZA.test(n))]) {
            cpSync(join(libDa, '..', nome), join(libA, '..', nome))
        }
    } finally {
        rmSync(completo, { recursive: true, force: true })
    }

    // Il pty.node si compila prima di togliere qualcosa: servono il sorgente di node-pty e gli header di node-addon-api.
    const nodeModules = join(uscita, 'harness-ui', 'node_modules')
    const nodePty = join(nodeModules, 'node-pty')
    const ptyAndroid = await compilaPtyFn({ nodePty, nodeAddonApi: join(nodeModules, 'node-addon-api'), uscita: join(nodePty, ...PTY_ANDROID) })
    riduciNodePty(nodePty)

    for (const percorso of FUORI_DAL_PACCHETTO) togli(uscita, percorso)
    togliCartelleBin(uscita)
    scriviLicenze(uscita)

    const file = elenca(uscita)
        .filter((percorso) => percorso !== NOME_MANIFESTO_PACCHETTO)
        .sort()
        .map((percorso) => {
            const byte = readFileSync(join(uscita, ...percorso.split('/')))
            return { percorso, sha256: createHash('sha256').update(byte).digest('hex'), byte: byte.length }
        })
    const manifesto = { schema: PACCHETTO_SCHEMA, commit: copia.commit, conteggio: file.length, ptyAndroid, file }
    writeFileSync(join(uscita, NOME_MANIFESTO_PACCHETTO), `${JSON.stringify(manifesto, null, 2)}\n`)
    return manifesto
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    const valore = (nome) => {
        const i = process.argv.indexOf(nome)
        return i > 0 ? process.argv[i + 1] : undefined
    }
    const vendor = valore('--vendor')
    const uscita = valore('--uscita')
    if (!vendor || !uscita) {
        console.error('uso: node scripts/kernel-r4/prepara-pacchetto-r4.mjs --vendor <copia> --uscita <cartella nuova>')
        process.exit(2)
    }
    const manifesto = await preparaPacchettoR4({ vendor: resolve(vendor), uscita: resolve(uscita) })
    const byte = manifesto.file.reduce((somma, f) => somma + f.byte, 0)
    console.log(`✓ prepara-pacchetto-r4: ${manifesto.conteggio} file, ${(byte / 1024 / 1024).toFixed(1)} MB, dal commit ${manifesto.commit}`)
}
