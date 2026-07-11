<script setup lang="ts">
import Badge from '../../../ui/Badge.vue'
import Button from '../../../ui/Button.vue'
import Input from '../../../ui/Input.vue'
import Select from '../../../ui/Select.vue'
import {
    TALOS_BACKGROUND_EFFECTS,
    TALOS_THEME_DENSITY_OPTIONS,
    TALOS_THEME_FONT_OPTIONS,
    TALOS_THEME_RADIUS_OPTIONS,
    TALOS_UI_ANIMATION_EASING_OPTIONS,
    TALOS_UI_ANIMATION_FEEDBACK_OPTIONS,
    TALOS_UI_ANIMATION_HOVER_OPTIONS,
    TALOS_UI_ANIMATION_OPEN_CLOSE_OPTIONS,
    TALOS_UI_ANIMATION_PROFILE_OPTIONS,
    TALOS_UI_ANIMATION_SURFACE_OPTIONS,
    type TalosThemePreset,
    type TalosUiAnimationEasing,
    type TalosUiAnimationFeedback,
    type TalosUiAnimationHover,
    type TalosUiAnimationOpenClose,
    type TalosUiAnimationProfile,
    type TalosUiAnimationSurfaceTransition,
} from '../../../../lib/talosThemes'
import { TALOS_CHAT_BUBBLE_SCALE_OPTIONS, TALOS_CHAT_COMPOSER_MODE_OPTIONS } from '../../../../lib/talosChatLayout'
import type { TalosChatLayoutPreferences } from '../../../../lib/talosTypes'
import TalosThemeProductPreview from './TalosThemeProductPreview.vue'
import type { ThemeCustomizationForm, UiAnimationForm } from './themeEngineTypes'

const props = defineProps<{
    preset: TalosThemePreset
    customization: ThemeCustomizationForm
    uiAnimationProfile: TalosUiAnimationProfile
    uiAnimationForm: UiAnimationForm
    chatLayout: TalosChatLayoutPreferences
    newThemeName: string
    disabled: boolean
    saving: boolean
    draftIsDirty: boolean
    motionPreviewOpen: boolean
    motionPreviewStyle: Record<string, string>
}>()

const emit = defineEmits<{
    'update:customization': [value: ThemeCustomizationForm]
    'update:uiAnimationProfile': [value: TalosUiAnimationProfile]
    'update:uiAnimationForm': [value: UiAnimationForm]
    'update:chatLayout': [value: TalosChatLayoutPreferences]
    'update:newThemeName': [value: string]
    'preview-motion': []
    'save-customization': []
    'save-as-theme': []
    'create-theme': []
    'discard-changes': []
    'reset-to-preset': []
    'reset-customization': []
}>()

function updateCustomization(key: keyof ThemeCustomizationForm, value: unknown) {
    emit('update:customization', { ...props.customization, [key]: value } as ThemeCustomizationForm)
}

function updateAnimation(key: keyof UiAnimationForm, value: unknown) {
    emit('update:uiAnimationForm', { ...props.uiAnimationForm, [key]: value } as UiAnimationForm)
}

function updateChatLayout(key: keyof TalosChatLayoutPreferences, value: unknown) {
    emit('update:chatLayout', { ...props.chatLayout, [key]: value })
}
</script>

<template>
    <section
        id="talos-theme-control-panel-customize"
        role="tabpanel"
        aria-labelledby="talos-theme-control-tab-customize"
        aria-label="Theme customization"
        class="space-y-4"
    >
        <div class="flex flex-wrap items-start justify-between gap-3">
            <div>
                <h4 class="text-sm font-semibold text-[var(--talos-text)]">Workspace customization</h4>
                <p class="mt-1 text-xs leading-5 text-[var(--talos-muted)]">
                    Draft edits preview immediately. Saving persists controlled TALOS tokens.
                </p>
            </div>
            <Badge v-if="draftIsDirty" tone="warning">Unsaved changes</Badge>
        </div>

        <TalosThemeProductPreview :preset="preset" :customization="customization" :chat-layout="chatLayout" />

        <div class="grid gap-3 sm:grid-cols-2">
            <label class="space-y-1 text-xs font-medium text-[var(--talos-muted)]">
                <span>Accent color</span>
                <Input
                    :model-value="customization.accent"
                    type="color"
                    class="h-10 p-1"
                    aria-label="Accent color"
                    :disabled="disabled"
                    @update:model-value="updateCustomization('accent', $event)"
                />
            </label>
            <label class="space-y-1 text-xs font-medium text-[var(--talos-muted)]">
                <span>Background color</span>
                <Input
                    :model-value="customization.background"
                    type="color"
                    class="h-10 p-1"
                    aria-label="Background color"
                    :disabled="disabled"
                    @update:model-value="updateCustomization('background', $event)"
                />
            </label>
            <label class="space-y-1 text-xs font-medium text-[var(--talos-muted)]">
                <span>Panel color</span>
                <Input
                    :model-value="customization.panel"
                    type="color"
                    class="h-10 p-1"
                    aria-label="Panel color"
                    :disabled="disabled"
                    @update:model-value="updateCustomization('panel', $event)"
                />
            </label>
            <label class="space-y-1 text-xs font-medium text-[var(--talos-muted)]">
                <span>Text color</span>
                <Input
                    :model-value="customization.text"
                    type="color"
                    class="h-10 p-1"
                    aria-label="Text color"
                    :disabled="disabled"
                    @update:model-value="updateCustomization('text', $event)"
                />
            </label>
            <label class="space-y-1 text-xs font-medium text-[var(--talos-muted)]">
                <span>Secondary color</span>
                <Input
                    :model-value="customization.secondary"
                    type="color"
                    class="h-10 p-1"
                    aria-label="Secondary color"
                    :disabled="disabled"
                    @update:model-value="updateCustomization('secondary', $event)"
                />
            </label>
            <label class="space-y-1 text-xs font-medium text-[var(--talos-muted)]">
                <span>Border color</span>
                <Input
                    :model-value="customization.border"
                    type="color"
                    class="h-10 p-1"
                    aria-label="Border color"
                    :disabled="disabled"
                    @update:model-value="updateCustomization('border', $event)"
                />
            </label>
        </div>

        <div class="grid gap-3 sm:grid-cols-2">
            <label class="space-y-1 text-xs font-medium text-[var(--talos-muted)]">
                <span>Background effect</span>
                <Select
                    :model-value="customization.effect"
                    aria-label="Background effect"
                    :disabled="disabled"
                    @update:model-value="updateCustomization('effect', $event)"
                >
                    <option v-for="effect in TALOS_BACKGROUND_EFFECTS" :key="effect.value" :value="effect.value">
                        {{ effect.label }}
                    </option>
                </Select>
            </label>
            <label class="space-y-1 text-xs font-medium text-[var(--talos-muted)]">
                <span>Font</span>
                <Select
                    :model-value="customization.font"
                    aria-label="Font"
                    :disabled="disabled"
                    @update:model-value="updateCustomization('font', $event)"
                >
                    <option v-for="font in TALOS_THEME_FONT_OPTIONS" :key="font.value" :value="font.value">
                        {{ font.label }}
                    </option>
                </Select>
            </label>
            <label class="space-y-1 text-xs font-medium text-[var(--talos-muted)]">
                <span>Density</span>
                <Select
                    :model-value="customization.density"
                    aria-label="Density"
                    :disabled="disabled"
                    @update:model-value="updateCustomization('density', $event)"
                >
                    <option v-for="density in TALOS_THEME_DENSITY_OPTIONS" :key="density.value" :value="density.value">
                        {{ density.label }}
                    </option>
                </Select>
            </label>
            <label class="space-y-1 text-xs font-medium text-[var(--talos-muted)]">
                <span>Corner radius</span>
                <Select
                    :model-value="customization.radius"
                    aria-label="Corner radius"
                    :disabled="disabled"
                    @update:model-value="updateCustomization('radius', $event)"
                >
                    <option v-for="radius in TALOS_THEME_RADIUS_OPTIONS" :key="radius.value" :value="radius.value">
                        {{ radius.label }}
                    </option>
                </Select>
            </label>
        </div>

        <label class="space-y-2 text-xs font-medium text-[var(--talos-muted)]">
            <span>Effect intensity</span>
            <Input
                :model-value="customization.effect_intensity"
                type="number"
                min="0"
                max="100"
                step="1"
                aria-label="Effect intensity"
                :disabled="disabled"
                @update:model-value="updateCustomization('effect_intensity', Number($event))"
            />
        </label>

        <div class="rounded-md border border-[var(--talos-border)] bg-[var(--talos-panel-soft)] p-3">
            <div class="text-sm font-semibold text-[var(--talos-text)]">Scrollbar tokens</div>
            <p class="mt-1 text-xs leading-5 text-[var(--talos-muted)]">
                Applies to chat, settings, window bodies and long evidence panels.
            </p>
            <div class="mt-3 grid gap-3 sm:grid-cols-2">
                <label class="space-y-1 text-xs font-medium text-[var(--talos-muted)]">
                    <span>Scrollbar track</span>
                    <Input :model-value="customization.scrollbar_track" aria-label="Scrollbar track" :disabled="disabled" @update:model-value="updateCustomization('scrollbar_track', $event)" />
                </label>
                <label class="space-y-1 text-xs font-medium text-[var(--talos-muted)]">
                    <span>Scrollbar thumb</span>
                    <Input :model-value="customization.scrollbar_thumb" aria-label="Scrollbar thumb" :disabled="disabled" @update:model-value="updateCustomization('scrollbar_thumb', $event)" />
                </label>
                <label class="space-y-1 text-xs font-medium text-[var(--talos-muted)]">
                    <span>Scrollbar hover</span>
                    <Input :model-value="customization.scrollbar_thumb_hover" aria-label="Scrollbar hover" :disabled="disabled" @update:model-value="updateCustomization('scrollbar_thumb_hover', $event)" />
                </label>
                <label class="space-y-1 text-xs font-medium text-[var(--talos-muted)]">
                    <span>Scrollbar width</span>
                    <Input
                        :model-value="customization.scrollbar_width"
                        type="number"
                        min="6"
                        max="18"
                        step="1"
                        aria-label="Scrollbar width"
                        :disabled="disabled"
                        @update:model-value="updateCustomization('scrollbar_width', Number($event))"
                    />
                </label>
            </div>
        </div>

        <div class="rounded-md border border-[var(--talos-border)] bg-[var(--talos-panel-soft)] p-3">
            <div class="flex flex-wrap items-start justify-between gap-3">
                <div>
                    <h4 class="text-sm font-semibold text-[var(--talos-text)]">Interface motion</h4>
                    <p class="mt-1 text-xs leading-5 text-[var(--talos-muted)]">
                        Controls how TALOS panels, messages and command surfaces move. Reduced motion can still disable nonessential animation.
                    </p>
                </div>
                <Badge tone="neutral">{{ uiAnimationProfile }}</Badge>
            </div>

            <div class="mt-3 grid gap-3 md:grid-cols-3">
                <label class="space-y-1 text-xs font-medium text-[var(--talos-muted)]">
                    <span>Animation profile</span>
                    <Select :model-value="uiAnimationProfile" aria-label="Animation profile" :disabled="disabled" @update:model-value="emit('update:uiAnimationProfile', $event as TalosUiAnimationProfile)">
                        <option v-for="profile in TALOS_UI_ANIMATION_PROFILE_OPTIONS" :key="profile.value" :value="profile.value">
                            {{ profile.label }}
                        </option>
                    </Select>
                </label>
                <label class="space-y-1 text-xs font-medium text-[var(--talos-muted)]">
                    <span>Open/close style</span>
                    <Select :model-value="uiAnimationForm.open_close" aria-label="Open/close style" :disabled="disabled || uiAnimationProfile !== 'custom'" @update:model-value="updateAnimation('open_close', $event as TalosUiAnimationOpenClose)">
                        <option v-for="option in TALOS_UI_ANIMATION_OPEN_CLOSE_OPTIONS" :key="option.value" :value="option.value">{{ option.label }}</option>
                    </Select>
                </label>
                <label class="space-y-1 text-xs font-medium text-[var(--talos-muted)]">
                    <span>Surface transition</span>
                    <Select :model-value="uiAnimationForm.surface_transition" aria-label="Surface transition" :disabled="disabled || uiAnimationProfile !== 'custom'" @update:model-value="updateAnimation('surface_transition', $event as TalosUiAnimationSurfaceTransition)">
                        <option v-for="option in TALOS_UI_ANIMATION_SURFACE_OPTIONS" :key="option.value" :value="option.value">{{ option.label }}</option>
                    </Select>
                </label>
                <label class="space-y-1 text-xs font-medium text-[var(--talos-muted)]">
                    <span>Feedback style</span>
                    <Select :model-value="uiAnimationForm.feedback" aria-label="Feedback style" :disabled="disabled || uiAnimationProfile !== 'custom'" @update:model-value="updateAnimation('feedback', $event as TalosUiAnimationFeedback)">
                        <option v-for="option in TALOS_UI_ANIMATION_FEEDBACK_OPTIONS" :key="option.value" :value="option.value">{{ option.label }}</option>
                    </Select>
                </label>
                <label class="space-y-1 text-xs font-medium text-[var(--talos-muted)]">
                    <span>Hover/focus style</span>
                    <Select :model-value="uiAnimationForm.hover" aria-label="Hover/focus style" :disabled="disabled || uiAnimationProfile !== 'custom'" @update:model-value="updateAnimation('hover', $event as TalosUiAnimationHover)">
                        <option v-for="option in TALOS_UI_ANIMATION_HOVER_OPTIONS" :key="option.value" :value="option.value">{{ option.label }}</option>
                    </Select>
                </label>
                <label class="space-y-1 text-xs font-medium text-[var(--talos-muted)]">
                    <span>Motion easing</span>
                    <Select :model-value="uiAnimationForm.easing" aria-label="Motion easing" :disabled="disabled || uiAnimationProfile !== 'custom'" @update:model-value="updateAnimation('easing', $event as TalosUiAnimationEasing)">
                        <option v-for="option in TALOS_UI_ANIMATION_EASING_OPTIONS" :key="option.value" :value="option.value">{{ option.label }}</option>
                    </Select>
                </label>
                <label class="space-y-1 text-xs font-medium text-[var(--talos-muted)]">
                    <span>Duration scale</span>
                    <Input :model-value="uiAnimationForm.duration_scale" type="number" min="50" max="150" step="1" aria-label="Duration scale" :disabled="disabled || uiAnimationProfile !== 'custom'" @update:model-value="updateAnimation('duration_scale', Number($event))" />
                </label>
                <label class="space-y-1 text-xs font-medium text-[var(--talos-muted)]">
                    <span>Motion intensity</span>
                    <Input :model-value="uiAnimationForm.intensity" type="number" min="0" max="100" step="1" aria-label="Motion intensity" :disabled="disabled || uiAnimationProfile !== 'custom'" @update:model-value="updateAnimation('intensity', Number($event))" />
                </label>
                <label class="space-y-1 text-xs font-medium text-[var(--talos-muted)]">
                    <span>Motion stagger</span>
                    <Input :model-value="uiAnimationForm.stagger" type="number" min="0" max="120" step="1" aria-label="Motion stagger" :disabled="disabled || uiAnimationProfile !== 'custom'" @update:model-value="updateAnimation('stagger', Number($event))" />
                </label>
            </div>

            <div class="mt-3 grid gap-3 md:grid-cols-[minmax(0,1fr)_auto] md:items-center">
                <div
                    data-testid="talos-motion-preview-surface"
                    class="talos-motion-preview-surface rounded-md border border-[var(--talos-border)] bg-[var(--talos-panel)] p-3"
                    :data-preview-state="motionPreviewOpen ? 'open' : 'closed'"
                    :style="motionPreviewStyle"
                >
                    <div class="text-xs font-semibold uppercase text-[var(--talos-muted)]">Preview surface</div>
                    <div class="mt-2 text-sm font-semibold text-[var(--talos-text)]">Command panel transition</div>
                    <p class="mt-1 text-xs leading-5 text-[var(--talos-muted)]">Uses the same action-motion tokens as TALOS windows and command surfaces.</p>
                </div>
                <Button type="button" variant="secondary" :disabled="disabled" @click="emit('preview-motion')">Preview motion</Button>
            </div>
        </div>

        <div class="rounded-md border border-[var(--talos-border)] bg-[var(--talos-panel-soft)] p-3">
            <div class="mb-3">
                <div class="text-xs font-semibold uppercase text-[var(--talos-muted)]">Chat layout</div>
                <p class="mt-1 text-xs leading-5 text-[var(--talos-muted)]">Uses the same persisted preference as Appearance settings.</p>
            </div>
            <div class="grid gap-3 sm:grid-cols-2">
                <label class="space-y-1 text-xs font-medium text-[var(--talos-muted)]">
                    <span>Message size</span>
                    <Select :model-value="chatLayout.bubble_scale" aria-label="Theme chat message size" :disabled="disabled" @update:model-value="updateChatLayout('bubble_scale', $event)">
                        <option v-for="option in TALOS_CHAT_BUBBLE_SCALE_OPTIONS" :key="option.value" :value="option.value">{{ option.label }}</option>
                    </Select>
                </label>
                <label class="space-y-1 text-xs font-medium text-[var(--talos-muted)]">
                    <span>Composer mode</span>
                    <Select :model-value="chatLayout.composer_mode" aria-label="Theme chat composer mode" :disabled="disabled" @update:model-value="updateChatLayout('composer_mode', $event)">
                        <option v-for="option in TALOS_CHAT_COMPOSER_MODE_OPTIONS" :key="option.value" :value="option.value">{{ option.label }}</option>
                    </Select>
                </label>
            </div>
        </div>

        <div class="rounded-md border border-[var(--talos-border)] bg-[var(--talos-panel-soft)] p-3">
            <div class="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
                <label class="space-y-1 text-xs font-medium text-[var(--talos-muted)]">
                    <span>Theme name</span>
                    <Input :model-value="newThemeName" aria-label="Theme name" :disabled="disabled" @update:model-value="emit('update:newThemeName', String($event))" />
                </label>
                <Button type="button" :disabled="saving || disabled" @click="emit('create-theme')">Create theme</Button>
            </div>
        </div>

        <div class="flex flex-wrap gap-2">
            <Button type="button" :disabled="saving || disabled" @click="emit('save-customization')">Save customization</Button>
            <Button type="button" variant="secondary" :disabled="saving || disabled" @click="emit('save-as-theme')">Save as theme</Button>
            <Button type="button" variant="ghost" :disabled="saving || !draftIsDirty || disabled" @click="emit('discard-changes')">Discard changes</Button>
            <Button type="button" variant="outline" :disabled="saving || disabled" @click="emit('reset-to-preset')">Reset to preset</Button>
            <Button type="button" variant="outline" :disabled="saving || disabled" @click="emit('reset-customization')">Reset customization</Button>
        </div>
    </section>
</template>
