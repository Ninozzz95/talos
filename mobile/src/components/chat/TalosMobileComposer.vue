<script setup lang="ts">
import { computed, defineAsyncComponent, nextTick, ref, watch, type ComponentPublicInstance } from 'vue'
import { useTalosI18n } from '@/i18n'
import { createTalosSendGate } from '@/lib/chat/sendGate'
import { ArrowUp,
    Brain,
    Database,
    Maximize2,
    Mic,
    Plus,
    Square, } from '@lucide/vue'
import TalosMobileAttachmentTray from '@/components/chat/TalosMobileAttachmentTray.vue'
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
import TalosMobileProviderIcon from '@/components/models/TalosMobileProviderIcon.vue'
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
import type { TalosLocalVaultFile } from '@/repositories/chatRepository'
import type {
    TalosLibraryContextMode,
    TalosLibraryTurnOverride,
} from '@/lib/chat/libraryPolicy'


const TalosMobileSlashCommandMenu = defineAsyncComponent(
    () => import('@/components/chat/TalosMobileSlashCommandMenu.vue'),
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
    selectedRoutingProfileId?: string | null
    selectedEffort: string
    thinking: boolean
    agentToolsEnabled?: boolean
    docked?: boolean
    canSend: boolean
    sending: boolean
    sendDisabledReason?: string
    loadingModels?: boolean
    loadingRoutes?: boolean
    refreshingModels?: boolean
    discoveryProblems?: ReadonlyArray<{ message: string, detail?: string | null }>
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
    // Preferenze legacy accettate ma senza effetto sulla forma Calm.
    drawerMode?: boolean
    immersiveComposer?: boolean
    plusDropdown?: boolean
    libraryContextEnabled?: boolean
    libraryContextMode?: TalosLibraryContextMode
    librarySourceCount?: number
    libraryTurnOverride?: TalosLibraryTurnOverride | null
    libraryFiles?: readonly TalosLocalVaultFile[]
}>(), {
    agentToolsEnabled: true,
    docked: false,
    routingProfiles: () => [],
    selectedModelProfileId: null,
    selectedRoutingProfileId: null,
    loadingModels: false,
    refreshingModels: false,
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
    drawerMode: false,
    immersiveComposer: false,
    plusDropdown: false,
    libraryContextEnabled: false,
    libraryContextMode: 'broad_compat_v1',
    librarySourceCount: 0,
    libraryTurnOverride: null,
    libraryFiles: () => [],
})

const TalosMobileDictationBar = defineAsyncComponent(
    () => import('@/components/chat/TalosMobileDictationBar.vue'),
)

const emit = defineEmits<{
    'update:prompt': [prompt: string]
    send: []
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
const libraryChip = ref<HTMLElement | null>(null)
const librarySheetOpen = ref(false)
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

async function closeLibrarySheet(): Promise<void> {
    librarySheetOpen.value = false
    await nextTick()
    libraryChip.value?.focus()
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
const rightAction = computed<'stop' | 'dictating' | 'send'>(() => {
    if (props.sending) return 'stop'
    return dictating.value ? 'dictating' : 'send'
})
const microphoneLabel = computed(() => t(composerHasContent.value ? 'chat.dictateAppend' : 'chat.dictate'))
const microphoneReason = computed(() => !props.dictationSupported ? t('chat.dictationUnavailable') : '')
function onMicrophone(): void {
    if (!props.dictationSupported || dictating.value) return
    promptField.value?.blur()
    emit('toggleDictation')
}
/** Stable accessible name; the reason travels in the title. */
const rightActionLabel = computed(() => {
    switch (rightAction.value) {
        case 'stop': return t('chat.stopResponse')
        case 'dictating': return t('chat.stopDictation')
        case 'send': return t('chat.sendMessage')
        default: return t('chat.dictate')
    }
})
const rightActionTitle = computed(() => {
    if (rightAction.value === 'dictating' && props.dictationStarting) return t('chat.startingDictation')
    if (rightAction.value === 'send') return statusText.value || t('chat.sendMessage')
    return rightActionLabel.value
})
const attachmentReason = computed(() => props.attachmentDisabledReason || t('chat.attachmentUnavailable'))
const contextReason = computed(() => props.contextDisabledReason || t('chat.contextUnavailable'))
function effortLabel(level: string): string {
    const key = `chat.effort${level.charAt(0).toUpperCase()}${level.slice(1)}`
    return t(key)
}

/**
 * Owner 2026-07-26: on a phone the model pill shows a themed brain instead of
 * the word "reasoning"; from a tablet up it can show the words too.
 *
 * The same shape the Library chip beside it already uses — icon always, words
 * from `md:` (768px, exactly TALOS_TABLET_WIDTH_MEDIA_QUERY, so the breakpoint
 * cannot drift from the app's own idea of a tablet).
 *
 * The accessible name is the part that was already wrong. An `aria-label`
 * REPLACES an element's text, so the reasoning state was never announced even
 * while it was visible; hiding it from the eye as well would make it invisible
 * twice. It goes into the name now, and the name still leads with the model,
 * because the model is what the button is for.
 */
/**
 * Owner 2026-07-30: the brain would not go out when extended thinking was
 * switched off.
 *
 * The cause was inherited, not introduced: `effort` defaults to 'high' and is
 * rarely set back to 'off', so a condition of "thinking OR effort is on" was
 * true almost always. The old text version hid it — it simply swapped the word
 * "Ragionamento" for "Alto" and looked busy either way.
 *
 * So the ICON means the switch the user flips, and nothing else. The words
 * still report the effort, because that dial is real too — but a light that
 * never goes out is not an indicator, it is decoration.
 */
const reasoningActive = computed(() => Boolean(selectedProfile.value && props.thinking))
const reasoningWordsActive = computed(() => Boolean(
    selectedProfile.value && (props.thinking || props.selectedEffort !== 'off'),
))
const reasoningLabel = computed(() => (
    props.thinking ? t('chat.thinking') : effortLabel(props.selectedEffort)
))
const modelChipLabel = computed(() => {
    const name = selectedProfile.value?.display_name ?? t('chat.chooseModel')
    const base = `${t('chat.chooseModelProfile')}: ${name}`
    return reasoningWordsActive.value ? `${base} · ${reasoningLabel.value}` : base
})
const rightActionDisabled = computed(() => rightAction.value === 'send' && !canSubmit.value)
function onRightAction(): void {
    if (rightAction.value === 'stop') { emit('stop'); return }
    if (rightAction.value === 'dictating') { emit('toggleDictation'); return }
    requestSend()
}

function resizePrompt(): void {
    const field = promptField.value
    if (!field) return
    field.style.height = 'auto'
    const rem = Number.parseFloat(getComputedStyle(document.documentElement).fontSize) || 16
    const floor = (props.docked ? 3.5 : 5) * rem
    field.style.height = Math.max(floor, Math.min(field.scrollHeight, 12 * rem)) + 'px'
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

function requestSend(value = promptField.value?.value ?? props.prompt): void {
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
defineExpose({ focusPrompt, openPlus })

watch(() => [props.prompt, props.docked, dictating.value], () => {
    slashActiveIndex.value = 0
    if (slashMenuOpen.value) modelPickerOpen.value = false
    nextTick(resizePrompt)
}, { immediate: true })
</script>

<template>
    <section
        data-testid="talos-mobile-composer"
        class="talos-calm-composer"
        :aria-label="$t('chat.composer')"
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

        <textarea
            v-if="!dictating"
            ref="promptField"
            :value="prompt"
            rows="1"
            data-testid="talos-composer-prompt"
            :aria-label="$t('chat.messagePlaceholder')"
            :placeholder="$t('chat.messagePlaceholderEllipsis')"
            class="talos-calm-prompt"
            @input="updatePrompt"
            @keydown="onPromptKeydown"
        />

        <div class="talos-composer-tools" data-testid="talos-composer-tools">
            <Button
                ref="plusTrigger" type="button" size="icon" variant="ghost"
                data-testid="talos-composer-plus" data-mobile-icon-only="true"
                :aria-label="$t('chat.addToChat')" aria-haspopup="dialog"
                :aria-expanded="toolDrawerOpen"
                class="talos-pressable talos-plus-btn min-h-touch min-w-touch"
                @pointerdown.prevent @click="openPlus"
            ><Plus class="size-5" aria-hidden="true" /></Button>
            <button
                ref="modelTrigger" type="button" data-testid="talos-composer-model-chip"
                :aria-label="modelChipLabel" :title="modelTitle"
                aria-haspopup="dialog" :aria-expanded="modelPickerOpen"
                class="talos-pressable talos-model-chip min-h-touch"
                @pointerdown.prevent @click="toggleModelPicker"
            >
                <TalosMobileProviderIcon v-if="selectedProfile" :provider="selectedProfile.provider" class="size-5 shrink-0 border-0 bg-transparent" />
                <span>{{ selectedRoute?.name ?? selectedProfile?.display_name ?? $t('chat.chooseModel') }}</span>
                <!-- Owner 12/09 19:25: la parola del ragionamento accanto al modello
                     doppiava la chip «Ragiona» accesa. Resta per chi ascolta lo schermo. -->
                <span v-if="reasoningWordsActive" data-testid="talos-composer-reasoning-label" class="sr-only">{{ reasoningLabel }}</span>
            </button>
            <button
                type="button" data-testid="talos-composer-thinking" class="talos-pressable talos-mode-chip min-h-touch"
                :class="{ active: thinking }" :aria-pressed="thinking"
                :disabled="!selectedProfile?.supports_thinking"
                :title="selectedProfile?.supports_thinking ? $t('chat.extendedThinking') : $t('chat.noReasoningSetting')"
                @pointerdown.prevent @click="emit('selectThinking', !thinking)"
            >
                <Brain :data-testid="reasoningActive ? 'talos-composer-reasoning-icon' : undefined" class="size-4" aria-hidden="true" />
                {{ $t('chat.reasonQuick') }}
            </button>
            <!-- Owner 12/09 19:30, dal Pad: «Leva il pulsante agente subito» e «il
                 pulsante naviga sul web si deve levare completamente». Lo stato
                 degli attrezzi (agentToolsEnabled) resta nel controller, acceso;
                 il suggerimento dell'URL rilevato resta sopra il campo. -->
            <slot />
            <button
                v-if="showLibraryChip" ref="libraryChip" type="button" data-testid="talos-composer-library-chip"
                :aria-label="$t('library.contextForNextMessage')" aria-haspopup="dialog" :aria-expanded="librarySheetOpen"
                class="talos-pressable talos-mode-chip min-h-touch"
                @pointerdown.prevent @click="librarySheetOpen = true"
            >
                <Database class="size-4 shrink-0" aria-hidden="true" />
                <span data-testid="talos-composer-library-chip-label">{{ libraryModeLabel }} · {{ librarySourceCountLabel }}</span>
            </button>
            <Button
                v-if="promptTall" type="button" size="icon" variant="ghost"
                data-testid="talos-composer-expand" data-mobile-icon-only="true"
                :aria-label="$t('chat.expandComposer')" :title="$t('chat.expandComposer')"
                class="talos-pressable min-h-touch min-w-touch"
                @pointerdown.prevent @click="openComposerExpanded"
            ><Maximize2 class="size-4" aria-hidden="true" /></Button>
            <div class="talos-composer-send-controls">
                <Button
                    data-testid="talos-composer-append-mic" type="button" size="icon" variant="ghost" data-mobile-icon-only="true"
                    :aria-label="microphoneLabel" :title="microphoneReason || microphoneLabel"
                    :aria-pressed="dictating" :disabled="!dictationSupported || dictating"
                    class="talos-pressable min-h-touch min-w-touch"
                    @pointerdown.prevent @click="onMicrophone"
                ><Mic class="size-5" aria-hidden="true" /></Button>
                <Button
                    data-testid="talos-composer-action" type="button" size="icon" variant="ghost" data-mobile-icon-only="true"
                    :aria-label="rightActionLabel" :title="rightActionTitle" :aria-pressed="rightAction === 'dictating'"
                    :disabled="rightActionDisabled" class="talos-pressable talos-send-btn min-h-touch min-w-touch"
                    @pointerdown.prevent @click="onRightAction"
                >
                    <Square v-if="rightAction !== 'send'" class="size-4" fill="currentColor" aria-hidden="true" />
                    <ArrowUp v-else class="size-5" aria-hidden="true" />
                </Button>
            </div>
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

        <span class="sr-only" role="status" aria-live="polite">{{ statusText }}</span>

        <!-- Lo stesso foglio «Aggiungi alla chat» per tutte le preferenze legacy. -->
        <TalosMobileComposerDrawer
            v-if="toolDrawerOpen"
            :can-enhance="canRequestEnhancement"
            :enhance-reason="enhanceUnavailableReason"
            :thinking="thinking"
            :supports-thinking="selectedProfile?.supports_thinking ?? false"
            :effort-levels="selectedProfile?.effort_levels ?? []"
            :selected-effort="selectedEffort"
            :attachment-disabled-reason="attachmentReason"
            :context-disabled-reason="contextReason"
            :enhancing="enhancingPrompt || sending"
            :attachments-available="attachmentsAvailable"
            :context-available="contextAvailable"
            :agent-tools-enabled="agentToolsEnabled"
            :harness-available="harnessAvailable"
            @close="closeToolDrawer"
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
            :selected-routing-profile-id="selectedRoutingProfileId"
            :selected-effort="selectedEffort"
            :thinking="thinking"
            :supports-thinking="selectedProfile?.supports_thinking ?? false"
            :effort-levels="selectedProfile?.effort_levels ?? []"
            :loading-models="loadingModels"
            :loading-routes="loadingRoutes"
            :refreshing-models="refreshingModels"
            :discovery-problems="discoveryProblems"
            :show-executor-model="showExecutorModel"
            :executor-model-profiles="executorModelProfiles"
            :selected-executor-model-profile-id="selectedExecutorModelProfileId"
            @close="closeModelPicker"
            @select-model-profile="selectModelProfile"
            @select-model-routing-profile="selectRoutingProfile"
            @select-effort="selectEffort"
            @select-thinking="emit('selectThinking', $event)"
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
            @update:prompt="emit('update:prompt', $event)"
            @send="requestSend(prompt); closeComposerExpanded()"
            @stop="emit('stop')"
            @close="closeComposerExpanded"
        />
    </section>
</template>

<style>
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
}
</style>
