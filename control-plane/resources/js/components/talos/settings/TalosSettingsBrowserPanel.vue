<script setup lang="ts">
import { computed } from 'vue'
import { MousePointerClick, ShieldCheck } from '@lucide/vue'
import TalosThemedSelect from '../ui/TalosThemedSelect.vue'
import TalosFileAuthorityPanel from './TalosFileAuthorityPanel.vue'
import {
    TALOS_BROWSER_HMI_MODES,
    talosBrowserHmiModeLabel,
    talosBrowserHmiStrictness,
    type TalosBrowserHmiMode,
    type TalosBrowserHmiPolicyState,
} from '../../../lib/talosBrowserHmiPolicy'

const props = defineProps<{
    modelValue: TalosBrowserHmiMode
    policy: TalosBrowserHmiPolicyState | null
    activeTalosSessionId?: string | null
}>()

const emit = defineEmits<{
    'update:modelValue': [mode: TalosBrowserHmiMode]
}>()

const effectiveMode = computed(() => props.policy?.effective_mode ?? props.modelValue)

function choiceDisabled(mode: TalosBrowserHmiMode) {
    const floor = props.policy?.workspace_minimum_mode ?? null
    return talosBrowserHmiStrictness(mode) < talosBrowserHmiStrictness(floor)
}

const browserModeOptions = computed(() => TALOS_BROWSER_HMI_MODES.map((mode) => ({
    value: mode,
    label: talosBrowserHmiModeLabel(mode),
    disabled: choiceDisabled(mode),
})))

function updateMode(value: string) {
    emit('update:modelValue', value as TalosBrowserHmiMode)
}
</script>

<template>
    <div class="space-y-3">
        <section class="rounded-md border border-[var(--talos-border)] bg-[var(--talos-panel-soft)] p-4">
            <div class="flex items-start gap-3">
                <MousePointerClick class="mt-0.5 h-4 w-4 shrink-0 text-[var(--talos-accent)]" />
                <div class="min-w-0 flex-1">
                    <span class="block text-sm font-semibold text-[var(--talos-text)]">Human browser interaction policy</span>
                    <p class="mt-1 text-xs leading-5 text-[var(--talos-muted)]">
                        Controls what happens when you click an integrity-verified browser capture. Page content and AI output can never approve an action.
                    </p>
                    <TalosThemedSelect
                        :model-value="modelValue"
                        class="mt-3"
                        :items="browserModeOptions"
                        aria-label="Browser interaction policy"
                        @update:model-value="updateMode"
                    />
                </div>
            </div>
        </section>

        <section class="rounded-md border border-[var(--talos-border)] bg-[var(--talos-panel)] p-4">
            <div class="flex items-center gap-2 text-sm font-semibold text-[var(--talos-text)]">
                <ShieldCheck class="h-4 w-4 text-[var(--talos-accent)]" />
                Effective: {{ talosBrowserHmiModeLabel(effectiveMode) }}
            </div>
            <p v-if="policy?.workspace_minimum_mode" class="mt-2 text-xs leading-5 text-[var(--talos-muted)]">
                Workspace minimum: {{ talosBrowserHmiModeLabel(policy.workspace_minimum_mode) }}.
                <span v-if="policy.preference_constrained">Your stored preference is weaker, so the workspace minimum is enforced.</span>
            </p>
            <p v-else class="mt-2 text-xs leading-5 text-[var(--talos-muted)]">
                No stricter workspace minimum is configured. Sensitive and ambiguous effects still fail closed.
            </p>
        </section>

        <TalosFileAuthorityPanel :active-talos-session-id="activeTalosSessionId ?? null" />
    </div>
</template>
