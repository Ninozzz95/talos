<script setup lang="ts">
/**
 * ⛔ K3-B2 (ledger `LEDGER-K3-CODICE-COME-LA-CHAT-2026-10-15.md`, punto 6). Owner 15/10: «Voglio che il codice sia allineato a
 * come funziona l'interfaccia chat, le risposte e la formattazione della sezione chat … una volta per tutte»; decisioni «Stessi
 * componenti della chat» e «Dentro K3, su r4».
 *
 * Il Codice sul motore nuovo (r4), solo nella build di sviluppo che ha r4 («Affiancato»: il Codice di oggi resta su /harness).
 * Niente pezzi propri per la conversazione: la lista della chat (`TalosMobileMessageList`, con la sua colonna, il suo markdown e
 * le righe N13), la coda in streaming della chat (con la sorgente di r4 iniettata) e il compositore della chat.
 *
 * Fuori da K3-B2, per K3-C: approvazioni, scelta del modello, terminale, pannello di contesto, stato del giro, allegati.
 * K3-TERM (16/10): la vista Terminale e «Chat · Terminale» (ledger `LEDGER-K3-TERMINALE-2026-10-16.md`).
 */
import { computed, defineAsyncComponent, effectScope, nextTick, onBeforeUnmount, onMounted, provide, ref, shallowRef, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useTalosI18n } from '@/i18n'
import TalosMobileScreen from '@/components/shell/TalosMobileScreen.vue'
import TalosMobileMessageList from '@/components/chat/TalosMobileMessageList.vue'
import TalosMobileComposer from '@/components/chat/TalosMobileComposer.vue'
import TalosCodiceR4Header from '@/components/codice/TalosCodiceR4Header.vue'
import TalosCodiceR4AlberoSheet from '@/components/codice/TalosCodiceR4AlberoSheet.vue'
import TalosCodiceR4HookSheet from '@/components/codice/TalosCodiceR4HookSheet.vue'
import TalosCodiceR4DoctorSheet from '@/components/codice/TalosCodiceR4DoctorSheet.vue'
import TalosCodiceR4ComandiSheet, { type ComandoCodiceR4 } from '@/components/codice/TalosCodiceR4ComandiSheet.vue'
import TalosCodiceR4RinominaSheet from '@/components/codice/TalosCodiceR4RinominaSheet.vue'
import TalosCodiceR4ModoSheet from '@/components/codice/TalosCodiceR4ModoSheet.vue'
import TalosCodiceR4Pannello from '@/components/codice/TalosCodiceR4Pannello.vue'
import TalosMobileComposerSheet from '@/components/chat/TalosMobileComposerSheet.vue'
import TalosCodiceR4Terminale from '@/components/codice/TalosCodiceR4Terminale.vue'
import TalosCodiceR4Viste, { type VistaCodiceR4 } from '@/components/codice/TalosCodiceR4Viste.vue'
import TalosCodiceR4Revisione from '@/components/codice/TalosCodiceR4Revisione.vue'
import { numeroSchedaRevisioneR4 } from '@/lib/harness/r4/revisioneR4'
// K3-C Accoda: la striscia della coda, caricata a richiesta come nella chat (la coda esiste solo quando qualcuno ha accodato)
const TalosCodiceR4Coda = defineAsyncComponent(() => import('@/components/codice/TalosCodiceR4Coda.vue'))
// K3-C Esporta: lo stesso foglio di esportazione della chat, caricato a richiesta
const TalosMobileSessionExportSheet = defineAsyncComponent(() => import('@/components/chat/TalosMobileSessionExportSheet.vue'))
import { LARGHEZZA_VISTE_IN_TESTATA, testoTerminaleR4 } from '@/lib/harness/r4/terminaleR4'
import { testoFileR4 } from '@/lib/harness/r4/alberoR4'
import { conMenzioneR4 } from '@/lib/harness/r4/allegatiR4'
import { creaMemoriaPannelloR4 } from '@/lib/harness/r4/memoriaPannelloR4'
import { riassuntoSenzaChiedereR4, tonoPermessoR4 } from '@/lib/harness/r4/permessiR4'
import { testoPianoR4 } from '@/lib/harness/r4/pianoR4'
import { Keyboard } from '@capacitor/keyboard'
import { ArrowDown, ClipboardList, ShieldCheck, X } from '@lucide/vue'
import type { PluginListenerHandle } from '@capacitor/core'
import type { TalosAzioneMessaggio } from '@/components/chat/mobileChatTypes'
import { TALOS_SORGENTE_STREAMING, type TalosSorgenteStreaming } from '@/lib/chat/sorgenteStreaming'
import { TALOS_CLASSE_COLONNA_CHAT } from '@/lib/chat/colonnaChat'
import { shareTalosMessageMarkdown } from '@/lib/chat/messageShare'
import { talosClienteR4 } from '@/lib/harness/r4/clienteR4'
import { TALOS_APPROVAZIONI_R4 } from '@/lib/harness/r4/approvazioniPonte'
import { talosR4Pronto } from '@/lib/harness/terminalePonte'
import { ROTTA_RIPIEGO_R4 } from '@/lib/harness/r4/sceltaCodiceR4'
import { talosComposerFlags } from '@/lib/composerStyle'
import { resolveTalosDictationLanguageTag, talosRilevamentoAcceso } from '@/lib/dictationPolicy'
import { useConversazioneR4 } from '@/composables/useConversazioneR4'
import { createTalosChatLiveEdge } from '@/composables/useTalosChatLiveEdge'
import { useTalosMobileDictation } from '@/composables/useTalosMobileDictation'
import { useTalosSpeech } from '@/composables/useTalosSpeech'
import { useSettingsStore } from '@/stores/settings'
import { useChatController } from '@/stores/chatController'
import { getProviderKey } from '@/services/secureKeyStore'
import { clampMobileEffortFor } from '@/lib/mobileEffort'
import type { TalosMobileModelProfileView } from '@/components/chat/mobileChatTypes'
import {
    FORNITORI_DEL_CODICE_R4, fornitoreDelModelloR4, livelloDelRagionamentoR4, messaggioErroreModelloR4, modelloR4DelProfilo, profiloDelModelloR4,
    ragionamentoR4, sincronizzaFornitoreR4,
} from '@/lib/harness/r4/modelloR4'
import { useTalosMobileToasts } from '@/stores/toasts'
import type { TalosSorgenteEsportazione } from '@/lib/chat/sorgenteEsportazione'
import type { FormatoEsportazioneR4 } from '@/lib/harness/r4/trascrizioneR4'
import { Button } from '@/components/ui/button'
import { useAllegatiR4 } from '@/composables/useAllegatiR4'
import { TALOS_BYTE_IMMAGINE } from '@/lib/chat/byteImmagine'
import { bollaDaInviareR4, testoPerIlModelloR4 } from '@/lib/harness/r4/allegatiR4'
import { TALOS_MOBILE_PROVIDERS } from '@/lib/mobileProviders'
// la domanda sul consenso è quella della chat (`App.vue`), caricata solo quando serve
const TalosMobileConfirmDialog = defineAsyncComponent(() => import('@/components/shell/TalosMobileConfirmDialog.vue'))

const { t, locale } = useTalosI18n()
const route = useRoute()
const router = useRouter()
const settings = useSettingsStore()
const toasts = useTalosMobileToasts()

/** Solo ciò che r4 regge oggi: niente modifica, riprova, libreria, invia di nuovo, dettagli, elimina. */
const AZIONI_DEL_CODICE_R4: readonly TalosAzioneMessaggio[] = ['riutilizza', 'condividi']

const fase = ref<'avvio' | 'pronta' | 'assente'>('avvio')
const conversazione = shallowRef<ReturnType<typeof useConversazioneR4> | null>(null)
let scope = effectScope()
let cartellaDiLavoro = ''
const prompt = ref('')
/** K3-C2/K3-C3a: i fogli dell'header. */
const foglio = ref<'albero' | 'hook' | 'comandi' | 'rinomina' | 'doctor' | 'esporta' | 'modo' | null>(null)
/**
 * K3-C3b-1 (owner 15/10: «Foglio sul telefono, colonna sul tablet»): ▤ apre il pannello, foglio o colonna a destra della conversazione.
 * ⛔ K3-PAN840 (owner 15/10 sera: «Foglio se il Codice è stretto»): si decide dallo spazio VERO del Codice, non dalla finestra. Sul Pad
 * in verticale la finestra ha 914 px ma il Codice 654 (la barra laterale): con la colonna il campo del compositore scendeva a 109 px.
 * Colonna da 840 px (Android, window size classes «expanded» e canonical layouts: il pannello di supporto accanto solo lì), foglio
 * sotto. La riga si misura con un ResizeObserver: rotazione, barra laterale aperta o chiusa.
 */
const pannelloAperto = ref(false)
const LARGHEZZA_COLONNA_PANNELLO = 840
const riga = ref<HTMLDivElement | null>(null)
const largo = ref(false)
/**
 * K3-TERM T4 (owner 16/10, «Come il Codice vecchio»): con il Codice largo «Chat · Terminale» sono schede nella testata, con il Codice
 * stretto (fino a 780 px, `.mobile-nav` del Codice vecchio) una barra in basso sotto il compositore. Stessa misura della riga.
 */
const visteInTestata = ref(false)
const misuraLaRiga = () => {
    const larghezza = riga.value?.getBoundingClientRect().width ?? 0
    largo.value = larghezza >= LARGHEZZA_COLONNA_PANNELLO
    visteInTestata.value = larghezza > LARGHEZZA_VISTE_IN_TESTATA
}
/** K3-TERM T3: la vista. Il Terminale si monta la prima volta che lo si apre e poi resta vivo (la shell non si stacca cambiando vista). */
const vista = ref<VistaCodiceR4>('chat')
const terminaleMontato = ref(false)
function scegliVista(v: VistaCodiceR4): void {
    vista.value = v
    if (v === 'terminale') terminaleMontato.value = true
}
/** Con la tastiera aperta la barra delle viste si nasconde: resta lo spazio per il terminale e la sua barra dei tasti. */
const tastieraAperta = ref(false)
const ascoltiTastiera: PluginListenerHandle[] = []
let montata = true
async function ascoltaTastiera(): Promise<void> {
    const registrazioni = [
        () => Keyboard.addListener('keyboardWillShow', () => { tastieraAperta.value = true }),
        () => Keyboard.addListener('keyboardWillHide', () => { tastieraAperta.value = false }),
    ]
    for (const registra of registrazioni) {
        try {
            const h = await registra()
            if (montata) ascoltiTastiera.push(h)
            else await h.remove()
        } catch { /* nel browser non c'è: la barra resta */ }
    }
}
let osservatoreRiga: ResizeObserver | null = null
watch(riga, (el) => {
    osservatoreRiga?.disconnect()
    osservatoreRiga = null
    if (!el) return
    if (typeof ResizeObserver === 'function') {
        osservatoreRiga = new ResizeObserver(misuraLaRiga)
        osservatoreRiga.observe(el)
    }
    misuraLaRiga()
}, { flush: 'post' })
/** A ogni giro finito il pannello rilegge politica di compattazione e riuso della cache. */
const giriFiniti = computed(() => conversazione.value?.pannello.value.giri.filter((g) => !g.tu && !g.inCorso).length ?? 0)
const composer = ref<InstanceType<typeof TalosMobileComposer> | null>(null)
const scorrimento = ref<HTMLDivElement | null>(null)
const dock = ref<HTMLDivElement | null>(null)

const messaggi = computed(() => conversazione.value?.messaggi.value ?? [])
const sending = computed(() => conversazione.value?.sorgente.sending.value ?? false)
const errore = computed(() => conversazione.value?.errore.value ?? null)
// K3-C Scelta del modello: i rifiuti legati al modello (la chiave che manca, il nome, il livello) con le parole del desktop
const testoErrore = computed(() => (errore.value ? messaggioErroreModelloR4(errore.value, locale.value) : ''))

/*
 * ⛔ K3 piano (ledger `LEDGER-K3-PIANO-2026-10-17.md`; owner 17/10 «Nel piede del compositore»): la pillola del permesso accanto al
 * modello dice ciò che passa senza chiedere (`riassuntoSenzaChiedere`, `chat-foot.js:134` del desktop r4 @ 701c6c0d2), in Piano «Piano:
 * solo lettura», e apre il foglio del modo e del permesso. Senza sessione il permesso è quello che r4 darà alla prima richiesta,
 * `Workspace write` (`session-registry.mjs:7203`), finché la persona non ne sceglie un altro dal foglio.
 */
const PERMESSO_DI_SERIE_R4 = 'Workspace write'
const modalita = computed(() => conversazione.value?.modalita.value ?? 'normale')
const permessoVisto = computed(() => conversazione.value?.politica.value.permessi ?? (conversazione.value?.sessioneId.value ? null : PERMESSO_DI_SERIE_R4))
const riassuntoPermesso = computed(() => riassuntoSenzaChiedereR4(permessoVisto.value, conversazione.value?.politica.value.perAttrezzo ?? {}, { modalitaOperativa: modalita.value }, locale.value))
const tonoPermesso = computed(() => tonoPermessoR4(permessoVisto.value))
const nomePillolaPermesso = computed(() => [riassuntoPermesso.value.testo, ...riassuntoPermesso.value.suggerimento.split('\n')].join('. '))
const scegliModo = (m: 'normale' | 'piano') => conversazione.value?.impostaModo(m) ?? Promise.resolve({ ok: false as const, messaggio: '' })
const scegliPermesso = (p: string) => conversazione.value?.impostaPermesso(p) ?? Promise.resolve({ ok: false as const, messaggio: '' })
// K3 Coordinazione: lo stato della catena e l'interruttore (fermo senza sessione e in un agente delegato)
const coordinazione = computed(() => ({ ...(conversazione.value?.coordinazione.value ?? { accesa: false, delega: false, conosciuta: true }), sessione: Boolean(conversazione.value?.sessioneId.value) }))
const scegliCoordinazione = (accesa: boolean) => conversazione.value?.impostaCoordinazione(accesa) ?? Promise.resolve({ ok: false as const, messaggio: '' })
/** La fascia «Piano attivo dal prossimo giro» (`PlanModeReadyNotice`): il modello ha chiesto il Piano, il giro che lo usa non è partito. */
const pianoRichiesto = computed(() => conversazione.value?.pianoRichiesto.value === true && modalita.value === 'piano')
/**
 * L'avviso «Il piano è stato aggiornato (revisione n)» (`mostraAvvisoPiano`, `legacy/app.js:23787`): la carta del piano resta dov'è e
 * si aggiorna; dal vivo, se è fuori vista, questa riga porta lì. Si spegne quando la carta è in vista per almeno il 60 %: l'osservatore
 * si aggancia al primo scorrimento (un controllo subito cadrebbe prima del disegno del testo che arriva).
 */
const avvisoPiano = ref<{ planId: string; revision: number } | null>(null)
let osservatorePiano: IntersectionObserver | null = null
const cartaDelPiano = (planId: string) => scorrimento.value?.querySelector<HTMLElement>(`[data-piano-id=${JSON.stringify(planId)}]`) ?? null
function chiudiAvvisoPiano(): void {
    osservatorePiano?.disconnect()
    osservatorePiano = null
    avvisoPiano.value = null
}
function osservaCartaDelPiano(): void {
    osservatorePiano?.disconnect()
    osservatorePiano = null
    const avviso = avvisoPiano.value
    const contenitore = scorrimento.value
    if (!avviso || !contenitore || typeof IntersectionObserver !== 'function') return
    const osservatore = new IntersectionObserver((voci) => { if (voci.some((v) => v.intersectionRatio >= 0.6)) chiudiAvvisoPiano() }, { root: contenitore, threshold: [0.6] })
    osservatorePiano = osservatore
    contenitore.addEventListener('scroll', () => {
        const carta = cartaDelPiano(avviso.planId)
        if (osservatorePiano === osservatore && carta) osservatore.observe(carta)
    }, { once: true, passive: true })
}
function vaiAlPiano(): void {
    const carta = avvisoPiano.value ? cartaDelPiano(avvisoPiano.value.planId) : null
    chiudiAvvisoPiano()
    if (!carta) return
    bordoVivo.followLive.value = false // la persona naviga: il bordo vivo non la riporta giù
    carta.scrollIntoView({ block: 'center', behavior: 'auto' })
    carta.focus({ preventScroll: true })
}
watch(() => conversazione.value?.revisioneDalVivo.value ?? null, (r) => {
    if (!r) return
    avvisoPiano.value = { planId: r.planId, revision: r.revision }
    void nextTick(osservaCartaDelPiano)
})
onBeforeUnmount(chiudiAvvisoPiano)

/** La coda in streaming della chat legge il giro di r4 (vedi `sorgenteStreaming.ts`). */
const sorgente: TalosSorgenteStreaming = {
    sending,
    testo: computed(() => conversazione.value?.sorgente.testo.value ?? ''),
    ragionamento: computed(() => conversazione.value?.sorgente.ragionamento.value ?? ''),
    confini: computed(() => conversazione.value?.sorgente.confini.value ?? []),
    attivi: computed(() => conversazione.value?.sorgente.attivi.value ?? []),
}
provide(TALOS_SORGENTE_STREAMING, sorgente)
/** K3-AP1: la carta d'approvazione nella conversazione risponde a r4 da qui (politica della sessione e `POST /approve`). */
provide(TALOS_APPROVAZIONI_R4, {
    politica: () => conversazione.value?.politica.value ?? { permessi: null, perAttrezzo: {} },
    leggiPolitica: async () => { await conversazione.value?.leggiPolitica() },
    rispondi: async (requestId, scelta, tipo, figlia) => (conversazione.value
        ? conversazione.value.rispondiApprovazione(requestId, scelta, tipo, figlia) : { ok: false, sempreNonSalvato: false }),
    // K3-AP2: la carta delle domande di TALOS
    rispondiDomanda: async (corpo, figlia) => (conversazione.value
        ? conversazione.value.rispondiDomanda(corpo, figlia) : { ok: false, stato: null, codice: null, messaggio: 'no session' }),
    /* K3 piano: la scelta sulla carta del piano. ⛔ Pad 17/10 (CPI-08): partita la scelta si torna in fondo, come un messaggio mandato
       dal compositore (SCR4-19): il campo della correzione apre la tastiera, la pagina scorre e il bordo vivo si staccava, così la
       revisione arrivava con la carta mezza sotto il compositore. */
    decidiPiano: async (corpo) => {
        if (!conversazione.value) return { ok: false, errore: null }
        const esito = await conversazione.value.decidiPiano(corpo)
        if (esito.ok) tornaInFondo()
        return esito
    },
    sessioneId: () => conversazione.value?.sessioneId.value ?? null,
    giroInCorso: () => (conversazione.value?.storiaFinita.value ? conversazione.value.inCorso.value !== null : null),
    // K3-AP3: il nome dell'agente sulla carta di una sotto-sessione la apre (dichiarata più sotto: si chiama solo al tocco)
    apriFiglia: (id) => apriDelega(id),
})

const idDallaRotta = (): string | null => (typeof route.params.id === 'string' && route.params.id ? route.params.id : null)

/** Pad 16/10: la memoria del pannello ▤ (scheda, cartelle aperte, file scelti), una per sessione: la rotazione non la perde. */
const memoriaPannello = shallowRef(creaMemoriaPannelloR4())
/** Apre la conversazione di `id` (o una nuova). Quella di prima si chiude col suo scope: flusso chiuso, ascoltatori tolti. */
async function apriSessione(id: string | null): Promise<void> {
    scope.stop()
    scope = effectScope()
    prompt.value = ''
    memoriaPannello.value = creaMemoriaPannelloR4()
    allegati.svuota()
    conversazione.value = scope.run(() => useConversazioneR4({
        cliente: talosClienteR4(), cartella: cartellaDiLavoro, sessioneId: id,
        // K3-C Scelta del modello (owner 16/10 «alla scelta e a ogni invio»): la chiave dell'app in r4 prima di ogni giro
        primaDiInviare: (modello) => sincronizzaFornitore(fornitoreDelModelloR4(modello)),
    })) ?? null
    if (!id) await sceltaPerLaSessioneNuova()
    await conversazione.value?.apri()
}

onMounted(async () => {
    void ascoltaTastiera()
    const stato = await talosR4Pronto()
    if (!stato) {
        fase.value = 'assente'
        // K4-E (owner 17/10 «il vecchio come ripiego»): si torna al Codice vecchio dicendolo, con `ripiego=1` perché la voce «Codice»
        // non rimandi di nuovo qui. Nel web e nelle build senza r4 la voce «Codice» non arriva nemmeno qui.
        toasts.push({ message: t('harness.r4Fallback'), durationMs: 6000 })
        void router.replace(ROTTA_RIPIEGO_R4)
        return
    }
    cartellaDiLavoro = stato.cartella
    fase.value = 'pronta'
    await apriSessione(idDallaRotta())
})

// La sessione appena creata entra nell'indirizzo: ricaricando si riapre la stessa conversazione.
watch(() => conversazione.value?.sessioneId.value ?? null, (id) => {
    if (id && route.params.id !== id) void router.replace({ name: 'codice-r4', params: { id } })
})

// K3-C2: una delega aperta dall'albero cambia la sessione nella rotta; la schermata la segue.
watch(() => route.params.id, () => {
    const id = idDallaRotta()
    if (fase.value !== 'pronta' || id === (conversazione.value?.sessioneId.value ?? null)) return
    foglio.value = null
    void apriSessione(id)
})

function apriDelega(id: string): void {
    foglio.value = null
    void router.push({ name: 'codice-r4', params: { id } })
}
/** K3-C3b-2b: dalla scheda Agenti. Sul telefono il foglio del pannello si chiude (sul tablet la colonna resta). */
/**
 * K3-C Allegati A1 (owner 16/10), «Allega alla chat» come il desktop (`allegaFileAllaChat`, `legacy/app.js:20218`): ogni file entra nel
 * campo come `@percorso `, il fuoco va al campo e l'avviso lo dice. Sul telefono il foglio ▤ si chiude (il campo è sotto); sul tablet la
 * colonna resta. Dal Terminale si torna alla chat, dove sta il campo.
 */
function allegaAllaChat(percorsi: string[]): void {
    if (!percorsi.length) return
    prompt.value = percorsi.reduce((testo, percorso) => conMenzioneR4(testo, percorso), prompt.value)
    if (!largo.value) pannelloAperto.value = false
    if (vista.value !== 'chat') scegliVista('chat')
    toasts.push({ message: `${testoFileR4('app.files.attachedToChat', locale.value)} · ${percorsi.join(', ')}`, durationMs: 5000 })
    void nextTick(() => composer.value?.focusPrompt(true))
}
/**
 * K3 Revisione: «Apri il file» della Review apre il pannello ▤ sulla scheda File con l'anteprima di quel file (lo stesso visualizzatore
 * dell'albero, come `apriFileAlbero` del desktop).
 */
function apriFileDallaRevisione(percorso: string): void {
    memoriaPannello.value.scheda.value = 'file'
    memoriaPannello.value.file.daAprire.value = percorso
    pannelloAperto.value = true
}
/** K3 Revisione: il numero sulla scheda «Review» (i file scritti); niente mentre la storia si carica, come la testata del desktop. */
const fileRevisione = computed(() => (conversazione.value
    ? numeroSchedaRevisioneR4(conversazione.value.pannello.value.file, conversazione.value.storiaFinita.value) : null))
function apriDelegaDalPannello(id: string): void {
    if (!largo.value) pannelloAperto.value = false
    apriDelega(id)
}

/** K3-C3a: un comando della tavolozza. */
async function eseguiComando(comando: ComandoCodiceR4): Promise<void> {
    foglio.value = null
    const c = conversazione.value
    switch (comando) {
        case 'nuova': void router.push({ name: 'codice-r4' }); break
        case 'rinomina': foglio.value = 'rinomina'; break
        case 'duplica': {
            const id = await c?.duplica()
            if (id) void router.push({ name: 'codice-r4', params: { id } })
            break
        }
        case 'riprendi': void c?.riprendi(); break
        case 'compatta': void compattaIlContesto(); break
        case 'albero': foglio.value = 'albero'; break
        case 'hook': foglio.value = 'hook'; break
        case 'doctor': foglio.value = 'doctor'; break
        case 'esporta': foglio.value = 'esporta'; break
        case 'condividi': void condividiSessione(); break
    }
}

/*
 * ⛔ K3-C Esporta e Condividi (ledger `LEDGER-K3-ESPORTA-CONDIVIDI-2026-10-17.md`; owner 17/10): «Esporta» apre il foglio della chat
 * coi due formati del desktop r4 (la trascrizione Markdown di `costruisciTrascrizioneMarkdown` e il JSON grezzo di `/export`), con
 * le sue tre consegne (copia, foglio di Android, Libreria). «Condividi» manda la trascrizione Markdown con un tocco.
 */
async function artefattoDellaSessione(formato: FormatoEsportazioneR4) {
    const esito = await conversazione.value?.esporta()
    if (!esito) throw new Error(t('harness.r4Unavailable'))
    if (!esito.ok) throw Object.assign(new Error(esito.errore.message), { errore: esito.errore })
    const { artefattoEsportazioneR4 } = await import('@/lib/harness/r4/trascrizioneR4')
    return artefattoEsportazioneR4(esito.dati, formato, locale.value)
}
const sorgenteEsportazione = computed<TalosSorgenteEsportazione>(() => ({
    intestazione: t('harness.r4ExportTitle'),
    titolo: conversazione.value?.titolo.value || t('harness.r4Title'),
    dettaglio: t('harness.r4ExportIntro'),
    formati: [
        { format: 'markdown', label: t('export.markdownLabel'), action: t('export.markdownAction'), detail: t('harness.r4ExportMarkdownDetail') },
        { format: 'json', label: t('harness.r4ExportJsonLabel'), action: t('harness.r4ExportJsonAction'), detail: t('harness.r4ExportJsonDetail') },
    ],
    genera: (formato) => artefattoDellaSessione(formato === 'json' ? 'json' : 'markdown'),
}))
async function condividiSessione(): Promise<void> {
    const conv = conversazione.value
    if (!conv) return
    conv.errore.value = null
    let artefatto
    try {
        artefatto = await artefattoDellaSessione('markdown')
    } catch (guasto) {
        const errore = (guasto as { errore?: { code: string; message: string } }).errore
        conv.errore.value = errore ?? { code: 'TALOS_R4_ESPORTA', message: guasto instanceof Error ? guasto.message : String(guasto) }
        return
    }
    try {
        const { deliverTalosSessionExport } = await import('@/services/sessionExportDelivery')
        await deliverTalosSessionExport({ fileName: artefatto.fileName, content: artefatto.content, contentType: artefatto.contentType })
    } catch (guasto) {
        const messaggio = guasto instanceof Error ? guasto.message : String(guasto)
        // chi chiude il foglio di Android senza scegliere non ha sbagliato niente
        if (!/cancel/iu.test(messaggio)) conv.errore.value = { code: 'TALOS_R4_CONDIVIDI', message: messaggio }
    }
}

async function salvaNome(nome: string): Promise<void> {
    if (await conversazione.value?.rinomina(nome)) foglio.value = null
}

/** La forma del compositore della chat (`ChatScreen.vue:154`): stesse preferenze, stessa forma. */
const forma = computed(() => talosComposerFlags(settings.state.shell.composer_shape, settings.state.shell.composer_plus))

/*
 * La dettatura, filo per filo come la chat e il Codice di oggi (`HarnessSessionScreen.vue:252-292`): il dettato si compone
 * sulla bozza presa all'avvio, la lingua viene dalle impostazioni della voce, chi parla tace prima di ascoltare.
 */
const bozzaPrimaDelDettato = ref('')
const dettatura = useTalosMobileDictation({
    motoreLocale: true,
    base: () => prompt.value,
    onTranscript: (testo) => { prompt.value = testo },
    language: () => resolveTalosDictationLanguageTag(settings.state.voice.dictation_language),
    autoLanguage: () => talosRilevamentoAcceso(settings.state.voice.dictation_language),
    zittisci: () => useTalosSpeech().stop('il Codice apre il microfono'),
    errorMessage: (code) => t(`chat.dictationErrors.${code}`),
    onFallback: () => toasts.push({ message: t('chat.dictationLocalFallback'), durationMs: 6000 }),
})
/** Solo il pezzo NUOVO, come in chat: la bozza è nascosta dalla barra mentre si parla. */
const trascrizioneViva = computed(() => {
    const ora = prompt.value
    const prima = bozzaPrimaDelDettato.value
    return ora.startsWith(prima) ? ora.slice(prima.length).trim() : ora.trim()
})
async function alternaDettatura(): Promise<void> {
    if (dettatura.status.value === 'idle') bozzaPrimaDelDettato.value = prompt.value
    await dettatura.toggle()
}
function buttaDettatura(): void {
    dettatura.cancel()
    prompt.value = bozzaPrimaDelDettato.value
}
async function inviaDettatura(): Promise<void> {
    await dettatura.finisci()
    await nextTick()
    await invia()
}

/*
 * ⛔ K3-C Allegati A2/A3 (ledger `LEDGER-K3-ALLEGATI-2026-10-16.md`; owner 16/10): le immagini della galleria e della fotocamera e i
 * file dal telefono, nel vassoio della chat. Le immagini vanno in r4 (`immagini: [{id}]`), i file li scrive il nativo in `allegati/`
 * (la riga per il modello, col testo se è un file di testo); la bolla quando ciò che la persona vede è diverso dal testo per il
 * modello. Il consenso delle immagini è quello della chat, col nome del fornitore del modello del Codice.
 */
const allegati = useAllegatiR4({
    cliente: talosClienteR4,
    fotocamera: async () => (await import('@/services/nativeCamera')).createTalosNativeCamera(),
    selettoreFile: async () => (await import('@/services/nativeFilePicker')).createNativeFilePicker(),
    consenso: () => settings.state.shell.image_attachment_consent ?? 'ask',
    ricordaSempre: async () => { await settings.setShell({ image_attachment_consent: 'allow' }).catch(() => undefined) },
    fornitore: () => {
        const id = fornitoreDelModelloR4(conversazione.value?.modello.value)
        return { id, nome: TALOS_MOBILE_PROVIDERS.find((p) => p.id === id)?.label ?? t('chat.imageConsentProviderUnknown') }
    },
    lingua: () => locale.value,
    t: (chiave) => t(chiave),
})
provide(TALOS_BYTE_IMMAGINE, allegati.lettore)

/** Il messaggio con gli allegati pronti: il testo per il modello (inglese) e, se diverso da ciò che si vede, la bolla. */
function messaggioConAllegati(scritto: string) {
    const { voci, immagini: perR4 } = allegati.pronte()
    if (!voci.length) return { testo: scritto, extra: {} }
    const testo = testoPerIlModelloR4(scritto, voci)
    return { testo, extra: { immagini: perR4, bolla: bollaDaInviareR4(scritto, testo, voci) } }
}

async function invia(): Promise<void> {
    const scritto = prompt.value
    if (!conversazione.value || (!scritto.trim() && !allegati.pronte().voci.length)) return
    if (!(await allegati.puoPartire())) return
    const { testo, extra } = messaggioConAllegati(scritto)
    prompt.value = ''
    tornaInFondo()
    const partito = await conversazione.value.invia(testo, extra)
    if (partito) allegati.svuota()
    else if (!prompt.value) prompt.value = scritto
}

/*
 * ⛔ K3-C Scelta del modello (ledger `LEDGER-K3-MODELLO-2026-10-16.md`; owner 16/10): la stessa pastiglia e lo stesso foglio della
 * chat, coi profili che la chat ha già caricato (letti, mai cambiati: la chat aperta resta la sua). Il modello e il livello li dice
 * r4: la pastiglia cambia solo dopo che `/settings` li ha accettati (come il desktop, `legacy/app.js:7600`, e Hermes).
 *   · fuori dal Codice il motore dentro l'app e il piano ChatGPT: r4 non li raggiunge, e la frase lo dice nel foglio;
 *   · la chiave è una sola, quella dell'app: passa in r4 alla scelta e prima di ogni invio; se l'app non l'ha, in r4 si toglie;
 *   · il livello resta se il modello nuovo lo regge, altrimenti il più vicino (`clampMobileEffortFor`, lo stesso della chat);
 *   · una sessione nuova parte dall'ultima scelta del Codice (`codice_model`, owner 23/09), la prima volta da quella della chat.
 */
const chat = useChatController()
const profiliDelCodice = computed(() => chat.profiles.value.filter((p) => FORNITORI_DEL_CODICE_R4.has(p.provider)))
const profiloScelto = computed(() => profiloDelModelloR4(conversazione.value?.modello.value, profiliDelCodice.value))
const profiliNelFoglio = computed<TalosMobileModelProfileView[]>(() => (profiloScelto.value && !profiliDelCodice.value.includes(profiloScelto.value)
    ? [profiloScelto.value, ...profiliDelCodice.value] : profiliDelCodice.value))
const livelloScelto = computed(() => livelloDelRagionamentoR4(conversazione.value?.ragionamento.value))
const problemiDeiModelli = computed(() => [
    ...chat.discoveryProblems.value,
    ...(chat.profiles.value.some((p) => !FORNITORI_DEL_CODICE_R4.has(p.provider)) ? [{ message: t('harness.r4ModelsUnavailable') }] : []),
])

async function sincronizzaFornitore(fornitore: string | null): Promise<void> {
    if (!fornitore || !FORNITORI_DEL_CODICE_R4.has(fornitore as TalosMobileModelProfileView['provider'])) return
    const chiave = await getProviderKey(fornitore).catch(() => null)
    const indirizzo = (chat.endpoints as Record<string, string | null | undefined>)[fornitore] ?? null
    await sincronizzaFornitoreR4(talosClienteR4(), fornitore, { chiave, indirizzo })
}
function rifiutoNellaRiga(guasto: unknown): void {
    const code = typeof (guasto as { code?: unknown })?.code === 'string' ? (guasto as { code: string }).code : 'TALOS_R4_FORNITORE'
    if (conversazione.value) conversazione.value.errore.value = { code, message: guasto instanceof Error ? guasto.message : String(guasto) }
}

/** La sessione nuova: l'ultima scelta del Codice se r4 la può usare, altrimenti quella della chat; senza nessuna, decide r4. */
async function sceltaPerLaSessioneNuova(): Promise<void> {
    const conv = conversazione.value
    if (!conv || conv.sessioneId.value || conv.modello.value) return
    const profili = profiliDelCodice.value
    const profilo = profili.find((p) => p.id === settings.state.shell.codice_model) ?? profili.find((p) => p.id === chat.selectedModelId.value)
    const modello = profilo ? modelloR4DelProfilo(profilo) : null
    if (!profilo || !modello) return
    const livello = clampMobileEffortFor(profilo, settings.state.shell.codice_effort ?? chat.effort.value)
    await conv.impostaModello(modello, ragionamentoR4(livello))
}
// i profili della chat arrivano dopo l'avvio: la sessione nuova sceglie appena ci sono
watch(() => profiliDelCodice.value.length, () => { void sceltaPerLaSessioneNuova() })

async function scegliModello(id: string): Promise<void> {
    const conv = conversazione.value
    const profilo = profiliNelFoglio.value.find((p) => p.id === id)
    const modello = profilo ? (modelloR4DelProfilo(profilo) ?? (profilo.id === `r4:${profilo.model}` ? profilo.model : null)) : null
    if (!conv || !profilo || !modello) return
    const livello = profilo.effort_levels.length ? clampMobileEffortFor(profilo, livelloScelto.value) : livelloScelto.value
    try {
        await sincronizzaFornitore(fornitoreDelModelloR4(modello))
    } catch (guasto) {
        rifiutoNellaRiga(guasto)
        return
    }
    if (!(await conv.impostaModello(modello, ragionamentoR4(livello)))) return
    void settings.setShell({ codice_model: profilo.id, codice_effort: livello }).catch(() => undefined)
}
async function scegliLivello(livello: string): Promise<void> {
    const conv = conversazione.value
    if (!conv || !(await conv.impostaRagionamento(ragionamentoR4(livello)))) return
    void settings.setShell({ codice_effort: livello }).catch(() => undefined)
}

/**
 * K3-C Accoda: a giro vivo il testo va nella coda di r4 (`POST /queue`), come «Accoda» della chat (`ChatScreen` `onQueue`): il
 * campo si svuota subito; se r4 rifiuta, il testo torna nel campo e il motivo sta nella riga d'errore.
 */
const puoAccodare = computed(() => Boolean(conversazione.value?.sessioneId.value) && sending.value)
async function accoda(scritto: string): Promise<void> {
    if (!conversazione.value || (!scritto.trim() && !allegati.pronte().voci.length)) return
    if (!(await allegati.puoPartire())) return
    const { testo, extra } = messaggioConAllegati(scritto)
    prompt.value = ''
    tornaInFondo()
    const accodato = await conversazione.value.accoda(testo, extra)
    if (accodato) { allegati.svuota(); return }
    if (!prompt.value) prompt.value = scritto
    await nextTick()
    composer.value?.focusPrompt(true)
}
/**
 * «Modifica» di una voce in coda (owner 16/10: riporta nel compositore, come Hermes `beginQueuedEdit`). Una bozza già scritta non
 * si perde: il testo riportato va davanti.
 */
async function riportaDallaCoda(id: string): Promise<void> {
    const testo = await conversazione.value?.riportaDallaCoda(id)
    if (!testo) return
    prompt.value = prompt.value.trim() ? `${testo}\n\n${prompt.value}` : testo
    await nextTick()
    composer.value?.focusPrompt(true)
}

/** K3-C1, «Compatta il contesto» dal menu dell'header: com'è andata lo dice un avviso; un rifiuto di r4 va nella riga d'errore. */
async function compattaIlContesto(): Promise<void> {
    const esito = await conversazione.value?.compatta()
    if (!esito) return
    toasts.push({ message: esito.compattato ? t('harness.r4Compacted') : t('harness.r4NothingToCompact'), durationMs: 4000 })
}

function riutilizza(messageId: string): void {
    const messaggio = messaggi.value.find((m) => m.id === messageId)
    if (!messaggio || messaggio.role !== 'user') return
    prompt.value = messaggio.content
    void nextTick(() => composer.value?.focusPrompt())
}

function condividi(messageId: string): void {
    const messaggio = messaggi.value.find((m) => m.id === messageId)
    if (!messaggio || messaggio.content.trim() === '') return
    void shareTalosMessageMarkdown(messaggio.content, t('chat.shareMessageTitle')).catch(() => undefined)
}

// Come la chat: chi è in fondo resta in fondo mentre la risposta cresce; chi è salito a rileggere non viene tirato giù.
// ⛔ K3-SCR (misurato sul Pad il 15/10): il markdown si compone DOPO lo scorrimento (1330 → 2442 px) e l'ancoraggio del browser
// lasciava la sessione a metà. Lo stesso bordo vivo della chat (si stacca solo il dito che sale) e un osservatore sul contenuto.
const bordoVivo = createTalosChatLiveEdge()
function suScorrimento(): void {
    const el = scorrimento.value
    if (el) bordoVivo.onScroll({ scrollTop: el.scrollTop, scrollHeight: el.scrollHeight, clientHeight: el.clientHeight })
}
function inFondo(): void {
    const el = scorrimento.value
    if (!el) return
    // ⛔ Pad 17/10 (CPI-09): staccati, il contenuto che cresce senza scorrimento (una carta aggiornata sul posto) non mandava eventi,
    // e la pillola «torna in fondo» restava spenta a 380 px dal fondo. Si ricalcola con le misure di adesso.
    if (!bordoVivo.canAutoScroll()) { suScorrimento(); return }
    bordoVivo.markAutoScroll(Math.max(0, el.scrollHeight - el.clientHeight))
    el.scrollTop = el.scrollHeight
}
/**
 * ⛔ Owner 17/10 («quando invio una domanda la risposta passa sotto il composer … come fa la chat»; SCR4-19, misurato sul Pad: chi
 * era salito a rileggere e mandava una domanda restava fermo per tutto il giro). Come la chat (`rejoinLiveEdge`, «sending your own
 * message always snaps to the bottom»): il proprio messaggio riaggancia il bordo vivo e torna in fondo, e la pillola fa lo stesso.
 */
function tornaInFondo(): void {
    bordoVivo.rejoin()
    inFondo()
}
watch([() => messaggi.value.length, () => sorgente.testo.value.length, () => sorgente.ragionamento.value.length], () => {
    void nextTick(inFondo)
})
let osservatoreContenuto: ResizeObserver | null = null
watch([scorrimento, () => messaggi.value.length], ([el]) => {
    osservatoreContenuto?.disconnect()
    osservatoreContenuto = null
    const contenuto = el?.firstElementChild
    if (!el || !contenuto || typeof ResizeObserver !== 'function') return
    osservatoreContenuto = new ResizeObserver(inFondo)
    osservatoreContenuto.observe(contenuto)
    // anche lo scorrimento: la colonna ▤ che si apre restringe la conversazione e la allunga
    osservatoreContenuto.observe(el)
}, { flush: 'post' })

// Lo spazio sotto la conversazione è l'altezza vera del compositore (barra di navigazione compresa), come nel Codice di oggi.
let osservatore: ResizeObserver | null = null
function misuraIlCompositore(): void {
    const el = dock.value
    if (!el) return
    const rettangolo = el.getBoundingClientRect()
    const spazio = rettangolo.height > 0 ? Math.max(0, Math.ceil(window.innerHeight - rettangolo.top)) : 0
    // K3-TERM T4: sotto la conversazione c'è il compositore, non la barra delle viste (che sta fuori dallo scorrimento)
    const fondo = scorrimento.value?.getBoundingClientRect().bottom ?? 0
    const sopra = rettangolo.height > 0 && fondo > 0 ? Math.max(0, Math.ceil(fondo - rettangolo.top)) : spazio
    scorrimento.value?.style.setProperty('--talos-codice-r4-spazio', `${sopra + 12}px`)
    if (spazio > 0) document.documentElement.style.setProperty('--talos-code-composer-height', `${spazio}px`)
    // ⛔ SCR4-16 (Pad 16/10): un dock più basso (la striscia della coda che sparisce, la tastiera che si chiude) accorcia lo spazio e
    // il browser abbassa lo scorrimento da sé: senza tornare in fondo qui, come la chat (`heightObserver`), il bordo vivo lo
    // prendeva per il dito che sale e si staccava. Chi era salito a rileggere resta dov'è: `inFondo` guarda il bordo vivo.
    inFondo()
}
watch(dock, (el) => {
    osservatore?.disconnect()
    osservatore = null
    if (!el) return
    if (typeof ResizeObserver === 'function') {
        osservatore = new ResizeObserver(misuraIlCompositore)
        osservatore.observe(el)
    }
    misuraIlCompositore()
}, { flush: 'post' })

onBeforeUnmount(() => {
    montata = false
    for (const h of ascoltiTastiera.splice(0)) void h.remove()
    osservatoreRiga?.disconnect()
    osservatore?.disconnect()
    osservatoreContenuto?.disconnect()
    document.documentElement.style.removeProperty('--talos-code-composer-height')
    scope.stop()
})
</script>

<template>
    <TalosMobileScreen
        :title="t('harness.r4Title')"
        data-testid="talos-codice-r4-screen"
        class="bg-[var(--talos-window-bg)]"
        :data-sessione="conversazione?.sessioneId.value ?? ''"
        tablet-edge-to-edge
        edge-to-edge
        embedded
    >
        <p v-if="fase === 'avvio'" data-testid="talos-codice-r4-avvio" role="status" :class="TALOS_CLASSE_COLONNA_CHAT" class="py-4 text-sm text-[var(--talos-muted)]">
            {{ t('harness.r4Starting') }}
        </p>
        <p v-else-if="fase === 'assente'" data-testid="talos-codice-r4-assente" role="status" :class="TALOS_CLASSE_COLONNA_CHAT" class="py-4 text-sm text-[var(--talos-muted)]">
            {{ t('harness.r4Unavailable') }}
        </p>
        <div v-else class="flex h-full flex-col">
            <TalosCodiceR4Header
                :titolo="conversazione?.titolo.value || t('harness.r4Title')"
                :occupato="sending"
                @indietro="void router.push({ name: 'harness' })"
                @riprendi="void conversazione?.riprendi()"
                @compatta="void compattaIlContesto()"
                @dettagli="foglio = 'albero'"
                @hook="foglio = 'hook'"
                @doctor="foglio = 'doctor'"
                @esporta="foglio = 'esporta'"
                @condividi="void condividiSessione()"
                :con-sessione="!!conversazione?.sessioneId.value"
                @comandi="foglio = 'comandi'"
                :pannello-aperto="pannelloAperto"
                @pannello="pannelloAperto = !pannelloAperto"
            >
                <template #viste>
                    <TalosCodiceR4Viste v-if="visteInTestata" :vista="vista" forma="schede" :file-revisione="fileRevisione" @scegli="scegliVista" />
                </template>
            </TalosCodiceR4Header>
            <TalosCodiceR4ComandiSheet
                v-if="foglio === 'comandi'"
                :con-sessione="!!conversazione?.sessioneId.value"
                :occupato="sending"
                @comando="(c) => void eseguiComando(c)"
                @close="foglio = null"
            />
            <TalosCodiceR4RinominaSheet
                v-if="foglio === 'rinomina' && conversazione"
                :titolo="conversazione.titolo.value"
                @salva="(n) => void salvaNome(n)"
                @close="foglio = null"
            />
            <TalosCodiceR4AlberoSheet
                v-if="foglio === 'albero' && conversazione"
                :titolo="conversazione.titolo.value || t('harness.r4Title')"
                :carica="conversazione.figli"
                @apri="apriDelega"
                @close="foglio = null"
            />
            <TalosCodiceR4HookSheet
                v-if="foglio === 'hook' && conversazione"
                :carica="conversazione.hook"
                :fida="conversazione.fidaHook"
                @close="foglio = null"
            />
            <TalosMobileSessionExportSheet
                v-if="foglio === 'esporta' && conversazione"
                :sorgente="sorgenteEsportazione"
                @close="foglio = null"
            />
            <TalosCodiceR4ModoSheet
                v-if="foglio === 'modo' && conversazione"
                :modalita="modalita"
                :permesso="permessoVisto"
                :riassunto="riassuntoPermesso"
                :giro-in-corso="sending"
                :scegli-modo="scegliModo"
                :scegli-permesso="scegliPermesso"
                :coordinazione="coordinazione"
                :scegli-coordinazione="scegliCoordinazione"
                @close="foglio = null"
            />
            <TalosCodiceR4DoctorSheet
                v-if="foglio === 'doctor' && conversazione"
                :carica="conversazione.doctor"
                @close="foglio = null"
            />
            <TalosMobileComposerSheet
                v-if="pannelloAperto && !largo && conversazione"
                :title="t('harness.r4Panel')"
                testid="talos-codice-r4-pannello-foglio"
                @close="pannelloAperto = false"
            >
                <TalosCodiceR4Pannello
                    :pannello="conversazione.pannello.value"
                    :carica-politica="conversazione.politicaCompattazione"
                    :carica-cache="conversazione.cacheSessione"
                    :giri-finiti="giriFiniti"
                    :azione-processo="conversazione.azioneProcesso"
                    :carica-risorse="conversazione.risorseProcessi"
                    :carica-sessioni="conversazione.sessioni"
                    :carica-figli="conversazione.figli"
                    :carica-albero="conversazione.albero"
                    :cerca-file="conversazione.cercaFile"
                    :apri-file="conversazione.apriFile"
                    :azione-file="conversazione.azioneFile"
                    :sessione-id="conversazione.sessioneId.value"
                    @apri-delega="apriDelegaDalPannello"
                    @allega="allegaAllaChat"
                    :memoria="memoriaPannello"
                />
            </TalosMobileComposerSheet>
            <div ref="riga" data-testid="talos-codice-r4-riga" class="flex min-h-0 flex-1">
            <div class="relative min-h-0 min-w-0 flex-1">
            <!-- K3-AP3 (Pad, 16/10): `relative` fa dello scorrimento il blocco contenitore dei testi `sr-only` (assoluti) dei messaggi:
                 senza, sfuggivano al suo taglio e allungavano la cornice nascosta fino a 5.023 px, e un focus() la faceva scorrere. -->
            <div
                v-show="vista === 'chat'"
                ref="scorrimento"
                data-testid="talos-codice-r4-scorrimento"
                class="talos-codice-r4-scorrimento relative h-full touch-pan-y overflow-y-auto overscroll-contain"
                @scroll.passive="suScorrimento"
                @touchstart.passive="bordoVivo.touchStart()"
                @touchend.passive="bordoVivo.touchEnd()"
                @touchcancel.passive="bordoVivo.touchEnd()"
            >
                <TalosMobileMessageList
                    v-if="messaggi.length"
                    :messages="messaggi"
                    :sending="sending"
                    :message-style="settings.state.chat_layout.message_style"
                    :text-scale="settings.state.chat_layout.bubble_scale"
                    :diagnostica="settings.state.shell?.debug_diagnostics === true"
                    :azioni="AZIONI_DEL_CODICE_R4"
                    @reuse="riutilizza"
                    @share="condividi"
                />
                <div
                    v-else
                    data-testid="talos-codice-r4-vuoto"
                    :class="TALOS_CLASSE_COLONNA_CHAT"
                    class="flex h-full flex-col items-center justify-center text-center"
                >
                    <p class="max-w-[28rem] text-xs leading-5 text-[var(--talos-muted)]">{{ t('harness.draftHint') }}</p>
                </div>
            </div>
            <!-- Il respiro e la larghezza del compositore della chat (`.talos-docked-composer` in style.css), a filo del fondo.
                 ⛔ Owner 15/10: nessuna fascia dietro il compositore, «la chat si deve vedere passare dietro la banda». -->
            <div v-show="vista === 'chat'" ref="dock" data-testid="talos-codice-r4-dock" class="talos-codice-r4-dock">
                <div class="talos-docked-composer">
                    <div
                        v-if="errore"
                        role="alert"
                        data-testid="talos-codice-r4-errore"
                        :data-codice="errore.code"
                        class="mb-2 rounded-md border border-[var(--talos-danger-border)] bg-[var(--talos-danger-soft)] p-3 text-sm text-[var(--talos-danger)]"
                    >
                        {{ testoErrore }}
                    </div>
                    <div
                        v-if="dettatura.error.value"
                        :role="dettatura.errorCode.value === 'noSpeech' ? 'status' : 'alert'"
                        data-testid="talos-dictation-error"
                        :data-esito="dettatura.errorCode.value ?? ''"
                        class="mb-2 rounded-md border p-3 text-sm"
                        :class="dettatura.errorCode.value === 'noSpeech'
                            ? 'border-[var(--talos-border)] bg-[var(--talos-surface-2)] text-[var(--talos-muted)]'
                            : 'border-[var(--talos-danger-border)] bg-[var(--talos-danger-soft)] text-[var(--talos-danger)]'"
                    >
                        {{ dettatura.error.value }}
                    </div>
                    <!-- SCR4-19: la pillola «torna in fondo» della chat (F5-#28), quando si è saliti a rileggere -->
                    <Transition
                        enter-active-class="transition duration-150 ease-out"
                        enter-from-class="opacity-0 translate-y-2"
                        enter-to-class="opacity-100 translate-y-0"
                        leave-active-class="transition duration-100 ease-in"
                        leave-to-class="opacity-0 translate-y-2"
                    >
                        <button
                            v-if="bordoVivo.showPill.value"
                            type="button"
                            data-testid="talos-codice-r4-in-fondo"
                            :aria-label="t('chat.backToLatest')"
                            class="talos-pressable absolute -top-14 left-1/2 z-10 flex min-h-touch min-w-touch -translate-x-1/2 items-center justify-center gap-1.5 rounded-full border border-[var(--talos-border)] bg-[var(--talos-card)]/95 px-3 text-sm text-[var(--talos-text)] shadow-[0_4px_16px_rgba(0,0,0,0.14)] backdrop-blur"
                            @click="tornaInFondo"
                        >
                            <ArrowDown class="size-4" aria-hidden="true" />
                        </button>
                    </Transition>
                    <!-- K3 piano: la fascia del Piano chiesto dal modello (`index.template.html:623`) -->
                    <div v-if="pianoRichiesto" data-testid="talos-codice-r4-fascia-piano" class="talos-codice-r4-fascia">
                        <ClipboardList class="mt-0.5 size-4 shrink-0 text-[var(--talos-accent)]" aria-hidden="true" />
                        <div class="min-w-0">
                            <p role="status" class="text-sm font-medium leading-5">{{ testoPianoR4('app.plan.activeNextTurn', locale) }}</p>
                            <p class="text-xs leading-5 text-[var(--talos-muted)]">{{ testoPianoR4('modello.chat.theNextMessageWill', locale) }}</p>
                        </div>
                    </div>
                    <!-- K3 piano: l'avviso della revisione nuova (`index.template.html:628`), con «Vai al piano» e la chiusura -->
                    <div
                        v-if="avvisoPiano"
                        data-testid="talos-codice-r4-avviso-piano"
                        role="group"
                        :aria-label="testoPianoR4('modello.chat.planUpdated', locale)"
                        class="talos-codice-r4-fascia talos-codice-r4-fascia--avviso"
                    >
                        <ClipboardList class="size-4 shrink-0 text-[var(--talos-accent)]" aria-hidden="true" />
                        <p data-parte="testo" role="status" class="min-w-0 flex-1 text-sm leading-5">{{ testoPianoR4('app.plan.updated', locale, { n: avvisoPiano.revision }) }}</p>
                        <Button type="button" variant="secondary" data-azione="vai" class="min-h-touch shrink-0" @click="vaiAlPiano">{{ testoPianoR4('modello.chat.goToThePlan', locale) }}</Button>
                        <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            data-azione="chiudi"
                            class="min-h-touch min-w-touch shrink-0"
                            :aria-label="testoPianoR4('modello.chat.dismiss', locale)"
                            @click="chiudiAvvisoPiano"
                        ><X class="size-4" aria-hidden="true" /></Button>
                    </div>
                    <TalosCodiceR4Coda
                        v-if="conversazione && conversazione.coda.value.voci.length > 0"
                        :coda="conversazione.coda.value"
                        :giro-vivo="sending"
                        :sessione-id="conversazione.sessioneId.value"
                        @invia="(id) => void conversazione?.inviaDallaCoda(id)"
                        @togli="(id) => void conversazione?.togliDallaCoda(id)"
                        @riporta="(id) => void riportaDallaCoda(id)"
                    />
                    <TalosMobileComposer
                        ref="composer"
                        :prompt="prompt"
                        :model-profiles="profiliNelFoglio"
                        :selected-model-profile-id="profiloScelto?.id ?? null"
                        :discovery-problems="problemiDeiModelli"
                        :refreshing-models="chat.refreshingModels.value"
                        :selected-effort="livelloScelto"
                        :thinking="false"
                        :docked="true"
                        :can-send="fase === 'pronta' && !sending"
                        :sending="sending"
                        :can-queue="puoAccodare"
                        :drawer-mode="forma.drawerMode"
                        :immersive-composer="forma.immersiveComposer"
                        :plus-dropdown="forma.plusDropdown"
                        :attachments="allegati.vassoio"
                        :attachment-busy="allegati.occupato.value"
                        :attachment-error="allegati.errore.value"
                        :context-disabled-reason="t('harness.r4LibraryLater')"
                        :dictation-supported="dettatura.visible.value"
                        :dictation-listening="dettatura.status.value === 'listening'"
                        :dictation-starting="dettatura.status.value === 'starting'"
                        :dictation-level="dettatura.level.value"
                        :dictation-transcript="trascrizioneViva"
                        @update:prompt="prompt = $event"
                        @send="void invia()"
                        @queue="(testo) => void accoda(testo)"
                        @select-model-profile="(id) => void scegliModello(id)"
                        @select-effort="(livello) => void scegliLivello(livello)"
                        @stop="void conversazione?.ferma()"
                        @toggle-dictation="void alternaDettatura()"
                        @discard-dictation="buttaDettatura()"
                        @send-dictation="void inviaDettatura()"
                        @attach="void allegati.scegli('file')"
                        @pick-photos="void allegati.scegli('galleria')"
                        @take-photo="void allegati.scegli('fotocamera')"
                        @remove-attachment="allegati.togli"
                        @dismiss-attachment-error="allegati.errore.value = null"
                    >
                        <!-- K3 piano: la pillola del permesso, accanto al modello (il chip del piede del desktop) -->
                        <button
                            type="button"
                            data-testid="talos-codice-r4-permesso"
                            :data-tono="tonoPermesso ?? undefined"
                            :data-modo="modalita"
                            :aria-label="nomePillolaPermesso"
                            aria-haspopup="dialog"
                            :aria-expanded="foglio === 'modo'"
                            class="talos-pressable talos-mode-chip talos-codice-r4-permesso min-h-touch"
                            @pointerdown.prevent
                            @click="foglio = 'modo'"
                        >
                            <ClipboardList v-if="modalita === 'piano'" class="talos-codice-r4-permesso__icona size-4 shrink-0" aria-hidden="true" />
                            <ShieldCheck v-else class="talos-codice-r4-permesso__icona size-4 shrink-0" aria-hidden="true" />
                            <span class="talos-codice-r4-permesso__testo">{{ riassuntoPermesso.testo }}</span>
                        </button>
                    </TalosMobileComposer>
                </div>
            </div>
            <template v-if="terminaleMontato">
                <TalosCodiceR4Terminale
                    v-if="conversazione?.sessioneId.value"
                    v-show="vista === 'terminale'"
                    :key="conversazione.sessioneId.value"
                    :sessione-id="conversazione.sessioneId.value"
                    :cliente="talosClienteR4()"
                    class="absolute inset-0"
                />
                <p
                    v-else
                    v-show="vista === 'terminale'"
                    data-testid="talos-codice-r4-terminale-senza-sessione"
                    role="status"
                    :class="TALOS_CLASSE_COLONNA_CHAT"
                    class="py-4 text-sm text-[var(--talos-muted)]"
                >{{ testoTerminaleR4('processi.terminal.newTabNoSession', locale) }}</p>
            </template>
            <TalosCodiceR4Revisione
                v-if="conversazione"
                v-show="vista === 'revisione'"
                :file="conversazione.pannello.value.file"
                :ultimo-file="conversazione.pannello.value.ultimoFile"
                :puo-aprire="Boolean(conversazione.sessioneId.value)"
                class="absolute inset-0"
                @apri="apriFileDallaRevisione"
            />
            </div>
            <aside
                v-if="pannelloAperto && largo && conversazione"
                data-testid="talos-codice-r4-colonna"
                class="talos-codice-r4-colonna"
                :aria-label="t('harness.r4Panel')"
            >
                <TalosCodiceR4Pannello
                    :pannello="conversazione.pannello.value"
                    :carica-politica="conversazione.politicaCompattazione"
                    :carica-cache="conversazione.cacheSessione"
                    :giri-finiti="giriFiniti"
                    :azione-processo="conversazione.azioneProcesso"
                    :carica-risorse="conversazione.risorseProcessi"
                    :carica-sessioni="conversazione.sessioni"
                    :carica-figli="conversazione.figli"
                    :carica-albero="conversazione.albero"
                    :cerca-file="conversazione.cercaFile"
                    :apri-file="conversazione.apriFile"
                    :azione-file="conversazione.azioneFile"
                    :sessione-id="conversazione.sessioneId.value"
                    @apri-delega="apriDelegaDalPannello"
                    @allega="allegaAllaChat"
                    :memoria="memoriaPannello"
                />
            </aside>
            </div>
            <TalosCodiceR4Viste v-if="!visteInTestata" v-show="!tastieraAperta" :vista="vista" forma="barra" :file-revisione="fileRevisione" @scegli="scegliVista" />
            <TalosMobileConfirmDialog
                v-if="allegati.domanda.value"
                data-testid="talos-image-consent"
                :title="t('chat.imageConsentTitle')"
                :description="t(allegati.domanda.value.count > 1 ? 'chat.imageConsentBodyMany' : 'chat.imageConsentBody', { provider: allegati.domanda.value.provider })"
                @close="void allegati.rispondi('deny')"
            >
                <template #footer>
                    <Button variant="ghost" data-testid="talos-image-consent-no" @click="void allegati.rispondi('deny')">
                        {{ t('chat.imageConsentNever') }}
                    </Button>
                    <Button variant="outline" data-testid="talos-image-consent-always" @click="void allegati.rispondi('allow')">
                        {{ t('chat.imageConsentAlways') }}
                    </Button>
                    <Button data-testid="talos-image-consent-once" @click="void allegati.rispondi('once')">
                        {{ t('chat.imageConsentOnce') }}
                    </Button>
                </template>
            </TalosMobileConfirmDialog>
        </div>
    </TalosMobileScreen>
</template>

<style scoped>
.talos-codice-r4-scorrimento {
    padding-bottom: var(--talos-codice-r4-spazio, 180px);
}

/* Dentro il foglio della stazione, a filo del suo fondo; respiro e larghezza sono quelli della chat (style.css). */
.talos-codice-r4-dock {
    position: absolute;
    right: 0;
    bottom: 0;
    left: 0;
    z-index: 40;
    /* fuori dal compositore il tocco va alla conversazione che passa dietro */
    pointer-events: none;
}

/* ⛔ SCR4-08 (owner 15/10): niente fascia, era di un altro colore e tagliava di netto la conversazione. Il contenitore è
   trasparente; la sfumatura leggera è quella della chat (`.talos-docked-composer`, style.css), partendo dal foglio della
   stazione su cui stiamo. */
.talos-codice-r4-dock {
    background: transparent;
    --talos-sfumatura-compositore: var(--talos-window-bg);
}

.talos-codice-r4-dock .talos-docked-composer > * {
    pointer-events: auto;
}
</style>
