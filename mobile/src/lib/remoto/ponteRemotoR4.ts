/**
 * ⛔ CLIENT DEL CONTROLLO REMOTO, fetta R-M4 (ledger `LEDGER-CLIENT-REMOTO-MOBILE-2026-10-20.md`, «R-M4 — ledger»): un
 * `TalosR4ClientePonte` sopra il canale remoto, così la schermata del Codice («Codice identico alla chat», stesse schermate) parla col
 * r4 del PC come col proprio.
 *
 * Il PC tiene un elenco CHIUSO di operazioni (`operazioni.mjs` `OPERAZIONI_HTTP` @ c6aff0362): il telefono sceglie l'operazione, mai il
 * metodo o il percorso. Qui la mappa inversa, scritta a mano: una rotta del Codice che non è in elenco non parte e torna
 * `NOT_AVAILABLE_REMOTELY` (403) — un rifiuto chiaro, mai un guasto muto. Le risposte tornano nella busta di r4 (`{ok,data}` /
 * `{ok:false,error:{code,message}}`), gli eventi di `session.events` in SSE come la rotta `/events` (`http-app.mjs:3086`).
 * ⛔ Il ponte NON porta chiavi né accessi: dei fornitori passa solo l'elenco ridotto dal PC (`providers.list`), le rotte
 * `/providers/<id>…` non sono in elenco.
 */
import type { TalosR4ClientePonte } from '@/lib/harness/r4/clienteR4'
import { inviaFileAlPc, inviaImmagineAlPc, type NativoFileRemoti, type StatoFileRemoto } from '@/lib/remoto/fileRemoti'

/** Ciò che il ponte usa del cliente del canale (`clienteRemoto.ts`). */
export interface ClientePerIlPonte {
    richiesta(op: string, args: Record<string, unknown>): Promise<unknown>
    iscrivi(sessionId: string, after: number, onEvento: (evento: unknown) => void): Promise<{ sub: string, disiscrivi(): Promise<void> }>
    onChiuso(cb: (motivo: string) => void): void
}

type Metodo = 'GET' | 'POST'
interface Voce { metodo: Metodo, re: RegExp, op: string, args: (m: RegExpMatchArray, corpo: Record<string, unknown> | undefined) => Record<string, unknown> }

const ID = '([^/?#]+)'
/**
 * D-MOCK-11 (contratto R5.12, parte 1, punti 2-4): le due operazioni del consenso sono del SOLO canale (`operazioni.mjs`
 * `OPERAZIONI_CONSENSO`), non rotte di r4: qui due voci del ponte, perché il Codice e la lista le chiamino come ogni altra
 * (`consensoDelPc.ts`). Il r4 del telefono non le ha.
 */
export const PERCORSO_CHIEDI_CONSENSO = '/api/v1/remote/consent/request'
export const PERCORSO_ATTENDI_CONSENSO = '/api/v1/remote/consent/wait'
/**
 * R5.13 (contratto Parte 2, D-3): le offerte di file del PC (`file.offers`, senza argomenti), operazione del solo canale. Il Codice la
 * legge anche all'apertura: un PC che non la conosce (`UNKNOWN_OPERATION`) non riceve file, e il «+» lo dice (Desktop 25/10).
 */
export const PERCORSO_OFFERTE_FILE = '/api/v1/remote/file-offers'
const senzaPercorsiDelPc = (c: Record<string, unknown>) =>
    Object.fromEntries(Object.entries(c).filter(([k]) => k !== 'cartellaLibera' && k !== 'workspaceLaunchId'))
const sid = (m: RegExpMatchArray) => decodeURIComponent(m[1]!)
/** La mappa inversa di `OPERAZIONI_HTTP` (r4 `c6aff0362`). L'ordine conta: `file-undo/redo` prima di `file-undo/<turno>`. */
const VOCI: readonly Voce[] = Object.freeze([
    { metodo: 'GET', re: /^\/api\/v1\/sessions$/u, op: 'sessions.list', args: () => ({}) },
    // ⛔ RA-03 (revisione 21/10/2026): dal telefono la cartella si sceglie SOLO per id dell'allowlist (`cartellaId`, `projects.list`);
    // un percorso del PC (`cartellaLibera`, `workspaceLaunchId`) non parte mai, qualunque cosa chieda la schermata
    { metodo: 'POST', re: /^\/api\/v1\/sessions\/custom$/u, op: 'session.start', args: (_m, c) => ({ corpo: senzaPercorsiDelPc(c ?? {}) }) },
    ...([['resume', 'session.send'], ['queue', 'session.queue'], ['stop', 'session.stop'], ['approve', 'session.approve'],
        ['question', 'session.answer'], ['plan-decision', 'session.plan'], ['settings', 'session.settings'], ['rename', 'session.rename'],
        // revisione del blocco 3 (S3), owner 24/10/2026 «Sì, uguali alle locali»: `session.delete` del PC (9e548d7b8), col consenso
        ['delete', 'session.delete']] as const)
        .map(([coda, op]): Voce => ({
            metodo: 'POST', re: new RegExp(`^/api/v1/sessions/${ID}/${coda}$`, 'u'), op, args: (m, c) => ({ sessionId: sid(m), corpo: c ?? {} }),
        })),
    { metodo: 'GET', re: new RegExp(`^/api/v1/sessions/${ID}/file-undo$`, 'u'), op: 'session.undo.list', args: (m) => ({ sessionId: sid(m) }) },
    { metodo: 'POST', re: new RegExp(`^/api/v1/sessions/${ID}/file-undo/redo$`, 'u'), op: 'session.undo.redo', args: (m) => ({ sessionId: sid(m) }) },
    { metodo: 'GET', re: new RegExp(`^/api/v1/sessions/${ID}/file-undo/(\\d{1,9})$`, 'u'), op: 'session.undo.preview', args: (m) => ({ sessionId: sid(m), turn: Number(m[2]) }) },
    { metodo: 'POST', re: new RegExp(`^/api/v1/sessions/${ID}/file-undo/(\\d{1,9})$`, 'u'), op: 'session.undo', args: (m, c) => ({ sessionId: sid(m), turn: Number(m[2]), corpo: c ?? {} }) },
    { metodo: 'POST', re: new RegExp(`^/api/v1/sessions/${ID}/close$`, 'u'), op: 'session.close', args: (m) => ({ sessionId: sid(m) }) },
    { metodo: 'GET', re: new RegExp(`^/api/v1/sessions/${ID}/mcp$`, 'u'), op: 'session.mcp.list', args: (m) => ({ sessionId: sid(m) }) },
    { metodo: 'POST', re: new RegExp(`^/api/v1/sessions/${ID}/mcp/${ID}/test$`, 'u'), op: 'session.mcp.test', args: (m) => ({ sessionId: sid(m), serverId: decodeURIComponent(m[2]!) }) },
    // r4 c6aff0362: le viste della sessione del PC (agenti, attese, /usage, processi in sola lettura, hook, /compact) e del PC
    // (/doctor, cartelle per nome, modelli, fornitori RIDOTTI dal PC: mai chiavi né indirizzi). Le azioni sui processi e sugli
    // hook, le risorse dei processi e ogni rotta d'accesso dei fornitori restano fuori.
    ...([['children', 'session.children'], ['pending', 'session.pending'], ['metrics', 'session.metrics'],
        ['processes', 'session.processes'], ['hooks', 'session.hooks.list']] as const)
        .map(([coda, op]): Voce => ({
            metodo: 'GET', re: new RegExp(`^/api/v1/sessions/${ID}/${coda}$`, 'u'), op, args: (m) => ({ sessionId: sid(m) }),
        })),
    { metodo: 'POST', re: new RegExp(`^/api/v1/sessions/${ID}/compact$`, 'u'), op: 'session.compact', args: (m, c) => ({ sessionId: sid(m), corpo: c ?? {} }) },
    { metodo: 'GET', re: /^\/api\/v1\/doctor$/u, op: 'doctor', args: () => ({}) },
    { metodo: 'GET', re: /^\/api\/v1\/projects$/u, op: 'projects.list', args: () => ({}) },
    { metodo: 'GET', re: /^\/api\/v1\/models$/u, op: 'models.list', args: () => ({}) },
    { metodo: 'GET', re: /^\/api\/v1\/providers$/u, op: 'providers.list', args: () => ({}) },
    // r4 2297237fd (R-M4 bis, Q1 «Quelli del PC»): i modelli di un fornitore del PC (il PC accetta solo quelli col catalogo nel suo
    // selettore) e i suoi modelli locali, ridotti dal PC (mai percorsi)
    { metodo: 'GET', re: new RegExp(`^/api/v1/providers/${ID}/models$`, 'u'), op: 'provider.models', args: (m) => ({ provider: decodeURIComponent(m[1]!) }) },
    { metodo: 'GET', re: /^\/api\/v1\/local-models$/u, op: 'local-models.list', args: () => ({}) },
    // D-MOCK-11: solo l'id, dal corpo; un id che manca o è storto lo ferma `idValidi`
    { metodo: 'POST', re: /^\/api\/v1\/remote\/consent\/request$/u, op: 'consent.request', args: (_m, c) => ({ cartellaId: c?.cartellaId }) },
    { metodo: 'POST', re: /^\/api\/v1\/remote\/consent\/wait$/u, op: 'consent.wait', args: (_m, c) => ({ richiestaId: c?.richiestaId }) },
    { metodo: 'GET', re: /^\/api\/v1\/remote\/file-offers$/u, op: 'file.offers', args: () => ({}) },
])
const EVENTI = new RegExp(`^/api/v1/sessions/${ID}/events$`, 'u')
/** La regola del PC per gli id (`operazioni.mjs` `ID_SESSIONE`): mai soli punti, solo caratteri sicuri. Vale anche per gli id MCP. */
const ID_VALIDO = /^(?!\.+$)[A-Za-z0-9._:-]{1,200}$/u
/** La stessa regola per un id che il telefono riceve o sceglie (una cartella di `projects.list`, R-M4 Q2). */
export const idValidoDelPc = (id: unknown): id is string => typeof id === 'string' && ID_VALIDO.test(id)
const idValidi = (args: Record<string, unknown>) =>
    ['sessionId', 'serverId', 'provider', 'cartellaId', 'richiestaId'].every((k) => !(k in args) || (typeof args[k] === 'string' && ID_VALIDO.test(args[k] as string)))

const STATO_DEL_CODICE: Readonly<Record<string, number>> = Object.freeze({
    NOT_FOUND: 404, BAD_MESSAGE: 400, RATE_LIMITED: 429, NOT_ALLOWED_REMOTELY: 403, UNKNOWN_OPERATION: 403,
    NOT_AVAILABLE_REMOTELY: 403, DISCONNECTED: 503,
    // B9-2: una bozza tolta ha fermato il suo invio (la richiesta non ha più chi la aspetta)
    CANCELLED: 499,
    // D-MOCK-11, contratto R5.12 «Errors»: la cartella non c'è più (404), la scrittura vuole il consenso (403)
    FOLDER_NOT_LISTED: 404, CONSENT_REQUIRED: 403,
})

const busta = (stato: number, corpo: unknown) => ({ stato, corpo: JSON.stringify(corpo) })
// D-RM4-5: col motivo e i parametri, se il PC li ha dati, come la busta di r4 (`erroreDalCorpo` sceglie la frase da lì)
// RA-14: il codice viene dal PC; `__proto__` o `constructor` non sono stati
const statoDelCodice = (code: string) => (Object.hasOwn(STATO_DEL_CODICE, code) ? STATO_DEL_CODICE[code]! : 500)
/** RA-02 (revisione 21/10/2026): il motivo nella forma del nativo, l'unica che il Codice riconosce come «la sessione non c'è più». */
const motivoDelFlusso = (code: string) => (code === 'NOT_FOUND' ? 'HTTP 404' : code)
// RA-04: lo stato che r4 ha dato al PC, se il PC lo manda (il cliente lo accetta solo fra 400 e 599); altrimenti dal codice
const rifiuto = (code: string, message: string, extra: { reason?: unknown, params?: unknown, stato?: unknown } = {}) =>
    busta(typeof extra.stato === 'number' ? extra.stato : statoDelCodice(code), { ok: false, error: { code, message,
        ...(typeof extra.reason === 'string' ? { reason: extra.reason } : {}), ...(extra.params && typeof extra.params === 'object' ? { params: extra.params } : {}) } })

/** Il percorso senza query e la query. Un «..» non combacia con nessuna voce; un id di soli punti lo ferma `ID_VALIDO`. */
function dividi(percorso: string): { via: string, query: URLSearchParams } {
    const [via = '', q = ''] = percorso.split('?', 2)
    return { via, query: new URLSearchParams(q) }
}

/** R5.13 F3: la rotta delle immagini del Codice (`POST /api/v1/chat-images {nome, dataUrl}`), portata al PC a pezzi senza sessione. */
const IMMAGINI = /^\/api\/v1\/chat-images$/u
const DATA_URL = /^data:(image\/[a-z0-9.+-]+);base64,([A-Za-z0-9+/]*={0,2})$/u

/**
 * R5.13 F3 (ledger `LEDGER-SCAMBIO-FILE-R5-13-CODICE-DISPOSITIVO-2026-10-25.md`): allegare da una sessione sul PC, come la finestra.
 * `nativo` legge i byte dei file (`TalosRemotoFile`; null fuori dall'app), `attendi` torna quando il canale col PC è di nuovo aperto,
 * `immagineScelta` legge sul dispositivo un'immagine scelta come file (lavoro solo locale, dal client nativo di r4).
 */
export interface OpzioniFileDelPonte {
    nativo: () => NativoFileRemoti | null
    attendi: () => Promise<void>
    immagineScelta?: TalosR4ClientePonte['immagineScelta']
}

const guasto = (code: string, message = code) => Object.assign(new Error(message), { code })

/**
 * Blocco 8 del Desktop (25/10): il PC tiene al più 8 trasferimenti aperti per dispositivo, immagini e file insieme; il vassoio ne
 * ammette 10 in una scelta. Dal ponte ne partono al più 3 alla volta (CAMBIA 1: due orfani lasciano 6 posti), gli altri aspettano il loro turno (mai un `RATE_LIMITED`).
 */
const TRASFERIMENTI_INSIEME = 3
function aTurno(massimo: number) {
    let attivi = 0
    const coda: Array<() => void> = []
    return async <T>(lavoro: () => Promise<T>, segnale?: AbortSignal): Promise<T> => {
        if (segnale?.aborted) throw guasto('CANCELLED')
        if (attivi >= massimo) {
            // B9-2: chi è tolto mentre aspetta lascia la coda senza prendere un posto
            await new Promise<void>((avanti, ferma) => {
                const turno = () => { segnale?.removeEventListener('abort', via); avanti() }
                const via = () => { const i = coda.indexOf(turno); if (i >= 0) coda.splice(i, 1); ferma(guasto('CANCELLED')) }
                coda.push(turno)
                segnale?.addEventListener('abort', via, { once: true })
            })
            // B9-6: il posto arriva GIÀ passato da chi esce (`attivi` non scende), così nessuno entra in mezzo
        } else {
            attivi += 1
        }
        try {
            return await lavoro()
        } finally {
            const prossimo = coda.shift()
            if (prossimo) prossimo()
            else attivi -= 1
        }
    }
}

/** `soloDalPc`: la frase, nella lingua dell'app, di un'azione che il telefono non può chiedere (la riga d'errore mostra il `message`). */
export function creaPonteRemotoR4(
    cliente: ClientePerIlPonte,
    { soloDalPc = () => 'Only from the computer', file }: { soloDalPc?: () => string, file?: OpzioniFileDelPonte } = {},
): TalosR4ClientePonte {
    const ascoltatori = new Map<string, Set<(d: Record<string, unknown>) => void>>()
    const turno = aTurno(TRASFERIMENTI_INSIEME)
    const emetti = (evento: string, d: Record<string, unknown>) => { for (const cb of ascoltatori.get(evento) ?? []) cb(d) }
    const flussi = new Map<string, () => Promise<void>>()
    // RA-06: i flussi la cui iscrizione è ancora in volo, e quelli chiusi nel frattempo (l'iscrizione appena nata si disiscrive)
    const inVolo = new Set<string>()
    const annullati = new Set<string>()

    cliente.onChiuso((motivo) => {
        for (const id of [...flussi.keys()]) {
            flussi.delete(id)
            emetti('r4Errore', { id, motivo })
        }
    })

    /** D-5/D-6: `{nome, dataUrl}` → `file.upload.*` con `immagine: true` → la busta di r4 `{id, mimeType, byte}`. */
    async function immagineAlPc(corpo: string | undefined, segnale?: AbortSignal, onStato?: (s: StatoFileRemoto) => void) {
        let letto: unknown = null
        try { letto = JSON.parse(corpo ?? '') } catch { letto = null }
        const c = letto && typeof letto === 'object' && !Array.isArray(letto) ? letto as Record<string, unknown> : null
        const m = typeof c?.dataUrl === 'string' ? c.dataUrl.match(DATA_URL) : null
        if (!c || typeof c.nome !== 'string' || !c.nome || !m) return rifiuto('BAD_MESSAGE', 'An image needs a name and a data URL.')
        let byte: Uint8Array
        try {
            const binario = atob(m[2]!)
            byte = new Uint8Array(binario.length)
            for (let i = 0; i < binario.length; i++) byte[i] = binario.charCodeAt(i)
        } catch { return rifiuto('BAD_MESSAGE', 'An image needs a name and a data URL.') }
        // B9-7: un'immagine vuota ha il motivo del PC (`image-empty`), detto qui senza mandarla
        if (!byte.length) return rifiuto('BAD_MESSAGE', 'An image for the model cannot be empty.', { reason: 'image-empty' })
        try {
            const nome = c.nome
            const r = await turno(() => inviaImmagineAlPc(cliente, { nome, byte, segnale, ...(onStato ? { onStato } : {}) }, file!.attendi), segnale)
            return busta(200, { ok: true, data: { id: r.immagineId, mimeType: r.mime, byte: r.byte } })
        } catch (e) {
            // ⛔ CAMBIA 2 (Desktop, 25/10): un guasto senza codice (un difetto, un lancio del nativo) non è «connessione persa»
            const code = typeof (e as { code?: unknown })?.code === 'string' ? (e as { code: string }).code : 'BAD_MESSAGE'
            return rifiuto(code, String((e as Error)?.message ?? code), e as { reason?: unknown, params?: unknown, stato?: unknown })
        }
    }

    const ponte: TalosR4ClientePonte = {
        async richiesta({ metodo, percorso, corpo, segnale, onStato }) {
            const parti = dividi(percorso)
            if (file && metodo === 'POST' && IMMAGINI.test(parti.via)) return immagineAlPc(corpo, segnale, onStato)
            const voce = VOCI.find((v) => v.metodo === metodo && v.re.test(parti.via))
            if (!voce) return rifiuto('NOT_AVAILABLE_REMOTELY', soloDalPc())
            let oggetto: Record<string, unknown> | undefined
            if (corpo !== undefined && corpo !== '') {
                let letto: unknown
                try { letto = JSON.parse(corpo) } catch { letto = null }
                if (!letto || typeof letto !== 'object' || Array.isArray(letto)) return rifiuto('BAD_MESSAGE', 'The body must be an object.')
                oggetto = letto as Record<string, unknown>
            }
            let args: Record<string, unknown>
            try { args = voce.args(parti.via.match(voce.re)!, oggetto) } catch { args = { sessionId: '' } } // `%` storto
            if (!idValidi(args)) return rifiuto('BAD_MESSAGE', 'A valid id is needed.')
            try {
                const data = await cliente.richiesta(voce.op, args)
                return busta(200, { ok: true, data })
            } catch (e) {
                const code = typeof (e as { code?: unknown })?.code === 'string' ? (e as { code: string }).code : 'DISCONNECTED'
                return rifiuto(code, String((e as Error)?.message ?? code), e as { reason?: unknown, params?: unknown, stato?: unknown })
            }
        },

        async apriFlusso({ id, percorso }) {
            const parti = dividi(percorso)
            const m = parti.via.match(EVENTI)
            if (!m) { emetti('r4Errore', { id, motivo: 'NOT_AVAILABLE_REMOTELY' }); return }
            const after = Number(parti.query.get('after') ?? 0)
            let sessionId = ''
            try { sessionId = sid(m) } catch { /* `%` storto */ }
            if (!ID_VALIDO.test(sessionId)) { emetti('r4Errore', { id, motivo: 'BAD_MESSAGE' }); return }
            inVolo.add(id)
            try {
                const iscrizione = await cliente.iscrivi(sessionId, Number.isSafeInteger(after) && after >= 0 ? after : 0, (evento) => {
                    const sequenza = (evento as { _sequenza?: unknown })?._sequenza
                    const testa = typeof sequenza === 'number' ? `id: ${sequenza}\n` : ''
                    emetti('r4Pezzo', { id, testo: `${testa}data: ${JSON.stringify(evento)}\n\n` })
                })
                if (annullati.delete(id)) { await iscrizione.disiscrivi().catch(() => undefined); return }
                flussi.set(id, iscrizione.disiscrivi)
            } catch (e) {
                if (annullati.delete(id)) return
                emetti('r4Errore', { id, motivo: motivoDelFlusso(typeof (e as { code?: unknown })?.code === 'string' ? (e as { code: string }).code : 'DISCONNECTED') })
            } finally {
                inVolo.delete(id)
            }
        },

        async chiudiFlusso({ id }) {
            if (inVolo.has(id)) annullati.add(id)
            const disiscrivi = flussi.get(id)
            flussi.delete(id)
            await disiscrivi?.().catch(() => undefined)
        },

        // Il terminale del PC non passa dal telefono (non è nell'elenco del PC): rifiuto chiaro.
        async apriTerminale({ id }) { emetti('r4TermErrore', { id, motivo: 'NOT_AVAILABLE_REMOTELY' }) },
        async scriviTerminale() {},
        async ridimensionaTerminale() {},
        async chiudiTerminale() {},

        async addListener(evento, ascoltatore) {
            if (!ascoltatori.has(evento)) ascoltatori.set(evento, new Set())
            ascoltatori.get(evento)!.add(ascoltatore)
            return { remove: async () => { ascoltatori.get(evento)?.delete(ascoltatore) } }
        },
    }
    if (file) {
        // D-6 (Desktop, 25/10), come la finestra: un file vuole una conversazione che esiste; mai una sessione vuota apposta
        ponte.allegaFile = async ({ uri, testo, sessionId, onStato, segnale }) => {
            if (typeof sessionId !== 'string' || !ID_VALIDO.test(sessionId)) throw guasto('FILE_NO_CONVERSATION', 'Open a conversation before attaching a file.')
            const nativo = file.nativo()
            if (!nativo) throw guasto('NOT_AVAILABLE_REMOTELY', soloDalPc())
            const r = await turno(() => inviaFileAlPc(cliente, nativo, { sessionId, uri, testo, segnale }, (s) => onStato?.(s), file.attendi), segnale)
            return { tipo: r.tipo, nome: r.nome, percorso: r.percorso, bytes: r.bytes, ...(r.testo === undefined ? {} : { testo: r.testo }) }
        }
        if (file.immagineScelta) ponte.immagineScelta = file.immagineScelta
    }
    return ponte
}
