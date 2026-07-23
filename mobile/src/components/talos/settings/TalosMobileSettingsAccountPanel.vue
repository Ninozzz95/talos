<script setup lang="ts">
/**
 * F2-T6 — Account panel: honest local-first identity (no fake sign-in),
 * the "Replay introduction" row (desktop Account-tab parity) and the App
 * lock opt-in: PIN derivation in the OS Keystore, policy flags in
 * Preferences, biometrics offered only when the device really has them.
 */
import { inject, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { Fingerprint, RotateCcw } from '@lucide/vue'
import { Button } from '@/components/ui/button'
import TalosMobilePinInput from '@/components/talos/settings/TalosMobilePinInput.vue'
import { TALOS_MOBILE_INTRO_KEY } from '@/lib/introInjection'
import { useSettingsStore } from '@/stores/settings'
import {
    biometricUnlockAvailable,
    clearAppLock,
    requestBiometricUnlock,
    setupAppLockPin,
    verifyAppLockPin,
} from '@/services/appLock'
import { talosDictationDiagnostics, type TalosDictationDiagnostics } from '@/services/dictation'

const router = useRouter()
const intro = inject(TALOS_MOBILE_INTRO_KEY, null)
const settings = useSettingsStore()

// F4-#25 — OTP-style flows: setup = 6-digit PIN + confirm step (auto-arms on
// match); removal = re-enter the PIN (or biometrics when enabled). The lock
// never falls without verification.
const setupStage = ref<'pin' | 'confirm' | null>(null)
const pin = ref('')
const pinConfirm = ref('')
const verifyOpen = ref(false)
const verifyValue = ref('')
const confirmInput = ref<InstanceType<typeof TalosMobilePinInput> | null>(null)
const verifyInput = ref<InstanceType<typeof TalosMobilePinInput> | null>(null)
const lockError = ref<string | null>(null)
const biometricAvailable = ref(false)

const dictationDiag = ref<TalosDictationDiagnostics | null>(null)

onMounted(async () => {
    biometricAvailable.value = await biometricUnlockAvailable().catch(() => false)
    dictationDiag.value = await talosDictationDiagnostics().catch((error) => ({
        native: false, pluginLoaded: false, available: null, error: String(error),
    }))
})

function replayIntroduction(): void {
    // Mirror of the desktop replay chain: leave Settings FIRST so the modal
    // never opens behind the settings surface, then replay exactly once.
    void router.push({ name: 'chat' })
    intro?.replayIntro()
}

async function toggleAppLock(): Promise<void> {
    lockError.value = null
    if (settings.state.security.app_lock_enabled) {
        // Disabling NEVER clears immediately: the current PIN (or biometrics)
        // must confirm the owner first.
        verifyValue.value = ''
        verifyOpen.value = !verifyOpen.value
        return
    }
    pin.value = ''
    pinConfirm.value = ''
    setupStage.value = setupStage.value === null ? 'pin' : null
}

function onSetupPinComplete(): void {
    lockError.value = null
    setupStage.value = 'confirm'
}

async function onSetupConfirmComplete(): Promise<void> {
    if (pinConfirm.value !== pin.value) {
        lockError.value = 'The PINs do not match. Confirm the same 6 digits.'
        confirmInput.value?.clear()
        return
    }
    try {
        await setupAppLockPin(pin.value)
        await settings.setSecurity({ app_lock_enabled: true })
        setupStage.value = null
        pin.value = ''
        pinConfirm.value = ''
        lockError.value = null
    } catch (error) {
        lockError.value = error instanceof Error ? error.message : 'The PIN could not be saved.'
    }
}

async function disarmAppLock(): Promise<void> {
    await clearAppLock()
    await settings.setSecurity({ app_lock_enabled: false, app_lock_biometric: false })
    verifyOpen.value = false
    verifyValue.value = ''
    lockError.value = null
}

async function onVerifyComplete(): Promise<void> {
    lockError.value = null
    if (await verifyAppLockPin(verifyValue.value)) {
        await disarmAppLock()
        return
    }
    lockError.value = 'PIN not recognized. The app lock stays on.'
    verifyInput.value?.clear()
}

async function verifyWithBiometrics(): Promise<void> {
    lockError.value = null
    if (await requestBiometricUnlock('Disable the TALOS app lock')) {
        await disarmAppLock()
        return
    }
    lockError.value = 'Biometric confirmation failed. The app lock stays on.'
}

async function toggleBiometric(): Promise<void> {
    await settings.setSecurity({ app_lock_biometric: !settings.state.security.app_lock_biometric })
}
</script>

<template>
    <div class="flex flex-col gap-5">
        <section>
            <h4 class="text-sm font-semibold text-[var(--talos-text)]">Local workspace</h4>
            <p class="mt-1 text-xs leading-5 text-[var(--talos-muted)]">
                This installation is local-first: your sessions, drafts and preferences live on
                this device, and provider keys stay in the device Keystore. No account is
                required; optional desktop sync is on the roadmap.
            </p>
        </section>

        <section>
            <h4 class="text-sm font-semibold text-[var(--talos-text)]">App lock</h4>
            <p class="mt-1 text-xs leading-5 text-[var(--talos-muted)]">
                Require a PIN when TALOS starts. The PIN never leaves this device — only a
                salted derivation is kept in the secure Keystore.
            </p>
            <div class="mt-1 flex items-center justify-between gap-3">
                <span class="text-sm text-[var(--talos-text)]">Require PIN on start</span>
                <button
                    type="button"
                    role="switch"
                    data-testid="talos-applock-toggle"
                    :aria-checked="settings.state.security.app_lock_enabled"
                    aria-label="Require PIN on start"
                    class="talos-pressable -mr-1 flex min-h-11 min-w-11 items-center justify-center"
                    @click="toggleAppLock"
                >
                    <span
                        class="relative h-6 w-11 rounded-full transition-colors duration-200"
                        :class="settings.state.security.app_lock_enabled
                            ? 'bg-[var(--talos-accent,var(--primary))]'
                            : 'bg-[var(--talos-border,var(--border))]'"
                        aria-hidden="true"
                    >
                        <span
                            class="absolute top-0.5 size-5 rounded-full bg-white shadow transition-[left] duration-200"
                            :class="settings.state.security.app_lock_enabled ? 'left-[22px]' : 'left-0.5'"
                        />
                    </span>
                </button>
            </div>
            <div
                v-if="setupStage !== null && !settings.state.security.app_lock_enabled"
                class="mt-4 flex flex-col gap-3"
            >
                <template v-if="setupStage === 'pin'">
                    <p class="text-center text-sm text-[var(--talos-text)]">Choose a 6-digit PIN</p>
                    <TalosMobilePinInput
                        v-model="pin"
                        label="New PIN"
                        testid="talos-applock-pin"
                        autofocus
                        @complete="onSetupPinComplete"
                    />
                </template>
                <template v-else>
                    <p class="text-center text-sm text-[var(--talos-text)]">Confirm your PIN</p>
                    <TalosMobilePinInput
                        ref="confirmInput"
                        v-model="pinConfirm"
                        label="Confirm PIN"
                        testid="talos-applock-pin-confirm"
                        autofocus
                        @complete="onSetupConfirmComplete"
                    />
                </template>
                <p v-if="lockError" role="alert" class="text-center text-xs text-[var(--talos-danger,#dc5b5b)]">{{ lockError }}</p>
            </div>

            <div
                v-if="verifyOpen && settings.state.security.app_lock_enabled"
                class="mt-4 flex flex-col gap-3"
            >
                <p class="text-center text-sm text-[var(--talos-text)]">Enter your PIN to turn the app lock off</p>
                <!-- SF-1: legacy PINs are 4-8 digits — the verify input is 8
                     wide and the explicit Confirm submits from 4 digits on;
                     a full 8-digit entry still auto-submits. -->
                <TalosMobilePinInput
                    ref="verifyInput"
                    v-model="verifyValue"
                    :length="8"
                    label="Current PIN"
                    testid="talos-applock-verify"
                    autofocus
                    @complete="onVerifyComplete"
                />
                <Button
                    type="button"
                    data-testid="talos-applock-verify-submit"
                    :disabled="verifyValue.length < 4"
                    class="talos-pressable min-h-11 rounded-full bg-[var(--talos-accent,var(--primary))] text-sm text-[var(--talos-accent-contrast,var(--primary-foreground))] disabled:opacity-50"
                    @click="onVerifyComplete"
                >
                    Confirm
                </Button>
                <Button
                    v-if="settings.state.security.app_lock_biometric && biometricAvailable"
                    type="button"
                    variant="outline"
                    data-testid="talos-applock-verify-biometric"
                    class="talos-pressable min-h-11 gap-2"
                    @click="verifyWithBiometrics"
                >
                    <Fingerprint class="size-4" aria-hidden="true" />
                    Use biometrics
                </Button>
                <p v-if="lockError" role="alert" class="text-center text-xs text-[var(--talos-danger,#dc5b5b)]">{{ lockError }}</p>
            </div>
            <div
                v-if="settings.state.security.app_lock_enabled && biometricAvailable"
                class="mt-3 flex items-center justify-between gap-3"
            >
                <span class="text-sm text-[var(--talos-text)]">Unlock with biometrics</span>
                <button
                    type="button"
                    role="switch"
                    data-testid="talos-applock-biometric"
                    :aria-checked="settings.state.security.app_lock_biometric"
                    aria-label="Unlock with biometrics"
                    class="talos-pressable -mr-1 flex min-h-11 min-w-11 items-center justify-center"
                    @click="toggleBiometric"
                >
                    <span
                        class="relative h-6 w-11 rounded-full transition-colors duration-200"
                        :class="settings.state.security.app_lock_biometric
                            ? 'bg-[var(--talos-accent,var(--primary))]'
                            : 'bg-[var(--talos-border,var(--border))]'"
                        aria-hidden="true"
                    >
                        <span
                            class="absolute top-0.5 size-5 rounded-full bg-white shadow transition-[left] duration-200"
                            :class="settings.state.security.app_lock_biometric ? 'left-[22px]' : 'left-0.5'"
                        />
                    </span>
                </button>
            </div>
        </section>

        <section>
            <h4 class="text-sm font-semibold text-[var(--talos-text)]">Dictation diagnostics</h4>
            <p class="mt-1 text-xs leading-5 text-[var(--talos-muted)]" data-testid="talos-dictation-diagnostics">
                <template v-if="dictationDiag">
                    platform: {{ dictationDiag.native ? 'native' : 'web' }} ·
                    plugin: {{ dictationDiag.pluginLoaded ? 'loaded' : 'NOT LOADED' }} ·
                    recognizer: {{ dictationDiag.available === null ? 'unknown' : (dictationDiag.available ? 'available' : 'unavailable') }}
                    <template v-if="dictationDiag.error"> · error: {{ dictationDiag.error }}</template>
                </template>
                <template v-else>Probing…</template>
            </p>
        </section>

        <section>
            <h4 class="text-sm font-semibold text-[var(--talos-text)]">Introduction</h4>
            <p class="mt-1 text-xs leading-5 text-[var(--talos-muted)]">
                Watch the TALOS introduction again at any time.
            </p>
            <Button
                type="button"
                variant="outline"
                data-testid="talos-replay-intro"
                class="talos-pressable mt-2 min-h-11 gap-2"
                @click="replayIntroduction"
            >
                <RotateCcw class="size-4" aria-hidden="true" />
                Replay introduction
            </Button>
        </section>
    </div>
</template>
