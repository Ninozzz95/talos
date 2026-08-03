<script setup lang="ts">
import { computed, defineAsyncComponent, inject, onBeforeUnmount, onMounted, ref } from 'vue'
import { useTalosI18n } from '@/i18n'
import { ArrowLeft, Check, ShieldCheck } from '@lucide/vue'
import { Button } from '@/components/ui/button'
import TalosMobileSettingsLanguagePanel from '@/components/talos/settings/TalosMobileSettingsLanguagePanel.vue'
import { TALOS_SETUP_STEPS, talosSetupProgress, type TalosSetupStepId } from '@/lib/onboarding/setupProgress'
import { talosBackgroundExtraSteps } from '@/lib/permissions/permissionRows'
import { readTalosDeviceState, requestTalosBatteryExemption } from '@/services/devicePermissions'
import { TALOS_INTRO_LANGUAGE_PAGE_ENABLED } from '@/lib/localizationPolicy'
import { TALOS_MOBILE_INTRO_KEY } from '@/lib/introInjection'
import { TALOS_DISPLAY_NAME_MEMORY_ID } from '@/services/profileMemory'
import { useTalosAccountStore } from '@/stores/account'
import { useChatController } from '@/stores/chatController'
import { useSettingsStore } from '@/stores/settings'
import type { TalosMobileIntroOutcome } from '@/stores/settings'

const props = withDefaults(defineProps<{ replay?: boolean }>(), {
    replay: false,
})
const emit = defineEmits<{ close: [outcome: TalosMobileIntroOutcome] }>()
const { t } = useTalosI18n()
const introState = inject(TALOS_MOBILE_INTRO_KEY, null)

const TalosMobileAppLockModal = defineAsyncComponent(
    () => import('@/components/talos/settings/TalosMobileAppLockModal.vue'),
)
const TalosMobileProviderRuntimePanel = defineAsyncComponent(
    () => import('@/components/talos/models/TalosMobileProviderRuntimePanel.vue'),
)

const settings = useSettingsStore()
const account = useTalosAccountStore()
const controller = useChatController()
const root = ref<HTMLElement | null>(null)
const pinModalOpen = ref(false)
const protectionError = ref<string | null>(null)
const arming = ref(false)
const identitySaving = ref(false)
const identityError = ref<string | null>(null)
const identityMemorySynced = ref(false)
const nameDraft = ref(account.state.display_name)

const pinSet = computed(() => settings.state.security.app_lock_enabled === true)
const modelReady = computed(() => Object.values(controller.secrets).some(Boolean))
/**
 * Se il telefono ha smesso di sospendere TALOS.
 *
 * Riletto a ogni ritorno in primo piano, perche la scelta si fa in una
 * schermata di SISTEMA: l unico modo onesto di sapere com e andata e chiedere
 * di nuovo quando si torna. E su ColorOS l impostazione si riazzera da sola.
 */
const backgroundReady = ref(false)
async function readBackground(): Promise<void> {
    const state = await readTalosDeviceState()
    backgroundReady.value = state.batteryExempt
    manufacturer.value = state.manufacturer
}
function onVisible(): void {
    if (document.visibilityState === 'visible') void readBackground()
}

const progress = computed(() => talosSetupProgress({
    identitySet: identityMemorySynced.value,
    pinSet: pinSet.value,
    modelReady: modelReady.value,
    backgroundReady: backgroundReady.value,
}))

const index = ref(0)
const stage = ref<'language' | 'story' | 'setup'>(
    TALOS_INTRO_LANGUAGE_PAGE_ENABLED ? 'language' : 'story',
)
const step = computed(() => TALOS_SETUP_STEPS[index.value]!)
const onLastStep = computed(() => index.value === TALOS_SETUP_STEPS.length - 1)

const traits = computed(() => [
    { title: t('onboarding.traitNoAccountTitle'), body: t('onboarding.traitNoAccountBody') },
    { title: t('onboarding.traitModelsTitle'), body: t('onboarding.traitModelsBody') },
    { title: t('onboarding.traitMemoryTitle'), body: t('onboarding.traitMemoryBody') },
    { title: t('onboarding.traitTwoModelsTitle'), body: t('onboarding.traitTwoModelsBody') },
    { title: t('onboarding.traitFilesTitle'), body: t('onboarding.traitFilesBody') },
])
const coming = computed(() => [
    t('onboarding.comingZethos'),
    t('onboarding.comingShizuku'),
    t('onboarding.comingSync'),
])

function setupStepLabel(id: TalosSetupStepId): string {
    if (id === 'identity') return t('onboarding.identityStep')
    if (id === 'pin') return t('onboarding.pinStep')
    if (id === 'permissions') return t('onboarding.backgroundStep')
    return t('onboarding.modelStep')
}

const manufacturer = ref('')
const backgroundSteps = computed(() => (backgroundReady.value
    ? []
    : talosBackgroundExtraSteps(manufacturer.value)))

const askingBackground = ref(false)
async function askBackground(): Promise<void> {
    if (askingBackground.value) return
    askingBackground.value = true
    try {
        await requestTalosBatteryExemption()
        // Non si risolve «concesso»: si e solo aperta una schermata di sistema.
        // La verita arriva al ritorno, quando si rilegge lo stato.
        await readBackground()
    } finally {
        askingBackground.value = false
    }
}

onMounted(async () => {
    introState?.setBack(hardwareBack)
    void readBackground()
    document.addEventListener('visibilitychange', onVisible)
    const savedName = account.state.display_name.trim()
    if (savedName) {
        try {
            const memories = await controller.memories.list()
            identityMemorySynced.value = memories.some(memory =>
                memory.id === TALOS_DISPLAY_NAME_MEMORY_ID
                && memory.status === 'active'
                && memory.content === savedName)
        } catch {
            // Missing storage evidence is not proof that the memory exists.
            identityMemorySynced.value = false
        }
    }
    nameDraft.value = account.state.display_name
    index.value = props.replay ? 0 : progress.value.startIndex
    root.value?.focus()
})
onBeforeUnmount(() => {
    introState?.setBack(null)
    document.removeEventListener('visibilitychange', onVisible)
})

function beginSetup(): void {
    stage.value = 'setup'
}

function next(): void {
    if (!onLastStep.value) index.value += 1
}

function back(): void {
    if (index.value > 0) {
        index.value -= 1
        return
    }
    stage.value = 'story'
}

function hardwareBack(): void {
    if (pinModalOpen.value) {
        pinModalOpen.value = false
        return
    }
    if (stage.value === 'setup') {
        back()
        return
    }
    if (stage.value === 'story' && TALOS_INTRO_LANGUAGE_PAGE_ENABLED) {
        stage.value = 'language'
        return
    }
    emit('close', 'skipped')
}

async function saveIdentityAndContinue(): Promise<void> {
    if (identitySaving.value) return
    const requestedName = nameDraft.value.trim()
    if (!requestedName) {
        identityError.value = t('onboarding.identityRequired')
        return
    }

    identitySaving.value = true
    identityError.value = null
    try {
        await account.setDisplayName(requestedName)
    } catch {
        identityError.value = t('onboarding.identitySaveError')
        identitySaving.value = false
        return
    }

    try {
        await controller.memories.upsertDisplayName(account.state.display_name)
        identityMemorySynced.value = true
        nameDraft.value = account.state.display_name
        next()
    } catch {
        identityError.value = t('onboarding.identityMemoryError')
    } finally {
        identitySaving.value = false
    }
}

async function advance(): Promise<void> {
    if (step.value.id === 'identity') {
        await saveIdentityAndContinue()
        return
    }
    next()
}

async function onPinArmed(pin?: string): Promise<void> {
    pinModalOpen.value = false
    if (!pin) return
    protectionError.value = null
    arming.value = true
    try {
        const { enableTalosDatabaseProtection } = await import('@/services/databaseProtection')
        await enableTalosDatabaseProtection(pin)
    } catch (cause) {
        protectionError.value = cause instanceof Error
            ? t('onboarding.pinArmError', { detail: cause.message })
            : t('onboarding.pinArmUnknown')
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
            >{{ t('common.skipForNow') }}</button>
        </header>

        <template v-if="stage === 'language'">
            <section
                data-testid="talos-setup-language"
                class="flex min-h-0 flex-1 flex-col overflow-y-auto px-5"
            >
                <h1 id="talos-setup-title" class="talos-title text-3xl font-semibold leading-tight">
                    {{ t('language.firstRunTitle') }}
                </h1>
                <p class="mt-3 text-md leading-7 text-[var(--talos-muted)]">
                    {{ t('language.firstRunBody') }}
                </p>
                <div class="mt-7">
                    <TalosMobileSettingsLanguagePanel />
                </div>
            </section>
            <footer class="flex items-center gap-2 px-5 pt-4">
                <Button
                    type="button"
                    data-testid="talos-language-continue"
                    class="talos-pressable min-h-12 flex-1 rounded-full bg-[var(--talos-accent)] text-sm font-medium text-[var(--talos-accent-contrast,var(--primary-foreground))]"
                    @click="stage = 'story'"
                >{{ t('common.continue') }}</Button>
            </footer>
        </template>

        <template v-else-if="stage === 'story'">
            <section data-testid="talos-setup-story" class="flex min-h-0 flex-1 flex-col overflow-y-auto px-5">
                <h1 id="talos-setup-title" class="talos-title text-3xl font-semibold leading-[1.15]">
                    {{ t('onboarding.storyTitle') }}<br>
                    <span class="text-[var(--talos-muted)]">{{ t('onboarding.storySubtitle') }}</span>
                </h1>

                <ul class="mt-8 flex flex-col gap-6">
                    <li v-for="trait in traits" :key="trait.title" class="border-l-2 border-[var(--talos-accent)] pl-4">
                        <p class="text-md font-medium leading-6">{{ trait.title }}</p>
                        <p class="mt-1.5 text-sm leading-6 text-[var(--talos-muted)]">{{ trait.body }}</p>
                    </li>
                </ul>

                <div class="mt-9 border-t border-[var(--talos-border)] pt-5">
                    <p class="font-mono text-3xs uppercase tracking-[0.25em] text-[var(--talos-accent)]">
                        {{ t('onboarding.comingLabel') }}
                    </p>
                    <ul class="mt-3 flex flex-col gap-2.5">
                        <li v-for="line in coming" :key="line" class="text-sm leading-6 text-[var(--talos-muted)]">
                            {{ line }}
                        </li>
                    </ul>
                </div>
                <p class="mt-6 text-sm leading-6 text-[var(--talos-muted)]">
                    {{ t('onboarding.pricing') }}
                </p>
            </section>

            <footer class="flex items-center gap-2 px-5 pt-4">
                <Button
                    v-if="TALOS_INTRO_LANGUAGE_PAGE_ENABLED"
                    type="button"
                    size="icon"
                    variant="outline"
                    data-mobile-icon-only="true"
                    :aria-label="t('common.back')"
                    class="talos-pressable min-h-12 min-w-12 rounded-full"
                    @click="stage = 'language'"
                >
                    <ArrowLeft class="size-4" aria-hidden="true" />
                </Button>
                <Button
                    type="button"
                    data-testid="talos-setup-begin"
                    class="talos-pressable min-h-12 flex-1 rounded-full bg-[var(--talos-accent)] text-sm font-medium text-[var(--talos-accent-contrast,var(--primary-foreground))]"
                    @click="beginSetup"
                >{{ t('onboarding.begin') }}</Button>
            </footer>
        </template>

        <template v-else>
            <ol class="mb-8 flex items-start gap-3 px-5" :aria-label="t('onboarding.setupSteps')">
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
                    >{{ setupStepLabel(item.id) }}</span>
                </li>
            </ol>

            <section class="flex min-h-0 flex-1 flex-col overflow-y-auto px-5">
                <template v-if="step.id === 'identity'">
                    <div data-testid="talos-setup-identity">
                        <h1 id="talos-setup-title" class="talos-title text-2xl font-semibold leading-tight">
                            {{ t('onboarding.identityTitle') }}
                        </h1>
                        <p class="mt-3 text-md leading-7 text-[var(--talos-muted)]">
                            {{ t('onboarding.identityBody') }}
                        </p>
                        <label for="talos-setup-name" class="mt-7 block text-sm font-medium">
                            {{ t('onboarding.identityLabel') }}
                        </label>
                        <input
                            id="talos-setup-name"
                            v-model="nameDraft"
                            data-testid="talos-setup-name"
                            type="text"
                            maxlength="60"
                            autocomplete="name"
                            enterkeyhint="next"
                            :placeholder="t('onboarding.identityPlaceholder')"
                            class="mt-2 min-h-12 w-full rounded-xl border border-[var(--talos-border)] bg-[var(--talos-input,var(--talos-background))] px-3 text-base text-[var(--talos-text)] outline-none focus:border-[var(--talos-accent)]"
                            @keydown.enter.prevent="advance"
                        >
                        <p
                            v-if="identityError"
                            role="alert"
                            data-testid="talos-setup-identity-error"
                            class="mt-3 text-sm leading-6 text-[var(--talos-danger)]"
                        >{{ identityError }}</p>
                    </div>
                </template>

                <template v-else-if="step.id === 'pin'">
                    <h1 id="talos-setup-title" class="talos-title text-2xl font-semibold leading-tight">
                        {{ t('onboarding.pinTitle') }}
                    </h1>
                    <p class="mt-3 text-md leading-7 text-[var(--talos-muted)]">
                        {{ t('onboarding.pinBody') }}
                    </p>
                    <p class="mt-4 text-md font-medium leading-7">
                        {{ t('onboarding.pinConsequence') }}
                    </p>

                    <div
                        v-if="pinSet"
                        data-testid="talos-setup-pin-done"
                        class="mt-7 flex items-center gap-2 rounded-xl border border-[var(--talos-accent-border,var(--talos-border))] bg-[var(--talos-active,var(--talos-panel))] px-4 py-3 text-sm"
                    >
                        <Check class="size-5 text-[var(--talos-accent)]" aria-hidden="true" />
                        {{ t('onboarding.pinDone') }}
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
                        {{ arming ? t('onboarding.pinArming') : t('onboarding.pinChoose') }}
                    </button>

                    <p
                        v-if="protectionError"
                        role="alert"
                        data-testid="talos-setup-pin-error"
                        class="mt-3 text-sm text-[var(--talos-danger)]"
                    >{{ protectionError }}</p>

                    <p class="mt-4 text-sm leading-6 text-[var(--talos-muted)]">
                        {{ t('onboarding.pinLater') }}
                    </p>
                </template>

                <template v-else-if="step.id === 'model'">
                    <h1 id="talos-setup-title" class="talos-title text-2xl font-semibold leading-tight">
                        {{ t('onboarding.modelTitle') }}
                    </h1>
                    <p class="mt-3 text-md leading-7 text-[var(--talos-muted)]">
                        {{ t('onboarding.modelBody') }}
                    </p>
                    <div class="mt-6" data-testid="talos-setup-model">
                        <TalosMobileProviderRuntimePanel />
                    </div>
                </template>

                <!--
                    L'ultima pagina, e l'unica che parla del telefono.

                    Owner 2026-08-03: «assicurarci che l'utente venga guidato per
                    whitelistare l'applicazione in modo che giri in BG. Senza
                    questa non possiamo andare avanti.»

                    Sta in fondo perche la ricerca sui permessi dice di chiedere
                    quando la persona ha capito a che serve, non all'avvio: qui
                    ha gia dato un nome allo spazio, un PIN e un modello, quindi
                    «le ricerche lunghe muoiono senza questa» vuol dire qualcosa.

                    E si puo saltare. Un onboarding che non lascia passare e un
                    onboarding che le persone disinstallano.
                -->
                <template v-else>
                    <h1 id="talos-setup-title" class="talos-title text-2xl font-semibold leading-tight">
                        {{ t('onboarding.backgroundTitle') }}
                    </h1>
                    <p class="mt-3 text-md leading-7 text-[var(--talos-muted)]">
                        {{ t('onboarding.backgroundBody') }}
                    </p>
                    <p class="mt-4 text-md font-medium leading-7">
                        {{ t('onboarding.backgroundConsequence') }}
                    </p>

                    <div
                        v-if="backgroundReady"
                        data-testid="talos-setup-background-done"
                        class="mt-7 flex items-center gap-2 rounded-xl border border-[var(--talos-accent-border,var(--talos-border))] bg-[var(--talos-active,var(--talos-panel))] px-4 py-3 text-sm"
                    >
                        <Check class="size-5 text-[var(--talos-accent)]" aria-hidden="true" />
                        {{ t('onboarding.backgroundDone') }}
                    </div>
                    <button
                        v-else
                        type="button"
                        data-testid="talos-setup-background"
                        :disabled="askingBackground"
                        class="talos-pressable mt-7 flex min-h-12 items-center justify-center gap-2 rounded-xl border border-[var(--talos-border)] px-4 text-sm font-medium disabled:opacity-50"
                        @click="askBackground()"
                    >
                        <ShieldCheck class="size-5 text-[var(--talos-accent)]" aria-hidden="true" />
                        {{ t('onboarding.backgroundAllow') }}
                    </button>

                    <!-- I passi che l'intent non copre, solo dove esistono
                         davvero e solo finche servono. -->
                    <template v-if="backgroundSteps.length">
                        <p class="mt-5 text-xs font-semibold uppercase tracking-wide text-[var(--talos-muted)]">
                            {{ t('privacyPermissions.makerStepsTitle') }}
                        </p>
                        <ol data-testid="talos-setup-background-steps" class="mt-2 flex list-decimal flex-col gap-1.5 pl-5">
                            <li v-for="stepKey in backgroundSteps" :key="stepKey" class="text-sm leading-6 text-[var(--talos-muted)]">
                                {{ t(stepKey) }}
                            </li>
                        </ol>
                    </template>

                    <p class="mt-4 text-sm leading-6 text-[var(--talos-muted)]">
                        {{ t('onboarding.backgroundLater') }}
                    </p>
                </template>
            </section>

            <footer class="flex items-center gap-2 px-5 pt-4">
                <Button
                    type="button"
                    size="icon"
                    variant="outline"
                    data-testid="talos-setup-back"
                    data-mobile-icon-only="true"
                    :aria-label="t('common.back')"
                    class="talos-pressable min-h-12 min-w-12 rounded-full"
                    @click="back"
                >
                    <ArrowLeft class="size-4" aria-hidden="true" />
                </Button>
                <Button
                    v-if="!onLastStep"
                    type="button"
                    data-testid="talos-setup-next"
                    :disabled="identitySaving || arming"
                    class="talos-pressable min-h-12 flex-1 rounded-full bg-[var(--talos-accent)] text-sm font-medium text-[var(--talos-accent-contrast,var(--primary-foreground))]"
                    @click="advance"
                >
                    <template v-if="step.id === 'identity'">
                        {{ identitySaving ? t('onboarding.identitySaving') : t('onboarding.identitySave') }}
                    </template>
                    <template v-else>{{ pinSet ? t('common.next') : t('common.notNow') }}</template>
                </Button>
                <Button
                    v-else
                    type="button"
                    data-testid="talos-intro-cta"
                    class="talos-pressable min-h-12 flex-1 rounded-full bg-[var(--talos-accent)] text-sm font-medium text-[var(--talos-accent-contrast,var(--primary-foreground))]"
                    @click="emit('close', 'completed')"
                >{{ t('onboarding.finish') }}</Button>
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
