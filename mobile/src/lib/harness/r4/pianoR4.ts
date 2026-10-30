/**
 * ⛔ K3 piano (ledger `LEDGER-K3-PIANO-2026-10-17.md`; owner 17/10 «Carta + modo Normale/Piano»): la carta del piano come la fa il
 * desktop r4 @ 701c6c0d2. Trascrizione di `components/plan-artifact.js`:
 *   · `parsePlanEvent` (:20) → `leggiEventoPianoR4`;
 *   · `createPlanArtifact` (:66) e `creaScelte` (:133) → `cartaPianoR4` (ciò che la carta dice; il disegno è di `TalosCodiceR4Piano.vue`);
 *   · `fraseDecisione` (:227), `oraDi` (:220) e `applicaDecisionePiano` (:247) → `ricevutaPianoR4`;
 *   · il messaggio d'errore di `inviaDecisionePiano` (`legacy/app.js:5890`): `errori.js` `testoErroreServer` (:1138), parte `message`,
 *     come lo legge `services/api-client.ts:34`, dentro `chat.plan.choiceFailed` (:164).
 * Le parole sono del desktop (dizionari JSON di r4 nel chunk del Codice). Le prove le confrontano col golden calcolato dal codice vero.
 */
import chatPiano from './testi/chat-piano-r4.json'
import appPiano from './testi/app-piano-r4.json'
import modelloPermessi from './testi/modello-permessi-r4.json'
import type { DecisionePianoFattaR4, DecisionePianoR4, PropostaPianoR4 } from './pianoChiave'
import { leggiEventoPianoR4 } from './pianoEventoR4'
import { fraseErroreR4 } from './fraseErroreR4'

type Tabella = { it: Record<string, string>; en: Record<string, string> }
const AREE: Record<string, Tabella[]> = { chat: [chatPiano], app: [appPiano], modello: [modelloPermessi] }
const italiano = (lingua: string) => /^it(?:-|$)/iu.test(lingua)
const propria = (t: Record<string, string>, k: string) => (Object.hasOwn(t, k) ? t[k] : undefined)
/** `interpola` di `lingua.js:117`. */
const interpola = (frase: string, valori?: Record<string, unknown>) => (valori
    ? frase.replace(/\{([a-zA-Z0-9_]+)\}/g, (tutto, k: string) => (k in valori ? String(valori[k]) : tutto))
    : frase)

/** `t()` del desktop sulle parole del piano: la lingua, poi l'inglese, poi la chiave. */
export function testoPianoR4(chiave: string, lingua: string, valori?: Record<string, unknown>): string {
    const punto = chiave.indexOf('.')
    const nome = chiave.slice(punto + 1)
    for (const t of AREE[chiave.slice(0, punto)] ?? []) {
        const v = propria(italiano(lingua) ? t.it : t.en, nome) ?? propria(t.en, nome)
        if (v !== undefined) return interpola(v, valori)
    }
    return chiave
}

const IMPRONTA = /^sha256:[0-9a-f]{64}$/u
// `parsePlanEvent` vive nel file leggero (lo usa l'adattatore degli eventi, senza i dizionari): qui si riesporta
export { leggiEventoPianoR4 }

/** Le quattro scelte di `SCELTE_PIANO` (decisioni owner 3 e 37 del desktop), nell'ordine dell'owner; la quarta apre la correzione. */
export const SCELTE_PIANO_R4: readonly { decisione: DecisionePianoR4; chiave: string }[] = Object.freeze([
    { decisione: 'procedi-con-conferma', chiave: 'askFirst' },
    { decisione: 'procedi-accetta-modifiche', chiave: 'acceptChanges' },
    { decisione: 'conversazione-pulita', chiave: 'freshConversation' },
    { decisione: 'continua-a-pianificare', chiave: 'keepPlanning' },
])
/** `textarea.maxLength` della correzione (`creaScelte`) e il tetto di `plan-contract.mjs`. */
export const CORREZIONE_MASSIMA_R4 = 4_000

export interface CartaPianoR4 {
    ariaLabel: string
    titolo: string
    stato: string
    approvabile: boolean
    corpoLabel: string
    corpoSenzaPiano: string | null
    piede: string | null
    gruppoLabel: string | null
    domanda: string | null
    scelte: { decisione: DecisionePianoR4; titolo: string; descrizione: string; espandibile: boolean }[]
    correzione: { etichetta: string; segnaposto: string; massimo: number; righe: number; pulsanti: string[] } | null
}

/** Ciò che dice la carta di una proposta (`createPlanArtifact` con la sua richiesta: approvabile). */
export function cartaPianoR4(proposta: PropostaPianoR4, lingua: string): CartaPianoR4 {
    const tr = (k: string, v?: Record<string, unknown>) => testoPianoR4(k, lingua, v)
    const proposto = proposta.status === 'proposed'
    const approvabile = proposto && typeof proposta.requestId === 'string' && proposta.requestId.length > 0
        && typeof proposta.hash === 'string' && IMPRONTA.test(proposta.hash)
    const titolo = proposto ? tr('chat.plan.proposed') : tr('chat.plan.unavailable')
    return {
        ariaLabel: titolo,
        titolo,
        stato: !proposto ? tr('chat.plan.tooLong')
            : approvabile ? tr('chat.plan.waitingForChoice', { revisione: Number.isSafeInteger(proposta.revision) ? tr('chat.plan.revision', { n: proposta.revision }) : '' })
                : tr('chat.plan.needsReview'),
        approvabile,
        corpoLabel: tr('chat.plan.content'),
        corpoSenzaPiano: proposto ? null : tr('chat.plan.tooLongHint'),
        piede: approvabile ? null : proposto ? tr('chat.plan.cannotApproveHere') : tr('chat.plan.noPartialContent'),
        gruppoLabel: approvabile ? tr('chat.plan.proceedLabel') : null,
        domanda: approvabile ? tr('chat.plan.proceedQuestion') : null,
        scelte: approvabile ? SCELTE_PIANO_R4.map((s) => ({
            decisione: s.decisione, titolo: tr(`chat.plan.choice.${s.chiave}.title`), descrizione: tr(`chat.plan.choice.${s.chiave}.description`),
            espandibile: s.decisione === 'continua-a-pianificare',
        })) : [],
        correzione: approvabile ? {
            etichetta: tr('chat.plan.feedback.label'), segnaposto: tr('chat.plan.feedback.placeholder'), massimo: CORREZIONE_MASSIMA_R4, righe: 3,
            pulsanti: [tr('chat.common.cancel'), tr('chat.plan.feedback.send')],
        } : null,
    }
}

/** `oraDi`: l'ora locale `HH:MM`, o `null`. */
function oraDi(at: unknown): string | null {
    const data = typeof at === 'string' ? new Date(at) : null
    if (!data || Number.isNaN(data.getTime())) return null
    return `${String(data.getHours()).padStart(2, '0')}:${String(data.getMinutes()).padStart(2, '0')}`
}

/** `fraseDecisione`: una frase per scelta e, per la chiusura senza scelta, una per motivo. Mai «approvato» per ciò che non lo è. */
function fraseDecisione(esito: DecisionePianoFattaR4, lingua: string): string {
    const tr = (k: string) => testoPianoR4(k, lingua)
    if (esito.status === 'approved') {
        if (esito.decisione === 'procedi-con-conferma') return tr('chat.plan.fact.approvedAskFirst')
        if (esito.decisione === 'procedi-accetta-modifiche') return tr('chat.plan.fact.approvedAcceptChanges')
        return tr('chat.plan.fact.approvedFresh')
    }
    if (esito.status === 'changes-requested') return tr('chat.plan.fact.keepPlanning')
    if (esito.motivo === 'fermato') return tr('chat.plan.fact.closed.stopped')
    if (esito.motivo === 'reindirizzamento') return tr('chat.plan.fact.closed.redirected')
    if (esito.motivo === 'nuovo-messaggio') return tr('chat.plan.fact.closed.newMessage')
    if (esito.motivo === 'interrotta') return tr('chat.plan.fact.closed.interrupted')
    return tr('chat.plan.fact.closed.generic')
}

export interface RicevutaPianoR4 {
    applicata: boolean
    ariaLabel: string | null
    titolo: string | null
    stato: string | null
    frase: string | null
    correzione: string | null
    meta: string | null
    apri: string | null
}

/**
 * `applicaDecisionePiano`: la carta diventa la ricevuta della scelta (decisione 38 del desktop). Vale solo per la revisione e la
 * richiesta della carta: una decisione di un'altra revisione non la tocca (`applicata: false`).
 */
export function ricevutaPianoR4(proposta: PropostaPianoR4, esito: DecisionePianoFattaR4 | null, lingua: string): RicevutaPianoR4 {
    const nessuna: RicevutaPianoR4 = { applicata: false, ariaLabel: null, titolo: null, stato: null, frase: null, correzione: null, meta: null, apri: null }
    if (!esito || !['approved', 'changes-requested', 'cancelled'].includes(esito.status)) return nessuna
    if (Number.isSafeInteger(proposta.revision) && proposta.revision !== esito.revision) return nessuna
    if (proposta.requestId && proposta.requestId !== esito.requestId) return nessuna
    const tr = (k: string, v?: Record<string, unknown>) => testoPianoR4(k, lingua, v)
    const rev = Number.isSafeInteger(esito.revision) ? tr('chat.plan.revision', { n: esito.revision }) : ''
    const etichetta = esito.status === 'approved' ? tr('chat.common.approved') + rev
        : esito.status === 'changes-requested' ? tr('chat.plan.needsReview') + rev : tr('chat.plan.closedWithoutChoice')
    const meta: string[] = []
    if (esito.status === 'approved' && typeof esito.hash === 'string') meta.push(tr('chat.plan.hash', { hash: esito.hash.slice(7, 19) }))
    const quando = oraDi(esito.at)
    if (quando) {
        const azione = esito.da === 'sistema' ? tr('chat.plan.meta.closedBySystemAt') : esito.status === 'cancelled' ? tr('chat.plan.meta.cancelledAt') : tr('chat.plan.meta.chosenAt')
        meta.push(tr('chat.plan.meta.timeLine', { azione, ora: quando }))
    }
    return {
        applicata: true,
        ariaLabel: tr('chat.plan.ariaLabel', { stato: etichetta }),
        titolo: esito.status === 'approved' ? tr('chat.plan.title.approved') : esito.status === 'changes-requested' ? tr('chat.plan.title.needsReview') : tr('chat.plan.title.closed'),
        stato: etichetta,
        frase: fraseDecisione(esito, lingua),
        correzione: esito.status === 'changes-requested' && esito.feedback ? `«${esito.feedback}»` : null,
        meta: meta.length ? meta.join(' · ') : null,
        apri: esito.status === 'approved' && esito.nuovaSessionId ? tr('chat.plan.openNewConversation') : null,
    }
}

/* ---- l'errore della scelta: `testoErroreServer` del desktop, parte `message`, ora in `fraseErroreR4.ts` (una regola sola) ---- */

/**
 * Il messaggio di un rifiuto del server nella lingua dell'app: la voce del dizionario sostituisce la frase del server SOLO se la sua
 * versione inglese coincide (prima le voci dei motivi, poi quella del codice); un codice o una frase sconosciuti restano l'inglese del
 * server. Senza frase del server, la voce del codice.
 */
export function messaggioErroreServerR4(errore: unknown, lingua: string): string {
    // ⛔ FRASI-UNICHE (censimento G, punto b; Desktop 27/10/2026): la stessa regola della riga d'errore e degli avvisi, su tutte le tabelle.
    // Qui la regola c'era già, ma su due sole tabelle: un SESSION_NOT_READY nel foglio del modo restava in inglese.
    return fraseErroreR4(errore, lingua)
}

/** La riga d'errore della carta (`creaScelte`, `invia`): il motivo del server, o «riprova.» se non c'è (r4 irraggiungibile). */
export function erroreDecisionePianoR4(errore: unknown, lingua: string): string {
    const messaggio = errore ? messaggioErroreServerR4(errore, lingua) || String((errore as { message?: unknown }).message ?? '') : ''
    return testoPianoR4('chat.plan.choiceFailed', lingua, { messaggio: messaggio || testoPianoR4('chat.plan.tryAgain', lingua) })
}
