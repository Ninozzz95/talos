<script setup lang="ts">
/**
 * F2-T6 — Account panel: honest local-first identity (no fake sign-in),
 * the "Replay introduction" row (desktop Account-tab parity) and the App
 * lock opt-in: PIN derivation in the OS Keystore, policy flags in
 * Preferences, biometrics offered only when the device really has them.
 */
import { inject, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { Check, RotateCcw, Wand2 } from '@lucide/vue'
import { Button } from '@/components/ui/button'
import TalosMobileAppLockModal from '@/components/talos/settings/TalosMobileAppLockModal.vue'
import TalosAccountAvatar from '@/components/talos/TalosAccountAvatar.vue'
import { TALOS_MOBILE_INTRO_KEY } from '@/lib/introInjection'
import { TALOS_MOBILE_WIZARD_KEY } from '@/lib/wizardInjection'
import { useSettingsStore } from '@/stores/settings'
import { useTalosAccountStore } from '@/stores/account'
import { useTalosMobileToasts } from '@/stores/toasts'
import { appLockPinIsWeak, biometricUnlockAvailable, clearAppLock } from '@/services/appLock'
import { talosDictationDiagnostics, type TalosDictationDiagnostics } from '@/services/dictation'

const router = useRouter()
const intro = inject(TALOS_MOBILE_INTRO_KEY, null)
const wizard = inject(TALOS_MOBILE_WIZARD_KEY, null)
const settings = useSettingsStore()
const account = useTalosAccountStore()
const toasts = useTalosMobileToasts()

// Owner 2026-07-24: local account identity + PREDISPOSED OAuth (honestly gated,
// no fake sign-in). The name drives the avatar initial across the shell.
const nameDraft = ref(account.state.display_name)
const nameSaved = ref(false)
async function saveName(): Promise<void> {
    await account.setDisplayName(nameDraft.value)
    nameDraft.value = account.state.display_name
    nameSaved.value = true
    window.setTimeout(() => { nameSaved.value = false }, 1600)
}
function tryOAuth(provider: { label: string; gateReason: string }): void {
    // No fake session: surface the honest gate.
    toasts.push({ message: provider.gateReason, durationMs: 6000 })
}

// F5-#32 (owner) — the whole PIN journey lives in a dedicated FULLSCREEN
// modal (setup: 6 digits + confirm; verify: current PIN or biometrics before
// the lock may fall). The panel only opens it and applies the outcome.
const lockModal = ref<'setup' | 'verify' | null>(null)
const biometricAvailable = ref(false)
// Debt S3: true when the stored PIN was last verified with fewer than 6 digits.
const weakPin = ref(false)

const dictationDiag = ref<TalosDictationDiagnostics | null>(null)

onMounted(async () => {
    biometricAvailable.value = await biometricUnlockAvailable().catch(() => false)
    weakPin.value = await appLockPinIsWeak().catch(() => false)
    dictationDiag.value = await talosDictationDiagnostics().catch((error) => ({
        buildId: 'unknown', native: false, registered: false, pluginLoaded: false,
        methods: [], permissionsRaw: null, availableRaw: null, available: null, error: String(error),
    }))
})

function replayIntroduction(): void {
    // Mirror of the desktop replay chain: leave Settings FIRST so the modal
    // never opens behind the settings surface, then replay exactly once.
    void router.push({ name: 'chat' })
    intro?.replayIntro()
}

async function replayWizardSetup(): Promise<void> {
    // Same rule as the intro replay, but AWAIT the route change first (SF M1):
    // the fullscreen wizard must not mount behind the settings sheet while its
    // leave transition is still painting.
    await router.push({ name: 'chat' })
    wizard?.replayWizard()
}

function toggleAppLock(): void {
    // Disabling NEVER clears immediately: the fullscreen modal confirms the
    // owner (PIN or biometrics) before the lock may fall.
    lockModal.value = settings.state.security.app_lock_enabled ? 'verify' : 'setup'
}

async function onLockModalCompleted(): Promise<void> {
    if (lockModal.value === 'setup') {
        await settings.setSecurity({ app_lock_enabled: true, screen_secure: true })
        weakPin.value = false
    } else if (lockModal.value === 'verify') {
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
    await settings.setSecurity({ app_lock_biometric: !settings.state.security.app_lock_biometric })
}
</script>

<template>
    <div class="flex flex-col gap-5">
        <!-- Owner 2026-07-24: local identity — name + avatar initial. -->
        <section data-testid="talos-account-identity">
            <div class="flex items-center gap-3">
                <TalosAccountAvatar size="lg" />
                <div class="min-w-0 flex-1">
                    <label for="talos-account-name" class="block text-xs font-medium text-[var(--talos-muted)]">Display name</label>
                    <div class="mt-1 flex gap-2">
                        <input
                            id="talos-account-name"
                            v-model="nameDraft"
                            data-testid="talos-account-name"
                            type="text"
                            maxlength="60"
                            autocomplete="name"
                            placeholder="Your name"
                            aria-label="Display name"
                            class="min-h-11 min-w-0 flex-1 rounded-xl border border-[var(--talos-border)] bg-[var(--talos-input,var(--talos-background))] px-3 text-sm text-[var(--talos-text)] outline-none focus:border-[var(--talos-accent)]"
                            @keydown.enter.prevent="saveName"
                        >
                        <Button type="button" data-testid="talos-account-name-save" class="min-h-11 gap-1.5 rounded-xl" :disabled="nameDraft.trim() === account.state.display_name" @click="saveName">
                            <Check class="size-4" aria-hidden="true" /> {{ nameSaved ? 'Saved' : 'Save' }}
                        </Button>
                    </div>
                </div>
            </div>
        </section>

        <!-- Predisposed OAuth — present but honestly gated (local-first). -->
        <section>
            <h4 class="text-sm font-semibold text-[var(--talos-text)]">Sign in</h4>
            <p class="mt-1 text-xs leading-5 text-[var(--talos-muted)]">
                TALOS runs fully local — no account is required. Sign-in is predisposed for the
                optional encrypted sync arriving with the sovereign core.
            </p>
            <div class="mt-2 flex flex-col gap-2">
                <Button
                    v-for="provider in account.oauthProviders"
                    :key="provider.id"
                    type="button"
                    variant="outline"
                    :data-testid="`talos-oauth-${provider.id}`"
                    class="talos-pressable min-h-12 w-full justify-center gap-2 rounded-xl border-[var(--talos-border)] text-[var(--talos-text)]"
                    @click="tryOAuth(provider)"
                >
                    {{ provider.label }}
                    <span class="text-[10px] font-semibold uppercase tracking-wide text-[var(--talos-muted)]">Soon</span>
                </Button>
            </div>
        </section>

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
            <!-- Debt S3: the 6-digit minimum only ever ran at setup, so a PIN
                 armed before it existed stayed 4 digits with nothing saying so. -->
            <p
                v-if="settings.state.security.app_lock_enabled && weakPin"
                data-testid="talos-applock-weak"
                role="status"
                class="mt-3 rounded-lg border border-[var(--talos-danger)]/40 bg-[var(--talos-danger)]/10 px-3 py-2 text-xs leading-5 text-[var(--talos-text)]"
            >
                Your PIN is shorter than the current 6-digit minimum. Turn the lock off and on
                again to set a longer one.
            </p>
            <div class="mt-3 flex items-center justify-between gap-3">
                <span class="min-w-0 flex-1 text-sm text-[var(--talos-text)]">
                    Hide in app switcher &amp; block screenshots
                    <span class="mt-0.5 block text-xs leading-5 text-[var(--talos-muted)]">
                        Android stops capturing this window — no screenshots, no screen
                        recording, and a blank card in recents.
                    </span>
                </span>
                <button
                    type="button"
                    role="switch"
                    data-testid="talos-screen-secure-toggle"
                    :aria-checked="settings.state.security.screen_secure"
                    aria-label="Hide in app switcher and block screenshots"
                    class="talos-pressable -mr-1 flex min-h-11 min-w-11 items-center justify-center"
                    @click="toggleScreenSecure"
                >
                    <span
                        class="relative h-6 w-11 rounded-full transition-colors duration-200"
                        :class="settings.state.security.screen_secure
                            ? 'bg-[var(--talos-accent,var(--primary))]'
                            : 'bg-[var(--talos-border,var(--border))]'"
                        aria-hidden="true"
                    >
                        <span
                            class="absolute top-0.5 size-5 rounded-full bg-white shadow transition-[left] duration-200"
                            :class="settings.state.security.screen_secure ? 'left-[22px]' : 'left-0.5'"
                        />
                    </span>
                </button>
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
            <h4 class="text-sm font-semibold text-[var(--talos-text)]">Workspace setup</h4>
            <p class="mt-1 text-xs leading-5 text-[var(--talos-muted)]">
                Re-run the guided setup — identity, appearance, app lock and sign-in.
            </p>
            <Button
                type="button"
                variant="outline"
                data-testid="talos-wizard-replay"
                class="talos-pressable mt-2 min-h-11 gap-2"
                @click="replayWizardSetup"
            >
                <Wand2 class="size-4" aria-hidden="true" />
                Set up workspace
            </Button>
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
