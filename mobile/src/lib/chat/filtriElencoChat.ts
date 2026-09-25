/**
 * ⭐ A3-84 (owner 24/09/2026 sera, decisioni del 25/09) — i filtri e l'ordine dell'elenco delle chat.
 *
 * L'elenco prende la grammatica delle stazioni (Memoria, Note, Attività): poche schede in alto — lo STATO — e il
 * resto nel foglio delle opzioni: periodo, contenuto, modello, ordine. Le forme vengono da LibreChat
 * (PR #16245/#16246, 23/09/2026: date agganciate alla mezzanotte locale, «con file», modello, numero dei filtri
 * accesi sul pulsante) e da Hermes (`hermes sessions`: ordine per recenza, filtro `--model`).
 * Ricerca e risposte dell'owner: `.claude/ricerche/2026-09-25-elenco-chat-grammatica-stazioni-10x4.md`.
 *
 * Puro e senza I/O: l'istante arriva da fuori, come in `chatDateBuckets.ts`, perché il confine della mezzanotte è
 * l'unico punto in cui questo codice può sbagliare.
 */
import { parseVaultKind, parseVaultOrigin, parseVaultOriginSession } from '@/lib/vaultLibrary'
import type { TalosStatoChat } from '@/lib/chat/statoChat'
import type { TalosLocalChatSession, TalosLocalVaultFile } from '@/repositories/chatRepository'

/** Le schede, nell'ordine dell'owner: «in corso, in coda, in pausa, concluse», più Tutte. */
export const TALOS_FILTRI_STATO_CHAT = Object.freeze(['tutte', 'in-corso', 'in-coda', 'in-pausa', 'concluse'] as const)
export type TalosFiltroStatoChat = typeof TALOS_FILTRI_STATO_CHAT[number]

export type TalosPeriodoChat = 'sempre' | 'oggi' | '7g' | '30g' | 'oltre-30g'
export type TalosContenutoChat = 'tutte' | 'allegati' | 'generati'
export type TalosOrdineChat = 'attivita' | 'creazione' | 'titolo'

export interface TalosFacetteChat {
    readonly periodo: TalosPeriodoChat
    readonly contenuto: TalosContenutoChat
    /** L'id del profilo di modello; `null` = tutti. */
    readonly modello: string | null
}

export const TALOS_FACETTE_CHAT_NESSUNA: TalosFacetteChat = Object.freeze({ periodo: 'sempre', contenuto: 'tutte', modello: null })

/**
 * ⛔ Aspetta te, fallite e interrotte NON hanno una scheda (owner, 25/09): si vedono in Tutte, con la loro etichetta.
 */
export function talosStatoNelFiltro(stato: TalosStatoChat, filtro: TalosFiltroStatoChat): boolean {
    switch (filtro) {
        case 'tutte': return true
        case 'in-corso': return stato === 'in-corso'
        case 'in-coda': return stato === 'in-coda'
        case 'in-pausa': return stato === 'in-pausa'
        case 'concluse': return stato === 'conclusa'
    }
}

const GIORNO = 24 * 60 * 60 * 1000

function inizioDelGiorno(data: Date): number {
    return new Date(data.getFullYear(), data.getMonth(), data.getDate()).getTime()
}

/**
 * Il periodo sull'ultima attività, a GIORNI DI CALENDARIO: gli stessi confini delle fasce dell'elenco
 * (`chatDateBuckets.ts`: oggi, precedenti 7, precedenti 30), così «Ultimi 7 giorni» prende esattamente le fasce
 * Oggi, Ieri e Precedenti 7 giorni. Una data mancante o storta la prende solo «Sempre»: non si inventa un giorno.
 */
export function talosNelPeriodo(iso: string | null | undefined, periodo: TalosPeriodoChat, adesso: Date): boolean {
    if (periodo === 'sempre') return true
    const istante = iso ? Date.parse(iso) : Number.NaN
    if (Number.isNaN(istante)) return false
    const distanza = Math.round((inizioDelGiorno(adesso) - inizioDelGiorno(new Date(istante))) / GIORNO)
    switch (periodo) {
        case 'oggi': return distanza <= 0
        case '7g': return distanza <= 7
        case '30g': return distanza <= 30
        case 'oltre-30g': return distanza > 30
    }
}

/**
 * Il modello dell'ULTIMA RISPOSTA (owner, 25/09): il dato che l'elenco ha già, senza leggere i messaggi. Se l'ultimo
 * messaggio non è una risposta (una domanda rimasta senza, un errore) la chat non ha un modello da dire, e compare
 * solo con «Tutti»: meglio che attribuirle il modello scelto ADESSO nella chat, che potrebbe non averle mai risposto.
 */
export function talosModelloDellaChat(sessione: TalosLocalChatSession): string | null {
    const ultimo = sessione.last_message
    return ultimo?.role === 'assistant' && ultimo.model_profile_id ? ultimo.model_profile_id : null
}

export interface TalosFontiFacetteChat {
    readonly conAllegati: ReadonlySet<string>
    readonly conGenerati: ReadonlySet<string>
    readonly adesso: Date
}

export function talosPassaFacette(sessione: TalosLocalChatSession, facette: TalosFacetteChat, fonti: TalosFontiFacetteChat): boolean {
    if (!talosNelPeriodo(sessione.updated_at, facette.periodo, fonti.adesso)) return false
    if (facette.contenuto === 'allegati' && !fonti.conAllegati.has(sessione.id)) return false
    if (facette.contenuto === 'generati' && !fonti.conGenerati.has(sessione.id)) return false
    if (facette.modello !== null && talosModelloDellaChat(sessione) !== facette.modello) return false
    return true
}

/**
 * Il nome del modello SENZA il prefisso del fornitore («Z.ai: GLM 5.3 Flash» → «GLM 5.3 Flash»), come il desktop
 * (`session-item.js`: misurato, col prefisso il nome si troncava). Solo «Fornitore: » con lo spazio: un «:» dentro il
 * nome («qwen3:8b») resta.
 */
export function talosNomeCortoModello(nome: string): string {
    return nome.trim().replace(/^[^:]{1,40}:\s+(?=\S)/, '')
}

/** Quante facette del foglio sono accese: il numero sul pulsante Opzioni. L'ordine non è un filtro e non conta. */
export function talosFacetteAttive(facette: TalosFacetteChat): number {
    return Number(facette.periodo !== 'sempre') + Number(facette.contenuto !== 'tutte') + Number(facette.modello !== null)
}

/**
 * Le chat in cui il modello ha GENERATO un documento: la stessa regola della pulizia alla cancellazione
 * (`sessionCleanup.ts`) — nato in quella chat (`origin_session_id`), di origine `generated`, e non una pagina letta
 * durante una ricerca (`web_source`). Un passaggio solo sul vault, non uno per chat.
 */
export function talosSessioniConDocumentiGenerati(files: readonly TalosLocalVaultFile[]): Set<string> {
    const sessioni = new Set<string>()
    for (const file of files) {
        const sessione = parseVaultOriginSession(file.metadata)
        if (sessione === null) continue
        if (parseVaultOrigin(file.metadata) !== 'generated') continue
        if (parseVaultKind(file.metadata) === 'web_source') continue
        sessioni.add(sessione)
    }
    return sessioni
}

/**
 * L'ordine. «Ultima attività» è quello che arriva (`orderChatSessions`: per aggiornamento, col riordino a mano che
 * l'elenco conserva da sempre) e non si tocca; «creazione» dalla più nuova; «titolo» A–Z nella lingua del dispositivo,
 * senza badare alle maiuscole. Si ordina una COPIA: l'elenco del controller non si muove.
 */
export function talosOrdinaChat<T extends TalosLocalChatSession>(
    sessioni: readonly T[],
    ordine: TalosOrdineChat,
    titolo: (sessione: T) => string,
): T[] {
    if (ordine === 'attivita') return [...sessioni]
    if (ordine === 'creazione') return [...sessioni].sort((a, b) => (b.created_at ?? '').localeCompare(a.created_at ?? ''))
    return [...sessioni].sort((a, b) => titolo(a).localeCompare(titolo(b), undefined, { sensitivity: 'base' }))
}
