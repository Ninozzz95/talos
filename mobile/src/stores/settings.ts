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
import { Preferences } from '@capacitor/preferences'
import type { TalosSearchSourceId } from '@/lib/search/searchSources'
import type { TalosLibrarySort } from '@/lib/libraryGrouping'
import { TALOS_DEFAULT_CHAT_LAYOUT, sanitizeTalosChatLayout } from '@/lib/talosChatLayout'

/** Owner 2026-07-25: "di default large font size e small chat font size". */
const TALOS_MOBILE_DEFAULT_BUBBLE_SCALE = 'compact' as const
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
// fade instead of the solid header bar. composer_drawer (F3-T4bis, owner #13):
// Claude-style minimal composer bar (+ / model chip / mic) with the tool
// controls organized into a bottom drawer.
export interface TalosMobileShellPreferences {
    immersive_header: boolean
    composer_drawer: boolean
    /** Owner 2026-07-24 (ChatGPT-style): compact single-line composer that
     *  expands (shows model+effort) on focus. Additive to the other modes. */
    immersive_composer: boolean
    /** Owner 2026-07-24: the "+" opens an anchored DROPDOWN (ChatGPT-style)
     *  instead of the bottom drawer. Same actions, different surface. */
    plus_dropdown: boolean
    /** Owner 2026-07-24: the Android launcher icon follows the active theme
     *  preset. Opt-in — a restart is required to apply, so switching prompts
     *  the user (restart now / on next close). */
    launcher_icon_follows_theme: boolean
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
    /** Owner 2026-07-25: remembered Library view (grid gallery / list). */
    library_view: 'grid' | 'list'
    /**
     * Owner 2026-07-30. Grouping by origin chat was a plain `ref`, so it reset
     * on every visit — debt P6, and the reason a preference the owner set in
     * July never survived a single reopen. It is remembered now, and the sort
     * that arrived with it is remembered in the same place rather than becoming
     * a second switch that forgets.
     */
    library_group_by_chat: boolean
    library_sort: TalosLibrarySort
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
}

// Owner #15 (2026-07-23): immersive chrome and the Claude-style composer
// drawer ARE the default mobile experience.
const DEFAULT_SHELL_PREFERENCES: TalosMobileShellPreferences = {
    immersive_header: true,
    composer_drawer: true,
    immersive_composer: false,
    plus_dropdown: false,
    launcher_icon_follows_theme: false,
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
    library_view: 'list',
    // Owner 2026-07-25 set grouping on; it just never survived a reopen.
    library_group_by_chat: true,
    library_sort: 'recent',
    ui_font_scale: TALOS_DEFAULT_FONT_SCALE,
    streaming_animation: 'typewriter',
    debug_diagnostics: false,
    tablet_sidebar_width: TALOS_TABLET_SIDEBAR_DEFAULT,
}

function parseShellPreferences(value: unknown): TalosMobileShellPreferences {
    const record = (typeof value === 'object' && value !== null) ? value as Record<string, unknown> : {}
    return {
        immersive_header: typeof record.immersive_header === 'boolean'
            ? record.immersive_header
            : DEFAULT_SHELL_PREFERENCES.immersive_header,
        composer_drawer: typeof record.composer_drawer === 'boolean'
            ? record.composer_drawer
            : DEFAULT_SHELL_PREFERENCES.composer_drawer,
        immersive_composer: typeof record.immersive_composer === 'boolean'
            ? record.immersive_composer
            : DEFAULT_SHELL_PREFERENCES.immersive_composer,
        plus_dropdown: typeof record.plus_dropdown === 'boolean'
            ? record.plus_dropdown
            : DEFAULT_SHELL_PREFERENCES.plus_dropdown,
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
        // Re-review 2026-07-25: this hardcoded 'grid' as the fallback, so the
        // documented 'list' default never shipped.
        library_view: record.library_view === 'grid' ? 'grid' : DEFAULT_SHELL_PREFERENCES.library_view,
        library_group_by_chat: typeof record.library_group_by_chat === 'boolean'
            ? record.library_group_by_chat
            : DEFAULT_SHELL_PREFERENCES.library_group_by_chat,
        // An unrecognised sort falls back rather than reaching the grouping,
        // where it would silently mean "no sort at all".
        library_sort: record.library_sort === 'oldest' || record.library_sort === 'name'
            ? record.library_sort
            : DEFAULT_SHELL_PREFERENCES.library_sort,
        ui_font_scale: parseTalosFontScale(record.ui_font_scale),
        streaming_animation: record.streaming_animation === 'fade' ? 'fade' : 'typewriter',
        // Fail closed: anything unrecognised is OFF, so a corrupt preference
        // cannot start showing internals to a user who never asked.
        debug_diagnostics: record.debug_diagnostics === true,
        tablet_sidebar_width: clampTalosTabletSidebarWidth(record.tablet_sidebar_width),
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
export interface TalosMobileVoicePreferences {
    voice_uri: string | null
    rate: number
    pitch: number
    dictation_language: TalosDictationLanguageMode
}

const DEFAULT_VOICE_PREFERENCES: TalosMobileVoicePreferences = {
    voice_uri: null,
    rate: 1,
    pitch: 1,
    dictation_language: 'system',
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
    }
}
export interface TalosMobileSettingsState {
    /** Owner 2026-07-25: tool permissions per ACTION TYPE, user-configured. */
    tools: TalosToolPermissions
    /** Per-tool eligibility. Action permissions remain an additional gate. */
    agent_tools: TalosAgentToolEnabled
    /** Exact, revocable device grants for tools whose action policy is `ask`. */
    tool_authorizations: TalosToolAuthorizationGrantsV1
    /** F1: the chosen web-search source. The key itself lives in secure storage. */
    search: TalosMobileSearchPreferences
    shell: TalosMobileShellPreferences
    onboarding: TalosMobileOnboardingState
    security: TalosMobileSecurityPreferences
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

// F3-T1 (owner #7): the MOBILE default ships with background intensity at the
// range minimum (scenes stay visible — opacity factor floors at 0.5x — but
// maximally quiet). The engine contract default stays desktop-identical; only
// the mobile out-of-box preference differs. Persisted user values win as usual.
function createMobileDefaultMotionPreferences(): TalosMotionV6Preferences {
    const defaults = createDefaultTalosMotionV6Preferences()
    defaults.intensity = 0
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
    if (value.defaults_v3 !== true) {
        shellParsed.immersive_header = true
        shellParsed.composer_drawer = true
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
        shellParsed.library_autosave_generated = false
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
    return {
        shell: shellParsed,
        onboarding: parseOnboarding(value.onboarding),
        security: parseSecurityPreferences(value.security),
        tools: parseToolPermissions(value.tools),
        agent_tools: parseTalosAgentToolEnabled(value.agent_tools),
        tool_authorizations: parseTalosToolAuthorizationGrants(value.tool_authorizations),
        search: parseSearchPreferences(value.search),
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
    hydrate(): Promise<void>
    setChatLayout(patch: Partial<TalosChatLayoutPreferences>): Promise<void>
    setShell(patch: Partial<TalosMobileShellPreferences>): Promise<void>
    setLibraryContextPolicy(
        patch: TalosLibraryContextPolicyPatch,
        expectedRevision: number,
    ): Promise<TalosLibraryContextPolicyV1>
    setOnboarding(patch: Partial<TalosMobileOnboardingState>): Promise<void>
    setSecurity(patch: Partial<TalosMobileSecurityPreferences>): Promise<void>
    /** Owner 2026-07-25: what the model may do without asking. */
    setToolPermissions(patch: Partial<TalosToolPermissions>): Promise<void>
    setAgentToolEnabled(tool: TalosAgentToolId, enabled: boolean): Promise<void>
    grantToolAuthorization(
        tool: TalosAgentToolId,
        actions: readonly TalosToolAction[],
    ): Promise<void>
    revokeToolAuthorization(tool: TalosAgentToolId): Promise<void>
    setSearchPreferences(patch: Partial<TalosMobileSearchPreferences>): Promise<void>
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
                type_defaults_v1: true,
                shell: next.shell,
                onboarding: next.onboarding,
                security: next.security,
                tools: next.tools,
                agent_tools: next.agent_tools,
                tool_authorizations: next.tool_authorizations,
                search: next.search,
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
            // SF-MAJOR: this line was missing, so every tool-permission choice
            // was discarded on the next launch and the gate silently reverted
            // to its defaults. A user who set "never read my things" got
            // "always allow" back after one restart — a silent escalation.
            state.tools = parsed.tools
            state.agent_tools = parsed.agent_tools
            state.tool_authorizations = parsed.tool_authorizations
            // Rehydrated for the same reason `tools` is: a choice that vanishes
            // on restart is a setting that lies, and that defect already shipped
            // once on the tool permissions.
            state.search = parsed.search
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
        setToolPermissions(patch) {
            return commit(() => ({
                overrides: { tools: parseToolPermissions({ ...state.tools, ...patch }) },
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
