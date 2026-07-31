// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from 'vitest'

const runtime = vi.hoisted(() => {
    const preferences = new Map<string, string>()
    return {
        native: true,
        preferences,
        preferenceGet: vi.fn(async ({ key }: { key: string }) => ({
            value: preferences.get(key) ?? null,
        })),
        preferenceSet: vi.fn(async ({ key, value }: {
            key: string
            value: string
        }) => {
            preferences.set(key, value)
        }),
        getState: vi.fn(),
        setMode: vi.fn(),
        registerPlugin: vi.fn(),
    }
})

vi.mock('@capacitor/core', () => ({
    Capacitor: {
        isNativePlatform: () => runtime.native,
    },
    registerPlugin: runtime.registerPlugin,
}))

vi.mock('@capacitor/preferences', () => ({
    Preferences: {
        get: runtime.preferenceGet,
        set: runtime.preferenceSet,
    },
}))

import {
    __resetTalosNativeLocaleForTests,
    reconcileTalosNativeLocaleMode,
    type TalosNativeLocaleState,
} from '@/services/nativeLocale'

const LOCALE_KEY = 'talos.mobile.locale'
const MIGRATION_KEY = 'talos.mobile.locale.native-migration.v1'

function native(
    overrides: Partial<TalosNativeLocaleState> = {},
): TalosNativeLocaleState {
    return {
        applicationLocales: [],
        systemLocales: ['en-US'],
        usesAppCompatStorage: true,
        ...overrides,
    }
}

beforeEach(() => {
    runtime.native = true
    runtime.preferences.clear()
    runtime.preferenceGet.mockClear()
    runtime.preferenceSet.mockClear()
    runtime.getState.mockReset()
    runtime.setMode.mockReset()
    runtime.registerPlugin.mockReset()
    runtime.registerPlugin.mockReturnValue({
        getState: runtime.getState,
        setMode: runtime.setMode,
    })
    localStorage.clear()
    __resetTalosNativeLocaleForTests()
})

describe('native locale reconciliation', () => {
    it('ANDROID-LOCALE-RESTORE-02 hands an explicit pre-auto-store preference to Android 12-', () => {
        expect(reconcileTalosNativeLocaleMode('it', native(), false)).toEqual({
            mode: 'it',
            restoreMode: 'it',
            markMigrationComplete: true,
        })
    })

    it('ANDROID-LOCALE-RESTORE-03 trusts an explicit locale already restored by AndroidX', () => {
        expect(reconcileTalosNativeLocaleMode('it', native({
            applicationLocales: ['en-US'],
        }), false)).toEqual({
            mode: 'en',
            restoreMode: null,
            markMigrationComplete: true,
        })
    })

    it('ANDROID-LOCALE-RESTORE-04 treats an Android 13+ empty locale as System authority', () => {
        expect(reconcileTalosNativeLocaleMode('it', native({
            usesAppCompatStorage: false,
        }), true)).toEqual({
            mode: 'system',
            restoreMode: null,
            markMigrationComplete: false,
        })
    })

    it('keeps an explicit Android 13+ locale authoritative over stale Preferences', () => {
        expect(reconcileTalosNativeLocaleMode('en', native({
            applicationLocales: ['it-IT'],
            usesAppCompatStorage: false,
        }), false)).toEqual({
            mode: 'it',
            restoreMode: null,
            markMigrationComplete: true,
        })
    })

    it('ANDROID-LOCALE-RESTORE-05 fails closed when storage-generation metadata is absent', () => {
        expect(reconcileTalosNativeLocaleMode('it', native({
            usesAppCompatStorage: undefined,
        }), false)).toEqual({
            mode: 'system',
            restoreMode: null,
            markMigrationComplete: false,
        })
    })

    it('does not manufacture a native handoff while both Android 12- stores follow System', () => {
        expect(reconcileTalosNativeLocaleMode('system', native(), false)).toEqual({
            mode: 'system',
            restoreMode: null,
            markMigrationComplete: true,
        })
    })

    it('ANDROID-LOCALE-MIGRATION-01 hands an explicit legacy locale to Android 13 exactly once', () => {
        const android13 = native({ usesAppCompatStorage: false })

        expect(reconcileTalosNativeLocaleMode('it', android13, false)).toEqual({
            mode: 'it',
            restoreMode: 'it',
            markMigrationComplete: true,
        })
        expect(reconcileTalosNativeLocaleMode('it', android13, true)).toEqual({
            mode: 'system',
            restoreMode: null,
            markMigrationComplete: false,
        })
    })

    it('ANDROID-LOCALE-MIGRATION-05 leaves a failed native handoff retryable', async () => {
        runtime.preferences.set(LOCALE_KEY, 'it')
        runtime.getState.mockResolvedValue(native({ usesAppCompatStorage: false }))
        runtime.setMode
            .mockRejectedValueOnce(new Error('native locale bridge failed'))
            .mockResolvedValueOnce(native({
                applicationLocales: ['it'],
                usesAppCompatStorage: false,
            }))
        vi.resetModules()
        const { hydrateTalosLocaleEnvironment } =
            await import('@/services/nativeLocale')

        const interrupted = await hydrateTalosLocaleEnvironment()

        expect(runtime.preferenceGet).toHaveBeenCalledWith({ key: LOCALE_KEY })
        expect(runtime.getState).toHaveBeenCalledTimes(1)
        expect(runtime.setMode).toHaveBeenCalledWith({ mode: 'it' })
        expect(interrupted.mode).toBe('it')
        expect(runtime.preferences.has(MIGRATION_KEY)).toBe(false)

        const retried = await hydrateTalosLocaleEnvironment()

        expect(retried.mode).toBe('it')
        expect(runtime.setMode).toHaveBeenCalledTimes(2)
        expect(runtime.preferences.get(MIGRATION_KEY)).toBe('1')
        expect(runtime.setMode.mock.invocationCallOrder[1])
            .toBeLessThan(
                runtime.preferenceSet.mock.invocationCallOrder.at(-1)!,
            )
    })

    it('ANDROID-LOCALE-MIGRATION-04 does not seal an unknown native generation', () => {
        expect(reconcileTalosNativeLocaleMode('it', native({
            usesAppCompatStorage: undefined,
        }), false)).toEqual({
            mode: 'system',
            restoreMode: null,
            markMigrationComplete: false,
        })
    })
})
