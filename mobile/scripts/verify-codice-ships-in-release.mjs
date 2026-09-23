#!/usr/bin/env node

/**
 * ⛔⛔⛔ IL CANCELLO "CODICE SPEDISCE IN RELEASE" — mai più un file che torna
 * silenziosamente sotto `src/debug/`.
 *
 * Perché esiste: il 3/9 la v0.1.24 è uscita con Codice invisibile ovunque
 * nella build firmata — non il difetto di un file, ma dell'INTERO plugin
 * nativo + bundle che viveva (dal 24/8) in `android/app/src/debug/`, un
 * source set che Gradle compila SOLO per le build di debug. L'owner l'ha
 * corretto, dopo aver scaricato la 24 e non aver trovato niente: «CODICE
 * DEVE ESSERE PRESENTE NELLA APP DI PRODUZIONE» (ripetuto cinque volte).
 * Questo cancello rende quella correzione PERMANENTE — un domani, chi
 * sposta uno di questi file (per errore, o per un refactor che non conosce
 * questa storia) fa fallire `npm run build` in secondi, non scopre il buco
 * mesi dopo scaricando l'APK pubblico come ha fatto l'owner stavolta.
 *
 * ⛔ Cosa NON controlla — dichiarato, non nascosto: se il file esiste in
 * `main/` ma R8 lo rinomina comunque a runtime (il rischio della ricerca
 * per stringa `Class.forName`, vedi il commento di classe di
 * TalosHarnessUiPlugin e le righe dedicate in proguard-rules.pro). Quella
 * è la metà DINAMICA, vuole un APK di release costruito davvero — verificata
 * a parte, `verify-release-plugin-classes.mjs`, wired in
 * `.github/workflows/release.yml` subito dopo la firma dell'APK.
 *
 * Uso da mobile/: node scripts/verify-codice-ships-in-release.mjs
 */

import { existsSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const MOBILE_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

/**
 * Percorsi (relativi a `android/app/src/`) che Codice richiede in un source
 * set condiviso da OGNI variante — se uno di questi finisse sotto `debug/`
 * invece che `main/`, la build di rilascio perderebbe Codice senza che
 * nessun test rosso lo dicesse prima di un download reale.
 */
export const PERCORSI_RICHIESTI_IN_MAIN = Object.freeze([
    'java/ai/talos/harness/TalosHarnessUiPlugin.kt',
    'java/ai/talos/terminal/TalosTerminalPlugin.kt',
    'assets/talos-harness-ui',
    'assets/talos-node-lib',
])

/**
 * @param {string} srcDir es. .../mobile/android/app/src
 * @returns {{ok: boolean, issues: string[]}}
 */
export function verificaCodiceInMain(srcDir) {
    const issues = []
    for (const relativo of PERCORSI_RICHIESTI_IN_MAIN) {
        const inMain = existsSync(path.join(srcDir, 'main', relativo))
        const inDebug = existsSync(path.join(srcDir, 'debug', relativo))
        if (!inMain) {
            issues.push(
                `manca in main/: ${relativo}` +
                (inDebug
                    ? ' — è (tornato) sotto debug/: Codice sparirebbe dalla build di rilascio, esattamente il difetto della v0.1.24'
                    : ' — assente ovunque, non solo fuori posto'),
            )
        }
        if (inDebug) {
            issues.push(
                `presente ANCHE sotto debug/: ${relativo} — una copia dimenticata lì non danneggia la build di rilascio da sola (Gradle legge main/), ma è il segnale di un merge o una copia fatta a metà: va rimossa`,
            )
        }
    }
    return { ok: issues.length === 0, issues }
}

const invokedPath = process.argv[1]
if (invokedPath && pathToFileURL(path.resolve(invokedPath)).href === import.meta.url) {
    const srcDir = path.join(MOBILE_ROOT, 'android', 'app', 'src')
    if (!existsSync(srcDir)) {
        // ⛔ Onesto se questo checkout non ha la cartella android/ (es. un
        // ambiente che clona solo il bundle web): niente da controllare qui,
        // mai un `npm run build` rotto per questo — stesso principio già
        // usato in sync-harness-ui-mobile.mjs.
        console.log('— verify-codice-ships-in-release: nessuna cartella android/ in questo checkout, salto onestamente.')
        process.exit(0)
    }
    const { ok, issues } = verificaCodiceInMain(srcDir)
    if (ok) {
        console.log('✓ verify-codice-ships-in-release: Codice (harness UI + terminale) vive in main/, spedisce in ogni build.')
    }
    else {
        console.error('⛔ verify-codice-ships-in-release:')
        for (const issue of issues) console.error(`  - ${issue}`)
        process.exit(1)
    }
}
