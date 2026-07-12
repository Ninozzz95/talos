// @vitest-environment jsdom

import { describe, expect, it, vi } from 'vitest'
import { ref } from 'vue'
import type { TalosNamedTheme, TalosThemeId } from '../lib/talosThemes'
import type { TalosWorkspaceSettings } from './useTalosSettings'
import { useTalosNamedThemeLibrary } from './useTalosNamedThemeLibrary'
import { useTalosThemeEditorState } from './useTalosThemeEditorState'
import { useTalosThemeMotionV6Editor } from './useTalosThemeMotionV6Editor'
import type { TalosThemeEditorPersistence } from './useTalosThemeEditorPersistence'

const now = '2026-07-11T12:00:00.000Z'

function settings(preferences: Record<string, unknown> = {}): TalosWorkspaceSettings {
    return {
        id: 'theme-library-settings',
        preferences: {
            theme: 'forge',
            theme_library: [],
            theme_customization: {},
            ...preferences,
        },
    }
}

function namedTheme(overrides: Partial<TalosNamedTheme> = {}): TalosNamedTheme {
    return {
        id: 'operator-theme',
        name: 'Operator Theme',
        base_theme: 'forge',
        tokens: {},
        created_at: now,
        updated_at: now,
        ...overrides,
    }
}

function createHarness() {
    const settingsRef = ref(settings())
    const editor = useTalosThemeEditorState({
        theme: ref<TalosThemeId>('forge'),
        settings: settingsRef,
    })
    editor.syncFromSettings()
    const committedSettings = ref(settings())
    let releaseWrite!: (value: TalosWorkspaceSettings) => void
    const persistPreferences = vi.fn(() => new Promise<TalosWorkspaceSettings>((resolve) => {
        releaseWrite = (value) => {
            committedSettings.value = value
            resolve(value)
        }
    }))
    const persistence = {
        localThemeError: ref(''),
        themeControlRevision: ref(0),
        canWriteTheme: vi.fn(() => true),
        rejectUnsafeThemeState: vi.fn(() => false),
        preferencesRecord: vi.fn(() => settingsRef.value!.preferences),
        persistPreferences,
        bumpThemeControlRevision: vi.fn(),
    } as unknown as TalosThemeEditorPersistence
    const changeTheme = vi.fn()
    const motionV6 = useTalosThemeMotionV6Editor({
        settings: settingsRef,
        updateSettings: async () => settingsRef.value!,
    })
    const library = useTalosNamedThemeLibrary({
        theme: ref<TalosThemeId>('forge'),
        settings: settingsRef,
        editor,
        motionV6,
        persistence,
        emitChangeTheme: changeTheme,
        emitThemeDraftChanged: vi.fn(),
    })

    return {
        editor,
        library,
        persistence,
        changeTheme,
        persistPreferences,
        releaseWrite: (value: TalosWorkspaceSettings) => releaseWrite(value),
        committedSettings,
    }
}

describe('useTalosNamedThemeLibrary', () => {
    it('commits a new theme only after the settings write is acknowledged', async () => {
        const harness = createHarness()
        harness.library.newThemeName.value = 'Saved Theme'

        const save = harness.library.saveAsNamedTheme()
        await Promise.resolve()

        expect(harness.persistPreferences).toHaveBeenCalled()
        expect(harness.library.themeLibrary.value).toEqual([])

        harness.releaseWrite(harness.committedSettings.value)
        await save

        expect(harness.library.themeLibrary.value).toHaveLength(1)
        expect(harness.library.themeLibrary.value[0]?.name).toBe('Saved Theme')
    })

    it('does not emit a theme change until applying a named theme is acknowledged', async () => {
        const harness = createHarness()
        const theme = namedTheme({ base_theme: 'paper' })
        harness.library.syncFromSettings({
            ...harness.committedSettings.value,
            preferences: { ...harness.committedSettings.value.preferences, theme_library: [theme] },
        })

        const apply = harness.library.applyNamedTheme(theme)
        await Promise.resolve()
        expect(harness.changeTheme).not.toHaveBeenCalled()

        harness.releaseWrite(harness.committedSettings.value)
        await apply

        expect(harness.changeTheme).toHaveBeenCalledWith('paper', false)
    })

    it('upgrades a duplicated legacy library theme to canonical V6 without copying legacy motion fields', async () => {
        const harness = createHarness()
        const legacyTheme = namedTheme({
            motion: 'cinematic',
            ui_animation_profile: 'custom',
            ui_animation_customization: { intensity: 80 },
        })

        const duplicate = harness.library.duplicateTheme(legacyTheme)
        await Promise.resolve()

        const preferences = harness.persistPreferences.mock.calls[0]?.[0] as Record<string, unknown>
        expect(Object.keys(preferences)).toEqual(['theme_library'])
        const library = preferences.theme_library as Array<Record<string, unknown>>
        expect(library).toHaveLength(1)
        expect(library[0]?.motion_v6).toMatchObject({
            schema_version: 1,
            mode: 'simple',
            speed: 140,
            interface: { intensity: 80 },
        })
        expect(library[0]).not.toHaveProperty('motion')
        expect(library[0]).not.toHaveProperty('ui_animation_profile')
        expect(library[0]).not.toHaveProperty('ui_animation_customization')

        harness.releaseWrite(harness.committedSettings.value)
        await duplicate
    })

    it('validates an imported envelope before asking persistence to write it', async () => {
        const harness = createHarness()
        harness.library.importJson.value = JSON.stringify({
            schema: 'talos_theme_export_v1',
            exported_at: now,
            theme: {
                id: 'invalid-import',
                name: 'Invalid Import',
                base_theme: 'forge',
                tokens: { font: 'not-a-font' },
            },
        })

        await harness.library.importTheme()

        expect(harness.persistPreferences).not.toHaveBeenCalled()
        expect(harness.persistence.localThemeError.value).toContain('rejected')
    })
})
