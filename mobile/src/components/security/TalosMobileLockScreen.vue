<script setup lang="ts">
/**
 * F2-T6 — app lock screen. Full-screen gate over the workspace: unlocks ONLY
 * through a verified PIN or a real OS biometric success (no skip, no fake
 * session). Loaded as an async chunk by App.vue only when the lock is armed.
 */
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { useTalosI18n } from '@/i18n'
import { Fingerprint, Loader2, LockKeyhole } from '@lucide/vue'
import { Button } from '@/components/ui/button'
import { appLockThrottleRemainingMs, requestBiometricUnlock, verifyAppLockPin } from '@/services/appLock'
import { unlockTalosDatabase } from '@/services/databaseProtection'
import {
    armTalosBiometricUnlock,
    talosBiometricUnlockIsArmed,
    peekTalosDatabaseKey,
    talosDatabaseKeyIsProtected,
    unlockTalosDatabaseKeyWithBiometrics,
} from '@/services/databaseKey'
import { talosBiometricKeyWasCancelled } from '@/services/biometricKeyWrap'
import { talosLightImpact } from '@/services/haptics'
import { useTalosModalSurface } from '@/composables/useTalosModalSurface'

const props = defineProps<{
    biometricEnabled: boolean
}>()

const emit = defineEmits<{
    unlocked: []
}>()

const { t } = useTalosI18n()
const pin = ref('')
const error = ref<string | null>(null)
const verifying = ref(false)
const pinField = ref<HTMLInputElement | null>(null)

// Debt S3 — attempt throttling. The gate itself lives in the service (it is
// persisted, so killing the app does not reset it); the screen mirrors it so
// the user sees a countdown instead of a PIN that silently stops working.
// The database key is wrapped by the PIN, so a fingerprint cannot derive it —
// offering biometrics on its own unlocked the SCREEN over a locked database:
// the user saw their chats and the first send failed.
//
// Owner 2026-07-26 chose the real fix over that refusal: the key is wrapped a
// SECOND time by a hardware Keystore key that a live scan releases. So the
// fingerprint is offered when, and only when, that copy exists. `keyNeedsPin`
// now means "protected, and no biometric copy yet" — the first unlock after
// setting a PIN, and every unlock afterwards if the user declined biometrics.
const keyNeedsPin = ref(false)
const throttleMs = ref(0)
const throttled = computed(() => throttleMs.value > 0)
const throttleLabel = computed(() => {
    const seconds = Math.ceil(throttleMs.value / 1000)
    if (seconds >= 60) {
        const minutes = Math.ceil(seconds / 60)
        return minutes === 1
            ? t('lock.tooManyMinutesOne')
            : t('lock.tooManyMinutesMany', { count: minutes })
    }
    return seconds === 1
        ? t('lock.tooManySecondsOne')
        : t('lock.tooManySecondsMany', { count: seconds })
})

let countdown: ReturnType<typeof setInterval> | null = null
let alive = true
async function refreshThrottle(): Promise<void> {
    const remaining = await appLockThrottleRemainingMs().catch(() => 0)
    // SF: a biometric success can unmount this screen while the read is still
    // in flight — installing an interval afterwards holds the scope for the
    // whole lockout.
    if (!alive) return
    throttleMs.value = remaining
    if (!throttled.value || countdown !== null) return
    // SF: WebView timers are throttled in background, so a decrementing
    // counter drifts. Track the DEADLINE and recompute every tick.
    const deadline = Date.now() + remaining
    countdown = setInterval(() => {
        throttleMs.value = Math.max(0, deadline - Date.now())
        if (!throttled.value && countdown !== null) {
            clearInterval(countdown)
            countdown = null
        }
    }, 1000)
}
onBeforeUnmount(() => {
    alive = false
    if (countdown !== null) clearInterval(countdown)
})

// R1-3 — the lock was an overlay over a LIVE workspace (focusable behind it).
// Teleported to body + shared modality: #app goes inert, Tab is trapped.
const root = ref<HTMLElement | null>(null)
const { trapTab } = useTalosModalSurface(root)

function unlock(): void {
    void talosLightImpact()
    emit('unlocked')
}

async function submitPin(): Promise<void> {
    if (verifying.value || !pin.value || throttled.value) return
    verifying.value = true
    error.value = null
    try {
        if (await verifyAppLockPin(pin.value)) {
            // Debt S1: the PIN is the database key now. Unlocking the screen
            // without unwrapping it would show an empty workspace over data
            // that is still there — worse than staying locked.
            if (await unlockTalosDatabase(pin.value)) {
                // The PIN has just proven itself, which is the only moment we
                // are entitled to make a second door onto this key. Arming asks
                // for a scan, so it must not block the unlock: a refusal there
                // leaves the user with the PIN, exactly as before.
                if (props.biometricEnabled && !await talosBiometricUnlockIsArmed().catch(() => true)) {
                    const key = peekTalosDatabaseKey()
                    if (key) await armTalosBiometricUnlock(key).catch(() => {})
                }
                unlock()
            } else {
                error.value = t('lock.acceptedDataFailed')
                pin.value = ''
            }
        } else {
            error.value = t('lock.wrongPinRetry')
            pin.value = ''
            await refreshThrottle()
        }
    } finally {
        verifying.value = false
    }
}

async function tryBiometric(): Promise<void> {
    const protectedKey = await talosDatabaseKeyIsProtected().catch(() => false)
    if (!protectedKey) {
        // No managed key: the screen is the only thing locked, so the OS prompt
        // alone is a truthful gate.
        if (await requestBiometricUnlock(t('lock.title'))) unlock()
        return
    }
    if (!await talosBiometricUnlockIsArmed().catch(() => false)) {
        keyNeedsPin.value = true
        error.value = t('lock.biometricNeedsPin')
        pinField.value?.focus()
        return
    }
    try {
        // This does open the database: the Keystore releases the unwrapping key
        // only for a live scan, so success here is real access, not a screen
        // dismissal over data that is still sealed.
        await unlockTalosDatabaseKeyWithBiometrics()
        unlock()
    } catch (failure) {
        keyNeedsPin.value = true
        // A cancel is the user choosing the PIN, not a fault worth an alarm.
        error.value = talosBiometricKeyWasCancelled(failure)
            ? null
            : t('lock.biometricUnavailable')
        pinField.value?.focus()
    }
}

onMounted(() => {
    void refreshThrottle()
    void talosDatabaseKeyIsProtected()
        .then((value) => { keyNeedsPin.value = value })
        .catch(() => { keyNeedsPin.value = false })
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
        :aria-label="$t('lock.lockedLabel')"
        tabindex="-1"
        class="pointer-events-auto fixed inset-0 z-[120] flex flex-col items-center justify-center gap-6 bg-[var(--talos-background)] px-8 pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)]"
        @keydown="trapTab"
    >
        <LockKeyhole class="size-10 text-[var(--talos-accent,var(--primary))]" aria-hidden="true" />
        <div class="text-center">
            <h1 class="text-xl font-semibold text-[var(--talos-text,var(--foreground))]">
                <span class="talos-orbitron-brand">TALOS</span> {{ $t('lock.isLocked') }}
            </h1>
            <p class="mt-1 text-sm text-[var(--talos-muted,var(--muted-foreground))]">{{ $t('lock.enterToContinue') }}</p>
        </div>

        <form class="flex w-full max-w-[280px] flex-col gap-3" @submit.prevent="submitPin">
            <input
                ref="pinField"
                v-model="pin"
                data-testid="talos-lock-pin"
                type="password"
                inputmode="numeric"
                maxlength="12"
                pattern="[0-9]*"
                enterkeyhint="done"
                autocomplete="off"
                :aria-label="$t('lock.pin')"
                class="min-h-12 rounded-xl border border-[var(--talos-border,var(--border))] bg-[var(--talos-panel,var(--card))] px-4 text-center text-lg tracking-[0.5em] text-[var(--talos-text,var(--foreground))] outline-none focus-visible:ring-2 focus-visible:ring-[var(--talos-ring)]"
            >
            <p v-if="throttled" role="alert" data-testid="talos-lock-throttle" class="text-center text-sm text-[var(--talos-danger)]">{{ throttleLabel }}</p>
            <p v-else-if="error" role="alert" class="text-center text-sm text-[var(--talos-danger)]">{{ error }}</p>
            <Button
                type="submit"
                data-testid="talos-lock-submit"
                :disabled="verifying || !pin || throttled"
                @click.prevent="submitPin"
                class="talos-pressable min-h-12 rounded-full bg-[var(--talos-accent,var(--primary))] text-sm font-medium text-[var(--talos-accent-contrast,var(--primary-foreground))]"
            >
                <Loader2 v-if="verifying" class="size-4 animate-spin" aria-hidden="true" />
                <span v-else>{{ $t('lock.unlock') }}</span>
            </Button>
        </form>

        <Button
            v-if="biometricEnabled && !keyNeedsPin"
            type="button"
            variant="ghost"
            data-testid="talos-lock-biometric"
            class="talos-pressable min-h-touch gap-2 text-sm text-[var(--talos-muted,var(--muted-foreground))]"
            @click="tryBiometric"
        >
            <Fingerprint class="size-4" aria-hidden="true" />
            {{ $t('lock.useBiometrics') }}
        </Button>
    </div>
    </Teleport>
</template>
