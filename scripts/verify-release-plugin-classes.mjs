#!/usr/bin/env node

/**
 * ⛔⛔⛔ LA METÀ DINAMICA del cancello "Codice spedisce in release" —
 * `verify-codice-ships-in-release.mjs` prova che i file VIVONO nel posto
 * giusto (`main/`, non `debug/`); questo prova che R8 non li ha rinominati
 * a runtime nell'APK VERO che si sta per firmare e pubblicare.
 *
 * ## Perché serve un controllo separato, sull'artefatto vero
 *
 * `TalosHarnessUiPlugin`/`TalosTerminalPlugin` sono cercate in
 * `MainActivity` via `Class.forName("ai.talos.harness.TalosHarnessUiPlugin")`
 * — una ricerca per STRINGA, non un riferimento diretto (`X.class`) che R8
 * traccia da solo. `proguard-rules.pro` le tiene esplicite — ma un file di
 * regole si può rompere (una riga tolta per errore, un refactor del blocco
 * sbagliato) senza che `npm run build` se ne accorga: quel comando non gira
 * mai R8, gira solo su un checkout web. Solo l'APK di release VERO, con
 * minify+shrink accesi, può dire se la regola ha tenuto.
 *
 * ## Come si verifica, senza un dex-parser
 *
 * Il DESCRITTORE di tipo di una classe (`Lai/talos/harness/
 * TalosHarnessUiPlugin;` — barre e punto e virgola, il formato interno JVM)
 * è diverso dalla stringa che `Class.forName` cerca (`ai.talos.harness.
 * TalosHarnessUiPlugin` — punti, il formato "nome qualificato"). R8 non
 * tocca MAI il contenuto di una stringa costante: quella dotata sopravvive
 * SEMPRE, rinominata o no la classe. Il descrittore con le barre invece
 * esiste nel dex SOLO se un vero riferimento di tipo con quel nome esiste
 * — cioè solo se la classe non è stata rinominata. Cercare il descrittore
 * (non la stringa puntata) nei byte grezzi di `classes*.dex` è quindi una
 * prova valida, senza bisogno di `dexdump` o di un parser vero: un
 * descrittore con le barre che sopravvive è una classe che sopravvive con
 * quel nome esatto.
 *
 * Uso da mobile/: node scripts/verify-release-plugin-classes.mjs <apk>
 */

import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

/** Classi che DEVONO sopravvivere con il nome esatto — vedi proguard-rules.pro. */
export const CLASSI_RICHIESTE = Object.freeze([
    'ai.talos.harness.TalosHarnessUiPlugin',
    'ai.talos.terminal.TalosTerminalPlugin',
])

function descrittoreDiTipo(nomeQualificato) {
    return `L${nomeQualificato.replaceAll('.', '/')};`
}

/**
 * @param {Buffer} dexBytes concatenazione di tutti i classes*.dex dell'APK
 * @param {string[]} classiRichieste nomi qualificati (punti), es. CLASSI_RICHIESTE
 * @returns {{verdict: 'PASS'|'FAIL', issues: string[]}}
 */
export function assertPluginClasses(dexBytes, classiRichieste) {
    const issues = []
    // ⛔ latin1, non utf8: i descrittori sono ASCII puro (identificatori Java),
    // e latin1 legge un byte per carattere senza reinterpretare sequenze
    // multi-byte del resto del dex (bytecode binario) come se fosse testo —
    // basta che i byte ASCII cercati restino byte-per-byte identici, ed è
    // così per definizione con solo lettere/punti/barre.
    const testo = dexBytes.toString('latin1')
    for (const nome of classiRichieste) {
        const descrittore = descrittoreDiTipo(nome)
        if (!testo.includes(descrittore)) {
            issues.push(`${nome}: descrittore di tipo ${descrittore} assente dal dex — R8 l'ha rinominata o rimossa, la regola -keep non ha tenuto`)
        }
    }
    return { verdict: issues.length === 0 ? 'PASS' : 'FAIL', issues }
}

/** Estrae e concatena tutti i classes*.dex dell'APK in una cartella temporanea. */
export function estraiDex(apkPath) {
    const cartella = mkdtempSync(path.join(tmpdir(), 'verify-release-plugin-classes-'))
    try {
        const elenco = execFileSync('unzip', ['-Z1', apkPath], { encoding: 'utf8' })
            .split(/\r?\n/)
            .filter((nome) => /^classes\d*\.dex$/.test(nome))
        if (elenco.length === 0) {
            throw new Error(`nessun classes*.dex trovato in ${apkPath} — l'APK è quello giusto?`)
        }
        execFileSync('unzip', ['-o', '-q', apkPath, ...elenco, '-d', cartella])
        const pezzi = elenco.map((nome) => readFileSync(path.join(cartella, nome)))
        return Buffer.concat(pezzi)
    }
    finally {
        rmSync(cartella, { recursive: true, force: true })
    }
}

const invokedPath = process.argv[1]
if (invokedPath && pathToFileURL(path.resolve(invokedPath)).href === import.meta.url) {
    const apk = process.argv[2]
    if (!apk) {
        console.error('Uso: node scripts/verify-release-plugin-classes.mjs <apk>')
        process.exit(1)
    }
    const dexBytes = estraiDex(apk)
    const { verdict, issues } = assertPluginClasses(dexBytes, CLASSI_RICHIESTE)
    if (verdict === 'PASS') {
        console.log(`✓ verify-release-plugin-classes: ${CLASSI_RICHIESTE.length} classi Codice sopravvivono in ${apk} col loro nome esatto.`)
    }
    else {
        console.error(`⛔ verify-release-plugin-classes: ${apk}`)
        for (const issue of issues) console.error(`  - ${issue}`)
        process.exit(1)
    }
}
