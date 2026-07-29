<script setup lang="ts">
import { computed, ref } from 'vue'
import { useTalosI18n } from '@/i18n'
import { talosTranslatableErrorMessage } from '@/i18n/uiErrors'
import { Plus, Trash2, Wrench } from '@lucide/vue'
import TalosThemedSelect from '@/components/talos/ui/TalosThemedSelect.vue'
import type { TalosMobileProviderId } from '@/components/chat/mobileChatTypes'
import { TALOS_MOBILE_PROVIDERS, talosMobileProviderById } from '@/lib/mobileProviders'
import { useChatController } from '@/stores/chatController'

const controller = useChatController()
const { t } = useTalosI18n()
const provider = ref<TalosMobileProviderId>('openai')
const model = ref('')
const displayName = ref('')
const reasoning = ref(false)
const vision = ref(false)
const busy = ref(false)
const error = ref('')
const providerItems = TALOS_MOBILE_PROVIDERS
    .filter((item): item is typeof item & { id: TalosMobileProviderId } => item.id !== 'unknown')
    .map((item) => ({ value: item.id, label: item.label }))
const manualModels = computed(() => controller.modelLabPreferences.value.manual_models)

function stableManualId(providerId: TalosMobileProviderId, modelId: string): string {
    let hash = 2166136261
    for (const character of `${providerId}:${modelId}`) {
        hash ^= character.codePointAt(0) ?? 0
        hash = Math.imul(hash, 16777619)
    }
    return `manual-${providerId}-${(hash >>> 0).toString(36)}`
}

function reasoningParameter(providerId: TalosMobileProviderId): string {
    if (providerId === 'openai') return 'reasoning_effort'
    if (providerId === 'ollama') return 'think'
    if (providerId === 'anthropic' || providerId === 'gemini') return 'thinking'
    return 'reasoning'
}

async function save(): Promise<void> {
    const modelId = model.value.trim()
    const label = displayName.value.trim()
    error.value = ''
    if (!modelId) {
        error.value = t('models.enterModelId')
        return
    }
    if (!label) {
        error.value = t('models.enterDisplayName')
        return
    }
    busy.value = true
    try {
        await controller.saveManualModel({
            id: stableManualId(provider.value, modelId),
            provider: provider.value,
            model: modelId,
            display_name: label,
            input_modalities: vision.value ? ['text', 'image'] : ['text'],
            output_modalities: ['text'],
            supported_parameters: reasoning.value ? [reasoningParameter(provider.value)] : [],
        })
        model.value = ''
        displayName.value = ''
        reasoning.value = false
        vision.value = false
    } catch (cause) {
        error.value = talosTranslatableErrorMessage(cause, t)
            ?? (cause instanceof Error ? cause.message : t('models.manualSaveFailed'))
    } finally {
        busy.value = false
    }
}

async function remove(id: string): Promise<void> {
    if (busy.value) return
    busy.value = true
    error.value = ''
    try {
        await controller.removeManualModel(id)
    } catch (cause) {
        error.value = talosTranslatableErrorMessage(cause, t)
            ?? (cause instanceof Error ? cause.message : t('models.manualRemoveFailed'))
    } finally {
        busy.value = false
    }
}
</script>

<template>
    <section aria-labelledby="manual-model-title" class="rounded-md border border-[var(--talos-border)] bg-[var(--talos-panel)] p-3">
        <header>
            <h5 id="manual-model-title" class="flex items-center gap-2 text-sm font-semibold text-[var(--talos-text)]">
                <Wrench class="size-4 text-[var(--talos-accent)]" aria-hidden="true" /> {{ $t('models.manualRecovery') }}
            </h5>
            <p class="mt-1 text-xs leading-5 text-[var(--talos-muted)]">
                {{ $t('models.manualRecoveryDetail') }}
            </p>
        </header>

        <p v-if="error" role="alert" class="mt-3 rounded-md border border-[var(--talos-danger-border)] bg-[var(--talos-danger-soft)] px-3 py-2 text-xs text-[var(--talos-text)]">{{ error }}</p>

        <form class="mt-3 grid min-w-0 gap-3 sm:grid-cols-2" @submit.prevent="save">
            <label class="min-w-0">
                <span class="mb-1 block text-xs font-medium text-[var(--talos-muted)]">{{ $t('models.provider') }}</span>
                <TalosThemedSelect v-model="provider" :items="providerItems" :aria-label="$t('models.manualProvider')" />
            </label>
            <label class="min-w-0">
                <span class="mb-1 block text-xs font-medium text-[var(--talos-muted)]">{{ $t('models.modelId') }}</span>
                <input v-model="model" type="text" maxlength="512" autocapitalize="none" autocomplete="off" :aria-label="$t('models.manualModelId')" :placeholder="$t('models.modelIdPlaceholder')" class="h-11 w-full rounded-md border border-[var(--talos-border)] bg-[var(--talos-input,var(--talos-background))] px-3 text-sm text-[var(--talos-text)] outline-none focus:border-[var(--talos-accent)]">
            </label>
            <label class="min-w-0 sm:col-span-2">
                <span class="mb-1 block text-xs font-medium text-[var(--talos-muted)]">{{ $t('models.displayName') }}</span>
                <input v-model="displayName" type="text" maxlength="255" :aria-label="$t('models.manualDisplayName')" :placeholder="$t('models.modelLabelPlaceholder')" class="h-11 w-full rounded-md border border-[var(--talos-border)] bg-[var(--talos-input,var(--talos-background))] px-3 text-sm text-[var(--talos-text)] outline-none focus:border-[var(--talos-accent)]">
            </label>
            <label class="flex min-h-11 items-center gap-2 text-xs font-medium text-[var(--talos-text)]">
                <input v-model="reasoning" type="checkbox" :aria-label="$t('models.declareReasoning')" class="size-4 accent-[var(--talos-accent)]">
                {{ $t('models.declareReasoning') }}
            </label>
            <label class="flex min-h-11 items-center gap-2 text-xs font-medium text-[var(--talos-text)]">
                <input v-model="vision" type="checkbox" :aria-label="$t('models.declareImageInputSupport')" class="size-4 accent-[var(--talos-accent)]">
                {{ $t('models.declareImageInput') }}
            </label>
            <button type="submit" :aria-label="$t('models.saveManual')" :disabled="busy" class="inline-flex min-h-11 items-center justify-center gap-2 rounded-md bg-[var(--talos-accent)] px-3 text-sm font-semibold text-[var(--talos-accent-contrast,var(--talos-accent-text))] disabled:opacity-50 sm:col-span-2">
                <Plus class="size-4" aria-hidden="true" /> {{ $t('models.addManual') }}
            </button>
        </form>

        <ul v-if="manualModels.length" class="mt-4 divide-y divide-[var(--talos-border)] border-y border-[var(--talos-border)]">
            <li v-for="entry in manualModels" :key="entry.id" class="flex min-w-0 items-center gap-2 py-2">
                <div class="min-w-0 flex-1">
                    <div class="truncate text-sm font-medium text-[var(--talos-text)]">{{ entry.display_name }}</div>
                    <div class="truncate font-mono text-2xs text-[var(--talos-muted)]">{{ talosMobileProviderById(entry.provider).label }} / {{ entry.model }}</div>
                </div>
                <button type="button" :aria-label="$t('models.removeManual', { name: entry.display_name })" :disabled="busy" class="inline-flex size-10 items-center justify-center rounded-md border border-[var(--talos-border)] text-[var(--talos-muted)] disabled:opacity-50" @click="remove(entry.id)">
                    <Trash2 class="size-4" aria-hidden="true" />
                </button>
            </li>
        </ul>
    </section>
</template>
