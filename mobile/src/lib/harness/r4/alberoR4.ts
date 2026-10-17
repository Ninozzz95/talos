/**
 * ⛔ K3-FILE (ledger `LEDGER-K3-CODICE-COME-LA-CHAT-2026-10-15.md`, owner 15/10 sera «Albero completo»): l'albero dei file del pannello ▤
 * del Codice su r4. Regole del desktop r4 @ `701c6c0d2` (prima `2161afb32`; in mezzo il #44, i motivi dei rifiuti):
 *   · `harness-ui/src/workspace-tree.mjs:34-36`: le voci `{nome, cartella}`, cartelle prima e poi il nome (le ordina il server);
 *   · `legacy/app.js` `costruisciNodoAlbero` (:19378, freccia solo sulle cartelle), `categoriaFileAlbero` (:19292), la ricerca
 *     (:18436-18438: «nessun file», elenco incompleto col suo motivo, cartelle saltate) e le parole `app.files.*`/`app.common.*`;
 *   · i rifiuti delle rotte (`errorEnvelope`, `http-app.mjs:1188`): misurato sul Pad, solo `FILE_EXISTS` e `FILE_NOT_FOUND` arrivano col
 *     loro codice; ogni altro rifiuto dei file è `QUERY_INVALID` «Invalid query», che non spiega niente: qui diventa l'azione non
 *     riuscita, nelle parole del desktop (`app.common.renameFailed`, …), e i casi che si possono vedere prima si controllano prima.
 *     Dal pin 701c6c0d2 il rifiuto porta il suo MOTIVO (`motivi-dei-file.mjs`), e la sua frase viene prima (`fraseDelMotivoR4`).
 * Adattamento dichiarato: sul desktop si sposta trascinando; sul telefono «Sposta in…» sceglie la cartella (`cartellePerSpostareR4`).
 */
import app from './testi/app-file-r4.json'
import errori from './testi/errori-file-r4.json'
import { TESTI_SERVER_R4, testoDelServerR4 } from './testiServerR4'
import { fraseDelMotivoR4 } from './fraseDelMotivoR4'

type Tabella = { it: Record<string, string>; en: Record<string, string> }
const AREE: Record<string, Tabella> = { app, errori }
const italiano = (lingua: string) => /^it(?:-|$)/iu.test(lingua)
const propria = (t: Record<string, string>, k: string) => (Object.hasOwn(t, k) ? t[k] : undefined)

/** `t('app.files.…' | 'app.common.…' | 'errori.<CODICE>.message')` di r4: la lingua, poi l'inglese. */
export function testoFileR4(chiave: string, lingua: string, valori?: Record<string, unknown>): string {
    const punto = chiave.indexOf('.')
    const area = AREE[chiave.slice(0, punto)]
    const nome = chiave.slice(punto + 1)
    if (!area) return chiave
    const frase = propria(italiano(lingua) ? area.it : area.en, nome) ?? propria(area.en, nome) ?? chiave
    if (!valori) return frase
    return frase.replace(/\{([a-zA-Z0-9_]+)\}/g, (tutto, k: string) => (k in valori ? String(valori[k]) : tutto))
}

export interface VoceAlberoR4 {
    nome: string
    cartella: boolean
}

/** Un nome solo, mai un percorso: senza barre, non «.» né «..» (le stesse regole che r4 fa rispettare). */
const nomeSemplice = (nome: unknown): nome is string => typeof nome === 'string' && nome !== '' && nome !== '.' && nome !== '..' && !/[\\/]/u.test(nome)

/** Le voci di `GET /:id/tree` nell'ordine del server; una voce storta non entra; un rifiuto è un elenco vuoto. */
export function vociAlberoR4(risposta: unknown): VoceAlberoR4[] {
    const voci = (risposta as { data?: { voci?: unknown } } | null)?.data?.voci
    if (!Array.isArray(voci)) return []
    return voci.flatMap((v) => (v && typeof v === 'object' && nomeSemplice((v as VoceAlberoR4).nome) && typeof (v as VoceAlberoR4).cartella === 'boolean'
        ? [{ nome: (v as VoceAlberoR4).nome, cartella: (v as VoceAlberoR4).cartella }] : []))
}

export const percorsoFiglioR4 = (cartella: string, nome: string) => (cartella ? `${cartella}/${nome}` : nome)
export const genitoreR4 = (percorso: string) => (percorso.includes('/') ? percorso.slice(0, percorso.lastIndexOf('/')) : '')

/** `categoriaFileAlbero`: «code» per le estensioni del codice, altrimenti «file». */
const ESTENSIONI_CODICE = new Set(['js', 'mjs', 'cjs', 'ts', 'tsx', 'jsx', 'vue', 'py', 'java', 'kt', 'go', 'rs', 'c', 'cpp', 'h', 'rb', 'php', 'swift'])
export function categoriaFileR4(nome: string): 'code' | 'file' {
    const m = /\.([a-z0-9]+)$/iu.exec(nome)
    return m && ESTENSIONI_CODICE.has(m[1].toLowerCase()) ? 'code' : 'file'
}

export interface RigaAlberoR4 {
    percorso: string
    nome: string
    livello: number
    cartella: boolean
    /** solo per le cartelle: aperta o no; `null` per i file */
    aperta: boolean | null
    /** una cartella aperta di cui il livello non è ancora arrivato */
    caricamento: boolean
    categoria: 'folder' | 'code' | 'file'
}

/** Le righe a schermo: ogni livello letto (chiave = percorso della cartella, '' = radice), e i figli solo delle cartelle aperte. */
export function righeAlberoR4(livelli: ReadonlyMap<string, VoceAlberoR4[]>, aperte: ReadonlySet<string>): RigaAlberoR4[] {
    const righe: RigaAlberoR4[] = []
    const scendi = (cartella: string, livello: number) => {
        for (const voce of livelli.get(cartella) ?? []) {
            const percorso = percorsoFiglioR4(cartella, voce.nome)
            const aperta = voce.cartella ? aperte.has(percorso) : null
            righe.push({
                percorso, nome: voce.nome, livello, cartella: voce.cartella, aperta,
                caricamento: Boolean(aperta) && !livelli.has(percorso),
                categoria: voce.cartella ? 'folder' : categoriaFileR4(voce.nome),
            })
            if (aperta) scendi(percorso, livello + 1)
        }
    }
    scendi('', 0)
    return righe
}

/** Il nome scritto dalla persona, controllato PRIMA di mandarlo (r4 rifiuterebbe con un «Invalid query» che non spiega niente). */
export function nomeValidoR4(scritto: string): { ok: true; nome: string } | { ok: false; motivo: 'vuoto' | 'percorso' | 'lungo' } {
    const nome = String(scritto ?? '').trim()
    if (!nome) return { ok: false, motivo: 'vuoto' }
    if (!nomeSemplice(nome)) return { ok: false, motivo: 'percorso' }
    if (nome.length > 255) return { ok: false, motivo: 'lungo' }
    return { ok: true, nome }
}

export type AzioneFileR4 = 'apri' | 'crea' | 'rinomina' | 'duplica' | 'sposta' | 'elimina' | 'cerca' | 'albero'
const AZIONE_NON_RIUSCITA: Partial<Record<AzioneFileR4, string>> = {
    crea: 'app.common.createFailed', rinomina: 'app.common.renameFailed', duplica: 'app.common.copyFailed',
    sposta: 'app.files.moveFailed', elimina: 'app.common.deleteFailed',
}
/**
 * Il perché di un rifiuto: la frase del desktop per i codici che r4 manda davvero (`errori.<CODICE>.message`); per il resto (`QUERY_INVALID`,
 * la rete) l'azione non riuscita, mai «Invalid query».
 */
export function motivoErroreFileR4(risposta: unknown, azione: AzioneFileR4, lingua: string): string {
    // pin 701c6c0d2 (#44, `messaggioErroreUtente` del desktop): prima la frase del MOTIVO, quando il server l'ha pubblicata per la persona
    const delMotivo = fraseDelMotivoR4((risposta as { error?: unknown } | null)?.error, lingua)
    if (delMotivo) return delMotivo
    const codice = (risposta as { error?: { code?: unknown } } | null)?.error?.code
    if (typeof codice === 'string' && propria(AREE.errori.en, `${codice}.message`) !== undefined) return testoFileR4(`errori.${codice}.message`, lingua)
    const chiave = AZIONE_NON_RIUSCITA[azione]
    return chiave ? testoFileR4(chiave, lingua) : testoFileR4('app.common.operationFailed', lingua)
}

/**
 * «Sposta in…»: le cartelle che hanno senso come destinazione. Mai la cartella stessa né i suoi discendenti (r4 lo rifiuta con un
 * «Invalid query»), mai la cartella dove la voce sta già.
 */
export function cartellePerSpostareR4(percorso: string, cartella: boolean, cartelle: readonly string[]): string[] {
    const dove = genitoreR4(percorso)
    return cartelle.filter((c) => c !== dove && !(cartella && (c === percorso || c.startsWith(`${percorso}/`))))
}

export interface RisultatoRicercaR4 { percorso: string; nome: string; cartella: boolean }

const FRASI_RICERCA = ['workspaceSearch.folderTooBig', 'workspaceSearch.tookTooLong', 'workspaceSearch.moreResults']
/** Il motivo di un elenco incompleto: la chiave se c'è; se la rotta l'ha tolta, la frase inglese del server riconosciuta e tradotta. */
function motivoDellaRicerca(dati: Record<string, unknown>, lingua: string): string {
    if (typeof dati.motivoChiave === 'string') return testoDelServerR4(dati.motivoChiave, null, testoFileR4('app.files.search.stoppedEarly', lingua), lingua)
    const chiave = FRASI_RICERCA.find((k) => TESTI_SERVER_R4.en[k] === dati.motivo)
    return chiave ? testoDelServerR4(`server.${chiave}`, null, String(dati.motivo), lingua) : testoFileR4('app.files.search.stoppedEarly', lingua)
}
const elenco = (voci: string[], lingua: string) => {
    try { return new Intl.ListFormat(italiano(lingua) ? 'it' : 'en', { style: 'long', type: 'conjunction' }).format(voci) } catch { return voci.join(', ') }
}

/** I risultati di `GET /:id/tree/search` e gli avvisi del desktop (:18436-18438). */
export function riassuntoRicercaR4(risposta: unknown, ricerca: string, lingua: string): { risultati: RisultatoRicercaR4[]; avvisi: string[] } {
    const dati = ((risposta as { data?: unknown } | null)?.data ?? {}) as Record<string, unknown>
    const risultati = (Array.isArray(dati.risultati) ? dati.risultati : []).flatMap((r) => {
        const v = r as RisultatoRicercaR4
        return v && typeof v.percorso === 'string' && v.percorso && nomeSemplice(v.nome) && typeof v.cartella === 'boolean'
            && !v.percorso.split('/').some((p) => p === '..' || p === '') ? [{ percorso: v.percorso, nome: v.nome, cartella: v.cartella }] : []
    })
    const avvisi: string[] = []
    if (risultati.length === 0) avvisi.push(testoFileR4('app.files.search.noMatch', lingua, { ricerca }))
    if (dati.troncato === true) avvisi.push(testoFileR4('app.files.search.incomplete', lingua, { motivo: motivoDellaRicerca(dati, lingua) }))
    const saltate = Array.isArray(dati.saltate) ? dati.saltate.filter((s): s is string => typeof s === 'string' && s !== '') : []
    if (saltate.length) avvisi.push(testoFileR4('app.files.search.skipped', lingua, { elenco: elenco(saltate, lingua) }))
    return { risultati, avvisi }
}

/** Dopo una rinomina o uno spostamento di una cartella: chi era aperto (lei e le sue sottocartelle) resta aperto nel posto nuovo. */
export function riportaAperteR4(aperte: ReadonlySet<string>, vecchio: string, nuovo: string | null): Set<string> {
    if (!nuovo || !vecchio) return new Set(aperte)
    return new Set([...aperte].map((p) => (p === vecchio ? nuovo : p.startsWith(`${vecchio}/`) ? `${nuovo}${p.slice(vecchio.length)}` : p)))
}
