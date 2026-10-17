/**
 * ⛔ K3-A — gli eventi di sessione di r4 diventano i messaggi della chat (ledger `LEDGER-K3-CODICE-COME-LA-CHAT-2026-10-15.md`).
 *
 * Owner 15/10/2026: «Voglio che il codice sia allineato a come funziona l'interfaccia chat … una volta per tutte»; decisioni «Stessi
 * componenti della chat» e «Dentro K3, su r4». Il Codice mostra la sua conversazione con `TalosMobileMessageList` e le righe N13
 * (`sequenzaDelTurno.ts`): qui il flusso di r4 diventa quei messaggi.
 *
 * Il flusso (Nino1, 15/10, `harness-ui/src/agui-events.mjs` @ 8bfe38fa8) è nello stile di AG-UI ma non compatibile sul filo
 * con l'SDK ufficiale: nomi PascalCase, niente `ToolCallEnd` (chiude `ToolCallResult`), estensioni proprie. Quindi un adattatore
 * nostro, TOLLERANTE: un tipo sconosciuto o un campo storto lascia lo stato com'è, mai un'eccezione. Il client del desktop lancia, e
 * il 10/09 un `ToolCallOutput` sconosciuto gli ha fatto morire un giro.
 *
 * La storia arriva rigiocando lo stesso flusso, coi delta fusi; il dal vivo a grana di token. Le due vie devono dare gli STESSI
 * messaggi (prova R4EV-03): niente qui dipende da come sono spezzati i delta.
 */
import type { TalosMobileMessageAttachmentView, TalosMobileMessageView } from '@/components/chat/mobileChatTypes'
import {
    TALOS_METADATA_SEQUENZA,
    talosSequenzaDaSalvare,
    type TalosAttrezzoDelGiro,
    type TalosConfineDelGiro,
} from '@/lib/chat/sequenzaDelTurno'
import { TALOS_METADATA_RISULTATO_DELEGA, vociRisultatoDelegaR4 } from './risultatiDelegaR4'
import { TALOS_METADATA_APPROVAZIONE, type VoceApprovazioneR4 } from './approvazioneChiave'
import { TALOS_METADATA_DOMANDA, type EsitoDomandaR4, type VoceDomandaR4 } from './domandaChiave'
import { TALOS_METADATA_FERMATO, type VoceFermatoR4 } from './fermatoChiave'
import { FRASI_SOLO_IMMAGINE_R4, bollaPerLaRigiocataR4 } from './allegatiR4'
import { TALOS_METADATA_PIANO, type PropostaPianoR4, type VocePianoR4 } from './pianoChiave'
import { leggiEventoPianoR4 } from './pianoEventoR4'

/**
 * ⛔ K3-C3a2: come dire alla persona un testo che r4 manda con la sua chiave (`testoDelServerR4` con la lingua dell'app). Senza,
 * resta la frase inglese del server: l'adattatore resta puro e non sa niente della lingua.
 */
export interface OpzioniEventiR4 {
    testoDelServer?: (chiave: string | null | undefined, params: unknown, riserva: string) => string
    /** K3 piano: la sessione di questa conversazione; un `talos.plan` di un'altra sessione non è suo (`parsePlanEvent`). */
    sessioneId?: string | null
}

/** K3 piano: il modo e il permesso che r4 annuncia (`talos.impostazioni-sessione`); `dalVivo` falso se viene dalla storia rigiocata. */
export interface ImpostazioniSessioneR4 {
    modalitaOperativa: 'normale' | 'piano' | null
    permessi: string | null
    motivo: string | null
    dalVivo: boolean
}

export interface EventoSseR4 {
    id: number | null
    dati: Record<string, unknown>
}

export interface GiroInCorsoR4 {
    testo: string
    ragionamento: string
    confini: TalosConfineDelGiro[]
    attivi: TalosAttrezzoDelGiro[]
}

/** Lo stato interno del giro aperto: non è interfaccia, la vista è `inCorso`. */
interface GiroInterno {
    runId: string
    at: string
    testo: string
    ragionamento: string
    messaggioId: string | null
    confini: { testo: number; ragionamento: number; chiamate: string[] }[]
    chiamate: Record<string, { name: string; argomenti: string; finita: boolean }>
    /** K3-RISDEL: un risultato è arrivato dentro il giro e la parte già scritta è un messaggio a sé. */
    diviso?: boolean
}

export interface ConversazioneR4 {
    messaggi: TalosMobileMessageView[]
    inCorso: GiroInCorsoR4 | null
    ultimaSequenza: number | null
    storiaFinita: boolean
    /** @internal il giro aperto */
    readonly giro: GiroInterno | null
    /** @internal K3-C Accoda: il `redirectId` di un «Indirizza ora» in volo (da `RunRedirectRequested` al suo esito) */
    readonly reindirizzo?: string
    /** K3 piano: l'ultimo `talos.impostazioni-sessione`. */
    impostazioni?: ImpostazioniSessioneR4
    /** K3 piano: il modello ha chiesto il Piano (`request_plan_mode`) e il giro che lo usa non è ancora partito: la fascia. */
    pianoRichiesto?: boolean
    /** K3 piano: l'ultima revisione arrivata DAL VIVO su una carta che c'era già (l'avviso «Piano aggiornato»); `sequenza` la distingue. */
    revisioneDalVivo?: { planId: string; revision: number; sequenza: number | null }
}

/** I campi degli argomenti che dicono «su che cosa» lavora un attrezzo: il dettaglio della riga. */
const CAMPI_DETTAGLIO = ['percorso', 'path', 'file', 'comando', 'command', 'query', 'url', 'pattern'] as const

const testo = (v: unknown): string | null => (typeof v === 'string' ? v : null)

/**
 * `timestamp` di AG-UI (BaseEvent, facoltativo): millisecondi dall'epoca. In r4 su RunStarted, RunFinished e RunError, dal vivo
 * e nella storia rigiocata (Nino1, 15/10, `b4e6b1f76`). Un valore storto non è un'ora.
 */
function oraDa(v: unknown): string {
    if (typeof v !== 'number' || !Number.isFinite(v) || v <= 0) return ''
    const data = new Date(v)
    return Number.isNaN(data.getTime()) ? '' : data.toISOString()
}

/** Il flusso SSE: blocchi separati da una riga vuota; `data:` uniti, `id:` numerico, commenti saltati, JSON storto saltato. */
export function leggiFlussoSse(sorgente: string): EventoSseR4[] {
    const eventi: EventoSseR4[] = []
    for (const blocco of sorgente.split(/\r?\n\r?\n/u)) {
        let id: number | null = null
        const dati: string[] = []
        for (const riga of blocco.split(/\r?\n/u)) {
            if (riga.startsWith('data:')) dati.push(riga.slice(5).replace(/^ /u, ''))
            else if (riga.startsWith('id:')) {
                const n = Number(riga.slice(3).trim())
                id = Number.isFinite(n) ? n : null
            }
        }
        if (dati.length === 0) continue
        try {
            const valore: unknown = JSON.parse(dati.join('\n'))
            if (valore && typeof valore === 'object' && !Array.isArray(valore)) eventi.push({ id, dati: valore as Record<string, unknown> })
        } catch {
            // un blocco storto non è un evento
        }
    }
    return eventi
}

export function creaConversazioneR4(): ConversazioneR4 {
    return { messaggi: [], inCorso: null, ultimaSequenza: null, storiaFinita: false, giro: null }
}

function dettaglio(argomenti: string): string | null {
    try {
        const valore: unknown = JSON.parse(argomenti)
        if (!valore || typeof valore !== 'object') return null
        for (const campo of CAMPI_DETTAGLIO) {
            const v = (valore as Record<string, unknown>)[campo]
            if (typeof v === 'string' && v.trim()) return v
        }
    } catch {
        // argomenti ancora a metà, o storti
    }
    return null
}

function attrezzo(giro: GiroInterno, id: string): TalosAttrezzoDelGiro {
    const chiamata = giro.chiamate[id]
    return { name: chiamata.name, detail: dettaglio(chiamata.argomenti) }
}

function confiniDi(giro: GiroInterno): TalosConfineDelGiro[] {
    return giro.confini.map((c) => ({ testo: c.testo, ragionamento: c.ragionamento, attrezzi: c.chiamate.map((id) => attrezzo(giro, id)) }))
}

function vistaInCorso(giro: GiroInterno | null): GiroInCorsoR4 | null {
    if (!giro) return null
    const ultimo = giro.confini.at(-1)
    const attivi = ultimo ? ultimo.chiamate.filter((id) => !giro.chiamate[id].finita).map((id) => attrezzo(giro, id)) : []
    return { testo: giro.testo, ragionamento: giro.ragionamento, confini: confiniDi(giro), attivi }
}

function conGiro(c: ConversazioneR4, giro: GiroInterno | null, extra: Partial<ConversazioneR4> = {}): ConversazioneR4 {
    return { ...c, ...extra, giro, inCorso: vistaInCorso(giro) }
}

type EsitoDelGiro = { stato: 'persisted' | 'failed'; detto?: string | null; errore?: { code: string | null; message: string } }

function messaggioDelGiro(giro: GiroInterno, esito: EsitoDelGiro, id: string): TalosMobileMessageView {
    const contenuto = giro.testo || esito.detto || ''
    const metadata: Record<string, unknown> = { origine: 'r4' }
    const sequenza = talosSequenzaDaSalvare(confiniDi(giro), giro.testo, giro.ragionamento, contenuto, (t) => t)
    if (sequenza) metadata[TALOS_METADATA_SEQUENZA] = sequenza
    if (esito.errore) metadata.errore = esito.errore
    return {
        id,
        role: 'assistant',
        content: contenuto,
        created_at: giro.at,
        state: esito.stato,
        model_profile_id: null,
        run_id: giro.runId,
        metadata,
        reasoning: giro.ragionamento || null,
    }
}

const haDetto = (giro: GiroInterno) => Boolean(giro.testo || giro.ragionamento || giro.confini.length)

/**
 * K3-AP1/AP2: una carta di r4 (approvazione, domanda) nella conversazione. Ciò che il giro ha già detto (con la riga dell'attrezzo)
 * diventa un messaggio, sotto viene la carta, il giro continua vuoto: come un risultato consegnato (K3-RISDEL).
 */
function conCartaNelGiro(c: ConversazioneR4, giro: GiroInterno | null, id: string, metadati: Record<string, unknown>): ConversazioneR4 {
    const carta: TalosMobileMessageView = {
        id, role: 'system', content: '', created_at: giro?.at ?? '', state: 'persisted', model_profile_id: null, run_id: giro?.runId ?? null,
        metadata: { origine: 'r4', ...metadati }, reasoning: null,
    }
    if (!giro || !haDetto(giro)) return { ...c, messaggi: [...c.messaggi, carta] }
    const parte = messaggioDelGiro(giro, { stato: 'persisted' }, giro.messaggioId ?? `${giro.runId}:parte-${c.messaggi.length}`)
    return conGiro(c, { ...giro, testo: '', ragionamento: '', messaggioId: null, confini: [], chiamate: {}, diviso: true },
        { messaggi: [...c.messaggi, parte, carta] })
}

/** L'esito che chiude una carta (`ApprovalResolved`, `UserQuestionResolved`); una richiesta ignota non cambia niente. */
function conEsitoDellaCarta(c: ConversazioneR4, id: string, chiave: string, esito: unknown): ConversazioneR4 {
    const indice = c.messaggi.findIndex((m) => m.id === id)
    if (indice < 0) return c
    const voce = c.messaggi[indice].metadata[chiave] as Record<string, unknown>
    const messaggi = c.messaggi.slice()
    messaggi[indice] = { ...messaggi[indice], metadata: { ...messaggi[indice].metadata, [chiave]: { ...voce, esito } } }
    return { ...c, messaggi }
}

/**
 * ⛔ K3 piano (`legacy/app.js:21110-21140` @ 701c6c0d2; decisione D4 del desktop): UNA carta per `planId`, nata sotto la riga di
 * `present_plan` come le altre carte, e aggiornata SUL POSTO da una revisione più alta (esito azzerato: la nuova revisione aspetta
 * la sua scelta). Una revisione uguale o più bassa non cambia niente (la rigiocata rimanda gli stessi eventi). La decisione scrive
 * l'esito solo sulla carta della stessa revisione e richiesta (`applicaDecisionePiano`). Dal vivo una revisione nuova accende
 * l'avviso «Piano aggiornato» (`mostraAvvisoPiano`); in rigiocata no, la storia si legge.
 */
function conIlPiano(c: ConversazioneR4, giro: GiroInterno | null, valore: unknown, sessioneId: string | null, sequenza: number | null): ConversazioneR4 {
    const fatto = leggiEventoPianoR4(valore, sessioneId)
    if (!fatto) return c
    const id = `piano:${fatto.planId}`
    const indice = c.messaggi.findIndex((m) => m.id === id)
    const voce = indice >= 0 ? c.messaggi[indice].metadata[TALOS_METADATA_PIANO] as VocePianoR4 : null
    if (fatto.status === 'proposed' || fatto.status === 'unavailable') {
        const proposta = fatto as PropostaPianoR4
        if (!voce) return conCartaNelGiro(c, giro, id, { [TALOS_METADATA_PIANO]: { proposta, esito: null } satisfies VocePianoR4 })
        if (voce.proposta.revision >= proposta.revision) return c
        const messaggi = c.messaggi.slice()
        messaggi[indice] = { ...messaggi[indice], metadata: { ...messaggi[indice].metadata, [TALOS_METADATA_PIANO]: { proposta, esito: null } satisfies VocePianoR4 } }
        return { ...c, messaggi, ...(c.storiaFinita ? { revisioneDalVivo: { planId: proposta.planId, revision: proposta.revision, sequenza } } : {}) }
    }
    if (!voce || voce.proposta.revision !== fatto.revision || (voce.proposta.requestId && voce.proposta.requestId !== fatto.requestId)) return c
    return conEsitoDellaCarta(c, id, TALOS_METADATA_PIANO, fatto)
}

function chiudi(c: ConversazioneR4, giro: GiroInterno, esito: EsitoDelGiro): ConversazioneR4 {
    // ⛔ K3-RISDEL: dopo una divisione `detto` è l'ultimo testo già mostrato; un giro rimasto vuoto non ha niente da aggiungere
    if (giro.diviso && !haDetto(giro)) return conGiro(c, null)
    const messaggio = messaggioDelGiro(giro, giro.diviso ? { ...esito, detto: null } : esito, giro.messaggioId ?? `${giro.runId}:assistente`)
    return conGiro(c, null, { messaggi: [...c.messaggi, messaggio] })
}

/**
 * ⛔ K3-RISDEL: le righe dei risultati dei sotto-agenti, come `mostraRisultatoDelega` del desktop r4 (`legacy/app.js:11055` @ fc5):
 * una riga `system` per voce, una volta sola (`codaId`). Il riquadro lo disegna la lista, nella lingua di chi guarda.
 */
function conIRisultati(c: ConversazioneR4, fonte: unknown, daGiro: boolean, at: string): ConversazioneR4 {
    const voci = vociRisultatoDelegaR4(fonte, daGiro)
    if (voci.length === 0) return c
    const visti = new Set(c.messaggi.map((m) => m.id))
    const righe: TalosMobileMessageView[] = []
    for (const voce of voci) {
        const id = voce.codaId ? `delega:${voce.codaId}` : `delega:${c.giro?.runId ?? 'fuori'}:${c.messaggi.length + righe.length}`
        if (visti.has(id)) continue
        visti.add(id)
        righe.push({
            id, role: 'system', content: '', created_at: at, state: 'persisted', model_profile_id: null, run_id: c.giro?.runId ?? null,
            metadata: { origine: 'r4', [TALOS_METADATA_RISULTATO_DELEGA]: voce }, reasoning: null,
        })
    }
    return righe.length ? { ...c, messaggi: [...c.messaggi, ...righe] } : c
}

/** Il livello della scheda d'errore della chat (`talosMobileControlledFault`): la rete, il fornitore, o il resto. */
function livelloDelGuasto(classe: string | null, codice: string): 'network' | 'provider' | 'system' {
    if (classe === 'rete') return 'network'
    return codice.startsWith('PROVIDER_') ? 'provider' : 'system'
}

/**
 * Un fermo chiesto, non un guasto: le parole di `eFermoSuRichiesta` del desktop r4 (`frontend/src/components/errori.js` @ 2161afb32).
 * ⛔ Il codice `fermato` da solo non basta: r4 lo dà anche alla risposta muta del modello («generation stopped without an answer…»).
 */
const FERMO_SU_RICHIESTA = /stopped on request|interrotto su richiesta|operation was aborted|AbortError|aborted by user|fermato dall'utente/i
function fermoSuRichiesta(messaggio: string, codice: string | null): boolean {
    const intero = messaggio.trim()
    const parole = codice && intero.startsWith(codice) ? intero.slice(codice.length).trim() : intero
    return FERMO_SU_RICHIESTA.test(parole) || (codice === 'fermato' && parole === '')
}

/**
 * ⛔ K3-C Accoda (Pad 16/10): «Indirizza ora» chiude il giro vecchio con lo stesso `RunError` `fermato` dello Stop. Come il desktop
 * r4 (famiglia `reindirizzato`, `silenziosa`): nessuna riga, nessun «non riuscito»; ciò che il giro aveva detto resta, e il giro
 * nuovo parte da sé. Solo con un reindirizzamento in volo E un fermo vero: un guasto vero in quel momento resta rosso.
 */
function chiudiPerIlReindirizzo(c: ConversazioneR4, giro: GiroInterno): ConversazioneR4 {
    return giro.testo || giro.ragionamento || giro.confini.length ? chiudi(c, giro, { stato: 'persisted' }) : conGiro(c, null)
}

/**
 * ⛔ K3 Stop come il desktop (owner 16/10, ledger `LEDGER-K3-STOP-2026-10-16.md`): lo Stop chiesto dalla persona non è un guasto.
 * Il giro si chiude come al reindirizzamento (nessun «non riuscito»), e sotto viene una riga con la nota d'accento del desktop
 * (`fermato-da-te`, «Hai fermato il giro.»), che la lista disegna nella lingua di chi guarda.
 */
function fermatoDaTe(c: ConversazioneR4, giro: GiroInterno, tecnico: string): ConversazioneR4 {
    const chiusa = chiudiPerIlReindirizzo(c, giro)
    const voce: VoceFermatoR4 = { tecnico }
    const riga: TalosMobileMessageView = {
        id: `${giro.runId}:fermato`, role: 'system', content: '', created_at: giro.at, state: 'persisted', model_profile_id: null,
        run_id: giro.runId, metadata: { origine: 'r4', [TALOS_METADATA_FERMATO]: voce }, reasoning: null,
    }
    return { ...chiusa, messaggi: [...chiusa.messaggi, riga] }
}

/**
 * ⛔ K3-C3a2 (owner 15/10: «Riga di stato come la chat»). Sul Pad una copia finita in errore mostrava «non riuscito» e una bolla
 * VUOTA, col motivo nascosto in `metadata.errore`. Come la chat (`stores/chat.ts:2295`): la bolla resta solo se il giro ha detto
 * qualcosa, e il motivo è una riga `system` `failed` con `chat_error`, che `TalosMobileStatusMessage` mostra.
 */
function fallisci(c: ConversazioneR4, giro: GiroInterno, evento: Record<string, unknown>, opzioni: OpzioniEventiR4): ConversazioneR4 {
    const codice = testo(evento.code) || 'RUN_ERROR'
    const riserva = testo(evento.message) ?? ''
    const detto = (opzioni.testoDelServer?.(testo(evento.messageChiave), evento.messageParams, riserva) ?? riserva).trim()
    // senza una frase resta il codice: la scheda della chat lo riconosce e dice la frase del suo livello
    const message = detto || codice
    const conBolla = giro.testo || giro.ragionamento || giro.confini.length
        ? chiudi(c, giro, { stato: 'failed', errore: { code: testo(evento.code), message: riserva } })
        : conGiro(c, null)
    const riga: TalosMobileMessageView = {
        id: `${giro.runId}:errore`,
        role: 'system',
        content: message,
        created_at: giro.at,
        state: 'failed',
        model_profile_id: null,
        run_id: giro.runId,
        metadata: { origine: 'r4', chat_error: { layer: livelloDelGuasto(testo(evento.classe), codice), code: codice, message } },
        reasoning: null,
    }
    return { ...conBolla, messaggi: [...conBolla.messaggi, riga] }
}

const ID_IMMAGINE_R4 = /^[a-f0-9]{64}$/u
/**
 * ⛔ K3-C Allegati A2 (owner 16/10): la bolla della persona come la disegna il desktop r4 (C09, `bollaPerLaRigiocata`): ciò che la persona
 * ha scritto (`input.bolla`, o il testo per il modello senza il blocco degli allegati), mai le righe per il modello; con sole immagini la
 * frase «Describe the attached image.» non si mostra. Le immagini (`input.immagini`) sono allegati della bolla, `r4:<id>`: l'anteprima la
 * legge il Codice da r4.
 */
function bollaDellaPersona(runId: string, consegna: string, input: Record<string, unknown> | undefined, at: string): TalosMobileMessageView {
    const immagini = (Array.isArray(input?.immagini) ? input.immagini : []).flatMap((v): TalosMobileMessageAttachmentView[] => {
        const i = v as { id?: unknown; nome?: unknown; mimeType?: unknown; byte?: unknown } | null
        if (!i || typeof i.id !== 'string' || !ID_IMMAGINE_R4.test(i.id)) return []
        return [{
            id: i.id, vault_file_id: `r4:${i.id}`, grant_id: '', display_name: typeof i.nome === 'string' ? i.nome : i.id,
            media_type: typeof i.mimeType === 'string' ? i.mimeType : 'image/png', size_bytes: typeof i.byte === 'number' ? i.byte : 0,
            permissions: ['model.read'], grant_status: 'active',
        }]
    })
    const rigiocata = bollaPerLaRigiocataR4({ bolla: input?.bolla, consegna })
    const content = rigiocata ? rigiocata.testo : (immagini.length && FRASI_SOLO_IMMAGINE_R4.includes(consegna) ? '' : consegna)
    // K3-C Allegati A3: i file della bolla (conservata o ricostruita) come chip, dopo le immagini
    const file = (rigiocata?.allegati ?? []).flatMap((v, i): TalosMobileMessageAttachmentView[] => {
        const a = v as { tipo?: unknown; nome?: unknown; percorso?: unknown; caratteri?: unknown } | null
        if (!a || a.tipo === 'immagine') return []
        const percorso = typeof a.percorso === 'string' && a.percorso ? a.percorso : undefined
        const nome = typeof a.nome === 'string' && a.nome ? a.nome : percorso?.split(/[\\/]/u).pop()
        if (!nome) return []
        return [{
            id: `r4file:${i}:${percorso ?? nome}`, vault_file_id: '', grant_id: '', display_name: nome, media_type: 'application/octet-stream',
            size_bytes: 0, permissions: ['model.read'], grant_status: 'active',
            ...(percorso ? { percorso } : {}), ...(Number.isSafeInteger(a.caratteri) && (a.caratteri as number) >= 0 ? { caratteri: a.caratteri as number } : {}),
        }]
    })
    const allegati = [...immagini, ...file]
    return {
        id: `${runId}:utente`, role: 'user', content, created_at: at, state: 'persisted', model_profile_id: null, run_id: runId,
        metadata: { origine: 'r4' }, reasoning: null, ...(allegati.length ? { attachments: allegati } : {}),
    }
}

/** Un evento in più. Puro: torna uno stato nuovo; un evento sconosciuto o storto torna lo stato com'era (a parte la sequenza). */
export function applicaEventoR4(c: ConversazioneR4, evento: Record<string, unknown>, opzioni: OpzioniEventiR4 = {}): ConversazioneR4 {
    if (!evento || typeof evento !== 'object') return c
    const sequenza = typeof evento._sequenza === 'number' ? evento._sequenza : null
    if (sequenza !== null && (c.ultimaSequenza === null || sequenza > c.ultimaSequenza)) c = { ...c, ultimaSequenza: sequenza }
    const giro = c.giro
    switch (evento.type) {
        case 'RunStarted': {
            const runId = testo(evento.runId) ?? `giro-${c.messaggi.length}`
            const input = evento.input as Record<string, unknown> | undefined
            const consegna = testo(input?.consegna)
            // l'ora del giro: il suo `timestamp`; se manca (sessioni salvate prima), la prima richiesta al modello (sotto)
            const at = oraDa(evento.timestamp)
            /* ⛔ K3-C3a2: la bolla della persona solo per ciò che ha scritto, come il desktop r4 (`app.js:21290` @ 99ffa3d38): il
               primo giro, poi i seguiti (`input.seguito`). Una ripresa rimanda la stessa consegna senza `seguito`; un giro con
               `input.origine` (delega, workflow, sfondo, obiettivo) non l'ha scritto la persona. */
            const giaUnaBolla = c.messaggi.some((m) => m.role === 'user')
            const dellaPersona = consegna !== null && input?.origine === undefined && (!giaUnaBolla || input?.seguito === true)
            const messaggi = !dellaPersona ? c.messaggi : [...c.messaggi, bollaDellaPersona(runId, consegna as string, input, at)]
            // K3 piano: il giro che usa il Piano chiesto dal modello è partito, la fascia «Piano attivo dal prossimo giro» si spegne
            const aperto = conGiro(c, { runId, at, testo: '', ragionamento: '', messaggioId: null, confini: [], chiamate: {} }, { messaggi, pianoRichiesto: false })
            return conIRisultati(aperto, input, true, at)
        }
        case 'QueuedMessageDelivered': {
            // K3-RISDEL: un risultato consegnato DENTRO il giro. Ciò che il giro ha già detto diventa un messaggio, il giro continua vuoto.
            if (vociRisultatoDelegaR4(evento, false).length === 0) return c
            if (!giro || !haDetto(giro)) return conIRisultati(c, evento, false, giro?.at ?? '')
            const parte = messaggioDelGiro(giro, { stato: 'persisted' }, giro.messaggioId ?? `${giro.runId}:parte-${c.messaggi.length}`)
            const riaperto = conGiro(c, { ...giro, testo: '', ragionamento: '', messaggioId: null, confini: [], chiamate: {}, diviso: true },
                { messaggi: [...c.messaggi, parte] })
            return conIRisultati(riaperto, evento, false, giro.at)
        }
        case 'ApprovalRequested': {
            /* ⛔ K3-AP1 (owner 16/10 «Carta nella conversazione»): r4 è fermo ad aspettare. Come un risultato consegnato (K3-RISDEL):
               ciò che il giro ha già detto (con la riga dell'attrezzo) diventa un messaggio, sotto viene la carta, il giro continua
               vuoto. Una carta per richiesta: la rigiocata rimanda lo stesso evento. */
            const requestId = testo(evento.requestId)
            const azione = evento.azione && typeof evento.azione === 'object' && !Array.isArray(evento.azione) ? evento.azione as Record<string, unknown> : null
            const id = `approvazione:${requestId}`
            if (!requestId || !azione || c.messaggi.some((m) => m.id === id)) return c
            return conCartaNelGiro(c, giro, id, { [TALOS_METADATA_APPROVAZIONE]: { requestId, azione, esito: null } satisfies VoceApprovazioneR4 })
        }
        case 'ApprovalResolved': {
            const esito = { approvato: evento.approvato === true, ambito: testo(evento.ambito), motivo: testo(evento.motivo) }
            return conEsitoDellaCarta(c, `approvazione:${testo(evento.requestId)}`, TALOS_METADATA_APPROVAZIONE, esito)
        }
        case 'UserQuestionRequested': {
            /* ⛔ K3-AP2 (owner 16/10: «Carta nella conversazione», una alla volta): r4 aspetta la risposta della persona
               (`ask_user_question`). Come l'approvazione: la parte già detta, sotto la carta, il giro continua vuoto; una per richiesta.
               La forma la valida r4 (`validaDomandeUtente`); qui si scarta solo ciò che non si può disegnare. */
            const requestId = testo(evento.requestId)
            const domande = Array.isArray(evento.questions) ? evento.questions : []
            const id = `domanda:${requestId}`
            const disegnabili = domande.length > 0 && domande.every((d) => d && typeof d === 'object' && typeof (d as Record<string, unknown>).question === 'string')
            if (!requestId || !disegnabili || c.messaggi.some((m) => m.id === id)) return c
            const origine = evento.origine && typeof evento.origine === 'object' && !Array.isArray(evento.origine) ? evento.origine as VoceDomandaR4['origine'] : null
            return conCartaNelGiro(c, giro, id, {
                [TALOS_METADATA_DOMANDA]: { requestId, questions: domande as VoceDomandaR4['questions'], at: testo(evento.at), origine, esito: null } satisfies VoceDomandaR4,
            })
        }
        case 'UserQuestionResolved': {
            const status = testo(evento.status)
            if (!status) return c
            const esito: EsitoDomandaR4 = { status }
            if (evento.answers && typeof evento.answers === 'object' && !Array.isArray(evento.answers)) esito.answers = evento.answers as EsitoDomandaR4['answers']
            if (Array.isArray(evento.skipped)) esito.skipped = evento.skipped.filter((s): s is string => typeof s === 'string')
            for (const campo of ['at', 'da', 'motivo', 'rispostoDa'] as const) { const v = testo(evento[campo]); if (v) esito[campo] = v }
            return conEsitoDellaCarta(c, `domanda:${testo(evento.requestId)}`, TALOS_METADATA_DOMANDA, esito)
        }
        case 'CUSTOM': {
            if (evento.name === 'talos.fine-rigiocata') return { ...c, storiaFinita: true }
            if (evento.name === 'talos.plan') return conIlPiano(c, giro, evento.value, opzioni.sessioneId ?? null, sequenza)
            if (evento.name === 'talos.impostazioni-sessione') {
                /* K3 piano (`legacy/app.js:21141`, `registraCambioPianoRichiesto`): il modo e il permesso dopo il sì al piano
                   (`piano-approvato`) o quando il modello chiede il Piano (`piano-richiesto-dal-modello`, a fine giro). */
                const v = (evento.value && typeof evento.value === 'object' ? evento.value : {}) as Record<string, unknown>
                const modalitaOperativa = v.modalitaOperativa === 'normale' || v.modalitaOperativa === 'piano' ? v.modalitaOperativa : null
                if (!modalitaOperativa && typeof v.permessi !== 'string') return c
                const motivo = testo(v.motivo)
                return {
                    ...c,
                    impostazioni: { modalitaOperativa, permessi: testo(v.permessi), motivo, dalVivo: c.storiaFinita },
                    pianoRichiesto: modalitaOperativa === 'piano' && motivo === 'piano-richiesto-dal-modello',
                }
            }
            const at = testo((evento.value as Record<string, unknown> | undefined)?.at)
            if (evento.name === 'talos.contesto-richiesta' && giro && !giro.at && at) {
                // l'ora del giro: la prima richiesta al modello. Anche il messaggio dell'utente la prende.
                const messaggi = c.messaggi.map((m) => (m.id === `${giro.runId}:utente` && !m.created_at ? { ...m, created_at: at } : m))
                return conGiro(c, { ...giro, at }, { messaggi })
            }
            return c
        }
        case 'TextMessageStart': {
            const id = testo(evento.messageId)
            return giro && id && !giro.messaggioId ? conGiro(c, { ...giro, messaggioId: id }) : c
        }
        case 'TextMessageContent': {
            const delta = testo(evento.delta)
            return giro && delta ? conGiro(c, { ...giro, testo: giro.testo + delta }) : c
        }
        case 'ReasoningMessageContent': {
            const delta = testo(evento.delta)
            return giro && delta ? conGiro(c, { ...giro, ragionamento: giro.ragionamento + delta }) : c
        }
        case 'ToolCallStart': {
            const id = testo(evento.toolCallId)
            const name = testo(evento.toolCallName)
            if (!giro || !id || !name || giro.chiamate[id]) return c
            const ultimo = giro.confini.at(-1)
            const stessoPunto = ultimo && ultimo.testo === giro.testo.length && ultimo.ragionamento === giro.ragionamento.length
            const confini = stessoPunto
                ? [...giro.confini.slice(0, -1), { ...ultimo, chiamate: [...ultimo.chiamate, id] }]
                : [...giro.confini, { testo: giro.testo.length, ragionamento: giro.ragionamento.length, chiamate: [id] }]
            return conGiro(c, { ...giro, confini, chiamate: { ...giro.chiamate, [id]: { name, argomenti: '', finita: false } } })
        }
        case 'ToolCallArgs': {
            const id = testo(evento.toolCallId)
            const delta = testo(evento.delta)
            if (!giro || !id || delta === null || !giro.chiamate[id]) return c
            const chiamata = giro.chiamate[id]
            return conGiro(c, { ...giro, chiamate: { ...giro.chiamate, [id]: { ...chiamata, argomenti: chiamata.argomenti + delta } } })
        }
        case 'ToolCallResult': {
            const id = testo(evento.toolCallId)
            if (!giro || !id || !giro.chiamate[id]) return c
            return conGiro(c, { ...giro, chiamate: { ...giro.chiamate, [id]: { ...giro.chiamate[id], finita: true } } })
        }
        case 'RunFinished': {
            if (!giro) return c
            const risultato = evento.result as Record<string, unknown> | undefined
            // senza l'ora d'inizio, quella della fine è meglio di niente per la risposta
            return chiudi(c, giro.at ? giro : { ...giro, at: oraDa(evento.timestamp) }, { stato: 'persisted', detto: testo(risultato?.detto) })
        }
        case 'RunError': {
            if (!giro) return c
            const aperto = giro.at ? giro : { ...giro, at: oraDa(evento.timestamp) }
            const fermo = fermoSuRichiesta(testo(evento.message) ?? '', testo(evento.code))
            if (c.reindirizzo && fermo) return chiudiPerIlReindirizzo(c, aperto)
            if (fermo) return fermatoDaTe(c, aperto, (testo(evento.message) ?? '').trim())
            return fallisci(c, aperto, evento, opzioni)
        }
        // K3-C Accoda: «Indirizza ora» in volo finché r4 non dice com'è andato (applicato, annullato, fallito)
        case 'RunRedirectRequested': {
            const id = testo(evento.redirectId)
            return id ? { ...c, reindirizzo: id } : c
        }
        case 'RunRedirectApplied':
        case 'RunRedirectCancelled':
        case 'RunRedirectFailed':
            return c.reindirizzo ? { ...c, reindirizzo: undefined } : c
        default:
            return c
    }
}

export function conversazioneDaEventi(eventi: Iterable<Record<string, unknown>>, opzioni: OpzioniEventiR4 = {}): ConversazioneR4 {
    let c = creaConversazioneR4()
    for (const evento of eventi) c = applicaEventoR4(c, evento, opzioni)
    return c
}
