<script setup lang="ts">
import { useThemeStore } from '@/stores/theme'
import type { TalosThemeMode } from '@/lib/talosThemes'

// N1 step 3 — personalize. Color mode only (applies live via the theme store);
// deeper appearance + voice options live in Settings → Appearance.
const theme = useThemeStore()
const MODES: ReadonlyArray<{ value: TalosThemeMode; label: string }> = [
    { value: 'light', label: 'Light' },
    { value: 'dark', label: 'Dark' },
    { value: 'system', label: 'System' },
]
function pick(mode: TalosThemeMode): void { void theme.setMode(mode) }
</script>

<template>
    <div data-testid="wizard-step-personalize" class="flex flex-col">
        <h1 class="talos-serif text-2xl font-semibold leading-tight text-[var(--talos-text)]">Personalize</h1>
        <p class="mt-3 text-md leading-7 text-[var(--talos-text)]">
            Choose your appearance. More options live in Settings → Appearance.
        </p>
        <div
            role="radiogroup"
            aria-label="Color mode"
            class="mt-5 grid grid-cols-3 gap-2"
        >
            <button
                v-for="mode in MODES"
                :key="mode.value"
                type="button"
                role="radio"
                :data-testid="`wizard-theme-${mode.value}`"
                :aria-checked="theme.state.mode === mode.value"
                class="talos-pressable min-h-12 rounded-xl border text-sm font-medium outline-none focus-visible:ring-2 focus-visible:ring-[var(--talos-ring)]"
                :class="theme.state.mode === mode.value
                    ? 'border-[var(--talos-accent-border)] bg-[var(--talos-active)] text-[var(--talos-text)]'
                    : 'border-[var(--talos-border)] text-[var(--talos-muted)]'"
                @click="pick(mode.value)"
            >{{ mode.label }}</button>
        </div>
    </div>
</template>
