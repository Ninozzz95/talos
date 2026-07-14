<script setup lang="ts">
import { onMounted, toRef, watch } from 'vue'
import Card from '../../ui/Card.vue'
import Tabs from '../../ui/Tabs.vue'
import TalosGuideInfoButton from '../guide/TalosGuideInfoButton.vue'
import { useTalosSettings } from '../../../composables/useTalosSettings'
import { useTalosNamedThemeLibrary } from '../../../composables/useTalosNamedThemeLibrary'
import { useTalosThemeEditorPersistence } from '../../../composables/useTalosThemeEditorPersistence'
import { normalizeTalosThemeEditorTab, useTalosThemeEditorState, type TalosThemeEditorTab } from '../../../composables/useTalosThemeEditorState'
import { useTalosThemeMotionV6Editor } from '../../../composables/useTalosThemeMotionV6Editor'
import { normalizeTalosTheme, TALOS_THEME_PRESETS, type TalosThemeCustomization, type TalosThemeId } from '../../../lib/talosThemes'
import TalosThemeAdvanced from './theme-engine/TalosThemeAdvanced.vue'
import TalosThemeCustomize from './theme-engine/TalosThemeCustomize.vue'
import TalosThemeLibrary from './theme-engine/TalosThemeLibrary.vue'
import TalosThemeMotion from './theme-engine/TalosThemeMotion.vue'
import TalosThemePresets from './theme-engine/TalosThemePresets.vue'

const props = defineProps<{
    theme: TalosThemeId
    initialTab?: TalosThemeEditorTab | string
}>()

const emit = defineEmits<{
    changeTheme: [theme: TalosThemeId, persist?: boolean]
    themeCustomizationChanged: [settings?: { preferences?: Record<string, unknown> }]
    themeDraftChanged: [customization: TalosThemeCustomization | null]
}>()

type ThemeTab = TalosThemeEditorTab

const themeTabs = [
    { id: 'presets', label: 'Presets' },
    { id: 'customize', label: 'Customize' },
    { id: 'library', label: 'Library' },
    { id: 'motion', label: 'Motion' },
    { id: 'advanced', label: 'Advanced' },
] as const

const {
    settings,
    settingsError,
    settingsSavedMessage,
    savingSettings,
    loadSettings,
    updateSettings,
} = useTalosSettings()
const theme = toRef(props, 'theme')
const emitChangeTheme = (nextTheme: TalosThemeId, persist?: boolean) => emit('changeTheme', nextTheme, persist)
const emitThemeCustomizationChanged = (nextSettings: { preferences?: Record<string, unknown> }) => emit('themeCustomizationChanged', nextSettings)
const emitThemeDraftChanged = (customization: TalosThemeCustomization | null) => emit('themeDraftChanged', customization)

const editor = useTalosThemeEditorState({
    theme,
    settings,
    initialTab: props.initialTab,
    onDraftChanged: emitThemeDraftChanged,
})
const motionV6 = useTalosThemeMotionV6Editor({
    settings,
    updateSettings,
    onSettingsChanged: emitThemeCustomizationChanged,
})
const persistence = useTalosThemeEditorPersistence({
    theme,
    settings,
    editor,
    updateSettings,
    emitChangeTheme,
    emitThemeCustomizationChanged,
    emitThemeDraftChanged,
})
const library = useTalosNamedThemeLibrary({
    theme,
    settings,
    editor,
    motionV6,
    persistence,
    emitChangeTheme,
    emitThemeDraftChanged: () => emitThemeDraftChanged(null),
})

const {
    activeTab,
    customizationForm,
    newThemeName,
    themeMode,
    selectedArea,
    areaTokenForm,
    chatLayout,
    activeTheme,
    activePreset,
    draftIsDirty,
    hasAreaDraft,
    activateTab,
    updateCustomizationForm,
    updateChatLayout,
} = editor
const {
    localThemeError,
    themeControlRevision,
    themePolicyLocked,
    chooseTheme,
    saveCustomization,
    discardChanges,
    resetToPreset,
    resetCustomization,
    updateAndPersistThemeMode,
    saveAreaTokens,
    resetAreaTokens,
} = persistence
const {
    draft: motionV6Draft,
    source: motionV6Source,
    error: motionV6Error,
    saving: motionV6Saving,
    dirty: motionV6Dirty,
    canRetry: motionV6CanRetry,
    runtimeDecision: motionV6RuntimeDecision,
    replaceDraft: replaceMotionV6Draft,
    resetBackground: resetMotionV6Background,
    resetInterface: resetMotionV6Interface,
    resetAll: resetMotionV6All,
    save: saveMotionV6,
    retry: retryMotionV6,
} = motionV6
const {
    themeLibrary,
    activeCustomThemeId,
    renamingThemeId,
    renameThemeName,
    exportJson,
    importJson,
    exportFeedback,
    pendingDeleteThemeId,
    exportActiveTheme,
    copyExport,
    downloadExport,
    importTheme,
    applyNamedTheme,
    startRename,
    saveRename,
    duplicateTheme,
    requestDeleteTheme,
    confirmDeleteTheme,
    cancelDeleteTheme,
    saveAsNamedTheme,
} = library

watch(() => props.initialTab, (tab) => {
    if (tab) activateTab(normalizeTalosThemeEditorTab(tab))
})

onMounted(async () => {
    const loaded = await loadSettings().catch(() => null)
    const loadedTheme = loaded?.preferences?.theme
    if (loadedTheme) emitChangeTheme(normalizeTalosTheme(loadedTheme), false)
    editor.syncFromSettings(loaded)
    editor.syncCustomizationForm()
    motionV6.syncFromSettings(loaded)
    library.syncFromSettings(loaded)
})
</script>

<template>
    <Card>
        <div class="flex flex-col gap-4">
            <div>
                <h3 class="text-base font-semibold text-[var(--talos-text)]">Theme Engine</h3>
                <p class="mt-1 text-sm leading-6 text-[var(--talos-muted)]">Presets, custom themes, motion and area tokens are persisted through the TALOS settings API.</p>
            </div>

            <div v-if="settingsError || localThemeError || settingsSavedMessage || themePolicyLocked" class="sticky top-0 z-20 grid gap-2 bg-[var(--talos-card)]/95 py-1 backdrop-blur" role="status" aria-live="polite">
                <div v-if="settingsError" class="rounded-md border border-[var(--talos-warning-border)] bg-[var(--talos-warning-soft)] px-3 py-2 text-sm text-[var(--talos-text)]">{{ settingsError }}</div>
                <div v-if="localThemeError" class="rounded-md border border-[var(--talos-warning-border)] bg-[var(--talos-warning-soft)] px-3 py-2 text-sm text-[var(--talos-text)]">{{ localThemeError }}</div>
                <div v-if="settingsSavedMessage" class="rounded-md border border-[var(--talos-success-border)] bg-[var(--talos-success-soft)] px-3 py-2 text-sm text-[var(--talos-text)]">{{ settingsSavedMessage }}</div>
                <div v-if="themePolicyLocked" class="rounded-md border border-[var(--talos-warning-border)] bg-[var(--talos-warning-soft)] px-3 py-2 text-sm text-[var(--talos-text)]">Theme changes are locked by workspace policy.</div>
            </div>

            <Tabs
                :model-value="activeTab"
                :items="themeTabs"
                label="Theme controls"
                tab-id-prefix="talos-theme-control-tab"
                panel-id-prefix="talos-theme-control-panel"
                @update:model-value="activateTab($event as ThemeTab)"
            >
                <template #item-action="{ item }">
                    <TalosGuideInfoButton
                        :guide-id="`theme.${item.id}`"
                        compact
                        side="bottom"
                    />
                </template>
            </Tabs>

            <!-- Existing automation expects data-testid="talos-theme-preset" on every preset trigger; ownership lives in TalosThemePresets. -->
            <TalosThemePresets
                v-if="activeTab === 'presets'"
                :key="`presets-${themeControlRevision}`"
                :theme="activeTheme"
                :theme-mode="themeMode"
                :presets="TALOS_THEME_PRESETS"
                :disabled="themePolicyLocked"
                :saving="savingSettings"
                @select-theme="chooseTheme"
                @update:theme-mode="updateAndPersistThemeMode"
            />
            <TalosThemeCustomize
                v-else-if="activeTab === 'customize'"
                :preset="activePreset"
                :customization="customizationForm"
                :chat-layout="chatLayout"
                :new-theme-name="newThemeName"
                :disabled="themePolicyLocked"
                :saving="savingSettings"
                :draft-is-dirty="draftIsDirty"
                @update:customization="updateCustomizationForm"
                @update:chat-layout="updateChatLayout"
                @update:new-theme-name="newThemeName = $event"
                @save-customization="saveCustomization"
                @save-as-theme="saveAsNamedTheme"
                @create-theme="saveAsNamedTheme"
                @discard-changes="discardChanges"
                @reset-to-preset="resetToPreset"
                @reset-customization="resetCustomization"
            />
            <TalosThemeLibrary
                v-else-if="activeTab === 'library'"
                :library="themeLibrary"
                :active-custom-theme-id="activeCustomThemeId"
                :renaming-theme-id="renamingThemeId"
                :rename-theme-name="renameThemeName"
                :export-json="exportJson"
                :import-json="importJson"
                :delete-theme-id="pendingDeleteThemeId"
                :export-feedback="exportFeedback"
                :disabled="themePolicyLocked"
                :saving="savingSettings"
                @export="exportActiveTheme"
                @copy="copyExport"
                @download="downloadExport"
                @update:import-json="importJson = $event"
                @import="importTheme"
                @apply="applyNamedTheme"
                @rename="startRename"
                @update:rename-theme-name="renameThemeName = $event"
                @save-rename="saveRename"
                @duplicate="duplicateTheme"
                @request-delete="requestDeleteTheme"
                @confirm-delete="confirmDeleteTheme"
                @cancel-delete="cancelDeleteTheme"
            />
            <TalosThemeMotion
                v-else-if="activeTab === 'motion'"
                :model-value="motionV6Draft"
                :theme="activeTheme"
                :runtime-decision="motionV6RuntimeDecision"
                :source="motionV6Source"
                :dirty="motionV6Dirty"
                :error="motionV6Error"
                :can-retry="motionV6CanRetry"
                :disabled="themePolicyLocked"
                :saving="savingSettings || motionV6Saving"
                @update:model-value="replaceMotionV6Draft"
                @save="saveMotionV6"
                @retry="retryMotionV6"
                @reset-background="resetMotionV6Background"
                @reset-interface="resetMotionV6Interface"
                @reset-all="resetMotionV6All"
            />
            <TalosThemeAdvanced
                v-else
                :selected-area="selectedArea"
                :form="areaTokenForm"
                :disabled="themePolicyLocked"
                :saving="savingSettings"
                :has-draft="hasAreaDraft"
                @update:selected-area="selectedArea = $event"
                @update:form="areaTokenForm = $event"
                @save="saveAreaTokens"
                @reset="resetAreaTokens"
            />
        </div>
    </Card>
</template>
