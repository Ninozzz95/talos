<script setup lang="ts">
import { computed, ref } from 'vue'
import { useTalosI18n } from '@/i18n'
import TalosThemedSelect, { type TalosThemedSelectItem } from '@/components/talos/ui/TalosThemedSelect.vue'
import TalosThemedSwitch from '@/components/talos/ui/TalosThemedSwitch.vue'
import { useSettingsStore } from '@/stores/settings'
import { TALOS_TONE_PRESETS, isTalosToneId } from '@/lib/tone'
import {
    TALOS_LIBRARY_CONTEXT_MODES,
    type TalosLibraryContextMode,
} from '@/lib/chat/libraryPolicy'

const settings = useSettingsStore()
const { t } = useTalosI18n()
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

function setVision(enabled: boolean): void {
    void settings.setAiDefaults({ vision_enabled: enabled })
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

async function setLibraryEnabled(enabled: boolean): Promise<void> {
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
function setShellFlag(key: 'library_context_enabled' | 'library_autosave_generated', enabled: boolean): void {
    void settings.setShell({ [key]: enabled })
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

        <!--
            Qui c'erano due tendine, «Modalita' modello di utilita'» e «Modalita'
            modello di ricerca». Non erano nel posto sbagliato: **non erano
            lette da nessuno**. Nessuna riga del codice consultava
            `utility_model_mode` o `research_model_mode` — sembravano governare
            quale modello facesse cosa, e non governavano niente.

            Un comando inerte e' peggio di un comando assente: chi lo trova
            crede di aver deciso, e quando il risultato non cambia cerca la
            causa da un'altra parte.

            Le scelte VERE esistono e sono migliori di queste: il modello della
            conversazione sta nel compositore, dove si sceglie mentre si scrive;
            i due modelli della ricerca stanno nella stazione, accanto al piano
            che governano. Una casa sola piu' un rimando, non due copie.
        -->
        <p class="rounded-xl border border-[var(--talos-border)] bg-[var(--talos-panel)] p-3 text-xs leading-5 text-[var(--talos-muted)]">
            {{ t('aiDefaults.modelChoicesElsewhere') }}
        </p>

        <div class="flex min-h-14 items-start justify-between gap-3 border-y border-[var(--talos-border)] py-3">
            <span>
                <span class="block text-sm font-semibold text-[var(--talos-text)]">{{ t('aiDefaults.visionRouting') }}</span>
                <span class="mt-1 block text-xs leading-5 text-[var(--talos-muted)]">{{ t('aiDefaults.visionRoutingBody') }}</span>
            </span>
            <TalosThemedSwitch
                class="mt-1"
                :aria-label="t('aiDefaults.visionRouting')"
                :model-value="settings.state.ai_defaults.vision_enabled"
                @update:model-value="setVision($event)"
                @click.stop
            />
        </div>

        <!-- Owner 2026-07-25: Library behaviour belongs to AI defaults (what the
             model may read / write), not to Appearance. -->
        <div class="flex min-h-14 items-start justify-between gap-3 border-b border-[var(--talos-border)] py-3">
            <span>
                <span class="block text-sm font-semibold text-[var(--talos-text)]">{{ t('aiDefaults.libraryContext') }}</span>
                <span class="mt-1 block text-xs leading-5 text-[var(--talos-muted)]">{{ t('aiDefaults.libraryContextBody') }}</span>
            </span>
            <TalosThemedSwitch
                class="mt-1"
                :aria-label="t('aiDefaults.libraryContext')"
                :model-value="libraryEnabled || pendingLibraryEnable"
                :disabled="libraryPolicySaving"
                @update:model-value="setLibraryEnabled"
                @click.stop
            />
        </div>

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

        <div class="flex min-h-14 items-start justify-between gap-3 border-b border-[var(--talos-border)] py-3">
            <span>
                <span class="block text-sm font-semibold text-[var(--talos-text)]">{{ t('aiDefaults.autosaveGenerated') }}</span>
                <span class="mt-1 block text-xs leading-5 text-[var(--talos-muted)]">{{ t('aiDefaults.autosaveGeneratedBody') }}</span>
            </span>
            <TalosThemedSwitch
                class="mt-1"
                :aria-label="t('aiDefaults.autosaveGeneratedAria')"
                :model-value="settings.state.shell.library_autosave_generated"
                @update:model-value="setShellFlag('library_autosave_generated', $event)"
                @click.stop
            />
        </div>

        <!-- The search source used to sit here. It moved to Settings → Search,
             which is where the settings hub already had an entry for it and
             where its neighbours (Browser, Integrations) live: a service with
             an address and a key is a connection, not a default. What stays in
             this screen is the SEARCH MODEL MODE above — which model answers a
             search-shaped question — because that is a default and not a
             connection. Owner, 2026-08-01. -->

    </div>
</template>
