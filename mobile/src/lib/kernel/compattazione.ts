/**
 * ⭐⭐⭐ IL NUCLEO DELLA COMPATTAZIONE — P4-ter (02/10/2026), uno solo per la chat e per il Codice.
 *
 * Owner 01/10 sera: «non abbiamo un compattatore nella chat e nel codice… il desktop l'ha già fatto in modo efficace» →
 * «Portare quello del desktop»; 02/10: «Nucleo unico», «Desktop + finestra utile di Hermes», «+1 su Hermes».
 *
 * ⇒ Porta in TypeScript delle funzioni PURE del desktop (`AVM-integrazione-r4` @ `e027390ba`,
 *   `harness-ui/src/kernel/compattazione-desktop.mjs`, sola lettura): stessi nomi, stessi numeri, stesse prove
 *   (`tests/unit/kernel/compattazione.test.ts`). Nessun I/O, nessuna rete, nessuno stato fra una chiamata e l'altra: la chat
 *   le importa da qui, il Codice attraverso `scripts/harness-talos/kernelPerIlBanco.ts`.
 *
 * Due aggiunte rispetto al desktop, da Hermes di oggi (`agent/context_compressor.py` @ `89937f8685`, 02/10/2026):
 *  1. la soglia si calcola sulla finestra UTILE = finestra − risposta riservata (`:2730-2769`, #43547): con un modello
 *     locale da 4.096 token e 1.024 di risposta la vecchia soglia (0,75 × 4.096 = 3.072) coincideva con tutto lo spazio per
 *     il prompt, e il motore rifiutava prima di compattare;
 *  2. i segreti si oscurano in tutto ciò che va al riassuntore e nel riassunto (`_redact_compaction_text`, `:1198-1202`,
 *     commit `fb86bc708d` del 27/09). Solo le forme delle CHIAVI, mai la rete generica di `diagnosticsReport.ts:85`, che
 *     cancellerebbe percorsi e impronte — proprio ciò che l'indice meccanico deve tenere.
 *
 * Decisioni dell'owner del desktop che il nucleo incarna (memoria `decisioni-owner-f2-context-engine-24-09`):
 *  - soglia = il MINORE fra un tetto assoluto (`TALOS_COMPACTION_TOKEN_CAP`, 200K) e 0,75 della finestra; emergenza 0,90;
 *  - la storia grezza si conserva; si scrive un record `talos.compattazione.v1` con `coveredThrough`;
 *  - restano alla lettera: i `system` iniziali, le ultime 3 richieste della persona, gli ultimi 2 scambi chiusi, e un indice
 *    MECCANICO (percorsi, impronte con provenienza, errori, ≤5 file da rileggere) che non passa dal riassuntore;
 *  - owner 26/09 «come Hermes»: la coda letterale sotto pressione si accorcia (inizio + fine + rimando), non blocca.
 */

/** Un messaggio nella forma chat-completions che chat e Codice si scambiano col modello. */
export interface TalosChiamataCompattabile {
    id: string
    type?: string
    function: { name: string, arguments: string }
}
export interface TalosMessaggioCompattabile {
    role: 'system' | 'user' | 'assistant' | 'tool' | string
    content?: string | null | unknown
    tool_calls?: TalosChiamataCompattabile[]
    tool_call_id?: string
    [altro: string]: unknown
}
type M = TalosMessaggioCompattabile

export const SCHEMA_RECORD_COMPATTAZIONE = 'talos.compattazione.v1'
export const VARIABILE_TETTO_TOKEN = 'TALOS_COMPACTION_TOKEN_CAP'
export const TETTO_TOKEN_DEFAULT = 200_000
export const FRAZIONE_FINESTRA = 0.75
export const FRAZIONE_EMERGENZA = 0.90
export const MOLTIPLICATORE_EMERGENZA_SENZA_FINESTRA = 1.2
export const RICHIESTE_UTENTE_LETTERALI = 3
export const SCAMBI_CHIUSI_LETTERALI = 2
export const FILE_RILETTI_MASSIMI = 5
/** 2.048 token di uscita (desktop): Hermes usa min(5% finestra, 10.000); da tarare sul banco, non una legge. */
export const MAX_TOKEN_RIASSUNTO = 2_048
export const PAROLE_MASSIME_RIASSUNTO = 1_200
export const MARCATORE_RIASSUNTO = '[conversazione compattata: quanto segue è un riassunto, non la cronologia originale]'
export const MARCATORE_INDICE = 'Indice meccanico (costruito dal codice, non dal modello):'
export const ATTREZZI_SUI_FILE: ReadonlySet<string> = new Set(['leggi', 'scrivi', 'file_edit'])
const CHIAVI_PERCORSO = ['percorso', 'path', 'file_path', 'filePath', 'file', 'filename', 'cartella']
const CHIAVI_COMANDO = ['comando', 'command', 'cmd', 'script']
const CARATTERI_PROVENIENZA = 240
const IMPRONTE_MASSIME = 20
const ERRORI_MASSIMI = 20

const PATTERN_CONTESTO_PIENO: readonly RegExp[] = [
    /context[_ ]length[_ ]exceeded/i,
    /maximum context length/i,
    /context (?:length|size|window)/i,
    /too many tokens/i,
    /token limit/i,
    /prompt is too long/i,
    /input is too long/i,
    /exceeds? the (?:maximum|max)(?: number of)?(?: input)? tokens/i,
    /max_model_len/i,
    /reduce the length/i,
    /\bLOCAL_CONTEXT_EXCEEDED\b/,
    // Il motore locale del telefono: `promptTooLongFailure` (`localAdapter.ts`) sale con questo codice.
    /\bTALOS_LOCAL_PROMPT_TOO_LONG\b/,
]

/* ═══════════════ «+1 su Hermes»: i segreti non arrivano al riassuntore ═══════════════
 * Le forme delle chiavi di `diagnosticsReport.ts:72-89` (intestazioni, `sk-…`, `AIza…`, JWT, chiavi private, parametri
 * d'URL) più le credenziali dentro gli URL (Hermes `redact_url_credentials=True`) e gli assegnamenti `*_API_KEY=…`.
 * ⛔ MAI la rete generica «qualsiasi sequenza opaca di 20+ caratteri»: cancellerebbe percorsi, impronte e comandi.
 */
const SEGNAPOSTO_SEGRETO = '[segreto oscurato]'
const FORME_DEI_SEGRETI: readonly RegExp[] = [
    /\b(?:proxy-)?authorization\b\s*[:=]\s*(?:bearer|basic|token|apikey)?\s*[^\s,;"']+/gi,
    /\b(?:bearer|basic)\s+[A-Za-z0-9._~+/=-]{8,}/gi,
    /\b(?:x-)?(?:goog-)?api[-_ ]?key\b\s*[:=]\s*[^\s,;"']+/gi,
    /\b[A-Z][A-Z0-9_]*(?:_API_KEY|_TOKEN|_SECRET|_PASSWORD)\s*[:=]\s*[^\s,;"']+/g,
    /\b(?:sk|tvly|xai|gsk|pplx|ghp|gho|ghs|github_pat)[-_][A-Za-z0-9_-]{8,}/gi,
    /[?&](?:key|api[-_]?key|apikey|access_token|token|password|secret)=[^&\s"']+/gi,
    /\bAIza[\w-]{35}\b/g,
    /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/g,
    /-----BEGIN[ A-Z]*PRIVATE KEY-----[\s\S]*?(?:-----END[ A-Z]*PRIVATE KEY-----|$)/g,
    /(\b[a-z][a-z0-9+.-]*:\/\/)[^\s/:@"']+:[^\s/@"']+@/gi,
]

/** Il testo con le forme delle chiavi sostituite; percorsi, impronte e comandi restano. Idempotente. */
export function oscuraPerRiassunto(testo: string): string {
    let pulito = String(testo ?? '')
    for (const forma of FORME_DEI_SEGRETI) {
        pulito = pulito.replace(forma, (trovato: string, schema?: string) =>
            (typeof schema === 'string' && trovato.startsWith(schema) ? `${schema}${SEGNAPOSTO_SEGRETO}@` : SEGNAPOSTO_SEGRETO))
    }
    return pulito
}

function oscuraArgomenti(argomenti: string): string {
    let oggetto: unknown
    try { oggetto = JSON.parse(argomenti) }
    catch { return oscuraPerRiassunto(argomenti) }
    // Dentro il JSON: una stringa JSON rotta farebbe 400 al fornitore (Hermes `:3009-3022`).
    const pulisci = (valore: unknown): unknown => {
        if (typeof valore === 'string') return oscuraPerRiassunto(valore)
        if (Array.isArray(valore)) return valore.map(pulisci)
        if (valore && typeof valore === 'object') {
            return Object.fromEntries(Object.entries(valore as Record<string, unknown>).map(([k, v]) => [k, pulisci(v)]))
        }
        return valore
    }
    return JSON.stringify(pulisci(oggetto))
}

function oscuraMessaggio(m: M): M {
    const contenuto = typeof m.content === 'string' ? oscuraPerRiassunto(m.content) : m.content
    const chiamate = Array.isArray(m.tool_calls)
        ? m.tool_calls.map((c) => ({ ...c, function: { ...c.function, arguments: oscuraArgomenti(String(c.function?.arguments ?? '')) } }))
        : undefined
    return { ...m, content: contenuto, ...(chiamate ? { tool_calls: chiamate } : {}) }
}

/* ═══════════════ misura ═══════════════ */

/** ~4 caratteri per token, la stessa stima del kernel (`stimaTokenConversazione`): decide SE compattare, non fattura. */
export function stimaTokenMessaggi(messaggi: readonly M[]): number {
    let somma = 0
    for (const m of messaggi) {
        if (typeof m.content === 'string') somma += Math.ceil(m.content.length / 4)
        for (const c of m.tool_calls ?? []) somma += Math.ceil(String(c.function?.arguments ?? '').length / 4)
    }
    return somma
}

function eSistema(m: M | undefined): boolean { return m?.role === 'system' }

/** Solo un tetto impostato deliberatamente; l'assenza non limita una finestra verificata. */
export function leggiTettoEsplicito(env: Record<string, string | undefined> = {}): number | null {
    const grezzo = env?.[VARIABILE_TETTO_TOKEN]
    if (grezzo === undefined || grezzo === null || String(grezzo).trim() === '') return null
    const testo = String(grezzo).trim()
    if (!/^\d+$/.test(testo)) return null
    const valore = Number(testo)
    return Number.isSafeInteger(valore) && valore > 0 ? valore : null
}

export interface TalosSoglieCompattazione {
    soglia: number
    warningTokens: number
    emergenza: number
    fonte: 'tetto' | 'finestra' | 'fallback'
    tettoToken: number | null
    finestraToken: number | null
    /** La finestra meno la risposta riservata (Hermes): la base delle frazioni. `null` senza finestra. */
    finestraUtile: number | null
}

/**
 * Le due soglie. `finestraToken` è la finestra del modello (catalogo del fornitore, o il contesto aperto del motore locale);
 * `riservaUscita` i token chiesti per la risposta. Con la finestra assente vale il solo tetto, come sul desktop.
 */
export function calcolaSoglie({ tettoToken = null, finestraToken = null, riservaUscita = null }: {
    tettoToken?: number | null, finestraToken?: number | null, riservaUscita?: number | null
} = {}): TalosSoglieCompattazione {
    const tettoEsplicito = Number.isSafeInteger(tettoToken) && (tettoToken as number) > 0 ? tettoToken as number : null
    const finestra = Number.isFinite(finestraToken) && (finestraToken as number) > 0 ? finestraToken as number : null
    if (finestra === null) {
        const soglia = tettoEsplicito ?? TETTO_TOKEN_DEFAULT
        return { soglia, warningTokens: Math.floor(soglia * 0.8), emergenza: Math.ceil(soglia * MOLTIPLICATORE_EMERGENZA_SENZA_FINESTRA), fonte: tettoEsplicito === null ? 'fallback' : 'tetto', tettoToken: soglia, finestraToken: null, finestraUtile: null }
    }
    // Hermes `_effective_input_window`: una riserva che lascia zero (o meno) non vale, si torna alla finestra intera.
    const riserva = Number.isFinite(riservaUscita) && (riservaUscita as number) > 0 ? Math.floor(riservaUscita as number) : 0
    const utile = finestra - riserva > 0 ? finestra - riserva : finestra
    const daFinestra = Math.floor(utile * FRAZIONE_FINESTRA)
    const soglia = tettoEsplicito === null ? daFinestra : Math.min(tettoEsplicito, daFinestra)
    return {
        soglia, warningTokens: Math.floor(soglia * 0.8), emergenza: Math.floor(utile * FRAZIONE_EMERGENZA),
        fonte: tettoEsplicito !== null && soglia === tettoEsplicito ? 'tetto' : 'finestra',
        tettoToken: tettoEsplicito, finestraToken: finestra, finestraUtile: utile,
    }
}

export interface TalosAncoraFornitore { promptTokens: number, lunghezza: number, stima?: number }

/**
 * Quanto occupa la richiesta che sta per partire: il numero VERO del fornitore per la lista lunga `lunghezza`, più la stima
 * dei messaggi aggiunti dopo. Un numero impossibile (sotto un quarto della stima di allora, o sopra la finestra) non si crede.
 */
export function misuraOccupazione({ ancora = null, messaggi = [], finestraToken = null }: {
    ancora?: TalosAncoraFornitore | null, messaggi?: readonly M[], finestraToken?: number | null
} = {}): { token: number, misura: 'fornitore' | 'stimato' } {
    const promptTokens = Number(ancora?.promptTokens)
    const lunghezza = Number(ancora?.lunghezza)
    const stimaAllora = Number(ancora?.stima)
    const finestra = Number(finestraToken)
    const plausibile = Number.isFinite(promptTokens) && promptTokens > 0
        && (!Number.isFinite(stimaAllora) || stimaAllora <= 0 || promptTokens >= stimaAllora / 4)
        && (!Number.isFinite(finestra) || finestra <= 0 || promptTokens <= finestra)
    if (plausibile && Number.isInteger(lunghezza) && lunghezza >= 0 && messaggi.length >= lunghezza) {
        return { token: promptTokens + stimaTokenMessaggi(messaggi.slice(lunghezza)), misura: 'fornitore' }
    }
    return { token: stimaTokenMessaggi(messaggi), misura: 'stimato' }
}

/** Scatta o no. Fuori da qui non esiste nessun «ogni N richieste». */
export function decidiCompattazione({ token, soglia, emergenza, tentativiEsauriti = false, emergenzaEsaurita = false }: {
    token: number, soglia: number, emergenza: number, tentativiEsauriti?: boolean, emergenzaEsaurita?: boolean
}): { scatta: boolean, motivo: 'soglia' | 'emergenza' | null } {
    if (!Number.isFinite(token)) return { scatta: false, motivo: null }
    if (token >= emergenza && !emergenzaEsaurita) return { scatta: true, motivo: 'emergenza' }
    if (token >= soglia && !tentativiEsauriti) return { scatta: true, motivo: 'soglia' }
    return { scatta: false, motivo: null }
}

/* ═══════════════ divisione ═══════════════ */

/** I `system` accodati DOPO l'ultimo messaggio non di sistema (il Piano): né riassunto né archivio. */
export function staccaEffimeri(messaggi: readonly M[] | null | undefined): { messaggi: M[], effimeri: M[] } {
    if (!Array.isArray(messaggi)) return { messaggi: [], effimeri: [] }
    let ultimoNonSistema = -1
    for (let i = messaggi.length - 1; i >= 0; i -= 1) {
        if (!eSistema(messaggi[i])) { ultimoNonSistema = i; break }
    }
    if (ultimoNonSistema === -1 || ultimoNonSistema === messaggi.length - 1) return { messaggi: [...messaggi], effimeri: [] }
    return { messaggi: messaggi.slice(0, ultimoNonSistema + 1), effimeri: messaggi.slice(ultimoNonSistema + 1) }
}

export function riattaccaEffimeri(messaggi: M[], effimeri: readonly M[]): M[] {
    if (!Array.isArray(effimeri) || effimeri.length === 0) return messaggi
    return [...messaggi, ...effimeri]
}

/** Una richiesta della persona: `user` che non è un nostro riassunto. */
export function eRichiestaDellaPersona(m: M | undefined): boolean {
    return m?.role === 'user' && typeof m.content === 'string' && !m.content.startsWith(MARCATORE_RIASSUNTO)
}

export interface TalosPartiCompattazione {
    testa: M[], mezzo: M[], coda: M[], richiesteLetterali: M[], tagliabile: boolean
}

/**
 * Testa (tutti i `system` iniziali), mezzo (si riassume), coda (gli ultimi `scambiChiusi` scambi, alla lettera). Uno scambio
 * comincia a una richiesta della persona o a una chiamata di attrezzo: il taglio non spezza mai una chiamata. Le ultime
 * `richiesteUtente` richieste della persona del mezzo restano alla lettera (Codex `compact.rs:59`).
 */
export function dividiPerCompattazione(messaggi: readonly M[] | null | undefined, { richiesteUtente = RICHIESTE_UTENTE_LETTERALI, scambiChiusi = SCAMBI_CHIUSI_LETTERALI } = {}): TalosPartiCompattazione {
    const lista = Array.isArray(messaggi) ? messaggi : []
    let fineTesta = 0
    while (fineTesta < lista.length && eSistema(lista[fineTesta])) fineTesta += 1
    const testa = lista.slice(0, fineTesta)
    const corpo = lista.slice(fineTesta)
    const inizioScambio = (m: M) => eRichiestaDellaPersona(m) || (m?.role === 'assistant' && Array.isArray(m.tool_calls) && m.tool_calls.length > 0)
    let taglio = 0
    let vistiScambi = 0
    for (let i = corpo.length - 1; i >= 0; i -= 1) {
        if (inizioScambio(corpo[i]!)) {
            vistiScambi += 1
            if (vistiScambi === scambiChiusi) { taglio = i; break }
        }
    }
    const mezzo = corpo.slice(0, taglio)
    const coda = corpo.slice(taglio)
    const utentiInCoda = coda.filter(eRichiestaDellaPersona).length
    const daTenere = Math.max(0, richiesteUtente - utentiInCoda)
    const richiesteLetterali = daTenere === 0 ? [] : mezzo.filter(eRichiestaDellaPersona).slice(-daTenere)
    const tagliabile = mezzo.length >= 2 && mezzo.some((m) => m?.role !== 'user')
    return { testa, mezzo, coda, richiesteLetterali, tagliabile }
}

/* ═══════════════ indice meccanico ═══════════════ */

function argomentiComeOggetto(argomenti: unknown): Record<string, unknown> | string | null {
    if (typeof argomenti === 'string') {
        try { const o = JSON.parse(argomenti); return o && typeof o === 'object' ? o as Record<string, unknown> : argomenti }
        catch { return argomenti }
    }
    return argomenti && typeof argomenti === 'object' ? argomenti as Record<string, unknown> : null
}

function percorsiDaArgomenti(argomenti: unknown): string[] {
    const args = argomentiComeOggetto(argomenti)
    if (!args || typeof args !== 'object') return []
    const trovati: string[] = []
    for (const chiave of CHIAVI_PERCORSO) {
        const v = args[chiave]
        if (typeof v === 'string' && v.trim()) trovati.push(v.trim())
    }
    return trovati
}

function provenienzaDellaChiamata(chiamata: TalosChiamataCompattabile | undefined): string {
    const nome = typeof chiamata?.function?.name === 'string' && chiamata.function.name ? chiamata.function.name : 'attrezzo'
    const args = argomentiComeOggetto(chiamata?.function?.arguments)
    let estratto = ''
    if (args && typeof args === 'object') {
        const chiave = [...CHIAVI_COMANDO, ...CHIAVI_PERCORSO].find((k) => typeof args[k] === 'string' && (args[k] as string).trim())
        estratto = chiave ? String(args[chiave]) : (Object.keys(args).length ? JSON.stringify(args) : '')
    }
    else if (typeof args === 'string') estratto = args
    estratto = oscuraPerRiassunto(String(estratto ?? '').replace(/\s+/g, ' ').trim())
    if (estratto.length > CARATTERI_PROVENIENZA) estratto = `${estratto.slice(0, CARATTERI_PROVENIENZA - 1)}…`
    return estratto ? `${nome} «${estratto}»` : nome
}

export interface TalosIndiceMeccanico {
    testo: string
    percorsi: string[]
    impronte: string[]
    origini: Record<string, string>
    errori: string[]
    fileRiletti: string[]
}
export type TalosIndicePrecedente = Partial<Omit<TalosIndiceMeccanico, 'testo'>> | null | undefined

/**
 * L'indice costruito dal CODICE (Factory, «Artifact tracking remains an unsolved problem»): percorsi dagli argomenti,
 * impronte (hex 7-64 con una cifra e una lettera) con la loro provenienza, righe d'errore dei nostri attrezzi, ultimi ≤5 file.
 * Si fonde con l'indice della compattazione precedente (dal record), mai per mano del modello.
 */
export function indiceMeccanico(messaggi: readonly M[], { fileRilettiMassimi = FILE_RILETTI_MASSIMI, precedente = null as TalosIndicePrecedente } = {}): TalosIndiceMeccanico {
    const percorsi = new Set<string>(Array.isArray(precedente?.percorsi) ? precedente.percorsi : [])
    const impronte = new Set<string>(Array.isArray(precedente?.impronte) ? precedente.impronte : [])
    const origini = new Map<string, string>()
    if (precedente?.origini && typeof precedente.origini === 'object') {
        for (const [impronta, da] of Object.entries(precedente.origini)) {
            if (impronte.has(impronta) && typeof da === 'string' && da) origini.set(impronta, da)
        }
    }
    const errori = new Set<string>(Array.isArray(precedente?.errori) ? precedente.errori : [])
    const suiFile: string[] = Array.isArray(precedente?.fileRiletti) ? [...precedente.fileRiletti].reverse() : []
    const IMPRONTA = /\b(?=[0-9a-f]*\d)(?=[0-9a-f]*[a-f])[0-9a-f]{7,64}\b/g
    const ERRORE = /^\s*(?:\w*error\b|ERR_[A-Z_]+|✗|exit [1-9]\d* \[sandbox\b)/i
    const chiamatePerId = new Map<string, TalosChiamataCompattabile>()
    for (const m of Array.isArray(messaggi) ? messaggi : []) {
        for (const c of m?.tool_calls ?? []) {
            if (typeof c?.id === 'string') chiamatePerId.set(c.id, c)
            const trovati = percorsiDaArgomenti(c?.function?.arguments)
            for (const p of trovati) percorsi.add(p)
            if (ATTREZZI_SUI_FILE.has(c?.function?.name) && trovati[0]) suiFile.push(trovati[0])
        }
        if (typeof m?.content !== 'string' || !m.content) continue
        if (m.role === 'tool' || m.role === 'assistant') {
            const da = m.role === 'assistant'
                ? 'testo dell\'assistente'
                : (m.tool_call_id && chiamatePerId.has(m.tool_call_id) ? provenienzaDellaChiamata(chiamatePerId.get(m.tool_call_id)) : 'risultato di un attrezzo')
            for (const hit of m.content.match(IMPRONTA) ?? []) {
                if (impronte.has(hit)) continue
                if (impronte.size >= IMPRONTE_MASSIME) {
                    const piuVecchia = impronte.values().next().value as string
                    impronte.delete(piuVecchia)
                    origini.delete(piuVecchia)
                }
                impronte.add(hit)
                origini.set(hit, da)
            }
            for (const riga of m.content.split(/\r?\n/)) {
                if (!ERRORE.test(riga)) continue
                const pulita = oscuraPerRiassunto(riga.trim().slice(0, 200))
                const voce = m.role === 'tool' ? `${pulita} ← ${da}` : pulita
                if (errori.has(voce)) continue
                if (errori.size >= ERRORI_MASSIMI) errori.delete(errori.values().next().value as string)
                errori.add(voce)
            }
        }
    }
    const fileRiletti: string[] = []
    for (let i = suiFile.length - 1; i >= 0 && fileRiletti.length < fileRilettiMassimi; i -= 1) {
        if (!fileRiletti.includes(suiFile[i]!)) fileRiletti.push(suiFile[i]!)
    }
    const riga = (titolo: string, valori: readonly string[]) => `- ${titolo}: ${valori.length ? valori.join(' · ') : '(nessuno)'}`
    const perProvenienza = new Map<string, string[]>()
    for (const impronta of impronte) {
        const da = origini.get(impronta) ?? 'provenienza non registrata (compattazione precedente)'
        if (!perProvenienza.has(da)) perProvenienza.set(da, [])
        perProvenienza.get(da)!.push(impronta)
    }
    const righeImpronte = impronte.size
        ? ['- Impronte trovate nei risultati, con ciò che le ha prodotte:', ...[...perProvenienza].map(([da, lista]) => `  · ${da}: ${lista.join(' · ')}`)]
        : [riga('Impronte trovate nei risultati', [])]
    const testo = [
        MARCATORE_INDICE,
        riga('Percorsi toccati', [...percorsi].slice(0, 60)),
        riga('File da rileggere prima di scriverci (ultimi letti/scritti)', fileRiletti),
        ...righeImpronte,
        riga('Errori visti', [...errori]),
    ].join('\n')
    return { testo, percorsi: [...percorsi], impronte: [...impronte], origini: Object.fromEntries(origini), errori: [...errori], fileRiletti }
}

/* ═══════════════ richiesta di riassunto, valutazione, proiezione ═══════════════ */

/** Cinque sezioni fisse, incrementale, budget dichiarato. In inglese come gli altri prompt del kernel. */
export function testoRichiestaDiRiassunto({ paroleMassime = PAROLE_MASSIME_RIASSUNTO, haRiassuntoPrecedente = false } = {}): string {
    return [
        'CONTEXT COMPACTION. The conversation above is about to be replaced by your summary: everything you do not',
        'mention is lost. The system messages, the last user requests, the last two exchanges and a mechanical index',
        'of file paths/hashes/errors are kept verbatim by the code — do NOT repeat them, spend your budget on the rest.',
        haRiassuntoPrecedente ? 'A previous summary is already in the conversation: MERGE it with what happened after it into one summary.' : '',
        '',
        'Write exactly these five sections, keep every heading even when empty:',
        '## Objective — what the person asked for, in their words when possible',
        '## Decisions — choices made and why (including what was tried and rejected)',
        '## Constraints — rules, limits and preferences stated by the person or found in the project',
        '## Done — what is verifiably done, with the real state of the files as you last saw it',
        '## Open — what is still to do, the next single step, and anything unverified',
        '',
        `Budget: at most ${paroleMassime} words in total. Preserve exact file paths, identifiers, error strings and`,
        'numbers. Reply with ONLY the summary. Do not call any tool in this turn.',
    ].filter((r) => r !== '').join('\n')
}

function senzaIndice(m: M): M {
    if (m?.role !== 'user' || typeof m.content !== 'string' || !m.content.startsWith(MARCATORE_RIASSUNTO)) return m
    const posizione = m.content.indexOf(MARCATORE_INDICE)
    return posizione === -1 ? m : { ...m, content: m.content.slice(0, posizione).trimEnd() }
}

/** Ciò che va al riassuntore: testa + mezzo (senza l'indice del riassunto precedente) + la richiesta. Tutto OSCURATO. */
export function costruisciRichiestaDiRiassunto({ testa = [], mezzo = [], paroleMassime = PAROLE_MASSIME_RIASSUNTO }: {
    testa?: readonly M[], mezzo?: readonly M[], paroleMassime?: number
} = {}): M[] {
    const haRiassuntoPrecedente = mezzo.some((m) => m?.role === 'user' && typeof m.content === 'string' && m.content.startsWith(MARCATORE_RIASSUNTO))
    return [
        ...testa,
        ...mezzo.map((m) => oscuraMessaggio(senzaIndice(m))),
        { role: 'user', content: testoRichiestaDiRiassunto({ paroleMassime, haRiassuntoPrecedente }) },
    ]
}

/** Vale solo testo finito senza chiamate. Il riassunto torna già oscurato: diventa memoria della conversazione. */
export function valutaRispostaDiRiassunto({ scelta, finishReason }: { scelta?: { content?: unknown, tool_calls?: unknown[] } | null, finishReason?: string | null } = {}): { ok: boolean, riassunto: string, motivo: 'attrezzo' | 'troncato' | 'vuoto' | null } {
    if (Array.isArray(scelta?.tool_calls) && scelta.tool_calls.length > 0) return { ok: false, riassunto: '', motivo: 'attrezzo' }
    if (finishReason !== null && finishReason !== undefined && finishReason !== 'stop') return { ok: false, riassunto: '', motivo: 'troncato' }
    const riassunto = oscuraPerRiassunto(String(scelta?.content ?? '').trim())
    if (!riassunto) return { ok: false, riassunto: '', motivo: 'vuoto' }
    return { ok: true, riassunto, motivo: null }
}

/** Testa + richieste letterali + UN messaggio `user` con riassunto e indice + coda. */
export function costruisciProiezione({ testa = [], richiesteLetterali = [], riassunto = '', indice = '', coda = [] }: {
    testa?: readonly M[], richiesteLetterali?: readonly M[], riassunto?: string, indice?: string, coda?: readonly M[]
} = {}): M[] {
    const contenuto = [MARCATORE_RIASSUNTO, String(riassunto ?? '').trim(), String(indice ?? '').trim()].filter(Boolean).join('\n\n')
    return [...testa, ...richiesteLetterali, { role: 'user', content: contenuto }, ...coda]
}

/* ═══════════════ la coda letterale sotto pressione (owner 26/09, «come Hermes») ═══════════════ */

export const FRAZIONE_CODA = 0.20
export const MOLTIPLICATORE_CODA_MORBIDA = 1.5
export const MESSAGGI_RECENTI_INTATTI = 3
export const CARATTERI_INIZIO_ESITO = 1_200
export const CARATTERI_FINE_ESITO = 400
export const CARATTERI_MINIMI_RIDUCIBILI = 2_000
export const MARCATORE_ACCORCIATO = 'characters omitted to fit the context window'
export const ESITO_DOPPIONE = '[Duplicate tool output: identical to a more recent result below, removed to fit the context window]'

export function budgetCoda(soglia: number): number {
    const s = Number(soglia)
    return Number.isFinite(s) && s > 0 ? Math.max(1, Math.floor(s * FRAZIONE_CODA)) : 1
}

/** Inizio e fine di un testo lungo col rimando in mezzo. Idempotente. */
export function accorciaTesto(testo: string, { inizio = CARATTERI_INIZIO_ESITO, fine = CARATTERI_FINE_ESITO } = {}): string {
    if (typeof testo !== 'string' || testo.length < CARATTERI_MINIMI_RIDUCIBILI || testo.length <= inizio + fine) return testo
    const tolti = testo.length - inizio - fine
    return `${testo.slice(0, inizio)}\n[… ${tolti.toLocaleString('en-US')} ${MARCATORE_ACCORCIATO} (TALOS context projection, not a byte range). Original message kept in session history. Re-read the source if you need the omitted part; do not re-run a command just to recover it.]\n${testo.slice(-fine)}`
}

function accorciaArgomenti(argomenti: string): string {
    if (typeof argomenti !== 'string' || argomenti.length < CARATTERI_MINIMI_RIDUCIBILI) return argomenti
    let oggetto: unknown
    try { oggetto = JSON.parse(argomenti) } catch { return argomenti }
    if (!oggetto || typeof oggetto !== 'object' || Array.isArray(oggetto)) return argomenti
    let cambiato = false
    const nuovo: Record<string, unknown> = {}
    for (const [chiave, valore] of Object.entries(oggetto as Record<string, unknown>)) {
        const corto = typeof valore === 'string' ? accorciaTesto(valore) : valore
        if (corto !== valore) cambiato = true
        nuovo[chiave] = corto
    }
    return cambiato ? JSON.stringify(nuovo) : argomenti
}

function riduciAl(lista: M[], i: number): boolean {
    const m = lista[i]!
    if (m?.role === 'tool' && typeof m.content === 'string') {
        const corto = accorciaTesto(m.content)
        if (corto === m.content) return false
        lista[i] = { ...m, content: corto }
        return true
    }
    if (m?.role === 'assistant' && Array.isArray(m.tool_calls) && m.tool_calls.length > 0) {
        let cambiato = false
        const chiamate = m.tool_calls.map((c) => {
            const args = c?.function?.arguments
            const corti = accorciaArgomenti(args)
            if (corti === args) return c
            cambiato = true
            return { ...c, function: { ...c.function, arguments: corti } }
        })
        if (!cambiato) return false
        lista[i] = { ...m, tool_calls: chiamate }
        return true
    }
    return false
}

/**
 * Se la coda sta sotto il tetto morbido torna IDENTICA (stesso oggetto). Altrimenti, fermandosi appena rientra: doppioni →
 * esiti/argomenti fuori dagli ultimi 3 → tutti tranne l'esito più recente → anche quello. `alMinimo` = nemmeno così rientra.
 * Cambia solo `content` e `arguments`: nessun messaggio sparisce, nessuna coppia si spezza.
 */
export function riduciCodaSottoPressione(coda: readonly M[], { budgetToken, stima = stimaTokenMessaggi }: { budgetToken: number, stima?: (lista: readonly M[]) => number }): { coda: readonly M[], ridotti: number, alMinimo: boolean, tetto: number } {
    const lista = Array.isArray(coda) ? coda : []
    const tetto = Math.floor(Math.max(1, Number(budgetToken) || 1) * MOLTIPLICATORE_CODA_MORBIDA)
    if (stima(lista) <= tetto) return { coda: lista, ridotti: 0, alMinimo: false, tetto }
    const copia = [...lista]
    let ridotti = 0
    const rientra = () => stima(copia) <= tetto
    const visti = new Set<string>()
    for (let i = copia.length - 1; i >= 0; i -= 1) {
        const m = copia[i]!
        if (m?.role !== 'tool' || typeof m.content !== 'string' || m.content.length < CARATTERI_MINIMI_RIDUCIBILI) continue
        if (visti.has(m.content)) { copia[i] = { ...m, content: ESITO_DOPPIONE }; ridotti += 1 }
        else visti.add(m.content)
    }
    if (rientra()) return { coda: copia, ridotti, alMinimo: false, tetto }
    const fineVecchi = Math.max(0, copia.length - MESSAGGI_RECENTI_INTATTI)
    for (let i = 0; i < fineVecchi && !rientra(); i += 1) if (riduciAl(copia, i)) ridotti += 1
    if (rientra()) return { coda: copia, ridotti, alMinimo: false, tetto }
    let ultimoEsito = -1
    for (let i = copia.length - 1; i >= 0; i -= 1) if (copia[i]?.role === 'tool') { ultimoEsito = i; break }
    for (let i = 0; i < copia.length && !rientra(); i += 1) if (i !== ultimoEsito && riduciAl(copia, i)) ridotti += 1
    if (!rientra() && ultimoEsito >= 0 && riduciAl(copia, ultimoEsito)) ridotti += 1
    return { coda: copia, ridotti, alMinimo: !rientra(), tetto }
}

/* ═══════════════ il record (la storia grezza resta com'è) ═══════════════ */

export interface TalosRecordCompattazione {
    schema: typeof SCHEMA_RECORD_COMPATTAZIONE
    coveredThrough: number
    riassunto: M[]
    tokenPrima: number | null
    tokenDopo: number | null
    misura: 'fornitore' | 'stimato'
    at: string
    modello: string | null
    indice: Omit<TalosIndiceMeccanico, 'testo'> | null
}

export function creaRecord({ coveredThrough, riassunto, tokenPrima, tokenDopo, misura, at, modello, indice = null }: {
    coveredThrough: number, riassunto: readonly M[], tokenPrima?: number | null, tokenDopo?: number | null,
    misura?: 'fornitore' | 'stimato', at?: string, modello?: string | null, indice?: TalosIndicePrecedente
}): TalosRecordCompattazione {
    if (!Number.isInteger(coveredThrough) || coveredThrough < 0) throw new TypeError('coveredThrough deve essere un intero ≥ 0')
    if (!Array.isArray(riassunto)) throw new TypeError('riassunto deve essere una lista di messaggi')
    return {
        schema: SCHEMA_RECORD_COMPATTAZIONE,
        coveredThrough,
        riassunto: riassunto.map((m) => ({ ...m })),
        tokenPrima: Number.isFinite(tokenPrima) ? tokenPrima as number : null,
        tokenDopo: Number.isFinite(tokenDopo) ? tokenDopo as number : null,
        misura: misura === 'fornitore' ? 'fornitore' : 'stimato',
        at: typeof at === 'string' && at ? at : new Date().toISOString(),
        modello: typeof modello === 'string' ? modello : null,
        indice: indice && typeof indice === 'object'
            ? {
                percorsi: [...(indice.percorsi ?? [])],
                impronte: [...(indice.impronte ?? [])],
                origini: indice.origini && typeof indice.origini === 'object' ? { ...indice.origini } : {},
                errori: [...(indice.errori ?? [])],
                fileRiletti: [...(indice.fileRiletti ?? [])],
            }
            : null,
    }
}

export function eRecordValido(record: unknown): record is TalosRecordCompattazione {
    const r = record as Partial<TalosRecordCompattazione> | null
    return !!r && r.schema === SCHEMA_RECORD_COMPATTAZIONE && Number.isInteger(r.coveredThrough) && (r.coveredThrough as number) >= 0 && Array.isArray(r.riassunto)
}

/** La proiezione dalla storia grezza: ciò che il record copre diventa il suo `riassunto`, il resto segue alla lettera. */
export function applicaRecord(storiaGrezza: readonly M[], record: unknown): M[] {
    const storia = Array.isArray(storiaGrezza) ? storiaGrezza : []
    if (!eRecordValido(record) || record.coveredThrough > storia.length) return [...storia]
    return [...record.riassunto, ...storia.slice(record.coveredThrough)]
}

/* ═══════════════ errori e ragionamento ═══════════════ */

/** `'contesto-pieno'` per le forme reali dell'overflow o un 413; un 400 senza quelle parole NON è overflow. */
export function classificaErroreFornitore(errore: unknown): 'contesto-pieno' | null {
    const e = errore as { stato?: unknown, status?: unknown, message?: unknown, code?: unknown } | null
    const stato = Number(e?.stato ?? e?.status ?? Number.NaN)
    const testo = `${e?.message ?? ''} ${e?.code ?? ''}`
    if (stato === 413) return 'contesto-pieno'
    if (PATTERN_CONTESTO_PIENO.some((p) => p.test(testo))) return 'contesto-pieno'
    return null
}

/** Il ragionamento per il riassunto: si ABBASSA, mai si alza, e non si inventa. */
export function reasoningPerRiassunto(reasoning: unknown): Record<string, unknown> | undefined {
    if (!reasoning || typeof reasoning !== 'object' || Array.isArray(reasoning)) return undefined
    const r = reasoning as Record<string, unknown>
    if (typeof r.effort !== 'string') return { ...r }
    if (['none', 'minimal', 'low'].includes(r.effort)) return { ...r }
    return { ...r, effort: 'low' }
}
