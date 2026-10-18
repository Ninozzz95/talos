/**
 * ⛔ K3-B2 (ledger `LEDGER-K3-CODICE-COME-LA-CHAT-2026-10-15.md`, punto 5; owner 15/10 «Stessi componenti della chat»): la
 * conversazione del Codice su r4. Il flusso degli eventi arriva dal client nativo a pezzi tagliati dove capita; qui si tengono
 * solo i blocchi SSE interi e si passano a `applicaEventoR4`, così i messaggi sono gli stessi del file intero (prova USR4-01).
 *
 * Il flusso di una sessione r4 non si chiude da solo a fine giro (`http-app.mjs:9121` @ c51a9ac08): uno per sessione, e il
 * messaggio successivo (`resume`) arriva sullo stesso. Se cade, si riapre con `?after=<ultima sequenza applicata>`: il blocco a
 * metà si butta, e r4 rimanda tutto ciò che viene dopo.
 */
import { computed, getCurrentScope, onScopeDispose, ref, shallowRef } from 'vue'
import { applicaEventoR4, creaConversazioneR4, leggiFlussoSse, type OpzioniEventiR4 } from '@/lib/harness/r4/eventiR4'
import { testoDelServerR4 } from '@/lib/harness/r4/testiServerR4'
import { applicaEventoPannelloR4, creaPannelloR4 } from '@/lib/harness/r4/pannelloR4'
import { motivoDelRifiutoR4, type AzioneProcessoR4, type RisorsaR4 } from '@/lib/harness/r4/processiR4'
import { suUnaRigaR4 } from '@/lib/harness/r4/agentiR4'
import { motivoErroreFileR4, riassuntoRicercaR4, vociAlberoR4, type AzioneFileR4, type RisultatoRicercaR4, type VoceAlberoR4 } from '@/lib/harness/r4/alberoR4'
import { talosCurrentLocale } from '@/i18n'
import { corpoApprovazioneR4, type PoliticaSessioneR4, type SceltaApprovazioneR4 } from '@/lib/harness/r4/approvazioniR4'
import type { TalosR4ClientePonte } from '@/lib/harness/r4/clienteR4'
import { TALOS_METADATA_DOMANDA, type EsitoDomandaR4 } from '@/lib/harness/r4/domandaChiave'
import { TALOS_METADATA_APPROVAZIONE, type FigliaR4 } from '@/lib/harness/r4/approvazioneChiave'
import { statoCodaR4, type StatoCodaR4 } from '@/lib/harness/r4/codaR4'
import type { RagionamentoR4 } from '@/lib/harness/r4/modelloR4'
import type { BollaR4 } from '@/lib/harness/r4/allegatiR4'
import { chiDellAgenteR4, conCarteDelleFiglieR4, discendentiInAttesaR4, messaggioDellaFigliaR4, richiestaDellaFigliaR4, voceDellaFigliaR4, type CartaDellaFigliaR4, type RichiestaDellaFigliaR4 } from '@/lib/harness/r4/figlieR4'
import type { TalosSorgenteStreaming } from '@/lib/chat/sorgenteStreaming'
import { messaggioErroreServerR4 } from '@/lib/harness/r4/pianoR4'
import type { DecisionePianoR4 } from '@/lib/harness/r4/pianoChiave'
import { CHIAVE_COORDINAZIONE_R4, catenaDellaSessioneR4, coordinazioneAccesaNellaCatenaR4 } from '@/lib/harness/r4/coordinazioneR4'
import { annunciaCambioSessioneR4 } from '@/lib/harness/r4/avvisiSessioniR4'

export interface ErroreR4 {
    code: string
    message: string
    /** Il motivo e i valori che r4 aggiunge al codice (`reason`, `params`): la chiave che manca ha il nome del fornitore. */
    reason?: string
    params?: Record<string, unknown>
}

/** Una delega della sessione (`GET /:id/children`, forma misurata su r4 il 15/10). */
export interface FiglioR4 {
    sessionId: string
    /** pin 701c6c0d2: il nome della delega dato dal server (L3-17); `task` manca quando è uguale a `taskCorto` */
    nome?: string
    taskCorto?: string
    task?: string
    conclusa?: boolean
    esitoDelega?: string
}

/** Un hook del progetto (`GET /:id/hooks`). */
export interface HookR4 {
    id: string
    eventi: string[]
    fidato: boolean
}

export interface HookDelProgettoR4 {
    hooks: HookR4[]
    /** Il file degli hook non è valido: il motivo, come lo dice r4. */
    errore: string | null
}

export interface OpzioniConversazioneR4 {
    cliente: TalosR4ClientePonte
    /** La cartella di lavoro che r4 conosce (`statoR4Sviluppo.cartella`). */
    cartella: string
    /** Una sessione già esistente, da riaprire; senza, la crea il primo messaggio. */
    sessioneId?: string | null
    /** Millisecondi prima del tentativo `n` di riapertura (da 1). Di serie 0,5 s, 1 s, 2 s… fino a 5 s. */
    attesaRiapertura?: (tentativo: number) => number
    /**
     * K3-C Scelta del modello: prima di ogni invio (creazione e ripresa), col modello che il giro userà. La schermata porta lì la
     * chiave dell'app in r4 (owner 16/10 «alla scelta e a ogni invio»); un rifiuto ferma l'invio e si dice.
     */
    primaDiInviare?: (modello: string | null) => Promise<void>
    /**
     * ⛔ CHATGPT NEL CODICE (ledger `LEDGER-CHATGPT-NEL-CODICE-2026-10-18.md`): r4 non rinnova mai il token del piano. Quando un invio è
     * rifiutato con `CHATGPT_TOKEN_DA_RINNOVARE`, qui la schermata rinnova (forzato) e rispinge; l'invio si ripete UNA volta.
     */
    rinnovaAccesso?: (modello: string | null) => Promise<void>
    /**
     * ⛔ CHATGPT NEL CODICE (emendamento 18/10): il consumo di un giro DAL VIVO, come lo dice r4 (`StateDelta` `replace /usage`,
     * totali cumulativi nel giro): le chiamate al modello e i token (richiesta + risposta) in più rispetto al totale di prima.
     */
    suConsumo?: (consumo: { richieste: number; token: number }) => void
}

/** I totali che r4 manda a ogni chiamata del giro (`talosHarness.mjs` `conto`); `null` se l'evento non è un consumo. */
function totaliDelConsumo(dati: Record<string, unknown>): { giri: number; token: number } | null {
    if (dati.type !== 'StateDelta' || !Array.isArray(dati.delta)) return null
    const voce = (dati.delta as { op?: unknown; path?: unknown; value?: unknown }[]).find((d) => d?.op === 'replace' && d.path === '/usage')
    const v = voce?.value as Record<string, unknown> | undefined
    if (!v || typeof v !== 'object') return null
    const numero = (x: unknown) => (typeof x === 'number' && Number.isFinite(x) && x > 0 ? x : 0)
    return { giri: numero(v.giri), token: numero(v.prompt_tokens) + numero(v.completion_tokens) }
}

const attesaDiSerie = (tentativo: number): number => Math.min(5000, 500 * 2 ** (tentativo - 1))

/** K3-C Allegati A2: ciò che accompagna il testo per il modello. */
export interface ExtraDelMessaggioR4 {
    immagini?: readonly { id: string }[]
    bolla?: BollaR4 | null
}
const conExtra = ({ immagini, bolla }: ExtraDelMessaggioR4) => ({
    ...(immagini?.length ? { immagini: immagini.map((i) => ({ id: i.id })) } : {}),
    ...(bolla ? { bolla } : {}),
})

let contatore = 0

function erroreDalCorpo(stato: number, corpo: string): ErroreR4 {
    try {
        const valore = JSON.parse(corpo) as { error?: { code?: unknown; message?: unknown; reason?: unknown; params?: unknown } }
        const code = typeof valore?.error?.code === 'string' ? valore.error.code : null
        if (code) {
            const { reason, params } = valore.error ?? {}
            return {
                code, message: typeof valore.error?.message === 'string' ? valore.error.message : code,
                ...(typeof reason === 'string' ? { reason } : {}),
                ...(params && typeof params === 'object' && !Array.isArray(params) ? { params: params as Record<string, unknown> } : {}),
            }
        }
    } catch {
        // un corpo che non è JSON: resta lo stato HTTP
    }
    return { code: `HTTP_${stato}`, message: `HTTP ${stato}` }
}

/** Un guasto del passo prima dell'invio o del rinnovo: il suo codice, se ce l'ha (mai il token: le frasi sono dei nostri errori). */
function erroreDalGuasto(guasto: unknown): ErroreR4 {
    const code = typeof (guasto as { code?: unknown })?.code === 'string' ? (guasto as { code: string }).code : 'TALOS_R4_FORNITORE'
    return { code, message: guasto instanceof Error ? guasto.message : String(guasto) }
}

export function useConversazioneR4(opzioni: OpzioniConversazioneR4) {
    // K3-C3a2: i testi che r4 manda con la loro chiave (un RunError) detti nella lingua dell'app, letta a ogni evento
    // K3 piano: la sessione di adesso (anche quella appena creata), per riconoscere i `talos.plan` suoi
    const opzioniEventi: OpzioniEventiR4 = {
        testoDelServer: (chiave, params, riserva) => testoDelServerR4(chiave, params, riserva, talosCurrentLocale()),
        get sessioneId() { return sessioneId.value },
    }
    const { cliente, cartella } = opzioni
    const attesa = opzioni.attesaRiapertura ?? attesaDiSerie

    const stato = shallowRef(creaConversazioneR4())
    /** K3-C3b-1: il pannello ▤ (Contesto e File), dagli STESSI eventi dei messaggi. */
    const statoPannello = shallowRef(creaPannelloR4())
    const sessioneId = ref<string | null>(opzioni.sessioneId ?? null)
    /** Il nome della sessione per l'header (K3-C1): dalla lista delle sessioni di r4. */
    const titolo = ref('')
    /** K3-AP1: la politica dei permessi della sessione (la voce di `GET /sessions`): il «perché» della carta d'approvazione. */
    const politica = ref<PoliticaSessioneR4>({ permessi: null, perAttrezzo: {} })
    /**
     * K3-C Scelta del modello: modello e ragionamento della sessione come li dice r4 (`GET /sessions`, poi la risposta di
     * `/settings`). Senza sessione, quelli scelti per la prima: vanno nel corpo di `custom`. Cambiano solo quando r4 accetta.
     */
    const modello = ref<string | null>(null)
    const ragionamento = ref<RagionamentoR4 | null>(null)
    /**
     * K3 piano: il modo di lavoro della sessione (`GET /sessions`, poi la risposta di `/settings` o un `talos.impostazioni-sessione`
     * dal vivo). Senza sessione, quello scelto per la prima, che parte con `custom` solo se la persona l'ha scelto (come il permesso:
     * senza scelta decide r4, `Workspace write` e Normale).
     */
    const modalita = ref<'normale' | 'piano'>('normale')
    /**
     * K3 Coordinazione: accesa per la catena di questa sessione (le sue scelte vive, poi i padri dall'elenco di r4); `delega` per un
     * agente delegato (decide la conversazione principale); `conosciuta` falso se un anello manca dall'elenco.
     */
    const coordinazione = ref<{ accesa: boolean; delega: boolean; conosciuta: boolean }>({ accesa: false, delega: false, conosciuta: true })
    let modoScelto = false
    let permessoScelto = false
    /** Dal clic su Invia al `RunStarted` (o al rifiuto): il giro non c'è ancora, ma il messaggio è partito. */
    const inviando = ref(false)
    const errore = ref<ErroreR4 | null>(null)

    /** K3-AP3: le carte delle sotto-sessioni che chiedono alla persona; vivono nella vista (gli snapshot sono effimeri, come sul desktop). */
    const carteFiglie = shallowRef<CartaDellaFigliaR4[]>([])
    /** K3-C Accoda: la coda la tiene r4 (`talos.coda`, e la risposta delle sue rotte); qui solo ciò che ha detto l'ultima volta. */
    const coda = shallowRef<StatoCodaR4>({ voci: [], inPausa: false })
    const messaggi = computed(() => conCarteDelleFiglieR4(stato.value.messaggi, carteFiglie.value))
    const inCorso = computed(() => stato.value.inCorso)
    const ultimaSequenza = computed(() => stato.value.ultimaSequenza)
    const storiaFinita = computed(() => stato.value.storiaFinita)

    /** La coda in streaming della chat legge da qui (`TALOS_SORGENTE_STREAMING`). */
    const sorgente: TalosSorgenteStreaming = {
        sending: computed(() => inviando.value || inCorso.value !== null),
        testo: computed(() => inCorso.value?.testo ?? ''),
        ragionamento: computed(() => inCorso.value?.ragionamento ?? ''),
        confini: computed(() => inCorso.value?.confini ?? []),
        attivi: computed(() => inCorso.value?.attivi ?? []),
    }

    let flussoId: string | null = null
    let buffer = ''
    let tentativi = 0
    let chiuso = false
    let timerRiapertura: ReturnType<typeof setTimeout> | null = null
    const maniglie: Promise<{ remove(): Promise<void> }>[] = []

    /** I totali `/usage` del giro visti per ultimi (dalla storia o dal vivo): il consumo nuovo è la differenza. */
    let consumoDelGiro = { giri: 0, token: 0 }
    function consuma(testo: string): void {
        // Il nativo legge a righe e le chiude con «\n»; un «\r\n» di un altro trasporto diventa lo stesso.
        buffer += testo.replace(/\r\n/gu, '\n')
        const fine = buffer.lastIndexOf('\n\n')
        if (fine < 0) return
        const interi = buffer.slice(0, fine + 2)
        buffer = buffer.slice(fine + 2)
        let c = stato.value
        let p = statoPannello.value
        const eraFinita = c.storiaFinita
        let daRinnovare = false
        for (const evento of leggiFlussoSse(interi)) {
            // la fine della storia può stare nello stesso pezzo: il vivo si decide evento per evento
            if (c.storiaFinita && evento.dati.type === 'RunError' && evento.dati.code === 'CHATGPT_TOKEN_DA_RINNOVARE') daRinnovare = true
            // il consumo: l'ultimo totale si segue anche nella storia (un flusso riaperto a metà giro non riconta), si dice solo dal vivo
            if (evento.dati.type === 'RunStarted') consumoDelGiro = { giri: 0, token: 0 }
            const totali = totaliDelConsumo(evento.dati)
            if (totali) {
                const richieste = Math.max(0, totali.giri - consumoDelGiro.giri)
                const token = Math.max(0, totali.token - consumoDelGiro.token)
                consumoDelGiro = totali
                if (c.storiaFinita && (richieste || token)) opzioni.suConsumo?.({ richieste, token })
            }
            c = applicaEventoR4(c, evento.dati, opzioniEventi)
            p = applicaEventoPannelloR4(p, evento.dati)
            const richiesta = richiestaDellaFigliaR4(evento.dati, sessioneId.value)
            if (richiesta) richiestaDellaFiglia(richiesta)
            if (evento.dati.type === 'CUSTOM' && evento.dati.name === 'talos.coda') coda.value = statoCodaR4(evento.dati.value)
            if (evento.dati.type === 'RunStarted' || evento.dati.type === 'RunError') inviando.value = false
        }
        // K3 piano: dopo il sì al piano r4 cambia modo e permesso; dal vivo si rileggono da qui, dalla storia no (`legacy/app.js:21141`)
        const impostazioni = c.impostazioni
        if (impostazioni && impostazioni !== stato.value.impostazioni && impostazioni.dalVivo) {
            if (impostazioni.modalitaOperativa) modalita.value = impostazioni.modalitaOperativa
            if (impostazioni.permessi) politica.value = { ...politica.value, permessi: impostazioni.permessi }
        }
        if (c !== stato.value) stato.value = c
        if (p !== statoPannello.value) statoPannello.value = p
        if (!eraFinita && c.storiaFinita) void riprendiFiglie()
        if (daRinnovare) void riprendiDopoIlRinnovo()
    }

    // ---- K3-AP3: le richieste delle sotto-sessioni (`cartaDellaFiglia`, `leggiDomandaDellaFiglia`, `legacy/app.js:11320-11390`) ----
    /** Le richieste già risolte in questa vista: una lettura di `/pending` partita prima e tornata dopo non fa una carta orfana. */
    const risolteFiglie = new Set<string>()
    const lettureFiglie = new Map<string, Promise<void>>()
    const haCarta = (requestId: string) => carteFiglie.value.some((c) => c.messaggio.id === `figlia:${requestId}`)

    function richiestaDellaFiglia(r: RichiestaDellaFigliaR4): void {
        const { operazione } = r
        if (operazione.status === 'waiting') {
            if (operazione.requestId && haCarta(operazione.requestId)) return
            void leggiPendenteDellaFiglia(r.childId, r.chi, operazione.requestId)
            return
        }
        const esito = operazione.kind === 'approval'
            ? { approvato: operazione.approvato === true, ambito: operazione.ambito ?? null, motivo: null }
            : { status: operazione.esito ?? 'cancelled' }
        if (operazione.requestId) risolteFiglie.add(operazione.requestId)
        carteFiglie.value = carteFiglie.value.map((c) => {
            const voce = (c.messaggio.metadata[TALOS_METADATA_APPROVAZIONE] ?? c.messaggio.metadata[TALOS_METADATA_DOMANDA]) as { requestId: string; figlia?: FigliaR4 }
            const tocca = operazione.requestId ? voce.requestId === operazione.requestId : voce.figlia?.sessionId === r.childId
            if (!tocca) return c
            const chiave = c.messaggio.metadata[TALOS_METADATA_APPROVAZIONE] ? TALOS_METADATA_APPROVAZIONE : TALOS_METADATA_DOMANDA
            return { ...c, messaggio: { ...c.messaggio, metadata: { ...c.messaggio.metadata, [chiave]: { ...voce, esito } } } }
        })
    }

    /** Una lettura di `/pending` per richiesta; la carta va dopo il messaggio che è l'ultimo adesso. */
    function leggiPendenteDellaFiglia(figliaId: string, chi: string | null, requestIdAtteso: string | null): Promise<void> {
        const chiave = requestIdAtteso ?? `figlia:${figliaId}`
        const inVolo = lettureFiglie.get(chiave)
        if (inVolo) return inVolo
        const radice = sessioneId.value
        const lettura = (async () => {
            try {
                const dati = await leggi(`/api/v1/sessions/${encodeURIComponent(figliaId)}/pending`)
                if (chiuso || sessioneId.value !== radice) return
                const v = voceDellaFigliaR4(dati?.pending, { sessionId: figliaId, chi })
                if (!v || risolteFiglie.has(v.voce.requestId) || haCarta(v.voce.requestId)) return
                carteFiglie.value = [...carteFiglie.value, { messaggio: messaggioDellaFigliaR4(v), ancora: stato.value.messaggi.at(-1)?.id ?? null }]
            } finally {
                lettureFiglie.delete(chiave)
            }
        })()
        lettureFiglie.set(chiave, lettura)
        return lettura
    }

    /** `riprendiCarteDelleFiglie`: a storia finita, le discendenti che aspettano ancora (elenco delle sessioni) ritrovano la carta. */
    async function riprendiFiglie(): Promise<void> {
        const radice = sessioneId.value
        if (!radice) return
        const elenco = await leggi('/api/v1/sessions')
        if (chiuso || sessioneId.value !== radice) return
        const conCarta = new Set(carteFiglie.value.map((c) => ((c.messaggio.metadata[TALOS_METADATA_APPROVAZIONE] ?? c.messaggio.metadata[TALOS_METADATA_DOMANDA]) as { figlia?: FigliaR4 }).figlia?.sessionId))
        for (const { sessionId: figliaId, padreId } of discendentiInAttesaR4(elenco?.items, radice)) {
            if (conCarta.has(figliaId)) continue
            const fratelli = await leggi(`/api/v1/sessions/${encodeURIComponent(padreId)}/children`)
            if (chiuso || sessioneId.value !== radice) return
            const agente = (Array.isArray(fratelli?.figli) ? fratelli.figli : []).find((f) => (f as { sessionId?: unknown })?.sessionId === figliaId)
            await leggiPendenteDellaFiglia(figliaId, chiDellAgenteR4(agente), null)
        }
    }

    function ascolta(): void {
        if (maniglie.length) return
        maniglie.push(cliente.addListener('r4Pezzo', (dati) => {
            if (chiuso || dati.id !== flussoId || typeof dati.testo !== 'string') return
            tentativi = 0
            consuma(dati.testo)
        }))
        maniglie.push(cliente.addListener('r4Errore', (dati) => {
            if (chiuso || dati.id !== flussoId) return
            caduto(typeof dati.motivo === 'string' ? dati.motivo : '')
        }))
        maniglie.push(cliente.addListener('r4Fine', (dati) => {
            if (chiuso || dati.id !== flussoId) return
            caduto('')
        }))
    }

    function caduto(motivo: string): void {
        flussoId = null
        buffer = ''
        if (motivo === 'HTTP 404') {
            errore.value = { code: 'NOT_FOUND', message: 'The session no longer exists' }
            inviando.value = false
            return
        }
        tentativi += 1
        timerRiapertura = setTimeout(() => {
            timerRiapertura = null
            void apri()
        }, attesa(tentativi))
    }

    /** Il nome della sessione dalla lista di r4 (`GET /api/v1/sessions`); un guasto lascia il titolo com'era. */
    async function leggiTitolo(): Promise<void> {
        const id = sessioneId.value
        if (!id) return
        try {
            const risposta = await cliente.richiesta({ metodo: 'GET', percorso: '/api/v1/sessions' })
            if (risposta.stato < 200 || risposta.stato >= 300) return
            // r4 risponde `{ data: { items: [...] } }` (misurato sul Pad, 15/10)
            const dati = (JSON.parse(risposta.corpo) as { data?: { items?: unknown } }).data
            const elenco: unknown[] = Array.isArray(dati?.items) ? dati.items : []
            const voce = elenco.find((v): v is { sessionId: string; nome?: unknown; taskDelega?: unknown; permessi?: unknown; permessiPerAttrezzo?: unknown; modello?: unknown; reasoning?: unknown; modalitaOperativa?: unknown } =>
                typeof v === 'object' && v !== null && (v as { sessionId?: unknown }).sessionId === id)
            if (voce && sessioneId.value === id) {
                const mappa = voce.permessiPerAttrezzo && typeof voce.permessiPerAttrezzo === 'object' ? voce.permessiPerAttrezzo as Record<string, unknown> : {}
                politica.value = {
                    permessi: typeof voce.permessi === 'string' ? voce.permessi : null,
                    perAttrezzo: Object.fromEntries(Object.entries(mappa).filter((e): e is [string, string] => typeof e[1] === 'string')),
                }
                // K3 piano: il modo della sessione (un valore vecchio, come `workflow`, si legge come Normale: `normalizzaModoDiLavoro`)
                modalita.value = voce.modalitaOperativa === 'piano' ? 'piano' : 'normale'
                // K3 Coordinazione: la catena fino alla conversazione principale (`catenaCoordinazioneDella` del desktop)
                const catena = catenaDellaSessioneR4(id, elenco as { sessionId?: unknown; padreId?: unknown; permessiPerAttrezzo?: unknown }[], politica.value.perAttrezzo)
                coordinazione.value = { accesa: catena.scelte ? coordinazioneAccesaNellaCatenaR4(catena.scelte) : false, delega: catena.delega, conosciuta: catena.scelte !== null }
                // K3-C Scelta del modello: la sessione dice il suo modello e il suo ragionamento (`null` = mai scelto)
                if (typeof voce.modello === 'string') modello.value = voce.modello
                const effort = voce.reasoning && typeof voce.reasoning === 'object' ? (voce.reasoning as { effort?: unknown }).effort : null
                ragionamento.value = typeof effort === 'string' ? { effort } : null
            }
            // K3-C3b-2b: una delega non ha `nome`; il desktop la intitola col suo compito (`session-item.js:247`), su una riga
            const nome = voce ? (typeof voce.nome === 'string' && voce.nome ? voce.nome : suUnaRigaR4(voce.taskDelega)) : ''
            if (nome && sessioneId.value === id) titolo.value = nome
        } catch {
            // il titolo non è essenziale: resta quello di prima
        }
    }

    /** K3-AP1: rilegge titolo e politica (la carta lo chiede quando nasce: un «sempre» messo altrove cambia il perché). */
    const leggiPolitica = () => leggiTitolo()

    /**
     * K3-AP1: la risposta a una carta d'approvazione (`POST /:id/approve`, il corpo di `corpoApprovazioneR4`). «Per questa sessione»
     * scrive PRIMA il «sempre» sull'attrezzo con l'unione che rispetta un «nega» messo altrove (`legacy/app.js` `unisciSempreDallaCarta`):
     * se il server non lo unisce (`nonUniti`) la carta lo dirà; se la scrittura non riesce il permesso resta «chiedi», e il sì a
     * questa richiesta parte comunque (come il desktop: perdere un «nega» abbasserebbe le difese).
     */
    /* K3-AP3: con `figlia` la carta è di una sotto-sessione disegnata qui: la risposta va a LEI con `rispostoDa` (il registro la
       accetta solo dalla catena), e «Per questa sessione» scrive le SUE impostazioni, solo se la stessa richiesta aspetta ancora
       (`richiestaDellaFigliaAncoraInAttesa`): un «sempre» accompagna una risposta viva. La politica di questa sessione non cambia. */
    async function rispondiApprovazione(requestId: string, scelta: SceltaApprovazioneR4, tipo: string | null, figlia?: { sessionId: string }): Promise<{ ok: boolean; sempreNonSalvato: boolean }> {
        const id = sessioneId.value
        if (!id) return { ok: false, sempreNonSalvato: false }
        const base = `/api/v1/sessions/${encodeURIComponent(figlia?.sessionId ?? id)}`
        let sempreNonSalvato = false
        const ancoraInAttesa = async () => {
            if (!figlia) return true
            const p = (await leggi(`${base}/pending`))?.pending as { tipo?: unknown; requestId?: unknown } | null | undefined
            return p?.tipo === 'approvazione' && p.requestId === requestId
        }
        if (scelta === 'sessione' && tipo && await ancoraInAttesa()) {
            try {
                const r = await cliente.richiesta({ metodo: 'POST', percorso: `${base}/settings`, corpo: JSON.stringify({ unisciPermessiPerAttrezzo: { [tipo]: 'sempre' }, rispettaNega: true }) })
                if (r.stato >= 200 && r.stato < 300) {
                    const nonUniti = (JSON.parse(r.corpo) as { data?: { nonUniti?: unknown } }).data?.nonUniti
                    sempreNonSalvato = Array.isArray(nonUniti) && nonUniti.includes(tipo)
                    if (!sempreNonSalvato && !figlia) politica.value = { ...politica.value, perAttrezzo: { ...politica.value.perAttrezzo, [tipo]: 'sempre' } }
                }
            } catch {
                // il permesso resta «chiedi»: la risposta alla richiesta parte comunque
            }
        }
        const esito = await posta(`${base}/approve`, { ...corpoApprovazioneR4(requestId, scelta), ...(figlia ? { rispostoDa: id } : {}) })
        return { ok: esito.ok, sempreNonSalvato }
    }

    /**
     * K3-AP2: la risposta alla carta delle domande (`POST /:id/question`, `http-app.mjs:7619` @ 2161afb32: il 200 parte dopo la
     * scrittura nel registro). POST non si ripete da sé (RFC 9110): un rifiuto che non sia 400/422, o un guasto senza status, può
     * voler dire che la risposta è già stata presa. Prima di dirlo si rilegge il registro (`/export`) come il desktop
     * (`legacy/app.js:15250-15297`): se la domanda è chiusa lì, l'esito è quello. La carta dice il motivo da sé: `errore` non si tocca.
     */
    async function rispondiDomanda(corpo: { requestId: string; status: string; answers?: Record<string, string | string[]> }, figlia?: { sessionId: string }): Promise<
        { ok: true; riconciliata?: EsitoDomandaR4 } | { ok: false; stato: number | null; codice: string | null; messaggio: string }> {
        const madre = sessioneId.value
        if (!madre) return { ok: false, stato: null, codice: null, messaggio: 'no session' }
        // K3-AP3: la domanda di una sotto-sessione si risponde a lei, dichiarando da dove arriva (`rispostoDa`); il registro è il suo
        const id = figlia?.sessionId ?? madre
        const base = `/api/v1/sessions/${encodeURIComponent(id)}`
        let rifiuto: { ok: false; stato: number | null; codice: string | null; messaggio: string }
        try {
            const r = await cliente.richiesta({ metodo: 'POST', percorso: `${base}/question`, corpo: JSON.stringify(figlia ? { ...corpo, rispostoDa: madre } : corpo) })
            if (r.stato >= 200 && r.stato < 300) return { ok: true }
            const e = erroreDalCorpo(r.stato, r.corpo)
            rifiuto = { ok: false, stato: r.stato, codice: e.code.startsWith('HTTP_') ? null : e.code, messaggio: e.message }
        } catch (guasto) {
            rifiuto = { ok: false, stato: null, codice: null, messaggio: guasto instanceof Error ? guasto.message : String(guasto) }
        }
        if (rifiuto.stato === 400 || rifiuto.stato === 422) return rifiuto
        try {
            const r = await cliente.richiesta({ metodo: 'GET', percorso: `${base}/export` })
            const dati = r.stato >= 200 && r.stato < 300 ? (JSON.parse(r.corpo) as { data?: { sessionId?: unknown; eventi?: unknown } }).data : null
            if (dati?.sessionId === id && Array.isArray(dati.eventi)) {
                const chiusa = [...dati.eventi].reverse().find((e): e is Record<string, unknown> => Boolean(e) && typeof e === 'object'
                    && (e as Record<string, unknown>).type === 'UserQuestionResolved' && (e as Record<string, unknown>).requestId === corpo.requestId
                    && ['answered', 'skipped', 'cancelled'].includes(String((e as Record<string, unknown>).status)))
                if (chiusa) {
                    const { type: _tipo, requestId: _richiesta, _sequenza: _seq, ...esito } = chiusa
                    return { ok: true, riconciliata: esito as unknown as EsitoDomandaR4 }
                }
            }
        } catch {
            // nessuna prova dal registro: resta il rifiuto di prima
        }
        return rifiuto
    }

    // ---- K3-C Accoda: le rotte della coda di r4 (`http-app.mjs:7897-8017`); il rifiuto lo dice `errore`, come le altre azioni ----
    /** La risposta di una rotta della coda porta la coda nuova: si mostra subito, l'annuncio `talos.coda` arriva uguale. */
    function codaDallaRisposta(corpo: string): void {
        try {
            const dati = (JSON.parse(corpo) as { data?: { coda?: unknown } }).data
            if (dati?.coda) coda.value = statoCodaR4(dati.coda)
        } catch {
            // nessuna coda nella risposta: resta quella dell'annuncio
        }
    }
    async function rottaDellaCoda(fine: string, corpo: unknown): Promise<boolean> {
        if (!sessioneId.value) return false
        const esito = await posta(`/api/v1/sessions/${encodeURIComponent(sessioneId.value)}/queue${fine}`, corpo)
        if (esito.ok) codaDallaRisposta(esito.corpo)
        return esito.ok
    }
    /** «Accoda» del compositore: `POST /:id/queue {messaggio}`, con le immagini e la bolla quando ci sono (K3-C Allegati A2, `http-app.mjs:7933`). */
    const accoda = (testo: string, extra: ExtraDelMessaggioR4 = {}) => rottaDellaCoda('', { messaggio: testo, ...conExtra(extra) })
    /** «Indirizza ora» / «Invia ora» / «Riprendi»: a giro vivo r4 la fa entrare come correzione, a giro fermo riprende. */
    const inviaDallaCoda = (id: string) => rottaDellaCoda('/invia', { id })
    /** «Togli». */
    const togliDallaCoda = (id: string) => rottaDellaCoda('/annulla', { id })
    /**
     * «Modifica» (owner 16/10: riporta nel compositore, come Hermes `beginQueuedEdit`): r4 non ha una rotta per modificare una
     * voce, quindi esce dalla coda e torna il testo scritto dalla persona; `null` se non c'è o non si è potuta togliere.
     */
    async function riportaDallaCoda(id: string): Promise<string | null> {
        const voce = coda.value.voci.find((v) => v.id === id && !v.origine)
        if (!voce) return null
        return (await togliDallaCoda(id)) ? (voce.mostra ?? voce.testo) : null
    }

    // ---- K3-C Scelta del modello: `POST /:id/settings {modello?, reasoning?}` (`http-app.mjs:7100` @ 2161afb32) ----
    /**
     * Come il desktop (`legacy/app.js:7600-7618`) e Hermes (`acp_adapter/server.py:315`): il server è la fonte di verità, il valore
     * cambia solo DOPO che r4 ha accettato; un rifiuto lascia quello di prima e lo dice. Senza sessione la scelta vale per la prima.
     */
    /**
     * K3 piano: una scrittura delle impostazioni della sessione dal foglio del modo (`POST /:id/settings`). Lo stato cambia solo
     * quando r4 accetta; un rifiuto (per esempio il modo durante un giro) torna con le parole del server nella lingua dell'app, e il
     * foglio lo dice da sé: l'errore del Codice non si tocca.
     */
    async function scriviImpostazioni(corpo: Record<string, unknown>): Promise<{ ok: true } | { ok: false; messaggio: string }> {
        const id = sessioneId.value
        if (!id) return { ok: true }
        try {
            const r = await cliente.richiesta({ metodo: 'POST', percorso: `/api/v1/sessions/${encodeURIComponent(id)}/settings`, corpo: JSON.stringify(corpo) })
            if (r.stato >= 200 && r.stato < 300) return { ok: true }
            const e = erroreDalCorpo(r.stato, r.corpo)
            return { ok: false, messaggio: messaggioErroreServerR4(e, talosCurrentLocale()) || e.message }
        } catch (guasto) {
            return { ok: false, messaggio: guasto instanceof Error ? guasto.message : String(guasto) }
        }
    }
    async function impostaModo(modo: 'normale' | 'piano'): Promise<{ ok: true } | { ok: false; messaggio: string }> {
        const esito = await scriviImpostazioni({ modalitaOperativa: modo })
        if (!esito.ok) return esito
        modalita.value = modo
        if (!sessioneId.value) modoScelto = true
        return esito
    }
    /**
     * K3 Coordinazione: l'interruttore scrive la SOLA chiave sul server, con l'unione (`legacy/app.js:10200-10230`): «sempre» accesa,
     * «chiedi» spenta. Senza sessione, o in un agente delegato, non si scrive (decide la conversazione principale).
     */
    async function impostaCoordinazione(accesa: boolean): Promise<{ ok: true } | { ok: false; messaggio: string }> {
        if (!sessioneId.value || coordinazione.value.delega) return { ok: false, messaggio: '' }
        const valore = accesa ? 'sempre' : 'chiedi'
        const esito = await scriviImpostazioni({ unisciPermessiPerAttrezzo: { [CHIAVE_COORDINAZIONE_R4]: valore } })
        if (!esito.ok) return esito
        politica.value = { ...politica.value, perAttrezzo: { ...politica.value.perAttrezzo, [CHIAVE_COORDINAZIONE_R4]: valore } }
        coordinazione.value = { ...coordinazione.value, accesa, conosciuta: true }
        return esito
    }
    async function impostaPermesso(permesso: string): Promise<{ ok: true } | { ok: false; messaggio: string }> {
        const esito = await scriviImpostazioni({ permessi: permesso })
        if (!esito.ok) return esito
        politica.value = { ...politica.value, permessi: permesso }
        if (!sessioneId.value) permessoScelto = true
        return esito
    }

    /**
     * K3 piano: la scelta sul piano (`POST /:id/plan-decision`, `legacy/app.js:5890` `inviaDecisionePiano`). Il server la rende
     * idempotente; la ricevuta la scrive l'evento `talos.plan`, uguale in ogni finestra. Qui torna solo il rifiuto, con la sua busta
     * (`null` se r4 non ha risposto): la carta lo dice da sé, l'errore del Codice non si tocca.
     */
    async function decidiPiano(corpo: { requestId: string; decisione: DecisionePianoR4; hash: string; feedback?: string }): Promise<{ ok: true } | { ok: false; errore: ErroreR4 | null }> {
        const id = sessioneId.value
        if (!id) return { ok: false, errore: null }
        try {
            const r = await cliente.richiesta({ metodo: 'POST', percorso: `/api/v1/sessions/${encodeURIComponent(id)}/plan-decision`, corpo: JSON.stringify(corpo) })
            if (r.stato >= 200 && r.stato < 300) return { ok: true }
            return { ok: false, errore: erroreDalCorpo(r.stato, r.corpo) }
        } catch {
            return { ok: false, errore: null }
        }
    }

    async function impostaModello(nuovo: string, reasoning: RagionamentoR4 | null): Promise<boolean> {
        if (!sessioneId.value) {
            modello.value = nuovo
            ragionamento.value = reasoning
            return true
        }
        const esito = await posta(`/api/v1/sessions/${encodeURIComponent(sessioneId.value)}/settings`, { modello: nuovo, ...(reasoning ? { reasoning } : {}) })
        if (!esito.ok) return false
        modello.value = nuovo
        if (reasoning) ragionamento.value = reasoning
        return true
    }
    async function impostaRagionamento(reasoning: RagionamentoR4): Promise<boolean> {
        if (!sessioneId.value) {
            ragionamento.value = reasoning
            return true
        }
        const esito = await posta(`/api/v1/sessions/${encodeURIComponent(sessioneId.value)}/settings`, { reasoning })
        if (esito.ok) ragionamento.value = reasoning
        return esito.ok
    }
    /**
     * Un invio (`custom`, `resume` col messaggio) che r4 rifiuta perché il token del piano va rinnovato: un rinnovo e UNA ripetizione
     * della stessa richiesta. Al secondo rifiuto, o se il rinnovo non riesce, resta l'errore nella riga.
     */
    async function postaUnInvio(percorso: string, corpo: unknown): Promise<{ ok: true; corpo: string } | { ok: false }> {
        const prima = await posta(percorso, corpo)
        if (prima.ok || errore.value?.code !== 'CHATGPT_TOKEN_DA_RINNOVARE' || !opzioni.rinnovaAccesso) return prima
        try {
            await opzioni.rinnovaAccesso(modello.value)
        } catch (guasto) {
            errore.value = erroreDalGuasto(guasto)
            return { ok: false }
        }
        errore.value = null
        return posta(percorso, corpo)
    }

    /**
     * ⛔ A metà giro (Desktop 18/10, `http-app.mjs:7078-7110`, `session-registry.mjs:11032-11068`): dopo un 401 del servizio r4 chiude
     * il giro con RunError `CHATGPT_TOKEN_DA_RINNOVARE` e dimentica il token. Rinnovo, nuova spinta e `resume {}` (riparte dalla storia
     * salvata, senza ripetere il messaggio) UNA volta per invio. `SESSION_NOT_READY` mentre r4 chiude il giro si riprova poco dopo;
     * `interrupted-write-message` (il messaggio non è stato salvato) no: resta l'errore.
     */
    let giroRiprovato = false
    const TENTATIVI_RIPRESA = 5
    async function riprendiDopoIlRinnovo(): Promise<void> {
        if (giroRiprovato || chiuso || !opzioni.rinnovaAccesso || !sessioneId.value) return
        giroRiprovato = true
        try {
            await opzioni.rinnovaAccesso(modello.value)
        } catch (guasto) {
            errore.value = erroreDalGuasto(guasto)
            return
        }
        const percorso = `/api/v1/sessions/${encodeURIComponent(sessioneId.value)}/resume`
        for (let tentativo = 1; !chiuso; tentativo += 1) {
            const esito = await posta(percorso, {})
            if (esito.ok) {
                errore.value = null
                if (!flussoId) await apri()
                return
            }
            const rifiuto = errore.value
            if (rifiuto?.code !== 'SESSION_NOT_READY' || rifiuto.reason === 'interrupted-write-message' || tentativo >= TENTATIVI_RIPRESA) return
            await new Promise((fatto) => setTimeout(fatto, attesa(tentativo)))
        }
    }

    /** Il passo prima di ogni invio (la chiave in r4); un rifiuto ferma l'invio e va nella riga d'errore. */
    async function prontoPerInviare(): Promise<boolean> {
        if (!opzioni.primaDiInviare) return true
        try {
            await opzioni.primaDiInviare(modello.value)
            return true
        } catch (guasto) {
            errore.value = erroreDalGuasto(guasto)
            return false
        }
    }

    /** Apre (o riapre) il flusso della sessione. Senza sessione non fa niente. */
    async function apri(): Promise<void> {
        if (chiuso || !sessioneId.value || flussoId) return
        if (!titolo.value) void leggiTitolo()
        ascolta()
        await Promise.all(maniglie)
        if (chiuso) return
        contatore += 1
        const id = `r4-${Date.now().toString(36)}-${contatore}`
        const dopo = stato.value.ultimaSequenza
        const percorso = `/api/v1/sessions/${encodeURIComponent(sessioneId.value)}/events${dopo === null ? '' : `?after=${dopo}`}`
        flussoId = id
        buffer = ''
        try {
            await cliente.apriFlusso({ id, percorso })
        } catch (guasto) {
            if (flussoId === id) caduto(guasto instanceof Error ? guasto.message : String(guasto))
        }
    }

    async function posta(percorso: string, corpo: unknown): Promise<{ ok: true; corpo: string } | { ok: false }> {
        try {
            const risposta = await cliente.richiesta({ metodo: 'POST', percorso, corpo: JSON.stringify(corpo) })
            if (risposta.stato >= 200 && risposta.stato < 300) return { ok: true, corpo: risposta.corpo }
            errore.value = erroreDalCorpo(risposta.stato, risposta.corpo)
        } catch (guasto) {
            const message = guasto instanceof Error ? guasto.message : String(guasto)
            errore.value = { code: 'TALOS_R4_IRRAGGIUNGIBILE', message }
        }
        return { ok: false }
    }

    /**
     * Manda un messaggio: il primo crea la sessione, i successivi la riprendono. Falso se non è partito.
     * K3-C Allegati A2: `testo` è quello per il modello; le immagini (`[{id}]`, già caricate in r4) e la bolla (ciò che la persona vede,
     * quando è diverso) viaggiano accanto, come il desktop (`custom` :6282, `resume` :7059).
     */
    async function invia(testo: string, extra: ExtraDelMessaggioR4 = {}): Promise<boolean> {
        const consegna = testo.trim()
        if (chiuso || !consegna || inviando.value || inCorso.value) return false
        inviando.value = true
        errore.value = null
        giroRiprovato = false
        if (!(await prontoPerInviare())) {
            inviando.value = false
            return false
        }
        if (!sessioneId.value) {
            // ⛔ K3-LOC (Pad, 15/10): senza `client`. In r4 `client: 'mobile'` è il telefono attaccato al PC via adb
            // (`talosHarness.mjs:8209` @ fc5), e ogni `shell` tornava «No ADB device»: qui r4 gira DENTRO il telefono.
            // K3-C Scelta del modello: il modello e il ragionamento scelti per la prima (senza, decide r4)
            const esito = await postaUnInvio('/api/v1/sessions/custom', {
                cartellaLibera: cartella, consegna,
                ...(modello.value ? { modello: modello.value } : {}), ...(ragionamento.value ? { reasoning: ragionamento.value } : {}),
                // K3 piano: il modo e il permesso scelti dal foglio prima della sessione
                ...(modoScelto ? { modalitaOperativa: modalita.value } : {}), ...(permessoScelto && politica.value.permessi ? { permessi: politica.value.permessi } : {}),
                ...conExtra(extra),
            })
            const id = esito.ok ? (() => {
                try {
                    const valore = JSON.parse(esito.corpo) as { data?: { sessionId?: unknown } }
                    return typeof valore?.data?.sessionId === 'string' ? valore.data.sessionId : null
                } catch {
                    return null
                }
            })() : null
            if (!id) {
                if (esito.ok) errore.value = { code: 'TALOS_R4_RISPOSTA_STORTA', message: 'r4 did not return a session' }
                inviando.value = false
                return false
            }
            sessioneId.value = id
            await apri()
            return true
        }
        const esito = await postaUnInvio(`/api/v1/sessions/${encodeURIComponent(sessioneId.value)}/resume`, { messaggio: consegna, ...conExtra(extra) })
        if (!esito.ok) {
            inviando.value = false
            return false
        }
        if (!flussoId) await apri()
        return true
    }

    /** Stop: lo dice r4 (`RunError`/`RunFinished` arriva dal flusso). */
    async function ferma(): Promise<void> {
        if (!sessioneId.value) return
        await posta(`/api/v1/sessions/${encodeURIComponent(sessioneId.value)}/stop`, {})
    }

    /** K3-C1, «Riprendi la sessione»: un giro interrotto riparte, senza un messaggio nuovo (`resume` con `{}`). */
    async function riprendi(): Promise<void> {
        if (!sessioneId.value) return
        errore.value = null
        const esito = await posta(`/api/v1/sessions/${encodeURIComponent(sessioneId.value)}/resume`, {})
        if (esito.ok && !flussoId) await apri()
    }

    /** K3-C1, «Compatta il contesto»: `{ compattato }` com'è andata, `null` se non è partita (errore in `errore`). */
    async function compatta(): Promise<{ compattato: boolean } | null> {
        if (!sessioneId.value) return null
        errore.value = null
        const esito = await posta(`/api/v1/sessions/${encodeURIComponent(sessioneId.value)}/compact`, {})
        if (!esito.ok) return null
        try {
            const dati = (JSON.parse(esito.corpo) as { data?: { compattato?: unknown } }).data
            return { compattato: dati?.compattato === true }
        } catch {
            return { compattato: false }
        }
    }

    async function chiudi(): Promise<void> {
        if (chiuso) return
        chiuso = true
        if (timerRiapertura !== null) clearTimeout(timerRiapertura)
        const id = flussoId
        flussoId = null
        if (id) await cliente.chiudiFlusso({ id }).catch(() => undefined)
        const tolte = await Promise.all(maniglie.splice(0))
        await Promise.all(tolte.map((m) => m.remove().catch(() => undefined)))
    }

    if (getCurrentScope()) onScopeDispose(() => { void chiudi() })

    /** Una GET che vuole `{ data }`: il `data` o `null` se r4 non risponde bene. */
    async function leggi(percorso: string): Promise<Record<string, unknown> | null> {
        try {
            const risposta = await cliente.richiesta({ metodo: 'GET', percorso })
            if (risposta.stato < 200 || risposta.stato >= 300) return null
            const dati = (JSON.parse(risposta.corpo) as { data?: unknown }).data
            return dati && typeof dati === 'object' && !Array.isArray(dati) ? dati as Record<string, unknown> : null
        } catch {
            return null
        }
    }

    /** K3-C3b-1: il limite su cui la conversazione si compatta (`GET /:id/compaction-policy`), `null` se non si legge. */
    async function politicaCompattazione(): Promise<Record<string, unknown> | null> {
        if (!sessioneId.value) return null
        return leggi(`/api/v1/sessions/${encodeURIComponent(sessioneId.value)}/compaction-policy`)
    }

    /** K3-C3b-1: il riuso della cache della sessione (`GET /:id/metrics` → `cacheSessione`), `null` se non c'è. */
    async function cacheSessione(): Promise<Record<string, unknown> | null> {
        if (!sessioneId.value) return null
        const dati = await leggi(`/api/v1/sessions/${encodeURIComponent(sessioneId.value)}/metrics`)
        const misura = dati?.cacheSessione
        return misura && typeof misura === 'object' && !Array.isArray(misura) ? misura as Record<string, unknown> : null
    }

    /**
     * K3-C Esporta e Condividi (owner 17/10): la sessione come la esporta r4 (`GET /:id/export`, `talos.harness-ui.session-export.v1`),
     * il `data` intero o il rifiuto di r4 col suo codice. Le regole della trascrizione: `trascrizioneR4.ts`.
     */
    async function esporta(): Promise<{ ok: true; dati: Record<string, unknown> } | { ok: false; errore: ErroreR4 }> {
        if (!sessioneId.value) return { ok: false, errore: { code: 'NOT_FOUND', message: 'No session to export' } }
        try {
            const risposta = await cliente.richiesta({ metodo: 'GET', percorso: `/api/v1/sessions/${encodeURIComponent(sessioneId.value)}/export` })
            if (risposta.stato < 200 || risposta.stato >= 300) return { ok: false, errore: erroreDalCorpo(risposta.stato, risposta.corpo) }
            const dati = (JSON.parse(risposta.corpo) as { data?: unknown }).data
            if (!dati || typeof dati !== 'object' || Array.isArray(dati)) return { ok: false, errore: { code: 'TALOS_R4_RISPOSTA_STORTA', message: 'r4 did not return the session export' } }
            return { ok: true, dati: dati as Record<string, unknown> }
        } catch (guasto) {
            return { ok: false, errore: { code: 'TALOS_R4_IRRAGGIUNGIBILE', message: guasto instanceof Error ? guasto.message : String(guasto) } }
        }
    }

    /** K3-C2b, il Doctor di r4 (`GET /api/v1/doctor`): la risposta grezza, `null` se non si riesce a leggerla. Le regole: `doctorR4.ts`. */
    async function doctor(): Promise<Record<string, unknown> | null> {
        return leggi('/api/v1/doctor')
    }

    /** K3-C2, «Albero della sessione»: le deleghe vere (`GET /:id/children`), `null` se non si riesce a leggerle. */
    async function figli(): Promise<FiglioR4[] | null> {
        if (!sessioneId.value) return null
        const dati = await leggi(`/api/v1/sessions/${encodeURIComponent(sessioneId.value)}/children`)
        if (!dati || !Array.isArray(dati.figli)) return null
        return dati.figli.filter((f): f is FiglioR4 => typeof f === 'object' && f !== null && typeof (f as FiglioR4).sessionId === 'string')
    }

    /** K3-C2, «Hook del progetto»: `{ hooks, errore }` come lo dà r4 (`GET /:id/hooks`), `null` se non si riesce a leggerli. */
    async function hook(): Promise<HookDelProgettoR4 | null> {
        if (!sessioneId.value) return null
        const dati = await leggi(`/api/v1/sessions/${encodeURIComponent(sessioneId.value)}/hooks`)
        if (!dati || !Array.isArray(dati.hooks)) return null
        const hooks = dati.hooks.filter((h): h is HookR4 => typeof h === 'object' && h !== null && typeof (h as HookR4).id === 'string')
            .map((h) => ({ id: h.id, eventi: Array.isArray(h.eventi) ? h.eventi.filter((e): e is string => typeof e === 'string') : [], fidato: h.fidato === true }))
        return { hooks, errore: typeof dati.errore === 'string' ? dati.errore : null }
    }

    /** K3-C2, «Fida»: `POST /:id/hooks/:hookId/trust`. Vero se r4 l'ha fidato; un rifiuto va in `errore`. */
    async function fidaHook(id: string): Promise<boolean> {
        if (!sessioneId.value) return false
        errore.value = null
        const esito = await posta(`/api/v1/sessions/${encodeURIComponent(sessioneId.value)}/hooks/${encodeURIComponent(id)}/trust`, {})
        return esito.ok
    }

    /** K3-C3a, «Rinomina»: `POST /:id/rename {nome}`; il titolo cambia solo se r4 l'ha accettato. */
    async function rinomina(nome: string): Promise<boolean> {
        const nuovo = nome.trim()
        if (!sessioneId.value || !nuovo) return false
        errore.value = null
        const id = sessioneId.value
        const esito = await posta(`/api/v1/sessions/${encodeURIComponent(id)}/rename`, { nome: nuovo })
        if (esito.ok) {
            titolo.value = nuovo
            // REV-ELENCO-08: la colonna del tablet mostra la stessa sessione e si rilegge (`avvisiSessioniR4.ts`)
            annunciaCambioSessioneR4({ id, nome: nuovo })
        }
        return esito.ok
    }

    /** K3-C3a, «Duplica in una sessione nuova»: `POST /:id/fork` → l'id della sessione nuova, `null` se non è partita. */
    async function duplica(): Promise<string | null> {
        if (!sessioneId.value) return null
        errore.value = null
        const esito = await posta(`/api/v1/sessions/${encodeURIComponent(sessioneId.value)}/fork`, {})
        if (!esito.ok) return null
        try {
            const id = (JSON.parse(esito.corpo) as { data?: { sessionId?: unknown } }).data?.sessionId
            return typeof id === 'string' && id ? id : null
        } catch {
            return null
        }
    }

    /**
     * K3-C3b-2a, il menu della riga dei Processi: `POST /:id/processes/:toolCallId/stop|sfondo|remove` (nessun corpo che conti: il
     * comando lo dice l'indirizzo). L'esito vero arriva dagli eventi; qui solo se la richiesta è partita, e se no il perché con le
     * parole del desktop (409 «non è più in corso», «è ancora in corso: fermalo prima»). ⛔ Non tocca `errore`: è della riga, non
     * della conversazione.
     */
    async function azioneProcesso(azione: AzioneProcessoR4, toolCallId: string): Promise<{ ok: true } | { ok: false; motivo: string | null }> {
        if (!sessioneId.value) return { ok: false, motivo: null }
        const fine = { ferma: 'stop', sfonda: 'sfondo', togli: 'remove' }[azione]
        try {
            const risposta = await cliente.richiesta({ metodo: 'POST',
                percorso: `/api/v1/sessions/${encodeURIComponent(sessioneId.value)}/processes/${encodeURIComponent(toolCallId)}/${fine}`, corpo: '{}' })
            if (risposta.stato >= 200 && risposta.stato < 300) return { ok: true }
            return { ok: false, motivo: motivoDelRifiutoR4(risposta.corpo, talosCurrentLocale()) }
        } catch {
            return { ok: false, motivo: null }
        }
    }

    /** K3-C3b-2b: l'elenco delle sessioni di r4 (`GET /api/v1/sessions`, `{ data: { items } }`): le deleghe con `padreId`, anche quelle delle deleghe. */
    async function sessioni(): Promise<Record<string, unknown>[] | null> {
        try {
            const risposta = await cliente.richiesta({ metodo: 'GET', percorso: '/api/v1/sessions' })
            if (risposta.stato < 200 || risposta.stato >= 300) return null
            const items = (JSON.parse(risposta.corpo) as { data?: { items?: unknown } }).data?.items
            return Array.isArray(items) ? items.filter((v): v is Record<string, unknown> => typeof v === 'object' && v !== null && typeof (v as { sessionId?: unknown }).sessionId === 'string') : null
        } catch {
            return null
        }
    }

    /** K3-C3b-2a: CPU e memoria dei comandi vivi (`GET /:id/processes/resources`), per id; `null` se r4 non risponde. */
    async function risorseProcessi(): Promise<Map<string, RisorsaR4> | null> {
        if (!sessioneId.value) return null
        const dati = await leggi(`/api/v1/sessions/${encodeURIComponent(sessioneId.value)}/processes/resources`)
        if (!dati || !Array.isArray(dati.processi)) return null
        const mappa = new Map<string, RisorsaR4>()
        for (const v of dati.processi as Record<string, unknown>[]) {
            if (typeof v?.toolCallId !== 'string') continue
            mappa.set(v.toolCallId, { cpuPercento: Number.isFinite(v.cpuPercento) ? v.cpuPercento as number : null, memoriaByte: Number.isFinite(v.memoriaByte) ? v.memoriaByte as number : null })
        }
        return mappa
    }

    /*
     * ⛔ K3-FILE (owner 15/10 sera «Albero completo»): l'albero dei file sulle rotte /tree di r4 (`http-app.mjs` @ 2161afb32). Ogni chiamata
     * torna l'esito o il perché del rifiuto nelle parole del desktop (`motivoErroreFileR4`); come `azioneProcesso`, non tocca `errore`.
     */
    async function rottaFile(metodo: 'GET' | 'POST', coda: string, corpo?: Record<string, unknown>): Promise<{ stato: number; json: unknown } | null> {
        if (!sessioneId.value) return null
        try {
            const percorso = `/api/v1/sessions/${encodeURIComponent(sessioneId.value)}${coda}`
            const risposta = await cliente.richiesta(corpo === undefined ? { metodo, percorso } : { metodo, percorso, corpo: JSON.stringify(corpo) })
            let json: unknown = null
            try { json = JSON.parse(risposta.corpo) } catch { json = null }
            return { stato: risposta.stato, json }
        } catch {
            return null
        }
    }
    const riuscita = (r: { stato: number } | null): r is { stato: number; json: unknown } => Boolean(r && r.stato >= 200 && r.stato < 300)
    const rifiuto = (r: { json: unknown } | null, azione: AzioneFileR4) => ({ ok: false as const, motivo: motivoErroreFileR4(r?.json ?? null, azione, talosCurrentLocale()) })
    const conPercorso = (p: string) => `?percorso=${encodeURIComponent(p)}`

    /** Un livello dell'albero (`GET /:id/tree?percorso=`, '' = la radice della sessione). */
    async function albero(percorso: string): Promise<{ ok: true; voci: VoceAlberoR4[] } | { ok: false; motivo: string }> {
        const r = await rottaFile('GET', `/tree${conPercorso(percorso)}`)
        return riuscita(r) ? { ok: true, voci: vociAlberoR4(r.json) } : rifiuto(r, 'albero')
    }
    /** La ricerca per nome in tutta la cartella (`GET /:id/tree/search?q=`), con gli avvisi del desktop. */
    async function cercaFile(ricerca: string): Promise<{ ok: true; risultati: RisultatoRicercaR4[]; avvisi: string[] } | { ok: false; motivo: string }> {
        const r = await rottaFile('GET', `/tree/search?q=${encodeURIComponent(ricerca)}`)
        return riuscita(r) ? { ok: true, ...riassuntoRicercaR4(r.json, ricerca, talosCurrentLocale()) } : rifiuto(r, 'cerca')
    }
    /** L'anteprima di un file (`GET /:id/tree/file?percorso=`, fino a 512 KB). */
    async function apriFile(percorso: string): Promise<{ ok: true; contenuto: string; dimensione: number } | { ok: false; motivo: string }> {
        const r = await rottaFile('GET', `/tree/file${conPercorso(percorso)}`)
        const dati = (riuscita(r) ? (r.json as { data?: { contenuto?: unknown; dimensione?: unknown } } | null)?.data : null) ?? null
        return dati && typeof dati.contenuto === 'string'
            ? { ok: true, contenuto: dati.contenuto, dimensione: Number.isFinite(dati.dimensione) ? dati.dimensione as number : dati.contenuto.length }
            : rifiuto(r, 'apri')
    }
    const ROTTE_AZIONI: Record<'crea' | 'rinomina' | 'duplica' | 'sposta' | 'elimina', string> = {
        crea: '/tree/create', rinomina: '/tree/rename', duplica: '/tree/copy', sposta: '/tree/move', elimina: '/tree/delete',
    }
    /** Crea, rinomina, duplica, sposta, elimina: l'esito porta il percorso nuovo (`percorso` o `nuovoPercorso`; `null` per elimina). */
    async function azioneFile(azione: keyof typeof ROTTE_AZIONI, corpo: Record<string, unknown>): Promise<{ ok: true; percorso: string | null } | { ok: false; motivo: string }> {
        const r = await rottaFile('POST', ROTTE_AZIONI[azione], corpo)
        if (!riuscita(r)) return rifiuto(r, azione)
        const dati = (r.json as { data?: { percorso?: unknown; nuovoPercorso?: unknown } } | null)?.data
        const percorso = typeof dati?.nuovoPercorso === 'string' ? dati.nuovoPercorso : typeof dati?.percorso === 'string' ? dati.percorso : null
        return { ok: true, percorso }
    }

    return {
        sessioneId, titolo, messaggi, inCorso, inviando, errore, ultimaSequenza, storiaFinita, sorgente,
        apri, invia, ferma, riprendi, compatta, figli, hook, fidaHook, rinomina, duplica, doctor, esporta, chiudi,
        pannello: computed(() => statoPannello.value), politicaCompattazione, cacheSessione, azioneProcesso, risorseProcessi, sessioni,
        albero, cercaFile, apriFile, azioneFile, politica, leggiPolitica, rispondiApprovazione, rispondiDomanda,
        coda, accoda, inviaDallaCoda, togliDallaCoda, riportaDallaCoda,
        modello, ragionamento, impostaModello, impostaRagionamento,
        // K3 piano
        modalita, impostaModo, impostaPermesso, decidiPiano,
        // K3 Coordinazione
        coordinazione, impostaCoordinazione,
        pianoRichiesto: computed(() => stato.value.pianoRichiesto === true),
        revisioneDalVivo: computed(() => stato.value.revisioneDalVivo ?? null),
    }
}
