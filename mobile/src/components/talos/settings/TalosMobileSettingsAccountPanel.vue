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
import TalosMobileAppLockModal from '@/components/talos/settings/TalosMobileAppLockModal.vue'
import { TALOS_MOBILE_INTRO_KEY } from '@/lib/introInjection'
import { useSettingsStore } from '@/stores/settings'
import { biometricUnlockAvailable, clearAppLock } from '@/services/appLock'
import { talosDictationDiagnostics, type TalosDictationDiagnostics } from '@/services/dictation'

const router = useRouter()
const intro = inject(TALOS_MOBILE_INTRO_KEY, null)
const settings = useSettingsStore()

// F5-#32 (owner) — the whole PIN journey lives in a dedicated FULLSCREEN
// modal (setup: 6 digits + confirm; verify: current PIN or biometrics before
// the lock may fall). The panel only opens it and applies the outcome.
const lockModal = ref<'setup' | 'verify' | null>(null)
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

function toggleAppLock(): void {
    // Disabling NEVER clears immediately: the fullscreen modal confirms the
    // owner (PIN or biometrics) before the lock may fall.
    lockModal.value = settings.state.security.app_lock_enabled ? 'verify' : 'setup'
}

async function onLockModalCompleted(): Promise<void> {
    if (lockModal.value === 'setup') {
        await settings.setSecurity({ app_lock_enabled: true })
    } else if (lockModal.value === 'verify') {
        await clearAppLock()
        await settings.setSecurity({ app_lock_enabled: false, app_lock_biometric: false })
    }
    lockModal.value = null
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
            <TalosMobileAppLockModal
                v-if="lockModal !== null"
                :mode="lockModal"
                :biometric-enabled="settings.state.security.app_lock_biometric"
                @close="lockModal = null"
                @completed="onLockModalCompleted"
            />
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
