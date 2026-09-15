<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { ChevronDown, ShieldCheck } from '@lucide/vue'
import { useTalosI18n } from '@/i18n'
import {
    talosForgetHuggingFaceToken,
    talosLocalModels,
    talosRefreshHuggingFaceToken,
    talosSetHuggingFaceToken,
} from '@/stores/localModels'

const { t } = useTalosI18n()
const draft = ref('')
const busy = ref(false)
const error = ref(false)
const expanded = ref(false)

async function refresh(): Promise<void> {
    error.value = false
    try {
        await talosRefreshHuggingFaceToken()
    } catch {
        error.value = true
    }
}

async function save(): Promise<void> {
    const value = draft.value.trim()
    if (!value || busy.value) return

    // Clear before the first await: a rejected write must not leave the secret
    // in reactive state, rendered HTML, screenshots, or a backend error.
    draft.value = ''
    busy.value = true
    error.value = false
    try {
        await talosSetHuggingFaceToken(value)
    } catch {
        error.value = true
    } finally {
        busy.value = false
    }
}

async function forget(): Promise<void> {
    if (busy.value) return
    busy.value = true
    error.value = false
    try {
        await talosForgetHuggingFaceToken()
    } catch {
        error.value = true
    } finally {
        busy.value = false
    }
}

onMounted(() => { void refresh() })
</script>

<template>
    <article
        data-testid="talos-hf-access-card"
        class="min-w-0 overflow-hidden rounded-[var(--talos-radius-card)] border border-[var(--talos-border)] bg-[var(--talos-panel)]"
    >
        <h3>
            <button
                id="talos-hf-access-heading"
                type="button"
                data-testid="talos-hf-access-toggle"
                :aria-expanded="expanded"
                aria-controls="talos-hf-access-panel"
                class="talos-pressable flex min-h-touch w-full min-w-0 items-center gap-[var(--talos-space-inline)] rounded-[var(--talos-radius-control)] p-[var(--talos-space-card)] text-left"
                @click="expanded = !expanded"
            >
                <span aria-hidden="true" class="grid size-[calc(var(--talos-icon-size)*1.75)] shrink-0 place-items-center text-[length:calc(var(--talos-icon-size)*1.25)]">🤗</span>
                <span data-testid="talos-hf-access-copy" class="min-w-0 flex-1">
                    <strong class="block truncate text-sm font-semibold text-[var(--talos-text)]">{{ t('models.huggingFaceAccessTitle') }}</strong>
                    <span class="block text-2xs leading-4 text-[var(--talos-muted)]">{{ t('models.huggingFaceAccessDescription') }}</span>
                    <span
                        data-testid="talos-hf-access-status"
                        class="mt-[calc(var(--talos-space-inline)/2)] block text-2xs font-semibold"
                        :class="talosLocalModels.hasToken ? 'text-[var(--talos-success)]' : 'text-[var(--talos-muted)]'"
                    >
                        {{ talosLocalModels.hasToken ? t('models.huggingFaceAccessSaved') : t('models.huggingFaceAccessMissing') }}
                    </span>
                </span>
                <ChevronDown
                    class="size-[var(--talos-icon-size)] shrink-0 text-[var(--talos-muted)] transition-transform duration-[var(--talos-motion-duration-disclosure)] motion-reduce:transition-none"
                    :class="expanded ? '' : '-rotate-90'"
                    aria-hidden="true"
                />
            </button>
        </h3>

        <div
            v-show="expanded"
            id="talos-hf-access-panel"
            data-testid="talos-hf-access-panel"
            role="region"
            aria-labelledby="talos-hf-access-heading"
            class="flex min-w-0 flex-col gap-[var(--talos-space-card)] px-[var(--talos-space-card)] pb-[var(--talos-space-card)]"
        >
            <p class="flex items-start gap-[var(--talos-space-inline)] text-2xs leading-4 text-[var(--talos-muted)]">
                <ShieldCheck class="mt-[calc(var(--talos-space-inline)/4)] size-[var(--talos-icon-size)] shrink-0 text-[var(--talos-accent)]" aria-hidden="true" />
                <span>{{ t('models.huggingFaceAccessSecurity') }}</span>
            </p>

            <form class="flex min-w-0 flex-wrap gap-[var(--talos-space-inline)]" @submit.prevent="save">
                <input
                    v-model="draft"
                    data-testid="talos-hf-access-input"
                    type="password"
                    autocomplete="off"
                    autocapitalize="none"
                    spellcheck="false"
                    :disabled="busy"
                    :aria-label="t('models.huggingFaceAccessInput')"
                    :placeholder="t('models.huggingFaceAccessPlaceholder')"
                    class="min-h-touch min-w-0 flex-1 rounded-[var(--talos-radius-control)] border border-[var(--talos-border)] bg-[var(--talos-background)] px-[var(--talos-space-control)] text-sm text-[var(--talos-text)] outline-none focus-visible:ring-2 focus-visible:ring-[var(--talos-ring)] disabled:opacity-50"
                >
                <button
                    type="submit"
                    data-testid="talos-hf-access-save"
                    :disabled="busy || draft.trim() === ''"
                    class="talos-pressable min-h-touch rounded-[var(--talos-radius-control)] bg-[var(--talos-accent)] px-[var(--talos-space-control)] text-sm font-semibold text-[var(--talos-accent-text)] disabled:opacity-50"
                >
                    {{ busy ? t('models.huggingFaceAccessSaving') : t('models.huggingFaceAccessSave') }}
                </button>
            </form>

            <div class="flex min-h-touch flex-wrap items-center justify-between gap-[var(--talos-space-inline)]">
                <p v-if="error" data-testid="talos-hf-access-error" role="alert" class="text-xs text-[var(--talos-danger)]">
                    {{ t('models.huggingFaceAccessError') }}
                </p>
                <span v-else class="text-2xs text-[var(--talos-muted)]">
                    {{ t('models.huggingFaceAccessHint') }}
                </span>
                <button
                    v-if="talosLocalModels.hasToken"
                    type="button"
                    data-testid="talos-hf-access-forget"
                    :disabled="busy"
                    class="talos-pressable min-h-touch rounded-[var(--talos-radius-control)] px-[var(--talos-space-control)] text-2xs text-[var(--talos-muted)] underline disabled:opacity-50"
                    @click="forget"
                >
                    {{ t('models.huggingFaceAccessForget') }}
                </button>
            </div>
        </div>
    </article>
</template>
