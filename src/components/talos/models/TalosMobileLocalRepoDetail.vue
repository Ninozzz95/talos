<script setup lang="ts">
import { computed, onUnmounted, ref, watch } from 'vue'
import { AlertTriangle, ClipboardCopy, Download, ExternalLink, ShieldAlert } from '@lucide/vue'
import { Button } from '@/components/ui/button'
import TalosModelFitBar from '@/components/talos/models/TalosModelFitBar.vue'
import TalosModelResourceLedger from '@/components/talos/models/TalosModelResourceLedger.vue'
import TalosMobileMessageContent from '@/components/chat/TalosMobileMessageContent.vue'
import TalosThemedFilter from '@/components/talos/ui/TalosThemedFilter.vue'
import { useTalosI18n } from '@/i18n'
import { talosModelCardMarkdown } from '@/lib/models/modelCardMarkdown'
import { talosEstimatedCapacity } from '@/lib/models/fit'
import { talosFitBadge } from '@/lib/models/fitBadge'
import type { TalosHuggingFaceCard } from '@/lib/models/huggingFace'
import {
    talosFailureKey,
    talosFitVerdict,
    talosFormatBytes,
    talosFormatCompactCount,
    talosFormatParameterCount,
    talosRetryAfterSeconds,
    talosSetWarnings,
} from '@/lib/models/presentation'
import { talosModelSpeaks } from '@/lib/models/modelLanguages'
import { talosReadmeSummary } from '@/lib/models/readmeSummary'
import { talosSortChipClass } from '@/lib/sortChip'
import { writeTalosClipboardText } from '@/services/clipboard'
import { talosDiscardModelTransfer } from '@/services/modelTransfer'
import {
    talosCloseModelRepo,
    talosDescribeModelRepo,
    talosDownloadSet,
    talosExamineRepo,
    talosExamineSet,
    talosLocalModels,
    talosOpenModelRepo,
    talosRefreshDeviceCapacity,
    talosRefreshHuggingFaceToken,
    talosRefreshLeftovers,
    talosSetLocalContext,
    talosSetLocalKvCacheType,
} from '@/stores/localModels'

const props = defineProps<{
    repoId: string
    revision: string
}>()

const { t, locale } = useTalosI18n()
const store = talosLocalModels
const refused = ref<string | null>(null)
const card = ref<TalosHuggingFaceCard | null>(null)
let loadGeneration = 0
/**
 * Model Lab Blocco 3 — vero SOLO mentre l'esame automatico gira in
 * sottofondo dopo l'apertura. Non riflette le riletture manuali per riga
 * (bottone "Ricontrolla"/controproposta): quelle restano quello che erano,
 * il `set.examination.state === 'reading'` per riga basta li'.
 */
const examiningRepo = ref(false)

const repo = computed(() => store.repo?.id === props.repoId ? store.repo : null)
const summary = computed(() => talosReadmeSummary(card.value?.readme ?? ''))
const schedaLeggibile = computed(() => talosModelCardMarkdown(card.value?.readme ?? ''))
const cardTags = computed(() => [card.value?.author, card.value?.license]
    .filter((value): value is string => typeof value === 'string' && value.length > 0))

/**
 * Restyle Blocco 6 (mockup, item 8) — le pillole complete: parametri e
 * formato accanto a publisher/licenza, download e like nella stessa riga
 * dei tag. `card.value` viene da `talosDescribeModelRepo`, che ora legge
 * anche `downloads`/`likes`/`gguf` dalla STESSA risposta HF già scaricata
 * per autore/licenza (huggingFace.ts, verificato su un repository vero via
 * WebFetch prima di scriverlo) — non e' una seconda richiesta di rete.
 */
const parameterCountLabel = computed(() => talosFormatParameterCount(card.value?.gguf?.parameters))
const downloadsLabel = computed(() => card.value
    ? talosFormatCompactCount(card.value.downloads, locale.value)
    : null)

/** Restyle Blocco 6 (mockup, item 3) — il link esce SEMPRE, anche prima che la scheda arrivi: costruito dal solo repoId. */
const hfUrl = computed(() => `https://huggingface.co/${props.repoId}`)

/**
 * Restyle Blocco 6 (mockup, item 1) — le tre sezioni della pagina.
 * "Quantizzazioni" resta quella di sempre (rail + config + ledger);
 * "Scheda modello" e' la stessa `card` gia' scaricata, solo spostata
 * dentro un tab invece di stare sempre aperta in cima; "File" elenca i
 * percorsi VERI di ogni variante GGUF (row.set.paths) — dati che questo
 * store ha gia', non un elenco inventato ne' un secondo endpoint per
 * l'intero contenuto del repository.
 */
const activeTab = ref<'quantizzazioni' | 'scheda' | 'file'>('quantizzazioni')
const tabOptions = computed(() => ([
    { value: 'quantizzazioni', label: t('localModels.tabQuantizzazioni'), testId: 'talos-models-tab-quant' },
    { value: 'scheda', label: t('localModels.tabScheda'), testId: 'talos-models-tab-scheda' },
    { value: 'file', label: t('localModels.tabFile'), testId: 'talos-models-tab-file' },
]))
function onTabChange(value: string): void {
    if (value !== 'quantizzazioni' && value !== 'scheda' && value !== 'file') return
    activeTab.value = value
}
const allFiles = computed(() => (repo.value?.sets ?? []).flatMap((set) => set.paths))

/**
 * Restyle Blocco 6 (mockup, item 5) — un'unica azione reale dietro il
 * menu "altro", non un elenco con voci finte: copiare l'indirizzo del
 * repository. Stesso schema di DoctorScreen.vue (`copied`/`copyError`,
 * timer di due secondi, nessun toast nostro perche' Android 13+ mostra
 * gia' la propria conferma di sistema).
 */
const linkCopied = ref(false)
const linkCopyError = ref(false)
let linkCopyTimer: ReturnType<typeof setTimeout> | null = null
async function copyHfLink(): Promise<void> {
    linkCopyError.value = false
    try {
        await writeTalosClipboardText(hfUrl.value)
        linkCopied.value = true
        if (linkCopyTimer !== null) clearTimeout(linkCopyTimer)
        linkCopyTimer = setTimeout(() => { linkCopied.value = false }, 2_000)
    } catch {
        linkCopyError.value = true
    }
}

/**
 * Restyle Blocco 6 (mockup, item 6) — le tacche dello slider. Valori
 * tondi DENTRO il range vero di questo blocco (CONTEXT_MIN/MAX qui
 * sotto), non i 2K/8K/16K/32K del mockup: quelli erano per il suo range
 * dimostrativo (max 32K), il nostro arriva a 131072.
 */
const CONTEXT_TICKS = [2_048, 32_768, 65_536, 131_072] as const

/**
 * Se questo modello dichiara di parlare la lingua dell'interfaccia.
 *
 * L'avviso si mostra QUI, sulla pagina del repository, perche' e' l'ultimo
 * momento prima di impegnare due gigabyte. Owner 2026-08-05: aveva scaricato un
 * modello coreano e gli aveva parlato italiano — e niente gliel'aveva detto.
 *
 * Solo `no` diventa un avviso: `unknown` non e' un'accusa, e `yes` non merita
 * una riga su ogni schermata.
 */
const lingua = computed(() => talosModelSpeaks(card.value?.languages, locale.value))
const freeMemory = computed(() => store.device?.availableRamBytes
    ? talosFormatBytes(store.device.availableRamBytes)
    : null)
const rows = computed(() => (repo.value?.sets ?? []).map((set) => {
    const fileBytes = set.incomplete ? null : set.totalBytes
    const capacity = talosEstimatedCapacity({
        fileBytes,
        workingBytes: fileBytes === null ? null : fileBytes * 1.25,
        device: store.device,
    })
    const badge = talosFitBadge(capacity)
    return {
        set,
        key: set.paths[0]!,
        size: talosFormatBytes(set.totalBytes),
        warnings: talosSetWarnings(set),
        verdict: set.examination.state === 'read'
            ? talosFitVerdict(set.examination.fit, store.context)
            : null,
        badge: {
            ...badge,
            delta: capacity.state === 'unknown'
                ? null
                : talosFormatBytes(Math.abs(capacity.availableBytes - capacity.needsBytes)),
            hasHeadroom: capacity.state === 'fits' || capacity.state === 'tight',
        },
    }
}))

/**
 * Restyle Blocco 6 — quale variante mostra la rail come "aperta" nel
 * pannello a due colonne (config + ledger), pattern master-detail
 * standard: la rail è il master, il pannello sotto è il detail dello
 * stesso stato, mai un secondo giro di dati.
 *
 * `null` finché l'utente non tocca una scheda della rail — a quel punto
 * `selectedRow` ripiega sulla prima variante, così il pannello non è mai
 * vuoto quando ci sono varianti da mostrare.
 */
const selectedKey = ref<string | null>(null)

const selectedRow = computed(() => {
    if (selectedKey.value) {
        const trovata = rows.value.find((row) => row.key === selectedKey.value)
        if (trovata) return trovata
    }
    return rows.value[0] ?? null
})

function selectVariant(key: string): void {
    selectedKey.value = key
}

const railOptions = computed(() => rows.value.map((row) => ({
    value: row.key,
    // Il nome vero è nella slot #option (serve anche la taglia e il
    // bollino): questa label resta come nome accessibile di riserva per
    // il caso raro in cui la slot non renderizzi nulla di leggibile.
    label: row.set.label,
    testId: `talos-models-rail-${row.key}`,
})))

function explain(reason: string): string {
    const key = talosFailureKey(reason)
    const seconds = talosRetryAfterSeconds(reason)
    if (key === null) return reason
    return seconds === null ? t(key) : `${t(key)} (${seconds}s)`
}

async function load(): Promise<void> {
    const generation = ++loadGeneration
    refused.value = null
    card.value = null
    // Restyle Blocco 6 — un altro repository è un'altra rail: nessuna
    // variante del vecchio repo resta "selezionata" su quello nuovo.
    selectedKey.value = null
    // Un altro repository riparte dalla prima sezione, non da quella dove
    // si era fermato il precedente.
    activeTab.value = 'quantizzazioni'

    const description = Promise.resolve()
        .then(() => talosDescribeModelRepo(props.repoId))
        .catch(() => null)
    await Promise.all([
        talosOpenModelRepo(props.repoId, props.revision),
        Promise.allSettled([
            talosRefreshDeviceCapacity(),
            talosRefreshLeftovers(),
            talosRefreshHuggingFaceToken(),
        ]),
    ])
    const nextCard = await description
    if (generation === loadGeneration) card.value = nextCard

    /**
     * Model Lab Blocco 3 — l'esame non aspetta piu' un tocco per riga.
     *
     * NON atteso qui di proposito: la lista deve comparire subito con ogni
     * set "unread", e ogni riga transita a "reading" poi "read" da sola man
     * mano che `talosExamineRepo` la completa — lo stesso schema reattivo
     * gia' usato per il bottone manuale, solo innescato dal caricamento
     * invece che dal tocco. `talosExamineRepo` raggruppa gia' per modello
     * (una lettura di rete condivisa, non una per versione), quindi
     * "automatico su tutte" non moltiplica il costo di rete.
     */
    if (generation === loadGeneration) void examineAutomatically(generation)
}

async function examineAutomatically(generation: number): Promise<void> {
    examiningRepo.value = true
    try {
        await talosExamineRepo()
    } catch {
        /*
         * Non raggiungibile nella pratica: `talosExamineSet`, che
         * `talosExamineRepo` chiama per ogni capofila, ha gia' il suo
         * try/catch e trasforma ogni guaio reale in
         * `examination = { state: 'unreadable', reason }` per riga — quella
         * e' la superficie che l'utente vede gia'. Qui solo per non lasciare
         * un rifiuto di promessa non gestito se qualcosa di davvero
         * inatteso sfuggisse.
         */
    } finally {
        // Non l'ultimo `load()` in corso: chi ha navigato altrove non deve
        // vedere spegnersi un indicatore che non e' piu' il suo.
        if (generation === loadGeneration) examiningRepo.value = false
    }
}

watch(() => [props.repoId, props.revision] as const, () => { void load() }, { immediate: true })

onUnmounted(() => {
    loadGeneration += 1
    if (store.repo?.id === props.repoId) talosCloseModelRepo()
})

async function start(key: string, label: string): Promise<void> {
    refused.value = null
    const result = await talosDownloadSet(key, label)
    if (result.ok) {
        return
    }
    refused.value = result.reason === 'already-running'
        ? t('localModels.alreadyRunning')
        : `${t('localModels.refused')} ${explain(result.reason)}`
}

async function acceptCounterOffer(key: string, context: number): Promise<void> {
    talosSetLocalContext(context)
    await talosExamineSet(key)
}

/**
 * Controllo globale, Model Lab Blocco 2 — non sostituisce
 * `acceptCounterOffer`: quello resta la risposta PRECISA a "questo modello
 * non sta al contesto attuale, prova esattamente questo" per una riga sola;
 * questo e' l'esplorazione libera su TUTTE le varianti insieme, prima di
 * scaricare qualunque cosa. Due bisogni diversi, non uno che scavalca
 * l'altro.
 *
 * 2K-128K passo 256: lo stesso passo di `talosMaxContextFor` (fit.ts) - un
 * arrotondamento diverso qui e li' sarebbe due fonti di verita' sullo
 * stesso numero. 131072 e' anche il trainedContext piu' comune negli header
 * reali visti da questo repository (Llama/Qwen/Gemma recenti).
 */
const CONTEXT_MIN = 2048
const CONTEXT_MAX = 131_072
const CONTEXT_STEP = 256

function onContextChange(event: Event): void {
    const target = event.target
    if (!(target instanceof HTMLInputElement)) return
    const next = Number(target.value)
    if (!Number.isFinite(next)) return
    talosSetLocalContext(next)
}

const kvCacheOptions = computed(() => ([
    { value: 'auto', label: t('localModels.kvCacheType.auto'), testId: 'talos-models-kv-auto' },
    { value: 'f16', label: t('localModels.kvCacheType.f16'), testId: 'talos-models-kv-f16' },
    { value: 'q8_0', label: t('localModels.kvCacheType.q8_0'), testId: 'talos-models-kv-q8_0' },
]))

/**
 * `TalosThemedFilter` emette una stringa qualunque per contratto (e'
 * generico, riusato anche per l'ordinamento della lista installati): la
 * guardia qui e' cio' che restringe al tipo vero prima di passarlo allo
 * store, non un controllo ridondante.
 */
function onKvCacheTypeChange(value: string): void {
    if (value !== 'auto' && value !== 'f16' && value !== 'q8_0') return
    talosSetLocalKvCacheType(value)
}

/**
 * Restyle Blocco 6 — stile della scheda della rail, non un pill di
 * ordinamento: card più larga, bordo pieno quando selezionata. Funzione a
 * parte da `talosSortChipClass` di proposito: quella è per i chip di una
 * riga di testo (ordina/KV), questa per una card multi-riga con nome,
 * taglia e barra — un primitivo visivo diverso, non lo stesso riusato a
 * forza.
 */
function railChipClass(selected: boolean): string {
    const base = 'talos-pressable min-w-[9.5rem] shrink-0 rounded-[var(--talos-radius-card)] p-[var(--talos-space-inline)] text-left transition-colors'
    return selected
        ? `${base} border-2 border-[var(--talos-accent)] bg-[var(--talos-accent-soft)]`
        : `${base} border border-[var(--talos-border)] bg-[var(--talos-panel)]`
}

/** La slot della rail riceve solo {value,label}: qui si recupera il resto (taglia, bollino, avvisi). */
function rowByKey(key: string) {
    return rows.value.find((row) => row.key === key) ?? null
}

/**
 * Restyle Blocco 6 (mockup, item 1) — stile a sottolineatura per i tre
 * tab, non a pillola: stesso `TalosThemedFilter` di rail/KV/ordina, un
 * terzo primitivo visivo per lo stesso radiogroup accessibile.
 */
function tabOptionClass(selected: boolean): string {
    const base = 'talos-pressable min-h-touch shrink-0 border-b-2 px-[calc(var(--talos-space-inline)/2)] text-sm font-medium transition-colors'
    return selected
        ? `${base} border-[var(--talos-accent)] text-[var(--talos-text)]`
        : `${base} border-transparent text-[var(--talos-muted)]`
}

async function reclaim(): Promise<void> {
    for (const leftover of store.leftovers.items) await talosDiscardModelTransfer(leftover.path)
    await talosRefreshLeftovers()
}
</script>

<template>
    <div data-testid="talos-models-repo-detail" class="flex min-w-0 flex-col gap-[var(--talos-space-section)]">
        <h1 data-testid="talos-models-repo-title" class="break-words font-mono text-base font-semibold leading-snug text-[var(--talos-text)]">{{ repoId }}</h1>

        <!-- Blocco SEMPRE visibile, sopra le sezioni: tag, descrizione,
             link a Hugging Face. Restyle Blocco 6 (mockup) — nel mockup
             questo sta sopra i tab, non dentro "Scheda modello". -->
        <section v-if="card" data-testid="talos-models-card" class="flex min-w-0 flex-col gap-[var(--talos-space-inline)] rounded-[var(--talos-radius-card)] border border-[var(--talos-border)] bg-[var(--talos-panel)]/70 p-[var(--talos-space-control)]">
            <div class="flex flex-wrap gap-[var(--talos-space-inline)]">
                <span v-for="tag in cardTags" :key="tag" class="rounded-[var(--talos-radius-control)] border border-[var(--talos-border)] px-[var(--talos-space-inline)] py-[calc(var(--talos-space-inline)/2)] font-mono text-2xs text-[var(--talos-muted)]">{{ tag }}</span>
                <!-- item 8: parametri e formato, come publisher/licenza sopra. -->
                <span v-if="parameterCountLabel" data-testid="talos-models-card-params" class="rounded-[var(--talos-radius-control)] border border-[var(--talos-border)] px-[var(--talos-space-inline)] py-[calc(var(--talos-space-inline)/2)] font-mono text-2xs text-[var(--talos-muted)]">{{ parameterCountLabel }}</span>
                <span class="rounded-[var(--talos-radius-control)] border border-[var(--talos-border)] px-[var(--talos-space-inline)] py-[calc(var(--talos-space-inline)/2)] font-mono text-2xs text-[var(--talos-muted)]">{{ t('localModels.ggufFormatTag') }}</span>
            </div>
            <div v-if="card" class="flex flex-wrap items-center gap-x-[var(--talos-space-inline)] font-mono text-2xs tabular-nums text-[var(--talos-muted)]">
                <span v-if="downloadsLabel" data-testid="talos-models-card-downloads">{{ t('localModels.downloadsShort', { count: downloadsLabel }) }}</span>
                <span v-if="card.likes">{{ card.likes }} ★</span>
            </div>
            <!-- L'avviso di lingua. Solo quando il modello DICHIARA le sue
                 lingue e la tua non c'e': un «non si sa» qui sarebbe rumore, e
                 un «si» una riga inutile su ogni schermata. -->
            <p
                v-if="lingua === 'no'"
                role="status"
                data-testid="talos-models-language-warning"
                class="flex min-w-0 items-start gap-[var(--talos-space-inline)] rounded-[var(--talos-radius-control)] border border-[var(--talos-warning)]/40 bg-[var(--talos-warning)]/10 px-[var(--talos-space-inline)] py-[calc(var(--talos-space-inline)/2)] text-xs leading-5 text-[var(--talos-text)]"
            >{{ t('localModels.languageWarning', { languages: (card?.languages ?? []).join(', ') }) }}</p>
            <p v-if="summary" data-testid="talos-models-readme-summary" class="line-clamp-2 text-xs leading-5 text-[var(--talos-text)]">{{ summary }}</p>

            <!-- item 3 + item 5: apri su Hugging Face, e l'unica azione
                 reale dietro "altro" — copiare il link. -->
            <div class="flex items-center gap-[var(--talos-space-inline)]">
                <a
                    :href="hfUrl"
                    target="_blank"
                    rel="noopener noreferrer"
                    data-testid="talos-models-open-hf"
                    class="talos-pressable flex min-h-touch flex-1 items-center justify-center gap-[calc(var(--talos-space-inline)/2)] rounded-[var(--talos-radius-control)] border border-[var(--talos-border)] px-[var(--talos-space-control)] text-sm font-semibold text-[var(--talos-text)]"
                >
                    {{ t('localModels.openOnHuggingFace') }}
                    <ExternalLink class="size-[var(--talos-icon-size)] shrink-0" aria-hidden="true" />
                </a>
                <button
                    type="button"
                    data-testid="talos-models-copy-link"
                    :aria-label="t('localModels.copyLink')"
                    class="talos-pressable inline-flex size-[var(--talos-touch-target)] shrink-0 items-center justify-center rounded-[var(--talos-radius-control)] border border-[var(--talos-border)] text-[var(--talos-text)]"
                    @click="copyHfLink"
                >
                    <ClipboardCopy class="size-[var(--talos-icon-size)]" aria-hidden="true" />
                </button>
            </div>
            <p v-if="linkCopied" role="status" data-testid="talos-models-copy-confirm" class="text-2xs text-[var(--talos-success)]">{{ t('localModels.linkCopied') }}</p>
            <p v-if="linkCopyError" role="alert" class="text-2xs text-[var(--talos-danger)]">{{ t('localModels.linkCopyFailed') }}</p>
        </section>

        <!-- item 2: il riquadro di spiegazione. Sempre visibile sopra i
             tab, come nel mockup — non ripete nulla che il ledger o il
             verdetto dicano gia', spiega il MECCANISMO. -->
        <p
            v-if="repo?.sets.length"
            data-testid="talos-models-analysis-banner"
            class="rounded-[var(--talos-radius-card)] border border-[var(--talos-accent)]/40 bg-[var(--talos-accent-soft)] px-[var(--talos-space-control)] py-[var(--talos-space-inline)] text-xs leading-5 text-[var(--talos-text)]"
        >
            <strong class="text-[var(--talos-accent)]">{{ t('localModels.analysisBannerTitle') }}</strong>
            {{ t('localModels.analysisBannerBody') }}
        </p>

        <!-- item 1: i tre tab. Stesso radiogroup accessibile di rail/KV
             (TalosThemedFilter), stile a sottolineatura invece che a
             scheda — un primitivo di stile diverso, la stessa semantica. -->
        <TalosThemedFilter
            v-if="repo?.sets.length || card"
            data-testid="talos-models-tabs"
            :model-value="activeTab"
            :options="tabOptions"
            :group-label="t('localModels.tabsGroupLabel')"
            group-class="flex gap-[var(--talos-space-control)] border-b border-[var(--talos-border)]"
            :option-class="tabOptionClass"
            @update:model-value="onTabChange"
        />

        <!-- Tab "Scheda modello" — il README per intero, prima dietro una
             divulgazione dentro la card, ora la sua sezione: stesso
             montaggio pigro (si legge solo quando il tab è attivo). -->
        <section v-if="activeTab === 'scheda'" data-testid="talos-models-readme-full">
            <TalosMobileMessageContent v-if="schedaLeggibile" class="text-xs" :content="schedaLeggibile" />
            <p v-else class="text-sm text-[var(--talos-muted)]">{{ t('localModels.noReadme') }}</p>
        </section>

        <!-- Tab "File" — item 1: i percorsi VERI di ogni variante GGUF, non un elenco inventato. -->
        <ul v-else-if="activeTab === 'file'" data-testid="talos-models-file-tab" class="flex min-w-0 flex-col divide-y divide-[var(--talos-border)] rounded-[var(--talos-radius-card)] border border-[var(--talos-border)]">
            <li v-for="path in allFiles" :key="path" class="min-w-0 truncate px-[var(--talos-space-control)] py-[var(--talos-space-inline)] font-mono text-2xs text-[var(--talos-text)]">{{ path }}</li>
            <li v-if="!allFiles.length" class="px-[var(--talos-space-control)] py-[var(--talos-space-inline)] text-2xs text-[var(--talos-muted)]">{{ t('localModels.emptyRepo') }}</li>
        </ul>

        <template v-else-if="activeTab === 'quantizzazioni'">
        <p v-if="repo?.sets.length" class="font-mono text-2xs uppercase tracking-wider text-[var(--talos-muted)]">
            {{ t('localModels.variants') }}<template v-if="freeMemory"> · {{ t('models.fitFree', { free: freeMemory }) }}</template>
        </p>

        <!-- Model Lab Blocco 3 — piccolo, mai un overlay che copre la
             rail: le schede sono gia' visibili e leggibili, questo dice
             solo che il resto sta ancora arrivando in sottofondo. -->
        <p
            v-if="examiningRepo"
            role="status"
            data-testid="talos-models-examining-repo"
            class="flex items-center gap-[var(--talos-space-inline)] font-mono text-2xs text-[var(--talos-muted)]"
        >
            <span class="size-[calc(var(--talos-icon-size)/2)] shrink-0 animate-pulse rounded-full bg-[var(--talos-accent)] motion-reduce:animate-none" aria-hidden="true" />
            {{ t('localModels.examiningRepo') }}
        </p>

        <p v-if="!repo || repo.loading" class="py-[var(--talos-space-page)] text-center text-sm text-[var(--talos-muted)]">{{ t('localModels.loadingFiles') }}</p>
        <p v-else-if="repo.failure" role="alert" data-testid="talos-models-repo-failed" class="py-[var(--talos-space-page)] text-center text-sm text-[var(--talos-danger)]">{{ t('localModels.repoFailed') }} {{ explain(repo.failure) }}</p>
        <p v-else-if="!repo.sets.length" class="py-[var(--talos-space-page)] text-center text-sm text-[var(--talos-muted)]">{{ t('localModels.emptyRepo') }}</p>

        <template v-else>
            <!-- RESTYLE Blocco 6 — la rail (master del pattern master-detail,
                 ricerca in testa a questo blocco). Sostituisce l'elenco
                 verticale con tocco "Dettagli" per riga: stessi `rows`,
                 stesso TalosModelFitBar dentro la slot, cambia solo il
                 contenitore. Radiogroup accessibile riusato da
                 TalosThemedFilter (stesso di sort/KV), con contenuto ricco
                 nella slot #option — esattamente il caso che quella slot
                 esiste per coprire. -->
            <TalosThemedFilter
                data-testid="talos-models-variant-rail"
                :model-value="selectedRow?.key ?? ''"
                :options="railOptions"
                :group-label="t('localModels.variants')"
                group-class="flex gap-[var(--talos-space-inline)] overflow-x-auto pb-[calc(var(--talos-space-inline)/2)]"
                :option-class="railChipClass"
                @update:model-value="selectVariant"
            >
                <template #option="{ option, selected }">
                    <span class="flex min-w-0 flex-col gap-[calc(var(--talos-space-inline)/2)]">
                        <span class="flex min-w-0 items-center gap-[calc(var(--talos-space-inline)/2)]">
                            <span
                                class="truncate font-mono text-xs font-semibold"
                                :class="selected ? 'text-[var(--talos-accent-text)]' : 'text-[var(--talos-text)]'"
                            >{{ option.label }}</span>
                            <AlertTriangle v-if="rowByKey(option.value)?.warnings.incomplete" class="size-[calc(var(--talos-icon-size)*0.75)] shrink-0 text-[var(--talos-danger)]" aria-hidden="true" />
                            <ShieldAlert v-else-if="rowByKey(option.value)?.warnings.flagged" class="size-[calc(var(--talos-icon-size)*0.75)] shrink-0 text-[var(--talos-danger)]" aria-hidden="true" />
                        </span>
                        <span class="font-mono text-3xs tabular-nums text-[var(--talos-muted)]">{{ rowByKey(option.value)?.size }}</span>
                        <TalosModelFitBar
                            v-if="rowByKey(option.value)"
                            class="w-full"
                            :tone="rowByKey(option.value)!.badge.tone"
                            :ratio="rowByKey(option.value)!.badge.ratio"
                            :label="t(rowByKey(option.value)!.badge.labelKey)"
                        />
                    </span>
                </template>
            </TalosThemedFilter>

            <!-- Pannello a due colonne per la variante selezionata: config a
                 sinistra, ledger a destra su schermi larghi, impilati su
                 stretti (pattern master-detail standard, ricerca web di
                 questo blocco). -->
            <div v-if="selectedRow" class="grid min-w-0 gap-[var(--talos-space-section)] lg:grid-cols-2">
                <div data-testid="talos-models-runtime-config" class="flex min-w-0 flex-col gap-[var(--talos-space-control)] rounded-[var(--talos-radius-card)] border border-[var(--talos-border)] bg-[var(--talos-panel)]/70 p-[var(--talos-space-control)]">
                    <h2 class="font-mono text-2xs uppercase tracking-wider text-[var(--talos-muted)]">{{ t('localModels.runtimeConfigTitle') }}</h2>

                    <div class="flex min-w-0 items-center justify-between gap-[var(--talos-space-inline)]">
                        <span data-testid="talos-models-variant-identity" class="min-w-0">
                            <span data-testid="talos-models-variant-label" class="block truncate font-mono text-sm font-semibold text-[var(--talos-text)]">{{ selectedRow.set.label }}</span>
                            <span data-testid="talos-models-variant-size" class="font-mono text-2xs tabular-nums text-[var(--talos-muted)]">{{ selectedRow.size }}</span>
                        </span>
                    </div>

                    <!-- item 4: il bottone porta il nome della variante e
                         la taglia, come nel mockup ("Scarica Q6_K ·
                         3.31 GB") — non piu' una sola icona. -->
                    <button
                        type="button"
                        data-testid="talos-models-download"
                        :aria-label="`${t('localModels.download')} ${selectedRow.set.label}`"
                        :disabled="selectedRow.set.incomplete"
                        class="talos-pressable flex min-h-touch w-full items-center justify-center gap-[calc(var(--talos-space-inline)/2)] rounded-[var(--talos-radius-control)] bg-[var(--talos-accent)] px-[var(--talos-space-control)] text-sm font-semibold text-[var(--talos-accent-text)] disabled:opacity-50"
                        @click="start(selectedRow.key, `${repoId.split('/').pop()} ${selectedRow.set.label}`)"
                    >
                        <Download class="size-[var(--talos-icon-size)] shrink-0" aria-hidden="true" />
                        {{ t('localModels.downloadNamed', { label: selectedRow.set.label, size: selectedRow.size }) }}
                    </button>

                    <p class="text-2xs leading-4 text-[var(--talos-muted)]">{{ t(selectedRow.badge.reasonKey, selectedRow.badge.delta === null ? {} : (selectedRow.badge.hasHeadroom ? { left: selectedRow.badge.delta } : { missing: selectedRow.badge.delta })) }}</p>
                    <p v-if="selectedRow.warnings.incomplete" data-testid="talos-models-incomplete" class="flex items-start gap-[var(--talos-space-inline)] text-2xs text-[var(--talos-danger)]">
                        <AlertTriangle class="size-[var(--talos-icon-size)] shrink-0" aria-hidden="true" />
                        {{ t('localModels.incompleteSet', { missing: selectedRow.warnings.incomplete.missing, total: selectedRow.warnings.incomplete.total }) }}
                    </p>
                    <p v-if="selectedRow.warnings.flagged" class="flex items-start gap-[var(--talos-space-inline)] text-2xs text-[var(--talos-danger)]">
                        <ShieldAlert class="size-[var(--talos-icon-size)] shrink-0" aria-hidden="true" /> {{ t('localModels.flagged') }} {{ selectedRow.warnings.flagged }}
                    </p>
                    <p v-if="selectedRow.warnings.unverifiable" data-testid="talos-models-unverifiable" class="text-2xs text-[var(--talos-muted)]">{{ t('localModels.unverifiable') }}</p>

                    <!-- Model Lab Blocco 2 — controllo globale, non per
                         variante: cambia contesto o cache KV una volta, ogni
                         variante gia' esaminata si ricalcola sul posto
                         (talosRicalcolaEsaminati in localModels.ts), mai una
                         nuova lettura di rete. -->
                    <label class="flex flex-col gap-[calc(var(--talos-space-inline)/2)]">
                        <span class="flex items-center justify-between font-mono text-2xs uppercase tracking-wider text-[var(--talos-muted)]">
                            {{ t('localModels.contextLabel') }}
                            <span data-testid="talos-models-context-value" class="tabular-nums text-[var(--talos-text)]">{{ store.context }}</span>
                        </span>
                        <input
                            type="range"
                            data-testid="talos-models-context-slider"
                            class="talos-context-slider"
                            :min="CONTEXT_MIN"
                            :max="CONTEXT_MAX"
                            :step="CONTEXT_STEP"
                            :value="store.context"
                            :aria-label="t('localModels.contextLabel')"
                            :aria-valuetext="`${store.context} token`"
                            @change="onContextChange"
                        >
                        <!-- item 6: le tacche numeriche sotto lo slider. -->
                        <span data-testid="talos-models-context-ticks" class="flex justify-between font-mono text-3xs text-[var(--talos-muted)]">
                            <span v-for="tick in CONTEXT_TICKS" :key="tick">{{ tick >= 1024 ? `${Math.round(tick / 1024)}K` : tick }}</span>
                        </span>
                    </label>
                    <div class="flex flex-col gap-[calc(var(--talos-space-inline)/2)]">
                        <!-- item 7: il tipo risolto DAVVERO, anche in
                             AUTOMATICA — non solo il nome del selettore. -->
                        <span class="flex items-center justify-between font-mono text-2xs uppercase tracking-wider text-[var(--talos-muted)]">
                            {{ t('localModels.kvCacheTypeLabel') }}
                            <span v-if="selectedRow.set.examination.state === 'read'" data-testid="talos-models-kv-resolved" class="tabular-nums text-[var(--talos-text)]">{{ t(`localModels.kvCacheType.${selectedRow.set.examination.kvCacheTypeLabel}`) }}</span>
                        </span>
                        <TalosThemedFilter
                            data-testid="talos-models-kv-cache-type"
                            group-class="flex gap-[var(--talos-space-inline)]"
                            :model-value="store.kvCacheType"
                            :options="kvCacheOptions"
                            :group-label="t('localModels.kvCacheTypeLabel')"
                            :option-class="talosSortChipClass"
                            @update:model-value="onKvCacheTypeChange"
                        />
                    </div>

                    <!-- Caselle statistiche — i due numeri che contano di
                         piu' tirati fuori dalla frase, non affogati dentro,
                         solo quando la variante e' stata esaminata. -->
                    <div v-if="selectedRow.verdict" class="grid grid-cols-2 gap-[var(--talos-space-inline)]">
                        <div data-testid="talos-models-speed-stat" class="rounded-[var(--talos-radius-control)] border border-[var(--talos-border)] p-[var(--talos-space-inline)]">
                            <p class="font-mono text-3xs uppercase tracking-wider text-[var(--talos-muted)]">{{ t('localModels.speedStatLabel') }}</p>
                            <p class="font-mono text-sm font-semibold tabular-nums text-[var(--talos-text)]">
                                {{ selectedRow.verdict.tokensPerSecond === null ? t('localModels.speedUnknown') : t('localModels.speed', { rate: selectedRow.verdict.tokensPerSecond }) }}
                            </p>
                        </div>
                        <div data-testid="talos-models-max-context-stat" class="rounded-[var(--talos-radius-control)] border border-[var(--talos-border)] p-[var(--talos-space-inline)]">
                            <p class="font-mono text-3xs uppercase tracking-wider text-[var(--talos-muted)]">{{ t('localModels.maxContextStatLabel') }}</p>
                            <p class="font-mono text-sm font-semibold tabular-nums text-[var(--talos-text)]">{{ selectedRow.set.examination.state === 'read' ? selectedRow.set.examination.fit.maxContext : '—' }}</p>
                        </div>
                    </div>

                    <p v-if="selectedRow.verdict" data-testid="talos-models-verdict" class="text-xs font-semibold" :class="{ 'text-[var(--talos-success)]': selectedRow.verdict.tone === 'good', 'text-[var(--talos-warning)]': selectedRow.verdict.tone === 'warn', 'text-[var(--talos-danger)]': selectedRow.verdict.tone === 'bad' }">
                        {{ t(selectedRow.verdict.bandKey) }}
                    </p>
                    <template v-if="selectedRow.verdict">
                        <p v-if="selectedRow.verdict.reasonKey" class="text-2xs text-[var(--talos-muted)]">{{ t(selectedRow.verdict.reasonKey) }}</p>
                        <p data-testid="talos-models-context" class="text-3xs text-[var(--talos-muted)]">{{ t('localModels.contextExplain', { context: store.context }) }}</p>
                        <button v-if="selectedRow.verdict.counterOfferContext" type="button" data-testid="talos-models-counteroffer" class="talos-pressable min-h-touch text-left text-2xs text-[var(--talos-accent)] underline" @click="acceptCounterOffer(selectedRow.key, selectedRow.verdict.counterOfferContext)">{{ t('localModels.counterOffer', { context: selectedRow.verdict.counterOfferContext }) }}</button>
                    </template>
                    <p v-else-if="selectedRow.set.examination.state === 'reading'" class="text-2xs text-[var(--talos-muted)]">{{ t('localModels.examining') }}</p>
                    <p v-else-if="selectedRow.set.examination.state === 'unreadable'" class="text-2xs text-[var(--talos-muted)]">{{ t('localModels.unreadable') }} {{ explain(selectedRow.set.examination.reason) }}</p>

                    <Button v-if="selectedRow.set.examination.state !== 'reading'" type="button" data-testid="talos-models-examine" class="talos-pressable min-h-touch self-start rounded-[var(--talos-radius-control)] border border-[var(--talos-border)] px-[var(--talos-space-control)] text-xs text-[var(--talos-text)]" @click="talosExamineSet(selectedRow.key)">{{ selectedRow.set.examination.state === 'unread' ? t('localModels.examine') : t('localModels.recheck') }}</Button>
                </div>

                <!-- Model Lab Blocco 4 — il ledger di provenienza, sempre
                     visibile per la variante scelta (non piu' dietro un
                     tocco "Dettagli"): stessi dati di selectedRow.verdict,
                     nessun secondo calcolo. -->
                <div data-testid="talos-models-ledger-panel" class="min-w-0 rounded-[var(--talos-radius-card)] border border-[var(--talos-border)] bg-[var(--talos-panel)]/70 p-[var(--talos-space-control)]">
                    <TalosModelResourceLedger v-if="selectedRow.set.examination.state === 'read'" :rows="selectedRow.set.examination.ledger" />
                    <p v-else-if="selectedRow.set.examination.state === 'reading'" class="text-2xs text-[var(--talos-muted)]">{{ t('localModels.examining') }}</p>
                    <p v-else class="text-2xs text-[var(--talos-muted)]">{{ t('localModels.ledgerTitle') }}</p>
                </div>
            </div>
        </template>
        </template>

        <div v-if="store.leftovers.totalBytes > 0" data-testid="talos-models-leftovers" class="flex flex-wrap items-center gap-[var(--talos-space-inline)] text-2xs text-[var(--talos-muted)]">
            <span>{{ t('localModels.leftovers', { size: talosFormatBytes(store.leftovers.totalBytes) }) }}</span>
            <button type="button" data-testid="talos-models-reclaim" class="talos-pressable min-h-touch rounded-[var(--talos-radius-control)] border border-[var(--talos-border)] px-[var(--talos-space-control)] text-[var(--talos-text)]" @click="reclaim">{{ t('localModels.reclaim') }}</button>
        </div>
        <p v-if="refused" role="alert" data-testid="talos-models-refused" class="text-xs text-[var(--talos-danger)]">{{ refused }}</p>
    </div>
</template>

<style scoped>
/*
 * Slider di contesto, Model Lab Blocco 2. Nessun precedente in questo
 * albero (nessun altro componente talos/ usa <input type="range">): niente
 * da riusare. Le pseudo-classi vendor (::-webkit-*, ::-moz-*) non hanno
 * equivalente nelle classi utility di Tailwind, motivo per cui questo file
 * guadagna il suo primo blocco <style> — il solo altro precedente
 * nell'albero e' TalosConsensoAutonomia.vue, per lo stesso motivo:
 * animazione/pseudo-elementi che le utility non esprimono. Stile minimo,
 * sugli stessi token --talos-* di ogni altro controllo di questa pagina.
 *
 * Ricerca di questo blocco: rimuovere l'appearance nativa, stilare
 * -webkit-slider-thumb/-moz-range-thumb e -webkit-slider-runnable-track/
 * -moz-range-track separatamente (i browser non condividono un selettore),
 * mantenere il focus-visible nativo — mai perdere tastiera/touch/screen
 * reader mentre si ridisegna solo l'aspetto.
 */
.talos-context-slider {
    appearance: none;
    -webkit-appearance: none;
    width: 100%;
    /* Area toccabile piena altezza; il track visivo resta sottile sotto. */
    height: var(--talos-touch-target);
    background: transparent;
    cursor: pointer;
}

.talos-context-slider::-webkit-slider-runnable-track {
    height: 4px;
    border-radius: 9999px;
    background: var(--talos-border);
}

.talos-context-slider::-moz-range-track {
    height: 4px;
    border-radius: 9999px;
    background: var(--talos-border);
}

.talos-context-slider::-webkit-slider-thumb {
    -webkit-appearance: none;
    appearance: none;
    width: 20px;
    height: 20px;
    margin-top: -8px;
    border-radius: 9999px;
    background: var(--talos-accent);
    border: none;
}

.talos-context-slider::-moz-range-thumb {
    width: 20px;
    height: 20px;
    border-radius: 9999px;
    background: var(--talos-accent);
    border: none;
}

.talos-context-slider:focus-visible {
    outline: 2px solid var(--talos-ring, var(--talos-accent));
    outline-offset: 2px;
}

@media (prefers-reduced-motion: no-preference) {
    .talos-context-slider::-webkit-slider-thumb { transition: transform 120ms ease-out; }
    .talos-context-slider::-moz-range-thumb { transition: transform 120ms ease-out; }
}

.talos-context-slider:active::-webkit-slider-thumb { transform: scale(1.1); }
.talos-context-slider:active::-moz-range-thumb { transform: scale(1.1); }
</style>
