import { reactive, readonly } from 'vue'
import { Preferences } from '@capacitor/preferences'
import { talosBridgeCall } from '@/lib/talosBridge'
import {
    DEFAULT_MOBILE_PRESENTATION,
    isTalosMobilePresentation,
    type TalosMobilePresentation,
} from '@/lib/mobilePresentation'
import { isTalosMobileRouteName, type TalosMobileRouteName } from '@/lib/mobileRoutes'

export const TALOS_MOBILE_PREFERENCES_SCHEMA_VERSION = 1
export const TALOS_MOBILE_PREFERENCES_KEY = 'talos.mobile.preferences'

export interface TalosMobilePreferencesV1 {
    schema_version: 1
    presentation: TalosMobilePresentation
    last_route: TalosMobileRouteName | null
}

export const DEFAULT_MOBILE_PREFERENCES: TalosMobilePreferencesV1 = Object.freeze({
    schema_version: 1,
    presentation: DEFAULT_MOBILE_PRESENTATION,
    last_route: null,
})

function isPlainObject(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/**
 * Parse persisted preferences, failing closed to the documented defaults for
 * any invalid, unknown or future payload. Never throws and never signals that
 * the raw bytes should be deleted; illegible bytes are simply ignored.
 */
export function parseMobilePreferences(raw: string | null): TalosMobilePreferencesV1 {
    if (raw === null) return { ...DEFAULT_MOBILE_PREFERENCES }
    let value: unknown
    try {
        value = JSON.parse(raw)
    } catch {
        return { ...DEFAULT_MOBILE_PREFERENCES }
    }
    if (!isPlainObject(value)) return { ...DEFAULT_MOBILE_PREFERENCES }
    if (value.schema_version !== TALOS_MOBILE_PREFERENCES_SCHEMA_VERSION) return { ...DEFAULT_MOBILE_PREFERENCES }
    const keys = Object.keys(value).sort()
    if (keys.join(',') !== 'last_route,presentation,schema_version') return { ...DEFAULT_MOBILE_PREFERENCES }
    if (!isTalosMobilePresentation(value.presentation)) return { ...DEFAULT_MOBILE_PREFERENCES }
    const lastRoute = value.last_route
    if (lastRoute !== null && !isTalosMobileRouteName(lastRoute)) return { ...DEFAULT_MOBILE_PREFERENCES }
    return {
        schema_version: 1,
        presentation: value.presentation,
        last_route: lastRoute,
    }
}

function serialize(preferences: TalosMobilePreferencesV1): string {
    return JSON.stringify(preferences)
}

export interface PreferencesStore {
    readonly state: Readonly<TalosMobilePreferencesV1>
    hydrate(): Promise<void>
    setPresentation(presentation: TalosMobilePresentation): Promise<void>
    setLastRoute(route: TalosMobileRouteName): Promise<void>
}

let singleton: PreferencesStore | null = null

export function usePreferencesStore(): PreferencesStore {
    if (singleton) return singleton
    const state = reactive<TalosMobilePreferencesV1>({ ...DEFAULT_MOBILE_PREFERENCES })

    async function persist(): Promise<void> {
        await talosBridgeCall('TALOS_PREFS_PERSIST', () => Preferences.set({
            key: TALOS_MOBILE_PREFERENCES_KEY,
            value: serialize({ schema_version: 1, presentation: state.presentation, last_route: state.last_route }),
        }))
    }

    singleton = {
        state: readonly(state),
        async hydrate() {
            const { value } = await talosBridgeCall('TALOS_PREFS_HYDRATE',
                () => Preferences.get({ key: TALOS_MOBILE_PREFERENCES_KEY }))
            const parsed = parseMobilePreferences(value ?? null)
            state.presentation = parsed.presentation
            state.last_route = parsed.last_route
        },
        async setPresentation(presentation) {
            state.presentation = presentation
            await persist()
        },
        async setLastRoute(route) {
            state.last_route = route
            await persist()
        },
    }
    return singleton
}

// Test-only reset so isolated specs do not share the module singleton.
export function __resetPreferencesStoreForTests(): void {
    singleton = null
}
