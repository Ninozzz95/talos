<script setup lang="ts">
/**
 * F2-T6 — Account panel: honest local-first identity (no fake sign-in),
 * the "Replay introduction" row (desktop Account-tab parity) and the App
 * lock opt-in: PIN derivation in the OS Keystore, policy flags in
 * Preferences, biometrics offered only when the device really has them.
 */
import { inject, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { RotateCcw } from '@lucide/vue'
import { Button } from '@/components/ui/button'
import { TALOS_MOBILE_INTRO_KEY } from '@/lib/introInjection'
import { useSettingsStore } from '@/stores/settings'
import {
    biometricUnlockAvailable,
    clearAppLock,
    setupAppLockPin,
} from '@/services/appLock'

const router = useRouter()
const intro = inject(TALOS_MOBILE_INTRO_KEY, null)
const settings = useSettingsStore()

const settingUpPin = ref(false)
const pin = ref('')
const pinConfirm = ref('')
const lockError = ref<string | null>(null)
const biometricAvailable = ref(false)

onMounted(async () => {
    biometricAvailable.value = await biometricUnlockAvailable().catch(() => false)
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
        // Disable = remove the Keystore record AND both flags together —
        // a lock flag without a PIN record must never survive.
        await clearAppLock()
        await settings.setSecurity({ app_lock_enabled: false, app_lock_biometric: false })
        settingUpPin.value = false
        return
    }
    settingUpPin.value = !settingUpPin.value
}

async function saveAppLockPin(): Promise<void> {
    lockError.value = null
    if (pin.value !== pinConfirm.value) {
        lockError.value = 'The PINs do not match.'
        return
    }
    try {
        await setupAppLockPin(pin.value)
        await settings.setSecurity({ app_lock_enabled: true })
        settingUpPin.value = false
        pin.value = ''
        pinConfirm.value = ''
    } catch (error) {
        lockError.value = error instanceof Error ? error.message : 'The PIN could not be saved.'
    }
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
            <form
                v-if="settingUpPin && !settings.state.security.app_lock_enabled"
                class="mt-3 flex flex-col gap-2"
                @submit.prevent="saveAppLockPin"
            >
                <input
                    v-model="pin"
                    data-testid="talos-applock-pin"
                    type="password"
                    inputmode="numeric"
                    autocomplete="off"
                    aria-label="New PIN"
                    placeholder="New PIN (min 4 digits)"
                    class="min-h-11 rounded-xl border border-[var(--talos-border)] bg-[var(--talos-panel)] px-3 text-sm text-[var(--talos-text)] outline-none focus-visible:ring-2 focus-visible:ring-[var(--talos-ring)]"
                >
                <input
                    v-model="pinConfirm"
                    data-testid="talos-applock-pin-confirm"
                    type="password"
                    inputmode="numeric"
                    autocomplete="off"
                    aria-label="Confirm PIN"
                    placeholder="Confirm PIN"
                    class="min-h-11 rounded-xl border border-[var(--talos-border)] bg-[var(--talos-panel)] px-3 text-sm text-[var(--talos-text)] outline-none focus-visible:ring-2 focus-visible:ring-[var(--talos-ring)]"
                >
                <p v-if="lockError" role="alert" class="text-xs text-[var(--talos-danger)]">{{ lockError }}</p>
                <Button
                    type="submit"
                    data-testid="talos-applock-save"
                    :disabled="!pin || !pinConfirm"
                    class="talos-pressable min-h-11 rounded-full bg-[var(--talos-accent,var(--primary))] text-sm text-[var(--talos-accent-contrast,var(--primary-foreground))]"
                    @click.prevent="saveAppLockPin"
                >
                    Enable app lock
                </Button>
            </form>
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
