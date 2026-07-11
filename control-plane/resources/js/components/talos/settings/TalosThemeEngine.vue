<script setup lang="ts">
import { onMounted, toRef } from 'vue'
import Card from '../../ui/Card.vue'
import Tabs from '../../ui/Tabs.vue'
import { useTalosSettings } from '../../../composables/useTalosSettings'
import { useTalosNamedThemeLibrary } from '../../../composables/useTalosNamedThemeLibrary'
import { useTalosThemeEditorPersistence } from '../../../composables/useTalosThemeEditorPersistence'
import { useTalosThemeEditorState, type TalosThemeEditorTab } from '../../../composables/useTalosThemeEditorState'
import { normalizeTalosTheme, TALOS_THEME_PRESETS, type TalosThemeCustomization, type TalosThemeId } from '../../../lib/talosThemes'
import TalosThemeAdvanced from './theme-engine/TalosThemeAdvanced.vue'
import TalosThemeCustomize from './theme-engine/TalosThemeCustomize.vue'
import TalosThemeLibrary from './theme-engine/TalosThemeLibrary.vue'
import TalosThemeMotion from './theme-engine/TalosThemeMotion.vue'
import TalosThemePresets from './theme-engine/TalosThemePresets.vue'

const props = defineProps<{
    theme: TalosThemeId
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
    onDraftChanged: emitThemeDraftChanged,
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
    persistence,
    emitChangeTheme,
    emitThemeDraftChanged: () => emitThemeDraftChanged(null),
})

const {
    activeTab,
    customizationForm,
    newThemeName,
    themeMode,
    motionMode,
    motionDisabled,
    simpleAnimation,
    backgroundDisabled,
    uiAnimationProfile,
    uiAnimationForm,
    motionPreviewOpen,
    motionPreviewStyle,
    selectedArea,
    areaTokenForm,
    chatLayout,
    activeTheme,
    activePreset,
    draftIsDirty,
    hasAreaDraft,
    activateTab,
    updateCustomizationForm,
    updateUiAnimationProfile,
    updateUiAnimationForm,
    updateChatLayout,
    previewMotion,
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
    setMotionMode,
    persistMotionMode,
    persistMotionDisabled,
    persistSimpleAnimation,
    persistBackgroundDisabled,
    saveAreaTokens,
    resetAreaTokens,
} = persistence
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

onMounted(async () => {
    const loaded = await loadSettings().catch(() => null)
    const loadedTheme = loaded?.preferences?.theme
    if (loadedTheme) emitChangeTheme(normalizeTalosTheme(loadedTheme), false)
    editor.syncFromSettings(loaded)
    editor.syncCustomizationForm()
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
            />

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
                :ui-animation-profile="uiAnimationProfile"
                :ui-animation-form="uiAnimationForm"
                :chat-layout="chatLayout"
                :new-theme-name="newThemeName"
                :disabled="themePolicyLocked"
                :saving="savingSettings"
                :draft-is-dirty="draftIsDirty"
                :motion-preview-open="motionPreviewOpen"
                :motion-preview-style="motionPreviewStyle"
                @update:customization="updateCustomizationForm"
                @update:ui-animation-profile="updateUiAnimationProfile"
                @update:ui-animation-form="updateUiAnimationForm"
                @update:chat-layout="updateChatLayout"
                @update:new-theme-name="newThemeName = $event"
                @preview-motion="previewMotion"
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
                :key="`motion-${themeControlRevision}`"
                :simple-animation="simpleAnimation"
                :motion-disabled="motionDisabled"
                :background-disabled="backgroundDisabled"
                :motion-mode="motionMode"
                :disabled="themePolicyLocked"
                :saving="savingSettings"
                @update:simple-animation="simpleAnimation = $event"
                @update:motion-disabled="motionDisabled = $event"
                @update:background-disabled="backgroundDisabled = $event"
                @update:motion-mode="setMotionMode"
                @persist-simple-animation="persistSimpleAnimation"
                @persist-motion-disabled="persistMotionDisabled"
                @persist-background-disabled="persistBackgroundDisabled"
                @persist-motion-mode="persistMotionMode"
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
