/**
 * P0-1 — l'esperimento A/B/C del piano sorgente (§6.5), scriptato.
 *
 * ⛔⛔ PERCHÉ QUESTO SCRIPT NON USA `run-device-tests.mjs`.
 *
 * MISURATO il 2026-08-22: quello script fa `adb install -r` PRIMA di ogni
 * corsa — la sua stessa ragion d'essere, per non perdere i modelli sul
 * device fra una corsa e l'altra. Ma su Android un reinstall (anche
 * bit-identico) SVUOTA `code_cache`, la cartella dove vive la cache dei
 * binari OpenCL: due corse consecutive di quello script misurano SEMPRE
 * cache fredda, mai la persistenza vera. La prova era nei numeri: due giri
 * con `run-device-tests.mjs` in mezzo hanno dato ENTRAMBI 174 MISS/175 SAVE
 * su Qwen3-1.7B, mentre lo stesso test chiamato con `am instrument`
 * DIRETTO — senza reinstallare — è sceso da 44,7-55,6 s a 9,8 s.
 *
 * ⇒ Questo script installa gli APK **una sola volta, all'inizio**, poi
 * chiama `am instrument` direttamente per ogni fase. Non è una scelta
 * stilistica: è l'UNICO modo di misurare quello che l'esperimento vuole
 * misurare.
 *
 * ## Le tre fasi (D è fuori scope, vedi sotto)
 *
 *  A. Cache azzerata a mano, un processo pulito, `talosCacheDebug=1`.
 *     Atteso: quasi tutti MISS→SAVE, pochi o zero HIT (kernel banali
 *     condivisi fra due aperture nello stesso processo, L0/L1).
 *  B. STESSO test, NESSUNA reinstallazione, NESSUNA pulizia della cache —
 *     un secondo processo che trova sul disco quello che A ha scritto.
 *     Atteso: il tempo totale crolla (misurato: 4,5-5,6×). Il trace
 *     HIT/MISS/SAVE testuale a volte non compare in questa fase per un
 *     motivo non ancora isolato (probabilmente un timing su
 *     `cache_debug_enabled()`, che è cachata a livello di processo) — lo
 *     script lo segnala se succede, ma NON lo tratta come fallimento: il
 *     tempo e il conteggio dei file sul disco (che non deve crescere) sono
 *     la prova che conta.
 *  C. CONTROLLO: cache azzerata di nuovo, `talosCacheOff=1` (spegne
 *     `GGML_OPENCL_KERNEL_CACHE_DIR` per questo processo). Atteso: zero
 *     file `.clbin` sul disco dopo, e un tempo vicino a quello di A — la
 *     riprova che il guadagno di B viene DAVVERO dalla cache, non da
 *     qualcos'altro (un driver che cachea per conto suo, un modello già
 *     caldo).
 *
 * ⛔ D (cambio engine SHA → invalidazione attesa) NON è in questo script.
 * La chiave della cache upstream (`cl-program-cache.cpp`, letto riga per
 * riga) è `sha256(source_bytes || compile_opts || key_suffix)`: include i
 * BYTE del sorgente del kernel. Un pin diverso di llama.cpp che cambi anche
 * un carattere di un kernel produce per costruzione matematica un hash
 * diverso — non serve una riga di codice nostra perché funzioni, e
 * verificarlo empiricamente richiederebbe una seconda build con un pin
 * diverso apposta, un costo sproporzionato rispetto a quanto c'è da
 * imparare: il meccanismo non è nostro, è upstream, ed è SHA-256.
 *
 * ## Uso
 *
 *     node scripts/research/verify-opencl-kernel-cache.mjs \
 *         --model=/storage/emulated/0/Android/data/ai.talos/files/models/ggml-org/Qwen3-1.7B-GGUF/Qwen3-1.7B-Q4_K_M.gguf
 *
 * Richiede una build già pronta con OpenCL dentro:
 *
 *     ./gradlew :app:assembleDebug :app:assembleDebugAndroidTest \
 *         -PtalosResearchBackend=opencl -PtalosOpenclRoot=<cartella>
 *
 * Variabili: `TALOS_ADB`, `TALOS_PACKAGE` (default `ai.talos`).
 */

import { execFileSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const QUI = dirname(fileURLToPath(import.meta.url))
const MOBILE = resolve(QUI, '..', '..')

// ⛔ Stessa scaletta di `run-device-tests.mjs`/`scripts/device.mjs`: il
// percorso di adb non si scrive, si trova — una riga con l'SDK di chi ha
// scritto lo script funziona su un computer solo al mondo.
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
const CLASSE_TEST = 'ai.talos.TalosLocalBaselineDeviceTest#c0Carico'
// ⛔ `/data/user/0/`, non `/data/data/` — è il percorso verificato a mano con
// `run-as` in questa stessa indagine; `/data/data` è di norma un symlink allo
// stesso posto, ma non è quello su cui è stata presa la misura.
const CARTELLA_CACHE = `/data/user/0/${PACCHETTO}/code_cache/ggml-opencl-cache`

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
    `APK dell'app assente: ${APK_APP}\n`
    + '   Costruiscilo con:  ./gradlew :app:assembleDebug :app:assembleDebugAndroidTest '
    + '-PtalosResearchBackend=opencl -PtalosOpenclRoot=<cartella>')
esigi(existsSync(APK_TEST), `APK dei test assente: ${APK_TEST}`)

const collegati = adb('devices').split('\n').filter((riga) => /\tdevice$/.test(riga.trim()))
esigi(collegati.length > 0, 'nessun dispositivo collegato — `adb devices` non ne elenca nessuno')
const DISPOSITIVO = collegati[0].split('\t')[0]
annuncia(`dispositivo   ${DISPOSITIVO}`)
annuncia(`pacchetto     ${PACCHETTO}`)
annuncia(`modello       ${MODELLO}`)

/**
 * ⛔ Installazione UNA VOLTA SOLA, qui, prima di qualunque fase — non dentro
 * un helper richiamato per fase. È la riga che rende questo script diverso
 * da `run-device-tests.mjs`, e va tenuta visibile.
 */
function installa(apk, etichetta) {
    annuncia(`installo     ${etichetta}`)
    try {
        const esito = adb('install', '-r', apk)
        esigi(/Success/.test(esito), `installazione non riuscita: ${esito.trim()}`)
    } catch (problema) {
        const testo = String(problema.stdout ?? '') + String(problema.stderr ?? '')
        process.stderr.write(`⛔ installazione non riuscita: ${testo.trim()}\n`)
        process.exit(1)
    }
}
installa(APK_APP, 'app-debug.apk')
installa(APK_TEST, 'app-debug-androidTest.apk')

function azzeraCache() {
    try {
        adb('shell', `run-as ${PACCHETTO} rm -rf '${CARTELLA_CACHE}'`)
    } catch {
        // Niente da azzerare la prima volta — non è un errore.
    }
}

function contaClbin() {
    try {
        const esito = adb('shell', `run-as ${PACCHETTO} sh -c "ls '${CARTELLA_CACHE}' 2>/dev/null | wc -l"`)
        return Number(esito.trim()) || 0
    } catch {
        return 0
    }
}

/**
 * Chiama `am instrument` DIRETTAMENTE — nessun `install` qui dentro. È
 * l'intero punto di questo script rispetto a `run-device-tests.mjs`.
 */
function eseguiFase(nome, argsInstrumentation) {
    adb('logcat', '-c')
    const inizio = Date.now()
    const argomentiAm = ['shell', 'am', 'instrument', '-w', '-r', '-e', 'class', CLASSE_TEST]
    for (const [chiave, valore] of Object.entries(argsInstrumentation)) {
        argomentiAm.push('-e', chiave, String(valore))
    }
    argomentiAm.push(`${PACCHETTO_TEST}/${RUNNER}`)
    let uscita = ''
    try {
        uscita = adb(...argomentiAm)
    } catch (problema) {
        uscita = String(problema.stdout ?? '') + String(problema.stderr ?? '')
    }
    const durataMs = Date.now() - inizio
    const verde = /OK \(\d+ test\)/.test(uscita) && !/FAILURES!!!/.test(uscita)

    const log = adb('logcat', '-d', '-s', 'TalosLlama:*')
    const righeCache = log.split('\n').filter((r) => / ggml_opencl: cache (HIT|MISS|SAVE) /.test(r))
    const hit = righeCache.filter((r) => / HIT /.test(r)).length
    const miss = righeCache.filter((r) => / MISS /.test(r)).length
    const save = righeCache.filter((r) => / SAVE /.test(r)).length

    annuncia(`\n=== ${nome} ===`)
    annuncia(`  esito test    ${verde ? 'verde' : 'NON verde (vedi sopra se serve indagare)'}`)
    annuncia(`  durata        ${durataMs} ms`)
    annuncia(`  trace cache   ${righeCache.length} righe (hit=${hit} miss=${miss} save=${save})`)
    if (righeCache.length === 0) {
        annuncia('  ⛔ nessuna riga di trace cache — o il debug non era acceso per questa fase, '
            + 'o (fase B, misurato) il canale non l\'ha mostrata questa volta. '
            + 'Il conteggio file e la durata restano la prova che conta.')
    }
    return { durataMs, hit, miss, save, righeTrace: righeCache.length, verde }
}

annuncia('\n--- FASE A: cache azzerata a mano, processo pulito ---')
azzeraCache()
const A = eseguiFase('A (cache fredda)',
    { talosModelPath: MODELLO, talosBackend: 'OpenCL', talosGpuLayers: 99, talosCacheDebug: 1 })
const fileDopoA = contaClbin()
annuncia(`  file .clbin sul disco dopo A: ${fileDopoA}`)

annuncia('\n--- FASE B: STESSO test, NESSUNA reinstallazione, cache NON toccata ---')
const B = eseguiFase('B (cache calda, nuovo processo)',
    { talosModelPath: MODELLO, talosBackend: 'OpenCL', talosGpuLayers: 99, talosCacheDebug: 1 })
const fileDopoB = contaClbin()
annuncia(`  file .clbin sul disco dopo B: ${fileDopoB} (invariato rispetto ad A = tutto HIT)`)

annuncia('\n--- FASE C: CONTROLLO — cache azzerata, poi spenta per questo processo ---')
azzeraCache()
const C = eseguiFase('C (cache disattivata)',
    { talosModelPath: MODELLO, talosBackend: 'OpenCL', talosGpuLayers: 99, talosCacheOff: 1 })
const fileDopoC = contaClbin()
annuncia(`  file .clbin sul disco dopo C: ${fileDopoC} (atteso 0: la cache era spenta, nessun save)`)

annuncia('\n=== RIASSUNTO ===')
annuncia(`A→B: durata ${A.durataMs} ms → ${B.durataMs} ms `
    + `(${(A.durataMs / Math.max(B.durataMs, 1)).toFixed(2)}×)`)
annuncia(`file .clbin: A=${fileDopoA}  B=${fileDopoB}  C=${fileDopoC}`)

const problemi = []
if (!A.verde || !B.verde || !C.verde) problemi.push('almeno una fase non è risultata verde')
if (fileDopoB !== fileDopoA) {
    problemi.push(`B ha scritto ${fileDopoB - fileDopoA} file nuovi — non tutto era HIT`)
}
if (fileDopoC !== 0) problemi.push(`C ha scritto ${fileDopoC} file con la cache spenta — non doveva`)
if (B.durataMs >= A.durataMs) {
    problemi.push('B non è stato più veloce di A — la cache calda non ha fatto la differenza attesa')
}

if (problemi.length === 0) {
    annuncia('\n✓ La cache persiste fra processi reali, e senza di lei si ricompila sempre: '
        + 'esattamente il comportamento che P0-1 doveva costruire.')
} else {
    annuncia('\n⛔ Da guardare, non da ignorare:')
    for (const p of problemi) annuncia(`  · ${p}`)
    process.exitCode = 1
}
