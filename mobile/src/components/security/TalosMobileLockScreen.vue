<script setup lang="ts">
/**
 * F2-T6 — app lock screen. Full-screen gate over the workspace: unlocks ONLY
 * through a verified PIN or a real OS biometric success (no skip, no fake
 * session). Loaded as an async chunk by App.vue only when the lock is armed.
 */
import { onMounted, ref } from 'vue'
import { Fingerprint, Loader2, LockKeyhole } from '@lucide/vue'
import { Button } from '@/components/ui/button'
import { requestBiometricUnlock, verifyAppLockPin } from '@/services/appLock'
import { talosLightImpact } from '@/services/haptics'
import { useTalosModalSurface } from '@/composables/useTalosModalSurface'

const props = defineProps<{
    biometricEnabled: boolean
}>()

const emit = defineEmits<{
    unlocked: []
}>()

const pin = ref('')
const error = ref<string | null>(null)
const verifying = ref(false)
const pinField = ref<HTMLInputElement | null>(null)

// R1-3 — the lock was an overlay over a LIVE workspace (focusable behind it).
// Teleported to body + shared modality: #app goes inert, Tab is trapped.
const root = ref<HTMLElement | null>(null)
const { trapTab } = useTalosModalSurface(root)

function unlock(): void {
    void talosLightImpact()
    emit('unlocked')
}

async function submitPin(): Promise<void> {
    if (verifying.value || !pin.value) return
    verifying.value = true
    error.value = null
    try {
        if (await verifyAppLockPin(pin.value)) {
            unlock()
        } else {
            error.value = 'Wrong PIN. Try again.'
            pin.value = ''
        }
    } finally {
        verifying.value = false
    }
}

async function tryBiometric(): Promise<void> {
    if (await requestBiometricUnlock('Unlock TALOS')) unlock()
}

onMounted(() => {
    if (props.biometricEnabled) {
        void tryBiometric()
    } else {
        // PIN-only unlock: focus straight into the field — no extra tap.
        pinField.value?.focus()
    }
})
</script>

<template>
    <Teleport to="body">
    <div
        ref="root"
        data-testid="talos-lock-screen"
        role="dialog"
        aria-modal="true"
        aria-label="TALOS is locked"
        tabindex="-1"
        class="pointer-events-auto fixed inset-0 z-[90] flex flex-col items-center justify-center gap-6 bg-[var(--talos-background)] px-8 pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)]"
        @keydown="trapTab"
    >
        <LockKeyhole class="size-10 text-[var(--talos-accent,var(--primary))]" aria-hidden="true" />
        <div class="text-center">
            <h1 class="text-xl font-semibold text-[var(--talos-text,var(--foreground))]">
                <span class="talos-orbitron-brand">TALOS</span> is locked
            </h1>
            <p class="mt-1 text-sm text-[var(--talos-muted,var(--muted-foreground))]">Enter your PIN to continue.</p>
        </div>

        <form class="flex w-full max-w-[280px] flex-col gap-3" @submit.prevent="submitPin">
            <input
                ref="pinField"
                v-model="pin"
                data-testid="talos-lock-pin"
                type="password"
                inputmode="numeric"
                maxlength="8"
                pattern="[0-9]*"
                enterkeyhint="done"
                autocomplete="off"
                aria-label="PIN"
                class="min-h-12 rounded-xl border border-[var(--talos-border,var(--border))] bg-[var(--talos-panel,var(--card))] px-4 text-center text-lg tracking-[0.5em] text-[var(--talos-text,var(--foreground))] outline-none focus-visible:ring-2 focus-visible:ring-[var(--talos-ring)]"
            >
            <p v-if="error" role="alert" class="text-center text-sm text-[var(--talos-danger)]">{{ error }}</p>
            <Button
                type="submit"
                data-testid="talos-lock-submit"
                :disabled="verifying || !pin"
                @click.prevent="submitPin"
                class="talos-pressable min-h-12 rounded-full bg-[var(--talos-accent,var(--primary))] text-sm font-medium text-[var(--talos-accent-contrast,var(--primary-foreground))]"
            >
                <Loader2 v-if="verifying" class="size-4 animate-spin" aria-hidden="true" />
                <span v-else>Unlock</span>
            </Button>
        </form>

        <Button
            v-if="biometricEnabled"
            type="button"
            variant="ghost"
            data-testid="talos-lock-biometric"
            class="talos-pressable min-h-11 gap-2 text-sm text-[var(--talos-muted,var(--muted-foreground))]"
            @click="tryBiometric"
        >
            <Fingerprint class="size-4" aria-hidden="true" />
            Use biometrics
        </Button>
    </div>
    </Teleport>
</template>
