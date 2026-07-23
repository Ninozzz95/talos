/**
 * Local-first settings preferences — the desktop `preferences` subtrees that are pure
 * client render/behaviour prefs (chat layout, AI defaults, appearance visibility,
 * keyboard shortcuts). Each subtree is fail-closed through the ported desktop resolvers
 * (`sanitizeTalosChatLayout`, `resolveTalosAppearanceVisibility`, `resolveTalosShortcuts`)
 * so parity is exact. Persisted in Capacitor Preferences; theme + color mode live in the
 * theme store. Server-coupled tabs (search/browser/integrations/…) are replicated in the
 * UI as gated/read-only per the identical-to-desktop rule but hold no live state here.
 */
import { reactive, readonly } from 'vue'
import { Preferences } from '@capacitor/preferences'
import { TALOS_DEFAULT_CHAT_LAYOUT, sanitizeTalosChatLayout } from '@/lib/talosChatLayout'
import type { TalosChatLayoutPreferences } from '@/lib/talosTypes'
import {
    resolveTalosAppearanceVisibility,
    type TalosAppearanceGroup,
    type TalosAppearanceVisibility,
} from '@/lib/talosAppearancePreferences'
import { defaultTalosShortcuts, resolveTalosShortcuts, type TalosShortcutActionId } from '@/lib/talosShortcuts'
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
}

const DEFAULT_SHELL_PREFERENCES: TalosMobileShellPreferences = {
    immersive_header: false,
    composer_drawer: false,
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
    }
}

// F2-T6 — versioned intro/onboarding contract (mobile-local mirror of the
// desktop intro spec): compared against TALOS_MOBILE_INTRO_VERSION at open.
export type TalosMobileIntroOutcome = 'completed' | 'skipped'

export interface TalosMobileOnboardingState {
    intro_version: number
    intro_outcome: TalosMobileIntroOutcome | null
    setup_dismissed: boolean
}

const DEFAULT_ONBOARDING_STATE: TalosMobileOnboardingState = {
    intro_version: 0,
    intro_outcome: null,
    setup_dismissed: false,
}

function parseOnboarding(value: unknown): TalosMobileOnboardingState {
    const record = (typeof value === 'object' && value !== null) ? value as Record<string, unknown> : {}
    const version = typeof record.intro_version === 'number'
        && Number.isInteger(record.intro_version)
        && record.intro_version >= 0
        && record.intro_version <= 65535
        ? record.intro_version
        : DEFAULT_ONBOARDING_STATE.intro_version
    const outcome = record.intro_outcome === 'completed' || record.intro_outcome === 'skipped'
        ? record.intro_outcome
        : null
    return {
        intro_version: version,
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
}

const DEFAULT_SECURITY_PREFERENCES: TalosMobileSecurityPreferences = {
    app_lock_enabled: false,
    app_lock_biometric: false,
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

export interface TalosMobileSettingsState {
    shell: TalosMobileShellPreferences
    onboarding: TalosMobileOnboardingState
    security: TalosMobileSecurityPreferences
    tone: TalosMobileTonePreferences
    chat_layout: TalosChatLayoutPreferences
    ai_defaults: TalosAiDefaults
    composer_defaults: TalosComposerDefaults
    motion_v6: TalosMotionV6Preferences
    appearance_visibility: TalosAppearanceVisibility
    keyboard_shortcuts: Record<TalosShortcutActionId, string>
    model_lab: TalosMobileModelLabPreferences
    browser: TalosMobileBrowserPreferences
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
    return {
        shell: parseShellPreferences(value.shell),
        onboarding: parseOnboarding(value.onboarding),
        security: parseSecurityPreferences(value.security),
        tone: parseTonePreferences(value.tone),
        chat_layout: chatLayout,
        ai_defaults: parseAiDefaults(value.ai_defaults),
        composer_defaults: parseComposerDefaults(value.composer_defaults),
        motion_v6: parseMotionPreferences(value.motion_v6 ?? createMobileDefaultMotionPreferences()),
        appearance_visibility: resolveTalosAppearanceVisibility(value.appearance_visibility),
        keyboard_shortcuts: resolveTalosShortcuts(value.keyboard_shortcuts),
        model_lab: parseTalosMobileModelLabPreferences(
            value.model_lab ?? TALOS_DEFAULT_MODEL_LAB_PREFERENCES,
        ),
        browser: parseTalosMobileBrowserPreferences(
            value.browser ?? TALOS_DEFAULT_MOBILE_BROWSER_PREFERENCES,
        ),
    }
}

export const DEFAULT_SETTINGS_STATE: TalosMobileSettingsState = parseTalosMobileSettings(null)

export interface SettingsStore {
    readonly state: Readonly<TalosMobileSettingsState>
    hydrate(): Promise<void>
    setChatLayout(patch: Partial<TalosChatLayoutPreferences>): Promise<void>
    setShell(patch: Partial<TalosMobileShellPreferences>): Promise<void>
    setOnboarding(patch: Partial<TalosMobileOnboardingState>): Promise<void>
    setSecurity(patch: Partial<TalosMobileSecurityPreferences>): Promise<void>
    setTone(preset: TalosToneId): Promise<void>
    setAiDefaults(patch: Partial<TalosAiDefaults>): Promise<void>
    setComposerDefaults(patch: Partial<TalosComposerDefaults>): Promise<void>
    setModelLabPreferences(value: TalosMobileModelLabPreferences): Promise<void>
    setBrowserPreferences(value: Partial<Omit<TalosMobileBrowserPreferences, 'schema_version'>>): Promise<void>
    setMotionPreferences(patch: TalosMotionPreferencePatch): Promise<void>
    resetMotionPreferences(): Promise<void>
    setVisibility(group: TalosAppearanceGroup, key: string, value: boolean): Promise<void>
    resetVisibility(group?: TalosAppearanceGroup): Promise<void>
    setShortcut(action: TalosShortcutActionId, binding: string): Promise<void>
    resetShortcuts(): Promise<void>
}

let singleton: SettingsStore | null = null

export function useSettingsStore(): SettingsStore {
    if (singleton) return singleton
    const state = reactive<TalosMobileSettingsState>(parseTalosMobileSettings(null))

    async function persist(): Promise<void> {
        await Preferences.set({
            key: TALOS_MOBILE_SETTINGS_KEY,
            value: JSON.stringify({
                presentation_v2: true,
                shell: state.shell,
                onboarding: state.onboarding,
                security: state.security,
                tone: state.tone,
                chat_layout: state.chat_layout,
                ai_defaults: state.ai_defaults,
                composer_defaults: state.composer_defaults,
                motion_v6: state.motion_v6,
                appearance_visibility: state.appearance_visibility,
                keyboard_shortcuts: state.keyboard_shortcuts,
                model_lab: state.model_lab,
                browser: state.browser,
            }),
        })
    }

    singleton = {
        state: readonly(state) as Readonly<TalosMobileSettingsState>,
        async hydrate() {
            const { value } = await Preferences.get({ key: TALOS_MOBILE_SETTINGS_KEY })
            const parsed = parseTalosMobileSettings(value ?? null)
            state.chat_layout = parsed.chat_layout
            state.ai_defaults = parsed.ai_defaults
            state.composer_defaults = parsed.composer_defaults
            state.motion_v6 = parsed.motion_v6
            state.appearance_visibility = parsed.appearance_visibility
            state.keyboard_shortcuts = parsed.keyboard_shortcuts
            state.model_lab = parsed.model_lab
            state.browser = parsed.browser
            state.shell = parsed.shell
            state.onboarding = parsed.onboarding
            state.security = parsed.security
            state.tone = parsed.tone
        },
        async setShell(patch) {
            state.shell = parseShellPreferences({ ...state.shell, ...patch })
            await persist()
        },
        async setOnboarding(patch) {
            state.onboarding = parseOnboarding({ ...state.onboarding, ...patch })
            await persist()
        },
        async setSecurity(patch) {
            state.security = parseSecurityPreferences({ ...state.security, ...patch })
            await persist()
        },
        async setTone(preset) {
            state.tone = parseTonePreferences({ preset })
            await persist()
        },
        async setChatLayout(patch) {
            state.chat_layout = sanitizeTalosChatLayout({ ...state.chat_layout, ...patch })
            await persist()
        },
        async setAiDefaults(patch) {
            state.ai_defaults = parseAiDefaults({ ...state.ai_defaults, ...patch })
            await persist()
        },
        async setComposerDefaults(patch) {
            state.composer_defaults = parseComposerDefaults({ ...state.composer_defaults, ...patch })
            await persist()
        },
        async setModelLabPreferences(value) {
            state.model_lab = parseTalosMobileModelLabPreferences(value)
            await persist()
        },
        async setBrowserPreferences(value) {
            state.browser = parseTalosMobileBrowserPreferences({
                ...state.browser,
                ...value,
                schema_version: 1,
            })
            await persist()
        },
        async setMotionPreferences(patch) {
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
            if (!parsed.success) return
            state.motion_v6 = parsed.value
            await persist()
        },
        async resetMotionPreferences() {
            state.motion_v6 = createMobileDefaultMotionPreferences()
            await persist()
        },
        async setVisibility(group, key, value) {
            const groupMap = state.appearance_visibility[group] as Record<string, boolean>
            if (key in groupMap) {
                groupMap[key] = value
                await persist()
            }
        },
        async resetVisibility(group) {
            const defaults = resolveTalosAppearanceVisibility({})
            if (group) {
                state.appearance_visibility = {
                    ...state.appearance_visibility,
                    [group]: defaults[group],
                }
            } else {
                state.appearance_visibility = defaults
            }
            await persist()
        },
        async setShortcut(action, binding) {
            state.keyboard_shortcuts = { ...state.keyboard_shortcuts, [action]: binding }
            await persist()
        },
        async resetShortcuts() {
            state.keyboard_shortcuts = defaultTalosShortcuts()
            await persist()
        },
    }
    return singleton
}

export function __resetSettingsStoreForTests(): void {
    singleton = null
}
