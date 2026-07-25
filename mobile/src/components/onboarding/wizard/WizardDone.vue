<script setup lang="ts">
import { CheckCircle2 } from '@lucide/vue'

// N1 step 6 — summary. Read-only recap of what was set; the shell's "Enter
// TALOS" primary finalizes (persists the wizard outcome) and closes.
defineProps<{ name: string; mode: string; lock: boolean }>()
</script>

<template>
    <div data-testid="wizard-step-done" class="flex flex-col">
        <CheckCircle2 class="size-9 text-[var(--talos-accent)]" aria-hidden="true" />
        <h1 class="talos-serif mt-3 text-2xl font-semibold leading-tight text-[var(--talos-text)]">All set</h1>
        <p class="mt-3 text-md leading-7 text-[var(--talos-text)]">Your workspace is ready — everything is stored on this device.</p>
        <dl class="mt-5 divide-y divide-[var(--talos-border)] overflow-hidden rounded-xl border border-[var(--talos-border)]">
            <div class="flex items-center justify-between px-4 py-3 text-sm">
                <dt class="text-[var(--talos-muted)]">Name</dt><dd class="text-[var(--talos-text)]">{{ name || 'TALOS' }}</dd>
            </div>
            <div class="flex items-center justify-between px-4 py-3 text-sm">
                <dt class="text-[var(--talos-muted)]">Appearance</dt><dd class="capitalize text-[var(--talos-text)]">{{ mode }}</dd>
            </div>
            <div class="flex items-center justify-between px-4 py-3 text-sm">
                <dt class="text-[var(--talos-muted)]">App lock</dt><dd class="text-[var(--talos-text)]">{{ lock ? 'On' : 'Off' }}</dd>
            </div>
        </dl>
    </div>
</template>
