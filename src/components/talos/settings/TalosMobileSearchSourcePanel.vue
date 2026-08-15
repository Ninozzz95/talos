<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useTalosI18n } from '@/i18n'
import { Check, ExternalLink, Loader2 } from '@lucide/vue'
import { Button } from '@/components/ui/button'
import { useSettingsStore } from '@/stores/settings'
import { TALOS_SEARCH_SOURCES, type TalosSearchSourceId } from '@/lib/search/searchSources'
import TalosThemedFilter from '@/components/talos/ui/TalosThemedFilter.vue'

/**
 * F1 — choosing where web search comes from.
 *
 * TALOS has no index of the web. Nobody does: an index is bought or licensed.
 * What TALOS adds is the part that matters — the pages are fetched and read on
 * this device, so only the QUERY leaves it.
 *
 * D3: until a source is chosen, the web tools are not offered to the model at
 * all. That is why this screen exists before the feature does anything, and why
 * it says so out loud rather than letting the model promise a search it cannot
 * run.
 *
 * The key never enters app state: it goes straight to the OS secure storage,
 * like every provider key, and this screen only ever learns whether one is set.
 */
const settings = useSettingsStore()
const { t } = useTalosI18n()

const selected = computed<TalosSearchSourceId | null>(() => settings.state.search.source)
const source = computed(() => TALOS_SEARCH_SOURCES.find((entry) => entry.id === selected.value) ?? null)

const keyDraft = ref('')
const endpointDraft = ref('')
const hasKey = ref(false)
const busy = ref(false)
const tavilyOpening = ref(false)
const feedback = ref<string | null>(null)
const TAVILY_PLATFORM_URL = 'https://app.tavily.com/'

const NOTE_KEYS: Record<TalosSearchSourceId, string> = {
    tavily: 'search.tavilyNote',
    brave: 'search.braveNote',
    searxng: 'search.searxngNote',
    custom: 'search.customNote',
}

async function refreshKeyState(): Promise<void> {
    if (!selected.value) { hasKey.value = false; return }
    const { hasProviderKey } = await import('@/services/secureKeyStore')
    hasKey.value = await hasProviderKey(`search.${selected.value}`).catch(() => false)
}

onMounted(() => {
    endpointDraft.value = settings.state.search.endpoint ?? ''
    void refreshKeyState()
})

const sourceOptions = computed(() => TALOS_SEARCH_SOURCES.map((entry) => ({
    value: entry.id,
    label: entry.label,
    testId: `talos-search-source-${entry.id}`,
})))

/** Appearance stays here; the radiogroup grammar belongs to the primitive. */
function sourceOptionClass(isChosen: boolean): string {
    const base = 'talos-pressable flex w-full items-start gap-2 rounded-xl border px-3 py-2.5 text-left'
    return isChosen
        ? `${base} border-[var(--talos-accent-border)] bg-[var(--talos-panel)]`
        : `${base} border-[var(--talos-border)]`
}

/**
 * Narrowed by lookup rather than cast. Nothing chosen is a real state here —
 * it arrives as '' and simply matches no option, which is exactly what the
 * radiogroup should announce.
 */
function chooseSource(value: string): void {
    const found = TALOS_SEARCH_SOURCES.find((entry) => entry.id === value)
    if (found) void choose(found.id)
}

async function choose(id: TalosSearchSourceId): Promise<void> {
    await settings.setSearchPreferences({ source: id })
    feedback.value = null
    keyDraft.value = ''
    await refreshKeyState()
}

async function saveKey(): Promise<void> {
    if (!selected.value || keyDraft.value.trim() === '' || busy.value) return
    busy.value = true
    feedback.value = null
    try {
        const { setProviderKey } = await import('@/services/secureKeyStore')
        await setProviderKey(`search.${selected.value}`, keyDraft.value)
        keyDraft.value = ''
        await refreshKeyState()
        feedback.value = t('search.keySaved')
    } catch {
        feedback.value = t('search.keySaveFailed')
    } finally {
        busy.value = false
    }
}

async function openTavilyPlatform(): Promise<void> {
    if (tavilyOpening.value) return
    tavilyOpening.value = true
    feedback.value = null
    try {
        const { openTalosLinkOnce } = await import('@/services/inAppBrowserService')
        const opened = await openTalosLinkOnce(TAVILY_PLATFORM_URL, 'system_browser')
        if (!opened) feedback.value = t('search.tavilyOpenFailed')
    } catch {
        feedback.value = t('search.tavilyOpenFailed')
    } finally {
        tavilyOpening.value = false
    }
}

async function saveEndpoint(): Promise<void> {
    await settings.setSearchPreferences({ endpoint: endpointDraft.value.trim() || null })
    feedback.value = t('search.addressSaved')
}

/**
 * ⛔⛔ SPEGNERE NON È DIMENTICARE — e questo pulsante faceva tutt'e due.
 *
 * ## Come si è scoperto, il 2026-08-12
 *
 * Provando l'avviso «manca un motore di ricerca» **anche al verso contrario**:
 * tolto il motore, riletta la schermata degli strumenti, e poi rimesso Tavily.
 * Prima diceva «Chiave API · **una chiave è già salvata**»; dopo il giro diceva
 * «**Serve ancora una chiave**». Il giro non era neutro: aveva cancellato la
 * chiave dell'owner dal deposito sicuro.
 *
 * La riga che lo faceva era qui dentro, sotto un pulsante che si chiama
 * «Disattiva ricerca web»:
 *
 *     await clearProviderKey(`search.${selected.value}`)
 *
 * ## Perché è un difetto e non una scelta
 *
 * I due gesti hanno **costi di ritorno diversi di ordini di grandezza**.
 * Spegnere si annulla con un tocco. Una chiave cancellata non torna: si va sul
 * sito del servizio, se ne genera un'altra, e la si riscrive a mano su un
 * telefono. Metterli dietro allo stesso pulsante, col nome del più innocuo dei
 * due, è la definizione di un comando che mente sul proprio effetto — la stessa
 * famiglia dell'interruttore acceso su una capacità che non esiste.
 *
 * ⇒ Restano due, e ognuno dice cosa fa. `securityCatalog` distingue già
 * `reversible` da `irreversible` per gli strumenti del modello: la stessa
 * distinzione vale per i comandi che diamo alla persona.
 */
async function clearSource(): Promise<void> {
    // ⛔ La chiave RESTA, e anche l'indirizzo dell'istanza: sono configurazione,
    // non lo stato acceso/spento. Riscegliendo la fonte si riparte com'era.
    await settings.setSearchPreferences({ source: null })
    feedback.value = null
}

/**
 * L'altro gesto, quello che non si annulla, col suo nome e il suo pulsante.
 *
 * ⛔ E spegne ANCHE la fonte, perché senza chiave quella fonte non può
 * rispondere. Non è il difetto di sopra al contrario: lì l'effetto in più era
 * *estraneo* al nome del comando; qui è la sua conseguenza diretta, e viene
 * detta nella stessa frase. La ragione è misurata nel codice: il cancello del
 * toolset guarda **solo** la fonte —
 *
 *     const source = sendRuntime.search.source
 *     if (!source) return null
 *
 * — e la chiave la legge dopo, al momento della chiamata. Lasciare la fonte
 * scelta senza chiave significherebbe offrire al modello uno strumento che
 * fallisce quando lo usa, mentre questa schermata scrive «la ricerca web resta
 * disattivata»: di nuovo due mondi che da fuori sembrano uno.
 */
async function forgetKey(): Promise<void> {
    if (!selected.value || busy.value) return
    busy.value = true
    try {
        const { clearProviderKey } = await import('@/services/secureKeyStore')
        await clearProviderKey(`search.${selected.value}`).catch(() => {})
        await settings.setSearchPreferences({ source: null })
        await refreshKeyState()
        feedback.value = t('search.keyForgotten')
    } finally {
        busy.value = false
    }
}

/**
 * What the model will actually be offered, said plainly.
 *
 * The last three lines are a repair. This used to end at «ready», which
 * announced that the model could search the web — while the action policy
 * refused to send anything off the device and the tool was never offered at
 * all. The user configured a key, read a confirmation, asked for a search, and
 * got a polite refusal that named neither the permission nor where to change
 * it. A readiness message that does not consult the gate it depends on is not a
 * status: it is a guess printed in the same font as a fact.
 */
const readiness = computed(() => {
    if (!source.value) return t('search.noSource')
    if (source.value.needsKey && !hasKey.value) return t('search.keyNeeded')
    if (source.value.needsEndpoint && !settings.state.search.endpoint) {
        return t('search.addressNeeded')
    }
    const outbound = settings.effectiveToolPermissions().outbound
    if (outbound === 'deny') return t('search.blockedByPermission')
    if (outbound === 'ask') return t('search.readyWillAsk')
    return t('search.ready')
})
</script>

<template>
    <section class="pt-4" data-testid="talos-search-source">
        <h3 class="text-sm font-semibold text-[var(--talos-text)]">{{ t('search.title') }}</h3>
        <p class="mt-1 text-xs leading-5 text-[var(--talos-muted)]">
            {{ t('search.description') }}
        </p>

        <!-- One source among several: a radiogroup. It was a list of buttons
             each carrying `aria-pressed`, which announces four independent
             toggles rather than one choice — and gave no hint that picking one
             puts the others down. The cards keep their check and their note
             through the slot; only the grammar moved. -->
        <TalosThemedFilter
            group-class="mt-3 flex flex-col gap-2"
            :model-value="selected ?? ''"
            :options="sourceOptions"
            :group-label="t('search.title')"
            :option-class="sourceOptionClass"
            @update:model-value="chooseSource"
        >
            <template #option="{ option, selected: isChosen }">
                <Check
                    class="mt-0.5 size-3.5 shrink-0"
                    :class="isChosen ? 'text-[var(--talos-accent)]' : 'opacity-0'"
                    aria-hidden="true"
                />
                <span class="min-w-0">
                    <span class="block text-sm text-[var(--talos-text)]">{{ option.label }}</span>
                    <span class="mt-0.5 block text-2xs leading-4 text-[var(--talos-muted)]">{{ t(NOTE_KEYS[option.value as TalosSearchSourceId]) }}</span>
                </span>
            </template>
        </TalosThemedFilter>

        <template v-if="source">
            <Button
                v-if="selected === 'tavily'"
                type="button"
                variant="outline"
                data-testid="talos-tavily-api-key-link"
                class="mt-3 min-h-touch w-full justify-start"
                :disabled="tavilyOpening"
                @click="openTavilyPlatform"
            >
                <Loader2 v-if="tavilyOpening" class="size-3.5 animate-spin" aria-hidden="true" />
                <ExternalLink v-else class="size-3.5" aria-hidden="true" />
                {{ t('search.tavilyKeyLink') }}
            </Button>

            <label v-if="source.needsKey" class="mt-3 block">
                <span class="block text-xs font-medium text-[var(--talos-muted)]">
                    {{ t('search.apiKey') }}
                    <span v-if="hasKey" data-testid="talos-search-key-set">{{ t('search.keyAlreadySaved') }}</span>
                </span>
                <input
                    v-model="keyDraft"
                    type="password"
                    inputmode="text"
                    autocomplete="off"
                    data-testid="talos-search-key"
                    :placeholder="hasKey ? t('search.replaceKey') : t('search.pasteKey')"
                    class="mt-1 min-h-touch w-full rounded-lg border border-[var(--talos-border)] bg-transparent px-3 text-sm text-[var(--talos-text)]"
                >
                <Button class="mt-2" :disabled="busy || !keyDraft.trim()" @click="saveKey">
                    <Loader2 v-if="busy" class="mr-1 size-3.5 animate-spin" aria-hidden="true" />
                    {{ t('search.saveKey') }}
                </Button>
            </label>

            <label v-if="source.needsEndpoint" class="mt-3 block">
                <span class="block text-xs font-medium text-[var(--talos-muted)]">{{ t('search.instanceAddress') }}</span>
                <input
                    v-model="endpointDraft"
                    type="url"
                    inputmode="url"
                    autocomplete="off"
                    data-testid="talos-search-endpoint"
                    :placeholder="t('search.endpointPlaceholder')"
                    class="mt-1 min-h-touch w-full rounded-lg border border-[var(--talos-border)] bg-transparent px-3 text-sm text-[var(--talos-text)]"
                    @blur="saveEndpoint"
                >
            </label>

            <div class="mt-2 flex flex-wrap items-center gap-2">
                <Button variant="ghost" data-testid="talos-search-clear" @click="clearSource">
                    {{ t('search.turnOff') }}
                </Button>
                <!-- ⛔ Compare solo se c'è davvero qualcosa da dimenticare, e
                     dice cosa costa: la chiave non torna, si rigenera. -->
                <Button
                    v-if="hasKey"
                    variant="ghost"
                    data-testid="talos-search-forget-key"
                    class="text-[var(--talos-danger)]"
                    :disabled="busy"
                    @click="forgetKey"
                >
                    {{ t('search.forgetKey') }}
                </Button>
            </div>
        </template>

        <p
            data-testid="talos-search-readiness"
            class="mt-3 text-2xs leading-4 text-[var(--talos-muted)]"
        >{{ readiness }}</p>
        <p v-if="feedback" role="status" class="mt-1 text-2xs text-[var(--talos-text)]">{{ feedback }}</p>
    </section>
</template>
