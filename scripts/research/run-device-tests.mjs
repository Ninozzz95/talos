/**
 * I test strumentati SENZA disinstallare l'app — e senza perdere le prove.
 *
 * ⛔⛔ IL DIFETTO CHE QUESTO SCRIPT CHIUDE, e che è costato caro.
 *
 * MISURATO il 2026-08-20 sul Pad. `./gradlew connectedDebugAndroidTest` è
 * andato verde — «Starting 2 tests on OPD2415», «Finished 2 tests» — e subito
 * dopo sul telefono non c'era più niente:
 *
 *     pm path ai.talos                 → vuoto
 *     ls /data/data/ai.talos           → No such file or directory
 *     find /storage/emulated/0 *.gguf  → nessun risultato
 *
 * Non è un guasto: è il comportamento documentato del plugin Android di
 * Gradle. `connectedAndroidTest` **installa** l'APK dell'app e quello dei test,
 * esegue, e alla fine **li disinstalla entrambi**. Con l'app se ne va la sua
 * cartella privata — cioè i dati, le chiavi e i GGUF che ci stavano dentro.
 *
 * ⇒ Due conseguenze, e nessuna delle due è opzionale:
 *
 *  1. **Un artifact scritto in `getExternalFilesDir()` non sopravvive alla
 *     corsa che lo produce.** Il test passa, il file viene scritto davvero, e
 *     poi sparisce con la disinstallazione. È la forma peggiore di prova
 *     perduta: quella che lascia un verde alle spalle.
 *  2. **Il telefono di una persona non è un emulatore.** Sul Pad c'era l'app
 *     di produzione con i suoi dati e i suoi modelli, e un task di test l'ha
 *     rimossa senza che nessuno l'avesse chiesto.
 *
 * Qui si fa la stessa cosa a mano, con i due passi che Gradle nasconde e senza
 * il terzo: si installa, si esegue con `am instrument`, si portano via gli
 * artifact, e **non si disinstalla mai niente**.
 *
 * ## Uso
 *
 *     node scripts/research/run-device-tests.mjs ai.talos.TalosBackendQualificationDeviceTest
 *     node scripts/research/run-device-tests.mjs            # tutti i test strumentati
 *
 * Variabili: `TALOS_ADB`, `TALOS_PACKAGE` (default `ai.talos`),
 * `TALOS_ARTIFACT_DIR` (default `.tmp-research/local-backend`).
 *
 * ⛔ Gli APK devono già esistere. Li costruisce Gradle, e costruirli NON
 * installa niente:
 *
 *     ./gradlew :app:assembleDebug :app:assembleDebugAndroidTest
 */

import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, rmSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const QUI = dirname(fileURLToPath(import.meta.url))
const MOBILE = resolve(QUI, '..', '..')

/**
 * ⛔ Il percorso di `adb` non si scrive: si trova. Stessa regola, stessa
 * scaletta di `scripts/device.mjs` — una riga con l'SDK di chi ha scritto lo
 * script funziona su un computer solo al mondo.
 */
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

const APK_APP = resolve(MOBILE, 'android/app/build/outputs/apk/debug/app-debug.apk')
const APK_TEST = resolve(
    MOBILE, 'android/app/build/outputs/apk/androidTest/debug/app-debug-androidTest.apk')

/** Dove il test scrive sul telefono. Deve combaciare col test. */
const ARTIFACT_SU_DISPOSITIVO =
    `/storage/emulated/0/Android/data/${PACCHETTO}/files/research/local-backend`

const ARTIFACT_HOST = resolve(
    MOBILE, process.env.TALOS_ARTIFACT_DIR ?? '.tmp-research/local-backend')

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

/*
 * ⛔ `--fresh` — perche' `runs.jsonl` vive sul TELEFONO e si accumula.
 *
 * Ogni corsa scrive in coda al file dell'app. Due campagne a ore diverse
 * finiscono nello stesso insieme, e la dispersione che ne esce non descrive
 * nessuna delle due: descrive la differenza fra loro. MISURATO il 2026-08-20,
 * dove un insieme «STOP-decode» conteneva 12 giri di tre esperimenti diversi.
 *
 * ⛔ NON e' il predefinito. Cancellare misure e' un'azione distruttiva, e una
 * corsa che le butta senza che nessuno l'abbia chiesto e' peggio di un file
 * disordinato: il disordine si vede, le misure perdute no.
 */
const fresco = process.argv.includes('--fresh')
const classe = (process.argv[2] ?? '').startsWith('--') ? '' : (process.argv[2] ?? '')

esigi(existsSync(APK_APP),
    `APK dell'app assente: ${APK_APP}\n`
    + '   Costruiscilo con:  ./gradlew :app:assembleDebug :app:assembleDebugAndroidTest')
esigi(existsSync(APK_TEST),
    `APK dei test assente: ${APK_TEST}\n`
    + '   Costruiscilo con:  ./gradlew :app:assembleDebugAndroidTest')

const collegati = adb('devices').split('\n').filter((riga) => /\tdevice$/.test(riga.trim()))
esigi(collegati.length > 0, 'nessun dispositivo collegato — `adb devices` non ne elenca nessuno')

annuncia(`dispositivo   ${collegati[0].split('\t')[0]}`)
annuncia(`pacchetto     ${PACCHETTO}`)

/**
 * ⛔ `-r`, non una disinstallazione preventiva.
 *
 * `-r` sostituisce l'app TENENDO i suoi dati. Disinstallare prima sarebbe più
 * semplice e cancellerebbe esattamente ciò che questo script esiste per non
 * cancellare.
 *
 * ⛔ Se la firma non combacia — un debug sopra un rilascio — l'installazione
 * fallisce con INSTALL_FAILED_UPDATE_INCOMPATIBLE. È l'esito GIUSTO: la cura
 * non è disinstallare di nascosto, è che qualcuno decida.
 *
 * ⛔⛔ P0-1, MISURATO il 2026-08-22: "i suoi dati" NON include `code_cache`.
 * Due corse consecutive di QUESTO script, stesso modello, stesso backend,
 * hanno riscritto ENTRAMBE 174-175 kernel OpenCL su 175, come se la cache
 * fosse sempre fredda — nonostante i `.clbin` della prima corsa fossero
 * ancora fisicamente sul disco quando la seconda è partita (verificato con
 * `ls` fra le due). Causa: OGNI corsa di questo script fa `install -r`
 * dell'APK **prima** di eseguire, e su Android questo BASTA a svuotare
 * `code_cache` — la stessa cartella che la documentazione descrive come
 * "ripulita quando l'app si aggiorna", e un reinstall bit-identico conta
 * comunque come aggiornamento agli occhi del gestore pacchetti per quella
 * cartella specifica. Chiamare `am instrument` DIRETTAMENTE (bypassando
 * questo script, niente install in mezzo) sullo stesso APK già installato
 * ha invece impiegato 9,8 s contro 44,7-55,6 s — la prova che la cache
 * persiste DAVVERO fra riavvii di processo REALI (il caso dell'utente, che
 * non reinstalla l'app ad ogni avvio). ⇒ Questo script misura fedelmente
 * tutto il resto, ma NON è lo strumento giusto per misurare la persistenza
 * della cache OpenCL fra due corse: quella richiede due `am instrument`
 * senza reinstallazione in mezzo.
 */
function installa(apk, etichetta) {
    annuncia(`installo     ${etichetta}`)
    try {
        const esito = adb('install', '-r', apk)
        if (!/Success/.test(esito)) {
            process.stderr.write(`⛔ installazione non riuscita: ${esito.trim()}\n`)
            process.exit(1)
        }
    } catch (problema) {
        const testo = String(problema.stdout ?? '') + String(problema.stderr ?? '')
        process.stderr.write(`⛔ installazione non riuscita: ${testo.trim()}\n`)
        if (/UPDATE_INCOMPATIBLE|签名|signatures/i.test(testo)) {
            process.stderr.write(
                '   La firma non combacia con l\'app già installata.\n'
                + '   ⛔ NON disinstallare per aggirare: con l\'app se ne vanno i suoi dati\n'
                + '      e i suoi modelli. Chiedi prima.\n')
        }
        process.exit(1)
    }
}

installa(APK_APP, 'app-debug.apk')
installa(APK_TEST, 'app-debug-androidTest.apk')

// ⛔ `-r` non è verbosità: senza, i test SALTATI non si distinguono dai
// passati. È il codice `-4` per riga di stato a dirlo, e senza `-r` quelle
// righe non escono affatto.
const argomenti = ['shell', 'am', 'instrument', '-w', '-r']
if (classe) argomenti.push('-e', 'class', classe)
// Gli argomenti instrumentation in coda: `chiave=valore`, uno per coppia.
// Servono a dire al test su quale modello misurare senza ricompilarlo.
for (const coppia of process.argv.slice(3).filter((a) => !a.startsWith('--'))) {
    const taglio = coppia.indexOf('=')
    esigi(taglio > 0, `argomento non nella forma chiave=valore: ${coppia}`)
    argomenti.push('-e', coppia.slice(0, taglio), coppia.slice(taglio + 1))
}
argomenti.push(`${PACCHETTO_TEST}/${RUNNER}`)

/*
 * ⛔ E si SCRIVONO, gli argomenti — perche' un log senza di essi non dice piu'
 * su cosa e' stata presa la misura.
 *
 * MISURATO il 2026-08-20, a mie spese: per sapere con quale microbatch era
 * stata presa una campagna di tre ore prima ho dovuto risalire al CMakeCache e
 * ai campi dentro `runs.jsonl`, perche' il log della corsa non li nominava.
 * `runs.jsonl` porta gia' l'etichetta di ogni riga; questo serve al log, che e'
 * la prima cosa che si riapre.
 */
const argomentiPassati = process.argv.slice(3).filter((a) => !a.startsWith('--'))
annuncia(`argomenti    ${argomentiPassati.length
    ? argomentiPassati.join(' ')
    : '(nessuno — tutti i predefiniti del test)'}`)

if (fresco) {
    annuncia(`azzero       ${ARTIFACT_SU_DISPOSITIVO}`)
    try {
        adb('shell', `rm -rf '${ARTIFACT_SU_DISPOSITIVO}'`)
    } catch (problema) {
        process.stderr.write(`   (niente da azzerare: ${String(problema.stderr ?? '').trim()})
`)
    }
}

annuncia(`eseguo       ${classe || '(tutti i test strumentati)'}`)
let uscita = ''
try {
    uscita = adb(...argomenti)
} catch (problema) {
    uscita = String(problema.stdout ?? '') + String(problema.stderr ?? '')
}
process.stdout.write(uscita)

/**
 * ⛔ Gli artifact si portano via SUBITO, e comunque vada.
 *
 * Anche se i test sono rossi: un test rosso che ha lasciato un inventario è
 * più utile di uno verde che non ha lasciato niente, e la cartella su cui
 * poggiano vive quanto l'installazione dell'app.
 */
/*
 * ⛔⛔ CON `--fresh` SI AZZERA ANCHE LA COPIA SU QUESTO COMPUTER, e la ragione
 * e' un guasto vero, non simmetria.
 *
 * MISURATO il 2026-08-20, due volte. Una corsa fallisce — percorso storto,
 * bersaglio assente, qualunque cosa — il runner lo dice e esce con codice 1,
 * ma sul disco resta il `runs.jsonl` della campagna PRECEDENTE. Uno script di
 * campagna che legge quel file subito dopo stampa numeri plausibili che non
 * appartengono a niente: la prima volta e' costata una tabella in cui Vulkan
 * risultava identico a OpenCL fino al secondo decimale.
 *
 * ⇒ Azzerare qui rende il guasto RUMOROSO: dopo una corsa fallita non c'e'
 * niente da leggere, e chi prova a leggerlo prende un errore invece di una
 * bugia. ⛔ Solo con `--fresh`, che gia' significa «parto pulito»: senza, le
 * misure non si toccano.
 */
if (fresco && existsSync(ARTIFACT_HOST)) {
    annuncia(`azzero       ${ARTIFACT_HOST}`)
    rmSync(ARTIFACT_HOST, { recursive: true, force: true })
}
mkdirSync(ARTIFACT_HOST, { recursive: true })
annuncia(`artifact →   ${ARTIFACT_HOST}`)
try {
    // Il punto finale dice ad adb «il CONTENUTO della cartella», non la
    // cartella dentro la cartella.
    process.stdout.write(adb('pull', `${ARTIFACT_SU_DISPOSITIVO}/.`, ARTIFACT_HOST))
} catch (problema) {
    process.stderr.write(
        `   (nessun artifact da portare via: ${String(problema.stderr ?? '').trim()})\n`)
}

// ⛔ E qui NON si disinstalla. È l'unica riga che conta di questo script, ed è
// quella che non c'è.

/**
 * ⛔⛔ UN TEST SALTATO NON È UN TEST VERDE.
 *
 * MISURATO il 2026-08-20, e questo script ci è cascato per primo: otto test
 * hanno riportato «OK (8 tests)» in **0,037 secondi** — otto aperture di un
 * modello da 1,9 GB. Erano tutti saltati da un `Assume` perché la fixture non
 * si vedeva, e il runner testuale di JUnit conta un `assumption failure` come
 * OK. Lo script diceva «verdi 8 test» e non era vero niente.
 *
 * ⇒ I saltati si contano, si nominano, e **non** si spacciano per verdi.
 * `am instrument -r` li marca con `INSTRUMENTATION_STATUS_CODE: -4`.
 */
const saltati = (uscita.match(/INSTRUMENTATION_STATUS_CODE: -4/g) ?? []).length
const passati = /OK \((\d+) test/.exec(uscita)
const falliti = /FAILURES!!!|Failures: (\d+)/.test(uscita)
if (falliti || !passati) {
    process.stderr.write('⛔ i test strumentati non sono verdi — vedi sopra\n')
    process.exit(1)
}
const totale = Number(passati[1])
if (saltati > 0) {
    const motivi = [...uscita.matchAll(/AssumptionViolatedException: (.+)/g)]
        .map((m) => m[1].trim())
    process.stderr.write(
        `⛔ ${saltati} test su ${totale} SALTATI — non è un verde:\n`
        + motivi.map((m) => `   · ${m}\n`).join(''))
    process.exit(1)
}
annuncia(`verdi        ${totale} test`)
