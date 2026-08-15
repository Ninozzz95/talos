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
    .filter((item): item is typeof item & { id: TalosMobileProviderId } => item.id !== 'unknown' && item.configurable)
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
    <section aria-labelledby="manual-model-title" class="rounded-[var(--talos-radius-card)] border border-[var(--talos-border)] bg-[var(--talos-panel)] p-[var(--talos-space-card)]">
        <header>
            <h5 id="manual-model-title" class="flex items-center gap-[var(--talos-space-inline)] text-sm font-semibold text-[var(--talos-text)]">
                <Wrench class="size-[var(--talos-icon-size)] text-[var(--talos-accent)]" aria-hidden="true" /> {{ $t('models.manualRecovery') }}
            </h5>
            <p class="mt-[var(--talos-space-inline)] text-xs leading-5 text-[var(--talos-muted)]">
                {{ $t('models.manualRecoveryDetail') }}
            </p>
        </header>

        <p v-if="error" role="alert" class="mt-[var(--talos-space-section)] rounded-[var(--talos-radius-control)] border border-[var(--talos-danger-border)] bg-[var(--talos-danger-soft)] p-[var(--talos-space-control)] text-xs text-[var(--talos-text)]">{{ error }}</p>

        <form class="mt-[var(--talos-space-section)] grid min-w-0 gap-[var(--talos-space-section)] sm:grid-cols-2" @submit.prevent="save">
            <label class="min-w-0">
                <span class="mb-[var(--talos-space-inline)] block text-xs font-medium text-[var(--talos-muted)]">{{ $t('models.provider') }}</span>
                <TalosThemedSelect v-model="provider" :items="providerItems" :aria-label="$t('models.manualProvider')" />
            </label>
            <label class="min-w-0">
                <span class="mb-[var(--talos-space-inline)] block text-xs font-medium text-[var(--talos-muted)]">{{ $t('models.modelId') }}</span>
                <input v-model="model" type="text" maxlength="512" autocapitalize="none" autocomplete="off" :aria-label="$t('models.manualModelId')" :placeholder="$t('models.modelIdPlaceholder')" class="h-[var(--talos-touch-target)] w-full rounded-[var(--talos-radius-control)] border border-[var(--talos-border)] bg-[var(--talos-input)] px-[var(--talos-space-control)] text-sm text-[var(--talos-text)] outline-none focus:border-[var(--talos-accent)]">
            </label>
            <label class="min-w-0 sm:col-span-2">
                <span class="mb-[var(--talos-space-inline)] block text-xs font-medium text-[var(--talos-muted)]">{{ $t('models.displayName') }}</span>
                <input v-model="displayName" type="text" maxlength="255" :aria-label="$t('models.manualDisplayName')" :placeholder="$t('models.modelLabelPlaceholder')" class="h-[var(--talos-touch-target)] w-full rounded-[var(--talos-radius-control)] border border-[var(--talos-border)] bg-[var(--talos-input)] px-[var(--talos-space-control)] text-sm text-[var(--talos-text)] outline-none focus:border-[var(--talos-accent)]">
            </label>
            <label class="flex min-h-touch items-center gap-[var(--talos-space-inline)] text-xs font-medium text-[var(--talos-text)]">
                <input v-model="reasoning" type="checkbox" :aria-label="$t('models.declareReasoning')" class="size-[var(--talos-icon-size)] accent-[var(--talos-accent)]">
                {{ $t('models.declareReasoning') }}
            </label>
            <label class="flex min-h-touch items-center gap-[var(--talos-space-inline)] text-xs font-medium text-[var(--talos-text)]">
                <input v-model="vision" type="checkbox" :aria-label="$t('models.declareImageInputSupport')" class="size-[var(--talos-icon-size)] accent-[var(--talos-accent)]">
                {{ $t('models.declareImageInput') }}
            </label>
            <button type="submit" :aria-label="$t('models.saveManual')" :disabled="busy" class="inline-flex min-h-touch items-center justify-center gap-[var(--talos-space-inline)] rounded-[var(--talos-radius-control)] bg-[var(--talos-accent)] px-[var(--talos-space-control)] text-sm font-semibold text-[var(--talos-accent-text)] disabled:opacity-50 sm:col-span-2">
                <Plus class="size-[var(--talos-icon-size)]" aria-hidden="true" /> {{ $t('models.addManual') }}
            </button>
        </form>

        <ul v-if="manualModels.length" class="mt-[var(--talos-space-section)] divide-y divide-[var(--talos-border)] border-y border-[var(--talos-border)]">
            <li v-for="entry in manualModels" :key="entry.id" class="flex min-w-0 items-center gap-[var(--talos-space-inline)] py-[var(--talos-space-inline)]">
                <div class="min-w-0 flex-1">
                    <div class="truncate text-sm font-medium text-[var(--talos-text)]">{{ entry.display_name }}</div>
                    <div class="truncate font-mono text-2xs text-[var(--talos-muted)]">{{ talosMobileProviderById(entry.provider).label }} / {{ entry.model }}</div>
                </div>
                <button type="button" :aria-label="$t('models.removeManual', { name: entry.display_name })" :disabled="busy" class="inline-flex size-[var(--talos-touch-target)] items-center justify-center rounded-[var(--talos-radius-control)] border border-[var(--talos-border)] text-[var(--talos-muted)] disabled:opacity-50" @click="remove(entry.id)">
                    <Trash2 class="size-[var(--talos-icon-size)]" aria-hidden="true" />
                </button>
            </li>
        </ul>
    </section>
</template>
