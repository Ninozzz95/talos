<script setup lang="ts">
/**
 * F2-T6 — app lock screen. Full-screen gate over the workspace: unlocks ONLY
 * through a verified PIN or a real OS biometric success (no skip, no fake
 * session). Loaded as an async chunk by App.vue only when the lock is armed.
 */
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { Fingerprint, Loader2, LockKeyhole } from '@lucide/vue'
import { Button } from '@/components/ui/button'
import { appLockThrottleRemainingMs, requestBiometricUnlock, verifyAppLockPin } from '@/services/appLock'
import { unlockTalosDatabase } from '@/services/databaseProtection'
import { talosDatabaseKeyIsProtected } from '@/services/databaseKey'
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

// Debt S3 — attempt throttling. The gate itself lives in the service (it is
// persisted, so killing the app does not reset it); the screen mirrors it so
// the user sees a countdown instead of a PIN that silently stops working.
// SF-MAJOR: the database key is wrapped by the PIN alone, so a fingerprint
// cannot open it. Offering biometrics there unlocked the SCREEN over a locked
// database — the user sees their chats and the first send fails.
const keyNeedsPin = ref(false)
const throttleMs = ref(0)
const throttled = computed(() => throttleMs.value > 0)
const throttleLabel = computed(() => {
    const seconds = Math.ceil(throttleMs.value / 1000)
    if (seconds >= 60) {
        const minutes = Math.ceil(seconds / 60)
        return `Too many attempts. Try again in ${minutes} minute${minutes === 1 ? '' : 's'}.`
    }
    return `Too many attempts. Try again in ${seconds} second${seconds === 1 ? '' : 's'}.`
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
                unlock()
            } else {
                error.value = 'PIN accepted but the data could not be opened. Try again.'
                pin.value = ''
            }
        } else {
            error.value = 'Wrong PIN. Try again.'
            pin.value = ''
            await refreshThrottle()
        }
    } finally {
        verifying.value = false
    }
}

async function tryBiometric(): Promise<void> {
    if (await talosDatabaseKeyIsProtected().catch(() => false)) {
        keyNeedsPin.value = true
        error.value = 'Your data is encrypted with the PIN — enter it once to open it.'
        pinField.value?.focus()
        return
    }
    if (await requestBiometricUnlock('Unlock TALOS')) unlock()
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
                maxlength="12"
                pattern="[0-9]*"
                enterkeyhint="done"
                autocomplete="off"
                aria-label="PIN"
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
                <span v-else>Unlock</span>
            </Button>
        </form>

        <Button
            v-if="biometricEnabled && !keyNeedsPin"
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
