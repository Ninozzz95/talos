<script setup lang="ts">
import { computed, ref } from 'vue'
import { useTalosI18n } from '@/i18n'
import TalosThemedSelect, { type TalosThemedSelectItem } from '@/components/talos/ui/TalosThemedSelect.vue'
import { useSettingsStore, type TalosUtilityModelMode } from '@/stores/settings'
import TalosMobileSearchSourcePanel from '@/components/talos/settings/TalosMobileSearchSourcePanel.vue'
import { TALOS_TONE_PRESETS, isTalosToneId } from '@/lib/tone'
import {
    TALOS_LIBRARY_CONTEXT_MODES,
    type TalosLibraryContextMode,
} from '@/lib/chat/libraryPolicy'

const settings = useSettingsStore()
const { t } = useTalosI18n()
const modeItems = computed(() => [
    { value: 'same_as_chat', label: t('aiDefaults.sameAsChat') },
    { value: 'default_profile', label: t('aiDefaults.useDefaultProfile') },
])

// F3-T4 (owner #11): selectable assistant tone; the model may suggest a
// better fit via toast, but only the user switches it (here or from the toast).
const toneItems = computed(() => TALOS_TONE_PRESETS.map((preset) => ({
    value: preset.id,
    label: t(`aiDefaults.tones.${preset.id}`),
})))

function setTone(value: string): void {
    if (!isTalosToneId(value)) return
    void settings.setTone(value)
}

function setMode(key: 'utility_model_mode' | 'research_model_mode', value: string): void {
    if (value !== 'same_as_chat' && value !== 'default_profile') return
    void settings.setAiDefaults({ [key]: value as TalosUtilityModelMode })
}

function setVision(event: Event): void {
    void settings.setAiDefaults({ vision_enabled: (event.target as HTMLInputElement).checked })
}

// Library behaviour lives in the shell prefs but belongs on this panel.
const pendingLibraryEnable = ref(false)
const libraryPolicySaving = ref(false)
const libraryPolicyError = ref(false)
const libraryPolicy = computed(() => settings.state.shell.library_context_policy)
const libraryPolicyRevision = computed(() => libraryPolicy.value?.revision ?? 0)
const libraryEnabled = computed(
    () => libraryPolicy.value?.enabled ?? settings.state.shell.library_context_enabled,
)
const libraryMode = computed<TalosLibraryContextMode>(
    () => libraryPolicy.value?.mode ?? 'broad_compat_v1',
)
const libraryModeValue = computed(
    () => pendingLibraryEnable.value && !libraryEnabled.value ? '' : libraryMode.value,
)
const libraryPolicySource = computed(() => {
    if (pendingLibraryEnable.value && !libraryEnabled.value) return 'pending'
    return libraryPolicy.value ? 'global' : 'legacy'
})
const libraryModeItems = computed<TalosThemedSelectItem[]>(() => [
    { value: 'broad_compat_v1', label: t('aiDefaults.libraryModes.broad') },
    { value: 'smart_relevant_v1', label: t('aiDefaults.libraryModes.smart') },
    { value: 'ask_before_use_v1', label: t('aiDefaults.libraryModes.ask') },
    { value: 'agentic_on_demand_v1', label: t('aiDefaults.libraryModes.onDemand') },
])
const libraryModeBody = computed(() => {
    const key = libraryModeValue.value === 'smart_relevant_v1'
        ? 'smartBody'
        : libraryModeValue.value === 'ask_before_use_v1'
            ? 'askBody'
            : libraryModeValue.value === 'agentic_on_demand_v1'
                ? 'onDemandBody'
                : libraryModeValue.value === 'broad_compat_v1'
                    ? 'broadBody'
                    : 'chooseBody'
    return t(`aiDefaults.libraryModes.${key}`)
})

function isLibraryMode(value: string): value is TalosLibraryContextMode {
    return (TALOS_LIBRARY_CONTEXT_MODES as readonly string[]).includes(value)
}

async function setLibraryEnabled(event: Event): Promise<void> {
    const enabled = (event.target as HTMLInputElement).checked
    libraryPolicyError.value = false
    if (enabled) {
        if (!libraryEnabled.value) pendingLibraryEnable.value = true
        return
    }
    pendingLibraryEnable.value = false
    if (!libraryEnabled.value || libraryPolicySaving.value) return
    libraryPolicySaving.value = true
    try {
        await settings.setLibraryContextPolicy(
            { enabled: false },
            libraryPolicyRevision.value,
        )
    } catch {
        libraryPolicyError.value = true
    } finally {
        libraryPolicySaving.value = false
    }
}

async function setLibraryMode(value: string): Promise<void> {
    if (!isLibraryMode(value) || libraryPolicySaving.value) return
    libraryPolicyError.value = false
    libraryPolicySaving.value = true
    try {
        await settings.setLibraryContextPolicy({
            ...(pendingLibraryEnable.value && !libraryEnabled.value ? { enabled: true } : {}),
            mode: value,
        }, libraryPolicyRevision.value)
        pendingLibraryEnable.value = false
    } catch {
        libraryPolicyError.value = true
    } finally {
        libraryPolicySaving.value = false
    }
}

/**
 * Owner 2026-07-25: the model's tools are governed per ACTION TYPE, and the
 * user owns that setting. The wording avoids the word "tool" where it can:
 * what matters to a person is whether TALOS may READ their things, CHANGE
 * them, or SEND them anywhere.
 */
const toolChoices = computed<TalosThemedSelectItem[]>(() => [
    { value: 'allow', label: t('aiDefaults.alwaysAllow') },
    { value: 'ask', label: t('aiDefaults.askEveryTime') },
    { value: 'deny', label: t('aiDefaults.neverAllow') },
])

function setToolPermission(action: 'read' | 'write' | 'outbound', value: string): void {
    void settings.setToolPermissions({ [action]: value as 'allow' | 'ask' | 'deny' })
}

function setShellFlag(key: 'library_context_enabled' | 'library_autosave_generated', event: Event): void {
    void settings.setShell({ [key]: (event.target as HTMLInputElement).checked })
}
</script>

<template>
    <div class="space-y-4">
        <label class="block">
            <span class="text-xs font-semibold uppercase text-[var(--talos-muted)]">{{ t('aiDefaults.assistantTone') }}</span>
            <TalosThemedSelect
                class="mt-2"
                :model-value="settings.state.tone.preset"
                :items="toneItems"
                :aria-label="t('aiDefaults.assistantTone')"
                @update:model-value="setTone"
            />
            <span class="mt-1 block text-xs leading-5 text-[var(--talos-muted)]">
                {{ t('aiDefaults.toneSuggestionBody') }}
            </span>
        </label>

        <div class="grid gap-4 sm:grid-cols-2">
            <label class="block">
                <span class="text-xs font-semibold uppercase text-[var(--talos-muted)]">{{ t('aiDefaults.utilityModelMode') }}</span>
                <TalosThemedSelect
                    class="mt-2"
                    :model-value="settings.state.ai_defaults.utility_model_mode"
                    :items="modeItems"
                    :aria-label="t('aiDefaults.utilityModelMode')"
                    @update:model-value="setMode('utility_model_mode', $event)"
                />
            </label>
            <label class="block">
                <span class="text-xs font-semibold uppercase text-[var(--talos-muted)]">{{ t('aiDefaults.researchModelMode') }}</span>
                <TalosThemedSelect
                    class="mt-2"
                    :model-value="settings.state.ai_defaults.research_model_mode"
                    :items="modeItems"
                    :aria-label="t('aiDefaults.researchModelMode')"
                    @update:model-value="setMode('research_model_mode', $event)"
                />
            </label>
        </div>

        <label class="flex min-h-14 cursor-pointer items-start justify-between gap-3 border-y border-[var(--talos-border)] py-3">
            <span>
                <span class="block text-sm font-semibold text-[var(--talos-text)]">{{ t('aiDefaults.visionRouting') }}</span>
                <span class="mt-1 block text-xs leading-5 text-[var(--talos-muted)]">{{ t('aiDefaults.visionRoutingBody') }}</span>
            </span>
            <input
                type="checkbox"
                role="switch"
                :aria-label="t('aiDefaults.visionRouting')"
                :checked="settings.state.ai_defaults.vision_enabled"
                class="mt-1 h-5 w-9 accent-[var(--talos-accent)]"
                @change="setVision"
            >
        </label>

        <!-- Owner 2026-07-25: Library behaviour belongs to AI defaults (what the
             model may read / write), not to Appearance. -->
        <label class="flex min-h-14 cursor-pointer items-start justify-between gap-3 border-b border-[var(--talos-border)] py-3">
            <span>
                <span class="block text-sm font-semibold text-[var(--talos-text)]">{{ t('aiDefaults.libraryContext') }}</span>
                <span class="mt-1 block text-xs leading-5 text-[var(--talos-muted)]">{{ t('aiDefaults.libraryContextBody') }}</span>
            </span>
            <input
                type="checkbox"
                role="switch"
                :aria-label="t('aiDefaults.libraryContext')"
                :checked="libraryEnabled || pendingLibraryEnable"
                :disabled="libraryPolicySaving"
                class="mt-1 h-5 w-9 accent-[var(--talos-accent)]"
                @change="setLibraryEnabled"
            >
        </label>

        <section
            v-if="libraryEnabled || pendingLibraryEnable"
            data-testid="talos-library-mode-chooser"
            :data-policy-source="libraryPolicySource"
            class="rounded-xl border border-[var(--talos-border)] bg-[var(--talos-panel)] p-3"
        >
            <label class="block">
                <span class="block text-xs font-semibold uppercase text-[var(--talos-muted)]">
                    {{ t('aiDefaults.libraryMode') }}
                </span>
                <TalosThemedSelect
                    class="mt-2"
                    :model-value="libraryModeValue"
                    :items="libraryModeItems"
                    :disabled="libraryPolicySaving"
                    :aria-label="t('aiDefaults.libraryMode')"
                    :placeholder="t('aiDefaults.libraryModes.choose')"
                    @update:model-value="setLibraryMode"
                />
            </label>
            <p class="mt-2 text-xs leading-5 text-[var(--talos-muted)]">
                {{ libraryModeBody }}
            </p>
            <p
                v-if="libraryPolicyError"
                role="alert"
                class="mt-2 text-xs leading-5 text-[var(--talos-danger)]"
            >
                {{ t('aiDefaults.libraryPolicySaveError') }}
            </p>
        </section>

        <label class="flex min-h-14 cursor-pointer items-start justify-between gap-3 border-b border-[var(--talos-border)] py-3">
            <span>
                <span class="block text-sm font-semibold text-[var(--talos-text)]">{{ t('aiDefaults.autosaveGenerated') }}</span>
                <span class="mt-1 block text-xs leading-5 text-[var(--talos-muted)]">{{ t('aiDefaults.autosaveGeneratedBody') }}</span>
            </span>
            <input
                type="checkbox"
                role="switch"
                :aria-label="t('aiDefaults.autosaveGeneratedAria')"
                :checked="settings.state.shell.library_autosave_generated"
                class="mt-1 h-5 w-9 accent-[var(--talos-accent)]"
                @change="setShellFlag('library_autosave_generated', $event)"
            >
        </label>

        <!-- F1: the web tools exist only once a source is chosen (D3), so this
             sits directly above the permissions that govern them. -->
        <TalosMobileSearchSourcePanel />

        <!-- Owner 2026-07-25: what the model may do on its own. -->
        <section class="pt-4" data-testid="talos-tool-permissions">
            <h3 class="text-sm font-semibold text-[var(--talos-text)]">{{ t('aiDefaults.autonomousTitle') }}</h3>
            <p class="mt-1 text-xs leading-5 text-[var(--talos-muted)]">
                {{ t('aiDefaults.autonomousBody') }}
            </p>

            <label class="mt-3 block">
                <span class="block text-xs font-medium text-[var(--talos-muted)]">{{ t('aiDefaults.readThings') }}</span>
                <TalosThemedSelect
                    class="mt-1"
                    data-testid="talos-tool-permission-read"
                    :model-value="settings.state.tools.read"
                    :items="toolChoices"
                    :aria-label="t('aiDefaults.readPermission')"
                    @update:model-value="setToolPermission('read', $event)"
                />
            </label>

            <label class="mt-3 block">
                <span class="block text-xs font-medium text-[var(--talos-muted)]">{{ t('aiDefaults.writeThings') }}</span>
                <TalosThemedSelect
                    class="mt-1"
                    data-testid="talos-tool-permission-write"
                    :model-value="settings.state.tools.write"
                    :items="toolChoices"
                    :aria-label="t('aiDefaults.writePermission')"
                    @update:model-value="setToolPermission('write', $event)"
                />
            </label>

            <label class="mt-3 block">
                <span class="block text-xs font-medium text-[var(--talos-muted)]">{{ t('aiDefaults.outboundThings') }}</span>
                <TalosThemedSelect
                    class="mt-1"
                    data-testid="talos-tool-permission-outbound"
                    :model-value="settings.state.tools.outbound"
                    :items="toolChoices"
                    :aria-label="t('aiDefaults.outboundPermission')"
                    @update:model-value="setToolPermission('outbound', $event)"
                />
                <span class="mt-1 block text-2xs leading-4 text-[var(--talos-muted)]">
                    {{ t('aiDefaults.outboundBody') }}
                </span>
            </label>
        </section>
    </div>
</template>
