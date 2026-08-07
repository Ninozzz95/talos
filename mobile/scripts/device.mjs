#!/usr/bin/env node
/**
 * Il telecomando del Pad: mira per TESTO, tocca per davvero.
 *
 * ## Il problema che risolve, contato
 *
 * Provare TALOS sul dispositivo significa `adb shell input tap X Y`, e le
 * coordinate le ricavavo a occhio da una schermata. In una sola sessione ho
 * sbagliato mira sei volte: un tocco finito sul chip delle fonti invece che sul
 * compositore, uno su «Nuova» mancato di duecento pixel, un `keyevent 111` letto
 * come «indietro» che ha chiuso le impostazioni a metà prova. Ogni cambio di
 * layout invalida ogni coordinata che ho scritto prima.
 *
 * ## Perché CDP per CERCARE e adb per TOCCARE
 *
 * ⛔ La regola dell'owner e' netta: **i tocchi devono essere reali, via adb**.
 * Non e' pignoleria — e' misurato: `element.click()` via CDP **non seleziona**
 * su reka-ui, che ascolta `pointerdown`. Un clic sintetico verifica qualcosa che
 * l'utente non farebbe mai.
 *
 * Ma il divieto riguarda l'ATTO, non la vista. Leggere il DOM per sapere DOVE
 * sta un bottone e' l'equivalente di guardare lo schermo, e lo fa meglio del mio
 * occhio: restituisce il rettangolo esatto, in pixel del dispositivo.
 *
 * Quindi: **CDP trova, adb tocca.** L'occhio diventa preciso, il dito resta vero.
 *
 * ## Uso
 *
 *   node scripts/device.mjs find                    elenca cosa e' toccabile
 *   node scripts/device.mjs tap "Nuova"             tocca per testo
 *   node scripts/device.mjs tap --sel "[data-testid=talos-plan-approve]"
 *   node scripts/device.mjs type "ciao mondo"       scrive nel campo attivo
 *   node scripts/device.mjs shot nome               schermata nello scratchpad
 */

import { execFileSync } from 'node:child_process'
import { existsSync, openSync } from 'node:fs'

const ADB = process.env.TALOS_ADB
    ?? 'C:/Users/Antonino/AppData/Local/Android/Sdk/platform-tools/adb.exe'
const PACCHETTO = process.env.TALOS_PACKAGE ?? 'ai.talos.dev'
const PORTA = Number(process.env.TALOS_CDP_PORT ?? 9333)

function adb(...args) {
    return execFileSync(ADB, args, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })
}

/**
 * Apre il ponte verso il WebView dell'app.
 *
 * Il socket porta il PID nel nome, quindi va ricalcolato a ogni avvio: un
 * inoltro rimasto da un'esecuzione precedente punterebbe a un processo morto e
 * risponderebbe con un silenzio che sembra un guasto della rete.
 */
function apriPonte() {
    const pid = adb('shell', 'pidof', PACCHETTO).trim()
    if (!pid) throw new Error(`${PACCHETTO} non e' in esecuzione sul dispositivo.`)
    adb('forward', `tcp:${PORTA}`, `localabstract:webview_devtools_remote_${pid}`)
}

async function paginaWebSocket() {
    const risposta = await fetch(`http://127.0.0.1:${PORTA}/json`)
    const pagine = await risposta.json()
    const pagina = pagine.find((riga) => riga.type === 'page')
    if (!pagina) throw new Error('Il WebView non espone nessuna pagina.')
    return pagina.webSocketDebuggerUrl
}

/** Una sola valutazione JavaScript dentro la pagina, e poi si chiude. */
async function valuta(espressione) {
    apriPonte()
    const url = await paginaWebSocket()
    const { WebSocket } = await import('ws').catch(() => ({ WebSocket: globalThis.WebSocket }))
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
 * Il rettangolo di un elemento, in pixel del DISPOSITIVO.
 *
 * `getBoundingClientRect` parla in pixel CSS; il dito vive in pixel fisici. Il
 * fattore e' `devicePixelRatio`, e sbagliarlo significa toccare un terzo piu' in
 * alto — che e' esattamente il genere di errore che questo script esiste per
 * eliminare.
 */
const TROVA = (criterio) => `
(() => {
    const criterio = ${JSON.stringify(criterio)}
    const rapporto = window.devicePixelRatio || 1
    const visibile = (elemento) => {
        const r = elemento.getBoundingClientRect()
        if (r.width < 4 || r.height < 4) return false
        const stile = getComputedStyle(elemento)
        return stile.visibility !== 'hidden' && stile.display !== 'none' && Number(stile.opacity) > 0.05
    }
    const candidati = criterio.selettore
        ? [...document.querySelectorAll(criterio.selettore)]
        : [...document.querySelectorAll('button, a, [role=button], [role=option], [role=tab], input, textarea, [data-testid]')]
    const cercato = (criterio.testo || '').trim().toLowerCase()
    const corrisponde = (elemento) => {
        if (!cercato) return true
        const suo = (elemento.innerText || elemento.value || elemento.getAttribute('aria-label') || '')
            .trim().toLowerCase()
        return suo.includes(cercato)
    }
    const trovati = candidati.filter((elemento) => visibile(elemento) && corrisponde(elemento))
    // Il PIU' PICCOLO fra quelli che corrispondono: un testo cercato dentro una
    // scheda intera troverebbe anche la scheda, e toccarne il centro cadrebbe
    // altrove. Il piu' piccolo e' quasi sempre il comando vero.
    trovati.sort((a, b) => {
        const ra = a.getBoundingClientRect(), rb = b.getBoundingClientRect()
        return (ra.width * ra.height) - (rb.width * rb.height)
    })
    const scelto = trovati[0]
    if (!scelto) return null
    const r = scelto.getBoundingClientRect()
    return {
        x: Math.round((r.left + r.width / 2) * rapporto),
        y: Math.round((r.top + r.height / 2) * rapporto),
        etichetta: (scelto.innerText || scelto.getAttribute('aria-label') || scelto.tagName).trim().slice(0, 60),
        quanti: trovati.length,
    }
})()`

const ELENCA = `
(() => {
    const rapporto = window.devicePixelRatio || 1
    return [...document.querySelectorAll('button, a, [role=button], [role=option], [data-testid]')]
        .map((elemento) => {
            const r = elemento.getBoundingClientRect()
            if (r.width < 4 || r.height < 4) return null
            const stile = getComputedStyle(elemento)
            if (stile.visibility === 'hidden' || stile.display === 'none') return null
            return {
                testo: (elemento.innerText || elemento.getAttribute('aria-label') || '').trim().slice(0, 48),
                testid: elemento.getAttribute('data-testid') || '',
                x: Math.round((r.left + r.width / 2) * rapporto),
                y: Math.round((r.top + r.height / 2) * rapporto),
            }
        })
        .filter(Boolean)
})()`

async function principale() {
    const [comando, ...resto] = process.argv.slice(2)
    if (!existsSync(ADB)) throw new Error(`adb non trovato in ${ADB}`)

    if (comando === 'find') {
        const righe = await valuta(ELENCA)
        for (const riga of righe ?? []) {
            console.log(`${String(riga.x).padStart(5)},${String(riga.y).padStart(5)}  ${riga.testid ? `[${riga.testid}] ` : ''}${riga.testo}`)
        }
        console.log(`\n${(righe ?? []).length} elementi toccabili.`)
        return
    }

    if (comando === 'tap') {
        const criterio = resto[0] === '--sel'
            ? { selettore: resto.slice(1).join(' ') }
            : { testo: resto.join(' ') }
        const punto = await valuta(TROVA(criterio))
        if (!punto) {
            console.error(`Non trovo niente che corrisponda a ${JSON.stringify(criterio)}.`)
            console.error('Prova `node scripts/device.mjs find` per vedere cosa c\'e\'.')
            process.exit(2)
        }
        // ⛔ Il tocco e' VERO: adb, non CDP. Vedi la nota in testa al file.
        adb('shell', 'input', 'tap', String(punto.x), String(punto.y))
        const avviso = punto.quanti > 1 ? `  (${punto.quanti} corrispondenze, preso il piu' piccolo)` : ''
        console.log(`toccato ${punto.x},${punto.y} — «${punto.etichetta}»${avviso}`)
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
        execFileSync(ADB, ['exec-out', 'screencap', '-p'], { maxBuffer: 256 * 1024 * 1024, stdio: ['ignore', openSync(percorso, 'w'), 'inherit'] })
        console.log(percorso)
        return
    }

    console.log(`Uso:
  node scripts/device.mjs find                 elenca cosa e' toccabile, con le coordinate
  node scripts/device.mjs tap "Nuova"          tocca per testo (tocco REALE via adb)
  node scripts/device.mjs tap --sel "[data-testid=x]"
  node scripts/device.mjs type "ciao mondo"    scrive nel campo attivo
  node scripts/device.mjs shot nome            schermata`)
}

principale().catch((errore) => {
    console.error(String(errore.message ?? errore))
    process.exit(1)
})
