/**
 * ⛔ K3-C3b-2b (ledger `LEDGER-K3-CODICE-COME-LA-CHAT-2026-10-15.md`): la scheda Agenti del pannello ▤ del Codice su r4.
 * COPIA FISSATA delle regole del desktop r4 @ `701c6c0d2` (prima `2161afb32`, con L3-15, il conto della richiesta; poi L3-17, il nome
 * dell'agente), provata contro il golden calcolato dalle funzioni vere (`tests/fixtures/r4/agenti-4cee78f33.json` — ricalcolato @ 4cee78f33: identico a 701c6c0d2 salvo la tabella dei nomi degli attrezzi,
 * 18 voci in più —, `nome-motivi-701c6c0d2.json`):
 *   · `components/grafo-agenti.js` `modelloGrafoAgenti`: chi c'è (la sessione e TUTTI i suoi discendenti), quanti figli ha ognuno;
 *   · `components/grafo/run-dalle-deleghe.js` `runDalleDeleghe`: i lotti di nascita per padre (finestra 20 s) e la richiesta di ogni
 *     lotto (quella che lo precede per la sessione, quella del padre per gli altri) — solo la parte che serve al pannello;
 *   · `legacy/app.js` `agentiPerInspector` (:11231), `annotaRichiestaDellaPersona` (:20724, regola della rigiocata), `applicaEventoAgenti`
 *     (:11243, l'evento `talos.agenti`);
 *   · `components/inspector.js` `statoDelega` (:1762), `etichettaDelega` (:1770), `contaAgentiAttivi` (:1803), i testi della riga;
 *   · `components/nomi-attrezzi.js` `nomeUmanoAttrezzo`, `nomeDiRipiegoAttrezzo`; `components/testo-a-schermo.js`.
 * Adattamento dichiarato: le richieste prendono l'ora sempre con la regola della rigiocata (`at`, poi il primo `avviatoA`); il desktop
 * dal vivo usa l'orologio di adesso. Una richiesta che delega ha sempre l'avvio della delega, quindi i gruppi sono gli stessi.
 */
import processi from './testi/processi-scheda-r4.json'
import agenti from './testi/agenti-scheda-r4.json'
import varie from './testi/varie-attrezzi-r4.json'
import nomi from './testi/nomi-attrezzi-r4.json'

type Tabella = { it: Record<string, string>; en: Record<string, string> }
const AREE: Record<string, Tabella> = { processi, agenti, varie }
const italiano = (lingua: string) => /^it(?:-|$)/iu.test(lingua)
const propria = (t: Record<string, string>, k: string) => (Object.hasOwn(t, k) ? t[k] : undefined)

/** `t('processi.agents.…' | 'agenti.…' | 'varie.tools.name.…')` di r4: la lingua, poi l'inglese. */
export function testoAgentiR4(chiave: string, lingua: string, valori?: Record<string, unknown>): string {
    const punto = chiave.indexOf('.')
    const area = AREE[chiave.slice(0, punto)]
    const nome = chiave.slice(punto + 1)
    if (!area) return chiave
    const frase = propria(italiano(lingua) ? area.it : area.en, nome) ?? propria(area.en, nome) ?? chiave
    if (!valori) return frase
    return frase.replace(/\{([a-zA-Z0-9_]+)\}/g, (tutto, k: string) => (k in valori ? String(valori[k]) : tutto))
}
/** `tn(uno, molti, n, valori)` di r4: la forma la sceglie `n`, i valori possono sostituire `{n}` col numero già scritto. */
export function pluraleAgentiR4(uno: string, molti: string, n: number, lingua: string, valori?: Record<string, unknown>): string {
    const regole = new Intl.PluralRules(italiano(lingua) ? 'it' : 'en')
    return testoAgentiR4(regole.select(Number(n)) === 'one' ? uno : molti, lingua, { n, ...(valori ?? {}) })
}
/** I conti degli agenti sempre raggruppati nella lingua (decisione owner del 23/09: «5.000», «5,000»). */
export function conteggioAgentiR4(n: number, lingua: string): string {
    try { return new Intl.NumberFormat(italiano(lingua) ? 'it-IT' : 'en-US', { useGrouping: 'always' } as unknown as Intl.NumberFormatOptions).format(n) } catch { return String(n) }
}
export function conteggioInteroR4(n: number, lingua: string): string {
    try { return new Intl.NumberFormat(italiano(lingua) ? 'it-IT' : 'en-US').format(n) } catch { return String(n) }
}
/** «14:22». */
export function oraBreveR4(iso: unknown, lingua: string): string {
    const t = new Date(String(iso))
    return Number.isNaN(t.getTime()) ? '—' : t.toLocaleTimeString(italiano(lingua) ? 'it-IT' : 'en-GB', { hour: '2-digit', minute: '2-digit' })
}
export function troncaR4(t: unknown, n: number): string {
    const s = String(t || '').trim()
    return s.length > n ? `${s.slice(0, n - 1)}…` : s
}

// ---- testo-a-schermo.js: i caratteri che ingannano (controlli, direzione del testo) non arrivano a schermo ----
const car = (codice: number) => String.fromCodePoint(codice)
const CODICI_CHE_INGANNANO: [number, number][] = [[0x0000, 0x001F], [0x007F, 0x009F], [0x061C, 0x061C], [0x200E, 0x200F], [0x202A, 0x202E], [0x2066, 0x2069]]
const CARATTERI_CHE_INGANNANO = new RegExp(`[${CODICI_CHE_INGANNANO.map(([da, a]) => (da === a ? car(da) : `${car(da)}-${car(a)}`)).join('')}]`, 'gu')
export function senzaInganniR4(testo: unknown): string {
    return typeof testo === 'string' ? testo.replace(CARATTERI_CHE_INGANNANO, '') : ''
}
export function suUnaRigaR4(testo: unknown): string {
    return typeof testo === 'string' ? senzaInganniR4(testo.replace(/\s+/gu, ' ')).replace(/ {2,}/gu, ' ').trim() : ''
}
const STRUTTURA = new Set([0x09, 0x0A, 0x0D])
export function senzaInganniSuPiuRigheR4(testo: unknown): string {
    return typeof testo === 'string' ? testo.replace(CARATTERI_CHE_INGANNANO, (c) => (STRUTTURA.has(c.codePointAt(0)!) ? c : '')) : ''
}

// ---- il NOME di un agente (`grafo/run-dalle-deleghe.js` `nomeDellAgente`, `nomeBreve` @ 701c6c0d2; golden `nome-motivi-701c6c0d2.json`) ----
/*
 * ⛔ L3-17 del desktop (owner 16/10, «un nome solo ovunque»): pannello Agenti, albero delle deleghe, carte delle figlie chiamano un agente
 * nello stesso modo. Il nome della delega dato dal server (col «-N» fra sorelle), o per le deleghe di prima il compito; su una riga e al
 * più `NOME_MASSIMO_R4`. Revisione del bugfixer (`a680d311c`): un candidato fatto solo di U+200B-U+200D, U+2060 vale vuoto, e si ripiega
 * sul successivo (prima l'agente spariva).
 */
export const NOME_MASSIMO_R4 = 160
export const NOME_IN_UNA_FRASE_R4 = 60
const HA_UN_SEGNO_VISIBILE = /[^\s\u200B-\u200D\u2060\uFEFF]/u
export function nomeBreveR4(testo: unknown, massimo = NOME_MASSIMO_R4): string {
    const intero = typeof testo === 'string' ? testo : ''
    // si guarda solo l'inizio del TESTO: una consegna da migliaia di caratteri non si ripulisce tutta per tenerne 160
    const daDove = intero.search(/\S/u)
    if (daDove < 0) return ''
    const finestra = intero.slice(daDove, daDove + massimo * 4)
    const pulito = suUnaRigaR4(finestra)
    // «tagliato» si decide sul testo: gli spazi in coda oltre la finestra non sono testo lasciato fuori
    if (pulito.length <= massimo && !/\S/u.test(intero.slice(daDove + massimo * 4))) return pulito
    let taglio = pulito.slice(0, massimo - 1)
    const ultimo = taglio.charCodeAt(taglio.length - 1)
    if (ultimo >= 0xD800 && ultimo <= 0xDBFF) taglio = taglio.slice(0, -1) // mai a metà di una coppia surrogata
    return `${taglio.trimEnd()}…`
}
export function nomeDellAgenteR4(agente: unknown, massimo = NOME_MASSIMO_R4): string {
    const a = agente && typeof agente === 'object' ? agente as Record<string, unknown> : {}
    for (const testo of [a.nome, a.taskCorto, a.task]) {
        const nome = typeof testo === 'string' ? nomeBreveR4(testo, massimo) : ''
        if (HA_UN_SEGNO_VISIBILE.test(nome)) return nome
    }
    return ''
}

// ---- nomi-attrezzi.js ----
export const NOMI_UMANI_ATTREZZI_R4: Readonly<Record<string, string>> = Object.freeze(nomi.mappa)
export function nomeUmanoAttrezzoR4(id: unknown, lingua: string): string | null {
    const chiave = String(id ?? '')
    return Object.hasOwn(NOMI_UMANI_ATTREZZI_R4, chiave) ? testoAgentiR4(NOMI_UMANI_ATTREZZI_R4[chiave], lingua) : null
}
/** Il ripiego quando un attrezzo non ha un nome nostro: il nome stesso, reso leggibile (`mcp__github__create_issue` → «create issue (github)»). */
export function nomeDiRipiegoAttrezzoR4(id: unknown): string {
    const grezzo = typeof id === 'string' ? id.trim() : ''
    if (!grezzo) return ''
    const mcp = /^mcp__([^_](?:.*?[^_])?)__(.+)$/u.exec(grezzo)
    const leggibile = (testo: string) => testo.replace(/[_-]+/gu, ' ').replace(/\s+/gu, ' ').trim()
    return mcp ? `${leggibile(mcp[2])} (${leggibile(mcp[1])})` : leggibile(grezzo)
}

// ---- il conto di una richiesta come il diagramma (`grafo/run-dalle-deleghe.js` `statoDelPasso`, `TERMINALI`, `ATTENZIONE`;
//      `inspector.js` `contoDellaRichiesta` @ 2161afb32, L3-15 del desktop) ----
/*
 * ⛔ L3-15 (desktop 13/10, ripreso qui il 15/10 con r4 2161afb32): il pannello contava «terminati» solo i riusciti, e un `ultimoEsito`
 * buono nascondeva una delega fallita (`statoDelegaR4` legge `ultimoEsito || esitoDelega`). Il diagramma conta ogni stato finale e
 * basta che UNO dei due esiti dica fallimento. Il conto della testa del gruppo ora si legge da qui; la riga del singolo agente resta
 * `statoDelegaR4`, come sul desktop.
 */
export type StatoDelPassoR4 = 'cancelled' | 'waiting_human' | 'pending' | 'running' | 'failed' | 'uncertain' | 'succeeded'
export const TERMINALI_R4: ReadonlySet<string> = new Set(['succeeded', 'failed', 'cancelled', 'skipped', 'superseded', 'set_aside'])
export const ATTENZIONE_R4: ReadonlySet<string> = new Set(['failed', 'uncertain', 'reconciling'])
const istanteDelPasso = (s: unknown) => (typeof s === 'string' && Number.isFinite(Date.parse(s)) ? Date.parse(s) : null)
export function statoDelPassoR4(a: AgenteR4 = {}): StatoDelPassoR4 {
    if (a.interrotta === true || a.motivoChiusura === 'fermata') return 'cancelled'
    if (a.conclusa !== true) {
        if (a.esitoDelega === 'in-pausa' || a.motivoChiusura === 'in-pausa') return 'waiting_human'
        if (a.inAttesaApprovazione === true || a.inAttesaDomanda === true || a.inAttesaPiano === true || a.approvalPendingCount > 0 || a.questionPendingCount > 0) return 'waiting_human'
        return istanteDelPasso(a.avviataAlle) === null ? 'pending' : 'running'
    }
    if ([a.esitoDelega, a.ultimoEsito].some((e) => e && /fall|error|rifiut/iu.test(String(e)))) return 'failed'
    if (a.esitoDelega === 'incerto' || a.motivoChiusura === 'esito-incerto') return 'uncertain'
    return 'succeeded'
}
export function contoDellaRichiestaR4(agenti: AgenteR4[] = []): { totale: number; terminati: number; daControllare: number } {
    const stati = agenti.map((a) => statoDelPassoR4(a))
    return { totale: stati.length, terminati: stati.filter((s) => TERMINALI_R4.has(s)).length, daControllare: stati.filter((s) => ATTENZIONE_R4.has(s)).length }
}

// ---- lo stato di una delega (`statoDelega`, `etichettaDelega`, `contaAgentiAttivi`) ----
export type AgenteR4 = Record<string, any> & { sessionId?: string }
export type StatoDelegaR4 = 'interrotta' | 'in-pausa' | 'fallita' | 'conclusa' | 'attesa' | 'in-corso' | 'ignoto'

/** «interrotta» PRIMA di «in corso»: un figlio che nessuno sta più eseguendo non è vivo. */
export function statoDelegaR4(a: AgenteR4 | null | undefined): StatoDelegaR4 {
    if (a?.interrotta === true || a?.motivoChiusura === 'fermata') return 'interrotta'
    if (a?.esitoDelega === 'in-pausa' || a?.motivoChiusura === 'in-pausa') return 'in-pausa'
    if (a?.conclusa === true) return ['errore', 'error', 'fallito', 'failed', 'rifiutato'].includes(a.ultimoEsito || a.esitoDelega) ? 'fallita' : 'conclusa'
    if (a?.approvalPendingCount > 0 || a?.inAttesaApprovazione > 0 || a?.inAttesaApprovazione === true) return 'attesa'
    return a?.conclusa === false ? 'in-corso' : 'ignoto'
}
const CHIAVE_STATO: Record<StatoDelegaR4, string> = {
    'in-pausa': 'processi.agents.statePaused', interrotta: 'processi.agents.stateStopped', 'in-corso': 'processi.agents.stateRunning',
    fallita: 'processi.agents.stateFailed', conclusa: 'processi.agents.stateDone', attesa: 'processi.agents.stateWaiting', ignoto: 'agenti.delegations.statusUnavailable',
}
export function etichettaDelegaR4(a: AgenteR4, lingua: string): string {
    return testoAgentiR4(CHIAVE_STATO[statoDelegaR4(a)], lingua)
}
/**
 * Il numero sulla scheda. ⛔ Owner 29/10 notte («Ferma» nella scheda Agenti): conta TUTTI i vivi, come lo Stop e «Ferma tutto» —
 * non conclusi e non interrotti, compresi quelli che aspettano te; la delega in pausa (conclusa per r4) no. È la regola di
 * `agenteVivoR4` (`fermaTuttoR4.ts`), scritta qui senza importarla: questo file sta anche nel pezzo della chat (`parolaAttrezzo.ts`)
 * e non deve portarsi dietro le parole di «Ferma tutto». Che siano la stessa regola lo prova AGE-VIVI-01.
 */
export function contaAgentiAttiviR4(lista: AgenteR4[] = []): number {
    return (Array.isArray(lista) ? lista : []).filter((a) => a?.conclusa === false && a?.interrotta !== true).length
}

// ---- chi c'è e a quale richiesta appartiene (`modelloGrafoAgenti`, `runDalleDeleghe`, `agentiPerInspector`) ----
export interface RichiestaR4 { id: string; at: number | null; testo: string }
export interface FattiAgentiR4 { corrente: AgenteR4; sessioni: AgenteR4[]; figli: AgenteR4[]; richieste: RichiestaR4[] }
export interface AgenteDelPannelloR4 extends AgenteR4 { taskCorto: string; numeroFigli: number; richiesta: { id: string; at: string; testo: string; corrente: boolean } | null }

const FINESTRA_LOTTO_MS = 20_000
const istante = (s: unknown) => (typeof s === 'string' && Number.isFinite(Date.parse(s)) ? Date.parse(s) : null)
const idValidoGrafo = (v: unknown): v is string => typeof v === 'string' && v.length > 0 && v.length <= 2048
const idValidoRun = (v: unknown): v is string => typeof v === 'string' && v.length > 0 && v.length <= 256

/** Le richieste di ogni agente (la parte di `runDalleDeleghe` che il pannello usa). */
function richiesteDegliAgenti({ corrente = {}, sessioni = [], figli = [] }: Partial<FattiAgentiR4>, richieste: RichiestaR4[]) {
    const radice = corrente.sessionId
    const mappa = new Map<string, AgenteR4>()
    for (const a of sessioni) if (idValidoRun(a?.sessionId)) mappa.set(a.sessionId, { ...a })
    if (idValidoRun(radice)) mappa.set(radice, { ...mappa.get(radice), ...corrente })
    for (const a of figli) if (idValidoRun(a?.sessionId) && a.sessionId !== radice) mappa.set(a.sessionId, { ...mappa.get(a.sessionId), ...a, padreId: a.padreId ?? radice })
    const perPadre = new Map<string, AgenteR4[]>()
    for (const a of mappa.values()) if (idValidoRun(a.padreId) && a.padreId !== a.sessionId && mappa.has(a.padreId)) {
        if (!perPadre.has(a.padreId)) perPadre.set(a.padreId, [])
        perPadre.get(a.padreId)!.push(a)
    }
    const ordine = (x: AgenteR4, y: AgenteR4) => (istante(x.avviataAlle) ?? Infinity) - (istante(y.avviataAlle) ?? Infinity) || String(x.sessionId).localeCompare(String(y.sessionId), 'en')
    const lotti: { da: string; quando: number | null; ultimo: number | null; agenti: AgenteR4[]; richiesta?: string | null }[] = []
    const profondita = new Map<string, number>([[radice as string, 0]])
    const coda = idValidoRun(radice) && mappa.has(radice) ? [radice] : []
    for (let i = 0; i < coda.length; i += 1) {
        const padre = coda[i]
        const nati = [...(perPadre.get(padre) ?? [])].sort(ordine)
        let aperto: (typeof lotti)[number] | null = null
        for (const a of nati) {
            if (profondita.has(a.sessionId!)) continue
            profondita.set(a.sessionId!, profondita.get(padre)! + 1)
            coda.push(a.sessionId!)
            const t = istante(a.avviataAlle)
            if (!aperto || (t === null) !== (aperto.ultimo === null) || (t !== null && t - (aperto.ultimo as number) > FINESTRA_LOTTO_MS)) {
                aperto = { da: padre, quando: t, ultimo: t, agenti: [] }
                lotti.push(aperto)
            }
            aperto.agenti.push(a); aperto.ultimo = t ?? aperto.ultimo
        }
    }
    const richiesteNote = [...(Array.isArray(richieste) ? richieste : [])].filter((r) => idValidoRun(r?.id) && Number.isFinite(r.at)).sort((x, y) => (x.at as number) - (y.at as number))
    const richiestaDiAgente = new Map<string, string | null>()
    for (const l of lotti) {
        if (!richiesteNote.length) l.richiesta = null
        else if (l.da === radice) l.richiesta = (l.quando === null ? null : [...richiesteNote].reverse().find((r) => (r.at as number) <= (l.quando as number)))?.id ?? richiesteNote[0].id
        else l.richiesta = richiestaDiAgente.get(l.da) ?? richiesteNote[0].id
        for (const a of l.agenti) richiestaDiAgente.set(a.sessionId!, l.richiesta)
    }
    const elencoRichieste = richiesteNote
        .map((r) => ({ id: r.id, at: new Date(r.at as number).toISOString(), testo: typeof r.testo === 'string' ? r.testo : '', total: lotti.filter((l) => l.richiesta === r.id).flatMap((l) => l.agenti).length }))
        .filter((r) => r.total > 0)
    return { richiestaDi: richiestaDiAgente, elencoRichieste, ultimaRichiesta: richiesteNote.at(-1)?.id ?? null }
}

/** Gli agenti della scheda, come `agentiPerInspector` del desktop. */
export function agentiDelPannelloR4(fatti: FattiAgentiR4, lingua: string): AgenteDelPannelloR4[] {
    const { corrente = {}, sessioni = [], figli = [] } = fatti
    const richieste = (fatti.richieste ?? []).filter((r) => Number.isFinite(r.at))
    const diviso = richieste.length ? richiesteDegliAgenti(fatti, richieste) : null
    const perId = new Map((diviso?.elencoRichieste ?? []).map((r) => [r.id, r]))
    const ultima = diviso?.ultimaRichiesta ?? null
    const richiestaDi = (sid: string) => { const r = perId.get(diviso?.richiestaDi.get(sid) as string); return r ? { id: r.id, at: r.at, testo: r.testo, corrente: r.id === ultima } : null }
    // `modelloGrafoAgenti`: la mappa, gli archi delega/ramo, i discendenti della sessione
    const mappa = new Map<string, AgenteR4>()
    for (const a of sessioni) if (idValidoGrafo(a?.sessionId)) mappa.set(a.sessionId, { ...a })
    if (idValidoGrafo(corrente.sessionId)) mappa.set(corrente.sessionId, { ...mappa.get(corrente.sessionId), ...corrente })
    for (const a of figli) if (idValidoGrafo(a?.sessionId) && a.sessionId !== corrente.sessionId) mappa.set(a.sessionId, { ...mappa.get(a.sessionId), ...a, padreId: corrente.sessionId })
    const adiacenze = new Map<string, string[]>()
    const numeroFigli = new Map<string, number>()
    for (const a of mappa.values()) for (const campo of ['padreId', 'forkDa']) {
        const da = a[campo]
        if (da !== a.sessionId && mappa.has(da)) {
            if (!adiacenze.has(da)) adiacenze.set(da, [])
            adiacenze.get(da)!.push(a.sessionId!)
            numeroFigli.set(da, (numeroFigli.get(da) || 0) + 1)
        }
    }
    const inclusi = new Set<string>([corrente.sessionId as string])
    const coda = [corrente.sessionId as string]
    for (let i = 0; i < coda.length; i++) for (const id of adiacenze.get(coda[i]) || []) if (!inclusi.has(id)) { inclusi.add(id); coda.push(id) }
    return [...mappa.values()]
        .filter((a) => inclusi.has(a.sessionId!) && a.sessionId !== corrente.sessionId && a.passoWorkflow == null)
        .map((a) => ({
            ...a,
            // `agentiPerInspector` @ 701c6c0d2: `taskCorto || n.nome`, col nome del nodo di `modelloGrafoAgenti` (L3-17, una funzione sola)
            taskCorto: a.taskCorto || nomeDellAgenteR4(a) || nomeBreveR4(a.taskDelega || '') || testoAgentiR4('agenti.delegations.untitledSession', lingua),
            numeroFigli: numeroFigli.get(a.sessionId!) || 0,
            richiesta: richiestaDi(a.sessionId!),
        }))
}

// ---- dagli eventi: le richieste della persona e le istantanee dal vivo delle figlie ----
/** `annotaRichiestaDellaPersona` (regola della rigiocata): un `RunStarted` senza `input.origine` è una richiesta; l'ora è `at` o il primo `avviatoA`. */
export function annotaRichiestaR4(richieste: RichiestaR4[], evento: Record<string, any>): RichiestaR4[] {
    if (evento.type === 'RunStarted') {
        if (evento.input?.origine) return richieste
        const id = `richiesta-${Number.isFinite(evento._sequenza) ? evento._sequenza : `n${richieste.length + 1}`}`
        if (richieste.some((r) => r.id === id)) return richieste
        const dichiarata = Date.parse(evento.at ?? '')
        return [...richieste, { id, at: Number.isFinite(dichiarata) ? dichiarata : null, testo: String(evento.input?.consegnaCorta || evento.input?.consegna || '').replace(/\s+/gu, ' ').trim().slice(0, 160) }]
    }
    const ultima = richieste.at(-1)
    if (!ultima || ultima.at !== null) return richieste
    const quando = Date.parse(evento.at ?? '')
    const at = Number.isFinite(quando) ? quando : evento.type === 'ToolCallStart' && Number.isFinite(evento.avviatoA) ? evento.avviatoA : null
    return at === null ? richieste : [...richieste.slice(0, -1), { ...ultima, at }]
}
/**
 * `applicaEventoAgenti`: l'istantanea con la sessione a cui appartiene (`value.sessionId ?? value.parentId`), o `null`.
 * ⛔ Il pannello non sa l'id della sessione dagli eventi: il `threadId` del `RunStarted` NON lo è (misurato nel golden). La sessione
 *   la dice chi apre il Codice (`istantaneaAgenteR4`, o il filtro sul campo `radice`).
 */
export function voceAgenteR4(evento: Record<string, any>): { radice: string; agente: AgenteR4 } | null {
    if (evento.type !== 'CUSTOM' || evento.name !== 'talos.agenti') return null
    const value = evento.value, agente = value?.agent
    const radice = value?.sessionId ?? value?.parentId
    if (value?.version !== 1 || typeof radice !== 'string' || typeof value.childId !== 'string' || agente?.sessionId !== value.childId) return null
    if (typeof agente.padreId !== 'string' || agente.padreId !== value.parentId || agente.sessionId === radice) return null
    return { radice, agente }
}
/** L'istantanea di una figlia (o di una sua discendente) di QUESTA sessione, o `null`. */
export function istantaneaAgenteR4(evento: Record<string, any>, radice: string | null): AgenteR4 | null {
    const voce = voceAgenteR4(evento)
    return voce && radice && voce.radice === radice ? voce.agente : null
}

// ---- i gruppi della scheda (`disegnaAgenti`) ----
export interface GruppoAgentiR4 { richiesta: NonNullable<AgenteDelPannelloR4['richiesta']>; agenti: AgenteDelPannelloR4[] }
/** Ci sono gruppi solo con più di una richiesta e ogni agente filtrato con la sua; la più recente in cima. */
export function gruppiAgentiR4(tutti: AgenteDelPannelloR4[], filtrati: AgenteDelPannelloR4[]): { gruppi: GruppoAgentiR4[]; piuRecente: string | null } | null {
    const tutteLeRichieste = new Set(tutti.map((a) => a.richiesta?.id).filter(Boolean))
    if (tutteLeRichieste.size <= 1 || !filtrati.every((a) => a.richiesta?.id)) return null
    const gruppi = new Map<string, GruppoAgentiR4>()
    for (const a of filtrati) {
        if (!gruppi.has(a.richiesta!.id)) gruppi.set(a.richiesta!.id, { richiesta: a.richiesta!, agenti: [] })
        gruppi.get(a.richiesta!.id)!.agenti.push(a)
    }
    const ordinati = [...gruppi.values()].sort((x, y) => Date.parse(y.richiesta.at) - Date.parse(x.richiesta.at))
    const piuRecente = [...tutti].filter((a) => a.richiesta?.id).sort((x, y) => Date.parse(y.richiesta!.at) - Date.parse(x.richiesta!.at))[0]?.richiesta!.id ?? null
    return { gruppi: ordinati, piuRecente }
}
