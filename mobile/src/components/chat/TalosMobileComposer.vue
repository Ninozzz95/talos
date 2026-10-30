<script setup lang="ts">
import { computed, defineAsyncComponent, nextTick, onBeforeUnmount, onMounted, ref, shallowRef, useId, useSlots, watch, type ComponentPublicInstance } from 'vue'
import { useTalosI18n } from '@/i18n'
import { createTalosSendGate } from '@/lib/chat/sendGate'
import { ArrowUp,
    ChevronRight,
    ListPlus,
    Maximize2,
    Mic,
    Plus,
    ShieldQuestionMark,
    Square, } from '@lucide/vue'
/**
 * Il cassetto del modello e dello sforzo si apre a richiesta, quindi si carica
 * a richiesta.
 *
 * Misurato il 2026-08-06 sulla sourcemap: il selettore che porta dentro pesava
 * **7,9 KB** nel pacchetto d'avvio, per una superficie che compare solo quando
 * qualcuno tocca il chip del modello. Chi apre l'app e scrive un messaggio non
 * la vede mai.
 */
const TalosMobileModelEffortDrawer = defineAsyncComponent(
    () => import('@/components/chat/TalosMobileModelEffortDrawer.vue'),
)
/*
 * PILLOLA-01 (owner 28/10/2026: «il logo provider e SOLO il nome del modello»): il logo del fornitore torna nella pillola (supera il
 * «senza icona» del 27/10). Caricato a richiesta: i loghi non entrano nel pezzo d'avvio, e il suo posto ha la misura fissa
 * (`.talos-model-chip__logo`), così la pillola non si sposta quando arriva.
 */
const TalosMobileProviderIcon = defineAsyncComponent(() => import('@/components/models/TalosMobileProviderIcon.vue'))
/*
 * ⭐ Owner 27/10/2026 (mockup del compositore approvato): niente più pillola del ragionamento (J3) nel compositore. Il chip è UNO,
 * «modello livello», e il livello si sceglie nel piede del foglio «Modello e ragionamento». La regola dei livelli resta quella del J3.
 */
import { statoPillolaRagionamento } from '@/lib/chat/statoPillolaRagionamento'
import type { FiloRagionamento } from '@/lib/chat/pillolaRagionamento'
import { Button } from '@/components/ui/button'
import type {
    TalosMobileModelProfileView,
    TalosMobileRoutingProfileView,
} from '@/components/chat/mobileChatTypes'
import type { TalosMobileEffortLevel } from '@/lib/mobileEffort'
import type { TalosMobileRouteName } from '@/lib/mobileRoutes'
import type { TalosMobilePromptEnhancementResult } from '@/lib/chat/promptEnhancement'
import {
    TALOS_PROMPT_ENHANCER_DEFAULT_DEPTH,
    type TalosPromptEnhancerDepth,
} from '@/lib/chat/promptEnhancerDepth'
import { TALOS_MOBILE_COMMANDS, type TalosMobileCommandId } from '@/lib/mobileCommandRegistry'

/** Owner 12/09 20:10: niente «ricerca web» nella chat — `/browse` non sta nel menu slash. Codice (U-4) resta com'e'. */
const comandiSlashDellaChat = TALOS_MOBILE_COMMANDS.filter(c => c.id !== 'open_browse')
import type { TalosMobileAttachmentDraft } from '@/composables/useTalosMobileAttachments'
import type { TalosComposerFlip } from '@/composables/useTalosComposerFlip'
import { talosMotionConsentito } from '@/composables/useTalosCalmMotion'
import TalosMobileLancettaRagionamento from '@/components/chat/TalosMobileLancettaRagionamento.vue'
import type { TalosLocalVaultFile } from '@/repositories/chatRepository'
import type {
    TalosLibraryContextMode,
    TalosLibraryTurnOverride,
} from '@/lib/chat/libraryPolicy'


const TalosMobileSlashCommandMenu = defineAsyncComponent(
    () => import('@/components/chat/TalosMobileSlashCommandMenu.vue'),
)
// K3-C Allegati A2 (16/10): il vassoio esiste solo con un allegato, quindi si carica a richiesta (pacchetto d'avvio sotto il tetto).
const TalosMobileAttachmentTray = defineAsyncComponent(
    () => import('@/components/chat/TalosMobileAttachmentTray.vue'),
)
// Il foglio «+» resta caricato a richiesta nella forma unica Calm.
const TalosMobileComposerDrawer = defineAsyncComponent(
    () => import('@/components/chat/TalosMobileComposerDrawer.vue'),
)
const TalosMobileLibraryContextSheet = defineAsyncComponent(
    () => import('@/components/chat/TalosMobileLibraryContextSheet.vue'),
)
/*
 * Il pannello che si vede prima di riscrivere: pigro, come il popover accanto.
 *
 * MISURATO 2026-08-04, e non era un dettaglio: importato staticamente si porta
 * dietro il selettore di reka-ui, e con lui **80.223 byte** nel grafo d'avvio —
 * il budget e' passato da 594 KB a 674 KB, cioe' oltre il tetto. Il costo non
 * era del pannello: era del Select, che l'avvio non usa e che quel pannello e'
 * il solo, fra i suoi vicini, a tirare dentro.
 *
 * Il cancello del bundle lo pretende: c'e' una riga in
 * `verify-initial-chunk.mjs` che fallisce se questo confine sparisce, come per
 * il popover. Un import che torna statico non deve poter passare in silenzio
 * una seconda volta.
 */
const TalosMobileEnhancerDrawer = defineAsyncComponent(
    () => import('@/components/chat/TalosMobileEnhancerDrawer.vue'),
)
/**
 * Owner 2026-08-27 — l'espansione a tutto schermo si vede solo quando serve
 * ("per i testi più grandi"): pesa zero al grafo d'avvio finché nessuno
 * scrive un messaggio lungo, stesso schema pigro degli altri cassetti sopra.
 */
const TalosMobileComposerExpanded = defineAsyncComponent(
    () => import('@/components/chat/TalosMobileComposerExpanded.vue'),
)

const props = withDefaults(defineProps<{
    prompt: string
    modelProfiles: TalosMobileModelProfileView[]
    routingProfiles?: TalosMobileRoutingProfileView[]
    selectedModelProfileId?: string | null
    /** Il modello che il Codice sta aprendo prima di sceglierlo (22/10/2026): lo dice la sua riga del selettore. */
    openingModelProfileId?: string | null
    /**
     * ⛔ D-0147-UI-2 (owner 27/10/2026, mockup approvato): sul TELEFONO il piano ChatGPT non ha più la sua pastiglia qui (a 360-393 dp
     * mandava il compositore su tre righe). Chi monta dice se il modello scelto lo paga il piano (`attivo`) o se il piano è al limite
     * (`limite`): la pillola del modello porta un puntino «chi paga» (e lo dice a parole) e il selettore la riga del piano.
     * `null` sul tablet, dove la pastiglia resta.
     */
    pianoChatgpt?: 'attivo' | 'limite' | null
    selectedRoutingProfileId?: string | null
    /** Il livello del ragionamento; `null` = nessuna scelta (la sessione del Codice senza `reasoning`): la pillola dice «Auto». */
    selectedEffort: string | null
    /** J3: la mappa del filo (A9) per la riga che dice che cosa parte davvero, quando chi monta il compositore ce l'ha. */
    reasoningWire?: FiloRagionamento | null
    thinking: boolean
    /**
     * J3: «Ragionamento esteso» è un comando a sé (la chat: `thinking` dell'adattatore) e sta anche nel menu della pillola. Falso nel
     * Codice, dove è lo stesso livello («off» ⇔ spento): lì vive solo nel foglio del modello, per i modelli senza pillola.
     */
    thinkingSeparate?: boolean
    agentToolsEnabled?: boolean
    docked?: boolean
    canSend: boolean
    sending: boolean
    sendDisabledReason?: string
    /**
     * ⭐ B3 (24/09, D-B3-01 e D-B3-04) — si può ACCODARE adesso: l'app sta rispondendo, qui o in un'altra chat
     * (`controller.canQueue`). Falso a riposo.
     */
    canQueue?: boolean
    /**
     * ⭐ B3 — perché non si può accodare mentre l'app risponde (oggi: c'è un allegato). Stringa vuota quando si può, o
     * quando non c'è niente da accodare (`controller.queueDisabledReason`).
     */
    queueDisabledReason?: string
    loadingModels?: boolean
    loadingRoutes?: boolean
    refreshingModels?: boolean
    discoveryProblems?: ReadonlyArray<{ message: string, detail?: string | null }>
    /** ⛔ D-RM4-3 (Pad 20/10/2026): il foglio del modello offre il Laboratorio modelli del telefono; falso nel Codice di un PC. */
    showModelLab?: boolean
    /**
     * ⭐⭐⭐ 2/9 — picker Planner (FASE K): additivi, mai passati da
     * ChatScreen.vue oggi — `showExecutorModel` resta falso di default,
     * zero cambio per la chat regolare.
     */
    showExecutorModel?: boolean
    executorModelProfiles?: TalosMobileModelProfileView[]
    selectedExecutorModelProfileId?: string | null
    attachments?: readonly TalosMobileAttachmentDraft[]
    attachmentBusy?: boolean
    attachmentError?: string | null
    attachmentsAvailable?: boolean
    attachmentDisabledReason?: string
    contextAvailable?: boolean
    contextDisabledReason?: string
    enhancingPrompt?: boolean
    promptEnhancement?: TalosMobilePromptEnhancementResult | null
    enhancerDepth?: TalosPromptEnhancerDepth
    enhancerModel?: string | null
    enhancerEffort?: string
    enhancerModels?: readonly { id: string, label: string, provider: string, efforts: readonly string[] }[]
    promptEnhancementError?: string
    /** Codice nel foglio «+» solo dove il ponte nativo esiste (build di sviluppo). */
    harnessAvailable?: boolean
    // Calm: il microfono è sempre visibile; se non disponibile spiega perché.
    dictationSupported?: boolean
    dictationListening?: boolean
    dictationStarting?: boolean
    dictationLevel?: number
    /** ⭐ Le parole mentre le dici: la trascrizione viva, non la bozza. */
    dictationTranscript?: string
    libraryContextEnabled?: boolean
    libraryContextMode?: TalosLibraryContextMode
    librarySourceCount?: number
    libraryTurnOverride?: TalosLibraryTurnOverride | null
    libraryFiles?: readonly TalosLocalVaultFile[]
    /**
     * ⛔ A3-OSS-2 (Pad, 01/10/2026) — richieste di permesso e recuperi da controllare. Owner 01/10: «pillola accanto
     * alla pill selettore modello» (prima era fissa in basso a destra e copriva «Interrompi risposta»); e finché ce
     * n'è una, la riga resta visibile anche a riposo: un permesso in attesa non sparisce dalla vista.
     */
    toolReviewCount?: number
    /**
     * Lo scudo del permesso (slot `permesso`, Codice) anche A RIPOSO: owner 27/10/2026, mockup approvato — a riposo solo con
     * «Accesso pieno» o in modalità piano; aperto sempre.
     */
    permessoARiposo?: boolean
    /**
     * ⛔ «Stop anche a chat ferma» (owner 29/10/2026 sera, mockup approvato, G7 scelta (a)): quanti agenti lavorano ancora sotto la
     * conversazione del Codice su r4 quando la chat è ferma (`pulsanteStopR4`). Con almeno uno, a campo vuoto lo Stop resta al posto
     * dell'Invio («Ferma i N agenti»); appena si scrive torna l'Invio. La Chat non la passa: il compositore resta quello di sempre.
     */
    agentiDaFermare?: number
}>(), {
    agentToolsEnabled: true,
    docked: false,
    canQueue: false,
    queueDisabledReason: '',
    routingProfiles: () => [],
    selectedModelProfileId: null,
    openingModelProfileId: null,
    pianoChatgpt: null,
    selectedRoutingProfileId: null,
    reasoningWire: null,
    thinkingSeparate: true,
    loadingModels: false,
    refreshingModels: false,
    showModelLab: true,
    showExecutorModel: false,
    executorModelProfiles: () => [],
    selectedExecutorModelProfileId: null,
    attachments: () => [],
    attachmentBusy: false,
    attachmentError: null,
    attachmentsAvailable: true,
    attachmentDisabledReason: '',
    contextAvailable: false,
    contextDisabledReason: '',
    enhancingPrompt: false,
    promptEnhancement: null,
    enhancerDepth: TALOS_PROMPT_ENHANCER_DEFAULT_DEPTH,
    enhancerModel: null,
    enhancerEffort: 'low',
    enhancerModels: () => [],
    promptEnhancementError: '',
    dictationSupported: false,
    dictationListening: false,
    dictationStarting: false,
    dictationLevel: 0,
    dictationTranscript: '',
    libraryContextEnabled: false,
    libraryContextMode: 'broad_compat_v1',
    librarySourceCount: 0,
    libraryTurnOverride: null,
    libraryFiles: () => [],
    toolReviewCount: 0,
    permessoARiposo: false,
})

/**
 * ⛔ DET-FUORI (owner 18/10/2026: «il testo vada fuori dal composer … proprio fuori», «Sopra il compositore, una riga sola»): la riga
 * delle parole sta sopra il bordo, con lo stesso componente della barra dell'assistente. A richiesta come la barra: chi scrive a
 * tastiera non la paga nel grafo d'avvio.
 */
const TalosSciaParole = defineAsyncComponent(() => import('@/components/brand/TalosSciaParole.vue'))
const TalosMobileDictationBar = defineAsyncComponent(
    () => import('@/components/chat/TalosMobileDictationBar.vue'),
)

const slots = useSlots()
const emit = defineEmits<{
    'update:prompt': [prompt: string]
    send: []
    /** ⭐ B3 — il testo del campo va IN CODA (mai un reindirizzo: quello nasce solo da un gesto sulla voce in coda). */
    queue: [text: string]
    stop: []
    toggleDictation: []
    discardDictation: []
    /** ⭐ Chiude la dettatura E manda: il gesto di chi ha le mani occupate. */
    sendDictation: []
    selectModelProfile: [profileId: string]
    selectModelRoutingProfile: [profileId: string]
    selectEffort: [level: TalosMobileEffortLevel]
    selectThinking: [enabled: boolean]
    /** Foglio «+» (12/09): le voci «Crea …» precompilano; le stazioni si aprono dalla schermata. */
    preset: [id: 'slides' | 'document' | 'analyze']
    navigate: [route: TalosMobileRouteName]
    setAgentToolsEnabled: [enabled: boolean]
    attach: []
    takePhoto: []
    pickPhotos: []
    removeAttachment: [itemId: string]
    dismissAttachmentError: []
    openContext: []
    /** A3-OSS-2 — riapre la richiesta di permesso (o il recupero) in attesa. */
    reviewTools: []
    openModelLab: []
    refreshModels: []
    selectExecutorModelProfile: [profileId: string | null]
    enhancePrompt: []
    updateEnhancerDepth: [value: TalosPromptEnhancerDepth]
    updateEnhancerModel: [value: string | null]
    updateEnhancerEffort: [value: string]
    enhanceBlocked: [reason: string]
    cancelPromptEnhancement: []
    insertPromptEnhancement: []
    replacePromptEnhancement: []
    selectSlashCommand: [commandId: TalosMobileCommandId]
    updateLibraryTurnOverride: [override: TalosLibraryTurnOverride | null]
}>()

const { t } = useTalosI18n()
const promptField = ref<HTMLTextAreaElement | null>(null)
const modelTrigger = ref<ComponentPublicInstance | HTMLElement | null>(null)
// F4-#26: model+effort and the enhancer live in dedicated bottom drawers —
// the same organized-sheet pattern as the "+" Add-to-chat drawer.
const modelPickerOpen = ref(false)
const enhancerDrawerOpen = ref(false)
const slashActiveIndex = ref(0)
const slashCommandCount = ref(0)
const slashMenu = ref<{ activateSelected(): void } | null>(null)
const toolDrawerOpen = ref(false)
const plusTrigger = ref<ComponentPublicInstance | HTMLElement | null>(null)
/**
 * ⛔⛔ REGRESSIONE RIPARATA il 2026-09-13. Owner, dal Pad, guardando la foto:
 * «ECCO COSA MANCA LA MODALITA COMPATTA — REGRESSIONE».
 *
 * La forma compatta esisteva ed era il PREDEFINITO (`TALOS_DEFAULT_COMPOSER_SHAPE`,
 * scelto dall'owner il 2026-08-17). Il compositore Calm del 12/09 ha smesso di
 * guardare i tre flag di forma — lo dichiarava lui stesso in testa a
 * composerStyle.ts: «la forma Calm ignora i tre flag restituiti qui» — quindi
 * «Forma della barra di scrittura» in Impostazioni era diventato un controllo
 * con tre voci e nessun effetto.
 *
 * Ripreso dal compositore precedente, non reinventato: compatto = campo non a
 * fuoco E nessun allegato. In quello stato la riga degli strumenti non si
 * disegna: una riga a riposo, si espande quando scrivi.
 * ⭐ Owner 27/10/2026, «Unico, tolgo le forme»: è l'UNICA forma. Le prop
 * `drawerMode`, `immersiveComposer` e `plusDropdown` non esistono più; il «+»
 * apre sempre il cassetto (FORMA-01..04).
 */
const composerFocused = ref(false)
/*
 * ⛔ PILL-TOCCO-03 (ora CHIP-05): il fuoco che resta DENTRO il compositore (campo, chip, comandi) non lo richiude; solo un fuoco che
 * esce davvero.
 */
const composerRoot = ref<HTMLElement | null>(null)
function onComposerFocusOut(e: FocusEvent): void {
    const verso = e.relatedTarget as Node | null
    if (verso && composerRoot.value?.contains(verso)) return
    composerFocused.value = false
}
/** La colonna in alto a destra: lo scudo (aperto, o a riposo se chiesto) ed «Espandi» (aperto, testo alto). */
const altoVisibile = computed(() => (
    (!!slots.permesso && (!composerCompact.value || props.permessoARiposo)) || (promptTall.value && !composerCompact.value)
))
const composerCompact = computed(() => (
    !composerFocused.value
    && (props.attachments?.length ?? 0) === 0
    // owner 27/10/2026, mockup approvato: una bozza senza fuoco resta su UNA riga; «Rivedi» (A3-OSS-2) ha la sua riga in cima
))
const librarySheetOpen = ref(false)
/** La Libreria è ACCESA per il prossimo messaggio: il pallino sul «+», e a parole per chi ascolta (`aria-describedby`). */
const idLibreriaSulPiu = `talos-composer-plus-libreria-${useId()}`
const libreriaAccesa = computed(() => props.libraryContextEnabled || props.libraryTurnOverride?.enabled === true)
const showLibraryChip = computed(() => (
    props.libraryContextEnabled
    || props.libraryTurnOverride !== null
    || props.libraryFiles.length > 0
))
const libraryModeLabel = computed(() => {
    if (!props.libraryContextEnabled && props.libraryTurnOverride?.enabled !== true) {
        return t('library.contextModeOff')
    }
    if (props.libraryContextMode === 'smart_relevant_v1') return t('aiDefaults.libraryModes.smart')
    if (props.libraryContextMode === 'ask_before_use_v1') return t('aiDefaults.libraryModes.ask')
    if (props.libraryContextMode === 'agentic_on_demand_v1') return t('aiDefaults.libraryModes.onDemand')
    return t('aiDefaults.libraryModes.broad')
})
const librarySourceCountLabel = computed(() => t(
    props.librarySourceCount === 1 ? 'library.sourceCountOne' : 'library.sourceCountMany',
    { count: props.librarySourceCount },
))
/** Sola icona a schermo: modo e numero di fonti vivono nel nome accessibile. */
const libraryChipLabel = computed(() => (
    `${t('library.contextForNextMessage')}: ${libraryModeLabel.value} · ${librarySourceCountLabel.value}`
))

async function closeLibrarySheet(): Promise<void> {
    librarySheetOpen.value = false
    await nextTick()
    // il chip non c'è più: il fuoco torna al «+», da cui la Libreria si è aperta
    const piu = plusTrigger.value
    ;((piu && '$el' in piu ? piu.$el : piu) as HTMLElement | null)?.focus()
}

async function openPlus(): Promise<void> {
    toolDrawerOpen.value = true
}
async function closeToolDrawer(): Promise<void> {
    toolDrawerOpen.value = false
    await nextTick()
    focusTrigger(plusTrigger.value)
}

const selectedProfile = computed(() => (
    props.modelProfiles.find((profile) => profile.id === props.selectedModelProfileId) ?? null
))
const selectedRoute = computed(() => (
    props.routingProfiles.find((profile) => profile.id === props.selectedRoutingProfileId) ?? null
))
// il nome breve, con la regola del desktop (`nomeModelloUmano`): mai il fornitore nel testo. Nel suggerimento del pulsante c'è il
// nome intero (`display_name`); il desktop vi mette l'id intero (parità da fare, nota del Desktop 28/10).
// Modulo caricato a parte (tetto dell'avvio, 28/10: +2.444 byte nel chunk iniziale): parte col compositore e arriva prima dei
// profili, che si leggono anch'essi dopo l'avvio; fino ad allora resta il `display_name`.
const regolaDelNome = shallowRef<typeof import('@/lib/models/nomeModelloUmano').talosNomeBreveTradotto | null>(null)
void import('@/lib/models/nomeModelloUmano').then((m) => { regolaDelNome.value = m.talosNomeBreveTradotto })
const nomeBreve = computed(() => selectedProfile.value && (regolaDelNome.value?.(selectedProfile.value, t) ?? selectedProfile.value.display_name))
const modelTitle = computed(() => {
    if (selectedRoute.value) return selectedRoute.value.name
    if (selectedProfile.value) return selectedProfile.value.display_name
    return t('chat.noModelSelected')
})
const hasAuthorizedAttachment = computed(() =>
    props.attachments.some((attachment) => attachment.status === 'authorized'),
)
const attachmentBlocked = computed(() =>
    props.attachmentBusy || props.attachments.some((attachment) => attachment.status !== 'authorized'),
)
const canSubmit = computed(() => (
    props.canSend
    && !props.sending
    && !attachmentBlocked.value
    && (props.prompt.trim().length > 0 || hasAuthorizedAttachment.value)
))
const canRequestEnhancement = computed(() => (
    selectedProfile.value !== null
    && !props.enhancingPrompt
    && !props.sending
    && props.prompt.trim().length > 0
))
// F4-#20: a mute disabled control explains nothing on touch — when the
// enhancer cannot run, the tap surfaces WHY instead of dying silently.
const enhanceUnavailableReason = computed<string | null>(() => {
    if (selectedProfile.value === null) return t('chat.selectCallableModel')
    if (props.prompt.trim().length === 0) return t('chat.writePromptFirst')
    return null
})
const slashMenuOpen = computed(() => /^\/[^\s\n]*$/.test(props.prompt))
const statusText = computed(() => {
    if (props.sending) return t('chat.processing')
    if (props.attachmentBusy) return t('chat.addingFiles')
    if (attachmentBlocked.value) return t('chat.removeFailedFiles')
    if (props.enhancingPrompt) return t('chat.improvingPrompt')
    if (props.promptEnhancementError) return props.promptEnhancementError
    return props.sendDisabledReason
})

// Calm: microfono separato, invio vuoto disabilitato, stop sempre raggiungibile.
const composerHasContent = computed(() => (
    props.prompt.trim().length > 0 || props.attachments.length > 0
))
const dictating = computed(() => props.dictationListening || props.dictationStarting)
/** ⛔ «Stop anche a chat ferma» (owner 29/10 sera): chat ferma, agenti al lavoro, campo vuoto ⇒ lo Stop degli agenti, non l'Invio. */
const stopAgenti = computed(() => !props.sending && (props.agentiDaFermare ?? 0) > 0 && !composerHasContent.value)
/**
 * Owner 2026-09-13: microfono a campo vuoto, invio col testo, stop mentre
 * risponde o mentre si detta. ⭐ Owner 27/10/2026, mockup approvato: il microfono
 * è un comando SUO accanto all'invio, che a campo vuoto resta spento.
 *
 * Dove la dettatura non c'e' il microfono resta al suo posto, spento, con la
 * riga che dice perche' (talos-composer-mic-reason): un comando che sparisce
 * non spiega niente, uno spento con la sua ragione si'.
 */
const rightAction = computed<'stop' | 'dictating' | 'send'>(() => {
    if (props.sending) return 'stop'
    if (dictating.value) return 'dictating'
    if (stopAgenti.value) return 'stop'
    return 'send'
})
/**
 * ⭐⭐ B3 (24/09) — IL COMPOSITORE A GIRO VIVO. Decisioni owner D-B3-01 e D-B3-04.
 *
 * Prima un messaggio scritto mentre TALOS rispondeva non andava da nessuna parte: l'Invio era ignorato qui sotto
 * (`requestSend`) e lo store lo scartava in silenzio. Ora:
 *   - campo vuoto ⇒ solo Stop, come prima;
 *   - con testo ⇒ Stop RESTA il comando `talos-composer-action` e accanto compare Accoda, azione principale;
 *   - l'Invio da tastiera ACCODA. ⛔ Mai un reindirizzo dall'Invio (desktop `legacy/invio-durante-il-giro.js`): il
 *     reindirizzo nasce solo da un gesto sulla singola voce in coda (`TalosMobileCodaDelGiro.vue`).
 * Nella chat B mentre risponde la chat A Stop non c'è (fermerebbe la risposta di un'altra chat): con testo Accoda prende
 * il posto dell'invio spento.
 *
 * «Si sta rispondendo da qualche parte» si legge da `canQueue` O dal motivo per cui non si può: il controller dà un
 * motivo SOLO mentre l'app risponde (`queueDisabledReason`), quindi a riposo sono entrambi spenti e il compositore resta
 * quello di sempre.
 */
const queueMode = computed(() => props.canQueue || props.queueDisabledReason !== '')
const queueOffered = computed(() => queueMode.value && !dictating.value && composerHasContent.value)
/** Accoda spento resta VISIBILE col motivo: W3C APG, «Focusability of disabled controls» (letto il 24/09/2026). */
const queueBlocked = computed(() => !props.canQueue)
const queueTitle = computed(() => (queueBlocked.value && props.queueDisabledReason) || t('chat.queue'))
/** L'invio spento non si mostra accanto ad Accoda: nella chat B il comando di destra È Accoda. */
const showRightAction = computed(() => !(queueOffered.value && rightAction.value === 'send'))
const microphoneReason = computed(() => !props.dictationSupported ? t('chat.dictationUnavailable') : '')
function onMicrophone(): void {
    if (!props.dictationSupported || dictating.value) return
    promptField.value?.blur()
    emit('toggleDictation')
}
/** Stable accessible name; the reason travels in the title. */
const rightActionLabel = computed(() => {
    switch (rightAction.value) {
        // a chat ferma lo Stop ferma gli agenti e lo dice (le parole del PC, «Ferma i {n} agenti» / «Ferma l'agente»)
        case 'stop': return stopAgenti.value
            ? (props.agentiDaFermare === 1 ? t('chat.stopAgentsOne') : t('chat.stopAgentsMany', { n: props.agentiDaFermare ?? 0 }))
            : t('chat.stopResponse')
        case 'dictating': return t('chat.stopDictation')
        default: return t('chat.sendMessage')
    }
})
const rightActionTitle = computed(() => {
    if (rightAction.value === 'dictating' && props.dictationStarting) return t('chat.startingDictation')
    if (rightAction.value === 'send') return statusText.value || t('chat.sendMessage')
    return rightActionLabel.value
})
const attachmentReason = computed(() => props.attachmentDisabledReason || t('chat.attachmentUnavailable'))
const contextReason = computed(() => props.contextDisabledReason || t('chat.contextUnavailable'))
const supportsThinking = computed(() => selectedProfile.value?.thinking_toggle ?? selectedProfile.value?.supports_thinking ?? false)
/**
 * ⭐ Il chip unico «modello livello» (owner 27/10/2026, mockup approvato): il livello mostrato è quello della regola J3
 * (`statoPillolaRagionamento`), «Auto» senza una scelta; niente livello per un modello che un livello non lo riceve.
 */
const statoRagionamento = computed(() => statoPillolaRagionamento({
    profilo: selectedProfile.value, scelto: props.selectedEffort, filo: props.reasoningWire,
}))
const nomeDelLivello = (livello: string) => t(`chat.effort${livello.charAt(0).toUpperCase()}${livello.slice(1)}`)
const livelloNelChip = computed(() => {
    const stato = statoRagionamento.value
    if (!selectedProfile.value || stato.nascosta) return ''
    return stato.mostrato ? nomeDelLivello(stato.mostrato) : t('chat.reasoningAutoShort')
})
/*
 * ⭐ Owner 28/10/2026 (foto dal telefono, «Approvo»): aperto, «Molto alto» e il tondo della Libreria lasciavano al nome del modello «G…».
 * Il livello si dice con un disegno piccolo; dopo le tacche del segnale («qualcosa di più unico, capibile e leggermente più grande»)
 * l'owner ha scelto la LANCETTA: 0 a sinistra per «spento», 1 per il primo livello del modello, 4 per l'ultimo, in mezzo in proporzione.
 * «Auto» è la lancetta tratteggiata sul livello che parte davvero (A9), o su «alto». La parola resta nel nome del chip e in sr-only.
 */
const lancetta = computed<{ livello: number; auto: boolean } | null>(() => {
    const stato = statoRagionamento.value
    if (stato.nascosta || !selectedProfile.value) return null
    const livelli = stato.voci.map((v) => v.valore).filter((v) => v !== 'off')
    const posto = (valore: string): number | null => {
        if (valore === 'off') return 0
        const i = livelli.indexOf(valore)
        if (i < 0) return null
        return livelli.length === 1 ? 4 : 1 + Math.round((i * 3) / (livelli.length - 1))
    }
    if (stato.mostrato) {
        const n = posto(stato.mostrato)
        return n === null ? null : { livello: n, auto: false }
    }
    const nota = stato.nota
    return { livello: posto(nota && 'inviato' in nota ? nota.inviato : 'high') ?? 3, auto: true }
})
// D-0147-UI-2: chi paga lo dice anche a parole, non solo il colore del puntino; e il livello, che a schermo sta accanto al nome
const modelChipLabel = computed(() => `${t('chat.chooseModelProfile')}: ${selectedProfile.value?.display_name ?? t('chat.chooseModel')}${
    livelloNelChip.value ? ` · ${livelloNelChip.value}` : ''}${
    props.pianoChatgpt ? ` · ${t(props.pianoChatgpt === 'limite' ? 'chatgptPlan.limitTitle' : 'chatgptPlan.pill')}` : ''}`)
const rightActionDisabled = computed(() => {
    if (rightAction.value === 'send') return !canSubmit.value
    return false
})
function onRightAction(): void {
    if (rightAction.value === 'stop') { emit('stop'); return }
    if (rightAction.value === 'dictating') { emit('toggleDictation'); return }
    requestSend()
}

/*
 * ⭐ D2 (owner 28/10/2026): il passaggio «a riposo ↔ aperto» scorre, sobrio, invece di scattare. Il FLIP è anche l'unico regista
 * dell'auto-altezza del campo al cambio di forma: `resizePrompt` gira FRA le due misure (prima girava da solo in un nextTick).
 */
/*
 * ⛔ Fuori dal pezzo d'avvio (28/10/2026, OK del Desktop; l'avvio era a 250 byte dal tetto): il regista arriva con `import()`.
 *   · si precarica a compositore montato e inattivo (requestIdleCallback con un tetto di 2 s, o 1 s di attesa), e al primo tocco;
 *   · col movimento ridotto o spento non si carica affatto (TRANS-06/07): risparmia la richiesta;
 *   · se l'import fallisce (pacchetto rotto, aggiornamento a metà) il compositore resta a scatto, con un avviso solo (TRANS-10);
 *   · finché non c'è, il cambio di forma è quello di prima del blocco 6: `resizePrompt` in un nextTick (TRANS-09).
 */
const composerFlip = shallowRef<TalosComposerFlip | null>(null)
let registaChiesto = false
function caricaRegista(): void {
    if (registaChiesto) return
    const el = composerRoot.value
    if (!el || !talosMotionConsentito(el, '--talos-motion-calm-composer')) return
    registaChiesto = true
    void import('@/composables/useTalosComposerFlip')
        .then(({ creaRegistaDelCompositore }) => {
            if (composerRoot.value) composerFlip.value = creaRegistaDelCompositore({ scheda: composerRoot, primaDellaMisura: resizePrompt })
        })
        .catch((errore: unknown) => { console.warn('[TALOS] la transizione del compositore non è arrivata: resta a scatto', errore) })
}
// un compositore smontato non lascia il caricamento in coda (revisione del Desktop, 28/10)
let annullaPrecarico: (() => void) | null = null
onMounted(() => {
    const g = globalThis as { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number; cancelIdleCallback?: (id: number) => void }
    if (g.requestIdleCallback && g.cancelIdleCallback) {
        const id = g.requestIdleCallback(caricaRegista, { timeout: 2000 })
        annullaPrecarico = () => g.cancelIdleCallback?.(id)
    } else {
        const id = setTimeout(caricaRegista, 1000)
        annullaPrecarico = () => clearTimeout(id)
    }
})
watch(() => !composerCompact.value, (ora) => {
    const regista = composerFlip.value
    if (regista) void regista.cambia(ora)
    else void nextTick().then(resizePrompt)
})
function esciInDissolvenza(el: Element, done: () => void): void {
    const regista = composerFlip.value
    if (regista) regista.esci(el, done)
    else done()
}
onBeforeUnmount(() => { annullaPrecarico?.(); composerFlip.value?.chiudi() })

function resizePrompt(): void {
    const field = promptField.value
    if (!field) return
    /*
     * ⭐ Owner 27/10/2026, mockup approvato: a riposo il compositore è UNA riga anche con una bozza. L'altezza la dà il CSS
     *    (`.is-compact`, una riga); qui si toglie quella scritta a mano e la barra di scorrimento, che su una riga sola
     *    mostrerebbe un pezzo di freccia. Al fuoco il campo torna a crescere col testo.
     */
    field.style.overflowY = composerCompact.value ? 'hidden' : ''
    if (composerCompact.value) { field.style.height = ''; measurePromptTall(field); return }
    field.style.height = 'auto'
    /*
     * ⛔ Anche il pavimento CSS va tolto PRIMA di misurare: `scrollHeight` lo
     *    include, quindi un campo vuoto riportava 56 px di contenuto che non
     *    esiste — e arrotondati in su diventavano 76,8, cioe' TRE righe per un
     *    campo in cui non c'e' scritto niente. Misurato sul Pad il 13/09, ed e'
     *    l'altezza che l'owner ha visto come «troppo alto».
     */
    const minimoScritto = field.style.minHeight
    field.style.minHeight = '0px'
    const rem = Number.parseFloat(getComputedStyle(document.documentElement).fontSize) || 16
    /*
     * ⛔ Owner 2026-09-13: «i pulsanti e il testo non sono centrati bene nel
     *    container composer». MISURATO col Pad in verticale (CDP): contenitore
     *    alto 73,5 px per un campo di 56, con dentro UNA riga da 28 — e i
     *    comandi 16,8 px sopra il centro, 4 px fuori dal riquadro in cima.
     *
     * Il pavimento di 3,5rem serve al campo che CRESCE, per non farlo sobbalzare
     * mentre si scrive. A riposo — campo vuoto, nessun fuoco, nessun allegato —
     * non c'e' niente da stabilizzare: quel pavimento aggiunge solo aria sotto
     * il testo, e la riga dei comandi galleggia in alto dentro di essa.
     * ⇒ A riposo la scatola vale UNA RIGA, e il CSS (.is-compact) la centra.
     */
    const stile = getComputedStyle(field)
    const riga = Number.parseFloat(stile.lineHeight) || rem * 1.75
    /*
     * Owner 13/09: «il composer espanso e' troppo alto». Il pavimento e' UNA
     * RIGA anche a fuoco, nella barra agganciata.
     *
     * Il pavimento di due righe l'avevo messo per «dare peso» alla scatola, e
     * misurandolo si e' visto che non paga: a campo vuoto il placeholder sta
     * sulla prima riga e sotto resta una riga vuota, cioe' il testo finisce
     * 12,8 px sopra i comandi — che sono centrati, come l'owner ha chiesto.
     * Una riga e' insieme piu' bassa e allineata, e il campo cresce da solo
     * appena si scrive: e' cio' che fa un campo che cresce.
     *
     * La home resta piu' generosa: li' il compositore e' l'elemento principale
     * della pagina vuota, non una barra in fondo.
     */
    const floor = props.docked ? riga : 3 * riga
    /*
     * ⛔ Owner 2026-09-13, terzo difetto della stessa superficie: l'ultima riga
     *    si vedeva TAGLIATA A META'. Misurato sul Pad: campo 192 px, riga 25,6
     *    → 7,5 righe, resto 12,8 px. Il tetto di 12rem non e' un multiplo della
     *    riga, e mezza riga di testo resta appesa sotto il bordo.
     *
     * ⇒ La scatola vale sempre un numero INTERO di righe: il tetto si arrotonda
     *   in GIU' (una riga mozzata non si mostra), il contenuto in SU (se no
     *   taglierebbe proprio la riga che si sta scrivendo).
     *
     * ⛔ scrollHeight include il padding verticale: si sottrae prima di contare
     *   le righe e si riaggiunge dopo. Oggi vale 0, ma la cura non deve
     *   dipendere da un valore che qualcuno potrebbe cambiare domani.
     */
    const passo = (Number.parseFloat(stile.paddingTop) || 0) + (Number.parseFloat(stile.paddingBottom) || 0)
    /*
     * ⛔ La tolleranza non e' una comodita': e' l'errore di misura del browser.
     *    `scrollHeight` e' un INTERO, quindi una riga da 25,6 px viene
     *    dichiarata 26 — e 26/25,6 = 1,0156, che arrotondato in su fa DUE righe.
     *    Misurato sul Pad: un campo vuoto risultava alto 51,2 px per mezzo pixel
     *    di arrotondamento altrui. Si concede il 5% di una riga (1,28 px), che
     *    copre l'intero senza mai nascondere del testo vero.
     * ⛔ E vale SOLO quando si sale: applicata al tetto lo abbasserebbe di una
     *    riga proprio quando il tetto e' un multiplo esatto.
     */
    const TOLLERANZA_RIGA = 0.05
    const aRighe = (px: number, verso: (n: number) => number, tolleranza = 0): number =>
        Math.max(riga, verso((px - passo) / riga - tolleranza) * riga) + passo
    const tetto = aRighe(12 * rem, Math.floor)
    const contenuto = aRighe(field.scrollHeight, Math.ceil, TOLLERANZA_RIGA)
    field.style.height = Math.max(floor, Math.min(contenuto, tetto)) + 'px'
    field.style.minHeight = minimoScritto
    measurePromptTall(field)
}

/**
 * Owner 2026-08-27 — il pulsante "espandi a tutto schermo" compare solo
 * oltre 2-3 righe, per non affollare la barra su un messaggio corto.
 * MISURATO, non contato a caratteri: stesso principio già usato altrove nel
 * repo per la stessa identica domanda ("questo campo è alto più di una
 * riga?") — vedi `TalosBarraRoot.vue::misuraIlCampo`. `scrollHeight` include
 * il padding verticale, quindi va sottratto prima di confrontarlo con
 * `lineHeight`; la soglia sale a 2.5 righe (contro l'1.5 della barra)
 * perché qui l'intento è "testo grande", non "più di una riga sola".
 */
const promptTall = ref(false)
function measurePromptTall(field: HTMLTextAreaElement): void {
    const style = getComputedStyle(field)
    const lineHeight = Number.parseFloat(style.lineHeight) || 24
    const padding = (Number.parseFloat(style.paddingTop) || 0)
        + (Number.parseFloat(style.paddingBottom) || 0)
    promptTall.value = (field.scrollHeight - padding) > lineHeight * 2.5
}

const composerExpanded = ref(false)
function openComposerExpanded(): void {
    composerExpanded.value = true
}
function closeComposerExpanded(): void {
    composerExpanded.value = false
    // Owner 2026-08-27: chi collassa vuole continuare a scrivere lì dove
    // era rimasto — il ripristino del focus di `useTalosModalSurface` da
    // solo tornerebbe sul bottone che ha aperto l'overlay, non sul campo.
    void nextTick(() => promptField.value?.focus())
}
function updatePrompt(event: Event): void {
    const field = event.currentTarget as HTMLTextAreaElement
    emit('update:prompt', field.value)
    resizePrompt()
}

/**
 * One tap, one message.
 *
 * Owner 2026-07-27 caught the same prompt sent twice. `props.sending` was the
 * only guard, and the parent raises it AFTER the emit — so between the two
 * there is a window where a second event (a blur that produces an extra click,
 * a fast double tap) passes untouched. The gate closes on this very tick and
 * reopens when the answer ends, or after a grace period if the send never
 * started at all.
 */
const sendGate = createTalosSendGate()
watch(() => props.sending, (sending) => sendGate.observeSending(sending))

/**
 * ⭐ B3 — un tocco, una voce in coda. Lo stesso cancello dell'invio, ma a giro vivo `sending` non cambia mai e non lo
 * può riaprire: lo riapre un testo NUOVO nel campo (il genitore lo svuota dopo un Accoda riuscito), oppure il periodo
 * di grazia se il genitore ha rifiutato e il testo è rimasto.
 */
const queueGate = createTalosSendGate()
watch(() => props.prompt, () => queueGate.observeSending(false))

function requestQueue(value = promptField.value?.value ?? props.prompt): void {
    if (!props.canQueue || !value.trim()) return
    if (!queueGate.claim(performance.now())) return
    emit('queue', value)
}

function requestSend(value = promptField.value?.value ?? props.prompt): void {
    // ⭐ B3 (D-B3-01): mentre l'app risponde l'Invio ACCODA — e se non si può, non fa niente (il motivo è a schermo).
    if (queueMode.value && !dictating.value) {
        requestQueue(value)
        return
    }
    if (!props.canSend || props.sending || attachmentBlocked.value
        || (!value.trim() && !hasAuthorizedAttachment.value)) return
    if (!sendGate.claim(performance.now())) return
    emit('send')
}

function onPromptKeydown(event: KeyboardEvent): void {
    if (slashMenuOpen.value && !event.isComposing) {
        const count = slashCommandCount.value
        if (event.key === 'Escape') {
            event.preventDefault()
            emit('update:prompt', '')
            return
        }
        if (count > 0 && ['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
            event.preventDefault()
            if (event.key === 'Home') slashActiveIndex.value = 0
            else if (event.key === 'End') slashActiveIndex.value = count - 1
            else if (event.key === 'ArrowDown') slashActiveIndex.value = (slashActiveIndex.value + 1) % count
            else slashActiveIndex.value = (slashActiveIndex.value - 1 + count) % count
            return
        }
        if (event.key === 'Enter' && !event.shiftKey) {
            event.preventDefault()
            slashMenu.value?.activateSelected()
            return
        }
    }
    if (event.key !== 'Enter' || event.shiftKey || event.isComposing) return
    event.preventDefault()
    requestSend((event.currentTarget as HTMLTextAreaElement).value)
}

function requestPromptEnhancement(): void {
    if (props.enhancingPrompt || props.sending) return
    const reason = enhanceUnavailableReason.value
    if (reason) {
        emit('enhanceBlocked', reason)
        return
    }
    modelPickerOpen.value = false
    /*
     * Aprire NON fa piu' partire.
     *
     * Owner 2026-08-04: «prima che parta l'enhancing bisogna selezionare
     * modello e ragionamento ove previsto, e il tono». Prima il drawer si
     * apriva e la spesa era gia' partita: chi voleva un modello diverso
     * scopriva di non poterlo scegliere mentre il conto correva.
     */
    enhancerDrawerOpen.value = true
}

// Manual dismissal of the enhancer drawer abandons the enhancement; the
// parent clears its state, which is also what closes the drawer after a
// decision (insert/replace/cancel) — popover-parity semantics.
function dismissEnhancerDrawer(): void {
    enhancerDrawerOpen.value = false
    if (props.enhancingPrompt || props.promptEnhancementError || props.promptEnhancement) {
        emit('cancelPromptEnhancement')
    }
}

function selectSlashCommand(commandId: TalosMobileCommandId): void {
    emit('selectSlashCommand', commandId)
}

function updateSlashCommandCount(count: number): void {
    slashCommandCount.value = count
    if (count === 0) slashActiveIndex.value = 0
    else slashActiveIndex.value = Math.min(slashActiveIndex.value, count - 1)
}

async function toggleModelPicker(): Promise<void> {
    modelPickerOpen.value = !modelPickerOpen.value
}

function focusTrigger(trigger: ComponentPublicInstance | HTMLElement | null): void {
    const element = trigger instanceof HTMLElement ? trigger : (trigger?.$el as HTMLElement | undefined)
    element?.focus()
}

async function closeModelPicker(): Promise<void> {
    modelPickerOpen.value = false
    await nextTick()
    focusTrigger(modelTrigger.value)
}

/**
 * Choosing something inside the drawer does NOT dismiss it.
 *
 * Owner 2026-07-27: "fai in modo che il drawer modello non si chiuda ogni volta
 * che clicco su una cosa dentro". Every selection used to close it — model,
 * routing profile AND effort — which makes a sheet titled "Model & reasoning"
 * unusable: it is a configuration surface, not a menu, and picking a model then
 * wanting a different effort meant opening it twice. The sheet already has a
 * close affordance; leaving is the user's decision, not a side effect of
 * adjusting something.
 */
function selectModelProfile(profileId: string): void {
    emit('selectModelProfile', profileId)
}

function selectRoutingProfile(profileId: string): void {
    emit('selectModelRoutingProfile', profileId)
}

function selectEffort(level: TalosMobileEffortLevel): void {
    emit('selectEffort', level)
}

watch(
    () => Boolean(props.enhancingPrompt || props.promptEnhancementError || props.promptEnhancement),
    (active) => { if (!active) enhancerDrawerOpen.value = false },
)

function focusPrompt(atEnd = false): boolean {
    const field = promptField.value
    if (!field || field.disabled) return false
    field.focus()
    if (atEnd) field.setSelectionRange(field.value.length, field.value.length)
    return document.activeElement === field
}

// `openPlus` esce per le chip di prompt della home (Fase 2 Calm, 12/09):
// «Analizza un file» e «Altro» aprono il foglio «Aggiungi alla chat» — lo
// stesso del «+», non un secondo.
/** ⛔ ERRCOD (30/09/2026): la scheda d'errore del Codice apre il selettore dei modelli («Pick another model»). */
function openModelPicker(): void {
    modelPickerOpen.value = true
}

defineExpose({ focusPrompt, openPlus, openModelPicker, closeModelPicker })

watch(() => [props.prompt, props.docked, dictating.value], () => {
    slashActiveIndex.value = 0
    if (slashMenuOpen.value) modelPickerOpen.value = false
    nextTick(resizePrompt)
}, { immediate: true })
</script>

<template>
    <section
        ref="composerRoot"
        data-testid="talos-mobile-composer"
        class="talos-calm-composer"
        :class="{ 'is-compact': composerCompact, 'is-docked': docked, 'is-dictating': dictating }"
        :data-talos-composer-compact="composerCompact ? 'true' : 'false'"
        :aria-label="$t('chat.composer')"
        @focusout="onComposerFocusOut"
        @pointerdown.capture="caricaRegista"
        @focusin="caricaRegista"
    >
        <div
            v-if="slashMenuOpen"
            id="talos-mobile-slash-command-popover"
            class="absolute bottom-full left-0 right-0 z-50 mb-2"
        >
            <TalosMobileSlashCommandMenu
                ref="slashMenu"
                :commands="comandiSlashDellaChat"
                :query="prompt"
                :active-index="slashActiveIndex"
                @selected="selectSlashCommand"
                @filtered-count="updateSlashCommandCount"
            />
        </div>

        <TalosMobileAttachmentTray
            v-if="attachments.length || attachmentBusy || attachmentError"
            :items="attachments"
            :busy="attachmentBusy"
            :error="attachmentError"
            @remove="emit('removeAttachment', $event)"
            @dismiss-error="emit('dismissAttachmentError')"
        />

        <!-- Owner 12/09 20:10: «levi ricerca web dal drawer e dalla chat in generale» —
             la pillola del link rilevato (mondo + apri) non c'e' piu'. -->

        <!--
            Mentre si detta il compositore ha UNA cosa da mostrare.
            Owner 2026-08-04: «vorrei che il campo testo venisse nascosto mentre
            registri, in modo che si veda solo la barra di registrazione. Al
            momento si vedono entrambi e risulta ripetitivo.» Aveva ragione: nel
            campo non si scrive mentre si parla, quindi occupava spazio per non
            offrire niente.

            La forma viene dal riferimento che ha passato (Claude mobile): due
            comandi soli, opposti, agli estremi — uno butta, uno tiene — e in
            mezzo l'onda che reagisce alla voce, che e' l'unica cosa che dice
            «ti sto sentendo».
        -->
        <!-- ⛔ DET-FUORI (owner 18/10/2026): le parole mentre le dici stanno SOPRA il compositore, fuori dalla barra gialla, sulla
             sfumatura che già copre i messaggi; la barra tiene solo onda e comandi. -->
        <div
            v-if="dictating && props.dictationTranscript.trim()"
            data-testid="talos-dictation-fuori"
            class="pointer-events-none absolute bottom-full left-0 right-0 mb-2"
        >
            <TalosSciaParole :testo="props.dictationTranscript" />
        </div>
        <TalosMobileDictationBar
            v-if="dictationListening || dictationStarting"
            :avvio="dictationStarting"
            :livello="dictationLevel"
            :trascrizione="dictationTranscript"
            :bozza="props.prompt"
            @annulla="emit('discardDictation')"
            @ferma="emit('toggleDictation')"
            @invia="emit('sendDictation')"
        />

        <!--
            Owner 2026-09-13, dal Pad: invio dinamico, solo microfono o invio a
            seconda del testo immesso, come il vecchio compositore, e accanto al
            campo.

            UN solo comando, alla destra del campo: microfono finche' il campo
            e' vuoto, invio appena c'e' del testo, stop mentre TALOS risponde o
            mentre si detta. Il secondo microfono che accodava (2026-08-27) non
            c'e' piu': con del testo scritto il comando e' Invia, come nel
            vecchio compositore che l'owner ha chiesto di riavere.
        -->
        <!--
            ⛔⛔ 2026-09-13, owner dal Pad con foto: MENTRE SI DETTA IL COMANDO
            NON C'E'. La barra di registrazione ha gia' i suoi tre comandi
            (annulla, ferma, invia); lasciare qui il tondo accento significava
            DUE pulsanti di stop uno sotto l'altro, il secondo da solo su una
            riga vuota perche' il campo sparisce.

            E' la stessa regola dell'owner del 2026-08-04 sul campo di testo:
            mentre si registra il compositore ha UNA cosa da mostrare. Il campo
            spariva gia'; il comando no, e l'ho visto solo quando me l'ha
            mostrato lui.
        -->
        <!--
            ⭐ «Rivedi N azioni» (A3-OSS-2): owner 28/10/2026, versione 7 del mockup approvata. Una riga sua IN CIMA, a riposo e aperto:
            un permesso in attesa non sparisce mai dalla vista, e nella riga dei comandi (a 393 dp) schiacciava il chip in «G Alto».
        -->
        <button
            v-if="toolReviewCount > 0 && !dictating" type="button" data-testid="talos-composer-tool-review"
            class="talos-pressable mb-2 flex min-h-touch w-full items-center gap-2 rounded-2xl bg-[var(--talos-accent-soft)] px-3 text-left text-sm font-semibold text-[var(--talos-text)]"
            @pointerdown.prevent @click="emit('reviewTools')"
        >
            <ShieldQuestionMark class="size-4 shrink-0 text-[var(--talos-warning)]" aria-hidden="true" />
            <span class="min-w-0 flex-1 truncate">{{ $t('chat.reviewToolActions', { count: toolReviewCount }) }}</span>
            <ChevronRight class="size-4 shrink-0" aria-hidden="true" />
        </button>

        <!--
            ⭐ IL COMPOSITORE DEL MOCKUP APPROVATO (owner 27/10/2026 «Approvato», versione 6; 28/10 «Vanno bene», versione 7).
            UNA griglia: il campo è sempre lo stesso elemento e non cambia mai contenitore (rimontato perderebbe il fuoco e il
            compositore si richiuderebbe). Cambiano solo le posizioni (style.css, `.talos-composer-field-row`):
              · a riposo una riga: «+» · campo (una bozza resta su una riga) · [scudo, se chi monta lo chiede] · microfono · invio;
              · aperto: il campo sopra a tutta larghezza con, in alto a destra, scudo ed «Espandi»; sotto «+» · chip · Libreria · … ·
                microfono (o Accoda) · invio (o Ferma, senza numeri: il tempo lo dice la riga in corso).
            Mentre si detta la riga non c'è (owner 04/08 e 13/09: il compositore ha UNA cosa da mostrare, la barra).
        -->
        <div v-if="!dictating" class="talos-composer-field-row" :class="{ 'is-aperto': !composerCompact, 'has-alto': altoVisibile }">
            <Button
                ref="plusTrigger" type="button" size="icon" variant="ghost"
                data-testid="talos-composer-plus" data-mobile-icon-only="true"
                :aria-label="$t('chat.addToChat')" aria-haspopup="dialog"
                :aria-describedby="libreriaAccesa ? idLibreriaSulPiu : undefined"
                :aria-expanded="toolDrawerOpen"
                class="talos-pressable talos-plus-btn min-h-touch min-w-touch" data-talos-flip="piu"
                :style="libreriaAccesa ? { position: 'relative' } : undefined"
                @pointerdown.prevent @click="openPlus"
            ><Plus class="size-5" aria-hidden="true" /><span
                v-if="libreriaAccesa" data-testid="talos-composer-plus-dot" aria-hidden="true"
                :style="{ position: 'absolute', top: '0.55rem', right: '0.55rem', width: '0.5rem', height: '0.5rem', borderRadius: '9999px', background: 'var(--talos-accent)', boxShadow: '0 0 0 2px var(--talos-composer-surface, var(--talos-card))' }"
            /><span v-if="libreriaAccesa" :id="idLibreriaSulPiu" class="sr-only">{{ libraryChipLabel }}</span></Button>
            <textarea
                ref="promptField"
                :value="prompt"
                rows="1"
                data-testid="talos-composer-prompt"
                :aria-label="$t('chat.messagePlaceholder')"
                :placeholder="$t('chat.messagePlaceholderEllipsis')"
                class="talos-calm-prompt" data-talos-flip="campo"
                @input="updatePrompt"
                @keydown="onPromptKeydown"
                @focus="composerFocused = true"
                @blur="onComposerFocusOut"
            />
            <!-- In alto a destra (aperto): lo scudo del permesso del Codice (slot «permesso») ed «Espandi» quando il testo è alto.
                 A riposo solo lo scudo, e solo se chi monta il compositore lo chiede (Codice: «Accesso pieno» o modalità piano). -->
            <Transition :css="false" @leave="esciInDissolvenza">
            <div
                v-if="altoVisibile"
                class="talos-composer-alto" data-testid="talos-composer-alto" data-talos-flip-nuovo="alto"
            >
                <slot v-if="!composerCompact || permessoARiposo" name="permesso" />
                <Button
                    v-if="promptTall && !composerCompact" type="button" size="icon" variant="ghost"
                    data-testid="talos-composer-expand" data-mobile-icon-only="true"
                    :aria-label="$t('chat.expandComposer')" :title="$t('chat.expandComposer')"
                    class="talos-pressable min-h-touch min-w-touch"
                    @pointerdown.prevent @click="openComposerExpanded"
                ><Maximize2 class="size-4" aria-hidden="true" /></Button>
            </div>
            </Transition>
            <Transition :css="false" @leave="esciInDissolvenza">
            <div v-if="!composerCompact" class="talos-composer-tools" data-testid="talos-composer-tools" data-talos-flip-nuovo="strumenti">
                <button
                    ref="modelTrigger" type="button" data-testid="talos-composer-model-chip"
                    :aria-label="modelChipLabel" :title="modelTitle"
                    aria-haspopup="dialog" :aria-expanded="modelPickerOpen"
                    class="talos-pressable talos-model-chip min-h-touch"
                    @pointerdown.prevent @click="toggleModelPicker"
                >
                    <!-- Owner 27/10/2026, mockup approvato: il chip è «come Claude, senza icona» — a 360 dp l'icona del fornitore lasciava
                         al nome un carattere solo. Resta il puntino «chi paga» di D-0147-UI-2, lo stesso della riga del piano nel
                         selettore, ora davanti al nome. Solo classi già usate altrove: il compositore sta nel pezzo d'avvio. -->
                    <span v-if="selectedProfile && !selectedRoute" class="talos-model-chip__logo" aria-hidden="true">
                        <TalosMobileProviderIcon :provider="selectedProfile.provider" compatto />
                        <!-- il puntino «chi paga» (D-0147-UI-2) sta sull'angolo del logo -->
                        <span
                            v-if="pianoChatgpt" data-testid="talos-composer-model-plan-dot" :data-stato="pianoChatgpt" aria-hidden="true"
                            class="talos-model-chip__piano"
                            :style="pianoChatgpt === 'limite' ? { boxShadow: 'inset 0 0 0 2px var(--talos-plan-dot-limit)' } : { background: 'var(--talos-plan-dot)' }"
                        />
                    </span>
                    <span class="talos-model-chip__nome">{{ selectedRoute?.name ?? nomeBreve ?? $t('chat.chooseModel') }}</span>
                    <span
                        v-if="livelloNelChip && !selectedRoute"
                        data-testid="talos-composer-model-level"
                        class="shrink-0 text-[var(--talos-muted)]"
                        :data-livello="lancetta?.livello" :data-auto="lancetta?.auto ? 'true' : undefined"
                    ><template v-if="lancetta"><TalosMobileLancettaRagionamento :livello="lancetta.livello" :auto="lancetta.auto" /><span class="sr-only">{{ livelloNelChip }}</span></template><template v-else>{{ livelloNelChip }}</template></span>
                </button>
                <!-- ⭐ Owner 28/10/2026 («Approvo»): la Libreria non sta più in questa riga (il suo tondo pieno schiacciava il nome del
                     modello). Accesa, è un pallino sul «+»; si apre dalla voce del foglio del «+» (LEGGERA-03/04). -->
                <!-- Owner 12-13/09, dal Pad: niente «Ragiona», «Agente», «Naviga» qui (la scelta del ragionamento vive nel foglio del
                     modello, gli attrezzi nel controller). Lo slot di chi monta (la pastiglia del piano nel tablet). -->
                <slot />
            </div>
            </Transition>
            <!-- Il microfono è un comando SUO, sempre accanto all'invio (mockup approvato; assistant-ui `mobile-composer.tsx:77-138`).
                 Durante il giro è spento (come nel mockup); col testo gli prende il posto Accoda, ACCANTO a Ferma, e Ferma sta
                 all'estremo destro: è la posizione del mockup approvato (owner 27/10/2026). D-B3-01 decide solo i ruoli — Accoda
                 principale, Ferma secondario (`is-secondary`) — non il posto. -->
            <Button
                v-if="!queueOffered"
                data-testid="talos-composer-mic" type="button" size="icon" variant="ghost" data-mobile-icon-only="true"
                :aria-label="$t('chat.dictate')" :title="microphoneReason || $t('chat.dictate')"
                :disabled="!dictationSupported || sending"
                class="talos-pressable talos-mic-btn min-h-touch min-w-touch" data-talos-flip="microfono"
                @pointerdown.prevent @click="onMicrophone"
            ><Mic class="size-5" aria-hidden="true" /></Button>
            <!-- ⭐ B3 (D-B3-01): Accoda, col testo durante il giro. Spento resta visibile: `aria-disabled` lo tiene raggiungibile e
                 il motivo è scritto sotto, non solo nel title. -->
            <Button
                v-if="queueOffered"
                data-testid="talos-composer-queue" type="button" size="icon" variant="ghost" data-mobile-icon-only="true"
                :aria-label="$t('chat.queue')" :title="queueTitle"
                :aria-disabled="queueBlocked ? 'true' : undefined"
                :aria-describedby="queueBlocked && queueDisabledReason ? 'talos-composer-queue-reason' : undefined"
                class="talos-pressable talos-send-btn min-h-touch min-w-touch" data-talos-flip="accoda"
                :class="{ 'is-blocked': queueBlocked }"
                @pointerdown.prevent @click="requestQueue()"
            ><ListPlus class="size-5" aria-hidden="true" /></Button>
            <!-- Invio (spento a campo vuoto) o Ferma durante il giro. ⭐ B3: accanto ad Accoda lo Stop diventa SECONDARIO (fondo
                 neutro): l'azione principale della riga, e il colore accento, passano ad Accoda. -->
            <Button
                v-if="showRightAction"
                data-testid="talos-composer-action" type="button" size="icon" variant="ghost" data-mobile-icon-only="true"
                :aria-label="rightActionLabel" :title="rightActionTitle"
                :data-talos-action="rightAction"
                :disabled="rightActionDisabled" class="talos-pressable talos-send-btn min-h-touch min-w-touch" data-talos-flip="azione"
                :class="{ 'is-secondary': queueOffered && rightAction === 'stop' }"
                @pointerdown.prevent @click="onRightAction"
            >
                <Square v-if="rightAction === 'stop' || rightAction === 'dictating'" class="size-4" fill="currentColor" aria-hidden="true" />
                <ArrowUp v-else class="size-5" aria-hidden="true" />
            </Button>
        </div>
        <p v-if="microphoneReason" data-testid="talos-composer-mic-reason" class="text-xs text-[var(--talos-muted)]">{{ microphoneReason }}</p>

        <!--
            The reason the composer will not send, where eyes can find it.

            It was announced to screen readers and hung on the Send button's
            `title` — which on a phone nobody can hover, and which is not there
            at all while the composer is empty and the right button is the Mic.
            So a person met a composer that silently refused and said nothing.

            Owner 2026-08-03 hit the same shape twice in one day: the dead
            «Avvia» in the research setup, and a new chat that would not send
            because another one was still answering. Both were controls that
            declined without explaining.

            Only when it is genuinely blocked: `sending` has its own visible
            state (the Stop button), and repeating "processing" under it would
            be noise.
        -->
        <p
            v-if="!sending && sendDisabledReason"
            data-testid="talos-composer-blocked-reason"
            class="px-1 pt-1 text-2xs leading-5 text-[var(--talos-muted)]"
        >{{ sendDisabledReason }}</p>
        <!-- ⭐ B3: perché Accoda è spento, dove l'occhio lo trova (un title al telefono non lo legge nessuno). -->
        <p
            v-if="queueOffered && queueBlocked && queueDisabledReason"
            id="talos-composer-queue-reason"
            data-testid="talos-composer-queue-reason"
            class="px-1 pt-1 text-2xs leading-5 text-[var(--talos-muted)]"
        >{{ queueDisabledReason }}</p>

        <span class="sr-only" role="status" aria-live="polite">{{ statusText }}</span>

        <!-- Lo stesso foglio «Aggiungi alla chat» per tutte le preferenze legacy. -->
        <TalosMobileComposerDrawer
            v-if="toolDrawerOpen"
            :can-enhance="canRequestEnhancement"
            :enhance-reason="enhanceUnavailableReason"
            :thinking="thinking"
            :supports-thinking="supportsThinking"
            :effort-levels="selectedProfile?.effort_levels ?? []"
            :selected-effort="selectedEffort ?? ''"
            :attachment-disabled-reason="attachmentReason"
            :context-disabled-reason="contextReason"
            :enhancing="enhancingPrompt || sending"
            :attachments-available="attachmentsAvailable"
            :context-available="contextAvailable"
            :agent-tools-enabled="agentToolsEnabled"
            :harness-available="harnessAvailable"
            :library-turn-available="showLibraryChip"
            :library-turn-subtitle="`${libraryModeLabel} · ${librarySourceCountLabel}`"
            @close="closeToolDrawer"
            @open-library-turn="librarySheetOpen = true"
            @preset="emit('preset', $event)"
            @navigate="emit('navigate', $event)"
            @set-agent-tools-enabled="emit('setAgentToolsEnabled', $event)"
            @attach="emit('attach')"
            @take-photo="emit('takePhoto')"
            @pick-photos="emit('pickPhotos')"
            @open-context="emit('openContext')"
            @open-model-lab="emit('openModelLab')"
            @select-thinking="emit('selectThinking', $event)"
            @select-effort="emit('selectEffort', $event)"
            @enhance-prompt="requestPromptEnhancement"
        />

        <TalosMobileModelEffortDrawer
            v-if="modelPickerOpen"
            :model-profiles="modelProfiles"
            :routing-profiles="routingProfiles"
            :selected-model-profile-id="selectedModelProfileId"
            :opening-model-profile-id="openingModelProfileId"
            :piano-chatgpt="pianoChatgpt"
            :selected-routing-profile-id="selectedRoutingProfileId"
            :thinking="thinking"
            :selected-effort="selectedEffort"
            :reasoning-wire="reasoningWire"
            :thinking-separate="thinkingSeparate"
            :loading-models="loadingModels"
            :loading-routes="loadingRoutes"
            :refreshing-models="refreshingModels"
            :discovery-problems="discoveryProblems"
            :show-model-lab="showModelLab"
            :show-executor-model="showExecutorModel"
            :executor-model-profiles="executorModelProfiles"
            :selected-executor-model-profile-id="selectedExecutorModelProfileId"
            @close="closeModelPicker"
            @select-model-profile="selectModelProfile"
            @select-model-routing-profile="selectRoutingProfile"
            @select-thinking="emit('selectThinking', $event)"
            @select-effort="selectEffort"
            @refresh-models="emit('refreshModels')"
            @select-executor-model-profile="emit('selectExecutorModelProfile', $event)"
            @open-model-lab="modelPickerOpen = false; emit('openModelLab')"
        />

        <TalosMobileEnhancerDrawer
            v-if="enhancerDrawerOpen"
            :enhancing="enhancingPrompt ?? false"
            :error="promptEnhancementError ?? ''"
            :result="promptEnhancement ?? null"
            :model-title="modelTitle"
            :depth="enhancerDepth"
            :model="enhancerModel"
            :effort="enhancerEffort"
            :models="enhancerModels"
            @start="emit('enhancePrompt')"
            @update:depth="(value) => emit('updateEnhancerDepth', value)"
            @update:model="(value) => emit('updateEnhancerModel', value)"
            @update:effort="(value) => emit('updateEnhancerEffort', value)"
            @close="dismissEnhancerDrawer"
            @cancel="emit('cancelPromptEnhancement')"
            @insert="emit('insertPromptEnhancement')"
            @replace="emit('replacePromptEnhancement')"
        />

        <TalosMobileLibraryContextSheet
            v-if="librarySheetOpen"
            :effective-enabled="libraryContextEnabled"
            :effective-mode="libraryContextMode"
            :override="libraryTurnOverride"
            :files="libraryFiles"
            @close="closeLibrarySheet"
            @update:override="emit('updateLibraryTurnOverride', $event)"
        />

        <TalosMobileComposerExpanded
            v-if="composerExpanded"
            :prompt="prompt"
            :sending="sending"
            :can-submit="canSubmit"
            :agenti-da-fermare="agentiDaFermare"
            @update:prompt="emit('update:prompt', $event)"
            @send="requestSend(prompt); closeComposerExpanded()"
            @stop="emit('stop')"
            @close="closeComposerExpanded"
        />
    </section>
</template>

<style>
/*
 * ⭐ B3 (24/09) — Stop e Accoda nella stessa riga. Una sola azione principale per riga: Accoda tiene il contenitore
 * accento del comando di destra (style.css, `.talos-calm-composer .talos-send-btn`), lo Stop accanto passa al fondo
 * neutro dei controlli di servizio. Accoda spento ha l'aspetto dell'invio spento (`:disabled` in style.css): con
 * `aria-disabled` il selettore `:disabled` non scatta, quindi lo si ripete qui.
 */
.talos-calm-composer .talos-send-btn.is-secondary {
    background: var(--talos-secondary, var(--talos-panel));
    color: var(--talos-text);
}
.talos-calm-composer .talos-send-btn.is-blocked { background: transparent; color: var(--talos-muted); opacity: .5; }
@media (hover: hover) and (pointer: fine) {
    .talos-calm-composer .talos-send-btn.is-secondary:hover:not(:disabled) { background: var(--talos-active); color: var(--talos-text); }
    .talos-calm-composer .talos-send-btn.is-blocked:hover:not(:disabled) { background: transparent; color: var(--talos-muted); }
}

/* Il compositore resta scorrevole anche quando la tastiera lascia solo 180 px. */
@media (orientation: landscape) and (max-height: 180px) {
    [data-testid="talos-mobile-composer"] {
        max-height: calc(100dvh - env(safe-area-inset-top));
        overflow-y: auto;
    }
    [data-testid="talos-mobile-composer"] textarea {
        height: 48px !important;
        min-height: 48px !important;
    }
    /* D1: qui il campo è alto 48 px; senza respiro il testo stava in cima, sopra il centro delle icone */
    [data-testid="talos-mobile-composer"] .is-aperto > .talos-calm-prompt { box-sizing: border-box; padding-block: 0.75rem; }
}

/* ⛔ D1 (Pad 28/10/2026, telefono orizzontale con la tastiera: 148 px) — aperto su due righe il compositore finiva sotto la barra di stato
   e i comandi uscivano dal bordo. In tutto il telefono in ORIZZONTALE (non solo a tastiera già aperta: misurato sul Pad, l'apertura
   scorreva fino alle due righe e poi, arrivata la tastiera, saltava a una) aperto resta su UNA riga; il chip cede lo spazio coi puntini
   (BASSO-01/02). Solo il TELEFONO: il tablet in orizzontale con la tastiera è alto 493 px ma largo 1292, e lì le due righe ci stanno
   (vc327 sul Pad: senza il limite di larghezza saltava da due righe a una quando arrivava la tastiera). */
@media (orientation: landscape) and (max-height: 500px) and (max-width: 1100px) {
    [data-testid="talos-mobile-composer"] .talos-composer-field-row.is-aperto { display: flex; }
    [data-testid="talos-mobile-composer"] .is-aperto > .talos-calm-prompt { grid-area: auto; flex: 1 1 45%; min-width: 7rem; }
    [data-testid="talos-mobile-composer"] .is-aperto > .talos-composer-alto { flex-direction: row; align-self: center; }
    [data-testid="talos-mobile-composer"] .is-aperto > .talos-composer-tools { flex: 0 1 auto; min-width: 0; }
}
</style>
