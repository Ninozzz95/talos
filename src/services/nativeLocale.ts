import { Capacitor, registerPlugin } from '@capacitor/core'
import { Preferences } from '@capacitor/preferences'
import type { TalosLocaleMode } from '@/i18n/contracts'
import { parseTalosLocaleMode } from '@/lib/localizationPolicy'
import { talosBridgeCall } from '@/lib/talosBridge'

const TALOS_LOCALE_PREFERENCE_KEY = 'talos.mobile.locale'
const TALOS_LOCALE_MIRROR_KEY = 'talos.mobile.locale.mirror'
const TALOS_LOCALE_NATIVE_MIGRATION_KEY = 'talos.mobile.locale.native-migration.v1'
const TALOS_LOCALE_NATIVE_MIGRATION_COMPLETE = '1'

export interface TalosNativeLocaleState {
    applicationLocales: string[]
    systemLocales: string[]
    /**
     * True on Android 12/API 32 and lower, where AndroidX owns the app-locale
     * store. Missing/malformed values fail closed as modern system authority.
     */
    usesAppCompatStorage?: boolean
}

interface TalosNativeLocaleBridge {
    getState(): Promise<TalosNativeLocaleState>
    setMode(options: { mode: TalosLocaleMode }): Promise<TalosNativeLocaleState>
}

let bridge: TalosNativeLocaleBridge | null = null

function nativePlugin(): TalosNativeLocaleBridge {
    return bridge ??= registerPlugin<TalosNativeLocaleBridge>('TalosLocale')
}

function browserLanguageTags(): string[] {
    if (typeof navigator === 'undefined') return []
    const tags = Array.isArray(navigator.languages)
        ? navigator.languages
        : [navigator.language]
    return tags.filter((tag): tag is string => typeof tag === 'string' && tag.trim() !== '')
}

export function readRememberedTalosLocaleMode(): TalosLocaleMode {
    if (typeof localStorage === 'undefined') return 'system'
    try {
        return parseTalosLocaleMode(localStorage.getItem(TALOS_LOCALE_MIRROR_KEY))
    } catch {
        return 'system'
    }
}

function rememberTalosLocaleMode(mode: TalosLocaleMode): void {
    if (typeof localStorage === 'undefined') return
    try {
        localStorage.setItem(TALOS_LOCALE_MIRROR_KEY, mode)
    } catch {
        // A synchronous mirror is an optimization, never a boot requirement.
    }
}

export interface TalosLocaleEnvironment {
    mode: TalosLocaleMode
    applicationLanguageTags: string[]
    systemLanguageTags: string[]
}

export interface TalosNativeLocaleReconciliation {
    mode: TalosLocaleMode
    /** One-time handoff of the pre-existing JS preference to AndroidX. */
    restoreMode: Exclude<TalosLocaleMode, 'system'> | null
    /** Persist the one-shot marker, after restoreMode succeeds when present. */
    markMigrationComplete: boolean
}

function applicationLocaleMode(tags: readonly string[]): TalosLocaleMode {
    const primary = tags[0]?.trim().replaceAll('_', '-').split('-')[0]?.toLowerCase()
    return primary === 'en' || primary === 'it' ? primary : 'system'
}

/**
 * Reconciles the two authorities without letting an old JS preference
 * overwrite an Android 13+ choice made in system Settings.
 */
export function reconcileTalosNativeLocaleMode(
    persistedMode: TalosLocaleMode,
    native: TalosNativeLocaleState,
    migrationComplete: boolean,
): TalosNativeLocaleReconciliation {
    const storedMode = parseTalosLocaleMode(persistedMode)
    const nativeMode = applicationLocaleMode(native.applicationLocales)

    // Unknown bridge generations stay fail-closed: native still supplies the
    // visible mode, but TALOS neither restores nor seals an ambiguous handoff.
    if (
        native.usesAppCompatStorage !== true
        && native.usesAppCompatStorage !== false
    ) {
        return {
            mode: nativeMode,
            restoreMode: null,
            markMigrationComplete: false,
        }
    }

    // A native explicit locale always wins, including one selected in Android
    // Settings before this TALOS migration generation first launches.
    if (nativeMode !== 'system') {
        return {
            mode: nativeMode,
            restoreMode: null,
            markMigrationComplete: !migrationComplete,
        }
    }

    // Once the custom-store handoff is complete, Android 13+ owns the empty
    // System choice too. Never resurrect a stale JS locale on later boots.
    if (native.usesAppCompatStorage === false && migrationComplete) {
        return {
            mode: 'system',
            restoreMode: null,
            markMigrationComplete: false,
        }
    }

    // Existing TALOS installs predate both AndroidX auto-storage and Android
    // 13 framework storage. Hand an explicit custom preference over once.
    return {
        mode: storedMode,
        restoreMode: storedMode === 'system' ? null : storedMode,
        markMigrationComplete: !migrationComplete,
    }
}

export async function hydrateTalosLocaleEnvironment(): Promise<TalosLocaleEnvironment> {
    let mode = readRememberedTalosLocaleMode()
    let applicationLanguageTags: string[] = []
    let systemLanguageTags = browserLanguageTags()

    try {
        const { value } = await talosBridgeCall(
            'TALOS_LOCALE_HYDRATE',
            () => Preferences.get({ key: TALOS_LOCALE_PREFERENCE_KEY }),
        )
        mode = parseTalosLocaleMode(value)
    } catch {
        // Keep the synchronous mirror. A broken Preferences bridge must not
        // prevent the app from painting in a deterministic language.
    }

    if (Capacitor.isNativePlatform()) {
        try {
            const migration = await talosBridgeCall(
                'TALOS_LOCALE_NATIVE_MIGRATION_HYDRATE',
                () => Preferences.get({ key: TALOS_LOCALE_NATIVE_MIGRATION_KEY }),
            )
            const migrationComplete =
                migration.value === TALOS_LOCALE_NATIVE_MIGRATION_COMPLETE
            const native = await talosBridgeCall(
                'TALOS_LOCALE_NATIVE_STATE',
                () => nativePlugin().getState(),
            )
            applicationLanguageTags = native.applicationLocales
            if (native.systemLocales.length > 0) systemLanguageTags = native.systemLocales
            const reconciliation = reconcileTalosNativeLocaleMode(
                mode,
                native,
                migrationComplete,
            )
            mode = reconciliation.mode
            if (reconciliation.restoreMode) {
                const restored = await talosBridgeCall(
                    'TALOS_LOCALE_NATIVE_RESTORE',
                    () => nativePlugin().setMode({ mode: reconciliation.restoreMode! }),
                )
                applicationLanguageTags = restored.applicationLocales
                if (restored.systemLocales.length > 0) {
                    systemLanguageTags = restored.systemLocales
                }
            }
            if (reconciliation.markMigrationComplete) {
                await talosBridgeCall(
                    'TALOS_LOCALE_NATIVE_MIGRATION_PERSIST',
                    () => Preferences.set({
                        key: TALOS_LOCALE_NATIVE_MIGRATION_KEY,
                        value: TALOS_LOCALE_NATIVE_MIGRATION_COMPLETE,
                    }),
                )
            }
        } catch {
            // The JS preference remains fully functional off the native bridge.
        }
    }

    rememberTalosLocaleMode(mode)
    return { mode, applicationLanguageTags, systemLanguageTags }
}

export async function persistTalosLocaleMode(mode: TalosLocaleMode): Promise<void> {
    const parsed = parseTalosLocaleMode(mode)
    rememberTalosLocaleMode(parsed)

    const writes: Promise<unknown>[] = [
        talosBridgeCall(
            'TALOS_LOCALE_PERSIST',
            () => Preferences.set({
                key: TALOS_LOCALE_PREFERENCE_KEY,
                value: parsed,
            }),
        ),
    ]
    if (Capacitor.isNativePlatform()) {
        writes.push(talosBridgeCall(
            'TALOS_LOCALE_NATIVE_SET',
            () => nativePlugin().setMode({ mode: parsed }),
        ))
    }
    await Promise.all(writes)
}

export function __resetTalosNativeLocaleForTests(): void {
    bridge = null
}
