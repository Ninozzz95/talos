<script setup lang="ts">
import { ref, watch } from 'vue'
import { CheckCircle2, CircleAlert, Gauge, Sparkles } from '@lucide/vue'
import TalosMobileProviderIcon from '@/components/models/TalosMobileProviderIcon.vue'
import TalosThemedSwitch from '@/components/talos/ui/TalosThemedSwitch.vue'
import type { TalosMobileModelProfileView } from '@/components/chat/mobileChatTypes'
import { useTalosI18n } from '@/i18n'
import { talosMobileProviderById } from '@/lib/mobileProviders'

const props = defineProps<{
    profile: TalosMobileModelProfileView
    selected: boolean
    busy: boolean
}>()

const emit = defineEmits<{
    select: [profileId: string]
    'toggle-visibility': [profileId: string, visible: boolean]
    probe: [profileId: string]
    'save-display-name': [profileId: string, displayName: string]
}>()

const { t, locale } = useTalosI18n()
const displayDraft = ref(props.profile.display_name)

watch(() => [props.profile.id, props.profile.display_name] as const, () => {
    displayDraft.value = props.profile.display_name
})

function capabilityList(key: string): string[] {
    const value = props.profile.capabilities?.[key]
    return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : []
}

function contextLabel(): string | null {
    const value = props.profile.capabilities?.context_length
    return typeof value === 'number' && Number.isFinite(value)
        ? t('models.context', { value: value.toLocaleString(locale.value) })
        : null
}

function statusLabel(): string {
    if (props.profile.status === 'healthy') return t('models.probePassed')
    if (props.profile.status === 'failed') return t('models.probeFailed')
    if (props.profile.status === 'disabled') return t('models.notChatCompatible')
    return t('models.notTested')
}

function modalityLabel(modality: string): string {
    const known: Record<string, string> = {
        text: 'chat.modalityText',
        image: 'chat.modalityImage',
        audio: 'chat.modalityAudio',
        video: 'chat.modalityVideo',
        file: 'chat.modalityFile',
    }
    return known[modality] ? t(known[modality]) : modality
}
</script>

<template>
    <article
        data-model-card
        :data-model-id="profile.id"
        class="min-w-0 overflow-hidden rounded-[var(--talos-radius-card)] border border-[var(--talos-border)] bg-[var(--talos-panel)] p-[var(--talos-space-control)]"
    >
        <header class="flex min-w-0 items-start gap-[var(--talos-space-inline)]">
            <TalosMobileProviderIcon :provider="profile.provider" class="mt-[calc(var(--talos-space-inline)/2)] size-[calc(var(--talos-icon-size)*1.5)] shrink-0" />
            <div class="min-w-0 flex-1">
                <h5 data-testid="talos-model-catalog-name" class="break-words text-sm font-semibold leading-snug text-[var(--talos-text)]">{{ profile.display_name }}</h5>
                <p class="break-all font-mono text-2xs leading-snug text-[var(--talos-muted)]">{{ profile.model }}</p>
            </div>
            <span class="shrink-0 rounded-[var(--talos-radius-control)] border border-[var(--talos-border)] px-[var(--talos-space-inline)] py-[calc(var(--talos-space-inline)/2)] text-3xs font-semibold uppercase text-[var(--talos-muted)]">
                {{ talosMobileProviderById(profile.provider).shortLabel }}
            </span>
        </header>

        <div class="mt-[var(--talos-space-inline)] flex min-w-0 flex-wrap items-center gap-[var(--talos-space-inline)] text-3xs font-medium text-[var(--talos-muted)]">
            <span v-if="contextLabel()" class="rounded-[var(--talos-radius-control)] border border-[var(--talos-border)] px-[var(--talos-space-inline)] py-[calc(var(--talos-space-inline)/2)]">{{ contextLabel() }}</span>
            <span v-if="profile.supports_thinking" class="rounded-[var(--talos-radius-control)] border border-[var(--talos-accent-border)] px-[var(--talos-space-inline)] py-[calc(var(--talos-space-inline)/2)] text-[var(--talos-accent)]">{{ $t('models.reasoning') }}</span>
            <span class="inline-flex items-center gap-[calc(var(--talos-space-inline)/2)]" :class="profile.status === 'failed' ? 'text-[var(--talos-danger)]' : ''">
                <CheckCircle2 v-if="profile.status === 'healthy'" class="size-[var(--talos-icon-size)] text-[var(--talos-success)]" aria-hidden="true" />
                <CircleAlert v-else class="size-[var(--talos-icon-size)]" aria-hidden="true" />
                {{ statusLabel() }}
            </span>
        </div>

        <div class="mt-[var(--talos-space-control)] grid grid-cols-2 gap-[var(--talos-space-inline)]">
            <button
                type="button"
                data-primary-model-action
                :aria-label="$t('models.useAsDefault', { name: profile.display_name })"
                :aria-pressed="selected"
                :disabled="profile.status === 'disabled' || busy"
                class="inline-flex min-h-touch min-w-0 items-center justify-center gap-[var(--talos-space-inline)] rounded-[var(--talos-radius-control)] border px-[var(--talos-space-inline)] text-xs font-semibold disabled:opacity-50"
                :class="selected ? 'border-[var(--talos-accent)] bg-[var(--talos-active)] text-[var(--talos-text)]' : 'border-[var(--talos-border)] text-[var(--talos-muted)]'"
                @click="emit('select', profile.id)"
            >
                <Sparkles class="size-[var(--talos-icon-size)] shrink-0" aria-hidden="true" />
                <span class="min-w-0">{{ selected ? $t('models.default') : $t('models.useModel') }}</span>
            </button>
            <!--
                L'ULTIMO interruttore fatto a mano dell'app.

                Era un `<button role="switch">` con due icone e un'etichetta che
                cambiava fra «Nel composer» e «Nascosto». Due difetti in uno: non
                somigliava a nessun altro interruttore di TALOS, e il testo
                visibile cambiava con lo stato mentre il nome accessibile no —
                due segnali diversi sulla stessa cosa, e chi legge lo schermo ne
                sentiva uno solo.

                Adesso l'etichetta è FISSA e dice cosa si sta accendendo; lo
                stato lo dice l'interruttore, che è ciò che la ricerca del
                2026-08-02 prescrive (APG: il nome accessibile non cambia con lo
                stato).
            -->
            <label
                data-primary-model-action
                class="inline-flex min-h-touch min-w-0 items-center gap-[var(--talos-space-inline)] rounded-[var(--talos-radius-control)] border border-[var(--talos-border)] px-[var(--talos-space-inline)] text-xs font-semibold text-[var(--talos-muted)]"
            >
                <span class="min-w-0 truncate">{{ $t('models.inComposer') }}</span>
                <TalosThemedSwitch
                    :model-value="profile.show_in_composer"
                    :aria-label="$t('models.showInComposer', { name: profile.display_name })"
                    :disabled="profile.status === 'disabled' || busy"
                    test-id="talos-model-visibility-switch"
                    @update:model-value="emit('toggle-visibility', profile.id, $event)"
                />
            </label>
        </div>

        <details class="mt-[var(--talos-space-control)] border-t border-[var(--talos-border)] pt-[var(--talos-space-inline)]">
            <summary class="flex min-h-touch cursor-pointer items-center text-xs font-semibold text-[var(--talos-muted)]">{{ $t('models.catalogDetailsAndActions') }}</summary>
            <div class="space-y-[var(--talos-space-control)] pb-[var(--talos-space-inline)]">
                <div class="flex flex-wrap gap-[var(--talos-space-inline)] text-3xs font-medium text-[var(--talos-muted)]">
                    <span class="rounded-[var(--talos-radius-control)] border border-[var(--talos-border)] px-[var(--talos-space-inline)] py-[calc(var(--talos-space-inline)/2)]">
                        {{ profile.capabilities?.provenance === 'declared' ? $t('models.declaredCapabilities') : $t('models.observedMetadata') }}
                    </span>
                    <span v-for="modality in capabilityList('input_modalities')" :key="`in-${modality}`" class="rounded-[var(--talos-radius-control)] border border-[var(--talos-border)] px-[var(--talos-space-inline)] py-[calc(var(--talos-space-inline)/2)]">{{ $t('models.modalityInput', { modality: modalityLabel(modality) }) }}</span>
                </div>
                <button
                    type="button"
                    :aria-label="$t('models.testCompletionFor', { name: profile.display_name })"
                    :disabled="profile.status === 'disabled' || busy"
                    class="inline-flex min-h-touch w-full items-center justify-center gap-[var(--talos-space-inline)] rounded-[var(--talos-radius-control)] border border-[var(--talos-border)] px-[var(--talos-space-inline)] text-xs font-semibold text-[var(--talos-text)] disabled:opacity-50"
                    @click="emit('probe', profile.id)"
                >
                    <Gauge class="size-[var(--talos-icon-size)]" aria-hidden="true" /> {{ busy ? $t('models.testing') : $t('models.testCompletion') }}
                </button>
                <div class="grid min-w-0 gap-[var(--talos-space-inline)] sm:grid-cols-[minmax(0,1fr)_auto]">
                    <input v-model="displayDraft" type="text" maxlength="255" :aria-label="$t('models.displayNameFor', { name: profile.display_name })" class="h-[var(--talos-touch-target)] min-w-0 rounded-[var(--talos-radius-control)] border border-[var(--talos-border)] bg-[var(--talos-input)] px-[var(--talos-space-inline)] text-sm text-[var(--talos-text)]">
                    <button type="button" :aria-label="$t('models.saveDisplayNameFor', { name: profile.display_name })" :disabled="busy" class="h-[var(--talos-touch-target)] rounded-[var(--talos-radius-control)] bg-[var(--talos-accent)] px-[var(--talos-space-control)] text-xs font-semibold text-[var(--talos-accent-text)] disabled:opacity-50" @click="emit('save-display-name', profile.id, displayDraft)">{{ $t('common.save') }}</button>
                </div>
            </div>
        </details>
    </article>
</template>
