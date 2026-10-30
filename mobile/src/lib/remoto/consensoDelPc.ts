/**
 * ⛔ D-MOCK-11 (dal vivo, 24/10/2026): il dispositivo non chiedeva mai il consenso al PC. Contratto
 * `CONTRATTO-DISPOSITIVI-CARTELLE-FILE-RISORSE-2026-10-23.md`, parte 1, punti 2-4 (R5.12): una cartella che il PC non ha ancora
 * consentito a questo dispositivo si chiede (`consent.request {cartellaId}`), poi si aspetta la persona davanti al PC con l'attesa
 * lunga (`consent.wait {richiestaId}`: 25 s per giro sul PC, `{stato:'attesa'}` alla scadenza del giro). `session.start` può già
 * rispondere con la stessa attesa (`{stato:'attesa-consenso', richiestaId, scadeAlle, attesaMs}`): il PC tiene il corpo e avvia LUI
 * la sessione al «Consenti», e l'esito porta il `sessionId`.
 *
 * Le due operazioni sono del solo canale (`operazioni.mjs` `OPERAZIONI_CONSENSO`, r4 `feat/cartelle-dispositivi-r5-12`): il ponte le
 * espone come due voci sue (`PERCORSO_CHIEDI_CONSENSO`, `PERCORSO_ATTENDI_CONSENSO`), così il Codice e la lista le chiamano con lo
 * stesso `TalosR4ClientePonte` di ogni altra rotta. Il r4 del telefono non le ha: in locale non c'è nessun consenso da chiedere.
 */
import type { TalosR4ClientePonte } from '@/lib/harness/r4/clienteR4'
import { PERCORSO_ATTENDI_CONSENSO, PERCORSO_CHIEDI_CONSENSO, idValidoDelPc } from './ponteRemotoR4'

export { PERCORSO_ATTENDI_CONSENSO, PERCORSO_CHIEDI_CONSENSO }
/** La regola del PC per l'id di una richiesta (`operazioni.mjs` `ID_RICHIESTA`). */
const ID_RICHIESTA = /^[A-Za-z0-9_-]{8,64}$/u
/** L'attesa del PC è di 2 minuti (`ATTESA_CONSENSO_MS`); oltre i 10 una risposta è storta. */
const ATTESA_MASSIMA_MS = 600_000
/** Dopo una caduta del canale si richiama dopo poco: il PC ridà lo stato di adesso. */
const PAUSA_DOPO_CADUTA_MS = 1_000
/**
 * J1-bis (revisione del Desktop): un «attesa» tornato in meno di un secondo vuol dire un PC che non tiene la lunga attesa (25 s):
 * prima di richiamare si aspetta un secondo, mai un giro a vuoto di richieste fino alla scadenza.
 */
const GIRO_MINIMO_MS = 1_000
const PAUSA_TRA_GIRI_MS = 1_000
/** Il motivo del dispositivo per una risposta di consenso che non capisce (anche la frase: `fraseDelConsenso`). */
export const MOTIVO_RISPOSTA_SCONOSCIUTA = 'consent-bad-answer'

/** Una richiesta aperta sul PC. `scadeAlle` è dell'orologio del DISPOSITIVO (da `attesaMs`): quello del PC può essere diverso. */
export interface AttesaConsenso { richiestaId: string, scadeAlle: number }

export type EsitoConsenso =
    | { esito: 'consentita', sessionId: string | null }
    | { esito: 'negata' }
    | { esito: 'scaduta' }
    | { esito: 'annullata' }

export interface ErroreConsenso extends Error { code: string, reason?: string, params?: Record<string, unknown> }

/** La risposta d'attesa del PC (`session.start` o `consent.request`), o null se non lo è. */
export function leggiAttesaConsenso(dati: unknown, ora: number): AttesaConsenso | null {
    const d = dati as { stato?: unknown, richiestaId?: unknown, attesaMs?: unknown } | null
    if (d?.stato !== 'attesa-consenso' || typeof d.richiestaId !== 'string' || !ID_RICHIESTA.test(d.richiestaId)) return null
    if (typeof d.attesaMs !== 'number' || !Number.isFinite(d.attesaMs) || d.attesaMs < 0) return null
    return { richiestaId: d.richiestaId, scadeAlle: ora + Math.min(d.attesaMs, ATTESA_MASSIMA_MS) }
}

/** `CONSENT_REQUIRED` porta la cartella da chiedere (`{cartellaId, nome}`); null per ogni altro rifiuto o una cartella storta. */
export function consensoRichiesto(errore: { code?: unknown, params?: unknown } | null | undefined): { cartellaId: string, nome: string | null } | null {
    if (errore?.code !== 'CONSENT_REQUIRED') return null
    const p = errore.params as { cartellaId?: unknown, nome?: unknown } | undefined
    if (!idValidoDelPc(p?.cartellaId)) return null
    return { cartellaId: p.cartellaId, nome: typeof p.nome === 'string' && p.nome.trim() ? p.nome : null }
}

/** Il motivo che il dispositivo dà a un `RATE_LIMITED` nato da una richiesta di consenso (il PC usa lo stesso codice per le iscrizioni). */
export const MOTIVO_TROPPE_RICHIESTE = 'consent-rate-limited'

const FRASI: Readonly<Record<string, string>> = Object.freeze({
    CONSENT_REQUIRED: 'computer.consent.required',
    CONSENT_DENIED: 'computer.consent.denied',
    CONSENT_EXPIRED: 'computer.consent.expired',
    FOLDER_NOT_LISTED: 'computer.consent.folderNotListed',
    // cartelle bloccate (contratto del Desktop rev.1, 27/10/2026): tolta a questo dispositivo, si sblocca solo dal PC
    FOLDER_BLOCKED: 'computer.consent.folderBlocked',
})

/** La chiave i18n di un esito del consenso, o null se l'errore non è del consenso. */
export function fraseDelConsenso(errore: { code?: unknown, reason?: unknown } | null | undefined): string | null {
    const code = typeof errore?.code === 'string' ? errore.code : ''
    if (code === 'RATE_LIMITED') return errore?.reason === MOTIVO_TROPPE_RICHIESTE ? 'computer.consent.rateLimited' : null
    // J1-bis: BAD_MESSAGE è del consenso solo se nasce da una richiesta o da un'attesa di consenso (motivi `consent-…`): la lista
    // passa un motivo del consenso a ogni guasto di «Chiedi al PC»
    if (code === 'BAD_MESSAGE') return typeof errore?.reason === 'string' && errore.reason.startsWith('consent-') ? 'computer.consent.badAnswer' : null
    return Object.hasOwn(FRASI, code) ? FRASI[code]! : null
}

function erroreConsenso(code: string, message: string, extra: { reason?: unknown, params?: unknown } = {}): ErroreConsenso {
    return Object.assign(new Error(message), { code },
        typeof extra.reason === 'string' ? { reason: extra.reason } : {},
        extra.params && typeof extra.params === 'object' && !Array.isArray(extra.params) ? { params: extra.params as Record<string, unknown> } : {}) as ErroreConsenso
}

/** Una voce del ponte, nella busta di r4: i dati, o un `ErroreConsenso` col codice del PC. */
async function chiama(ponte: TalosR4ClientePonte, percorso: string, corpo: Record<string, unknown>): Promise<unknown> {
    let r: { stato: number, corpo: string }
    try {
        r = await ponte.richiesta({ metodo: 'POST', percorso, corpo: JSON.stringify(corpo) })
    } catch (e) {
        throw erroreConsenso('DISCONNECTED', e instanceof Error ? e.message : String(e))
    }
    let busta: { ok?: unknown, data?: unknown, error?: { code?: unknown, message?: unknown, reason?: unknown, params?: unknown } } | null = null
    try { busta = JSON.parse(r.corpo) } catch { /* resta null */ }
    if (r.stato >= 200 && r.stato < 300 && busta?.ok === true) return busta.data
    const code = typeof busta?.error?.code === 'string' ? busta.error.code : `HTTP_${r.stato}`
    throw erroreConsenso(code, typeof busta?.error?.message === 'string' ? busta.error.message : code, busta?.error ?? {})
}

/**
 * «Chiedi al PC»: apre la richiesta per la cartella. Una sola per cartella sul PC (la stessa torna a chi richiede), al più 3 per
 * dispositivo (`RATE_LIMITED`, col motivo `MOTIVO_TROPPE_RICHIESTE`); `FOLDER_NOT_LISTED` se la cartella non c'è più.
 */
export async function chiediConsenso(ponte: TalosR4ClientePonte, cartellaId: string, { ora = () => Date.now() }: { ora?: () => number } = {}): Promise<AttesaConsenso> {
    let dati: unknown
    try {
        dati = await chiama(ponte, PERCORSO_CHIEDI_CONSENSO, { cartellaId })
    } catch (e) {
        if ((e as ErroreConsenso).code === 'RATE_LIMITED') (e as ErroreConsenso).reason = MOTIVO_TROPPE_RICHIESTE
        throw e
    }
    const attesa = leggiAttesaConsenso(dati, ora())
    if (!attesa) throw erroreConsenso('BAD_MESSAGE', 'The computer did not open a consent request.', { reason: MOTIVO_RISPOSTA_SCONOSCIUTA })
    return attesa
}

/**
 * L'attesa della persona davanti al PC: `consent.wait` in giro finché c'è un esito. Il conto alla rovescia è del dispositivo
 * (`scadeAlle`, da `attesaMs`): passata la scadenza con il PC ancora «in attesa» o irraggiungibile, è `scaduta` («Il PC non ha
 * risposto»). Una caduta del canale si richiama (il PC ridà lo stato di adesso); una richiesta che il PC non ha più (riavviato:
 * `NOT_FOUND`) è come scaduta. `fermato`: «Annulla» della persona, controllato a ogni giro.
 */
export async function attendiConsenso(ponte: TalosR4ClientePonte, attesa: AttesaConsenso, {
    ora = () => Date.now(),
    fermato = () => false,
    pausa = (ms: number) => new Promise<void>((ok) => { setTimeout(ok, ms) }),
}: { ora?: () => number, fermato?: () => boolean, pausa?: (ms: number) => Promise<void> } = {}): Promise<EsitoConsenso> {
    for (;;) {
        if (fermato()) return { esito: 'annullata' }
        const inizio = ora()
        let dati: unknown
        try {
            dati = await chiama(ponte, PERCORSO_ATTENDI_CONSENSO, { richiestaId: attesa.richiestaId })
        } catch (e) {
            const code = (e as ErroreConsenso).code
            if (code === 'NOT_FOUND') return { esito: 'scaduta' }
            if (code !== 'DISCONNECTED') throw e
            if (ora() >= attesa.scadeAlle) return { esito: 'scaduta' }
            await pausa(PAUSA_DOPO_CADUTA_MS)
            continue
        }
        if (fermato()) return { esito: 'annullata' }
        const esito = (dati as { esito?: unknown, sessionId?: unknown } | null)?.esito
        if (esito === 'consentita') {
            const sessionId = (dati as { sessionId?: unknown }).sessionId
            return { esito: 'consentita', sessionId: idValidoDelPc(sessionId) ? sessionId : null }
        }
        if (esito === 'negata' || esito === 'scaduta') return { esito }
        // J1-bis: né un esito né «attesa» ⇒ una risposta che il dispositivo non capisce: l'attesa si chiude, mai un giro a vuoto
        if ((dati as { stato?: unknown } | null)?.stato !== 'attesa') {
            throw erroreConsenso('BAD_MESSAGE', 'The computer gave an unknown consent answer.', { reason: MOTIVO_RISPOSTA_SCONOSCIUTA })
        }
        if (ora() >= attesa.scadeAlle) return { esito: 'scaduta' }
        if (ora() - inizio < GIRO_MINIMO_MS) await pausa(PAUSA_TRA_GIRI_MS)
    }
}
