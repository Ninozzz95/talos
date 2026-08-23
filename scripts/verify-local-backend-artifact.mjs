#!/usr/bin/env node

/**
 * Motore locale MAX PERFORMANCE, Fase 0 — cancello "backend dichiarato ==
 * backend spedito".
 *
 * ⛔ Perché esiste: Fase 7(a) (commit `3d86e58d`) ha già provato UNA VOLTA,
 * a mano, che il rilascio spedisce `libggml-opencl.so` e non la
 * `libOpenCL.so` del vendor (`aapt list` + `llvm-readobj`, misurato sul
 * Pad). Una prova fatta a mano non impedisce una regressione futura — un
 * domani `talosResearchBackend` finito per errore nell'invocazione di
 * rilascio, o un `excludes` di packaging tolto per sbaglio, produrrebbe un
 * APK diverso da quello dichiarato senza che nessun test se ne accorga.
 * Questo script rende quella prova PERMANENTE, non la ripete da zero.
 *
 * ⛔ Solo la metà STATICA (i byte nell'APK). La metà dinamica — l'APK
 * installato dichiara davvero i backend a runtime via
 * `nativeBackendInventory()` — richiede un dispositivo/emulatore in CI, ed
 * è un passo successivo dichiarato, non silenziosamente saltato.
 *
 * Usage da mobile/:
 *   node scripts/verify-local-backend-artifact.mjs
 *   node scripts/verify-local-backend-artifact.mjs <apk> cpu,opencl
 */

import { execFileSync } from 'node:child_process'
import { existsSync, readdirSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const MOBILE_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

/**
 * Ciò che deve esistere SEMPRE, qualunque acceleratore sia atteso — il
 * pavimento CPU su cui l'app deve poter girare comunque, e il nucleo nativo.
 * `libggml-cpu-*` sono le varianti scelte a runtime (GGML_CPU_ALL_VARIANTS,
 * vedi build.gradle) — il numero esatto non è contrattuale, la sua presenza
 * sì.
 */
const ALWAYS_REQUIRED = Object.freeze(['libggml-base.so', 'libggml.so', 'libtalos_llama.so'])

/** Un backend dichiarato -> il nome della sua libreria .so nell'APK. */
const BACKEND_LIBRARY = Object.freeze({
    cpu: null, // coperto da ALWAYS_REQUIRED + libggml-cpu-*, non una .so sola
    opencl: 'libggml-opencl.so',
    vulkan: 'libggml-vulkan.so',
})

/**
 * ⛔⛔ `libOpenCL.so` DEL VENDOR NON DEVE MAI ESSERE NELL'APK — indipendente
 * da quali backend sono attesi. MISURATO il 2026-08-20 (build.gradle, un
 * exclude di packaging su ogni `libOpenCL.so` nell'albero): una copia
 * propria oscura quella di sistema (che vive nel namespace del vendor, con
 * dipendenze che l'app non può risolvere) e fa fallire silenziosamente
 * `dlopen` di `libggml-opencl.so`. Non è un'ottimizzazione di peso, è
 * correttezza.
 */
const FORBIDDEN_ALWAYS = Object.freeze(['libOpenCL.so'])

function sdkCandidates(toolName) {
    const roots = [
        process.env.ANDROID_SDK_ROOT,
        process.env.ANDROID_HOME,
        process.env.LOCALAPPDATA ? path.join(process.env.LOCALAPPDATA, 'Android', 'Sdk') : null,
    ].filter(Boolean)
    const candidates = []
    for (const root of roots) {
        const buildTools = path.join(root, 'build-tools')
        if (!existsSync(buildTools)) continue
        // Le versioni non sono ordinabili come stringhe (35.0.0 < 36.0.0 va
        // bene, ma 9.0.0 < 10.0.0 no) - split numerico, la più recente ultima.
        const versions = execSafeReaddir(buildTools).sort((a, b) => {
            const pa = a.split('.').map(Number)
            const pb = b.split('.').map(Number)
            for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
                const diff = (pa[i] ?? 0) - (pb[i] ?? 0)
                if (diff !== 0) return diff
            }
            return 0
        })
        for (const version of versions) {
            const exe = process.platform === 'win32' ? `${toolName}.exe` : toolName
            candidates.push(path.join(buildTools, version, exe))
        }
    }
    return candidates.reverse() // la più recente per prima
}

function execSafeReaddir(dir) {
    try {
        return readdirSync(dir)
    } catch {
        return []
    }
}

export function findAapt() {
    const candidate = sdkCandidates('aapt').find(existsSync)
    if (!candidate) {
        throw new Error(
            'aapt non trovato: imposta ANDROID_SDK_ROOT/ANDROID_HOME o installa ' +
            'i build-tools dell\'Android SDK.',
        )
    }
    return candidate
}

/** Le voci `lib/arm64-v8a/*.so` dichiarate nell'APK, per nome file nudo. */
export function listArm64Libraries(aaptPath, apkPath) {
    const output = execFileSync(aaptPath, ['list', apkPath], { encoding: 'utf8' })
    return output
        .split(/\r?\n/)
        .filter((line) => line.startsWith('lib/arm64-v8a/') && line.endsWith('.so'))
        .map((line) => line.slice('lib/arm64-v8a/'.length))
}

/**
 * @param {string[]} libraries nomi nudi delle .so in lib/arm64-v8a/
 * @param {string[]} expectedBackends es. ['cpu', 'opencl']
 * @returns {{ verdict: 'PASS'|'FAIL', issues: string[], libraries: string[] }}
 */
export function assertBackendArtifact(libraries, expectedBackends) {
    const issues = []
    const present = new Set(libraries)

    for (const required of ALWAYS_REQUIRED) {
        if (!present.has(required)) issues.push(`libreria attesa sempre assente: ${required}`)
    }
    if (!libraries.some((name) => name.startsWith('libggml-cpu-'))) {
        issues.push('nessuna variante libggml-cpu-* presente - il pavimento CPU manca')
    }
    for (const forbidden of FORBIDDEN_ALWAYS) {
        if (present.has(forbidden)) {
            issues.push(`libreria vietata presente: ${forbidden} (deve restare esclusa dal packaging)`)
        }
    }

    for (const backend of expectedBackends) {
        const library = BACKEND_LIBRARY[backend]
        if (library === undefined) issues.push(`backend sconosciuto nell'elenco atteso: ${backend}`)
        else if (library && !present.has(library)) {
            issues.push(`backend atteso ${backend} ma ${library} assente dall'APK`)
        }
    }

    // Il contrario: un acceleratore presente ma NON dichiarato atteso è
    // altrettanto una divergenza - un APK "più ricco" del previsto non è
    // meno sospetto di uno "più povero".
    for (const [backend, library] of Object.entries(BACKEND_LIBRARY)) {
        if (!library) continue
        if (present.has(library) && !expectedBackends.includes(backend)) {
            issues.push(`${library} presente ma ${backend} non era nell'elenco atteso`)
        }
    }

    return { verdict: issues.length === 0 ? 'PASS' : 'FAIL', issues, libraries }
}

export function verifyLocalBackendArtifact({
    apk,
    expectedBackends = ['cpu', 'opencl'],
    aapt = findAapt(),
} = {}) {
    const apkPath = path.resolve(
        MOBILE_ROOT,
        apk ?? 'android/app/build/outputs/apk/release/app-release.apk',
    )
    if (!existsSync(apkPath)) throw new Error(`APK non trovato: ${apkPath}`)

    const libraries = listArm64Libraries(aapt, apkPath)
    const result = assertBackendArtifact(libraries, expectedBackends)
    return { apk: apkPath, expectedBackends, ...result }
}

function main() {
    const apk = process.argv[2]
    const expectedBackends = process.argv[3] ? process.argv[3].split(',') : undefined
    const result = verifyLocalBackendArtifact({ apk, expectedBackends })
    if (result.verdict === 'FAIL') {
        console.error(`BACKEND-ARTIFACT-RED ${result.apk}`)
        for (const issue of result.issues) console.error(`  - ${issue}`)
        process.exitCode = 1
        return
    }
    console.log(
        `BACKEND-ARTIFACT-GREEN ${result.apk} - atteso [${result.expectedBackends.join(', ')}], ` +
        `${result.libraries.length} librerie arm64-v8a coerenti`,
    )
}

const invokedPath = process.argv[1]
if (invokedPath && pathToFileURL(path.resolve(invokedPath)).href === import.meta.url) {
    main()
}
