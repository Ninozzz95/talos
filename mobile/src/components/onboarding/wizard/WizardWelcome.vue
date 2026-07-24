<script setup lang="ts">
// N1 step 1 — welcome. The primary "Get started" lives in the shell footer;
// this content offers only a quiet "skip the whole setup" escape.
const emit = defineEmits<{ skipAll: [] }>()
</script>

<template>
    <div data-testid="wizard-step-welcome" class="flex flex-col">
        <p class="text-[11px] uppercase tracking-[0.25em] text-[var(--talos-muted)]">Set up your workspace</p>
        <h1 class="talos-serif mt-3 text-2xl font-semibold leading-tight text-[var(--talos-text)]">Set up your TALOS</h1>
        <p class="mt-4 text-[15px] leading-7 text-[var(--talos-text)]">
            A calm, local-first workspace. Give it a name, make it yours, and (optionally) lock it —
            it takes seconds and everything stays on this device.
        </p>
        <button
            type="button"
            data-testid="wizard-skip-all"
            class="talos-pressable mt-5 self-start text-sm text-[var(--talos-muted)] underline underline-offset-4"
            @click="emit('skipAll')"
        >Skip setup for now</button>
    </div>
</template>
