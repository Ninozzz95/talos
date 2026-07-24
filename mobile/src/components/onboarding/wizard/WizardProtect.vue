<script setup lang="ts">
import { ShieldCheck } from '@lucide/vue'
import { useSettingsStore } from '@/stores/settings'

// N1 step 4 — protect (optional). The PIN journey itself is the device-proven
// app-lock setup modal, owned by the shell; this step only invites it.
const emit = defineEmits<{ setupPin: [] }>()
const settings = useSettingsStore()
</script>

<template>
    <div data-testid="wizard-step-protect" class="flex flex-col">
        <h1 class="talos-serif text-2xl font-semibold leading-tight text-[var(--talos-text)]">Protect</h1>
        <p class="mt-3 text-[15px] leading-7 text-[var(--talos-text)]">
            Optionally require a PIN when TALOS starts. The PIN never leaves this device — only a
            salted derivation is kept in the secure Keystore.
        </p>
        <div
            v-if="settings.state.security.app_lock_enabled"
            data-testid="wizard-pin-set"
            class="mt-5 flex items-center gap-2 rounded-xl border border-[var(--talos-accent-border)] bg-[var(--talos-active)] p-3 text-sm text-[var(--talos-text)]"
        >
            <ShieldCheck class="size-5 text-[var(--talos-accent)]" aria-hidden="true" /> PIN protection is on.
        </div>
        <button
            v-else
            type="button"
            data-testid="wizard-setup-pin"
            class="talos-pressable mt-5 flex min-h-12 items-center justify-center gap-2 rounded-xl border border-[var(--talos-border)] px-4 text-sm font-medium text-[var(--talos-text)]"
            @click="emit('setupPin')"
        >
            <ShieldCheck class="size-5 text-[var(--talos-accent)]" aria-hidden="true" /> Set a PIN
        </button>
    </div>
</template>
