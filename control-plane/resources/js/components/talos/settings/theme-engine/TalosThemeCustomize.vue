<script setup lang="ts">
import Badge from '../../../ui/Badge.vue'
import Button from '../../../ui/Button.vue'
import Input from '../../../ui/Input.vue'
import TalosThemedSelect from '../../ui/TalosThemedSelect.vue'
import TalosGuideInfoButton from '../../guide/TalosGuideInfoButton.vue'
import {
    TALOS_THEME_DENSITY_OPTIONS,
    TALOS_THEME_FONT_OPTIONS,
    TALOS_THEME_RADIUS_OPTIONS,
    type TalosThemePreset,
} from '../../../../lib/talosThemes'
import { TALOS_CHAT_COMPOSER_MODE_OPTIONS } from '../../../../lib/talosChatLayout'
import { TALOS_MESSAGE_SCALE_CONSTRAINT } from '../../../../lib/talosUiScale'
import type { TalosChatLayoutPreferences } from '../../../../lib/talosTypes'
import TalosScaleControl from '../TalosScaleControl.vue'
import TalosThemeProductPreview from './TalosThemeProductPreview.vue'
import type { ThemeCustomizationForm } from './themeEngineTypes'

const props = defineProps<{
    preset: TalosThemePreset
    customization: ThemeCustomizationForm
    chatLayout: TalosChatLayoutPreferences
    newThemeName: string
    disabled: boolean
    saving: boolean
    draftIsDirty: boolean
}>()

const emit = defineEmits<{
    'update:customization': [value: ThemeCustomizationForm]
    'update:chatLayout': [value: TalosChatLayoutPreferences]
    'update:newThemeName': [value: string]
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
                <div class="flex items-center gap-1.5">
                    <h4 class="text-sm font-semibold text-[var(--talos-text)]">Workspace customization</h4>
                    <TalosGuideInfoButton guide-id="theme.customize" compact side="bottom" />
                </div>
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
                <span>Font</span>
                <TalosThemedSelect
                    :model-value="customization.font"
                    :items="TALOS_THEME_FONT_OPTIONS"
                    aria-label="Font"
                    :disabled="disabled"
                    @update:model-value="updateCustomization('font', $event)"
                />
            </label>
            <label class="space-y-1 text-xs font-medium text-[var(--talos-muted)]">
                <span>Density</span>
                <TalosThemedSelect
                    :model-value="customization.density"
                    :items="TALOS_THEME_DENSITY_OPTIONS"
                    aria-label="Density"
                    :disabled="disabled"
                    @update:model-value="updateCustomization('density', $event)"
                />
            </label>
            <label class="space-y-1 text-xs font-medium text-[var(--talos-muted)]">
                <span>Corner radius</span>
                <TalosThemedSelect
                    :model-value="customization.radius"
                    :items="TALOS_THEME_RADIUS_OPTIONS"
                    aria-label="Corner radius"
                    :disabled="disabled"
                    @update:model-value="updateCustomization('radius', $event)"
                />
            </label>
        </div>

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
            <div class="mb-3">
                <div class="text-xs font-semibold uppercase text-[var(--talos-muted)]">Chat layout</div>
                <p class="mt-1 text-xs leading-5 text-[var(--talos-muted)]">Uses the same persisted preference as Appearance settings.</p>
            </div>
            <div class="grid gap-3 sm:grid-cols-2">
                <TalosScaleControl
                    control-id="theme-chat-message-scale"
                    label="Message scale"
                    description="Stored with this theme as a numeric chat geometry preference."
                    :model-value="chatLayout.message_scale"
                    :min="TALOS_MESSAGE_SCALE_CONSTRAINT.min"
                    :max="TALOS_MESSAGE_SCALE_CONSTRAINT.max"
                    :step="TALOS_MESSAGE_SCALE_CONSTRAINT.step"
                    :default-value="TALOS_MESSAGE_SCALE_CONSTRAINT.default"
                    :disabled="disabled"
                    @update:model-value="updateChatLayout('message_scale', $event)"
                />
                <label class="space-y-1 text-xs font-medium text-[var(--talos-muted)]">
                    <span>Composer mode</span>
                    <TalosThemedSelect :model-value="chatLayout.composer_mode" :items="TALOS_CHAT_COMPOSER_MODE_OPTIONS" aria-label="Theme chat composer mode" :disabled="disabled" @update:model-value="updateChatLayout('composer_mode', $event)" />
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
