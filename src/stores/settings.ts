/**
 * Local-first settings preferences — the desktop `preferences` subtrees that are pure
 * client render/behaviour prefs (chat layout, AI defaults, appearance visibility,
 * F4-#25: keyboard shortcuts REMOVED — hardware bindings make no sense on a phone). Each subtree is fail-closed through the ported desktop resolvers
 * (`sanitizeTalosChatLayout`)
 * so parity is exact. Persisted in Capacitor Preferences; theme + color mode live in the
 * theme store. Server-coupled tabs (search/browser/integrations/…) are replicated in the
 * UI as gated/read-only per the identical-to-desktop rule but hold no live state here.
 */
import { reactive, readonly } from 'vue'
import {
    TALOS_PROMPT_ENHANCER_DEFAULT_DEPTH,
    isTalosPromptEnhancerDepth,
    type TalosPromptEnhancerDepth,
} from '@/lib/chat/promptEnhancerDepth'
import type { TalosSpeechEngine } from '@/lib/voice/personalVoiceContracts'
import { Preferences } from '@capacitor/preferences'
import type { TalosSearchSourceId } from '@/lib/search/searchSources'
import type { TalosLibrarySort } from '@/lib/libraryGrouping'
import {
    TALOS_INSTALLED_MODEL_SORTS,
    TALOS_INSTALLED_MODEL_SORT_DEFAULT,
    type TalosInstalledModelSort,
} from '@/lib/models/installedModels'
import { TALOS_DEFAULT_CHAT_LAYOUT, sanitizeTalosChatLayout } from '@/lib/talosChatLayout'
import {
    TALOS_DEFAULT_COMPOSER_PLUS,
    TALOS_DEFAULT_COMPOSER_SHAPE,
    talosComposerFromLegacy,
    talosComposerPlusExists,
    talosComposerShapeExists,
    type TalosComposerPlusSurface,
    type TalosComposerShape,
} from '@/lib/composerStyle'

/** Owner 2026-07-25: "di default large font size e small chat font size". */
const TALOS_MOBILE_DEFAULT_BUBBLE_SCALE = 'xcompact' as const
import type { TalosChatLayoutPreferences } from '@/lib/talosTypes'
import {
    parseTalosMotionV6Preferences,
    type TalosInterfaceMotionCategories,
    type TalosInterfaceMotionPreferences,
    type TalosMotionV6Preferences,
} from '@/motion-v6/contracts'
import { createDefaultTalosMotionV6Preferences } from '@/motion-v6/defaults'
import {
    TALOS_MOBILE_EFFORT_ORDER,
    type TalosMobileEffortLevel,
} from '@/lib/mobileEffort'
import { TALOS_TABLET_SIDEBAR_DEFAULT, clampTalosTabletSidebarWidth } from '@/lib/tabletLayout'
import {
    parseTalosFontScale,
    TALOS_DEFAULT_FONT_SCALE,
    type TalosFontScale,
} from '@/lib/talosFontScale'
import {
    TALOS_DEFAULT_TOOL_PERMISSIONS,
    TALOS_TOOL_ACTIONS,
    parseTalosChosenToolActions,
    talosEffectiveToolPermissions,
    type TalosToolAction,
    type TalosToolPermission,
    type TalosToolPermissions,
} from '@/lib/tools/permissionTypes'
import {
    isTalosAgentToolId,
    parseTalosAgentToolEnabled,
    type TalosAgentToolEnabled,
    type TalosAgentToolId,
} from '@/lib/tools/toolControls'
import {
    applyTalosToolAuthorizationGrant,
    parseTalosToolAuthorizationGrants,
    revokeTalosToolAuthorizationGrant,
    type TalosToolAuthorizationGrantsV1,
} from '@/lib/tools/toolAuthorizations'
import { talosBridgeCall } from '@/lib/talosBridge'
import {
    TALOS_DEFAULT_MODEL_LAB_PREFERENCES,
    parseTalosMobileModelLabPreferences,
    type TalosMobileModelLabPreferences,
} from '@/lib/modelLabContracts'
import {
    parseTalosLocalEngineProbePreferences,
    type TalosLocalEngineProbePreferences,
} from '@/lib/localEngineProbeConsent'
import {
    TALOS_DEFAULT_MOBILE_BROWSER_PREFERENCES,
    parseTalosMobileBrowserPreferences,
    type TalosMobileBrowserPreferences,
} from '@/lib/browser/browserContracts'
import { TALOS_DEFAULT_TONE, isTalosToneId, type TalosToneId } from '@/lib/tone'
import {
    parseTalosDictationLanguageMode,
    type TalosDictationLanguageMode,
} from '@/lib/dictationPolicy'
import {
    applyTalosLibraryContextPolicyPatch,
    parseTalosLibraryContextPolicy,
    type TalosLibraryContextPolicyPatch,
    type TalosLibraryContextPolicyV1,
} from '@/lib/chat/libraryPolicy'

export const TALOS_MOBILE_SETTINGS_KEY = 'talos.mobile.settings'

export type TalosUtilityModelMode = 'same_as_chat' | 'default_profile'
const AI_MODES: readonly TalosUtilityModelMode[] = ['same_as_chat', 'default_profile']

export interface TalosAiDefaults {
    utility_model_mode: TalosUtilityModelMode
    research_model_mode: TalosUtilityModelMode
    vision_enabled: boolean
}
const DEFAULT_AI_DEFAULTS: TalosAiDefaults = { utility_model_mode: 'same_as_chat', research_model_mode: 'same_as_chat', vision_enabled: true }

export interface TalosComposerDefaults {
    model_profile_id: string | null
    effort: TalosMobileEffortLevel
    thinking: boolean
}

export const TALOS_DEFAULT_COMPOSER_DEFAULTS: TalosComposerDefaults = Object.freeze({
    model_profile_id: null,
    effort: 'high',
    thinking: false,
})

// Mobile-first shell preferences (design-lead innovation; desktop adoption via
// backport ledger). immersive_header: ChatGPT-style floating chrome over a top
// fade instead of the solid header bar. The composer used to have three
// switches here; it has one named shape now — see lib/composerStyle.
export interface TalosMobileShellPreferences {
    immersive_header: boolean
    /** What the bar looks like — see lib/composerStyle. */
    composer_shape: TalosComposerShape
    /** Where the "+" opens, and so where attach / Library / Browse live. */
    composer_plus: TalosComposerPlusSurface
    /** Owner 2026-07-24: the Android launcher icon follows the active theme
     *  preset. Opt-in — a restart is required to apply, so switching prompts
     *  the user (restart now / on next close). */
    launcher_icon_follows_theme: boolean
    /**
     * ⭐ «Mantieni acceso» — owner 2026-08-16: «mettiamo uno switch nelle
     * impostazioni, così l'utente decide se vuole debug wireless mantenuto
     * sempre acceso oppure attivarlo manualmente ogni volta».
     *
     * ⛔ E il nome dice meno di quanto sembra, per forza: MISURATO che TALOS
     * NON può accendere il debug wireless da solo. Tre leve, tre porte chiuse
     * — `settings put adb_wifi_enabled 1` scrive il valore ma non apre la
     * porta TLS, `setprop persist.adb.tls_server.enable` è rifiutato
     * («Failed to set property»), e `pm grant WRITE_SECURE_SETTINGS` è
     * signature|privileged. Quell'interruttore lo tocca solo il sistema.
     *
     * ⇒ Quello che questo switch fa davvero: tiene TALOS in ascolto del
     * ritorno del ponte **anche fuori dalla schermata Controllo telefono**,
     * dove oggi quella vigilanza vive e muore. La chiave di TALOS resta
     * autorizzata dal sistema (`dumpsys adb` la elenca), quindi appena
     * l'interruttore torna su il riaggancio è immediato: non serve
     * riappaiare, serve solo che qualcuno stia guardando.
     *
     * ⛔ Spento di default: un ponte che si riaggancia da solo in ogni
     * momento è più vicino a «permesso acquisito» che a «capacità viva», e
     * quella scelta è della persona.
     */
    ponte_sempre_acceso: boolean
    /** Owner 2026-07-25: let the model in ANY chat read the GLOBAL Library
     *  (injected as context). Opt-in — adds tokens to each message. */
    library_context_enabled: boolean
    /**
     * Additive versioned policy. Null preserves the exact legacy boolean
     * contract; hydration never invents or persists policy for old installs.
     */
    library_context_policy: TalosLibraryContextPolicyV1 | null
    /** Owner 2026-07-25: the model auto-saves generated files to the Library via a
     *  marker. On by default (owner wants it) but opt-out — when off, the model is
     *  not instructed to emit the marker and no capture runs. */
    library_autosave_generated: boolean
    /**
     * ⛔⛔ IL MODELLO SCELTO NEL COMPOSITORE, e perché deve stare su DISCO.
     *
     * MISURATO sul Pad il 2026-08-13: scelto **Gemini 3.6 Flash** nella chat, e
     * la sonda della barra diceva
     *
     *     tool: offerti=61 modello=…/Qwen3-1.7B-Q4_K_M.gguf
     *
     * cioè l'assistente rispondeva col modello LOCALE mentre la persona ne aveva
     * scelto un altro. La causa: `selectedModelId` era un `ref` **in memoria del
     * controller**, e la barra è un'altra WebView — partiva da `null`, e
     * `ensureSelection()` prendeva il primo modello richiamabile, che è il
     * locale.
     *
     * ⇒ Non era un difetto di sincronizzazione: la scelta non usciva mai dalla
     * finestra in cui era stata fatta. E ha avvelenato tutte le misure della
     * notte — il pilota che «non trovava un'app per WhatsApp», il ripiego su
     * `device_speak`: erano il locale, che l'owner non aveva scelto.
     *
     * `null` = nessuna scelta ancora fatta, e allora vale la scelta automatica.
     */
    composer_model: string | null
    /** Owner 2026-07-25: remembered Library view (grid gallery / list). */
    /**
     * Quanto accesso ha il MODELLO alla Libreria — owner 2026-08-03.
     *
     * Distinta da `library_context_enabled`, che governa l'iniezione
     * AMBIENTALE («attacca la mia Libreria a ogni messaggio»): erano lo stesso
     * interruttore, e spegnendo l'una si perdeva anche l'altra. Ne restava un
     * modello capace di creare un documento nella Libreria e incapace di dire
     * cosa contiene.
     *
     * Tre stati, la stessa grammatica di ogni altra autorizzazione dell'app:
     * `allow` legge · `ask` legge chiedendo la prima volta, e il cartellino
     * scrive QUESTA impostazione · `deny` non viene nemmeno offerto.
     *
     * Predefinito `ask`: non fa trapelare niente ed e' il pavimento sicuro —
     * la stessa ragione per cui i permessi dei tool partono tutti da li'.
     */
    library_access: 'allow' | 'ask' | 'deny'
    /**
     * Se il modello puo' SCRIVERE in memoria.
     *
     * Stessa grammatica di `library_access` — owner 2026-08-04: «i permessi
     * devono avere la stessa grammatica, TUTTI». Nasce a `ask` perche'
     * quello che finisce in memoria il modello lo rilegge da se' in ogni
     * conversazione futura: la prima volta si guarda.
     */
    memory_write_access: 'allow' | 'ask' | 'deny'
    /**
     * ⛔ Fin dove vale l'approvazione di un piano.
     *
     * Owner 2026-08-07, testuale: «il segreto di un sistema come il nostro non
     * e' mai mettere dei muri e dei paletti, ma delle porte che l'utente sceglie
     * consapevolmente di aprire».
     *
     * `turn` — vale per il messaggio che hai mandato, con gli argomenti esatti.
     * `conversation` — vale finche' non entra contenuto non fidato: nel momento
     * in cui una pagina web o un documento esterno arriva nel discorso,
     * l'approvazione **decade da sola** e si richiede.
     *
     * Non e' una quarta grammatica dei permessi: sempre / chiedi / nega restano
     * quelli e decidono COSA si puo' fare. Questo decide per QUANTO vale un
     * «si'» che hai gia' dato — e nasce sulla porta chiusa, perche' una porta si
     * apre, non si trova aperta.
     */
    plan_scope: 'turn' | 'conversation'
    /**
     * Se un'immagine puo' lasciare il telefono.
     *
     * Owner 2026-08-04: «quando carichi una tua immagine questo potrebbe essere
     * un problema di sicurezza e bisogna fare scegliere l'utente tramite
     * pop-up».
     *
     * TALOS e' local-first, ma un allegato ESCE. Una foto e' la cosa piu'
     * sensibile che una persona attacca — volti, luoghi, targhe, documenti — e
     * finora partiva come parte un file di testo, senza che nessuno lo dicesse.
     * Nasce a `ask`: la prima volta si guarda.
     */
    image_attachment_consent: 'allow' | 'ask' | 'deny'
    library_view: 'grid' | 'list'
    /**
     * Le note, in lista o a schede.
     *
     * Owner 2026-08-05: «le note sia in lista che in card, delle card come se
     * fossero dei post, quindi col titolo sopra e la descrizione sotto». Cioè
     * la stessa coppia che la Libreria ha già — e quindi la stessa
     * preferenza, con lo stesso nome e lo stesso comportamento, invece di una
     * seconda idea di «vista» che si comporta quasi uguale.
     *
     * Parte da `list` come la Libreria: una nota si riconosce dal testo, e in
     * lista se ne legge di più a colpo d'occhio.
     */
    notes_view: 'grid' | 'list'
    /**
     * Owner 2026-07-30. Grouping by origin chat was a plain `ref`, so it reset
     * on every visit — debt P6, and the reason a preference the owner set in
     * July never survived a single reopen. It is remembered now, and the sort
     * that arrived with it is remembered in the same place rather than becoming
     * a second switch that forgets.
     */
    library_group_by_chat: boolean
    library_sort: TalosLibrarySort
    /**
     * How the Model Lab orders the models already on the phone.
     *
     * Remembered here rather than in the component for the reason
     * `library_group_by_chat` is: a preference held in a plain `ref` is not a
     * preference, it is a default that resets every time the panel closes. The
     * Library learned that in July (debt P6) and there is no argument for the
     * same list-ordering choice being durable in one room and amnesiac in the
     * next.
     */
    models_sort: TalosInstalledModelSort
    /**
     * I nomi che l'utente ha dato ai modelli scaricati, per percorso.
     *
     * Un GGUF si chiama come ha deciso chi l'ha pubblicato — «Qwen3.5-4B-
     * Uncensored-HauhauCS-Aggressive-Q4_K_M» — che non e' il nome con cui una
     * persona lo pensa. Owner 2026-08-04: «se voglio dargli un alias o
     * rinominarlo non e' possibile».
     *
     * La chiave e' il PERCORSO e non il nome del file: due modelli di
     * pubblicatori diversi possono chiamarsi uguale, e il percorso e' l'unica
     * cosa che li distingue davvero.
     */
    local_model_aliases: Record<string, string>
    /**
     * Chi riscrive i prompt, e quanto.
     *
     * Owner 2026-08-04: «se uso ChatGPT 5.6 Sol Max per la chat, non e' detto
     * che sia necessario usare lo stesso modello per un semplice prompt
     * enhancing — potrebbe essere uno spreco di token e soldi».
     *
     * Il modello della chat si sceglie per il compito piu' difficile della
     * conversazione; riscrivere un prompt non e' quel compito. `model: null`
     * vuol dire «quello del compositore», che resta il comportamento di prima
     * per chi non tocca niente.
     */
    prompt_enhancer: {
        model: string | null
        effort: TalosMobileEffortLevel
        depth: TalosPromptEnhancerDepth
    }
    /** Interface text size only; message prose has independent bubble_scale. */
    ui_font_scale: TalosFontScale
    /**
     * Owner 2026-07-26: an alternative to the typewriter — "un'animazione più
     * smooth con un leggero fade in, pulitissima". Typewriter paces the reveal
     * character by character; fade lets the text arrive at the model's own pace
     * and simply eases it in.
     */
    streaming_animation: 'typewriter' | 'fade'
    /**
     * Owner 2026-07-26: technical failure codes are for whoever is debugging,
     * not for whoever is using the app.
     *
     * OFF (the default, and what ships): a failure is explained in plain words.
     * ON: the same explanation, plus the code that names the step that failed.
     *
     * What does NOT change with the switch is the honesty. The model is told not
     * to claim success either way — hiding a code is acceptable, inventing an
     * outcome never is.
     */
    debug_diagnostics: boolean
    /** F6 — persisted tablet split-view sidebar width (px, clamped 260–480). */
    tablet_sidebar_width: number
    /** Harness-only rail state, stored locally with the rest of the shell. */
    tablet_harness_sidebar_collapsed: boolean
}

// Owner #15 (2026-07-23): immersive chrome and the Claude-style composer
// drawer ARE the default mobile experience.
const DEFAULT_SHELL_PREFERENCES: TalosMobileShellPreferences = {
    immersive_header: true,
    composer_shape: TALOS_DEFAULT_COMPOSER_SHAPE,
    composer_plus: TALOS_DEFAULT_COMPOSER_PLUS,
    // Owner 2026-08-17: "icona app coordinata al tema abilitato di default".
    // The launcher icon follows whichever theme is on, without being asked.
    launcher_icon_follows_theme: true,
    // ⛔ Spento: la vigilanza continua è una scelta, non un default.
    ponte_sempre_acceso: false,
    library_context_enabled: false,
    library_context_policy: null,
    /**
     * Owner 2026-07-27: on by default. A document the model made and did not
     * save is simply lost — the chat scrolls away and the bytes go with it,
     * which is not a preference so much as a bug with a switch on it.
     *
     * Its sibling `library_context_enabled` deliberately stays OFF: that one
     * injects the Library into EVERY message, spending tokens when it is not
     * wanted and carrying unrelated documents into conversations. The model
     * already has `library_search` and can ask when it actually needs to.
     */
    library_autosave_generated: true,
    // Nessuna scelta ancora fatta: decide `ensureSelection`. Vedi `composer_model`.
    composer_model: null,
    library_access: 'ask',
    memory_write_access: 'ask',
    plan_scope: 'turn',
    image_attachment_consent: 'ask',
    library_view: 'list',
    notes_view: 'list',
    // Owner 2026-07-25 set grouping on; it just never survived a reopen.
    library_group_by_chat: true,
    library_sort: 'recent',
    // «Which one did I just download» — the question asked right after a
    // download, and the only one the panel could not answer at all.
    models_sort: TALOS_INSTALLED_MODEL_SORT_DEFAULT,
    local_model_aliases: {},
    prompt_enhancer: {
        model: null,
        // Riscrivere un prompt non e' un problema da ragionamento lungo: il
        // predefinito e' basso di proposito, ed e' la meta' del punto.
        effort: 'low',
        depth: TALOS_PROMPT_ENHANCER_DEFAULT_DEPTH,
    },
    ui_font_scale: TALOS_DEFAULT_FONT_SCALE,
    streaming_animation: 'typewriter',
    debug_diagnostics: false,
    tablet_sidebar_width: TALOS_TABLET_SIDEBAR_DEFAULT,
    tablet_harness_sidebar_collapsed: false,
}

function parseShellPreferences(value: unknown): TalosMobileShellPreferences {
    const record = (typeof value === 'object' && value !== null) ? value as Record<string, unknown> : {}
    return {
        immersive_header: typeof record.immersive_header === 'boolean'
            ? record.immersive_header
            : DEFAULT_SHELL_PREFERENCES.immersive_header,
        ponte_sempre_acceso: typeof record.ponte_sempre_acceso === 'boolean'
            ? record.ponte_sempre_acceso
            : DEFAULT_SHELL_PREFERENCES.ponte_sempre_acceso,
        composer_shape: talosComposerShapeExists(record.composer_shape)
            ? record.composer_shape
            : DEFAULT_SHELL_PREFERENCES.composer_shape,
        composer_plus: talosComposerPlusExists(record.composer_plus)
            ? record.composer_plus
            : DEFAULT_SHELL_PREFERENCES.composer_plus,
        launcher_icon_follows_theme: typeof record.launcher_icon_follows_theme === 'boolean'
            ? record.launcher_icon_follows_theme
            : DEFAULT_SHELL_PREFERENCES.launcher_icon_follows_theme,
        library_context_enabled: typeof record.library_context_enabled === 'boolean'
            ? record.library_context_enabled
            : DEFAULT_SHELL_PREFERENCES.library_context_enabled,
        library_context_policy: parseTalosLibraryContextPolicy(record.library_context_policy),
        library_autosave_generated: typeof record.library_autosave_generated === 'boolean'
            ? record.library_autosave_generated
            : DEFAULT_SHELL_PREFERENCES.library_autosave_generated,
        // ⛔ Solo una stringa non vuota è una scelta: `''` vale come «nessuna»,
        // se no una preferenza corrotta bloccherebbe la scelta automatica.
        composer_model: typeof record.composer_model === 'string' && record.composer_model.trim() !== ''
            ? record.composer_model
            : DEFAULT_SHELL_PREFERENCES.composer_model,
        // Re-review 2026-07-25: this hardcoded 'grid' as the fallback, so the
        // documented 'list' default never shipped.
        // Chi aveva il booleano ACCESO diventa `allow`; chi lo aveva spento
        // diventa `ask` e non `deny`, perche' aveva detto «non attaccarmela a
        // ogni messaggio», non «mai guardarla».
        // Nessun booleano da migrare: nasce a tre stati, come pretende la
        // grammatica unica dei permessi. Un valore ignoto sul disco ricade sul
        // predefinito, che e' il piu' prudente dei tre.
        image_attachment_consent: record.image_attachment_consent === 'allow' || record.image_attachment_consent === 'deny'
            ? record.image_attachment_consent
            : DEFAULT_SHELL_PREFERENCES.image_attachment_consent,
        memory_write_access: record.memory_write_access === 'allow' || record.memory_write_access === 'deny'
            ? record.memory_write_access
            : DEFAULT_SHELL_PREFERENCES.memory_write_access,
        // Solo il valore che APRE va riconosciuto: qualunque altra cosa —
        // compreso un valore inventato o corrotto — ricade sulla porta chiusa.
        plan_scope: record.plan_scope === 'conversation'
            ? 'conversation'
            : DEFAULT_SHELL_PREFERENCES.plan_scope,
        library_access: record.library_access === 'allow' || record.library_access === 'deny'
            ? record.library_access
            : (record.library_context_enabled === true ? 'allow' : DEFAULT_SHELL_PREFERENCES.library_access),
        library_view: record.library_view === 'grid' ? 'grid' : DEFAULT_SHELL_PREFERENCES.library_view,
        notes_view: record.notes_view === 'grid' ? 'grid' : DEFAULT_SHELL_PREFERENCES.notes_view,
        library_group_by_chat: typeof record.library_group_by_chat === 'boolean'
            ? record.library_group_by_chat
            : DEFAULT_SHELL_PREFERENCES.library_group_by_chat,
        // An unrecognised sort falls back rather than reaching the grouping,
        // where it would silently mean "no sort at all".
        library_sort: record.library_sort === 'oldest' || record.library_sort === 'name'
            ? record.library_sort
            : DEFAULT_SHELL_PREFERENCES.library_sort,
        // Checked against the list the sorter actually knows, so a value from a
        // future version — or a corrupt one — falls back instead of reaching
        // the comparator as an order nobody implemented.
        // Quello che torna dal disco non decide la forma di cio' che il resto
        // del codice legge: ogni campo passa dalla sua guardia.
        prompt_enhancer: (() => {
            const saved = (record.prompt_enhancer ?? {}) as Partial<TalosMobileShellPreferences['prompt_enhancer']>
            return {
                model: typeof saved.model === 'string' && saved.model.length > 0 ? saved.model : null,
                effort: TALOS_MOBILE_EFFORT_ORDER.includes(saved.effort as TalosMobileEffortLevel)
                    ? saved.effort as TalosMobileEffortLevel
                    : DEFAULT_SHELL_PREFERENCES.prompt_enhancer.effort,
                depth: isTalosPromptEnhancerDepth(saved.depth)
                    ? saved.depth
                    : DEFAULT_SHELL_PREFERENCES.prompt_enhancer.depth,
            }
        })(),
        // Solo coppie di stringhe: una preferenza che torna dal disco non
        // decide la forma di cio' che il resto del codice legge.
        local_model_aliases: Object.fromEntries(
            Object.entries(record.local_model_aliases ?? {})
                .filter(([key, value]) => typeof key === 'string' && typeof value === 'string' && value.trim().length > 0),
        ),
        models_sort: TALOS_INSTALLED_MODEL_SORTS.includes(record.models_sort as TalosInstalledModelSort)
            ? record.models_sort as TalosInstalledModelSort
            : DEFAULT_SHELL_PREFERENCES.models_sort,
        ui_font_scale: parseTalosFontScale(record.ui_font_scale),
        streaming_animation: record.streaming_animation === 'fade' ? 'fade' : 'typewriter',
        // Fail closed: anything unrecognised is OFF, so a corrupt preference
        // cannot start showing internals to a user who never asked.
        debug_diagnostics: record.debug_diagnostics === true,
        tablet_sidebar_width: clampTalosTabletSidebarWidth(record.tablet_sidebar_width),
        tablet_harness_sidebar_collapsed: typeof record.tablet_harness_sidebar_collapsed === 'boolean'
            ? record.tablet_harness_sidebar_collapsed
            : DEFAULT_SHELL_PREFERENCES.tablet_harness_sidebar_collapsed,
    }
}

// F2-T6 — versioned intro/onboarding contract (mobile-local mirror of the
// desktop intro spec): compared against TALOS_MOBILE_INTRO_VERSION at open.
export type TalosMobileIntroOutcome = 'completed' | 'skipped'
// N1 — guided account-creation wizard outcome (mirrors the intro contract).

export interface TalosMobileOnboardingState {
    intro_version: number
    intro_outcome: TalosMobileIntroOutcome | null
    setup_dismissed: boolean
    /** N1 — account wizard: version gate + outcome, same shape as the intro. */
}

const DEFAULT_ONBOARDING_STATE: TalosMobileOnboardingState = {
    intro_version: 0,
    intro_outcome: null,
    setup_dismissed: false,
}

function parseVersion(candidate: unknown, fallback: number): number {
    return typeof candidate === 'number'
        && Number.isInteger(candidate)
        && candidate >= 0
        && candidate <= 65535
        ? candidate
        : fallback
}

function parseOnboarding(value: unknown): TalosMobileOnboardingState {
    const record = (typeof value === 'object' && value !== null) ? value as Record<string, unknown> : {}
    const outcome = record.intro_outcome === 'completed' || record.intro_outcome === 'skipped'
        ? record.intro_outcome
        : null
    return {
        intro_version: parseVersion(record.intro_version, DEFAULT_ONBOARDING_STATE.intro_version),
        intro_outcome: outcome,
        setup_dismissed: typeof record.setup_dismissed === 'boolean'
            ? record.setup_dismissed
            : DEFAULT_ONBOARDING_STATE.setup_dismissed,
    }
}

// F2-T6 app lock — POLICY flags only (non-secret). The PIN derivation lives in
// the OS Keystore (`services/appLock.ts`), never in Preferences.
export interface TalosMobileSecurityPreferences {
    app_lock_enabled: boolean
    app_lock_biometric: boolean
    /** Debt S2: FLAG_SECURE — no screenshots, no readable recents thumbnail. */
    screen_secure: boolean
}

const DEFAULT_SECURITY_PREFERENCES: TalosMobileSecurityPreferences = {
    app_lock_enabled: false,
    app_lock_biometric: false,
    // Deliberately OFF by default: screenshotting a chat is an everyday need.
    // Turning the app lock ON turns this on with it (visible, and reversible).
    screen_secure: false,
}

/** Anything unrecognised falls back to the SAFEST value for its class. */
function parseToolPermissions(value: unknown): TalosToolPermissions {
    const record = (value && typeof value === 'object' ? value : {}) as Record<string, unknown>
    const read = (key: keyof TalosToolPermissions): TalosToolPermission => {
        const candidate = record[key]
        return candidate === 'allow' || candidate === 'ask' || candidate === 'deny'
            ? candidate
            : TALOS_DEFAULT_TOOL_PERMISSIONS[key]
    }
    return { read: read('read'), write: read('write'), outbound: read('outbound') }
}

/**
 * F1 — which search source the user chose, and where it lives.
 *
 * The KEY is deliberately not here: it goes to the OS secure storage through
 * `setProviderKey`, like every provider key, and this state only ever knows
 * which source is selected. D3 then hangs off `source === null`: with nothing
 * chosen the web tools are not offered to the model at all, so it cannot
 * promise a search it will not perform.
 */
export interface TalosMobileSearchPreferences {
    source: TalosSearchSourceId | null
    /** SearXNG and custom: the instance the user runs or trusts. */
    endpoint: string | null
}

const TALOS_DEFAULT_SEARCH_PREFERENCES: TalosMobileSearchPreferences = {
    source: null,
    endpoint: null,
}

/**
 * R7 — the two models of a research run, chosen by the person who pays for them.
 *
 * Deep Research uses two models for two different jobs: one writes the report,
 * one checks its citations. Every serious implementation of this splits them —
 * GPT Researcher has had FAST_LLM and SMART_LLM as separate settings, provider
 * included, since people asked for exactly that — and the reason is not tidiness.
 * The roles want opposite things: the writer wants capability, the checker wants
 * to be cheap enough to run once per claim and INDEPENDENT of the writer.
 *
 * Both are stored as `provider:modelId`, and both may be null:
 *   author null → the model chosen in the composer, which is what a person means
 *                 by "the model I am using".
 *   judge  null → picked automatically: on-device first, never the author.
 *
 * Null is a real choice here, not an unset field. "Follow the composer" is a
 * standing instruction that stays right when the composer changes, and freezing
 * a copy of today's model into settings would quietly stop tracking it.
 */
export interface TalosResearchModelPreferences {
    /** Who writes the report. Null = whatever the composer is set to. */
    author: string | null
    /** Who checks the citations. Null = chosen automatically, never the author. */
    judge: string | null
}

function parseResearchModels(value: unknown): TalosResearchModelPreferences {
    const record = (value && typeof value === 'object' ? value : {}) as Record<string, unknown>
    const one = (raw: unknown): string | null =>
        (typeof raw === 'string' && raw.includes(':') && raw.trim() !== '' ? raw.trim() : null)
    return { author: one(record.author), judge: one(record.judge) }
}

function parseSearchPreferences(value: unknown): TalosMobileSearchPreferences {
    const record = (value && typeof value === 'object' ? value : {}) as Record<string, unknown>
    const source = record.source
    const known = source === 'tavily' || source === 'brave' || source === 'searxng' || source === 'custom'
    const endpoint = typeof record.endpoint === 'string' && record.endpoint.trim() !== ''
        ? record.endpoint.trim()
        : TALOS_DEFAULT_SEARCH_PREFERENCES.endpoint
    // Fail closed: anything unrecognised reads as "no source chosen", which by
    // D3 means the web tools are not offered at all — never as a half-configured
    // source the model would try and fail to use.
    return { source: known ? source : TALOS_DEFAULT_SEARCH_PREFERENCES.source, endpoint }
}

function parseSecurityPreferences(value: unknown): TalosMobileSecurityPreferences {
    const record = (typeof value === 'object' && value !== null) ? value as Record<string, unknown> : {}
    return {
        app_lock_enabled: typeof record.app_lock_enabled === 'boolean'
            ? record.app_lock_enabled
            : DEFAULT_SECURITY_PREFERENCES.app_lock_enabled,
        app_lock_biometric: typeof record.app_lock_biometric === 'boolean'
            ? record.app_lock_biometric
            : DEFAULT_SECURITY_PREFERENCES.app_lock_biometric,
        screen_secure: typeof record.screen_secure === 'boolean'
            ? record.screen_secure
            : DEFAULT_SECURITY_PREFERENCES.screen_secure,
    }
}

// F3-T4 (owner #11) — assistant tone preference (presets in `lib/tone.ts`).
export interface TalosMobileTonePreferences {
    preset: TalosToneId
}

function parseTonePreferences(value: unknown): TalosMobileTonePreferences {
    const record = (typeof value === 'object' && value !== null) ? value as Record<string, unknown> : {}
    return { preset: isTalosToneId(record.preset) ? record.preset : TALOS_DEFAULT_TONE }
}

// Owner 2026-07-24 — voice (text-to-speech) for assistant replies: the device
// voice ("model") + rate/pitch ("tone").
//
// ⛔ Blueprint §39 Phase 4, "additive settings schema": `engine`/`personal_*`
// below are new fields on an existing interface, not a new one - old settings
// JSON with none of them must parse identically to today (§37.1's own test
// list says so explicitly), and `parseVoicePreferences` below is what makes
// that true: every new field has a safe, backward-reading fallback.
export interface TalosMobileVoicePreferences {
    voice_uri: string | null
    rate: number
    pitch: number
    dictation_language: TalosDictationLanguageMode
    /** Which engine reads assistant replies aloud. Unknown/missing -> `'system'`, never `'personal'` - a stale or corrupted value must never silently switch someone onto an engine they never chose. */
    engine: TalosSpeechEngine
    /** The `TalosVoiceProfileV1` id to speak with when `engine === 'personal'`. Null (never enrolled, or the enrolled profile was deleted) is a valid, common state - the router's job, not this store's, to fall back when it is. */
    personal_profile_id: string | null
    /**
     * ⛔ NOT `rate`/`pitch` above, on purpose. Those default to 1.2x/1.0
     * because the owner tuned them against the SYSTEM voice (2026-08-10,
     * `DEFAULT_VOICE_PREFERENCES`'s own comment) - applying that same 1.2x
     * to a freshly enrolled neural voice would distort it against a speed it
     * was never judged at. Personal gets its own pair, both neutral (1.0),
     * until someone actually tunes them by ear the same way.
     */
    personal_rate: number
    personal_pitch: number
}

/**
 * ⛔ 1.2 e 1.0 sono una SCELTA DELL'OWNER, ascoltando: «di default voglio
 * velocita' a 1.2 e tonalita' a 1» (2026-08-10).
 *
 * Non e' un ritocco estetico. A 1.0 la voce di sistema legge come un annuncio
 * di stazione; a 1.2 sta al passo di chi ascolta una risposta che ha appena
 * chiesto. La tonalita' resta neutra perche' e' li' che le voci di Google
 * suonano meno artificiali — alzarla le rende squillanti, abbassarla cupe.
 *
 * ⛔ E vale solo per chi NON ha ancora scelto: `parseVoicePreferences` tiene il
 * valore salvato. Cambiare il predefinito non deve muovere la voce di chi
 * l'aveva gia' regolata a orecchio.
 */
const DEFAULT_VOICE_PREFERENCES: TalosMobileVoicePreferences = {
    voice_uri: null,
    rate: 1.2,
    pitch: 1,
    dictation_language: 'system',
    engine: 'system',
    personal_profile_id: null,
    personal_rate: 1,
    personal_pitch: 1,
}

/** §37.1's own rule: a saved profile id is always a `TalosVoiceProfileV1` UUID (`UUID.randomUUID().toString()` on the native side) - anything else is malformed and parses to `null`, the same "never enrolled" state a fresh install starts in. */
function isPlausibleTalosVoiceProfileId(value: unknown): value is string {
    return typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)
}

function parseVoicePreferences(value: unknown): TalosMobileVoicePreferences {
    const record = (typeof value === 'object' && value !== null) ? value as Record<string, unknown> : {}
    const num = (candidate: unknown, fallback: number, min: number, max: number): number =>
        typeof candidate === 'number' && Number.isFinite(candidate) ? Math.min(max, Math.max(min, candidate)) : fallback
    return {
        voice_uri: typeof record.voice_uri === 'string' && record.voice_uri.length <= 256 ? record.voice_uri : null,
        rate: num(record.rate, DEFAULT_VOICE_PREFERENCES.rate, 0.5, 2),
        pitch: num(record.pitch, DEFAULT_VOICE_PREFERENCES.pitch, 0, 2),
        dictation_language: parseTalosDictationLanguageMode(record.dictation_language),
        // Unknown/missing/corrupted -> 'system', never 'personal' - §37.1: "unknown `engine` -> `system`".
        engine: record.engine === 'personal' ? 'personal' : 'system',
        personal_profile_id: isPlausibleTalosVoiceProfileId(record.personal_profile_id) ? record.personal_profile_id : null,
        personal_rate: num(record.personal_rate, DEFAULT_VOICE_PREFERENCES.personal_rate, 0.5, 2),
        personal_pitch: num(record.personal_pitch, DEFAULT_VOICE_PREFERENCES.personal_pitch, 0, 2),
    }
}
export interface TalosMobileSettingsState {
    /** Owner 2026-07-25: tool permissions per ACTION TYPE, user-configured. */
    tools: TalosToolPermissions
    /**
     * Which of those the user actually DECIDED, rather than inherited.
     *
     * Kept apart from `tools` because `tools` cannot express it: it is always
     * fully populated, so a default and a choice look identical there. The
     * difference is what lets a configured search source turn an inherited
     * refusal into a question without ever revising a refusal someone meant.
     */
    tools_chosen: readonly TalosToolAction[]
    /** Per-tool eligibility. Action permissions remain an additional gate. */
    agent_tools: TalosAgentToolEnabled
    /** Exact, revocable device grants for tools whose action policy is `ask`. */
    tool_authorizations: TalosToolAuthorizationGrantsV1
    /** F1: the chosen web-search source. The key itself lives in secure storage. */
    search: TalosMobileSearchPreferences
    /** R7: who writes the research report, and who checks it. */
    research_models: TalosResearchModelPreferences
    shell: TalosMobileShellPreferences
    onboarding: TalosMobileOnboardingState
    security: TalosMobileSecurityPreferences
    /** §1-bis, 0.1.18 handoff: consent to run the local-engine GPU-backend probe. */
    local_engine_probe: TalosLocalEngineProbePreferences
    tone: TalosMobileTonePreferences
    chat_layout: TalosChatLayoutPreferences
    ai_defaults: TalosAiDefaults
    composer_defaults: TalosComposerDefaults
    motion_v6: TalosMotionV6Preferences
    model_lab: TalosMobileModelLabPreferences
    browser: TalosMobileBrowserPreferences
    voice: TalosMobileVoicePreferences
}

export type TalosMotionPreferencePatch = Partial<Omit<TalosMotionV6Preferences, 'interface'>> & {
    interface?: Partial<Omit<TalosInterfaceMotionPreferences, 'categories'>> & {
        categories?: Partial<TalosInterfaceMotionCategories>
    }
}

// F3-T1 (owner #7) intensity=0 divergence retired 2026-08-23: the owner tuned
// the whole Movimento section live on device and asked for those numbers as
// THE default, mobile included — TALOS_MOTION_V6_DEFAULTS.intensity now
// carries that value directly, so mobile and the engine contract read the
// same number again. Persisted user values still win as usual.
function createMobileDefaultMotionPreferences(): TalosMotionV6Preferences {
    const defaults = createDefaultTalosMotionV6Preferences()
    // Owner #15: the complex renderer ships ON by default.
    defaults.mode = 'complex'
    return defaults
}

function parseMotionPreferences(value: unknown): TalosMotionV6Preferences {
    const parsed = parseTalosMotionV6Preferences(value)
    return parsed.success ? parsed.value : createMobileDefaultMotionPreferences()
}

function parseAiDefaults(value: unknown): TalosAiDefaults {
    const record = (typeof value === 'object' && value !== null) ? value as Record<string, unknown> : {}
    const mode = (candidate: unknown, fallback: TalosUtilityModelMode): TalosUtilityModelMode =>
        AI_MODES.includes(candidate as TalosUtilityModelMode) ? candidate as TalosUtilityModelMode : fallback
    return {
        utility_model_mode: mode(record.utility_model_mode, DEFAULT_AI_DEFAULTS.utility_model_mode),
        research_model_mode: mode(record.research_model_mode, DEFAULT_AI_DEFAULTS.research_model_mode),
        vision_enabled: typeof record.vision_enabled === 'boolean' ? record.vision_enabled : DEFAULT_AI_DEFAULTS.vision_enabled,
    }
}

function parseComposerDefaults(value: unknown): TalosComposerDefaults {
    const record = (typeof value === 'object' && value !== null && !Array.isArray(value))
        ? value as Record<string, unknown>
        : {}
    const model = typeof record.model_profile_id === 'string'
        && record.model_profile_id.length > 0
        && record.model_profile_id.length <= 512
        ? record.model_profile_id
        : null
    const effort = typeof record.effort === 'string'
        && (TALOS_MOBILE_EFFORT_ORDER as readonly string[]).includes(record.effort)
        ? record.effort as TalosMobileEffortLevel
        : TALOS_DEFAULT_COMPOSER_DEFAULTS.effort
    return {
        model_profile_id: model,
        effort,
        thinking: typeof record.thinking === 'boolean'
            ? record.thinking
            : TALOS_DEFAULT_COMPOSER_DEFAULTS.thinking,
    }
}

export function parseTalosMobileSettings(raw: string | null): TalosMobileSettingsState {
    let value: Record<string, unknown> = {}
    if (raw !== null) {
        try {
            const parsed = JSON.parse(raw)
            if (parsed && typeof parsed === 'object') value = parsed as Record<string, unknown>
        } catch { value = {} }
    }
    const chatLayout = sanitizeTalosChatLayout(value.chat_layout ?? TALOS_DEFAULT_CHAT_LAYOUT)
    // F3-T2 (owner #4): the presentation setting never worked pre-F3, so any
    // persisted 'drawer' was the broken default, not a choice — migrate to the
    // fullscreen default once. Post-migration persists carry `presentation_v2`,
    // making an explicit drawer choice stick.
    if (value.presentation_v2 !== true) {
        chatLayout.mobile_window_presentation = 'fullscreen'
    }
    // Owner #15 one-shot defaults migration: pre-existing installs persisted
    // the OLD defaults (classic header, inline bar, balanced size, renderer
    // off) which were never a choice — move them to the new defaults once.
    // Post-migration persists carry `defaults_v3`; explicit choices stick.
    const motionParsed = parseMotionPreferences(value.motion_v6 ?? createMobileDefaultMotionPreferences())
    const shellParsed = parseShellPreferences(value.shell)
    /**
     * The three composer switches became one choice (see TalosComposerStyle).
     * Anyone who had already set them has three booleans persisted, and a
     * missing `composer_style` would otherwise silently reset them to the
     * default — the migration reads their combination and names it.
     *
     * Runs ONCE, gated on `composer_style_v1` like every migration above it: a
     * later deliberate change sticks, because by then the flag is true.
     */
    if (value.defaults_v3 !== true) {
        shellParsed.immersive_header = true
        /*
         * ⛔⛔ `'standard'` SCRITTO, non letto dal predefinito di oggi.
         *
         * Questa è la migrazione del 23 luglio, e il suo approdo è il default
         * DI ALLORA. Finché leggeva `DEFAULT_SHELL_PREFERENCES`, ogni cambio
         * futuro del predefinito si trasformava in una riscrittura per chi era
         * fermo a prima della v3 — cioè un cambio a installazioni ESISTENTI,
         * che è precisamente ciò che l'owner ha escluso il 2026-08-17: «stavo
         * parlando delle installazioni nuove, non default per i già
         * installati».
         *
         * ⇒ Una migrazione porta a un valore STORICO. Se punta al presente non
         * è una migrazione: è un default che si applica all'indietro ogni volta
         * che qualcuno lo cambia, e nessuno se ne accorge.
         *
         * ⛔⛔ E SOLO SE C'È QUALCOSA DA MIGRARE — l'ha trovato il test dei
         * predefiniti freschi, scritto un'ora prima proprio per questo.
         *
         * Questa migrazione gira anche a chi installa adesso, perché la
         * bandiera manca in tutti e due i casi. Senza questa guardia il valore
         * storico avrebbe vinto anche lì, e il nuovo predefinito non lo avrebbe
         * prodotto NESSUN percorso: il difetto che in memoria si chiama «il
         * default irraggiungibile», dove una migrazione del 25 luglio zittiva
         * una decisione del 27.
         *
         * ⇒ Una migrazione sposta un valore SALVATO. Se non c'è niente di
         * salvato non c'è niente da spostare, e comanda il predefinito.
         */
        if (typeof value.shell === 'object' && value.shell !== null) {
            shellParsed.composer_shape = 'standard'
        }
        // Re-review 2026-07-25: bubble_scale is now the user-facing CHAT TEXT SIZE.
        // Forcing it here shipped 'Small' pre-selected and overwrote an explicit choice.
        if (motionParsed.mode === 'off') motionParsed.mode = 'complex'
    }
    // Security review 2026-07-25: sending the whole Library to a third-party
    // provider, and letting model output write files, are BOTH explicit opt-ins.
    // Round 3 caught that fail-closed defaults only protect FRESH installs —
    // anyone who ran the build that shipped them ON has `true` persisted, so the
    // reversal never reached them. `library_defaults_v1` was written but never
    // read; this is the migration it was meant to gate. It runs ONCE: a later
    // deliberate opt-in persists because the flag is then already true.
    if (value.library_defaults_v1 !== true) {
        shellParsed.library_context_enabled = false
    }
    /**
     * ⛔⛔ QUI UNA MIGRAZIONE PIÙ VECCHIA ZITTIVA UNA DECISIONE PIÙ NUOVA.
     *
     * Trovato il 2026-08-16, guardando lo schermo dell'owner: «Salva
     * automaticamente i file generati» era **spento**, e il default dichiarato
     * venti righe sopra è `true`, con la sua ragione scritta:
     *
     * > Owner 2026-07-27: *«on by default. A document the model made and did
     * > not save is simply lost — the chat scrolls away and the bytes go with
     * > it, which is not a preference so much as a bug with a switch on it.»*
     *
     * La migrazione `library_defaults_v1` è della revisione di sicurezza del
     * **25 luglio**, cioè DUE GIORNI PRIMA, e spegneva **tutti e due** gli
     * interruttori. Quella revisione aveva ragione su `library_context_enabled`
     * — mandare l'intera Libreria a un fornitore terzo è un consenso esplicito
     * — ma il salvataggio automatico è finito dentro per compagnia: è locale,
     * è un file della persona, e non esce da nessuna parte.
     *
     * ⇒ Risultato: quel `true` era **irraggiungibile da qualunque strada**. Su
     * un'installazione nuova `parseTalosMobileSettings(null)` non ha la
     * bandiera, quindi la migrazione gira lo stesso e lo spegne. Un default che
     * nessun percorso può produrre non è un default: è codice morto che sembra
     * una decisione.
     *
     * ⛔ E per chi la migrazione l'ha già passata non basta smettere di
     * spegnerlo: ha `false` persistito. Quindi serve UN GIRO che lo rimetta —
     * e vale la regola già scritta in questo file per gli altri default: un
     * valore uguale al vecchio default è indistinguibile da «mai toccato». Qui
     * la cosa è ancora più netta, perché quel `false` **non è mai stato una
     * scelta di nessuno**: era una forzatura.
     */
    if (value.library_autosave_defaults_v2 !== true) {
        shellParsed.library_autosave_generated
            = DEFAULT_SHELL_PREFERENCES.library_autosave_generated
    }
    // Owner 2026-07-25: "di default large font size e small chat font size".
    // Same lesson as above — a changed default only reaches fresh installs, so
    // this migration applies it ONCE to an install that already persisted the
    // old values. A later deliberate change sticks: the flag is true by then.
    // It only moves values the user never touched: an install still sitting on
    // the PREVIOUS default follows the new one, while an explicit choice — the
    // contract "post-v3 explicit choices stick" — is left exactly as chosen.
    // Owner 2026-07-25: "di default large font size e small chat font size".
    // ONE-TIME, and honestly scoped: a stored value equal to the PREVIOUS
    // default is indistinguishable from "never touched", so it moves; anything
    // else the user actually chose is left alone. `talosChatLayout.ts` is a
    // hash-pinned desktop port, so the mobile default lives here — the
    // divergence is deliberate and belongs in the desktop mirror ticket.
    if (value.type_defaults_v1 !== true) {
        const shellRecord = (value.shell ?? {}) as Record<string, unknown>
        const layoutRecord = (value.chat_layout ?? {}) as Record<string, unknown>
        if (shellRecord.ui_font_scale === undefined || shellRecord.ui_font_scale === 'default') {
            shellParsed.ui_font_scale = TALOS_DEFAULT_FONT_SCALE
        }
        if (layoutRecord.bubble_scale === undefined || layoutRecord.bubble_scale === 'balanced') {
            chatLayout.bubble_scale = TALOS_MOBILE_DEFAULT_BUBBLE_SCALE
        }
    }
    // Owner 2026-08-26: the small default belongs to CHAT TEXT only. The
    // earlier mobile default accidentally shrank the whole interface.
    if (value.font_v2 !== true) {
        if (shellParsed.ui_font_scale === 'xsmall') shellParsed.ui_font_scale = TALOS_DEFAULT_FONT_SCALE
        if (chatLayout.bubble_scale === 'compact') chatLayout.bubble_scale = TALOS_MOBILE_DEFAULT_BUBBLE_SCALE
    }
    /**
     * The composer settled into TWO settings — the bar's shape, and where the
     * "+" opens (see lib/composerStyle). There are two older shapes of this on
     * real devices, and both are carried across: the fused `composer_style`
     * that lived for one build, and before it the three raw booleans.
     *
     * AFTER the defaults_v3 block, and gated on it, because that migration
     * already ruled that a pre-v3 `composer_drawer: false` was the broken old
     * default rather than a choice — it overwrites it back to true. Reading
     * that same false as "this person wanted the classic bar" would be
     * inventing an intent out of a value the migration above just disowned.
     *
     * Runs ONCE, like every migration around it: a later deliberate change
     * sticks, because by then `composer_split_v1` is true.
     */
    if (value.composer_split_v1 !== true) {
        const carried = talosComposerFromLegacy(
            (typeof value.shell === 'object' && value.shell !== null)
                ? value.shell as Record<string, unknown>
                : {},
        )
        // Pre-v3 installs never chose any of this: `defaults_v3` already ruled
        // that their `composer_drawer: false` was the old broken default rather
        // than an intention, and reading it as one would be inventing it.
        if (value.defaults_v3 === true) {
            shellParsed.composer_shape = carried.shape
            shellParsed.composer_plus = carried.plus
        }
    }
    return {
        shell: shellParsed,
        onboarding: parseOnboarding(value.onboarding),
        security: parseSecurityPreferences(value.security),
        local_engine_probe: parseTalosLocalEngineProbePreferences(value.local_engine_probe),
        tools: parseToolPermissions(value.tools),
        tools_chosen: parseTalosChosenToolActions(value.tools_chosen),
        agent_tools: parseTalosAgentToolEnabled(value.agent_tools),
        tool_authorizations: parseTalosToolAuthorizationGrants(value.tool_authorizations),
        search: parseSearchPreferences(value.search),
        research_models: parseResearchModels(value.research_models),
        tone: parseTonePreferences(value.tone),
        chat_layout: chatLayout,
        ai_defaults: parseAiDefaults(value.ai_defaults),
        composer_defaults: parseComposerDefaults(value.composer_defaults),
        motion_v6: motionParsed,
        model_lab: parseTalosMobileModelLabPreferences(
            value.model_lab ?? TALOS_DEFAULT_MODEL_LAB_PREFERENCES,
        ),
        browser: parseTalosMobileBrowserPreferences(
            value.browser ?? TALOS_DEFAULT_MOBILE_BROWSER_PREFERENCES,
        ),
        voice: parseVoicePreferences(value.voice),
    }
}

export const DEFAULT_SETTINGS_STATE: TalosMobileSettingsState = parseTalosMobileSettings(null)

export interface SettingsStore {
    readonly state: Readonly<TalosMobileSettingsState>
    /** What is in force, as opposed to what is stored. See the implementation. */
    effectiveToolPermissions(): TalosToolPermissions
    hydrate(): Promise<void>
    setChatLayout(patch: Partial<TalosChatLayoutPreferences>): Promise<void>
    setShell(patch: Partial<TalosMobileShellPreferences>): Promise<void>
    setLibraryContextPolicy(
        patch: TalosLibraryContextPolicyPatch,
        expectedRevision: number,
    ): Promise<TalosLibraryContextPolicyV1>
    setOnboarding(patch: Partial<TalosMobileOnboardingState>): Promise<void>
    setSecurity(patch: Partial<TalosMobileSecurityPreferences>): Promise<void>
    setLocalEngineProbeConsent(patch: Partial<TalosLocalEngineProbePreferences>): Promise<void>
    /** Owner 2026-07-25: what the model may do without asking. */
    setToolPermissions(patch: Partial<TalosToolPermissions>): Promise<void>
    setAgentToolEnabled(tool: TalosAgentToolId, enabled: boolean): Promise<void>
    grantToolAuthorization(
        tool: TalosAgentToolId,
        actions: readonly TalosToolAction[],
    ): Promise<void>
    revokeToolAuthorization(tool: TalosAgentToolId): Promise<void>
    setSearchPreferences(patch: Partial<TalosMobileSearchPreferences>): Promise<void>
    setResearchModels(patch: Partial<TalosResearchModelPreferences>): Promise<void>
    setTone(preset: TalosToneId): Promise<void>
    setAiDefaults(patch: Partial<TalosAiDefaults>): Promise<void>
    setComposerDefaults(patch: Partial<TalosComposerDefaults>): Promise<void>
    setModelLabPreferences(value: TalosMobileModelLabPreferences): Promise<void>
    setBrowserPreferences(value: Partial<Omit<TalosMobileBrowserPreferences, 'schema_version'>>): Promise<void>
    setVoicePreferences(patch: Partial<TalosMobileVoicePreferences>): Promise<void>
    setMotionPreferences(patch: TalosMotionPreferencePatch): Promise<void>
    resetMotionPreferences(): Promise<void>
}

let singleton: SettingsStore | null = null

export function useSettingsStore(): SettingsStore {
    if (singleton) return singleton
    const state = reactive<TalosMobileSettingsState>(parseTalosMobileSettings(null))
    /**
     * I-08: ONE queue, not one per domain. Every setter writes the same stored
     * document, so two domains persisting at once each serialise the other's
     * unpublished value and whichever native write lands last silently reverts
     * the other. Separate lanes cannot order writes that share a document.
     */
    let settingsMutationTail: Promise<void> = Promise.resolve()

    async function persist(
        overrides: Partial<TalosMobileSettingsState> = {},
    ): Promise<void> {
        const next = { ...state, ...overrides } as TalosMobileSettingsState
        // R1-6: fenced — a hung Preferences bridge must reject, not freeze.
        await talosBridgeCall('TALOS_SETTINGS_PERSIST', () => Preferences.set({
            key: TALOS_MOBILE_SETTINGS_KEY,
            value: JSON.stringify({
                presentation_v2: true,
                defaults_v3: true,
                library_defaults_v1: true,
                // ⛔ La bandiera del giro che RIMETTE il salvataggio automatico
                // al suo default: senza, girerebbe a ogni avvio e una scelta
                // deliberata di spegnerlo non reggerebbe mai.
                library_autosave_defaults_v2: true,
                type_defaults_v1: true,
                font_v2: true,
                composer_split_v1: true,
                shell: next.shell,
                onboarding: next.onboarding,
                security: next.security,
                local_engine_probe: next.local_engine_probe,
                tools: next.tools,
                tools_chosen: next.tools_chosen,
                agent_tools: next.agent_tools,
                tool_authorizations: next.tool_authorizations,
                search: next.search,
                research_models: next.research_models,
                tone: next.tone,
                chat_layout: next.chat_layout,
                ai_defaults: next.ai_defaults,
                composer_defaults: next.composer_defaults,
                motion_v6: next.motion_v6,
                model_lab: next.model_lab,
                browser: next.browser,
                voice: next.voice,
            }),
        }))
    }

    /**
     * I-08. The shape `setAgentToolEnabled` already had, made the only way to
     * change a setting.
     *
     * `build` runs INSIDE the queue, so it always reads the latest committed
     * state rather than whatever was on screen when the user tapped. The write
     * happens first and the live state is published only once it has landed:
     * a capability that is live but not durable authorises the action now and
     * denies ever having done so after a restart, which is the worst of both.
     *
     * A rejected write must not poison the lane — the next setting still saves.
     */
    function commit<T = void>(
        build: () => { overrides: Partial<TalosMobileSettingsState>; result?: T } | null,
        { optimistic = false } = {},
    ): Promise<T> {
        if (optimistic) {
            // Presentation answers the tap on the SAME tick, exactly as it did
            // before any of this existed. Deferring it even by a microtask is
            // visible: the surface redraws after the gesture instead of with
            // it, and tears down whatever that redraw races.
            const plan = build()
            if (!plan) return Promise.resolve(undefined as T)
            const previous = Object.fromEntries(
                Object.keys(plan.overrides).map((key) => [key, state[key as keyof TalosMobileSettingsState]]),
            )
            Object.assign(state, plan.overrides)
            const snapshot = { ...plan.overrides }
            // The WRITE still goes through the shared queue — that is what
            // stops two domains clobbering one another inside the stored
            // document. Only the publish is early.
            const write = settingsMutationTail.then(async () => {
                try {
                    await persist(snapshot)
                } catch (error) {
                    Object.assign(state, previous)
                    throw error
                }
            })
            settingsMutationTail = write.then(() => undefined, () => undefined)
            return write.then(() => plan.result as T)
        }
        const operation = settingsMutationTail.then(async () => {
            const plan = build()
            // `null` means the candidate matched what is already committed.
            if (!plan) return undefined as T
            await persist(plan.overrides)
            Object.assign(state, plan.overrides)
            return plan.result as T
        })
        settingsMutationTail = operation.then(() => undefined, () => undefined)
        return operation
    }

    /**
     * `shell` mixes a capability with presentation: `library_context_enabled`
     * decides whether documents reach a provider, while `library_view` decides
     * whether they are drawn as a list. Debt worth naming — the blob should be
     * split — but until then the distinction is made here rather than pretended
     * away, because the two need opposite publish rules.
     */
    const SHELL_CAPABILITY_KEYS: ReadonlyArray<keyof TalosMobileShellPreferences> = [
        'library_context_enabled',
        'library_context_policy',
    ]

    singleton = {
        state: readonly(state) as Readonly<TalosMobileSettingsState>,
        /**
         * The permissions that actually apply — the ones every gate must read.
         *
         * `state.tools` is what is stored; this is what is in force. They differ
         * in exactly one case, documented in `talosEffectiveToolPermissions`:
         * with a search source configured, an INHERITED refusal to send data off
         * the device becomes a question instead of a silent no. Reading
         * `state.tools` directly where a decision is made is how the defect this
         * repairs came back.
         */
        effectiveToolPermissions(): TalosToolPermissions {
            return talosEffectiveToolPermissions({
                stored: state.tools,
                chosen: state.tools_chosen,
            })
        },
        async hydrate() {
            const { value } = await talosBridgeCall('TALOS_SETTINGS_HYDRATE',
                () => Preferences.get({ key: TALOS_MOBILE_SETTINGS_KEY }))
            const parsed = parseTalosMobileSettings(value ?? null)
            state.chat_layout = parsed.chat_layout
            state.ai_defaults = parsed.ai_defaults
            state.composer_defaults = parsed.composer_defaults
            state.motion_v6 = parsed.motion_v6
            state.model_lab = parsed.model_lab
            state.browser = parsed.browser
            state.voice = parsed.voice
            state.shell = parsed.shell
            state.onboarding = parsed.onboarding
            state.security = parsed.security
            state.local_engine_probe = parsed.local_engine_probe
            // SF-MAJOR: this line was missing, so every tool-permission choice
            // was discarded on the next launch and the gate silently reverted
            // to its defaults. A user who set "never read my things" got
            // "always allow" back after one restart — a silent escalation.
            state.tools = parsed.tools
            // Same reason, and the consequence is worse here: forget this line
            // and every restart erases the fact that the user CHOSE their
            // refusal, so the app would start promoting it to a question again
            // — the exact escalation the comment above was written about.
            state.tools_chosen = parsed.tools_chosen
            state.agent_tools = parsed.agent_tools
            state.tool_authorizations = parsed.tool_authorizations
            // Rehydrated for the same reason `tools` is: a choice that vanishes
            // on restart is a setting that lies, and that defect already shipped
            // once on the tool permissions.
            state.search = parsed.search
            state.research_models = parsed.research_models
            state.tone = parsed.tone
        },
        setShell(patch) {
            // A patch that can widen what leaves the device is never optimistic.
            const touchesCapability = SHELL_CAPABILITY_KEYS.some((key) => key in patch)
            return commit(
                () => ({ overrides: { shell: parseShellPreferences({ ...state.shell, ...patch }) } }),
                { optimistic: !touchesCapability },
            )
        },
        setLibraryContextPolicy(patch, expectedRevision) {
            return commit(() => {
                const current = state.shell.library_context_policy ?? {
                    schema_version: 1 as const,
                    revision: 0,
                    enabled: state.shell.library_context_enabled,
                    mode: 'broad_compat_v1' as const,
                    included_file_ids: [],
                    excluded_file_ids: [],
                    updated_at: null,
                }
                const candidate = applyTalosLibraryContextPolicyPatch(
                    current,
                    patch,
                    expectedRevision,
                    new Date().toISOString(),
                )
                return {
                    overrides: {
                        shell: parseShellPreferences({
                            ...state.shell,
                            library_context_enabled: candidate.enabled,
                            library_context_policy: candidate,
                        }),
                    },
                    result: candidate,
                }
            })
        },
        setOnboarding(patch) {
            return commit(() => ({
                overrides: { onboarding: parseOnboarding({ ...state.onboarding, ...patch }) },
            }))
        },
        setSecurity(patch) {
            return commit(() => ({
                overrides: { security: parseSecurityPreferences({ ...state.security, ...patch }) },
            }))
        },
        setLocalEngineProbeConsent(patch) {
            return commit(() => ({
                overrides: {
                    local_engine_probe: parseTalosLocalEngineProbePreferences({
                        ...state.local_engine_probe,
                        ...patch,
                    }),
                },
            }))
        },
        setToolPermissions(patch) {
            // Touching a permission is choosing it. From here on the app must
            // not revise it, whatever it is configured elsewhere.
            const chosen = [...state.tools_chosen]
            for (const action of TALOS_TOOL_ACTIONS) {
                const value = patch?.[action]
                if (
                    (value === 'allow' || value === 'ask' || value === 'deny')
                    && !chosen.includes(action)
                ) {
                    chosen.push(action)
                }
            }
            return commit(() => ({
                overrides: {
                    tools: parseToolPermissions({ ...state.tools, ...patch }),
                    tools_chosen: chosen,
                },
            }))
        },
        async setAgentToolEnabled(tool, enabled) {
            if (!isTalosAgentToolId(tool) || typeof enabled !== 'boolean') return
            await commit(() => {
                const candidate = parseTalosAgentToolEnabled({
                    ...state.agent_tools,
                    [tool]: enabled,
                })
                if (candidate[tool] === state.agent_tools[tool]) return null
                return { overrides: { agent_tools: candidate } }
            })
        },
        async grantToolAuthorization(tool, actions) {
            await commit(() => {
                const current = state.tool_authorizations
                return {
                    overrides: {
                        tool_authorizations: applyTalosToolAuthorizationGrant(
                            current,
                            tool,
                            actions,
                            current.revision,
                            new Date().toISOString(),
                        ),
                    },
                }
            })
        },
        async revokeToolAuthorization(tool) {
            await commit(() => {
                const current = state.tool_authorizations
                const candidate = revokeTalosToolAuthorizationGrant(current, tool, current.revision)
                if (candidate === current) return null
                return { overrides: { tool_authorizations: candidate } }
            })
        },
        setSearchPreferences(patch) {
            return commit(() => ({
                overrides: { search: parseSearchPreferences({ ...state.search, ...patch }) },
            }))
        },
        setResearchModels(patch) {
            return commit(() => ({
                overrides: { research_models: parseResearchModels({ ...state.research_models, ...patch }) },
            }))
        },
        setTone(preset) {
            return commit(
                () => ({ overrides: { tone: parseTonePreferences({ preset }) } }),
                { optimistic: true },
            )
        },
        setChatLayout(patch) {
            return commit(
                () => ({
                    overrides: { chat_layout: sanitizeTalosChatLayout({ ...state.chat_layout, ...patch }) },
                }),
                { optimistic: true },
            )
        },
        setAiDefaults(patch) {
            return commit(() => ({
                overrides: { ai_defaults: parseAiDefaults({ ...state.ai_defaults, ...patch }) },
            }))
        },
        setComposerDefaults(patch) {
            return commit(
                () => ({
                    overrides: {
                        composer_defaults: parseComposerDefaults({ ...state.composer_defaults, ...patch }),
                    },
                }),
                { optimistic: true },
            )
        },
        setModelLabPreferences(value) {
            return commit(
                () => ({ overrides: { model_lab: parseTalosMobileModelLabPreferences(value) } }),
                { optimistic: true },
            )
        },
        setBrowserPreferences(value) {
            return commit(() => ({
                overrides: {
                    browser: parseTalosMobileBrowserPreferences({
                        ...state.browser,
                        ...value,
                        schema_version: 1,
                    }),
                },
            }))
        },
        setVoicePreferences(patch) {
            return commit(() => ({
                overrides: { voice: parseVoicePreferences({ ...state.voice, ...patch }) },
            }))
        },
        async setMotionPreferences(patch) {
            await commit(() => {
                const candidate: TalosMotionV6Preferences = {
                    ...state.motion_v6,
                    ...patch,
                    interface: {
                        ...state.motion_v6.interface,
                        ...patch.interface,
                        categories: {
                            ...state.motion_v6.interface.categories,
                            ...patch.interface?.categories,
                        },
                    },
                }
                const parsed = parseTalosMotionV6Preferences(candidate)
                if (!parsed.success) return null
                return { overrides: { motion_v6: parsed.value } }
            }, { optimistic: true })
        },
        resetMotionPreferences() {
            return commit(
                () => ({ overrides: { motion_v6: createMobileDefaultMotionPreferences() } }),
                { optimistic: true },
            )
        },
    }
    return singleton
}

export function __resetSettingsStoreForTests(): void {
    singleton = null
}
