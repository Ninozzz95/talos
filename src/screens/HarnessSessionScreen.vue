<script setup lang="ts">
/**
 * Harness UI (24/8) — the "detail". Era un trampolino: `window.location.assign()`
 * verso il mockup statico, una navigazione top-level VERA che usciva dalla SPA.
 * L'owner l'ha bocciato guardandolo girare: «l'harness deve essere collegato al
 * resto delle schermate esattamente come il resto delle funzioni» — e aveva
 * ragione, l'ho verificato io stesso lo stesso giorno: il tasto Indietro dentro
 * il mockup non tornava alla SPA e non usciva dall'app (la SPA registra un suo
 * `backButton` col plugin App di Capacitor per la propria navigazione interna;
 * il trampolino distruggeva quel contesto JS uscendo dalla pagina, e Capacitor
 * dice esplicitamente che senza un listener attivo il comportamento nativo di
 * serie resta disattivo — provato con adb keyevent 4, non ipotizzato).
 *
 * Owner approvato 24/8 dopo ricerca web (≥5 fonti, docs+repo): il mockup ora
 * vive in uno SHADOW ROOT dentro QUESTA schermata — nessuna navigazione fuori
 * dalla SPA, quindi la STESSA cronologia Vue Router già verificata su
 * `/memoria` (Indietro → `/`) funziona qui senza bisogno di codice apposta.
 * Lo shadow DOM isola lo stile del mockup dal resto dell'app (e viceversa) —
 * la ragione per cui esiste, non un iframe (la CSP ha `frame-src 'none'`,
 * intatta: lo shadow DOM non ne ha bisogno).
 *   - Vue, Web Components: https://vuejs.org/guide/extras/web-components.html
 *   - Vue, Custom Elements API: https://vuejs.org/api/custom-elements
 *   - "Capacitor doesn't support Shadow DOM?" (letto per intero: era un import
 *     CSS ES2023 non supportato, non lo shadow DOM in sé — Ionic lo usa
 *     ovunque nella stessa WebView): https://forum.ionicframework.com/t/capacitor-doesnt-support-shadow-dom/245510
 *   - Martin Fowler, Micro Frontends (confine di mount/unmount netto, pulizia
 *     dei listener): https://martinfowler.com/articles/micro-frontends.html
 *   - PagerDuty, embedded apps — il pattern "funzione distruttore" che
 *     app.js espone qui come `window.__talosHarnessDestroy`:
 *     https://www.pagerduty.com/eng/react-embedded-apps/
 *   - bryanvaz/vue-custom-element-shadow-examples,
 *     EranGrin/vue-web-component-wrapper (quest'ultimo integra Vue Router):
 *     esempi reali dello stesso schema Vue + shadow DOM.
 *
 * `<link rel="stylesheet">` dentro lo shadow root, non CSS inline: i 10
 * `@font-face` del mockup usano percorsi RELATIVI (`./fonts/*.woff2`) — il
 * link a `/harness-ui/styles.css?build=...` li risolve rispetto al file vero;
 * del testo CSS iniettato a mano risolverebbe rispetto al documento
 * sbagliato. La query usa il build id AVM: un aggiornamento APK non può
 * riaccoppiare HTML nuovo e CSS/JS rimasti nella cache WebView. `app.js` resta
 * un file vero caricato con `<script src>` (mai inline/eval: `script-src
 * 'self'` nella CSP non ha `'unsafe-inline'`).
 *
 * `talosHarnessUiAvailable()` verificato qui, non solo alla sidebar: la
 * rotta resta raggiungibile da un URL diretto anche quando la voce di
 * navigazione è nascosta.
 *
 * ⛔ 28/8 — l'`:id` non seleziona più una delle cinque sessioni demo
 * canoniche: seleziona una sessione REALE (`@/lib/harness/codiceSessions`,
 * la stessa tabella on-device di Chat, local-first — vedi
 * [[mobile-app-local-first-requirement]]), oppure il valore sentinella
 * `'new'` — uno stato di BOZZA senza riga ancora creata, mostrato come un
 * composer vuoto invece del mockup. La sessione vera nasce solo al primo
 * invio (`submitCodePrompt`), mai al solo tocco del bottone "Nuova": un
 * bottone che crea subito una riga vuota e mai usata sarebbe un fantasma
 * nella lista, esattamente il difetto che Chat ha già corretto una volta
 * per il proprio "Nuova chat" (`ensureActiveSession` in `stores/chat.ts`).
 * Ciò che resta demo, dichiaratamente: cosa succede DENTRO una sessione
 * (il mockup incorporato sotto) — non ancora un motore reale, ricollegato
 * in un giro a parte.
 */
import { computed, defineAsyncComponent, h, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import type { PluginListenerHandle } from '@capacitor/core'
import { Keyboard } from '@capacitor/keyboard'
import { CircleAlert, ShieldCheck } from '@lucide/vue'
import { useTalosI18n } from '@/i18n'
import TalosMobileScreen from '@/components/shell/TalosMobileScreen.vue'
import TalosMobileComposer from '@/components/chat/TalosMobileComposer.vue'
import type { TalosMobileModelProfileView } from '@/components/chat/mobileChatTypes'
import { TALOS_APP_BUILD } from '@/lib/appBuild'
import { talosComposerFlags } from '@/lib/composerStyle'
import { createCodiceSession, findCodiceSession } from '@/lib/harness/codiceSessions'
import {
    listCodiceNotes, createCodiceNote, updateCodiceNote, deleteCodiceNote,
    listCodiceTasks, createCodiceTask, setCodiceTaskStatus, updateCodiceTask, deleteCodiceTask,
    searchCodiceMemories, createCodiceMemory, updateCodiceMemoryByTitle, deleteCodiceMemoryByTitle,
    listCodiceLibraryEntries, readCodiceLibraryDoc, renameCodiceLibraryFile, deleteCodiceLibraryFile,
    searchCodiceLibrary, readCodiceLibraryFileOrigin,
    listCodiceResearch, readCodiceResearchReport,
} from '@/lib/harness/codiceDati'
import type { TalosLocalChatSession } from '@/repositories/chatRepository'
import {
    announceTalosHarnessUiComposerAction,
    dismissTalosHarnessUiTransientLayers,
    selectTalosHarnessUiSession,
    setTalosHarnessUiKeyboardOpen,
    submitTalosHarnessUiPrompt,
    talosHarnessUiTransientLayersActive,
} from '@/lib/harnessUiBridge'
import { useTalosOverlayBack } from '@/composables/useTalosOverlayBack'
import { talosHarnessUiAvailable } from '@/services/harnessUi'
import { avviaServerHarnessConChiaveProvider, talosTerminaleDisponibile } from '@/lib/harness/terminalePonte'
import { caricaProfiliModelloCodice } from '@/lib/harness/codiceModelProfiles'
import { TALOS_DEFAULT_MODEL_LAB_PREFERENCES } from '@/lib/modelLabContracts'
import { useSettingsStore } from '@/stores/settings'
import type { TalosMobileEffortLevel } from '@/lib/mobileEffort'
import type { TalosMobileCommandId } from '@/lib/mobileCommandRegistry'
/**
 * ⭐⭐⭐ 2/9 — "Migliora prompt" (piano §14.3/§15.6, R5): stessi pezzi
 * indipendenti già riusati per il catalogo modelli
 * (codiceModelProfiles.ts) — vincolo CODE-COMPOSER-SINGLE-SOURCE-01,
 * questa schermata resta indipendente dal composable di chat regolare.
 * `runTalosMobilePromptEnhancement`/`talosMobileHttpTransport` sono
 * funzione/const esportate a sé, indipendenti da quel composable
 * quanto `caricaProfiliModelloCodice` lo è già.
 */
import { talosMobileHttpTransport } from '@/lib/chat/httpTransport'
import { providerAdapterFor } from '@/lib/chat/providerRegistry'
import { getProviderEndpoint } from '@/services/providerEndpointStore'
import { getProviderKey } from '@/services/secureKeyStore'
import {
    runTalosMobilePromptEnhancement,
    type TalosMobilePromptEnhancementResult,
} from '@/lib/chat/promptEnhancement'
import type { TalosMobileProviderModel } from '@/lib/chat/providerContracts'
import { TALOS_PROMPT_ENHANCER_DEFAULT_DEPTH } from '@/lib/chat/promptEnhancerDepth'
import { talosHarnessUiApiBase } from '@/lib/harness/harnessUiApiBase'
import { useTalosMobileToasts } from '@/stores/toasts'

const TALOS_HARNESS_UI_BASE = '/harness-ui'
const TALOS_HARNESS_UI_BUILD_QUERY = `?build=${encodeURIComponent(TALOS_APP_BUILD)}`

function harnessUiAssetUrl(fileName: 'index.html' | 'styles.css' | 'app.js'): string {
    return `${TALOS_HARNESS_UI_BASE}/${fileName}${TALOS_HARNESS_UI_BUILD_QUERY}`
}

const route = useRoute()
const router = useRouter()
const { t } = useTalosI18n()
const settings = useSettingsStore()
const toasts = useTalosMobileToasts()

const available = talosHarnessUiAvailable()
/*
 * ⛔⛔⛔ 29/8, owner dal vivo: "non hai rispettato la regola vincolante di
 * ispezionare tutti gli screenshot... nella schermata principale c'è
 * ancora tutto il component mockup. Invece la schermata principale deve
 * esattamente come la schermata principale della chat mostrare il logo,
 * la scritta Talos, il messaggio di benvenuto, puoi usare esattamente
 * lo stesso component." Prima: lo stato BOZZA (isDraft, sotto) mostrava
 * solo `t('harness.draftHint')` — una riga di testo muto, non il
 * trattamento TALOS che Chat usa per la stessa situazione (nessuna
 * conversazione ancora). Stesso componente esatto di ChatScreen.vue
 * (import async, stesso fallback sincrono per il primo frame — nessuna
 * variante inventata qui).
 */
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
useTalosOverlayBack(
    () => { dismissTalosHarnessUiTransientLayers() },
    talosHarnessUiTransientLayersActive,
)
const sessionId = computed(() => String(route.params.id ?? ''))
/**
 * The 'new' sentinel: a DRAFT, no row created yet. HarnessScreen.vue's
 * "New" button navigates here; sending the FIRST message is what actually
 * creates the session (see `submitCodePrompt` below) — the button and a
 * direct send both end on this exact path, by construction, not by
 * special-casing one or the other.
 */
const isDraft = computed(() => sessionId.value === 'new')
const loadedSession = ref<TalosLocalChatSession | null>(null)
const sessionResolving = ref(true)

async function resolveSession(): Promise<void> {
    sessionResolving.value = true
    if (isDraft.value) {
        loadedSession.value = null
        sessionResolving.value = false
        return
    }
    loadedSession.value = await findCodiceSession(sessionId.value)
    sessionResolving.value = false
}

const hostEl = ref<HTMLDivElement | null>(null)
const composerDockEl = ref<HTMLDivElement | null>(null)
const loading = ref(true)
const loadError = ref(false)
const codePrompt = ref('')
/** True only for the brief async window between the first send on a DRAFT and the route landing on the real session id. */
const creatingSession = ref(false)
/** Set right before the draft→real route replace; forwarded to the freshly-mounted mockup once `mountMockup()` succeeds. */
let pendingFirstPrompt: string | null = null
/** ⭐⭐⭐ 28/8 — il modello scelto AL MOMENTO dell'invio (mai riletto più tardi: la persona potrebbe averlo cambiato nel frattempo). */
let pendingFirstPromptModello: string | null = null
/** ⭐⭐⭐ 2/9 — gemello di `pendingFirstPromptModello` per il picker Planner: l'esecutore scelto AL MOMENTO dell'invio, stesso motivo. */
let pendingFirstPromptModelloEsecutore: string | null = null
const codeModelProfileId = ref('')
/**
 * ⭐⭐⭐ 2/9 — picker Planner (piano §15.6, K): id del profilo esecutore
 * scelto, o `null` per "Automatico" (il kernel usa sempre `codeModelProfileId`
 * sopra). A differenza di `codeModelProfileId` non ha un default che si
 * autoseleziona all'arrivo del catalogo — "Automatico" È il default onesto,
 * non un placeholder in attesa di una scelta.
 */
const codeModelloEsecutoreId = ref<string | null>(null)
const codeEffort = ref<TalosMobileEffortLevel>('high')
const codeThinking = ref(false)
const codeBrowseMode = ref(false)
const codeView = ref('chat')
const codePermission = ref('Workspace write')

/**
 * ⭐⭐⭐ 28/8, "procedi in ordine" punto 4 — sostituisce `CODE_MODEL_PROFILES`
 * (un solo profilo finto, mai esistito davvero: `gpt-5.6-sol`). Popolato
 * da `caricaProfiliModelloCodice()` — stesso catalogo REALE che Chat
 * mostra, scaricato dal vivo dai provider con una chiave configurata.
 *
 * ⛔ Filtrato a `provider === 'openrouter'`, dichiarato non nascosto: il
 * kernel che esegue Codice (`talosHarness.mjs`) chiama SOLO l'API
 * OpenRouter — mostrare un profilo OpenAI/Anthropic diretto qui
 * significherebbe offrire una scelta che il server rifiuterebbe (o,
 * peggio, ignorerebbe in silenzio). OpenRouter da solo resta "qualunque
 * modello di qualunque provider" nel senso che conta: il suo catalogo
 * aggrega GPT/Claude/Gemini/Llama/... sotto una chiave sola. Un kernel
 * multi-provider (chiamare OpenAI/Anthropic direttamente) resta lavoro
 * futuro, non finto qui.
 */
const codeModelProfiles = ref<TalosMobileModelProfileView[]>([])

/**
 * ⭐⭐⭐ 2/9 — "Migliora prompt" (R5): stato reale per il drawer che
 * `TalosMobileComposer.vue` già monta da solo (`TalosMobileEnhancerDrawer`,
 * v-if="enhancerDrawerOpen" — nessuna UI nuova da scrivere qui, il
 * componente esiste già e aspetta solo i props veri). La preferenza
 * modello/effort/depth è GLOBALE (`settings.state.shell.prompt_enhancer`),
 * condivisa con la chat regolare — stesso principio "riuso diretto" di
 * codiceModelProfiles.ts: una preferenza "quale modello riscrive i miei
 * prompt" non ha motivo di divergere fra le due superfici.
 */
const codeEnhancingPrompt = ref(false)
const codePromptEnhancement = ref<TalosMobilePromptEnhancementResult | null>(null)
const codePromptEnhancementError = ref('')
const codeEnhancer = computed(() => settings.state.shell?.prompt_enhancer ?? {
    model: null,
    effort: 'low' as TalosMobileEffortLevel,
    depth: TALOS_PROMPT_ENHANCER_DEFAULT_DEPTH,
})
/** Solo i profili che il picker del composer già mostra — stessa fonte, mai un secondo elenco. */
const codeEnhancerModels = computed(() => codeModelProfiles.value.map((profilo) => ({
    id: profilo.id,
    label: profilo.display_name || profilo.model,
    provider: profilo.provider,
    efforts: profilo.effort_levels ?? [],
})))
async function setCodeEnhancer(patch: Partial<typeof codeEnhancer.value>): Promise<void> {
    await settings.setShell({ prompt_enhancer: { ...codeEnhancer.value, ...patch } })
}

/**
 * ⭐⭐⭐ 2/9 — l'unico pezzo genuinamente NUOVO di questa voce (il resto è
 * riuso): `caricaProfiliModelloCodice()` scarica il catalogo VERO per
 * costruire i profili ma scarta gli oggetti grezzi
 * (`TalosMobileProviderModel`) una volta convertiti in "profilo" —
 * `runTalosMobilePromptEnhancement()` ne vuole uno per davvero (contiene
 * `chatCompatibility`/modalità che il profilo non porta). Ri-scarica SOLO
 * il catalogo del provider richiesto (mai tutti, mai a ogni digitazione:
 * solo quando "Migliora prompt" parte davvero) e trova la voce il cui
 * `id` combacia con `profilo.model` — stessa corrispondenza che
 * mobileModelCatalog.ts usa per costruire il profilo stesso (`model: model.id`).
 */
async function risolviProviderModelPerEnhance(profilo: TalosMobileModelProfileView): Promise<TalosMobileProviderModel | null> {
    const adapter = providerAdapterFor(profilo.provider)
    const [apiKey, endpoint] = await Promise.all([
        getProviderKey(profilo.provider),
        getProviderEndpoint(profilo.provider),
    ])
    try {
        const catalogo = await adapter.listModels({ apiKey, endpoint }, talosMobileHttpTransport)
        return catalogo.models.find((modello) => modello.id === profilo.model) ?? null
    } catch {
        return null
    }
}

function clearCodePromptEnhancement(): void {
    codeEnhancingPrompt.value = false
    codePromptEnhancement.value = null
    codePromptEnhancementError.value = ''
}

async function requestCodeEnhancePrompt(): Promise<void> {
    codeEnhancingPrompt.value = true
    codePromptEnhancement.value = null
    codePromptEnhancementError.value = ''
    const enhancerModelId = codeEnhancer.value.model
    const scelto = enhancerModelId
        ? codeModelProfiles.value.find((profilo) => profilo.id === enhancerModelId) ?? null
        : null
    const profilo = scelto ?? codeModelProfiles.value.find((entry) => entry.id === codeModelProfileId.value) ?? null
    if (!profilo) {
        codeEnhancingPrompt.value = false
        codePromptEnhancementError.value = t('chat.selectCallableModel')
        return
    }
    try {
        const [apiKey, endpoint, providerModel] = await Promise.all([
            getProviderKey(profilo.provider),
            getProviderEndpoint(profilo.provider),
            risolviProviderModelPerEnhance(profilo),
        ])
        const result = await runTalosMobilePromptEnhancement(
            {
                profile: profilo,
                providerModel,
                apiKey,
                endpoint,
                // L'effort dell'enhancer, non quello della sessione Codice —
                // stesso motivo di ChatScreen.vue: riscrivere un prompt non è
                // il compito più difficile della conversazione.
                effort: codeEnhancer.value.effort ?? codeEffort.value,
                thinking: codeThinking.value,
                depth: codeEnhancer.value.depth,
            },
            codePrompt.value,
            talosMobileHttpTransport,
        )
        codePromptEnhancement.value = result
    } catch (error) {
        codePromptEnhancementError.value = error instanceof Error ? error.message : String(error)
    } finally {
        codeEnhancingPrompt.value = false
    }
}

function onCodeEnhanceBlocked(reason: string): void {
    // ⭐ 2/9 — il MOTIVO vero (calcolato dentro TalosMobileComposer.vue
    // stesso: "seleziona un modello", "scrivi un prompt prima") — mai più
    // il toast fisso "Miglioramento non collegato" che non diceva perché.
    toasts.push({ message: reason, durationMs: 5000 })
}

function insertCodeEnhancePrompt(): void {
    const result = codePromptEnhancement.value
    if (!result) return
    const separator = codePrompt.value.trim().length > 0 ? '\n\n' : ''
    codePrompt.value = `${codePrompt.value}${separator}${result.enhanced_prompt}`
    clearCodePromptEnhancement()
}

function replaceCodeEnhancePrompt(): void {
    const result = codePromptEnhancement.value
    if (!result) return
    codePrompt.value = result.enhanced_prompt
    clearCodePromptEnhancement()
}

/**
 * ⭐ 29/8 — owner, dopo un HTTP 429 reale su tencent/hy4-preview: "fai in
 * modo che i modelli caricati per ogni sessione funzionino bene". La
 * selezione sotto NON aveva nessun criterio di affidabilità:
 * `show_in_composer` è vero per QUASI OGNI modello "supportato"
 * (mobileModelCatalog.ts, `!unsupported`) — la scelta di fatto era "il
 * primo della lista", e quella lista si popola da una `Promise.all` fra
 * provider (ordine non deterministico, una gara) più l'ordine che ogni
 * singolo provider restituisce (mai curato per affidabilità — così è
 * arrivato tencent/hy4-preview, rate-limited upstream). Un preferito
 * esplicito — quello che l'owner ha già indicato il 29/8 ("usa come
 * modello d'ora in poi Gemini 37 Flash"), id reale verificato su
 * OpenRouter — vince quando è fra i profili scoperti; altrimenti resta
 * il comportamento di sempre (show_in_composer, poi il primo), mai un
 * blocco se assente.
 */
const MODELLO_PREFERITO_DEFAULT = 'google/gemini-3.7-flash'

/**
 * ⭐⭐⭐ 2/9 — il valore di ritorno (`riuscito`) esiste per
 * refreshCodeModels() qui sotto: senza di lui il toast "Modelli
 * aggiornati" sarebbe vero solo per il caso comune e falso ogni volta
 * che il catch sotto interviene — lo stesso genere di messaggio che
 * dichiara un successo non avvenuto che questa fase intera esiste per
 * eliminare. Il chiamante al mount (sotto, `void caricaModelliCodice()`)
 * ignora il ritorno di proposito: lì un fallimento silenzioso è già
 * onesto, perché non c'è nessun toast ad affermare il contrario.
 */
async function caricaModelliCodice(): Promise<boolean> {
    let riuscito = true
    try {
        const tutti = await caricaProfiliModelloCodice(settings.state.model_lab ?? TALOS_DEFAULT_MODEL_LAB_PREFERENCES)
        codeModelProfiles.value = tutti.filter((profilo) => profilo.provider === 'openrouter')
    } catch (error) {
        console.warn('[codice] caricamento profili modello fallito:', error)
        codeModelProfiles.value = []
        riuscito = false
    }
    if (!codeModelProfiles.value.some((profilo) => profilo.id === codeModelProfileId.value)) {
        const preferito = codeModelProfiles.value.find((profilo) => profilo.model === MODELLO_PREFERITO_DEFAULT && profilo.status !== 'disabled')
            ?? codeModelProfiles.value.find((profilo) => profilo.show_in_composer)
            ?? codeModelProfiles.value[0]
        codeModelProfileId.value = preferito?.id ?? ''
    }
    return riuscito
}

/**
 * Il profilo VERO dietro `codeModelProfileId` — `undefined` quando
 * ancora nessun catalogo è stato caricato, o il provider scelto non ha
 * (più) un profilo OpenRouter valido: `startRealSessionFromMessage`
 * legge questo per decidere se mandare un `modello` esplicito o lasciare
 * il default del server (mai una stringa a caso).
 */
const codeModeloSelezionato = computed(() => codeModelProfiles.value.find((profilo) => profilo.id === codeModelProfileId.value)?.model ?? null)

/**
 * ⭐⭐⭐ 2/9 — gemello di `codeModeloSelezionato` per il picker Planner:
 * `null` quando `codeModelloEsecutoreId` è `null` ("Automatico", il caso
 * comune) O quando l'id scelto non risolve più a un profilo valido (stesso
 * ripiego onesto del modello principale — mai una stringa a caso).
 */
const codeModelloEsecutoreSelezionato = computed(() => {
    if (codeModelloEsecutoreId.value === null) return null
    return codeModelProfiles.value.find((profilo) => profilo.id === codeModelloEsecutoreId.value)?.model ?? null
})
const codeComposerShape = computed(() => talosComposerFlags(
    settings.state.shell.composer_shape,
    settings.state.shell.composer_plus,
))
const codeCanSend = computed(() => codePrompt.value.trim().length > 0 && !creatingSession.value)

let scriptEl: HTMLScriptElement | null = null
let mounted = false
const keyboardListeners: PluginListenerHandle[] = []
let composerLayoutObserver: ResizeObserver | null = null

async function retainKeyboardListener(registration: Promise<PluginListenerHandle>): Promise<void> {
    try {
        const handle = await registration
        if (!mounted) {
            await handle.remove()
            return
        }
        keyboardListeners.push(handle)
    } catch {
        // Harness remains usable without the enhancement; visualViewport is
        // retained by the static runtime as the browser fallback.
    }
}

async function attachKeyboardBridge(): Promise<void> {
    await Promise.all([
        retainKeyboardListener(Keyboard.addListener(
            'keyboardWillShow',
            () => {
                setTalosHarnessUiKeyboardOpen(true)
                void nextTick(syncComposerLayout)
            },
        )),
        retainKeyboardListener(Keyboard.addListener(
            'keyboardWillHide',
            () => {
                setTalosHarnessUiKeyboardOpen(false)
                void nextTick(syncComposerLayout)
            },
        )),
    ])
}

async function detachKeyboardBridge(): Promise<void> {
    setTalosHarnessUiKeyboardOpen(false)
    const listeners = keyboardListeners.splice(0)
    await Promise.allSettled(listeners.map((listener) => listener.remove()))
}

function syncComposerClearance(): void {
    const host = hostEl.value
    const dock = composerDockEl.value
    if (!host || !dock) return
    const navVisible = !document.body.classList.contains('keyboard-open')
        && (window.innerWidth <= 780 || window.innerHeight <= 500)
    const navClearance = navVisible ? 68 : 0
    host.style.setProperty(
        '--talos-code-composer-clearance',
        `${Math.ceil(dock.getBoundingClientRect().height + navClearance + 12)}px`,
    )
}

function syncComposerWorkspaceBounds(): void {
    const host = hostEl.value
    const dock = composerDockEl.value
    if (!host || !dock) return
    const workspace = host.shadowRoot?.querySelector<HTMLElement>('.workspace-shell')
    if (!workspace) {
        dock.style.left = '0px'
        dock.style.right = '0px'
        return
    }
    const hostRect = host.getBoundingClientRect()
    const workspaceRect = workspace.getBoundingClientRect()
    dock.style.left = `${Math.max(0, workspaceRect.left - hostRect.left)}px`
    dock.style.right = `${Math.max(0, hostRect.right - workspaceRect.right)}px`
}

function syncComposerLayout(): void {
    syncComposerWorkspaceBounds()
    syncComposerClearance()
}

function observeComposerLayout(): void {
    composerLayoutObserver?.disconnect()
    composerLayoutObserver = null
    const host = hostEl.value
    const dock = composerDockEl.value
    const workspace = host?.shadowRoot?.querySelector<HTMLElement>('.workspace-shell')
    if (!host || !dock || typeof ResizeObserver !== 'function') {
        syncComposerLayout()
        return
    }
    composerLayoutObserver = new ResizeObserver(syncComposerLayout)
    composerLayoutObserver.observe(host)
    composerLayoutObserver.observe(dock)
    if (workspace) composerLayoutObserver.observe(workspace)
    syncComposerLayout()
}

function updateCodePrompt(value: string): void {
    codePrompt.value = value
    if (/@$/.test(value)) announceTalosHarnessUiComposerAction('references')
}

async function submitCodePrompt(): Promise<void> {
    const text = codePrompt.value.trim()
    if (!text || creatingSession.value) return
    if (isDraft.value) {
        creatingSession.value = true
        try {
            const created = await createCodiceSession(text)
            codePrompt.value = ''
            pendingFirstPrompt = text
            pendingFirstPromptModello = codeModeloSelezionato.value
            pendingFirstPromptModelloEsecutore = codeModelloEsecutoreSelezionato.value
            await router.replace({ name: 'harness-session', params: { id: created.id } })
        } finally {
            creatingSession.value = false
        }
        return
    }
    if (!submitTalosHarnessUiPrompt(text, codeModeloSelezionato.value ?? undefined, codeModelloEsecutoreSelezionato.value ?? undefined)) return
    codePrompt.value = ''
}

function announceCodeComposerAction(action: string): void {
    announceTalosHarnessUiComposerAction(action)
}

/*
 * ⭐⭐⭐ 2/9 — "refresh-models" era nella tabella mockup del composer
 * (piano §14.3): il tasto "Aggiorna" del picker modello non faceva
 * nulla di reale, solo un toast finto ("Nessuna discovery di rete
 * eseguita"). caricaModelliCodice() (sopra, già la fonte VERA del
 * picker — vincolo CODE-COMPOSER-SINGLE-SOURCE-01: questa schermata
 * resta indipendente dal composable di chat regolare, mai importato
 * qui) fa esattamente ciò che "Aggiorna" promette: richiama i
 * provider configurati e ripopola codeModelProfiles col catalogo
 * vero. L'annuncio al bridge resta (stesso toast di sempre), ma solo
 * DOPO che il refresh vero è finito — mai un "fatto" prima del fatto.
 */
async function refreshCodeModels(): Promise<void> {
    const riuscito = await caricaModelliCodice()
    announceCodeComposerAction(riuscito ? 'refresh-models' : 'refresh-models-failed')
}

function selectCodeCommand(command: TalosMobileCommandId): void {
    if (command === 'send_message') { void submitCodePrompt(); return }
    if (command === 'open_browse') {
        codeBrowseMode.value = true
        announceCodeComposerAction('browse')
        return
    }
    if (command === 'open_context_vault') { void router.push({ name: 'context' }); return }
    if (command === 'open_model_center') { void router.push({ name: 'settings-models' }); return }
    if (command === 'open_doctor') { void router.push({ name: 'doctor' }); return }
    if (command === 'open_notes') { void router.push({ name: 'notes' }); return }
    if (command === 'open_tasks') { void router.push({ name: 'tasks' }); return }
    // 28/8: real navigation to the draft route, same path the sidebar's
    // "New" button uses — was `codePrompt.value = ''` (cleared text, no
    // session), a much weaker stand-in from when sessions were still demo.
    if (command === 'new_session') { void router.push({ name: 'harness-session', params: { id: 'new' } }); return }
    announceCodeComposerAction(command)
}

function returnToHarnessList(): void {
    void router.push({ name: 'harness' })
}

/** Vedi la nota d'apertura: pulisce solo ciò che sopravvive al componente
 * (i due ascoltatori su `window`/`visualViewport` — lo shadow root e i suoi
 * due ascoltatori interni muoiono da soli con l'host). */
function teardown(): void {
    ;(window as unknown as { __talosHarnessDestroy?: () => void }).__talosHarnessDestroy?.()
    delete (window as unknown as { __talosHarnessRoot?: unknown }).__talosHarnessRoot
    delete (window as unknown as { __talosHarnessHost?: unknown }).__talosHarnessHost
    delete (window as unknown as { __talosHarnessHostBack?: unknown }).__talosHarnessHostBack
    delete (window as unknown as { __talosHarnessHostViewChange?: unknown }).__talosHarnessHostViewChange
    delete (window as unknown as { __talosHarnessHostPermissionChange?: unknown }).__talosHarnessHostPermissionChange
    delete (window as unknown as { __talosHarnessApiBase?: unknown }).__talosHarnessApiBase
    delete (window as unknown as { __talosHarnessRichiediDato?: unknown }).__talosHarnessRichiediDato
    scriptEl?.remove()
    scriptEl = null
}

/**
 * ⭐⭐⭐ 28/8 — trovato SUL DEVICE, non ipotizzato: `avviaServerHarness`
 * (nativo) torna `ok:true` non appena il COMANDO DI LANCIO è partito
 * (`setsid node ... &`, exitCode 0) — non quando il server ha finito di
 * caricare le sue dipendenze e si è messo davvero in ascolto sulla
 * porta. Un primo messaggio inviato subito dopo un avvio a freddo
 * arrivava a un server non ancora pronto: "Avvio non riuscito: Failed
 * to fetch", riprodotto e catturato PRIMA di scrivere questa cura (mai
 * assunto). Il commento sul lato nativo lo dichiarava già: "quella
 * prova è compito del chiamante, via un secondo giro" — questo È quel
 * secondo giro. Intervallo fisso breve (non backoff esponenziale con
 * jitter: quello serve contro il "thundering herd" di MOLTI client
 * verso lo stesso server, qui è un solo telefono che interroga se
 * stesso — ricerca 28/8), tetto basso perché un avvio reale impiega
 * meno di un secondo una volta che il processo esiste (misurato nel
 * ledger FASE-5-EXECUTION-PLANE).
 */
async function attendiServerHarnessPronto(tentativiMassimi = 15, intervalloMs = 300): Promise<boolean> {
    for (let tentativo = 0; tentativo < tentativiMassimi; tentativo += 1) {
        try {
            const risposta = await fetch(`${talosHarnessUiApiBase()}/api/v1/health`, { cache: 'no-store' })
            if (risposta.ok) return true
        } catch {
            // Non ancora in ascolto — si riprova, non si registra un errore
            // per un tentativo che ci si aspetta possa fallire.
        }
        await new Promise((resolve) => { window.setTimeout(resolve, intervalloMs) })
    }
    return false
}

/**
 * ⭐⭐⭐ 28/8, "procedi in ordine" punto 3 — un messaggio reale (item 3) vuole
 * un server harness-ui reale già in ascolto (item 2, ledger
 * FASE-5-EXECUTION-PLANE): senza questa chiamata, il PRIMO messaggio di
 * una sessione nuova (`pendingFirstPrompt` più sotto, inoltrato SENZA che
 * la persona tocchi niente altro) arriverebbe a un server ancora spento.
 * Idempotente lato nativo (`avviaServerHarness`, pid file + `kill -0`,
 * device-verificato) — chiamarla a ogni mount non ripete staging/push se
 * il server è già vivo. Solo debug: `talosTerminaleDisponibile()` è la
 * stessa domanda già usata altrove per questo plugin (non esiste in
 * release).
 *
 * ⭐⭐⭐ 3/9 — owner, item 13 aggiunto di persona alla coda (item 13, non
 * uno dei 12 di avm-03: "deve essere segnalato in
 * modo più fluido possibile"): PRIMA questa funzione tornava sempre
 * `void` e ogni fallimento (plugin assente, avvio fallito, mai pronto
 * entro il tetto) finiva SOLO in `console.warn` — nessuna persona lo
 * vede mai. Chi usava Codice scopriva il problema più a valle, da un
 * errore di rete grezzo verso un server mai partito ("technical, non
 * deve succedere" — owner). Ricerca fatta: la formula guida per un
 * messaggio di connessione è [cosa] + [perché, se utile] + [come si
 * risolve], mai il gergo tecnico — l'esempio da NON fare, citato per
 * contrasto, è proprio "the network location cannot be reached"
 * (UX Content Collective, error-message guides, 2026). Il chiamante
 * (mountMockup più sotto) legge questo esito e mostra un avviso in
 * linguaggio naturale — "cosa" è onesto (il motore su cui gira Codice
 * non è partito), "come" è l'UNICO rimedio che si può promettere in
 * buona fede: riaprire l'app. Nessun secondo tentativo automatico
 * inventato, nessun interruttore che non esiste — sarebbe un'istruzione
 * falsa quanto l'errore tecnico che sostituisce.
 */
async function avviaServerHarnessSeDisponibile(): Promise<{ ok: boolean, motivoInterno: string | null }> {
    if (!talosTerminaleDisponibile()) return { ok: false, motivoInterno: 'plugin-assente' }
    try {
        const esito = await avviaServerHarnessConChiaveProvider()
        if (!esito.ok) {
            console.warn('[harness-ui] avvio server non riuscito:', esito.motivo, esito.stderr)
            return { ok: false, motivoInterno: esito.motivo || 'avvio-fallito' }
        }
        const pronto = await attendiServerHarnessPronto()
        if (!pronto) {
            console.warn('[harness-ui] server avviato ma non risponde entro il tetto di attesa')
            return { ok: false, motivoInterno: 'timeout-avvio' }
        }
        return { ok: true, motivoInterno: null }
    } catch (error) {
        console.warn('[harness-ui] avvio server: eccezione', error)
        return { ok: false, motivoInterno: 'eccezione' }
    }
}

/**
 * ⭐⭐⭐ 30/8 — il PONTE verso Note/Attività/Memoria/Libreria per il kernel
 * dell'harness. Owner: quei sistemi esistono già, maturi e testati
 * (`@/lib/tools/toolset.ts`), il difetto era che il kernel (talosHarness.mjs,
 * un processo Node SEPARATO, avviato via ADB shell — mai lo stesso UID
 * dell'app, mai un accesso diretto all'SQLite privato) non li ha mai potuti
 * raggiungere. Stesso schema di `__talosHarnessApiBase`/`__talosHarnessHostBack`
 * sopra: una funzione piantata su `window` PRIMA di eseguire app.js, che vive
 * nello STESSO realm JS di questa schermata (shadow DOM, non un iframe — vedi
 * la nota d'apertura del file) e quindi può chiamare `codiceDati.ts` diretto,
 * senza toccare il composable dell'intera chat (CODE-COMPOSER-SINGLE-SOURCE-01
 * ne vieta anche solo il nome scritto qui — vedi `codiceDati.ts` per il
 * perché).
 *
 * Il kernel la raggiunge indirettamente: emette un evento AG-UI
 * (`DataRequested`, session-registry.mjs), app.js lo vede e chiama QUESTA
 * funzione, poi POSTa il risultato a `.../data` — lo stesso schema
 * richiesta/risposta già costruito per l'approvazione "On request"
 * (richiediApprovazione/rispondiApprovazione), riusato qui per i dati invece
 * che per un sì/no.
 *
 * ⭐ 30/8 — estesa dalla prima fetta (solo `notes_list`) a tutta la
 * famiglia Note/Attività/Memoria/Libreria/Ricerca (quest'ultima SOLO
 * in lettura, vedi `codiceDati.ts`). Ogni `tipo` qui sotto ha una spiegazione esatta di
 * `args` in `session-registry.mjs` (dove viene impacchettato) — questa
 * funzione si limita a spacchettarlo e chiamare `codiceDati.ts`, zero
 * logica propria. Un `tipo` non riconosciuto RIFIUTA (mai un `[]`
 * silenzioso che si legge come "nessuna nota" quando in realtà è
 * "questo tipo non è ancora collegato") — stesso principio di
 * `CIECO non è FALLITO` già in memoria.
 */
async function talosHarnessRichiediDato(tipo: string, args: unknown): Promise<unknown> {
    if (tipo === 'notes_list') return listCodiceNotes()
    if (tipo === 'notes_create') return createCodiceNote(args as { title: string, content: string })
    if (tipo === 'notes_update') {
        const { id, patch } = args as { id: string, patch: { title?: string, content?: string } }
        return updateCodiceNote(id, patch)
    }
    if (tipo === 'notes_delete') return deleteCodiceNote((args as { id: string }).id)
    if (tipo === 'tasks_list') return listCodiceTasks()
    if (tipo === 'tasks_create') return createCodiceTask(args as { title: string, description: string | null, priority: 'low' | 'normal' | 'high' })
    if (tipo === 'tasks_complete') {
        const { id, status } = args as { id: string, status: 'todo' | 'doing' | 'done' }
        return setCodiceTaskStatus(id, status)
    }
    if (tipo === 'tasks_update') {
        const { id, patch } = args as { id: string, patch: { title?: string, description?: string | null, priority?: 'low' | 'normal' | 'high' } }
        return updateCodiceTask(id, patch)
    }
    if (tipo === 'tasks_delete') return deleteCodiceTask((args as { id: string }).id)
    if (tipo === 'memory_search') return searchCodiceMemories((args as { query: string }).query)
    if (tipo === 'memory_write') return createCodiceMemory(args as { title: string, content: string })
    if (tipo === 'memory_update') {
        const { title, patch } = args as { title: string, patch: { title?: string, content?: string } }
        return updateCodiceMemoryByTitle(title, patch)
    }
    if (tipo === 'memory_delete') return deleteCodiceMemoryByTitle((args as { title: string }).title)
    if (tipo === 'library_list') return listCodiceLibraryEntries()
    if (tipo === 'library_read') return readCodiceLibraryDoc((args as { id: string }).id)
    if (tipo === 'library_rename') {
        const { id, name } = args as { id: string, name: string }
        return renameCodiceLibraryFile(id, name)
    }
    if (tipo === 'library_delete') return deleteCodiceLibraryFile((args as { id: string }).id)
    if (tipo === 'library_search') {
        const { query, limit } = args as { query: string, limit?: number }
        return searchCodiceLibrary(query, limit)
    }
    if (tipo === 'library_file_origin') return readCodiceLibraryFileOrigin((args as { id: string }).id)
    if (tipo === 'research_list') return listCodiceResearch()
    if (tipo === 'research_read') return readCodiceResearchReport((args as { id: string }).id)
    throw new Error(`tipo di dato non collegato all'harness: "${tipo}"`)
}

async function mountMockup(): Promise<void> {
    const host = hostEl.value
    if (!host) return
    loading.value = true
    loadError.value = false
    teardown()
    try {
        // Parte SUBITO, in parallelo col caricamento locale di HTML/CSS/script
        // (che non dipende dal server): si aspetta il suo esito solo più giù,
        // appena prima di inoltrare un eventuale primo messaggio in sospeso.
        const serverPronto = avviaServerHarnessSeDisponibile()
        // ⭐⭐⭐ 3/9 — reagisce al fallimento SENZA bloccare il montaggio (stesso
        // motivo del commento sopra: l'interfaccia parte comunque, dai soli
        // asset locali). `.then` invece di un secondo `await` — un avviso in
        // linguaggio naturale appena l'esito è noto, che ci sia o no un
        // messaggio in sospeso da inoltrare (quel caso specifico è già
        // coperto più sotto, ma riaprire una sessione ESISTENTE senza scrivere
        // nulla non passava mai da lì: restava silenzioso fino al primo
        // errore di rete grezzo).
        serverPronto.then((esito) => {
            if (!esito.ok) toasts.push({ message: t('harness.bridgeNotConnected'), durationMs: 6000 })
        })
        const html = await fetch(harnessUiAssetUrl('index.html'), { cache: 'no-cache' }).then((response) => {
            if (!response.ok) throw new Error(`harness-ui index.html: ${response.status}`)
            return response.text()
        })
        // Un secondo giro sulla STESSA schermata (id diverso, istanza Vue
        // riusata) non può richiamare attachShadow — è permesso una volta
        // sola per elemento. Riusa quello che c'è, ripulito, invece di
        // presumere che sia sempre il primo giro.
        const shadowRoot = host.shadowRoot ?? host.attachShadow({ mode: 'open' })
        shadowRoot.replaceChildren()
        // Owner 24/8, dopo aver VISTO il mockup incorporato: due sidebar allo
        // stesso tempo ("un casino") — quella vera di TALOS (chat, sempre
        // presente su tablet: TalosTabletSidebar.vue, F6, "Claude split-view
        // pattern") e quella propria del mockup (sessioni), con
        // branding/campanella duplicati. Cercato lo stato dell'arte: l'App
        // Shell possiede layout E navigazione, il "remote" incorporato non
        // porta la sua — "critical for avoiding multiple navigation
        // components rendering simultaneously" (micro-frontends.tech). Fuse
        // in una sola: questa classe fa scomparire SOLO il pannello sessioni
        // del mockup quando è incorporato — `:host(.talos-embedded)` in
        // styles.css, lo stesso schema `:host()` condizionale citato da MDN
        // per "la stessa web component, comportamento diverso dato dal
        // genitore". Sfogliare le sessioni resta un tocco via
        // `HarnessScreen.vue` (nativo, già costruito), non un secondo
        // pannello persistente in competizione col vero. L'apertura diretta
        // del file (`harness-ui/index.html` da solo, per la revisione
        // design) non porta MAI questa classe: resta il mockup completo di
        // Codex, invariato.
        host.classList.add('talos-embedded')

        const link = document.createElement('link')
        link.rel = 'stylesheet'
        link.href = harnessUiAssetUrl('styles.css')
        shadowRoot.appendChild(link)

        // `index.html` finisce con <script src="app.js"> — saltato qui,
        // aggiunto sotto come elemento tracciato a parte (per poterlo
        // rimuovere allo smontaggio). Uno script arrivato via DOMParser è
        // comunque marcato "già eseguito" dallo spec e non partirebbe
        // spostandolo: escluderlo evita solo una fetch ridondante e inerte.
        const parsed = new DOMParser().parseFromString(html, 'text/html')
        while (parsed.body.firstChild) {
            const node = parsed.body.firstChild
            if (node.nodeName === 'SCRIPT') { node.remove(); continue }
            shadowRoot.appendChild(node)
        }

        // Pianta i puntatori PRIMA di eseguire app.js: le sue $/$$/ROOT()/HOST()
        // di primo livello li leggono appena lo script parte.
        ;(window as unknown as { __talosHarnessRoot?: unknown }).__talosHarnessRoot = shadowRoot
        ;(window as unknown as { __talosHarnessHost?: unknown }).__talosHarnessHost = host
        ;(window as unknown as { __talosHarnessHostBack?: () => void }).__talosHarnessHostBack = returnToHarnessList
        ;(window as unknown as { __talosHarnessHostViewChange?: (view: string) => void })
            .__talosHarnessHostViewChange = (view) => { codeView.value = view }
        ;(window as unknown as { __talosHarnessHostPermissionChange?: (permission: string) => void })
            .__talosHarnessHostPermissionChange = (permission) => { codePermission.value = permission }
        ;(window as unknown as { __talosHarnessApiBase?: string }).__talosHarnessApiBase = talosHarnessUiApiBase()
        ;(window as unknown as { __talosHarnessRichiediDato?: (tipo: string, args: unknown) => Promise<unknown> })
            .__talosHarnessRichiediDato = talosHarnessRichiediDato

        await new Promise<void>((resolve, reject) => {
            const script = document.createElement('script')
            script.src = harnessUiAssetUrl('app.js')
            script.addEventListener('load', () => resolve())
            script.addEventListener('error', () => reject(new Error('harness-ui app.js: load error')))
            scriptEl = script
            shadowRoot.appendChild(script)
        })
        const selection = loadedSession.value
        if (!selection || !selectTalosHarnessUiSession({ id: selection.id, title: selection.title })) {
            throw new Error('harness-ui session selection unavailable')
        }
        // Draft→real transition: the message that CREATED this session was
        // typed before the mockup existed to receive it — forward it now,
        // the one time the mockup is freshly mounted for this session.
        if (pendingFirstPrompt) {
            await serverPronto // il messaggio chiama un server VERO ora (item 3): deve essere in ascolto prima
            const toSend = pendingFirstPrompt
            const modelloDaInviare = pendingFirstPromptModello
            const modelloEsecutoreDaInviare = pendingFirstPromptModelloEsecutore
            pendingFirstPrompt = null
            pendingFirstPromptModello = null
            pendingFirstPromptModelloEsecutore = null
            submitTalosHarnessUiPrompt(toSend, modelloDaInviare ?? undefined, modelloEsecutoreDaInviare ?? undefined)
        }
    } catch {
        loadError.value = true
    } finally {
        loading.value = false
        await nextTick()
        observeComposerLayout()
    }
}

onMounted(async () => {
    mounted = true
    if (!available) { loading.value = false; return }
    void caricaModelliCodice()
    void attachKeyboardBridge()
    await resolveSession()
    if (!mounted) return
    if (isDraft.value) { loading.value = false; return }
    if (loadedSession.value) void mountMockup()
    else loading.value = false
})

watch(sessionId, async () => {
    if (!mounted || !available) return
    loading.value = true
    await resolveSession()
    if (!mounted) return
    if (isDraft.value) {
        teardown()
        loading.value = false
        loadError.value = false
        return
    }
    const selection = loadedSession.value
    if (!selection) {
        teardown()
        loading.value = false
        loadError.value = false
        return
    }
    if (!selectTalosHarnessUiSession({ id: selection.id, title: selection.title })) {
        void mountMockup()
    } else {
        loading.value = false
    }
}, { flush: 'post' })

watch(composerDockEl, observeComposerLayout, { flush: 'post' })
watch(codeView, () => { void nextTick(syncComposerLayout) })

onBeforeUnmount(() => {
    mounted = false
    void detachKeyboardBridge()
    composerLayoutObserver?.disconnect()
    composerLayoutObserver = null
    teardown()
})
</script>

<template>
    <TalosMobileScreen
        :title="t('navigation.harness')"
        data-testid="talos-harness-session-screen"
        :data-harness-session-id="sessionId"
        :data-harness-session-title="loadedSession?.title"
        tablet-edge-to-edge
        edge-to-edge
        embedded
    >
        <p v-if="!available" data-testid="talos-harness-session-unavailable" class="text-sm text-[var(--talos-muted)]">
            {{ t('harness.unavailable') }}
        </p>
        <div
            v-else-if="!isDraft && !sessionResolving && !loadedSession"
            data-testid="talos-harness-session-unknown"
            class="flex h-full items-center justify-center p-6"
        >
            <div class="flex w-full max-w-md flex-col items-center gap-3 rounded-[var(--talos-radius-card)] border border-[var(--talos-border)] bg-[var(--talos-panel)] p-[var(--talos-space-card)] text-center">
                <span class="flex size-10 items-center justify-center rounded-full bg-[var(--talos-warning-soft)] text-[var(--talos-warning)]">
                    <CircleAlert class="size-5" aria-hidden="true" />
                </span>
                <p data-testid="talos-harness-session-unknown-title" class="text-sm font-semibold text-[var(--talos-text)]">
                    {{ t('harness.unknownTitle') }}
                </p>
                <p class="max-w-sm text-xs leading-5 text-[var(--talos-muted)]">
                    {{ t('harness.unknownSession') }}
                </p>
                <button
                    type="button"
                    data-testid="talos-harness-session-unknown-back"
                    class="talos-pressable min-h-touch rounded-[var(--talos-radius-control)] border border-[var(--talos-border)] px-[var(--talos-space-control)] text-sm font-semibold text-[var(--talos-text)]"
                    @click="returnToHarnessList"
                >
                    {{ t('harness.unknownBack') }}
                </button>
            </div>
        </div>
        <template v-else>
            <p v-if="!isDraft && (sessionResolving || loading)" data-testid="talos-harness-session-opening" class="text-sm text-[var(--talos-muted)]">
                {{ t('harness.openingMockup') }}
            </p>
            <p v-else-if="!isDraft && loadError" data-testid="talos-harness-session-error" class="text-sm text-[var(--talos-muted)]">
                {{ t('harness.loadFailed') }}
            </p>
            <div
                v-else-if="isDraft"
                data-testid="talos-harness-session-draft-hint"
                class="flex h-full flex-col items-center justify-center p-6 text-center"
            >
                <span
                    class="talos-short-logo talos-chat-brand-logo talos-short-logo-hero"
                    aria-hidden="true"
                >
                    <span class="talos-short-logo-mark"></span>
                </span>
                <span class="talos-orbitron-brand mt-2 text-4xl font-semibold text-[var(--talos-text)] sm:text-5xl">TALOS</span>
                <TalosWelcomeTitle />
                <p class="mt-1 max-w-[28rem] text-xs leading-5 text-[var(--talos-muted)]">
                    {{ t('harness.draftHint') }}
                </p>
            </div>
            <div
                v-show="!isDraft && !sessionResolving && !loading && !loadError"
                ref="hostEl"
                data-testid="talos-harness-session-host"
                class="h-full w-full"
            />
            <div
                v-show="isDraft || (!sessionResolving && !loading && !loadError && codeView === 'chat')"
                ref="composerDockEl"
                data-testid="talos-code-composer-dock"
                class="talos-code-composer-dock"
            >
                <TalosMobileComposer
                    :prompt="codePrompt"
                    :model-profiles="codeModelProfiles"
                    :selected-model-profile-id="codeModelProfileId"
                    :show-executor-model="true"
                    :executor-model-profiles="codeModelProfiles"
                    :selected-executor-model-profile-id="codeModelloEsecutoreId"
                    :selected-effort="codeEffort"
                    :thinking="codeThinking"
                    :can-send="codeCanSend"
                    :sending="creatingSession"
                    :drawer-mode="codeComposerShape.drawerMode"
                    :immersive-composer="codeComposerShape.immersiveComposer"
                    :plus-dropdown="codeComposerShape.plusDropdown"
                    :browse-mode="codeBrowseMode"
                    :attachments-available="true"
                    :context-available="true"
                    :enhancing-prompt="codeEnhancingPrompt"
                    :prompt-enhancement="codePromptEnhancement"
                    :prompt-enhancement-error="codePromptEnhancementError"
                    :enhancer-depth="codeEnhancer.depth"
                    :enhancer-model="codeEnhancer.model"
                    :enhancer-effort="codeEnhancer.effort"
                    :enhancer-models="codeEnhancerModels"
                    @update:prompt="updateCodePrompt"
                    @send="submitCodePrompt"
                    @select-model-profile="codeModelProfileId = $event"
                    @select-executor-model-profile="codeModelloEsecutoreId = $event"
                    @select-effort="codeEffort = $event"
                    @select-thinking="codeThinking = $event"
                    @toggle-browse="codeBrowseMode = $event"
                    @select-slash-command="selectCodeCommand"
                    @attach="announceCodeComposerAction('attach')"
                    @take-photo="announceCodeComposerAction('photo')"
                    @pick-photos="announceCodeComposerAction('photos')"
                    @open-context="void router.push({ name: 'context' })"
                    @open-model-lab="void router.push({ name: 'settings-models' })"
                    @refresh-models="void refreshCodeModels()"
                    @enhance-prompt="void requestCodeEnhancePrompt()"
                    @enhance-blocked="onCodeEnhanceBlocked"
                    @update-enhancer-depth="(value) => void setCodeEnhancer({ depth: value })"
                    @update-enhancer-model="(value) => void setCodeEnhancer({ model: value })"
                    @update-enhancer-effort="(value) => void setCodeEnhancer({ effort: value as TalosMobileEffortLevel })"
                    @cancel-prompt-enhancement="clearCodePromptEnhancement"
                    @insert-prompt-enhancement="insertCodeEnhancePrompt"
                    @replace-prompt-enhancement="replaceCodeEnhancePrompt"
                    @open-browser-url="announceCodeComposerAction('browser-url')"
                >
                    <button
                        v-if="!isDraft"
                        type="button"
                        data-testid="talos-code-autonomy-chip"
                        :aria-label="`${t('autonomia.titolo')}: ${codePermission}`"
                        :title="codePermission"
                        aria-haspopup="dialog"
                        class="talos-pressable flex min-h-touch max-w-40 shrink-0 items-center gap-1.5 rounded-2xl border border-[var(--talos-border)] bg-[var(--talos-panel)] px-2.5 text-xs text-[var(--talos-muted)]"
                        @click="announceCodeComposerAction('permissions')"
                    >
                        <ShieldCheck class="size-3.5 shrink-0 text-[var(--talos-accent)]" aria-hidden="true" />
                        <span class="hidden min-w-0 truncate md:inline">{{ codePermission }}</span>
                    </button>
                </TalosMobileComposer>
            </div>
        </template>
    </TalosMobileScreen>
</template>

<style scoped>
.talos-code-composer-dock {
    position: absolute;
    right: 0;
    bottom: 0;
    left: 0;
    z-index: 40;
    pointer-events: none;
    transition:
        opacity var(--talos-motion-duration-composer-expand, 180ms) var(--talos-motion-ease-composer-expand, ease-out),
        transform var(--talos-motion-duration-composer-expand, 180ms) var(--talos-motion-ease-composer-expand, ease-out);
}

.talos-code-composer-dock :deep([data-testid="talos-mobile-composer"]) {
    pointer-events: auto;
    box-sizing: border-box;
    width: calc(100% - 1.5rem);
    max-width: 920px;
    margin-inline: auto;
}

@media (max-width: 780px), (max-height: 500px) {
    .talos-code-composer-dock {
        bottom: 68px;
    }
}

:global(body.keyboard-open .talos-code-composer-dock) {
    bottom: 0;
}

@media (prefers-reduced-motion: reduce) {
    .talos-code-composer-dock {
        transition-duration: 0ms;
    }
}
</style>
