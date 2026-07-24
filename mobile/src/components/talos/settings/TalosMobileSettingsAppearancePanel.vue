<script setup lang="ts">
import { computed } from 'vue'
import { RotateCcw } from '@lucide/vue'
import { TabsContent, TabsList, TabsRoot, TabsTrigger } from 'reka-ui'
import TalosThemedSelect from '@/components/talos/ui/TalosThemedSelect.vue'
import TalosMobileVoiceSettings from '@/components/talos/settings/TalosMobileVoiceSettings.vue'
import {
    TALOS_THEME_MODE_OPTIONS,
    TALOS_THEME_PRESETS,
    type TalosThemeId,
    type TalosThemeMode,
} from '@/lib/talosThemes'
import {
    TALOS_CHAT_BUBBLE_SCALE_OPTIONS,
    TALOS_CHAT_MESSAGE_STYLE_OPTIONS,
    TALOS_CHAT_COMPOSER_MODE_OPTIONS,
    TALOS_MOBILE_WINDOW_PRESENTATION_OPTIONS,
} from '@/lib/talosChatLayout'
import { TALOS_APPEARANCE_GROUPS, type TalosAppearanceGroup } from '@/lib/talosAppearancePreferences'
import {
    TALOS_INTERFACE_EASINGS,
    TALOS_INTERFACE_PROFILES,
    TALOS_MOTION_QUALITY_LEVELS,
    TALOS_MOTION_RENDERER_MODES,
} from '@/motion-v6/contracts'
import { useSettingsStore, type TalosMotionPreferencePatch } from '@/stores/settings'
import { useThemeStore } from '@/stores/theme'

const theme = useThemeStore()
const settings = useSettingsStore()

const themeItems = TALOS_THEME_PRESETS.map((preset) => ({ value: preset.id, label: preset.label }))
const modeItems = TALOS_THEME_MODE_OPTIONS.map((mode) => ({ value: mode.value, label: mode.label }))
const rendererItems = TALOS_MOTION_RENDERER_MODES.map((mode) => ({
    value: mode,
    label: mode.charAt(0).toUpperCase() + mode.slice(1),
}))
const qualityItems = TALOS_MOTION_QUALITY_LEVELS.map((quality) => ({
    value: quality,
    label: quality.charAt(0).toUpperCase() + quality.slice(1),
}))
const interfaceProfileItems = TALOS_INTERFACE_PROFILES.map((profile) => ({
    value: profile,
    label: profile.charAt(0).toUpperCase() + profile.slice(1),
}))
const easingItems = TALOS_INTERFACE_EASINGS.map((easing) => ({
    value: easing,
    label: easing.replace('-', ' ').replace(/^./, (value) => value.toUpperCase()),
}))

const activePreset = computed(() => TALOS_THEME_PRESETS.find((preset) => preset.id === theme.state.theme) ?? TALOS_THEME_PRESETS[0])

function changeTheme(value: string): void {
    void theme.setTheme(value as TalosThemeId)
}

function changeMode(value: string): void {
    void theme.setMode(value as TalosThemeMode)
}

function setChatLayout(key: 'bubble_scale' | 'composer_mode' | 'mobile_window_presentation' | 'message_style', value: string): void {
    void settings.setChatLayout({ [key]: value })
}

function setAdvancedRail(event: Event): void {
    void settings.setChatLayout({ advanced_rail_expanded: (event.target as HTMLInputElement).checked })
}

function setVisibility(group: TalosAppearanceGroup, key: string, event: Event): void {
    void settings.setVisibility(group, key, (event.target as HTMLInputElement).checked)
}

function setMotionSelect(key: 'mode' | 'quality', value: string): void {
    void settings.setMotionPreferences({ [key]: value } as TalosMotionPreferencePatch)
}

function setInterfaceSelect(key: 'profile' | 'easing', value: string): void {
    void settings.setMotionPreferences({ interface: { [key]: value } } as TalosMotionPreferencePatch)
}

function setMotionBoolean(key: 'background_enabled' | 'interface_enabled' | 'pause_when_hidden' | 'respect_data_saver', event: Event): void {
    const checked = (event.target as HTMLInputElement).checked
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

function setInterfaceCategory(key: keyof typeof settings.state.motion_v6.interface.categories, event: Event): void {
    void settings.setMotionPreferences({ interface: { categories: { [key]: (event.target as HTMLInputElement).checked } } })
}

const sectionTabClass = 'min-h-11 shrink-0 rounded-md border border-transparent px-3 text-sm font-medium text-[var(--talos-muted)] outline-none data-[state=active]:border-[var(--talos-accent-border)] data-[state=active]:bg-[var(--talos-panel)] data-[state=active]:text-[var(--talos-text)] focus-visible:ring-2 focus-visible:ring-[var(--talos-ring)]'
const selectLabelClass = 'text-xs font-semibold uppercase text-[var(--talos-muted)]'
const switchRowClass = 'flex min-h-14 cursor-pointer items-start justify-between gap-3 border-t border-[var(--talos-border)] py-3'
const rangeClass = 'mt-2 h-2 w-full cursor-pointer accent-[var(--talos-accent)]'
</script>

<template>
    <TabsRoot default-value="design" activation-mode="automatic" orientation="horizontal">
        <!-- Owner 2026-07-24: the section tabs stay PINNED (sticky) while the
             panel scrolls, like a nav tab bar. (Swipe-to-switch is a follow-up.) -->
        <TabsList aria-label="Appearance sections" class="sticky top-0 z-10 flex gap-1 overflow-x-auto border-b border-[var(--talos-border)] bg-[var(--talos-window-bg,var(--talos-background))] pb-2 pt-1">
            <TabsTrigger value="design" :class="sectionTabClass">Design</TabsTrigger>
            <TabsTrigger value="motion" :class="sectionTabClass">Motion</TabsTrigger>
            <TabsTrigger value="voice" :class="sectionTabClass">Voice</TabsTrigger>
            <TabsTrigger value="visibility" :class="sectionTabClass">Visibility</TabsTrigger>
        </TabsList>

        <TabsContent value="design" class="pt-4 outline-none">
            <div class="grid gap-4 sm:grid-cols-2">
                <label class="block">
                    <span :class="selectLabelClass">Theme preset</span>
                    <TalosThemedSelect
                        class="mt-2"
                        :model-value="theme.state.theme"
                        :items="themeItems"
                        aria-label="Theme preset"
                        @update:model-value="changeTheme"
                    />
                </label>
                <label class="block">
                    <span :class="selectLabelClass">Color mode</span>
                    <TalosThemedSelect
                        class="mt-2"
                        :model-value="theme.state.mode"
                        :items="modeItems"
                        aria-label="Theme color mode"
                        @update:model-value="changeMode"
                    />
                </label>
                <label class="block">
                    <span :class="selectLabelClass">Chat message style</span>
                    <TalosThemedSelect
                        class="mt-2"
                        :model-value="settings.state.chat_layout.message_style"
                        :items="TALOS_CHAT_MESSAGE_STYLE_OPTIONS"
                        aria-label="Chat message style"
                        @update:model-value="setChatLayout('message_style', $event)"
                    />
                </label>
                <label class="flex items-center justify-between gap-3 py-1">
                    <span>
                        <span :class="selectLabelClass">Immersive header</span>
                        <span class="block text-xs text-[var(--talos-muted)]">Floating controls over a top fade instead of the header bar.</span>
                    </span>
                    <button
                        type="button"
                        role="switch"
                        :aria-checked="settings.state.shell.immersive_header"
                        aria-label="Immersive header"
                        class="talos-pressable relative h-6 w-11 shrink-0 rounded-full transition-colors"
                        :class="settings.state.shell.immersive_header ? 'bg-[var(--talos-accent)]' : 'bg-[var(--talos-border)]'"
                        @click="settings.setShell({ immersive_header: !settings.state.shell.immersive_header })"
                    ><span class="absolute top-0.5 size-5 rounded-full bg-white shadow transition-[left] duration-200" :class="settings.state.shell.immersive_header ? 'left-[22px]' : 'left-0.5'" aria-hidden="true" /></button>
                </label>
                <label class="flex items-center justify-between gap-3 py-1">
                    <span>
                        <span :class="selectLabelClass">Composer drawer</span>
                        <span class="block text-xs text-[var(--talos-muted)]">Minimal bar (+ / model / mic) with tools in an organized drawer.</span>
                    </span>
                    <button
                        type="button"
                        role="switch"
                        :aria-checked="settings.state.shell.composer_drawer"
                        aria-label="Composer drawer"
                        class="talos-pressable relative h-6 w-11 shrink-0 rounded-full transition-colors"
                        :class="settings.state.shell.composer_drawer ? 'bg-[var(--talos-accent)]' : 'bg-[var(--talos-border)]'"
                        @click="settings.setShell({ composer_drawer: !settings.state.shell.composer_drawer })"
                    ><span class="absolute top-0.5 size-5 rounded-full bg-white shadow transition-[left] duration-200" :class="settings.state.shell.composer_drawer ? 'left-[22px]' : 'left-0.5'" aria-hidden="true" /></button>
                </label>
                <label class="block">
                    <span :class="selectLabelClass">Chat message size</span>
                    <TalosThemedSelect
                        class="mt-2"
                        :model-value="settings.state.chat_layout.bubble_scale"
                        :items="TALOS_CHAT_BUBBLE_SCALE_OPTIONS"
                        aria-label="Chat message size"
                        @update:model-value="setChatLayout('bubble_scale', $event)"
                    />
                </label>
                <label class="block">
                    <span :class="selectLabelClass">Chat composer</span>
                    <TalosThemedSelect
                        class="mt-2"
                        :model-value="settings.state.chat_layout.composer_mode"
                        :items="TALOS_CHAT_COMPOSER_MODE_OPTIONS"
                        aria-label="Chat composer mode"
                        @update:model-value="setChatLayout('composer_mode', $event)"
                    />
                </label>
                <label class="block">
                    <span :class="selectLabelClass">Mobile tool windows</span>
                    <TalosThemedSelect
                        class="mt-2"
                        :model-value="settings.state.chat_layout.mobile_window_presentation"
                        :items="TALOS_MOBILE_WINDOW_PRESENTATION_OPTIONS"
                        aria-label="Mobile tool window presentation"
                        @update:model-value="setChatLayout('mobile_window_presentation', $event)"
                    />
                </label>
                <div class="border-t border-[var(--talos-border)] pt-3 text-xs leading-5 text-[var(--talos-muted)]">
                    <div class="flex items-center gap-2">
                        <span class="h-4 w-4 rounded-sm border border-[var(--talos-border)]" :style="{ background: activePreset.preview.background }" />
                        <span class="h-4 w-4 rounded-sm" :style="{ background: activePreset.preview.accent }" />
                        <span class="h-4 w-4 rounded-sm" :style="{ background: activePreset.preview.secondary }" />
                        <strong class="text-[var(--talos-text)]">{{ activePreset.label }}</strong>
                    </div>
                    <p class="mt-2">{{ activePreset.description }}</p>
                </div>
            </div>
            <label :class="switchRowClass">
                <span>
                    <span class="block text-sm font-semibold text-[var(--talos-text)]">Expand Advanced by default</span>
                    <span class="mt-1 block text-xs leading-5 text-[var(--talos-muted)]">Keep lower-frequency tools visible after reload.</span>
                </span>
                <input type="checkbox" role="switch" aria-label="Expand Advanced by default" :checked="settings.state.chat_layout.advanced_rail_expanded" class="mt-1 h-5 w-9 accent-[var(--talos-accent)]" @change="setAdvancedRail">
            </label>
        </TabsContent>

        <TabsContent value="motion" class="space-y-4 pt-4 outline-none">
            <div class="flex items-start justify-between gap-3">
                <div>
                    <h4 class="text-sm font-semibold text-[var(--talos-text)]">Theme Motion Engine V6</h4>
                    <p class="mt-1 text-xs leading-5 text-[var(--talos-muted)]">These values feed the live mobile renderer and interface motion policy.</p>
                </div>
                <button type="button" aria-label="Reset motion defaults" class="inline-flex min-h-11 min-w-11 items-center justify-center rounded-md border border-[var(--talos-border)] text-[var(--talos-muted)]" @click="settings.resetMotionPreferences()">
                    <RotateCcw class="h-4 w-4" aria-hidden="true" />
                </button>
            </div>

            <div class="grid gap-4 sm:grid-cols-2">
                <label class="block">
                    <span :class="selectLabelClass">Renderer mode</span>
                    <TalosThemedSelect class="mt-2" :model-value="settings.state.motion_v6.mode" :items="rendererItems" aria-label="Motion renderer mode" @update:model-value="setMotionSelect('mode', $event)" />
                </label>
                <label class="block">
                    <span :class="selectLabelClass">Quality</span>
                    <TalosThemedSelect class="mt-2" :model-value="settings.state.motion_v6.quality" :items="qualityItems" aria-label="Motion quality" @update:model-value="setMotionSelect('quality', $event)" />
                </label>
            </div>

            <label :class="switchRowClass">
                <span><span class="block text-sm font-semibold text-[var(--talos-text)]">Background motion</span><span class="mt-1 block text-xs text-[var(--talos-muted)]">Render the active theme scene.</span></span>
                <input type="checkbox" role="switch" aria-label="Background motion" :checked="settings.state.motion_v6.background_enabled && settings.state.motion_v6.mode !== 'off'" class="mt-1 h-5 w-9 accent-[var(--talos-accent)]" @change="setMotionBoolean('background_enabled', $event)">
            </label>
            <label :class="switchRowClass">
                <span><span class="block text-sm font-semibold text-[var(--talos-text)]">Interface motion</span><span class="mt-1 block text-xs text-[var(--talos-muted)]">Animate sheets, navigation, composer and feedback.</span></span>
                <input type="checkbox" role="switch" aria-label="Interface motion" :checked="settings.state.motion_v6.interface_enabled" class="mt-1 h-5 w-9 accent-[var(--talos-accent)]" @change="setMotionBoolean('interface_enabled', $event)">
            </label>

            <div class="grid gap-4 sm:grid-cols-2">
                <label v-for="control in [
                    { key: 'speed', label: 'Background speed', min: 25, max: 200 },
                    { key: 'intensity', label: 'Background intensity', min: 0, max: 100 },
                    { key: 'glow_intensity', label: 'Glow intensity', min: 0, max: 100 },
                    { key: 'density', label: 'Scene density', min: 25, max: 150 },
                    { key: 'depth', label: 'Scene depth', min: 0, max: 100 },
                    { key: 'trails', label: 'Trail persistence', min: 0, max: 100 },
                    { key: 'contrast', label: 'Scene contrast', min: 0, max: 100 },
                    { key: 'parallax', label: 'Parallax', min: 0, max: 100 },
                ]" :key="control.key" class="block">
                    <span class="flex items-center justify-between text-xs font-semibold uppercase text-[var(--talos-muted)]">
                        {{ control.label }} <output>{{ settings.state.motion_v6[control.key as keyof typeof settings.state.motion_v6] }}</output>
                    </span>
                    <input type="range" :min="control.min" :max="control.max" :value="settings.state.motion_v6[control.key as keyof typeof settings.state.motion_v6] as number" :aria-label="control.label" :class="rangeClass" @input="setMotionNumber(control.key as 'speed' | 'intensity' | 'glow_intensity' | 'density' | 'depth' | 'trails' | 'contrast' | 'parallax', $event)">
                </label>
            </div>

            <div class="grid gap-4 border-t border-[var(--talos-border)] pt-4 sm:grid-cols-2">
                <label class="block"><span :class="selectLabelClass">Interface profile</span><TalosThemedSelect class="mt-2" :model-value="settings.state.motion_v6.interface.profile" :items="interfaceProfileItems" aria-label="Interface motion profile" @update:model-value="setInterfaceSelect('profile', $event)" /></label>
                <label class="block"><span :class="selectLabelClass">Interface easing</span><TalosThemedSelect class="mt-2" :model-value="settings.state.motion_v6.interface.easing" :items="easingItems" aria-label="Interface motion easing" @update:model-value="setInterfaceSelect('easing', $event)" /></label>
                <label v-for="control in [
                    { key: 'duration_scale', label: 'Interface duration', min: 50, max: 150 },
                    { key: 'intensity', label: 'Interface intensity', min: 0, max: 100 },
                    { key: 'stagger', label: 'Interface stagger', min: 0, max: 120 },
                ]" :key="control.key" class="block">
                    <span class="flex items-center justify-between text-xs font-semibold uppercase text-[var(--talos-muted)]">{{ control.label }} <output>{{ settings.state.motion_v6.interface[control.key as keyof typeof settings.state.motion_v6.interface] }}</output></span>
                    <input type="range" :min="control.min" :max="control.max" :value="settings.state.motion_v6.interface[control.key as keyof typeof settings.state.motion_v6.interface] as number" :aria-label="control.label" :class="rangeClass" @input="setInterfaceNumber(control.key as 'duration_scale' | 'intensity' | 'stagger', $event)">
                </label>
            </div>

            <fieldset class="border-t border-[var(--talos-border)] pt-3">
                <legend class="text-xs font-semibold uppercase text-[var(--talos-muted)]">Interface categories</legend>
                <div class="mt-2 grid gap-2 sm:grid-cols-2">
                    <label v-for="key in ['windows', 'surfaces', 'navigation', 'composer', 'messages', 'feedback'] as const" :key="key" class="flex min-h-11 items-center justify-between gap-3 border-b border-[var(--talos-border)] px-1 text-sm capitalize text-[var(--talos-text)]">
                        {{ key }}
                        <input type="checkbox" role="switch" :aria-label="`${key} motion`" :checked="settings.state.motion_v6.interface.categories[key]" class="h-5 w-9 accent-[var(--talos-accent)]" @change="setInterfaceCategory(key, $event)">
                    </label>
                </div>
            </fieldset>

            <label :class="switchRowClass"><span><span class="block text-sm font-semibold text-[var(--talos-text)]">Pause when hidden</span><span class="mt-1 block text-xs text-[var(--talos-muted)]">Suspend background work while the app is not visible.</span></span><input type="checkbox" role="switch" aria-label="Pause motion when hidden" :checked="settings.state.motion_v6.pause_when_hidden" class="mt-1 h-5 w-9 accent-[var(--talos-accent)]" @change="setMotionBoolean('pause_when_hidden', $event)"></label>
            <label :class="switchRowClass"><span><span class="block text-sm font-semibold text-[var(--talos-text)]">Respect data saver</span><span class="mt-1 block text-xs text-[var(--talos-muted)]">Degrade expensive scenes when the OS requests it.</span></span><input type="checkbox" role="switch" aria-label="Respect data saver" :checked="settings.state.motion_v6.respect_data_saver" class="mt-1 h-5 w-9 accent-[var(--talos-accent)]" @change="setMotionBoolean('respect_data_saver', $event)"></label>
        </TabsContent>

        <TabsContent value="voice" class="pt-2 outline-none">
            <TalosMobileVoiceSettings />
        </TabsContent>

        <TabsContent value="visibility" class="space-y-4 pt-4 outline-none">
            <div class="flex items-start justify-between gap-3">
                <div>
                    <h4 class="text-sm font-semibold text-[var(--talos-text)]">Interface visibility</h4>
                    <p class="mt-1 text-xs leading-5 text-[var(--talos-muted)]">Hide visible controls without deleting their command routes.</p>
                </div>
                <button type="button" class="min-h-11 rounded-md border border-[var(--talos-border)] px-3 text-sm text-[var(--talos-text)]" @click="settings.resetVisibility()">Reset all</button>
            </div>
            <section v-for="group in TALOS_APPEARANCE_GROUPS" :key="group.id" class="border-t border-[var(--talos-border)] pt-3">
                <div class="flex items-start justify-between gap-3">
                    <div><h5 class="text-sm font-semibold text-[var(--talos-text)]">{{ group.label }}</h5><p class="mt-1 text-xs leading-5 text-[var(--talos-muted)]">{{ group.description }}</p></div>
                    <button type="button" class="min-h-11 px-2 text-xs text-[var(--talos-muted)]" @click="settings.resetVisibility(group.id)">Reset</button>
                </div>
                <div class="mt-2 grid gap-1 sm:grid-cols-2">
                    <label v-for="item in group.items" :key="item.key" class="flex min-h-11 items-center justify-between gap-3 border-b border-[var(--talos-border)] px-1 text-sm text-[var(--talos-text)]">
                        {{ item.label }}
                        <input type="checkbox" role="switch" :aria-label="item.label" :checked="Boolean((settings.state.appearance_visibility[group.id] as Record<string, boolean>)[item.key])" class="h-5 w-9 accent-[var(--talos-accent)]" @change="setVisibility(group.id, item.key, $event)">
                    </label>
                </div>
            </section>
        </TabsContent>
    </TabsRoot>
</template>
