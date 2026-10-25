/**
 * ⛔ K3-TERM T3 (ledger `LEDGER-K3-TERMINALE-2026-10-16.md`): il Terminale del Codice su r4. Owner 16/10: si scrive direttamente nel
 * terminale con una barra dei tasti su una riga sopra la tastiera; più schede come il desktop.
 * Regole del desktop r4 @ `2161afb32`:
 *   · le schede di `GET /:id/terminals` (`terminal-registry.mjs` `pubblica`: `terminalId, sessionId, cartella, creatoAlle, origine,
 *     attiva`) e il loro tetto (`SCHEDE_MASSIME_PER_SESSIONE` = 8);
 *   · i frame di controllo di `terminal-ws.mjs` (`agganciato {ripreso, shell, comando}`, `uscita {codice}`, `errore {code, reason,
 *     cartella, message}`), con le parole del desktop per l'avvio fallito (`app.terminal.startFailed.*`);
 *   · il titolo della scheda (`components/terminale.js` `titoloScheda`, `nomeShell`).
 * I tasti seguono le pratiche dei terminali mobili (dossier `.claude/ricerche/2026-10-16-k3c4-terminale-pty-android.md`): le frecce
 * cambiano sequenza nel modo «cursore applicazione»; Ctrl e Alt valgono per un carattere e un testo più lungo li consuma.
 */
import app from './testi/app-terminale-r4.json'
import processi from './testi/processi-terminale-r4.json'
import modello from './testi/modello-viste-r4.json'
import mobile from './testi/terminale-mobile.json'

type Tabella = { it: Record<string, string>; en: Record<string, string> }
const AREE: Record<string, Tabella> = { app, processi, modello, mobile }
const italiano = (lingua: string) => /^it(?:-|$)/iu.test(lingua)
const propria = (t: Record<string, string>, k: string) => (Object.hasOwn(t, k) ? t[k] : undefined)

/** `app.terminal.…`, `processi.terminal.…`, `modello.chat.…` del desktop e `mobile.…` nostre: la lingua, poi l'inglese. */
export function testoTerminaleR4(chiave: string, lingua: string, valori?: Record<string, unknown>): string {
    const punto = chiave.indexOf('.')
    const area = AREE[chiave.slice(0, punto)]
    const nome = chiave.slice(punto + 1)
    if (!area) return chiave
    const frase = propria(italiano(lingua) ? area.it : area.en, nome) ?? propria(area.en, nome) ?? chiave
    if (!valori) return frase
    return frase.replace(/\{([a-zA-Z0-9_]+)\}/g, (tutto, k: string) => (k in valori ? String(valori[k]) : tutto))
}

/** Lo stesso tetto del server (`SCHEDE_MASSIME_PER_SESSIONE`). */
export const SCHEDE_MASSIME_R4 = 8
/** Codice più largo di così: «Chat · Terminale» come schede nella testata; più stretto, barra in basso (owner 16/10). */
export const LARGHEZZA_VISTE_IN_TESTATA = 780

export interface VoceTerminaleR4 {
    terminalId: string
    origine: string
    attiva: boolean
    cartella: string
    creatoAlle: string
}

const ID_SEMPLICE = /^[A-Za-z0-9-]{1,200}$/u

/** Le schede di `GET /:id/terminals` nell'ordine del server; una voce storta non entra; un rifiuto è un elenco vuoto. */
export function vociTerminaliR4(risposta: unknown): VoceTerminaleR4[] {
    const voci = (risposta as { data?: { items?: unknown } } | null)?.data?.items
    if (!Array.isArray(voci)) return []
    return voci.flatMap((v) => {
        if (!v || typeof v !== 'object') return []
        const r = v as Record<string, unknown>
        if (typeof r.terminalId !== 'string' || !ID_SEMPLICE.test(r.terminalId)) return []
        return [{
            terminalId: r.terminalId,
            origine: typeof r.origine === 'string' ? r.origine : '',
            attiva: r.attiva === true,
            cartella: typeof r.cartella === 'string' ? r.cartella : '',
            creatoAlle: typeof r.creatoAlle === 'string' ? r.creatoAlle : '',
        }]
    })
}

export type ControlloTerminaleR4 =
    | { tipo: 'agganciato'; ripreso: boolean; shell: string | null; comando: string | null }
    | { tipo: 'uscita'; codice: number | null }
    | { tipo: 'errore'; code: string; reason: string; cartella: string }

/** Un frame di controllo di r4; ciò che non si riconosce è `null` (come fa r4 con i frame ignoti). */
export function controlloTerminaleR4(json: string): ControlloTerminaleR4 | null {
    let m: unknown
    try { m = JSON.parse(json) } catch { return null }
    if (!m || typeof m !== 'object' || Array.isArray(m)) return null
    const r = m as Record<string, unknown>
    const testoONull = (x: unknown) => (typeof x === 'string' ? x : null)
    if (r.evento === 'agganciato') return { tipo: 'agganciato', ripreso: r.ripreso === true, shell: testoONull(r.shell), comando: testoONull(r.comando) }
    if (r.evento === 'uscita') {
        if (r.codice !== null && !Number.isInteger(r.codice)) return null
        return { tipo: 'uscita', codice: r.codice as number | null }
    }
    if (r.evento === 'errore' && typeof r.code === 'string') {
        return { tipo: 'errore', code: r.code, reason: typeof r.reason === 'string' ? r.reason : '', cartella: typeof r.cartella === 'string' ? r.cartella : '' }
    }
    return null
}

/** Le parole del desktop per un avvio fallito (`app.terminal.startFailed.*`). */
export function frasiAvvioFallitoR4(errore: Extract<ControlloTerminaleR4, { tipo: 'errore' }>, lingua: string): string {
    const chiave = errore.reason === 'folder-missing' ? 'folderMissing' : errore.reason === 'not-a-folder' ? 'notAFolder' : 'spawnFailed'
    return testoTerminaleR4(`app.terminal.startFailed.${chiave}`, lingua, { cartella: errore.cartella })
}

/**
 * J3 (24/10/2026; il Desktop ha dato l'OK): la frase di `useTerminaleR4().errore`, con le parole del desktop dove le ha
 * (`app.terminal.tabNotOpened`/`closeFailed`, `processi.terminal.tooManyTabs`, come i suoi avvisi in `legacy/app.js:16547-16597`) e la
 * nostra per il ponte che non si apre (`mobile.nonCollegato`, che manda a «Ricollega»). Ogni altro codice di r4 è un «+» rifiutato.
 */
export function fraseErroreTerminaleR4(codice: string, lingua: string): string {
    if (codice === 'troppe') return testoTerminaleR4('processi.terminal.tooManyTabs', lingua, { n: SCHEDE_MASSIME_R4 })
    if (codice === 'TERMINAL_CLOSE_FAILED') return testoTerminaleR4('app.terminal.closeFailed', lingua)
    if (codice === 'TALOS_R4_IRRAGGIUNGIBILE') return testoTerminaleR4('mobile.nonCollegato', lingua)
    return testoTerminaleR4('app.terminal.tabNotOpened', lingua)
}

export interface TastoTerminaleR4 {
    id: string
    etichetta: string
    modificatore?: true
}

/** La barra dei tasti decisa dall'owner (16/10): una riga, nell'ordine. */
export const TASTI_TERMINALE_R4: readonly TastoTerminaleR4[] = Object.freeze([
    { id: 'esc', etichetta: 'Esc' },
    { id: 'tab', etichetta: 'Tab' },
    { id: 'ctrl', etichetta: 'Ctrl', modificatore: true },
    { id: 'alt', etichetta: 'Alt', modificatore: true },
    { id: 'sinistra', etichetta: '←' },
    { id: 'giu', etichetta: '↓' },
    { id: 'su', etichetta: '↑' },
    { id: 'destra', etichetta: '→' },
    { id: 'pipe', etichetta: '|' },
    { id: 'tilde', etichetta: '~' },
    { id: 'barra', etichetta: '/' },
    { id: 'meno', etichetta: '-' },
])

const FRECCE: Record<string, string> = { su: 'A', giu: 'B', destra: 'C', sinistra: 'D' }
const SEMPLICI: Record<string, string> = { esc: '\x1b', tab: '\t', pipe: '|', tilde: '~', barra: '/', meno: '-' }

/** La sequenza di un tasto della barra; i modificatori non ne hanno (valgono per il tasto dopo). */
export function sequenzaTastoR4(id: string, { cursoreApplicazione }: { cursoreApplicazione: boolean }): string | null {
    if (id in FRECCE) return `${cursoreApplicazione ? '\x1bO' : '\x1b['}${FRECCE[id]}`
    return SEMPLICI[id] ?? null
}

/**
 * Ctrl e Alt «a scatto» sul testo che arriva: su UN carattere Ctrl lo porta nei controlli (`& 0x1f`; `?` → DEL; spazio → NUL) e Alt
 * mette ESC davanti. Un testo più lungo (un incolla, una parola del predittivo, la dettatura) passa com'è: il modificatore si consuma
 * comunque, così non cade sul tasto dopo.
 */
export function conModificatoriR4(testo: string, { ctrl, alt }: { ctrl: boolean; alt: boolean }): string {
    if ([...testo].length !== 1) return testo
    let uscita = testo
    if (ctrl) {
        const c = testo.toUpperCase().charCodeAt(0)
        if (testo === '?') uscita = '\x7f'
        else if (testo === ' ') uscita = '\x00'
        else if (c >= 0x40 && c <= 0x5f) uscita = String.fromCharCode(c & 0x1f)
    }
    return alt ? `\x1b${uscita}` : uscita
}

export interface SchedaPerTitolo {
    terminalId: string
    titolo?: string
    shell?: string | null
    comando?: string | null
}

/** `nomeShell` del desktop: il nome della shell che il server ha scelto davvero. */
function nomeShell(shell?: string | null, comando?: string | null): string {
    if (shell === 'git-bash') return 'Git Bash'
    if (shell === 'cmd-fallback') return 'cmd.exe'
    if (shell === 'posix-shell') return String(comando ?? '').split(/[\\/]/u).pop() || 'shell'
    return 'shell'
}

/** `titoloScheda` del desktop: quello scelto, altrimenti «tu · <shell>», numerato fra le omonime senza nome. */
export function titoloSchedaR4(voce: SchedaPerTitolo, tutte: readonly SchedaPerTitolo[], lingua: string): string {
    if (voce.titolo) return voce.titolo
    const shell = nomeShell(voce.shell, voce.comando)
    const omonime = tutte.filter((v) => !v.titolo && nomeShell(v.shell, v.comando) === shell)
    const posizione = omonime.findIndex((v) => v.terminalId === voce.terminalId)
    return `${testoTerminaleR4('processi.terminal.tabYou', lingua)} · ${shell}${omonime.length > 1 && posizione > 0 ? ` ${posizione + 1}` : ''}`
}
