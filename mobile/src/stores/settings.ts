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

export interface TalosMobileSettingsState {
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

function parseMotionPreferences(value: unknown): TalosMotionV6Preferences {
    const parsed = parseTalosMotionV6Preferences(value)
    return parsed.success ? parsed.value : createDefaultTalosMotionV6Preferences()
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
    return {
        chat_layout: sanitizeTalosChatLayout(value.chat_layout ?? TALOS_DEFAULT_CHAT_LAYOUT),
        ai_defaults: parseAiDefaults(value.ai_defaults),
        composer_defaults: parseComposerDefaults(value.composer_defaults),
        motion_v6: parseMotionPreferences(value.motion_v6 ?? createDefaultTalosMotionV6Preferences()),
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
            state.motion_v6 = createDefaultTalosMotionV6Preferences()
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
