/**
 * ⛔ K3-RISDEL (ledger `LEDGER-K3-CODICE-COME-LA-CHAT-2026-10-15.md`): il risultato di un sotto-agente nella conversazione del Codice.
 * COPIA FISSATA delle regole del desktop r4 @ `fc5e25d62`, provata contro il golden calcolato dalle funzioni vere
 * (`tests/fixtures/r4/risultati-delega-fc5e25d62.json`):
 *   · `legacy/app.js` `mostraRisultatoDelega` (:11055): da dove arrivano le voci (`input.risultatiDelega` di un giro, o la consegna
 *     singola dentro il giro) e quale intestazione hanno;
 *   · `components/coda-messaggi.js` `descriviRisultatoDelega` (:189) e `fermataNellaLingua` (:123); `components/errori.js`
 *     `puntoNellaLingua` (:214).
 * Il risultato è un fatto a sé, mai testo dell'assistente: così fanno anche Codex (`tui/src/multi_agents.rs:335-372`) e Hermes
 * (`acp_adapter/tools.py:406-428`). La lingua la sceglie chi disegna: qui restano i dati grezzi della voce.
 */
import app from './testi/app-risultato-delega-r4.json'
import chat from './testi/chat-risultato-delega-r4.json'
import errori from './testi/errori-punti-r4.json'

import type { VoceRisultatoDelegaR4 } from './risultatoDelegaChiave'

/** Il metadato della riga `system` che porta una voce: la lista della chat la riconosce e disegna il riquadro. */
export { TALOS_METADATA_RISULTATO_DELEGA, type VoceRisultatoDelegaR4 } from './risultatoDelegaChiave'

export interface RisultatoDelegaR4 {
    titolo: string
    testo: string
    errore: boolean
}

type Tabella = { it: Record<string, string>; en: Record<string, string> }
const AREE: Record<string, Tabella> = { app, chat, errori }
const italiano = (lingua: string) => /^it(?:-|$)/iu.test(lingua)
const propria = (t: Record<string, string>, k: string) => (Object.hasOwn(t, k) ? t[k] : undefined)

/** `t('app.…' | 'chat.…' | 'errori.…')` di r4 per queste tre aree: la lingua, poi l'inglese. */
export function testoRisultatoDelegaR4(chiave: string, lingua: string, valori?: Record<string, unknown>): string {
    const punto = chiave.indexOf('.')
    const area = AREE[chiave.slice(0, punto)]
    const nome = chiave.slice(punto + 1)
    if (!area) return chiave
    const frase = propria(italiano(lingua) ? area.it : area.en, nome) ?? propria(area.en, nome) ?? chiave
    if (!valori) return frase
    return frase.replace(/\{([a-zA-Z0-9_]+)\}/g, (tutto, k: string) => (k in valori ? String(valori[k]) : tutto))
}

/**
 * Le voci di risultato portate da un `RunStarted.input` (`daGiro`) o da un `QueuedMessageDelivered`. Solo `origine: 'delega'`:
 * workflow, sfondo, obiettivo e la coda della persona hanno le loro forme, non ancora sul mobile.
 */
export function vociRisultatoDelegaR4(fonte: unknown, daGiro: boolean): VoceRisultatoDelegaR4[] {
    if (!fonte || typeof fonte !== 'object') return []
    const f = fonte as Record<string, unknown>
    if (f.origine !== 'delega') return []
    const stringa = (v: unknown) => (typeof v === 'string' ? v : null)
    if (Array.isArray(f.risultatiDelega)) {
        // il desktop salta una voce storta (senza codaId, childId o testo)
        return f.risultatiDelega.flatMap((v) => {
            const item = v as Record<string, unknown> | null
            const codaId = stringa(item?.codaId), childId = stringa(item?.childId), testo = stringa(item?.testo)
            return codaId && childId && testo !== null ? [{ codaId, childId, testo, daGiro }] : []
        })
    }
    return [{ codaId: stringa(f.codaId), childId: stringa(f.childId), testo: stringa(f.testo) ?? stringa(f.consegna) ?? '', daGiro }]
}

const PUNTI_DI_FERMATA: [RegExp, (m: RegExpExecArray) => [string, Record<string, unknown>]][] = [
    [/^while waiting for your approval for "(.+)"$/u, (m) => ['errori.turno.punto.approvazione', { nome: m[1] }]],
    [/^while "(.+)" was running$/u, (m) => ['errori.turno.punto.inCorso', { nome: m[1] }]],
    [/^before round (\d+)$/u, (m) => ['errori.turno.punto.primaDelGiro', { n: m[1] }]],
    [/^while the model was answering, at round (\d+)$/u, (m) => ['errori.turno.punto.rispostaDelModello', { n: m[1] }]],
    // pin 701c6c0d2 (`errori.js`): lo Stop mentre si contava la richiesta, prima che partisse
    [/^before the request was sent, at round (\d+)$/u, (m) => ['errori.turno.punto.primaDellInvio', { n: m[1] }]],
    [/^while waiting to ask again after an empty answer, at round (\d+)$/u, (m) => ['errori.turno.punto.attesaDopoRispostaVuota', { n: m[1] }]],
    [/^during compaction, at round (\d+)$/u, (m) => ['errori.turno.punto.compattazione', { n: m[1] }]],
    [/^while working with the tools of round (\d+); (\d+) not run \((.+)\)$/u, (m) => ['errori.turno.punto.attrezziNonEseguiti', { n: m[1], quanti: m[2], elenco: m[3] }]],
    [/^while working with the tools of round (\d+)$/u, (m) => ['errori.turno.punto.attrezzi', { n: m[1] }]],
]
/** `puntoNellaLingua`: una forma che non si riconosce passa com'è. */
export function puntoNellaLinguaR4(punto: string, lingua: string): string {
    for (const [forma, chiave] of PUNTI_DI_FERMATA) {
        const m = forma.exec(punto)
        if (m) {
            const [k, valori] = chiave(m)
            return testoRisultatoDelegaR4(k, lingua, valori)
        }
    }
    return punto
}

const FERMATA_DEL_KERNEL = /^(⛔\s*)?(?:stopped on request|interrotto su richiesta)(?::\s*(.+?))?\s*\.?\s*$/u
const PAUSA_DEL_KERNEL = /^(⏸\s*)?(?:paused on request)(?::\s*(.+?))?\s*\.?\s*$/u
/** `fermataNellaLingua`: la prima riga della fermata o della pausa di una figlia, nella lingua; il simbolo davanti resta. */
export function fermataNellaLinguaR4(testo: string, lingua: string): string {
    if (typeof testo !== 'string') return testo
    const [prima, ...resto] = testo.split('\n')
    const pausa = PAUSA_DEL_KERNEL.exec(prima.trim())
    if (pausa) {
        const frase = pausa[2]
            ? testoRisultatoDelegaR4('chat.child.pausedOnRequestAt', lingua, { punto: puntoNellaLinguaR4(pausa[2], lingua) })
            : testoRisultatoDelegaR4('chat.child.pausedOnRequest', lingua)
        return [`${pausa[1] ?? ''}${frase}`, ...resto].join('\n')
    }
    const m = FERMATA_DEL_KERNEL.exec(prima.trim())
    if (!m) return testo
    const frase = m[2]
        ? testoRisultatoDelegaR4('chat.child.stoppedOnRequestAt', lingua, { punto: puntoNellaLinguaR4(m[2], lingua) })
        : testoRisultatoDelegaR4('chat.child.stoppedOnRequest', lingua)
    return [`${m[1] ?? ''}${frase}`, ...resto].join('\n')
}

/** `descriviRisultatoDelega`: il contratto `talos.subagent-result.v1` della figlia giusta, o `null` (mai istruzioni, mai HTML). */
export function descriviRisultatoDelegaR4(testo: unknown, childId: unknown, lingua: string): RisultatoDelegaR4 | null {
    if (typeof testo !== 'string' || testo.length > 1000000 || typeof childId !== 'string') return null
    try {
        const p = JSON.parse(testo.slice(testo.indexOf('\n') + 1)) as Record<string, unknown> | null
        if (p?.schema !== 'talos.subagent-result.v1' || p.childId !== childId || !['concluso', 'non concluso'].includes(p.stato as string)
            || typeof p.risultatoNonFidato !== 'string') return null
        const errore = p.stato !== 'concluso'
        return {
            titolo: typeof p.compito === 'string' && p.compito.trim() ? p.compito : testoRisultatoDelegaR4('chat.queue.subAgent', lingua),
            testo: errore ? fermataNellaLinguaR4(p.risultatoNonFidato, lingua) : p.risultatoNonFidato,
            errore,
        }
    } catch {
        return null
    }
}
