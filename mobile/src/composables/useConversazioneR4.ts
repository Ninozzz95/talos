/**
 * ⛔ K3-B2 (ledger `LEDGER-K3-CODICE-COME-LA-CHAT-2026-10-15.md`, punto 5; owner 15/10 «Stessi componenti della chat»): la
 * conversazione del Codice su r4. Il flusso degli eventi arriva dal client nativo a pezzi tagliati dove capita; qui si tengono
 * solo i blocchi SSE interi e si passano a `applicaEventoR4`, così i messaggi sono gli stessi del file intero (prova USR4-01).
 *
 * Il flusso di una sessione r4 non si chiude da solo a fine giro (`http-app.mjs:9121` @ c51a9ac08): uno per sessione, e il
 * messaggio successivo (`resume`) arriva sullo stesso. Se cade, si riapre con `?after=<ultima sequenza applicata>`: il blocco a
 * metà si butta, e r4 rimanda tutto ciò che viene dopo.
 */
import { computed, getCurrentScope, onScopeDispose, ref, shallowRef, watch } from 'vue'
import { applicaEventoR4, conRigaVivaAMano, creaConversazioneR4, leggiFlussoSse, type OpzioniEventiR4 } from '@/lib/harness/r4/eventiR4'
import { testoDelServerR4 } from '@/lib/harness/r4/testiServerR4'
import { applicaEventoPannelloR4, creaPannelloR4 } from '@/lib/harness/r4/pannelloR4'
import { motivoDelRifiutoR4, type AzioneProcessoR4, type RisorsaR4 } from '@/lib/harness/r4/processiR4'
import { corpoStopR4, figlieFermateDallaRispostaR4, type SceltaStopR4 } from '@/lib/harness/r4/fermaTuttoR4'
import { richiestaFermaFigliaR4 } from '@/lib/harness/r4/fermaAgenteR4'
import { suUnaRigaR4 } from '@/lib/harness/r4/agentiR4'
import { motivoErroreFileR4, riassuntoRicercaR4, vociAlberoR4, type AzioneFileR4, type RisultatoRicercaR4, type VoceAlberoR4 } from '@/lib/harness/r4/alberoR4'
import { talosCurrentLocale } from '@/i18n'
import { corpoApprovazioneR4, type PoliticaSessioneR4, type SceltaApprovazioneR4 } from '@/lib/harness/r4/approvazioniR4'
import type { TalosR4ClientePonte } from '@/lib/harness/r4/clienteR4'
import { TALOS_METADATA_DOMANDA, type EsitoDomandaR4 } from '@/lib/harness/r4/domandaChiave'
import { TALOS_METADATA_APPROVAZIONE, type FigliaR4 } from '@/lib/harness/r4/approvazioneChiave'
import { statoCodaR4, type StatoCodaR4 } from '@/lib/harness/r4/codaR4'
import { messaggioErroreModelloR4, type RagionamentoR4 } from '@/lib/harness/r4/modelloR4'
import type { BollaR4 } from '@/lib/harness/r4/allegatiR4'
import { chiDellAgenteR4, conCarteDelleFiglieR4, discendentiInAttesaR4, messaggioDellaFigliaR4, richiestaDellaFigliaR4, voceDellaFigliaR4, type CartaDellaFigliaR4, type RichiestaDellaFigliaR4 } from '@/lib/harness/r4/figlieR4'
import type { TalosAttesaDelGiro, TalosSorgenteStreaming } from '@/lib/chat/sorgenteStreaming'
import { messaggioErroreServerR4 } from '@/lib/harness/r4/pianoR4'
import type { DecisionePianoR4 } from '@/lib/harness/r4/pianoChiave'
import { CHIAVE_COORDINAZIONE_R4, catenaDellaSessioneR4, coordinazioneAccesaNellaCatenaR4 } from '@/lib/harness/r4/coordinazioneR4'
import { annunciaCambioSessioneR4 } from '@/lib/harness/r4/avvisiSessioniR4'
import { arrivaIstantanea, creaStatoImpostazioniR4, fineScrittura, inizioScrittura, istantaneaR4, type IstantaneaR4 } from '@/lib/harness/r4/impostazioniDalVivoR4'
import {
    MOTIVO_TROPPE_RICHIESTE, attendiConsenso, chiediConsenso as apriRichiestaDiConsenso, consensoRichiesto, leggiAttesaConsenso, type AttesaConsenso, type EsitoConsenso,
} from '@/lib/remoto/consensoDelPc'

export interface ErroreR4 {
    code: string
    message: string
    /** Il motivo e i valori che r4 aggiunge al codice (`reason`, `params`): la chiave che manca ha il nome del fornitore. */
    reason?: string
    params?: Record<string, unknown>
    /** FRASI-UNICHE (27/10/2026): la frase precisa che il server pubblica per la persona; sulla busta HTTP il `message` è quella generica del codice. */
    explanation?: string
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

/** Perché il guardiano del flusso si è arreso (GFR-10/12, RG-01..09, BST-03). */
export type MotivoResaR4 = 'silenzio' | 'cadute' | 'riga' | 'interrotta'

export interface OpzioniConversazioneR4 {
    cliente: TalosR4ClientePonte
    /** La cartella di lavoro che r4 conosce (`statoR4Sviluppo.cartella`). */
    cartella: string
    /**
     * R-M4 (owner 20/10/2026 «fra le cartelle ammesse»): la sessione nuova di un PC parte da una cartella della sua allowlist, per id
     * (`projects.list`), mai da un percorso: la prima `/sessions/custom` manda `cartellaId` al posto di `cartellaLibera` (r4 li
     * vuole mutuamente esclusivi, `http-app.mjs:2421-2436`).
     */
    cartellaId?: string | null
    /** Una sessione già esistente, da riaprire; senza, la crea il primo messaggio. */
    sessioneId?: string | null
    /** Millisecondi prima del tentativo `n` di riapertura (da 1). Di serie 0,5 s, 1 s, 2 s… fino a 5 s. */
    attesaRiapertura?: (tentativo: number) => number
    /**
     * R4 delle righe in corso: un'ora del PC (ms dall'epoca) portata sull'orologio del dispositivo (D-0145-6(b), lo scarto misurato
     * dal vivo). Senza, le ore del flusso valgono come sono (il r4 del telefono ha lo stesso orologio).
     */
    oraDelPc?: (ms: number) => number
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
    /**
     * D-0145-6(b): l'ora (`timestamp`, ms) di ogni evento DAL VIVO che la porta, per misurare lo scarto d'orologio del PC
     * (`scartoOrologioPc.ts`). Dal vivo = dopo il `talos.fine-rigiocata` del flusso corrente: la storia, e alla riapertura ciò che è
     * successo mentre il canale era giù, porta ore vecchie.
     */
    suOraDalVivo?: (timestampMs: number) => void
    /** D-0145-6(b): il flusso si apre o si riapre; lo scarto si rimisura da capo. */
    suApertura?: () => void
    /**
     * IMPOSTAZIONE-RIFIUTATA (Pad, 27/10/2026): il PC ha rifiutato il modello o il ragionamento scelti. Come il PC
     * (`sincronizzaImpostazioniSessione`) il rifiuto NON va nella riga della conversazione (finiva dietro il foglio aperto): chi monta
     * lo dice in un avviso sopra tutto. Per CONSENT_REQUIRED la cartella resta pronta per `chiediConsenso`.
     */
    suImpostazioneRifiutata?: (errore: ErroreR4) => void
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
        const valore = JSON.parse(corpo) as { error?: { code?: unknown; message?: unknown; reason?: unknown; params?: unknown; explanation?: unknown } }
        const code = typeof valore?.error?.code === 'string' ? valore.error.code : null
        if (code) {
            const { reason, params, explanation } = valore.error ?? {}
            return {
                code, message: typeof valore.error?.message === 'string' ? valore.error.message : code,
                ...(typeof reason === 'string' ? { reason } : {}),
                ...(typeof explanation === 'string' && explanation.trim() ? { explanation } : {}),
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
        testoDelCodice: (codice, riserva) => messaggioErroreModelloR4({ code: codice, message: riserva }, talosCurrentLocale()),
        get sessioneId() { return sessioneId.value },
    }
    const { cliente, cartella, cartellaId } = opzioni
    const attesa = opzioni.attesaRiapertura ?? attesaDiSerie

    const stato = shallowRef(creaConversazioneR4())
    /** La compattazione chiesta a mano è in volo (la riga viva è sua: niente Salta né Ferma). */
    const aMano = ref(false)
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

    /*
     * ⛔ IMPOSTAZIONI-DAL-VIVO (owner 27/10/2026, contratto F, r4 `f573cdc93`): la fotografia intera delle impostazioni, decisa dalla
     * sua versione (`impostazioniDalVivoR4.ts`). Un PC più vecchio non la manda: allora resta la strada di prima (la riga dell'elenco,
     * la risposta 2xx, il modo e il permesso dal vivo).
     */
    let statoImpostazioni = creaStatoImpostazioniR4()
    function mostraIstantanea(f: IstantaneaR4): void {
        if (f.modello) modello.value = f.modello
        ragionamento.value = f.reasoning
        politica.value = { permessi: f.permessi, perAttrezzo: { ...f.permessiPerAttrezzo } }
        modalita.value = f.modalitaOperativa
        // la coordinazione di un agente delegato la decide la conversazione principale
        if (!coordinazione.value.delega && CHIAVE_COORDINAZIONE_R4 in f.permessiPerAttrezzo) {
            coordinazione.value = { ...coordinazione.value, accesa: f.permessiPerAttrezzo[CHIAVE_COORDINAZIONE_R4] === 'sempre', conosciuta: true }
        }
        if (f.nome && f.nome !== titolo.value) {
            titolo.value = f.nome
            // Desktop 27/10: anche la riga dell'elenco (la colonna del tablet, la lista) dice il nome nuovo
            if (sessioneId.value) annunciaCambioSessioneR4({ id: sessioneId.value, nome: f.nome })
        }
    }
    function riceviIstantanea(f: IstantaneaR4): void {
        const esito = arrivaIstantanea(statoImpostazioni, f)
        statoImpostazioni = esito.stato
        if (esito.applica) mostraIstantanea(esito.applica)
    }
    /**
     * Una scrittura delle impostazioni del dispositivo: in volo trattiene ciò che arriva, alla risposta vale la sua fotografia (o la
     * trattenuta più nuova). `conFotografia` dice a chi scrive di NON mettere a mano il valore: l'ha già messo la fotografia, e un
     * valore messo dopo potrebbe disfare una trattenuta più nuova.
     */
    async function conFotografia<T extends { ok: boolean; corpo?: string }>(scrivi: () => Promise<T>): Promise<{ esito: T; conFotografia: boolean }> {
        statoImpostazioni = inizioScrittura(statoImpostazioni)
        let risposta: IstantaneaR4 | null = null
        try {
            const esito = await scrivi()
            if (esito.ok && esito.corpo) {
                try { risposta = istantaneaR4((JSON.parse(esito.corpo) as { data?: { istantanea?: unknown } }).data?.istantanea) } catch { /* corpo non JSON: nessuna fotografia */ }
            }
            return { esito, conFotografia: risposta !== null }
        } finally {
            const fine = fineScrittura(statoImpostazioni, risposta)
            statoImpostazioni = fine.stato
            if (fine.applica) mostraIstantanea(fine.applica)
        }
    }
    /** Dal clic su Invia al `RunStarted` (o al rifiuto): il giro non c'è ancora, ma il messaggio è partito. */
    const inviando = ref(false)
    /** GFR-12 (Desktop 27/10): il guardiano si è arreso col giro visto. Lo schermo non dice «al lavoro»; `inCorso` resta dentro. */
    const collegamentoPerso = ref(false)
    /** RG-04: la sessione non c'è più sul PC (404 del flusso): niente «al lavoro» accanto all'avviso. */
    const sessioneSparita = ref(false)
    /**
     * Il guardiano: il `talos.battito` portato da questo pezzo del flusso (RG-08), con lo stato della fonte quando il PC lo manda
     * (`{ultimaSequenza, lavora}`, Desktop 27/10 sera, BST-01..05); `null` = nessun battito nel pezzo.
     */
    let battitoNelPezzo: { ultimaSequenza: number | null; lavora: boolean | null } | null = null
    /** Perché il guardiano si è arreso: «Riconnetti» ha senso per tutti tranne `interrotta` (lì si scrive un messaggio nuovo). */
    const motivoResa = ref<MotivoResaR4 | null>(null)
    /**
     * ⛔ R3 delle righe in corso (owner 27/10 «nulla deve fare sembrare la ui bloccata»; bozzetto approvato il 28/10, scena 9; test
     * RICOLL-01..06): a giro vivo il flusso è caduto e si sta riaprendo. `dal` è l'ora della PRIMA caduta, `tentativo` cresce a ogni
     * caduta di fila; il primo pezzo del flusso riaperto la toglie e accende `ricollegato` per 2 s. Alla resa del guardiano lascia il
     * posto all'errore con «Riconnetti».
     */
    const ricollegamento = ref<{ tentativo: number, dal: number } | null>(null)
    /** R4: l'ora del tocco su Invia; l'attesa della prima parola conta da qui finché il giro non porta la sua (ATT-01..03). */
    const inviatoAlle = ref<number | null>(null)
    const ricollegato = ref(false)
    let timerRicollegato: ReturnType<typeof setTimeout> | null = null
    function lineaTornata(): void {
        ricollegamento.value = null
        ricollegato.value = true
        if (timerRicollegato !== null) clearTimeout(timerRicollegato)
        timerRicollegato = setTimeout(() => { timerRicollegato = null; ricollegato.value = false }, 2_000)
    }
    const errore = ref<ErroreR4 | null>(null)
    /**
     * ⛔ D-MOCK-11 (contratto R5.12, parte 1, punti 2-3; solo sul PC): la richiesta di consenso aperta sul PC mentre la persona ci
     * risponde («Conferma sul computer»), e la cartella dell'ultimo `CONSENT_REQUIRED`, per «Riprova» dopo «Il PC non ha risposto».
     */
    const attesaConsenso = ref<AttesaConsenso | null>(null)
    let cartellaDaConsentire: { cartellaId: string, nome: string | null } | null = null
    let annullaAttesa: (() => void) | null = null

    /** K3-AP3: le carte delle sotto-sessioni che chiedono alla persona; vivono nella vista (gli snapshot sono effimeri, come sul desktop). */
    const carteFiglie = shallowRef<CartaDellaFigliaR4[]>([])
    /** K3-C Accoda: la coda la tiene r4 (`talos.coda`, e la risposta delle sue rotte); qui solo ciò che ha detto l'ultima volta. */
    const coda = shallowRef<StatoCodaR4>({ voci: [], inPausa: false })
    const messaggi = computed(() => conCarteDelleFiglieR4(stato.value.messaggi, carteFiglie.value))
    const inCorso = computed(() => stato.value.inCorso)
    // R4, revisione del Desktop (S3, ATT-04): a giro chiuso e niente in volo l'ora dell'invio si dimentica; un giro partito altrove
    // (dal PC, da un'automazione) senza la sua ora non conta da un invio vecchio
    watch(() => inCorso.value === null && !inviando.value, (fermo) => { if (fermo) inviatoAlle.value = null })
    const ultimaSequenza = computed(() => stato.value.ultimaSequenza)
    const storiaFinita = computed(() => stato.value.storiaFinita)

    /** La coda in streaming della chat legge da qui (`TALOS_SORGENTE_STREAMING`). */
    const sorgente: TalosSorgenteStreaming = {
        sending: computed(() => !collegamentoPerso.value && !sessioneSparita.value && (inviando.value || inCorso.value !== null)),
        inPausa: computed(() => ricollegamento.value !== null),
        // R4 (bozzetto approvato il 28/10, scene 3a/6): «inviato» dal tocco al via, poi «giro» dall'ora del RunStarted
        attesa: computed<TalosAttesaDelGiro | null>(() => {
            if (collegamentoPerso.value || sessioneSparita.value) return null
            if (inCorso.value) {
                const at = Date.parse(stato.value.giro?.at ?? '')
                const dal = Number.isFinite(at) ? (opzioni.oraDelPc ?? ((ms: number) => ms))(at) : inviatoAlle.value
                return { fase: 'giro', dal, chi: null }
            }
            return inviando.value ? { fase: 'inviato', dal: inviatoAlle.value, chi: null } : null
        }),
        testo: computed(() => inCorso.value?.testo ?? ''),
        ragionamento: computed(() => inCorso.value?.ragionamento ?? ''),
        confini: computed(() => inCorso.value?.confini ?? []),
        attivi: computed(() => inCorso.value?.attivi ?? []),
    }

    let flussoId: string | null = null
    let buffer = ''
    /** D-0145-6(b): il flusso CORRENTE ha già passato la sua storia (`talos.fine-rigiocata`). */
    let dalVivo = false
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
            if (dalVivo && typeof evento.dati.timestamp === 'number') opzioni.suOraDalVivo?.(evento.dati.timestamp)
            if (evento.dati.type === 'CUSTOM' && evento.dati.name === 'talos.fine-rigiocata') dalVivo = true
            // il guardiano del flusso: da qui in poi il silenzio di questo PC vuol dire flusso morto
            if (evento.dati.type === 'CUSTOM' && evento.dati.name === 'talos.battito') {
                battitoVisto = true
                const v = (evento.dati.value ?? {}) as { ultimaSequenza?: unknown; lavora?: unknown }
                battitoNelPezzo = {
                    ultimaSequenza: Number.isSafeInteger(v.ultimaSequenza) ? v.ultimaSequenza as number : null,
                    lavora: typeof v.lavora === 'boolean' ? v.lavora : null,
                }
            }
            const impostazioniPrima = c.impostazioni
            c = applicaEventoR4(c, evento.dati, opzioniEventi)
            // IMPOSTAZIONI-DAL-VIVO: evento per evento, anche dalla storia (decide la versione): due fotografie nello stesso pezzo contano tutte e due
            if (c.impostazioni !== impostazioniPrima && c.impostazioni?.istantanea) riceviIstantanea(c.impostazioni.istantanea)
            p = applicaEventoPannelloR4(p, evento.dati)
            const richiesta = richiestaDellaFigliaR4(evento.dati, sessioneId.value)
            if (richiesta) richiestaDellaFiglia(richiesta)
            if (evento.dati.type === 'CUSTOM' && evento.dati.name === 'talos.coda') coda.value = statoCodaR4(evento.dati.value)
            if (evento.dati.type === 'RunStarted' || evento.dati.type === 'RunError') inviando.value = false
        }
        // K3 piano: dopo il sì al piano r4 cambia modo e permesso; dal vivo si rileggono da qui, dalla storia no (`legacy/app.js:21141`)
        const impostazioni = c.impostazioni
        if (impostazioni && impostazioni !== stato.value.impostazioni && impostazioni.dalVivo && !impostazioni.istantanea) {
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
            if (ricollegamento.value) lineaTornata()
            const sequenzaPrima = stato.value.ultimaSequenza
            battitoNelPezzo = null
            consuma(dati.testo)
            segnaleDalFlusso(sequenzaPrima, battitoNelPezzo)
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
            // il motivo porta la frase del desktop nella lingua dell'app (`NOT_FOUND.session_not_found`, MOD-22)
            errore.value = { code: 'NOT_FOUND', reason: 'session-not-found', message: 'The session no longer exists' }
            inviando.value = false
            // RG-04: un giro visto resta dentro, ma accanto a «la sessione non esiste più» niente rotellina
            sessioneSparita.value = true
            ricollegamento.value = null
            return
        }
        // RG-06: un trasporto che cade a ogni apertura (PC spento) non lascia «al lavoro» per sempre
        caduteDiFila += 1
        if (caduteDiFila >= CADUTE_MASSIME && alLavoro()) arrenditi('cadute')
        // R3: a giro vivo la caduta si vede («riprovo · tentativo N» dall'ora della prima); a giro fermo si riapre in silenzio
        if (alLavoro() && !collegamentoPerso.value) {
            ricollegamento.value = { tentativo: (ricollegamento.value?.tentativo ?? 0) + 1, dal: ricollegamento.value?.dal ?? Date.now() }
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
            const voce = elenco.find((v): v is { sessionId: string; nome?: unknown; taskDelega?: unknown; permessi?: unknown; permessiPerAttrezzo?: unknown; modello?: unknown; reasoning?: unknown; modalitaOperativa?: unknown; versioneImpostazioni?: unknown } =>
                typeof v === 'object' && v !== null && (v as { sessionId?: unknown }).sessionId === id)
            /*
             * IMPOSTAZIONI-DAL-VIVO: la riga conta solo se è più nuova di ciò che si è già applicato (una fotografia della storia arrivata
             * prima della riga non torna indietro) e se nessuna scrittura del dispositivo è in volo. Senza versione (PC più vecchio) conta
             * sempre, come prima.
             */
            const versione = voce?.versioneImpostazioni
            const fresca = !Number.isSafeInteger(versione)
                || ((versione as number) > statoImpostazioni.applicata && statoImpostazioni.inVolo === 0)
            if (fresca && Number.isSafeInteger(versione)) statoImpostazioni = { ...statoImpostazioni, applicata: versione as number }
            if (voce && sessioneId.value === id && !fresca) {
                const catena = catenaDellaSessioneR4(id, elenco as { sessionId?: unknown; padreId?: unknown; permessiPerAttrezzo?: unknown }[], politica.value.perAttrezzo)
                coordinazione.value = { accesa: catena.scelte ? coordinazioneAccesaNellaCatenaR4(catena.scelte) : false, delega: catena.delega, conosciuta: catena.scelte !== null }
            }
            if (voce && sessioneId.value === id && fresca) {
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
            if (nome && sessioneId.value === id && (fresca || !titolo.value)) titolo.value = nome
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
                const scrivi = async () => {
                    const r = await cliente.richiesta({ metodo: 'POST', percorso: `${base}/settings`, corpo: JSON.stringify({ unisciPermessiPerAttrezzo: { [tipo]: 'sempre' }, rispettaNega: true }) })
                    return { ok: r.stato >= 200 && r.stato < 300, corpo: r.corpo }
                }
                // IMPOSTAZIONI-DAL-VIVO: solo la propria sessione passa dalla fotografia; quella di una figlia non è questa vista
                const { esito: r, conFotografia: f } = figlia ? { esito: await scrivi(), conFotografia: false } : await conFotografia(scrivi)
                if (r.ok) {
                    const nonUniti = (JSON.parse(r.corpo) as { data?: { nonUniti?: unknown } }).data?.nonUniti
                    sempreNonSalvato = Array.isArray(nonUniti) && nonUniti.includes(tipo)
                    if (!sempreNonSalvato && !figlia && !f) politica.value = { ...politica.value, perAttrezzo: { ...politica.value.perAttrezzo, [tipo]: 'sempre' } }
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
    async function scriviImpostazioni(corpo: Record<string, unknown>): Promise<{ ok: true; conFotografia: boolean } | { ok: false; messaggio: string }> {
        const id = sessioneId.value
        if (!id) return { ok: true, conFotografia: false }
        const { esito, conFotografia: f } = await conFotografia(async (): Promise<{ ok: true; corpo: string } | { ok: false; messaggio: string }> => {
            try {
                const r = await cliente.richiesta({ metodo: 'POST', percorso: `/api/v1/sessions/${encodeURIComponent(id)}/settings`, corpo: JSON.stringify(corpo) })
                if (r.stato >= 200 && r.stato < 300) return { ok: true, corpo: r.corpo }
                const e = erroreDalCorpo(r.stato, r.corpo)
                return { ok: false, messaggio: messaggioErroreServerR4(e, talosCurrentLocale()) || e.message }
            } catch (guasto) {
                return { ok: false, messaggio: guasto instanceof Error ? guasto.message : String(guasto) }
            }
        })
        return esito.ok ? { ok: true, conFotografia: f } : esito
    }
    async function impostaModo(modo: 'normale' | 'piano'): Promise<{ ok: true } | { ok: false; messaggio: string }> {
        const esito = await scriviImpostazioni({ modalitaOperativa: modo })
        if (!esito.ok) return esito
        if (!esito.conFotografia) modalita.value = modo
        if (!sessioneId.value) modoScelto = true
        return { ok: true }
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
        if (!esito.conFotografia) {
            politica.value = { ...politica.value, perAttrezzo: { ...politica.value.perAttrezzo, [CHIAVE_COORDINAZIONE_R4]: valore } }
            coordinazione.value = { ...coordinazione.value, accesa, conosciuta: true }
        }
        return { ok: true }
    }
    async function impostaPermesso(permesso: string): Promise<{ ok: true } | { ok: false; messaggio: string }> {
        const esito = await scriviImpostazioni({ permessi: permesso })
        if (!esito.ok) return esito
        if (!esito.conFotografia) politica.value = { ...politica.value, permessi: permesso }
        if (!sessioneId.value) permessoScelto = true
        return { ok: true }
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

    /**
     * IMPOSTAZIONE-RIFIUTATA (Pad, 27/10/2026): la scrittura del modello o del ragionamento. Un rifiuto non tocca la riga d'errore della
     * conversazione (finiva dietro il foglio aperto): va a chi monta, che lo dice sopra tutto; senza ascoltatore resta nella riga, come
     * prima. Per il consenso la cartella resta pronta per `chiediConsenso`.
     */
    async function postaImpostazione(percorso: string, corpo: unknown): Promise<{ ok: true; corpo: string } | { ok: false }> {
        let rifiuto: ErroreR4
        try {
            const r = await cliente.richiesta({ metodo: 'POST', percorso, corpo: JSON.stringify(corpo) })
            if (r.stato >= 200 && r.stato < 300) return { ok: true, corpo: r.corpo }
            rifiuto = erroreDalCorpo(r.stato, r.corpo)
        } catch (guasto) {
            rifiuto = { code: 'TALOS_R4_IRRAGGIUNGIBILE', message: guasto instanceof Error ? guasto.message : String(guasto) }
        }
        const cartella = consensoRichiesto(rifiuto)
        if (cartella) cartellaDaConsentire = cartella
        if (opzioni.suImpostazioneRifiutata) opzioni.suImpostazioneRifiutata(rifiuto)
        else errore.value = rifiuto
        return { ok: false }
    }

    async function impostaModello(nuovo: string, reasoning: RagionamentoR4 | null): Promise<boolean> {
        if (!sessioneId.value) {
            modello.value = nuovo
            ragionamento.value = reasoning
            return true
        }
        const id = sessioneId.value
        const { esito, conFotografia: f } = await conFotografia(() => postaImpostazione(`/api/v1/sessions/${encodeURIComponent(id)}/settings`, { modello: nuovo, ...(reasoning ? { reasoning } : {}) }))
        if (!esito.ok) return false
        if (!f) {
            modello.value = nuovo
            if (reasoning) ragionamento.value = reasoning
        }
        return true
    }
    /** `null` = nessuna scelta: r4 non manda un livello e decide il fornitore (J3-bis, «Auto»; il desktop manda lo stesso). */
    async function impostaRagionamento(reasoning: RagionamentoR4 | null): Promise<boolean> {
        if (!sessioneId.value) {
            ragionamento.value = reasoning
            return true
        }
        const id = sessioneId.value
        const { esito, conFotografia: f } = await conFotografia(() => postaImpostazione(`/api/v1/sessions/${encodeURIComponent(id)}/settings`, { reasoning }))
        if (esito.ok && !f) ragionamento.value = reasoning
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

    /**
     * Dal Pad, prova della CLI (27/10/2026): dopo un 404 il flusso si ferma (USR4-06) e l'avviso resta. Se qualcuno dimostra che la
     * sessione c'è ancora (la colonna l'ha appena rinominata sul PC riavviato), l'avviso se ne va e il flusso riparte. Solo quell'avviso.
     */
    async function ritrovata(): Promise<void> {
        if (chiuso || errore.value?.code !== 'NOT_FOUND' || errore.value.reason !== 'session-not-found') return
        errore.value = null
        sessioneSparita.value = false
        tentativi = 0
        await apri()
    }

    /*
     * ⛔ Il guardiano del flusso (owner 27/10/2026, Server-PC e OnePlus13: sul PC il giro era finito in errore, sul dispositivo restava
     * «al lavoro»; test GFR-01..12 e RG-01..09). L'iscrizione remota poteva restare aperta ma muta, e nessuno chiudeva il giro. Contratto
     * col Desktop: il PC manda `talos.battito` ogni 15 s su ogni iscrizione viva. Finché il pulsante dice «al lavoro»
     * (`inviando || inCorso`):
     *   · 40 s senza niente dal flusso, su un flusso che ha già portato un battito ⇒ il flusso è morto: si riapre da `ultimaSequenza`;
     *   · 40 s senza niente su un PC di prima (mai un battito), oppure 120 s senza una sequenza nuova anche col battito (revisione
     *     avversaria: il battito prova l'iscrizione del PONTE, non la fonte degli eventi; un PC riavviato a metà giro non scrive una fine,
     *     `session-registry.mjs:549,567-569`) ⇒ la riga di `GET /api/v1/sessions`: conclusa o interrotta ⇒ si riapre una volta, e se la
     *     rigiocata non ha portato niente ci si arrende subito; viva (un comando lungo) ⇒ si riguarda più tardi; assente o senza risposta
     *     in 15 s ⇒ «ignota», e 6 ignote di fila valgono la resa (l'elenco non è paginato: una sessione che non vi compare non si vede).
     * Tetti: 3 riaperture di fila senza una sequenza nuova (GFR-10), 6 cadute di fila del trasporto (RG-06). La resa (GFR-12) non
     * inventa una fine: `collegamentoPerso` spegne «al lavoro», la riga d'errore dice la frase del PC e offre «Riconnetti». Una sequenza
     * nuova riporta lo stato normale; un battito anche, se la resa era per silenzio o per cadute (RG-08), non se la riga era finita.
     * A giro fermo il guardiano non fa niente. Una riapertura di troppo (il timer ritardato da Android al ritorno dal sottofondo) non fa
     * danni: i pezzi del flusso vecchio si scartano per id e la rigiocata riparte dopo `ultimaSequenza` (GFR-06).
     */
    const SILENZIO_MASSIMO_MS = 40_000
    const SENZA_SEQUENZA_MASSIMO_MS = 120_000
    const CONTROLLO_SILENZIO_MS = 10_000
    const TETTO_CONTROLLO_RIGA_MS = 15_000
    const RIAPERTURE_MASSIME = 3
    const CADUTE_MASSIME = 6
    const IGNOTE_MASSIME = 6
    const ERRORE_COLLEGAMENTO_PERSO = { code: 'OPERATION_FAILED', reason: 'timeout', message: 'The computer did not answer in time.' } as const
    // BST-03: la frase del PC per una sessione interrotta (`errori-sessioni-r4.json`), non l'errore di collegamento
    const ERRORE_INTERROTTA = { code: 'SESSION_NOT_READY', reason: 'interrupted-write-message', message: 'This session was interrupted: write a new message to resume it safely.' } as const
    const erroriDelGuardiano = [ERRORE_COLLEGAMENTO_PERSO, ERRORE_INTERROTTA]
    let ultimoSegnale = Date.now()
    let sequenzaAvanzataAlle = Date.now()
    let battitoVisto = false
    let guardiano: ReturnType<typeof setInterval> | null = null
    let controlloInVolo = false
    let controlloPartitoAlle = 0
    let gettoneControllo = 0
    let riapertureDiFila = 0
    let caduteDiFila = 0
    let ignoteDiFila = 0
    let sequenzaAllUltimaRiapertura: number | null = null
    let arreso = false
    let avantiDiFila = 0
    const alLavoro = () => inviando.value || inCorso.value !== null

    type RigaSulPc = 'terminale' | 'viva' | 'ignota'
    async function rigaSulPc(id: string): Promise<RigaSulPc> {
        try {
            const risposta = await cliente.richiesta({ metodo: 'GET', percorso: '/api/v1/sessions' })
            if (risposta.stato < 200 || risposta.stato >= 300) return 'ignota'
            const dati = (JSON.parse(risposta.corpo) as { data?: { items?: unknown } }).data
            const elenco: unknown[] = Array.isArray(dati?.items) ? dati.items : []
            const voce = elenco.find((v) => typeof v === 'object' && v !== null && (v as { sessionId?: unknown }).sessionId === id) as
                { conclusa?: unknown; interrotta?: unknown } | undefined
            if (!voce) return 'ignota'
            return voce.conclusa === true || voce.interrotta === true ? 'terminale' : 'viva'
        } catch {
            return 'ignota'
        }
    }
    /** Il controllo della riga, con un tetto di 15 s guardato dal battito del guardiano (`gettoneControllo`): una risposta tardiva non conta. */
    async function chiediLaRiga(id: string): Promise<RigaSulPc | null> {
        controlloInVolo = true
        controlloPartitoAlle = Date.now()
        const mio = ++gettoneControllo
        const esito = await rigaSulPc(id)
        if (mio !== gettoneControllo) return null
        controlloInVolo = false
        return esito
    }
    function arrenditi(motivo: MotivoResaR4): void {
        if (collegamentoPerso.value) return
        arreso = true
        motivoResa.value = motivo
        ricollegamento.value = null
        inviando.value = false
        collegamentoPerso.value = true
        errore.value = { ...(motivo === 'interrotta' ? ERRORE_INTERROTTA : ERRORE_COLLEGAMENTO_PERSO) }
    }
    /** Una riapertura del guardiano, col tetto di GFR-10. */
    function riapriPerIlGuardiano(): void {
        if (!flussoId) return
        if (riapertureDiFila >= RIAPERTURE_MASSIME) return arrenditi('silenzio')
        riapertureDiFila += 1
        sequenzaAllUltimaRiapertura = stato.value.ultimaSequenza
        ultimoSegnale = sequenzaAvanzataAlle = Date.now()
        riapri(flussoId)
    }
    function contaIgnota(): void {
        ignoteDiFila += 1
        if (ignoteDiFila >= IGNOTE_MASSIME) arrenditi('riga')
        else ultimoSegnale = sequenzaAvanzataAlle = Date.now()
    }
    async function controllaSilenzio(): Promise<void> {
        if (chiuso || !sessioneId.value || !alLavoro()) return
        if (controlloInVolo) {
            // RG-07: il PC non risponde alla lettura della riga (ponte mezzo morto): scade e conta come «ignota»
            if (Date.now() - controlloPartitoAlle >= TETTO_CONTROLLO_RIGA_MS) {
                gettoneControllo += 1
                controlloInVolo = false
                contaIgnota()
            }
            return
        }
        if (!flussoId) return
        if (stato.value.ultimaSequenza !== sequenzaAllUltimaRiapertura) {
            riapertureDiFila = 0
            arreso = false
        }
        if (arreso) return
        const ora = Date.now()
        const muto = ora - ultimoSegnale >= SILENZIO_MASSIMO_MS
        const fermo = battitoVisto && ora - sequenzaAvanzataAlle >= SENZA_SEQUENZA_MASSIMO_MS
        if (!muto && !fermo) return
        const id = flussoId
        if (muto && battitoVisto) {
            // il flusso che portava il battito tace: è morto (GFR-01); il tetto delle riaperture vale per i silenzi di fila
            if (riapertureDiFila >= RIAPERTURE_MASSIME) return arrenditi('silenzio')
            riapertureDiFila += 1
            sequenzaAllUltimaRiapertura = stato.value.ultimaSequenza
            riapri(id)
            return
        }
        const riga = await chiediLaRiga(sessioneId.value)
        if (riga === null || chiuso || flussoId !== id || !alLavoro()) return
        if (riga === 'ignota') return contaIgnota()
        ignoteDiFila = 0
        if (riga === 'viva') {
            // un comando lungo su un PC vivo: si riguarda più tardi (40 s senza battito, 120 s col battito)
            ultimoSegnale = sequenzaAvanzataAlle = Date.now()
            return
        }
        // la riga dice finita (conclusa o interrotta): una riapertura per la rigiocata; se c'è già stata senza portare niente, la resa
        if (riapertureDiFila > 0) return arrenditi('riga')
        riapertureDiFila += 1
        sequenzaAllUltimaRiapertura = stato.value.ultimaSequenza
        ultimoSegnale = sequenzaAvanzataAlle = Date.now()
        riapri(id)
    }
    function riapri(id: string): void {
        caduto('')
        void cliente.chiudiFlusso({ id }).catch(() => undefined)
    }
    function ripresoIlCollegamento(): void {
        collegamentoPerso.value = false
        arreso = false
        motivoResa.value = null
        riapertureDiFila = 0
        caduteDiFila = 0
        ignoteDiFila = 0
        avantiDiFila = 0
        if (erroriDelGuardiano.some((e) => errore.value?.code === e.code && errore.value.reason === e.reason)) errore.value = null
    }
    /** Ogni pezzo del flusso di adesso: il guardiano sa che il ponte è vivo; una sequenza nuova dice che lo è anche la fonte. */
    function segnaleDalFlusso(sequenzaPrima: number | null, battito: typeof battitoNelPezzo): void {
        ultimoSegnale = Date.now()
        caduteDiFila = 0
        if (stato.value.ultimaSequenza !== sequenzaPrima) {
            sequenzaAvanzataAlle = Date.now()
            avantiDiFila = 0
            riapertureDiFila = 0
            if (collegamentoPerso.value) ripresoIlCollegamento()
            return
        }
        if (!battito) return
        // RG-08: un battito dopo una resa per silenzio o per cadute: il giro gira davvero (non se la riga o il PC l'hanno detto finito)
        if (collegamentoPerso.value && (motivoResa.value === 'silenzio' || motivoResa.value === 'cadute')) ripresoIlCollegamento()
        const mia = stato.value.ultimaSequenza ?? 0
        // BST-01: due battiti di fila con la fonte più avanti ⇒ il flusso ha perso eventi (uno solo può incrociare un evento in volo)
        if (battito.ultimaSequenza !== null && battito.ultimaSequenza > mia) {
            avantiDiFila += 1
            if (avantiDiFila >= 2) {
                avantiDiFila = 0
                riapriPerIlGuardiano()
            }
            return
        }
        avantiDiFila = 0
        // BST-03: il PC dice che il giro VISTO non lavora più e la rigiocata non ha portato la fine ⇒ interrotto sul PC.
        // BST-04: a messaggio appena mandato (`inCorso` nullo) no: il giro nuovo può non essere ancora partito.
        if (battito.lavora === false && inCorso.value !== null && !collegamentoPerso.value) {
            if (riapertureDiFila === 0) riapriPerIlGuardiano()
            else arrenditi('interrotta')
        }
    }
    /** GFR-12c «Riconnetti»: errore via, conti a zero, si riapre da `ultimaSequenza`. */
    async function riconnetti(): Promise<void> {
        if (chiuso) return
        ripresoIlCollegamento()
        ultimoSegnale = sequenzaAvanzataAlle = Date.now()
        sequenzaAllUltimaRiapertura = stato.value.ultimaSequenza
        const id = flussoId
        if (id) riapri(id)
        // R3: dopo «Riconnetti» la stessa riga, da capo
        if (alLavoro()) ricollegamento.value = { tentativo: 1, dal: Date.now() }
        if (!id) await apri()
    }

    /** Apre (o riapre) il flusso della sessione. Senza sessione non fa niente. */
    async function apri(): Promise<void> {
        if (chiuso || !sessioneId.value || flussoId) return
        ultimoSegnale = Date.now()
        guardiano ??= setInterval(() => { void controllaSilenzio() }, CONTROLLO_SILENZIO_MS)
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
        dalVivo = false
        opzioni.suApertura?.()
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
        // GFR-12b: col collegamento perso il messaggio va al PC per la via normale (decide lui), non sparisce
        if (chiuso || !consegna || inviando.value || (inCorso.value && !collegamentoPerso.value)) return false
        inviando.value = true
        inviatoAlle.value = Date.now()
        errore.value = null
        giroRiprovato = false
        // RG-09: l'invio rinfresca l'orologio del guardiano. RG-05: la resa resta finché il PC non ha ricevuto il messaggio
        ultimoSegnale = sequenzaAvanzataAlle = Date.now()
        if (!(await prontoPerInviare())) {
            inviando.value = false
            return false
        }
        if (!sessioneId.value) {
            // ⛔ K3-LOC (Pad, 15/10): senza `client`. In r4 `client: 'mobile'` è il telefono attaccato al PC via adb
            // (`talosHarness.mjs:8209` @ fc5), e ogni `shell` tornava «No ADB device»: qui r4 gira DENTRO il telefono.
            // K3-C Scelta del modello: il modello e il ragionamento scelti per la prima (senza, decide r4)
            const esito = await postaUnInvio('/api/v1/sessions/custom', {
                ...(cartellaId ? { cartellaId } : { cartellaLibera: cartella }), consegna,
                ...(modello.value ? { modello: modello.value } : {}), ...(ragionamento.value ? { reasoning: ragionamento.value } : {}),
                // K3 piano: il modo e il permesso scelti dal foglio prima della sessione
                ...(modoScelto ? { modalitaOperativa: modalita.value } : {}), ...(permessoScelto && politica.value.permessi ? { permessi: politica.value.permessi } : {}),
                ...conExtra(extra),
            })
            const dati = esito.ok ? (() => {
                try {
                    return (JSON.parse(esito.corpo) as { data?: { sessionId?: unknown } | null }).data ?? null
                } catch {
                    return null
                }
            })() : null
            let id = typeof dati?.sessionId === 'string' ? dati.sessionId : null
            // D-MOCK-11: sul PC, `RATE_LIMITED` all'avvio viene dalle richieste di consenso già in attesa (al più 3)
            const rifiutato = errore.value as ErroreR4 | null // `posta` l'ha scritto: TS lo crede ancora null da sopra
            if (!esito.ok && cartellaId && rifiutato?.code === 'RATE_LIMITED') errore.value = { ...rifiutato, reason: MOTIVO_TROPPE_RICHIESTE }
            // D-MOCK-11: una cartella non ancora consentita. Il PC tiene il messaggio e avvia LUI la sessione al «Consenti».
            const inAttesa = !id && cartellaId ? leggiAttesaConsenso(dati, Date.now()) : null
            if (inAttesa) {
                const fine = await aspettaIlConsenso(inAttesa)
                id = fine.esito === 'consentita' ? fine.sessionId : null
                if (!id && fine.esito === 'consentita') errore.value = { code: 'TALOS_R4_RISPOSTA_STORTA', message: 'the computer did not start the session' }
            }
            if (!id) {
                if (esito.ok && !inAttesa) errore.value = { code: 'TALOS_R4_RISPOSTA_STORTA', message: 'r4 did not return a session' }
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
        // il PC ha il messaggio: il collegamento c'è, i conti del guardiano ripartono
        if (collegamentoPerso.value) ripresoIlCollegamento()
        ultimoSegnale = sequenzaAvanzataAlle = Date.now()
        if (!flussoId) await apri()
        return true
    }

    /**
     * ⛔ D-MOCK-11 (contratto R5.12, parte 1, punto 4): l'attesa della persona davanti al PC, con «Conferma sul computer» a schermo
     * (`attesaConsenso`). `negata` e `scaduta` diventano la riga d'errore (`CONSENT_DENIED`, `CONSENT_EXPIRED`: codici del
     * dispositivo, le frasi in `computer.consent.*`). «Annulla» (`annullaConsenso`) chiude subito l'attesa qui; sul PC la richiesta
     * scade da sé.
     */
    async function aspettaIlConsenso(attesa: AttesaConsenso): Promise<EsitoConsenso | { esito: 'errore' }> {
        attesaConsenso.value = attesa
        let fermato = false
        const annullata = new Promise<EsitoConsenso>((fatto) => {
            annullaAttesa = () => { fermato = true; fatto({ esito: 'annullata' }) }
        })
        try {
            const fine = await Promise.race([attendiConsenso(cliente, attesa, { fermato: () => fermato || chiuso }), annullata])
            if (fine.esito === 'negata') errore.value = { code: 'CONSENT_DENIED', message: 'The computer said no for this folder.' }
            if (fine.esito === 'scaduta') errore.value = { code: 'CONSENT_EXPIRED', message: 'The computer did not answer.' }
            return fine
        } catch (guasto) {
            errore.value = erroreDelConsenso(guasto)
            return { esito: 'errore' }
        } finally {
            fermato = true
            annullaAttesa = null
            attesaConsenso.value = null
        }
    }

    function erroreDelConsenso(guasto: unknown): ErroreR4 {
        const g = guasto as { code?: unknown, reason?: unknown, params?: unknown } | null
        return {
            ...erroreDalGuasto(guasto), code: typeof g?.code === 'string' ? g.code : 'DISCONNECTED',
            ...(typeof g?.reason === 'string' ? { reason: g.reason } : {}),
            ...(g?.params && typeof g.params === 'object' ? { params: g.params as Record<string, unknown> } : {}),
        }
    }

    /**
     * ⛔ D-MOCK-11 (contratto R5.12, parte 1, punto 3): «Chiedi al PC» dopo un `CONSENT_REQUIRED` (o «Riprova» dopo «Il PC non ha
     * risposto»): `consent.request` con la cartella del rifiuto, poi la stessa attesa dell'avvio. Il PC non tiene niente per una
     * sessione che c'è già: la bozza resta sul dispositivo, e la schermata la rimanda su `consentita`. Senza una cartella da chiedere
     * non parte niente (`errore`).
     */
    async function chiediConsenso(): Promise<EsitoConsenso['esito'] | 'errore'> {
        const da = consensoRichiesto(errore.value) ?? cartellaDaConsentire
        if (!da || chiuso || attesaConsenso.value) return 'errore'
        cartellaDaConsentire = da
        errore.value = null
        let attesa: AttesaConsenso
        try {
            attesa = await apriRichiestaDiConsenso(cliente, da.cartellaId)
        } catch (guasto) {
            errore.value = erroreDelConsenso(guasto)
            return 'errore'
        }
        const fine = await aspettaIlConsenso(attesa)
        if (fine.esito === 'consentita') cartellaDaConsentire = null
        return fine.esito
    }

    function annullaConsenso(): void {
        annullaAttesa?.()
    }

    /**
     * Stop: lo dice r4 (`RunError`/`RunFinished` arriva dal flusso).
     * ⛔ «Ferma tutto» (owner 29/10/2026, contratto `CONTRATTO-FERMA-TUTTE-2026-10-29.md` §1): con la scelta del foglio il corpo porta
     * `figlie: 'tutte' | 'nessuna'` (`corpoStopR4`); senza scelta `{}`, come oggi. Torna quante figlie r4 ha fermato (`figlieFermate`,
     * solo con «tutte»), `null` se non lo dice o se lo Stop non è partito.
     */
    async function ferma(figlie?: SceltaStopR4): Promise<number | null> {
        if (!sessioneId.value) return null
        const esito = await posta(`/api/v1/sessions/${encodeURIComponent(sessioneId.value)}/stop`, corpoStopR4(figlie ?? null))
        if (!esito.ok) return null
        try {
            return figlieFermateDallaRispostaR4(JSON.parse(esito.corpo))
        } catch {
            return null
        }
    }

    /**
     * ⛔ «Ferma» nella scheda Agenti (owner 29/10 notte; correzione del Desktop, FA-G1): UNA figlia, sulla SUA rotta dello Stop con
     * `{ figlie: 'tutte' }` (`richiestaFermaFigliaR4`): lei e le sue figlie, niente risveglio. Con `{}` r4 la fermerebbe senza cascata.
     * Come le azioni dei Processi non tocca `errore` (è della riga, non della conversazione); il perché solo con le parole dell'app, se no
     * `null` e la riga dice «Delega non fermata». Gli elenchi li rilegge chi li tiene (la scheda, la schermata).
     */
    async function fermaFiglia(figliaId: string): Promise<{ ok: true } | { ok: false; messaggio: string | null }> {
        const r = richiestaFermaFigliaR4(figliaId)
        try {
            const risposta = await cliente.richiesta({ metodo: r.metodo, percorso: r.percorso, corpo: JSON.stringify(r.corpo) })
            if (risposta.stato >= 200 && risposta.stato < 300) return { ok: true }
            return { ok: false, messaggio: motivoDelRifiutoR4(risposta.corpo, talosCurrentLocale()) }
        } catch {
            return { ok: false, messaggio: null }
        }
    }

    /** K3-C1, «Riprendi la sessione»: un giro interrotto riparte, senza un messaggio nuovo (`resume` con `{}`). */
    async function riprendi(): Promise<void> {
        if (!sessioneId.value) return
        errore.value = null
        const esito = await posta(`/api/v1/sessions/${encodeURIComponent(sessioneId.value)}/resume`, {})
        if (esito.ok && !flussoId) await apri()
    }

    /**
     * Ledger `LEDGER-RIGA-VIVA-CODICE-2026-10-21.md` — «Salta» della riga viva (contratto §5 e §8): `POST …/compaction/skip` senza
     * corpo né query. `{ saltato:false }` vuol dire che in quel momento nessun riassunto era atteso; `null` che r4 non l'ha presa
     * (sessione ignota, rete). Un controllo della PERSONA sul proprio giro: il modello non ha un attrezzo per farlo.
     */
    async function saltaRiassunto(): Promise<{ saltato: boolean } | null> {
        if (!sessioneId.value) return null
        try {
            const r = await cliente.richiesta({ metodo: 'POST', percorso: `/api/v1/sessions/${encodeURIComponent(sessioneId.value)}/compaction/skip` })
            if (r.stato < 200 || r.stato >= 300) return null
            try {
                return { saltato: (JSON.parse(r.corpo) as { data?: { saltato?: unknown } }).data?.saltato === true }
            } catch {
                return { saltato: false }
            }
        } catch {
            return null
        }
    }

    /** D-MO-12: «Annulla» sul separatore di una compattazione di r4 (`POST …/compaction/:at/undo`, senza corpo come il desktop). */
    async function annullaCompattazione(at: string): Promise<boolean> {
        if (!sessioneId.value || !at) return false
        errore.value = null
        try {
            const r = await cliente.richiesta({ metodo: 'POST', percorso: `/api/v1/sessions/${encodeURIComponent(sessioneId.value)}/compaction/${encodeURIComponent(at)}/undo` })
            if (r.stato >= 200 && r.stato < 300) return true
            errore.value = erroreDalCorpo(r.stato, r.corpo)
        } catch (guasto) {
            errore.value = erroreDalGuasto(guasto)
        }
        return false
    }

    /** K3-C1, «Compatta il contesto»: `{ compattato }` com'è andata, `null` se non è partita (errore in `errore`). */
    async function compatta(): Promise<{ compattato: boolean } | null> {
        if (!sessioneId.value) return null
        errore.value = null
        /*
         * Revisione avversaria (1): r4 non manda l'inizio della compattazione a mano, solo i passi `manuale` e la fine. La riga viva la
         * apre chi chiede, prima della POST, e la chiude al ritorno (desktop `compattaConversazioneLegacy`); a mano niente Salta né Ferma.
         */
        aMano.value = true
        stato.value = conRigaVivaAMano(stato.value, true)
        const esito = await posta(`/api/v1/sessions/${encodeURIComponent(sessioneId.value)}/compact`, {}).finally(() => {
            aMano.value = false
            stato.value = conRigaVivaAMano(stato.value, false)
        })
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
        if (timerRicollegato !== null) clearTimeout(timerRicollegato)
        ricollegamento.value = null
        ricollegato.value = false
        if (guardiano !== null) clearInterval(guardiano)
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

    /**
     * K3-C2, «Albero della sessione»: le deleghe vere (`GET /:id/children`), `null` se non si riesce a leggerle.
     * ⛔ D-REM-10 (dal Pad, 23/10/2026): una bozza non ha ancora una sessione, quindi non ha deleghe: elenco vuoto senza chiedere
     * niente al PC. Prima tornava `null` e il foglio diceva «Caricamento non riuscito» senza che fosse partita una richiesta.
     */
    async function figli(): Promise<FiglioR4[] | null> {
        if (!sessioneId.value) return []
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
        apri, ritrovata, invia, ferma, fermaFiglia, riprendi, compatta, saltaRiassunto, annullaCompattazione, figli, hook, fidaHook, rinomina, duplica, doctor, esporta, chiudi,
        pannello: computed(() => statoPannello.value),
        /** Allegati apribili (owner 26/10): la radice della sessione e la cartella di partenza, dal `RunStarted`. */
        cartelle: computed(() => stato.value.cartelle ?? null),
        politicaCompattazione, cacheSessione, azioneProcesso, risorseProcessi, sessioni,
        albero, cercaFile, apriFile, azioneFile, politica, leggiPolitica, rispondiApprovazione, rispondiDomanda,
        coda, accoda, inviaDallaCoda, togliDallaCoda, riportaDallaCoda,
        // GFR-12: il collegamento perso dopo il tetto del guardiano, e «Riconnetti» (non per una sessione interrotta sul PC, BST-03)
        collegamentoPerso, riconnetti,
        // R3: la linea caduta a giro vivo e il «Ricollegato» di 2 s
        ricollegamento, ricollegato,
        riconnettibile: computed(() => collegamentoPerso.value && motivoResa.value !== 'interrotta'),
        modello, ragionamento, impostaModello, impostaRagionamento,
        // K3 piano
        modalita, impostaModo, impostaPermesso, decidiPiano,
        // K3 Coordinazione
        coordinazione, impostaCoordinazione,
        pianoRichiesto: computed(() => stato.value.pianoRichiesto === true),
        revisioneDalVivo: computed(() => stato.value.revisioneDalVivo ?? null),
        // D-MO-12: la riga viva del riassunto che il giro aspetta (`null` quando non c'è)
        rigaViva: computed(() => stato.value.rigaViva ?? null),
        rigaVivaAMano: computed(() => aMano.value),
        // D-MOCK-11: il consenso del PC (solo sul PC)
        attesaConsenso, chiediConsenso, annullaConsenso,
        consensoDaChiedere: computed(() => consensoRichiesto(errore.value)),
    }
}
