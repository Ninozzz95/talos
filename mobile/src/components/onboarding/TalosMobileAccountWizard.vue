<script setup lang="ts">
/**
 * N1 — guided account-creation wizard shell. Fullscreen surface (mirrors the
 * intro-modal chrome: dialog role, safe-area, dot progress, thumb-zone footer)
 * that drives the pure step machine and wires each step's side effects:
 * identity → account.setDisplayName; personalize → theme store (live);
 * protect → the device-proven app-lock setup modal; signin → honest OAuth gate;
 * done → persist outcome + close. Local-first, no fake auth. Loaded via
 * defineAsyncComponent by App.vue — resolved users never pay the chunk.
 */
import { computed, inject, onBeforeUnmount, onMounted, ref } from 'vue'
import { ArrowLeft, X } from '@lucide/vue'
import { Button } from '@/components/ui/button'
import TalosMobileAppLockModal from '@/components/talos/settings/TalosMobileAppLockModal.vue'
import WizardWelcome from '@/components/onboarding/wizard/WizardWelcome.vue'
import WizardIdentity from '@/components/onboarding/wizard/WizardIdentity.vue'
import WizardPersonalize from '@/components/onboarding/wizard/WizardPersonalize.vue'
import WizardProtect from '@/components/onboarding/wizard/WizardProtect.vue'
import WizardSignIn from '@/components/onboarding/wizard/WizardSignIn.vue'
import WizardDone from '@/components/onboarding/wizard/WizardDone.vue'
import { TALOS_WIZARD_STEPS } from '@/components/onboarding/wizard/wizardSteps'
import { useTalosAccountWizard } from '@/composables/useTalosAccountWizard'
import { TALOS_MOBILE_WIZARD_KEY } from '@/lib/wizardInjection'
import { useTalosAccountStore } from '@/stores/account'
import { useThemeStore } from '@/stores/theme'
import { useSettingsStore } from '@/stores/settings'
import { useTalosMobileToasts } from '@/stores/toasts'
import type { TalosMobileWizardOutcome } from '@/stores/settings'

const wizardState = inject(TALOS_MOBILE_WIZARD_KEY, null)
const machine = useTalosAccountWizard()
const account = useTalosAccountStore()
const theme = useThemeStore()
const settings = useSettingsStore()
const toasts = useTalosMobileToasts()

const root = ref<HTMLElement | null>(null)
const name = ref(account.state.display_name)
const lockModal = ref<'setup' | null>(null)

const stepId = computed(() => machine.current.value.id)
const primaryLabel = computed(() =>
    stepId.value === 'welcome' ? 'Get started' : machine.isLast.value ? 'Enter TALOS' : 'Continue')

// SF M2/M3: hardware Back closes the app-lock modal FIRST, then walks the steps;
// at the first step it dismisses the wizard — never a dead key, never an app exit.
function hardwareBack(): void {
    if (lockModal.value !== null) { lockModal.value = null; return }
    if (machine.canBack.value) { machine.back(); return }
    void dismiss()
}

onMounted(() => {
    root.value?.focus()
    wizardState?.setBack(hardwareBack)
})
onBeforeUnmount(() => { wizardState?.setBack(null) })

async function finish(outcome: TalosMobileWizardOutcome): Promise<void> {
    await (wizardState?.closeWizard(outcome) ?? Promise.resolve())
}
// SF m6: dismissing ON the Done step is a completion, not a skip.
function dismiss(): Promise<void> { return finish(machine.isLast.value ? 'completed' : 'skipped') }

// SF M4: commit the typed name when LEAVING identity forward — Continue AND
// Skip — so the live avatar preview never silently drops the name.
function commitIdentity(): void {
    if (stepId.value === 'identity') { void account.setDisplayName(name.value).catch(() => undefined) }
}

async function onPrimary(): Promise<void> {
    commitIdentity()
    if (machine.isLast.value) { await finish('completed'); return }
    machine.next()
}

function onSkip(): void {
    commitIdentity()
    machine.skip()
}

function oauthGate(id: string): void {
    const provider = account.oauthProviders.find((p) => p.id === id)
    if (provider) toasts.push({ message: provider.gateReason, durationMs: 6000 })
}

async function onLockCompleted(): Promise<void> {
    await settings.setSecurity({ app_lock_enabled: true })
    lockModal.value = null
}

function onKeydown(event: KeyboardEvent): void {
    if (event.key === 'Escape') void dismiss()
}
</script>

<template>
    <div
        ref="root"
        data-testid="talos-account-wizard"
        role="dialog"
        aria-modal="true"
        aria-label="Set up your workspace"
        tabindex="-1"
        class="fixed inset-0 z-[72] flex flex-col bg-[var(--talos-background)] pt-[max(1rem,env(safe-area-inset-top))] pb-[max(1rem,env(safe-area-inset-bottom))] text-[var(--talos-text)] outline-none"
        @keydown="onKeydown"
    >
        <header class="flex items-center justify-between px-5 pb-2">
            <p class="talos-orbitron-brand text-xs uppercase tracking-[0.3em] text-[var(--talos-accent,var(--primary))]">TALOS</p>
            <Button
                type="button"
                size="icon"
                variant="ghost"
                data-mobile-icon-only="true"
                data-testid="talos-wizard-close"
                aria-label="Close setup"
                class="talos-pressable min-h-11 min-w-11 rounded-full"
                @click="dismiss()"
            >
                <X class="size-5" aria-hidden="true" />
            </Button>
        </header>

        <section class="flex min-h-0 flex-1 flex-col overflow-y-auto px-6" aria-live="polite">
            <WizardWelcome v-if="stepId === 'welcome'" @skip-all="finish('skipped')" />
            <WizardIdentity v-else-if="stepId === 'identity'" v-model="name" />
            <WizardPersonalize v-else-if="stepId === 'personalize'" />
            <WizardProtect v-else-if="stepId === 'protect'" @setup-pin="lockModal = 'setup'" />
            <WizardSignIn v-else-if="stepId === 'signin'" @oauth="oauthGate" />
            <WizardDone
                v-else
                :name="account.state.display_name"
                :mode="theme.state.mode"
                :lock="settings.state.security.app_lock_enabled"
            />
        </section>

        <footer class="px-5 pt-3">
            <!-- SF m5: the dots are decorative; announce progress to assistive tech. -->
            <p class="sr-only" aria-live="polite">Step {{ machine.index.value + 1 }} of {{ TALOS_WIZARD_STEPS.length }}</p>
            <div class="flex items-center justify-center gap-2 pb-4" data-testid="talos-wizard-progress" aria-hidden="true">
                <span
                    v-for="(step, dot) in TALOS_WIZARD_STEPS"
                    :key="step.id"
                    data-testid="talos-wizard-dot"
                    :aria-current="dot === machine.index.value ? 'step' : undefined"
                    class="size-1.5 rounded-full transition-colors duration-200"
                    :class="dot === machine.index.value ? 'bg-[var(--talos-accent,var(--primary))]' : 'bg-[var(--talos-border,var(--border))]'"
                />
            </div>
            <div class="flex items-center gap-2">
                <Button
                    type="button"
                    size="icon"
                    variant="outline"
                    data-mobile-icon-only="true"
                    data-testid="talos-wizard-back"
                    aria-label="Back"
                    :class="machine.canBack.value ? '' : 'invisible'"
                    class="talos-pressable min-h-11 min-w-11 rounded-full"
                    @click="machine.back()"
                >
                    <ArrowLeft class="size-4" aria-hidden="true" />
                </Button>
                <Button
                    v-if="machine.current.value.skippable"
                    type="button"
                    variant="ghost"
                    data-testid="talos-wizard-skip"
                    class="talos-pressable min-h-11 flex-1 text-sm text-[var(--talos-muted,var(--muted-foreground))]"
                    @click="onSkip()"
                >Skip</Button>
                <Button
                    type="button"
                    data-testid="talos-wizard-primary"
                    class="talos-pressable min-h-12 flex-1 rounded-full bg-[var(--talos-accent,var(--primary))] text-sm font-medium text-[var(--talos-accent-contrast,var(--primary-foreground))]"
                    @click="onPrimary"
                >{{ primaryLabel }}</Button>
            </div>
        </footer>

        <TalosMobileAppLockModal
            v-if="lockModal !== null"
            :mode="lockModal"
            :biometric-enabled="settings.state.security.app_lock_biometric"
            @close="lockModal = null"
            @completed="onLockCompleted"
        />
    </div>
</template>
