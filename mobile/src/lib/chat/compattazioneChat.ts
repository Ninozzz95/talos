import type { ChatTurn } from '@/stores/chat'
import type { TalosLocalChatMessage } from '@/repositories/chatRepository'
import {
    applicaRecord,
    calcolaSoglie,
    costruisciRichiestaDiRiassunto,
    decidiCompattazione,
    eRecordValido,
    stimaTokenMessaggi,
    type TalosMessaggioCompattabile,
    type TalosPartiCompattazione,
    type TalosRecordCompattazione,
} from '@/lib/kernel/compattazione'

/*
 * ⭐⭐ P4-ter passo 2 (02/10/2026) — la compattazione della CHAT sopra il nucleo condiviso del passo 1
 * (`src/lib/kernel/compattazione.ts`, lo stesso del Codice).
 *
 * Decisioni dell'owner (ledger `LEDGER-P4TER-COMPATTATORE-2026-10-02.md`):
 * - «Una riga nella storia»: la compattazione è una riga `system` nel punto esatto in cui è successa, col record e i
 *   numeri (Claude Code: `system`/`compact_boundary` con `compact_metadata`, doc code.claude.com/docs/en/agent-sdk/skills).
 *   Il modello non la riceve mai: `talosTurniDallaStoria` passa solo user/assistant/tool (`storiaConLeChiamate.ts:228`).
 *   «Annulla» è una seconda riga, mai una riscrittura: la storia della chat è solo in aggiunta.
 * - La storia grezza resta intera su disco; al modello va la PROIEZIONE (`applicaRecord` del nucleo).
 * - Locale: il riassunto si chiede IN CODA alla conversazione viva, allo stesso modello, col prefisso identico ⇒ il motore
 *   riusa la cache (Gallery `SummarizationContextCompactor.kt:105-150`, `talos_llama_jni.cpp:155-161`).
 */

import { TALOS_METADATA_COMPATTAZIONE, TALOS_METADATA_COMPATTAZIONE_ANNULLATA } from '@/lib/chat/compattazioneChiavi'
export { TALOS_METADATA_COMPATTAZIONE, TALOS_METADATA_COMPATTAZIONE_ANNULLATA }

/** Ciò che la riga di compattazione porta nei metadati. */
export interface TalosCompattazioneChat {
    record: TalosRecordCompattazione
    /** Id dell'ultimo messaggio coperto dal riassunto. */
    ultimoCoperto: string
    /** Quante righe user/assistant/tool c'erano fino a lui: se cambia, la storia coperta non è più quella riassunta. */
    righeCoperte: number
}

const RUOLI_DEL_MODELLO = new Set(['user', 'assistant', 'tool'])
const eDelModello = (riga: TalosLocalChatMessage): boolean => RUOLI_DEL_MODELLO.has(riga.role)

/*
 * ⛔ Il turno originale viaggia NASCOSTO dentro il messaggio del nucleo: i blocchi del fornitore vanno rimandati
 * «unmodified» (Anthropic) e gli allegati non hanno una forma nel nucleo. Tornando indietro, un messaggio che lo porta
 * torna identico; uno nato nel nucleo (il riassunto, l'indice) diventa un turno semplice.
 */
const TURNO_ORIGINALE = '__turnoChat'

export function turniVersoNucleo(turni: readonly ChatTurn[]): TalosMessaggioCompattabile[] {
    return turni.map((turno) => ({
        role: turno.role,
        content: turno.content,
        ...(turno.toolCalls?.length
            ? { tool_calls: turno.toolCalls.map((c) => ({ id: c.id, type: 'function' as const, function: { name: c.name, arguments: c.arguments } })) }
            : {}),
        ...(turno.toolCallId ? { tool_call_id: turno.toolCallId } : {}),
        ...(turno.toolName ? { name: turno.toolName } : {}),
        [TURNO_ORIGINALE]: turno,
    }))
}

export function nucleoVersoTurni(messaggi: readonly TalosMessaggioCompattabile[]): ChatTurn[] {
    return messaggi.map((m) => {
        const originale = m[TURNO_ORIGINALE] as ChatTurn | undefined
        if (originale) return originale
        const role: ChatTurn['role'] = m.role === 'assistant' || m.role === 'tool' ? m.role : 'user'
        return { role, content: typeof m.content === 'string' ? m.content : String(m.content ?? '') }
    })
}

function datiDellaRiga(riga: TalosLocalChatMessage): TalosCompattazioneChat | null {
    const dati = riga.metadata?.[TALOS_METADATA_COMPATTAZIONE] as Partial<TalosCompattazioneChat> | undefined
    if (!dati || !eRecordValido(dati.record) || typeof dati.ultimoCoperto !== 'string' || !Number.isInteger(dati.righeCoperte)) return null
    return dati as TalosCompattazioneChat
}

/** `at` delle compattazioni annullate da una riga successiva. */
export function compattazioniAnnullate(righe: readonly TalosLocalChatMessage[]): Set<string> {
    const annullate = new Set<string>()
    for (const riga of righe) {
        const at = (riga.metadata?.[TALOS_METADATA_COMPATTAZIONE_ANNULLATA] as { at?: unknown } | undefined)?.at
        if (typeof at === 'string' && at) annullate.add(at)
    }
    return annullate
}

/**
 * La compattazione che vale adesso: l'ultima riga di compattazione non annullata, purché la storia che copre sia ancora
 * quella riassunta — l'ultimo messaggio coperto esiste e le righe del modello fino a lui sono ancora `righeCoperte`.
 * Un turno cancellato o riscritto la scarta: un riassunto non si applica mai a un'altra storia.
 */
export function compattazioneAttiva(righe: readonly TalosLocalChatMessage[]): TalosCompattazioneChat | null {
    const annullate = compattazioniAnnullate(righe)
    for (let i = righe.length - 1; i >= 0; i -= 1) {
        const dati = datiDellaRiga(righe[i]!)
        if (!dati) continue
        if (annullate.has(dati.record.at)) return null
        const prima = righe.slice(0, i).filter(eDelModello)
        const posizione = prima.findIndex((r) => r.id === dati.ultimoCoperto)
        if (posizione < 0 || posizione + 1 !== dati.righeCoperte) return null
        return dati
    }
    return null
}

/** La proiezione: i turni coperti diventano il riassunto, i nuovi seguono alla lettera. */
export function applicaCompattazioneChat(turni: readonly ChatTurn[], attiva: TalosCompattazioneChat | null): ChatTurn[] {
    if (!attiva) return [...turni]
    return nucleoVersoTurni(applicaRecord(turniVersoNucleo(turni), attiva.record))
}

/*
 * Locale, come Gallery (`SummarizationContextCompactor.kt:99-109`): parole = min(max(rimasti × 0,75, 50), 1000), la
 * domanda allo stesso modello in coda ai turni identici.
 */
const PAROLE_MINIME = 50
const PAROLE_MASSIME = 1_000
const PAROLE_PER_TOKEN = 0.75

export function paroleDelRiassunto(tokenRimasti: number): number {
    const stima = Number.isFinite(tokenRimasti) ? Math.floor(tokenRimasti * PAROLE_PER_TOKEN) : PAROLE_MASSIME
    return Math.min(Math.max(stima, PAROLE_MINIME), PAROLE_MASSIME)
}

export function richiestaInCoda(turni: readonly ChatTurn[], { tokenRimasti }: { tokenRimasti: number }): ChatTurn[] {
    const parole = paroleDelRiassunto(tokenRimasti)
    return [
        ...turni,
        {
            role: 'user',
            content: `Summarize the core points of our conversation so far in less than ${parole} words, ensuring no important `
                + 'context is lost: what the person asked, what was decided, what was done, open questions, and any names, '
                + 'numbers, files or dates that matter. Write the summary in the language of the conversation.',
        },
    ]
}

/*
 * ⛔ Verso il riassuntore remoto: SOLO i campi del nucleo (già oscurati da `costruisciRichiestaDiRiassunto`), mai il turno
 * originale nascosto — riporterebbe il testo in chiaro che l'oscuramento ha appena tolto (CHAT-COMP-07).
 */
function nucleoVersoTurniNudi(messaggi: readonly TalosMessaggioCompattabile[]): ChatTurn[] {
    return messaggi.map((m) => {
        const role: ChatTurn['role'] = m.role === 'assistant' || m.role === 'tool' ? m.role : 'user'
        const turno: ChatTurn = { role, content: typeof m.content === 'string' ? m.content : String(m.content ?? '') }
        if (Array.isArray(m.tool_calls) && m.tool_calls.length > 0) {
            turno.toolCalls = m.tool_calls.map((c) => ({ id: c.id, name: c.function.name, arguments: c.function.arguments }))
        }
        if (typeof m.tool_call_id === 'string') turno.toolCallId = m.tool_call_id
        if (typeof m.name === 'string') turno.toolName = m.name
        return turno
    })
}

/** I parametri dell'ultimo giro di una chat, ricordati dal controller solo in memoria (mai la chiave). */
export interface TalosUltimoGiroChat {
    system?: string
    tools?: readonly unknown[]
    effort: string
    thinking: boolean
    locale?: string | null
}

export interface TalosRichiestaDiRiassunto {
    modo: 'in-coda' | 'separata'
    turns: ChatTurn[]
    system?: string
    tools?: readonly unknown[]
}

/* ═══════════════ la parte da riassumere limitata al tetto (REG-COMP-10, owner 02/10 «A parte, se non ci sta») ═══════════════ */

/** Quante fette uniformi si tengono quando la parte da riassumere non ci sta (Hermes `_SAMPLED_INPUT_SLICES = 8`). */
const FETTE_CAMPIONATE = 8
const SEPARATORE_SEGNAPOSTO = '\n\n'

const segnaposto = (omessi: number) => `[… ${omessi} scambi omessi per stare nel contesto del dispositivo …]`

function caratteriDi(m: TalosMessaggioCompattabile): number {
    const testo = typeof m.content === 'string' ? m.content.length : JSON.stringify(m.content ?? '').length
    return testo + (m.tool_calls?.length ? JSON.stringify(m.tool_calls).length : 0)
}

/** Uno SCAMBIO: un messaggio `user` e tutto ciò che lo segue fino al prossimo `user` (risposte, chiamate, risultati). */
function scambiDi(messaggi: readonly TalosMessaggioCompattabile[]): TalosMessaggioCompattabile[][] {
    const scambi: TalosMessaggioCompattabile[][] = []
    for (const m of messaggi) {
        if (m.role === 'user' || scambi.length === 0) scambi.push([m])
        else scambi.at(-1)!.push(m)
    }
    return scambi
}

/** Uno scambio troppo grande per la sua fetta si accorcia nel MEZZO di ogni testo, con un segnaposto dentro. */
function scambioNelBudget(scambio: TalosMessaggioCompattabile[], budget: number): TalosMessaggioCompattabile[] {
    const totale = scambio.reduce((n, m) => n + caratteriDi(m), 0)
    if (totale <= budget) return scambio
    const quota = Math.max(80, Math.floor(budget / scambio.length))
    return scambio.map((m) => {
        if (typeof m.content !== 'string' || m.content.length <= quota) return m
        const omessi = m.content.length - quota
        const meta = Math.floor((quota - 40) / 2)
        return { ...m, content: `${m.content.slice(0, meta)} […${omessi} caratteri omessi…] ${m.content.slice(-meta)}` }
    })
}

/**
 * ⭐⭐ La parte da riassumere limitata a `budgetCaratteri`, ADATTATA da Hermes (`agent/context_compressor.py:3703-3790`):
 * fette uniformi lungo la conversazione, l'ultima ancorata allo scambio più recente, uno scambio troppo grande accorciato
 * dentro la sua fetta, un segnaposto dove si è saltato. Due differenze volute:
 * - si taglia per SCAMBI interi (un `user` e ciò che lo segue), mai a metà: i modelli locali ricevono i turni col loro
 *   modello di chat, e due `user` di fila o un risultato d'attrezzo senza la sua chiamata possono farlo rifiutare;
 * - il segnaposto entra nel testo del primo messaggio tenuto dopo il salto, non come messaggio a sé (stessa ragione).
 * Il primo scambio resta intero quando ci sta nella sua fetta: è la richiesta da cui la conversazione è partita.
 */
export function campionaPerIlTetto(messaggi: readonly TalosMessaggioCompattabile[], budgetCaratteri: number): TalosMessaggioCompattabile[] {
    const totale = messaggi.reduce((n, m) => n + caratteriDi(m), 0)
    if (totale <= budgetCaratteri) return [...messaggi]
    const scambi = scambiDi(messaggi)
    const n = Math.max(1, Math.min(FETTE_CAMPIONATE, scambi.length))
    const spesaSegnaposti = (segnaposto(scambi.length).length + SEPARATORE_SEGNAPOSTO.length) * (n - 1)
    const fetta = Math.max(1, Math.floor((budgetCaratteri - spesaSegnaposti) / n))
    const visti = scambi.map((s) => scambioNelBudget(s, fetta))
    const pesi = visti.map((s) => s.reduce((k, m) => k + caratteriDi(m), 0))

    const scelte: Array<[number, number]> = []
    for (let i = 0; i < n; i += 1) {
        let inizio = Math.round((i * scambi.length) / n)
        let fine: number
        if (i === n - 1) {
            fine = scambi.length
            inizio = fine - 1
            let peso = pesi[inizio]!
            while (inizio > 0 && peso + pesi[inizio - 1]! <= fetta) { inizio -= 1; peso += pesi[inizio]! }
        } else {
            fine = inizio
            let peso = 0
            while (fine < scambi.length && (peso === 0 || peso + pesi[fine]! <= fetta)) { peso += pesi[fine]!; fine += 1 }
        }
        if (fine > inizio) scelte.push([inizio, fine])
    }
    const unite: Array<[number, number]> = []
    for (const [a, b] of scelte) {
        const ultima = unite.at(-1)
        if (ultima && a <= ultima[1]) ultima[1] = Math.max(ultima[1], b)
        else unite.push([a, b])
    }

    const campione: TalosMessaggioCompattabile[] = []
    let cursore = 0
    for (const [a, b] of unite) {
        const tenuti = visti.slice(a, b).flat()
        if (a > cursore && tenuti.length > 0) {
            const primo = tenuti[0]!
            const testo = typeof primo.content === 'string' ? primo.content : String(primo.content ?? '')
            tenuti[0] = { ...primo, content: `${segnaposto(a - cursore)}${SEPARATORE_SEGNAPOSTO}${testo}` }
        }
        campione.push(...tenuti)
        cursore = b
    }
    return campione
}

/**
 * Quale richiesta di riassunto parte (decisione owner 02/10):
 * - locale con l'ultimo giro in memoria ⇒ IN CODA alla conversazione viva, con lo stesso sistema e gli stessi attrezzi
 *   dell'ultimo giro: il prefisso è identico e il motore riusa la cache (una chiamata d'attrezzo vale «non riuscito»);
 * - fornitori remoti, o locale senza giro in memoria (dopo un riavvio) ⇒ la richiesta SEPARATA del nucleo: testa + mezzo
 *   oscurati + le istruzioni, senza attrezzi (+1 su Hermes);
 * - ⛔ locale quando la coda NON ci sta nel tetto (REG-COMP-10, owner «A parte, se non ci sta»): `inCoda: false` ⇒ la
 *   separata, col mezzo limitato a `budgetCaratteri` da `campionaPerIlTetto` e il riassunto entro `paroleMassime` (la
 *   risposta deve stare nella riserva d'uscita del motore, se no torna «troncato»).
 */
export function richiestaDiRiassunto({ provider, turni, parti, ultimoGiro, tokenRimasti = Number.POSITIVE_INFINITY, inCoda = true, budgetCaratteri, paroleMassime }: {
    provider: string
    turni: readonly ChatTurn[]
    parti: TalosPartiCompattazione
    ultimoGiro: TalosUltimoGiroChat | null
    tokenRimasti?: number
    inCoda?: boolean
    budgetCaratteri?: number
    paroleMassime?: number
}): TalosRichiestaDiRiassunto {
    if (provider === 'local' && ultimoGiro && inCoda) {
        return {
            modo: 'in-coda',
            turns: richiestaInCoda(turni, { tokenRimasti }),
            ...(ultimoGiro.system !== undefined ? { system: ultimoGiro.system } : {}),
            ...(ultimoGiro.tools !== undefined ? { tools: ultimoGiro.tools } : {}),
        }
    }
    const mezzo = budgetCaratteri !== undefined ? campionaPerIlTetto(parti.mezzo, budgetCaratteri) : parti.mezzo
    return {
        modo: 'separata',
        turns: nucleoVersoTurniNudi(costruisciRichiestaDiRiassunto({
            testa: parti.testa,
            mezzo,
            ...(paroleMassime !== undefined ? { paroleMassime } : {}),
        })),
    }
}

/**
 * I token della conversazione dopo una risposta: la richiesta più la risposta, coi nomi dei vari fornitori (OpenAI/
 * OpenRouter `prompt_tokens`, Anthropic `input_tokens`, Gemini `promptTokenCount`). `null` se il fornitore non l'ha detto.
 */
export function tokenDellaRisposta(usage: Readonly<Record<string, number>> | null | undefined): number | null {
    if (!usage) return null
    const prompt = Number(usage.prompt_tokens ?? usage.input_tokens ?? usage.promptTokens ?? usage.promptTokenCount)
    if (!Number.isFinite(prompt) || prompt <= 0) return null
    const risposta = Number(usage.completion_tokens ?? usage.output_tokens ?? usage.completionTokens ?? usage.candidatesTokenCount)
    return prompt + (Number.isFinite(risposta) && risposta > 0 ? risposta : 0)
}

/** Solo la richiesta (senza la risposta), coi nomi dei fornitori: serve a TARARE la stima sul numero vero. */
export function tokenDellaRichiesta(usage: Readonly<Record<string, number>> | null | undefined): number | null {
    const prompt = Number(usage?.prompt_tokens ?? usage?.input_tokens ?? usage?.promptTokens ?? usage?.promptTokenCount)
    return Number.isFinite(prompt) && prompt > 0 ? prompt : null
}

/**
 * La stima della richiesta INTERA (sistema, schemi degli attrezzi, turni) a quattro caratteri per token: da sola non è
 * «precisa», ma il rapporto fra il numero vero del fornitore e questa stima, preso sull'ultima richiesta, la tara.
 */
export function stimaRichiesta({ turni, system, tools }: { turni: readonly ChatTurn[], system?: string, tools?: readonly unknown[] }): number {
    const schemi = tools?.length ? Math.ceil(JSON.stringify(tools).length / 4) : 0
    return stimaTokenMessaggi(turniVersoNucleo(turni)) + Math.ceil((system ?? '').length / 4) + schemi
}

export interface TalosDecisioneCompattazioneChat {
    scatta: boolean
    motivo: 'soglia' | 'emergenza' | null
    token: number
    soglia: number
    misura: 'fornitore' | 'stimato'
}

/** Il numero vero dell'ultima risposta (`promptTokens`) quando c'è, altrimenti la stima dei turni. */
export function decidiCompattazioneChat({ turni, finestraToken, riservaUscita, tettoToken, promptTokens }: {
    turni: readonly ChatTurn[]
    finestraToken: number | null
    riservaUscita: number | null
    tettoToken: number | null
    promptTokens: number | null
}): TalosDecisioneCompattazioneChat {
    const soglie = calcolaSoglie({ tettoToken, finestraToken, riservaUscita })
    const vero = Number.isFinite(promptTokens) && (promptTokens as number) > 0
    const token = vero ? promptTokens as number : stimaTokenMessaggi(turniVersoNucleo(turni))
    const decisione = decidiCompattazione({ token, soglia: soglie.soglia, emergenza: soglie.emergenza })
    return { ...decisione, token, soglia: soglie.soglia, misura: vero ? 'fornitore' : 'stimato' }
}
