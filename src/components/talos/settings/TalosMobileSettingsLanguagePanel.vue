<script setup lang="ts">
import { computed } from 'vue'
import { Check, Languages } from '@lucide/vue'
import { talosT, useTalosLocalization } from '@/i18n'
import type { TalosLocaleMode } from '@/i18n/contracts'

const localization = useTalosLocalization()

const choices = computed(() => {
    // The locale read is intentionally part of this computed dependency: the
    // message composer lives behind `talosT`, so Vue cannot observe it itself.
    void localization.state.locale
    return [
        {
            mode: 'system',
            label: talosT('language.system'),
            detail: talosT('language.systemDetail'),
        },
        {
            mode: 'it',
            label: talosT('language.italian'),
            detail: talosT('language.italianDetail'),
        },
        {
            mode: 'en',
            label: talosT('language.english'),
            detail: talosT('language.englishDetail'),
        },
    ] as const satisfies ReadonlyArray<{
        mode: TalosLocaleMode
        label: string
        detail: string
    }>
})

function select(mode: TalosLocaleMode): void {
    void localization.setMode(mode)
}
</script>

<template>
    <div class="flex flex-col gap-4" data-testid="talos-settings-language">
        <div class="flex items-start gap-3">
            <span class="flex size-10 shrink-0 items-center justify-center rounded-xl bg-[var(--talos-active)] text-[var(--talos-accent)]">
                <Languages class="size-5" aria-hidden="true" />
            </span>
            <p class="pt-0.5 text-sm leading-6 text-[var(--talos-muted)]">
                {{ talosT('language.description') }}
            </p>
        </div>

        <div
            role="radiogroup"
            :aria-label="talosT('language.title')"
            class="overflow-hidden rounded-2xl border border-[var(--talos-border)] bg-[var(--talos-panel)]/70"
        >
            <button
                v-for="choice in choices"
                :key="choice.mode"
                type="button"
                role="radio"
                data-testid="talos-language-choice"
                :data-language-mode="choice.mode"
                :aria-checked="localization.state.mode === choice.mode"
                :disabled="localization.state.switching"
                class="talos-pressable flex min-h-16 w-full items-center gap-3 border-b border-[var(--talos-border)] px-4 py-3 text-left last:border-b-0 disabled:opacity-60"
                @click="select(choice.mode)"
            >
                <span class="min-w-0 flex-1">
                    <span class="block text-sm font-medium text-[var(--talos-text)]">{{ choice.label }}</span>
                    <span class="mt-0.5 block text-xs leading-5 text-[var(--talos-muted)]">{{ choice.detail }}</span>
                </span>
                <Check
                    v-if="localization.state.mode === choice.mode"
                    class="size-5 shrink-0 text-[var(--talos-accent)]"
                    aria-hidden="true"
                />
            </button>
        </div>

        <p v-if="localization.state.switching" role="status" class="text-xs text-[var(--talos-muted)]">
            {{ talosT('language.switching') }}
        </p>
        <p v-if="localization.state.error" role="alert" class="text-xs text-[var(--talos-danger)]">
            {{ localization.state.error }}
        </p>
    </div>
</template>
