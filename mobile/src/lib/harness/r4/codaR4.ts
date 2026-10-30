/**
 * ⛔ K3-C Accoda (ledger `LEDGER-K3-ACCODA-2026-10-16.md`; owner 16/10: la striscia della chat, «Modifica» riporta nel compositore).
 * La coda del Codice la tiene r4 (`talos.coda {voci, inPausa}`, `legacy/app.js:12822`: nessuna copia propria). Qui le regole del
 * desktop @ `701c6c0d2` (invariate da `2161afb32`) (`components/coda-messaggi.js`), trascritte:
 *   · `normalizzaStatoCoda` → `statoCodaR4`;
 *   · le frasi di `descriviCoda` per una voce di sistema (risultato di un agente, esito di un Workflow, comando in sottofondo,
 *     dialogo fra agenti), con `descriviUscitaSfondo`, `descriviEsitoWorkflow`, `descriviDialogoAgente`; il risultato di un agente
 *     riusa `descriviRisultatoDelegaR4`. Una voce della persona resta il suo testo, come nella striscia della chat del mobile.
 */
import chat from './testi/chat-coda-r4.json'
import agenti from './testi/agenti-coda-r4.json'
import { descriviRisultatoDelegaR4 } from './risultatiDelegaR4'
import type { TalosCodaVoce } from '@/lib/chat/codaDelGiro'

type Tabella = Record<string, string>
const italiano = (lingua: string) => /^it(?:-|$)/iu.test(lingua)
const propria = (t: Tabella, k: string) => (Object.hasOwn(t, k) ? t[k] : undefined)
function t(chiave: string, lingua: string, valori?: Record<string, unknown>): string {
    const [area, ...resto] = chiave.split('.')
    const tabella = area === 'agenti' ? agenti : chat
    const nome = resto.join('.')
    const frase = propria((italiano(lingua) ? tabella.it : tabella.en) as Tabella, nome) ?? propria(tabella.en as Tabella, nome) ?? chiave
    return valori ? frase.replace(/\{([a-zA-Z0-9_]+)\}/g, (tutto, k: string) => (k in valori ? String(valori[k]) : tutto)) : frase
}

export interface VoceCodaR4 {
    id: string | null
    testo: string
    immagini: number
    mostra?: string
    origine?: 'delega' | 'agent-dialogue' | 'workflow' | 'sfondo'
    childId?: string | null
    runId?: string | null
    toolCallId?: string | null
    sfondo?: Record<string, unknown> | null
}
export interface StatoCodaR4 { voci: VoceCodaR4[]; inPausa: boolean }

/** `normalizzaStatoCoda`: voci con un testo, pausa solo se c'è qualcosa da mettere in pausa. */
export function statoCodaR4(valore: unknown): StatoCodaR4 {
    const v = valore && typeof valore === 'object' ? valore as Record<string, unknown> : {}
    const voci = (Array.isArray(v.voci) ? v.voci : []).map((x): VoceCodaR4 => {
        if (typeof x === 'string') return { id: null, testo: x, immagini: 0 }
        const o = (x && typeof x === 'object' ? x : {}) as Record<string, unknown>
        const bolla = o.bolla as Record<string, unknown> | undefined
        return {
            id: typeof o.id === 'string' ? o.id : null,
            testo: typeof o.testo === 'string' ? o.testo : '',
            immagini: Number.isFinite(o.immagini) ? o.immagini as number : 0,
            ...(typeof bolla?.testo === 'string' && bolla.testo.trim() !== '' ? { mostra: bolla.testo } : {}),
            ...(o.origine === 'delega' || o.origine === 'agent-dialogue' ? { origine: o.origine, childId: typeof o.childId === 'string' ? o.childId : null } : {}),
            ...(o.origine === 'workflow' ? { origine: 'workflow' as const, runId: typeof o.runId === 'string' ? o.runId : null } : {}),
            ...(o.origine === 'sfondo' ? { origine: 'sfondo' as const, toolCallId: typeof o.toolCallId === 'string' ? o.toolCallId : null, sfondo: o.sfondo && typeof o.sfondo === 'object' ? o.sfondo as Record<string, unknown> : null } : {}),
        }
    }).filter((x) => x.testo.trim() !== '')
    return { voci, inPausa: Boolean(v.inPausa) && voci.length > 0 }
}

const LUNGHEZZA_TITOLO = 1000
function accorcia(testo: string, massimo: number): string {
    const pulito = String(testo ?? '').replace(/\s+/g, ' ').trim()
    return pulito.length > massimo ? `${pulito.slice(0, massimo - 1).trimEnd()}…` : pulito
}

/** `descriviUscitaSfondo`: un comando in sottofondo finito, dai suoi fatti; qui serve la riga corta. */
function rigaSfondo(fatti: unknown, lingua: string): string {
    const f = fatti && typeof fatti === 'object' ? fatti as Record<string, unknown> : {}
    const comando = typeof f.comando === 'string' && f.comando.trim() ? f.comando.trim() : null
    const codice = Number.isSafeInteger(f.codice) ? f.codice as number : null
    const fermato = f.fermatoDallaPersona === true
    const stato = fermato ? t('chat.background.stoppedByYou', lingua)
        : f.esito === 'riuscito' ? t('chat.background.completed', lingua, { codice: codice ?? 0 })
            : f.esito === 'fallito' ? (codice !== null ? t('chat.background.failed', lingua, { codice }) : t('chat.background.failedToRun', lingua))
                : typeof f.segnale === 'string' && f.segnale ? t('chat.background.terminatedSignal', lingua, { segnale: f.segnale }) : t('chat.background.terminated', lingua)
    return `${comando ?? t('chat.background.aCommand', lingua)}: ${stato}`
}

/** `STATI_RUN` (`grafo/comuni.js:46-53`): la parola dello stato di un run Workflow. */
const CHIAVI_RUN: Record<string, string> = {
    created: 'created', running: 'running', paused: 'paused', needs_attention: 'needsAttention', succeeded: 'succeeded', failed: 'failed',
    succeeded_with_set_aside: 'succeededWithSetAside', cancelled: 'cancelled', planned: 'planned', proposed: 'proposed', approved: 'approved',
    pausing: 'pausing', cancelling: 'cancelling',
}

/** `descriviEsitoWorkflow`: titolo e stato del run, o `null` per un contratto di un altro run o illeggibile. */
function esitoWorkflow(testo: string, runId: unknown, lingua: string): { titolo: string; stato: string } | null {
    if (testo.length > 1000000 || typeof runId !== 'string') return null
    try {
        const p = JSON.parse(testo.slice(testo.indexOf('\n') + 1)) as Record<string, unknown> | null
        if (p?.schema !== 'talos.workflow-outcome.v1' || p.runId !== runId || typeof p.stato !== 'string' || !Array.isArray(p.passi)) return null
        const stato = Object.hasOwn(CHIAVI_RUN, p.stato) ? t(`agenti.workflow.runState.${CHIAVI_RUN[p.stato]}`, lingua) : p.stato
        return { titolo: typeof p.titolo === 'string' && p.titolo.trim() ? p.titolo.trim() : t('chat.queue.workflow', lingua), stato }
    } catch {
        return null
    }
}

/** `descriviDialogoAgente`: chi parla e che cosa chiede o risponde; mai il JSON, mai gli id. */
function dialogoAgente(testo: string, sessioneId: string | null, lingua: string): { titolo: string; testo: string } | null {
    if (testo.length > 1000000) return null
    try {
        const p = JSON.parse(testo.slice(testo.indexOf('\n') + 1)) as Record<string, unknown> | null
        if (p?.schema !== 'talos.agent-dialogue.v1' || typeof p.questionUntrusted !== 'string' || typeof p.requestId !== 'string') return null
        if (p.direction === 'child-to-parent') return { titolo: t('chat.queue.questionFromSubAgent', lingua), testo: p.questionUntrusted }
        if (p.direction !== 'parent-to-child') return null
        if (sessioneId && sessioneId === p.parentId) {
            const prefisso = `The child's answer to requestId ${p.requestId}: `
            const risposta = p.questionUntrusted.startsWith(prefisso) ? p.questionUntrusted.slice(prefisso.length) : p.questionUntrusted
            return { titolo: t('chat.queue.answerFromSubAgent', lingua), testo: risposta }
        }
        return { titolo: t('chat.queue.questionFromMainAgent', lingua), testo: p.questionUntrusted }
    } catch {
        return null
    }
}

/**
 * Il testo di una voce nella striscia. Della persona: ciò che ha scritto (la frase, non i file allegati), com'è nella chat. Di
 * sistema: la frase intera del desktop (`descriviCoda` → `titoloTesto` senza la spiegazione).
 */
export function testoVoceCodaR4(voce: unknown, opzioni: { sessioneId: string | null; lingua: string }): string {
    const v = statoCodaR4({ voci: [voce] }).voci[0]
    return v ? testoDellaVoce(v, opzioni) : ''
}

function testoDellaVoce(v: VoceCodaR4, { sessioneId, lingua }: { sessioneId: string | null; lingua: string }): string {
    if (!v.origine) return v.mostra ?? v.testo
    const delega = v.origine === 'delega' ? descriviRisultatoDelegaR4(v.testo, v.childId, lingua) : null
    const workflow = v.origine === 'workflow' ? esitoWorkflow(v.testo, v.runId, lingua) : null
    const dialogo = v.origine === 'agent-dialogue' ? dialogoAgente(v.testo, sessioneId, lingua) : null
    const origine = v.origine === 'delega' ? t('chat.queue.agentResultPrefix', lingua)
        : v.origine === 'workflow' ? t('chat.queue.workflowOutcomePrefix', lingua)
            : v.origine === 'sfondo' ? t('chat.queue.backgroundEndPrefix', lingua)
                : `${dialogo?.titolo ?? t('chat.queue.agentMessage', lingua)} · `
    const testo = delega ? `${delega.titolo}: ${delega.testo}` : workflow ? `${workflow.titolo}: ${workflow.stato}`
        : v.origine === 'workflow' ? t('chat.queue.workflow', lingua) : v.origine === 'sfondo' ? rigaSfondo(v.sfondo, lingua)
            : v.origine === 'agent-dialogue' ? (dialogo?.testo ?? '') : (v.mostra ?? v.testo)
    if (v.origine === 'agent-dialogue' && !testo.trim()) return origine.replace(/ · $/u, '')
    return `${origine}«${accorcia(testo, LUNGHEZZA_TITOLO)}»`
}

/**
 * Le voci per `TalosMobileCodaDelGiro`: con l'id (un'azione su una voce senza id non avrebbe a chi rivolgersi), il testo detto,
 * e `modificabile` solo per la persona (un risultato di un agente non si riscrive).
 */
export function vociDellaStrisciaR4(stato: unknown, { sessioneId, lingua, ora }: { sessioneId: string | null; lingua: string; ora: string }): TalosCodaVoce[] {
    return statoCodaR4(stato).voci.filter((v): v is VoceCodaR4 & { id: string } => typeof v.id === 'string' && v.id !== '')
        .map((v) => ({ id: v.id, testo: testoDellaVoce(v, { sessioneId, lingua }), creataAlle: ora, modificabile: !v.origine }))
}

/** L'azione della striscia (`descriviCoda`): a giro vivo la voce INDIRIZZA il giro (r4 la fa entrare come correzione), a giro fermo parte. */
export function azioneCodaR4(giroVivo: boolean): 'indirizza' | 'invia-ora' {
    return giroVivo ? 'indirizza' : 'invia-ora'
}

/**
 * ⛔ UI-113 (owner 29/10/2026 notte, «Come la riga del PC»): a chat ferma, con la coda non in pausa e fatta SOLO di risultati di agenti,
 * quei risultati non svegliano la chat (dopo uno Stop, contratto CONTRATTO-FERMA-TUTTE): partono col prossimo messaggio della persona.
 * Allora la riga sotto la coda lo dice, come la riga «Fermati N agenti» (PC `stopMenu.lineByYou`), invece di «Parte appena TALOS è libero».
 */
export function partonoColProssimoR4(stato: StatoCodaR4, giroVivo: boolean): boolean {
    return !giroVivo && !stato.inPausa && stato.voci.length > 0 && stato.voci.every((v) => v.origine === 'delega')
}
