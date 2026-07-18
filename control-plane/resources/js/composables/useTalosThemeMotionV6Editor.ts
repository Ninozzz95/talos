import { computed, ref, watch, type Ref } from 'vue'
import {
    parseTalosMotionV6Preferences,
    type TalosInterfaceMotionCategories,
    type TalosInterfaceMotionPreferences,
    type TalosMotionV6Preferences,
} from '../motion-v6/contracts'
import { createDefaultTalosMotionV6Preferences } from '../motion-v6/defaults'
import {
    createTalosThemeMotionV6SaveDelta,
    resolveTalosThemeMotionV6Migration,
    type TalosThemeMotionV6MigrationSource,
} from '../motion-v6/migration'
import {
    resolveTalosMotionRuntimePolicy,
    type TalosMotionRuntimeDecision,
    type TalosMotionRuntimeEnvironment,
} from '../motion-v6/runtimePolicy'
import type { TalosWorkspaceSettings, UpdateTalosSettingsPayload } from './useTalosSettings'
import { useTalosMotionEnvironment } from './useTalosMotionEnvironment'

type TopLevelKey = Exclude<keyof TalosMotionV6Preferences, 'schema_version' | 'interface'>
type InterfaceKey = Exclude<keyof TalosInterfaceMotionPreferences, 'categories'>

export type TalosThemeMotionV6EditorOptions = {
    settings: Ref<TalosWorkspaceSettings | null>
    updateSettings: (payload: UpdateTalosSettingsPayload, message?: string) => Promise<TalosWorkspaceSettings>
    onSettingsChanged?: (settings: TalosWorkspaceSettings) => void
    environment?: () => TalosMotionRuntimeEnvironment
}

function clonePreferences(value: TalosMotionV6Preferences): TalosMotionV6Preferences {
    return {
        ...value,
        interface: {
            ...value.interface,
            categories: { ...value.interface.categories },
        },
    }
}

function failClosedPreferences(): TalosMotionV6Preferences {
    const fallback = createDefaultTalosMotionV6Preferences()
    fallback.mode = 'static'
    fallback.interface_enabled = false
    fallback.interface.profile = 'off'
    return fallback
}

function messageFor(error: unknown): string {
    return error instanceof Error && error.message.trim() !== ''
        ? error.message
        : 'TALOS could not save motion settings.'
}

export function useTalosThemeMotionV6Editor(options: TalosThemeMotionV6EditorOptions) {
    const motionEnvironment = options.environment === undefined
        ? useTalosMotionEnvironment()
        : null
    const initial = createDefaultTalosMotionV6Preferences()
    const draft = ref<TalosMotionV6Preferences>(clonePreferences(initial))
    const lastKnownGood = ref<TalosMotionV6Preferences>(clonePreferences(initial))
    const failedDraft = ref<TalosMotionV6Preferences | null>(null)
    const source = ref<TalosThemeMotionV6MigrationSource>('default')
    const error = ref('')
    const saving = ref(false)
    const saveRevision = ref(0)
    let activeSaveRevision = 0

    const dirty = computed(() => JSON.stringify(draft.value) !== JSON.stringify(lastKnownGood.value))
    const canRetry = computed(() => failedDraft.value !== null && !saving.value)
    const runtimeDecision = computed<TalosMotionRuntimeDecision>(() => resolveTalosMotionRuntimePolicy(
        draft.value,
        options.environment?.() ?? {
            workspaceBackgroundAllowed: true,
            workspaceInterfaceMotionAllowed: true,
            prefersReducedMotion: motionEnvironment?.prefersReducedMotion.value ?? false,
            documentHidden: motionEnvironment?.documentHidden.value ?? false,
            saveData: motionEnvironment?.lowPower.value ?? false,
            rendererFault: false,
            failedEffectiveMode: null,
            frameP95Ms: null,
            frameSampleSufficient: false,
        },
    ))

    function syncFromSettings(snapshot: TalosWorkspaceSettings | null = options.settings.value) {
        const result = resolveTalosThemeMotionV6Migration(snapshot?.preferences ?? {})
        if (!result.success) {
            const fallback = failClosedPreferences()
            draft.value = clonePreferences(fallback)
            lastKnownGood.value = clonePreferences(fallback)
            failedDraft.value = null
            source.value = 'default'
            error.value = result.issues[0]?.message ?? 'Stored motion settings are invalid.'
            return
        }

        draft.value = clonePreferences(result.value)
        lastKnownGood.value = clonePreferences(result.value)
        failedDraft.value = null
        source.value = result.source
        error.value = ''
    }

    function replaceDraft(candidate: TalosMotionV6Preferences) {
        const parsed = parseTalosMotionV6Preferences(candidate)
        if (!parsed.success) {
            throw new TypeError(parsed.issues[0]?.message ?? 'Invalid motion draft.')
        }
        draft.value = clonePreferences(parsed.value)
        error.value = ''
    }

    function updateTopLevel<K extends TopLevelKey>(key: K, value: TalosMotionV6Preferences[K]) {
        const candidate = clonePreferences(draft.value)
        ;(candidate as unknown as Record<TopLevelKey, unknown>)[key] = value
        replaceDraft(candidate)
    }

    function updateInterface<K extends InterfaceKey>(key: K, value: TalosInterfaceMotionPreferences[K]) {
        const candidate = clonePreferences(draft.value)
        ;(candidate.interface as unknown as Record<InterfaceKey, unknown>)[key] = value
        replaceDraft(candidate)
    }

    function updateCategory<K extends keyof TalosInterfaceMotionCategories>(
        key: K,
        value: TalosInterfaceMotionCategories[K],
    ) {
        const candidate = clonePreferences(draft.value)
        candidate.interface.categories[key] = value
        replaceDraft(candidate)
    }

    function resetBackground() {
        const defaults = createDefaultTalosMotionV6Preferences()
        const candidate = clonePreferences(draft.value)
        for (const key of [
            'mode', 'background_enabled', 'scene_override', 'speed', 'intensity', 'glow_intensity', 'density', 'depth',
            'trails', 'contrast', 'parallax', 'quality', 'fps_cap', 'dpr_cap', 'pause_when_hidden',
            'respect_data_saver',
        ] as const) {
            ;(candidate as unknown as Record<string, unknown>)[key] = defaults[key]
        }
        replaceDraft(candidate)
    }

    function resetInterface() {
        const defaults = createDefaultTalosMotionV6Preferences()
        const candidate = clonePreferences(draft.value)
        candidate.interface_enabled = defaults.interface_enabled
        candidate.interface = {
            ...defaults.interface,
            categories: { ...defaults.interface.categories },
        }
        replaceDraft(candidate)
    }

    function resetAll() {
        replaceDraft(createDefaultTalosMotionV6Preferences())
    }

    async function save(): Promise<boolean> {
        const candidate = clonePreferences(draft.value)
        const revision = saveRevision.value + 1
        saveRevision.value = revision
        activeSaveRevision = revision
        saving.value = true
        error.value = ''

        try {
            const delta = createTalosThemeMotionV6SaveDelta(candidate)
            const response = await options.updateSettings({ preferences: delta }, 'Motion settings saved.')
            if (revision !== activeSaveRevision) return true
            const parsed = parseTalosMotionV6Preferences(response.preferences?.theme_motion_v6)
            if (!parsed.success) {
                throw new TypeError('The settings API returned an invalid Motion V6 payload.')
            }
            lastKnownGood.value = clonePreferences(parsed.value)
            draft.value = clonePreferences(parsed.value)
            failedDraft.value = null
            source.value = 'v6'
            options.onSettingsChanged?.(response)
            return true
        } catch (cause) {
            if (revision !== activeSaveRevision) return false
            failedDraft.value = candidate
            draft.value = clonePreferences(lastKnownGood.value)
            error.value = messageFor(cause)
            return false
        } finally {
            if (revision === activeSaveRevision) saving.value = false
        }
    }

    async function retry(): Promise<boolean> {
        if (!failedDraft.value || saving.value) return false
        draft.value = clonePreferences(failedDraft.value)
        failedDraft.value = null
        return save()
    }

    syncFromSettings()
    watch(options.settings, (snapshot) => {
        if (saving.value) return
        if (!dirty.value) {
            syncFromSettings(snapshot)
            return
        }

        const result = resolveTalosThemeMotionV6Migration(snapshot?.preferences ?? {})
        if (!result.success) {
            error.value = result.issues[0]?.message ?? 'Stored motion settings are invalid.'
            return
        }

        const serverChangedMotion = JSON.stringify(result.value) !== JSON.stringify(lastKnownGood.value)
        lastKnownGood.value = clonePreferences(result.value)
        source.value = result.source
        failedDraft.value = null
        error.value = serverChangedMotion
            ? 'Motion settings changed in another settings surface. Your unsaved draft was preserved; review it before saving.'
            : ''
    })

    return {
        draft,
        lastKnownGood,
        source,
        error,
        saving,
        saveRevision,
        dirty,
        canRetry,
        runtimeDecision,
        syncFromSettings,
        replaceDraft,
        updateTopLevel,
        updateInterface,
        updateCategory,
        resetBackground,
        resetInterface,
        resetAll,
        save,
        retry,
    }
}
