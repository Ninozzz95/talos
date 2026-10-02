#!/usr/bin/env node

/**
 * ⛔ PKLA Qualcomm 3.9 (owner, 01/10/2026) — i file dell'NPU escono dall'APK
 * byte per byte come li ha prodotti l'SDK Hexagon ufficiale.
 *
 * Perché serve: AGP «strippa» le `.so` per difetto, anche in debug — misurato
 * il 01/10, `libggml-htp-v79.so` da 881.576 a 853.836 byte — e il contratto
 * Qualcomm vieta di modificare i file. `keepDebugSymbols` nel build.gradle lo
 * impedisce; questo controllo lo PROVA sull'APK vero, così un domani che la
 * riga sparisse la build se ne accorge.
 *
 * Verifica anche il nome: il nostro modulo NPU deve uscire come
 * `libtalos-npu-hexagon.so`. Col vecchio nome `libggml-hexagon.so` ggml lo
 * caricherebbe all'avvio, PRIMA che l'utente accetti le condizioni (2.1 b).
 *
 * Uso da mobile/:
 *   node scripts/verify-npu-unmodified.mjs <apk> <cartella dei file NPU d'origine>
 */

import { createHash } from 'node:crypto'
import { readFileSync, existsSync } from 'node:fs'
import { inflateRawSync } from 'node:zlib'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

/** Nome d'origine → voce attesa nell'APK. */
export const NPU_FILES = {
    'libggml-hexagon.so': 'lib/arm64-v8a/libtalos-npu-hexagon.so',
    'libggml-htp-v73.so': 'lib/arm64-v8a/libggml-htp-v73.so',
    'libggml-htp-v75.so': 'lib/arm64-v8a/libggml-htp-v75.so',
    'libggml-htp-v79.so': 'lib/arm64-v8a/libggml-htp-v79.so',
    'libggml-htp-v81.so': 'lib/arm64-v8a/libggml-htp-v81.so',
}

/** Il nome che NON deve comparire: ggml lo caricherebbe senza consenso. */
const VECCHIO_NOME = 'lib/arm64-v8a/libggml-hexagon.so'

/**
 * Le voci di uno zip (APK), decompresse. Solo «stored» (0) e «deflate» (8),
 * gli unici due metodi che AGP usa. Legge la directory centrale, non i soli
 * header locali: è la fonte che fa fede.
 */
export function readZipEntries(zipPath) {
    const buf = readFileSync(zipPath)
    let fine = -1
    for (let i = buf.length - 22; i >= Math.max(0, buf.length - 65_557); i -= 1) {
        if (buf.readUInt32LE(i) === 0x06054b50) { fine = i; break }
    }
    if (fine < 0) throw new Error(`${zipPath}: non è uno zip (fine della directory centrale assente)`)
    const voci = buf.readUInt16LE(fine + 10)
    let p = buf.readUInt32LE(fine + 16)
    const out = new Map()
    for (let k = 0; k < voci; k += 1) {
        if (buf.readUInt32LE(p) !== 0x02014b50) throw new Error(`${zipPath}: directory centrale rovinata`)
        const metodo = buf.readUInt16LE(p + 10)
        const compressi = buf.readUInt32LE(p + 20)
        const lunghezzaNome = buf.readUInt16LE(p + 28)
        const extra = buf.readUInt16LE(p + 30)
        const commento = buf.readUInt16LE(p + 32)
        const locale = buf.readUInt32LE(p + 42)
        const nome = buf.toString('utf8', p + 46, p + 46 + lunghezzaNome)
        const dati = locale + 30 + buf.readUInt16LE(locale + 26) + buf.readUInt16LE(locale + 28)
        const grezzi = buf.subarray(dati, dati + compressi)
        if (metodo === 0) out.set(nome, Buffer.from(grezzi))
        else if (metodo === 8) out.set(nome, inflateRawSync(grezzi))
        p += 46 + lunghezzaNome + extra + commento
    }
    return out
}

const sha256 = (b) => createHash('sha256').update(b).digest('hex')

/** @returns {{verdict: 'PASS'|'FAIL', issues: string[], checked: string[]}} */
export function verifyNpuUnmodified(apkPath, sourceDir) {
    const voci = readZipEntries(apkPath)
    const issues = []
    const checked = []
    if (voci.has(VECCHIO_NOME)) {
        issues.push(`${VECCHIO_NOME} è nell'APK col vecchio nome: ggml lo caricherebbe senza il consenso dell'utente`)
    }
    for (const [origine, voce] of Object.entries(NPU_FILES)) {
        const file = path.join(sourceDir, origine)
        if (!existsSync(file)) { issues.push(`${origine}: manca nella cartella d'origine ${sourceDir}`); continue }
        const atteso = readFileSync(file)
        const trovato = voci.get(voce)
        if (!trovato) { issues.push(`${voce}: manca nell'APK`); continue }
        if (sha256(trovato) !== sha256(atteso)) {
            issues.push(`${voce}: modificato (${trovato.length} B nell'APK, ${atteso.length} B all'origine)`)
            continue
        }
        checked.push(`${voce} ${atteso.length} B ${sha256(atteso).slice(0, 16)}…`)
    }
    return { verdict: issues.length === 0 ? 'PASS' : 'FAIL', issues, checked }
}

function main() {
    const [apk, sorgente] = process.argv.slice(2)
    if (!apk || !sorgente) {
        console.error('uso: node scripts/verify-npu-unmodified.mjs <apk> <cartella dei file NPU>')
        process.exit(2)
    }
    const esito = verifyNpuUnmodified(apk, sorgente)
    for (const riga of esito.checked) console.log(`✓ ${riga}`)
    for (const riga of esito.issues) console.error(`✗ ${riga}`)
    console.log(`verify-npu-unmodified: ${esito.verdict}`)
    process.exit(esito.verdict === 'PASS' ? 0 : 1)
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main()
