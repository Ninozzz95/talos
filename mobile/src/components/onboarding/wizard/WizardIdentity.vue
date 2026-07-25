<script setup lang="ts">
import { computed } from 'vue'
import TalosAccountAvatar from '@/components/talos/TalosAccountAvatar.vue'
import { talosAccountInitialFrom } from '@/stores/account'

// N1 step 2 — identity. Live avatar preview reflects the name being typed
// (local initial, no store write until the shell commits on Continue).
const props = defineProps<{ modelValue: string }>()
const emit = defineEmits<{ 'update:modelValue': [value: string] }>()
const liveInitial = computed(() => talosAccountInitialFrom(props.modelValue))
</script>

<template>
    <div data-testid="wizard-step-identity" class="flex flex-col">
        <h1 class="talos-serif text-2xl font-semibold leading-tight text-[var(--talos-text)]">Your identity</h1>
        <p class="mt-3 text-md leading-7 text-[var(--talos-text)]">
            How should TALOS address you? You can change this anytime in Settings.
        </p>
        <div class="mt-5 flex items-center gap-4">
            <TalosAccountAvatar size="lg" :initial="liveInitial" />
            <input
                data-testid="wizard-name"
                :value="modelValue"
                type="text"
                maxlength="60"
                autocomplete="name"
                enterkeyhint="done"
                placeholder="Your name"
                aria-label="Display name"
                class="min-h-12 min-w-0 flex-1 rounded-xl border border-[var(--talos-border)] bg-[var(--talos-input,var(--talos-background))] px-3 text-base text-[var(--talos-text)] outline-none focus:border-[var(--talos-accent)]"
                @input="emit('update:modelValue', ($event.target as HTMLInputElement).value)"
            >
        </div>
        <p class="mt-3 text-xs text-[var(--talos-muted)]">Leave it empty to keep the default “{{ talosAccountInitialFrom('') }}”.</p>
    </div>
</template>
