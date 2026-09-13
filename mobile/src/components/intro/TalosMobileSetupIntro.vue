<script setup lang="ts">
import { computed, defineAsyncComponent, inject, onBeforeUnmount, onMounted, ref } from 'vue'
import { useTalosI18n } from '@/i18n'
import { ArrowLeft, Check, ChevronDown, ShieldCheck } from '@lucide/vue'
import { Button } from '@/components/ui/button'
import TalosMobileSettingsLanguagePanel from '@/components/talos/settings/TalosMobileSettingsLanguagePanel.vue'
import { TALOS_SETUP_STEPS, talosSetupProgress, type TalosSetupStepId } from '@/lib/onboarding/setupProgress'
import { TALOS_AZIONI_GOVERNATE } from '@/lib/tools/toolControlCatalog'
import { talosBackgroundExtraSteps } from '@/lib/permissions/permissionRows'
import { readTalosDeviceState, requestTalosBatteryExemption } from '@/services/devicePermissions'
import { TALOS_INTRO_LANGUAGE_PAGE_ENABLED } from '@/lib/localizationPolicy'
import { TALOS_MOBILE_INTRO_KEY } from '@/lib/introInjection'
import { TALOS_DISPLAY_NAME_MEMORY_ID } from '@/services/profileMemory'
import { useTalosAccountStore } from '@/stores/account'
import { useChatController } from '@/stores/chatController'
import { useSettingsStore } from '@/stores/settings'
import TalosToolPermissionsBoard from '@/components/talos/permissions/TalosToolPermissionsBoard.vue'
import {
    TALOS_DEFAULT_TOOL_PERMISSIONS,
    type TalosToolPermissions,
} from '@/lib/tools/permissionTypes'
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
/*
 * ⛔ Pigro come il pannello dei provider, e per lo stesso motivo: interroga il
 * telefono sullo stato di dieci permessi, e quel lavoro non deve pesare
 * sull'avvio di chi non arriva mai all'ultimo passo. Il tetto del bundle
 * iniziale ha 2.115 byte liberi.
 */
const TalosMobileSettingsPrivacyPanel = defineAsyncComponent(
    () => import('@/components/talos/settings/TalosMobileSettingsPrivacyPanel.vue'),
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
    maker.value = { manufacturer: state.manufacturer, brand: state.brand }
}
function onVisible(): void {
    if (document.visibilityState === 'visible') void readBackground()
}

/**
 * Se la persona ha DECISO cosa TALOS puo fare da solo.
 *
 * Non «e diverso dal predefinito»: il magazzino tiene l elenco delle azioni
 * scelte, separato dai valori. «Chiedimelo sempre» e una risposta legittima e
 * va registrata come tale, altrimenti chi sceglie la prudenza non finirebbe mai
 * questo passo.
 */
/*
 * ⛔ Sui poteri GOVERNATI, non sul vocabolario: una parola nuova che nessun
 * attrezzo dichiara non deve far tornare incompleto un passo gia fatto. Vedi
 * `TALOS_AZIONI_GOVERNATE`.
 */
const autonomyChosen = computed(() => TALOS_AZIONI_GOVERNATE
    .every((action) => settings.state.tools_chosen.includes(action)))

const progress = computed(() => talosSetupProgress({
    identitySet: identityMemorySynced.value,
    pinSet: pinSet.value,
    modelReady: modelReady.value,
    autonomyChosen: autonomyChosen.value,
    backgroundReady: backgroundReady.value,
}))

const decidingAutonomy = ref(false)
/**
 * La scelta vive QUI finche' non si preme avanti.
 *
 * Owner 2026-08-06: i permessi dei tool si impostano «in one shot al primo
 * accesso». Salvare a ogni tocco significherebbe scrivere tre volte per una
 * decisione sola, e — peggio — registrare come SCELTO qualcosa che era solo un
 * passaggio del dito: la differenza fra una preferenza e un valore ereditato e'
 * l'unica cosa che permette all'app di aggiornare i suoi default senza
 * calpestare chi ha deciso davvero.
 */
const toolPermissions = ref<TalosToolPermissions>({ ...TALOS_DEFAULT_TOOL_PERMISSIONS })

/**
 * ⛔⛔⭐ QUALI AZIONI LA PERSONA HA DAVVERO TOCCATO — e perche' senza questo
 * insieme l'introduzione disarmava la difesa che le sta sotto.
 *
 * ## Il difetto, trovato leggendo il 2026-08-09
 *
 * Questo passo scriveva TUTTI E TRE i valori premendo «avanti», anche a
 * interruttori mai sfiorati. E `setToolPermissions` registra come SCELTA ogni
 * azione che riceve — giustamente: toccare un permesso e' sceglierlo.
 *
 * ⇒ Chiunque attraversasse l'introduzione, anche solo premendo avanti, usciva
 * con tutte e tre le azioni marcate «scelte». Da quel momento
 * `talosEffectiveToolPermissions` — la regola che dice «un valore che nessuno ha
 * scelto e' il default di OGGI, non quello del giorno dell'installazione» — non
 * poteva piu' raggiungerlo. Il meccanismo costruito apposta per non congelare i
 * default veniva disarmato dalla prima schermata che la persona vede.
 *
 * ⛔ Ed e' il difetto peggiore possibile qui, perche' congela il default del
 * giorno dell'installazione: chi ha l'app da piu' tempo resta sui valori piu'
 * larghi, e non lo sa. Owner, 2026-08-08, misurando la SUA installazione:
 * `tools: { read: allow, write: allow, outbound: allow }`.
 *
 * ## ⛔ E perche' NON si guarda se il valore e' CAMBIATO
 *
 * Ci ho provato, e il test l'ha bocciato in trenta secondi: chi tocca
 * «Chiedimelo sempre» quando gia' dice «chiedimelo» non produce nessuna
 * differenza — eppure ha deciso, e la prudenza e' una risposta legittima quanto
 * il permesso. Guardare il valore avrebbe tolto la scelta proprio a chi sceglie
 * la cautela.
 *
 * ⇒ Il discrimine e' il GESTO sulla scheda, non il valore che ne esce. La
 * scheda presenta i tre permessi come UNA decisione — «la pagina decide tutti i
 * permessi in un colpo» — quindi toccarla decide per tutti e tre, e non toccarla
 * non decide niente.
 */
const haDecisoAutonomia = ref(false)


const index = ref(0)
/**
 * ⛔ LA LINGUA VIENE PRIMA DELLA STORIA, ed è giusto così.
 *
 * Owner 2026-08-16, correggendomi mentre stavo invertendo l'ordine: la storia
 * **va letta nella lingua giusta**. Metterla per prima significherebbe far
 * leggere a qualcuno otto paragrafi in una lingua che non ha scelto, e poi
 * chiedergli quale preferisce — cioè scusarsi dopo.
 *
 * ⇒ Prima si sceglie come parlarsi, poi si dice chi si è.
 */
const stage = ref<'language' | 'story' | 'setup'>(
    TALOS_INTRO_LANGUAGE_PAGE_ENABLED ? 'language' : 'story',
)
const step = computed(() => TALOS_SETUP_STEPS[index.value]!)
const onLastStep = computed(() => index.value === TALOS_SETUP_STEPS.length - 1)

/**
 * ⛔ TRE TRATTI NUOVI, e uno spostato da «in arrivo» — 2026-08-16.
 *
 * `comingShizuku` prometteva le azioni sul telefono «col ponte in casa, sempre
 * tipizzate, mostrate in anteprima»: **è uscito**, e da allora il ponte non
 * chiede nemmeno più il Debug wireless. Una promessa che si legge come futura
 * quando la funzione c'è già fa sembrare l'app più piccola di quello che è.
 *
 * ⇒ Diventa un tratto (`traitActs`), e con lui entrano le due cose che il
 * README racconta e la storia taceva: che «fatto» è uno **stato verificato**, e
 * che la parola di richiamo gira **qui**.
 */
const traits = computed(() => [
    { title: t('onboarding.traitNoAccountTitle'), body: t('onboarding.traitNoAccountBody') },
    { title: t('onboarding.traitModelsTitle'), body: t('onboarding.traitModelsBody') },
    { title: t('onboarding.traitActsTitle'), body: t('onboarding.traitActsBody') },
    { title: t('onboarding.traitVerifiedTitle'), body: t('onboarding.traitVerifiedBody') },
    { title: t('onboarding.traitWakeTitle'), body: t('onboarding.traitWakeBody') },
    { title: t('onboarding.traitMemoryTitle'), body: t('onboarding.traitMemoryBody') },
    { title: t('onboarding.traitTwoModelsTitle'), body: t('onboarding.traitTwoModelsBody') },
    { title: t('onboarding.traitFilesTitle'), body: t('onboarding.traitFilesBody') },
])
const coming = computed(() => [
    t('onboarding.comingZethos'),
    t('onboarding.comingSync'),
])

function setupStepLabel(id: TalosSetupStepId): string {
    if (id === 'identity') return t('onboarding.identityStep')
    if (id === 'pin') return t('onboarding.pinStep')
    if (id === 'autonomy') return t('onboarding.autonomyStep')
    if (id === 'permissions') return t('onboarding.backgroundStep')
    return t('onboarding.modelStep')
}

const maker = ref<{ manufacturer: string, brand: string }>({ manufacturer: '', brand: '' })
const backgroundSteps = computed(() => (backgroundReady.value
    ? []
    : talosBackgroundExtraSteps(maker.value)))

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

async function next(): Promise<void> {
    /*
     * La pagina dell'autonomia salva ANDANDO AVANTI, non con un tasto suo.
     *
     * Visto sul tablet il 2026-08-06: con un bottone dentro la pagina se ne
     * vedevano DUE, uno sopra l'altro, che facevano la stessa cosa — e il primo
     * salvava mentre il secondo no. Due comandi identici con esiti diversi è il
     * modo più rapido di far perdere una scelta senza dirlo a nessuno.
     */
    if (step.value.id === 'autonomy') {
        if (decidingAutonomy.value) return
        decidingAutonomy.value = true
        try {
            /*
             * ⛔ Si scrive SOLO se la scheda e' stata toccata. Vedi
             * `haDecisoAutonomia`: scrivere passando oltre marcherebbe come
             * «scelto» un valore che nessuno ha guardato, e congelerebbe per
             * sempre il default del giorno dell'installazione.
             */
            if (haDecisoAutonomia.value) {
                // Gli STESSI tre valori che le Impostazioni leggono, non una copia.
                await settings.setToolPermissions({ ...toolPermissions.value })
                /*
                 * ⭐⭐⭐ «SEMPRE» ACCENDE ANCHE LA LIBRERIA — owner 2026-08-17.
                 *
                 * «se imposto sempre in decidi tutto in un colpo, lo switch
                 * "Consenti alle chat di usare la Libreria" in predefiniti AI
                 * deve essere abilitato».
                 *
                 * Il difetto che chiude: chi sceglie «sempre» ha appena detto,
                 * con un gesto solo, che TALOS può leggere, scrivere e uscire in
                 * rete — e poi trovava la sua Libreria staccata, per un
                 * interruttore in un'altra schermata che non aveva mai visto.
                 * Un consenso ampio seguito da una capacità spenta si legge come
                 * un guasto, non come una scelta.
                 *
                 * ⛔ SOLO su «sempre», e solo se tutti e tre. «chiedi» vuol dire
                 * «domandamelo di volta in volta», e attaccare la Libreria a
                 * ogni messaggio non è una domanda che si può fare di volta in
                 * volta: è ambientale. «nega» lascia spento ciò che è già
                 * spento, quindi non c'è niente da fare.
                 *
                 * ⛔ E NON si spegne mai da qui: questo è l'unico verso che
                 * l'owner ha chiesto, e spegnere una capacità che la persona
                 * potrebbe aver acceso apposta sarebbe una decisione mia.
                 */
                const tutteSempre = TALOS_AZIONI_GOVERNATE
                    .every((azione) => toolPermissions.value[azione] === 'allow')
                if (tutteSempre) {
                    await settings.setShell({ library_context_enabled: true })
                    // The one-shot grant also enables the two agent switches
                    // that are otherwise conservative by default: managing
                    // Library policy and driving another app for the user.
                    await settings.setAgentToolEnabled('library_context_policy_update', true)
                    await settings.setAgentToolEnabled('device_screen_drive', true)
                }
            }
        } finally {
            decidingAutonomy.value = false
        }
    }
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
                class="talos-pressable -mr-2 min-h-touch rounded-full px-3 text-sm text-[var(--talos-muted)]"
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

                <!--
                    ⭐ OTTO TITOLI A COLPO D'OCCHIO, e si apre solo quello che
                    interessa. Owner 2026-08-16: «le sezioni nella prima pagina
                    falle collassabili, con la descrizione dentro il collapse
                    espandibile e il titolo come titolo del collapse».

                    Con otto tratti aperti la prima pagina era un muro di testo:
                    chi arriva qui non sa ancora cosa gli interessa, e un muro
                    si salta tutto invece di leggerne un pezzo.

                    ⛔ `<details>` NATIVO, non un accordion nostro: tastiera,
                    `aria-expanded` e la ricerca nel testo del browser
                    funzionano da soli. Un accordion fatto a mano è tre cose da
                    ricablare e tre modi di sbagliarle.
                -->
                <ul class="mt-8 flex flex-col gap-3">
                    <li v-for="trait in traits" :key="trait.title">
                        <details class="talos-intro-trait border-l-2 border-[var(--talos-accent)] pl-4">
                            <summary
                                class="talos-pressable flex min-h-touch cursor-pointer list-none items-center gap-2 text-md font-medium leading-6 marker:content-none"
                            >
                                <span class="flex-1">{{ trait.title }}</span>
                                <ChevronDown
                                    class="talos-intro-trait-chevron size-4 shrink-0 text-[var(--talos-muted)] transition-transform duration-200"
                                    aria-hidden="true"
                                />
                            </summary>
                            <p class="pb-1.5 pt-1 text-sm leading-6 text-[var(--talos-muted)]">{{ trait.body }}</p>
                        </details>
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
                    Che cosa TALOS puo fare da solo.

                    Owner: «una pagina guidata per impostare i permessi dentro
                    l'app non solo di Android, quindi per quanto riguarda la
                    libreria la ricerca eccetera».

                    NON duplica le Impostazioni: scrive negli stessi tre valori
                    che il pannello Strumenti agente legge, e li dichiara
                    «scelti». Quel pannello resta la casa per la messa a punto
                    fine — qui c'e' UNA decisione che un nuovo arrivato puo
                    davvero prendere, con accanto la conseguenza. Duplicare i
                    tre menu a tendina qui sarebbe una seconda casa per la
                    stessa impostazione, che e' esattamente il difetto che
                    stiamo togliendo altrove.
                -->
                <template v-else-if="step.id === 'autonomy'">
                    <h1 id="talos-setup-title" class="talos-title text-2xl font-semibold leading-tight">
                        {{ t('onboarding.autonomyTitle') }}
                    </h1>
                    <p class="mt-3 text-md leading-7 text-[var(--talos-muted)]">
                        {{ t('onboarding.autonomyBody') }}
                    </p>

                    <!--
                        Al posto dei due bottoni: la scheda coi tre poteri,
                        ciascuno coi suoi tre stati, e sotto ognuno l'elenco
                        vero degli strumenti che ci ricadono.

                        Prima si sceglieva «chiedimelo» oppure «lascialo fare»
                        per tutto insieme, senza sapere cosa fosse «tutto»: chi
                        premeva il secondo autorizzava anche l'uscita in rete
                        senza che gliel'avesse detto nessuno.
                    -->
                    <div class="mt-6">
                        <TalosToolPermissionsBoard
                            v-model="toolPermissions"
                            :busy="decidingAutonomy"
                            @update:model-value="haDecisoAutonomia = true"
                        />
                    </div>


                    <p class="mt-4 text-sm leading-6 text-[var(--talos-muted)]">
                        {{ t('onboarding.autonomyLater') }}
                    </p>
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

                    <!--
                        ⭐ E QUI CI SONO TUTTI GLI ALTRI — owner 2026-08-16:
                        «i permessi devono essere completi, assicurati che ci
                        siano anche quelli del controllo del dispositivo, e
                        skippabili».

                        Il passo si chiamava «Background» e ne chiedeva UNO. Gli
                        altri nove esistevano solo in Impostazioni, dove chi ha
                        appena installato l'app non sa di dover andare: la prima
                        volta che il microfono serviva, la richiesta arrivava a
                        freddo, in mezzo a un'altra cosa.

                        ⛔ Si RIUSA il pannello delle Impostazioni, non se ne
                        disegna un secondo. Le righe, i loro stati e i passi in
                        piu' dei produttori vivono in `permissionRows.ts` e
                        cambiano; due schermate che li disegnano per conto loro
                        divergono al primo cambio — ed e' la stessa regola che
                        questa modale si e' gia' data per l'autonomia.

                        Skippabile per costruzione: nessuna riga blocca
                        «Finisci», e ognuna si concede per conto suo.
                    -->
                    <div class="mt-8 border-t border-[var(--talos-border)] pt-6">
                        <h2 class="text-md font-semibold leading-6">
                            {{ t('onboarding.permissionsAllTitle') }}
                        </h2>
                        <p class="mt-2 text-sm leading-6 text-[var(--talos-muted)]">
                            {{ t('onboarding.permissionsAllBody') }}
                        </p>
                        <div class="mt-4" data-testid="talos-setup-all-permissions">
                            <TalosMobileSettingsPrivacyPanel onboarding />
                        </div>
                    </div>
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
                    <!--
                        «Non ora» appartiene al PIN, e solo a lui.

                        Finche i passi erano tre, questo `v-else` copriva il solo
                        PIN e la frase era giusta: si sta saltando la protezione.
                        Con Modello, Autonomia e Background il ramo e' diventato
                        di tutti, e sulle pagine nuove diceva «Non ora» a chi non
                        stava saltando un bel niente — visto sul tablet il
                        2026-08-03, dove il PIN non c'e'.
                    -->
                    <template v-else>
                        {{ step.id === 'pin' && !pinSet ? t('common.notNow') : t('common.next') }}
                    </template>
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

<style scoped>
/*
 * ⛔ Il triangolino di sistema si toglie in DUE modi, non uno.
 *
 * `::marker` è lo standard e non basta: WebKit — cioè la WebView di Android,
 * cioè ogni telefono su cui gira TALOS — disegna il suo con
 * `::-webkit-details-marker`. Toglierne uno solo lascia il triangolo dove la
 * gente lo vede davvero, e non dove lo si prova.
 */
.talos-intro-trait > summary::marker { content: ""; }
.talos-intro-trait > summary::-webkit-details-marker { display: none; }

/* La freccia dice se è aperto, e resta ferma se il sistema chiede quiete. */
.talos-intro-trait[open] .talos-intro-trait-chevron { transform: rotate(180deg); }

@media (prefers-reduced-motion: reduce) {
    .talos-intro-trait-chevron { transition: none; }
}
</style>
