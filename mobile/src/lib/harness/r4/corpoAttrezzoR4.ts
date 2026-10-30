/**
 * ⛔ T8 (censimento «Avvisi ed errori», punto c; ledger `LEDGER-T8-CORPO-DELLA-RIGA-2026-10-27.md`): il corpo della riga d'attrezzo,
 * cioè ciò che il PC mostra aprendo la riga, portato 1:1 da r4 @ 79ea996de:
 *   · gli argomenti come `renderizzaArgomentiAttrezzo` (`legacy/app.js:16177`): `chiave: valore`, la descrizione saltata (è già
 *     l'etichetta della riga), un valore oltre 400 caratteri chiuso con quanti sono, uno multiriga o oltre 80 in un blocco, un JSON
 *     storto com'è — mai un crash per un problema di forma;
 *   · il risultato come `app.js:23425-23636`: la frase del NO del kernel (`spiegaRifiutoAttrezzo`, `errori.js:925`) sopra il testo
 *     del kernel; la riga d'esito di un comando SOLO se l'uscita non è zero e SOLO per `shell`/`prova` (un file letto che comincia
 *     con «exit 1» è il file, non un verdetto); i due flussi etichettati quando ci sono, con lo stesso tono (stderr non è un errore);
 *     un output vuoto si dice; oltre 200 righe si taglia dichiarando quante mancano.
 * Qui i PEZZI nell'ordine del PC; il disegno è del componente. Le parole sono del desktop (dizionari estratti al pin).
 */
import erroriTurnoNo from './testi/errori-turno-no-r4.json'
import chatComando from './testi/chat-comando-r4.json'
import appAttivita from './testi/app-attivita-r4.json'
import { leggiEsitoComandoR4 } from './esitoAttrezzoR4'
import type { TalosRisultatoAttrezzo } from '@/lib/chat/sequenzaDelTurno'

export type PezzoDelCorpoR4 =
    /** `etichetta`: la voce `app.activity.arg.<campo>` del desktop; senza voce il nome del campo (un attrezzo MCP: è un identificativo). */
    | { tipo: 'argomento'; chiave: string; etichetta: string; valore: string; forma: 'riga' | 'blocco' | 'lungo'; caratteri?: string }
    | { tipo: 'argomentiGrezzi'; testo: string }
    | { tipo: 'no'; frase: string }
    | { tipo: 'esito'; riga: string }
    | { tipo: 'flusso'; etichetta: string; testo: string; tagliato?: string }
    | { tipo: 'blocco'; testo: string; tagliato?: string }

/** I due flussi ci sono solo se il backend li ha davvero (`toolCallResult`); `''` conta come assente. */
export type RisultatoAttrezzoR4 = TalosRisultatoAttrezzo

/** `RIGHE_ESITO_IN_CHAT` (`app.js:18958`). */
export const RIGHE_ESITO_R4 = 200
/** `TETTO_VALORE` di `renderizzaArgomentiAttrezzo`. */
const TETTO_VALORE = 400

type Tabella = { it: Record<string, string>; en: Record<string, string> }
const TABELLE: readonly Tabella[] = [erroriTurnoNo, chatComando, appAttivita] as Tabella[]
const italiano = (lingua: string) => /^it(?:-|$)/iu.test(lingua)

function voce(chiave: string, lingua: string): string | undefined {
    const lang = italiano(lingua) ? 'it' : 'en'
    for (const t of TABELLE) {
        const v = (Object.hasOwn(t[lang], chiave) ? t[lang][chiave] : undefined) ?? (Object.hasOwn(t.en, chiave) ? t.en[chiave] : undefined)
        if (v !== undefined) return v
    }
    return undefined
}

function tr(chiave: string, lingua: string, valori?: Record<string, unknown>): string {
    const v = voce(chiave, lingua)
    if (v === undefined) return chiave
    return valori ? v.replace(/\{([a-zA-Z0-9_]+)\}/gu, (tutto, k: string) => (k in valori ? String(valori[k]) : tutto)) : v
}

/* `PAROLE_DEL_NO` e `RIFIUTI` di `errori.js` @ 79ea996de (H-05: REFUSED a sicurezza e permessi, NOT FOUND, AMBIGUOUS, INVALID). */
const PAROLE_DEL_NO = [
    { parola: /^REFUSED\b\.?\s*/iu, detto: 'turno.no.rifiuto' },
    { parola: /^NOT FOUND\b\.?\s*/iu, detto: 'turno.no.nonTrovato' },
    { parola: /^AMBIGUOUS\b\.?\s*/iu, detto: 'turno.no.ambiguo' },
    { parola: /^INVALID\b\.?\s*/iu, detto: 'turno.no.nonValido' },
] as const
const RIFIUTI = [
    { prova: /empty html|html vuoto/iu, detto: 'turno.rifiuto.htmlVuoto' },
    { prova: /cartella is required|folder is required/iu, detto: 'turno.rifiuto.cartellaMancante' },
    { prova: /must be different from your own/iu, detto: 'turno.rifiuto.cartellaUguale' },
    { prova: /must be a string/iu, detto: 'turno.rifiuto.nonTesto' },
    { prova: /no delegation channel|delegation is not configured/iu, detto: 'turno.rifiuto.senzaDelega' },
    { prova: /not configured on this harness|no generator|no saver/iu, detto: 'turno.rifiuto.nonConfigurata' },
    { prova: /non ha un canale di approvazione|approval channel/iu, detto: 'turno.rifiuto.senzaApprovazione' },
    { prova: /too large|troppo grande/iu, detto: 'turno.rifiuto.troppoGrande' },
] as const

/** `spiegaRifiutoAttrezzo`: la frase di un NO dichiarato dal kernel, o `null` se l'esito non lo è. */
export function fraseDelNoR4(esito: string, lingua: string): string | null {
    const testo = String(esito ?? '').trim()
    const no = PAROLE_DEL_NO.find((p) => p.parola.test(testo))
    if (!no) return null
    const resto = testo.replace(no.parola, '')
    const trovato = RIFIUTI.find((r) => r.prova.test(resto))
    return tr(trovato ? trovato.detto : no.detto, lingua)
}

/** `dovEGirato`: il livello prima della parentesi; un livello che non conosciamo non si traduce a caso (`null`). */
function dovEGirato(livello: string | null, lingua: string): string | null {
    const l = String(livello ?? '').trim()
    const nome = l.split('(')[0]!.trim()
    if (nome === 'wsl2') {
        const utente = /\(Linux in WSL (?:as|come) ([a-z_][a-z0-9_-]{0,31}\$?);/iu.exec(l)?.[1]
        if (utente) return tr('command.where.wslAs', lingua, { user: utente })
        if (/\(Linux in WSL (?:with an unverified user|con un utente non verificato);/u.test(l)) return tr('command.where.wslUnverified', lingua)
        return tr('command.where.wsl', lingua)
    }
    if (nome === 'none') return tr('command.where.windows', lingua)
    if (nome === 'adb-shell-on-device') return tr('command.where.phone', lingua)
    return null
}

/** `rigaEsitoDaMostrare`: verdetto e posto di un comando NON riuscito, nelle parole di casa; `null` per un comando riuscito. */
function rigaEsitoR4(grezzo: string, lingua: string): string | null {
    const e = leggiEsitoComandoR4(grezzo)
    if (!e.comando || e.riuscito) return null
    const verdetto = e.uscita === null ? tr('command.outcome.noExitCode', lingua)
        : e.annullato ? tr('command.outcome.cancelled', lingua, { code: e.uscita })
            : e.terminato ? tr('command.outcome.killed', lingua, { code: e.uscita })
                : tr('command.outcome.failed', lingua, { code: e.uscita })
    return [verdetto, dovEGirato(e.livello, lingua)].filter(Boolean).join(' · ')
}

/** Il taglio a 200 righe, col plurale dal numero (LINGUA-7). */
function tagliato(testo: string, lingua: string): { testo: string; tagliato?: string } {
    const righe = testo.split('\n')
    if (righe.length <= RIGHE_ESITO_R4) return { testo }
    const quante = righe.length - RIGHE_ESITO_R4
    return {
        testo: righe.slice(0, RIGHE_ESITO_R4).join('\n'),
        tagliato: tr(quante === 1 ? 'activity.moreLinesOne' : 'activity.moreLinesMany', lingua, { nascoste: quante, totale: righe.length }),
    }
}

function argomentiR4(grezzi: string, lingua: string): PezzoDelCorpoR4[] {
    if (!grezzi.trim()) return []
    let argomenti: unknown
    try { argomenti = JSON.parse(grezzi) } catch { argomenti = null }
    if (!argomenti || typeof argomenti !== 'object') return [{ tipo: 'argomentiGrezzi', testo: grezzi }]
    const pezzi: PezzoDelCorpoR4[] = []
    for (const [chiave, valore] of Object.entries(argomenti as Record<string, unknown>)) {
        if (chiave === 'descrizione') continue
        const testo = typeof valore === 'string' ? valore : JSON.stringify(valore)
        // T8, punto 1 del Desktop (27/10): il nome del campo nella lingua dell'app dalla voce del desktop; senza voce resta il nome
        const etichetta = voce(`activity.arg.${chiave}`, lingua) ?? chiave
        if (testo.length > TETTO_VALORE) {
            pezzi.push({ tipo: 'argomento', chiave, etichetta, valore: testo, forma: 'lungo', caratteri: tr('activity.characters', lingua, { n: testo.length.toLocaleString(italiano(lingua) ? 'it' : 'en') }) })
        } else {
            pezzi.push({ tipo: 'argomento', chiave, etichetta, valore: testo, forma: testo.includes('\n') || testo.length > 80 ? 'blocco' : 'riga' })
        }
    }
    return pezzi
}

const haFlusso = (v: unknown): v is string => typeof v === 'string' && v !== ''

/**
 * Il corpo della riga: prima gli argomenti, poi (se il risultato è arrivato) il risultato. Vuoto = la riga non si apre
 * (`nonApribileSeVuota`, `app.js:4084`).
 */
export function corpoAttrezzoR4(chiamata: { nome: string; argomenti: string; risultato?: RisultatoAttrezzoR4 }, lingua: string): PezzoDelCorpoR4[] {
    const pezzi = argomentiR4(String(chiamata.argomenti ?? ''), lingua)
    const risultato = chiamata.risultato
    if (!risultato) return pezzi
    const testoEsito = String(risultato.contenuto ?? '')
    const no = fraseDelNoR4(testoEsito, lingua)
    if (no) pezzi.push({ tipo: 'no', frase: no })
    // la testata la scrive il kernel SOLO per i comandi: il nome dell'attrezzo è l'unico testimone affidabile
    const scriveLaTestata = chiamata.nome === 'shell' || chiamata.nome === 'prova'
    const rigaEsito = scriveLaTestata ? rigaEsitoR4(testoEsito, lingua) : null
    if (rigaEsito) pezzi.push({ tipo: 'esito', riga: rigaEsito })
    if (haFlusso(risultato.stdout) || haFlusso(risultato.stderr)) {
        for (const [etichetta, testo] of [[tr('activity.outputLabel', lingua), risultato.stdout], [tr('activity.diagnosticsLabel', lingua), risultato.stderr]] as const) {
            if (haFlusso(testo)) pezzi.push({ tipo: 'flusso', etichetta, ...tagliato(testo, lingua) })
        }
        return pezzi
    }
    const blocco = scriveLaTestata ? leggiEsitoComandoR4(testoEsito).output : testoEsito
    pezzi.push({ tipo: 'blocco', ...tagliato(blocco.trim() === '' ? tr('activity.noOutput', lingua) : blocco, lingua) })
    return pezzi
}

/**
 * T8, punto 2 del Desktop (27/10): un gruppo che contiene un fallimento lo dice anche chiuso, accanto ai passi, con le frasi della testa
 * del PC (`aggiornaRiassuntoBatch`, `app.js:15167`: `app.activity.failedOne/Many`, `interruptedOne/Many`). Tono d'errore se almeno una
 * riga è fallita; d'attenzione se ci sono solo interrotte. Una riga non eseguita o saltata non si conta (come sul PC).
 */
export function fallimentiDelGruppoR4(esiti: readonly (string | undefined)[], lingua: string): { testo: string; tono: 'errore' | 'avviso' } | null {
    const falliti = esiti.filter((e) => e === 'errore').length
    const interrotti = esiti.filter((e) => e === 'interrotta').length
    const parti: string[] = []
    if (falliti) parti.push(tr(falliti === 1 ? 'activity.failedOne' : 'activity.failedMany', lingua, { n: falliti }))
    if (interrotti) parti.push(tr(interrotti === 1 ? 'activity.interruptedOne' : 'activity.interruptedMany', lingua, { n: interrotti }))
    return parti.length ? { testo: parti.join(' · '), tono: falliti ? 'errore' : 'avviso' } : null
}
