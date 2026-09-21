<script setup lang="ts">
/**
 * F2-T6 — Account panel: honest local-first identity (no fake sign-in),
 * the unified setup replay and the App
 * lock opt-in: PIN derivation in the OS Keystore, policy flags in
 * Preferences, biometrics offered only when the device really has them.
 */
import { inject, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import TalosThemedSwitch from '@/components/talos/ui/TalosThemedSwitch.vue'
import { useTalosI18n } from '@/i18n'
import { Check, RotateCcw } from '@lucide/vue'
import { Button } from '@/components/ui/button'
import TalosMobileAppLockModal from '@/components/talos/settings/TalosMobileAppLockModal.vue'
import TalosAccountAvatar from '@/components/talos/TalosAccountAvatar.vue'
import { TALOS_MOBILE_INTRO_KEY } from '@/lib/introInjection'
import { useSettingsStore } from '@/stores/settings'
import { useTalosAccountStore } from '@/stores/account'
import { useChatController } from '@/stores/chatController'
import { useTalosMobileToasts } from '@/stores/toasts'
import { appLockPinIsWeak, biometricUnlockAvailable, clearAppLock } from '@/services/appLock'
import {
    disableTalosDatabaseProtection,
    enableTalosDatabaseProtection,
} from '@/services/databaseProtection'
import { talosDictationDiagnostics, type TalosDictationDiagnostics } from '@/services/dictationDiagnostica'

const router = useRouter()
const { t } = useTalosI18n()
const intro = inject(TALOS_MOBILE_INTRO_KEY, null)
const settings = useSettingsStore()
const account = useTalosAccountStore()
const controller = useChatController()
const toasts = useTalosMobileToasts()

// Owner 2026-07-24: local account identity + PREDISPOSED OAuth (honestly gated,
// no fake sign-in). The name drives the avatar initial across the shell.
const nameDraft = ref(account.state.display_name)
const nameSaved = ref(false)
async function saveName(): Promise<void> {
    try {
        await account.setDisplayName(nameDraft.value)
        await controller.memories.upsertDisplayName(account.state.display_name)
        nameDraft.value = account.state.display_name
        nameSaved.value = true
        window.setTimeout(() => { nameSaved.value = false }, 1600)
    } catch {
        toasts.push({
            message: t('account.displayNameSyncError'),
            durationMs: 6000,
        })
    }
}
const OAUTH_LABEL_KEYS: Record<string, string> = {
    google: 'account.continueWithGoogle',
    apple: 'account.continueWithApple',
}
function oauthProviderLabel(provider: { id: string }): string {
    const key = OAUTH_LABEL_KEYS[provider.id]
    return key
        ? t(key)
        : t('account.continueWithProvider', { provider: provider.id })
}
function tryOAuth(): void {
    // No fake session: surface the honest gate.
    toasts.push({ message: t('account.oauthGateReason'), durationMs: 6000 })
}

// F5-#32 (owner) — the whole PIN journey lives in a dedicated FULLSCREEN
// modal (setup: 6 digits + confirm; verify: current PIN or biometrics before
// the lock may fall). The panel only opens it and applies the outcome.
const lockModal = ref<'setup' | 'verify' | null>(null)
const biometricAvailable = ref(false)
// Debt S3: true when the stored PIN was last verified with fewer than 6 digits.
const weakPin = ref(false)
// Debt S1: an install created before the key was managed has to have its
// database rebuilt under a key we can wrap. That is the only slow path, and it
// must never look like a frozen screen.
const protecting = ref(false)
const protectionError = ref<string | null>(null)

const dictationDiag = ref<TalosDictationDiagnostics | null>(null)

onMounted(async () => {
    biometricAvailable.value = await biometricUnlockAvailable().catch(() => false)
    weakPin.value = await appLockPinIsWeak().catch(() => false)
    dictationDiag.value = await talosDictationDiagnostics().catch((error) => ({
        buildId: 'unknown', native: false, registered: false, pluginLoaded: false,
        methods: [], permissionsRaw: null, availableRaw: null, available: null,
        trace: String(error), error: String(error), diario: [],
    }))
})

async function replayIntroduction(): Promise<void> {
    // Leave Settings before the single fullscreen setup surface opens.
    await router.push({ name: 'chat' })
    intro?.replayIntro()
}

function toggleAppLock(): void {
    // Disabling NEVER clears immediately: the fullscreen modal confirms the
    // owner (PIN or biometrics) before the lock may fall.
    lockModal.value = settings.state.security.app_lock_enabled ? 'verify' : 'setup'
}

async function onLockModalCompleted(pin?: string): Promise<void> {
    if (lockModal.value === 'setup') {
        // Debt S1: the PIN becomes the real database key here. On a fresh
        // install this wraps 32 bytes and is instant; on a legacy install the
        // data is exported and rebuilt, which is why the panel shows progress.
        protectionError.value = null
        if (pin) {
            protecting.value = true
            try {
                await enableTalosDatabaseProtection(pin)
            } catch (cause) {
                protecting.value = false
                lockModal.value = null
                protectionError.value = cause instanceof Error
                    ? t('account.lockArmFailed', { detail: cause.message })
                    : t('account.lockArmFailedUnknown')
                return
            }
            protecting.value = false
        }
        await settings.setSecurity({ app_lock_enabled: true, screen_secure: true })
        weakPin.value = false
    } else if (lockModal.value === 'verify') {
        try {
            await disableTalosDatabaseProtection()
        } catch (cause) {
            // SF: this threw into an unhandled rejection and the toggle simply
            // did nothing — the user could not turn the lock off at all.
            protectionError.value = cause instanceof Error
                ? t('account.lockRemoveFailed', { detail: cause.message })
                : t('account.lockRemoveFailedUnknown')
            lockModal.value = null
            return
        }
        await clearAppLock()
        await settings.setSecurity({ app_lock_enabled: false, app_lock_biometric: false })
        weakPin.value = false
    }
    lockModal.value = null
}

// Debt S2: FLAG_SECURE is its own posture — a user with no PIN still deserves
// a private recents card, and a user with a PIN still deserves screenshots if
// they want them. Enabling the lock turns it on, visibly and reversibly.
async function toggleScreenSecure(): Promise<void> {
    await settings.setSecurity({ screen_secure: !settings.state.security.screen_secure })
}

async function toggleBiometric(): Promise<void> {
    const next = !settings.state.security.app_lock_biometric
    await settings.setSecurity({ app_lock_biometric: next })
    // Turning it OFF must destroy the second wrapping of the database key, not
    // merely hide a button. A preference that leaves a hardware-backed door
    // standing is a setting that lies about what it did.
    if (!next) {
        const { disarmTalosBiometricUnlock } = await import('@/services/databaseKey')
        await disarmTalosBiometricUnlock().catch(() => {})
    }
}
</script>

<template>
    <div class="flex flex-col gap-5">
        <!-- Owner 2026-07-24: local identity — name + avatar initial. -->
        <section data-testid="talos-account-identity">
            <div class="flex items-center gap-3">
                <TalosAccountAvatar size="lg" />
                <div class="min-w-0 flex-1">
                    <label for="talos-account-name" class="block text-xs font-medium text-[var(--talos-muted)]">{{ t('account.displayName') }}</label>
                    <div class="mt-1 flex gap-2">
                        <input
                            id="talos-account-name"
                            v-model="nameDraft"
                            data-testid="talos-account-name"
                            type="text"
                            maxlength="60"
                            autocomplete="name"
                            :placeholder="t('account.yourName')"
                            :aria-label="t('account.displayName')"
                            class="min-h-touch min-w-0 flex-1 rounded-xl border border-[var(--talos-border)] bg-[var(--talos-input,var(--talos-background))] px-3 text-sm text-[var(--talos-text)] outline-none focus:border-[var(--talos-accent)]"
                            @keydown.enter.prevent="saveName"
                        >
                        <Button type="button" data-testid="talos-account-name-save" class="min-h-touch gap-1.5 rounded-xl" :disabled="!nameDraft.trim() || nameDraft.trim() === account.state.display_name" @click="saveName">
                            <Check class="size-4" aria-hidden="true" /> {{ nameSaved ? t('common.saved') : t('common.save') }}
                        </Button>
                    </div>
                </div>
            </div>
        </section>

        <!-- Predisposed OAuth — present but honestly gated (local-first). -->
        <section>
            <h4 class="text-sm font-semibold text-[var(--talos-text)]">{{ t('account.signIn') }}</h4>
            <p class="mt-1 text-xs leading-5 text-[var(--talos-muted)]">
                {{ t('account.signInBody') }}
            </p>
            <div class="mt-2 flex flex-col gap-2">
                <Button
                    v-for="provider in account.oauthProviders"
                    :key="provider.id"
                    type="button"
                    variant="outline"
                    :data-testid="`talos-oauth-${provider.id}`"
                    class="talos-pressable min-h-12 w-full justify-center gap-2 rounded-xl border-[var(--talos-border)] text-[var(--talos-text)]"
                    @click="tryOAuth"
                >
                    {{ oauthProviderLabel(provider) }}
                    <span class="text-3xs font-semibold uppercase tracking-wide text-[var(--talos-muted)]">{{ t('account.soon') }}</span>
                </Button>
            </div>
        </section>

        <section>
            <h4 class="text-sm font-semibold text-[var(--talos-text)]">{{ t('account.localWorkspace') }}</h4>
            <p class="mt-1 text-xs leading-5 text-[var(--talos-muted)]">
                {{ t('account.localWorkspaceBody') }}
            </p>
        </section>

        <section>
            <h4 class="text-sm font-semibold text-[var(--talos-text)]">{{ t('account.appLock') }}</h4>
            <p class="mt-1 text-xs leading-5 text-[var(--talos-muted)]">
                {{ t('account.appLockBody') }}
            </p>
            <p
                v-if="!settings.state.security.app_lock_enabled"
                data-testid="talos-applock-off-warning"
                class="mt-2 rounded-lg border border-[var(--talos-border)] bg-[var(--talos-panel)] px-3 py-2 text-xs leading-5 text-[var(--talos-muted)]"
            >
                {{ t('account.appLockOffWarning') }}
            </p>
            <div class="mt-1 flex items-center justify-between gap-3">
                <span class="text-sm text-[var(--talos-text)]">{{ t('account.requirePin') }}</span>
                <TalosThemedSwitch
                    test-id="talos-applock-toggle"
                    :model-value="settings.state.security.app_lock_enabled"
                    :aria-label="t('account.requirePin')"
                    @update:model-value="toggleAppLock"
                />
            </div>
            <TalosMobileAppLockModal
                v-if="lockModal !== null"
                :mode="lockModal"
                :biometric-enabled="settings.state.security.app_lock_biometric"
                @close="lockModal = null"
                @completed="onLockModalCompleted"
            />
            <p
                v-if="protecting"
                data-testid="talos-applock-protecting"
                role="status"
                class="mt-3 rounded-lg border border-[var(--talos-border)] bg-[var(--talos-panel)] px-3 py-2 text-xs leading-5 text-[var(--talos-text)]"
            >
                {{ t('account.protecting') }}
            </p>
            <p
                v-if="protectionError"
                data-testid="talos-applock-protect-error"
                role="alert"
                class="mt-3 rounded-lg border border-[var(--talos-danger)]/40 bg-[var(--talos-danger)]/10 px-3 py-2 text-xs leading-5 text-[var(--talos-text)]"
            >
                {{ protectionError }}
            </p>
            <!-- Debt S3: the 6-digit minimum only ever ran at setup, so a PIN
                 armed before it existed stayed 4 digits with nothing saying so. -->
            <p
                v-if="settings.state.security.app_lock_enabled && weakPin"
                data-testid="talos-applock-weak"
                role="status"
                class="mt-3 rounded-lg border border-[var(--talos-danger)]/40 bg-[var(--talos-danger)]/10 px-3 py-2 text-xs leading-5 text-[var(--talos-text)]"
            >
                {{ t('account.weakPin') }}
            </p>
            <div class="mt-3 flex items-center justify-between gap-3">
                <span class="min-w-0 flex-1 text-sm text-[var(--talos-text)]">
                    {{ t('account.screenSecure') }}
                    <span class="mt-0.5 block text-xs leading-5 text-[var(--talos-muted)]">
                        {{ t('account.screenSecureBody') }}
                    </span>
                </span>
                <TalosThemedSwitch
                    test-id="talos-screen-secure-toggle"
                    :model-value="settings.state.security.screen_secure"
                    :aria-label="t('account.screenSecure')"
                    @update:model-value="toggleScreenSecure"
                />
            </div>
            <div
                v-if="settings.state.security.app_lock_enabled && biometricAvailable"
                class="mt-3 flex items-center justify-between gap-3"
            >
                <span class="text-sm text-[var(--talos-text)]">{{ t('account.biometrics') }}</span>
                <TalosThemedSwitch
                    test-id="talos-applock-biometric"
                    :model-value="settings.state.security.app_lock_biometric"
                    :aria-label="t('account.biometrics')"
                    @update:model-value="toggleBiometric"
                />
            </div>
        </section>

        <section>
            <h4 class="text-sm font-semibold text-[var(--talos-text)]">{{ t('account.dictationDiagnostics') }}</h4>
            <p class="mt-1 text-xs leading-5 text-[var(--talos-muted)]" data-testid="talos-dictation-diagnostics">
                <template v-if="dictationDiag">
                    {{ t('account.diagnosticsPlatform') }} {{ dictationDiag.native ? t('account.diagnosticsNative') : t('account.diagnosticsWeb') }} ·
                    {{ t('account.diagnosticsPlugin') }} {{ dictationDiag.pluginLoaded ? t('account.diagnosticsLoaded') : t('account.diagnosticsNotLoaded') }} ·
                    {{ t('account.diagnosticsRecognizer') }} {{ dictationDiag.available === null ? t('account.diagnosticsUnknown') : (dictationDiag.available ? t('account.diagnosticsAvailable') : t('account.diagnosticsUnavailable')) }}
                    <template v-if="dictationDiag.error"> · {{ t('account.diagnosticsError') }} {{ dictationDiag.error }}</template>
                    <template v-else-if="dictationDiag.trace"> · {{ t('account.diagnosticsDetails') }} {{ dictationDiag.trace }}</template>
                </template>
                <template v-else>{{ t('account.diagnosticsProbing') }}</template>
            </p>
        </section>

        <section>
            <h4 class="text-sm font-semibold text-[var(--talos-text)]">{{ t('onboarding.replayTitle') }}</h4>
            <p class="mt-1 text-xs leading-5 text-[var(--talos-muted)]">
                {{ t('onboarding.replayBody') }}
            </p>
            <Button
                type="button"
                variant="outline"
                data-testid="talos-setup-replay"
                class="talos-pressable mt-2 min-h-touch gap-2"
                @click="replayIntroduction"
            >
                <RotateCcw class="size-4" aria-hidden="true" />
                {{ t('onboarding.replayAction') }}
            </Button>
        </section>
    </div>
</template>
