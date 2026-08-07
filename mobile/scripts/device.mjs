#!/usr/bin/env node
/**
 * Il telecomando del Pad: CDP trova, adb tocca.
 *
 * ## Il problema che risolve, contato
 *
 * Provare TALOS sul dispositivo significa `adb shell input tap X Y`, e le
 * coordinate le ricavavo a occhio da una schermata. In una sola sessione ho
 * sbagliato mira sei volte, e ogni cambio di layout invalidava tutte le
 * coordinate scritte prima.
 *
 * ## Perché CDP per CERCARE e adb per TOCCARE
 *
 * ⛔ La regola dell'owner è netta: **i tocchi devono essere reali, via adb**.
 * Non è pignoleria — è misurato: `element.click()` via CDP **non seleziona** su
 * reka-ui, che ascolta `pointerdown`. Un clic sintetico verificherebbe qualcosa
 * che l'utente non farebbe mai.
 *
 * Ma il divieto riguarda l'**atto**, non la **vista**. Leggere il DOM per sapere
 * dove sta un bottone è l'equivalente di guardare lo schermo, e lo fa meglio del
 * mio occhio. Quindi: **CDP trova, adb tocca.**
 *
 * ## L'attesa è AUTOMATICA, non a tempo
 *
 * Le attese fisse (`sleep 3`) hanno fallito tre volte in un pomeriggio: a volte
 * l'app ci mette di più e il tocco parte nel vuoto, e la prova sembra fallita
 * per un motivo che non c'entra. Qui si riprova finché l'elemento non è
 * **azionabile**, e quando scade il tempo si dice *perché* non lo era — che è
 * l'unica informazione utile.
 *
 * I cinque controlli e la modalità stretta vivono in `deviceLocator.mjs`.
 *
 * ## Uso
 *
 *   node scripts/device.mjs find                     elenca cosa è visibile
 *   node scripts/device.mjs tap "Nuova"              tocco REALE via adb
 *   node scripts/device.mjs tap --sel "[data-testid=x]"
 *   node scripts/device.mjs tap --nth 1 "Consenti"   quando l'ambiguità è voluta
 *   node scripts/device.mjs fill --sel "textarea" "ciao mondo"
 *   node scripts/device.mjs type "ciao mondo"        scrive nel campo già attivo
 *   node scripts/device.mjs shot nome
 */

import { execFileSync } from 'node:child_process'
import { existsSync, openSync } from 'node:fs'
import { LOCALIZZA, spiega } from './deviceLocator.mjs'

const ADB = process.env.TALOS_ADB
    ?? 'C:/Users/Antonino/AppData/Local/Android/Sdk/platform-tools/adb.exe'
const PACCHETTO = process.env.TALOS_PACKAGE ?? 'ai.talos.dev'
const PORTA = Number(process.env.TALOS_CDP_PORT ?? 9333)
/** Quanto si aspetta che una cosa diventi azionabile, come fa Playwright. */
const ATTESA_MS = Number(process.env.TALOS_TIMEOUT_MS ?? 15_000)

function adb(...args) {
    return execFileSync(ADB, args, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })
}

/**
 * Apre il ponte verso il WebView dell'app.
 *
 * Il socket porta il PID nel nome, quindi va ricalcolato a ogni avvio: un
 * inoltro rimasto da un'esecuzione precedente punterebbe a un processo morto e
 * risponderebbe con un silenzio che sembra un guasto di rete.
 */
function apriPonte() {
    const pid = adb('shell', 'pidof', PACCHETTO).trim()
    if (!pid) throw new Error(`${PACCHETTO} non è in esecuzione sul dispositivo.`)
    adb('forward', `tcp:${PORTA}`, `localabstract:webview_devtools_remote_${pid}`)
}

async function paginaWebSocket() {
    const risposta = await fetch(`http://127.0.0.1:${PORTA}/json`)
    const pagine = await risposta.json()
    const pagina = pagine.find((riga) => riga.type === 'page')
    if (!pagina) throw new Error('Il WebView non espone nessuna pagina.')
    return pagina.webSocketDebuggerUrl
}

/** Una valutazione dentro la pagina. Il socket si apre e si chiude ogni volta. */
async function valuta(espressione) {
    apriPonte()
    const url = await paginaWebSocket()
    const socket = new WebSocket(url)
    return new Promise((risolvi, rifiuta) => {
        const scadenza = setTimeout(() => {
            socket.close()
            rifiuta(new Error('Il WebView non ha risposto entro dieci secondi.'))
        }, 10_000)
        socket.addEventListener('open', () => {
            socket.send(JSON.stringify({
                id: 1,
                method: 'Runtime.evaluate',
                params: { expression: espressione, returnByValue: true, awaitPromise: true },
            }))
        })
        socket.addEventListener('message', (evento) => {
            const dato = JSON.parse(String(evento.data))
            if (dato.id !== 1) return
            clearTimeout(scadenza)
            socket.close()
            if (dato.result?.exceptionDetails) {
                rifiuta(new Error(dato.result.exceptionDetails.text ?? 'errore nella pagina'))
                return
            }
            risolvi(dato.result?.result?.value)
        })
        socket.addEventListener('error', (errore) => {
            clearTimeout(scadenza)
            rifiuta(new Error(`ponte CDP non raggiungibile: ${errore.message ?? errore}`))
        })
    })
}

/**
 * Riprova finché l'elemento non è azionabile.
 *
 * ⛔ Un'**ambiguità** non si riprova: non passerà col tempo, e insistere
 * nasconderebbe l'unica cosa che chi legge deve sapere.
 */
async function attendiAzionabile(criterio) {
    const scade = Date.now() + ATTESA_MS
    let ultimo = null
    for (;;) {
        ultimo = await valuta(LOCALIZZA(criterio))
        if (ultimo?.esito === 'pronto') return ultimo
        if (ultimo?.esito === 'ambiguo') break
        if (Date.now() > scade) break
        await new Promise((r) => setTimeout(r, 250))
    }
    const errore = new Error(spiega(ultimo, criterio))
    errore.risultato = ultimo
    throw errore
}

const ELENCA = `
(() => {
    const rapporto = window.devicePixelRatio || 1
    return [...document.querySelectorAll(
        'button, a, [role=button], [role=option], [role=tab], input, textarea, [contenteditable="true"], [data-testid]'
    )]
        .map((elemento) => {
            const r = elemento.getBoundingClientRect()
            if (r.width <= 0 || r.height <= 0) return null
            const stile = getComputedStyle(elemento)
            if (stile.visibility === 'hidden' || stile.display === 'none') return null
            const etichetta = (elemento.getAttribute('aria-label') || elemento.innerText
                || elemento.value || elemento.getAttribute('placeholder') || '')
                .trim().replace(/\\s+/g, ' ').slice(0, 48)
            return {
                etichetta,
                testid: elemento.getAttribute('data-testid') || '',
                x: Math.round((r.left + r.width / 2) * rapporto),
                y: Math.round((r.top + r.height / 2) * rapporto),
            }
        })
        .filter(Boolean)
})()`

function leggiCriterio(parole) {
    const criterio = {}
    const testo = []
    for (let indice = 0; indice < parole.length; indice += 1) {
        if (parole[indice] === '--sel') { criterio.selettore = parole[++indice]; continue }
        if (parole[indice] === '--nth') { criterio.indice = Number(parole[++indice]); continue }
        testo.push(parole[indice])
    }
    if (!criterio.selettore) criterio.testo = testo.join(' ')
    return criterio
}

async function principale() {
    const [comando, ...resto] = process.argv.slice(2)
    if (!existsSync(ADB)) throw new Error(`adb non trovato in ${ADB}`)

    if (comando === 'find') {
        const righe = await valuta(ELENCA)
        for (const riga of righe ?? []) {
            console.log(`${String(riga.x).padStart(5)},${String(riga.y).padStart(5)}  `
                + `${riga.testid ? `[${riga.testid}] ` : ''}${riga.etichetta}`)
        }
        console.log(`\n${(righe ?? []).length} elementi visibili.`)
        return
    }

    if (comando === 'tap' || comando === 'fill') {
        const perScrivere = comando === 'fill'
        // In `fill` l'ultima parola è il testo da scrivere, non il bersaglio.
        const argomenti = perScrivere ? resto.slice(0, -1) : resto
        const criterio = { ...leggiCriterio(argomenti), perScrivere }
        const punto = await attendiAzionabile(criterio)
        // ⛔ Il tocco è VERO: adb, non CDP. Vedi la nota in testa al file.
        adb('shell', 'input', 'tap', String(punto.x), String(punto.y))
        console.log(`toccato ${punto.x},${punto.y} — «${punto.etichetta}»`)
        if (perScrivere) {
            const testo = resto[resto.length - 1] ?? ''
            await new Promise((r) => setTimeout(r, 400))
            adb('shell', 'input', 'text', testo.replace(/ /g, '%s'))
            console.log(`scritto: ${testo}`)
        }
        return
    }

    if (comando === 'type') {
        // Gli spazi in `input text` vanno come %s: senza, la frase arriva
        // troncata alla prima parola e la prova sembra fallita per altro.
        adb('shell', 'input', 'text', resto.join(' ').replace(/ /g, '%s'))
        console.log('scritto')
        return
    }

    if (comando === 'shot') {
        const nome = resto[0] ?? 'schermata'
        const cartella = process.env.TALOS_SHOTS ?? '.'
        const percorso = `${cartella}/${nome}.png`
        execFileSync(ADB, ['exec-out', 'screencap', '-p'], {
            maxBuffer: 256 * 1024 * 1024,
            stdio: ['ignore', openSync(percorso, 'w'), 'inherit'],
        })
        console.log(percorso)
        return
    }

    console.log(`Uso:
  node scripts/device.mjs find                    elenca cosa è visibile, con le coordinate
  node scripts/device.mjs tap "Nuova"             tocco REALE via adb, con i cinque controlli
  node scripts/device.mjs tap --sel "[data-testid=x]"
  node scripts/device.mjs tap --nth 1 "Consenti"  quando l'ambiguità è voluta
  node scripts/device.mjs fill --sel "textarea" "ciao mondo"
  node scripts/device.mjs type "ciao mondo"       scrive nel campo già attivo
  node scripts/device.mjs shot nome`)
}

principale().catch((errore) => {
    console.error(String(errore.message ?? errore))
    process.exit(1)
})
