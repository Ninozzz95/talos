/**
 * ⛔ K3 Stop come il desktop (ledger `LEDGER-K3-STOP-2026-10-16.md`; owner 16/10 «Come il desktop»). Uno Stop chiesto dalla persona
 * non è un guasto: COPIA FISSATA della regola `fermato-da-te` e della vestizione `fermato` del desktop r4 @ 2161afb32
 * (`frontend/src/components/errori.js` :179-220, :654-668; la forma della nota è `creaNotaErrore`, `conversazione.js`). Le parole
 * sono quelle del pin (`testi/errori-fermato-r4.json`, `testi/chat-nota-r4.json`), il punto di fermata quello di `puntoNellaLinguaR4`.
 */
import errori from './testi/errori-fermato-r4.json'
import chat from './testi/chat-nota-r4.json'
import { puntoNellaLinguaR4 } from './risultatiDelegaR4'

export interface CartaFermatoR4 {
    badge: string
    titolo: string
    cosa: string
    perche: string
    rimedi: string[]
    etichettaTecnico: string
    tecnico: string
}

type Tabella = { it: Record<string, string>; en: Record<string, string> }
const italiano = (lingua: string) => /^it(?:-|$)/iu.test(lingua)
const testoDi = (t: Tabella, chiave: string, lingua: string, valori: Record<string, string> = {}) =>
    (t[italiano(lingua) ? 'it' : 'en'][chiave] ?? t.en[chiave] ?? chiave).replace(/\{(\w+)\}/gu, (_, k: string) => valori[k] ?? `{${k}}`)

/** `puntoDiFermata`: solo la prima riga (sotto il kernel attacca l'ultimo testo del modello); l'inglese di oggi o l'italiano di ieri. */
function puntoDiFermata(tecnico: string, lingua: string): string | null {
    const prima = tecnico.split('\n')[0]
    const punto = /(?:stopped on request|interrotto su richiesta):\s*(.+?)\s*\.?\s*$/u.exec(prima)?.[1]?.trim()
    return punto ? puntoNellaLinguaR4(punto, lingua) : null
}

export function cartaFermatoR4(tecnico: string, lingua: string): CartaFermatoR4 {
    const punto = puntoDiFermata(tecnico, lingua)
    return {
        badge: testoDi(errori, 'turno.vestizione.fermato.badge', lingua),
        titolo: testoDi(errori, 'turno.vestizione.fermato.titolo', lingua),
        cosa: testoDi(errori, 'turno.fermato.cosa', lingua),
        perche: punto ? testoDi(errori, 'turno.fermato.perchePunto', lingua, { punto }) : testoDi(errori, 'turno.fermato.perche', lingua),
        rimedi: [testoDi(errori, 'turno.fermato.rimedio1', lingua)],
        etichettaTecnico: testoDi(chat, 'note.serverText', lingua),
        tecnico,
    }
}
