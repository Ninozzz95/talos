#!/usr/bin/env node

/**
 * ⛔ PKLA Qualcomm 3.6 (owner, 01/10/2026) — nessun codice GPL/LGPL/AGPL
 * nell'app accanto ai binari dell'NPU, e le note legali complete.
 *
 * Fa due cose sulle dipendenze npm di produzione (quelle che finiscono
 * nell'app), lette con license-checker-rseidelsohn (versione fissata nelle
 * devDependencies):
 *   1. FERMA la build se una licenza è del gruppo GPL o non è nota. Un'espressione
 *      con una scelta («MIT OR GPL-3.0») si usa con la scelta permissiva.
 *   2. Scrive `src/generated/npmLicenses.json` (nome, versione, licenza scelta,
 *      repository, testo) che le Note legali mostrano.
 * Le dipendenze Android le controlla AboutLibraries nel build.gradle, in modalità
 * rigorosa; questo è il gemello lato npm.
 *
 * Uso da mobile/:  node scripts/verify-licenses.mjs
 */

import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

/** Permissive: nessun obbligo di pubblicare sorgenti di altri. */
const PERMISSIVE = new Set([
    'MIT', 'MIT*', 'ISC', 'Apache-2.0', 'BSD-2-Clause', 'BSD-3-Clause', 'BSD*', '0BSD',
    'BlueOak-1.0.0', 'Python-2.0', 'OFL-1.1', 'Zlib', 'CC0-1.0', 'Unlicense', 'CC-BY-4.0',
])
/**
 * MPL-2.0: copyleft per FILE — obbliga solo sui file MPL stessi, mai sul codice
 * accanto (MPL 2.0 §3.3). Ammessa, e segnalata nel registro di conformità.
 */
const FILE_COPYLEFT = new Set(['MPL-2.0'])
const FORBIDDEN = /(^|[^A-Z])(A|L)?GPL/i

/**
 * Pacchetti la cui licenza non è dichiarata bene e che qualcuno ha verificato a
 * mano. Valgono per QUELLA versione: un aggiornamento torna a chiedere la verifica.
 */
export const REVIEWED = {
    'vaul-vue@0.4.1': {
        license: 'MIT',
        note: 'package.json senza «license» e senza file LICENSE; il repository github.com/Elliot-Alexander/vaul-vue è MIT (verificato il 01/10/2026).',
    },
}

function allowed(single) {
    const s = single.trim().replace(/^\(|\)$/g, '').trim()
    if (FORBIDDEN.test(s)) return false
    return PERMISSIVE.has(s) || FILE_COPYLEFT.has(s)
}

/**
 * Il verdetto su un'espressione di licenza.
 * @returns {{ok: boolean, chosen?: string}}
 */
export function licenseVerdict(expression) {
    const e = String(expression ?? '').trim()
    if (!e || /^UNKNOWN$/i.test(e) || /^Custom:/i.test(e) || /^UNLICENSED$/i.test(e)) return { ok: false }
    const corpo = e.replace(/^\((.*)\)$/, '$1')
    // OR: basta un'alternativa ammessa; si preferisce la permissiva.
    const alternative = corpo.split(/\s+OR\s+/i).map((a) => a.trim())
    if (alternative.length > 1) {
        const ammesse = alternative.filter((a) => a.split(/\s+AND\s+/i).every(allowed))
        if (ammesse.length === 0) return { ok: false }
        const permissiva = ammesse.find((a) => !FILE_COPYLEFT.has(a)) ?? ammesse[0]
        return { ok: true, chosen: permissiva.replace(/^\(|\)$/g, '') }
    }
    // AND: tutte devono essere ammesse.
    const parti = corpo.split(/\s+AND\s+/i)
    return parti.every(allowed) ? { ok: true, chosen: corpo } : { ok: false }
}

/**
 * @param {Record<string, {licenses?: string|string[], private?: boolean, repository?: string, licenseFile?: string}>} report
 * @param {Record<string, {license: string, note: string}>} reviewed
 */
export function verifyLicenses(report, reviewed = REVIEWED) {
    const issues = []
    const packages = []
    for (const [pkg, info] of Object.entries(report)) {
        if (info.private === true) continue
        const raw = Array.isArray(info.licenses) ? info.licenses.join(' AND ') : info.licenses
        const rivisto = reviewed[pkg]
        const verdetto = rivisto ? { ok: true, chosen: rivisto.license } : licenseVerdict(raw)
        if (!verdetto.ok) {
            issues.push({ package: pkg, license: String(raw) })
            continue
        }
        packages.push({
            package: pkg,
            license: verdetto.chosen,
            declared: String(raw),
            repository: info.repository ?? null,
            licenseFile: info.licenseFile ?? null,
            note: rivisto?.note ?? null,
        })
    }
    return { verdict: issues.length === 0 ? 'PASS' : 'FAIL', issues, packages }
}

function main() {
    const radice = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
    const bin = path.join(radice, 'node_modules', 'license-checker-rseidelsohn', 'bin', 'license-checker-rseidelsohn.js')
    const json = execFileSync(process.execPath, [bin, '--production', '--json', '--start', radice], {
        encoding: 'utf8', maxBuffer: 64 * 1024 * 1024,
    })
    const esito = verifyLicenses(JSON.parse(json))
    for (const i of esito.issues) console.error(`✗ ${i.package}: ${i.license}`)
    if (esito.verdict === 'FAIL') {
        console.error('verify-licenses: FAIL — licenza GPL/LGPL/AGPL o non nota (PKLA Qualcomm 3.6). Verificala e, se è permissiva, aggiungila a REVIEWED con la fonte.')
        process.exit(1)
    }
    const note = esito.packages.map((p) => ({
        package: p.package,
        license: p.license,
        repository: p.repository,
        note: p.note,
        text: p.licenseFile && existsSync(p.licenseFile) && /licen[cs]e|copying|notice/i.test(path.basename(p.licenseFile))
            ? readFileSync(p.licenseFile, 'utf8').slice(0, 20_000)
            : null,
    })).sort((a, b) => a.package.localeCompare(b.package))
    const uscita = path.join(radice, 'src', 'generated', 'npmLicenses.json')
    mkdirSync(path.dirname(uscita), { recursive: true })
    writeFileSync(uscita, JSON.stringify(note, null, 1) + '\n')
    const mpl = esito.packages.filter((p) => p.license === 'MPL-2.0').map((p) => p.package)
    console.log(`verify-licenses: PASS — ${esito.packages.length} pacchetti di terzi; MPL-2.0 (copyleft per file): ${mpl.join(', ') || 'nessuno'}`)
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main()
