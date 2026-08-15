<script setup lang="ts">
import { Eye, EyeOff } from '@lucide/vue'
import { talosIsEphemeralSessionId } from '@/lib/chat/ephemeralSession'
import { talosChatDiscardedByModeSwitch } from '@/lib/chat/modeSwitch'
import { talosTemporaryWelcome } from '@/lib/chat/temporaryWelcome'
import { computed, defineAsyncComponent, h, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { ArrowDown, AlertTriangle, CheckCircle2, Circle, Globe2, LoaderCircle, X } from '@lucide/vue'
import { useRouter } from 'vue-router'
import { useTalosI18n } from '@/i18n'
import { talosTranslatableErrorMessage } from '@/i18n/uiErrors'
import { Button } from '@/components/ui/button'
import TalosMobileComposer from '@/components/chat/TalosMobileComposer.vue'
import TalosMobileMessageList from '@/components/chat/TalosMobileMessageList.vue'
import { createTalosMobileComposerDraftController } from '@/composables/useTalosMobileComposerDraft'
import { useTalosMobileDictation } from '@/composables/useTalosMobileDictation'
import { useTalosSpeech } from '@/composables/useTalosSpeech'
import {
    resolveTalosDictationLanguageTag,
    talosRilevamentoAcceso,
} from '@/lib/dictationPolicy'
import { TALOS_PROMPT_ENHANCER_DEFAULT_DEPTH } from '@/lib/chat/promptEnhancerDepth'
import type { TalosMobileEffortLevel } from '@/lib/mobileEffort'
import { talosLightImpact } from '@/services/haptics'
import {
    createTalosManualBrowserActivity,
    extractTalosBrowserUrls,
} from '@/lib/browser/browserEvidence'
import type { TalosMobileCommandId } from '@/lib/mobileCommandRegistry'
import { newTalosMobileId } from '@/lib/mobileIds'
import {
    createTalosInAppBrowserService,
    type TalosInAppBrowserEvent,
} from '@/services/inAppBrowserService'
import { createSessionActionRunner } from '@/lib/sessionActionRunner'
import { createTalosChatLiveEdge } from '@/composables/useTalosChatLiveEdge'
import { useChatController } from '@/stores/chatController'
import { useSettingsStore } from '@/stores/settings'
import { talosComposerFlags } from '@/lib/composerStyle'
import { useTalosMobileToasts } from '@/stores/toasts'
import {
    parseTalosSessionLibraryContextPolicy,
    resolveTalosLibraryContextPolicy,
    type TalosLibraryTurnOverride,
} from '@/lib/chat/libraryPolicy'
import { isTalosLibraryFileShared, parseVaultOrigin } from '@/lib/vaultLibrary'

const TalosMobileBrowserActivity = defineAsyncComponent(
    () => import('@/components/chat/TalosMobileBrowserActivity.vue'),
)

// Chat is the base surface: a scrollable thread (brand hero when empty) over a
// bottom-docked composer. Local-first — the composer talks to the provider directly
// from the device via the controller (key from the OS keystore). Mirrors the desktop
// TalosComposerDock bottom dock (fixed + safe-area + reserved scroll padding).
// Defect #6: `/export` is a real command now, but the export sheet lives in the
// shell — the screen asks for it instead of duplicating the surface.
const emit = defineEmits<{ export: [] }>()

const router = useRouter()
const { t, locale } = useTalosI18n()
const controller = useChatController()

/**
 * ⛔ Le attese ANCORA aperte, per identificativo del punto di ripresa.
 *
 * La riga in chat che annuncia un'attesa e' un messaggio scritto una volta: da
 * sola non sa se quella richiesta e' stata poi risolta. Questo elenco e' la
 * verita' di adesso, e la riga la usa per non mentire e per portare alla scheda
 * invece di limitarsi ad annunciarla.
 *
 * Le due sorgenti stanno INSIEME perche' la persona non distingue — e non deve
 * distinguere — fra una richiesta nuova e una ripresa dopo un'interruzione.
 */
/**
 * L'archivio locale delle chat si sta ancora aprendo.
 *
 * `error` è escluso di proposito: quello NON è un'attesa, è un guasto, e ha già
 * la sua riga che dice cosa è andato storto. Un girello lì prometterebbe che
 * passa da sola una cosa che non passa.
 */
const archivioInCaricamento = computed(() =>
    chat.state.persistenceStatus === 'idle' || chat.state.persistenceStatus === 'loading')

/**
 * ⛔ Lo stesso fatto detto DUE volte, in due posti, con due parole diverse.
 *
 * Il girello al centro e la riga sotto il compositore dicono entrambi che
 * l'archivio si sta aprendo: quando c'è il girello, quella riga tace.
 *
 * ## Perché la condizione si è SEMPLIFICATA
 *
 * Prima c'era anche `&& chat.messages.length === 0`, e non era un capriccio: il
 * girello viveva dentro l'introduzione, che si vede solo a chat vuota. A chat
 * piena non compariva, e la riga restava l'unico segnale — toglierla avrebbe
 * lasciato il tasto invia spento senza spiegazione.
 *
 * Ora il girello è un overlay a tutto schermo e c'è **sempre** mentre
 * l'archivio si apre. ⇒ La riga è un doppione in entrambi i casi, e la
 * condizione che distingueva i due casi non ha più niente da distinguere.
 */
const motivoInvioSpento = computed(() =>
    archivioInCaricamento.value ? '' : sendDisabledReason.value)

const attesePendenti = computed<readonly string[]>(() => [
    ...controller.pendingToolAuthorizations.value.map((pending) => pending.checkpoint_id),
    ...controller.toolAuthorizationRecoveries.value.map((recovery) => recovery.checkpoint_id),
].filter((id): id is string => typeof id === 'string' && id.length > 0))
const settings = useSettingsStore()
// Two stored choices — the bar's shape and where the "+" opens — expanded here
// into the three flags the composer speaks. The mapping lives in one module, so
// there is exactly one place that decides which arrangements exist: the
// composer used to have to defend itself against a combination where the "+"
// opened nothing at all.
const composerShape = computed(() => talosComposerFlags(
    settings.state.shell.composer_shape,
    settings.state.shell.composer_plus,
))
const {
    profiles,
    refreshingModels,
    discoveryProblems,
    segretiLetti,
    cataloghiNonLetti,
    selectedModelId,
    effort,
    thinking,
    canSend,
    // Whose generation this is. The bare `sending` flag is the whole app's, and
    // reading it here put a Stop button on somebody else's answer.
    composerBusy,
    browseMode,
    sendDisabledReason,
    preferenceError,
    enhancingPrompt,
    promptEnhancement,
    promptEnhancementError,
    attachments,
    chat,
    selectModel,
    selectEffort,
    setThinking,
    init,
} = controller

const draft = createTalosMobileComposerDraftController({
    load: (scopeId) => chat.loadComposerDraft(scopeId),
    save: (scopeId, value) => chat.saveComposerDraft(value, scopeId),
    translate: t,
})
const prompt = draft.prompt
/**
 * Cosa c'era nel campo PRIMA di parlare.
 *
 * Serve perche' «annulla» annulli davvero: le trascrizioni arrivano nel campo
 * mentre si parla, quindi fermarsi e basta lascia dentro tutto quello che si e'
 * detto. Due comandi che fanno la stessa cosa sono un comando che mente.
 */
const dictationDraftBefore = ref('')

/**
 * ⭐⭐ SE HAI PARLATO, TI RISPONDE A VOCE — owner 2026-08-10.
 *
 * ⛔ Non è un rilevamento: è una PROVENIENZA. Quel testo l'ha scritto il motore
 * di dettatura, non la tastiera, e questo lo sappiamo per costruzione — nessuna
 * soglia, nessun falso positivo. Le regole storte (correggo a mano, cancello
 * tutto, annullo) stanno in `provenienzaVoce`, con i loro casi.
 */
const voce = ref<import('@/composables/useTalosRispostaAVoce').TalosRispostaAVoce | null>(null)
/**
 * ⛔ La lettura si ferma SUBITO, senza aspettare un import dinamico: fra il
 * tocco sul microfono e l'inizio dell'ascolto passano poche centinaia di
 * millisecondi, e in quella finestra la voce ruberebbe l'audio.
 */
const parlaSubito = () => useTalosSpeech()

// F2-T5: live dictation — partials compose onto the draft captured at start.
const dictation = useTalosMobileDictation({
    base: () => prompt.value,
    onTranscript: (text) => {
        voce.value?.dettatura(dictationDraftBefore.value, text)
        draft.updatePrompt(text)
    },
    language: () => resolveTalosDictationLanguageTag(settings.state.voice.dictation_language),
    // ⛔ Il rilevamento si accende solo in automatico: chi ha scelto una lingua
    // a mano l'ha scelta, e non gliela cambiamo sotto i piedi.
    autoLanguage: () => talosRilevamentoAcceso(settings.state.voice.dictation_language),
    allowedLanguages: () => voce.value?.lingue ?? [],
    // ⛔ Chi parla tace: la lettura in corso si ferma prima di ascoltare.
    zittisci: () => parlaSubito().stop('la chat apre il microfono'),
    /*
     * ⛔ LA STESSA CURA DELLA BARRA, e mancava. L'11 agosto la barra ha avuto il
     * tempo di ascolto giusto e questa schermata no: stesso microfono, due
     * comportamenti, a seconda di dove lo premevi. Le costanti stanno in
     * `dictationPolicy` proprio perché non possano più scostarsi.
     */
    errorMessage: (code) => t(`chat.dictationErrors.${code}`),
})

/**
 * Fra quali lingue può muoversi il motore quando ascolta in automatico.
 *
 * ⛔ Si MISURA da ciò che il dispositivo dichiara e da ciò che la persona usa:
 * l'elenco scritto a mano di prima aveva due voci, ed è esattamente ciò che ha
 * fatto sbagliare l'owner.
 */


/**
 * ⛔ Ogni cambiamento della bozza passa di qui: è il punto in cui la
 * provenienza muore se del dettato non resta niente.
 */
watch(prompt, (testo) => voce.value?.aggiornaBozza(testo))

/**
 * ⭐⭐ Il pezzo che risponde a voce arriva DOPO l'avvio — misurato: dentro la
 * schermata costava 3.817 byte sul tetto del grafo iniziale (compito #51).
 */
void import('@/composables/useTalosRispostaAVoce').then(({ useTalosRispostaAVoce }) => {
    voce.value = useTalosRispostaAVoce({
        streaming: () => chat.state.streamingText,
        messaggi: () => chat.messages,
        interfaccia: () => locale.value,
    })
})

/**
 * ⛔ Le parole mentre le dici. Sono gia' nella bozza — ma durante la dettatura
 * la bozza e' NASCOSTA dalla barra, quindi si parlava al buio. Qui si mostra
 * solo il pezzo NUOVO: rileggere anche quello che c'era prima confonderebbe
 * «quello che sto dicendo» con «quello che c'era gia' scritto».
 */
const trascrizioneViva = computed(() => {
    const ora = prompt.value
    const prima = dictationDraftBefore.value
    return ora.startsWith(prima) ? ora.slice(prima.length).trim() : ora.trim()
})

/** ⭐ Chiude la dettatura e manda, in un gesto solo. */
async function onSendDictation(): Promise<void> {
    dictation.cancel()
    await nextTick()
    await onSend()
}

async function toggleDictation(): Promise<void> {
    if (dictation.status.value === 'idle') dictationDraftBefore.value = prompt.value
    await dictation.toggle()
}

/** Butta via quello che si e' detto e rimette il campo com'era. */
function discardDictation(): void {
    dictation.cancel()
    draft.updatePrompt(dictationDraftBefore.value)
}
/**
 * Chi riscrive i prompt, e quanto — owner 2026-08-04.
 *
 * Sta nelle preferenze e non in una variabile della schermata perche' e' una
 * decisione che si prende una volta: chi ha deciso che le riscritture le fa un
 * modello economico non vuole ridirlo a ogni prompt.
 */
const enhancer = computed(() => settings.state.shell?.prompt_enhancer ?? {
    // Una preferenza che non c'e' ancora (installazione vecchia, o un doppio
    // nei test) non deve far sparire il pannello: si ricade sui predefiniti,
    // che sono anche il comportamento di prima.
    model: null,
    effort: 'low' as TalosMobileEffortLevel,
    depth: TALOS_PROMPT_ENHANCER_DEFAULT_DEPTH,
})

/** Solo i modelli che questo dispositivo puo' davvero chiamare. */
const enhancerModels = computed(() => controller.profiles.value.map((profile) => ({
    id: profile.id,
    label: profile.display_name || profile.model,
    provider: profile.provider,
    efforts: profile.effort_levels ?? [],
})))

async function setEnhancer(patch: Partial<typeof enhancer.value>): Promise<void> {
    await settings.setShell({ prompt_enhancer: { ...enhancer.value, ...patch } })
}

const composer = ref<InstanceType<typeof TalosMobileComposer> | null>(null)
const composerWrap = ref<HTMLElement | null>(null)
// F4-#22: shared guard — failed session actions surface as toasts, never as
// swallowed unhandled rejections (owner saw silent no-ops on device).
const toasts = useTalosMobileToasts()
const sessionActions = createSessionActionRunner(toasts, t)
const sessionActionBusy = sessionActions.busy
const messageActionError = ref<string | null>(null)
const browserError = ref<string | null>(null)
const browserBusy = ref(false)
const browserStatus = ref('')
const activeSessionId = computed(() => chat.activeSession.value?.id ?? null)

/**
 * Dichiara QUALE conversazione si sta guardando, e la ritira uscendo.
 *
 * Owner 2026-08-06: «mentre faccio una chat non può comparirmi una notifica di
 * una risposta in quella chat». Il centro notifiche non può indovinarlo: la
 * schermata è l'unica che lo sa, e deve dirlo — è lo stesso principio per cui i
 * toast e il ponte nativo si iniettano invece di essere importati.
 *
 * Import dinamico perché `chatController` sta nel grafo d'avvio e il tetto è a
 * poche centinaia di byte dal limite; dichiarare quale chat si guarda non vale
 * un byte di quel budget.
 */
function dichiaraSuperficie(id: string | null): void {
    // Dichiarare dove sei non può rompere la chat, e non vale un byte del
    // budget d'avvio: import dinamico, una funzione sola per i due usi.
    void import('@/stores/notificationCentre')
        .then((centro) => centro.talosSetActiveSurface(id ? `chat:${id}` : null))
        .catch(() => {})
}

watch(activeSessionId, dichiaraSuperficie, { immediate: true })
onBeforeUnmount(() => dichiaraSuperficie(null))
/** F-14: this chat is not being written down, and says so. */
const isTemporaryChat = computed(() => talosIsEphemeralSessionId(activeSessionId.value ?? ''))

/**
 * Turn this empty chat into a temporary one.
 *
 * It starts a NEW temporary session rather than converting the current one:
 * "temporary" is decided by the session's id, and an id cannot be changed under
 * a session that already exists. The chat being left behind is empty, so
 * nothing is lost — which is exactly why the offer only appears while it is.
 */
/**
 * Bound straight to a click, so it must never reject: an unhandled rejection in
 * an event handler is a Vue warning in development and nothing at all in
 * production — the user taps, something fails, and the app says so to no one.
 * A failure here becomes the same visible error every other action uses.
 */
async function switchMode(ephemeral: boolean): Promise<void> {
    try {
        await switchModeOrThrow(ephemeral)
    } catch (cause) {
        // The same surface every other failed session action already uses.
        toasts.push({ message: cause instanceof Error ? cause.message : String(cause) })
    }
}

async function switchModeOrThrow(ephemeral: boolean): Promise<void> {
    const leaving = activeSessionId.value
    // Read BEFORE the switch: afterwards this array belongs to the new chat.
    const leavingWasEmpty = chat.messages.length === 0
    await controller.sessionLifecycle.newSession(ephemeral ? { ephemeral: true } : undefined)
    // One rule, shared with the chat menu (see modeSwitch.ts). This copy used
    // to assert in a comment that the chat being left was always empty and
    // delete it unconditionally — true of where the button sits, not of the
    // code, and the menu offers the same act from a chat full of work.
    const discarded = talosChatDiscardedByModeSwitch({
        leaving, arrived: activeSessionId.value, leavingWasEmpty,
    })
    // Deleted AFTER the new chat exists, so there is never a moment with none.
    if (discarded) await controller.deleteSession(discarded).catch(() => undefined)
}



/**
 * Owner 2026-07-31: the welcome had to be ABOUT incognito, and had to be a set
 * — the ordinary one cycles, and one fixed sentence reads like a warning label
 * rather than the app talking. Seeded by the session, so it is stable inside a
 * chat and different between chats.
 */
const temporaryWelcome = computed(
    () => talosTemporaryWelcome(activeSessionId.value, locale.value),
)

/** The way back. Same shape, same replacement, same reason it is only offered while empty. */
async function makePermanent(): Promise<void> {
    await switchMode(false)
}

/**
 * The way in, from the welcome itself.
 *
 * Owner 2026-07-31, after I had removed it on his earlier instruction: «la pill
 * modalità incognito sotto la scritta welcome è sparita e non doveva sparire».
 * Both instructions hold at once, because they are about different acts. His
 * rule was about CONVERTING a conversation — and nothing converts: this opens a
 * NEW incognito chat, exactly as the menu entry does. It also lives inside the
 * empty state, so the chat being left has nothing in it; there is no
 * conversation to convert even in principle.
 */
async function makeAnonymous(): Promise<void> {
    await switchMode(true)
}
const libraryTurnOverride = ref<TalosLibraryTurnOverride | null>(null)
const sessionLibraryContextPolicy = computed(() =>
    parseTalosSessionLibraryContextPolicy(
        chat.activeSession.value?.metadata?.library_context_policy,
    ))
const effectiveLibraryContextPolicy = computed(() => resolveTalosLibraryContextPolicy({
    legacy_enabled: settings.state.shell.library_context_enabled === true,
    global_policy: settings.state.shell.library_context_policy,
    session_policy: sessionLibraryContextPolicy.value,
    turn_override: libraryTurnOverride.value,
}))
/**
 * Owner 2026-07-30, on the composer pill: it has to agree with what the send
 * actually does. F-14 suppresses the Library for a temporary chat inside the
 * controller, and this computed did not know — so the pill went on saying
 * "Broad · 12 sources" while the model was being sent none of them.
 *
 * The direction of that lie is the bad one: you would believe your documents
 * were in play and trust an answer that never saw them. The pill reads Off now,
 * and the notice above the thread says why.
 */
const effectiveLibraryContextEnabled = computed(() => (
    settings.state.shell.library_context_enabled === true
    && effectiveLibraryContextPolicy.value.enabled
    && !isTemporaryChat.value
))
const libraryTurnFiles = computed(() => attachments.vaultFiles.filter((file) => (
    file.status === 'available'
    && parseVaultOrigin(file.metadata) === 'uploaded'
    && isTalosLibraryFileShared(file.metadata)
)))
const librarySelectedSourceCount = computed(
    () => effectiveLibraryContextPolicy.value.included_file_ids.length,
)
// F2-T2: friendly per-message model attribution (id -> display name) for the meta row.
const modelLabels = computed(() => Object.fromEntries(
    profiles.value.map((profile) => [profile.id, profile.display_name]),
))
/*
 * ⛔ `refreshingModels` e `discoveryProblems` erano calcolati QUI, e la barra
 * dell'assistente ne aveva bisogno degli stessi due (rilievo #9: «dalla barra
 * il modello non si cambia»). Adesso arrivano dal controller, accanto ai
 * `catalogs` da cui nascono: due superfici che ricavano lo stesso fatto dalla
 * stessa fonte sono due risposte che un giorno divergono.
 */
const attachmentBusy = computed(() => attachments.selecting.value)
const attachmentError = computed(() => attachments.error.value)
const composerExpanded = computed(() => (
    attachments.items.length > 0
    || attachmentBusy.value
    || Boolean(attachmentError.value)
))
const TalosWelcomeTitleFallback = () => h(
    'h1',
    { class: 'talos-welcome-title' },
    t('chat.welcomeHeadline'),
)
const TalosWelcomeTitle = defineAsyncComponent({
    loader: () => import('@/components/chat/TalosWelcomeTitle.vue'),
    loadingComponent: TalosWelcomeTitleFallback,
    errorComponent: TalosWelcomeTitleFallback,
    delay: 0,
    suspensible: false,
})
const draftError = computed(() => draft.error.value)
const browserSuggestionUrl = computed(() => (
    settings.state.browser.suggest_for_urls
        ? extractTalosBrowserUrls(prompt.value, 1)[0] ?? null
        : null
))
const showUntrustedBrowserEvidence = computed(() => (
    import.meta.env.DEV && settings.state.browser.developer_untrusted_evidence
))
let heightObserver: ResizeObserver | null = null
let browserOwnerSessionId: string | null = null
let browserSessionId: string | null = null
let browserPresentation = settings.state.browser.presentation
let browserActivityQueue: Promise<void> = Promise.resolve()

function browserEventStatus(event: TalosInAppBrowserEvent): string {
    if (event.type === 'opening') return t('chat.browserOpening')
    if (event.type === 'loaded' || event.type === 'navigated') return t('chat.browserOpened')
    if (event.type === 'closed') return t('chat.browserClosed')
    return event.message ?? t('chat.browserFailed')
}

function queueBrowserEvent(event: TalosInAppBrowserEvent): void {
    const ownerSessionId = browserOwnerSessionId
    const ownerBrowserSessionId = browserSessionId
    if (!ownerSessionId || !ownerBrowserSessionId) return
    const occurredAt = new Date().toISOString()
    const activityId = newTalosMobileId()
    const activity = createTalosManualBrowserActivity(event, {
        activityId,
        browserSessionId: ownerBrowserSessionId,
        occurredAt,
        presentation: browserPresentation,
    })
    browserStatus.value = browserEventStatus(event)
    browserActivityQueue = browserActivityQueue
        .catch(() => undefined)
        .then(() => chat.recordBrowserActivity(ownerSessionId, {
            id: activityId,
            operation: activity.operation,
            status: activity.status,
            payload: activity.payload,
            evidence: activity.evidence,
            created_at: occurredAt,
        }))
        .catch((error) => {
            browserError.value = error instanceof Error && error.message
                ? t('chat.browserActivitySaveFailedDetail', { detail: error.message })
                : t('chat.browserActivitySaveFailed')
        })
}

const browserService = createTalosInAppBrowserService({ onEvent: queueBrowserEvent })

// F2-T6 first-run setup checklist — REAL state only (no fake progress):
// a key exists when any profile carries a stored secret; the model step is
// done when a composer model is actually selected.
/*
 * ⛔⛔ «NON HO POTUTO GUARDARE» NON È «NON CE L'HAI» — 2026-08-13.
 *
 * MISURATO sul Pad: Wi-Fi spento, i tre elenchi modelli falliti con
 * `Unable to resolve host`, e la lista concludeva «nessuna chiave» perché
 * senza elenchi non esistono profili. Intanto sul disco c'erano QUATTRO
 * chiavi e il modello era scelto (`offerti=61`).
 *
 * ⇒ Se nessun elenco è stato letto, la domanda non ha risposta — e la
 * risposta che non c'è non deve diventare un'accusa alla persona.
 */
const setupHasKey = computed(() => profiles.value.some((profile) => profile.has_secret))
const setupHasModel = computed(() => selectedModelId.value !== null)
/**
 * ⛔⛔ NON SI DICE «TI MANCA» FINCHE' NON SI SA.
 *
 * Owner, 2026-08-09, con la fotografia: chiudendo del tutto l'app e
 * riaprendola compariva «Completa la configurazione — Aggiungi una chiave
 * provider · Scegli il modello» su un'app configurata da settimane. Due
 * centimetri piu' sotto, nella stessa schermata, c'era gia' scritto
 * «Preparazione dell'archivio locale delle chat».
 *
 * RIPRODOTTO: compare a **t+4s** dall'avvio a freddo e sparisce da sola subito
 * dopo. Non e' un dato sbagliato: e' un dato che non c'e' ANCORA — `profiles`
 * e' vuoto e `selectedModelId` e' null perche' il deposito non ha finito di
 * aprirsi, non perche' manchi qualcosa.
 *
 * ⇒ Il difetto e' che «non lo so» veniva trattato come «non ce l'hai». E' la
 * stessa forma delle bugie che stiamo togliendo dalla chat, spostata
 * sull'accoglienza: la prima cosa che TALOS dice a chi lo riapre e' una cosa
 * falsa sul suo stesso telefono.
 *
 * La cura e' la terza risposta: finche' il deposito non e' `ready`, la lista
 * non parla. Il segnale esiste gia' e questa schermata lo usa gia' poco piu'
 * sotto per l'errore — mancava solo qui.
 */
const setupChecklistVisible = computed(() =>
    /*
     * ⛔ Si aspetta il deposito SICURO, non solo il database delle chat.
     *
     * MISURATO il 2026-08-13: con quattro chiavi sul dispositivo la lista
     * diceva «Aggiungi una chiave provider», perche' `persistenceStatus` era
     * gia' `ready` mentre i segreti non erano ancora stati letti. Sono due
     * depositi con due tempi diversi, e questa riga ne guardava uno solo.
     */
    segretiLetti.value
    && !(cataloghiNonLetti.size > 0 && profiles.value.length === 0)
    && chat.state.persistenceStatus === 'ready'
    && !settings.state.onboarding.setup_dismissed
    && !(setupHasKey.value && setupHasModel.value),
)

function dismissSetupChecklist(): void {
    void settings.setOnboarding({ setup_dismissed: true })
}

// SF-critic #13: when the procedural background runs, a soft radial scrim keeps
// the hero copy legible over high-contrast scene geometry.
const motionSceneActive = computed(() =>
    settings.state.motion_v6.background_enabled && settings.state.motion_v6.mode !== 'off',
)

// F5-#28 — gesture-sovereign live-edge follow: an active touch blocks
// auto-scroll outright, ANY upward scroll detaches (no threshold race with
// the stream), rejoining is explicit via the back-to-bottom pill.
const chatScroll = ref<HTMLElement | null>(null)
/** How close to the top counts as "about to need the previous page". */
const OLDER_PAGE_TRIGGER_PX = 320
const liveEdge = createTalosChatLiveEdge()

function onChatScroll(): void {
    const el = chatScroll.value
    if (!el) return
    liveEdge.onScroll({ scrollTop: el.scrollTop, scrollHeight: el.scrollHeight, clientHeight: el.clientHeight })
    // Defect #4: older messages arrive as you approach the top. One screen of
    // margin, so the page is already there by the time you would have seen the
    // gap — and never while a page is in flight.
    // SF: `scrollTop <= clientHeight` is permanently TRUE whenever the thread
    // is shorter than two screens, so a short page kept loading the next one
    // until the whole history was back — the old behaviour, restored quietly.
    // A fixed margin only fires when the user is actually near the top.
    if (el.scrollTop < OLDER_PAGE_TRIGGER_PX && chat.state.hasOlderMessages && !chat.state.loadingOlderMessages) {
        void loadOlderPage()
    }
}

/**
 * Prepending grows the document ABOVE the viewport, which would shove the
 * content the user is reading down the screen. The classic fix, and the one the
 * research names: remember the distance from the bottom, restore it after the
 * DOM settles. Bottom-anchored because that distance is the thing that must not
 * change.
 */
async function loadOlderPage(): Promise<void> {
    const el = chatScroll.value
    if (!el) return
    const anchor = el.scrollHeight - el.scrollTop
    const added = await chat.loadOlderMessages()
    if (added === 0) return
    await nextTick()
    const restored = chatScroll.value
    if (restored) restored.scrollTop = restored.scrollHeight - anchor
}

function scrollChatToBottom(behavior: ScrollBehavior = 'auto'): void {
    const el = chatScroll.value
    if (!el) return
    const target = el.scrollHeight - el.clientHeight
    liveEdge.markAutoScroll(Math.max(0, target))
    if (typeof el.scrollTo === 'function') el.scrollTo({ top: el.scrollHeight, behavior })
    else el.scrollTop = el.scrollHeight
}

function rejoinLiveEdge(): void {
    liveEdge.rejoin()
    scrollChatToBottom('smooth')
}

watch(() => chat.messages.length, async (length) => {
    if (!length || !liveEdge.canAutoScroll()) return
    await nextTick()
    scrollChatToBottom('auto')
})

let markdownPreloaded = false
watch(() => chat.state.streamingText, async (text) => {
    if (!text) return
    // SF-critic #15: warm the markdown renderer chunk during the stream so the
    // completed message never flashes through the plain-text fallback.
    if (!markdownPreloaded) {
        markdownPreloaded = true
        void import('@/components/chat/TalosMobileMessageContent.vue')
    }
    if (!liveEdge.canAutoScroll()) return
    await nextTick()
    // Instant follow during the stream: smooth scrolling fights the touch
    // scroller on device and lags dense token bursts.
    scrollChatToBottom('auto')
})

watch(() => chat.activeSession.value?.id, async () => {
    libraryTurnOverride.value = null
    liveEdge.rejoin()
    await nextTick()
    scrollChatToBottom('auto')
})

function publishComposerHeight(): void {
    const el = composerWrap.value
    if (!el) return
    const height = Math.ceil(el.getBoundingClientRect().height) || 180
    document.documentElement.style.setProperty('--talos-composer-height', `${height}px`)
}

async function onSend(): Promise<void> {
    const text = prompt.value
    // Capture the exact one-turn object before any draft/storage await. The
    // sheet always publishes a new object, so a later edit is distinguishable
    // and must not be cleared by this older send.
    const turnPolicy = libraryTurnOverride.value
    void talosLightImpact()
    // ⭐ La provenienza si legge PRIMA di svuotare il campo: dopo, la bozza è
    // vuota e la risposta sarebbe sempre «no».
    // ⭐ Il booleano non si butta più: dice se QUESTO messaggio nasce di voce,
    // e da oggi serve a due cose — leggere la risposta, e marcare il messaggio
    // col microfono. Vedi `lib/voice/messaggioDettato.ts`.
    const diVoce = voce.value?.catturaInvio() ?? false
    // SF5-3: a live mic must not survive the send — late partials would
    // resurrect the sent text into the composer.
    dictation.cancel()
    controller.clearPromptEnhancement()
    draft.updatePrompt('')
    await draft.flush()
    // Owner 2026-07-25: sending your own message always snaps to the bottom —
    // rejoin the live edge so the message-add watch auto-scrolls (it was gated
    // when the user had scrolled up).
    rejoinLiveEdge()
    const accepted = await controller.send(text, turnPolicy, diVoce)
    if (!accepted) {
        draft.updatePrompt(text)
        await draft.flush()
        await nextTick()
        composer.value?.focusPrompt()
        return
    }
    if (libraryTurnOverride.value === turnPolicy) {
        libraryTurnOverride.value = null
    }
    await draft.activateScope(activeSessionId.value ?? 'new')
}

// Exposed to the app shell: the header/sidebar (F1-T3) drive these orchestrated
// actions so attachment revocation + draft scoping stay in one place.
defineExpose({ newSession, selectSession, renameSession, deleteSession, sessionActionBusy })

// R2-7 — the SINGLE orchestration truth, registered on the controller so
// every surface (Chats page, tablet panel, sidebar) flows through it.
// Errors PROPAGATE: each caller keeps its own error UX (dialog vs toast).
const orchestrator = {
    /**
     * Owner 2026-07-31, twice: "Rendila temporanea" made a new ORDINARY chat on
     * every press, and the button never changed.
     *
     * This was why. The orchestrator is registered on the controller, so every
     * surface flows through it — and it declared no parameters, so `{ ephemeral:
     * true }` was dropped here, silently, one frame after being chosen. The
     * feature was never reaching the store at all.
     *
     * Options are forwarded now. And a test that mocks the controller cannot
     * see this: the one below asserts the resulting SESSION, not the call.
     */
    async newSession(options?: { ephemeral?: boolean }): Promise<void> {
        controller.clearPromptEnhancement()
        await draft.flush()
        await attachments.discardAll()
        await controller.newSession(options)
        await draft.activateScope(activeSessionId.value ?? 'new')
    },
    async selectSession(sessionId: string): Promise<void> {
        controller.clearPromptEnhancement()
        await draft.flush()
        if (sessionId !== activeSessionId.value) await attachments.discardAll()
        await controller.selectSession(sessionId)
        await draft.activateScope(activeSessionId.value ?? 'new')
    },
    async renameSession(sessionId: string, title: string): Promise<void> {
        await controller.renameSession(sessionId, title)
    },
    async deleteSession(sessionId: string): Promise<void> {
        controller.clearPromptEnhancement()
        await draft.flush()
        if (sessionId === activeSessionId.value) await attachments.discardAll()
        await controller.deleteSession(sessionId)
        await draft.activateScope(activeSessionId.value ?? 'new')
    },
}
controller.sessionLifecycle.register(orchestrator)
onBeforeUnmount(() => controller.sessionLifecycle.unregister(orchestrator))

function newSession(): void {
    void sessionActions.run(t('chat.actionNewChat'), () => orchestrator.newSession())
}

function selectSession(sessionId: string): void {
    void sessionActions.run(t('chat.actionOpenChat'), () => orchestrator.selectSession(sessionId))
}

function renameSession(sessionId: string, title: string): void {
    void sessionActions.run(t('chat.actionRenameChat'), () => orchestrator.renameSession(sessionId, title))
}

function deleteSession(sessionId: string): void {
    void sessionActions.run(t('chat.actionDeleteChat'), () => orchestrator.deleteSession(sessionId))
}

function retryPersistence(): void {
    void sessionActions.run(t('chat.actionReconnectStorage'), () => chat.retryPersistence())
}

function selectAttachments(): void {
    void attachments.selectFiles()
}

function removeAttachment(itemId: string): void {
    void attachments.remove(itemId)
}

function messageById(messageId: string) {
    return chat.messages.find((message) => message.id === messageId) ?? null
}

async function runMessageAction(action: () => Promise<void>): Promise<void> {
    messageActionError.value = null
    try {
        await action()
    } catch (error) {
        messageActionError.value = talosTranslatableErrorMessage(error, t)
            ?? (error instanceof Error && error.message
                ? error.message
                : t('chat.messageActionFailed'))
    }
}

function reuseMessage(messageId: string): void {
    const message = messageById(messageId)
    if (!message || message.role !== 'user') return
    draft.updatePrompt(message.content)
    void nextTick(() => composer.value?.focusPrompt())
}

function resendMessage(messageId: string): void {
    void runMessageAction(() => controller.resendMessage(messageId))
}

function deriveLibraryFilename(content: string): string {
    const firstLine = content.split('\n').map((line) => line.replace(/^#+\s*/, '').trim()).find((line) => line.length > 0) ?? 'response'
    const slug = firstLine.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 48) || 'response'
    return `${slug}.md`
}

// Owner 2026-07-25: save any assistant reply straight into the Library.
function saveMessageToLibrary(messageId: string): void {
    const message = messageById(messageId)
    if (!message || message.role !== 'assistant' || message.content.trim() === '') return
    void runMessageAction(async () => {
        /**
         * Famiglia B — the one save that knows the WHOLE story.
         *
         * The reply carries the profile that wrote it, and the message before
         * it is the prompt that asked for it. So this is the first place where
         * the origin record can be complete: which model, on which provider,
         * answering which turn. Elsewhere the prompt id is not yet reachable and
         * the record says null rather than guessing.
         *
         * The prompt is REFERENCED, never copied (P-05): a copy would be a
         * second body of personal text to delete twice and forget twice, while a
         * reference dies with the chat — which is what deleting a conversation
         * is supposed to mean.
         */
        const index = chat.messages.findIndex((candidate) => candidate.id === messageId)
        const prompt = chat.messages.slice(0, Math.max(index, 0)).reverse()
            .find((candidate) => candidate.role === 'user') ?? null
        const profile = controller.profiles.value
            .find((candidate) => candidate.id === message.model_profile_id) ?? null
        const file = await attachments.saveGenerated({
            name: deriveLibraryFilename(message.content),
            mediaType: 'text/markdown',
            text: message.content,
        }, {
            model: profile?.model ?? null,
            provider: profile?.provider ?? null,
            promptMessageId: prompt?.id ?? null,
        })
        toasts.push({ message: t('chat.savedNamedLibrary', { name: file.display_name }), durationMs: 6000 })
    })
}

function retryAssistantMessage(messageId: string): void {
    void runMessageAction(() => controller.retryAssistantMessage(messageId))
}

function focusComposer(): void {
    void nextTick(() => composer.value?.focusPrompt())
}

function requestPromptEnhancement(): void {
    void controller.enhancePrompt(prompt.value).catch(() => {
        // The controller publishes the sanitized actionable error consumed by the composer.
    })
}

// F4-#20: a blocked enhancement surfaces its reason and puts the user where
// the fix happens — in the composer.
function onEnhanceBlocked(reason: string): void {
    toasts.push({ message: reason, durationMs: 5000 })
    focusComposer()
}

function cancelPromptEnhancement(): void {
    controller.clearPromptEnhancement()
    focusComposer()
}

function insertPromptEnhancement(): void {
    const result = promptEnhancement.value
    if (!result) return
    void (async () => {
        const separator = prompt.value ? '\n\n' : ''
        draft.updatePrompt(`${prompt.value}${separator}${result.enhanced_prompt}`)
        await draft.flush()
        controller.clearPromptEnhancement()
        focusComposer()
    })()
}

function replacePromptEnhancement(): void {
    const result = promptEnhancement.value
    if (!result) return
    void (async () => {
        draft.updatePrompt(result.enhanced_prompt)
        await draft.flush()
        controller.clearPromptEnhancement()
        focusComposer()
    })()
}

function selectSlashCommand(commandId: TalosMobileCommandId): void {
    // Owner 2026-07-25 (defect #6): four commands claimed "not installed" while
    // the feature shipped and worked. The registry no longer lies, so the
    // handler has to actually run them.
    void sessionActions.run(t('chat.actionRunCommand'), async () => {
        draft.updatePrompt('')
        await draft.flush()
        controller.clearPromptEnhancement()

        if (commandId === 'new_session') {
            await attachments.discardAll()
            await controller.newSession()
                await draft.activateScope(activeSessionId.value ?? 'new')
            return
        }
        if (commandId === 'open_browse') {
            await controller.setBrowseMode(true)
            return
        }
        if (commandId === 'open_context_vault') {
            await router.push({ name: 'context' })
            return
        }
        if (commandId === 'attach_file') {
            selectAttachments()
            return
        }
        if (commandId === 'export_report') {
            emit('export')
            return
        }
        if (commandId === 'open_doctor') {
            await router.push({ name: 'doctor' })
            return
        }
        if (commandId === 'open_notes') {
            await router.push({ name: 'notes' })
            return
        }
        if (commandId === 'open_tasks') {
            await router.push({ name: 'tasks' })
            return
        }
        if (commandId === 'open_model_center') {
            await router.push({ name: 'settings-models' })
        }
    })
}

function toggleBrowseMode(enabled: boolean): void {
    void sessionActions.run(t('chat.actionToggleBrowsing'), async () => {
        browserError.value = null
        await controller.setBrowseMode(enabled)
        if (!enabled) {
            await browserService.close()
            await browserActivityQueue
            browserOwnerSessionId = null
            browserSessionId = null
            browserStatus.value = ''
        }
    })
}

function openBrowserUrl(url: string): void {
    if (browserBusy.value) return
    void (async () => {
        browserBusy.value = true
        browserError.value = null
        try {
            await controller.setBrowseMode(true)
            const owner = chat.activeSession.value
            if (!owner) throw new Error(t('chat.browserSessionRequired'))
            browserOwnerSessionId = owner.id
            browserSessionId = newTalosMobileId()
            browserPresentation = settings.state.browser.presentation
            await browserService.open(url, browserPresentation)
            await browserActivityQueue
        } catch (error) {
            browserError.value = error instanceof Error && error.message
                ? t('chat.localBrowserOpenFailedDetail', { detail: error.message })
                : t('chat.localBrowserOpenFailed')
        } finally {
            browserBusy.value = false
        }
    })()
}

onMounted(async () => {
    await init()
    await draft.activateScope(activeSessionId.value ?? 'new')
    publishComposerHeight()
    if (typeof ResizeObserver !== 'undefined' && composerWrap.value) {
        /*
         * ⛔⛔ DUE riquadri, e il secondo è la cura di S-1 — MISURATO sul Pad
         * il 2026-08-13, telefono in orizzontale: il compositore copriva la
         * risposta. Schermo 2400×1080, la scheda disegnata a y 984-1080+, cioè
         * oltre il bordo. Lo spazio riservato in fondo vale
         * `--talos-composer-height`, e dopo una rotazione restava quello di
         * prima: il compositore può restare alto uguale, è la FINESTRA che
         * cambia. Il riquadro della lista invece cambia sempre.
         *
         * ⛔ Riusare questo osservatore invece di un ascoltatore sulla finestra
         * è costato 148 byte in meno al grafo d'avvio (603.218 → 603.070).
         */
        heightObserver = new ResizeObserver(() => {
            publishComposerHeight()
            // ⛔ Si torna in fondo SOLO se ci si era: chi stava leggendo un
            // messaggio di ieri non dev'essere teletrasportato perché ha girato
            // il telefono.
            if (liveEdge.canAutoScroll()) void nextTick(scrollChatToBottom)
        })
        heightObserver.observe(composerWrap.value)
        if (chatScroll.value) heightObserver.observe(chatScroll.value)
    }
})
onBeforeUnmount(() => {
    heightObserver?.disconnect()
    heightObserver = null
    void draft.dispose()
    void browserService.dispose()
})
</script>

<template>
    <section
        data-testid="mobile-screen"
        :aria-label="t('navigation.chat')"
        class="relative flex h-full min-h-0 flex-1 flex-col bg-transparent"
    >
        <div
            v-if="chat.state.persistenceStatus === 'error'"
            role="alert"
            class="mx-3 mt-3 flex items-start gap-3 rounded-md border border-[var(--talos-danger-border,var(--destructive))] bg-[var(--talos-danger-soft,transparent)] p-3 text-sm text-[var(--talos-danger,var(--destructive))]"
        >
            <AlertTriangle class="mt-0.5 size-4 shrink-0" aria-hidden="true" />
            <p class="min-w-0 flex-1 leading-5">{{ chat.state.persistenceError }}</p>
            <Button
                type="button"
                size="sm"
                variant="outline"
                data-testid="talos-chat-storage-retry"
                :disabled="sessionActionBusy"
                @click="retryPersistence"
            >
                {{ t('common.retry') }}
            </Button>
        </div>

        <div v-if="messageActionError" role="alert" class="mx-3 mt-3 rounded-md border border-[var(--talos-danger-border)] bg-[var(--talos-danger-soft)] p-3 text-sm text-[var(--talos-danger)]">
            {{ messageActionError }}
        </div>

        <div v-if="browserError" role="alert" class="mx-3 mt-3 rounded-md border border-[var(--talos-danger-border)] bg-[var(--talos-danger-soft)] p-3 text-sm text-[var(--talos-danger)]">
            {{ browserError }}
        </div>

        <div v-if="draftError || preferenceError" role="alert" class="mx-3 mt-3 rounded-md border border-[var(--talos-danger-border)] bg-[var(--talos-danger-soft)] p-3 text-sm text-[var(--talos-danger)]">
            {{ draftError || preferenceError }}
        </div>

        <div
            ref="chatScroll"
            class="flex-1 overflow-y-auto overscroll-contain"
            :class="settings.state.shell.immersive_header ? 'pt-[calc(3.5rem+env(safe-area-inset-top))]' : ''"
            data-testid="talos-chat-scroll"
            @scroll.passive="onChatScroll"
            @touchstart.passive="liveEdge.touchStart()"
            @touchend.passive="liveEdge.touchEnd()"
            @touchcancel.passive="liveEdge.touchEnd()"
        >
            <div class="flex min-h-full flex-col pb-[calc(var(--talos-composer-height,180px)+env(safe-area-inset-bottom)+1.5rem)]">
                <div
                    v-if="browseMode"
                    data-testid="talos-mobile-browse-mode-status"
                    class="mx-auto mt-3 flex min-h-touch w-[calc(100%-1.5rem)] max-w-[820px] items-center gap-2 rounded-md border border-[var(--talos-accent)]/45 bg-[var(--talos-accent-soft)] px-3 text-xs text-[var(--talos-text)]"
                    role="status"
                >
                    <Globe2 class="size-4 shrink-0 text-[var(--talos-accent)]" aria-hidden="true" />
                    <span class="min-w-0 flex-1">{{ t('chat.browseModeManual') }}</span>
                    <span v-if="browserStatus" class="truncate text-[var(--talos-muted)]">{{ browserStatus }}</span>
                </div>

                <div
                    v-if="chat.sessionBrowserActivities.length"
                    class="mx-auto w-full max-w-[820px] px-3"
                >
                    <TalosMobileBrowserActivity
                        :activities="chat.sessionBrowserActivities"
                        :show-untrusted-evidence="showUntrustedBrowserEvidence"
                    />
                </div>
                <!-- Empty state: brand hero + welcome -->
                <div
                    v-if="chat.messages.length === 0"
                    class="flex flex-1 flex-col items-center px-4 text-center"
                    :class="[
                        composerExpanded ? 'justify-start py-3' : 'justify-center py-10',
                        motionSceneActive && !isTemporaryChat ? 'bg-[radial-gradient(ellipse_at_center,var(--talos-background)_35%,transparent_78%)]' : '',
                        isTemporaryChat ? 'bg-[radial-gradient(ellipse_at_center,color-mix(in_oklab,var(--talos-accent)_10%,transparent)_0%,transparent_70%)]' : '',
                    ]"
                    :data-composer-expanded="String(composerExpanded)"
                    data-testid="talos-empty-brand"
                    :data-temporary="String(isTemporaryChat)"
                >
                    <!--
                        Owner 2026-07-30: the temporary chat gave no sign of
                        itself. A mode you cannot see is a mode you forget you
                        are in — and forgetting THIS one means typing something
                        into a chat you believe is being kept, or believing a
                        kept chat will vanish. The eye and the tinted field are
                        that sign, before the first word is typed.
                    -->
                    <span
                        v-if="isTemporaryChat"
                        data-testid="talos-temporary-chat-badge"
                        class="mb-4 inline-flex items-center gap-2 rounded-full border border-dashed border-[var(--talos-accent)]/60 bg-[var(--talos-accent)]/10 px-3 py-1.5 text-2xs font-medium text-[var(--talos-accent)]"
                    >
                        <EyeOff class="size-3.5" aria-hidden="true" />
                        {{ t('chat.temporaryChat') }}
                    </span>
                    <span
                        class="talos-short-logo talos-chat-brand-logo"
                        :class="{ 'talos-short-logo-hero': !composerExpanded }"
                        aria-hidden="true"
                    >
                        <span class="talos-short-logo-mark"></span>
                    </span>
                    <span
                        class="talos-orbitron-brand font-semibold text-[var(--talos-text)]"
                        :class="composerExpanded ? 'mt-1 text-2xl' : 'mt-2 text-4xl sm:text-5xl'"
                    >TALOS</span>
                    <TalosWelcomeTitle v-if="!isTemporaryChat" />
                    <template v-else>
                        <p
                            data-testid="talos-temporary-welcome"
                            class="talos-welcome-title mt-2"
                        >{{ temporaryWelcome }}</p>
                        <p class="mt-1 max-w-[28rem] text-xs leading-5 text-[var(--talos-muted)]">
                            {{ t('chat.temporaryWelcomeSub') }}
                        </p>
                    </template>

                    <!--
                        ⛔ L'archivio che si apre e' un'ATTESA, non un motivo per
                        cui non puoi scrivere.

                        Stava sotto il compositore, nella riga che spiega perche'
                        il tasto invia e' spento — insieme a «aggiungi una chiave»
                        e «scegli un modello», che sono cose DA FARE. Questa non
                        lo e': non c'e' niente da fare, si aspetta e passa da
                        sola. Owner 2026-08-09: «non mi piace la scritta
                        preparazione etc, metti uno spinner al centro».

                        Il girello dice «sta succedendo»; una frase ferma sembra
                        un guasto. E sta al centro, dove l'occhio e' gia'.
                    -->

                    <!--
                        The switch, on the welcome itself, in both directions —
                        the same control the chat menu carries, where the eye
                        already is.

                        Owner 2026-07-31, twice on this pill. First: «una chat
                        avviata già in modo non temporaneo NON PUÒ essere
                        modificata in chat temporanea… fai sparire anche i
                        relativi tasti», so I removed it. Then, seeing it gone:
                        «la pill modalità incognito sotto la scritta welcome è
                        sparita e non doveva sparire».

                        Both hold, because they are about different acts. His
                        rule is about CONVERTING a conversation, and nothing
                        converts any more — this OPENS a new chat, exactly like
                        the menu. And it sits inside the empty state, so the chat
                        it leaves has nothing in it: there is no conversation to
                        convert even in principle, which is also why it never
                        appears once you have started writing.

                        Owner 2026-07-30, on the way back: a switch you can only
                        flip one way is a trap — you try the mode to see what it
                        is and cannot undo it.
                    -->
                    <button
                        v-if="!composerExpanded"
                        type="button"
                        :data-testid="isTemporaryChat ? 'talos-make-permanent' : 'talos-make-temporary'"
                        class="talos-pressable mt-5 inline-flex min-h-touch items-center gap-2 rounded-full border border-[var(--talos-border)] bg-[var(--talos-panel)]/80 px-4 text-xs text-[var(--talos-muted)] backdrop-blur transition-colors duration-150 hover:text-[var(--talos-text)]"
                        @click="isTemporaryChat ? makePermanent() : makeAnonymous()"
                    >
                        <component :is="isTemporaryChat ? Eye : EyeOff" class="size-4 text-[var(--talos-accent)]" aria-hidden="true" />
                        {{ isTemporaryChat ? t('chat.makePermanent') : t('chat.temporaryChat') }}
                    </button>

                    <!-- F2-T6 first-run setup: REAL progress only, dismissible. -->
                    <section
                        v-if="setupChecklistVisible && !composerExpanded"
                        data-testid="talos-setup-checklist"
                        :aria-label="t('chat.gettingStarted')"
                        class="mt-6 w-full max-w-[420px] rounded-2xl border border-[var(--talos-border)] bg-[var(--talos-card,var(--card))]/80 p-3 text-left backdrop-blur"
                    >
                        <div class="flex items-center justify-between">
                            <h2 class="text-sm font-semibold text-[var(--talos-text)]">{{ t('chat.getSetUp') }}</h2>
                            <button
                                type="button"
                                data-testid="talos-setup-dismiss"
                                :aria-label="t('chat.dismissSetup')"
                                class="talos-pressable -mr-1.5 flex min-h-touch min-w-touch items-center justify-center rounded-full text-[var(--talos-muted)]"
                                @click="dismissSetupChecklist"
                            >
                                <X class="size-4" aria-hidden="true" />
                            </button>
                        </div>
                        <button
                            type="button"
                            data-testid="talos-setup-step-key"
                            class="talos-pressable mt-2 flex min-h-touch w-full items-center gap-3 rounded-xl px-2 text-left"
                            @click="router.push({ name: 'settings-models-providers' })"
                        >
                            <CheckCircle2 v-if="setupHasKey" class="size-5 shrink-0 text-[var(--talos-accent)]" aria-hidden="true" />
                            <Circle v-else class="size-5 shrink-0 text-[var(--talos-muted)]" aria-hidden="true" />
                            <span class="text-sm" :class="setupHasKey ? 'text-[var(--talos-muted)] line-through' : 'text-[var(--talos-text)]'">{{ t('chat.addProviderKey') }}</span>
                        </button>
                        <button
                            type="button"
                            data-testid="talos-setup-step-model"
                            class="talos-pressable flex min-h-touch w-full items-center gap-3 rounded-xl px-2 text-left"
                            @click="router.push({ name: 'settings-models-catalog' })"
                        >
                            <CheckCircle2 v-if="setupHasModel" class="size-5 shrink-0 text-[var(--talos-accent)]" aria-hidden="true" />
                            <Circle v-else class="size-5 shrink-0 text-[var(--talos-muted)]" aria-hidden="true" />
                            <span class="text-sm" :class="setupHasModel ? 'text-[var(--talos-muted)] line-through' : 'text-[var(--talos-text)]'">{{ t('chat.chooseYourModel') }}</span>
                        </button>
                    </section>
                </div>

                <!--
                    F-14, and the line nobody else writes.
                    The research is blunt: "incognito" in 2026 mostly means "we
                    still have it, we just do not show it to you" — ChatGPT and
                    Claude retain temporary chats for a stated window, and a
                    court ordered OpenAI to preserve all of them. TALOS is
                    local-first, so the FIRST line here is literally true. The
                    second is the honest half everyone else omits, because for
                    them admitting it would admit the first line is false.
                -->
                <template v-else>
                <p
                    v-if="isTemporaryChat"
                    data-testid="talos-temporary-chat-notice"
                    role="note"
                    class="mx-3 mb-2 rounded-xl border border-dashed border-[var(--talos-border)] px-3 py-2 text-2xs leading-4 text-[var(--talos-muted)]"
                >
                    <span class="font-medium text-[var(--talos-text)]">{{ t('chat.temporaryChatNotice') }}</span>
                    {{ t('chat.temporaryChatProviderNotice') }}
                </p>

                <!-- Conversation -->
                <TalosMobileMessageList
                    :messages="chat.messages"
                    :sending="composerBusy === 'this-chat'"
                    :model-labels="modelLabels"
                    :message-style="settings.state.chat_layout.message_style"
                    :text-scale="settings.state.chat_layout.bubble_scale"
                    :has-older-messages="chat.state.hasOlderMessages"
                    :loading-older-messages="chat.state.loadingOlderMessages"
                    :pending-authorization-ids="attesePendenti"
                    :diagnostica="settings.state.shell?.debug_diagnostics === true"
                    @reuse="reuseMessage"
                    @resend="resendMessage"
                    @retry="retryAssistantMessage"
                    @save-to-library="saveMessageToLibrary"
                    @review-authorization="controller.showToolAuthorization()"
                />
                </template>
            </div>
        </div>

        <!-- F6: the dock spares the tablet chat panel (--talos-tablet-rail=0 on phones). -->
        <div ref="composerWrap" class="fixed bottom-0 right-0 z-40" :style="{ left: 'var(--talos-tablet-rail, 0px)' }">
            <!-- F5-#28: back-to-bottom pill — rejoin the live edge explicitly. -->
            <Transition
                enter-active-class="transition duration-150 ease-out"
                enter-from-class="opacity-0 translate-y-2"
                enter-to-class="opacity-100 translate-y-0"
                leave-active-class="transition duration-100 ease-in"
                leave-to-class="opacity-0 translate-y-2"
            >
                <button
                    v-if="liveEdge.showPill.value"
                    type="button"
                    data-testid="talos-back-to-bottom"
                    :aria-label="t('chat.backToLatest')"
                    class="talos-pressable absolute -top-14 left-1/2 z-10 flex min-h-touch min-w-touch -translate-x-1/2 items-center justify-center gap-1.5 rounded-full border border-[var(--talos-border)] bg-[var(--talos-card)]/95 px-3 text-sm text-[var(--talos-text)] shadow-[0_4px_16px_rgba(0,0,0,0.14)] backdrop-blur"
                    @click="rejoinLiveEdge"
                >
                    <ArrowDown class="size-4" aria-hidden="true" />
                </button>
            </Transition>

            <!-- F5-#29: dictation problems speak where the thumb is — right
                 above the composer, never buried at the top of the thread. -->
            <!-- ⛔ IL SILENZIO NON SI VESTE DA GUASTO — owner 2026-08-10, dal
                 Pad: microfono in una chat nuova, e in rosso «Il riconoscimento
                 vocale non e' riuscito». In logcat il motore diceva
                 NO_SPEECH_DETECTED: aveva funzionato, non aveva sentito nulla.
                 Chi non ha parlato non ha rotto niente — la riga resta e spiega,
                 ma con i colori di un avviso e senza `role="alert"`, che
                 interrompe chi legge con lo schermo. -->
            <div
                v-if="dictation.error.value"
                :role="dictation.errorCode.value === 'noSpeech' ? 'status' : 'alert'"
                data-testid="talos-dictation-error"
                :data-esito="dictation.errorCode.value ?? ''"
                class="mx-3 mb-2 rounded-md border p-3 text-sm"
                :class="dictation.errorCode.value === 'noSpeech'
                    ? 'border-[var(--talos-border)] bg-[var(--talos-surface-2)] text-[var(--talos-muted)]'
                    : 'border-[var(--talos-danger-border)] bg-[var(--talos-danger-soft)] text-[var(--talos-danger)]'"
            >
                {{ dictation.error.value }}
            </div>
            <TalosMobileComposer
                ref="composer"
                :prompt="prompt"
                :model-profiles="profiles"
                :selected-model-profile-id="selectedModelId"
                :selected-effort="effort"
                :thinking="thinking"
                :can-send="canSend"
                :sending="composerBusy === 'this-chat'"
                :refreshing-models="refreshingModels"
                :discovery-problems="discoveryProblems"
                :send-disabled-reason="motivoInvioSpento"
                :enhancing-prompt="enhancingPrompt"
                :enhancer-depth="enhancer.depth"
                :enhancer-model="enhancer.model"
                :enhancer-effort="enhancer.effort"
                :enhancer-models="enhancerModels"
                :prompt-enhancement="promptEnhancement"
                :prompt-enhancement-error="promptEnhancementError ?? ''"
                :attachments="attachments.items"
                :attachment-busy="attachmentBusy"
                :attachment-error="attachmentError"
                :context-available="true"
                :browse-mode="browseMode"
                :browser-suggestion-url="browserSuggestionUrl"
                :browser-busy="browserBusy"
                :dictation-supported="dictation.visible.value"
                :dictation-listening="dictation.status.value === 'listening'"
                :dictation-starting="dictation.status.value === 'starting'"
                :dictation-level="dictation.level.value"
                :drawer-mode="composerShape.drawerMode"
                :immersive-composer="composerShape.immersiveComposer"
                :plus-dropdown="composerShape.plusDropdown"
                :library-context-enabled="effectiveLibraryContextEnabled"
                :library-context-mode="effectiveLibraryContextPolicy.mode"
                :library-source-count="librarySelectedSourceCount"
                :library-turn-override="libraryTurnOverride"
                :library-files="libraryTurnFiles"
                @update:prompt="draft.updatePrompt($event)"
                @send="onSend"
                @stop="chat.stopStreaming()"
                :dictation-transcript="trascrizioneViva"
                @toggle-dictation="void toggleDictation()"
                @discard-dictation="discardDictation()"
                @send-dictation="void onSendDictation()"
                @attach="selectAttachments"
                @take-photo="attachments.takePhoto"
                @pick-photos="attachments.pickPhotos"
                @remove-attachment="removeAttachment"
                @dismiss-attachment-error="attachments.clearError()"
                @select-model-profile="selectModel"
                @select-effort="selectEffort"
                @select-thinking="setThinking"
                @refresh-models="controller.refreshConfiguredProviders()"
                @open-model-lab="router.push({ name: 'settings-models' })"
                @open-context="router.push({ name: 'context' })"
                @enhance-prompt="requestPromptEnhancement"
                @update-enhancer-depth="(value) => void setEnhancer({ depth: value })"
                @update-enhancer-model="(value) => void setEnhancer({ model: value })"
                @update-enhancer-effort="(value) => void setEnhancer({ effort: value as TalosMobileEffortLevel })"
                @enhance-blocked="onEnhanceBlocked"
                @cancel-prompt-enhancement="cancelPromptEnhancement"
                @insert-prompt-enhancement="insertPromptEnhancement"
                @replace-prompt-enhancement="replacePromptEnhancement"
                @select-slash-command="selectSlashCommand"
                @toggle-browse="toggleBrowseMode"
                @open-browser-url="openBrowserUrl"
                @update-library-turn-override="libraryTurnOverride = $event"
            />
        </div>

        <!--
            ⭐ IL GIRELLO E' UN OVERLAY, non un paragrafo dentro l'introduzione.

            Owner 2026-08-09: «deve essere un popup overlay non innestato nello
            sfondo chat, fatto in modo pulito e verificato visivamente».

            ⛔ E annidarlo li' non era solo brutto: l'introduzione si vede solo a
            chat VUOTA, quindi chi apriva una conversazione gia' piena non aveva
            NESSUN segnale al centro mentre l'archivio si apriva. Il girello
            c'era per meta' delle persone.

            Sta qui, fratello della radice della schermata e non figlio di
            nessun contenitore che scorre: cosi' resta al centro dello schermo
            invece di seguire la lista dei messaggi.

            z-[80]: sopra il compositore (z-40) e il suo foglio (z-[75]), sotto i
            pannelli a tutto schermo (z-[85] e z-[95]) — che mentre l'archivio si
            apre non possono essere aperti, ma se un giorno lo fossero avrebbero
            ragione loro.

            Il velo prende i tocchi di proposito: finche' l'archivio non e'
            aperto non c'e' niente da toccare sotto, e un tasto che risponde
            senza poter fare niente e' peggio di un tasto che non risponde.
        -->
        <div
            v-if="archivioInCaricamento"
            data-testid="talos-chat-loading"
            role="status"
            aria-live="polite"
            class="fixed inset-0 z-[80] flex items-center justify-center bg-[var(--talos-background)]/75 supports-backdrop-filter:backdrop-blur-sm"
        >
            <div class="flex flex-col items-center gap-3 rounded-2xl border border-[var(--talos-border)] bg-[var(--talos-card)] px-7 py-6 shadow-xl">
                <LoaderCircle
                    class="size-7 text-[var(--talos-accent)] motion-safe:animate-spin"
                    aria-hidden="true"
                />
                <p class="text-sm text-[var(--talos-muted)]">{{ t('chat.loadingChats') }}</p>
            </div>
        </div>

    </section>
</template>
