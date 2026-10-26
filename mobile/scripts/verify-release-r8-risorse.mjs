#!/usr/bin/env node

/**
 * ⛔⛔ D-0146-1 (Pad, 26/10/2026): un campo che TIENE VIVA una risorsa nativa non può sparire in R8.
 *
 * `TalosMotoreOspite` legava un `LocalSocket` (`legato`) e ne passava il descrittore a un `LocalServerSocket`; il campo veniva
 * scritto e mai letto, e R8 l'ha tolto (`mapping.txt` della 0.1.46 candidata e bytecode della 0.1.45 pubblicata: nessun `iput`).
 * Senza riferimenti il `LocalSocket` è spazzatura: il suo finalizzatore chiude il descrittore che possiede, cioè il socket in
 * ascolto, e il motore ospite muore al primo GC (`accept` → EBADF). Nella build debug il campo resta e il difetto non si vede:
 * la stessa classe di errore della 0.1.44 (JNA rinominata da R8, `prove-di-release-su-build-minificata`).
 *
 * Il cancello è GENERICO (revisione del Desktop): non un campo solo, ma ogni campo di classe del sorgente Android il cui tipo è
 * una risorsa nativa (socket, descrittori, memoria JNA) deve ESISTERE nel dex dell'APK di release, sotto la sua classe (il nome
 * offuscato, se c'è, lo dà il `mapping.txt`). ⛔ Il mapping da solo non basta: un membro tenuto col suo nome (regola -keep) R8 non
 * lo scrive nel mapping (visto sulla vc299: `legato` nel dex, assente dal mapping). Una classe che R8 ha tolto per intero non ha
 * niente da tenere vivo: lo si dice senza fallire.
 *
 * Uso da mobile/: node scripts/verify-release-r8-risorse.mjs <apk> <mapping.txt> [<cartella dei sorgenti Java/Kotlin>]
 */

import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, readdirSync, rmSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

/** I tipi il cui oggetto possiede una risorsa del sistema: se muore, la chiude (finalizzatore o Cleaner). */
export const TIPI_RISORSA = Object.freeze([
    'LocalSocket', 'LocalServerSocket', 'ParcelFileDescriptor', 'FileDescriptor', 'Pointer', 'Memory',
])

const SORGENTI_DI_SERIE = 'android/app/src/main/java'

/**
 * I campi di CLASSE (non le variabili locali) con un tipo-risorsa, letti dal sorgente. Java: dichiarazione a un livello di
 * rientro (4 spazi) con il tipo semplice o qualificato; Kotlin: `val`/`var` a un livello di rientro con `: Tipo`.
 * @param {string} testo il sorgente
 * @param {string} nomeFile per dedurre il linguaggio
 * @returns {{ classe: string, campo: string, tipo: string }[]}
 */
export function campiRisorsa(testo, nomeFile) {
    const pacchetto = /^\s*package\s+([\w.]+)/mu.exec(testo)?.[1]
    if (!pacchetto) return []
    const classe = /(?:^|\n)(?:[\w@ ]*\s)?(?:class|object)\s+(\w+)/u.exec(testo)?.[1]
    if (!classe) return []
    const tipi = TIPI_RISORSA.join('|')
    const java = nomeFile.endsWith('.java')
    const riga = java
        ? new RegExp(`^ {4}(?:(?:private|protected|public|static|final|volatile|transient)\\s+)*(?:[\\w.]+\\.)?(${tipi})\\s+(\\w+)\\s*[;=]`, 'gmu')
        : new RegExp(`^ {4}(?:(?:private|protected|internal|public|lateinit|@Volatile)\\s+)*(?:val|var)\\s+(\\w+)\\s*:\\s*(?:[\\w.]+\\.)?(${tipi})\\??\\s*(?:=|$)`, 'gmu')
    const campi = []
    for (const m of testo.matchAll(riga)) {
        const [tipo, campo] = java ? [m[1], m[2]] : [m[2], m[1]]
        campi.push({ classe: `${pacchetto}.${classe}`, campo, tipo })
    }
    return campi
}

/** Tutti i `.java`/`.kt` sotto una cartella. */
export function sorgentiSotto(cartella) {
    const file = []
    for (const nome of readdirSync(cartella)) {
        const p = path.join(cartella, nome)
        if (statSync(p).isDirectory()) file.push(...sorgentiSotto(p))
        else if (/\.(java|kt)$/u.test(nome)) file.push(p)
    }
    return file
}

/**
 * Dal mapping: per ogni classe originale il nome nel dex e i campi RINOMINATI (`Tipo campo -> x`). Serve solo a tradurre i nomi:
 * un campo tenuto col suo nome qui non c'è.
 * @param {string} mapping il testo di `mapping.txt`
 * @returns {Map<string, { nelDex: string, rinominati: Map<string, string> }>}
 */
export function classiNelMapping(mapping) {
    const classi = new Map()
    let corrente = null
    for (const riga of mapping.split(/\r?\n/u)) {
        const c = /^(\S+) -> (\S+):$/u.exec(riga)
        if (c) {
            corrente = { nelDex: c[2], rinominati: new Map() }
            classi.set(c[1], corrente)
            continue
        }
        // un campo: tipo, nome, freccia, senza parentesi (le parentesi sono dei metodi)
        const f = /^ {4}(?:\d+:\d+:)?(\S+) ([\w$]+) -> ([\w$]+)$/u.exec(riga)
        if (corrente && f && !riga.includes('(')) corrente.rinominati.set(f[2], f[3])
    }
    return classi
}

/**
 * Dall'uscita di `dexdump` (senza `-d`): per ogni descrittore di classe, i nomi dei campi (statici e d'istanza) che ESISTONO.
 * @param {string} uscita
 * @returns {Map<string, Set<string>>}
 */
export function campiNelDex(uscita) {
    const classi = new Map()
    let corrente = null
    let neiCampi = false
    for (const riga of uscita.split(/\r?\n/u)) {
        const c = /^ {2}Class descriptor\s*: '(L[^']+;)'/u.exec(riga)
        if (c) {
            corrente = new Set()
            classi.set(c[1], corrente)
            neiCampi = false
            continue
        }
        if (/^ {2}(?:Static|Instance) fields/u.test(riga)) { neiCampi = true; continue }
        if (/^ {2}(?:Direct|Virtual) methods/u.test(riga)) { neiCampi = false; continue }
        const n = /^ {6}name\s*: '([^']+)'/u.exec(riga)
        if (corrente && neiCampi && n) corrente.add(n[1])
    }
    return classi
}

/**
 * @param {{ mapping: string, dex: string, campi: { classe: string, campo: string, tipo: string }[] }} dati il mapping, l'uscita di
 *   `dexdump` di tutti i `classes*.dex` dell'APK, e i campi-risorsa del sorgente
 * @returns {{ verdict: 'PASS'|'FAIL', issues: string[], assenti: string[] }}
 */
export function assertCampiRisorsa({ mapping, dex, campi }) {
    const classi = classiNelMapping(mapping)
    const nelDex = campiNelDex(dex)
    const issues = []
    const assenti = []
    for (const { classe, campo, tipo } of campi) {
        const m = classi.get(classe)
        const nomi = m && nelDex.get(`L${m.nelDex.replaceAll('.', '/')};`)
        if (!m || !nomi) {
            assenti.push(classe)
            continue
        }
        const nome = m.rinominati.get(campo) ?? campo
        if (!nomi.has(nome)) {
            issues.push(`${classe}.${campo} (${tipo}): assente dal dex (classe ${m.nelDex}) — R8 l'ha tolto, e la risorsa che teneva viva può essere chiusa dal GC. Il campo va LETTO dal codice (un campo solo scritto è proprio quello che R8 può togliere), con una regola -keepclassmembers come cintura.`)
        }
    }
    return { verdict: issues.length === 0 ? 'PASS' : 'FAIL', issues, assenti: [...new Set(assenti)] }
}

/** `dexdump` dell'SDK Android (l'ultimo build-tools), su ogni `classes*.dex` dell'APK. */
export function dexdumpDellApk(apkPath) {
    const sdk = process.env.ANDROID_HOME ?? process.env.ANDROID_SDK_ROOT
        ?? (process.env.LOCALAPPDATA ? path.join(process.env.LOCALAPPDATA, 'Android', 'Sdk') : null)
    if (!sdk) throw new Error('ANDROID_HOME non impostato: serve dexdump dei build-tools')
    const versioni = readdirSync(path.join(sdk, 'build-tools')).sort((a, b) => a.localeCompare(b, 'en', { numeric: true }))
    const dexdump = path.join(sdk, 'build-tools', versioni.at(-1), process.platform === 'win32' ? 'dexdump.exe' : 'dexdump')
    const cartella = mkdtempSync(path.join(tmpdir(), 'verify-release-r8-risorse-'))
    try {
        const elenco = execFileSync('unzip', ['-Z1', apkPath], { encoding: 'utf8' }).split(/\r?\n/u).filter((n) => /^classes\d*\.dex$/u.test(n))
        if (elenco.length === 0) throw new Error(`nessun classes*.dex in ${apkPath}`)
        execFileSync('unzip', ['-o', '-q', apkPath, ...elenco, '-d', cartella])
        return elenco.map((n) => execFileSync(dexdump, [path.join(cartella, n)], { encoding: 'utf8', maxBuffer: 1 << 30 })).join('\n')
    }
    finally {
        rmSync(cartella, { recursive: true, force: true })
    }
}

const invokedPath = process.argv[1]
if (invokedPath && pathToFileURL(path.resolve(invokedPath)).href === import.meta.url) {
    const [apk, mappingPath, cartella = SORGENTI_DI_SERIE] = process.argv.slice(2)
    if (!apk || !mappingPath) {
        console.error('Uso: node scripts/verify-release-r8-risorse.mjs <apk> <mapping.txt> [<cartella dei sorgenti>]')
        process.exit(1)
    }
    const campi = sorgentiSotto(cartella).flatMap((f) => campiRisorsa(readFileSync(f, 'utf8'), f))
    const { verdict, issues, assenti } = assertCampiRisorsa({ mapping: readFileSync(mappingPath, 'utf8'), dex: dexdumpDellApk(apk), campi })
    for (const classe of assenti) console.log(`  · ${classe}: assente dall'APK (tolta per intero da R8), niente da tenere vivo`)
    if (verdict === 'PASS') {
        console.log(`✓ verify-release-r8-risorse: ${campi.length} campi-risorsa sopravvivono a R8 in ${apk}.`)
    }
    else {
        console.error(`⛔ verify-release-r8-risorse: ${apk}`)
        for (const issue of issues) console.error(`  - ${issue}`)
        process.exit(1)
    }
}
