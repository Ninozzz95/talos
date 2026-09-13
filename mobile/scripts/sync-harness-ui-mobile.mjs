#!/usr/bin/env node
/**
 * Sincronizza le copie imbarcate del bundle harness-ui verso l'APK —
 * il debito dichiarato aperto in LEDGER-MOBILE-PAREGGIO-DESKTOP-CODICE.md
 * (§FASE H, 29/8): "nessuno script di sync automatico... ogni cherry-pick
 * era finito nel sorgente ma MAI nella copia imbarcata finché non
 * sincronizzata a mano (`cp` diretto)". Questa stessa sessione (30/8) ha
 * rifatto quel `cp` a mano più volte per il kernel e per app.js — la
 * stessa mossa ripetuta è il segnale che va tolta di mezzo, non ricordata.
 *
 * ⛔ 3/9 — le due destinazioni vivono in `android/.../src/main/`, non più
 * `src/debug/`: Codice spedisce nella build di rilascio da oggi (owner:
 * «Codice deve essere presente nella app di produzione», dopo undici
 * giorni in cui viveva solo in debug — vedi TalosHarnessUiPlugin.kt per
 * la storia intera). Le righe sotto restano vere per il resto.
 *
 * Due copie sincronizzate, indipendenti fra loro (percorsi diversi, mai
 * confuse):
 * 1. Il bundle CLIENT (`public/harness-ui/` — app.js, index.html,
 *    styles.css, fonts/) → la copia che il server standalone SERVE
 *    davvero (`android/.../talos-harness-ui/mobile-public/`).
 *    ⛔ NON è la copia che HarnessSessionScreen.vue carica nello Shadow
 *    DOM (quella è `android/app/src/main/assets/public/harness-ui/`,
 *    popolata SOLO da `npx cap sync android` a partire da `dist/` — fuori
 *    dall'ambito di questo script, resta un passo separato della
 *    sequenza di build, mai automatizzabile da qui: dipende da un build
 *    Vite completo, non da una semplice copia di file).
 * 2. Il KERNEL (`scripts/harness-talos/talosHarness.mjs`) → la copia che
 *    l'app stagia davvero on-device (`android/.../talos-harness-ui/kernel/`).
 *
 * Uso: `npm run sync:harness-ui-mobile` — anche wired in `npm run build`
 * (append alla catena esistente), così non serve più ricordarselo.
 */
import { cpSync, existsSync, readFileSync, statSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

export function coppieDiSync(radiceMobile) {
    return [
        {
            nome: 'bundle client harness-ui',
            origine: path.join(radiceMobile, 'public', 'harness-ui'),
            // ⛔ 3/9 — `main`, non più `debug`: Codice (harness incluso) ora
            // spedisce in release, owner: «Codice deve essere presente nella
            // app di produzione» — vedi TalosHarnessUiPlugin.kt per il
            // resto della storia. Prima del 3/9 questa riga diceva `debug`.
            destinazione: path.join(radiceMobile, 'android', 'app', 'src', 'main', 'assets', 'talos-harness-ui', 'mobile-public'),
        },
        {
            nome: 'kernel talosHarness.mjs',
            origine: path.join(radiceMobile, 'scripts', 'harness-talos', 'talosHarness.mjs'),
            destinazione: path.join(radiceMobile, 'android', 'app', 'src', 'main', 'assets', 'talos-harness-ui', 'kernel', 'talosHarness.mjs'),
        },
    ]
}

function invariata(origine, destinazione) {
    if (!existsSync(destinazione)) return false
    const s1 = statSync(origine)
    if (s1.isDirectory()) return false // per una cartella non confrontiamo byte a byte, cpSync è già idempotente e veloce
    try {
        return readFileSync(origine).equals(readFileSync(destinazione))
    }
    catch {
        return false
    }
}

/**
 * @param {string} radiceMobile
 * @param {(testo: string) => void} [log]
 * @returns {{ok: boolean, righe: Array<{nome: string, esito: 'copiato'|'invariato'|'saltato'|'sorgente-assente'}>}}
 */
export function sincronizzaHarnessUiMobile(radiceMobile, log = () => {}) {
    const righe = []
    let ok = true
    for (const coppia of coppieDiSync(radiceMobile)) {
        if (!existsSync(coppia.origine)) {
            log(`⛔ sync-harness-ui-mobile: sorgente assente, ${coppia.nome} — ${coppia.origine}`)
            righe.push({ nome: coppia.nome, esito: 'sorgente-assente' })
            ok = false
            continue
        }
        // ⛔ Onesto se la cartella android/ non esiste in questo checkout (es.
        // un ambiente che clona solo il web bundle): non un errore fatale,
        // niente da sincronizzare qui, mai un `npm run build` rotto per questo.
        if (!existsSync(path.dirname(coppia.destinazione))) {
            log(`— sync-harness-ui-mobile: ${coppia.nome} saltato, nessuna cartella android/ in questo checkout.`)
            righe.push({ nome: coppia.nome, esito: 'saltato' })
            continue
        }
        const eraGiaUguale = invariata(coppia.origine, coppia.destinazione)
        cpSync(coppia.origine, coppia.destinazione, { recursive: true })
        log(eraGiaUguale
            ? `✓ sync-harness-ui-mobile: ${coppia.nome} — già allineato.`
            : `✓ sync-harness-ui-mobile: ${coppia.nome} — copiato (era diverso).`)
        righe.push({ nome: coppia.nome, esito: eraGiaUguale ? 'invariato' : 'copiato' })
    }
    return { ok, righe }
}

const invokedPath = process.argv[1]
if (invokedPath && pathToFileURL(path.resolve(invokedPath)).href === import.meta.url) {
    const radiceMobile = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
    const { ok } = sincronizzaHarnessUiMobile(radiceMobile, (testo) => console.log(testo))
    if (!ok) process.exit(1)
}
