#!/usr/bin/env node
/**
 * Il ponte `adb reverse` fra il telefono e il backend Harness UI sul PC.
 *
 * Piano `procedi-col-generare-un-snoopy-neumann.md`, Fase 2 (§3.1 del
 * prompt originale). `harness-ui/server.mjs` resta bind SOLO su
 * `127.0.0.1:4174` — questo script non lo cambia. Rende quella porta
 * raggiungibile DAL TELEFONO tramite `adb -s <seriale> reverse tcp:4174
 * tcp:4174`: da quel momento `http://localhost:4174/...` chiamato dalla
 * WebView del telefono raggiunge trasparentemente il processo sul PC — la
 * stessa identica URL che il bundle desktop già chiama (vedi Fase 1,
 * `mobile/public/harness-ui/app.js`, `API()`).
 *
 * ⛔ Non parte da solo: è un comando manuale per l'owner, da lanciare prima
 * di aprire la schermata "Codice" sul telefono in una sessione di debug —
 * lo stesso principio già scritto nel piano madre (§3.2: "non gira in
 * produzione").
 *
 * Uso:
 *   node mobile/scripts/avvia-harness-reverse.mjs
 *   node mobile/scripts/avvia-harness-reverse.mjs --serial <seriale>
 */

import { execFileSync } from 'node:child_process'
import { pathToFileURL } from 'node:url'
import { trovaAdb } from './device.mjs'

const PORTA = 4174

/**
 * `adb devices -l`, righe raw → { seriale, stato }[]. La prima riga
 * ("List of devices attached") non è un dispositivo — scartata per
 * posizione, non per contenuto (un nome di dispositivo potrebbe contenere
 * qualunque testo).
 */
export function analizzaElencoDispositivi(testo) {
    return testo
        .split('\n')
        .slice(1)
        .map((riga) => riga.trim())
        .filter((riga) => riga.length > 0)
        .map((riga) => {
            const [seriale, stato] = riga.split(/\s+/)
            return { seriale, stato }
        })
}

/**
 * ⛔ Un seriale esplicito (`--serial`) vince SEMPRE, senza nemmeno
 * interrogare `adb devices` — è la via che risolve l'ambiguità "IL DEBUG
 * WIRELESS MOSTRA IL PAD DUE VOLTE" (due trasporti per lo stesso
 * dispositivo, `adb reverse` da solo fallisce con "more than one
 * device/emulator", verificato dal vivo in questo stesso progetto).
 *
 * Senza un seriale esplicito: **zero** dispositivi pronti è un errore
 * onesto ("nessuno collegato"), **più di uno** è un errore onesto che li
 * elenca tutti e chiede `--serial` — mai un indovinare quale usare.
 */
export function risolviSerialeAttivo(eseguiAdb, adb, serialeRichiesto) {
    if (serialeRichiesto) return serialeRichiesto
    const dispositivi = analizzaElencoDispositivi(eseguiAdb(adb, ['devices', '-l']))
        .filter((riga) => riga.stato === 'device')
    if (dispositivi.length === 0) {
        throw new Error('Nessun dispositivo collegato in modalità debug (adb devices non ne mostra nessuno pronto).')
    }
    if (dispositivi.length > 1) {
        const elenco = dispositivi.map((riga) => riga.seriale).join(', ')
        throw new Error(`Più di un dispositivo collegato (${elenco}) — passa --serial <seriale> per scegliere.`)
    }
    return dispositivi[0].seriale
}

/**
 * `adb -s <seriale> reverse tcp:4174 tcp:4174`, poi rilegge
 * `adb -s <seriale> reverse --list` e verifica che la regola sia davvero
 * lì — "una grep non è una prova" applicato a un comando di rete: il
 * comando che non stampa errori non è, da solo, la prova che il tunnel
 * sia attivo.
 */
export function avviaTunnel(eseguiAdb, adb, seriale) {
    eseguiAdb(adb, ['-s', seriale, 'reverse', `tcp:${PORTA}`, `tcp:${PORTA}`])
    const elenco = eseguiAdb(adb, ['-s', seriale, 'reverse', '--list'])
    const attiva = elenco.split('\n').some((riga) => riga.includes(`tcp:${PORTA}`))
    if (!attiva) {
        throw new Error(
            `"adb reverse" non ha segnalato errori, ma "adb -s ${seriale} reverse --list" `
            + `non mostra la regola tcp:${PORTA} — non fidarsi, verificare a mano prima di procedere.`,
        )
    }
    return elenco.trim()
}

function eseguiAdbReale(adb, argomenti) {
    return execFileSync(adb, argomenti, { encoding: 'utf8' })
}

function leggiSerialeRichiesto(argomenti) {
    const indice = argomenti.indexOf('--serial')
    if (indice === -1) return null
    const valore = argomenti[indice + 1]
    if (!valore) throw new Error('--serial richiede un valore (il seriale del dispositivo).')
    return valore
}

export function principale(eseguiAdb = eseguiAdbReale, argv = process.argv.slice(2)) {
    const serialeRichiesto = leggiSerialeRichiesto(argv)
    const adb = trovaAdb()
    const seriale = risolviSerialeAttivo(eseguiAdb, adb, serialeRichiesto)
    console.log(`Dispositivo: ${seriale}`)
    const conferma = avviaTunnel(eseguiAdb, adb, seriale)
    console.log('Tunnel attivo (adb reverse --list):')
    console.log(conferma)
    console.log(`\nApri "Codice" sul telefono: la WebView ora raggiunge http://localhost:${PORTA} sul PC.`)
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
    try {
        principale()
    } catch (errore) {
        console.error(String(errore.message ?? errore))
        process.exit(1)
    }
}
