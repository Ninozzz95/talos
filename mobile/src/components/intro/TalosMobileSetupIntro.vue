<script setup lang="ts">
/**
 * First run: the two things TALOS cannot start without.
 *
 * Owner 2026-07-27 chose "setup essenziale, 2 passi" over the six-slide intro
 * carousel this replaces, after the research said what the carousel was doing
 * wrong:
 *  - NN/g finds deck-of-cards tutorials "make the interface appear more
 *    complicated than it actually is", and that they do not improve task
 *    performance. Onboarding earns its place only when the app genuinely needs
 *    something before it can work — which is exactly these two things.
 *  - NN/g on wizards: show the steps and where you are, allow going back, let
 *    people resume, keep each step self-sufficient.
 *  - NN/g: "always provide a highly visible Skip option".
 *  - Android: runtime permissions are requested when someone invokes the
 *    feature that needs them, never at first launch. Nothing here asks the
 *    device for anything.
 *
 * The old modal also promised features this device does not have ("On the
 * roadmap: ..."), which is what the owner meant by "molto fake". Nothing on
 * this screen describes anything TALOS cannot already do.
 *
 * Neither step reimplements what exists: the PIN opens the device-proven app
 * lock journey (which is what actually wraps the database key), and the model
 * step embeds the provider key panel from Settings.
 */
import { computed, defineAsyncComponent, onMounted, ref } from 'vue'
import { ArrowLeft, Check, ShieldCheck } from '@lucide/vue'
import { Button } from '@/components/ui/button'
import { TALOS_SETUP_STEPS, talosSetupProgress } from '@/lib/onboarding/setupProgress'
import { useChatController } from '@/stores/chatController'
import { useSettingsStore } from '@/stores/settings'
import type { TalosMobileIntroOutcome } from '@/stores/settings'

const emit = defineEmits<{ close: [outcome: TalosMobileIntroOutcome] }>()

// Both are heavy and neither is needed to paint the first step.
const TalosMobileAppLockModal = defineAsyncComponent(
    () => import('@/components/talos/settings/TalosMobileAppLockModal.vue'),
)
const TalosMobileProviderRuntimePanel = defineAsyncComponent(
    () => import('@/components/talos/models/TalosMobileProviderRuntimePanel.vue'),
)

const settings = useSettingsStore()
const controller = useChatController()
const root = ref<HTMLElement | null>(null)
const pinModalOpen = ref(false)
const protectionError = ref<string | null>(null)
const arming = ref(false)

const pinSet = computed(() => settings.state.security.app_lock_enabled === true)
const modelReady = computed(() => Object.values(controller.secrets).some(Boolean))
const progress = computed(() => talosSetupProgress({ pinSet: pinSet.value, modelReady: modelReady.value }))

// Where the flow opens is read from reality once, then the person steers. A
// step that re-decides itself while you are standing on it moves under you.
const index = ref(0)

/**
 * Owner 2026-07-27: setup alone said nothing about what TALOS IS. The six
 * slides it replaced said too much and promised things this device cannot do;
 * one screen, before the work, says the part that is both true and unusual.
 *
 * NN/g allows onboarding when the features are genuinely unlike the standard
 * ones, which is the case here and is not the case for most apps that show a
 * carousel. It stays one screen, and Skip is on it.
 */
const stage = ref<'story' | 'setup'>('story')

onMounted(() => {
    index.value = progress.value.startIndex
    root.value?.focus()
})

function beginSetup(): void {
    stage.value = 'setup'
}

const step = computed(() => TALOS_SETUP_STEPS[index.value]!)
const onLastStep = computed(() => index.value === TALOS_SETUP_STEPS.length - 1)

function next(): void {
    if (!onLastStep.value) index.value += 1
}

function back(): void {
    if (index.value > 0) index.value -= 1
}

/**
 * The PIN journey is the app-lock setup modal — the same one Settings uses, so
 * the confirm stage, the throttle and the Keystore derivation are the proven
 * ones rather than a second implementation that drifts.
 */
async function onPinArmed(pin?: string): Promise<void> {
    pinModalOpen.value = false
    if (!pin) return
    protectionError.value = null
    arming.value = true
    try {
        const { enableTalosDatabaseProtection } = await import('@/services/databaseProtection')
        await enableTalosDatabaseProtection(pin)
    } catch (cause) {
        // The lock is not claimed unless it was armed: saying otherwise here
        // would tell someone their chats are encrypted when they are not.
        protectionError.value = cause instanceof Error
            ? `The PIN was not armed: ${cause.message}`
            : 'The PIN was not armed.'
        return
    } finally {
        arming.value = false
    }
    await settings.setSecurity({ app_lock_enabled: true, screen_secure: true })
    next()
}

function onKeydown(event: KeyboardEvent): void {
    if (event.key === 'Escape' && !pinModalOpen.value) emit('close', 'skipped')
}

/**
 * What TALOS refuses to do, which is the only honest way to say what it is.
 *
 * The competitors that sell this promise well do not list features. Obsidian
 * writes "Your thoughts are yours" and then "No one else can read them, not
 * even us"; LM Studio writes "never leaves your device". The force is in the
 * claim made AGAINST themselves, and TALOS can make a stronger one truthfully:
 * there is no server of ours, so there is no "us" for anything to reach.
 *
 * Everything below is something this build already does. What is not built yet
 * is on its own line, named as such — the modal this replaces mixed the two,
 * and the owner rightly called the result fake.
 */
const TRAITS: ReadonlyArray<{ title: string; body: string }> = [
    {
        title: 'No account, and no server of ours',
        body: 'Your chats and files are encrypted on this phone. Nothing reaches us, because there is no us to reach — TALOS has no backend.',
    },
    {
        title: 'Models on this device',
        body: 'Download a model and run it here, offline. Or bring a key you already pay for: it stays in this phone and is sent only to that provider.',
    },
    {
        title: 'A memory you can argue with',
        body: 'TALOS remembers what you tell it to. You can read it, correct it or throw it away from inside the conversation.',
    },
    {
        title: 'Two models at once',
        body: 'Put a second model on the same question when one is not enough, and keep both answers.',
    },
]
</script>

<template>
    <div
        ref="root"
        data-testid="talos-intro-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="talos-setup-title"
        tabindex="-1"
        class="fixed inset-0 z-[70] flex flex-col bg-[var(--talos-background)] pt-[max(1rem,env(safe-area-inset-top))] pb-[max(1rem,env(safe-area-inset-bottom))] text-[var(--talos-text)] outline-none"
        @keydown="onKeydown"
    >
        <header class="flex items-center justify-between px-5 pb-4">
            <p class="talos-orbitron-brand text-xs uppercase tracking-[0.3em] text-[var(--talos-accent)]">TALOS</p>
            <button
                type="button"
                data-testid="talos-setup-skip"
                class="talos-pressable -mr-2 min-h-11 rounded-full px-3 text-sm text-[var(--talos-muted)]"
                @click="emit('close', 'skipped')"
            >Skip for now</button>
        </header>

        <!-- STORY: one screen, before any work is asked of anyone. -->
        <template v-if="stage === 'story'">
            <section data-testid="talos-setup-story" class="flex min-h-0 flex-1 flex-col overflow-y-auto px-5">
                <h1 id="talos-setup-title" class="talos-title text-3xl font-semibold leading-[1.15]">
                    An AI that runs on your phone,<br>
                    <span class="text-[var(--talos-muted)]">not on someone else's computer.</span>
                </h1>

                <ul class="mt-8 flex flex-col gap-6">
                    <li v-for="trait in TRAITS" :key="trait.title" class="border-l-2 border-[var(--talos-accent)] pl-4">
                        <p class="text-md font-medium leading-6">{{ trait.title }}</p>
                        <p class="mt-1.5 text-sm leading-6 text-[var(--talos-muted)]">{{ trait.body }}</p>
                    </li>
                </ul>

                <!-- Named as not-yet, on purpose. The modal this replaces mixed
                     what works with what is planned, which is what made it read
                     as a brochure rather than as a description. -->
                <p class="mt-8 text-sm leading-6 text-[var(--talos-muted)]">
                    <span class="mr-2 font-mono text-3xs uppercase tracking-[0.2em] text-[var(--talos-accent)]">Next</span>
                    Zethos, the runtime being built to put ten-billion-parameter models on a phone.
                </p>
                <p class="mt-3 text-sm leading-6 text-[var(--talos-muted)]">
                    Built by one engineer, and free: you pay only the providers you choose to use.
                </p>
            </section>

            <footer class="flex items-center gap-2 px-5 pt-4">
                <Button
                    type="button"
                    data-testid="talos-setup-begin"
                    class="talos-pressable min-h-12 flex-1 rounded-full bg-[var(--talos-accent)] text-sm font-medium text-[var(--talos-accent-contrast,var(--primary-foreground))]"
                    @click="beginSetup"
                >Set up TALOS</Button>
            </footer>
        </template>

        <template v-else>
        <!-- The rail: two named segments rather than anonymous dots, so the whole
             cost of setup is legible at a glance — two things, and which two.
             The accent means "done" here and nowhere else on this screen. -->
        <ol class="mb-8 flex items-start gap-3 px-5" aria-label="Setup steps">
            <li
                v-for="(item, position) in progress.steps"
                :key="item.id"
                data-testid="talos-setup-step"
                :aria-current="position === index ? 'step' : undefined"
                class="flex-1"
            >
                <span
                    class="block h-0.5 rounded-full transition-colors duration-300"
                    :class="item.done
                        ? 'bg-[var(--talos-accent)]'
                        : position === index ? 'bg-[var(--talos-text)]' : 'bg-[var(--talos-border)]'"
                    aria-hidden="true"
                />
                <span
                    class="mt-2 block text-2xs uppercase tracking-[0.2em] transition-colors duration-300"
                    :class="position === index ? 'text-[var(--talos-text)]' : 'text-[var(--talos-muted)]'"
                >{{ item.label }}</span>
            </li>
        </ol>

        <section class="flex min-h-0 flex-1 flex-col overflow-y-auto px-5">
            <!-- STEP 1 — the PIN. -->
            <template v-if="step.id === 'pin'">
                <h1 id="talos-setup-title" class="talos-title text-2xl font-semibold leading-tight">
                    Your PIN is the key
                </h1>
                <p class="mt-3 text-md leading-7 text-[var(--talos-muted)]">
                    TALOS encrypts your chats and files on this phone with it. Nothing is sent
                    anywhere to unlock them.
                </p>
                <!-- The one sentence set in full-strength text: everything else on
                     the step is quiet, so the consequence is the most legible thing
                     on the screen. It is also simply true — the PIN wraps the
                     database key, and there is nowhere else it is kept. -->
                <p class="mt-4 text-md font-medium leading-7">
                    Lose the PIN and the data cannot be opened. There is no recovery.
                </p>

                <div
                    v-if="pinSet"
                    data-testid="talos-setup-pin-done"
                    class="mt-7 flex items-center gap-2 rounded-xl border border-[var(--talos-accent-border,var(--talos-border))] bg-[var(--talos-active,var(--talos-panel))] px-4 py-3 text-sm"
                >
                    <Check class="size-5 text-[var(--talos-accent)]" aria-hidden="true" /> Your PIN is set.
                </div>
                <button
                    v-else
                    type="button"
                    data-testid="talos-setup-pin"
                    :disabled="arming"
                    class="talos-pressable mt-7 flex min-h-12 items-center justify-center gap-2 rounded-xl border border-[var(--talos-border)] px-4 text-sm font-medium disabled:opacity-50"
                    @click="pinModalOpen = true"
                >
                    <ShieldCheck class="size-5 text-[var(--talos-accent)]" aria-hidden="true" />
                    {{ arming ? 'Arming…' : 'Choose a PIN' }}
                </button>

                <p
                    v-if="protectionError"
                    role="alert"
                    data-testid="talos-setup-pin-error"
                    class="mt-3 text-sm text-[var(--talos-danger)]"
                >{{ protectionError }}</p>

                <p class="mt-4 text-sm leading-6 text-[var(--talos-muted)]">
                    You can skip this and set a PIN later in Settings. Until you do, the
                    conversations on this phone are stored unencrypted.
                </p>
            </template>

            <!-- STEP 2 — somewhere to think. -->
            <template v-else>
                <h1 id="talos-setup-title" class="talos-title text-2xl font-semibold leading-tight">
                    Where TALOS thinks
                </h1>
                <p class="mt-3 text-md leading-7 text-[var(--talos-muted)]">
                    Paste a key for a provider you already pay for. It is kept in this phone's
                    Keystore and is sent only to that provider, never to us.
                </p>
                <div class="mt-6" data-testid="talos-setup-model">
                    <TalosMobileProviderRuntimePanel />
                </div>
            </template>
        </section>

        <footer class="flex items-center gap-2 px-5 pt-4">
            <Button
                v-if="index > 0"
                type="button"
                size="icon"
                variant="outline"
                data-testid="talos-setup-back"
                data-mobile-icon-only="true"
                aria-label="Back"
                class="talos-pressable min-h-12 min-w-12 rounded-full"
                @click="back"
            >
                <ArrowLeft class="size-4" aria-hidden="true" />
            </Button>
            <Button
                v-if="!onLastStep"
                type="button"
                data-testid="talos-setup-next"
                class="talos-pressable min-h-12 flex-1 rounded-full bg-[var(--talos-accent)] text-sm font-medium text-[var(--talos-accent-contrast,var(--primary-foreground))]"
                @click="next"
            >{{ pinSet ? 'Next' : 'Not now' }}</Button>
            <Button
                v-else
                type="button"
                data-testid="talos-intro-cta"
                class="talos-pressable min-h-12 flex-1 rounded-full bg-[var(--talos-accent)] text-sm font-medium text-[var(--talos-accent-contrast,var(--primary-foreground))]"
                @click="emit('close', 'completed')"
            >Start using TALOS</Button>
        </footer>
        </template>

        <TalosMobileAppLockModal
            v-if="pinModalOpen"
            mode="setup"
            @close="pinModalOpen = false"
            @completed="onPinArmed"
        />
    </div>
</template>
