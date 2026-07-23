/**
 * Theme store — full desktop parity. Applies the exact desktop token derivation:
 * `talosThemeModeVariantStyle` (the ~55 `--talos-*` custom properties the ported
 * desktop components consume) plus the shadcn bridge (`applyTalosMobileDesignTokens`
 * from the canonical identity) so reka-nova components stay in sync. 13 presets +
 * color mode, persisted in Capacitor Preferences, re-applied when the system scheme
 * changes while in `system` mode. Fail-closed parsing.
 */
import { reactive, readonly } from 'vue'
import { Preferences } from '@capacitor/preferences'
import {
    TALOS_DEFAULT_THEME,
    effectiveTalosThemeMode,
    isTalosThemeId,
    talosThemeModeVariantStyle,
    type TalosResolvedThemeMode,
    type TalosThemeId,
    type TalosThemeMode,
} from '@/lib/talosThemes'
import { exportTalosThemeIdentity, getTalosThemeIdentityV6 } from '@/motion-v6/themeIdentity'
import { parseTalosMobileDesignTokens } from '@talos-mobile/design-tokens'
import { applyTalosMobileDesignTokens } from '@/theme/applyDesignTokens'

export const TALOS_MOBILE_THEME_KEY = 'talos.mobile.theme'
const THEME_MODES: readonly TalosThemeMode[] = ['system', 'light', 'dark']

export interface TalosMobileThemeState {
    theme: TalosThemeId
    mode: TalosThemeMode
}

export const DEFAULT_THEME_STATE: TalosMobileThemeState = Object.freeze({
    theme: TALOS_DEFAULT_THEME,
    mode: 'system',
})

function systemPrefersDark(): boolean {
    return typeof window !== 'undefined'
        && typeof window.matchMedia === 'function'
        && window.matchMedia('(prefers-color-scheme: dark)').matches
}

export function parseTalosThemeState(raw: string | null): TalosMobileThemeState {
    if (raw === null) return { ...DEFAULT_THEME_STATE }
    let value: unknown
    try { value = JSON.parse(raw) } catch { return { ...DEFAULT_THEME_STATE } }
    if (typeof value !== 'object' || value === null) return { ...DEFAULT_THEME_STATE }
    const record = value as Record<string, unknown>
    let theme = isTalosThemeId(record.theme) ? record.theme : DEFAULT_THEME_STATE.theme
    // F3-T1 (owner #9) one-shot migration: 'telemetry' persisted by pre-calm
    // builds was the OLD default, not a user choice — move it to calm once.
    // Post-migration persists carry `calm_migrated`, so a deliberate
    // re-selection of telemetry sticks.
    if (theme === 'telemetry' && record.calm_migrated !== true) {
        theme = TALOS_DEFAULT_THEME
    }
    const mode = THEME_MODES.includes(record.mode as TalosThemeMode)
        ? (record.mode as TalosThemeMode)
        : DEFAULT_THEME_STATE.mode
    return { theme, mode }
}

/** Apply a preset + color mode to a target element and return the resolved mode. */
export function applyTalosTheme(
    theme: TalosThemeId,
    mode: TalosThemeMode,
    target: HTMLElement = document.documentElement,
): TalosResolvedThemeMode {
    const resolved = effectiveTalosThemeMode(theme, mode, systemPrefersDark())

    // shadcn bridge + fonts/radius/density + data attributes, from the canonical identity.
    const identitySource = getTalosThemeIdentityV6(theme)
    if (identitySource) {
        const identity = parseTalosMobileDesignTokens(exportTalosThemeIdentity(identitySource))
        applyTalosMobileDesignTokens(identity, resolved, target)
    }
    // Overlay the exact desktop `--talos-*` set so ported desktop components render identically.
    const vars = talosThemeModeVariantStyle(theme, resolved)
    for (const [key, val] of Object.entries(vars)) target.style.setProperty(key, val)

    return resolved
}

export interface ThemeStore {
    readonly state: Readonly<TalosMobileThemeState>
    hydrate(): Promise<void>
    setTheme(theme: TalosThemeId): Promise<void>
    setMode(mode: TalosThemeMode): Promise<void>
    applyCurrent(): void
}

let singleton: ThemeStore | null = null

export function useThemeStore(): ThemeStore {
    if (singleton) return singleton
    const state = reactive<TalosMobileThemeState>({ ...DEFAULT_THEME_STATE })

    function applyCurrent(): void {
        applyTalosTheme(state.theme, state.mode)
    }
    async function persist(): Promise<void> {
        await Preferences.set({
            key: TALOS_MOBILE_THEME_KEY,
            value: JSON.stringify({ theme: state.theme, mode: state.mode, calm_migrated: true }),
        })
    }

    // Track the system scheme so `system` mode follows the OS live.
    if (typeof window !== 'undefined' && typeof window.matchMedia === 'function') {
        const media = window.matchMedia('(prefers-color-scheme: dark)')
        const onChange = (): void => { if (state.mode === 'system') applyCurrent() }
        if (typeof media.addEventListener === 'function') media.addEventListener('change', onChange)
    }

    singleton = {
        state: readonly(state),
        async hydrate() {
            const { value } = await Preferences.get({ key: TALOS_MOBILE_THEME_KEY })
            const parsed = parseTalosThemeState(value ?? null)
            state.theme = parsed.theme
            state.mode = parsed.mode
            applyCurrent()
        },
        async setTheme(theme) {
            if (!isTalosThemeId(theme)) return
            state.theme = theme
            applyCurrent()
            await persist()
        },
        async setMode(mode) {
            state.mode = mode
            applyCurrent()
            await persist()
        },
        applyCurrent,
    }
    return singleton
}

export function __resetThemeStoreForTests(): void {
    singleton = null
}
