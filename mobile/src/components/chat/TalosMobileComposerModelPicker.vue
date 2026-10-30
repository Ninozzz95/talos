<script setup lang="ts">
import { computed, defineAsyncComponent, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useTalosI18n } from '@/i18n'
import { Check, Cpu, Loader2, RefreshCw, WandSparkles } from '@lucide/vue'
import TalosMobileProviderIcon from '@/components/models/TalosMobileProviderIcon.vue'
import TalosMobileProviderTabs from '@/components/chat/TalosMobileProviderTabs.vue'
// D-0147-UI-2: pigra come la pastiglia del piano: chi non usa il piano non carica il suo servizio
const TalosMobileChatgptRigaPiano = defineAsyncComponent(() => import('@/components/chat/TalosMobileChatgptRigaPiano.vue'))
import { ChevronDown, Search } from '@lucide/vue'
import {
    groupTalosModelsByProvider,
    talosModelGroupsOpenByDefault,
} from '@/lib/chat/modelPickerGrouping'
import type {
    TalosMobileModelProfileView,
    TalosMobileRoutingProfileView,
} from '@/components/chat/mobileChatTypes'
import { talosMobileModelProfileIsCallable, talosMobileProviderById } from '@/lib/mobileProviders'

const props = withDefaults(defineProps<{
    modelProfiles: TalosMobileModelProfileView[]
    routingProfiles?: TalosMobileRoutingProfileView[]
    selectedModelProfileId?: string | null
    selectedRoutingProfileId?: string | null
    loadingModels?: boolean
    loadingRoutes?: boolean
    refreshingModels?: boolean
    /**
     * Why the list may be short: one already-translated sentence per provider
     * that failed to answer.
     *
     * Without it this panel had one empty state for every reason — 'no models
     * available, add one in the Model Lab' — and said it just as loudly when
     * discovery had FAILED. On a tablet holding a two-gigabyte model in a
     * folder the app could not open, that sentence sent the search in the
     * wrong direction for three rounds. Advice given confidently for the
     * wrong situation is worse than no advice.
     */
    discoveryProblems?: ReadonlyArray<{ message: string, detail?: string | null }>
    /**
     * ⭐ 3/9 — avm-03, dal vivo (item 2): questo picker si monta due volte
     * nello stesso foglio "Model & reasoning" (TalosMobileModelEffortDrawer.vue
     * — il catalogo principale, e la lista dell'esecutore sotto "EXECUTOR
     * MODEL"), e la SUA header interna diceva sempre lo stesso "MODELS"
     * generico in entrambi i casi — la seconda comparsa non diceva di essere
     * la lista dell'esecutore. Pre-tradotta (non una chiave i18n) perché chi
     * la monta decide il testo esatto; `undefined` mantiene l'header di
     * sempre per il catalogo principale, zero cambio lì.
     */
    modelsSectionLabel?: string
    /**
     * ⛔ D-RM4-3 (Pad 20/10/2026): il Codice sulla sessione di un PC non offre il Laboratorio modelli, che è quello del TELEFONO
     * (i modelli li sceglie il PC). Vero di serie: la chat resta com'è.
     */
    showModelLab?: boolean
    /**
     * Pad 22/10/2026: the Code screen opens a local model (seconds) before it is chosen. The row being opened says so and, meanwhile,
     * a tap on any row is ignored: a second tap would open a second time.
     */
    openingModelProfileId?: string | null
    /**
     * ⛔ D-0147-UI-2 (owner 27/10/2026, mockup approvato): sul telefono lo stato del piano ChatGPT è la prima riga del gruppo
     * ChatGPT (`TalosMobileChatgptRigaPiano`), non più una pastiglia nel compositore. `null`: nessuna riga (tablet, desktop).
     */
    pianoChatgpt?: 'attivo' | 'limite' | null
    /**
     * ⛔ PICK-SCROLL-01 (Pad, 27/10/2026, dito vero): dentro un foglio lo scorrimento è UNO, quello del foglio. Col suo
     * `overscroll-contain` l'elenco tratteneva il dito anche quando i modelli ci stavano tutti, e il foglio non scorreva più.
     * Fuori da un foglio (la barra) l'elenco scorre da sé, come prima.
     */
    dentroAlFoglio?: boolean
    /**
     * ⭐ Owner 27/10/2026 (mockup del compositore approvato): «organizzare più provider con Tab pill a scorrimento». Nel foglio
     * «Modello e ragionamento» i fornitori sono schede (TalosMobileProviderTabs) e l'elenco mostra solo quella attiva; cercando, le
     * schede spariscono e si cerca in tutti. Fuori (la barra) i gruppi restano quelli di oggi.
     */
    schede?: boolean
}>(), {
    routingProfiles: () => [],
    openingModelProfileId: null,
    pianoChatgpt: null,
    dentroAlFoglio: false,
    schede: false,
    selectedModelProfileId: null,
    selectedRoutingProfileId: null,
    loadingModels: false,
    loadingRoutes: false,
    refreshingModels: false,
    discoveryProblems: () => [],
    modelsSectionLabel: undefined,
    showModelLab: true,
})

const emit = defineEmits<{
    selectModelProfile: [profileId: string]
    selectModelRoutingProfile: [profileId: string]
    requestClose: []
    refreshModels: []
    openModelLab: []
}>()

const { t } = useTalosI18n()
const listbox = ref<HTMLElement | null>(null)
const visibleProfiles = computed(() => props.modelProfiles.filter((profile) => profile.show_in_composer))

/**
 * Owner 2026-07-27: with a provider like OpenRouter the list became "una lista
 * infinita". Past a couple of dozen entries a flat list stops being a list and
 * becomes a scroll, and the model you want is never the one on screen.
 */
const modelQuery = ref('')
const searching = computed(() => modelQuery.value.trim() !== '')
const modelGroups = computed(() => groupTalosModelsByProvider(
    visibleProfiles.value,
    modelQuery.value,
))

/**
 * Which groups are open. Seeded from the arrangement, then owned by the user.
 *
 * `null` means "not yet touched", so the defaults keep applying while the
 * search narrows — once a header is tapped, that choice stands.
 */
const openedGroups = ref<string[] | null>(null)
const openGroups = computed(() => openedGroups.value
    ?? talosModelGroupsOpenByDefault(
        modelGroups.value,
        props.selectedModelProfileId ?? null,
        searching.value,
    ))

function toggleGroup(provider: string): void {
    const current = openGroups.value
    openedGroups.value = current.includes(provider)
        ? current.filter((entry) => entry !== provider)
        : [...current, provider]
}

// ⭐ Le schede (vedi la prop `schede`): una per fornitore, più «Automatico» prima se ci sono rotte.
const ROTTE = '__rotte'
const schedeAttive = computed(() => props.schede && !searching.value)
const conRotte = computed(() => props.routingProfiles.length > 0 || props.loadingRoutes)
const elencoSchede = computed(() => [
    ...(conRotte.value ? [{ id: ROTTE, nome: t('chat.autoRouting'), quanti: props.routingProfiles.length }] : []),
    ...modelGroups.value.map((g) => ({ id: g.provider, nome: groupLabel(g.provider), quanti: g.profiles.length })),
])
const schedaDelModello = computed<string | null>(() => {
    if (props.selectedRoutingProfileId && conRotte.value) return ROTTE
    return modelGroups.value.find((g) => g.profiles.some((p) => p.id === props.selectedModelProfileId))?.provider ?? null
})
const schedaScelta = ref<string | null>(null)
const schedaAttiva = computed(() => {
    const ids = elencoSchede.value.map((s) => s.id)
    if (schedaScelta.value && ids.includes(schedaScelta.value)) return schedaScelta.value
    return schedaDelModello.value ?? ids[0] ?? ''
})
const gruppiVisibili = computed(() => (schedeAttive.value ? modelGroups.value.filter((g) => g.provider === schedaAttiva.value) : modelGroups.value))

/*
 * ⭐ SELETTORE-01 (owner 28/10/2026: «quando apro il selettore modelli non vedo selezionato e centrato il modello in uso»; regola
 * comune col desktop, che ha lo stesso difetto sul 4174). All'apertura la riga in uso viene portata AL CENTRO della sua lista. Si
 * muove SOLO la lista che scorre, mai il foglio o la pagina (nota del Desktop: `scrollIntoView` muove ogni antenato che scorre),
 * e senza animazione: è un posto in cui ci si trova, non un movimento da guardare. Hermes fa lo stesso con `block: 'nearest'`
 * (`model-catalog-menu.tsx:669`); qui al centro, per il colpo d'occhio.
 */
const radice = ref<HTMLElement | null>(null)
// la lista che scorre più vicina: dentro il foglio è il corpo del foglio (`dentroAlFoglio`), fuori è il selettore stesso; mai la pagina
function listaCheScorre(el: HTMLElement): HTMLElement | null {
    for (let p = el.parentElement; p && p !== document.body && p !== document.documentElement; p = p.parentElement) {
        const { overflowY } = getComputedStyle(p)
        if ((overflowY === 'auto' || overflowY === 'scroll') && p.scrollHeight > p.clientHeight) return p
    }
    return null
}
onMounted(async () => {
    await nextTick()
    await new Promise<void>((ok) => requestAnimationFrame(() => ok()))
    const id = props.selectedModelProfileId
    if (!id || !radice.value) return
    const riga = [...radice.value.querySelectorAll<HTMLElement>('[data-talos-mobile-model-option]')]
        .find((el) => el.dataset.modelProfileId === id)
    const lista = riga ? listaCheScorre(riga) : null
    if (!riga || !lista) return
    const centra = (): void => {
        const r = riga.getBoundingClientRect()
        const l = lista.getBoundingClientRect()
        lista.scrollTop += (r.top + r.height / 2) - (l.top + l.height / 2)
    }
    centra()
    // SELETTORE-03 (misurato sul Pad, vc345): il foglio si apre CRESCENDO, la lista misura 277 px quando la si centra e 636 un attimo
    // dopo. Si ricentra a ogni cambio di misura per un secondo, finché la persona non tocca la lista: da lì la lista è sua.
    // SELETTORE-04 (vc346, telefono orizzontale): anche il CONTENUTO cambia, la riga pigra del piano ChatGPT spinge giù i modelli di
    // 57 px senza che la lista cambi misura; per questo si osserva anche il selettore.
    if (typeof ResizeObserver === 'undefined') return
    const contenuto = radice.value
    const osservatore = new ResizeObserver(centra)
    const tocchi = ['pointerdown', 'wheel', 'touchstart'] as const
    const tempo = setTimeout(() => smettiDiCentrare?.(), 1000)
    smettiDiCentrare = () => {
        osservatore.disconnect()
        clearTimeout(tempo)
        tocchi.forEach((tipo) => lista.removeEventListener(tipo, smetti))
        smettiDiCentrare = null
    }
    const smetti = (): void => smettiDiCentrare?.()
    tocchi.forEach((tipo) => lista.addEventListener(tipo, smetti, { passive: true }))
    osservatore.observe(lista)
    if (contenuto !== lista) osservatore.observe(contenuto)
})
let smettiDiCentrare: (() => void) | null = null
onBeforeUnmount(() => smettiDiCentrare?.())

// A new search is a new question: the user's collapse choices were about the
// previous set of results and should not survive it.
watch(modelQuery, () => { openedGroups.value = null })

function capabilityValue(profile: TalosMobileModelProfileView, key: string): unknown {
    return profile.capabilities?.[key]
}

/**
 * ⛔ «unknown» NON è un'informazione: è un campo che non abbiamo.
 *
 * Owner 2026-09-11 dal Pad: nel selettore, sotto ogni modello LOCALE, la riga
 * diceva «unknown - testo». Quell'«unknown» è il valore letterale di
 * `chat_compatibility`, che `localAdapter.ts` scrive così per costruzione
 * (riga ~2090: `chatCompatibility: 'unknown' as const`) — un GGUF sul telefono
 * non viene interrogato su quali API di chat supporti, quindi non lo sappiamo
 * e non possiamo saperlo senza aprirlo.
 *
 * Il difetto era il ramo finale: `typeof value === 'string' ? value : …`
 * stampava la stringa GREZZA, e siccome «unknown» È una stringa non arrivava
 * mai alla traduzione — a schermo finiva la parola inglese del protocollo.
 *
 * ⇒ Un campo mancante si OMETTE, non si riempie con un segnaposto: «unknown
 * and missing metadata should be treated the same for display purposes», e i
 * campi senza valore si lasciano vuoti invece di scriverci «unknown»/«N/D»
 * (prassi metadati W3C, letta 12/09/2026). Vale anche per un valore che non
 * riconosciamo: un'etichetta che non sappiamo tradurre è gergo di protocollo,
 * non una parola per chi legge.
 *
 * `null` = questa riga non ha niente da dire su questo punto.
 */
function compatibilityLabel(profile: TalosMobileModelProfileView): string | null {
    const value = capabilityValue(profile, 'chat_compatibility')
    if (value === 'supported') return t('chat.compatibilitySupported')
    if (value === 'unsupported') return t('chat.compatibilityUnsupported')
    return null
}

function contextLabel(profile: TalosMobileModelProfileView): string | null {
    const value = capabilityValue(profile, 'context_length')
    if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) return null
    const formatted = value >= 1000 ? `${Math.round(value / 1000)}k` : String(value)
    return t('chat.contextValue', { value: formatted })
}

function modalityLabel(profile: TalosMobileModelProfileView): string | null {
    const value = capabilityValue(profile, 'input_modalities')
    if (!Array.isArray(value)) return null
    const modalities = value.filter((item): item is string => typeof item === 'string' && item.trim() !== '')
    const localized = modalities.map((modality) => {
        const key = `chat.modality${modality.charAt(0).toUpperCase()}${modality.slice(1)}`
        return t(key)
    })
    return localized.length ? localized.join(' + ') : null
}

/**
 * La terza riga di un modello: solo i pezzi che esistono davvero.
 *
 * ⛔ Si compone qui e non nel template perché i separatori erano attaccati ai
 * pezzi che SEGUONO (` - {{ contextLabel }}`): con il primo pezzo assente la
 * riga sarebbe cominciata con un trattino, e con tutti e tre assenti sarebbe
 * rimasto uno `<span>` vuoto che occupa comunque una riga di altezza sotto ogni
 * modello. Un separatore è una relazione fra due cose: senza le due cose non
 * esiste.
 *
 * `null` = niente da dire, e allora la riga non si disegna affatto.
 */
/**
 * The second line: the provider's model id — except for a LOCAL model, whose
 * "id" is the file path on the device (`/storage/emulated/0/…/x.gguf`, seen on
 * the Pad 12/09/2026). A path is not information for the person: the name is
 * already on the first line, so the second says where it lives.
 */
function modelLine(profile: TalosMobileModelProfileView): string {
    if (profile.provider !== 'local') return profile.model
    // `r4:…` = il modello della sessione del Codice che l'app non elenca più (`profiloDelModelloR4`): il file non c'è (22/10/2026)
    return profile.id.startsWith('r4:') ? t('chat.localModelMissingLine') : t('chat.localModelLine')
}

function detailLabel(profile: TalosMobileModelProfileView): string | null {
    const parts = [compatibilityLabel(profile), contextLabel(profile), modalityLabel(profile)]
        .filter((part): part is string => typeof part === 'string' && part.trim() !== '')
    // Lo stesso separatore della riga sopra (`modello - stato`): due righe
    // adiacenti che elencano cose dello stesso oggetto si leggono come una sola
    // se le si punteggia allo stesso modo.
    return parts.length ? parts.join(' - ') : null
}

/**
 * A status we cannot say in words is omitted, like the compatibility above:
 * on the Pad (12/09/2026) every local model read «untested» — the protocol's
 * word, never translated. `null` = nothing to say.
 */
function statusLabel(status: string): string | null {
    if (status === 'enabled') return t('chat.statusEnabled')
    if (status === 'disabled') return t('chat.statusDisabled')
    if (status === 'untested') return t('chat.statusUntested')
    return null
}

/**
 * Second line of a model row: where it lives, then its status — only the parts that exist.
 * ⛔ «untested» is the connection test of a cloud provider: a model on the device never gets one, so on the Pad (22/10/2026)
 * every local model read «not tried yet» even after hours of use. For a local model there is nothing to say.
 */
function secondLine(profile: TalosMobileModelProfileView): string {
    // un modello del dispositivo si APRE; uno in rete si cambia soltanto (revisione avversaria 22/10, rilievo 13)
    if (profile.id === props.openingModelProfileId) return t(profile.provider === 'local' ? 'chat.modelOpening' : 'chat.modelSwitching')
    // ⛔ D-0145-4 (Desktop 25/10, sessione del PC): un modello del PC (`pc:`, `modelliDelPc.ts`) non ha uno stato vero (il telefono non
    // lo prova: «mai provato» anche dopo dieci giri) e il suo id è del PC («chatgpt:gpt-6-luna»), non una parola: il nome e il gruppo
    // bastano, la seconda riga non c'è
    if (profile.id.startsWith('pc:')) return ''
    // ⛔ D-0145-4b: lo stesso per un modello in rete del Codice che l'app non elenca più (`r4:`, `profiloDelModelloR4`): nessuno l'ha
    // provato dal telefono e `model` è l'id di r4; il locale `r4:` dice invece che il file non c'è (`modelLine`)
    if (profile.id.startsWith('r4:') && profile.provider !== 'local') return ''
    const stato = profile.provider === 'local' && profile.status === 'untested' ? null : statusLabel(profile.status)
    return [modelLine(profile), stato].filter((part): part is string => !!part).join(' - ')
}

/**
 * The heading of a provider group (Pad 22/10/2026: it was the raw id, «LOCAL» even in Italian): the device in the person's language,
 * a provider by its own name; an id the app does not know stays as it is.
 */
const openingLiveText = computed(() => {
    const profilo = props.modelProfiles.find((p) => p.id === props.openingModelProfileId)
    return profilo ? secondLine(profilo) : ''
})

function groupLabel(provider: string): string {
    if (provider === 'local') return t('chat.localModelLine')
    // anomalia 3 di Marco (24/10/2026): i modelli del PC, «Sul computer» accanto a «Sul dispositivo», non l'id grezzo
    if (provider === 'computer') return t('chat.computerModelLine')
    const conosciuto = talosMobileProviderById(provider)
    return conosciuto.id === provider ? conosciuto.label : provider
}

function routingIsSelectable(profile: TalosMobileRoutingProfileView): boolean {
    return profile.status === 'enabled' && profile.lane_count > 0
}

function chooseModelProfile(profile: TalosMobileModelProfileView): void {
    if (props.openingModelProfileId) return
    if (!talosMobileModelProfileIsCallable(profile)) return
    emit('selectModelProfile', profile.id)
}

function chooseRoutingProfile(profile: TalosMobileRoutingProfileView): void {
    if (!routingIsSelectable(profile)) return
    emit('selectModelRoutingProfile', profile.id)
}

function enabledOptions(): HTMLButtonElement[] {
    if (!listbox.value) return []
    return Array.from(listbox.value.querySelectorAll<HTMLButtonElement>(
        '[data-talos-mobile-model-option]:not(:disabled)',
    ))
}

function focusAt(index: number): void {
    const options = enabledOptions()
    if (!options.length) return
    options[(index + options.length) % options.length]?.focus()
}

function moveFocus(target: EventTarget | null, delta: number): void {
    const options = enabledOptions()
    if (!options.length) return
    const current = target instanceof HTMLElement ? options.indexOf(target as HTMLButtonElement) : -1
    focusAt(current + delta)
}

function onListKeydown(event: KeyboardEvent): void {
    if (event.key === 'ArrowDown') {
        event.preventDefault()
        moveFocus(event.target, 1)
        return
    }
    if (event.key === 'ArrowUp') {
        event.preventDefault()
        moveFocus(event.target, -1)
        return
    }
    if (event.key === 'Home') {
        event.preventDefault()
        focusAt(0)
        return
    }
    if (event.key === 'End') {
        event.preventDefault()
        focusAt(-1)
        return
    }
    if (event.key === 'Escape') {
        event.preventDefault()
        emit('requestClose')
    }
}
</script>

<template>
    <div
        ref="radice"
        class="talos-mobile-model-picker"
        data-testid="talos-mobile-composer-model-picker"
    >
        <!--
            ⛔ `max-h` sì, `min-h` NO.

            Il tetto serve: con 413 modelli di OpenRouter aperti la lista deve
            smettere di crescere e cominciare a scorrere.

            Il pavimento no, e costava un buco. Con `min-h-[40dvh]` su uno
            schermo da 2400 px la lista occupava 960 px anche quando conteneva
            tre righe da 400: 560 px di nero fra l'ultimo provider e la riga
            «Refresh · Model Lab», cioè un quarto dello schermo. Owner
            2026-08-15, guardando la vista: «c'è tanto spazio tra openrouter e
            zona refresh/model lab».

            ⇒ Un pannello si adatta a quello che contiene. Il vuoto non era
            respiro: era un pavimento pensato per la lista aperta, applicato
            anche quando è chiusa.
        -->
        <TalosMobileProviderTabs
            v-if="schedeAttive && elencoSchede.length"
            :schede="elencoSchede"
            :attiva="schedaAttiva"
            :del-modello="schedaDelModello"
            :etichetta="$t('chat.providerTabs')"
            :etichetta-modello-qui="$t('chat.chosenModelIsHere')"
            pannello="talos-provider-tabpanel"
            class="mb-2"
            @scegli="schedaScelta = $event"
        />
        <!-- APG Tabs (revisione del Desktop, 28/10): con le schede l'elenco è il pannello della scheda attiva -->
        <div
            :id="schedeAttive ? 'talos-provider-tabpanel' : undefined"
            :role="schedeAttive ? 'tabpanel' : undefined"
            :aria-labelledby="schedeAttive ? `talos-provider-tab-${schedaAttiva}` : undefined"
        >
        <div
            ref="listbox"
            role="listbox"
            :aria-label="$t('chat.modelForConversation')"
            class="space-y-3 pr-1"
            :class="dentroAlFoglio ? '' : 'max-h-[70dvh] overflow-y-auto overscroll-contain'"
            @keydown="onListKeydown"
        >
            <section
                v-if="(routingProfiles.length || loadingRoutes) && (!schedeAttive || schedaAttiva === '__rotte')"
                role="group"
                aria-labelledby="talos-mobile-model-picker-auto"
                class="space-y-1"
            >
                <header
                    id="talos-mobile-model-picker-auto"
                    class="flex items-center gap-1.5 px-1 text-xs font-semibold uppercase text-[var(--talos-muted,var(--muted-foreground))]"
                >
                    <WandSparkles class="size-3.5 text-[var(--talos-accent,var(--primary))]" aria-hidden="true" />
                    {{ $t('chat.autoRouting') }}
                    <span class="ml-1 min-w-0 truncate text-3xs font-normal normal-case">
                        {{ $t('chat.autoRoutingDetail') }}
                    </span>
                </header>
                <p
                    v-if="loadingRoutes"
                    role="status"
                    class="px-2 py-2 text-xs text-[var(--talos-muted,var(--muted-foreground))]"
                >
                    {{ $t('chat.loadingRoutes') }}
                </p>
                <button
                    v-for="profile in routingProfiles"
                    :key="profile.id"
                    type="button"
                    role="option"
                    data-talos-mobile-model-option
                    data-testid="talos-mobile-model-route-option"
                    :data-routing-profile-id="profile.id"
                    :aria-selected="profile.id === selectedRoutingProfileId"
                    :disabled="!routingIsSelectable(profile)"
                    class="talos-mobile-model-option flex min-h-touch w-full items-center gap-2 rounded-md border px-2.5 py-2 text-left text-sm outline-none focus-visible:ring-2 focus-visible:ring-[var(--talos-ring,var(--ring))] disabled:cursor-not-allowed disabled:opacity-50"
                    :data-selected="profile.id === selectedRoutingProfileId ? 'true' : 'false'"
                    @click="chooseRoutingProfile(profile)"
                >
                    <WandSparkles class="size-5 shrink-0 text-[var(--talos-accent,var(--primary))]" aria-hidden="true" />
                    <span class="flex min-w-0 flex-1 flex-col">
                        <span class="truncate font-medium text-[var(--talos-text,var(--foreground))]">{{ profile.name }}</span>
                        <span class="truncate text-2xs text-[var(--talos-muted,var(--muted-foreground))]">
                            {{ $t('chat.routeLaneStatus', { count: profile.lane_count, status: statusLabel(profile.status) ?? profile.status }) }}
                        </span>
                    </span>
                    <Check
                        v-if="profile.id === selectedRoutingProfileId"
                        class="size-4 shrink-0 text-[var(--talos-accent,var(--primary))]"
                        aria-hidden="true"
                    />
                </button>
            </section>

            <section
                v-if="!schedeAttive || schedaAttiva !== '__rotte'"
                role="group"
                aria-labelledby="talos-mobile-model-picker-models"
                class="space-y-1"
            >
                <header
                    id="talos-mobile-model-picker-models"
                    class="px-1 text-xs font-semibold uppercase text-[var(--talos-muted,var(--muted-foreground))]"
                    :class="{ 'sr-only': schedeAttive }"
                >
                    {{ modelsSectionLabel || $t('chat.models') }}
                </header>
                <p
                    v-if="loadingModels"
                    role="status"
                    class="px-2 py-2 text-xs text-[var(--talos-muted,var(--muted-foreground))]"
                >
                    {{ $t('chat.loadingProfiles') }}
                </p>
                <template v-else-if="!visibleProfiles.length">
                    <!-- A failure is reported as a failure. The generic hint is
                         only right when discovery actually succeeded and found
                         nothing. -->
                    <div
                        v-for="problem in discoveryProblems"
                        :key="problem.message"
                        role="alert"
                        data-testid="talos-model-discovery-problem"
                        class="px-2 py-2 text-xs leading-5 text-[var(--talos-danger,var(--destructive))]"
                    >
                        <p>{{ problem.message }}</p>
                        <!-- The evidence, on its own line and in monospace. It
                             is kept out of the sentence because interpolated
                             parameters are HTML-escaped, and a path through that
                             escaping reads `&#x2F;storage&#x2F;…` — which is
                             what a user was actually shown before this. Rendered
                             as text, never as markup. -->
                        <p
                            v-if="problem.detail"
                            data-testid="talos-model-discovery-detail"
                            class="mt-1 break-all font-mono text-2xs text-[var(--talos-muted,var(--muted-foreground))]"
                        >
                            {{ problem.detail }}
                        </p>
                    </div>
                    <p
                        v-if="!discoveryProblems.length"
                        class="px-2 py-2 text-xs leading-5 text-[var(--talos-muted,var(--muted-foreground))]"
                    >
                        {{ $t('chat.noComposerModels') }}
                    </p>
                </template>
                <label v-if="visibleProfiles.length > 6" class="relative mb-1 block px-1">
                    <Search class="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-[var(--talos-muted,var(--muted-foreground))]" aria-hidden="true" />
                    <input
                        v-model="modelQuery"
                        type="search"
                        inputmode="search"
                        data-testid="talos-model-search"
                        :aria-label="$t('chat.searchModels')"
                        :placeholder="$t('chat.searchModels')"
                        class="min-h-touch w-full rounded-lg border border-[var(--talos-border)] bg-[var(--talos-panel)] pl-8 pr-2 text-sm text-[var(--talos-text)] outline-none focus-visible:ring-2 focus-visible:ring-[var(--talos-ring)]"
                    >
                </label>

                <p
                    v-if="searching && !modelGroups.length"
                    class="px-2 py-2 text-xs text-[var(--talos-muted,var(--muted-foreground))]"
                >
                    {{ $t('chat.noModelMatches', { query: modelQuery.trim() }) }}
                </p>

                <!-- rilievo 12: le righe ignorano i tocchi mentre un modello si apre; chi usa il lettore di schermo sente perché -->
                <p data-testid="talos-mobile-model-opening-live" class="sr-only" aria-live="polite">{{ openingLiveText }}</p>
                <div v-for="group in gruppiVisibili" :key="group.provider" :data-model-group="group.provider">
                    <button
                        v-if="!schedeAttive"
                        type="button"
                        :data-testid="`talos-model-group-${group.provider}`"
                        :aria-expanded="openGroups.includes(group.provider)"
                        class="talos-pressable flex min-h-touch w-full items-center gap-2 rounded-md px-2 text-left"
                        @click="toggleGroup(group.provider)"
                    >
                        <TalosMobileProviderIcon :provider="group.provider" class="size-5" />
                        <span class="text-xs font-semibold uppercase tracking-wide text-[var(--talos-muted,var(--muted-foreground))]">
                            {{ groupLabel(group.provider) }}
                        </span>
                        <span class="text-2xs text-[var(--talos-muted,var(--muted-foreground))]">{{ group.profiles.length }}</span>
                        <ChevronDown
                            class="ml-auto size-4 transition-transform"
                            :class="openGroups.includes(group.provider) ? '' : '-rotate-90'"
                            aria-hidden="true"
                        />
                    </button>
                    <div v-show="schedeAttive || openGroups.includes(group.provider)" class="space-y-1 pl-1">
                <TalosMobileChatgptRigaPiano v-if="group.provider === 'chatgpt' && pianoChatgpt" :al-limite="pianoChatgpt === 'limite'" />
                <button
                    v-for="profile in group.profiles"
                    :key="profile.id"
                    type="button"
                    role="option"
                    data-talos-mobile-model-option
                    data-testid="talos-mobile-model-option"
                    :data-model-profile-id="profile.id"
                    :aria-selected="profile.id === selectedModelProfileId"
                    :aria-busy="profile.id === openingModelProfileId ? 'true' : undefined"
                    :aria-disabled="openingModelProfileId && profile.id !== openingModelProfileId ? 'true' : undefined"
                    :disabled="!talosMobileModelProfileIsCallable(profile)"
                    class="talos-mobile-model-option flex min-h-touch w-full items-center gap-2 rounded-md border px-2.5 py-2 text-left text-sm outline-none focus-visible:ring-2 focus-visible:ring-[var(--talos-ring,var(--ring))] disabled:cursor-not-allowed disabled:opacity-50"
                    :data-selected="profile.id === selectedModelProfileId ? 'true' : 'false'"
                    @click="chooseModelProfile(profile)"
                >
                    <TalosMobileProviderIcon :provider="profile.provider" class="size-8" />
                    <span class="flex min-w-0 flex-1 flex-col">
                        <span class="truncate font-medium text-[var(--talos-text,var(--foreground))]">{{ profile.display_name }}</span>
                        <span v-if="secondLine(profile)" class="truncate font-mono text-2xs text-[var(--talos-muted,var(--muted-foreground))]">
                            {{ secondLine(profile) }}
                        </span>
                        <span
                            v-if="detailLabel(profile)"
                            data-testid="talos-mobile-model-option-detail"
                            class="truncate text-2xs text-[var(--talos-muted,var(--muted-foreground))]"
                        >{{ detailLabel(profile) }}</span>
                    </span>
                    <Loader2
                        v-if="profile.id === openingModelProfileId"
                        data-testid="talos-mobile-model-option-opening"
                        class="size-4 shrink-0 text-[var(--talos-accent,var(--primary))] animate-spin"
                        aria-hidden="true"
                    />
                    <Check
                        v-else-if="profile.id === selectedModelProfileId"
                        class="size-4 shrink-0 text-[var(--talos-accent,var(--primary))]"
                        aria-hidden="true"
                    />
                </button>
                    </div>
                </div>
            </section>
        </div>
        </div>
        <footer class="mt-2 flex items-center justify-between gap-2 border-t border-[var(--talos-border,var(--border))] pt-2">
            <button
                type="button"
                :aria-label="$t('chat.refreshModelCatalog')"
                :disabled="refreshingModels"
                class="inline-flex min-h-touch items-center gap-2 rounded-md px-2.5 text-xs font-medium text-[var(--talos-muted,var(--muted-foreground))] outline-none hover:bg-[var(--talos-active,var(--accent))] hover:text-[var(--talos-text,var(--foreground))] focus-visible:ring-2 focus-visible:ring-[var(--talos-ring,var(--ring))] disabled:opacity-50"
                @click="emit('refreshModels')"
            >
                <RefreshCw :class="['size-4', refreshingModels ? 'animate-spin' : '']" aria-hidden="true" />
                {{ $t('chat.refresh') }}
            </button>
            <button
                v-if="showModelLab"
                type="button"
                :aria-label="$t('chat.openModelLab')"
                class="inline-flex min-h-touch items-center gap-2 rounded-md px-2.5 text-xs font-medium text-[var(--talos-text,var(--foreground))] outline-none hover:bg-[var(--talos-active,var(--accent))] focus-visible:ring-2 focus-visible:ring-[var(--talos-ring,var(--ring))]"
                @click="emit('openModelLab')"
            >
                <Cpu class="size-4 text-[var(--talos-accent,var(--primary))]" aria-hidden="true" />
                {{ $t('navigation.modelLab') }}
            </button>
        </footer>
    </div>
</template>

<style scoped>
.talos-mobile-model-option {
    border-color: var(--talos-border, var(--border));
    background: var(--talos-panel, var(--card));
    color: var(--talos-text, var(--foreground));
}

/* SELETTORE-02 (owner 28/10): la riga in uso si vede a colpo d'occhio — fondo accento tenue e bordo d'accento; il testo resta del
   suo colore (mai accento su accento tenue: cura D3 dei modelli locali) */
.talos-mobile-model-option[data-selected="true"] {
    background: var(--talos-accent-soft, var(--accent));
    border-color: var(--talos-accent, var(--ring));
    box-shadow: inset 0 0 0 1px var(--talos-accent, var(--ring));
}
/* ⛔ Owner 28/10/2026 (foto: una riga col fondo acceso e la spunta su un'altra): sui touch `:hover` resta sull'ultima riga toccata. */
@media (hover: hover) and (pointer: fine) {
    .talos-mobile-model-option:not(:disabled):hover { background: var(--talos-active, var(--accent)); }
}
</style>
