import { computed, ref, type Ref } from 'vue'
import {
    buildTalosThemeExport,
    normalizeTalosTheme,
    sanitizeTalosNamedTheme,
    sanitizeTalosThemeAreaTokens,
    sanitizeTalosThemeLibrary,
    type TalosNamedTheme,
    type TalosThemeId,
} from '../lib/talosThemes'
import { sanitizeTalosChatLayout } from '../lib/talosChatLayout'
import {
    applyTalosNamedThemePreferences,
    inspectStrictTalosThemeImport,
    resetTalosThemePreferences,
} from '../components/talos/settings/theme-engine/themeEngineState'
import type { TalosWorkspaceSettings } from './useTalosSettings'
import type { TalosThemeEditorPersistence } from './useTalosThemeEditorPersistence'
import type { TalosThemeEditorState } from './useTalosThemeEditorState'
import type { useTalosThemeMotionV6Editor } from './useTalosThemeMotionV6Editor'
import {
    createTalosThemeMotionV6SaveDelta,
    resolveTalosThemeMotionV6Migration,
} from '../motion-v6/migration'

export type TalosNamedThemeLibraryOptions = {
    theme: Ref<TalosThemeId>
    settings: Ref<TalosWorkspaceSettings | null>
    editor: TalosThemeEditorState
    motionV6: ReturnType<typeof useTalosThemeMotionV6Editor>
    persistence: TalosThemeEditorPersistence
    emitChangeTheme: (theme: TalosThemeId, persist?: boolean) => void
    emitThemeDraftChanged: (customization: null) => void
}

export type TalosNamedThemeLibrary = ReturnType<typeof useTalosNamedThemeLibrary>

const NAMED_THEME_APPLY_KEYS = [
    'theme',
    'theme_mode',
    'theme_customization',
    'theme_area_tokens',
    'theme_motion_v6',
    'active_custom_theme_id',
    'chat_layout',
    'workspace_default_theme',
] as const

function namedThemeDelta(
    preferences: Record<string, unknown>,
    themeLibrary?: TalosNamedTheme[],
): Record<string, unknown> {
    const delta: Record<string, unknown> = {}
    for (const key of NAMED_THEME_APPLY_KEYS) {
        if (Object.prototype.hasOwnProperty.call(preferences, key)) delta[key] = preferences[key]
    }
    if (themeLibrary) delta.theme_library = themeLibrary
    return delta
}

export function useTalosNamedThemeLibrary(options: TalosNamedThemeLibraryOptions) {
    const themeLibrary = ref<TalosNamedTheme[]>([])
    const activeCustomThemeId = ref<string | null>(null)
    const renamingThemeId = ref<string | null>(null)
    const renameThemeName = ref('')
    const exportJson = ref('')
    const importJson = ref('')
    const exportFeedback = ref('')
    const pendingDeleteThemeId = ref<string | null>(null)

    const activeNamedTheme = computed(() => themeLibrary.value.find((theme) => theme.id === activeCustomThemeId.value) ?? null)
    const pendingDeleteTheme = computed(() => themeLibrary.value.find((theme) => theme.id === pendingDeleteThemeId.value) ?? null)

    function setError(message: string) {
        options.persistence.localThemeError.value = message
    }

    function generateThemeId(name: string) {
        const slug = name.trim().toLowerCase().replace(/[^a-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 42) || 'theme'
        return `${slug}-${Date.now().toString(36)}`
    }

    function syncFromSettings(snapshot?: TalosWorkspaceSettings | null) {
        const source = snapshot ?? options.settings.value
        const preferences = source?.preferences ?? options.persistence.preferencesRecord()
        themeLibrary.value = sanitizeTalosThemeLibrary(preferences.theme_library)
        activeCustomThemeId.value = typeof preferences.active_custom_theme_id === 'string' ? preferences.active_custom_theme_id : null
    }

    function currentNamedTheme(name: string, id = generateThemeId(name)): TalosNamedTheme {
        const now = new Date().toISOString()
        return {
            id,
            name: name.trim().slice(0, 80),
            base_theme: options.editor.activeTheme.value,
            theme_mode: options.editor.themeMode.value,
            tokens: options.editor.sanitizedForm(),
            area_tokens: sanitizeTalosThemeAreaTokens(options.editor.areaTokens.value),
            motion_v6: createTalosThemeMotionV6SaveDelta(options.motionV6.draft.value).theme_motion_v6,
            chat_layout: sanitizeTalosChatLayout(options.editor.chatLayout.value),
            created_at: now,
            updated_at: now,
        }
    }

    async function saveAsNamedTheme() {
        if (!options.persistence.canWriteTheme()) return
        options.persistence.localThemeError.value = ''
        const name = options.editor.newThemeName.value.trim()
        if (!name) {
            setError('Theme name is required.')
            return
        }

        const theme = currentNamedTheme(name)
        if (options.persistence.rejectUnsafeThemeState(theme.tokens, theme.base_theme, theme.area_tokens)) return

        const nextLibrary = [...themeLibrary.value, theme]
        const preferences = {
            ...applyTalosNamedThemePreferences({
                ...options.persistence.preferencesRecord(),
                theme_library: nextLibrary,
                workspace_default_theme: theme.base_theme,
            }, theme, {
                themeMode: options.editor.themeMode.value,
            }),
            workspace_default_theme: theme.base_theme,
        }
        await options.persistence.persistPreferences(namedThemeDelta(preferences, nextLibrary), 'Custom theme saved through /api/talos/settings.', { syncForm: true })
        themeLibrary.value = nextLibrary
        activeCustomThemeId.value = theme.id
        options.editor.newThemeName.value = ''
        options.editor.activateTab('library')
        options.emitThemeDraftChanged(null)
    }

    async function applyNamedTheme(theme: TalosNamedTheme) {
        if (!options.persistence.canWriteTheme()) return
        options.persistence.localThemeError.value = ''
        if (options.persistence.rejectUnsafeThemeState(theme.tokens, theme.base_theme, theme.area_tokens)) return

        const preferences = {
            ...applyTalosNamedThemePreferences(options.persistence.preferencesRecord(), theme, {
                themeMode: options.editor.themeMode.value,
            }),
            workspace_default_theme: theme.base_theme,
        }
        try {
            await options.persistence.persistPreferences(namedThemeDelta(preferences), 'Custom theme applied.', { syncForm: true })
            activeCustomThemeId.value = theme.id
            options.emitThemeDraftChanged(null)
            options.emitChangeTheme(theme.base_theme, false)
        } catch {
            // A named theme is visible as applied only after the settings ACK.
            options.persistence.bumpThemeControlRevision()
        }
    }

    function startRename(theme: TalosNamedTheme) {
        options.persistence.localThemeError.value = ''
        renamingThemeId.value = theme.id
        renameThemeName.value = theme.name
    }

    async function saveRename(theme: TalosNamedTheme) {
        if (!options.persistence.canWriteTheme()) return
        const name = renameThemeName.value.trim()
        if (!name) {
            setError('Theme name is required.')
            return
        }

        const nextLibrary = themeLibrary.value.map((item) => item.id === theme.id
            ? { ...item, name, updated_at: new Date().toISOString() }
            : item)
        await options.persistence.persistPreferences({ theme_library: nextLibrary }, 'Theme renamed.')
        themeLibrary.value = nextLibrary
        options.persistence.localThemeError.value = ''
        renamingThemeId.value = null
    }

    async function duplicateTheme(theme: TalosNamedTheme) {
        if (!options.persistence.canWriteTheme()) return
        let migratedMotion
        if (theme.motion_v6) {
            try {
                migratedMotion = createTalosThemeMotionV6SaveDelta(theme.motion_v6).theme_motion_v6
            } catch {
                setError('TALOS rejected the saved theme motion payload.')
                return
            }
        } else {
            const migration = resolveTalosThemeMotionV6Migration({
                theme_motion: theme.motion,
                ui_animation_profile: theme.ui_animation_profile,
                ui_animation_customization: theme.ui_animation_customization,
            })
            if (!migration.success) {
                setError('TALOS could not migrate the saved theme motion payload.')
                return
            }
            migratedMotion = migration.value
        }
        const {
            motion: _legacyMotion,
            ui_animation_profile: _legacyUiProfile,
            ui_animation_customization: _legacyUiCustomization,
            ...canonicalTheme
        } = theme
        const duplicate = sanitizeTalosNamedTheme({
            ...canonicalTheme,
            motion_v6: migratedMotion,
            id: generateThemeId(`${theme.name} copy`),
            name: `${theme.name} copy`,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
        })
        if (!duplicate) return
        const nextLibrary = [...themeLibrary.value, duplicate]
        await options.persistence.persistPreferences({ theme_library: nextLibrary }, 'Theme duplicated.')
        themeLibrary.value = nextLibrary
    }

    function requestDeleteTheme(theme: TalosNamedTheme) {
        pendingDeleteThemeId.value = theme.id
    }

    function cancelDeleteTheme() {
        pendingDeleteThemeId.value = null
    }

    async function confirmDeleteTheme() {
        if (!options.persistence.canWriteTheme() || !pendingDeleteTheme.value) return
        const theme = pendingDeleteTheme.value
        const nextLibrary = themeLibrary.value.filter((item) => item.id !== theme.id)
        const isActive = activeCustomThemeId.value === theme.id
        const resetPreferences = isActive
            ? resetTalosThemePreferences(options.persistence.preferencesRecord())
            : null
        const preferences = isActive
            ? namedThemeDelta(resetPreferences ?? {}, nextLibrary)
            : { theme_library: nextLibrary }

        await options.persistence.persistPreferences(preferences, 'Theme deleted.', { syncForm: isActive })
        themeLibrary.value = nextLibrary
        pendingDeleteThemeId.value = null
        if (isActive) {
            activeCustomThemeId.value = null
            options.emitChangeTheme(normalizeTalosTheme(preferences.theme ?? options.theme.value), false)
        }
    }

    function exportActiveTheme() {
        const theme = activeNamedTheme.value ?? currentNamedTheme(`${options.editor.activePreset.value.shortLabel} custom`, `current-${options.editor.activeTheme.value}`)
        exportJson.value = JSON.stringify(buildTalosThemeExport(theme), null, 2)
        exportFeedback.value = ''
    }

    function setExportFeedback(message: string) {
        exportFeedback.value = message
        window.setTimeout(() => {
            if (exportFeedback.value === message) exportFeedback.value = ''
        }, 6000)
    }

    async function copyExport() {
        if (!exportJson.value) return
        let helper: HTMLTextAreaElement | null = null
        try {
            if (navigator.clipboard?.writeText) {
                await navigator.clipboard.writeText(exportJson.value)
            } else {
                helper = document.createElement('textarea')
                helper.value = exportJson.value
                helper.setAttribute('readonly', '')
                helper.style.position = 'fixed'
                helper.style.opacity = '0'
                document.body.append(helper)
                helper.select()
                if (!document.execCommand('copy')) throw new Error('copy unavailable')
            }
            setExportFeedback('Theme export copied.')
        } catch {
            setError('TALOS could not copy the theme export.')
        } finally {
            helper?.remove()
        }
    }

    function downloadExport() {
        if (!exportJson.value) return
        const url = URL.createObjectURL(new Blob([exportJson.value], { type: 'application/json' }))
        const link = document.createElement('a')
        link.href = url
        link.download = 'talos-theme.json'
        link.click()
        URL.revokeObjectURL(url)
        setExportFeedback('Theme export downloaded.')
    }

    async function importTheme() {
        if (!options.persistence.canWriteTheme()) return
        options.persistence.localThemeError.value = ''
        let parsed: unknown
        try {
            parsed = JSON.parse(importJson.value)
        } catch {
            setError('TALOS rejected this theme import.')
            return
        }

        const importResult = inspectStrictTalosThemeImport(parsed)
        if (!importResult.theme) {
            setError(importResult.error ?? 'TALOS rejected this theme import.')
            return
        }
        const theme = importResult.theme
        if (themeLibrary.value.some((item) => item.id === theme.id)) {
            setError('A theme with this ID already exists. Rename or delete it before importing.')
            return
        }

        const nextLibrary = [...themeLibrary.value, theme]
        const preferences = {
            ...applyTalosNamedThemePreferences({
                ...options.persistence.preferencesRecord(),
                theme_library: nextLibrary,
            }, theme, {
                themeMode: options.editor.themeMode.value,
            }),
            workspace_default_theme: theme.base_theme,
        }
        await options.persistence.persistPreferences(namedThemeDelta(preferences, nextLibrary), 'Theme imported.', { syncForm: true })
        themeLibrary.value = nextLibrary
        activeCustomThemeId.value = theme.id
        importJson.value = ''
        options.editor.activateTab('library')
        options.emitChangeTheme(theme.base_theme, false)
        options.emitThemeDraftChanged(null)
    }

    syncFromSettings()

    return {
        themeLibrary,
        activeCustomThemeId,
        activeNamedTheme,
        newThemeName: options.editor.newThemeName,
        renamingThemeId,
        renameThemeName,
        exportJson,
        importJson,
        exportFeedback,
        pendingDeleteThemeId,
        pendingDeleteTheme,
        syncFromSettings,
        currentNamedTheme,
        saveAsNamedTheme,
        applyNamedTheme,
        startRename,
        saveRename,
        duplicateTheme,
        requestDeleteTheme,
        cancelDeleteTheme,
        confirmDeleteTheme,
        exportActiveTheme,
        copyExport,
        downloadExport,
        importTheme,
    }
}
