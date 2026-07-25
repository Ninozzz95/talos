<script setup lang="ts">
import { useTalosAccountStore } from '@/stores/account'

// N1 step 5 — sign in (predisposed, honestly gated). TALOS is local-first; the
// OAuth buttons are scaffolded but have no session until M2 sync. The shell
// surfaces the honest gate on tap; no fake auth here.
const emit = defineEmits<{ oauth: [id: string] }>()
const account = useTalosAccountStore()
</script>

<template>
    <div data-testid="wizard-step-signin" class="flex flex-col">
        <h1 class="talos-serif text-2xl font-semibold leading-tight text-[var(--talos-text)]">Sign in</h1>
        <p class="mt-3 text-md leading-7 text-[var(--talos-text)]">
            TALOS runs fully local — no account is required. Sign-in is predisposed for the optional
            encrypted sync arriving with the sovereign core.
        </p>
        <div class="mt-5 flex flex-col gap-2">
            <button
                v-for="provider in account.oauthProviders"
                :key="provider.id"
                type="button"
                :data-testid="`wizard-oauth-${provider.id}`"
                class="talos-pressable flex min-h-12 w-full items-center justify-center gap-2 rounded-xl border border-[var(--talos-border)] px-4 text-sm font-medium text-[var(--talos-text)]"
                @click="emit('oauth', provider.id)"
            >
                {{ provider.label }}
                <span class="text-3xs font-semibold uppercase tracking-wide text-[var(--talos-muted)]">Soon</span>
            </button>
        </div>
    </div>
</template>
