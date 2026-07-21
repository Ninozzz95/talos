<script setup lang="ts">
import { computed, ref } from 'vue'
import { WandSparkles, Gauge, Send, FlaskConical } from '@lucide/vue'
import TalosComposerModelPicker from './TalosComposerModelPicker.vue'
import {
    TALOS_MOBILE_MODEL_PROFILES,
    TALOS_MOBILE_ROUTING_PROFILES,
    talosClampEffort,
    talosComposerEffortLadder,
    talosEffortLabel,
    type TalosModelProfile,
} from '@/lib/talosModels'

// Mobile composer dock mirroring FV2-06.0 (desktop TalosComposerDock/TalosSlimComposer):
// themed model picker + effort chip + extended-thinking. Sending is GATED until the
// local runtime (M3); no provider secrets are held (Vault/M2 gated).
const emit = defineEmits<{ openModelLab: [] }>()

const modelProfiles = [...TALOS_MOBILE_MODEL_PROFILES]
const routingProfiles = [...TALOS_MOBILE_ROUTING_PROFILES]

const selectedModelProfileId = ref(modelProfiles[0]?.id ?? '')
const selectedRoutingProfileId = ref('') // '' = a specific model is chosen (not Auto)
const extendedThinking = ref(false)
const input = ref('')
const modelOpen = ref(false)
const effortOpen = ref(false)

const selectedProfile = computed<TalosModelProfile | null>(() =>
    selectedRoutingProfileId.value ? null : (modelProfiles.find((p) => p.id === selectedModelProfileId.value) ?? null),
)

const effort = ref(talosClampEffort(selectedProfile.value, 'high'))

const modelLabel = computed(() => {
    if (selectedRoutingProfileId.value) {
        return routingProfiles.find((r) => r.id === selectedRoutingProfileId.value)?.name ?? 'Auto'
    }
    return selectedProfile.value?.display_name ?? 'Select model'
})
const effortLadder = computed(() => talosComposerEffortLadder(selectedProfile.value))
const supportsThinking = computed(() => selectedProfile.value?.supports_thinking === true)

function onSelectModel(id: string): void {
    selectedModelProfileId.value = id
    selectedRoutingProfileId.value = ''
    effort.value = talosClampEffort(modelProfiles.find((p) => p.id === id) ?? null, effort.value)
    modelOpen.value = false
}
function onSelectRouting(id: string): void {
    selectedRoutingProfileId.value = id
    modelOpen.value = false
}
function chooseEffort(level: string): void {
    effort.value = level as typeof effort.value
    effortOpen.value = false
}
function openModelLab(): void {
    modelOpen.value = false
    emit('openModelLab')
}
</script>

<template>
    <div
        data-testid="talos-mobile-composer"
        class="talos-mobile-composer border-t border-[var(--talos-border)] bg-[var(--talos-header)] p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]"
    >
        <div class="mb-2 flex items-center gap-2">
            <div class="relative">
                <button
                    type="button"
                    aria-label="Choose model profile"
                    data-testid="talos-composer-model-trigger"
                    class="inline-flex items-center gap-1.5 rounded-md border border-[var(--talos-border)] px-2 py-1 text-xs text-[var(--talos-text)]"
                    @click="modelOpen = !modelOpen"
                >
                    <WandSparkles v-if="selectedRoutingProfileId" class="h-3.5 w-3.5 text-[var(--talos-accent)]" aria-hidden="true" />
                    <span class="max-w-[9rem] truncate">{{ modelLabel }}</span>
                </button>
                <div
                    v-if="modelOpen"
                    data-testid="talos-model-popover"
                    class="absolute bottom-full left-0 z-30 mb-2 w-72 rounded-md border border-[var(--talos-border)] bg-[var(--talos-window-bg)] p-2 shadow-lg"
                >
                    <TalosComposerModelPicker
                        :model-profiles="modelProfiles"
                        :model-routing-profiles="routingProfiles"
                        :selected-model-profile-id="selectedModelProfileId"
                        :selected-model-routing-profile-id="selectedRoutingProfileId"
                        @select-model-profile="onSelectModel"
                        @select-model-routing-profile="onSelectRouting"
                    />
                    <div class="mt-2 flex justify-end border-t border-[var(--talos-border)] pt-2">
                        <button
                            type="button"
                            data-testid="talos-composer-modellab"
                            class="inline-flex items-center gap-1 text-xs text-[var(--talos-accent)]"
                            @click="openModelLab"
                        >
                            <FlaskConical class="h-3.5 w-3.5" aria-hidden="true" /> Model Lab
                        </button>
                    </div>
                </div>
            </div>

            <div class="relative">
                <button
                    type="button"
                    aria-label="Choose reasoning effort"
                    data-testid="talos-composer-effort-chip"
                    class="inline-flex items-center gap-1.5 rounded-md border border-[var(--talos-border)] px-2 py-1 text-xs text-[var(--talos-text)]"
                    @click="effortOpen = !effortOpen"
                >
                    <Gauge class="h-3.5 w-3.5 text-[var(--talos-accent)]" aria-hidden="true" /> Effort · {{ talosEffortLabel(effort) }}
                </button>
                <div
                    v-if="effortOpen"
                    data-testid="talos-effort-popover"
                    class="absolute bottom-full left-0 z-30 mb-2 w-48 rounded-md border border-[var(--talos-border)] bg-[var(--talos-window-bg)] p-2 shadow-lg"
                >
                    <button
                        v-for="level in effortLadder"
                        :key="level"
                        type="button"
                        :data-effort-level="level"
                        class="flex w-full items-center rounded-md px-2 py-1.5 text-left text-sm"
                        :class="level === effort ? 'bg-[var(--talos-accent-soft)] text-[var(--talos-accent)]' : 'text-[var(--talos-text)] hover:bg-[var(--talos-active)]'"
                        @click="chooseEffort(level)"
                    >{{ talosEffortLabel(level) }}</button>
                    <label
                        v-if="supportsThinking"
                        class="mt-2 flex items-center justify-between border-t border-[var(--talos-border)] pt-2 text-xs text-[var(--talos-muted)]"
                    >
                        Extended thinking
                        <button
                            type="button"
                            role="switch"
                            :aria-checked="extendedThinking"
                            aria-label="Extended thinking"
                            data-testid="talos-thinking-switch"
                            class="h-5 w-9 rounded-full"
                            :class="extendedThinking ? 'bg-[var(--talos-accent)]' : 'bg-[var(--talos-border)]'"
                            @click="extendedThinking = !extendedThinking"
                        ></button>
                    </label>
                </div>
            </div>
        </div>

        <div class="flex items-end gap-2">
            <textarea
                v-model="input"
                rows="1"
                aria-label="Message"
                placeholder="Message TALOS…"
                class="min-h-11 flex-1 resize-none rounded-md border border-[var(--talos-border)] bg-[var(--talos-panel)] px-3 py-2 text-sm text-[var(--talos-text)] placeholder:text-[var(--talos-muted)]"
            ></textarea>
            <button
                type="button"
                aria-label="Send"
                disabled
                data-testid="talos-composer-send"
                title="Sending is available once the local runtime lands (M3)"
                class="inline-flex min-h-11 min-w-11 items-center justify-center rounded-md bg-[var(--talos-accent)] text-[var(--talos-accent-text)] opacity-60"
            >
                <Send class="h-4 w-4" aria-hidden="true" />
            </button>
        </div>
    </div>
</template>
