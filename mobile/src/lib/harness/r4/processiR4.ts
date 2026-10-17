/**
 * ⛔ K3-C3b-2a (ledger `LEDGER-K3-CODICE-COME-LA-CHAT-2026-10-15.md`): la scheda Processi del pannello ▤ del Codice su r4.
 * COPIA FISSATA delle regole del desktop r4 @ `fc5e25d62`, provata contro il golden calcolato dalle funzioni vere
 * (`tests/fixtures/r4/processi-fc5e25d62.json`):
 *   · `components/inspector.js`: `STATI_PROCESSO` (:311), `TETTO_PROCESSI` (:371), `CHI_SFONDA` (:378), `uscitaDaTestoAttrezzo`
 *     (:396), `uscitaDelRisultato` (:411), `statoDaUscita` (:420), `datiProcesso` (:452), le voci del menu della riga (:704-725),
 *     `TESTI_RICHIESTA` e `richiestaConclusa` (:773-807), `testoRisorse` (:819), `comandoDagliArgomenti`,
 *     `descrizioneDagliArgomenti`, `processiDagliEventi` (:2049-2315), `statoProcesso`, `contaProcessiAttivi` (:1799-1818);
 *   · `components/esito-comando.js`: `provaSenzaSuite`, `provaSenzaTestEseguiti` (:261-272);
 *   · `legacy/app.js:20975-21036`: dall'evento AG-UI alla voce che `processiDagliEventi` legge (`eventoAttrezzoR4`).
 * Adattamenti dichiarati: (1) il Codice del telefono non ha ancora il comando diretto della persona (`!`), quindi `chi` è sempre
 * l'agente; (2) il pannello tiene solo gli eventi dei comandi che ha visto partire (il desktop li tiene tutti, ma
 * `processiDagliEventi` legge solo quelli): stesso risultato, meno memoria su una sessione lunga.
 */
import { analizzaComandoR4, type AnalisiComandoR4, type FamigliaR4 } from './comandoShellR4'
import processi from './testi/processi-scheda-r4.json'
import kernel from './testi/kernel-prova-r4.json'
import errori from './testi/errori-processi-r4.json'

type Tabella = { it: Record<string, string>; en: Record<string, string> }
const AREE: Record<string, Tabella> = { processi, kernel, errori }

const italiano = (lingua: string) => /^it(?:-|$)/iu.test(lingua)
const localeNumeri = (lingua: string) => (italiano(lingua) ? 'it-IT' : 'en-US')
const localeOra = (lingua: string) => (italiano(lingua) ? 'it-IT' : 'en-GB')
const propria = (t: Record<string, string>, k: string) => (Object.hasOwn(t, k) ? t[k] : undefined)

/** `t('processi.process.…' | 'processi.agents.…' | 'kernel.prova.…' | 'errori.<CODICE>.message')` di r4: la lingua, poi l'inglese. */
export function testoProcessiR4(chiave: string, lingua: string, valori?: Record<string, unknown>): string {
    const punto = chiave.indexOf('.')
    const area = AREE[chiave.slice(0, punto)]
    const nome = chiave.slice(punto + 1)
    if (!area) return chiave
    const frase = propria(italiano(lingua) ? area.it : area.en, nome) ?? propria(area.en, nome) ?? chiave
    if (!valori) return frase
    return frase.replace(/\{([a-zA-Z0-9_]+)\}/g, (tutto, k: string) => (k in valori ? String(valori[k]) : tutto))
}

const numero = (v: number, lingua: string, opzioni: Intl.NumberFormatOptions) => new Intl.NumberFormat(localeNumeri(lingua), opzioni).format(v)

// ---- gli stati ----
export type StatoProcessoR4 = 'in-coda' | 'in-avvio' | 'in-corso' | 'in-attesa' | 'in-consenso' | 'in-sfondo' | 'riuscito' | 'fallito'
    | 'annullato' | 'ucciso' | 'perso' | 'non-eseguito' | 'interrotto'
export type TonoR4 = '' | 'accent' | 'warning' | 'success' | 'danger'

/** Ogni stato porta la sua PAROLA oltre al tono: un colore da solo non dice niente a chi non distingue i colori. */
export const STATI_PROCESSO_R4: Readonly<Record<StatoProcessoR4, { chiave: string; tono: TonoR4; vivo: boolean }>> = Object.freeze({
    'in-coda': { chiave: 'processi.process.stateQueued', tono: '', vivo: true },
    'in-avvio': { chiave: 'processi.process.stateStarting', tono: 'accent', vivo: true },
    'in-corso': { chiave: 'processi.process.stateRunning', tono: 'accent', vivo: true },
    'in-attesa': { chiave: 'processi.process.stateWaiting', tono: 'warning', vivo: true },
    'in-consenso': { chiave: 'processi.process.stateAwaitingApproval', tono: 'warning', vivo: true },
    'in-sfondo': { chiave: 'processi.process.stateBackgrounded', tono: 'accent', vivo: true },
    riuscito: { chiave: 'processi.process.stateSucceeded', tono: 'success', vivo: false },
    fallito: { chiave: 'processi.process.stateFailed', tono: 'danger', vivo: false },
    annullato: { chiave: 'processi.process.stateCancelled', tono: '', vivo: false },
    ucciso: { chiave: 'processi.process.stateKilled', tono: 'warning', vivo: false },
    perso: { chiave: 'processi.process.stateLost', tono: '', vivo: false },
    'non-eseguito': { chiave: 'processi.process.stateNotRun', tono: 'warning', vivo: false },
    interrotto: { chiave: 'processi.process.stateInterrupted', tono: '', vivo: false },
})

/** Quante righe si mostrano prima di «Carica altri» (misurato dal desktop sulla sua colonna). */
export const TETTO_PROCESSI_R4 = 40

const CHI_SFONDA: Record<string, string> = {
    persona: 'processi.process.byYou',
    'tempo-scaduto': 'processi.process.byTimeout',
    modello: 'processi.process.byModel',
}
const SOGLIA_ATTESA_MS = 60_000
const RISOLUZIONE_ARRIVI_MS = 100

/** Il codice d'uscita scritto dal kernel in testa al contenuto: solo a inizio testo. */
export function uscitaDaTestoAttrezzoR4(testo: unknown): number | null {
    const t = typeof testo === 'string' ? testo : ''
    const m = /^\s*exit\s+(\d+)\b/u.exec(t)
    return m ? Number(m[1]) : null
}

/** Il codice d'uscita di un `ToolCallResult`: prima il campo `exitCode`, il testo solo come ripiego. */
export function uscitaDelRisultatoR4(evento: Record<string, unknown> | null | undefined): number | null {
    return Number.isInteger(evento?.exitCode) ? evento!.exitCode as number : uscitaDaTestoAttrezzoR4(evento?.content)
}

/** 130/143 fermato, 124/137 ucciso dal tempo o a forza, 127 mai partito. */
function statoDaUscita(uscita: number | null, errore: boolean): StatoProcessoR4 {
    if (uscita === 130 || uscita === 143) return 'annullato'
    if (uscita === 124 || uscita === 137) return 'ucciso'
    if (uscita === 127) return 'non-eseguito'
    if (errore === true) return 'fallito'
    if (!Number.isFinite(uscita)) return 'fallito'
    return uscita === 0 ? 'riuscito' : 'fallito'
}

export function provaSenzaSuiteR4(testo: unknown): boolean {
    return typeof testo === 'string' && /^\s*NOT RUN:/u.test(testo)
}
export function provaSenzaTestEseguitiR4(testo: unknown): boolean {
    return typeof testo === 'string' && /^\s*NOT RUN: NO_TESTS_RAN\b/u.test(testo)
}

// ---- dagli eventi AG-UI alle voci (`legacy/app.js:20975-21036`) ----
export type VoceAttrezzoR4 = Record<string, unknown> & { type: string; toolCallId: string }

/** Una voce per `processiDagliEventiR4`, o `null` se l'evento non le serve. `giro` è il numero dei giri visti (`runCount`). */
export function eventoAttrezzoR4(evento: Record<string, unknown>, { ricevutoA, giro, chi = 'agente' }: { ricevutoA: number; giro: number | null; chi?: 'agente' | 'tu' }): VoceAttrezzoR4 | null {
    const seq = Number.isFinite(evento._sequenza) ? { _sequenza: evento._sequenza } : {}
    const valore = evento.value as Record<string, unknown> | undefined
    const azione = evento.azione as Record<string, unknown> | undefined
    if (evento.type === 'ToolCallStart') {
        return { type: 'ToolCallStart', ...seq, toolCallId: evento.toolCallId as string, toolCallName: evento.toolCallName, ricevutoA,
            avviatoA: Number.isFinite(evento.avviatoA) ? evento.avviatoA : null, giro: giro || null, chi }
    }
    if (evento.type === 'ToolCallArgs') return { type: 'ToolCallArgs', ...seq, toolCallId: evento.toolCallId as string, delta: evento.delta }
    if (evento.type === 'ApprovalRequested' && typeof azione?.toolCallId === 'string') {
        return { type: 'ApprovalRequested', requestId: evento.requestId, toolCallId: azione.toolCallId }
    }
    // `ApprovalResolved` porta solo `requestId`: la riga la ritrova dalla richiesta (come il desktop, nessun `toolCallId` inventato)
    if (evento.type === 'ApprovalResolved') return { type: 'ApprovalResolved', requestId: evento.requestId, ricevutoA } as unknown as VoceAttrezzoR4
    if (evento.type === 'CUSTOM' && evento.name === 'talos.processo-sfondo' && typeof valore?.toolCallId === 'string') {
        return { type: 'ProcessoSfondoFinito', ...seq, toolCallId: valore.toolCallId, esito: valore.esito, codice: valore.codice,
            finitoAlle: Date.parse(String(valore.finitoAlle ?? '')), ...(valore.fermatoDallaPersona === true ? { fermatoDallaPersona: true } : {}) }
    }
    if (evento.type === 'CUSTOM' && evento.name === 'talos.processo-tolto' && typeof valore?.toolCallId === 'string') {
        return { type: 'ProcessoTolto', ...seq, toolCallId: valore.toolCallId }
    }
    if (evento.type === 'ToolCallResult') {
        const content = evento.content
        return {
            type: 'ToolCallResult', ...seq, toolCallId: evento.toolCallId as string, ricevutoA,
            errore: Boolean(evento.isError || evento.error), uscita: uscitaDelRisultatoR4(evento),
            durataMs: Number.isFinite(evento.durataMs) ? evento.durataMs : null,
            comando: typeof evento.comando === 'string' ? evento.comando : null,
            cwd: typeof evento.cwd === 'string' ? evento.cwd : null,
            rifiutato: typeof content === 'string' && /^\s*REFUSED\b/u.test(content),
            doppione: evento.duplicate === true,
            senzaSuite: provaSenzaSuiteR4(content),
            nessunTest: provaSenzaTestEseguitiR4(content),
            inSfondo: evento.inSfondo === true || (typeof content === 'string' && /^\s*IN BACKGROUND\b/u.test(content)),
            fileSfondo: typeof evento.fileSfondo === 'string' && evento.fileSfondo !== '' ? evento.fileSfondo : null,
            sfondoDa: typeof evento.sfondoDa === 'string' && evento.sfondoDa !== '' ? evento.sfondoDa : null,
        }
    }
    return null
}

// ---- dalle voci ai processi (`processiDagliEventi`) ----
export function comandoDagliArgomentiR4(testo = ''): string {
    try { const a = JSON.parse(testo); return String(a.command ?? a.comando ?? a.cmd ?? a.script ?? '').trim() } catch { return String(testo || '').trim() }
}
export function descrizioneDagliArgomentiR4(testo = ''): string {
    try { const a = JSON.parse(testo); return String(a.descrizione ?? a.description ?? '').trim() } catch { return '' }
}
const FAMIGLIA_DELL_ATTREZZO: Record<string, FamigliaR4> = { prova: 'test' }
/** Gli attrezzi che diventano una riga dei Processi. */
export const NOMI_COMANDO_R4 = Object.freeze(['shell', 'bash', 'esegui', 'comando', 'terminal', 'prova'])

export interface ProcessoGrezzoR4 {
    id: string; comando: string; descrizione: string; stato: StatoProcessoR4; chi: 'agente' | 'tu'; giro: number | null
    avviatoA: number | null; ricevutoA: number | null; famiglia: FamigliaR4 | null; durataMs: number | null; uscita: number | null
    cwd: string | null; fermoDaMs?: number; rifiutato?: boolean; nessunTest?: boolean; senzaSuite?: boolean; tolto?: boolean
    sequenzaSfondo?: number | null; fileSfondo?: string | null; sfondoDa?: string | null; durataSfondoMs?: number | null
}

export interface OpzioniProcessiR4 {
    adesso?: number; nomiComando?: readonly string[]; giroCorrente?: number | null; giroVivo?: boolean | null; sfondiNonSeguitiFinoA?: number | null
}

export function processiDagliEventiR4(eventi: VoceAttrezzoR4[] = [], { adesso = Date.now(), nomiComando = NOMI_COMANDO_R4, giroCorrente = null, giroVivo = null, sfondiNonSeguitiFinoA = null }: OpzioniProcessiR4 = {}): ProcessoGrezzoR4[] {
    const avviati = new Map<string, ProcessoGrezzoR4>()
    const argomenti = new Map<string, string>()
    const richiesteDiConsenso = new Map<unknown, string>()
    const lista: ProcessoGrezzoR4[] = []
    const sequenzeViste = new Set<number>()
    const usciteAnticipate = new Map<string, Record<string, unknown>>()
    const tolti = new Set<string>()
    const chiudiSfondo = (p: ProcessoGrezzoR4, e: Record<string, unknown>) => {
        if (e.fermatoDallaPersona === true) {
            p.stato = 'annullato'
            p.uscita = null
        } else {
            p.stato = e.esito === 'riuscito' ? 'riuscito' : e.esito === 'fallito' ? 'fallito' : 'ucciso'
            p.uscita = Number.isSafeInteger(e.codice) ? e.codice as number : null
        }
        const finito = e.finitoAlle as number
        p.durataSfondoMs = Number.isFinite(finito) && Number.isFinite(p.avviatoA) && finito >= (p.avviatoA as number) ? finito - (p.avviatoA as number) : null
        p.durataMs = p.durataSfondoMs
    }
    for (const e of eventi) {
        if (Number.isFinite(e?._sequenza)) {
            if (sequenzeViste.has(e._sequenza as number)) continue
            sequenzeViste.add(e._sequenza as number)
        }
        if (e.type === 'ApprovalRequested' && avviati.has(e.toolCallId)) {
            const p = avviati.get(e.toolCallId)!
            if (typeof e.requestId === 'string') richiesteDiConsenso.set(e.requestId, e.toolCallId)
            if (p.stato === 'in-avvio' || p.stato === 'in-corso') p.stato = 'in-consenso'
            continue
        }
        if (e.type === 'ProcessoTolto') {
            if (typeof e.toolCallId === 'string') tolti.add(e.toolCallId)
            continue
        }
        if (e.type === 'ProcessoSfondoFinito') {
            const p = avviati.get(e.toolCallId)
            if (p?.stato === 'in-sfondo') chiudiSfondo(p, e)
            else usciteAnticipate.set(e.toolCallId, e)
            continue
        }
        if (e.type === 'ApprovalResolved' && richiesteDiConsenso.has(e.requestId)) {
            const p = avviati.get(richiesteDiConsenso.get(e.requestId)!)
            if (p?.stato === 'in-consenso') {
                p.stato = 'in-corso'
                if (Number.isFinite(e.ricevutoA)) p.ricevutoA = e.ricevutoA as number
            }
            continue
        }
        if (e.type === 'ToolCallStart' && nomiComando.includes(e.toolCallName as string)) {
            if (avviati.has(e.toolCallId)) continue
            const p: ProcessoGrezzoR4 = {
                id: e.toolCallId, comando: '', descrizione: '', stato: 'in-avvio', chi: e.chi === 'tu' ? 'tu' : 'agente', giro: (e.giro as number) ?? null,
                avviatoA: Number.isFinite(e.avviatoA) ? e.avviatoA as number : ((e.ricevutoA as number) ?? null),
                ricevutoA: Number.isFinite(e.ricevutoA) ? e.ricevutoA as number : null,
                famiglia: FAMIGLIA_DELL_ATTREZZO[e.toolCallName as string] || null,
                durataMs: null, uscita: null, cwd: null,
            }
            avviati.set(e.toolCallId, p); argomenti.set(e.toolCallId, ''); lista.push(p)
        } else if (e.type === 'ToolCallArgs' && avviati.has(e.toolCallId)) {
            argomenti.set(e.toolCallId, (argomenti.get(e.toolCallId) || '') + String(e.delta ?? ''))
            const p = avviati.get(e.toolCallId)!
            p.comando = comandoDagliArgomentiR4(argomenti.get(e.toolCallId))
            p.descrizione = descrizioneDagliArgomentiR4(argomenti.get(e.toolCallId))
            if (p.stato === 'in-avvio' && p.comando) p.stato = 'in-corso'
        } else if (e.type === 'ToolCallResult' && avviati.has(e.toolCallId)) {
            const p = avviati.get(e.toolCallId)!
            p.uscita = Number.isFinite(e.uscita) ? e.uscita as number : (e.errore ? 1 : 0)
            p.stato = e.rifiutato === true || e.senzaSuite === true || e.doppione === true ? 'non-eseguito' : statoDaUscita(p.uscita, Boolean(e.errore))
            if (e.inSfondo === true && e.rifiutato !== true && e.senzaSuite !== true) {
                p.stato = 'in-sfondo'
                p.sequenzaSfondo = Number.isFinite(e._sequenza) ? e._sequenza as number : null
                p.fileSfondo = typeof e.fileSfondo === 'string' && e.fileSfondo !== '' ? e.fileSfondo : null
                p.sfondoDa = typeof e.sfondoDa === 'string' && e.sfondoDa !== '' ? e.sfondoDa : null
                p.uscita = null
                if (usciteAnticipate.has(e.toolCallId)) chiudiSfondo(p, usciteAnticipate.get(e.toolCallId)!)
            }
            usciteAnticipate.delete(e.toolCallId)
            if (Number.isFinite(e.durataMs) && (e.durataMs as number) >= 0) p.durataMs = Math.round(e.durataMs as number)
            else if (Number.isFinite(p.ricevutoA) && Number.isFinite(e.ricevutoA) && (e.ricevutoA as number) - (p.ricevutoA as number) >= RISOLUZIONE_ARRIVI_MS) p.durataMs = (e.ricevutoA as number) - (p.ricevutoA as number)
            if (e.inSfondo === true && e.rifiutato !== true && e.senzaSuite !== true) p.durataMs = p.durataSfondoMs ?? null
            if (!p.comando && typeof e.comando === 'string' && e.comando.trim()) {
                p.comando = e.comando.trim()
                if (p.stato === 'in-avvio') p.stato = 'in-corso'
            }
            if (typeof e.cwd === 'string' && e.cwd.trim()) p.cwd = e.cwd.trim()
            if (e.rifiutato === true) { p.rifiutato = true; p.durataMs = null; p.uscita = null }
            if (e.nessunTest === true) { p.nessunTest = true; p.uscita = null }
            else if (e.senzaSuite === true) { p.senzaSuite = true; p.durataMs = null; p.uscita = null }
        }
    }
    if (Number.isFinite(sfondiNonSeguitiFinoA)) {
        for (const p of lista) if (p.stato === 'in-sfondo' && Number.isFinite(p.sequenzaSfondo) && (p.sequenzaSfondo as number) <= (sfondiNonSeguitiFinoA as number)) p.stato = 'perso'
    }
    for (const p of lista) {
        if (!STATI_PROCESSO_R4[p.stato]?.vivo || p.stato === 'in-sfondo' || p.chi === 'tu') continue
        const superato = Number.isFinite(giroCorrente) && Number.isFinite(p.giro) && (giroCorrente as number) > (p.giro as number)
        if (!superato && giroVivo !== false) continue
        p.stato = 'interrotto'
        p.uscita = null
        p.durataMs = null
    }
    for (const p of lista) {
        if (!STATI_PROCESSO_R4[p.stato]?.vivo || !Number.isFinite(p.ricevutoA)) continue
        p.fermoDaMs = adesso - (p.ricevutoA as number)
        if (p.stato === 'in-corso' && p.fermoDaMs >= SOGLIA_ATTESA_MS) p.stato = 'in-attesa'
    }
    for (const p of lista) if (tolti.has(p.id)) p.tolto = true
    return lista.reverse()
}

/** Lo stato normalizzato in un posto solo (la riga e il numero sulla scheda leggono questo). */
export function statoProcessoR4(p: { stato?: unknown } = {}): StatoProcessoR4 {
    const s = p?.stato
    return typeof s === 'string' && s in STATI_PROCESSO_R4 ? s as StatoProcessoR4 : (s === 'ok' ? 'riuscito' : s === 'errore' ? 'fallito' : 'in-corso')
}

/** Il numero sulla scheda: ciò che GIRA (fuori `in-consenso`), ogni id una volta. */
export function contaProcessiAttiviR4(processi: { id?: unknown; stato?: unknown }[] = []): number {
    const vivi = new Set<unknown>()
    for (const p of Array.isArray(processi) ? processi : []) {
        const stato = statoProcessoR4(p)
        if (stato !== 'in-consenso' && STATI_PROCESSO_R4[stato]?.vivo === true) vivi.add(p?.id ?? p)
    }
    return vivi.size
}

// ---- la riga pronta (`datiProcesso`) ----
export type RigaDettaglioR4 = [string, string] | [string, string, 'lungo']
export interface ProcessoR4 {
    id: string | null; comando: string; descrizione: string; analisi: AnalisiComandoR4; famiglia: FamigliaR4; stato: StatoProcessoR4
    etichetta: string; tono: TonoR4; vivo: boolean; chi: string; misura: string; fermo: string | null; quando: string; cartella: string
    pid: string; uscita: number | null; dettaglio: RigaDettaglioR4[]
}

function oraConSecondi(ms: number | null, lingua: string): string {
    if (!Number.isFinite(ms)) return '—'
    const t = new Date(ms as number)
    return Number.isNaN(t.getTime()) ? '—' : t.toLocaleTimeString(localeOra(lingua), { hour: '2-digit', minute: '2-digit', second: '2-digit' })
}

export function datiProcessoR4(p: ProcessoGrezzoR4, lingua: string): ProcessoR4 {
    const tr = (k: string, v?: Record<string, unknown>) => testoProcessiR4(k, lingua, v)
    const stato = statoProcessoR4(p)
    const descrittore = STATI_PROCESSO_R4[stato]
    const etichetta = tr(descrittore.chiave)
    const num = (v: number) => numero(v, lingua, { maximumFractionDigits: 1 })
    const durata = Number.isFinite(p.durataMs) && (p.durataMs as number) >= 0
        ? ((p.durataMs as number) < 100 ? `<${num(0.1)} s` : `${num((p.durataMs as number) / 1000)} s`)
        : null
    const misura = stato === 'non-eseguito' && p.rifiutato === true
        ? tr('processi.process.deniedByYou')
        : stato === 'non-eseguito' && p.nessunTest === true ? [tr('kernel.prova.nessunTestBreve'), durata].filter(Boolean).join(' · ')
            : stato === 'non-eseguito' && p.senzaSuite === true ? tr('processi.process.noTestSuite')
                : [durata, !descrittore.vivo && Number.isFinite(p.uscita) ? tr('processi.process.exitCode', { codice: p.uscita }) : null].filter(Boolean).join(' · ') || (descrittore.vivo ? '' : '—')
    const chi = p.chi === 'tu' ? tr('processi.process.whoYou') : tr('processi.process.whoAgent', { giro: p.giro ?? '—' })
    const fermo = stato !== 'in-sfondo' && Number.isFinite(p.fermoDaMs) && (p.fermoDaMs as number) >= SOGLIA_ATTESA_MS
        ? tr('processi.process.silent', { secondi: Math.round((p.fermoDaMs as number) / 1000) })
        : null
    const analisi = analizzaComandoR4(p.comando || '')
    const cartella = typeof p.cwd === 'string' && p.cwd.trim() ? p.cwd.trim() : '—'
    const quando = oraConSecondi(p.avviatoA, lingua)
    const dettaglio: RigaDettaglioR4[] = [
        [tr('processi.process.detailCommand'), p.comando || '—', 'lungo'],
        [tr('processi.process.detailStatus'), etichetta],
        [tr('processi.process.detailStarted'), quando],
        [tr('processi.process.detailDuration'), durata || '—'],
        [tr('processi.process.detailExit'), Number.isFinite(p.uscita) && !descrittore.vivo ? String(p.uscita) : '—'],
        ...(p.fileSfondo ? [[tr('processi.process.detailOutputFile'), p.fileSfondo, 'lungo'] as RigaDettaglioR4] : []),
        ...(p.sfondoDa ? [[tr('processi.process.detailBackgroundedBy'), CHI_SFONDA[p.sfondoDa] ? tr(CHI_SFONDA[p.sfondoDa]) : p.sfondoDa] as RigaDettaglioR4] : []),
        [tr('processi.process.detailFolder'), cartella],
        [tr('processi.process.detailPid'), '—'],
        [tr('processi.process.detailWho'), chi],
        [tr('processi.process.detailDescription'), typeof p.descrizione === 'string' && p.descrizione.trim() ? p.descrizione.trim() : '—', 'lungo'],
    ]
    return {
        id: p.id ?? null,
        comando: p.comando || '—',
        descrizione: typeof p.descrizione === 'string' ? p.descrizione.trim() : '',
        analisi,
        famiglia: p.famiglia || analisi.famiglia,
        stato,
        etichetta,
        tono: descrittore.tono,
        vivo: descrittore.vivo,
        chi,
        misura,
        fermo,
        quando,
        cartella,
        pid: '—',
        uscita: Number.isFinite(p.uscita) ? p.uscita : null,
        dettaglio,
    }
}

// ---- le azioni della riga (`vociDellaRiga`, `TESTI_RICHIESTA`, `richiestaConclusa`) ----
export type AzioneProcessoR4 = 'sfonda' | 'ferma' | 'togli'
const FERMABILE = new Set<StatoProcessoR4>(['in-corso', 'in-attesa'])
const FERMABILE_O_SFONDO = new Set<StatoProcessoR4>([...FERMABILE, 'in-sfondo'])
const TOGLIBILE = new Set<StatoProcessoR4>(['riuscito', 'fallito', 'annullato', 'ucciso', 'non-eseguito', 'interrotto', 'perso'])

/** Le voci del menu «…» di una riga, nell'ordine del desktop: Sfonda, Ferma (pericolo), Togli. */
export function vociDellaRigaR4(stato: StatoProcessoR4): AzioneProcessoR4[] {
    const voci: AzioneProcessoR4[] = []
    if (FERMABILE.has(stato)) voci.push('sfonda')
    if (FERMABILE_O_SFONDO.has(stato)) voci.push('ferma')
    if (TOGLIBILE.has(stato)) voci.push('togli')
    return voci
}
export const ETICHETTA_AZIONE_R4: Readonly<Record<AzioneProcessoR4, string>> = Object.freeze({
    sfonda: 'processi.process.background', ferma: 'processi.process.stop', togli: 'processi.process.remove',
})
export const TESTI_RICHIESTA_R4: Readonly<Record<AzioneProcessoR4, { parte: string; no: string; muto: string }>> = Object.freeze({
    ferma: { parte: 'processi.process.stopping', no: 'processi.process.notStopped', muto: 'processi.process.didNotStop' },
    sfonda: { parte: 'processi.process.backgrounding', no: 'processi.process.notBackgrounded', muto: 'processi.process.didNotBackground' },
    togli: { parte: 'processi.process.removing', no: 'processi.process.notRemoved', muto: 'processi.process.didNotRemove' },
})
/** Dopo quanto, senza l'esito vero, la riga dice «non si è fermato» (il desktop: 8 s). */
export const ATTESA_FERMATA_MS_R4 = 8_000

/** La richiesta è conclusa quando lo stato vero della riga lo dice (lo Stop: non più fermabile; lo Sfondo: non più in primo piano). */
export function richiestaConclusaR4(azione: AzioneProcessoR4, stato: StatoProcessoR4): boolean {
    if (azione === 'ferma') return !FERMABILE_O_SFONDO.has(stato)
    if (azione === 'sfonda') return !FERMABILE.has(stato)
    return false
}

/** Il perché di un rifiuto del server (busta d'errore di r4), con le parole del desktop; `null` se non lo sa dire. */
export function motivoDelRifiutoR4(corpo: string, lingua: string): string | null {
    try {
        const codice = (JSON.parse(corpo) as { error?: { code?: unknown } })?.error?.code
        if (typeof codice !== 'string') return null
        const frase = testoProcessiR4(`errori.${codice}.message`, lingua)
        return frase === `errori.${codice}.message` ? null : frase
    } catch {
        return null
    }
}

// ---- le risorse (`testoRisorse`) ----
export interface RisorsaR4 { cpuPercento: number | null; memoriaByte: number | null }

function percentoCpu(n: number, lingua: string): string {
    try { return numero(n / 100, lingua, { style: 'percent', maximumFractionDigits: n < 10 ? 1 : 0 }) } catch { return `${n}%` }
}
function memoriaLeggibile(byte: number, lingua: string): string {
    const mb = byte / 1_048_576
    const cifre = (v: number, decimali: number) => numero(v, lingua, { maximumFractionDigits: decimali })
    return mb >= 1024 ? `${cifre(mb / 1024, 1)} GB` : `${cifre(mb, mb < 10 ? 1 : 0)} MB`
}

/** CPU e memoria di una riga viva, o «non misurate»; vuoto per una riga finita. */
export function testoRisorseR4(p: { id: string | null; stato: StatoProcessoR4 }, risorse: Map<string, RisorsaR4> | null, lingua: string): string {
    if (!(risorse instanceof Map) || !FERMABILE_O_SFONDO.has(p.stato)) return ''
    const m = risorse.get(String(p.id ?? ''))
    if (!m || !Number.isFinite(m.memoriaByte)) return testoProcessiR4('processi.process.resourcesNone', lingua)
    const memoria = memoriaLeggibile(m.memoriaByte as number, lingua)
    return Number.isFinite(m.cpuPercento) ? testoProcessiR4('processi.process.resources', lingua, { cpu: percentoCpu(m.cpuPercento as number, lingua), memoria }) : memoria
}
