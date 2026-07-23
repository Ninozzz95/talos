<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { Fingerprint, ShieldCheck, X } from '@lucide/vue'
import { useTalosModalSurface } from '@/composables/useTalosModalSurface'
import { Button } from '@/components/ui/button'
import TalosMobilePinInput from '@/components/talos/settings/TalosMobilePinInput.vue'
import {
    biometricUnlockAvailable,
    clearAppLock,
    requestBiometricUnlock,
    setupAppLockPin,
    verifyAppLockPin,
} from '@/services/appLock'

/**
 * F5-#32 (owner) — the PIN journey is a dedicated FULLSCREEN modal, not an
 * inline form: `setup` walks 6-digit PIN → confirm (auto-arms on match);
 * `verify` gates disabling behind the current PIN (legacy 4-8 digits via the
 * explicit Confirm) or biometrics when enabled.
 */
const props = defineProps<{
    mode: 'setup' | 'verify'
    biometricEnabled?: boolean
}>()

const emit = defineEmits<{
    close: []
    /** setup: PIN armed · verify: identity confirmed (caller disarms). */
    completed: []
}>()

const surfaceRoot = ref<HTMLElement | null>(null)
// SF5-4: the fullscreen PIN modal honors the same modality contract as the
// composer sheets — inert app root, Tab trap, opener focus restore.
const { trapTab } = useTalosModalSurface(surfaceRoot)

const stage = ref<'pin' | 'confirm'>('pin')
const pin = ref('')
const pinConfirm = ref('')
const verifyValue = ref('')
const error = ref<string | null>(null)
const biometricAvailable = ref(false)
const confirmInput = ref<InstanceType<typeof TalosMobilePinInput> | null>(null)
const verifyInput = ref<InstanceType<typeof TalosMobilePinInput> | null>(null)

onMounted(async () => {
    biometricAvailable.value = await biometricUnlockAvailable().catch(() => false)
})

function onSetupPinComplete(): void {
    error.value = null
    stage.value = 'confirm'
}

async function onSetupConfirmComplete(): Promise<void> {
    if (pinConfirm.value !== pin.value) {
        error.value = 'The PINs do not match. Confirm the same 6 digits.'
        confirmInput.value?.clear()
        return
    }
    try {
        await setupAppLockPin(pin.value)
        emit('completed')
    } catch (cause) {
        error.value = cause instanceof Error ? cause.message : 'The PIN could not be saved.'
    }
}

async function onVerifySubmit(): Promise<void> {
    error.value = null
    if (await verifyAppLockPin(verifyValue.value)) {
        emit('completed')
        return
    }
    error.value = 'PIN not recognized. The app lock stays on.'
    verifyInput.value?.clear()
}

async function verifyWithBiometrics(): Promise<void> {
    error.value = null
    if (await requestBiometricUnlock('Disable the TALOS app lock')) {
        emit('completed')
        return
    }
    error.value = 'Biometric confirmation failed. The app lock stays on.'
}

defineExpose({ clearAppLock })
</script>

<template>
    <Teleport to="body">
    <div
        ref="surfaceRoot"
        data-testid="talos-applock-modal"
        role="dialog"
        aria-modal="true"
        tabindex="-1"
        :aria-label="mode === 'setup' ? 'Set up app lock' : 'Confirm your PIN'"
        class="fixed inset-0 z-[85] flex flex-col bg-[var(--talos-window-bg,var(--talos-background))] pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-[max(1rem,env(safe-area-inset-top))] text-[var(--talos-text)] outline-none"
        @keydown.escape="emit('close')"
        @keydown="trapTab"
    >
        <header class="flex items-center px-3">
            <button
                type="button"
                aria-label="Cancel"
                class="talos-pressable flex min-h-11 min-w-11 items-center justify-center rounded-full text-[var(--talos-muted)]"
                @click="emit('close')"
            >
                <X class="size-5" aria-hidden="true" />
            </button>
        </header>

        <div class="flex flex-1 flex-col items-center justify-center gap-6 px-6">
            <span class="flex size-14 items-center justify-center rounded-full bg-[var(--talos-active)]">
                <ShieldCheck class="size-7 text-[var(--talos-accent)]" aria-hidden="true" />
            </span>

            <template v-if="mode === 'setup'">
                <template v-if="stage === 'pin'">
                    <div class="text-center">
                        <h2 class="text-lg font-semibold">Choose a 6-digit PIN</h2>
                        <p class="mt-1 text-sm text-[var(--talos-muted)]">It never leaves this device.</p>
                    </div>
                    <TalosMobilePinInput
                        v-model="pin"
                        label="New PIN"
                        testid="talos-applock-pin"
                        autofocus
                        @complete="onSetupPinComplete"
                    />
                </template>
                <template v-else>
                    <div class="text-center">
                        <h2 class="text-lg font-semibold">Confirm your PIN</h2>
                        <p class="mt-1 text-sm text-[var(--talos-muted)]">Repeat the same 6 digits.</p>
                    </div>
                    <TalosMobilePinInput
                        ref="confirmInput"
                        v-model="pinConfirm"
                        label="Confirm PIN"
                        testid="talos-applock-pin-confirm"
                        autofocus
                        @complete="onSetupConfirmComplete"
                    />
                </template>
            </template>

            <template v-else>
                <div class="text-center">
                    <h2 class="text-lg font-semibold">Enter your PIN</h2>
                    <p class="mt-1 text-sm text-[var(--talos-muted)]">Confirm to turn the app lock off.</p>
                </div>
                <TalosMobilePinInput
                    ref="verifyInput"
                    v-model="verifyValue"
                    :length="8"
                    label="Current PIN"
                    testid="talos-applock-verify"
                    autofocus
                />
                <Button
                    type="button"
                    data-testid="talos-applock-verify-submit"
                    :disabled="verifyValue.length < 4"
                    class="talos-pressable min-h-11 w-full max-w-xs rounded-full bg-[var(--talos-accent,var(--primary))] text-sm text-[var(--talos-accent-contrast,var(--primary-foreground))] disabled:opacity-50"
                    @click="onVerifySubmit"
                >
                    Confirm
                </Button>
                <Button
                    v-if="props.biometricEnabled && biometricAvailable"
                    type="button"
                    variant="outline"
                    data-testid="talos-applock-verify-biometric"
                    class="talos-pressable min-h-11 w-full max-w-xs gap-2"
                    @click="verifyWithBiometrics"
                >
                    <Fingerprint class="size-4" aria-hidden="true" />
                    Use biometrics
                </Button>
            </template>

            <p v-if="error" role="alert" class="text-center text-xs text-[var(--talos-danger,#dc5b5b)]">{{ error }}</p>
        </div>
    </div>
    </Teleport>
</template>
