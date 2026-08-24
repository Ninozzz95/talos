/**
 * P3-3 — l'esperimento A/B che design.md §33.4 chiede prima di scrivere una
 * riga di codice di produzione: "internal è più veloce" è una premessa da
 * PROVARE, non da assumere — su Android l'external storage app-specific è
 * spesso emulato sullo stesso partition fisico dell'internal.
 *
 * ⛔⛔⛔ Il falsificatore è scritto PRIMA di misurare: se la differenza sta
 * dentro la stessa banda di rumore già in uso nel resto di questo programma
 * per le soglie epistemiche (3%, `TALOS_PROFILE_NOISE_BAND`/
 * `talosPreferFewerThreads`), il progetto si cancella qui — non si costruisce
 * comunque un percorso di storage duplicato "perché sembra ovvio".
 *
 * ## Perché ogni giro è una chiamata `am instrument` separata
 *
 * Un solo processo che apre prima dall'esterno poi dall'interno misurerebbe
 * l'effetto della cache pagina del sistema operativo (scaldata dalla prima
 * lettura), non lo storage sottostante. Ogni chiamata `am instrument` qui
 * avvia un processo NUOVO — lo stesso principio già sfruttato con successo
 * in `verify-opencl-kernel-cache.mjs` (fase B: "un secondo processo che
 * trova sul disco quello che A ha scritto").
 *
 * ## Perché A/B/A/B alternato, non prima tutti gli A poi tutti i B
 *
 * Stesso protocollo di P1-1 (design.md riga 3613): alternare protegge dalla
 * deriva termica — se il telefono si scalda durante la corsa, una sequenza
 * "tutti gli A poi tutti i B" attribuirebbe allo storage una differenza che
 * è in realtà solo il tempo che passa.
 *
 * ## Uso
 *
 *     node scripts/research/verify-internal-hot-staging.mjs \
 *         --model=/storage/emulated/0/Android/data/ai.talos/files/models/ggml-org/Llama-3.2-3B-Instruct-GGUF/Llama-3.2-3B-Instruct-Q4_K_M.gguf
 *
 * Richiede una build già pronta (nessun flag di ricerca speciale — questo
 * test non tocca OpenCL, apre sempre su CPU per isolare la sola variabile
 * di storage):
 *
 *     ./gradlew :app:assembleDebug :app:assembleDebugAndroidTest
 *
 * Variabili: `TALOS_ADB`, `TALOS_PACKAGE` (default `ai.talos`),
 * `TALOS_STAGING_PAIRS` (default 4 — coppie A/B, non giri totali).
 */

import { execFileSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const QUI = dirname(fileURLToPath(import.meta.url))
const MOBILE = resolve(QUI, '..', '..')

function trovaAdb() {
    if (process.env.TALOS_ADB) return process.env.TALOS_ADB
    const casa = process.env.ANDROID_HOME ?? process.env.ANDROID_SDK_ROOT
    const eseguibile = process.platform === 'win32' ? 'adb.exe' : 'adb'
    const candidati = []
    if (casa) candidati.push(`${casa}/platform-tools/${eseguibile}`)
    const utente = process.env.LOCALAPPDATA ?? process.env.HOME ?? ''
    if (utente) {
        candidati.push(`${utente}/Android/Sdk/platform-tools/${eseguibile}`)
        candidati.push(`${utente}/Library/Android/sdk/platform-tools/${eseguibile}`)
    }
    for (const c of candidati) if (existsSync(c)) return c
    return eseguibile
}

const ADB = trovaAdb()
const PACCHETTO = process.env.TALOS_PACKAGE ?? 'ai.talos'
const PACCHETTO_TEST = `${PACCHETTO}.test`
const RUNNER = 'androidx.test.runner.AndroidJUnitRunner'
const CLASSE = 'ai.talos.TalosLocalHotStagingDeviceTest'
const COPPIE = Number(process.env.TALOS_STAGING_PAIRS ?? 4)
// Stesso path che il test Java calcola da sé (ARTIFACT_DIR): riportato qui
// solo per il pull finale, non per scriverci nulla da questo script.
const ARTIFACT_REMOTO = `/storage/emulated/0/Android/data/${PACCHETTO}/files/research/local-hot-staging/runs.jsonl`

const APK_APP = resolve(MOBILE, 'android/app/build/outputs/apk/debug/app-debug.apk')
const APK_TEST = resolve(
    MOBILE, 'android/app/build/outputs/apk/androidTest/debug/app-debug-androidTest.apk')

function adb(...args) {
    return execFileSync(ADB, args, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })
}

function annuncia(testo) {
    process.stdout.write(`${testo}\n`)
}

function esigi(condizione, messaggio) {
    if (!condizione) {
        process.stderr.write(`⛔ ${messaggio}\n`)
        process.exit(1)
    }
}

const argomenti = process.argv.slice(2)
const modeloArg = argomenti.find((a) => a.startsWith('--model='))
esigi(modeloArg, 'manca --model=<percorso GGUF sul device>')
const MODELLO = modeloArg.slice('--model='.length)

esigi(existsSync(APK_APP),
    `APK dell'app assente: ${APK_APP}\n   Costruiscilo con: ./gradlew :app:assembleDebug :app:assembleDebugAndroidTest`)
esigi(existsSync(APK_TEST), `APK dei test assente: ${APK_TEST}`)

/**
 * ⛔⛔ Lo stesso Pad appare su PIÙ trasporti quando il debug wireless è
 * attivo (lezione già chiusa: "IL DEBUG WIRELESS MOSTRA IL PAD DUE VOLTE") —
 * ogni `adb` senza `-s` esplicito muore con "more than one device/emulator".
 * Il seriale si sceglie UNA VOLTA, qui, e si passa OVUNQUE — mai un secondo
 * `adb(...)` bare dopo questo punto.
 */
const collegati = adb('devices').split('\n').filter((riga) => /\tdevice$/.test(riga.trim()))
esigi(collegati.length > 0, 'nessun dispositivo collegato — `adb devices` non ne elenca nessuno')
const DISPOSITIVO = process.env.TALOS_DEVICE_SERIAL
    ?? collegati.find((r) => r.startsWith('192.168.'))?.split('\t')[0]
    ?? collegati[0].split('\t')[0]
annuncia(`dispositivo   ${DISPOSITIVO} (${collegati.length} trasporti visti)`)
annuncia(`pacchetto     ${PACCHETTO}`)
annuncia(`modello       ${MODELLO}`)
annuncia(`coppie A/B    ${COPPIE}`)

function adbS(...args) {
    return adb('-s', DISPOSITIVO, ...args)
}

function installa(apk, etichetta) {
    annuncia(`installo     ${etichetta}`)
    try {
        const esito = adbS('install', '-r', apk)
        esigi(/Success/.test(esito), `installazione non riuscita: ${esito.trim()}`)
    } catch (problema) {
        const testo = String(problema.stdout ?? '') + String(problema.stderr ?? '')
        process.stderr.write(`⛔ installazione non riuscita: ${testo.trim()}\n`)
        process.exit(1)
    }
}
installa(APK_APP, 'app-debug.apk')
installa(APK_TEST, 'app-debug-androidTest.apk')

// ⛔ Ripulisce l'artifact precedente: righe vecchie mischiate con quelle di
// questa corsa falsificherebbero la mediana senza che nessuno se ne accorga.
try {
    adbS('shell', `rm -f '${ARTIFACT_REMOTO}'`)
} catch {
    // Niente da ripulire la prima volta.
}

function eseguiMetodo(metodo) {
    const argomentiAm = ['shell', 'am', 'instrument', '-w', '-r',
        '-e', 'class', `${CLASSE}#${metodo}`,
        '-e', 'talosModelPath', MODELLO,
        `${PACCHETTO_TEST}/${RUNNER}`]
    let uscita = ''
    try {
        uscita = adbS(...argomentiAm)
    } catch (problema) {
        uscita = String(problema.stdout ?? '') + String(problema.stderr ?? '')
    }
    const verde = /OK \(\d+ test\)/.test(uscita) && !/FAILURES!!!/.test(uscita)
    if (!verde) annuncia(`  ⛔ ${metodo} non verde:\n${uscita}`)
    return verde
}

annuncia('\n--- preparazione: copia il GGUF in staging interno (una volta, non misurato) ---')
esigi(eseguiMetodo('preparaStaging'), 'preparaStaging non è risultato verde — vedi sopra')

annuncia(`\n--- ${COPPIE} coppie A(esterna)/B(interna), alternate, processo nuovo per giro ---`)
for (let coppia = 0; coppia < COPPIE; coppia += 1) {
    annuncia(`  coppia ${coppia + 1}/${COPPIE}: esterna...`)
    esigi(eseguiMetodo('misuraEsterna'), `misuraEsterna (coppia ${coppia + 1}) non verde`)
    annuncia(`  coppia ${coppia + 1}/${COPPIE}: interna...`)
    esigi(eseguiMetodo('misuraInterna'), `misuraInterna (coppia ${coppia + 1}) non verde`)
}

annuncia('\n--- risultati ---')
const jsonl = adbS('shell', `cat '${ARTIFACT_REMOTO}'`)
const righe = jsonl.trim().split('\n').filter(Boolean).map((r) => JSON.parse(r))
esigi(righe.length === COPPIE * 2, `attese ${COPPIE * 2} righe, trovate ${righe.length}`)

function mediana(valori) {
    const ordinati = [...valori].sort((a, b) => a - b)
    const meta = Math.floor(ordinati.length / 2)
    return ordinati.length % 2 === 0
        ? (ordinati[meta - 1] + ordinati[meta]) / 2
        : ordinati[meta]
}

const esterne = righe.filter((r) => r.storage === 'external').map((r) => r.openMs)
const interne = righe.filter((r) => r.storage === 'internal').map((r) => r.openMs)
annuncia(`external openMs: ${esterne.join(', ')}  →  mediana ${mediana(esterne).toFixed(0)} ms`)
annuncia(`internal openMs: ${interne.join(', ')}  →  mediana ${mediana(interne).toFixed(0)} ms`)

const medExterna = mediana(esterne)
const medInterna = mediana(interne)
const differenzaRelativa = Math.abs(medExterna - medInterna) / Math.max(medExterna, medInterna)
const SOGLIA_RUMORE = 0.03 // stessa banda epistemica del resto del programma

annuncia(`\ndifferenza: ${(differenzaRelativa * 100).toFixed(1)}% (soglia di rumore: ${SOGLIA_RUMORE * 100}%)`)

if (differenzaRelativa <= SOGLIA_RUMORE) {
    annuncia('\n⛔ FALSIFICATO — la differenza sta dentro la banda di rumore. '
        + 'Su questo dispositivo lo storage interno NON offre un guadagno misurabile: '
        + 'coerente con l\'avviso del documento (external app-specific spesso emulato '
        + 'sullo stesso partition fisico). Non costruire il percorso di storage duplicato.')
    process.exitCode = 0
} else if (medInterna < medExterna) {
    annuncia(`\n✓ Guadagno reale misurato: interno ${((1 - medInterna / medExterna) * 100).toFixed(1)}% `
        + 'più veloce dell\'esterno, oltre la banda di rumore. Vale la pena progettare '
        + 'la Fase 2 (copia atomica di produzione, eviction) — non ancora costruita da questo script.')
    process.exitCode = 0
} else {
    annuncia('\n⛔ L\'esterno è risultato PIÙ VELOCE dell\'interno, oltre la banda di rumore — '
        + 'il contrario di quanto il documento ipotizzava. Non costruire il percorso di storage duplicato.')
    process.exitCode = 0
}
