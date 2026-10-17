/**
 * ⛔ K3-C3b-1 (ledger `LEDGER-K3-CODICE-COME-LA-CHAT-2026-10-15.md`): il pannello ▤ del Codice su r4, schede Contesto e File.
 * COPIA FISSATA delle regole del desktop r4 @ `fc5e25d62` (provata contro il golden calcolato dalle funzioni vere,
 * `tests/fixtures/r4/pannello-fc5e25d62.json`):
 *   · `components/inspector.js`: `kilo`, `percento` (:45-56), `righeAmbiente` (:58), `righeFinestra` (:73), `righeFinestraSulLimite`
 *     (:107), `righeGiri` (:210), `anteprimaIndiceGiri` (:244), `righeFile` (:269);
 *   · `components/contesto-scheda.js`: `limiteCheAgisce`, `percheDelLimite`, `CHIAVI_CATEGORIA`, `ripartizioneSulLimite`;
 *   · `components/consumo-sessione.js`: `testoRiusoCache`; `components/review.js`: `riassuntoReview`;
 *   · `legacy/app.js`: `righeDelTesto`/`calcolaDiffRighe` (:17341-17380, LCS, tetto 1.500 righe), `updateRealReview` (:17660: per
 *     percorso l'ULTIMA scrittura col suo `prima`) e `registraUltimaRichiesta` (:23026: la misura del contesto è il SOLO `prompt_tokens`
 *     dell'ultima chiamata riuscita, decisione dell'owner del 09/10 «B come Hermes»).
 * Adattamento dichiarato: l'indice dei giri del desktop nasce dal DOM della sua conversazione; qui dagli eventi (una riga per ogni
 * messaggio della persona, una per ogni giro di TALOS col numero degli attrezzi), con le stesse parole e la stessa forma.
 */
import { eventoAttrezzoR4, NOMI_COMANDO_R4, type VoceAttrezzoR4 } from './processiR4'
import { annotaRichiestaR4, voceAgenteR4, type AgenteR4, type RichiestaR4 } from './agentiR4'
import { vociRisultatoDelegaR4 } from './risultatiDelegaR4'
import { calcolaDiffRigheR4, contaRigheDiffR4, formattaRigheConNumeroR4, simboliSparitiR4, type RigaDiffR4 } from './diffRigheR4'
import processi from './testi/processi-inspector-r4.json'
import varie from './testi/varie-pannello-r4.json'
import modello from './testi/modello-inspector-r4.json'

type Tabella = { it: Record<string, string>; en: Record<string, string> }
const AREE: Record<string, Tabella> = { processi, varie, modello }

const italiano = (lingua: string) => /^it(?:-|$)/iu.test(lingua)
const localeNumeri = (lingua: string) => (italiano(lingua) ? 'it-IT' : 'en-US')
const propria = (t: Record<string, string>, k: string) => (Object.hasOwn(t, k) ? t[k] : undefined)

function interpola(frase: string, valori?: Record<string, unknown>): string {
    if (!valori) return frase
    return frase.replace(/\{([a-zA-Z0-9_]+)\}/g, (tutto, nome: string) => (nome in valori ? String(valori[nome]) : tutto))
}

/** `t('processi.inspector.…' | 'varie.usage.…' | 'modello.inspector.…')` di r4: la voce nella lingua, altrimenti l'inglese. */
export function testoPannelloR4(chiave: string, lingua: string, valori?: Record<string, unknown>): string {
    const punto = chiave.indexOf('.')
    const area = AREE[chiave.slice(0, punto)]
    const nome = chiave.slice(punto + 1)
    if (!area) return chiave
    return interpola(propria(italiano(lingua) ? area.it : area.en, nome) ?? propria(area.en, nome) ?? chiave, valori)
}

function plurale(uno: string, molti: string, n: number, lingua: string, valori?: Record<string, unknown>): string {
    const regole = new Intl.PluralRules(italiano(lingua) ? 'it' : 'en')
    return testoPannelloR4(regole.select(Number(n)) === 'one' ? uno : molti, lingua, { n, ...(valori ?? {}) })
}

function formato(lingua: string, opzioni: Intl.NumberFormatOptions): Intl.NumberFormat {
    return new Intl.NumberFormat(localeNumeri(lingua), opzioni)
}

/** «41,2k», «200k», «0,4k». */
export function kiloR4(n: unknown, lingua: string): string {
    const v = Number(n)
    if (!Number.isFinite(v) || v < 0) return '—'
    return `${formato(lingua, { maximumFractionDigits: 1 }).format(v / 1000)}k`
}

const percentoNumero = (v: number, lingua: string) => formato(lingua, { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(v)

/** Percentuale troncata a un decimale (3,75 → «3,7%»). */
export function percentoR4(parte: number, tutto: number, lingua: string): string | null {
    if (!Number.isFinite(parte) || !Number.isFinite(tutto) || tutto <= 0) return null
    return `${percentoNumero(Math.floor((parte / tutto) * 1000) / 10, lingua)}%`
}

export type RigaPannelloR4 = [string, string] | [string, string, string]

/** Le quattro righe di «Ambiente», `—` dove il dato non c'è. */
export function righeAmbienteR4(contesto: Record<string, unknown> | null, lingua: string): RigaPannelloR4[] {
    const c = contesto || {}
    const t = (k: string, v?: Record<string, unknown>) => testoPannelloR4(`processi.inspector.${k}`, lingua, v)
    const annidati = Array.isArray(c.repoAnnidati) ? c.repoAnnidati.length : null
    return [
        [t('envBranch'), (c.branch as string) || '—'],
        [t('envWorktree'), (c.worktree as string) || '—'],
        [t('envUnsaved'), Number.isFinite(c.nonSalvate) ? plurale('processi.inspector.envFilesOne', 'processi.inspector.envFilesMany', c.nonSalvate as number, lingua) : '—'],
        [t('envNestedRepos'), annidati === null ? '—' : annidati === 0 ? t('envNone') : t('envSeparateTrust', { n: annidati })],
    ]
}

export interface LimiteR4 { soglia: number; finestra: number | null; fonte: string }

/** Il limite su cui la conversazione si compatta davvero: il motore del contesto, o la politica di r4 (`/:id/compaction-policy`). */
export function limiteCheAgisceR4({ budget = null, politica = null }: { budget?: any; politica?: any } = {}): LimiteR4 | null {
    if (budget && Number.isSafeInteger(budget.triggerTokens) && budget.triggerTokens > 0) {
        return { soglia: budget.triggerTokens, finestra: Number.isSafeInteger(budget.windowTokens) ? budget.windowTokens : null, fonte: 'motore' }
    }
    if (politica && Number.isSafeInteger(politica.triggerTokens) && politica.triggerTokens > 0
        && ['route-minimum', 'explicit-cap', 'fallback'].includes(politica.source)) {
        return { soglia: politica.triggerTokens, finestra: Number.isSafeInteger(politica.windowTokens) ? politica.windowTokens : null, fonte: politica.source }
    }
    return null
}

export function percheDelLimiteR4(limite: LimiteR4 | null): { chiave: string; soglia: number; finestra: number | null } | null {
    if (!limite) return null
    if (limite.fonte === 'motore') return { chiave: 'processi.inspector.limitWhyEngine', soglia: limite.soglia, finestra: limite.finestra }
    if (limite.fonte === 'route-minimum') return { chiave: 'processi.inspector.limitWhyWindow', soglia: limite.soglia, finestra: limite.finestra }
    if (limite.fonte === 'explicit-cap') return { chiave: 'processi.inspector.limitWhyCap', soglia: limite.soglia, finestra: limite.finestra }
    return { chiave: 'processi.inspector.limitWhyUnverified', soglia: limite.soglia, finestra: null }
}

const CATEGORIE = ['system', 'rules', 'memory', 'tools', 'mcp', 'conversation']
const CHIAVI_CATEGORIA: Record<string, string> = {
    system: 'processi.inspector.catSystem', rules: 'processi.inspector.catRules', memory: 'processi.inspector.catMemory',
    tools: 'processi.inspector.catTools', mcp: 'processi.inspector.catMcp', conversation: 'processi.inspector.catConversation',
}

function ripartizioneSulLimite({ ripartizione = null, usati = null, limite = null }: { ripartizione?: any; usati?: number | null; limite?: LimiteR4 | null }) {
    const soglia = limite?.soglia ?? null
    const categorie: { id: string; tokens: number }[] = Array.isArray(ripartizione?.categorie)
        ? ripartizione.categorie.filter((c: any) => CATEGORIE.includes(c?.id) && Number.isFinite(c.tokens) && c.tokens >= 0) : []
    const voci = categorie.sort((a, b) => CATEGORIE.indexOf(a.id) - CATEGORIE.indexOf(b.id))
        .map((c) => ({ id: c.id, tokens: c.tokens, percentuale: soglia ? Math.min(100, (c.tokens / soglia) * 100) : null }))
    const misurati = Number.isFinite(usati) && (usati as number) > 0 ? usati as number : null
    return { voci, usati: misurati, restanti: soglia && misurati !== null ? soglia - misurati : null, oltre: Boolean(soglia && misurati !== null && misurati > soglia) }
}

/** «85 % · su 11 richieste al modello», o «non misurato». */
export function testoRiusoCacheR4(misura: any, lingua: string): string {
    const p = misura?.percentuale
    const giri = misura?.giriMisurati
    if (!Number.isFinite(p) || p < 0 || p > 100 || !Number.isSafeInteger(giri) || giri <= 0) return testoPannelloR4('varie.usage.notMeasured', lingua)
    const numero = formato(lingua, { maximumFractionDigits: 0 })
    return plurale('varie.usage.cacheReuseOne', 'varie.usage.cacheReuseMany', giri, lingua, { percent: numero.format(p), n: numero.format(giri) })
}

export interface FinestraR4 { titoloDestra: string; righe: RigaPannelloR4[]; anteprima: string; perche?: string; fette?: { id: string; percentuale: number }[] }

/** «Finestra del contesto» sul limite che agisce; `null` se nessuna sorgente l'ha detto. */
export function righeFinestraSulLimiteR4(
    { usage = null, ripartizione = null, limite = null, cacheSessione = null, storiaInCaricamento = false }:
    { usage?: any; ripartizione?: any; limite?: LimiteR4 | null; cacheSessione?: any; storiaInCaricamento?: boolean },
    lingua: string,
): FinestraR4 | null {
    if (!limite) return null
    const tr = (k: string, v?: Record<string, unknown>) => testoPannelloR4(k, lingua, v)
    const usati = Number.isFinite(usage?.prompt_tokens) ? usage.prompt_tokens : null
    const r = ripartizioneSulLimite({ ripartizione, usati, limite })
    const righe: RigaPannelloR4[] = r.voci.map((v) => [tr(CHIAVI_CATEGORIA[v.id]), `${kiloR4(v.tokens, lingua)}${v.percentuale === null ? '' : ` · ${percentoR4(v.tokens, limite.soglia, lingua)}`}`, 'stima'])
    const stimato = usage?.stimato === true
    righe.push([tr(stimato ? 'processi.inspector.windowInUseEstimate' : 'processi.inspector.windowInUse'),
        r.usati === null ? '—' : `${kiloR4(r.usati, lingua)} · ${percentoR4(r.usati, limite.soglia, lingua)}`, ...(stimato ? ['stima'] : [])] as RigaPannelloR4)
    righe.push([tr('processi.inspector.windowBeforeCompaction'), r.restanti === null ? '—' : r.oltre ? tr('processi.inspector.windowOver', { n: kiloR4(-r.restanti, lingua) }) : kiloR4(r.restanti, lingua)])
    righe.push([tr('processi.inspector.windowCache'), storiaInCaricamento && !cacheSessione ? '—' : testoRiusoCacheR4(cacheSessione, lingua), 'a-capo'])
    const p = percheDelLimiteR4(limite)
    const segno = limite.fonte === 'fallback' ? '~' : ''
    return {
        titoloDestra: `${segno}${kiloR4(limite.soglia, lingua)}`,
        righe,
        fette: r.voci.filter((v) => v.percentuale !== null).map((v) => ({ id: v.id, percentuale: v.percentuale as number })),
        perche: p ? tr(p.chiave, { soglia: kiloR4(p.soglia, lingua), finestra: p.finestra === null ? '—' : kiloR4(p.finestra, lingua) }) : '',
        anteprima: `${r.usati === null ? '—' : `${stimato ? '~' : ''}${kiloR4(r.usati, lingua)}`} / ${segno}${kiloR4(limite.soglia, lingua)}`,
    }
}

/** «Finestra del contesto» senza limite noto: la finestra del modello (o «non dichiarata»), Conversazione e Libera. */
export function righeFinestraR4(usage: any, finestra: number | null, ripartizione: any, cacheSessione: any, lingua: string, { storiaInCaricamento = false } = {}): FinestraR4 {
    const tr = (k: string, v?: Record<string, unknown>) => testoPannelloR4(k, lingua, v)
    const u = usage || {}
    const usati = Number.isFinite(u.prompt_tokens) ? u.prompt_tokens + (Number.isFinite(u.completion_tokens) ? u.completion_tokens : 0) : null
    const righe: RigaPannelloR4[] = []
    const r = ripartizione || {}
    let occupati = 0
    let percentoOccupato = 0
    const aggiungi = (etichetta: string, token: number, classe: string) => {
        occupati += token
        const p = finestra ? percentoR4(token, finestra, lingua) : null
        if (p) percentoOccupato += Number(p.replace('%', '').replace(',', '.'))
        righe.push([etichetta, `${kiloR4(token, lingua)}${p ? ` · ${p}` : ''}`, classe])
    }
    for (const [chiave, etichetta] of [['attrezzi', 'processi.inspector.windowTools'], ['istruzioni', 'processi.inspector.windowInstructions'], ['memoria', 'processi.inspector.windowMemory']]) {
        if (Number.isFinite(r[chiave])) aggiungi(tr(etichetta), r[chiave], 'stima')
    }
    if (usati === null) righe.push([tr('processi.inspector.windowConversation'), '—']); else aggiungi(tr('processi.inspector.windowConversation'), usati, '')
    righe.push([tr('processi.inspector.windowFree'), finestra && usati !== null
        ? `${kiloR4(Math.max(0, finestra - occupati), lingua)} · ${percentoNumero(Math.max(0, Math.round((100 - percentoOccupato) * 10) / 10), lingua)}%` : '—'])
    righe.push([tr('processi.inspector.windowCache'), storiaInCaricamento && !cacheSessione ? '—' : testoRiusoCacheR4(cacheSessione, lingua), 'a-capo'])
    return { titoloDestra: finestra ? kiloR4(finestra, lingua) : tr('processi.inspector.windowUndeclared'), righe, anteprima: `${usati === null ? '—' : kiloR4(usati, lingua)}${finestra ? ` / ${kiloR4(finestra, lingua)}` : ''}` }
}

export interface GiroR4 { numero: number; titolo?: string; tu?: boolean; inCorso?: boolean; senzaContatto?: boolean; token?: number; attrezzi?: number }

export function righeGiriR4(giri: GiroR4[], lingua: string): RigaPannelloR4[] {
    const tr = (k: string) => testoPannelloR4(`processi.inspector.${k}`, lingua)
    return giri.map((g) => {
        const misura = g.tu ? tr('turnYourMessage')
            : g.senzaContatto ? tr('turnNoContact')
                : g.inCorso ? tr('turnRunning')
                    : Number.isFinite(g.token) ? kiloR4(g.token, lingua)
                        : (Number.isFinite(g.attrezzi) ? plurale('processi.inspector.turnToolsOne', 'processi.inspector.turnToolsMany', g.attrezzi as number, lingua) : '—')
        const titolo = g.titolo || (g.tu ? tr('turnMessage') : tr('turnTurn'))
        return [`${g.numero} · ${titolo}`, misura, g.senzaContatto ? 'warning' : g.inCorso ? 'accent' : '']
    })
}

export function anteprimaIndiceGiriR4(giri: GiroR4[], lingua: string): string {
    const messaggi = giri.filter((g) => g?.tu === true).length
    const diTalos = giri.length - messaggi
    return [
        diTalos ? plurale('processi.inspector.turnsPreviewOne', 'processi.inspector.turnsPreviewMany', diTalos, lingua) : '',
        messaggi ? plurale('processi.inspector.turnsPreviewMessagesOne', 'processi.inspector.turnsPreviewMessagesMany', messaggi, lingua) : '',
    ].filter(Boolean).join(' · ')
}

/**
 * Un file scritto nella sessione, come la voce di `reviewFiles` del desktop (`updateRealReview`, `legacy/app.js:17879` @ 701c6c0d2):
 * K3 Revisione aggiunge il giro della scrittura, se il diff è vero, le righe numerate e i simboli spariti. I conteggi vengono dalle
 * righe (`contaDiff`). Facoltativi per le voci del golden del pannello (fc5e25d62), che non li hanno.
 */
export interface FileR4 {
    path: string; aggiunte: number; rimozioni: number; nuovo?: boolean
    giro?: number | null; diffVero?: boolean; code?: RigaDiffR4[]; simboliPersi?: string[]
}

export function righeFileR4(file: FileR4[]): RigaPannelloR4[] {
    return file.map((f) => [f.path, `+${f.aggiunte ?? 0}${f.rimozioni ? ` −${f.rimozioni}` : ''}`])
}

/** «3 file modificati · +112 −2», o «Nessuna modifica in questa sessione». */
export function riassuntoFileR4(file: FileR4[], lingua: string): string {
    if (file.length === 0) return testoPannelloR4('varie.review.summary.none', lingua)
    let aggiunte = 0
    let rimozioni = 0
    for (const f of file) { aggiunte += f.aggiunte; rimozioni += f.rimozioni }
    return plurale('varie.review.summary.filesOne', 'varie.review.summary.filesMany', file.length, lingua, { added: aggiunte, removed: rimozioni })
}

// ---- il diff delle righe (legacy/app.js:17341-17380) ----
const RIGHE_MASSIME_DIFF = 1500
const righeDelTesto = (testo: unknown) => { const t = String(testo ?? '').replace(/\r\n/g, '\n').replace(/\n$/, ''); return t === '' ? [] : t.split('\n') }

/** Righe aggiunte e tolte fra due testi (LCS); `null` oltre il tetto di 1.500 righe, come il desktop. */
export function contaDiffR4(prima: unknown, dopo: unknown): { aggiunte: number; rimozioni: number } | null {
    const a = righeDelTesto(prima)
    const b = righeDelTesto(dopo)
    if (a.length > RIGHE_MASSIME_DIFF || b.length > RIGHE_MASSIME_DIFF) return null
    const n = a.length
    const m = b.length
    const lcs = Array.from({ length: n + 1 }, () => new Uint32Array(m + 1))
    for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) lcs[i][j] = a[i] === b[j] ? lcs[i + 1][j + 1] + 1 : Math.max(lcs[i + 1][j], lcs[i][j + 1])
    let aggiunte = 0
    let rimozioni = 0
    let i = 0
    let j = 0
    while (i < n && j < m) {
        if (a[i] === b[j]) { i += 1; j += 1 } else if (lcs[i + 1][j] >= lcs[i][j + 1]) { rimozioni += 1; i += 1 } else { aggiunte += 1; j += 1 }
    }
    return { aggiunte: aggiunte + (m - j), rimozioni: rimozioni + (n - i) }
}

// ---- lo stato del pannello, dagli eventi della sessione ----
export interface PannelloR4 {
    contesto: Record<string, unknown> | null
    /** La misura del contesto: il `prompt_tokens` dell'ultima chiamata riuscita (completion 0, come il desktop). */
    ultimaRichiesta: { prompt_tokens: number; completion_tokens: number } | null
    giri: GiroR4[]
    file: FileR4[]
    /** K3-C3b-2a: gli eventi dei comandi, nella forma di `legacy/app.js` (`eventoAttrezzoR4`), per `processiDagliEventiR4`. */
    attrezzi: VoceAttrezzoR4[]
    /** I giri cominciati (`runCount` del desktop) e se l'ultimo è ancora vivo: chiudono un comando rimasto senza risultato. */
    giriVisti: number
    giroVivo: boolean
    /** K3-C3b-2b: le richieste della persona e l'ultima istantanea di ogni figlia vista dal vivo (`talos.agenti`), con la sua sessione. */
    richieste: RichiestaR4[]
    agentiInDiretta: { radice: string; agente: AgenteR4 }[]
    /** K3 Revisione: il percorso dell'ultima scrittura (il file che la Revisione mostra, come `reviewDaDisegnareDopoLaStoria`). */
    ultimoFile: string | null
}

export function creaPannelloR4(): PannelloR4 {
    return { contesto: null, ultimaRichiesta: null, giri: [], file: [], attrezzi: [], giriVisti: 0, giroVivo: false, richieste: [], agentiInDiretta: [], ultimoFile: null }
}

const PAROLE_DEL_TITOLO = 5
/** Le prime 5 parole del testo COME SI LEGGE (il desktop le prende dalla risposta già mostrata): senza i segni del markdown. */
const titoloBreve = (testo: unknown) => String(testo ?? '').replace(/[`*_>#]/gu, ' ').split(/\s+/u)
    .filter((parola) => /[\p{L}\p{N}]/u.test(parola)).slice(0, PAROLE_DEL_TITOLO).join(' ')

/**
 * Un evento in più. Puro come l'adattatore dei messaggi: un evento sconosciuto o storto lascia lo stato com'è. `adesso` è l'ora
 * d'arrivo (il «silenzio» di un comando si conta da lì, come nel desktop). ⛔ In un oggetto e non come numero: chi passa questa
 * funzione a `reduce` le dà l'indice come terzo argomento, e un indice letto come ora sarebbe un orologio finto.
 */
export function applicaEventoPannelloR4(p: PannelloR4, evento: Record<string, unknown>, opzioni?: { adesso?: number }): PannelloR4 {
    if (!evento || typeof evento !== 'object') return p
    const adesso = typeof opzioni === 'object' && opzioni !== null && Number.isFinite(opzioni.adesso) ? opzioni.adesso as number : Date.now()
    return conGliAgenti(conIComandi(applicaAlResto(p, evento), evento, adesso), evento)
}

/** K3-C3b-2b: le richieste della persona e l'ultima istantanea di ogni figlia (`agentiR4.ts`, regole di `legacy/app.js`). */
function conGliAgenti(p: PannelloR4, evento: Record<string, unknown>): PannelloR4 {
    const richieste = annotaRichiestaR4(p.richieste, evento)
    const voce = voceAgenteR4(evento)
    if (richieste === p.richieste && !voce) return p
    const agentiInDiretta = !voce ? p.agentiInDiretta
        : p.agentiInDiretta.some((v) => v.agente.sessionId === voce.agente.sessionId)
            ? p.agentiInDiretta.map((v) => (v.agente.sessionId === voce.agente.sessionId ? voce : v))
            : [...p.agentiInDiretta, voce]
    return { ...p, richieste, agentiInDiretta }
}

/**
 * K3-C3b-2a: i giri e gli eventi dei comandi. Si tengono solo gli eventi dei comandi visti partire (adattamento dichiarato in
 * `processiR4.ts`): `processiDagliEventiR4` legge solo quelli, e su una sessione lunga gli argomenti degli altri attrezzi pesano.
 */
function conIComandi(p: PannelloR4, evento: Record<string, unknown>, adesso: number): PannelloR4 {
    let { giriVisti, giroVivo } = p
    if (evento.type === 'RunStarted') { giriVisti += 1; giroVivo = true }
    if (evento.type === 'RunFinished' || evento.type === 'RunError') giroVivo = false
    const voce = eventoAttrezzoR4(evento, { ricevutoA: adesso, giro: giriVisti })
    const nota = voce && (voce.type === 'ToolCallStart'
        ? NOMI_COMANDO_R4.includes(voce.toolCallName as string)
        : voce.type === 'ApprovalResolved' || p.attrezzi.some((a) => a.type === 'ToolCallStart' && a.toolCallId === voce.toolCallId))
    if (!nota && giriVisti === p.giriVisti && giroVivo === p.giroVivo) return p
    return { ...p, giriVisti, giroVivo, attrezzi: nota ? [...p.attrezzi, voce!] : p.attrezzi }
}

/** La riga di un giro di TALOS che si chiude: il titolo è l'inizio della risposta (5 parole, `titoloRispostaDaTurno`). */
function chiudiGiro(ultimo: GiroR4): GiroR4 {
    const { _testo, ...resto } = ultimo as GiroR4 & { _testo?: string }
    const titolo = resto.titolo || (_testo ? titoloBreve(_testo.replace(/^#+\s*/u, '')) : undefined)
    return { ...resto, inCorso: false, ...(titolo ? { titolo } : {}) }
}

function applicaAlResto(p: PannelloR4, evento: Record<string, unknown>): PannelloR4 {
    switch (evento.type) {
        case 'RunStarted': {
            const input = evento.input as Record<string, unknown> | undefined
            const contesto = evento.contesto && typeof evento.contesto === 'object' ? evento.contesto as Record<string, unknown> : p.contesto
            const giri: GiroR4[] = p.giri.map((g) => ({ ...g, inCorso: false }))
            const dellaPersona = typeof input?.consegna === 'string' && input.origine === undefined && (!giri.some((g) => g.tu) || input.seguito === true)
            if (dellaPersona) giri.push({ numero: giri.length + 1, titolo: titoloBreve(input!.consegna), tu: true })
            giri.push({ numero: giri.length + 1, attrezzi: 0, inCorso: true })
            return { ...p, contesto, giri }
        }
        case 'ToolCallStart': {
            const ultimo = p.giri.at(-1)
            if (!ultimo || ultimo.tu || typeof evento.toolCallName !== 'string') return p
            return { ...p, giri: [...p.giri.slice(0, -1), { ...ultimo, attrezzi: (ultimo.attrezzi ?? 0) + 1 }] }
        }
        case 'TextMessageContent': {
            const ultimo = p.giri.at(-1)
            if (!ultimo || ultimo.tu || ultimo.titolo || typeof evento.delta !== 'string') return p
            // il titolo è l'inizio della risposta (5 parole, come `titoloRispostaDaTurno`): basta tenere il primo pezzo di testo
            const parziale = `${(ultimo as GiroR4 & { _testo?: string })._testo ?? ''}${evento.delta}`.slice(0, 400)
            return { ...p, giri: [...p.giri.slice(0, -1), { ...ultimo, _testo: parziale } as GiroR4] }
        }
        case 'RunFinished':
        case 'RunError': {
            const ultimo = p.giri.at(-1)
            if (!ultimo || ultimo.tu) return p
            return { ...p, giri: [...p.giri.slice(0, -1), chiudiGiro(ultimo)] }
        }
        case 'QueuedMessageDelivered': {
            /* ⛔ K3-IDX: un risultato di sotto-agente consegnato DENTRO il giro divide la risposta in due messaggi (`eventiR4.ts`,
               K3-RISDEL); l'indice del desktop nasce dai blocchi della conversazione, quindi qui la riga si chiude e ne nasce un'altra.
               Una consegna della persona (senza `origine`) resta nella stessa riga. */
            const ultimo = p.giri.at(-1)
            if (vociRisultatoDelegaR4(evento, false).length === 0 || !ultimo || ultimo.tu) return p
            const scritto = (ultimo as GiroR4 & { _testo?: string })._testo
            if (!scritto && !ultimo.titolo && !(ultimo.attrezzi ?? 0)) return p
            const giri = [...p.giri.slice(0, -1), chiudiGiro(ultimo)]
            giri.push({ numero: giri.length + 1, attrezzi: 0, inCorso: true })
            return { ...p, giri }
        }
        case 'CUSTOM': {
            const v = evento.value as Record<string, unknown> | undefined
            if (evento.name !== 'consumo-fornitore' || !v) return p
            const prompt = Number((v.usage as Record<string, unknown> | undefined)?.prompt_tokens)
            if (!Number.isFinite(prompt) || prompt <= 0) return p
            if (typeof v.esito === 'string' && v.esito !== 'completato') return p
            return { ...p, ultimaRichiesta: { prompt_tokens: prompt, completion_tokens: 0 } }
        }
        case 'StateDelta': {
            const op = Array.isArray(evento.delta) ? evento.delta[0] as Record<string, unknown> : null
            if (!op || typeof op.path !== 'string' || !op.path.startsWith('/file/')) return p
            const percorso = op.path.slice('/file/'.length)
            const dopo = String(op.value ?? '')
            const haPrima = 'prima' in op
            const righeGrezze = haPrima ? calcolaDiffRigheR4(op.prima ?? '', dopo) : null
            // senza `prima` (o oltre il tetto) il desktop non finge un diff: le righe del testo, tutte aggiunte per un file nuovo
            const righe = righeGrezze ?? dopo.split('\n').map((riga): RigaDiffR4 => [op.op === 'add' ? 'add' : 'ctx', riga])
            const voce: FileR4 = {
                path: percorso, ...contaRigheDiffR4(righe), nuovo: op.op === 'add', giro: p.giriVisti || null, diffVero: righeGrezze !== null,
                code: formattaRigheConNumeroR4(righe), simboliPersi: haPrima ? simboliSparitiR4(op.prima ?? '', dopo) : [],
            }
            // come la `Map` del desktop: un file già visto resta al suo posto, la voce si aggiorna
            const gia = p.file.findIndex((f) => f.path === percorso)
            return { ...p, file: gia < 0 ? [...p.file, voce] : p.file.map((f, i) => (i === gia ? voce : f)), ultimoFile: percorso }
        }
        default:
            return p
    }
}

/** I giri da mostrare: senza i campi di lavoro dell'adattatore. */
export function giriDelPannelloR4(p: PannelloR4): GiroR4[] {
    return p.giri.map((g) => ({
        numero: g.numero,
        ...(g.titolo ? { titolo: g.titolo } : {}),
        ...(g.tu ? { tu: true } : { attrezzi: g.attrezzi ?? 0 }),
        ...(g.inCorso && !g.tu ? { inCorso: true } : {}),
    }))
}
