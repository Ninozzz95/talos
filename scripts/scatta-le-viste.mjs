#!/usr/bin/env node
/**
 * ⭐ LE VISTE PER IL README — pulite, ripetibili, senza dati di nessuno.
 *
 * Owner 2026-08-15: «dobbiamo mettere screenshot di esempio puliti… fasi
 * dimostrative nel readme».
 *
 * ## ⛔ La regola che governa tutto questo file
 *
 * Uno screenshot di una vetrina pubblica non è una foto del telefono di chi
 * sviluppa: è un'immagine che resta su internet per sempre. Un nome di
 * contatto, un messaggio vero, un titolo di chat sono dati di una persona che
 * non ha acconsentito a niente.
 *
 * ⇒ Quindi: chat NUOVA, domande neutre, e un controllo automatico che rifiuta
 * di salvare un'immagine se sullo schermo compare qualcosa che somiglia a un
 * dato personale.
 *
 * ## Come si usa
 *
 *   node scripts/scatta-le-viste.mjs           tutte le viste
 *   node scripts/scatta-le-viste.mjs --lista   quali sono, senza scattare
 */

import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const QUI = dirname(fileURLToPath(import.meta.url))
const RADICE = resolve(QUI, '..')
const FUORI = resolve(RADICE, 'docs/immagini')

/** ⛔ Lo stesso ritrovamento di `device.mjs`: `adb` si CERCA, non si scrive. */
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
const PACCHETTO = process.env.TALOS_PACKAGE ?? 'ai.talos.dev'

function adb(...args) {
    return execFileSync(ADB, args, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })
}
function dormi(ms) { execFileSync(process.execPath, ['-e', `setTimeout(()=>{}, ${ms})`]) }

/**
 * ⛔⛔ IL FILTRO — l'unica ragione per cui questo script esiste invece di
 * `adb exec-out screencap`.
 *
 * Prima di salvare, si legge cosa c'è a schermo e si cerca qualcosa che
 * somigli a un dato di una persona. Se lo si trova, NON si salva: si dice cosa
 * si è visto e si passa oltre.
 *
 * ⇒ Meglio una vista in meno che il nome di qualcuno su internet per sempre.
 */
const SOSPETTI = [
    { nome: 'un indirizzo email', re: /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i },
    { nome: 'un numero di telefono', re: /(\+\d{2}\s?)?\d{3}[\s.-]?\d{3}[\s.-]?\d{4}/ },
    { nome: 'un indirizzo IP privato', re: /192\.168\.\d+\.\d+|10\.\d+\.\d+\.\d+/ },
    { nome: 'un percorso utente', re: /C:[\/]Users[\/][A-Za-z]+/i },
    /*
     * ⛔⛔ I NOMI DELLE RETI WI-FI — e questa riga nasce da un errore vero.
     *
     * La prima vista scattata per il README era la barra sopra le impostazioni
     * Wi-Fi. Il filtro l'ha lasciata passare, e dentro c'erano:
     *
     *     NOKIA-BEC7        la rete di casa dell'owner
     *     A15 di Carmela    il nome di una PERSONA
     *     TIM-45467925      la rete di un vicino
     *     OnePlus13         il suo telefono
     *
     * ⇒ Le reti visibili non sono dati di chi sviluppa: sono dati dei VICINI,
     * che non sanno nemmeno di comparire in quello screenshot. Un filtro che
     * cerca solo email e IP non li vede, e la vista sarebbe finita su internet.
     */
    {
        nome: 'un nome di rete Wi-Fi',
        /*
         * ⛔ `` all'inizio, e non è pignoleria: senza, «TIM» matcha dentro
         * «ottimizzazione» e «settimanali». MISURATO — il filtro ha rifiutato
         * due viste pulite dicendo di aver trovato «timisation» e «timediali».
         *
         * ⇒ Un filtro che blocca tutto è inutile quanto uno che non blocca
         * niente: smette di essere letto, e la prima volta che serve davvero
         * qualcuno lo disattiva.
         */
        re: /(TIM|WINDTRE|VODAFONE|FASTWEB|ILIAD|TISCALI|NOKIA|TP-Link|FRITZ|Linksys|NETGEAR|OnePlus|Galaxy|iPhone|Redmi|HUAWEI)[-_ ]?[A-Z0-9]{2,}/,
    },
    {
        // «A15 di Carmela», «iPhone di Marco»: il nome di una persona dentro un
        // SSID. Chi lo ha scelto non sapeva che sarebbe finito in una vetrina.
        nome: 'una rete col nome di una persona',
        re: / di [A-Z][a-z]{2,}/,
    },
]

function schermoPulito() {
    let xml = ''
    try {
        adb('shell', 'uiautomator', 'dump', '/sdcard/vista.xml')
        xml = adb('shell', 'cat', '/sdcard/vista.xml')
    } catch {
        // Senza dump non si può giudicare. ⛔ Non si assume che vada bene:
        // si dice che non si è potuto guardare.
        return { pulito: false, perche: 'non ho potuto leggere lo schermo' }
    }
    for (const s of SOSPETTI) {
        const m = xml.match(s.re)
        if (m) return { pulito: false, perche: `${s.nome}: ${m[0].slice(0, 24)}…` }
    }
    return { pulito: true }
}

function scatta(nome) {
    const controllo = schermoPulito()
    if (!controllo.pulito) {
        console.log(`  ⛔ ${nome}: NON salvata — ${controllo.perche}`)
        return false
    }
    const dati = execFileSync(ADB, ['exec-out', 'screencap', '-p'], { maxBuffer: 64 * 1024 * 1024 })
    mkdirSync(FUORI, { recursive: true })
    writeFileSync(resolve(FUORI, `${nome}.png`), dati)
    console.log(`  ✓ ${nome}.png  ${(dati.length / 1024).toFixed(0)} KB`)
    return true
}

/**
 * Le viste, in ordine di racconto. ⛔ Non «tutte le schermate»: le quattro che
 * spiegano TALOS a chi non lo conosce, nell'ordine in cui una persona lo scopre.
 */
const VISTE = [
    {
        nome: '1-la-barra',
        cosa: "la barra dell'assistente, sopra qualunque app",
        fai: () => {
            adb('shell', 'input', 'keyevent', 'KEYCODE_HOME')
            dormi(1500)
            adb('shell', 'am', 'start', '-n', `${PACCHETTO}/ai.talos.TalosBarraActivity`)
            dormi(5000)
        },
    },
    {
        nome: '2-la-risposta',
        cosa: 'una risposta con la sua scheda',
        fai: () => {
            // ⛔ Una domanda NEUTRA: niente contatti, niente luoghi, niente
            // agenda. Quello che si vede deve poter stare su internet.
            digita('quanto è alta la torre Eiffel')
            dormi(14000)
        },
    },
    {
        nome: '3-i-permessi',
        cosa: 'la pagina dei permessi: cosa TALOS può fare e perché',
        fai: () => {
            adb('shell', 'input', 'keyevent', 'KEYCODE_HOME')
            dormi(1200)
            adb('shell', 'monkey', '-p', PACCHETTO, '-c', 'android.intent.category.LAUNCHER', '1')
            dormi(12000)
        },
    },
    {
        nome: '4-il-telefono',
        cosa: 'il controllo del telefono, con lo stato vero di ogni capacità',
        fai: () => { dormi(2000) },
    },
]

function digita(testo) {
    let xml = ''
    try {
        adb('shell', 'uiautomator', 'dump', '/sdcard/vista.xml')
        xml = adb('shell', 'cat', '/sdcard/vista.xml')
    } catch { return }
    const m = xml.match(/<node[^>]*(?:text|content-desc)="Allega"[^>]*bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"/)
    if (!m) { console.log('     (pillola non trovata: salto la digitazione)'); return }
    const y = Math.round((Number(m[2]) + Number(m[4])) / 2)
    adb('shell', 'input', 'tap', '300', String(y))
    dormi(2500)
    adb('shell', 'input', 'text', testo.replace(/ /g, '%s'))
    dormi(1500)
    adb('shell', 'input', 'keyevent', 'KEYCODE_ENTER')
}

if (process.argv.includes('--lista')) {
    console.log('Le viste che questo script scatta:\n')
    for (const v of VISTE) console.log(`  ${v.nome.padEnd(18)} ${v.cosa}`)
    console.log('\n⛔ Ognuna passa dal filtro: se a schermo c\'è una email, un numero,')
    console.log('   un IP privato o un percorso utente, l\'immagine NON viene salvata.')
    process.exit(0)
}

try {
    adb('shell', 'echo', 'ok')
} catch {
    console.error('⛔ Nessun telefono collegato. `adb devices` deve elencarne uno.')
    process.exit(1)
}

console.log(`Scatto ${VISTE.length} viste in docs/immagini/\n`)
let fatte = 0
for (const v of VISTE) {
    console.log(`→ ${v.cosa}`)
    v.fai()
    if (scatta(v.nome)) fatte++
}
console.log(`\n${fatte}/${VISTE.length} salvate.`)
if (fatte < VISTE.length) {
    console.log('⛔ Quelle rifiutate avevano un dato personale a schermo: sistema il')
    console.log('   telefono (chat nuova, niente notifiche) e rilancia.')
}
