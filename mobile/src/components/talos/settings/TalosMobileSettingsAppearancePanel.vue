<script setup lang="ts">
import { computed, ref } from 'vue'
import { useTalosI18n } from '@/i18n'
import { RotateCcw, SlidersHorizontal } from '@lucide/vue'
import { TabsContent } from 'reka-ui'
import TalosThemedSelect from '@/components/talos/ui/TalosThemedSelect.vue'
import TalosThemedSwitch from '@/components/talos/ui/TalosThemedSwitch.vue'
import TalosThemedTabs from '@/components/talos/ui/TalosThemedTabs.vue'
import {
    TALOS_THEME_PRESETS,
    type TalosThemeId,
    type TalosThemeMode,
} from '@/lib/talosThemes'
import {
    TALOS_THEME_MODE_OPTIONS,
} from '@/lib/talosThemeOptions'
import {
    TALOS_CHAT_BUBBLE_SCALE_OPTIONS,
    TALOS_CHAT_MESSAGE_STYLE_OPTIONS,
    TALOS_MOBILE_WINDOW_PRESENTATION_OPTIONS,
} from '@/lib/talosChatLayout'
import {
    TALOS_INTERFACE_EASINGS,
    TALOS_INTERFACE_PROFILES,
    TALOS_MOTION_QUALITY_LEVELS,
    TALOS_MOTION_RENDERER_MODES,
    TALOS_MOTION_SCENE_IDS,
    type TalosMotionSceneId,
} from '@/motion-v6/contracts'
import type { TalosFontScale } from '@/lib/talosFontScale'
import { TALOS_FONT_SCALE_OPTIONS } from '@/lib/talosFontScaleOptions'
import { useSettingsStore, type TalosMotionPreferencePatch } from '@/stores/settings'
import {
    TALOS_COMPOSER_PLUS_SURFACES,
    TALOS_COMPOSER_SHAPES,
    talosComposerHasPlus,
    talosComposerPlusExists,
    talosComposerShapeExists,
} from '@/lib/composerStyle'
import { useThemeStore } from '@/stores/theme'
import { talosRememberView, talosRememberedView } from '@/lib/navigation/rememberedView'

const theme = useThemeStore()
const settings = useSettingsStore()
const { t } = useTalosI18n()

const themeItems = computed(() => TALOS_THEME_PRESETS.map((preset) => ({
    value: preset.id,
    label: t(`appearance.themeLabels.${preset.id}`),
})))
/**
 * Owner 2026-08-23: "posso mettere lo sfondo di terminal anche su calma" — the
 * scene id and the color palette were already independent in
 * `resolveTalosWorkspaceMotionV6` (`scene_override ?? themeId` picks the scene,
 * `identity.semantic_palette` always comes from the active theme regardless).
 * The names are shared with `themeItems` on purpose: fourteen scenes, fourteen
 * theme ids, same set — reusing `themeLabels` keeps one name per scene instead
 * of inventing a second vocabulary for the same fourteen things.
 */
const sceneOverrideItems = computed(() => TALOS_MOTION_SCENE_IDS.map((id) => ({
    value: id,
    label: t(`appearance.themeLabels.${id}`),
})))
const modeItems = computed(() => TALOS_THEME_MODE_OPTIONS.map((mode) => ({
    value: mode.value,
    label: t(`appearance.themeModes.${mode.value}`),
})))
const rendererItems = computed(() => TALOS_MOTION_RENDERER_MODES.map((mode) => ({
    value: mode,
    label: t(`appearance.rendererModes.${mode}`),
})))
const qualityItems = computed(() => TALOS_MOTION_QUALITY_LEVELS.map((quality) => ({
    value: quality,
    label: t(`appearance.qualityLevels.${quality}`),
})))
const interfaceProfileItems = computed(() => TALOS_INTERFACE_PROFILES.map((profile) => ({
    value: profile,
    label: t(`appearance.interfaceProfiles.${profile}`),
})))
const easingItems = computed(() => TALOS_INTERFACE_EASINGS.map((easing) => ({
    value: easing,
    label: t(`appearance.easings.${easing}`),
})))
const messageStyleItems = computed(() => TALOS_CHAT_MESSAGE_STYLE_OPTIONS.map((option) => ({
    value: option.value,
    label: t(`appearance.messageStyles.${option.value}`),
})))
const fontScaleItems = computed(() => TALOS_FONT_SCALE_OPTIONS.map((option) => ({
    value: option.value,
    label: t(`appearance.fontScales.${option.value}`),
})))
const bubbleScaleItems = computed(() => TALOS_CHAT_BUBBLE_SCALE_OPTIONS.map((option) => ({
    value: option.value,
    label: t(`appearance.bubbleScales.${option.value}`),
})))
const windowPresentationItems = computed(() => TALOS_MOBILE_WINDOW_PRESENTATION_OPTIONS.map((option) => ({
    value: option.value,
    label: t(`appearance.windowModes.${option.value}`),
})))

const composerShapeItems = computed(() => TALOS_COMPOSER_SHAPES.map((shape) => ({
    value: shape,
    label: t(`appearance.composerShapes.${shape}`),
})))
const composerPlusItems = computed(() => TALOS_COMPOSER_PLUS_SURFACES.map((surface) => ({
    value: surface,
    label: t(`appearance.composerPlusSurfaces.${surface}`),
})))

/**
 * The classic bar has no "+" at all — attach, context and Browse are already on
 * it — so the surface setting has nothing to decide there. Offered but inert,
 * with the reason written beside it, rather than a live-looking control that
 * does nothing.
 */
const composerPlusApplies = computed(() => talosComposerHasPlus(settings.state.shell.composer_shape))

/**
 * Narrowed by the module's own guards rather than cast. A select can only emit
 * what it was given, right up until someone edits the item list and not this.
 */
function setComposerShape(value: string): void {
    if (!talosComposerShapeExists(value)) return
    void settings.setShell({ composer_shape: value })
}

function setComposerPlus(value: string): void {
    if (!talosComposerPlusExists(value)) return
    void settings.setShell({ composer_plus: value })
}

const activePreset = computed(() => TALOS_THEME_PRESETS.find((preset) => preset.id === theme.state.theme) ?? TALOS_THEME_PRESETS[0])
const activePresetLabel = computed(() => t(`appearance.themeLabels.${activePreset.value.id}`))
const activePresetDescription = computed(() => t(`appearance.themeDescriptions.${activePreset.value.id}`))

function changeTheme(value: string): void {
    void theme.setTheme(value as TalosThemeId)
}

function changeMode(value: string): void {
    void theme.setMode(value as TalosThemeMode)
}

/**
 * `TalosThemedSelect`'s built-in "none" slot emits `''`, not `null` — the same
 * idiom `composerPlus`'s disabled state and others already use. `''` here means
 * "no override": the runtime falls back to the active theme's own scene.
 */
function setSceneOverride(value: string): void {
    void settings.setMotionPreferences({ scene_override: value === '' ? null : value as TalosMotionSceneId })
}

function setChatLayout(key: 'bubble_scale' | 'composer_mode' | 'mobile_window_presentation' | 'message_style', value: string): void {
    void settings.setChatLayout({ [key]: value })
}



function setMotionSelect(key: 'mode' | 'quality', value: string): void {
    void settings.setMotionPreferences({ [key]: value } as TalosMotionPreferencePatch)
}

function setInterfaceSelect(key: 'profile' | 'easing', value: string): void {
    void settings.setMotionPreferences({ interface: { [key]: value } } as TalosMotionPreferencePatch)
}

function setMotionBoolean(key: 'background_enabled' | 'interface_enabled' | 'pause_when_hidden' | 'respect_data_saver', checked: boolean): void {
    const patch: TalosMotionPreferencePatch = { [key]: checked }
    // T6.5: enabling the background while the renderer mode is 'off' would be
    // a silent no-op — promote to 'simple' so the switch does what it says.
    if (key === 'background_enabled' && checked && settings.state.motion_v6.mode === 'off') {
        patch.mode = 'simple'
    }
    void settings.setMotionPreferences(patch)
}

function setMotionNumber(
    key: 'speed' | 'intensity' | 'glow_intensity' | 'density' | 'depth' | 'trails' | 'contrast' | 'parallax',
    event: Event,
): void {
    void settings.setMotionPreferences({ [key]: Number((event.target as HTMLInputElement).value) })
}

function setInterfaceNumber(key: 'duration_scale' | 'intensity' | 'stagger', event: Event): void {
    void settings.setMotionPreferences({ interface: { [key]: Number((event.target as HTMLInputElement).value) } })
}

function setInterfaceCategory(key: keyof typeof settings.state.motion_v6.interface.categories, checked: boolean): void {
    void settings.setMotionPreferences({ interface: { categories: { [key]: checked } } })
}

const streamingAnimations = computed(() => [
    { value: 'typewriter', label: t('appearance.animations.typewriter') },
    { value: 'fade', label: t('appearance.animations.fade') },
])
const motionControls = computed(() => [
    { key: 'speed', label: t('appearance.backgroundSpeed'), min: 25, max: 200 },
    { key: 'intensity', label: t('appearance.backgroundIntensity'), min: 0, max: 100 },
    { key: 'glow_intensity', label: t('appearance.glowIntensity'), min: 0, max: 100 },
    { key: 'density', label: t('appearance.sceneDensity'), min: 25, max: 150 },
    { key: 'depth', label: t('appearance.sceneDepth'), min: 0, max: 100 },
    { key: 'trails', label: t('appearance.trailPersistence'), min: 0, max: 100 },
    { key: 'contrast', label: t('appearance.sceneContrast'), min: 0, max: 100 },
    { key: 'parallax', label: t('appearance.parallax'), min: 0, max: 100 },
] as const)
const interfaceControls = computed(() => [
    { key: 'duration_scale', label: t('appearance.interfaceDuration'), min: 50, max: 150 },
    { key: 'intensity', label: t('appearance.interfaceIntensity'), min: 0, max: 100 },
    { key: 'stagger', label: t('appearance.interfaceStagger'), min: 0, max: 120 },
] as const)
const interfaceCategories = ['windows', 'surfaces', 'navigation', 'composer', 'messages', 'feedback'] as const

const selectLabelClass = 'text-xs font-semibold uppercase text-[var(--talos-muted)]'
const switchRowClass = 'flex min-h-14 cursor-pointer items-start justify-between gap-3 border-t border-[var(--talos-border)] py-3'
const rangeClass = 'mt-2 h-2 w-full cursor-pointer accent-[var(--talos-accent)]'

/**
 * The section list, its order, its default, the swipe that steps through it and
 * the ARIA it needs are no longer written here: they come from the register, via
 * the shared strip. What is left is the one thing that is genuinely this
 * screen's — where the answer is kept.
 *
 * Reopening on the section you left is new. Before this, Appearance always came
 * back on Design, so someone tuning Motion paid for the trip every time.
 */
const activeSection = ref<string>(talosRememberedView('appearance') ?? 'design')

function chooseSection(section: string): void {
    activeSection.value = section
    talosRememberView('appearance', section)
}

/**
 * Owner 2026-07-24: the section tabs stay PINNED while the panel scrolls. The
 * swipe that used to live beside this now belongs to the shared strip; pinning
 * is layout, so it stays with the screen.
 *
 * `sticky` overrides the strip's own `relative` because Tailwind emits the
 * position utilities in a fixed order and sticky is the later one — and sticky
 * establishes the containing block the indicator needs just as well, so nothing
 * else has to change. Kept here rather than as a template comment: a comment
 * beside the root element makes the component a fragment, and then a pointer
 * event dispatched at the component root lands on the comment instead of on the
 * strip. Which is exactly how the swipe test caught it.
 */
const stickyListClass = 'sticky top-0 z-10 -mx-4 bg-[var(--talos-window-bg,var(--talos-background))] px-4 pb-2 pt-3'
</script>

<template>
    <TalosThemedTabs
        surface="appearance"
        :model-value="activeSection"
        :aria-label="t('appearance.sectionsLabel')"
        :list-class="stickyListClass"
        @update:model-value="chooseSection"
    >
        <TabsContent
            value="design"
            data-appearance-section="design"
            class="talos-motion-tab-panel pt-4 outline-none"
        >
            <!-- Owner 2026-08-02: twelve settings on one plane. The five people
                 actually come here for stay in the open; the rest go behind a
                 disclosure — the same `<details>` the Model Lab already uses for
                 its manual models, so this is not a sixth way of hiding things. -->
            <div class="grid gap-4 sm:grid-cols-2">
                <label class="block">
                    <span :class="selectLabelClass">{{ t('appearance.themePreset') }}</span>
                    <TalosThemedSelect
                        class="mt-2"
                        :model-value="theme.state.theme"
                        :items="themeItems"
                        :aria-label="t('appearance.themePreset')"
                        @update:model-value="changeTheme"
                    />
                </label>
                <label class="block">
                    <span :class="selectLabelClass">{{ t('appearance.colorMode') }}</span>
                    <TalosThemedSelect
                        class="mt-2"
                        :model-value="theme.state.mode"
                        :items="modeItems"
                        :aria-label="t('appearance.themeColorMode')"
                        @update:model-value="changeMode"
                    />
                </label>
                <label class="block sm:col-span-2">
                    <span :class="selectLabelClass">{{ t('appearance.sceneOverride') }}</span>
                    <TalosThemedSelect
                        class="mt-2"
                        data-testid="talos-scene-override-select"
                        :model-value="settings.state.motion_v6.scene_override ?? ''"
                        :items="sceneOverrideItems"
                        :none-label="t('appearance.sceneOverrideFollowTheme')"
                        :aria-label="t('appearance.sceneOverrideAria')"
                        @update:model-value="setSceneOverride"
                    />
                    <span class="mt-1 block text-xs leading-5 text-[var(--talos-muted)]">
                        {{ t('appearance.sceneOverrideBody') }}
                    </span>
                </label>
                <label class="block">
                    <span :class="selectLabelClass">{{ t('appearance.fontSize') }}</span>
                    <TalosThemedSelect
                        class="mt-2"
                        data-testid="talos-font-scale-select"
                        :model-value="settings.state.shell.ui_font_scale"
                        :items="fontScaleItems"
                        :aria-label="t('appearance.fontSize')"
                        @update:model-value="settings.setShell({ ui_font_scale: $event as TalosFontScale })"
                    />
                    <span class="mt-1 block text-xs leading-5 text-[var(--talos-muted)]">
                        {{ t('appearance.fontSizeBody') }}
                    </span>
                </label>
                <label class="block">
                    <span :class="selectLabelClass">{{ t('appearance.chatMessageSize') }}</span>
                    <TalosThemedSelect
                        class="mt-2"
                        data-testid="talos-chat-font-scale-select"
                        :model-value="settings.state.chat_layout.bubble_scale"
                        :items="bubbleScaleItems"
                        :aria-label="t('appearance.chatMessageSize')"
                        @update:model-value="setChatLayout('bubble_scale', $event)"
                    />
                </label>
                <!-- One choice where there were three switches. They influenced
                     one another and could be set to combinations that meant
                     nothing — with the drawer off and the dropdown off, the "+"
                     announced itself as expanded and opened nothing at all. -->
                <label class="block">
                    <span :class="selectLabelClass">{{ t('appearance.composerShape') }}</span>
                    <TalosThemedSelect
                        class="mt-2"
                        data-testid="talos-composer-shape-select"
                        :model-value="settings.state.shell.composer_shape"
                        :items="composerShapeItems"
                        :aria-label="t('appearance.composerShape')"
                        @update:model-value="setComposerShape"
                    />
                    <span class="mt-1 block text-xs leading-5 text-[var(--talos-muted)]">
                        {{ t(`appearance.composerShapes.${settings.state.shell.composer_shape}Body`) }}
                    </span>
                </label>
                <!-- A second question, not a corner of the first: where the "+"
                     opens is where attach, Library and Browse live. -->
                <label class="block">
                    <span :class="selectLabelClass">{{ t('appearance.composerPlus') }}</span>
                    <TalosThemedSelect
                        class="mt-2"
                        data-testid="talos-composer-plus-select"
                        :model-value="settings.state.shell.composer_plus"
                        :items="composerPlusItems"
                        :disabled="!composerPlusApplies"
                        :aria-label="t('appearance.composerPlus')"
                        @update:model-value="setComposerPlus"
                    />
                    <span class="mt-1 block text-xs leading-5 text-[var(--talos-muted)]">
                        {{ composerPlusApplies
                            ? t(`appearance.composerPlusSurfaces.${settings.state.shell.composer_plus}Body`)
                            : t('appearance.composerPlusInline') }}
                    </span>
                </label>
                <div class="border-t border-[var(--talos-border)] pt-3 text-xs leading-5 text-[var(--talos-muted)] sm:col-span-2">
                    <div class="flex items-center gap-2">
                        <span class="h-4 w-4 rounded-sm border border-[var(--talos-border)]" :style="{ background: activePreset.preview.background }" />
                        <span class="h-4 w-4 rounded-sm" :style="{ background: activePreset.preview.accent }" />
                        <span class="h-4 w-4 rounded-sm" :style="{ background: activePreset.preview.secondary }" />
                        <strong class="text-[var(--talos-text)]">{{ activePresetLabel }}</strong>
                    </div>
                    <p class="mt-2">{{ activePresetDescription }}</p>
                </div>
            </div>

            <details data-testid="talos-appearance-advanced" class="mt-4 rounded-md border border-[var(--talos-border)] bg-[var(--talos-background)] p-3">
                <summary class="flex min-h-touch cursor-pointer items-center gap-2 text-sm font-semibold text-[var(--talos-text)]">
                    <SlidersHorizontal class="size-4 text-[var(--talos-accent)]" aria-hidden="true" /> {{ t('appearance.advanced') }}
                </summary>
                <div class="mt-3 grid gap-4 sm:grid-cols-2">
                    <label class="block">
                        <span :class="selectLabelClass">{{ t('appearance.chatMessageStyle') }}</span>
                        <TalosThemedSelect
                            class="mt-2"
                            :model-value="settings.state.chat_layout.message_style"
                            :items="messageStyleItems"
                            :aria-label="t('appearance.chatMessageStyle')"
                            @update:model-value="setChatLayout('message_style', $event)"
                        />
                    </label>
                    <label class="block">
                        <span :class="selectLabelClass">{{ t('appearance.answerAnimation') }}</span>
                        <TalosThemedSelect
                            class="mt-2"
                            data-testid="talos-streaming-animation-select"
                            :model-value="settings.state.shell.streaming_animation"
                            :items="streamingAnimations"
                            :aria-label="t('appearance.answerAnimation')"
                            @update:model-value="settings.setShell({ streaming_animation: $event as 'typewriter' | 'fade' })"
                        />
                    </label>
                    <label class="block sm:col-span-2">
                        <span :class="selectLabelClass">{{ t('appearance.mobileToolWindows') }}</span>
                        <TalosThemedSelect
                            class="mt-2"
                            :model-value="settings.state.chat_layout.mobile_window_presentation"
                            :items="windowPresentationItems"
                            :aria-label="t('appearance.mobileToolWindowsAria')"
                            @update:model-value="setChatLayout('mobile_window_presentation', $event)"
                        />
                    </label>
                    <!-- The last two hand-drawn switches in this panel. The motion
                         tab moved to the shared one on 2026-08-02; these were
                         missed, which is exactly why "one switch app-wide" is a
                         claim worth re-checking rather than repeating. -->
                    <div :class="switchRowClass" class="sm:col-span-2">
                        <span><span class="block text-sm font-semibold text-[var(--talos-text)]">{{ t('appearance.immersiveHeader') }}</span><span class="mt-1 block text-xs text-[var(--talos-muted)]">{{ t('appearance.immersiveHeaderBody') }}</span></span>
                        <TalosThemedSwitch class="mt-1" :aria-label="t('appearance.immersiveHeader')" :model-value="settings.state.shell.immersive_header" @update:model-value="settings.setShell({ immersive_header: $event })" />
                    </div>
                    <div :class="switchRowClass" class="sm:col-span-2">
                        <span><span class="block text-sm font-semibold text-[var(--talos-text)]">{{ t('appearance.launcherFollowsTheme') }}</span><span class="mt-1 block text-xs text-[var(--talos-muted)]">{{ t('appearance.launcherFollowsThemeBody') }}</span></span>
                        <TalosThemedSwitch class="mt-1" :aria-label="t('appearance.launcherFollowsTheme')" :model-value="settings.state.shell.launcher_icon_follows_theme" @update:model-value="settings.setShell({ launcher_icon_follows_theme: $event })" />
                    </div>
                </div>
            </details>
        </TabsContent>

        <TabsContent
            value="motion"
            data-appearance-section="motion"
            class="talos-motion-tab-panel space-y-4 pt-4 outline-none"
        >
            <div class="flex items-start justify-between gap-3">
                <div>
                    <h4 class="text-sm font-semibold text-[var(--talos-text)]">{{ t('appearance.motionEngine') }}</h4>
                    <p class="mt-1 text-xs leading-5 text-[var(--talos-muted)]">{{ t('appearance.motionEngineBody') }}</p>
                </div>
                <button type="button" :aria-label="t('appearance.resetMotion')" class="inline-flex min-h-touch min-w-touch items-center justify-center rounded-md border border-[var(--talos-border)] text-[var(--talos-muted)]" @click="settings.resetMotionPreferences()">
                    <RotateCcw class="h-4 w-4" aria-hidden="true" />
                </button>
            </div>

            <div class="grid gap-4 sm:grid-cols-2">
                <label class="block">
                    <span :class="selectLabelClass">{{ t('appearance.rendererMode') }}</span>
                    <TalosThemedSelect class="mt-2" :model-value="settings.state.motion_v6.mode" :items="rendererItems" :aria-label="t('appearance.rendererModeAria')" @update:model-value="setMotionSelect('mode', $event)" />
                </label>
                <label class="block">
                    <span :class="selectLabelClass">{{ t('appearance.quality') }}</span>
                    <TalosThemedSelect class="mt-2" :model-value="settings.state.motion_v6.quality" :items="qualityItems" :aria-label="t('appearance.qualityAria')" @update:model-value="setMotionSelect('quality', $event)" />
                </label>
            </div>

            <div :class="switchRowClass">
                <span><span class="block text-sm font-semibold text-[var(--talos-text)]">{{ t('appearance.backgroundMotion') }}</span><span class="mt-1 block text-xs text-[var(--talos-muted)]">{{ t('appearance.backgroundMotionBody') }}</span></span>
                <TalosThemedSwitch class="mt-1" :aria-label="t('appearance.backgroundMotion')" :model-value="settings.state.motion_v6.background_enabled && settings.state.motion_v6.mode !== 'off'" @update:model-value="setMotionBoolean('background_enabled', $event)" @click.stop />
            </div>
            <div :class="switchRowClass">
                <span><span class="block text-sm font-semibold text-[var(--talos-text)]">{{ t('appearance.interfaceMotion') }}</span><span class="mt-1 block text-xs text-[var(--talos-muted)]">{{ t('appearance.interfaceMotionBody') }}</span></span>
                <TalosThemedSwitch class="mt-1" :aria-label="t('appearance.interfaceMotion')" :model-value="settings.state.motion_v6.interface_enabled" @update:model-value="setMotionBoolean('interface_enabled', $event)" @click.stop />
            </div>

            <div class="grid gap-4 sm:grid-cols-2">
                <label v-for="control in motionControls" :key="control.key" class="block">
                    <span class="flex items-center justify-between text-xs font-semibold uppercase text-[var(--talos-muted)]">
                        {{ control.label }} <output>{{ settings.state.motion_v6[control.key as keyof typeof settings.state.motion_v6] }}</output>
                    </span>
                    <input type="range" :min="control.min" :max="control.max" :value="settings.state.motion_v6[control.key as keyof typeof settings.state.motion_v6] as number" :aria-label="control.label" :class="rangeClass" @input="setMotionNumber(control.key as 'speed' | 'intensity' | 'glow_intensity' | 'density' | 'depth' | 'trails' | 'contrast' | 'parallax', $event)">
                </label>
            </div>

            <div class="grid gap-4 border-t border-[var(--talos-border)] pt-4 sm:grid-cols-2">
                <label class="block"><span :class="selectLabelClass">{{ t('appearance.interfaceProfile') }}</span><TalosThemedSelect class="mt-2" :model-value="settings.state.motion_v6.interface.profile" :items="interfaceProfileItems" :aria-label="t('appearance.interfaceProfileAria')" @update:model-value="setInterfaceSelect('profile', $event)" /></label>
                <label class="block"><span :class="selectLabelClass">{{ t('appearance.interfaceEasing') }}</span><TalosThemedSelect class="mt-2" :model-value="settings.state.motion_v6.interface.easing" :items="easingItems" :aria-label="t('appearance.interfaceEasingAria')" @update:model-value="setInterfaceSelect('easing', $event)" /></label>
                <label v-for="control in interfaceControls" :key="control.key" class="block">
                    <span class="flex items-center justify-between text-xs font-semibold uppercase text-[var(--talos-muted)]">{{ control.label }} <output>{{ settings.state.motion_v6.interface[control.key as keyof typeof settings.state.motion_v6.interface] }}</output></span>
                    <input type="range" :min="control.min" :max="control.max" :value="settings.state.motion_v6.interface[control.key as keyof typeof settings.state.motion_v6.interface] as number" :aria-label="control.label" :class="rangeClass" @input="setInterfaceNumber(control.key as 'duration_scale' | 'intensity' | 'stagger', $event)">
                </label>
            </div>

            <fieldset class="border-t border-[var(--talos-border)] pt-3">
                <legend class="text-xs font-semibold uppercase text-[var(--talos-muted)]">{{ t('appearance.interfaceCategories') }}</legend>
                <div class="mt-2 grid gap-2 sm:grid-cols-2">
                    <div v-for="key in interfaceCategories" :key="key" class="flex min-h-touch items-center justify-between gap-3 border-b border-[var(--talos-border)] px-1 text-sm capitalize text-[var(--talos-text)]">
                        {{ t(`appearance.categories.${key}`) }}
                        <TalosThemedSwitch class="mt-1" :aria-label="t('appearance.categoryMotion', { category: t(`appearance.categories.${key}`) })" :model-value="settings.state.motion_v6.interface.categories[key]" @update:model-value="setInterfaceCategory(key, $event)" @click.stop />
                    </div>
                </div>
            </fieldset>

            <div :class="switchRowClass"><span><span class="block text-sm font-semibold text-[var(--talos-text)]">{{ t('appearance.pauseWhenHidden') }}</span><span class="mt-1 block text-xs text-[var(--talos-muted)]">{{ t('appearance.pauseWhenHiddenBody') }}</span></span><TalosThemedSwitch class="mt-1" :aria-label="t('appearance.pauseWhenHiddenAria')" :model-value="settings.state.motion_v6.pause_when_hidden" @update:model-value="setMotionBoolean('pause_when_hidden', $event)" @click.stop /></div>
            <div :class="switchRowClass"><span><span class="block text-sm font-semibold text-[var(--talos-text)]">{{ t('appearance.respectDataSaver') }}</span><span class="mt-1 block text-xs text-[var(--talos-muted)]">{{ t('appearance.respectDataSaverBody') }}</span></span><TalosThemedSwitch class="mt-1" :aria-label="t('appearance.respectDataSaver')" :model-value="settings.state.motion_v6.respect_data_saver" @update:model-value="setMotionBoolean('respect_data_saver', $event)" @click.stop /></div>
        </TabsContent>
    </TalosThemedTabs>
</template>
