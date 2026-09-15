<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useTalosI18n } from '@/i18n'
import { talosTranslatableErrorMessage } from '@/i18n/uiErrors'
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
    appLockThrottleRemainingMs,
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
const { t } = useTalosI18n()

const emit = defineEmits<{
    close: []
    /** setup: PIN armed (the PIN travels so the caller can wrap the database
     *  key with it) · verify: identity confirmed (caller disarms). */
    completed: [pin?: string]
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
        error.value = t('lock.pinsMismatch')
        confirmInput.value?.clear()
        return
    }
    try {
        await setupAppLockPin(pin.value)
        // Debt S1: the panel needs the PIN to wrap the database key. It never
        // leaves this pair of components and is never persisted in the clear.
        emit('completed', pin.value)
    } catch (cause) {
        error.value = talosTranslatableErrorMessage(cause, t)
            ?? (cause instanceof Error ? cause.message : t('lock.pinSaveFailed'))
    }
}

async function onVerifySubmit(): Promise<void> {
    error.value = null
    if (await verifyAppLockPin(verifyValue.value)) {
        emit('completed')
        return
    }
    // Debt S3: after three misses the CORRECT PIN is refused too — saying
    // "not recognized" there would be a lie by this codebase's own standard.
    const waiting = await appLockThrottleRemainingMs().catch(() => 0)
    error.value = waiting > 0
        ? t('lock.tooManySecondsShort', { count: Math.ceil(waiting / 1000) })
        : t('lock.pinNotRecognized')
    verifyInput.value?.clear()
}

async function verifyWithBiometrics(): Promise<void> {
    error.value = null
    if (await requestBiometricUnlock(t('lock.disableBiometricPrompt'))) {
        emit('completed')
        return
    }
    error.value = t('lock.biometricConfirmFailed')
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
        :aria-label="mode === 'setup' ? t('lock.setupLabel') : t('lock.confirmTitle')"
        class="fixed inset-0 z-[85] flex flex-col bg-[var(--talos-window-bg,var(--talos-background))] pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-[max(1rem,env(safe-area-inset-top))] text-[var(--talos-text)] outline-none"
        @keydown.escape="emit('close')"
        @keydown="trapTab"
    >
        <header class="flex items-center px-3">
            <button
                type="button"
                :aria-label="t('common.cancel')"
                class="talos-pressable flex min-h-touch min-w-touch items-center justify-center rounded-full text-[var(--talos-muted)]"
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
                        <h2 class="text-lg font-semibold">{{ t('lock.chooseSixDigit') }}</h2>
                        <p class="mt-1 text-sm text-[var(--talos-muted)]">{{ t('lock.neverLeaves') }}</p>
                    </div>
                    <TalosMobilePinInput
                        v-model="pin"
                        :label="t('lock.newPin')"
                        testid="talos-applock-pin"
                        autofocus
                        @complete="onSetupPinComplete"
                    />
                </template>
                <template v-else>
                    <div class="text-center">
                        <h2 class="text-lg font-semibold">{{ t('lock.confirmTitle') }}</h2>
                        <p class="mt-1 text-sm text-[var(--talos-muted)]">{{ t('lock.repeatDigits') }}</p>
                    </div>
                    <TalosMobilePinInput
                        ref="confirmInput"
                        v-model="pinConfirm"
                        :label="t('lock.confirmPin')"
                        testid="talos-applock-pin-confirm"
                        autofocus
                        @complete="onSetupConfirmComplete"
                    />
                </template>
            </template>

            <template v-else>
                <div class="text-center">
                    <h2 class="text-lg font-semibold">{{ t('lock.enterPin') }}</h2>
                    <p class="mt-1 text-sm text-[var(--talos-muted)]">{{ t('lock.disableDetail') }}</p>
                </div>
                <TalosMobilePinInput
                    ref="verifyInput"
                    v-model="verifyValue"
                    :length="8"
                    :label="t('lock.currentPin')"
                    testid="talos-applock-verify"
                    autofocus
                />
                <Button
                    type="button"
                    data-testid="talos-applock-verify-submit"
                    :disabled="verifyValue.length < 4"
                    class="talos-pressable min-h-touch w-full max-w-xs rounded-full bg-[var(--talos-accent,var(--primary))] text-sm text-[var(--talos-accent-contrast,var(--primary-foreground))] disabled:opacity-50"
                    @click="onVerifySubmit"
                >
                    {{ t('lock.confirm') }}
                </Button>
                <Button
                    v-if="props.biometricEnabled && biometricAvailable"
                    type="button"
                    variant="outline"
                    data-testid="talos-applock-verify-biometric"
                    class="talos-pressable min-h-touch w-full max-w-xs gap-2"
                    @click="verifyWithBiometrics"
                >
                    <Fingerprint class="size-4" aria-hidden="true" />
                    {{ t('lock.useBiometrics') }}
                </Button>
            </template>

            <p v-if="error" role="alert" class="text-center text-xs text-[var(--talos-danger,#dc5b5b)]">{{ error }}</p>
        </div>
    </div>
    </Teleport>
</template>
